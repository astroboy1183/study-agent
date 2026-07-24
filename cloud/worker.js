// study-agent — the whole study coach on one Cloudflare Worker.
//
// One Worker IS the app (fleet philosophy: zero servers):
//   POST /tg          Telegram webhook — commands, buttons, and free-form
//                     questions. Verified by the secret header Telegram sends.
//   GET  /            the dashboard page (passphrase gate; progress data is
//                     fetched only after unlock, so nothing leaks)
//   GET  /api/state   the whole picture as JSON (gated by X-Study-Key)
//   GET  /api/brief/N a completed day's study brief (gated)
//   POST /api/ask     ask a study question from the dashboard (gated)
// plus a cron `scheduled` handler that sends the morning assignment and the
// evening check at their fixed IST times — no polling loop, no laptop.
//
// The plan is an ordered SEQUENCE of units with a pointer, not a calendar:
// weekdays serve theory, Saturday the build (or overdue theory first), Sunday
// catches up anything then consolidates. Miss a day and the pointer just
// doesn't advance, so the whole plan slides forward and nothing is lost.
//
// Mutable state lives in KV (STUDY binding); the plan is bundled from
// ../plan.json at build time. Study briefs are written once by the model and
// cached in KV, so re-reading never re-bills the API.
//
// Secrets (wrangler secret put): STUDY_BOT_TOKEN, STUDY_CHAT_ID,
// ANTHROPIC_API_KEY, TG_SECRET (webhook header), STUDY_UI_KEY (dashboard
// passphrase). Optional: GH_PAT + VAULT_REPO ("owner/repo") to also commit
// each brief into the Obsidian vault repo.

import PLAN_DATA from "../plan.json";
import { PAGE } from "./page.js";

const PLAN = PLAN_DATA.units || PLAN_DATA;
const BY_ID = Object.fromEntries(PLAN.map((u) => [String(u.id), u]));
const TOTAL = PLAN.length;
const WEEKS = PLAN.reduce((m, u) => Math.max(m, u.week), 0);

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ICON = { theory: "\u{1F4D6}", build: "\u{1F528}", consolidate: "\u{1F9E0}" };
const EFFORT = {
  theory: "45-60 min",
  build: "5-6 hrs (blocks A/B/C)",
  consolidate: "4-5 hrs (blocks D/E/F)",
};
const TG_CHUNK = 3800; // < Telegram's 4096 limit
const MORNING_CRON = "0 2 * * *"; // 07:30 IST = 02:00 UTC (REMIND_TIME)
const EVENING_CRON = "0 16 * * *"; // 21:30 IST = 16:00 UTC (REVIEW_TIME)
const PARTIAL_WEIGHT = 0.5; // in-progress units count this much on the bar
const PROGRESS_START = "<!-- PROGRESS:START -->";
const PROGRESS_END = "<!-- PROGRESS:END -->";

// ------------------------------------------------------------- time (IST) ---
// The Worker runs in UTC; the plan reasons in IST (UTC+5:30). Shift the clock
// forward 5.5h and read the UTC fields to get the IST wall-clock date/weekday.
function istToday() {
  const d = new Date(Date.now() + 330 * 60000);
  return { ymd: d.toISOString().slice(0, 10), dow: (d.getUTCDay() + 6) % 7 };
}

// ----------------------------------------------------------------- state ---
async function loadState(env) {
  const s = { done: {}, partials: {}, paused: false, skipped_today: null, last_done: null };
  const raw = await env.STUDY.get("state");
  if (raw) Object.assign(s, JSON.parse(raw));
  return s;
}
async function saveState(env, s) {
  await env.STUDY.put("state", JSON.stringify(s));
}

// -------------------------------------------------------------- telegram ---
function tgApi(env, method) {
  return `https://api.telegram.org/bot${env.STUDY_BOT_TOKEN}/${method}`;
}

async function tg(env, method, params) {
  try {
    const r = await fetch(tgApi(env, method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    return await r.json();
  } catch (e) {
    console.error(`[tg] ${method} failed: ${e}`);
    return {};
  }
}

function stripMd(text) {
  // Flatten markdown to plain text for Telegram (avoids parse errors and
  // literal ** / # / ` showing up). Vault/dashboard keep the real markdown.
  return text
    .replace(/`{1,3}/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.+?)\*/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "");
}

async function send(env, text, { buttons = null, markdown = true } = {}) {
  // Split into <=3800-char chunks; buttons attach to the last chunk only.
  // On a Markdown parse error, retry that chunk as plain text.
  const chunks = text.match(new RegExp(`[\\s\\S]{1,${TG_CHUNK}}`, "g")) || [""];
  let result = {};
  for (let i = 0; i < chunks.length; i++) {
    const params = {
      chat_id: env.STUDY_CHAT_ID,
      text: chunks[i],
      disable_web_page_preview: true,
    };
    if (markdown) params.parse_mode = "Markdown";
    if (buttons && i === chunks.length - 1) params.reply_markup = { inline_keyboard: buttons };
    result = await tg(env, "sendMessage", params);
    if (markdown && !result.ok) {
      delete params.parse_mode;
      result = await tg(env, "sendMessage", params);
    }
  }
  return result;
}

// ---------------------------------------------------------------- model ---
async function askModel(env, system, user, maxTokens) {
  // Return the model's reply text, or "" on any failure. Thinking is disabled so
  // the whole token budget goes to the answer, not a chain of thought.
  if (!env.ANTHROPIC_API_KEY) return "";
  const model = env.MODEL || "claude-sonnet-5";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens || Number(env.SUMMARY_MAX_TOKENS || 4000),
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    const data = await r.json();
    return (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");
  } catch (e) {
    console.error(`[model] failed: ${e}`);
    return "";
  }
}

// ------------------------------------------------------------- selection ---
function pending(state) {
  return PLAN.filter((u) => !(String(u.id) in state.done));
}

// Serve the day-appropriate pending unit, cascading backlog forward so nothing
// is lost and no day-slot is wasted. pending() is oldest-first and within every
// week the order is theory -> build -> consolidate.
//   Mon-Fri : oldest pending THEORY (builds/consolidations stay on the weekend)
//   Saturday: overdue theory first (older in the queue), else this week's build
//   Sunday  : the oldest pending unit, whatever it is, then consolidation
function nextUnitFor(state, dow) {
  const p = pending(state);
  if (!p.length) return null;
  if (dow <= 4) {
    const theory = p.filter((u) => u.type === "theory");
    return theory[0] || null;
  }
  if (dow === 5) {
    const tb = p.filter((u) => u.type === "theory" || u.type === "build");
    return tb[0] || p[0];
  }
  return p[0];
}

function caughtUpMessage(state) {
  if (pending(state).length)
    return (
      "✅ You're caught up on theory — this week's build is weekend " +
      "work, so nothing new for a weekday. Rest the brain; I'll have the build " +
      "ready Saturday."
    );
  return `\u{1F389} *Plan complete.* All ${TOTAL} days done. Take the victory lap.`;
}

function fmtUnit(u, dow) {
  let carry = "";
  if (dow != null && u.dow !== dow && u.type === "theory")
    carry = `  _(catching up ${DOW[u.dow]}'s topic)_`;
  let head =
    `${ICON[u.type]} *Day ${u.id}/${TOTAL} · Week ${u.week} · ` +
    `${DOW[u.dow]}-type · ~${EFFORT[u.type]}*${carry}\n` +
    `*${u.title}*\n\n${u.text}`;
  if (u.type === "consolidate" && u.mastery)
    head += `\n\n\u{1F3AF} *Mastery check (answer aloud):* ${u.mastery}`;
  return head;
}

// ------------------------------------------------------------- summaries ---
function summaryPrompt(u) {
  const common =
    "You are writing a study brief for Jayanth, a data/AI engineer, to read " +
    "AS REINFORCEMENT right after he has studied today's topic. Aim for a " +
    "focused 20-30 minute read. Explain from first principles, then go deep on " +
    "the mechanism (the how and why, not just definitions). Use concrete " +
    "examples, commands, and small code/diagram sketches where they help. Call " +
    "out common misconceptions and failure modes. Precision over politeness; " +
    "dry humour and the occasional cricket analogy are welcome. End with a 3-5 " +
    "line 'Lock it in' recap. Use Markdown headings and short paragraphs. Do " +
    "not pad — every line should teach something.";
  if (u.type === "theory") return common;
  if (u.type === "build")
    return (
      common +
      " Today was a hands-on BUILD day. Frame the brief around the principles " +
      "the build exercises: what each step was really teaching, why it works, " +
      "and what to notice next time."
    );
  return (
    common +
    " Today was a CONSOLIDATION day. Tie the week's threads together: the " +
    "through-line concept, how the pieces connect, and the questions he should " +
    "now be able to answer cold."
  );
}

async function generateSummary(env, u) {
  // Return {note, cached}. Cached to KV so a day's brief is written once.
  const key = `brief:${u.id}`;
  const cached = await env.STUDY.get(key);
  if (cached) return { note: cached, cached: true };
  const body = await askModel(
    env,
    summaryPrompt(u),
    `Topic (Day ${u.id}, Week ${u.week}, ${u.type}): ${u.title}\n\n` +
      `Today's task/material:\n${u.text}`,
    Number(env.SUMMARY_MAX_TOKENS || 4000)
  );
  if (!body) return { note: "", cached: false };
  const note =
    `# Day ${u.id} — ${u.title}\n\n` +
    `*Week ${u.week} · ${u.type} · studied ${istToday().ymd}*\n\n` +
    `${body}\n`;
  await env.STUDY.put(key, note);
  await commitToVault(env, u, note); // optional; no-op unless configured
  return { note, cached: false };
}

async function deliverSummary(env, u) {
  if (!env.ANTHROPIC_API_KEY) {
    await send(
      env,
      "\u{1F4DD} Study brief needs `ANTHROPIC_API_KEY` set. Meanwhile, the best " +
        "recap is your own: explain today's topic to an imaginary junior in five " +
        "sentences."
    );
    return;
  }
  const has = await env.STUDY.get(`brief:${u.id}`);
  if (!has) await send(env, `\u{1F58A} Writing your study brief for *${u.title}* — one moment...`);
  const { note, cached } = await generateSummary(env, u);
  if (!note) {
    await send(env, "Couldn't reach the model for the brief just now — try /summary again in a bit.");
    return;
  }
  await send(
    env,
    `\u{1F4D8} *Study brief — Day ${u.id}: ${u.title}*` + (cached ? " _(cached)_" : "")
  );
  await send(env, stripMd(note), { markdown: false });
}

// Optional: mirror the brief into the Obsidian vault's git repo via the GitHub
// contents API, so notes still land in the vault even with no local machine.
async function commitToVault(env, u, note) {
  if (!env.GH_PAT || !env.VAULT_REPO) return;
  try {
    const safe = u.title
      .replace(/[^\w\- ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);
    const path = `01-Learning/Summaries/Day-${String(u.id).padStart(3, "0")}-${safe}.md`;
    const url = `https://api.github.com/repos/${env.VAULT_REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
    const headers = {
      authorization: `Bearer ${env.GH_PAT}`,
      accept: "application/vnd.github+json",
      "user-agent": "study-agent",
      "content-type": "application/json",
    };
    // need the existing blob sha to overwrite (idempotent re-runs)
    let sha;
    const head = await fetch(url, { headers });
    if (head.ok) sha = (await head.json()).sha;
    await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `study: Day ${u.id} — ${u.title}`,
        content: b64utf8(note),
        ...(sha ? { sha } : {}),
      }),
    });
  } catch (e) {
    console.error(`[vault] commit failed (kept in KV): ${e}`);
  }
}

function b64utf8(s) {
  // btoa needs latin1; encode UTF-8 bytes first so headings/emoji survive.
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64utf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ------------------------------------------------------- README progress ---
// Rewrite the PROGRESS block in the repo's README.md after each done/partial,
// via the GitHub contents API. Optional: no-op unless GH_PAT + REPO are set.
function renderProgressBlock(state) {
  const done = Object.keys(state.done).length;
  const partials = Object.keys(state.partials);
  const nPartial = partials.length;
  const p = pending(state);
  const curWeek = p.length ? p[0].week : WEEKS;
  const pct = (done / TOTAL) * 100;
  const effortPct = ((done + PARTIAL_WEIGHT * nPartial) / TOTAL) * 100;
  const BARS = 24;
  const full = Math.round((done / TOTAL) * BARS);
  const weighted = Math.round(((done + PARTIAL_WEIGHT * nPartial) / TOTAL) * BARS);
  const part = Math.max(0, Math.min(BARS - full, weighted - full));
  const bar = "▓".repeat(full) + "▒".repeat(part) + "░".repeat(BARS - full - part);
  const buildsLeft = p.filter((u) => u.type === "build").length;
  const streak = streakOf(state);
  const last = state.last_done;
  let lastLine = "—";
  if (last && String(last) in state.done)
    lastLine = `Day ${last} — ${BY_ID[String(last)].title} (${state.done[String(last)].date})`;
  const rows = [];
  for (let w = 1; w <= WEEKS; w++) {
    const cells = PLAN.filter((u) => u.week === w)
      .sort((a, b) => a.dow - b.dow)
      .map((u) =>
        String(u.id) in state.done ? "✅" : partials.includes(String(u.id)) ? "🟨" : "⬜"
      )
      .join("");
    rows.push("`W" + String(w).padStart(2, "0") + "` " + cells);
  }
  const stamp = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16).replace("T", " ");
  return (
    PROGRESS_START + "\n" +
    "`" + bar + "`\n\n" +
    "**" + done + "/" + TOTAL + "** days done · **" + pct.toFixed(1) + "%**" +
    (nPartial ? " · 🟨 +" + nPartial + " in progress (**" + effortPct.toFixed(1) + "%** effort)" : "") +
    "\n\n<sub>▓ done · ▒ in progress (½ credit) · ░ to go</sub>\n\n" +
    "- **Current:** Week " + curWeek + "/" + WEEKS + "\n" +
    "- **Streak:** " + streak + " day" + (streak !== 1 ? "s" : "") + (streak >= 3 ? " 🔥" : "") + "\n" +
    "- **Pending builds:** " + buildsLeft + "\n" +
    "- **Last completed:** " + lastLine + "\n" +
    "- **Updated:** " + stamp + " IST\n\n" +
    "<details><summary>" + WEEKS + "-week board (✅ done · 🟨 partial · ⬜ pending · Mon→Sun)</summary>\n\n" +
    rows.join("\n") + "\n\n</details>\n" +
    PROGRESS_END
  );
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function publishProgress(env, state) {
  // Never throws — a failed push just means the README lags until the next day.
  if (!env.GH_PAT || !env.REPO) return;
  try {
    const url = `https://api.github.com/repos/${env.REPO}/contents/README.md`;
    const headers = {
      authorization: `Bearer ${env.GH_PAT}`,
      accept: "application/vnd.github+json",
      "user-agent": "study-agent",
      "content-type": "application/json",
    };
    const cur = await fetch(url, { headers });
    if (!cur.ok) {
      console.error(`[readme] GET ${cur.status}`);
      return;
    }
    const meta = await cur.json();
    const txt = fromB64utf8(meta.content);
    const block = renderProgressBlock(state);
    let next;
    if (txt.includes(PROGRESS_START) && txt.includes(PROGRESS_END))
      next = txt.replace(
        new RegExp(escapeRe(PROGRESS_START) + "[\\s\\S]*?" + escapeRe(PROGRESS_END)),
        () => block
      );
    else next = txt.replace(/\s*$/, "") + "\n\n" + block + "\n";
    if (next === txt) return;
    await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `progress: ${Object.keys(state.done).length}/${TOTAL} days`,
        content: b64utf8(next),
        sha: meta.sha,
      }),
    });
  } catch (e) {
    console.error(`[readme] push failed (kept remote): ${e}`);
  }
}

// --------------------------------------------------------------- actions ---
async function mark(env, state, uid, status) {
  state.done[String(uid)] = { date: istToday().ymd, status };
  if (status === "done") state.last_done = uid;
  await saveState(env, state);
}

async function doDone(env, state, uid) {
  await mark(env, state, uid, "done");
  delete state.partials[String(uid)];
  await saveState(env, state);
  await send(env, `✅ Day ${uid} done. Here's your recap to read ↓`);
  await deliverSummary(env, BY_ID[String(uid)]);
  await publishProgress(env, state);
}

async function doPartial(env, state, uid) {
  state.partials[String(uid)] = istToday().ymd;
  delete state.done[String(uid)];
  await saveState(env, state);
  await send(
    env,
    `\u{1F538} Noted — Day ${uid} stays in the queue and the leftover carries ` +
      "over to the next matching slot. Part done beats pretending."
  );
  await publishProgress(env, state);
}

async function doSkip(env, state, uid) {
  state.skipped_today = istToday().ymd;
  await saveState(env, state);
  await send(
    env,
    "⏭ No problem — the pointer holds and everything shifts one day. " +
      `Day ${uid} becomes your next assignment. Even 20 minutes tomorrow beats zero.`
  );
}

async function morning(env, state, dow) {
  const u = nextUnitFor(state, dow);
  if (u === null) {
    await send(env, caughtUpMessage(state));
    return;
  }
  const kind = dow >= 5 ? "weekend" : "weekday";
  await send(
    env,
    `☀️ *Good morning — ${DOW[dow]} (${kind} plan):*\n\n${fmtUnit(u, dow)}` +
      "\n\n_Finished: /done · part of it: /partial · busy day: /skip_"
  );
}

async function evening(env, state, dow) {
  if (state.skipped_today === istToday().ymd) return;
  const u = nextUnitFor(state, dow);
  if (u === null) return;
  await send(env, `\u{1F319} *Evening check* — Day ${u.id}: *${u.title}*\n\nHow did it go?`, {
    buttons: [
      [
        { text: "✅ Done", callback_data: `done:${u.id}` },
        { text: "\u{1F538} Partial", callback_data: `partial:${u.id}` },
        { text: "⏭ Didn't get to it", callback_data: `skip:${u.id}` },
      ],
    ],
  });
}

async function status(env, state) {
  const done = Object.keys(state.done).length;
  const p = pending(state);
  const curWeek = p.length ? p[0].week : WEEKS;
  const buildsLeft = p.filter((u) => u.type === "build").length;
  const frontier = Object.keys(state.done).reduce((m, k) => Math.max(m, Number(k)), 0);
  const backlog = p.filter((u) => u.id < frontier).length;
  const barN = Math.round((done / TOTAL) * 20);
  const bar = "▓".repeat(barN) + "░".repeat(20 - barN);
  const catch_ =
    backlog === 0
      ? "No backlog — you're current ✅"
      : `${backlog} earlier topic(s) to catch up — they surface first on the ` +
        "next matching day (theory on weekdays/Sat, anything on Sun).";
  await send(
    env,
    `\u{1F4CA} *Progress*\n${bar} ${done}/${TOTAL} days (${((done / TOTAL) * 100).toFixed(0)}%)\n` +
      `Current: Week ${curWeek}/${WEEKS} · pending builds: ${buildsLeft}\n${catch_}`
  );
}

// ------------------------------------------------------------- free Q&A ---
const QA_SYSTEM =
  "You are Jayanth's personal study assistant, reachable over Telegram. " +
  "Jayanth is a data/AI engineer working through a structured mastery roadmap. " +
  "Answer his questions directly and concretely: teach from first principles, " +
  "use small examples or code sketches where they help, and keep it tight " +
  "enough to read on a phone — a few short paragraphs, not an essay, unless he " +
  "explicitly asks you to go deep. Precision over politeness; dry humour and the " +
  "occasional cricket analogy are welcome. If a question relates to his current " +
  "study topic, connect it. Plain text or light Markdown only.";

function studyContext(state) {
  const done = Object.keys(state.done).length;
  const p = pending(state);
  const bits = [`${done}/${TOTAL} days done (${((done / TOTAL) * 100).toFixed(0)}%)`];
  if (p.length) {
    const c = p[0];
    bits.push(`current/next: Day ${c.id} (Week ${c.week}, ${c.type}) — ${c.title}`);
  }
  if (state.last_done && String(state.last_done) in state.done)
    bits.push(`last completed: Day ${state.last_done} — ${BY_ID[String(state.last_done)].title}`);
  return bits.join("; ");
}

async function answerQuery(env, state, text) {
  if (!env.ANTHROPIC_API_KEY) {
    await send(env, "Answering questions needs `ANTHROPIC_API_KEY` set as a Worker secret.");
    return;
  }
  await tg(env, "sendChatAction", { chat_id: env.STUDY_CHAT_ID, action: "typing" });
  const histRaw = await env.STUDY.get("qa");
  const hist = histRaw ? JSON.parse(histRaw) : [];
  const convo = hist.map((h) => `${h.role.toUpperCase()}: ${h.text}`).join("\n");
  const prompt =
    `[Where Jayanth is: ${studyContext(state)}]\n\n` +
    (convo ? convo + "\n" : "") +
    `USER: ${text}\n\nAnswer the latest USER message.`;
  const reply = await askModel(env, QA_SYSTEM, prompt, 1500);
  if (!reply) {
    await send(env, "Couldn't reach the model just now — try again in a moment.");
    return;
  }
  hist.push({ role: "user", text }, { role: "assistant", text: reply });
  await env.STUDY.put("qa", JSON.stringify(hist.slice(-8)));
  await send(env, stripMd(reply), { markdown: false });
}

// ---------------------------------------------------------------- router ---
const COMMANDS = [
  ["today", "Today's assignment"],
  ["done", "Mark done + get the study brief"],
  ["partial", "Did part of it — carries over"],
  ["skip", "Skip today (no evening nag)"],
  ["summary", "Re-send the last study brief"],
  ["status", "Progress + any catch-up backlog"],
  ["pause", "Silence daily messages"],
  ["resume", "Resume daily messages"],
  ["help", "Show this command list"],
];
const HELP_TEXT =
  "*Study agent — commands*\n\n" +
  COMMANDS.map(([c, d]) => `/${c} — ${d}`).join("\n") +
  "\n\n_Or just send any question in plain text and I'll answer it._";

async function handleMessage(env, state, text) {
  text = text || "";
  const low = text.trim().toLowerCase();
  if (!low) return;
  const { dow } = istToday();
  if (low.startsWith("/today")) {
    const u = nextUnitFor(state, dow);
    await send(env, u ? fmtUnit(u, dow) : caughtUpMessage(state));
  } else if (low.startsWith("/done")) {
    const u = nextUnitFor(state, dow);
    if (u) await doDone(env, state, u.id);
  } else if (low.startsWith("/partial")) {
    const u = nextUnitFor(state, dow);
    if (u) await doPartial(env, state, u.id);
  } else if (low.startsWith("/skip")) {
    const u = nextUnitFor(state, dow);
    if (u) await doSkip(env, state, u.id);
  } else if (low.startsWith("/summary")) {
    if (state.last_done) await deliverSummary(env, BY_ID[String(state.last_done)]);
    else await send(env, "No completed unit yet — finish a day with /done and the brief follows.");
  } else if (low.startsWith("/status")) {
    await status(env, state);
  } else if (low.startsWith("/pause")) {
    state.paused = true;
    await saveState(env, state);
    await send(env, "⏸ Paused. Daily messages off; commands still work. /resume when ready.");
  } else if (low.startsWith("/resume")) {
    state.paused = false;
    await saveState(env, state);
    await send(env, "▶️ Resumed. The pointer waited for you — that's the whole design.");
  } else if (low.startsWith("/help") || low.startsWith("/start")) {
    await send(env, HELP_TEXT);
  } else if (low.startsWith("/")) {
    await send(
      env,
      "Not a command I know — /help for the list. (Or just send a plain-text " +
        "question and I'll answer it.)"
    );
  } else {
    await answerQuery(env, state, text);
  }
}

async function handleCallback(env, state, cb) {
  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });
  const [action, uid] = (cb.data || "").split(":");
  const fn = { done: doDone, partial: doPartial, skip: doSkip }[action];
  if (!fn || !/^\d+$/.test(uid || "") || !(uid in BY_ID)) {
    await send(
      env,
      "That button belongs to an old message — use /today for the current " +
        "assignment, then /done, /partial or /skip."
    );
    return;
  }
  await fn(env, state, Number(uid));
}

// ---------------------------------------------------------- dashboard API ---
function boardData(state) {
  // Per-week rows of 7 cells (Mon..Sun) with a status, for the heatmap board.
  const rows = [];
  for (let w = 1; w <= WEEKS; w++) {
    const cells = PLAN.filter((u) => u.week === w)
      .sort((a, b) => a.dow - b.dow)
      .map((u) => ({
        id: u.id,
        dow: u.dow,
        type: u.type,
        title: u.title,
        status: String(u.id) in state.done ? "done" : String(u.id) in state.partials ? "partial" : "pending",
      }));
    rows.push({ week: w, cells });
  }
  return rows;
}

function streakOf(state) {
  const dates = new Set(
    Object.values(state.done)
      .filter((v) => v.status === "done")
      .map((v) => v.date)
  );
  let n = 0;
  let d = new Date(istToday().ymd + "T00:00:00Z");
  while (dates.has(d.toISOString().slice(0, 10))) {
    n++;
    d = new Date(d.getTime() - 864e5);
  }
  return n;
}

function stateForUi(state) {
  const done = Object.keys(state.done).length;
  const nPartial = Object.keys(state.partials).length;
  const p = pending(state);
  const cur = nextUnitFor(state, istToday().dow) || p[0] || null;
  const byType = {};
  for (const t of ["theory", "build", "consolidate"]) {
    const all = PLAN.filter((u) => u.type === t);
    byType[t] = { done: all.filter((u) => String(u.id) in state.done).length, total: all.length };
  }
  const last = state.last_done && String(state.last_done) in state.done ? BY_ID[String(state.last_done)] : null;
  return {
    total: TOTAL,
    weeks: WEEKS,
    done,
    partials: nPartial,
    pct: (done / TOTAL) * 100,
    effortPct: ((done + PARTIAL_WEIGHT * nPartial) / TOTAL) * 100,
    streak: streakOf(state),
    paused: state.paused,
    currentWeek: p.length ? p[0].week : WEEKS,
    buildsLeft: p.filter((u) => u.type === "build").length,
    byType,
    current: cur
      ? { id: cur.id, week: cur.week, dow: cur.dow, type: cur.type, title: cur.title, text: cur.text, effort: EFFORT[cur.type] }
      : null,
    last: last ? { id: last.id, title: last.title, date: state.done[String(last.id)].date } : null,
    board: boardData(state),
    briefs: Object.entries(state.done)
      .filter(([, v]) => v.status === "done")
      .map(([id, v]) => ({ id: Number(id), title: BY_ID[id].title, week: BY_ID[id].week, type: BY_ID[id].type, date: v.date }))
      .sort((a, b) => b.id - a.id),
    updated: new Date().toISOString(),
  };
}

// --------------------------------------------------------------- helpers ---
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function gate(request, env) {
  // Constant-ish check with a small brake on wrong keys (matches finance UI).
  const key = request.headers.get("x-study-key") || "";
  return env.STUDY_UI_KEY && key === env.STUDY_UI_KEY;
}

// ------------------------------------------------------------------ main ---
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Telegram webhook
    if (path === "/tg" && request.method === "POST") {
      if ((request.headers.get("x-telegram-bot-api-secret-token") || "") !== env.TG_SECRET)
        return new Response("forbidden", { status: 403 });
      const update = await request.json().catch(() => null);
      if (update) ctx.waitUntil(processUpdate(env, update));
      return new Response("ok"); // ack fast; work continues in the background
    }

    // Dashboard shell (public; data is gated below)
    if (path === "/" && request.method === "GET") {
      return new Response(PAGE, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy":
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
            "connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'",
          "x-content-type-options": "nosniff",
        },
      });
    }

    // Gated data endpoints
    if (path.startsWith("/api/")) {
      if (!gate(request, env)) {
        await new Promise((r) => setTimeout(r, 800)); // wrong-key brake
        return json({ error: "unauthorized" }, 401);
      }
      const state = await loadState(env);
      if (path === "/api/state") return json(stateForUi(state));
      if (path.startsWith("/api/brief/")) {
        const id = path.slice("/api/brief/".length);
        if (!(id in BY_ID)) return json({ error: "unknown day" }, 404);
        const { note } = await generateSummary(env, BY_ID[id]);
        return json({ id: Number(id), title: BY_ID[id].title, note });
      }
      if (path === "/api/ask" && request.method === "POST") {
        const q = ((await request.json().catch(() => ({}))).q || "").toString().slice(0, 500);
        if (!q.trim()) return json({ answer: "" });
        const answer = await askModel(env, QA_SYSTEM, `[Where Jayanth is: ${studyContext(state)}]\n\nUSER: ${q}`, 1200);
        return json({ answer: answer || "Couldn't reach the model just now — try again in a moment." });
      }
      return json({ error: "not found" }, 404);
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    const run = async () => {
      const state = await loadState(env);
      if (state.paused) return;
      const { dow } = istToday();
      if (event.cron === MORNING_CRON) await morning(env, state, dow);
      else if (event.cron === EVENING_CRON) await evening(env, state, dow);
    };
    ctx.waitUntil(run());
  },
};

async function processUpdate(env, update) {
  try {
    const state = await loadState(env);
    if (update.callback_query) {
      await handleCallback(env, state, update.callback_query);
    } else if (update.message && String(update.message.chat.id) === String(env.STUDY_CHAT_ID)) {
      await handleMessage(env, state, update.message.text || "");
    }
  } catch (e) {
    console.error(`[update] ${e && e.stack ? e.stack : e}`);
  }
}
