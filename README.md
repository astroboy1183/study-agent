# study-agent

A personal Telegram study agent. It serves my 48-week Data / AI / DevOps
mastery roadmap one day at a time, auto-shifts when days slip, and writes a
Claude study brief after each completed day. The progress board below updates
itself automatically.

## What it does

- **07:30** — sends today's study assignment (the next pending unit).
- **21:30** — evening check with ✅ Done / 🔸 Partial / ⏭ Skip buttons.
- **On Done** — writes a ~20–30 min study brief on the day's topic with Claude,
  sends it to Telegram (chunked) and saves it to my Obsidian vault, then
  updates the progress board in this README and pushes it here.

### Pure day-of-week + pointer — no dates
The plan is 336 ordered units (43 content weeks + 5 catch-up / deep-dive weeks),
served by **day of week**, never by calendar date:

- **Weekdays → theory.** Builds and consolidations never appear on a weekday.
- **Saturday → the week's build** — unless weekday theory was missed, in which
  case the missed topic is served first and the build slides to Sunday.
- **Sunday → consolidation** — or any still-unfinished theory/build first.

Miss a day and nothing is lost: the backlog **cascades forward** into the next
available slots (a missed Friday overflows into Saturday, Saturday into Sunday).
Builds stay weekend work; only theory overflows into the weekend. **Partial** →
the leftover carries over. `/status` shows how many earlier topics you still owe.

## Commands
`/today` · `/done` · `/partial` · `/skip` · `/summary` · `/status` ·
`/pause` · `/resume` · `/help`

<!-- PROGRESS:START -->
## 📊 Progress

`░░░░░░░░░░░░░░░░░░░░░░░░`

**0/336** days done · **0.0%**

<sub>▓ done · ▒ in progress (½ credit) · ░ to go</sub>

- **Current:** Week 1/48
- **Streak:** 0 days
- **Pending builds:** 48
- **Last completed:** —
- **Updated:** 2026-07-18 12:02

<details><summary>48-week board (✅ done · 🟨 partial · ⬜ pending · Mon→Sun)</summary>

`W01` ⬜⬜⬜⬜⬜⬜⬜
`W02` ⬜⬜⬜⬜⬜⬜⬜
`W03` ⬜⬜⬜⬜⬜⬜⬜
`W04` ⬜⬜⬜⬜⬜⬜⬜
`W05` ⬜⬜⬜⬜⬜⬜⬜
`W06` ⬜⬜⬜⬜⬜⬜⬜
`W07` ⬜⬜⬜⬜⬜⬜⬜
`W08` ⬜⬜⬜⬜⬜⬜⬜
`W09` ⬜⬜⬜⬜⬜⬜⬜
`W10` ⬜⬜⬜⬜⬜⬜⬜
`W11` ⬜⬜⬜⬜⬜⬜⬜
`W12` ⬜⬜⬜⬜⬜⬜⬜
`W13` ⬜⬜⬜⬜⬜⬜⬜
`W14` ⬜⬜⬜⬜⬜⬜⬜
`W15` ⬜⬜⬜⬜⬜⬜⬜
`W16` ⬜⬜⬜⬜⬜⬜⬜
`W17` ⬜⬜⬜⬜⬜⬜⬜
`W18` ⬜⬜⬜⬜⬜⬜⬜
`W19` ⬜⬜⬜⬜⬜⬜⬜
`W20` ⬜⬜⬜⬜⬜⬜⬜
`W21` ⬜⬜⬜⬜⬜⬜⬜
`W22` ⬜⬜⬜⬜⬜⬜⬜
`W23` ⬜⬜⬜⬜⬜⬜⬜
`W24` ⬜⬜⬜⬜⬜⬜⬜
`W25` ⬜⬜⬜⬜⬜⬜⬜
`W26` ⬜⬜⬜⬜⬜⬜⬜
`W27` ⬜⬜⬜⬜⬜⬜⬜
`W28` ⬜⬜⬜⬜⬜⬜⬜
`W29` ⬜⬜⬜⬜⬜⬜⬜
`W30` ⬜⬜⬜⬜⬜⬜⬜
`W31` ⬜⬜⬜⬜⬜⬜⬜
`W32` ⬜⬜⬜⬜⬜⬜⬜
`W33` ⬜⬜⬜⬜⬜⬜⬜
`W34` ⬜⬜⬜⬜⬜⬜⬜
`W35` ⬜⬜⬜⬜⬜⬜⬜
`W36` ⬜⬜⬜⬜⬜⬜⬜
`W37` ⬜⬜⬜⬜⬜⬜⬜
`W38` ⬜⬜⬜⬜⬜⬜⬜
`W39` ⬜⬜⬜⬜⬜⬜⬜
`W40` ⬜⬜⬜⬜⬜⬜⬜
`W41` ⬜⬜⬜⬜⬜⬜⬜
`W42` ⬜⬜⬜⬜⬜⬜⬜
`W43` ⬜⬜⬜⬜⬜⬜⬜
`W44` ⬜⬜⬜⬜⬜⬜⬜
`W45` ⬜⬜⬜⬜⬜⬜⬜
`W46` ⬜⬜⬜⬜⬜⬜⬜
`W47` ⬜⬜⬜⬜⬜⬜⬜
`W48` ⬜⬜⬜⬜⬜⬜⬜

</details>
<!-- PROGRESS:END -->

## Config (`.env`, see `env.example`)
`STUDY_BOT_TOKEN`, `STUDY_CHAT_ID` (required); `ANTHROPIC_API_KEY`,
`CLAUDE_MODEL` (default `claude-sonnet-5`), `SUMMARY_MAX_TOKENS` for the briefs;
`VAULT_LOG`, `VAULT_SUMMARIES` for Obsidian; `REMIND_TIME`, `REVIEW_TIME`;
`GIT_AUTOPUSH` (default on) for the self-updating board. Only dependency:
`requests`.

## State
`state.json` (atomic tmp+rename): `done`, `partials`, `flags`, `paused`,
`skipped_today`, `last_done`. **Delete it to restart from Day 1.** Not in git.
Claude briefs are cached in `summaries/` so each day is written exactly once.

## Run
```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp env.example .env && chmod 600 .env   # then fill it in
# foreground test:
set -a; . ./.env; set +a; .venv/bin/python study_agent.py
# service:
cp study-agent.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now study-agent
journalctl --user -u study-agent -f
```

## Regenerating the plan
`plan.json` is 48 weeks × 7 = 336 units — 43 content weeks plus 5 catch-up /
deep-dive weeks inserted at week boundaries. To change content, edit `plan.json`
directly (keep each week's Mon–Fri `theory`, Sat `build`, Sun `consolidate`
shape) and restart the service. Completed ids in `state.json` stay valid as long
as unit ordering is preserved.
