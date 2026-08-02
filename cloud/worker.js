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
const WEEKS_META = PLAN_DATA.weeks || []; // [{n, title, phase}] for the roadmap view
// Computer Vision is now weeks 1-12 of the main plan (studied first), not a
// separate priority sequence — see TRACK_BOUNDS.
const BY_ID = Object.fromEntries(PLAN.map((u) => [String(u.id), u]));
const TOTAL = PLAN.length;
const WEEKS = PLAN.reduce((m, u) => Math.max(m, u.week), 0);

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ICON = { theory: "\u{1F4D6}", build: "\u{1F528}", consolidate: "\u{1F9E0}", cv: "\u{1F3AF}" };
const EFFORT = {
  theory: "45-60 min (read + video + code)",
  build: "5-6 hrs (blocks A/B/C)",
  consolidate: "3-4 hrs (review + lab)",
  cv: "60-120 min (one session)",
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
  const s = { done: {}, partials: {}, paused: false, skipped_today: null, last_done: null, presence: {}, projectLinks: {}, recaps: {} };
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
  // Computer Vision is weeks 1-12 of the plan, so pending-order already serves it
  // first; no special-casing needed.
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

function ytSearchUrl(q) {
  const clean = String(q || "").split(/[;|]/)[0].replace(/^\s*search\s+/i, "").replace(/["']/g, "").trim().slice(0, 160);
  return (
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(clean).replace(/\(/g, "%28").replace(/\)/g, "%29")
  );
}
function fmtUnit(u, dow) {
  let carry = "";
  if (dow != null && u.dow !== dow && u.type === "theory")
    carry = `  _(catching up ${DOW[u.dow]}'s topic)_`;
  let head =
    `${ICON[u.type]} *Day ${u.id}/${TOTAL} · Week ${u.week} · ` +
    `${DOW[u.dow]}-type · ~${EFFORT[u.type]}*${carry}\n` +
    `*${u.title}*\n\n${u.text}`;
  const mw = (u.text || "").match(/🎥 Watch: (.+)/);
  if (mw) head += `\n\n🔎 [Find today's video on YouTube ▶](${ytSearchUrl(mw[1])})`;
  if (u.type === "consolidate" && u.mastery)
    head += `\n\n\u{1F3AF} *Mastery check (answer aloud):* ${u.mastery}`;
  return head;
}

// ------------------------------------------------------------- summaries ---
function summaryPrompt(u) {
  const common =
    "Write these as MY OWN study notes, in the FIRST PERSON — as if I (Jayanth, a " +
    "data/AI engineer) am writing them myself right after studying today's topic. " +
    "Use 'I', 'my', 'today I…'; NEVER address a reader as 'you' or 'your', and never " +
    "call them a 'brief for Jayanth'. Aim for a focused 20-30 minute read that locks the " +
    "topic in: explain it from first principles, then go deep on the mechanism (the how " +
    "and why, not just definitions). Use concrete examples, commands, and small code/diagram " +
    "sketches where they help. Call out common misconceptions and failure modes I should " +
    "watch for. Precision over politeness; dry humour and the occasional cricket analogy " +
    "are welcome. End with a 3-5 line 'Lock it in' recap. Use Markdown headings and short " +
    "paragraphs. Do not pad — every line should teach me something.";
  if (u.type === "theory") return common;
  if (u.type === "build")
    return (
      common +
      " Today was a hands-on BUILD day. Frame my notes around the principles the build " +
      "exercised: what each step was really teaching me, why it works, and what to notice " +
      "next time."
    );
  return (
    common +
    " Today was a CONSOLIDATION day. Tie the week's threads together: the through-line " +
    "concept, how the pieces connect, and the questions I should now be able to answer cold."
  );
}

async function generateSummary(env, u) {
  // Return {note, cached}. Cached to KV so a day's brief is written once.
  const key = `brief:${u.id}`;
  const cached = await env.STUDY.get(key);
  if (cached) return { note: cached, cached: true };
  // Read the code Jayanth committed to this day's folder, if any, so the brief
  // reviews his real work — not just the plan. (Commit code before /done.)
  const { repo, folder } = noteTarget(env, u);
  const code = env.GH_PAT && repo ? await fetchDayCode(env, repo, folder) : null;
  let system = summaryPrompt(u);
  let user =
    `Topic (Day ${u.id}, Week ${u.week}, ${u.type}): ${u.title}\n\n` +
    `Today's task/material:\n${u.text}`;
  if (code) {
    system +=
      " I ALSO committed my own code for this day (below). Weave a review of MY code into the " +
      "notes, still in the first person — what I built, what it does well, what each part taught " +
      "me, subtle bugs / edge cases / gaps I should note, and how it maps to today's concept. " +
      "Reference my actual file and function names. Be specific and honest with myself, not generic.";
    user += `\n\nMY CODE for this day (from \`${folder}/\`):\n${code}`;
  }
  const body = await askModel(env, system, user, Number(env.SUMMARY_MAX_TOKENS || 4000));
  if (!body) return { note: "", cached: false };
  const stamp = code ? " · 🔗 with a review of my code" : "";
  const heading = `Day ${u.id} — ${u.title}`;
  const meta = `> Week ${u.week} · ${phaseName(u.week)} · ${u.type} · studied ${istToday().ymd}${stamp}`;
  const note =
    `# ${heading}\n\n` +
    `${meta}\n\n` +
    `## Today's work\n\n${u.text}\n\n` +
    (u.mastery ? `## Mastery check\n\n${u.mastery}\n\n` : "") +
    `## Deep dive\n\n${body}\n`;
  await env.STUDY.put(key, note);
  await commitNote(env, u, note); // push the rich note to the track's GitHub repo
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
  // Self-heal: if a previous push got cut off, the note is cached but not on GitHub — re-push it (no model cost).
  if (!(await env.STUDY.get(`pushed:${u.id}`))) await commitNote(env, u, note);
  await send(
    env,
    `\u{1F4D8} *Study brief — Day ${u.id}: ${u.title}*` + (cached ? " _(cached)_" : "")
  );
  await send(env, stripMd(note), { markdown: false });
}

// --------------------------------------- grounded recaps (your real work) ---
// Rewrite a day's note from what Jayanth ACTUALLY did — his own summary and/or
// his code repo — instead of the plan. Overwrites the cached brief and re-pushes
// the GitHub note so the public record matches reality.
function parseRepo(url) {
  const m = String(url || "").match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null;
}
async function ghGet(env, apiPath) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "study-agent" };
  if (env.GH_PAT) headers.authorization = `Bearer ${env.GH_PAT}`;
  const r = await fetch(`https://api.github.com${apiPath}`, { headers });
  return r.ok ? r : null;
}
async function fetchRepoContext(env, url) {
  // README + file tree + language mix — enough to summarize what was built, cheaply.
  const pr = parseRepo(url);
  if (!pr) return null;
  const base = `/repos/${pr.owner}/${pr.repo}`;
  const out = [`Repository: ${pr.owner}/${pr.repo}`];
  let branch = "main";
  const metaR = await ghGet(env, base);
  if (metaR) {
    const m = await metaR.json();
    branch = m.default_branch || "main";
    if (m.description) out.push(`Description: ${m.description}`);
  } else {
    return null; // repo not reachable (private/typo) — caller falls back
  }
  const langR = await ghGet(env, `${base}/languages`);
  if (langR) { const ks = Object.keys(await langR.json()); if (ks.length) out.push(`Languages: ${ks.join(", ")}`); }
  const rdR = await ghGet(env, `${base}/readme`);
  if (rdR) { const rd = await rdR.json(); out.push(`\nREADME:\n${fromB64utf8(rd.content).slice(0, 6000)}`); }
  const treeR = await ghGet(env, `${base}/git/trees/${branch}?recursive=1`);
  if (treeR) {
    const t = await treeR.json();
    const files = (t.tree || [])
      .filter((x) => x.type === "blob")
      .map((x) => x.path)
      .filter((p) => !/node_modules\/|\.venv\/|dist\/|build\/|\.min\.|package-lock/.test(p))
      .slice(0, 200);
    if (files.length) out.push(`\nFiles (${files.length} shown):\n${files.join("\n")}`);
  }
  return out.join("\n");
}
async function fetchDayCode(env, repo, folder) {
  // Read the files Jayanth committed under a day's folder (excluding notes.md),
  // within a char budget, so the model can review his actual code. Never throws.
  try {
    const metaR = await ghGet(env, `/repos/${repo}`);
    const branch = metaR ? (await metaR.json()).default_branch || "main" : "main";
    const treeR = await ghGet(env, `/repos/${repo}/git/trees/${branch}?recursive=1`);
    if (!treeR) return null;
    const tree = await treeR.json();
    const files = (tree.tree || [])
      .filter((x) => x.type === "blob" && x.path.startsWith(folder + "/"))
      .filter((x) => !/\/notes\.md$/i.test(x.path) && !/(^|\/)readme/i.test(x.path))
      .filter((x) => !/node_modules\/|\.venv\/|dist\/|build\/|\.min\.|package-lock|\.(png|jpe?g|gif|svg|pdf|zip|ico|lock)$/i.test(x.path))
      .filter((x) => (x.size || 0) < 80000);
    if (!files.length) return null;
    const parts = [];
    let budget = 26000;
    for (const f of files.slice(0, 14)) {
      if (budget <= 0) break;
      const cr = await ghGet(env, `/repos/${repo}/contents/${f.path.split("/").map(encodeURIComponent).join("/")}`);
      if (!cr) continue;
      const c = await cr.json();
      const content = fromB64utf8(c.content || "").slice(0, budget);
      budget -= content.length;
      parts.push(`--- ${f.path.slice(folder.length + 1)} ---\n${content}`);
    }
    return parts.length ? parts.join("\n\n") : null;
  } catch (e) {
    console.error(`[code] fetch failed: ${e}`);
    return null;
  }
}
async function regenerateNote(env, state, u, input) {
  // input: { notes?, repo? } — at least one required. Returns the note, or a
  // { error } object the caller can surface. Never throws on a bad repo.
  const notes = (input.notes || "").trim();
  const repo = (input.repo || "").trim();
  if (!notes && !repo) return { error: "Add a summary or a repo URL." };
  const repoCtx = repo ? await fetchRepoContext(env, repo) : null;
  if (repo && !repoCtx) return { error: "Couldn't read that repo — is the URL right and the repo public?" };
  const sourceBits = [];
  if (notes) sourceBits.push(`WHAT I SAY I DID (my own words):\n${notes}`);
  if (repoCtx) sourceBits.push(`MY CODE REPOSITORY:\n${repoCtx}`);
  const system =
    summaryPrompt(u) +
    " CRITICAL: Ground these notes in WHAT I ACTUALLY DID below (first person) — the plan is " +
    "only background. Where my real work diverged from the plan (different language, approach, " +
    "extra features, or cut scope), reflect what I actually did. Never invent work I didn't " +
    "mention; if my input is thin, summarize what's there and note what's missing rather than padding.";
  const body = await askModel(
    env,
    system,
    `Topic (Day ${u.id}, Week ${u.week}, ${u.type}): ${u.title}\n\n` +
      `THE PLAN (background only):\n${u.text}\n\n` +
      sourceBits.join("\n\n"),
    Number(env.SUMMARY_MAX_TOKENS || 4000)
  );
  if (!body) return { error: "The model didn't respond — try again in a moment." };
  const pr = repo ? parseRepo(repo) : null;
  const src = pr ? `🔗 grounded in ${pr.owner}/${pr.repo}` : "✍️ from my own summary";
  const note =
    `# Day ${u.id} — ${u.title}\n\n` +
    `> Week ${u.week} · ${phaseName(u.week)} · ${u.type} · studied ${istToday().ymd} · ${src}\n\n` +
    (notes ? `## What I actually did\n\n${notes}\n\n` : "") +
    (repo ? `**Repo:** ${repo}\n\n` : "") +
    `## Recap\n\n${body}\n`;
  await env.STUDY.put(`brief:${u.id}`, note);
  state.recaps = state.recaps || {};
  state.recaps[String(u.id)] = { source: pr ? "repo" : "notes", repo, at: istToday().ymd };
  await saveState(env, state);
  await commitNote(env, u, note); // re-push the grounded note to GitHub
  return { note };
}

// ------------------------------------------------------ track notes repos ---
// Each of the 4 tracks (DE / ML / AI / Linux) has its own public GitHub repo.
// On /done, the day's rich note is committed there and the repo's README index
// is regenerated. Never throws — a failed push just keeps the note in KV.
const TRACK_BOUNDS = [
  { name: "Computer Vision", lo: 1, hi: 12, envKey: "NOTES_REPO_CV" },
  { name: "Data Engineering", lo: 13, hi: 30, envKey: "NOTES_REPO_DE" },
  { name: "Data Science & ML", lo: 31, hi: 45, envKey: "NOTES_REPO_ML" },
  { name: "Deep Learning & AI", lo: 46, hi: 60, envKey: "NOTES_REPO_AI" },
  { name: "Linux & Systems", lo: 61, hi: 74, envKey: "NOTES_REPO_LINUX" },
];
const DASHBOARD_URL = "https://study-agent.jayanthapalla.workers.dev";
function phaseName(week) {
  const t = TRACK_BOUNDS.find((b) => week >= b.lo && week <= b.hi);
  return t ? t.name : "";
}
function trackRepo(env, week) {
  const b = TRACK_BOUNDS.find((x) => week >= x.lo && week <= x.hi);
  return b ? env[b.envKey] : env.NOTES_REPO_LINUX;
}
function noteSlug(u) {
  return u.title.replace(/[^\w\- ]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 50);
}
// Which repo + folder a unit's code and notes.md live in. Every track (incl.
// Computer Vision, weeks 1-12 -> the cv repo) uses week-NN/day-NNN-slug/.
function noteTarget(env, u) {
  const wk = String(u.week).padStart(2, "0");
  const day = String(u.id).padStart(3, "0");
  return { repo: trackRepo(env, u.week), folder: `week-${wk}/day-${day}-${noteSlug(u)}` };
}
async function ghPut(env, repo, path, content, message) {
  const url = `https://api.github.com/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const headers = {
    authorization: `Bearer ${env.GH_PAT}`,
    accept: "application/vnd.github+json",
    "user-agent": "study-agent",
    "content-type": "application/json",
  };
  let sha;
  const head = await fetch(url, { headers });
  if (head.ok) sha = (await head.json()).sha;
  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ message, content: b64utf8(content), ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) console.error(`[ghPut] ${repo}/${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.ok;
}
function trackReadme(env, week, state) {
  const b = TRACK_BOUNDS.find((x) => week >= x.lo && week <= x.hi);
  const days = PLAN.filter((u) => u.week >= b.lo && u.week <= b.hi && String(u.id) in state.done).sort((a, z) => a.id - z.id);
  const rows = days.map((u) => {
    const wk = String(u.week).padStart(2, "0");
    const day = String(u.id).padStart(3, "0");
    const folder = `week-${wk}/day-${day}-${noteSlug(u)}`;
    const tag = u.type === "build" ? "🔨 " : "";
    return `- ✅ ${tag}[Day ${u.id} — ${u.title}](${folder}/) · [notes](${folder}/notes.md) · _${state.done[String(u.id)].date}_`;
  });
  // sibling tracks — the current one shown plain, the rest linked to their repos
  const siblings = TRACK_BOUNDS.map((t) =>
    t === b ? `**${t.name}**` : env[t.envKey] ? `[${t.name}](https://github.com/${env[t.envKey]})` : t.name
  ).join(" · ");
  const agent = env.REPO ? `https://github.com/${env.REPO}` : DASHBOARD_URL;
  return (
    `# ${b.name}\n\n` +
    `> **📦 Not a standalone repo — this is part of [study-agent](${agent}).**  ` +
    `It's one of **${TRACK_BOUNDS.length} track repos** in my learning-in-public roadmap: a Telegram ` +
    "study coach that serves me one topic a day and, when I check in, auto-writes the " +
    "`notes.md` deep-dives you see here. The code is mine; the notes are generated.  \n" +
    `> **[▶ Start at study-agent](${agent})**  ·  **[📊 Live dashboard](${DASHBOARD_URL})**\n\n` +
    `My **code + written notes**, day by day, for **Weeks ${b.lo}–${b.hi}** of my 74-week ` +
    "Computer Vision · Data · ML · AI · Linux mastery roadmap.\n\n" +
    "**How it works:** each day I commit my code into that day's folder — " +
    "`week-NN/day-NNN-slug/` — and my study agent auto-writes a `notes.md` deep-dive in the " +
    "same folder when I check in. Builds are the 🔨 Saturday projects.\n\n" +
    `🧭 **All tracks:** ${siblings}\n\n` +
    "---\n\n" +
    `### ${days.length} day${days.length === 1 ? "" : "s"} done\n\n` +
    (rows.length
      ? rows.join("\n") + "\n"
      : "_Nothing here yet — day 1 lands the first time I commit code and check in._\n")
  );
}
async function commitNote(env, u, note) {
  const { repo, folder } = noteTarget(env, u);
  if (!env.GH_PAT || !repo) return;
  const label = `Day ${u.id} — ${u.title}`;
  try {
    // notes.md lives INSIDE the day's folder, alongside the code Jayanth commits
    const ok = await ghPut(env, repo, `${folder}/notes.md`, note, `notes: ${label}`);
    if (!ok) {
      await send(
        env,
        `⚠️ ${label}'s note is written but I couldn't push it to GitHub just now. ` +
          "It's saved — just run /done again and it'll re-push (no re-billing).",
      );
      return;
    }
    await env.STUDY.put(`pushed:${u.id}`, "1"); // notes.md is up on GitHub
    const state = await loadState(env); // regenerate the index from current progress
    const readme = trackReadme(env, u.week, state);
    await ghPut(env, repo, "README.md", readme, `index: ${label}`);
  } catch (e) {
    console.error(`[notes] push failed (kept in KV): ${e}`);
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

// ---- flexibility: check-in (attendance), build-gating, catch-up ----------
function buildGate(state) {
  // The current week's build and how many theory topics still gate it.
  const p = pending(state);
  const curWeek = p.length ? p[0].week : WEEKS;
  const build = PLAN.find((u) => u.week === curWeek && u.type === "build");
  if (!build) return { build: null, locked: false, theoryLeft: 0 };
  const theoryLeft = PLAN.filter(
    (u) => u.type === "theory" && u.id < build.id && !(String(u.id) in state.done)
  ).length;
  return { build, locked: theoryLeft > 0, theoryLeft };
}

function backlogOf(state) {
  // pending units that sit BEHIND your furthest-completed unit — things you owe.
  const frontier = Object.keys(state.done).reduce((m, k) => Math.max(m, Number(k)), 0);
  return pending(state).filter((u) => u.id < frontier);
}

async function doCheckin(env, state, kind) {
  // kind: "on" (studying today) | "off" (recorded rest day). Both keep the streak.
  state.presence = state.presence || {};
  state.presence[istToday().ymd] = kind;
  if (kind === "off") state.skipped_today = istToday().ymd; // silence tonight's nudge
  await saveState(env, state);
  if (kind === "on")
    await send(env, "✅ Checked in — nice. Do what you can; even one topic keeps the streak alive. /done when you finish · /more for another.");
  else
    await send(env, "🌙 Rest day logged — no guilt. The plan just shifts forward, nothing is lost, and your streak stays safe. See you tomorrow.");
}

async function serveUnit(env, u, dow, header) {
  // Send a unit with inline Done/Partial buttons so it can be completed directly.
  await send(env, `${header}\n\n${fmtUnit(u, dow)}`, {
    buttons: [
      [
        { text: "✅ Done", callback_data: `done:${u.id}` },
        { text: "\u{1F538} Partial", callback_data: `partial:${u.id}` },
      ],
    ],
  });
}

async function morning(env, state, dow) {
  const u = nextUnitFor(state, dow);
  if (u === null) {
    await send(env, caughtUpMessage(state));
    return;
  }
  const kind = dow >= 5 ? "weekend" : "weekday";
  let foot = "\n\n_Tap ✅ On it below · finished: /done · part of it: /partial · another: /more_";
  const back = backlogOf(state).length;
  if (back >= 2) foot += `\n📌 You owe ${back} earlier topic(s) — /catchup to clear them.`;
  const g = buildGate(state);
  if (g.locked && u.type === "theory")
    foot += `\n🔒 This week's build unlocks after ${g.theoryLeft} more theory topic${g.theoryLeft !== 1 ? "s" : ""}.`;
  await send(env, `☀️ *Good morning — ${DOW[dow]} (${kind} plan):*\n\n${fmtUnit(u, dow)}${foot}`, {
    buttons: [
      [
        { text: "✅ On it", callback_data: "checkin:on" },
        { text: "\u{1F319} Off today", callback_data: "checkin:off" },
      ],
    ],
  });
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
  ["more", "Do the next unit now (get ahead)"],
  ["catchup", "Clear your backlog"],
  ["off", "Log a rest day (streak-safe)"],
  ["skip", "Skip today (no evening nag)"],
  ["summary", "Re-send the last study brief"],
  ["recap", "Rewrite the last recap from your real work (notes or a repo URL)"],
  ["login", "Sign in to the dashboard on this device (no password)"],
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
  } else if (low.startsWith("/off")) {
    await doCheckin(env, state, "off");
  } else if (low.startsWith("/more")) {
    const p = pending(state);
    if (p.length) await serveUnit(env, p[0], dow, "🔁 *Next up* — get ahead or catch up:");
    else await send(env, caughtUpMessage(state));
  } else if (low.startsWith("/catchup")) {
    const owed = backlogOf(state);
    if (!owed.length)
      await send(env, "✅ Nothing owed — you're current. /more if you want to get ahead.");
    else
      await serveUnit(env, owed[0], dow, `🧹 *Catch-up* — you owe ${owed.length} earlier topic(s). Start here:`);
  } else if (low.startsWith("/summary")) {
    if (state.last_done) await deliverSummary(env, BY_ID[String(state.last_done)]);
    else await send(env, "No completed unit yet — finish a day with /done and the brief follows.");
  } else if (low.startsWith("/recap")) {
    const arg = text.trim().replace(/^\/recap(@\S+)?\s*/i, "").trim();
    if (!state.last_done || !(String(state.last_done) in state.done)) {
      await send(env, "No completed day yet — finish one with /done first, then /recap <your notes or a repo URL>.");
    } else if (!arg) {
      await send(
        env,
        "Add your real work after the command and I'll rewrite the last day's recap to match:\n" +
          "`/recap Built the LSM engine in Rust with a WAL instead of Python`\n" +
          "or\n`/recap https://github.com/you/your-repo`"
      );
    } else {
      const u = BY_ID[String(state.last_done)];
      const isRepo = /github\.com\//i.test(arg);
      await send(env, `\u{1F58A} Rewriting Day ${u.id}'s recap from your ${isRepo ? "repo" : "summary"}…`);
      const r = await regenerateNote(env, state, u, isRepo ? { repo: arg } : { notes: arg });
      if (r && r.note) {
        await send(env, `✅ *Day ${u.id} recap — regrounded in your real work.*`);
        await send(env, stripMd(r.note), { markdown: false });
      } else {
        await send(env, (r && r.error) || "Couldn't rewrite it just now — try again in a moment.");
      }
    }
  } else if (low.startsWith("/login")) {
    if (!env.STUDY_UI_KEY) {
      await send(env, "Sign-in isn't configured yet (STUDY_UI_KEY secret is unset).");
    } else {
      const token = await signToken(env, { k: "login", exp: Date.now() + 600000, n: crypto.randomUUID() });
      const url = `${DASHBOARD_URL}/owner?t=${encodeURIComponent(token)}`;
      const code = shortCode(6);
      await env.STUDY.put(`logincode:${code}`, "1", { expirationTtl: 600 });
      await send(
        env,
        "🔐 *Sign in to your dashboard*\n\n" +
          "• *On this device* — tap the button below.\n" +
          "• *On another device* (your laptop) — open the dashboard, click *Owner*, and enter this code:\n\n" +
          "`" + code + "`\n\n" +
          "_Valid 10 minutes; the device then stays signed in for a year._",
        { buttons: [[{ text: "✅ Open dashboard here (signed in)", url }]] }
      );
    }
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
  const [action, arg] = (cb.data || "").split(":");
  if (action === "checkin") {
    await doCheckin(env, state, arg === "off" ? "off" : "on");
    return;
  }
  const fn = { done: doDone, partial: doPartial, skip: doSkip }[action];
  if (!fn || !/^\d+$/.test(arg || "") || !(arg in BY_ID)) {
    await send(
      env,
      "That button belongs to an old message — use /today for the current " +
        "assignment, then /done, /partial or /skip."
    );
    return;
  }
  await fn(env, state, Number(arg));
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

// Dates the user "showed up": completed, partial, or an explicit check-in.
function activeDates(state) {
  const s = new Set();
  for (const v of Object.values(state.done)) if (v && v.date) s.add(v.date);
  for (const d of Object.values(state.partials || {})) s.add(d);
  for (const d of Object.keys(state.presence || {})) s.add(d);
  return s;
}
// Honest streak: consecutive active days ending today (a planned rest day keeps
// it; only a silent miss breaks it). Today-not-yet-acted doesn't break it.
function honestStreak(state) {
  const active = activeDates(state);
  let d = new Date(istToday().ymd + "T00:00:00Z");
  if (!active.has(d.toISOString().slice(0, 10))) d = new Date(d.getTime() - 864e5);
  let n = 0;
  while (active.has(d.toISOString().slice(0, 10))) {
    n++;
    d = new Date(d.getTime() - 864e5);
  }
  return n;
}
// Per-calendar-day attendance from the first activity to today, for the heatmap.
function presenceData(state) {
  const doneByDate = {};
  for (const v of Object.values(state.done)) if (v && v.date) doneByDate[v.date] = (doneByDate[v.date] || 0) + 1;
  const partialDates = new Set(Object.values(state.partials || {}));
  const presence = state.presence || {};
  const all = [...Object.keys(doneByDate), ...partialDates, ...Object.keys(presence)].sort();
  if (!all.length) return [];
  let d = new Date(all[0] + "T00:00:00Z");
  const end = new Date(istToday().ymd + "T00:00:00Z");
  const out = [];
  while (d <= end) {
    const ymd = d.toISOString().slice(0, 10);
    let status = "missed";
    if (doneByDate[ymd]) status = "done";
    else if (partialDates.has(ymd)) status = "partial";
    else if (presence[ymd] === "off") status = "off";
    else if (presence[ymd] === "on") status = "on";
    out.push({ date: ymd, status, count: doneByDate[ymd] || 0 });
    d = new Date(d.getTime() + 864e5);
  }
  return out;
}

// Standalone SHOWCASE projects — bigger, deployable, portfolio-centerpiece builds
// that sit alongside the 62 weekly builds (not tied to a study day). Owners can
// attach repo/demo links to these too.
const SHOWCASE = [
  { id: "s1", name: "Natural-language-to-SQL analytics agent", tech: ["LLM", "agents", "SQL", "function-calling"],
    demo: "Ask questions in English → it writes SQL over a real database, runs it, and returns the answer + a chart.",
    blurb: "An agent that turns plain-English questions into validated, read-only SQL against a real warehouse, executes them safely (guarded, LIMIT-enforced), and returns results with an auto-generated chart and a natural-language summary. Add schema-awareness, error self-correction, and a chat UI. One of the most demo-able, hire-me AI projects you can ship." },
  { id: "s2", name: "AI research assistant (multi-agent + MCP)", tech: ["multi-agent", "MCP", "RAG", "tools"],
    demo: "Give it a topic; specialized agents plan, search, use tools, and produce a cited report.",
    blurb: "A multi-agent system where an orchestrator delegates to specialized workers (search, read, summarize, critique) that use tools via MCP and RAG over real sources, then synthesize a cited report. Add evals, guardrails, and cost controls. On-brand with your bot fleet and a strong centerpiece." },
  { id: "s3", name: "Semantic search engine over a large corpus", tech: ["embeddings", "vector DB", "RAG", "web"],
    demo: "Fast hybrid (semantic + keyword) search over a big real corpus (arXiv/Wikipedia/docs), with a clean web UI.",
    blurb: "Ingest a large real corpus, embed it, and build hybrid search with reranking and a polished web UI — filters, highlighting, and 'ask a question' RAG on top. A genuinely useful, deployable product that shows retrieval + systems skills." },
  { id: "s4", name: "Real-time analytics platform", tech: ["Kafka", "Spark", "Delta", "dashboard"],
    demo: "Live event stream → Kafka → Structured Streaming → Delta → a real-time dashboard.",
    blurb: "An end-to-end real-time analytics product: ingest events into Kafka, process with Spark Structured Streaming (windowed, exactly-once) into a Delta lakehouse, and serve a live dashboard, with monitoring and replay. A flagship DE product with a visible demo." },
  { id: "s5", name: "End-to-end MLOps platform", tech: ["MLflow", "Kubernetes", "FastAPI", "CI/CD"],
    demo: "Train → registry → serve → monitor → auto-retrain, running on Kubernetes.",
    blurb: "A complete MLOps platform: reproducible training with MLflow tracking + registry, model serving via FastAPI/BentoML, drift + performance monitoring, and an automated retraining loop — all on K8s with CI/CD and observability. Proves you can run ML in production." },
  { id: "s6", name: "Real-time fraud / anomaly detection service", tech: ["ML", "streaming", "FastAPI"],
    demo: "Streaming features + a model scoring transactions in real time via an API, with monitoring.",
    blurb: "A real-time scoring service: streaming feature computation, a trained anomaly/fraud model, a low-latency API, and monitoring for drift + alert rates. Handle imbalance, thresholds, and a feedback loop. A high-signal ML-engineering product." },
  { id: "s7", name: "Code-review AI agent", tech: ["LLM", "GitHub API", "agents"],
    demo: "Reviews GitHub PRs, leaves inline comments, and runs checks — like your fleet's repo-review.",
    blurb: "An agent that watches PRs, reads the diff, runs static checks, and leaves useful inline review comments via the GitHub API — with guardrails so it's helpful, not noisy. Directly extends your fleet and demos beautifully on your own repos." },
  { id: "s8", name: "Fine-tuned domain LLM + serving + eval", tech: ["LoRA", "vLLM", "evals"],
    demo: "LoRA fine-tune an open model for a domain, serve it with vLLM, with a real eval harness.",
    blurb: "Curate an instruction dataset, LoRA/QLoRA fine-tune an open model, serve it efficiently with vLLM, and build an eval harness that proves it beats the base model and a prompted baseline. The full 'adapt a model' skill set few can do end to end." },
  { id: "s9", name: "CDC data-replication pipeline", tech: ["Debezium", "Kafka", "lakehouse"],
    demo: "Postgres → Debezium → Kafka → lakehouse, low-latency, with a status UI + monitoring.",
    blurb: "A production-style change-data-capture product: stream row-level changes from Postgres via Debezium into Kafka and materialize them into a lakehouse with exactly-once semantics, schema evolution, and a monitoring/status UI. A serious DE piece." },
  { id: "s10", name: "Mini analytical SQL query engine", tech: ["parsing", "columnar", "systems"],
    demo: "Parse → plan → execute SQL over Parquet columnar files (a DuckDB-lite).",
    blurb: "A small analytical query engine: a SQL parser, a logical/physical planner with predicate pushdown, and a vectorized executor over Parquet — a 'DuckDB in miniature'. Deep systems + databases credibility that stands out." },
  { id: "s11", name: "Two-tower recommendation service", tech: ["PyTorch", "feature store", "serving"],
    demo: "Feature store + a two-tower retrieval model + low-latency ANN serving + A/B eval.",
    blurb: "A modern recommender product: a two-tower retrieval model in PyTorch, a feature store for training/serving consistency, an ANN index for low-latency candidates, and an A/B evaluation harness. The architecture real recsys teams use." },
  { id: "s12", name: "Kubernetes operator", tech: ["Go", "Kubernetes", "operators"],
    demo: "A custom operator/CRD that automates a real operational task on your cluster.",
    blurb: "A Kubernetes operator (Go + a CRD) that encodes real operational knowledge — automating backups, provisioning a data service, or managing your platform's lifecycle — with reconcile loops, status, and tests. Elite-tier infra credibility." },
];
const SHOWCASE_IDS = new Set(SHOWCASE.map((s) => s.id));

// Projects, auto-derived from the roadmap: every weekly BUILD unit is a project.
function cleanName(title) {
  return title.replace(/^Deep Build\s*[—:\-]\s*/, "").trim();
}
function firstSentence(text) {
  const s = text.replace(/\[Block [A-Z]\]\s*/g, "").replace(/\s+/g, " ").trim();
  const m = s.match(/^.{0,190}?[.!?](\s|$)/);
  return (m ? m[0] : s.slice(0, 190)).trim();
}
function projectsData(state) {
  const builds = PLAN.filter((u) => u.type === "build").sort((a, b) => a.id - b.id);
  const links = state.projectLinks || {};
  const isDone = (u) => String(u.id) in state.done;
  const p = pending(state);
  const curWeek = p.length ? p[0].week : WEEKS;
  const weekly = builds.map((u) => {
    const lk = links[String(u.id)] || {};
    const repo = (lk.repo || "").trim();
    return {
      id: u.id,
      week: u.week,
      name: cleanName(u.title),
      blurb: firstSentence(u.text),
      tech: u.tech || [],
      flag: !!u.flag,
      demo: u.demo || "", // the resume line (what it demonstrates)
      repo, // owner-attached GitHub URL
      demoUrl: (lk.demo || "").trim(), // owner-attached live-demo URL
      status: repo ? "built" : isDone(u) ? "studied" : "planned",
      date: isDone(u) ? state.done[String(u.id)].date : "",
    };
  });
  const current = builds.find((u) => u.week === curWeek && !isDone(u)) || builds.find((u) => !isDone(u)) || null;
  const curLeft = current
    ? PLAN.filter((u) => u.type === "theory" && u.id < current.id && !(String(u.id) in state.done)).length
    : 0;
  const showcase = SHOWCASE.map((sp) => {
    const lk = links[sp.id] || {};
    const repo = (lk.repo || "").trim();
    return {
      id: sp.id, name: sp.name, blurb: sp.blurb, demo: sp.demo, tech: sp.tech,
      flag: true, showcase: true, week: 0,
      repo, demoUrl: (lk.demo || "").trim(), status: repo ? "built" : "planned",
    };
  });
  const all = weekly.concat(showcase); // showcase folded into the same list
  return {
    total: all.length,
    built: all.filter((x) => x.status === "built").length,
    studied: all.filter((x) => x.status === "studied").length,
    done: all.filter((x) => x.status !== "planned").length,
    current: current
      ? {
          id: current.id,
          week: current.week,
          name: cleanName(current.title),
          blurb: firstSentence(current.text),
          status: current.week === curWeek ? "in_progress" : "upcoming",
          locked: curLeft > 0,
          theoryLeft: curLeft,
        }
      : null,
    featured: all.filter((x) => x.flag),
    all,
  };
}

function tracksData(state) {
  // Per-track (per-domain) progress: the earliest pending week is the "active" track;
  // everything before it is complete, everything after is upcoming.
  const p = pending(state);
  const curWeek = p.length ? p[0].week : WEEKS;
  return TRACK_BOUNDS.map((t) => {
    const units = PLAN.filter((u) => u.week >= t.lo && u.week <= t.hi);
    const done = units.filter((u) => String(u.id) in state.done).length;
    const total = units.length;
    const builds = units.filter((u) => u.type === "build");
    const buildsDone = builds.filter((u) => String(u.id) in state.done).length;
    let status;
    if (total && done >= total) status = "done";
    else if (curWeek >= t.lo && curWeek <= t.hi) status = "active";
    else if (curWeek < t.lo) status = "upcoming";
    else status = "done"; // pointer already past this track and nothing left
    return {
      name: t.name,
      lo: t.lo,
      hi: t.hi,
      weeks: t.hi - t.lo + 1,
      done,
      total,
      pct: total ? (done / total) * 100 : 0,
      builds: { done: buildsDone, total: builds.length },
      status,
      current: curWeek >= t.lo && curWeek <= t.hi,
    };
  });
}

// Raw tags that read badly as skill chips: non-tools, vague concepts, internals,
// duplicates, and low-signal table-stakes. Dropped from the recruiter view.
const SKILL_BLOCK = new Set([
  // approaches / non-skills
  "from-scratch", "paper reproduction", "ablation study", "systems", "database internals",
  "representation learning", "process management", "system design", "autograd", "optimization",
  "linear algebra", "statistics", "backtesting", "matrix factorization",
  "AI product", "tools", "demos", "docs", "portfolio",
  // vague concepts (shown better as projects than as chips)
  "consensus", "indexing", "lakehouse", "lineage", "query optimization", "replication",
  "sharding", "tuning", "warehouse", "function-calling", "guardrails", "multimodal",
  "transfer learning", "contrastive learning", "prompting", "evals",
  "syscalls", "namespaces", "cgroups", "epoll", "hardening", "security", "firewall", "sockets", "/proc",
  // vision / DL meta-labels + low-signal internals (shown better as the track name)
  "computer vision", "image processing", "document AI", "DataLoader", "mixed precision",
  "profiling", "distributed", "open_clip", "timm", "graphs", "structured output", "attention",
  // duplicates / superseded
  "Delta", "LLM", "LLM API", "LLM agents", "nanoGPT", "seq2seq", "tokenizers",
  // low-signal / minor
  "cProfile", "Typer", "awk", "sed", "perf", "ptrace", "strace", "SSH", "TCP",
]);
// Polished, canonical display names for the tags worth keeping.
const SKILL_RENAME = {
  "distributed systems": "Distributed Systems", "Kimball": "Dimensional Modeling",
  "LSM-tree": "LSM-Tree Engines", "Raft": "Raft Consensus", "pydantic": "Pydantic",
  "A/B testing": "A/B Testing", "matplotlib": "Matplotlib", "agents": "AI Agents",
  "CNN": "CNNs", "embeddings": "Embeddings", "HuggingFace": "Hugging Face",
  "Transformer": "Transformers", "bash": "Bash", "NLP": "NLP",
  // ambiguous / obscure tool names → clear, recognisable skill names
  "Glue": "AWS Glue", "Athena": "AWS Athena",
  "Great Expectations": "Data Quality", "Feast": "Feature Stores",
  "Evidently": "Model Monitoring", "DVC": "Data Versioning (DVC)",
  "Optuna": "Hyperparameter Tuning (Optuna)", "SHAP": "Model Explainability (SHAP)",
  "Prophet": "Forecasting (Prophet)",
  "pgvector": "Vector Search (pgvector)", "vLLM": "LLM Serving (vLLM)",
  "PEFT": "Fine-tuning", "ARIMA": "Time Series (ARIMA)",
  // computer-vision + graph track names → clear, recognisable skill names
  "SAM": "Segment Anything (SAM)", "VAE": "VAEs", "GNN": "GNNs", "GAT": "Graph Attention (GAT)",
  "DDP": "Distributed Training (DDP)", "detection": "Object Detection", "segmentation": "Segmentation",
  "quantization": "Quantization", "knowledge graph": "Knowledge Graphs", "OCR": "OCR",
};
function learnedData(state) {
  // Tech stack derived ENTIRELY from the 62-week roadmap's build tags — nothing
  // seeded. Each skill starts unlit and highlights itself the moment you complete
  // a build that uses it, so the section grows with your real progress. Names are
  // cleaned (SKILL_BLOCK) and normalised (SKILL_RENAME) for a polished look.
  const builds = PLAN.filter((u) => u.type === "build");
  const map = {};
  for (const u of builds) {
    const t = TRACK_BOUNDS.find((b) => u.week >= b.lo && u.week <= b.hi);
    const done = String(u.id) in state.done;
    for (const raw of u.tech || []) {
      if (SKILL_BLOCK.has(raw)) continue;
      const tech = SKILL_RENAME[raw] || raw;
      if (!map[tech]) map[tech] = { tech, count: 0, done: false, track: t ? t.name : "" };
      map[tech].count++;
      if (done) map[tech].done = true;
    }
  }
  return Object.values(map).sort((a, b) => b.count - a.count || a.tech.localeCompare(b.tech));
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
    honestStreak: honestStreak(state),
    presence: presenceData(state),
    backlog: backlogOf(state).length,
    paused: state.paused,
    currentWeek: p.length ? p[0].week : WEEKS,
    buildsLeft: p.filter((u) => u.type === "build").length,
    byType,
    tracks: tracksData(state),
    learned: learnedData(state),
    grounded: state.recaps || {},
    current: cur
      ? { id: cur.id, week: cur.week, dow: cur.dow, type: cur.type, title: cur.title, text: cur.text, effort: EFFORT[cur.type] }
      : null,
    last: last ? { id: last.id, title: last.title, date: state.done[String(last.id)].date } : null,
    board: boardData(state),
    weeksMeta: WEEKS_META,
    projects: projectsData(state),
    briefs: Object.entries(state.done)
      .filter(([, v]) => v.status === "done")
      .map(([id, v]) => ({ id: Number(id), title: BY_ID[id].title, week: BY_ID[id].week, type: BY_ID[id].type, date: v.date }))
      .sort((a, b) => b.id - a.id),
    updated: new Date().toISOString(),
  };
}

// --------------------------------------------------------------- helpers ---
function ogSvg() {
  // Social share card (1200×630). SVG renders on Slack/Discord/Telegram; some
  // platforms want a raster — swap this route for a PNG if needed.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a0b16"/><stop offset="1" stop-color="#131730"/></linearGradient>
<linearGradient id="tx" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#60a5fa"/><stop offset=".5" stop-color="#a855f7"/><stop offset="1" stop-color="#f472b6"/></linearGradient>
</defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<circle cx="1060" cy="110" r="270" fill="#6366f1" opacity=".13"/>
<circle cx="140" cy="580" r="230" fill="#f472b6" opacity=".08"/>
<text x="80" y="150" font-family="system-ui,Segoe UI,sans-serif" font-size="26" font-weight="700" letter-spacing="4" fill="#a855f7">74-WEEK MASTERY ROADMAP</text>
<text x="76" y="272" font-family="system-ui,Segoe UI,sans-serif" font-size="98" font-weight="850" fill="#eef1fb">Jayanth Appalla</text>
<text x="80" y="332" font-family="system-ui,Segoe UI,sans-serif" font-size="40" font-weight="700" fill="url(#tx)">Data &amp; AI Engineer · learning in public</text>
<text x="80" y="428" font-family="system-ui,Segoe UI,sans-serif" font-size="30" fill="#9aa3c7">Computer Vision · Data Engineering · ML · AI · Linux &amp; Systems</text>
<g font-family="system-ui,Segoe UI,sans-serif">
<text x="80" y="548" font-size="54" font-weight="800" fill="#eef1fb">74</text><text x="82" y="582" font-size="22" fill="#646a86">projects</text>
<text x="320" y="548" font-size="54" font-weight="800" fill="#eef1fb">518</text><text x="322" y="582" font-size="22" fill="#646a86">days</text>
<text x="560" y="548" font-size="54" font-weight="800" fill="#eef1fb">5</text><text x="562" y="582" font-size="22" fill="#646a86">domains</text>
</g>
<text x="1120" y="585" text-anchor="end" font-family="ui-monospace,monospace" font-size="22" fill="#646a86">study-agent.jayanthapalla.workers.dev</text>
</svg>`;
}

function json(obj, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });
}

// --------------------------------------------------- passwordless sign-in ---
// Owner auth is a signed token, not a passphrase: /login (Telegram) mints a
// short-lived login token → tapping its link redeems it for a long-lived device
// token, stored on that device. All tokens are HMAC-signed with STUDY_UI_KEY
// (server-only), so rotating that secret revokes every device at once.
function b64url(bytes) {
  let s = "";
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlBytes(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function shortCode(n) {
  // Human-typeable code for cross-device sign-in (no O/0/I/1/L to avoid confusion).
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < n; i++) s += A[b[i] % A.length];
  return s;
}
async function hmacKey(env) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.STUDY_UI_KEY || "no-key-set"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
async function signToken(env, payload) {
  const p = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), new TextEncoder().encode(p));
  return p + "." + b64url(sig);
}
async function verifyToken(env, token, kind) {
  if (!token || typeof token !== "string" || token.indexOf(".") < 0) return null;
  const [p, sig] = token.split(".");
  let ok;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(env), b64urlBytes(sig), new TextEncoder().encode(p));
  } catch (e) {
    return null;
  }
  if (!ok) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlBytes(p)));
  } catch (e) {
    return null;
  }
  if (kind && payload.k !== kind) return null;
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}
async function isOwner(env, key) {
  // Only a Telegram-issued device token authenticates — the STUDY_UI_KEY secret
  // is the token SIGNING key, never accepted as a typed password.
  if (!key || !env.STUDY_UI_KEY) return false;
  return !!(await verifyToken(env, key, "device"));
}
const OWNER_HTML =
  "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\">" +
  "<title>Signing in…</title>" +
  "<body style=\"font-family:system-ui,sans-serif;background:#0b0d17;color:#e8eaf2;display:grid;place-items:center;min-height:100vh;margin:0\">" +
  "<div id=m style=\"font-size:1rem;opacity:.9\">Signing you in…</div>" +
  "<script>(function(){var t=new URLSearchParams(location.search).get('t');" +
  "if(!t){document.getElementById('m').textContent='Invalid link.';return;}" +
  "fetch('/api/login/redeem',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({t:t})})" +
  ".then(function(r){return r.json();}).then(function(d){" +
  "if(d.token){try{localStorage.setItem('study_edit_key',d.token);}catch(e){}" +
  "document.getElementById('m').textContent='\\u2713 Signed in \\u2014 opening your dashboard\\u2026';location.replace('/');}" +
  "else{document.getElementById('m').textContent=d.error||'This link expired \\u2014 send /login again.';}})" +
  ".catch(function(){document.getElementById('m').textContent='Something went wrong \\u2014 send /login again.';});})();<\/script>";

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
          "cache-control": "public, max-age=60",
          "content-security-policy":
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
            "connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'",
          "x-content-type-options": "nosniff",
        },
      });
    }

    // Passwordless sign-in landing — redeems a /login link into a device token.
    if (path === "/owner" && request.method === "GET") {
      return new Response(OWNER_HTML, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy":
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
          "x-content-type-options": "nosniff",
        },
      });
    }

    // Social share card — raster PNG (from KV) for LinkedIn/X previews.
    if (path === "/og.png" && request.method === "GET") {
      const buf = await env.STUDY.get("og.png", { type: "arrayBuffer" });
      if (buf) {
        return new Response(buf, {
          headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
        });
      }
      // fall through to the SVG if the PNG isn't in KV yet
    }
    // Social share card (SVG fallback)
    if (path === "/og.svg" && request.method === "GET") {
      return new Response(ogSvg(), {
        headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    // Public, read-only data — this is a public portfolio page. All writing and
    // interaction happens through the Telegram bot; the web never bills the API.
    if (path.startsWith("/api/")) {
      const state = await loadState(env);
      if (path === "/api/state") return json(stateForUi(state), 200, "public, max-age=60");
      if (path.startsWith("/api/brief/")) {
        const id = path.slice("/api/brief/".length);
        if (!(id in BY_ID)) return json({ error: "unknown day" }, 404);
        // cached only — a public hit must never trigger a paid generation
        const note = await env.STUDY.get(`brief:${id}`);
        return json({ id: Number(id), title: BY_ID[id].title, note: note || "" }, 200, "public, max-age=60");
      }
      if (path.startsWith("/api/unit/")) {
        const id = path.slice("/api/unit/".length);
        if (!(id in BY_ID)) return json({ error: "unknown unit" }, 404);
        const u = BY_ID[id];
        return json(
          { id: Number(id), week: u.week, dow: u.dow, type: u.type, title: u.title, text: u.text, mastery: u.mastery || null },
          200,
          "public, max-age=300"
        );
      }
      // Redeem a one-tap /login link for a long-lived device token (public: the
      // login token itself is the credential, and only the owner ever receives it).
      if (path === "/api/login/redeem" && request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        // Cross-device: a short code entered on the target device (e.g. laptop).
        if (b.code) {
          const code = String(b.code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
          const hit = code && (await env.STUDY.get(`logincode:${code}`));
          if (!hit) return json({ error: "That code is wrong or expired — send /login again.", retry: true }, 400);
          await env.STUDY.delete(`logincode:${code}`); // single-use
          const token = await signToken(env, { k: "device", exp: Date.now() + 365 * 24 * 3600 * 1000 });
          return json({ token });
        }
        // Same-device: the one-tap link token.
        const p = await verifyToken(env, String(b.t || ""), "login");
        if (!p) return json({ error: "This link expired or is invalid — send /login again." }, 400);
        if (p.n) {
          if (await env.STUDY.get("used:" + p.n)) return json({ error: "This link was already used — send /login again." }, 400);
          await env.STUDY.put("used:" + p.n, "1", { expirationTtl: 900 });
        }
        const token = await signToken(env, { k: "device", exp: Date.now() + 365 * 24 * 3600 * 1000 });
        return json({ token });
      }
      // Owner check — lets the dashboard confirm a device token / passphrase is valid.
      if (path === "/api/auth") {
        const key = request.headers.get("x-study-key") || "";
        if (await isOwner(env, key)) return json({ ok: true });
        await new Promise((r) => setTimeout(r, 600));
        return json({ ok: false }, 401);
      }
      // Attach a repo/demo link to a project (owner only).
      if (path === "/api/project" && request.method === "POST") {
        const key = request.headers.get("x-study-key") || "";
        if (!(await isOwner(env, key))) {
          await new Promise((r) => setTimeout(r, 600));
          return json({ error: "unauthorized" }, 401);
        }
        const body = await request.json().catch(() => ({}));
        const id = String(body.id || "");
        const isBuild = id in BY_ID && BY_ID[id].type === "build";
        if (!isBuild && !SHOWCASE_IDS.has(id)) return json({ error: "unknown project" }, 404);
        state.projectLinks = state.projectLinks || {};
        state.projectLinks[id] = {
          repo: (body.repo || "").toString().trim().slice(0, 300),
          demo: (body.demo || "").toString().trim().slice(0, 300),
        };
        await saveState(env, state);
        return json({ ok: true });
      }
      // Owner "I studied today" — marks the current day done (brief + note push).
      if (path === "/api/checkin" && request.method === "POST") {
        const key = request.headers.get("x-study-key") || "";
        if (!(await isOwner(env, key))) {
          await new Promise((r) => setTimeout(r, 600));
          return json({ error: "unauthorized" }, 401);
        }
        const { dow } = istToday();
        const u = nextUnitFor(state, dow);
        if (!u) return json({ ok: false, msg: "Nothing to mark today — you're caught up." });
        ctx.waitUntil(doDone(env, state, u.id)); // marks done + writes/pushes the note in the background
        return json({ ok: true, day: u.id, title: u.title });
      }
      // Owner "revise recap" — rewrite a completed day's note from real work.
      if (path === "/api/recap" && request.method === "POST") {
        const key = request.headers.get("x-study-key") || "";
        if (!(await isOwner(env, key))) {
          await new Promise((r) => setTimeout(r, 600));
          return json({ error: "unauthorized" }, 401);
        }
        const b = await request.json().catch(() => ({}));
        const id = String(b.id || "");
        if (!(id in BY_ID)) return json({ ok: false, msg: "Unknown day." });
        if (!(id in state.done)) return json({ ok: false, msg: "Finish the day first (check in), then revise its recap." });
        const notes = (b.notes || "").toString().trim().slice(0, 6000);
        const repo = (b.repo || "").toString().trim().slice(0, 300);
        if (!notes && !repo) return json({ ok: false, msg: "Add a summary or a repo URL." });
        ctx.waitUntil(regenerateNote(env, state, BY_ID[id], { notes, repo }));
        return json({ ok: true, day: Number(id) });
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
