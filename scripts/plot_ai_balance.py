#!/usr/bin/env python3
"""Plot AI hero win rates before/after the 6 CPS balance pass."""
import json
import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", "/tmp/mplconfig")
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

BASE = Path(__file__).resolve().parents[1] / "data" / "bot-results"
before = json.loads((BASE / "ai_baseline_6cps.json").read_text())
files = ["ai_final_s600.json", "ai_final_s700.json", "ai_final_s800.json", "ai_final_s900.json"]
agg = {}
for f in files:
    d = json.loads((BASE / f).read_text())
    for r in d["rows"]:
        agg.setdefault(r["hero"], {"w": 0, "p": 0})
        agg[r["hero"]]["w"] += r["wins"]
        agg[r["hero"]]["p"] += r["plays"]
after_rows = {h: {"wins": v["w"], "plays": v["p"], "winRate": v["w"] / v["p"]} for h, v in agg.items()}
before_rows = {r["hero"]: r for r in before["rows"]}
heroes = sorted(before_rows, key=lambda h: before_rows[h]["winRate"], reverse=True)
labels = [h.capitalize() for h in heroes]
b = [before_rows[h]["winRate"] * 100 for h in heroes]
a = [after_rows[h]["winRate"] * 100 for h in heroes]
x = np.arange(len(heroes))
w = 0.38
fig, ax = plt.subplots(figsize=(12, 6.4))
ax.bar(x - w / 2, b, width=w, color="#d95f02", label=f"Before (n={before['matches']})")
ax.bar(x + w / 2, a, width=w, color="#1b9e77", label="After (n=2400)")
ax.axhline(25, color="#444444", ls="--", lw=1, label="Target 25%")
for i, (v1, v2) in enumerate(zip(b, a)):
    ax.text(i - w / 2, v1 + 0.7, f"{v1:.1f}", ha="center", va="bottom", fontsize=7, rotation=90)
    ax.text(i + w / 2, v2 + 0.7, f"{v2:.1f}", ha="center", va="bottom", fontsize=7, rotation=90)
ax.set_xticks(x)
ax.set_xticklabels(labels, fontsize=9)
ax.set_ylabel("Win rate (%)")
ax.set_ylim(0, 92)
ax.set_title("AI hero balance at 6 CPS: before vs after (4-AI FFA, random hero compositions)")
ax.grid(axis="y", alpha=0.25)
ax.legend(fontsize=9)
fig.tight_layout()
out = BASE / "ai_balance_before_after.png"
fig.savefig(out, dpi=180)
print(out)
