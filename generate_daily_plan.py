import re, json
from datetime import date, timedelta

text = open('de-ai-devops-mastery-roadmap-v3.md').read()
START = date(2026,7,20)

# Split into week sections
parts = re.split(r'\n(?=## Week)', text)
week_secs = [p for p in parts if p.startswith('## Week')]
print("sections:", len(week_secs))

units = []
def add(week, dow, utype, title, body, mastery=None):
    units.append({"week": week, "dow": dow, "type": utype, "title": title.strip(),
                  "text": re.sub(r'\s+', ' ', body).strip(), "mastery": mastery})

DOWS = {"Mon":0,"Tue":1,"Wed":2,"Thu":3,"Fri":4}

def parse_bullets(sec):
    """Return list of (label, title, body) for '- **LABEL — title.** body' or '- **LABEL:** body' bullets."""
    out = []
    for m in re.finditer(r'^- \*\*([^*]+?)\*\*(.*?)(?=^\- \*\*|\n\n\*\*|\n\n#|\Z)', sec, flags=re.M|re.S):
        out.append((m.group(1).strip(), m.group(2).strip()))
    return out

for sec in week_secs:
    h = re.match(r'## Weeks? ([\d–]+) — (.+)', sec)
    wspec, wtitle = h.group(1), h.group(2).strip()
    mastery_m = re.search(r'\*\*Mastery check:\*\*\s*(.+?)(?:\n|$)', sec)
    mastery = mastery_m.group(1).strip() if mastery_m else None

    if '–' not in wspec:
        w = int(wspec)
        bullets = parse_bullets(sec)
        sat_parts, sun_parts = [], []
        for label, body in bullets:
            lab = label.rstrip('.:—- ').strip()
            key = lab.split(' ')[0].split('—')[0].strip()
            if key in DOWS:
                # label like "Mon — Topic." ; split title from label
                tparts = lab.split('—',1)
                daytitle = tparts[1].strip() if len(tparts)>1 else wtitle
                add(w, DOWS[key], "theory", daytitle, body, None)
            elif key in ("A","B","C","A+B"):
                sat_parts.append(f"[Block {key}] {body}")
            elif key in ("D","E","F","E/F","D/E","D/E/F"):
                sun_parts.append(f"[Block {key}] {body}")
        add(w, 5, "build", f"Deep Build — {wtitle}", " ".join(sat_parts))
        add(w, 6, "consolidate", f"Consolidate — {wtitle}", " ".join(sun_parts), mastery)
    else:
        w1, w2 = [int(x) for x in wspec.split('–')]
        # split inner per-week blocks: '**Week N:**'
        inner = re.split(r'\n\*\*Week (\d+):\*\*', sec)
        # inner[0] preamble; then pairs (num, body)
        blocks = {}
        for i in range(1, len(inner), 2):
            blocks[int(inner[i])] = inner[i+1]
        for w in range(w1, w2+1):
            body = blocks.get(w, "")
            bullets = parse_bullets(body)
            theory_txt, sat_parts, sun_parts = None, [], []
            for label, b in bullets:
                lab = label.rstrip('.:—- ').strip()
                if lab.startswith("Mon"):
                    theory_txt = b
                elif lab.startswith("Sat"):
                    sat_parts.append(f"[{lab}] {b}")
                elif lab.startswith("Sun"):
                    sun_parts.append(f"[{lab}] {b}")
            tt = theory_txt or "Capstone theory slots — see roadmap section for this week."
            for d in range(5):
                add(w, d, "theory", f"Capstone slot {d+1}/5 — {wtitle}",
                    f"(One of five weekday slots this week.) {tt}")
            add(w, 5, "build", f"Deep Build — {wtitle}", " ".join(sat_parts) or "Capstone build day — see roadmap.")
            add(w, 6, "consolidate", f"Consolidate — {wtitle}", " ".join(sun_parts) or "Capstone consolidation — see roadmap.", mastery)

units.sort(key=lambda u: (u["week"], u["dow"]))
for i,u in enumerate(units):
    u["id"] = i+1
    u["nominal_date"] = str(START + timedelta(weeks=u["week"]-1, days=u["dow"]))

weeks_seen = sorted(set(u["week"] for u in units))
per_week = {w: len([u for u in units if u["week"]==w]) for w in weeks_seen}
bad = {w:c for w,c in per_week.items() if c!=7}
print("weeks:", len(weeks_seen), "| units:", len(units), "| weeks!=7 units:", bad)

json.dump({"generated_from":"de-ai-devops-mastery-roadmap-v3.md","start_date":str(START),"units":units},
          open('plan.json','w'), indent=1)
print("plan.json written")
