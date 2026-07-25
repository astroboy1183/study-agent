// The public portfolio dashboard, served by worker.js at GET /. One
// self-contained HTML document, no passphrase: anyone can see the progress, the
// auto-derived projects (the roadmap's weekly builds), and the completed-day
// briefs. All interaction (marking days, asking questions) happens through the
// Telegram bot — the web is read-only and never bills the API.
//
// Kept free of JS template literals / unescaped backticks so it can live inside
// worker.js's import.

export const PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jayanth Appalla — Learning in Public</title>
<meta name="description" content="Jayanth Appalla — Data &amp; AI Engineer. A 62-week mastery roadmap across Data Engineering, ML, AI and Linux, with 74 portfolio projects, built and shipped in public.">
<meta property="og:type" content="website">
<meta property="og:title" content="Jayanth Appalla — Data &amp; AI Engineer, learning in public">
<meta property="og:description" content="A 62-week mastery roadmap · 74 projects · Data Engineering, ML, AI &amp; Linux — built and shipped in public.">
<meta property="og:image" content="https://study-agent.jayanthapalla.workers.dev/og.svg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Jayanth Appalla — Data &amp; AI Engineer, learning in public">
<meta name="twitter:description" content="A 62-week mastery roadmap · 74 projects · DE, ML, AI &amp; Linux — in public.">
<meta name="twitter:image" content="https://study-agent.jayanthapalla.workers.dev/og.svg">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📚</text></svg>">
<style>
:root{
  --bg:#080911; --card:#131730; --card2:#181d3a;
  --line:rgba(255,255,255,.07); --line2:rgba(255,255,255,.16);
  --txt:#eef1fb; --dim:#9aa3c7; --faint:#616a92;
  --indigo:#6366f1; --blue:#60a5fa; --violet:#a855f7; --pink:#f472b6;
  --teal:#2dd4bf; --green:#34d399; --amber:#f59e0b; --red:#fb7185;
  --theory:#6366f1; --build:#f59e0b; --consolidate:#a855f7;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth; scrollbar-color:#2c3354 #080911}
body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;
  background:var(--bg); color:var(--txt); min-height:100vh; overflow-x:hidden}
body::before{content:""; position:fixed; inset:0; z-index:-1;
  background:
    radial-gradient(900px 620px at 8% -14%, rgba(99,102,241,.22), transparent 64%),
    radial-gradient(880px 600px at 98% -8%, rgba(168,85,247,.17), transparent 64%),
    radial-gradient(720px 560px at -10% 55%, rgba(45,212,191,.10), transparent 70%),
    radial-gradient(820px 600px at 108% 96%, rgba(244,114,182,.10), transparent 70%)}
a{color:inherit; text-decoration:none}
button{font:inherit; cursor:pointer}

header{position:sticky; top:0; z-index:30; display:flex; align-items:center;
  gap:1rem; padding:.7rem 1.5rem; background:rgba(8,9,17,.72);
  backdrop-filter:blur(14px); border-bottom:1px solid var(--line)}
.brand{font-weight:750; letter-spacing:-.01em}
.brand b{background:linear-gradient(90deg,var(--blue),var(--violet),var(--pink));
  -webkit-background-clip:text; background-clip:text; color:transparent}
.brand span{color:var(--faint); font-weight:500; font-size:.85rem}
header nav{margin-left:auto; display:flex; gap:.4rem}
header nav a{font-size:.82rem; color:var(--dim); padding:.4rem .8rem; border-radius:9px;
  border:1px solid transparent; transition:.15s}
header nav a:hover{color:var(--txt); background:rgba(255,255,255,.05); border-color:var(--line)}

.wrap{max-width:1120px; margin:0 auto; padding:0 1.5rem 4rem}

/* ── hero ── */
.hero{display:grid; grid-template-columns:1.35fr 1fr; gap:2.5rem; align-items:center;
  padding:3.5rem 0 2.5rem}
@media(max-width:820px){.hero{grid-template-columns:1fr; gap:2rem; padding:2.5rem 0 1.5rem}}
.eyebrow{font-size:.72rem; font-weight:800; letter-spacing:.2em; text-transform:uppercase;
  color:var(--violet); margin-bottom:1rem}
.hero h1{font-size:clamp(2.35rem,7vw,3.4rem); font-weight:850; letter-spacing:-.03em; line-height:1.04}
.hero .role{font-size:clamp(1.08rem,3.4vw,1.25rem); font-weight:650; margin-top:.35rem;
  background:linear-gradient(90deg,#7dd3fc,#c4b5fd 60%,#f9a8d4);
  -webkit-background-clip:text; background-clip:text; color:transparent}
.hero .tagline{color:var(--dim); font-size:1.02rem; margin:1rem 0 .4rem; max-width:42ch}
.hero .creds{color:var(--faint); font-size:.86rem}
.links{display:flex; gap:.6rem; flex-wrap:wrap; margin-top:1.5rem}
.links a{display:inline-flex; align-items:center; gap:.45rem; font-size:.86rem; font-weight:600;
  padding:.55rem 1rem; border-radius:11px; border:1px solid var(--line2);
  background:rgba(255,255,255,.03); transition:.16s}
.links a:hover{transform:translateY(-2px); border-color:var(--violet);
  box-shadow:0 8px 22px rgba(139,92,246,.22)}
.links a.primary{background:linear-gradient(90deg,#6366f1,#a855f7); border-color:transparent; color:#fff}

/* progress ring */
.ring-card{display:flex; flex-direction:column; align-items:center; gap:1rem}
.ring{position:relative; width:230px; height:230px}
.ring svg{transform:rotate(-90deg)}
.ring .mid{position:absolute; inset:0; display:flex; flex-direction:column;
  align-items:center; justify-content:center; text-align:center}
.ring .pct{font-size:3.1rem; font-weight:850; letter-spacing:-.03em; line-height:1;
  background:linear-gradient(92deg,#7dd3fc,#c4b5fd 55%,#f9a8d4);
  -webkit-background-clip:text; background-clip:text; color:transparent}
.ring .of{color:var(--faint); font-size:.82rem; margin-top:.35rem}
.ring-stats{display:flex; gap:1.5rem}
.ring-stats .s{text-align:center}
.ring-stats .s b{display:block; font-size:1.35rem; font-weight:750}
.ring-stats .s span{color:var(--faint); font-size:.74rem}

/* ── sections ── */
.sec{display:flex; align-items:baseline; gap:1rem; margin:2.75rem 0 1.25rem}
.sec h2{font-size:1.3rem; font-weight:750; letter-spacing:-.02em}
.sec .sub{color:var(--faint); font-size:.8rem}
.sec::after{content:""; flex:1; height:1px; align-self:center;
  background:linear-gradient(90deg,var(--line2),transparent)}

.card{position:relative; background:var(--card); border:1px solid var(--line);
  border-radius:20px; padding:1.6rem; box-shadow:0 24px 48px -24px rgba(3,5,16,.6)}
.card::before{content:""; position:absolute; inset:0 0 auto 0; height:1px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent)}

/* now building */
.now{overflow:hidden}
.now .badge{display:inline-flex; align-items:center; gap:.5rem; font-size:.74rem; font-weight:700;
  color:#fde68a; background:rgba(245,158,11,.13); border:1px solid rgba(245,158,11,.4);
  border-radius:999px; padding:.28rem .8rem}
.now .badge .dot{width:7px; height:7px; border-radius:50%; background:var(--amber);
  box-shadow:0 0 0 0 rgba(245,158,11,.6); animation:pulse 2s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 7px rgba(245,158,11,0)}100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}}
.now h3{font-size:1.55rem; font-weight:750; letter-spacing:-.02em; margin:.9rem 0 .5rem}
.now p{color:var(--dim); font-size:.96rem; max-width:70ch}
.now .meta{color:var(--faint); font-size:.8rem; margin-top:.9rem}
.now{cursor:pointer} .now:hover{border-color:var(--line2)}
.now .hint{color:var(--build); font-weight:650; font-size:.8rem; margin-top:.7rem}

/* kpi strip */
.kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-top:1rem}
@media(max-width:700px){.kpis{grid-template-columns:repeat(2,1fr)}}
.kpi{padding:1.2rem 1.4rem; transition:transform .16s}
.kpi:hover{transform:translateY(-3px)}
.kpi .v{font-size:1.7rem; font-weight:800; letter-spacing:-.02em}
.kpi .l{color:var(--dim); font-size:.76rem; margin-top:.15rem}

/* meters */
.meters{display:grid; grid-template-columns:repeat(3,1fr); gap:1rem}
@media(max-width:700px){.meters{grid-template-columns:1fr}}
.meter .top{display:flex; justify-content:space-between; align-items:baseline}
.meter .nm{font-weight:650}
.meter .fr{color:var(--faint); font-size:.8rem; font-variant-numeric:tabular-nums}
.mbar{height:9px; border-radius:5px; background:rgba(255,255,255,.06); overflow:hidden; margin-top:.6rem}
.mbar i{display:block; height:100%; border-radius:5px}

/* board */
.board-wrap{overflow-x:auto; padding-bottom:.4rem; -webkit-overflow-scrolling:touch}
.board{display:grid; grid-template-rows:repeat(7,1fr); grid-auto-flow:column;
  grid-auto-columns:1fr; gap:3px; min-width:640px}
.cell{aspect-ratio:1; border-radius:2px; background:rgba(255,255,255,.045); cursor:pointer; transition:transform .1s,box-shadow .1s}
.cell.today{box-shadow:0 0 0 2px var(--txt); position:relative; z-index:1}
@media(hover:hover){.cell:hover{transform:scale(1.4); box-shadow:0 0 0 2px var(--line2); z-index:2; position:relative}}
/* larger, more tappable cells on touch-sized screens */
@media(max-width:640px){.board{min-width:840px; gap:4px} .hm{min-width:560px!important; gap:4px!important}}
/* horizontal-scroll cue — shown only when the strip actually overflows */
.swipe-cue{display:none; font-family:var(--mono); font-size:.7rem; color:var(--faint);
  text-align:right; margin-top:.5rem; user-select:none; opacity:.85}
.swipe-cue.on{display:block}
.cell:focus-visible,.kpi:focus-visible,.pcard:focus-visible,.now:focus-visible,.brow:focus-visible,.rm-day:focus-visible{outline:2px solid var(--violet); outline-offset:2px; z-index:3}
.legend{display:flex; gap:1.1rem; flex-wrap:wrap; font-size:.76rem; color:var(--dim); margin-top:.9rem}
.legend span{display:inline-flex; align-items:center; gap:.4rem}
.legend i{width:11px; height:11px; border-radius:3px; display:inline-block}

/* four-track overview */
.tracks{display:grid; grid-template-columns:repeat(4,1fr); gap:1rem}
@media(max-width:900px){.tracks{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.tracks{grid-template-columns:1fr}}
.tcard{position:relative; display:flex; flex-direction:column; gap:.55rem; overflow:hidden;
  border:1px solid var(--line); border-radius:16px; padding:1.05rem 1.1rem 1.1rem 1.25rem;
  background:rgba(255,255,255,.018); cursor:pointer; transition:.16s}
.tcard:hover{transform:translateY(-3px); border-color:var(--line2)}
.tcard::before{content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--tc)}
.tcard .th{display:flex; align-items:baseline; justify-content:space-between; gap:.5rem}
.tcard .tn{font-weight:750; font-size:.98rem; letter-spacing:-.01em}
.tcard .tw{font-family:var(--mono); font-size:.68rem; color:var(--faint); white-space:nowrap}
.tcard .tp{display:flex; align-items:baseline; gap:.45rem}
.tcard .tpct{font-size:1.6rem; font-weight:800; letter-spacing:-.02em}
.tcard .tdays{font-size:.72rem; color:var(--dim)}
.tbar{height:7px; border-radius:5px; background:rgba(255,255,255,.06); overflow:hidden}
.tbar i{display:block; height:100%; border-radius:5px; background:var(--tc); transition:width .5s ease}
.tmeta{display:flex; align-items:center; justify-content:space-between; gap:.5rem}
.tpill{font-size:.62rem; font-weight:750; text-transform:uppercase; letter-spacing:.05em;
  padding:.16rem .5rem; border-radius:999px; white-space:nowrap}
.tpill.active{color:var(--tc); background:color-mix(in srgb,var(--tc) 16%,transparent)}
.tpill.done{color:var(--green); background:rgba(52,211,153,.14)}
.tpill.upcoming{color:var(--faint); background:rgba(255,255,255,.05)}
.tnotes{font-size:.7rem; color:var(--dim); font-weight:600; white-space:nowrap; align-self:flex-start; margin-top:.05rem}
.tnotes:hover{color:var(--txt)}
@keyframes flashbg{from{background:color-mix(in srgb,var(--pc) 20%,transparent)} to{background:transparent}}
.rm-phase.flash{animation:flashbg 1.5s ease; border-radius:8px}

/* projects grid */
.pgrid{display:grid; grid-template-columns:repeat(3,1fr); gap:1rem}
@media(max-width:820px){.pgrid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.pgrid{grid-template-columns:1fr}}
.pcard{border:1px solid var(--line); border-radius:16px; padding:1.1rem 1.2rem;
  background:rgba(255,255,255,.018); transition:.16s; position:relative}
.pcard:hover{transform:translateY(-3px); border-color:var(--line2)}
.pcard.up{opacity:.72}
.pcard .wk{font-size:.7rem; font-weight:700; letter-spacing:.06em; color:var(--faint)}
.pcard .nm{font-weight:650; font-size:.98rem; margin-top:.35rem; line-height:1.35}
.pcard .st{margin-top:.7rem; font-size:.74rem; display:inline-flex; align-items:center; gap:.4rem}
.pcard .st.done{color:var(--green)} .pcard .st.up{color:var(--faint)}

/* briefs */
.briefs{display:grid; gap:.5rem}
.brow{display:flex; align-items:center; gap:.75rem; padding:.65rem .8rem; border-radius:12px;
  border:1px solid var(--line); cursor:pointer; transition:.14s; background:rgba(255,255,255,.015)}
.brow:hover{border-color:var(--line2); transform:translateX(3px)}
.brow .dot{width:9px; height:9px; border-radius:3px; flex:none}
.brow .t{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.brow .d{color:var(--faint); font-size:.75rem; white-space:nowrap}
.empty{color:var(--faint); font-size:.86rem; padding:.5rem 0}

footer{margin-top:3.5rem; padding-top:1.5rem; border-top:1px solid var(--line);
  color:var(--faint); font-size:.8rem; display:flex; gap:1rem; flex-wrap:wrap; align-items:center}
footer a{color:var(--dim)} footer a:hover{color:var(--txt)}
footer .r{margin-left:auto}

/* tooltip + modal */
#tip{position:fixed; pointer-events:none; z-index:60; display:none;
  background:rgba(15,18,36,.94); backdrop-filter:blur(10px); border:1px solid var(--line2);
  border-radius:11px; padding:.5rem .75rem; font-size:.8rem; box-shadow:0 14px 36px rgba(0,0,0,.55); max-width:280px}
#tip .w{color:var(--faint); font-size:.72rem}
#overlay{position:fixed; inset:0; z-index:80; display:none; background:rgba(4,5,14,.7);
  backdrop-filter:blur(6px); align-items:flex-start; justify-content:center; overflow-y:auto; padding:5vh 1rem 4vh}
#overlay.open{display:flex}
#modal{width:min(720px,100%); border-radius:20px; overflow:hidden;
  background:linear-gradient(170deg,var(--card2),var(--card)); border:1px solid var(--line2);
  box-shadow:0 30px 90px rgba(0,0,0,.6); animation:pop .28s cubic-bezier(.2,.9,.3,1.2) both}
@keyframes pop{from{opacity:0;transform:scale(.95) translateY(12px)}}
.m-head{padding:1.25rem 1.5rem 1rem; position:relative;
  background:linear-gradient(140deg,rgba(99,102,241,.22),transparent 70%)}
.m-head .ttl{font-size:1.2rem; font-weight:750; padding-right:2rem}
#m-close{position:absolute; top:.9rem; right:.9rem; width:30px; height:30px; border-radius:9px;
  border:1px solid var(--line2); background:rgba(255,255,255,.05); color:var(--dim); font-size:.95rem}
#m-close:hover{color:var(--txt)}
.m-body{padding:1.25rem 1.5rem 1.75rem; max-height:70vh; overflow-y:auto; line-height:1.7}
.m-body h3{font-size:1.1rem; margin:1.2rem 0 .5rem} .m-body h4{font-size:.98rem; color:var(--dim); margin:1rem 0 .4rem}
.m-body p{margin:.55rem 0; color:#dfe4f5} .m-body ul{margin:.5rem 0 .5rem 1.2rem} .m-body li{margin:.25rem 0; color:#dfe4f5}
.m-body code{font-family:var(--mono); font-size:.86em; background:rgba(255,255,255,.07); padding:.1rem .35rem; border-radius:5px}
.m-body strong{color:#fff} .m-body .loading{color:var(--faint)}

.reveal{opacity:0; transform:translateY(16px)} .in{animation:fadeUp .6s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){*,::before,::after{animation:none!important;transition:none!important}.reveal{opacity:1;transform:none}}

/* roadmap browser */
.rm-phase{margin:1.4rem 0 .5rem;display:flex;align-items:center;gap:.7rem}
.rm-phase:first-child{margin-top:.2rem}
.rm-pname{font-family:var(--mono);font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--pc)}
.rm-phase::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,color-mix(in srgb,var(--pc) 45%,transparent),transparent)}
.rm-week{border:1px solid var(--line);border-radius:10px;margin:.35rem 0;background:rgba(255,255,255,.015);overflow:hidden}
.rm-week>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:.7rem;padding:.6rem .85rem}
.rm-week>summary::-webkit-details-marker{display:none}
.rm-week>summary:hover{background:rgba(255,255,255,.03)}
.rm-week[open]>summary{border-bottom:1px solid var(--line)}
.rm-wn{font-family:var(--mono);font-size:.74rem;font-weight:700;color:var(--dim)}
.rm-theme{flex:1;font-weight:600;font-size:.92rem;letter-spacing:-.01em}
.rm-count{font-family:var(--mono);font-size:.72rem;color:var(--green)}
.rm-days{padding:.3rem .5rem .55rem}
.rm-day{display:flex;align-items:center;gap:.6rem;padding:.4rem .55rem;border-radius:8px;cursor:pointer;transition:background .12s}
.rm-day:hover{background:rgba(255,255,255,.05)}
.rm-dl{font-family:var(--mono);font-size:.68rem;color:var(--faint);width:26px;flex:none}
.rm-dot{width:8px;height:8px;border-radius:2px;flex:none}
.rm-dt{font-size:.86rem;color:var(--dim)}
.rm-day.done .rm-dt{color:var(--txt)}
.rm-meta{font-family:var(--mono);font-size:.72rem;color:var(--faint);margin-bottom:.7rem}
.rm-mastery{margin-top:1rem;padding:.75rem .9rem;border-radius:10px;border:1px solid var(--line2);background:rgba(255,255,255,.03);font-size:.9rem;line-height:1.6}

/* consistency + status */
.hstat{font-size:.68rem;font-weight:700;letter-spacing:0;padding:.16rem .6rem;border-radius:999px;margin-left:.6rem;text-transform:none;white-space:nowrap;display:inline-block;vertical-align:middle}
.hstat.ok{color:var(--green);background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.4)}
.hstat.behind{color:var(--build);background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.42)}
.cons-top{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.4rem}
@media(max-width:560px){.cons-top{grid-template-columns:1fr}}
.cstat{display:flex;align-items:center;gap:.85rem;padding:.95rem 1.15rem;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.02);transition:transform .16s,border-color .16s}
.cstat:hover{border-color:var(--line2)}
.cstat .ci{font-size:1.55rem;line-height:1}
.cstat .cv{font-size:1.5rem;font-weight:800;letter-spacing:-.02em;line-height:1}
.cstat .cl{color:var(--faint);font-size:.74rem;margin-top:.2rem}
.hm-wrap{overflow-x:auto;padding-bottom:.4rem;-webkit-overflow-scrolling:touch}
.hm{display:grid;grid-template-rows:repeat(7,1fr);grid-auto-flow:column;grid-auto-columns:1fr;gap:3px;min-width:480px}
.hc{aspect-ratio:1;border-radius:4px;background:transparent;transition:transform .1s}
.hc.f:hover{transform:scale(1.35);box-shadow:0 0 0 2px var(--line2)}
.hm-legend{display:flex;gap:1.1rem;flex-wrap:wrap;font-size:.75rem;color:var(--dim);margin-top:.85rem}
.hm-legend span{display:inline-flex;align-items:center;gap:.4rem}
.hm-legend i{width:11px;height:11px;border-radius:3px;display:inline-block}
.lock-note{margin-top:.9rem;display:inline-flex;align-items:center;gap:.5rem;font-size:.82rem;color:var(--build);background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);border-radius:10px;padding:.45rem .8rem}

/* projects */
.proj-head{display:flex;align-items:center;gap:1rem;margin:2.75rem 0 1rem;flex-wrap:wrap}
.proj-head h2{font-size:1.3rem;font-weight:750;letter-spacing:-.02em}
.proj-head .sub{color:var(--faint);font-size:.8rem}
.edit-btn{margin-left:auto;font-size:.76rem;color:var(--dim);background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:9px;padding:.35rem .8rem;cursor:pointer;transition:.15s;white-space:nowrap}
.edit-btn:hover{color:var(--txt);border-color:var(--line2)}
.edit-btn.on{color:var(--green);border-color:rgba(52,211,153,.4);background:rgba(52,211,153,.08)}
.sub-min{font-family:var(--mono);font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:.4rem 0 .8rem}
.pgrid-c{display:grid;grid-template-columns:repeat(4,1fr);gap:.7rem}
@media(max-width:820px){.pgrid-c{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.pgrid-c{grid-template-columns:1fr}}
.pgrid-c .pcard{padding:.85rem .95rem}
.pflag{position:absolute;top:.6rem;right:.7rem;color:var(--amber);font-size:.9rem}
.pdesc{color:var(--dim);font-size:.82rem;margin-top:.45rem;line-height:1.45}
.chips{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.6rem}
.chip{font-size:.68rem;color:var(--dim);background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:6px;padding:.12rem .45rem;white-space:nowrap}
.pfoot{display:flex;align-items:center;gap:.6rem;margin-top:.75rem;flex-wrap:wrap}
.pstatus{font-size:.68rem;font-weight:700;border-radius:999px;padding:.15rem .55rem;white-space:nowrap}
.pstatus.built{color:var(--green);background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.35)}
.pstatus.studied{color:var(--amber);background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.32)}
.pstatus.planned{color:var(--faint);background:rgba(255,255,255,.04);border:1px solid var(--line)}
.plink{font-size:.72rem;color:var(--blue);font-weight:600;text-decoration:none}
.plink:hover{text-decoration:underline}
.plink.big{padding:.55rem 1rem;border:1px solid var(--line2);border-radius:10px;background:rgba(96,165,250,.08)}
.p-links{display:flex;gap:.6rem;margin:1rem 0;flex-wrap:wrap}
.p-demo{font-style:italic;color:var(--txt);border-left:3px solid var(--amber);padding-left:.8rem;margin:.6rem 0 1rem;line-height:1.5}
.p-edit{margin:1.2rem 0;padding:1rem;border:1px dashed var(--line2);border-radius:12px;background:rgba(255,255,255,.02)}
.p-edit-h{font-size:.75rem;font-weight:700;color:var(--dim);margin-bottom:.6rem}
.p-input{width:100%;background:#0d1122;color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:.5rem .7rem;font:inherit;font-size:.85rem;margin-bottom:.5rem;outline:none}
.p-input:focus{border-color:var(--violet)}
.p-edit-row{display:flex;align-items:center;gap:.7rem}
.p-save{background:linear-gradient(90deg,#6366f1,#a855f7);color:#fff;border:0;border-radius:9px;padding:.5rem 1.1rem;font-weight:650;cursor:pointer}
.p-save:disabled{opacity:.55;cursor:wait}
.p-msg{font-size:.8rem;color:var(--faint)}
.p-spec{margin-top:1.3rem}
.p-spec-h{font-size:.72rem;font-weight:700;color:var(--dim);margin-bottom:.75rem;text-transform:uppercase;letter-spacing:.06em}
.steps{display:flex;flex-direction:column;gap:.9rem}
.step{display:flex;gap:.8rem;align-items:flex-start}
.step-n{flex:none;width:1.55rem;height:1.55rem;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
  font-size:.74rem;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--violet),#a855f7);margin-top:.1rem}
.step-t{font-size:.92rem;line-height:1.62;color:var(--dim)}

/* owner check-in bar */
.owner-bar{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin:1.2rem 0;padding:.75rem 1.1rem;border:1px solid rgba(52,211,153,.35);background:rgba(52,211,153,.06);border-radius:12px}
.owner-bar .ob-l{font-size:.88rem;color:var(--txt)}
.owner-bar .ob-btn{margin-left:auto;background:linear-gradient(90deg,#34d399,#10b981);color:#04120c;border:0;border-radius:9px;padding:.5rem 1.1rem;font-weight:750;cursor:pointer}
.owner-bar .ob-btn:hover{filter:brightness(1.06)}
.owner-bar .ob-btn:disabled{opacity:.6;cursor:wait}
</style></head><body>

<header>
  <div class="brand">📚 <b>Jayanth</b> <span>· learning in public</span></div>
  <nav>
    <a href="https://github.com/astroboy1183" target="_blank" rel="noopener">GitHub</a>
    <a href="https://www.linkedin.com/in/jayanth-appalla" target="_blank" rel="noopener">LinkedIn</a>
    <a href="https://jayanthappalla.com" target="_blank" rel="noopener">Portfolio</a>
  </nav>
</header>

<div class="wrap">
  <section class="hero">
    <div class="hero-l">
      <div class="eyebrow">62-Week Mastery Roadmap <span id="hero-status" class="hstat"></span></div>
      <h1>Jayanth Appalla</h1>
      <div class="role">Data &amp; AI Engineer</div>
      <p class="tagline">A 434-day climb through data engineering, machine learning, AI, and
        Linux systems — studied and shipped in public, one day at a time.</p>
      <div class="creds">ex-AWS DynamoDB · Data Engineer @ trigyan.io · MS CS, UIC · Databricks + Fabric certified</div>
      <div class="links">
        <a class="primary" href="https://github.com/astroboy1183" target="_blank" rel="noopener">⚡ GitHub</a>
        <a href="https://github.com/astroboy1183/study-agent" target="_blank" rel="noopener">⚙ Source</a>
        <a href="https://www.linkedin.com/in/jayanth-appalla" target="_blank" rel="noopener">in LinkedIn</a>
        <a href="https://jayanthappalla.com" target="_blank" rel="noopener">↗ Portfolio</a>
      </div>
    </div>
    <div class="hero-r ring-card">
      <div class="ring" id="ring"></div>
      <div class="ring-stats" id="ring-stats"></div>
    </div>
  </section>

  <div class="kpis reveal" id="kpis"></div>
  <div id="owner-bar"></div>

  <div class="sec reveal"><h2>🧭 The four tracks</h2><span class="sub">progress by domain · click a track to jump to its weeks</span></div>
  <div class="tracks reveal" id="tracks"></div>

  <div class="sec reveal"><h2>🔨 Current build</h2><span class="sub">the deep-build project for this week</span></div>
  <div class="card now reveal" id="now"></div>

  <div class="proj-head reveal"><h2>🚀 Projects</h2><span class="sub" id="proj-sub"></span><button id="edit-toggle" class="edit-btn">✎ Edit links</button></div>
  <div class="sub-min reveal">★ Featured — the pieces you'd headline</div>
  <div id="featured" class="pgrid reveal"></div>
  <div class="sub-min reveal" style="margin-top:1.7rem">All builds</div>
  <div id="all-projects" class="pgrid-c reveal"></div>

  <div class="sec reveal"><h2>🔥 Consistency</h2><span class="sub">show up daily — a rest day counts, a silent miss doesn't</span></div>
  <div class="card reveal" id="consistency"></div>

  <div class="sec reveal"><h2>The year</h2><span class="sub">every day of the plan · colored by type · click any box to open that day (⬜ outline = today)</span></div>
  <div class="card reveal">
    <div class="board-wrap"><div class="board" id="board"></div></div>
    <div class="swipe-cue" id="board-cue" aria-hidden="true"></div>
    <div class="legend">
      <span><i style="background:var(--theory)"></i>theory</span>
      <span><i style="background:var(--build)"></i>build</span>
      <span><i style="background:var(--consolidate)"></i>consolidate</span>
      <span><i style="background:rgba(255,255,255,.14)"></i>partial</span>
      <span><i style="background:rgba(255,255,255,.045)"></i>to go</span>
    </div>
  </div>

  <div class="sec reveal"><h2>Balance</h2><span class="sub">theory on weekdays · builds &amp; consolidations on weekends</span></div>
  <div class="meters reveal" id="meters"></div>

  <div class="sec reveal"><h2>📚 The roadmap</h2><span class="sub">all 62 weeks · click any day for its concept, video &amp; coding rep</span></div>
  <div class="card reveal"><div id="roadmap"></div></div>

  <div class="sec reveal"><h2>📘 Study briefs</h2><span class="sub">a deep recap written for every completed day</span></div>
  <div class="card reveal"><div class="briefs" id="briefs"></div></div>

  <footer>
    <span>Live &amp; auto-updating · built on a single Cloudflare Worker (zero servers) · <a href="https://github.com/astroboy1183/study-agent" target="_blank" rel="noopener">source on GitHub ↗</a></span>
    <span class="r" id="foot-updated"></span>
  </footer>
</div>

<div id="tip"></div>
<div id="overlay"><div id="modal"></div></div>

<script>
"use strict";
var $ = function(id){ return document.getElementById(id); };
var TYPE_COLOR = { theory:"var(--theory)", build:"var(--build)", consolidate:"var(--consolidate)" };
var DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
var DATA = null;
var EDIT_KEY = (function(){ try{ return localStorage.getItem("study_edit_key")||""; }catch(e){ return ""; } })();
function refresh(){ fetch("/api/state?bust="+Date.now(),{cache:"no-store"}).then(function(r){ return r.json(); }).then(render); }

fetch("/api/state").then(function(r){ return r.json(); }).then(render).catch(function(){
  $("now").innerHTML = "<div class='empty'>Couldn't load progress right now — refresh in a moment.</div>";
});

function el(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls;
  if(txt!==undefined) e.textContent=txt; return e; }
function pad(n){ return (n<10?"0":"")+n; }
function prettyDate(s){ if(!s) return "—"; var d=new Date(s+"T12:00:00");
  return d.toLocaleDateString("en",{day:"numeric",month:"short",year:"numeric"}); }
function reveals(){ var n=document.querySelectorAll(".reveal"); var d=0;
  n.forEach(function(x){ setTimeout(function(){ x.classList.add("in"); }, d); d+=55; }); }

var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
/* make an element behave like a button: pointer, click, and (unless noTab) keyboard + focus */
function clickable(el, fn, noTab){
  el.setAttribute("role","button"); el.style.cursor="pointer";
  el.addEventListener("click", fn);
  if(!noTab){ el.tabIndex=0;
    el.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); fn(); } }); }
  return el;
}
function scrollToId(id){ var e=$(id); if(e) e.scrollIntoView({behavior: REDUCED?"auto":"smooth", block:"center"}); }
function countUp(el, target){
  if(REDUCED || typeof target!=="number"){ el.textContent=String(target); return; }
  var start=null;
  requestAnimationFrame(function tick(t){ if(start===null) start=t;
    var k=Math.min(1,(t-start)/700), e=1-Math.pow(1-k,3);
    el.textContent=String(Math.round(target*e)); if(k<1) requestAnimationFrame(tick); });
}
function faintType(t){ return "color-mix(in srgb, var(--"+t+") 16%, rgba(255,255,255,.03))"; }

function render(s){
  DATA=s;
  drawRing(s.pct, s.done, s.total);
  var rs=$("ring-stats"); rs.replaceChildren();
  rs.appendChild(stat(s.projects.total, "projects"));
  rs.appendChild(stat(s.weeks, "weeks"));
  rs.appendChild(stat("4", "domains"));
  var hp=$("hero-status");
  if(hp){ if(s.backlog){ hp.className="hstat behind"; hp.textContent="● "+s.backlog+" behind"; }
    else { hp.className="hstat ok"; hp.textContent="● On track"; } }
  renderOwnerBar(s);
  renderTracks(s);

  var kp=$("kpis"); kp.replaceChildren();
  kp.appendChild(kpi(s.done, "days completed", "board"));
  kp.appendChild(kpi(s.pct.toFixed(1)+"%", "of the roadmap", "roadmap"));
  kp.appendChild(kpi(s.byType.theory.done, "theory topics", "meters"));
  kp.appendChild(kpi(s.projects.built, "builds built", "featured"));

  /* now building */
  var now=$("now"); now.replaceChildren();
  if(s.projects.current){
    var c=s.projects.current;
    var b=el("span","badge"); b.appendChild(el("span","dot"));
    b.appendChild(document.createTextNode(c.locked ? "Up next" : (c.status==="in_progress"?"Now building":"Up next")));
    now.appendChild(b);
    now.appendChild(el("h3", null, c.name));
    now.appendChild(el("p", null, c.blurb));
    var wm=(s.weeksMeta||[]).find(function(w){return w.n===c.week;});
    now.appendChild(el("div","meta","Week "+c.week+" of "+s.weeks+(wm?" · "+wm.phase:"")+" · deep-build project"));
    if(c.locked){ var ln=el("div","lock-note");
      ln.textContent="🔒 Unlocks after "+c.theoryLeft+" more theory topic"+(c.theoryLeft!==1?"s":"")+" this week.";
      now.appendChild(ln); }
    now.appendChild(el("div","hint","↗ Open the full build plan"));
    clickable(now, function(){ openUnit(c.id); });
  } else {
    now.appendChild(el("div","empty","🎉 All 62 build projects shipped — roadmap complete."));
  }

  renderConsistency(s);

  /* board */
  var bd=$("board"); bd.replaceChildren();
  var todayId = s.current ? s.current.id : 0;
  s.board.forEach(function(wk){ wk.cells.forEach(function(c){
    var cell=el("div","cell "+c.status);
    if(c.id===todayId) cell.classList.add("today");
    if(c.status==="done") cell.style.background=TYPE_COLOR[c.type];
    else if(c.status==="partial") cell.style.background="repeating-linear-gradient(45deg,"+solid(c.type)+","+solid(c.type)+" 3px,rgba(255,255,255,.05) 3px,rgba(255,255,255,.05) 6px)";
    else cell.style.background=faintType(c.type);
    var label="W"+pad(wk.week)+" · "+DOW[c.dow]+" · Day "+c.id+"\\n"+c.title+(c.status==="done"?"  ✓":c.status==="partial"?"  ◐":"");
    cell.setAttribute("aria-label", "Day "+c.id+" — "+c.title);
    cell.addEventListener("pointerenter", function(e){ showTip(e,label); });
    cell.addEventListener("pointermove", moveTip);
    cell.addEventListener("pointerleave", hideTip);
    clickable(cell, function(){ if(c.status==="done") openBrief(c.id); else openUnit(c.id); }, true);
    bd.appendChild(cell);
  }); });

  /* meters */
  var mt=$("meters"); mt.replaceChildren();
  ["theory","build","consolidate"].forEach(function(t){
    var d=s.byType[t]; var pv=d.total?Math.round(d.done/d.total*100):0;
    var card=el("div","card meter"); var top=el("div","top");
    top.appendChild(el("span","nm", t[0].toUpperCase()+t.slice(1)));
    top.appendChild(el("span","fr", d.done+"/"+d.total+" · "+pv+"%"));
    var mb=el("div","mbar"); var i=el("i"); i.style.width=pv+"%"; i.style.background="var(--"+t+")"; mb.appendChild(i);
    card.appendChild(top); card.appendChild(mb); mt.appendChild(card);
  });

  renderProjects(s);

  /* briefs */
  var br=$("briefs"); br.replaceChildren();
  if(!s.briefs.length) br.appendChild(el("div","empty","📘 Every completed day earns a deep, written study brief here — a growing, searchable knowledge base of everything learned along the way."));
  s.briefs.slice(0,60).forEach(function(b){
    var row=el("div","brow");
    var dot=el("span","dot"); dot.style.background="var(--"+b.type+")";
    row.appendChild(dot);
    row.appendChild(el("span","t","Day "+b.id+" — "+b.title));
    row.appendChild(el("span","d", prettyDate(b.date)));
    row.appendChild(el("span","d","›"));
    clickable(row, function(){ openBrief(b.id); });
    br.appendChild(row);
  });

  renderRoadmap(s);

  $("foot-updated").textContent = "updated "+new Date(s.updated).toLocaleDateString("en",{day:"numeric",month:"short",year:"numeric"});
  reveals();
  requestAnimationFrame(updateScrollCues);
}

/* horizontal-scroll cues — shown only when a strip actually overflows, hidden once scrolled to the end */
function setCue(wrap, cue, label){
  if(!wrap || !cue) return;
  var apply=function(){
    var over=(wrap.scrollWidth - wrap.clientWidth - wrap.scrollLeft) > 6;
    cue.textContent=label; cue.classList.toggle("on", over);
  };
  if(!wrap.__cueWired){ wrap.addEventListener("scroll", apply, {passive:true}); wrap.__cueWired=true; }
  apply();
}
function updateScrollCues(){
  var bd=$("board"); if(bd) setCue(bd.parentNode, $("board-cue"), "scroll for all 62 weeks →");
  var hm=document.querySelector(".hm-wrap"); var hc=$("hm-cue");
  if(hm && hc) setCue(hm, hc, "scroll for full history →");
}
window.addEventListener("resize", updateScrollCues);

/* four-track overview */
var TRACK_META={
  "Data Engineering":{c:"var(--build)",repo:"de-notes"},
  "Data Science & ML":{c:"var(--consolidate)",repo:"ml-notes"},
  "Deep Learning & AI":{c:"var(--pink)",repo:"ai-notes"},
  "Linux & Systems":{c:"var(--teal)",repo:"linux-notes"}
};
function phaseSlug(n){ return "phase-"+n.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function renderTracks(s){
  var c=$("tracks"); if(!c) return; c.replaceChildren();
  (s.tracks||[]).forEach(function(t){
    var m=TRACK_META[t.name]||{c:"var(--blue)",repo:""};
    var card=el("div","tcard"); card.style.setProperty("--tc", m.c);
    card.setAttribute("aria-label", t.name+" — "+Math.round(t.pct)+"% complete, click for its weeks");
    var th=el("div","th"); th.appendChild(el("span","tn",t.name)); th.appendChild(el("span","tw","W"+t.lo+"–"+t.hi)); card.appendChild(th);
    var tp=el("div","tp"); tp.appendChild(el("span","tpct",Math.round(t.pct)+"%")); tp.appendChild(el("span","tdays",t.done+" / "+t.total+" days")); card.appendChild(tp);
    var bar=el("div","tbar"); var fill=el("i"); fill.style.width=(t.done?Math.max(t.pct,2):0)+"%"; bar.appendChild(fill); card.appendChild(bar);
    var meta=el("div","tmeta");
    var label=t.status==="done"?"Complete":t.status==="active"?"In progress":"Upcoming";
    meta.appendChild(el("span","tpill "+t.status, label));
    meta.appendChild(el("span","tdays", t.builds.done+"/"+t.builds.total+" builds")); card.appendChild(meta);
    if(m.repo){
      var a=document.createElement("a"); a.className="tnotes"; a.href="https://github.com/astroboy1183/"+m.repo;
      a.target="_blank"; a.rel="noopener"; a.textContent="📓 Notes ↗";
      a.addEventListener("click", function(e){ e.stopPropagation(); });
      card.appendChild(a);
    }
    clickable(card, function(){ goToPhase(t.name); });
    c.appendChild(card);
  });
}
function goToPhase(name){
  var target=document.getElementById(phaseSlug(name));
  if(!target) return;
  target.scrollIntoView({behavior:"smooth", block:"start"});
  target.classList.remove("flash"); void target.offsetWidth; target.classList.add("flash");
}

/* roadmap browser */
var PHASE_COLOR={"Data Engineering":"var(--build)","Data Science & ML":"var(--consolidate)","Deep Learning & AI":"var(--pink)","Linux & Systems":"var(--teal)"};
function renderRoadmap(s){
  var rm=$("roadmap"); if(!rm) return; rm.replaceChildren();
  var byWeek={}; (s.board||[]).forEach(function(wk){ byWeek[wk.week]=wk.cells; });
  var cur=null;
  (s.weeksMeta||[]).forEach(function(w){
    if(w.phase!==cur){ cur=w.phase;
      var ph=el("div","rm-phase"); ph.id=phaseSlug(w.phase); ph.style.setProperty("--pc", PHASE_COLOR[w.phase]||"var(--blue)");
      ph.appendChild(el("span","rm-pname", w.phase)); rm.appendChild(ph); }
    var cells=byWeek[w.n]||[];
    var doneN=cells.filter(function(c){return c.status==="done";}).length;
    var det=document.createElement("details"); det.className="rm-week";
    var sum=document.createElement("summary");
    sum.appendChild(el("span","rm-wn","W"+pad(w.n)));
    sum.appendChild(el("span","rm-theme", w.title));
    sum.appendChild(el("span","rm-count", doneN?doneN+"/7":""));
    det.appendChild(sum);
    var days=el("div","rm-days");
    cells.forEach(function(c){
      var row=el("div","rm-day"+(c.status==="done"?" done":""));
      row.appendChild(el("span","rm-dl", DOW[c.dow]));
      var dot=el("span","rm-dot"); dot.style.background="var(--"+c.type+")"; row.appendChild(dot);
      row.appendChild(el("span","rm-dt", c.title));
      clickable(row, function(){ openUnit(c.id); });
      days.appendChild(row);
    });
    det.appendChild(days); rm.appendChild(det);
  });
}
function openUnit(id){
  overlay.classList.add("open"); $("modal").replaceChildren(shell("Day "+id,"loading…"));
  fetch("/api/unit/"+id).then(function(r){ return r.json(); }).then(function(d){
    var body=el("div","m-body"); body.innerHTML=unitHtml(d);
    var m=$("modal"); m.replaceChildren(); m.appendChild(head("Day "+d.id+" — "+d.title)); m.appendChild(body);
  }).catch(function(){ $("modal").replaceChildren(shell("Day "+id,"Couldn't load that day.")); });
}
// Build specs are stored as "[Block A] … [Block B] … [Block C] …" — render them
// as clean numbered steps instead of raw "Block A/B/C" labels.
function stepsHtml(text){
  var parts=(text||"").split(/\\[Block [A-Z]\\]/).map(function(s){ return s.trim(); }).filter(Boolean);
  if(parts.length<2) return "<p style='line-height:1.7'>"+esc(text||"")+"</p>";
  return "<div class='steps'>"+parts.map(function(p,i){
    return "<div class='step'><span class='step-n'>"+(i+1)+"</span><span class='step-t'>"+esc(p)+"</span></div>";
  }).join("")+"</div>";
}
function unitHtml(d){
  var out="<div class='rm-meta'>Week "+d.week+" · "+DOW[d.dow]+" · "+d.type+" · Day "+d.id+"</div>";
  if(/\\[Block [A-Z]\\]/.test(d.text||"")){
    out+=stepsHtml(d.text);
  } else {
    var t=esc(d.text)
      .replace(/🎥 Watch:/g,"<b>🎥 Watch:</b>")
      .replace(/💻 Code:/g,"<b>💻 Code:</b>")
      .replace(/\\n/g,"<br>");
    out+="<p style='line-height:1.75'>"+t+"</p>";
  }
  if(d.mastery) out+="<div class='rm-mastery'>🎯 <b>Mastery (answer aloud):</b> "+esc(d.mastery)+"</div>";
  return out;
}

/* consistency (attendance heatmap) */
var PRES_COLOR={done:"var(--green)",on:"color-mix(in srgb,var(--green) 55%,transparent)",partial:"var(--build)",off:"var(--blue)",missed:"rgba(251,113,133,.32)"};
var PRES_LABEL={done:"studied ✓",on:"showed up",partial:"partial",off:"rest day",missed:"missed"};
function cstat(icon,val,lab){ var d=el("div","cstat"); d.appendChild(el("div","ci",icon));
  var r=document.createElement("div"); r.appendChild(el("div","cv",String(val))); r.appendChild(el("div","cl",lab)); d.appendChild(r); return d; }
function renderConsistency(s){
  var c=$("consistency"); if(!c) return; c.replaceChildren();
  var top=el("div","cons-top");
  var hstreak=(s.honestStreak!==undefined?s.honestStreak:s.streak);
  top.appendChild(cstat("🔥", hstreak, "day show-up streak"));
  top.appendChild(cstat("✅", s.done, "days completed"));
  var bl=s.backlog||0;
  top.appendChild(cstat(bl?"📌":"🎯", bl?String(bl):"On track", bl?("topic"+(bl!==1?"s":"")+" to catch up"):"nothing owed"));
  c.appendChild(top);
  var pres=s.presence||[];
  if(!pres.length){ c.appendChild(el("div","empty","🔥 A daily attendance heatmap and a show-up streak appear here — consistency rewarded: a planned rest day keeps the streak, only a silent miss breaks it.")); return; }
  var pad=(new Date(pres[0].date+"T00:00:00Z").getUTCDay()+6)%7;
  var grid=el("div","hm");
  for(var i=0;i<pad;i++) grid.appendChild(el("div","hc"));
  pres.forEach(function(p){
    var cell=el("div","hc f"); cell.style.background=PRES_COLOR[p.status]||"rgba(255,255,255,.04)";
    var lab=prettyDate(p.date)+" · "+(PRES_LABEL[p.status]||p.status);
    cell.addEventListener("pointerenter", function(e){ showTip(e,lab); });
    cell.addEventListener("pointermove", moveTip);
    cell.addEventListener("pointerleave", hideTip);
    grid.appendChild(cell);
  });
  var wrap=el("div","hm-wrap"); wrap.appendChild(grid); c.appendChild(wrap);
  var cue=el("div","swipe-cue"); cue.id="hm-cue"; cue.setAttribute("aria-hidden","true"); c.appendChild(cue);
  var lg=el("div","hm-legend");
  [["var(--green)","studied"],["var(--build)","partial"],["var(--blue)","rest day"],["rgba(251,113,133,.32)","missed"]].forEach(function(x){
    var sp=document.createElement("span"); var ic=document.createElement("i"); ic.style.background=x[0];
    sp.appendChild(ic); sp.appendChild(document.createTextNode(x[1])); lg.appendChild(sp);
  });
  c.appendChild(lg);
}

/* projects: featured strip + full grid, richer modal, owner edit-mode */
function statusLabel(st){ return st==="built"?"✓ Built":st==="studied"?"◐ Studied":"Planned"; }
function renderProjects(s){
  var pr=s.projects;
  $("proj-sub").textContent = pr.built+" built · "+pr.studied+" studied · "+pr.total+" projects";
  var feat=$("featured"); feat.replaceChildren();
  if(!pr.featured.length) feat.appendChild(el("div","empty","No featured projects yet."));
  pr.featured.forEach(function(p){ feat.appendChild(projectCard(p, true)); });
  var all=$("all-projects"); all.replaceChildren();
  pr.all.forEach(function(p){ all.appendChild(projectCard(p, false)); });
}
function projectCard(p, big){
  var c=el("div","pcard"+(p.status==="planned"?" up":""));
  if(p.flag) c.appendChild(el("span","pflag","★"));
  c.appendChild(el("div","wk", p.week ? "WEEK "+pad(p.week) : "SHOWCASE"));
  c.appendChild(el("div","nm", p.name));
  if(big) c.appendChild(el("div","pdesc", p.demo||p.blurb));
  if(p.tech && p.tech.length){ var tw=el("div","chips");
    p.tech.slice(0, big?5:3).forEach(function(t){ tw.appendChild(el("span","chip", t)); });
    c.appendChild(tw); }
  var foot=el("div","pfoot");
  var st=el("span","pstatus "+p.status); st.textContent=statusLabel(p.status); foot.appendChild(st);
  if(p.repo){ var a=el("a","plink"); a.href=p.repo; a.target="_blank"; a.rel="noopener"; a.textContent="↗ Code";
    a.addEventListener("click", function(e){ e.stopPropagation(); }); foot.appendChild(a); }
  if(p.demoUrl){ var d=el("a","plink"); d.href=p.demoUrl; d.target="_blank"; d.rel="noopener"; d.textContent="▶ Demo";
    d.addEventListener("click", function(e){ e.stopPropagation(); }); foot.appendChild(d); }
  c.appendChild(foot);
  clickable(c, function(){ openProject(p); });
  return c;
}
function openProject(p){
  overlay.classList.add("open");
  var m=$("modal"); m.replaceChildren(); m.appendChild(head(p.name));
  var body=el("div","m-body");
  body.appendChild(el("div","rm-meta","Week "+p.week+" · "+statusLabel(p.status)+(p.flag?" · ★ Featured":"")));
  if(p.demo){ var dm=el("div","p-demo"); dm.textContent="“"+p.demo+"”"; body.appendChild(dm); }
  // Weekly builds derive their blurb from the spec's first step, so it would duplicate the
  // steps below — only show a standalone summary for showcase projects, or when there's no demo.
  if(p.blurb && (p.showcase || !p.demo)) body.appendChild(el("p", null, p.blurb));
  if(p.tech && p.tech.length){ var tw=el("div","chips"); p.tech.forEach(function(t){ tw.appendChild(el("span","chip",t)); }); body.appendChild(tw); }
  if(p.repo||p.demoUrl){ var lr=el("div","p-links");
    if(p.repo){ var a=el("a","plink big"); a.href=p.repo; a.target="_blank"; a.rel="noopener"; a.textContent="↗ View code"; lr.appendChild(a); }
    if(p.demoUrl){ var d=el("a","plink big"); d.href=p.demoUrl; d.target="_blank"; d.rel="noopener"; d.textContent="▶ Live demo"; lr.appendChild(d); }
    body.appendChild(lr); }
  if(EDIT_KEY){
    var ed=el("div","p-edit"); ed.appendChild(el("div","p-edit-h","Attach links (owner only)"));
    var ri=document.createElement("input"); ri.type="url"; ri.className="p-input"; ri.placeholder="GitHub repo URL"; ri.value=p.repo||"";
    var di=document.createElement("input"); di.type="url"; di.className="p-input"; di.placeholder="Live demo URL (optional)"; di.value=p.demoUrl||"";
    ed.appendChild(ri); ed.appendChild(di);
    var row=el("div","p-edit-row"); var sv=document.createElement("button"); sv.className="p-save"; sv.textContent="Save";
    var msg=el("span","p-msg","");
    sv.addEventListener("click", function(){
      sv.disabled=true; msg.textContent="saving…";
      fetch("/api/project",{method:"POST",headers:{"content-type":"application/json","x-study-key":EDIT_KEY},
        body:JSON.stringify({id:p.id,repo:ri.value.trim(),demo:di.value.trim()})})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(){ msg.textContent="saved ✓ — updating"; sv.disabled=false; refresh(); })
      .catch(function(){ msg.textContent="failed — is the passphrase right?"; sv.disabled=false; });
    });
    row.appendChild(sv); row.appendChild(msg); ed.appendChild(row); body.appendChild(ed);
  }
  if(!p.showcase){
    var spec=el("div","p-spec"); spec.appendChild(el("div","p-spec-h","How you'll build it")); var sb=el("div","loading","loading…"); spec.appendChild(sb); body.appendChild(spec);
    fetch("/api/unit/"+p.id).then(function(r){ return r.json(); }).then(function(d){
      sb.className=""; sb.innerHTML=stepsHtml(d.text);
    }).catch(function(){ sb.className=""; sb.textContent="Couldn't load the spec."; });
  }
  m.appendChild(body);
}
function setEdit(on){ var b=$("edit-toggle"); if(!b) return; b.textContent=on?"✓ Editing — click to lock":"✎ Edit links"; b.classList.toggle("on", on); renderOwnerBar(DATA); }

/* owner-only "I studied today" check-in — writes the note + pushes to the track repo */
function renderOwnerBar(s){
  var ob=$("owner-bar"); if(!ob) return; ob.replaceChildren();
  if(!EDIT_KEY || !s || !s.current) return;
  var bar=el("div","owner-bar");
  bar.appendChild(el("span","ob-l","\u{1F4CC} Today · Day "+s.current.id+" — "+s.current.title));
  var btn=el("button","ob-btn","✓ I studied it");
  btn.addEventListener("click", function(){ markStudied(btn); });
  bar.appendChild(btn);
  ob.appendChild(bar);
}
function markStudied(btn){
  if(!EDIT_KEY) return;
  if(!confirm("Mark today's unit as studied?\\n\\nThis writes a deep-dive note and pushes it to the track's GitHub repo.")) return;
  btn.disabled=true; btn.textContent="Saving…";
  fetch("/api/checkin",{method:"POST",headers:{"x-study-key":EDIT_KEY,"content-type":"application/json"},body:"{}"})
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.ok){ alert("✓ Day "+d.day+" marked studied.\\nThe note is being written and pushed to GitHub (~30s)."); setTimeout(refresh, 3500); }
      else { alert(d.msg||"Nothing to mark today."); btn.disabled=false; btn.textContent="✓ I studied it"; }
    })
    .catch(function(){ alert("Failed — check the passphrase and try again."); btn.disabled=false; btn.textContent="✓ I studied it"; });
}
var edb=$("edit-toggle");
if(edb){
  edb.addEventListener("click", function(){
    if(EDIT_KEY){ EDIT_KEY=""; try{localStorage.removeItem("study_edit_key");}catch(e){} setEdit(false); if(DATA) renderProjects(DATA); return; }
    var key=prompt("Owner passphrase to edit project links:"); if(!key) return; key=key.trim();
    fetch("/api/auth",{headers:{"x-study-key":key}}).then(function(r){
      if(r.ok){ EDIT_KEY=key; try{localStorage.setItem("study_edit_key",key);}catch(e){} setEdit(true); }
      else alert("Wrong passphrase."); }).catch(function(){ alert("Network error — try again."); });
  });
  if(EDIT_KEY) setEdit(true);
}

function stat(v,l){ var d=el("div","s"); d.appendChild(el("b",null,String(v))); d.appendChild(el("span",null,l)); return d; }
function kpi(v,l,target){ var c=el("div","card kpi"); var vv=el("div","v"); c.appendChild(vv); c.appendChild(el("div","l",l));
  if(typeof v==="number") countUp(vv, v); else vv.textContent=String(v);
  if(target) clickable(c, function(){ scrollToId(target); });
  return c; }
function solid(t){ var m={theory:"rgba(99,102,241,.7)",build:"rgba(245,158,11,.7)",consolidate:"rgba(168,85,247,.7)"}; return m[t]; }

function drawRing(pct, done, total){
  var NS="http://www.w3.org/2000/svg", R=100, r=88, C=2*Math.PI*r;
  var svg=document.createElementNS(NS,"svg"); svg.setAttribute("viewBox","0 0 200 200");
  svg.setAttribute("width","230"); svg.setAttribute("height","230");
  var defs=document.createElementNS(NS,"defs");
  defs.innerHTML="<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#60a5fa'/><stop offset='.55' stop-color='#a855f7'/><stop offset='1' stop-color='#f472b6'/></linearGradient>";
  svg.appendChild(defs);
  function circle(stroke,w,dash){ var c=document.createElementNS(NS,"circle");
    c.setAttribute("cx","100"); c.setAttribute("cy","100"); c.setAttribute("r",String(r));
    c.setAttribute("fill","none"); c.setAttribute("stroke",stroke); c.setAttribute("stroke-width",String(w));
    c.setAttribute("stroke-linecap","round"); if(dash!==undefined){ c.setAttribute("stroke-dasharray",String(C));
      c.setAttribute("stroke-dashoffset",String(dash)); } return c; }
  svg.appendChild(circle("rgba(255,255,255,.07)",14));
  var fg=circle("url(#g)",14, C);
  svg.appendChild(fg);
  var wrap=$("ring"); wrap.replaceChildren(); wrap.appendChild(svg);
  var mid=el("div","mid");
  var p=el("div","pct","0%"); mid.appendChild(p);
  mid.appendChild(el("div","of", done+" / "+total+" days"));
  wrap.appendChild(mid);
  var target=Math.max(0,Math.min(100,pct));
  requestAnimationFrame(function(){ fg.style.transition="stroke-dashoffset 1.1s cubic-bezier(.2,.7,.3,1)";
    fg.setAttribute("stroke-dashoffset", String(C*(1-target/100))); });
  var t0=null;
  function tick(t){ if(!t0)t0=t; var k=Math.min(1,(t-t0)/1100); var e=1-Math.pow(1-k,3);
    p.textContent=(target*e).toFixed(1)+"%"; if(k<1) requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
}

/* tooltip */
var tip=$("tip");
function showTip(e,text){ tip.replaceChildren();
  text.split("\\n").forEach(function(line,i){ tip.appendChild(el("div", i?null:"w", line)); });
  tip.style.display="block"; moveTip(e); }
function moveTip(e){ var pd=14, tw=tip.offsetWidth||160;
  tip.style.left=Math.min(e.clientX+pd, innerWidth-tw-pd)+"px"; tip.style.top=(e.clientY+pd)+"px"; }
function hideTip(){ tip.style.display="none"; }

/* brief modal (public, cached only) */
var overlay=$("overlay");
function closeModal(){ overlay.classList.remove("open"); }
overlay.addEventListener("click", function(e){ if(e.target===overlay) closeModal(); });
document.addEventListener("keydown", function(e){ if(e.key==="Escape") closeModal(); });
function openBrief(id){
  overlay.classList.add("open"); $("modal").replaceChildren(shell("Day "+id,"loading…"));
  fetch("/api/brief/"+id).then(function(r){ return r.json(); }).then(function(d){
    var body=el("div","m-body");
    if(!d.note) body.appendChild(el("div","loading","The brief for this day hasn't been published yet."));
    else body.innerHTML=mdToHtml(d.note);
    var m=$("modal"); m.replaceChildren(); m.appendChild(head(d.title?("Day "+d.id+" — "+d.title):("Day "+id))); m.appendChild(body);
  }).catch(function(){ $("modal").replaceChildren(shell("Day "+id,"Couldn't load that brief.")); });
}
function head(title){ var h=el("div","m-head"); var b=el("button",null,"✕"); b.id="m-close";
  b.addEventListener("click",closeModal); h.appendChild(el("div","ttl",title)); h.appendChild(b); return h; }
function shell(title,msg){ var f=document.createDocumentFragment(); f.appendChild(head(title));
  var b=el("div","m-body"); b.appendChild(el("div","loading",msg)); f.appendChild(b); return f; }

function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function mdToHtml(md){ var lines=esc(md).split("\\n"), out=[], inList=false, para=[];
  function fp(){ if(para.length){ out.push("<p>"+inline(para.join(" "))+"</p>"); para=[]; } }
  function fl(){ if(inList){ out.push("</ul>"); inList=false; } }
  for(var i=0;i<lines.length;i++){ var ln=lines[i];
    var h=ln.match(/^(#{1,6})\\s+(.*)/); if(h){ fp(); fl(); out.push("<"+(h[1].length<=2?"h3":"h4")+">"+inline(h[2])+"</"+(h[1].length<=2?"h3":"h4")+">"); continue; }
    var li=ln.match(/^\\s*[-*]\\s+(.*)/); if(li){ fp(); if(!inList){ out.push("<ul>"); inList=true; } out.push("<li>"+inline(li[1])+"</li>"); continue; }
    if(ln.trim()===""){ fp(); fl(); continue; } para.push(ln); }
  fp(); fl(); return out.join(""); }
function inline(s){ return s
  .replace(/\`([^\`]+)\`/g, function(_,c){ return "<code>"+c+"</code>"; })
  .replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>")
  .replace(/(^|[^*])\\*([^*]+)\\*/g,"$1<em>$2</em>"); }
</script>
</body></html>`;
