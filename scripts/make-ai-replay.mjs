/**
 * 生成一局 4 AI 混战的真实回放文件，写入 data/replays/。
 * 回放格式与 server.js 的 startReplay/finalizeReplay 一致，可直接在游戏
 * 首页「最近回放」里播放。
 *
 *   node scripts/make-ai-replay.mjs --seed 314194 \
 *     --heroes falcon,shade,spirit,frost --out data/replays
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { AI_NAMES, AI_LEVELS, HEROES, PLAYER_COLORS } from '../shared/heroes.js';
import { generateMap } from '../shared/mapgen.js';
import {
  chooseAIPlacement,
  createBattle,
  serializeSim,
  tickBattle,
} from '../shared/engine.js';

const REPLAY_VERSION = 1;
const REPLAY_FPS = 5;
const MATCH_LIMIT_SECONDS = 12 * 60;

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
  const args = { seed: 314194, heroes: 'falcon,shade,spirit,frost', out: 'data/replays' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--heroes') args.heroes = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--id') args.id = argv[++i];
    else throw new Error(`unknown arg: ${a}`);
  }
  return args;
}

function replayPlayerSummary(p) {
  return {
    id: p.id,
    name: p.name,
    slot: p.slot,
    color: p.color,
    isAI: p.isAI,
    heroId: p.heroId,
    selectedHeroId: p.selectedHeroId,
    gold: p.gold,
    kills: p.kills,
    deaths: p.deaths,
    eliminated: p.eliminated,
    damageDealt: p.damageDealt,
    score: p.score,
    hasHero: p.hasHero,
    heroAlive: p.heroAlive,
    towerAlive: p.towerAlive,
    heroLevel: p.heroLevel,
    towerLevel: p.towerLevel,
    respawnIn: p.respawnIn,
    heroesAlive: p.heroesAlive,
    heroesTotal: p.heroesTotal,
    towersAlive: p.towersAlive,
    towersTotal: p.towersTotal,
    ownedHeroIds: p.ownedHeroIds,
    totalEarned: p.totalEarned,
  };
}

function buildResult(sim) {
  const winner = sim.winner ? sim.players.find((p) => p.id === sim.winner) : null;
  const ranking = [...sim.players].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    return b.kills * 160 + b.damageDealt * 0.35 - (a.kills * 160 + a.damageDealt * 0.35);
  });
  return {
    winnerId: sim.winner,
    winnerName: winner ? winner.name : null,
    winnerColor: winner ? winner.color : null,
    reason: sim.endReason,
    time: Math.floor(sim.time),
    ranking: ranking.map((p, i) => ({
      rank: i + 1,
      id: p.id,
      name: p.name,
      color: p.color,
      heroId: p.heroId,
      kills: p.kills,
      deaths: p.deaths,
      eliminated: p.eliminated,
      damage: Math.round(p.damageDealt),
      towerAlive: p.towers.some((t) => t.alive),
    })),
  };
}

function main() {
  const args = parseArgs(process.argv);
  const heroes = args.heroes.split(',').map((s) => s.trim()).filter(Boolean);
  if (heroes.length !== 4 || heroes.some((h) => !HEROES[h])) {
    throw new Error('--heroes 需要 4 个合法英雄 id');
  }

  const rng = mulberry32(args.seed ^ 0x9e3779b9);
  const originalRandom = Math.random;
  Math.random = rng;

  let sim;
  let map;
  const createdAt = Date.now();
  const code = `AI${String(args.seed).slice(-4).padStart(4, '0')}`;
  const id = args.id || `ai-ffa-${args.seed}-${createdAt.toString(36)}`;
  try {
    map = generateMap(args.seed);
    const occupied = new Set();
    const room = { players: [], aiLevel: 'nightmare', tutorial: false };
    for (let i = 0; i < 4; i++) {
      const placement = chooseAIPlacement(map, i, occupied);
      if (placement) occupied.add(`${placement.x},${placement.y}`);
      room.players.push({
        id: `ai-${i}`,
        name: `AI · ${AI_NAMES[i]}`,
        slot: i,
        isAI: true,
        connected: true,
        heroId: heroes[i],
        placement,
      });
    }
    sim = createBattle(room, map);

    const frames = [];
    const events = [];
    let lastFrameAt = -999;
    let lastEventId = 0;

    const record = (force = false) => {
      for (const ev of sim.events) {
        if (ev.id <= lastEventId) continue;
        lastEventId = ev.id;
        events.push({ ...ev, t: Math.round(sim.time * 100) / 100 });
      }
      const t = Math.round(sim.time * 100) / 100;
      if (!force && t - lastFrameAt < 1 / REPLAY_FPS) return;
      if (frames.length >= REPLAY_FPS * MATCH_LIMIT_SECONDS + 10) return;
      const snap = serializeSim(sim, false);
      frames.push({
        t,
        over: snap.over,
        winner: snap.winner,
        endReason: snap.endReason,
        deathMode: !!snap.deathMode,
        deathModeAt: snap.deathModeAt || 0,
        players: snap.players.map(replayPlayerSummary),
        heroes: snap.heroes,
        towers: snap.towers,
        summons: snap.summons,
        nodes: snap.nodes,
      });
      lastFrameAt = t;
    };

    record(true);
    let ticks = 0;
    while (!sim.over && sim.time < MATCH_LIMIT_SECONDS) {
      tickBattle(sim, 1 / 30);
      record(false);
      ticks += 1;
    }
    record(true);
    if (!sim.over) {
      // 极少见：强制结束，方便回放
      sim.over = true;
      sim.endReason = sim.endReason || 'time-limit';
    }

    const result = buildResult(sim);
    const replay = {
      version: REPLAY_VERSION,
      id,
      code,
      createdAt,
      endedAt: Date.now(),
      aiLevel: 'nightmare',
      manualAttack: true,
      duration: frames.length ? frames[frames.length - 1].t : 0,
      players: sim.players.map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        color: p.color,
        isAI: true,
        heroId: p.heroId,
      })),
      result,
      map,
      frames,
      events,
    };

    fs.mkdirSync(args.out, { recursive: true });
    const body = zlib.gzipSync(Buffer.from(JSON.stringify(replay)));
    fs.writeFileSync(path.join(args.out, `${id}.json.gz`), body);
    const meta = {
      id,
      code,
      createdAt,
      endedAt: replay.endedAt,
      duration: replay.duration,
      aiLevel: replay.aiLevel,
      manualAttack: replay.manualAttack !== false,
      winner: result.winnerName,
      reason: result.reason,
      players: replay.players.map((p) => p.name),
      frames: frames.length,
      bytes: body.length,
    };
    fs.writeFileSync(path.join(args.out, `${id}.meta.json`), JSON.stringify(meta));

    console.log(JSON.stringify({
      id,
      seed: args.seed,
      heroes,
      duration: replay.duration,
      ticks,
      frames: frames.length,
      events: events.length,
      bytes: body.length,
      winner: result.winnerName,
      reason: result.reason,
      kills: sim.players.reduce((a, p) => a + p.kills, 0),
      path: path.join(args.out, `${id}.json.gz`),
    }, null, 2));
  } finally {
    Math.random = originalRandom;
  }
}

main();
