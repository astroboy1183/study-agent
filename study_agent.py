#!/usr/bin/env python3
"""
Study Agent — daily study plan, auto-shifting schedule, Claude-written recaps.

Design: the plan is an ordered SEQUENCE of units with a pointer, not a calendar.
The agent always serves the next unfinished unit appropriate to the real day
of week (weekdays -> theory, Sat -> build, Sun -> consolidate). Miss a day and
nothing breaks: the pointer simply doesn't advance, so the whole plan shifts
forward automatically. Study part of a day and the leftover stays in the queue.
Dates in plan.json are nominal — used only to report drift in /status.

After you mark a day done, the agent writes a substantial study brief (~a
20-30 minute read) on that day's topic with Claude, sends it to Telegram in
clean chunks, and saves it as a note in your Obsidian vault. Summaries are
cached per day, so re-reading never re-bills the API.

Runs as a single long-lived process (systemd service). Only dependency is
`requests`. The summary feature needs ANTHROPIC_API_KEY; without it the agent
still runs the full schedule and just skips the written brief.

Commands (in Telegram):
  /today   - show today's assignment
  /done    - mark today's unit complete, then get its study brief
  /partial - mark partially done (stays in the queue; leftover carries over)
  /skip    - skip today (unit stays pending, no evening nag)
  /summary - re-send the study brief for the most recent completed unit
  /status  - progress, current week, drift vs nominal schedule
  /pause | /resume - silence/restore daily messages (vacation mode)
  /help    - this list
"""

import json
import os
import re
import subprocess
import sys
import time
import datetime as dt
import requests

# ---------------------------------------------------------------- config ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

BOT_TOKEN = os.environ["STUDY_BOT_TOKEN"]                     # from @BotFather
CHAT_ID = os.environ["STUDY_CHAT_ID"]                         # your numeric chat id
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")  # enables summaries
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5")
SUMMARY_MAX_TOKENS = int(os.environ.get("SUMMARY_MAX_TOKENS", "4000"))

PLAN_PATH = os.environ.get("PLAN_PATH", os.path.join(BASE_DIR, "plan.json"))
STATE_PATH = os.environ.get("STATE_PATH", os.path.join(BASE_DIR, "state.json"))
SUMMARY_CACHE = os.path.join(BASE_DIR, "summaries")           # local cache of briefs
# Optional Obsidian vault integration:
VAULT_LOG = os.environ.get("VAULT_LOG", "")                  # append-only study log
VAULT_SUMMARIES = os.environ.get("VAULT_SUMMARIES", "")     # folder for brief notes

REMIND_TIME = os.environ.get("REMIND_TIME", "07:30")         # morning assignment
REVIEW_TIME = os.environ.get("REVIEW_TIME", "21:30")         # evening review
START_DATE = os.environ.get("START_DATE", "")                # ISO date; stay silent before it
POLL_TIMEOUT = 50                                            # getUpdates long-poll secs
TELEGRAM_CHUNK = 3800                                        # < Telegram's 4096 limit

# Self-updating progress: the agent rewrites a block in README.md and pushes
# to GitHub after each completed day. Set GIT_AUTOPUSH=0 to keep it local.
REPO_DIR = BASE_DIR
README_PATH = os.path.join(BASE_DIR, "README.md")
GIT_AUTOPUSH = os.environ.get("GIT_AUTOPUSH", "1") == "1"
PROGRESS_START = "<!-- PROGRESS:START -->"
PROGRESS_END = "<!-- PROGRESS:END -->"

API = f"https://api.telegram.org/bot{BOT_TOKEN}"
DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
ICON = {"theory": "\U0001F4D6", "build": "\U0001F528", "consolidate": "\U0001F9E0"}
EFFORT = {"theory": "45-60 min", "build": "5-6 hrs (blocks A/B/C)",
          "consolidate": "4-5 hrs (blocks D/E/F)"}

os.makedirs(SUMMARY_CACHE, exist_ok=True)

# ----------------------------------------------------------------- state ---
with open(PLAN_PATH) as f:
    _data = json.load(f)
PLAN = _data["units"] if isinstance(_data, dict) and "units" in _data else _data
BY_ID = {u["id"]: u for u in PLAN}
TOTAL = len(PLAN)
WEEKS = max((u["week"] for u in PLAN), default=0)


def load_state():
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"done": {}, "flags": {}, "paused": False,
            "skipped_today": None, "partials": {}, "last_done": None}


def save_state(s):
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(s, f, indent=1)
    os.replace(tmp, STATE_PATH)


STATE = load_state()

# -------------------------------------------------------------- telegram ---
def tg(method, **params):
    try:
        r = requests.post(f"{API}/{method}", json=params, timeout=POLL_TIMEOUT + 10)
        return r.json()
    except requests.RequestException as e:
        print(f"[tg] {method} failed: {e}", file=sys.stderr)
        return {}


def _strip_md(text):
    """Flatten markdown to plain text for Telegram (avoids parse errors and
    literal ** / # / ` showing up). Vault notes keep the real markdown."""
    text = re.sub(r"`{1,3}", "", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)\*", r"\1", text)
    text = re.sub(r"^\s{0,3}>\s?", "", text, flags=re.MULTILINE)
    return text


def send(text, buttons=None, markdown=True):
    """Send text, split into <=3800-char chunks. Buttons attach to the last
    chunk only. On a Telegram Markdown parse error, retry that chunk as plain
    text — long unit descriptions contain _ * ` that break legacy Markdown."""
    chunks = [text[i:i + TELEGRAM_CHUNK] for i in range(0, len(text), TELEGRAM_CHUNK)] or [""]
    result = {}
    for idx, chunk in enumerate(chunks):
        params = {"chat_id": CHAT_ID, "text": chunk,
                  "disable_web_page_preview": True}
        if markdown:
            params["parse_mode"] = "Markdown"
        if buttons and idx == len(chunks) - 1:
            params["reply_markup"] = {"inline_keyboard": buttons}
        result = tg("sendMessage", **params)
        if markdown and not result.get("ok"):
            params.pop("parse_mode", None)
            result = tg("sendMessage", **params)
    return result

# ---------------------------------------------------------------- claude ---
def claude(system, user, max_tokens=SUMMARY_MAX_TOKENS):
    """Return Claude's reply text, or '' on any failure. Thinking is disabled
    so the whole token budget goes to the answer (some models otherwise spend
    it thinking and return no text under a tight cap)."""
    if not ANTHROPIC_API_KEY:
        return ""
    try:
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY,
                     "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": CLAUDE_MODEL, "max_tokens": max_tokens,
                  "thinking": {"type": "disabled"},
                  "system": system,
                  "messages": [{"role": "user", "content": user}]},
            timeout=180)
        data = r.json()
        return "".join(b.get("text", "") for b in data.get("content", [])
                       if b.get("type") == "text")
    except requests.RequestException as e:
        print(f"[claude] failed: {e}", file=sys.stderr)
        return ""

# ------------------------------------------------------------- selection ---
def pending():
    return [u for u in PLAN if str(u["id"]) not in STATE["done"]]


def next_unit_for(day: dt.date):
    """Serve the day-appropriate pending unit, cascading any backlog forward so
    nothing is ever lost and no day-slot is wasted. `pending()` is oldest-first
    and within every week the order is theory → build → consolidate, so:

      Mon-Fri : oldest pending THEORY. Builds/consolidations never appear on a
                weekday — they stay on the weekend.
      Saturday: oldest pending theory-or-build. If weekday theory was missed it
                is older in the queue than this week's build, so it gets served
                FIRST (Friday's topic overflows into Saturday); otherwise the
                build. The build slides to Sunday if Saturday fills up.
      Sunday  : the oldest pending unit, whatever it is — catch up any missed
                theory or build before the week's consolidation.

    So builds/consolidations remain weekend work, but missed weekday theory
    overflows into the weekend instead of stalling until next week."""
    p = pending()
    if not p:
        return None
    wd = day.weekday()
    if wd <= 4:  # Mon-Fri: theory only
        theory = [u for u in p if u["type"] == "theory"]
        return theory[0] if theory else None
    if wd == 5:  # Sat: overdue theory first, else the build
        tb = [u for u in p if u["type"] in ("theory", "build")]
        return tb[0] if tb else p[0]
    return p[0]  # Sun: catch up anything still pending, then consolidate


def caught_up_message():
    """Shown when there is no unit to serve today (weekday theory exhausted, or
    the whole plan is done)."""
    if pending():
        return ("✅ You're caught up on theory — this week's build is weekend "
                "work, so nothing new for a weekday. Rest the brain; I'll have "
                "the build ready Saturday.")
    return f"\U0001F389 *Plan complete.* All {TOTAL} days done. Take the victory lap."


def fmt_unit(u, day=None):
    # The dow label tells you which day-slot the topic belongs to — handy when a
    # missed Friday theory is being served on a Saturday (it still reads "Fri").
    carry = ""
    if day is not None and u["dow"] != day.weekday() and u["type"] == "theory":
        carry = f"  _(catching up {DOW[u['dow']]}'s topic)_"
    head = (f"{ICON[u['type']]} *Day {u['id']}/{TOTAL} · Week {u['week']} · "
            f"{DOW[u['dow']]}-type · ~{EFFORT[u['type']]}*{carry}\n"
            f"*{u['title']}*\n\n{u['text']}")
    if u["type"] == "consolidate" and u.get("mastery"):
        head += f"\n\n\U0001F3AF *Mastery check (answer aloud):* {u['mastery']}"
    return head

# ------------------------------------------------------------- summaries ---
def _summary_prompt(u):
    """Type-appropriate instructions for the study brief."""
    common = (
        "You are writing a study brief for Jayanth, a data/AI engineer, to read "
        "AS REINFORCEMENT right after he has studied today's topic. Aim for a "
        "focused 20-30 minute read. Explain from first principles, then go deep "
        "on the mechanism (the how and why, not just definitions). Use concrete "
        "examples, commands, and small code/diagram sketches where they help. "
        "Call out common misconceptions and failure modes. Precision over "
        "politeness; dry humour and the occasional cricket analogy are welcome. "
        "End with a 3-5 line 'Lock it in' recap. Use Markdown headings and short "
        "paragraphs. Do not pad — every line should teach something.")
    if u["type"] == "theory":
        return common
    if u["type"] == "build":
        return (common + " Today was a hands-on BUILD day. Frame the brief around "
                "the principles the build exercises: what each step was really "
                "teaching, why it works, and what to notice next time.")
    return (common + " Today was a CONSOLIDATION day. Tie the week's threads "
            "together: the through-line concept, how the pieces connect, and the "
            "questions he should now be able to answer cold.")


def generate_summary(u):
    """Return (markdown_text, from_cache). Caches to disk + vault so a given
    day's brief is written by Claude exactly once."""
    cache_file = os.path.join(SUMMARY_CACHE, f"day-{u['id']:03d}.md")
    if os.path.exists(cache_file):
        with open(cache_file) as f:
            return f.read(), True
    body = claude(
        system=_summary_prompt(u),
        user=(f"Topic (Day {u['id']}, Week {u['week']}, {u['type']}): {u['title']}\n\n"
              f"Today's task/material:\n{u['text']}"))
    if not body:
        return "", False
    note = (f"# Day {u['id']} — {u['title']}\n\n"
            f"*Week {u['week']} · {u['type']} · studied {dt.date.today()}*\n\n"
            f"{body}\n")
    with open(cache_file, "w") as f:
        f.write(note)
    if VAULT_SUMMARIES:
        try:
            os.makedirs(VAULT_SUMMARIES, exist_ok=True)
            safe = re.sub(r"[^\w\- ]", "", u["title"]).strip().replace(" ", "-")[:60]
            vpath = os.path.join(VAULT_SUMMARIES, f"Day-{u['id']:03d}-{safe}.md")
            with open(vpath, "w") as f:
                f.write(note)
        except OSError as e:
            print(f"[vault-summary] {e}", file=sys.stderr)
    return note, False


def deliver_summary(u):
    if not ANTHROPIC_API_KEY:
        send("\U0001F4DD Study brief needs `ANTHROPIC_API_KEY` set. Meanwhile, the "
             "best recap is your own: explain today's topic to an imaginary junior "
             "in five sentences.")
        return
    cache_file = os.path.join(SUMMARY_CACHE, f"day-{u['id']:03d}.md")
    if not os.path.exists(cache_file):
        send(f"\U0001F58A Writing your study brief for *{u['title']}* — one moment...")
    note, cached = generate_summary(u)
    if not note:
        send("Couldn't reach Claude for the brief just now — try /summary again in a bit.")
        return
    where = ""
    if VAULT_SUMMARIES:
        where = f"\n\n_Saved to your vault: 01-Learning/Summaries/Day-{u['id']:03d}…_"
    send(f"\U0001F4D8 *Study brief — Day {u['id']}: {u['title']}*"
         + (" _(cached)_" if cached else "") + where)
    send(_strip_md(note), markdown=False)

# --------------------------------------------------------------- actions ---
def mark(uid, status):
    STATE["done"][str(uid)] = {"date": str(dt.date.today()), "status": status}
    if status == "done":
        STATE["last_done"] = uid
    save_state(STATE)
    if VAULT_LOG:
        u = BY_ID[uid]
        try:
            with open(VAULT_LOG, "a") as f:
                f.write(f"- {dt.date.today()} · Day {uid} (Wk {u['week']}, "
                        f"{u['type']}) · {status} · {u['title']}\n")
        except OSError as e:
            print(f"[vault] {e}", file=sys.stderr)


def morning(day):
    u = next_unit_for(day)
    if u is None:
        send(caught_up_message())
        return
    kind = "weekend" if day.weekday() >= 5 else "weekday"
    send(f"☀️ *Good morning — {DOW[day.weekday()]} ({kind} plan):*\n\n{fmt_unit(u, day)}"
         "\n\n_Finished: /done · part of it: /partial · busy day: /skip_")


def evening(day):
    if STATE.get("skipped_today") == str(day):
        return
    u = next_unit_for(day)
    if u is None:
        return
    send(f"\U0001F319 *Evening check* — Day {u['id']}: *{u['title']}*\n\nHow did it go?",
         buttons=[[{"text": "✅ Done", "callback_data": f"done:{u['id']}"},
                   {"text": "\U0001F538 Partial", "callback_data": f"partial:{u['id']}"},
                   {"text": "⏭ Didn't get to it", "callback_data": f"skip:{u['id']}"}]])


def do_done(uid):
    mark(uid, "done")
    STATE.setdefault("partials", {}).pop(str(uid), None)
    save_state(STATE)
    send(f"✅ Day {uid} done. Here's your recap to read ↓")
    deliver_summary(BY_ID[uid])
    publish_progress(f"day {uid} done")


def do_partial(uid):
    STATE.setdefault("partials", {})[str(uid)] = str(dt.date.today())
    STATE["done"].pop(str(uid), None)
    save_state(STATE)
    send(f"\U0001F538 Noted — Day {uid} stays in the queue and the leftover carries "
         "over to the next matching slot. Part done beats pretending.")
    publish_progress(f"day {uid} partial")


def do_skip(uid):
    STATE["skipped_today"] = str(dt.date.today())
    save_state(STATE)
    send("⏭ No problem — the pointer holds and everything shifts one day. "
         f"Day {uid} becomes your next assignment. Even 20 minutes tomorrow beats zero.")


def handle_callback(cb):
    action, uid = cb["data"].split(":")
    uid = int(uid)
    tg("answerCallbackQuery", callback_query_id=cb["id"])
    {"done": do_done, "partial": do_partial, "skip": do_skip}[action](uid)


def status(day=None):
    done = len(STATE["done"])
    p = pending()
    cur_week = p[0]["week"] if p else WEEKS
    builds_left = len([u for u in p if u["type"] == "build"])
    # "backlog" = pending units that sit BEHIND your furthest completed unit —
    # i.e. things you skipped and still owe. No dates involved.
    frontier = max((int(k) for k in STATE["done"]), default=0)
    backlog = len([u for u in p if u["id"] < frontier])
    bar_n = round(done / TOTAL * 20)
    bar = "▓" * bar_n + "░" * (20 - bar_n)
    catch = ("No backlog — you're current ✅" if backlog == 0 else
             f"{backlog} earlier topic(s) to catch up — they surface first on the "
             f"next matching day (theory on weekdays/Sat, anything on Sun).")
    send(f"\U0001F4CA *Progress*\n{bar} {done}/{TOTAL} days ({done/TOTAL*100:.0f}%)\n"
         f"Current: Week {cur_week}/{WEEKS} · pending builds: {builds_left}\n{catch}")

# -------------------------------------------------------------- progress ---
def _streak(today):
    """Consecutive calendar days ending today that have a completed unit."""
    dates = {v["date"] for v in STATE["done"].values() if v.get("status") == "done"}
    n, d = 0, today
    while str(d) in dates:
        n += 1
        d -= dt.timedelta(days=1)
    return n


PARTIAL_WEIGHT = 0.5  # in-progress units count this much toward the bar (not the day count)


def render_progress_block(today):
    done = len(STATE["done"])
    partials = set(STATE.get("partials", {}).keys())
    n_partial = len(partials)
    p = pending()
    cur_week = p[0]["week"] if p else WEEKS
    pct = done / TOTAL * 100
    effort_pct = (done + PARTIAL_WEIGHT * n_partial) / TOTAL * 100
    # The bar gives half credit for in-progress (partial) units so effort shows;
    # the day count and % above stay strictly full completions.
    BARS = 24
    full_cells = round(done / TOTAL * BARS)
    weighted_cells = round((done + PARTIAL_WEIGHT * n_partial) / TOTAL * BARS)
    partial_cells = max(0, min(BARS - full_cells, weighted_cells - full_cells))
    bar = ("▓" * full_cells + "▒" * partial_cells
           + "░" * (BARS - full_cells - partial_cells))
    builds_left = len([u for u in p if u["type"] == "build"])
    streak = _streak(today)
    last = STATE.get("last_done")
    last_line = "—"
    if last and str(last) in STATE["done"]:
        lu = BY_ID[last]
        last_line = f"Day {last} — {lu['title']} ({STATE['done'][str(last)]['date']})"
    rows = []
    for w in range(1, WEEKS + 1):
        cells = "".join(
            "✅" if str(u["id"]) in STATE["done"]
            else "🟨" if str(u["id"]) in partials else "⬜"
            for u in sorted((x for x in PLAN if x["week"] == w), key=lambda x: x["dow"]))
        rows.append(f"`W{w:02d}` {cells}")
    grid = "\n".join(rows)
    return (
        f"{PROGRESS_START}\n"
        f"## 📊 Progress\n\n"
        f"`{bar}`\n\n"
        f"**{done}/{TOTAL}** days done · **{pct:.1f}%**"
        f"{f' · 🟨 +{n_partial} in progress (**{effort_pct:.1f}%** effort)' if n_partial else ''}\n\n"
        f"<sub>▓ done · ▒ in progress (½ credit) · ░ to go</sub>\n\n"
        f"- **Current:** Week {cur_week}/{WEEKS}\n"
        f"- **Streak:** {streak} day{'s' if streak != 1 else ''}"
        f"{' 🔥' if streak >= 3 else ''}\n"
        f"- **Pending builds:** {builds_left}\n"
        f"- **Last completed:** {last_line}\n"
        f"- **Updated:** {dt.datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n"
        f"<details><summary>{WEEKS}-week board (✅ done · 🟨 partial · ⬜ pending · Mon→Sun)</summary>\n\n"
        f"{grid}\n\n</details>\n"
        f"{PROGRESS_END}")


def update_readme_progress(today):
    try:
        with open(README_PATH) as f:
            txt = f.read()
    except OSError as e:
        print(f"[progress] {e}", file=sys.stderr)
        return False
    block = render_progress_block(today)
    if PROGRESS_START in txt and PROGRESS_END in txt:
        txt = re.sub(re.escape(PROGRESS_START) + r".*?" + re.escape(PROGRESS_END),
                     lambda _m: block, txt, flags=re.DOTALL)
    else:
        txt = txt.rstrip() + "\n\n" + block + "\n"
    tmp = README_PATH + ".tmp"
    with open(tmp, "w") as f:
        f.write(txt)
    os.replace(tmp, README_PATH)
    return True


def git_autopush(msg):
    """Commit README.md and push. Never raises — on failure the commit stays
    local and syncs on the next successful push."""
    if not GIT_AUTOPUSH:
        return
    try:
        subprocess.run(["git", "-C", REPO_DIR, "add", "README.md"],
                       check=True, timeout=30)
        r = subprocess.run(["git", "-C", REPO_DIR, "commit", "-m", msg],
                           capture_output=True, timeout=30)
        if r.returncode != 0 and b"nothing to commit" in (r.stdout + r.stderr):
            return
        subprocess.run(["git", "-C", REPO_DIR, "push", "-q"], check=True, timeout=60)
    except (subprocess.SubprocessError, OSError) as e:
        print(f"[git] autopush failed (kept local): {e}", file=sys.stderr)


def publish_progress(reason):
    if update_readme_progress(dt.date.today()):
        git_autopush(f"progress: {reason} ({len(STATE['done'])}/{TOTAL})")

# ---------------------------------------------------------------- router ---
def handle_message(text, day):
    low = text.strip().lower()
    if low.startswith("/today"):
        u = next_unit_for(day)
        send(fmt_unit(u, day) if u else caught_up_message())
    elif low.startswith("/done"):
        u = next_unit_for(day)
        if u:
            do_done(u["id"])
    elif low.startswith("/partial"):
        u = next_unit_for(day)
        if u:
            do_partial(u["id"])
    elif low.startswith("/skip"):
        u = next_unit_for(day)
        if u:
            do_skip(u["id"])
    elif low.startswith("/summary"):
        last = STATE.get("last_done")
        if last:
            deliver_summary(BY_ID[last])
        else:
            send("No completed unit yet — finish a day with /done and the brief follows.")
    elif low.startswith("/status"):
        status(day)
    elif low.startswith("/pause"):
        STATE["paused"] = True; save_state(STATE)
        send("⏸ Paused. Daily messages off; commands still work. /resume when ready.")
    elif low.startswith("/resume"):
        STATE["paused"] = False; save_state(STATE)
        send("▶️ Resumed. The pointer waited for you — that's the whole design.")
    elif low.startswith("/help") or low.startswith("/start"):
        send(__doc__.split("Commands (in Telegram):")[1])
    else:
        send("Not a command I know — /help for the list.")

# ------------------------------------------------------------- main loop ---
def hhmm(s):
    h, m = s.split(":")
    return int(h), int(m)


def main():
    print(f"study-agent up · {TOTAL} units · done={len(STATE['done'])} · model={CLAUDE_MODEL}")
    offset = 0
    rh, rm = hhmm(REMIND_TIME)
    vh, vm = hhmm(REVIEW_TIME)
    while True:
        now = dt.datetime.now()
        today = now.date()
        if STATE.get("skipped_today") not in (None, str(today)):
            STATE["skipped_today"] = None; save_state(STATE)  # new day, clear skip
        before_start = bool(START_DATE) and str(today) < START_DATE
        if not STATE.get("paused") and not before_start:
            if (now.hour, now.minute) >= (rh, rm) and STATE["flags"].get("remind") != str(today):
                STATE["flags"]["remind"] = str(today); save_state(STATE)
                morning(today)
            if (now.hour, now.minute) >= (vh, vm) and STATE["flags"].get("review") != str(today):
                STATE["flags"]["review"] = str(today); save_state(STATE)
                evening(today)
        resp = tg("getUpdates", offset=offset, timeout=POLL_TIMEOUT,
                  allowed_updates=["message", "callback_query"])
        for upd in resp.get("result", []):
            offset = upd["update_id"] + 1
            if "callback_query" in upd:
                handle_callback(upd["callback_query"])
            elif "message" in upd and str(upd["message"]["chat"]["id"]) == str(CHAT_ID):
                handle_message(upd["message"].get("text", ""), dt.date.today())


if __name__ == "__main__":
    main()
