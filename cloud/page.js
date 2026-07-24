// The dashboard page, served by worker.js at GET /. One self-contained HTML
// document: aurora theme, passphrase gate, a year-at-a-glance heatmap board,
// per-type progress, recent briefs (rendered from Markdown) and an ask box.
// All progress data is fetched from /api/state only AFTER the key is entered,
// so the shell can be public while the data stays private.
//
// Kept deliberately free of JS template literals and backticks so the whole
// file can live inside worker.js's import without escaping headaches.

export const PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>📚 study · jayanth</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📚</text></svg>">
<style>
:root{
  --bg:#0a0b16; --card:#141830; --card2:#191d38;
  --line:rgba(255,255,255,.07); --line2:rgba(255,255,255,.16);
  --txt:#eef1fb; --dim:#9aa3c7; --faint:#5f6890;
  --indigo:#6366f1; --blue:#60a5fa; --violet:#a855f7; --pink:#f472b6;
  --teal:#2dd4bf; --green:#34d399; --amber:#f59e0b; --red:#fb7185;
  --theory:#6366f1; --build:#f59e0b; --consolidate:#a855f7;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scrollbar-color:#2c3354 #0a0b16}
body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;
  background:var(--bg); color:var(--txt); min-height:100vh}
body::before{content:""; position:fixed; inset:0; z-index:-1;
  background:
    radial-gradient(800px 560px at 10% -12%, rgba(99,102,241,.20), transparent 65%),
    radial-gradient(820px 560px at 98% -6%, rgba(168,85,247,.16), transparent 65%),
    radial-gradient(680px 520px at -8% 60%, rgba(45,212,191,.10), transparent 70%),
    radial-gradient(760px 540px at 106% 96%, rgba(244,114,182,.10), transparent 70%)}
button{font:inherit; cursor:pointer}

header{position:sticky; top:0; z-index:20; display:flex; align-items:center;
  gap:.8rem; padding:.75rem 1.5rem; background:rgba(10,11,22,.72);
  backdrop-filter:blur(14px); border-bottom:1px solid var(--line)}
.logo{font-size:1.08rem; font-weight:800; letter-spacing:-.02em;
  background:linear-gradient(90deg,var(--blue),var(--violet),var(--pink));
  -webkit-background-clip:text; background-clip:text; color:transparent}
.hi{color:var(--faint); font-size:.85rem}
#lock-btn{margin-left:auto; font-size:.78rem; color:var(--dim);
  background:rgba(255,255,255,.04); border:1px solid var(--line);
  border-radius:9px; padding:.3rem .8rem; transition:.15s; display:none}
#lock-btn:hover{color:var(--red); border-color:var(--red)}

.wrap{max-width:1120px; margin:0 auto; padding:1.5rem 1.5rem 3rem}

/* gate */
#gate{min-height:calc(100vh - 56px); display:flex; align-items:center;
  justify-content:center; padding:1rem}
.gate-card{width:min(400px,94vw); text-align:center; border-radius:20px;
  padding:2.5rem 2rem; background:linear-gradient(160deg,var(--card2),var(--card));
  border:1px solid var(--line);
  box-shadow:0 24px 70px rgba(0,0,0,.5),0 0 0 1px rgba(168,85,247,.06)}
.gate-card .big{font-size:2.6rem}
.gate-card h1{font-size:1.35rem; margin:.5rem 0 .15rem; letter-spacing:-.02em}
.gate-card p{color:var(--dim); font-size:.86rem; margin-bottom:1.25rem}
.gate-card input{width:100%; background:#0c0e1d; color:var(--txt);
  border:1px solid var(--line2); border-radius:12px; padding:.75rem 1rem;
  font:inherit; text-align:center; letter-spacing:.14em; outline:none; transition:.15s}
.gate-card input:focus{border-color:var(--violet); box-shadow:0 0 0 3px rgba(168,85,247,.18)}
.gate-card button{width:100%; margin-top:.75rem; padding:.7rem;
  background:linear-gradient(90deg,#3b82f6,#8b5cf6,#d946ef); background-size:200% 100%;
  color:#fff; border:0; border-radius:12px; font-weight:650; transition:.25s}
.gate-card button:hover{background-position:100% 0; box-shadow:0 6px 22px rgba(139,92,246,.4)}
.gate-card .err{color:var(--red); font-size:.82rem; min-height:1.3em; margin-top:.75rem}
.shake{animation:shake .45s ease}
@keyframes shake{20%{transform:translateX(-7px)}40%{transform:translateX(6px)}
  60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}

/* cards */
.card{position:relative; background:var(--card); border:1px solid var(--line);
  border-radius:20px; padding:1.5rem; box-shadow:0 24px 48px -22px rgba(3,5,16,.6)}
.card::before{content:""; position:absolute; inset:0 0 auto 0; height:1px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent)}
.card h2{font-size:1.02rem; font-weight:700; letter-spacing:-.01em}
.card .note{color:var(--dim); font-size:.8rem; margin:.15rem 0 1rem}
.reveal{opacity:0; transform:translateY(14px)}
.in{animation:fadeUp .55s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

.sec{display:flex; align-items:center; gap:1rem; margin:2.25rem 0 1rem}
.sec .eb{font-size:.73rem; font-weight:800; letter-spacing:.18em;
  text-transform:uppercase; color:var(--sc); white-space:nowrap}
.sec .sub{color:var(--faint); font-size:.76rem; overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap}
.sec::after{content:""; flex:1; height:1px;
  background:linear-gradient(90deg,color-mix(in srgb,var(--sc) 40%,transparent),transparent)}

/* hero kpis */
.kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:1rem}
@media(max-width:820px){.kpis{grid-template-columns:repeat(2,1fr)}
  .kpi.hero{grid-column:span 2}}
.kpi{padding:1.4rem 1.5rem; transition:transform .18s}
.kpi:hover{transform:translateY(-3px)}
.kpi.hero{grid-column:span 2}
.kpi .lab{color:var(--dim); font-size:.76rem}
.kpi .val{font-size:1.9rem; font-weight:800; letter-spacing:-.02em; margin-top:.15rem}
.kpi.hero .val{font-size:3.6rem; font-weight:800; letter-spacing:-.03em; line-height:1.05;
  background:linear-gradient(92deg,#7dd3fc,#c4b5fd 55%,#f9a8d4);
  -webkit-background-clip:text; background-clip:text; color:transparent}
.kpi .sub{color:var(--faint); font-size:.74rem; margin-top:.25rem}
.progress{height:12px; border-radius:7px; background:rgba(255,255,255,.06);
  overflow:hidden; margin-top:1rem; display:flex}
.progress i{display:block; height:100%}
.progress .full{background:linear-gradient(90deg,#3b82f6,#8b5cf6)}
.progress .part{background:repeating-linear-gradient(45deg,rgba(168,85,247,.55),
  rgba(168,85,247,.55) 5px,rgba(168,85,247,.25) 5px,rgba(168,85,247,.25) 10px)}

/* up-next */
.up-head{display:flex; align-items:center; gap:.7rem; flex-wrap:wrap}
.pill{font-size:.72rem; font-weight:700; border-radius:999px; padding:.24rem .7rem;
  border:1px solid; white-space:nowrap}
.pill.theory{color:#c7d2fe; border-color:rgba(99,102,241,.5); background:rgba(99,102,241,.14)}
.pill.build{color:#fde68a; border-color:rgba(245,158,11,.5); background:rgba(245,158,11,.14)}
.pill.consolidate{color:#e9d5ff; border-color:rgba(168,85,247,.5); background:rgba(168,85,247,.14)}
.up-title{font-size:1.35rem; font-weight:700; letter-spacing:-.01em; margin:.6rem 0 .4rem}
.up-text{color:var(--dim); font-size:.92rem; line-height:1.6}

/* type meters */
.meters{display:grid; gap:1rem; grid-template-columns:repeat(3,1fr)}
@media(max-width:700px){.meters{grid-template-columns:1fr}}
.meter-card .mtop{display:flex; justify-content:space-between; align-items:baseline}
.meter-card .mname{font-size:.9rem; font-weight:650}
.meter-card .mfrac{color:var(--faint); font-size:.8rem; font-variant-numeric:tabular-nums}
.mbar{height:9px; border-radius:5px; background:rgba(255,255,255,.06);
  overflow:hidden; margin-top:.55rem}
.mbar i{display:block; height:100%; border-radius:5px}

/* the board */
.board-wrap{overflow-x:auto; padding-bottom:.4rem}
.board{display:grid; grid-template-rows:repeat(7,1fr); grid-auto-flow:column;
  grid-auto-columns:1fr; gap:3px; min-width:640px}
.cell{aspect-ratio:1; border-radius:3px; background:rgba(255,255,255,.045);
  cursor:default; transition:transform .1s, box-shadow .1s}
.cell.done{cursor:pointer}
.cell.done:hover,.cell.partial:hover,.cell.pending:hover{transform:scale(1.35);
  box-shadow:0 0 0 2px var(--line2); z-index:2; position:relative}
.legend{display:flex; gap:1.1rem; flex-wrap:wrap; font-size:.76rem;
  color:var(--dim); margin-top:.9rem}
.legend span{display:inline-flex; align-items:center; gap:.4rem}
.legend i{width:11px; height:11px; border-radius:3px; display:inline-block}

/* briefs */
.briefs{display:grid; gap:.5rem}
.brief-row{display:flex; align-items:center; gap:.75rem; padding:.6rem .7rem;
  border-radius:12px; border:1px solid var(--line); cursor:pointer;
  transition:.14s; background:rgba(255,255,255,.015)}
.brief-row:hover{border-color:var(--line2); transform:translateX(3px)}
.brief-row .dot{width:9px; height:9px; border-radius:3px; flex:none}
.brief-row .bt{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.brief-row .bd{color:var(--faint); font-size:.75rem; white-space:nowrap}
.brief-row .go{color:var(--faint)}
.empty{color:var(--faint); font-size:.86rem; padding:.5rem 0}

/* ask */
.ask-row{display:flex; gap:.6rem}
#ask-q{flex:1; background:#0d1122; color:var(--txt); border:1px solid var(--line);
  border-radius:12px; padding:.7rem 1rem; font:inherit; outline:none; transition:.15s}
#ask-q:focus{border-color:var(--violet); box-shadow:0 0 0 3px rgba(168,85,247,.14)}
#ask-btn{background:linear-gradient(90deg,#6366f1,#a855f7); color:#fff; border:0;
  border-radius:12px; padding:.7rem 1.4rem; font-weight:650; transition:.15s}
#ask-btn:hover{filter:brightness(1.08); box-shadow:0 4px 16px rgba(139,92,246,.35)}
#ask-btn:disabled{opacity:.55; cursor:wait}
.ans{margin-top:.9rem; padding:.9rem 1rem; border-radius:12px;
  background:rgba(99,102,241,.06); border:1px solid rgba(99,102,241,.22);
  font-size:.92rem; line-height:1.65; white-space:pre-wrap}
.ans.thinking{color:var(--dim); font-style:italic}

/* tooltip + modal */
#tip{position:fixed; pointer-events:none; z-index:60; display:none;
  background:rgba(15,18,36,.94); backdrop-filter:blur(10px);
  border:1px solid var(--line2); border-radius:11px; padding:.5rem .75rem;
  font-size:.8rem; box-shadow:0 14px 36px rgba(0,0,0,.55); max-width:260px}
#tip .w{color:var(--faint); font-size:.72rem}
#overlay{position:fixed; inset:0; z-index:80; display:none;
  background:rgba(4,5,14,.68); backdrop-filter:blur(6px);
  align-items:flex-start; justify-content:center; overflow-y:auto; padding:5vh 1rem 4vh}
#overlay.open{display:flex}
#modal{width:min(720px,100%); border-radius:20px; overflow:hidden;
  background:linear-gradient(170deg,var(--card2),var(--card)); border:1px solid var(--line2);
  box-shadow:0 30px 90px rgba(0,0,0,.6); animation:pop .28s cubic-bezier(.2,.9,.3,1.2) both}
@keyframes pop{from{opacity:0;transform:scale(.95) translateY(12px)}}
.m-head{padding:1.25rem 1.5rem 1rem; position:relative;
  background:linear-gradient(140deg,rgba(99,102,241,.22),transparent 70%)}
.m-head .ttl{font-size:1.2rem; font-weight:750; letter-spacing:-.01em; padding-right:2rem}
.m-head .when{color:var(--dim); font-size:.8rem; margin-top:.2rem}
#m-close{position:absolute; top:.9rem; right:.9rem; width:30px; height:30px;
  border-radius:9px; border:1px solid var(--line2); background:rgba(255,255,255,.05);
  color:var(--dim); font-size:.95rem; line-height:1}
#m-close:hover{color:var(--txt); border-color:var(--faint)}
.m-body{padding:1.25rem 1.5rem 1.75rem; max-height:70vh; overflow-y:auto; line-height:1.7}
.m-body h3{font-size:1.1rem; margin:1.2rem 0 .5rem; letter-spacing:-.01em}
.m-body h4{font-size:.98rem; color:var(--dim); margin:1rem 0 .4rem}
.m-body p{margin:.55rem 0; color:#dfe4f5}
.m-body ul{margin:.5rem 0 .5rem 1.2rem}
.m-body li{margin:.25rem 0; color:#dfe4f5}
.m-body code{font-family:var(--mono); font-size:.86em; background:rgba(255,255,255,.07);
  padding:.1rem .35rem; border-radius:5px}
.m-body strong{color:#fff}
.m-body .loading{color:var(--faint)}

footer{color:var(--faint); font-size:.76rem; text-align:center; margin-top:2.5rem; line-height:1.9}
@media(prefers-reduced-motion:reduce){*,::before,::after{animation:none!important;transition:none!important}
  .reveal{opacity:1;transform:none}}
</style></head><body>

<header>
  <div class="logo">📚 Study</div>
  <div class="hi">hi, jayanth 👋</div>
  <button id="lock-btn">lock 🔒</button>
</header>

<div id="gate">
  <div class="gate-card">
    <div class="big">📚</div>
    <h1>Your roadmap, one page</h1>
    <p>private dashboard — enter the passphrase</p>
    <input id="key" type="password" placeholder="passphrase" autofocus autocomplete="current-password">
    <button id="unlock">Unlock</button>
    <div class="err" id="gate-err"></div>
  </div>
</div>

<div class="wrap" id="app" style="display:none">
  <div class="sec reveal" style="--sc:var(--blue)"><span class="eb">Overview</span>
    <span class="sub" id="ov-sub"></span></div>
  <div class="kpis reveal" id="kpis"></div>
  <div class="card reveal" id="progress-card" style="margin-top:1rem"></div>

  <div class="sec reveal" style="--sc:var(--violet)"><span class="eb">⏭ Up next</span></div>
  <div class="card reveal" id="upnext"></div>

  <div class="sec reveal" style="--sc:var(--teal)"><span class="eb">Balance</span>
    <span class="sub">theory on weekdays · builds &amp; consolidations on weekends</span></div>
  <div class="meters reveal" id="meters"></div>

  <div class="sec reveal" style="--sc:var(--indigo)"><span class="eb">The year</span>
    <span class="sub">every day of the plan · click a done cell to reread its brief</span></div>
  <div class="card reveal">
    <div class="board-wrap"><div class="board" id="board"></div></div>
    <div class="legend">
      <span><i style="background:var(--theory)"></i>theory</span>
      <span><i style="background:var(--build)"></i>build</span>
      <span><i style="background:var(--consolidate)"></i>consolidate</span>
      <span><i style="background:rgba(255,255,255,.14)"></i>partial (striped)</span>
      <span><i style="background:rgba(255,255,255,.045)"></i>to go</span>
    </div>
  </div>

  <div class="sec reveal" style="--sc:var(--pink)"><span class="eb">📘 Briefs</span>
    <span class="sub">completed days — the recap written for each</span></div>
  <div class="card reveal"><div class="briefs" id="briefs"></div></div>

  <div class="sec reveal" style="--sc:var(--amber)"><span class="eb">💬 Ask</span>
    <span class="sub">a study question, answered in the context of where you are</span></div>
  <div class="card reveal">
    <div class="ask-row">
      <input id="ask-q" type="text" maxlength="500" placeholder="ask anything about your topics…">
      <button id="ask-btn">Ask</button>
    </div>
    <div class="ans" id="ask-ans" style="display:none"></div>
  </div>

  <footer>one Cloudflare Worker · zero servers · same brain as the Telegram bot<br>
  <span id="foot-updated"></span></footer>
</div>

<div id="tip"></div>
<div id="overlay"><div id="modal"></div></div>

<script>
"use strict";
var $ = function(id){ return document.getElementById(id); };
var KEY = "";
var TYPE_COLOR = { theory:"var(--theory)", build:"var(--build)", consolidate:"var(--consolidate)" };
var DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

/* ---- gate ---- */
function tryUnlock(){
  var k = $("key").value.trim();
  if(!k) return;
  $("unlock").disabled = true; $("gate-err").textContent = "";
  api("/api/state", k).then(function(res){
    if(res.status === 200){ KEY = k; $("gate").style.display="none";
      $("app").style.display="block"; $("lock-btn").style.display="inline-block";
      return res.json().then(render); }
    $("unlock").disabled = false;
    $("gate-err").textContent = "Wrong passphrase.";
    var c = document.querySelector(".gate-card"); c.classList.remove("shake");
    void c.offsetWidth; c.classList.add("shake");
  }).catch(function(){ $("unlock").disabled=false;
    $("gate-err").textContent="Network error — try again."; });
}
function api(path, key, opts){
  opts = opts || {};
  opts.headers = Object.assign({ "x-study-key": key || KEY }, opts.headers||{});
  return fetch(path, opts);
}
$("unlock").addEventListener("click", tryUnlock);
$("key").addEventListener("keydown", function(e){ if(e.key==="Enter") tryUnlock(); });
$("lock-btn").addEventListener("click", function(){ location.reload(); });

/* ---- helpers ---- */
function el(tag, cls, txt){ var e=document.createElement(tag);
  if(cls) e.className=cls; if(txt!==undefined) e.textContent=txt; return e; }
function reveals(){ var n=document.querySelectorAll(".reveal"); var d=0;
  n.forEach(function(x){ setTimeout(function(){ x.classList.add("in"); }, d); d+=45; }); }
function prettyDate(s){ if(!s) return "—";
  var d=new Date(s+"T12:00:00");
  return d.toLocaleDateString("en",{day:"numeric",month:"short",year:"numeric"}); }

/* ---- render ---- */
function render(s){
  /* KPIs */
  var kp = $("kpis"); kp.replaceChildren();
  kp.appendChild(kpi("hero", "Complete", s.pct.toFixed(1)+"%",
    s.done+" / "+s.total+" days"));
  kp.appendChild(kpi("", "Streak", s.streak + (s.streak===1?" day":" days") + (s.streak>=3?" 🔥":""),
    "consecutive days"));
  kp.appendChild(kpi("", "Current week", "W"+s.currentWeek,
    "of "+s.weeks));
  kp.appendChild(kpi("", "Builds left", String(s.buildsLeft),
    s.partials?(s.partials+" in progress"):"weekend work"));
  $("ov-sub").textContent = s.paused ? "⏸ daily messages paused" : "on track";

  /* progress bar */
  var pc = $("progress-card"); pc.replaceChildren();
  var full = Math.max(0, Math.min(100, s.pct));
  var part = Math.max(0, Math.min(100-full, s.effortPct - s.pct));
  var bar = el("div","progress");
  var f=el("div","full"); f.style.width=full+"%";
  var p=el("div","part"); p.style.width=part+"%";
  bar.appendChild(f); bar.appendChild(p);
  var lab = el("div","note");
  lab.textContent = s.done+" done · "+(s.partials?(s.partials+" in progress (½ credit → "+s.effortPct.toFixed(1)+"% effort) · "):"")
    + (s.total - s.done - s.partials)+" to go";
  pc.appendChild(el2("h2","📊 Progress")); pc.appendChild(lab); pc.appendChild(bar);

  /* up next */
  var un = $("upnext"); un.replaceChildren();
  if(s.current){
    var c=s.current;
    var head=el("div","up-head");
    head.appendChild(el("span","pill "+c.type, c.type));
    head.appendChild(el("span","note", "Day "+c.id+"/"+s.total+" · Week "+c.week+" · "+DOW[c.dow]+"-type · ~"+c.effort));
    un.appendChild(head);
    un.appendChild(el("div","up-title", c.title));
    un.appendChild(el("div","up-text", c.text));
  } else {
    un.appendChild(el("div","empty","🎉 Plan complete — all "+s.total+" days done. Victory lap."));
  }

  /* type meters */
  var mt=$("meters"); mt.replaceChildren();
  ["theory","build","consolidate"].forEach(function(t){
    var d=s.byType[t]; var pctv = d.total? Math.round(d.done/d.total*100):0;
    var card=el("div","card meter-card");
    var top=el("div","mtop");
    top.appendChild(el("span","mname", t[0].toUpperCase()+t.slice(1)));
    top.appendChild(el("span","mfrac", d.done+"/"+d.total+" · "+pctv+"%"));
    var mb=el("div","mbar"); var i=el("i"); i.style.width=pctv+"%";
    i.style.background="var(--"+t+")"; mb.appendChild(i);
    card.appendChild(top); card.appendChild(mb); mt.appendChild(card);
  });

  /* board */
  var bd=$("board"); bd.replaceChildren();
  s.board.forEach(function(wk){
    wk.cells.forEach(function(c){
      var cell=el("div","cell "+c.status);
      if(c.status==="done") cell.style.background=TYPE_COLOR[c.type];
      else if(c.status==="partial"){
        cell.style.background="repeating-linear-gradient(45deg,"+solid(c.type)+","+solid(c.type)+" 3px,rgba(255,255,255,.05) 3px,rgba(255,255,255,.05) 6px)";
      }
      var label="W"+pad(wk.week)+" · "+DOW[c.dow]+" · Day "+c.id+"\\n"+c.title
        +(c.status==="done"?"  ✓":c.status==="partial"?"  ◐":"");
      cell.addEventListener("pointerenter", function(e){ showTip(e,label); });
      cell.addEventListener("pointermove", moveTip);
      cell.addEventListener("pointerleave", hideTip);
      if(c.status==="done") cell.addEventListener("click", function(){ openBrief(c.id); });
      bd.appendChild(cell);
    });
  });

  /* briefs */
  var br=$("briefs"); br.replaceChildren();
  if(!s.briefs.length){ br.appendChild(el("div","empty","No completed days yet — finish one and the recap lands here.")); }
  s.briefs.slice(0,40).forEach(function(b){
    var row=el("div","brief-row");
    var dot=el("span","dot"); dot.style.background="var(--"+b.type+")";
    var t=el("span","bt","Day "+b.id+" — "+b.title);
    var d=el("span","bd", prettyDate(b.date));
    var go=el("span","go","›");
    row.appendChild(dot); row.appendChild(t); row.appendChild(d); row.appendChild(go);
    row.addEventListener("click", function(){ openBrief(b.id); });
    br.appendChild(row);
  });

  $("foot-updated").textContent = "updated "+new Date(s.updated).toLocaleString();
  reveals();
}
function el2(tag,txt){ return el(tag,null,txt); }
function kpi(mod, lab, val, sub){
  var c=el("div","card kpi "+mod);
  c.appendChild(el("div","lab",lab));
  c.appendChild(el("div","val",val));
  c.appendChild(el("div","sub",sub));
  return c;
}
function pad(n){ return (n<10?"0":"")+n; }
function solid(type){ var m={theory:"rgba(99,102,241,.7)",build:"rgba(245,158,11,.7)",consolidate:"rgba(168,85,247,.7)"}; return m[type]; }

/* ---- tooltip ---- */
var tip=$("tip");
function showTip(e,text){ tip.replaceChildren();
  text.split("\\n").forEach(function(line,i){ var d=el("div", i?null:"w", line); tip.appendChild(d); });
  tip.style.display="block"; moveTip(e); }
function moveTip(e){ var pad=14, tw=tip.offsetWidth||160;
  tip.style.left=Math.min(e.clientX+pad, innerWidth-tw-pad)+"px";
  tip.style.top=(e.clientY+pad)+"px"; }
function hideTip(){ tip.style.display="none"; }

/* ---- brief modal ---- */
var overlay=$("overlay");
function closeModal(){ overlay.classList.remove("open"); }
overlay.addEventListener("click", function(e){ if(e.target===overlay) closeModal(); });
document.addEventListener("keydown", function(e){ if(e.key==="Escape") closeModal(); });
function openBrief(id){
  overlay.classList.add("open");
  $("modal").replaceChildren(modalShell("Day "+id, "loading the brief…"));
  api("/api/brief/"+id).then(function(r){ return r.json(); }).then(function(d){
    var body=el("div","m-body");
    if(!d.note){ body.appendChild(el("div","loading","This brief hasn't been written yet — mark the day done in Telegram (or it'll generate on first open).")); }
    else body.innerHTML = mdToHtml(d.note);
    var m=$("modal"); m.replaceChildren(); m.appendChild(headEl(d.title? ("Day "+d.id+" — "+d.title):("Day "+id))); m.appendChild(body);
  }).catch(function(){ $("modal").replaceChildren(modalShell("Day "+id,"Couldn't load that brief — try again.")); });
}
function headEl(title){
  var h=el("div","m-head");
  var btn=el("button",null,"✕"); btn.id="m-close"; btn.addEventListener("click", closeModal);
  h.appendChild(el("div","ttl",title)); h.appendChild(btn); return h;
}
function modalShell(title,msg){
  var frag=document.createDocumentFragment();
  frag.appendChild(headEl(title));
  var b=el("div","m-body"); b.appendChild(el("div","loading",msg)); frag.appendChild(b);
  return frag;
}

/* tiny, safe markdown → html (escape first, then a few block/inline rules) */
function esc(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function mdToHtml(md){
  var lines=esc(md).split("\\n"); var out=[]; var inList=false; var para=[];
  function flushP(){ if(para.length){ out.push("<p>"+inline(para.join(" "))+"</p>"); para=[]; } }
  function flushL(){ if(inList){ out.push("</ul>"); inList=false; } }
  for(var i=0;i<lines.length;i++){
    var ln=lines[i];
    var h=ln.match(/^(#{1,6})\\s+(.*)/);
    if(h){ flushP(); flushL(); var lvl=h[1].length; var tag=lvl<=2?"h3":"h4";
      out.push("<"+tag+">"+inline(h[2])+"</"+tag+">"); continue; }
    var li=ln.match(/^\\s*[-*]\\s+(.*)/);
    if(li){ flushP(); if(!inList){ out.push("<ul>"); inList=true; }
      out.push("<li>"+inline(li[1])+"</li>"); continue; }
    if(ln.trim()===""){ flushP(); flushL(); continue; }
    para.push(ln);
  }
  flushP(); flushL(); return out.join("");
}
function inline(s){ return s
  .replace(/\`([^\`]+)\`/g, function(_,c){ return "<code>"+c+"</code>"; })
  .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*])\\*([^*]+)\\*/g, "$1<em>$2</em>"); }

/* ---- ask ---- */
function ask(){
  var q=$("ask-q").value.trim(); if(!q) return;
  var box=$("ask-ans"); box.style.display="block"; box.className="ans thinking";
  box.textContent="thinking…"; $("ask-btn").disabled=true;
  api("/api/ask",null,{ method:"POST", headers:{"content-type":"application/json"},
    body:JSON.stringify({q:q}) }).then(function(r){ return r.json(); }).then(function(d){
    box.className="ans"; box.textContent=d.answer||"(no answer)"; $("ask-btn").disabled=false;
  }).catch(function(){ box.className="ans"; box.textContent="Network error — try again."; $("ask-btn").disabled=false; });
}
$("ask-btn").addEventListener("click", ask);
$("ask-q").addEventListener("keydown", function(e){ if(e.key==="Enter") ask(); });
</script>
</body></html>`;
