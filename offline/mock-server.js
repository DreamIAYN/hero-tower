/* 塔魂离线版：浏览器内的单机房间与本地“服务器”适配层 */
(() => {
  const O = window.TowerOffline;
  if (!O) return;
  const H = O.heroes;
  const M = O.mapgen;
  const E = O.engine;
  const {
    AI_NAMES,
    AI_LEVEL_LIST,
    AI_LEVELS,
    BUILD_TOWER_BASE,
    BUILD_TOWER_PER_TOWER,
    HERO_LIST,
    ITEMS,
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
  } = H;
  const { generateMap, MAP_W, MAP_H, TILE } = M;
  const { chooseAIHero, chooseAIPlacement, createBattle, serializeSim, tickBattle, validateTowerPlacement } = E;

  let room = null;
  let timer = null;
  const streams = new Set();

  const catalog = {
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

  function newCode() {
    let s = '';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 4; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function makePlayers(name) {
    const heroes = [...AI_NAMES].sort(() => Math.random() - 0.5);
    const human = {
      id: 'offline-human',
      name: String(name || '旅者').slice(0, 12) || '旅者',
      slot: 0,
      isAI: false,
      connected: true,
      heroId: null,
      placement: null,
      ready: false,
    };
    const ais = [];
    for (let i = 1; i < 4; i += 1) {
      const place = chooseAIPlacement(roomMap, i);
      ais.push({
        id: `offline-ai-${i}`,
        name: `AI · ${heroes[i % heroes.length] || '青蛇'}`,
        slot: i,
        isAI: true,
        connected: true,
        heroId: chooseAIHero(),
        placement: place || null,
        ready: true,
      });
    }
    return [human, ...ais];
  }

  let roomMap = null;

  function createQuick(name, aiLevel) {
    roomMap = generateMap();
    const level = AI_LEVELS[aiLevel] ? aiLevel : 'normal';
    room = {
      code: newCode(),
      createdAt: Date.now(),
      hostId: 'offline-human',
      maxPlayers: 4,
      aiLevel: level,
      map: roomMap,
      phase: 'draft',
      paused: false,
      startAt: 0,
      draftEndsAt: 0,
      sim: null,
      result: null,
      lastTick: Date.now(),
      lastBroadcast: 0,
      players: makePlayers(name),
    };
    streams.clear();
    if (!timer) timer = setInterval(loop, 33);
    return { ok: true, code: room.code, playerId: 'offline-human' };
  }

  function playerColor(slot) {
    return PLAYER_COLORS[slot % PLAYER_COLORS.length];
  }

  function draftPlayer(p) {
    return {
      id: p.id,
      name: p.name,
      slot: p.slot,
      color: playerColor(p.slot),
      isAI: p.isAI,
      connected: true,
      aiControlled: p.isAI,
      heroId: p.heroId,
      hasHero: false,
      ready: !!p.ready,
      placed: !!p.placement,
      placement: p.placement,
      gold: null,
      kills: 0,
      deaths: 0,
      eliminated: false,
      heroAlive: true,
      towerAlive: true,
    };
  }

  function state() {
    if (!room) return { ok: false };
    if (room.phase === 'draft') {
      return {
        phase: 'draft',
        code: room.code,
        hostId: room.hostId,
        aiLevel: room.aiLevel,
        maxPlayers: room.maxPlayers,
        serverNow: Date.now(),
        players: room.players.map(draftPlayer),
        battle: null,
        draft: {
          endsAt: 0,
          startAt: room.startAt || 0,
          timeLeft: 0,
          startIn: room.startAt ? Math.max(0, Math.ceil((room.startAt - Date.now()) / 1000)) : 0,
          allReady: room.players.every((p) => p.ready),
          yourReady: !!room.players[0]?.ready,
        },
        result: null,
        paused: false,
        canPause: false,
        tutorial: false,
        mapSeed: room.map.seed,
      };
    }
    const battle = room.sim ? serializeSim(room.sim, true) : null;
    return {
      phase: room.phase,
      code: room.code,
      hostId: room.hostId,
      aiLevel: room.aiLevel,
      maxPlayers: room.maxPlayers,
      serverNow: Date.now(),
      players: battle ? battle.players : [],
      battle,
      draft: { endsAt: 0, startAt: 0, timeLeft: 0, startIn: 0, allReady: false, yourReady: false },
      result: room.result,
      paused: !!room.paused,
      canPause: room.phase === 'battle',
      tutorial: false,
      mapSeed: room.map.seed,
    };
  }

  function initPayload() {
    return {
      code: room?.code || '',
      playerId: 'offline-human',
      isHost: true,
      spectator: false,
      map: room?.map || null,
      catalog,
    };
  }

  function broadcast(force = false) {
    if (!room || !streams.size) return;
    const now = Date.now();
    if (!force && now - room.lastBroadcast < 55) return;
    room.lastBroadcast = now;
    const st = state();
    for (const es of streams) es.emit('state', st);
  }

  function broadcastMap() {
    if (!room) return;
    for (const es of streams) es.emit('map', { map: room.map });
  }

  function attach(es) {
    streams.add(es);
    es.emit('init', initPayload());
    es.emit('state', state());
  }

  function detach(es) {
    streams.delete(es);
  }

  function beginBattle() {
    if (!room || room.phase !== 'draft') return;
    room.phase = 'battle';
    room.paused = false;
    room.startAt = 0;
    room.lastTick = Date.now();
    room.sim = createBattle(room, room.map);
    broadcast(true);
  }

  function finishBattle() {
    if (!room || !room.sim) return;
    const sim = room.sim;
    room.phase = 'ended';
    const winner = sim.winner ? sim.players.find((p) => p.id === sim.winner) : null;
    const ranking = [...sim.players].sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      return b.kills * 160 + b.damageDealt * 0.35 - (a.kills * 160 + a.damageDealt * 0.35);
    });
    room.result = {
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
    broadcast(true);
  }

  function loop() {
    if (!room) return;
    const now = Date.now();
    if (room.phase === 'draft' && room.startAt && now >= room.startAt) {
      beginBattle();
    } else if (room.phase === 'battle' && room.sim) {
      if (!room.paused) {
        const dt = Math.min(0.12, Math.max(0.001, (now - room.lastTick) / 1000));
        room.lastTick = now;
        tickBattle(room.sim, dt);
        if (room.sim.over) finishBattle();
      } else {
        room.lastTick = now;
      }
      broadcast(false);
    }
  }

  function resetToDraft() {
    roomMap = generateMap();
    room.map = roomMap;
    room.phase = 'draft';
    room.paused = false;
    room.startAt = 0;
    room.sim = null;
    room.result = null;
    room.lastTick = Date.now();
    const human = room.players[0];
    human.placement = null;
    human.ready = false;
    for (const p of room.players) {
      if (!p.isAI) continue;
      p.heroId = chooseAIHero();
      p.placement = chooseAIPlacement(room.map, p.slot);
      p.ready = true;
    }
    broadcastMap();
    broadcast(true);
  }

  function occupied(otherId) {
    const set = new Set();
    for (const p of room.players) {
      if (p.id === otherId || !p.placement) continue;
      set.add(`${p.placement.x},${p.placement.y}`);
    }
    return set;
  }

  function handleAction(payload) {
    if (!room) return { ok: false, error: '离线房间尚未创建' };
    if (payload.code && payload.code !== room.code) return { ok: false, error: '房间不存在' };
    const action = payload.action || {};
    if (action.type === 'leave') return { ok: true };

    if (room.phase === 'draft') {
      const human = room.players[0];
      if (action.type === 'place') {
        if (human.ready) return { ok: false, error: '已锁定，不能移动魂塔' };
        const tx = Math.round(Number(action.x));
        const ty = Math.round(Number(action.y));
        const check = validateTowerPlacement(room.map, human.slot, tx, ty, occupied(human.id));
        if (!check.ok) return { ok: false, error: check.reason };
        human.placement = { x: tx, y: ty };
        broadcast(true);
        return { ok: true };
      }
      if (action.type === 'lock') {
        if (human.ready) return { ok: true };
        if (!human.placement) return { ok: false, error: '请先在地图上放置魂塔' };
        human.ready = true;
        if (!room.startAt) room.startAt = Date.now() + 1200;
        broadcast(true);
        return { ok: true };
      }
      if (action.type === 'unlock') {
        human.ready = false;
        room.startAt = 0;
        broadcast(true);
        return { ok: true };
      }
      return { ok: false, error: '当前是部署阶段' };
    }

    if (room.phase === 'ended') {
      if (action.type === 'rematch') {
        resetToDraft();
        return { ok: true };
      }
      return { ok: false, error: '对局已结束' };
    }

    if (room.phase !== 'battle') return { ok: false, error: '战斗尚未开始' };

    if (action.type === 'togglePause') {
      room.paused = !room.paused;
      room.lastTick = Date.now();
      broadcast(true);
      return { ok: true, paused: room.paused };
    }
    if (room.paused && action.type !== 'selectHero') {
      return { ok: false, error: '战斗已暂停，请先继续' };
    }
    const result = E.applyBattleAction(room.sim, 'offline-human', action);
    if (result.ok) {
      if (room.sim.over) finishBattle();
      else broadcast(true);
    }
    return result.ok ? result : { ok: false, error: result.reason };
  }

  async function localApi(url, init = {}) {
    const u = new URL(url, location.href);
    const method = (init.method || 'GET').toUpperCase();
    let body = {};
    if (init.body) {
      try { body = JSON.parse(init.body); } catch { body = {}; }
    }
    const ok = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

    if (u.pathname === '/api/quick' && method === 'POST') {
      return ok(createQuick(body.name, body.aiLevel));
    }
    if (u.pathname === '/api/action' && method === 'POST') {
      return ok(handleAction(body));
    }
    if (u.pathname === '/api/room' && method === 'POST') {
      return ok(state());
    }
    if (u.pathname === '/api/replays') {
      return ok({ ok: true, replays: [] });
    }
    if (u.pathname === '/api/health') {
      return ok({ ok: true, offline: true });
    }
    if (u.pathname === '/api/create' || u.pathname === '/api/join' || u.pathname === '/api/tutorial' || u.pathname === '/api/spectate' || u.pathname === '/api/replay') {
      return ok({ ok: false, error: '离线版只支持单人快速对战' }, 400);
    }
    return ok({ ok: false, error: '离线接口不存在' }, 404);
  }

  class OfflineEventSource {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = new Map();
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      setTimeout(() => {
        if (this.readyState === 2) return;
        this.readyState = 1;
        window.__offlineServer.attach(this);
        this.emit('open', {});
        if (typeof this.onopen === 'function') this.onopen({});
      }, 0);
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this.listeners.get(type)?.delete(fn);
    }
    emit(type, data) {
      const ev = { data: JSON.stringify(data) };
      for (const fn of this.listeners.get(type) || []) {
        try { fn(ev); } catch (err) { console.error(err); }
      }
      const direct = this[`on${type}`];
      if (typeof direct === 'function') direct(ev);
    }
    close() {
      if (this.readyState === 2) return;
      this.readyState = 2;
      window.__offlineServer.detach(this);
    }
  }
  OfflineEventSource.CONNECTING = 0;
  OfflineEventSource.OPEN = 1;
  OfflineEventSource.CLOSED = 2;

  const server = { attach, detach, createQuick, handleAction, state };
  window.__offlineServer = server;
  window.EventSource = OfflineEventSource;

  const realFetch = window.fetch.bind(window);
  window.fetch = function offlineFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (String(url).startsWith('/api/')) return localApi(String(url), init || {});
    return realFetch(input, init);
  };
})();
