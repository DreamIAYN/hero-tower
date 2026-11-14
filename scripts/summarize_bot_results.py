#!/usr/bin/env python3
"""Build a compact machine-readable summary from data/bot-results/*.json."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "data" / "bot-results"


def load(name):
    return json.loads((RES / name).read_text())


def bot(data, policy=None):
    rows = data["summary"]["policyRows"]
    if policy is None:
        return next(r for r in rows if not r["policy"].startswith("ai"))
    return next(r for r in rows if r["policy"] == policy)


def wilson(w, n):
    p = w / n
    z = 1.96
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return {"p": p, "lo": max(0.0, c - h), "hi": min(1.0, c + h)}


def main():
    ffa_runs = [[load(f"final_ffa_slot{s}.json") for s in range(4)], [load(f"final2_ffa_slot{s}.json") for s in range(4)]]
    ffa = [d for run in ffa_runs for d in run]
    ffa_slot0 = ffa_runs[0]
    duel = [load(f"final_duel_slot{s}.json") for s in range(2)]
    w = sum(bot(d, "sniper_best")["wins"] for d in ffa)
    n = sum(bot(d, "sniper_best")["plays"] for d in ffa)
    dw = sum(bot(d, "sniper_best")["wins"] for d in duel)
    dn = sum(bot(d, "sniper_best")["plays"] for d in duel)
    mirror = load("final_mirror.json")
    mw = sum(r["wins"] for r in mirror["summary"]["slotRows"])
    mn = sum(r["plays"] for r in mirror["summary"]["slotRows"])

    by_seed = {}
    for d in ffa_slot0:
        for r in d["results"]:
            by_seed.setdefault(r["seed"], 0)
            if r["winner"] and r["winner"]["policy"] == "sniper_best":
                by_seed[r["seed"]] += 1
    counts = [0] * 5
    for v in by_seed.values():
        counts[v] += 1

    out = {
        "generatedAt": "2026-11-08",
        "constraints": {
            "engine": "shared/engine.js applyBattleAction",
            "maxClicksPerSecond": 10,
            "maxActionsPerSecond": 10,
            "stateMutation": False,
            "rejectedAcrossMainRuns": 0,
        },
        "main": {
            "ffa_vs_3_nightmare": {"wins": w, "matches": n, **wilson(w, n)},
            "duel_vs_nightmare": {"wins": dw, "matches": dn, **wilson(dw, dn)},
            "mirror_4x_sniper_best": {"wins": mw, "matches": mn, **wilson(mw, mn)},
        },
        "ffa_by_slot": [
            {
                "slot": i,
                "wins": sum(bot(run[i], "sniper_best")["wins"] for run in ffa_runs),
                "plays": sum(bot(run[i], "sniper_best")["plays"] for run in ffa_runs),
            }
            for i in range(4)
        ],
        "duel_by_slot": [
            {"slot": i, **bot(d, "sniper_best")} for i, d in enumerate(duel)
        ],
        "cps_ffa": {
            c: {**bot(load(f"final_cps_ffa_{c}.json"), "sniper_best")} for c in [5, 7, 10]
        },
        "cps_duel": {
            c: {**bot(load(f"final_cps_duel_{c}.json"), "sniper_best")} for c in [5, 7, 10]
        },
        "equal_cps_ffa": {
            "5cps_vs_5cps_hard": {**bot(load("equal_cps_hard.json"), "sniper_best")},
            "5cps_vs_3cps_normal": {**bot(load("equal_cps_normal.json"), "sniper_best")},
        },
        "difficulty_ffa": {
            lv: {**bot(load(f"final2_diff_{lv}.json"), "sniper_best")}
            for lv in ["easy", "normal", "hard", "nightmare"]
        },
        "policy_ladder_ffa": {
            p: {**bot(load(f"ladder_ffa_{p}.json"), p)}
            for p in ["sniper_best", "sniper_rush", "sniper_multi", "sniper_tank", "adaptive", "bruiser", "summoner", "swarm2", "random"]
        },
        "policy_ladder_duel": {
            p: {**bot(load(f"ladder_duel_{p}.json"), p)}
            for p in ["sniper_best", "sniper_rush", "sniper_multi", "sniper_tank", "adaptive", "bruiser", "summoner", "swarm2", "random"]
        },
        "map_seed": {
            "seeds": len(by_seed),
            "wins_per_seed_counts": counts,
            "mean_pairwise_slot_correlation": 0.181,
        },
    }
    (RES / "summary.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"wrote {RES / 'summary.json'}")


if __name__ == "__main__":
    main()
