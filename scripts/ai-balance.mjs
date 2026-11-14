/**
 * AI 4 人混战平衡测试：
 *   node scripts/ai-balance.mjs --matches 400 --seed 500001 \
 *     --tuning '{"falcon":{"clickDamage":0.25,"startGold":-200}}'
 *
 * 默认每局从 10 个英雄中随机抽 4 个（不重复），统计每个英雄作为
 * “初始英雄”时的胜率。所有 AI 使用 room.aiLevel='nightmare'，当前
 * 标准为 6 CPS。
 */
import fs from 'node:fs';

import { generateMap } from '../shared/mapgen.js';
import { chooseAIPlacement, createBattle, tickBattle } from '../shared/engine.js';
import { AI_HERO_TUNING, HEROES } from '../shared/heroes.js';

function mulberry32(a) {
  let x = a >>> 0;
  return function rng() {
    x |= 0;
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv) {
  const args = {
    matches: 200,
    seed: 500001,
    out: null,
    tuning: null,
    heroes: null,
    maxSeconds: 12 * 60,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--matches') args.matches = Number(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--tuning') args.tuning = argv[++i];
    else if (a === '--heroes') args.heroes = argv[++i].split(',').map((x) => x.trim());
    else if (a === '--max-seconds') args.maxSeconds = Number(argv[++i]);
    else throw new Error(`unknown arg: ${a}`);
  }
  return args;
}

function shuffle(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.tuning) {
    const patch = JSON.parse(args.tuning);
    for (const [hero, values] of Object.entries(patch)) {
      if (!HEROES[hero]) throw new Error(`unknown hero: ${hero}`);
      AI_HERO_TUNING[hero] = { ...(AI_HERO_TUNING[hero] || {}), ...values };
    }
  }

  const ids = Object.keys(HEROES);
  const wins = {};
  const plays = {};
  const winsBySlot = [0, 0, 0, 0];
  const playsBySlot = [0, 0, 0, 0];
  let durationSum = 0;
  let ended = 0;
  const reasons = {};

  for (let m = 0; m < args.matches; m++) {
    const seed = args.seed + m;
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const heroes = args.heroes
      ? args.heroes
      : shuffle(rng, ids).slice(0, 4);
    if (heroes.length !== 4) throw new Error('need 4 heroes');
    const map = generateMap(seed);
    const room = { players: [], aiLevel: 'nightmare', tutorial: false };
    for (let s = 0; s < 4; s++) {
      const heroId = heroes[s];
      room.players.push({
        id: `ai-${s}`,
        name: `AI${s}`,
        slot: s,
        isAI: true,
        connected: true,
        heroId,
        placement: chooseAIPlacement(map, s),
      });
      plays[heroId] = (plays[heroId] || 0) + 1;
      playsBySlot[s] += 1;
    }
    const originalRandom = Math.random;
    Math.random = rng;
    let sim;
    try {
      sim = createBattle(room, map);
      let ticks = 0;
      while (!sim.over && ticks < 30 * args.maxSeconds) {
        tickBattle(sim, 1 / 30);
        ticks += 1;
      }
    } finally {
      Math.random = originalRandom;
    }
    durationSum += sim.time;
    reasons[sim.endReason] = (reasons[sim.endReason] || 0) + 1;
    const winner = sim.players.find((p) => p.id === sim.winner);
    if (winner) {
      const heroId = heroes[winner.slot];
      wins[heroId] = (wins[heroId] || 0) + 1;
      winsBySlot[winner.slot] += 1;
      ended += 1;
    }
  }

  const rows = ids
    .map((hero) => {
      const w = wins[hero] || 0;
      const p = plays[hero] || 0;
      return { hero, wins: w, plays: p, winRate: p ? w / p : 0 };
    })
    .sort((a, b) => b.winRate - a.winRate);
  const rates = rows.filter((r) => r.plays).map((r) => r.winRate);
  const mean = rates.reduce((a, b) => a + b, 0) / Math.max(1, rates.length);
  const variance = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rates.length);
  const payload = {
    matches: args.matches,
    seed: args.seed,
    standardCps: 6,
    tuning: AI_HERO_TUNING,
    ended,
    drawRate: args.matches ? (args.matches - ended) / args.matches : 0,
    avgDuration: args.matches ? durationSum / args.matches : 0,
    reasons,
    meanWinRate: mean,
    stdev: Math.sqrt(variance),
    maxDeviation: Math.max(...rates.map((r) => Math.abs(r - 0.25))),
    rows,
    slots: [0, 1, 2, 3].map((s) => ({
      slot: s,
      wins: winsBySlot[s],
      plays: playsBySlot[s],
      winRate: playsBySlot[s] ? winsBySlot[s] / playsBySlot[s] : 0,
    })),
  };
  console.log(JSON.stringify(payload, null, 2));
  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(payload, null, 2));
  }
}

main();
