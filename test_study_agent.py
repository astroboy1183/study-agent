#!/usr/bin/env python3
"""Offline tests for study_agent: schedule/pointer logic, no network.

Run:  STUDY_BOT_TOKEN=x STUDY_CHAT_ID=1 STATE_PATH=/tmp/t.json \
      .venv/bin/python test_study_agent.py
"""
import collections
import datetime as dt
import importlib.util
import os

os.environ.setdefault("STUDY_BOT_TOKEN", "x")
os.environ.setdefault("STUDY_CHAT_ID", "1")
os.environ.setdefault("STATE_PATH", "/tmp/study-agent-test-state.json")
os.environ.setdefault("GIT_AUTOPUSH", "0")  # never push from tests

spec = importlib.util.spec_from_file_location(
    "sa", os.path.join(os.path.dirname(os.path.abspath(__file__)), "study_agent.py"))
sa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sa)

sent = []
sa.tg = lambda method, **p: (sent.append((method, p)) or {"ok": True, "result": []})
sa.publish_progress = lambda *a, **k: None  # tests must never write README or push to git
sa.push_vault = lambda *a, **k: None        # tests must never touch the vault repo

MON, SAT, SUN = dt.date(2026, 7, 20), dt.date(2026, 7, 25), dt.date(2026, 7, 26)


def reset():
    sa.STATE.clear()
    sa.STATE.update({"done": {}, "flags": {}, "paused": False,
                     "skipped_today": None, "partials": {}, "last_done": None})


def test_plan_integrity():
    assert sa.TOTAL == sa.WEEKS * 7
    dows = collections.Counter(u["dow"] for u in sa.PLAN)
    assert all(dows[d] == sa.WEEKS for d in range(7))
    for w in range(1, sa.WEEKS + 1):
        wk = sorted((u for u in sa.PLAN if u["week"] == w), key=lambda x: x["dow"])
        assert [u["dow"] for u in wk] == list(range(7))
        assert [u["type"] for u in wk] == ["theory"] * 5 + ["build", "consolidate"]


def test_weekday_serves_theory_never_build():
    reset()
    assert sa.next_unit_for(MON)["type"] == "theory"
    # even with all of week 1's theory done, a weekday never serves the build
    for i in range(1, 6):
        sa.STATE["done"][str(i)] = {"date": "x", "status": "done"}
    nxt = sa.next_unit_for(MON)
    assert nxt is None or nxt["type"] == "theory"


def test_saturday_serves_build_when_theory_current():
    reset()
    for i in range(1, 6):  # week 1 theory done
        sa.STATE["done"][str(i)] = {"date": "x", "status": "done"}
    u = sa.next_unit_for(SAT)
    assert u["type"] == "build" and u["id"] == 6


def test_missed_theory_overflows_into_saturday():
    reset()
    for i in range(1, 5):  # did Mon-Thu, missed Friday's theory (id 5)
        sa.STATE["done"][str(i)] = {"date": "x", "status": "done"}
    u = sa.next_unit_for(SAT)
    assert u["type"] == "theory" and u["id"] == 5  # Friday's topic overflows to Sat


def test_sunday_catches_up_anything_before_consolidate():
    reset()
    for i in range(1, 5):  # missed Friday theory (5) and the build (6)
        sa.STATE["done"][str(i)] = {"date": "x", "status": "done"}
    assert sa.next_unit_for(SUN)["id"] == 5       # missed theory first
    sa.STATE["done"]["5"] = {"date": "x", "status": "done"}
    assert sa.next_unit_for(SUN)["id"] == 6       # then the build
    sa.STATE["done"]["6"] = {"date": "x", "status": "done"}
    assert sa.next_unit_for(SUN)["id"] == 7       # then consolidate


def test_pointer_advances_on_done():
    reset(); sa.STATE["done"]["1"] = {"date": "x", "status": "done"}
    assert sa.next_unit_for(MON)["id"] == 2


def test_skip_holds_pointer():
    reset(); before = sa.next_unit_for(MON)["id"]
    sa.do_skip(before)
    assert sa.next_unit_for(MON)["id"] == before
    assert sa.STATE["skipped_today"] is not None


def test_partial_carries_over():
    reset(); u = sa.next_unit_for(MON)
    sa.do_partial(u["id"])
    assert str(u["id"]) not in sa.STATE["done"]
    assert str(u["id"]) in sa.STATE["partials"]
    assert sa.next_unit_for(MON)["id"] == u["id"]


def test_done_clears_partial():
    reset(); sa.do_partial(1); sa.do_done(1)
    assert "1" not in sa.STATE["partials"]
    assert sa.STATE["done"]["1"]["status"] == "done"
    assert sa.STATE["last_done"] == 1


def test_markdown_strip_and_chunking():
    raw = "# H\n**bold** _it_ `code` *star*\n> quote"
    stripped = sa._strip_md(raw)
    assert "**" not in stripped and "`" not in stripped
    sent.clear(); sa.send("x" * 9000, markdown=False)
    calls = [c for c in sent if c[0] == "sendMessage"]
    assert len(calls) >= 3 and all(len(c[1]["text"]) <= 3800 for c in calls)


def test_partial_moves_effort_not_daycount():
    reset()
    for i in range(1, 13):
        sa.STATE["done"][str(i)] = {"date": "x", "status": "done"}
    sa.STATE["partials"] = {str(i): "x" for i in range(13, 16)}  # 3 in progress
    plain = sa.render_progress_block(dt.date(2026, 7, 20)).replace("*", "")
    assert f"12/{sa.TOTAL} days done" in plain        # day count = full only
    assert "in progress" in plain
    import re
    effort = float(re.search(r"([\d.]+)% effort", plain).group(1))
    assert effort > 12 / sa.TOTAL * 100               # effort includes partial credit
    # bar visibly two-tones once partials accumulate
    reset()
    for i in range(1, 13):
        sa.STATE["done"][str(i)] = {"date": "x", "status": "done"}
    sa.STATE["partials"] = {str(i): "x" for i in range(13, 45)}
    assert "▒" in sa.render_progress_block(dt.date(2026, 7, 20))


def test_old_state_file_gains_missing_keys():
    import json
    path = os.environ["STATE_PATH"]
    with open(path, "w") as f:
        json.dump({"done": {"1": {"date": "x", "status": "done"}}}, f)  # pre-"flags" era
    s = sa.load_state()
    os.remove(path)
    assert s["flags"] == {} and s["partials"] == {} and s["paused"] is False
    assert s["done"]["1"]["status"] == "done"


def test_stale_callback_button_is_survived():
    reset(); sent.clear()
    # button from a message sent under an old plan.json: unknown unit id
    sa.handle_callback({"id": "cb1", "data": f"done:{sa.TOTAL + 999}"})
    assert str(sa.TOTAL + 999) not in sa.STATE["done"]
    # and garbage callback data doesn't raise either
    sa.handle_callback({"id": "cb2", "data": "??"})
    sa.handle_callback({"id": "cb3"})
    assert any(c[0] == "sendMessage" for c in sent)  # user got a pointer to /today


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn(); print(f"PASS {fn.__name__}")
    print(f"\n{len(fns)} tests passed")
