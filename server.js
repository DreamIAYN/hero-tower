/**
 * 塔魂：四境争锋 — 零依赖多人服务器
 * - 房间 / 大厅 / 选将建塔 / 实时战斗
 * - SSE 推送状态，HTTP POST 发送指令
 * - AI 自动补位、掉线接管
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

import {
  HEROES,
  HERO_LIST,
  AI_LEVELS,
  AI_LEVEL_LIST,
  ITEMS,
  BUILD_TOWER_BASE,
  BUILD_TOWER_PER_TOWER,
  MANUAL_ATTACK_MULT,
  MATCH_LIMIT_SECONDS,
  PLAYER_COLORS,
  PLAYER_COLOR_NAMES,
  REPAIR_COOLDOWN,
  REPAIR_COST,
  REPAIR_RATIO,
  RESOURCE_GOLD,
  RESOURCE_RESPAWN,
  START_GOLD,
  TERRAIN_INFO,
  TOWER,
} from './shared/heroes.js';
import { generateMap, MAP_H, MAP_W, TILE } from './shared/mapgen.js';
import {
  applyBattleAction,
  chooseAIHero,
  chooseAIPlacement,
  createBattle,
  pickAIPlayers,
  serializeSim,
  tickBattle,
  validateTowerPlacement,
} from './shared/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4317);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const SHARED_DIR = path.join(__dirname, 'shared');
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, 'data', 'rooms.json');
const STATE_VERSION = 1;
const REPLAY_DIR = path.join(path.dirname(STATE_FILE), 'replays');
const REPLAY_VERSION = 1;
const REPLAY_FPS = 5;
const REPLAY_KEEP = 12;

const rooms = new Map();
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 200;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
  '.ico': 'image/x-icon',
};

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sanitizeName(name) {
  const cleaned = String(name || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 12);
  return cleaned || '无名旅者';
}

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function newRoomCode() {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function firstFreeSlot(room) {
  const used = new Set(room.players.map((p) => p.slot));
  for (let i = 0; i < room.maxPlayers; i++) {
    if (!used.has(i)) return i;
  }
  return -1;
}

function findPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId) || null;
}

function humanCount(room) {
  return room.players.filter((p) => !p.isAI).length;
}

function connectedHumans(room) {
  return room.players.filter((p) => !p.isAI && p.connected);
}

function occupiedTiles(room, excludeId = null) {
  const set = new Set();
  for (const p of room.players) {
    if (p.id === excludeId) continue;
    if (p.placement && p.placement.x != null) set.add(`${p.placement.x},${p.placement.y}`);
  }
  return set;
}

function promoteHost(room) {
  if (room.hostId && room.players.some((p) => p.id === room.hostId && p.connected)) return;
  const next = room.players.find((p) => !p.isAI && p.connected) || room.players.find((p) => !p.isAI);
  if (next) room.hostId = next.id;
}

/* ------------------------------------------------------------------ */
/* 房间快照持久化                                                       */
/* ------------------------------------------------------------------ */

let savingRooms = false;
let saveSoonTimer = null;

function saveSoon() {
  if (saveSoonTimer) return;
  saveSoonTimer = setTimeout(() => {
    saveSoonTimer = null;
    void saveRooms();
  }, 180);
}

function snapshotRoom(room) {
  const snap = {
    code: room.code,
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
    phase: room.phase,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    aiLevel: room.aiLevel || 'normal',
    mapSize: room.mapSize || 'standard',
    teamMode: room.teamMode || 'ffa',
    players: room.players.map((p) => ({ ...p })),
    spectators: [...(room.spectators || new Map()).values()].map((p) => ({ ...p })),
    map: room.map,
    draftEndsAt: room.draftEndsAt,
    startAt: room.startAt,
    battleStartedAt: room.battleStartedAt,
    paused: room.paused,
    tutorial: room.tutorial,
    endedAt: room.endedAt,
    result: room.result,
    sim: null,
  };
  if (room.sim) {
    const sim = JSON.parse(JSON.stringify(room.sim));
    delete sim.map;
    for (const p of sim.players || []) {
      delete p.hero;
      delete p.tower;
      delete p.heroes;
      delete p.towers;
    }
    snap.sim = sim;
  }
  return snap;
}

async function saveRooms() {
  if (savingRooms) return;
  savingRooms = true;
  try {
    const payload = {
      version: STATE_VERSION,
      savedAt: Date.now(),
      rooms: [...rooms.values()].map(snapshotRoom),
    };
    await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(payload), 'utf8');
    await fs.rename(tmp, STATE_FILE);
  } catch (err) {
    console.error('[persist] save failed:', err.message);
  } finally {
    savingRooms = false;
  }
}

function hydrateRoom(saved) {
  if (!saved || !saved.code || !saved.map || !Array.isArray(saved.map.tiles)) return null;
  if (!['lobby', 'draft', 'battle', 'ended'].includes(saved.phase)) return null;
  const room = {
    ...saved,
    streams: new Map(),
    lastBroadcast: 0,
    lastTick: Date.now(),
    lastActivity: Date.now(),
  };
  if (!Array.isArray(room.players) || !room.players.length) return null;
  room.spectators = new Map(
    (Array.isArray(room.spectators) ? room.spectators : []).map((p) => [
      p.id,
      { ...p, connected: false },
    ])
  );
  if (!AI_LEVELS[room.aiLevel]) room.aiLevel = 'normal';
  if (!['standard', 'large', 'xlarge'].includes(room.mapSize)) room.mapSize = 'standard';
  if (room.teamMode !== 'teams') room.teamMode = 'ffa';
  room.players.forEach((p) => {
    p.team = room.teamMode === 'teams' ? p.slot % 2 : null;
    p.connected = !!p.isAI;
  });
  if (room.phase === 'battle' || room.phase === 'ended') {
    if (!room.sim || !Array.isArray(room.sim.players)) return null;
    const sim = room.sim;
    sim.map = room.map;
    sim.players ||= [];
    sim.towers ||= [];
    sim.heroes ||= [];
    sim.summons ||= [];
    sim.summonSerial ||= 0;
    sim.nodes ||= [];
    sim.events ||= [];
    sim.eid ||= 1;
    sim.ai ||= {};
    for (const p of sim.players) {
      const towers = sim.towers.filter((t) => t.owner === p.id);
      const heroes = sim.heroes.filter((h) => h.owner === p.id);
      p.towers = towers;
      p.heroes = heroes;
      p.hero =
        heroes.find((h) => h.id === p.selectedHeroId) ||
        heroes.find((h) => h.alive) ||
        heroes[0] ||
        null;
      p.tower = p.hero
        ? towers.find((t) => t.id === p.hero.towerId) || towers[0] || null
        : towers.find((t) => t.alive) || towers[0] || null;
      p.heroId = p.hero ? p.hero.heroId : null;
      if (p.hero) p.selectedHeroId = p.hero.id;
      p.connected = !!p.isAI;
      p.aiControlled = p.isAI || !p.connected;
    }
    if (!sim.ai || typeof sim.ai !== 'object') sim.ai = {};
    for (const p of sim.players) {
      if (p.isAI && !sim.ai[p.id]) {
        sim.ai[p.id] = {
          think: 0.2 + Math.random() * 0.5,
          spend: 0.8 + Math.random() * 1.2,
          patrol: 0,
          lastGoal: null,
        };
      }
    }
    room.sim = sim;
  } else {
    room.sim = null;
  }
  if (room.phase === 'ended' && !room.result) {
    // 快照可能恰好落在结算前；保留房间，主循环会补结算。
    room.phase = 'battle';
  }
  return room;
}

async function loadRooms() {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || data.version !== STATE_VERSION || !Array.isArray(data.rooms)) {
      console.warn('[persist] ignored incompatible state file');
      return;
    }
    let restored = 0;
    for (const saved of data.rooms) {
      const room = hydrateRoom(saved);
      if (!room) continue;
      rooms.set(room.code, room);
      restored++;
    }
    if (restored) console.log(`[persist] restored ${restored} room(s) from ${STATE_FILE}`);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[persist] load failed:', err.message);
  }
}

/* ------------------------------------------------------------------ */
/* 房间                                                                */
/* ------------------------------------------------------------------ */

function createRoom(maxPlayers = 4, aiLevel = 'normal', options = {}) {
  const code = newRoomCode();
  const mapSize = options.mapSize === 'xlarge' ? 'xlarge' : options.mapSize === 'large' ? 'large' : 'standard';
  const teamMode = options.teamMode === 'teams' ? 'teams' : 'ffa';
  const room = {
    code,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    phase: 'lobby',
    hostId: null,
    aiLevel: AI_LEVELS[aiLevel] ? aiLevel : 'normal',
    mapSize,
    teamMode,
    maxPlayers: [2, 4, 6, 8].includes(Number(maxPlayers)) ? Number(maxPlayers) : 4,
    players: [],
    spectators: new Map(),
    map: generateMap(undefined, { size: mapSize }),
    draftEndsAt: 0,
    startAt: 0,
    battleStartedAt: 0,
    lastTick: 0,
    lastBroadcast: 0,
    paused: false,
    tutorial: false,
    sim: null,
    streams: new Map(),
    endedAt: null,
    result: null,
  };
  rooms.set(code, room);
  return room;
}

function teamForSlot(room, slot) {
  return room.teamMode === 'teams' ? slot % 2 : null;
}

function addHuman(room, name) {
  if (room.phase !== 'lobby') return { error: '房间已经开局' };
  if (humanCount(room) >= room.maxPlayers || room.players.length >= room.maxPlayers) {
    return { error: '房间人数已满' };
  }
  const slot = firstFreeSlot(room);
  if (slot < 0) return { error: '没有空余席位' };
  const player = {
    id: newId(),
    name: sanitizeName(name),
    slot,
    color: PLAYER_COLORS[slot % PLAYER_COLORS.length],
    isAI: false,
    team: teamForSlot(room, slot),
    connected: true,
    heroId: null,
    ready: false,
    placement: null,
    joinedAt: Date.now(),
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  room.lastActivity = Date.now();
  return { player };
}

function addSpectator(room, name) {
  if (!room.spectators) room.spectators = new Map();
  const spectator = {
    id: newId(),
    name: sanitizeName(name || '观战者'),
    isSpectator: true,
    connected: true,
    joinedAt: Date.now(),
  };
  room.spectators.set(spectator.id, spectator);
  room.lastActivity = Date.now();
  return spectator;
}

function addAIPlayers(room, count) {
  if (count <= 0) return;
  const names = pickAIPlayers(count, room.players.map((p) => p.name));
  const usedHeroes = new Set(room.players.map((p) => p.heroId).filter(Boolean));
  const heroPool = Object.keys(HEROES).filter((id) => !usedHeroes.has(id));
  for (let i = 0; i < count; i++) {
    const slot = firstFreeSlot(room);
    if (slot < 0) break;
    let heroId = heroPool[i % Math.max(1, heroPool.length)];
    if (!heroId) heroId = chooseAIHero();
    const placement = chooseAIPlacement(room.map, slot, occupiedTiles(room));
    const player = {
      id: `ai-${newId()}`,
      name: names[i] || `AI · 旅者${i + 1}`,
      slot,
      color: PLAYER_COLORS[slot % PLAYER_COLORS.length],
      isAI: true,
      team: teamForSlot(room, slot),
      connected: true,
      heroId,
      ready: true,
      placement: placement ? { x: placement.x, y: placement.y } : null,
      joinedAt: Date.now(),
    };
    room.players.push(player);
    if (placement) {
      // 后续 AI 建塔时避开已有位置
      room.players.forEach((p) => {
        if (p.placement) p.placement = { ...p.placement };
      });
    }
  }
}

function fillAI(room) {
  const need = room.maxPlayers - room.players.length;
  if (need > 0) addAIPlayers(room, need);
}

function resetForLobby(room) {
  room.phase = 'lobby';
  room.paused = false;
  room.sim = null;
  room.result = null;
  room.endedAt = null;
  room.draftEndsAt = 0;
  room.startAt = 0;
  room.map = generateMap(undefined, { size: room.mapSize || 'standard' });
  room.players = room.players.filter((p) => !p.isAI);
  for (const p of room.players) {
    p.heroId = null;
    p.team = teamForSlot(room, p.slot);
    p.ready = false;
    p.placement = null;
    p.connected = room.streams.has(p.id);
  }
  promoteHost(room);
  room.lastActivity = Date.now();
}

function addTutorialDummy(room) {
  const map = room.map;
  const dummy = {
    id: `ai-tutorial-${newId()}`,
    name: '训练木桩',
    slot: 1,
    color: PLAYER_COLORS[1],
    isAI: true,
    team: null,
    connected: true,
    heroId: 'bulwark',
    ready: true,
    placement: { x: map.center.x, y: map.center.y },
    passive: true,
    joinedAt: Date.now(),
  };
  room.players.push(dummy);
  room.tutorial = true;
}

function startDraft(room) {
  if (room.phase !== 'lobby') return;
  // 开战时清掉已断线的大厅玩家，避免幽灵席位占用 AI 补位名额
  const dropped = room.players.filter((p) => !p.isAI && !p.connected);
  if (dropped.length) {
    room.players = room.players.filter((p) => !dropped.includes(p));
    promoteHost(room);
  }
  fillAI(room);
  // 人类只部署魂塔；英雄在战斗内通过英雄祭坛召唤。AI 仍会预选英雄。
  for (const p of room.players) {
    if (!p.isAI) {
      p.heroId = null;
      p.ready = false;
      p.placement = null;
    } else {
      p.ready = true;
      if (!p.heroId) p.heroId = chooseAIHero();
      if (!p.placement) {
        const spot = chooseAIPlacement(room.map, p.slot, occupiedTiles(room, p.id));
        if (spot) p.placement = { x: spot.x, y: spot.y };
      }
    }
  }
  room.phase = 'draft';
  room.paused = false;
  room.draftEndsAt = Date.now() + (room.tutorial ? 120_000 : 45_000);
  room.startAt = 0;
  room.lastActivity = Date.now();
  broadcast(room, true);
}

function autoDraft(room) {
  for (const p of room.players) {
    if (p.isAI) continue;
    if (!p.placement) {
      const spot = chooseAIPlacement(room.map, p.slot, occupiedTiles(room, p.id));
      if (spot) p.placement = { x: spot.x, y: spot.y };
    }
    p.ready = true;
  }
}

function beginBattle(room) {
  if (room.phase !== 'draft') return;
  // 最后一刻补全所有未准备的塔位；人类英雄留到战斗内选择
  for (const p of room.players) {
    if (p.isAI && (!p.heroId || !HEROES[p.heroId])) p.heroId = chooseAIHero();
    if (!p.placement) {
      const spot = chooseAIPlacement(room.map, p.slot, occupiedTiles(room, p.id));
      if (spot) p.placement = { x: spot.x, y: spot.y };
    }
    if (!p.placement) {
      const spawn = room.map.spawns[p.slot];
      p.placement = { x: spawn.default.x, y: spawn.default.y };
    }
    p.ready = true;
  }
  room.phase = 'battle';
  room.paused = false;
  room.battleStartedAt = Date.now();
  room.lastTick = Date.now();
  room.draftEndsAt = 0;
  room.startAt = 0;
  room.result = null;
  room.sim = createBattle(room, room.map);
  startReplay(room);
  room.lastActivity = Date.now();
  saveSoon();
  broadcast(room, true);
}

function endBattleRoom(room) {
  if (room.phase !== 'battle' || !room.sim?.over) return;
  room.phase = 'ended';
  room.endedAt = Date.now();
  const sim = room.sim;
  const winner = sim.winner ? sim.players.find((p) => p.id === sim.winner) : null;
  const ranking = [...sim.players].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    return b.kills * 160 + b.damageDealt * 0.35 - (a.kills * 160 + a.damageDealt * 0.35);
  });
  const teamMode = !!sim.teamMode;
  const teamNames = ['队伍 1', '队伍 2'];
  const teamColors = ['#5bd7ff', '#ff6b61'];
  const winningTeam = teamMode ? sim.winnerTeam : null;
  room.result = {
    winnerId: teamMode
      ? (winningTeam == null ? null : `team-${winningTeam}`)
      : sim.winner,
    winnerName: teamMode
      ? (winningTeam == null ? null : teamNames[winningTeam] || `队伍 ${winningTeam + 1}`)
      : winner
        ? winner.name
        : null,
    winnerColor: teamMode
      ? (winningTeam == null ? null : teamColors[winningTeam] || null)
      : winner
        ? winner.color
        : null,
    teamMode,
    winnerTeam: winningTeam,
    winnerPlayerId: sim.winner,
    reason: sim.endReason,
    time: Math.floor(sim.time),
    timeLimit: sim.matchLimit || MATCH_LIMIT_SECONDS,
    ranking: ranking.map((p, i) => ({
      rank: i + 1,
      id: p.id,
      name: p.name,
      color: p.color,
      team: p.team ?? null,
      heroId: p.heroId,
      kills: p.kills,
      deaths: p.deaths,
      eliminated: p.eliminated,
      damage: Math.round(p.damageDealt),
      towerAlive: p.towers.some((t) => t.alive),
    })),
  };
  if (room.replay) {
    room.result.replayId = room.replay.id;
    void finalizeReplay(room);
  }
  saveSoon();
  broadcast(room, true);
}

/* ------------------------------------------------------------------ */
/* 快照 / SSE                                                          */
/* ------------------------------------------------------------------ */

function roomPlayersPublic(room, battle = null) {
  if (battle) return battle.players;
  return room.players.map((p) => ({
    id: p.id,
    name: p.name,
    slot: p.slot,
    color: p.color,
    isAI: p.isAI,
    team: p.team ?? null,
    connected: p.connected,
    aiControlled: p.isAI || !p.connected,
    heroId: p.heroId,
    hasHero: false,
    ready: p.ready,
    placed: !!p.placement,
    placement: p.placement,
    gold: null,
    kills: 0,
    deaths: 0,
    eliminated: false,
    heroAlive: true,
    towerAlive: true,
  }));
}

function roomState(room, consumeEvents = true) {
  const sim = room.sim;
  const battle = sim ? serializeSim(sim, consumeEvents) : null;
  const now = Date.now();
  return {
    phase: room.phase,
    code: room.code,
    hostId: room.hostId,
    aiLevel: room.aiLevel || 'normal',
    mapSize: room.mapSize || 'standard',
    teamMode: room.teamMode || 'ffa',
    maxPlayers: room.maxPlayers,
    serverNow: now,
    players: roomPlayersPublic(room, battle),
    battle,
    draft: {
      endsAt: room.draftEndsAt,
      startAt: room.startAt,
      timeLeft: room.draftEndsAt ? Math.max(0, Math.ceil((room.draftEndsAt - now) / 1000)) : 0,
      startIn: room.startAt ? Math.max(0, Math.ceil((room.startAt - now) / 1000)) : 0,
      allReady: room.phase === 'draft' && room.players.every((p) => p.ready),
      yourReady: false,
    },
    result: room.result,
    paused: room.phase === 'battle' ? !!room.paused : false,
    canPause: room.phase === 'battle' && humanCount(room) === 1,
    tutorial: !!room.tutorial,
    mapSeed: room.map.seed,
  };
}

function gameCatalog() {
  return {
    heroes: HERO_LIST,
    items: ITEMS,
    tower: TOWER,
    colors: PLAYER_COLORS,
    colorNames: PLAYER_COLOR_NAMES,
    startGold: START_GOLD,
    resourceGold: RESOURCE_GOLD,
    resourceRespawn: RESOURCE_RESPAWN,
    repairCost: REPAIR_COST,
    repairRatio: REPAIR_RATIO,
    repairCooldown: REPAIR_COOLDOWN,
    matchLimit: MATCH_LIMIT_SECONDS,
    buildTowerBase: BUILD_TOWER_BASE,
    buildTowerPerTower: BUILD_TOWER_PER_TOWER,
    manualAttackMult: MANUAL_ATTACK_MULT,
    aiLevels: AI_LEVEL_LIST,
    terrain: TERRAIN_INFO,
    mapW: MAP_W,
    mapH: MAP_H,
    tile: TILE,
  };
}

function initPayload(room, player) {
  return {
    code: room.code,
    playerId: player.id,
    isHost: room.hostId === player.id,
    spectator: !!player.isSpectator,
    map: room.map,
    catalog: gameCatalog(),
  };
}

function sseWrite(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // 连接已经断开，close 事件会清理
  }
}

function sendState(res, room, consumeEvents = true) {
  sseWrite(res, 'state', roomState(room, consumeEvents));
}

function broadcastMap(room) {
  if (!room.streams.size) return;
  const payload = JSON.stringify({ map: room.map });
  for (const set of room.streams.values()) {
    for (const res of set) {
      try {
        res.write(`event: map\ndata: ${payload}\n\n`);
      } catch {
        /* noop */
      }
    }
  }
}

function broadcast(room, force = false) {
  if (!room.streams.size) return;
  const now = Date.now();
  if (!force && now - room.lastBroadcast < 55) return;
  room.lastBroadcast = now;
  const state = roomState(room, true);
  const payload = JSON.stringify(state);
  for (const set of room.streams.values()) {
    for (const res of set) {
      try {
        res.write(`event: state\ndata: ${payload}\n\n`);
      } catch {
        // noop
      }
    }
  }
}


/* ------------------------------------------------------------------ */
/* 回放录制                                                            */
/* ------------------------------------------------------------------ */

function replayIdForRoom(room) {
  return `${room.code}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function replayPlayerSummary(p) {
  return {
    id: p.id,
    name: p.name,
    slot: p.slot,
    color: p.color,
    isAI: p.isAI,
    team: p.team ?? null,
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

function startReplay(room) {
  if (!room.sim || room.tutorial) return;
  room.replay = {
    id: replayIdForRoom(room),
    code: room.code,
    createdAt: Date.now(),
    aiLevel: room.aiLevel || 'normal',
    map: room.map,
    players: room.sim.players.map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      color: p.color,
      isAI: p.isAI,
      heroId: p.heroId,
    })),
    frames: [],
    events: [],
    lastFrameAt: -999,
    lastEventId: 0,
    startedAt: room.sim.startedAt,
    finished: false,
  };
  recordReplayTick(room, true);
}

function recordReplayTick(room, forceFrame = false) {
  const replay = room.replay;
  const sim = room.sim;
  if (!replay || !sim || replay.finished) return;
  for (const ev of sim.events) {
    if (ev.id <= replay.lastEventId) continue;
    replay.lastEventId = ev.id;
    replay.events.push({ ...ev, t: Math.round(sim.time * 100) / 100 });
  }
  const t = Math.round(sim.time * 100) / 100;
  if (!forceFrame && t - replay.lastFrameAt < 1 / REPLAY_FPS) return;
  if (replay.frames.length >= REPLAY_FPS * 20 * 60 + 10) return;
  const snap = serializeSim(sim, false);
  replay.frames.push({
    t,
    over: snap.over,
    winner: snap.winner,
    endReason: snap.endReason,
    teamMode: !!snap.teamMode,
    winnerTeam: snap.winnerTeam ?? null,
    deathMode: !!snap.deathMode,
    deathModeAt: snap.deathModeAt || 0,
    players: snap.players.map(replayPlayerSummary),
    heroes: snap.heroes,
    towers: snap.towers,
    summons: snap.summons,
    nodes: snap.nodes,
  });
  replay.lastFrameAt = t;
}

function replayMeta(replay, result, bytes = 0) {
  return {
    id: replay.id,
    code: replay.code,
    createdAt: replay.createdAt,
    endedAt: Date.now(),
    duration: replay.frames.length ? replay.frames[replay.frames.length - 1].t : 0,
    aiLevel: replay.aiLevel,
    winner: result?.winnerName || null,
    reason: result?.reason || null,
    players: replay.players.map((p) => p.name),
    frames: replay.frames.length,
    bytes,
  };
}

async function listReplays() {
  try {
    await fs.mkdir(REPLAY_DIR, { recursive: true });
    const files = (await fs.readdir(REPLAY_DIR)).filter((f) => f.endsWith('.meta.json'));
    const metas = [];
    for (const file of files) {
      try {
        const meta = JSON.parse(await fs.readFile(path.join(REPLAY_DIR, file), 'utf8'));
        if (meta?.id) metas.push(meta);
      } catch {
        /* ignore broken meta */
      }
    }
    metas.sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
    return metas.slice(0, REPLAY_KEEP);
  } catch {
    return [];
  }
}

async function finalizeReplay(room) {
  const replay = room.replay;
  if (!replay || replay.finished) return;
  recordReplayTick(room, true);
  replay.finished = true;
  const data = {
    version: REPLAY_VERSION,
    id: replay.id,
    code: replay.code,
    createdAt: replay.createdAt,
    endedAt: Date.now(),
    aiLevel: replay.aiLevel,
    duration: replay.frames.length ? replay.frames[replay.frames.length - 1].t : 0,
    players: replay.players,
    result: room.result,
    map: replay.map,
    frames: replay.frames,
    events: replay.events,
  };
  try {
    await fs.mkdir(REPLAY_DIR, { recursive: true });
    const body = zlib.gzipSync(Buffer.from(JSON.stringify(data)));
    await fs.writeFile(path.join(REPLAY_DIR, `${replay.id}.json.gz`), body);
    await fs.writeFile(
      path.join(REPLAY_DIR, `${replay.id}.meta.json`),
      JSON.stringify(replayMeta(replay, room.result, body.length))
    );
    const metas = await listReplays();
    for (const old of metas.slice(REPLAY_KEEP)) {
      await fs.rm(path.join(REPLAY_DIR, `${old.id}.json.gz`), { force: true });
      await fs.rm(path.join(REPLAY_DIR, `${old.id}.meta.json`), { force: true });
    }
    console.log(`[replay] saved ${replay.id} (${data.duration.toFixed(1)}s, ${(body.length / 1024).toFixed(0)} KiB)`);
  } catch (err) {
    console.error('[replay] save failed:', err.message);
  } finally {
    room.replay = null;
  }
}

function attachStream(room, player, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });
  res.flushHeaders?.();
  res.socket?.setKeepAlive?.(true);
  req.setTimeout?.(0);

  if (!room.streams.has(player.id)) room.streams.set(player.id, new Set());
  room.streams.get(player.id).add(res);
  player.connected = true;
  room.lastActivity = Date.now();
  if (room.phase === 'lobby' && !player.isSpectator) promoteHost(room);

  sseWrite(res, 'init', initPayload(room, player));
  sendState(res, room, false);

  const cleanup = () => {
    const set = room.streams.get(player.id);
    if (set) {
      set.delete(res);
      if (set.size === 0) room.streams.delete(player.id);
    }
    if (!room.streams.has(player.id)) {
      player.connected = false;
      room.lastActivity = Date.now();
      // 任意阶段掉线都保证房主不会永久落在一个离线玩家身上
      if (!player.isSpectator) promoteHost(room);
      broadcast(room, true);
    }
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);
}

/* ------------------------------------------------------------------ */
/* 动作                                                                */
/* ------------------------------------------------------------------ */

function handleAction(room, player, action) {
  if (!action || typeof action.type !== 'string') return { ok: false, error: '无效指令' };
  room.lastActivity = Date.now();

  switch (action.type) {
    case 'start': {
      if (room.phase !== 'lobby') return { ok: false, error: '当前不能开始' };
      if (room.hostId !== player.id) return { ok: false, error: '只有房主可以开始' };
      startDraft(room);
      return { ok: true };
    }
    case 'setSlots': {
      if (room.phase !== 'lobby') return { ok: false, error: '当前不能修改人数' };
      if (room.hostId !== player.id) return { ok: false, error: '只有房主可以修改人数' };
      const value = Number(action.value);
      if (![2, 4, 6, 8].includes(value)) return { ok: false, error: '人数必须是 2/4/6/8' };
      if (value < humanCount(room)) return { ok: false, error: '房间内已有更多玩家' };
      if (room.players.some((p) => p.slot >= value)) {
        return { ok: false, error: '现有席位超出该人数' };
      }
      room.maxPlayers = value;
      broadcast(room, true);
      return { ok: true };
    }
    case 'setAILevel': {
      if (room.phase !== 'lobby') return { ok: false, error: '开局后不能修改 AI 等级' };
      if (room.hostId !== player.id) return { ok: false, error: '只有房主可以修改 AI 等级' };
      const level = String(action.value || '');
      if (!AI_LEVELS[level]) return { ok: false, error: '未知 AI 等级' };
      room.aiLevel = level;
      broadcast(room, true);
      return { ok: true };
    }
    case 'setMapSize': {
      if (room.phase !== 'lobby') return { ok: false, error: '开局后不能修改地图' };
      if (room.hostId !== player.id) return { ok: false, error: '只有房主可以修改地图' };
      const size = action.value === 'xlarge' ? 'xlarge' : action.value === 'large' ? 'large' : 'standard';
      room.mapSize = size;
      room.map = generateMap(undefined, { size });
      for (const p of room.players) {
        p.placement = null;
        p.ready = false;
      }
      broadcastMap(room);
      broadcast(room, true);
      return { ok: true };
    }
    case 'setTeamMode': {
      if (room.phase !== 'lobby') return { ok: false, error: '开局后不能修改队伍模式' };
      if (room.hostId !== player.id) return { ok: false, error: '只有房主可以修改队伍模式' };
      room.teamMode = action.value === 'teams' ? 'teams' : 'ffa';
      for (const p of room.players) p.team = teamForSlot(room, p.slot);
      broadcast(room, true);
      return { ok: true };
    }
    case 'place': {
      if (room.phase !== 'draft') return { ok: false, error: '不在建塔阶段' };
      if (player.ready) return { ok: false, error: '已锁定，不能移动魂塔' };
      const tx = Math.round(Number(action.x));
      const ty = Math.round(Number(action.y));
      const check = validateTowerPlacement(room.map, player.slot, tx, ty, occupiedTiles(room, player.id));
      if (!check.ok) return { ok: false, error: check.reason };
      player.placement = { x: tx, y: ty };
      broadcast(room, true);
      return { ok: true };
    }
    case 'lock': {
      if (room.phase !== 'draft') return { ok: false, error: '不在建塔阶段' };
      if (player.ready) return { ok: true };
      if (!player.placement) return { ok: false, error: '请先在地图上放置魂塔' };
      player.ready = true;
      if (room.players.every((p) => p.ready) && !room.startAt) {
        room.startAt = Date.now() + 1600;
      }
      broadcast(room, true);
      return { ok: true };
    }
    case 'unlock': {
      if (room.phase !== 'draft') return { ok: false, error: '不在建塔阶段' };
      player.ready = false;
      room.startAt = 0;
      broadcast(room, true);
      return { ok: true };
    }
    case 'rematch': {
      if (room.phase !== 'ended') return { ok: false, error: '当前不能重开' };
      if (room.hostId !== player.id) return { ok: false, error: '只有房主可以重开' };
      resetForLobby(room);
      broadcastMap(room);
      broadcast(room, true);
      return { ok: true };
    }
    case 'leave': {
      // 大厅里退出会释放席位；战斗/结算中只依赖 SSE 关闭后的掉线托管。
      if (room.phase === 'lobby') {
        room.players = room.players.filter((p) => p.id !== player.id);
        if (room.hostId === player.id) promoteHost(room);
        if (!room.players.some((p) => !p.isAI)) {
          rooms.delete(room.code);
        } else {
          broadcast(room, true);
        }
      }
      return { ok: true };
    }
    case 'togglePause': {
      if (room.phase !== 'battle' || !room.sim) return { ok: false, error: '战斗尚未开始' };
      if (humanCount(room) !== 1) return { ok: false, error: '多人对局不能中途暂停' };
      const simPlayer = room.sim.players.find((p) => p.id === player.id);
      if (!simPlayer || simPlayer.eliminated) return { ok: false, error: '已被淘汰，无法暂停' };
      room.paused = !room.paused;
      room.lastTick = Date.now();
      if (room.paused) {
        for (const sp of room.sim.players) {
          for (const h of sp.heroes) h.inputDir = null;
        }
      }
      broadcast(room, true);
      return { ok: true, paused: room.paused };
    }
    case 'move':
    case 'moveDir':
    case 'attack':
    case 'skill':
    case 'summon':
    case 'selectHero':
    case 'buildTower':
    case 'focusFire':
    case 'toggleKite':
    case 'toggleAutoSelect':
    case 'upgradeHero':
    case 'upgradeTower':
    case 'buyItem':
    case 'repair': {
      if (room.phase !== 'battle' || !room.sim) return { ok: false, error: '战斗尚未开始' };
      if (room.sim.over) return { ok: false, error: '战斗已结束' };
      if (room.paused && action.type !== 'selectHero') return { ok: false, error: '战斗已暂停，请先继续' };
      const result = applyBattleAction(room.sim, player.id, action);
      if (result.ok) broadcast(room, true);
      return result.ok ? result : { ok: false, error: result.reason };
    }
    default:
      return { ok: false, error: '未知指令' };
  }
}

/* ------------------------------------------------------------------ */
/* HTTP 服务器                                                         */
/* ------------------------------------------------------------------ */

async function serveStatic(req, res, pathname) {
  let base = PUBLIC_DIR;
  let rel = pathname;
  if (pathname.startsWith('/shared/')) {
    base = SHARED_DIR;
    rel = pathname.slice('/shared'.length);
  }
  if (pathname === '/' || pathname === '') rel = '/index.html';
  const resolved = path.resolve(base, '.' + rel);
  if (!resolved.startsWith(base + path.sep) && resolved !== path.join(base, 'index.html')) {
    json(res, 403, { error: 'forbidden' });
    return;
  }
  try {
    const file = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const isFont = ext === '.woff2' || ext === '.otf';
    const isAsset = ext === '.js' || ext === '.css';
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': file.length,
      'Cache-Control': isFont
        ? 'public, max-age=604800, immutable'
        : isAsset
          ? 'public, max-age=60'
          : isHtml
            ? 'public, max-age=30'
            : 'no-store',
    });
    res.end(file);
  } catch {
    json(res, 404, { error: 'not found' });
  }
}

async function handleApi(req, res, pathname, query) {
  if (pathname === '/api/health') {
    json(res, 200, { ok: true, rooms: rooms.size, uptime: process.uptime() });
    return;
  }

  if (pathname === '/api/replays' && req.method === 'GET') {
    json(res, 200, { ok: true, replays: await listReplays() });
    return;
  }

  if (pathname === '/api/replay' && req.method === 'GET') {
    const id = String(query.get('id') || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!id) {
      json(res, 400, { error: '回放编号无效' });
      return;
    }
    try {
      const raw = await fs.readFile(path.join(REPLAY_DIR, `${id}.json.gz`));
      const replay = JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
      json(res, 200, { ok: true, replay, catalog: gameCatalog() });
    } catch {
      json(res, 404, { error: '回放不存在或已过期' });
    }
    return;
  }

  if (pathname === '/api/stream') {
    const code = String(query.get('code') || '').toUpperCase();
    const pid = String(query.get('pid') || '');
    const room = rooms.get(code);
    if (!room) {
      json(res, 404, { error: '房间不存在' });
      return;
    }
    const player = findPlayer(room, pid);
    const spectator = player ? null : room.spectators?.get(pid);
    if (!player && !spectator) {
      json(res, 403, { error: '玩家身份无效' });
      return;
    }
    if (player?.isAI) {
      json(res, 403, { error: 'AI 不能连接' });
      return;
    }
    attachStream(room, player || spectator, req, res);
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'method not allowed' });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    json(res, 400, { error: '请求格式错误' });
    return;
  }

  if (rooms.size >= MAX_ROOMS && ['/api/create', '/api/quick', '/api/tutorial', '/api/spectate'].includes(pathname)) {
    json(res, 503, { error: '当前房间数量已满，请稍后再试' });
    return;
  }

  if (pathname === '/api/create') {
    const room = createRoom(Number(body.maxPlayers) || 4, body.aiLevel, { mapSize: body.mapSize, teamMode: body.teamMode });
    const added = addHuman(room, body.name);
    if (added.error) {
      json(res, 400, { error: added.error });
      return;
    }
    json(res, 200, { ok: true, code: room.code, playerId: added.player.id });
    return;
  }

  if (pathname === '/api/quick') {
    const room = createRoom(Number(body.maxPlayers) || 4, body.aiLevel, { mapSize: body.mapSize, teamMode: body.teamMode });
    const added = addHuman(room, body.name);
    if (added.error) {
      json(res, 400, { error: added.error });
      return;
    }
    fillAI(room);
    startDraft(room);
    json(res, 200, { ok: true, code: room.code, playerId: added.player.id });
    return;
  }

  if (pathname === '/api/tutorial') {
    const room = createRoom(2, 'normal');
    const added = addHuman(room, body.name);
    if (added.error) {
      json(res, 400, { error: added.error });
      return;
    }
    addTutorialDummy(room);
    startDraft(room);
    json(res, 200, { ok: true, code: room.code, playerId: added.player.id, tutorial: true });
    return;
  }

  if (pathname === '/api/spectate') {
    const room = createRoom(Number(body.maxPlayers) || 4, body.aiLevel, { mapSize: body.mapSize, teamMode: body.teamMode });
    fillAI(room);
    const spectator = addSpectator(room, body.name);
    startDraft(room);
    beginBattle(room);
    json(res, 200, { ok: true, code: room.code, playerId: spectator.id, spectator: true });
    return;
  }

  if (pathname === '/api/join') {
    const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const room = rooms.get(code);
    if (!room) {
      json(res, 404, { error: '房间不存在' });
      return;
    }
    if (room.phase !== 'lobby') {
      json(res, 400, { error: '这局已经开始，请等待下一局' });
      return;
    }
    const added = addHuman(room, body.name);
    if (added.error) {
      json(res, 400, { error: added.error });
      return;
    }
    broadcast(room, true);
    json(res, 200, { ok: true, code: room.code, playerId: added.player.id });
    return;
  }

  if (pathname === '/api/action') {
    const code = String(body.code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      json(res, 404, { error: '房间不存在' });
      return;
    }
    const player = findPlayer(room, String(body.playerId || ''));
    if (!player || player.isAI) {
      json(res, 403, { error: '身份无效' });
      return;
    }
    const result = handleAction(room, player, body.action || {});
    if (result.ok) saveSoon();
    json(res, 200, result);
    return;
  }

  if (pathname === '/api/room') {
    const code = String(body.code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      json(res, 404, { error: '房间不存在' });
      return;
    }
    const player = findPlayer(room, String(body.playerId || '')) || room.spectators?.get(String(body.playerId || ''));
    if (!player) {
      json(res, 403, { error: '身份无效' });
      return;
    }
    json(res, 200, roomState(room, false));
    return;
  }

  json(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsed.pathname);
  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, parsed.searchParams);
      return;
    }
    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) json(res, 500, { error: 'internal error' });
    else res.end();
  }
});

/* ------------------------------------------------------------------ */
/* 主循环                                                              */
/* ------------------------------------------------------------------ */

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.phase === 'draft') {
      if (!room.startAt && room.players.length && room.players.every((p) => p.ready)) {
        room.startAt = now + 1600;
      }
      if (!room.startAt && now >= room.draftEndsAt) {
        autoDraft(room);
        room.startAt = now + 1200;
        broadcast(room, true);
      }
      if (room.startAt && now >= room.startAt) {
        beginBattle(room);
      }
    } else if (room.phase === 'battle' && room.sim) {
      for (const sp of room.sim.players) {
        const rp = findPlayer(room, sp.id);
        if (rp) sp.connected = rp.connected;
      }
      if (room.paused) {
        room.lastTick = now;
      } else {
        const dt = room.lastTick ? Math.min(0.12, Math.max(0.001, (now - room.lastTick) / 1000)) : 1 / 30;
        room.lastTick = now;
        tickBattle(room.sim, dt);
        recordReplayTick(room, room.sim.over);
        if (room.sim.over) endBattleRoom(room);
      }
    }
    if (room.streams.size) broadcast(room, false);
  }

  // 清理长时间无人的房间
  for (const [code, room] of rooms) {
    const hasPeople = [...room.streams.values()].some((set) => set.size > 0);
    const idle = now - room.lastActivity;
    if (!hasPeople && idle > 180_000) rooms.delete(code);
    else if (room.phase === 'ended' && room.endedAt && now - room.endedAt > 600_000) rooms.delete(code);
  }
}, 33);

setInterval(() => {
  for (const room of rooms.values()) {
    for (const set of room.streams.values()) {
      for (const res of set) {
        try {
          res.write(': heartbeat\n\n');
        } catch {
          // noop
        }
      }
    }
  }
}, 15_000);

await loadRooms();
server.listen(PORT, HOST, () => {
  console.log(`\n  塔魂：四境争锋  ->  http://127.0.0.1:${PORT}\n`);
  console.log(`  LAN: http://<本机IP>:${PORT}   房间最多 4 人，空位由 AI 补足`);
  console.log(`  房间快照: ${STATE_FILE}（每 2 秒 + 退出时保存）\n`);
});

const persistTimer = setInterval(saveRooms, 2000);
persistTimer.unref?.();

let shuttingDown = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await saveRooms();
    } finally {
      process.exit(0);
    }
  });
}
