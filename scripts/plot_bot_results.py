#!/usr/bin/env python3
"""Plot the bot-arena experiment summaries (English labels for portability)."""
import json
import math
import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", "/tmp/mplconfig")

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "data" / "bot-results"

POLICY_LABEL = {
    "sniper_best": "Falcon Best",
    "sniper_rush": "Falcon Rush",
    "sniper_multi": "Falcon Multi",
    "sniper_tank": "Falcon Tank",
    "adaptive": "Adaptive",
    "summoner": "Summoner",
    "bruiser": "Bruiser",
    "swarm2": "Mirage Swarm",
    "random": "Random",
}


def load(name):
    return json.loads((RES / name).read_text())


def bot_row(data, policy=None):
    rows = data["summary"]["policyRows"]
    if policy is None:
        return next(r for r in rows if not r["policy"].startswith("ai"))
    return next(r for r in rows if r["policy"] == policy)


def win_row(data, policy):
    r = bot_row(data, policy)
    return r["wins"], r["plays"], r["winRate"], r["ci95"]


def wilson(w, n):
    if n == 0:
        return 0.0, 0.0, 0.0
    p = w / n
    z = 1.96
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return p, max(0.0, c - h), min(1.0, c + h)


def err(ci, p):
    return [[p - ci[0]], [ci[1] - p]]


fig, axes = plt.subplots(2, 2, figsize=(13.2, 9.2))
fig.suptitle("Tower Souls bot arena: legal 10 CPS bots vs Nightmare AI", fontsize=15, fontweight="bold")

# --- CPS ladder -------------------------------------------------------
ax = axes[0, 0]
cps = [5, 7, 10]
for key, label, color, marker in [
    ("final_cps_ffa_{}.json", "4-player FFA", "#d95f02", "o"),
    ("final_cps_duel_{}.json", "1v1 duel", "#1b9e77", "s"),
]:
    vals, los, his = [], [], []
    for c in cps:
        d = load(key.format(c))
        _, _, p, ci = win_row(d, "sniper_best")
        vals.append(p * 100)
        los.append((p - ci[0]) * 100)
        his.append((ci[1] - p) * 100)
    ax.errorbar(cps, vals, yerr=[los, his], marker=marker, color=color, capsize=5, lw=2, label=label)
    for x, y in zip(cps, vals):
        ax.annotate(f"{y:.1f}%", (x, y), textcoords="offset points", xytext=(0, 10), ha="center", fontsize=9)
d = load("equal_cps_hard.json")
_, _, p_eq, ci_eq = win_row(d, "sniper_best")
ax.scatter([5], [p_eq * 100], marker="*", s=180, color="#6a3d9a", zorder=6,
           label="5 CPS vs 5 CPS Hard AI")
ax.annotate(f"{p_eq * 100:.0f}%", (5, p_eq * 100), textcoords="offset points",
            xytext=(12, -4), fontsize=9, color="#6a3d9a", fontweight="bold")
ax.axhline(25, color="#888888", ls="--", lw=1, label="FFA chance (25%)")
ax.axhline(50, color="#bbbbbb", ls=":", lw=1, label="Duel chance (50%)")
ax.set_xticks(cps)
ax.set_xlabel("Action / attack cap (CPS)")
ax.set_ylabel("Win rate (%)")
ax.set_ylim(0, 105)
ax.set_title("A. Win rate scales with CPS; equal-CPS restores strategy")
ax.grid(alpha=0.25)
ax.legend(fontsize=8, loc="lower right")

# --- Difficulty ladder -------------------------------------------------
ax = axes[0, 1]
levels = ["easy", "normal", "hard", "nightmare"]
labels = ["Easy", "Normal", "Hard", "Nightmare"]
vals, los, his = [], [], []
for lv in levels:
    d = load(f"final2_diff_{lv}.json")
    _, _, p, ci = win_row(d, "sniper_best")
    vals.append(p * 100)
    los.append((p - ci[0]) * 100)
    his.append((ci[1] - p) * 100)
colors = ["#4c78a8", "#72b7b2", "#f58518", "#e45756"]
ax.bar(labels, vals, color=colors, alpha=0.9)
ax.errorbar(range(len(vals)), vals, yerr=[los, his], fmt="none", ecolor="black", capsize=5)
for i, v in enumerate(vals):
    ax.annotate(f"{v:.1f}%", (i, v), textcoords="offset points", xytext=(0, 5), ha="center", fontsize=9)
ax.axhline(25, color="#888888", ls="--", lw=1, label="FFA chance (25%)")
ax.set_ylim(0, 110)
ax.set_ylabel("Win rate (%)")
ax.set_title("B. 4-player FFA vs each AI difficulty")
ax.grid(axis="y", alpha=0.25)
ax.legend(fontsize=8, loc="lower left")

# --- Policy ladder ----------------------------------------------------
ax = axes[1, 0]
policies = ["sniper_best", "sniper_rush", "sniper_multi", "sniper_tank", "adaptive", "bruiser", "summoner", "swarm2", "random"]
ffa, duel = [], []
for p in policies:
    ffa.append(win_row(load(f"ladder_ffa_{p}.json"), p)[2] * 100)
    duel.append(win_row(load(f"ladder_duel_{p}.json"), p)[2] * 100)
y = np.arange(len(policies))
h = 0.38
ax.barh(y + h / 2, ffa, height=h, color="#e45756", label="4FFA vs 3 Nightmare")
ax.barh(y - h / 2, duel, height=h, color="#4c78a8", label="1v1 vs Nightmare")
for i, (a, b) in enumerate(zip(ffa, duel)):
    ax.annotate(f"{a:.0f}%", (a, i + h / 2), xytext=(3, 0), textcoords="offset points", va="center", fontsize=8)
    ax.annotate(f"{b:.0f}%", (b, i - h / 2), xytext=(3, 0), textcoords="offset points", va="center", fontsize=8)
ax.set_yticks(y)
ax.set_yticklabels([POLICY_LABEL[p] for p in policies], fontsize=9)
ax.invert_yaxis()
ax.set_xlim(0, 108)
ax.set_xlabel("Win rate (%)")
ax.set_title("C. Bot archetypes (200 FFA / 100 duel matches)")
ax.grid(axis="x", alpha=0.25)
ax.legend(fontsize=8, loc="lower right")

# --- Map luck ---------------------------------------------------------
ax = axes[1, 1]
by_seed = {}
total_w = total_n = 0
for slot in range(4):
    d = load(f"final_ffa_slot{slot}.json")
    for r in d["results"]:
        by_seed.setdefault(r["seed"], 0)
        if r["winner"] and r["winner"]["policy"] == "sniper_best":
            by_seed[r["seed"]] += 1
        total_w += 1 if r["winner"] and r["winner"]["policy"] == "sniper_best" else 0
        total_n += 1
counts = np.zeros(5, dtype=int)
for v in by_seed.values():
    counts[v] += 1
nseed = len(by_seed)
p = total_w / total_n
binom = [math.comb(4, k) * p**k * (1 - p) ** (4 - k) * nseed for k in range(5)]
x = np.arange(5)
ax.bar(x - 0.2, counts, width=0.4, color="#54a24b", label="Observed (300 maps x 4 slots)")
ax.bar(x + 0.2, binom, width=0.4, color="#b0b0b0", label=f"Binomial(4, {p:.3f}) if independent")
for i, v in enumerate(counts):
    ax.annotate(str(v), (i - 0.2, v), textcoords="offset points", xytext=(0, 3), ha="center", fontsize=8)
ax.set_xticks(x)
ax.set_xlabel("Number of bot wins among the 4 slots on the same map seed")
ax.set_ylabel("Number of map seeds")
ax.set_title("D. Map-seed clustering (luck component)")
ax.grid(axis="y", alpha=0.25)
ax.legend(fontsize=8, loc="upper left")

fig.tight_layout(rect=[0, 0, 1, 0.96])
out = RES / "bot_summary.png"
fig.savefig(out, dpi=180)
print(f"wrote {out}")
