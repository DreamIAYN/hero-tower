/**
 * 塔魂：四境争锋 — 服务器权威战斗引擎
 * 纯逻辑，不依赖 DOM / Node，方便测试与复用。
 */

import {
  AI_NAMES,
  AI_LEVELS,
  AI_HERO_TUNING,
  BOUNTY_RATIO,
  HEROES,
  HERO_INCOME,
  HERO_INCOME_PER_LEVEL,
  HERO_UPGRADE,
  ITEMS,
  MATCH_LIMIT_SECONDS,
  PLAYER_COLORS,
  REPAIR_COST,
  REPAIR_RATIO,
  REPAIR_COOLDOWN,
  RESOURCE_GOLD,
  RESOURCE_PICKUP_RANGE,
  RESOURCE_RESPAWN,
  DEATH_MODE_AT,
  resourceRespawnSeconds,
  RESPAWN_BASE,
  RESPAWN_PER_LEVEL,
  START_GOLD,
  BUILD_TOWER_BASE,
  BUILD_TOWER_PER_TOWER,
  MANUAL_ATTACK_MIN_INTERVAL,
  MANUAL_ATTACK_MULT,
  TOWER,
  heroStats,
  heroUpgradeCost,
  itemCost,
  towerStats,
  towerUpgradeCost,
} from './heroes.js';
import {
  findPathWorld,
  nearestPassableTile,
  terrainSpeed,
  tileBuildable,
  tileCenter,
  tilePassable,
  worldToTile,
} from './mapgen.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function addEvent(sim, type, data = {}) {
  const event = { id: sim.eid++, type, ...data };
  sim.events.push(event);
  if (sim.events.length > 240) sim.events.shift();
  return event;
}

function playerOf(sim, ownerId) {
  return sim.players.find((p) => p.id === ownerId) || null;
}

function teamOfPlayer(sim, ownerId) {
  if (!sim.teamMode) return null;
  const p = playerOf(sim, ownerId);
  return p && p.team != null ? p.team : null;
}

function sameTeam(sim, a, b) {
  if (a === b) return true;
  if (!sim.teamMode) return false;
  const ta = teamOfPlayer(sim, a);
  const tb = teamOfPlayer(sim, b);
  return ta != null && ta === tb;
}

function isEnemy(sim, a, b) {
  return a !== b && !sameTeam(sim, a, b);
}

function entityById(sim, kind, id) {
  if (kind === 'hero') return sim.heroes.find((h) => h.id === id) || null;
  if (kind === 'tower') return sim.towers.find((t) => t.id === id) || null;
  if (kind === 'summon') return sim.summons.find((s) => s.id === id) || null;
  return null;
}

function resolveTarget(sim, target) {
  if (!target) return null;
  return entityById(sim, target.kind, target.id);
}

function enemiesOf(sim, ownerId, kind = null) {
  const out = [];
  if (!kind || kind === 'hero') {
    for (const h of sim.heroes) {
      if (h.alive && isEnemy(sim, ownerId, h.owner)) out.push(h);
    }
  }
  if (!kind || kind === 'tower') {
    for (const t of sim.towers) {
      if (t.alive && isEnemy(sim, ownerId, t.owner)) out.push(t);
    }
  }
  if (!kind || kind === 'summon') {
    for (const s of sim.summons) {
      if (s.alive && isEnemy(sim, ownerId, s.owner)) out.push(s);
    }
  }
  return out;
}

function alliesOf(sim, ownerId) {
  const out = [];
  for (const h of sim.heroes) if (h.alive && sameTeam(sim, ownerId, h.owner)) out.push(h);
  for (const t of sim.towers) if (t.alive && sameTeam(sim, ownerId, t.owner)) out.push(t);
  for (const s of sim.summons) if (s.alive && sameTeam(sim, ownerId, s.owner)) out.push(s);
  return out;
}

function attackReach(hero, target) {
  const radius = target.radius || 14;
  return hero.range + radius;
}

function nearestEnemyInRange(sim, hero, range) {
  let best = null;
  let bestDist = Infinity;
  for (const target of enemiesOf(sim, hero.owner)) {
    const d = distance(hero, target);
    const reach = range + (target.radius || 0);
    if (d <= reach && d < bestDist) {
      best = target;
      bestDist = d;
    }
  }
  return best;
}

function addGold(sim, player, amount, sourceUnit, x, y, label = null) {
  if (!player || amount <= 0) return;
  player.gold += amount;
  if (sourceUnit) sourceUnit.earned += amount;
  addEvent(sim, 'gold', {
    x,
    y,
    amount: Math.round(amount),
    label: label || `+${Math.round(amount)}`,
  });
}

function refreshHeroStats(hero, healDelta = false) {
  const stats = heroStats(hero.heroId, hero.level);
  const oldMax = hero.maxHp;
  hero.maxHp = stats.maxHp;
  hero.damage = stats.damage;
  hero.armor = stats.armor;
  hero.income = stats.income;
  if (healDelta && hero.alive) hero.hp = Math.min(hero.maxHp, hero.hp + (hero.maxHp - oldMax));
  else if (hero.alive) hero.hp = Math.min(hero.hp, hero.maxHp);
}

function refreshTowerStats(tower, healDelta = false) {
  const stats = towerStats(tower.level, tower.cannonCount, tower.wallCount, tower.mintCount);
  const oldMax = tower.maxHp;
  tower.maxHp = stats.maxHp;
  tower.armor = stats.armor;
  tower.income = stats.income;
  tower.cannonDamage = stats.cannonDamage * (1 + 0.55 * Math.max(0, tower.cannonCount - 1));
  tower.cannonRange = stats.cannonRange;
  tower.radius = TOWER.radius;
  if (healDelta) tower.hp = Math.min(tower.maxHp, tower.hp + Math.max(0, tower.maxHp - oldMax));
  else tower.hp = Math.min(tower.hp, tower.maxHp);
}

function spawnPointNearTower(map, tower) {
  const tile = worldToTile(map, tower.x, tower.y);
  // 英雄出生在魂塔背向地图中央的一侧，避免开局就暴露在争夺区火力内。
  const ox = Math.sign(tower.tx - map.center.x) || (tower.tx < map.w / 2 ? -1 : 1);
  const oy = Math.sign(tower.ty - map.center.y) || (tower.ty < map.h / 2 ? -1 : 1);
  const candidates = [
    [ox * 2, oy * 2],
    [ox * 2, oy],
    [ox, oy * 2],
    [ox * 2, 0],
    [0, oy * 2],
    [ox * 3, oy * 3],
    [ox * 3, 0],
    [0, oy * 3],
    [ox, oy],
    [ox, 0],
    [0, oy],
    [-ox * 2, -oy * 2],
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  for (const [dx, dy] of candidates) {
    const x = tile.x + dx;
    const y = tile.y + dy;
    if (tileBuildable(map, x, y)) {
      const c = tileCenter(map, x, y);
      return { x: c.x, y: c.y };
    }
  }
  return { x: tower.x + 38, y: tower.y };
}

function validatePlacementInternal(map, spawnIndex, tx, ty, occupied = new Set()) {
  // 无领地限制：全图任何可建造地块都可以放塔，只排除资源点与已有魂塔。
  if (!tileBuildable(map, tx, ty)) return { ok: false, reason: '该地形无法建造魂塔' };
  if (map.nodes.some((n) => n.x === tx && n.y === ty)) return { ok: false, reason: '不能建在资源点上' };
  if (occupied.has(`${tx},${ty}`)) return { ok: false, reason: '这里已经有魂塔了' };
  return { ok: true };
}

export function validateTowerPlacement(map, spawnIndex, tx, ty, occupied = new Set()) {
  return validatePlacementInternal(map, spawnIndex, tx, ty, occupied);
}

export function chooseAIPlacement(map, spawnIndex, occupied = new Set()) {
  const spawn = map.spawns[spawnIndex];
  if (!spawn) return null;
  const candidates = [];
  for (let y = 1; y < map.h - 1; y++) {
    for (let x = 1; x < map.w - 1; x++) {
      if (!tileBuildable(map, x, y)) continue;
      if (map.nodes.some((n) => n.x === x && n.y === y)) continue;
      if (occupied.has(`${x},${y}`)) continue;
      const spawnDist = Math.hypot(x - spawn.cx, y - spawn.cy);
      const centerDist = Math.hypot(x - map.center.x, y - map.center.y);
      // AI 仍偏好靠近自己一侧的角落，但不再受任何区域边界限制。
      const cornerScore = -Math.abs(spawnDist - 4.6) * 1.4;
      const centerScore = centerDist > 6 ? 0.8 : 0;
      candidates.push({
        x,
        y,
        weight: cornerScore + centerScore + Math.random() * 4.2,
      });
    }
  }
  candidates.sort((a, b) => b.weight - a.weight);
  return candidates[0] || null;
}

export function chooseAIHero(preferred = []) {
  const pool = preferred.length ? preferred.filter((id) => HEROES[id]) : [];
  const fallback = Object.keys(HEROES);
  const list = pool.length ? pool : fallback;
  return list[Math.floor(Math.random() * list.length)];
}

/* ------------------------------------------------------------------ */
/* 英雄 / 魂塔 创建                                                    */
/* ------------------------------------------------------------------ */

function createTowerEntity(sim, player, tx, ty) {
  const c = tileCenter(sim.map, tx, ty);
  player.towerSerial = (player.towerSerial || 0) + 1;
  const tower = {
    id: `tower-${player.id}-${player.towerSerial}`,
    kind: 'tower',
    owner: player.id,
    name: `${player.name}的魂塔`,
    x: c.x,
    y: c.y,
    tx,
    ty,
    radius: TOWER.radius,
    level: 1,
    hp: 0,
    maxHp: 0,
    armor: 0,
    income: 0,
    cannonCount: 0,
    wallCount: 0,
    mintCount: 0,
    cannonDamage: 0,
    cannonRange: 0,
    cannonCd: 0,
    shield: 0,
    shieldUntil: 0,
    earned: 0,
    alive: true,
    heroId: null,
    lastDamagedAt: -99,
    lastRepairAt: -99,
    destroyedAt: null,
  };
  refreshTowerStats(tower);
  tower.hp = tower.maxHp;
  return tower;
}

function createHeroEntity(sim, player, tower, heroId) {
  const def = HEROES[heroId];
  const stats = heroStats(heroId, 1);
  const spawnPoint = spawnPointNearTower(sim.map, tower);
  player.heroSerial = (player.heroSerial || 0) + 1;
  return {
    id: `hero-${player.id}-${player.heroSerial}`,
    kind: 'hero',
    owner: player.id,
    towerId: tower.id,
    heroId,
    name: def.name,
    x: spawnPoint.x,
    y: spawnPoint.y,
    radius: def.radius,
    level: 1,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    damage: stats.damage,
    armor: stats.armor,
    income: stats.income,
    range: def.range,
    speed: def.speed,
    attackInterval: def.attackInterval,
    ranged: def.ranged,
    passive: !!player.passive,
    attackCd: 0,
    skillCd: 0,
    shield: 0,
    shieldUntil: 0,
    slowUntil: 0,
    slowFactor: 1,
    rootUntil: 0,
    enraged: false,
    alive: true,
    respawnAt: 0,
    target: null,
    chase: false,
    path: [],
    repathAt: 0,
    lastManualAt: -99,
    kite: !player.isAI,
    inputDir: null,
    earned: 0,
    kills: 0,
    deaths: 0,
    lastDamagedAt: -99,
    lastAutoAcquire: 0,
  };
}

function findSummonSpawn(sim, hero, index, total, gap) {
  const base = (Math.PI * 2 * index) / Math.max(1, total) - Math.PI / 2;
  for (const ring of [gap, gap + 12, gap + 24, 10]) {
    const x = hero.x + Math.cos(base) * ring;
    const y = hero.y + Math.sin(base) * ring;
    const tile = worldToTile(sim.map, x, y);
    if (tileBuildable(sim.map, tile.x, tile.y)) {
      return { x, y };
    }
  }
  return { x: hero.x, y: hero.y };
}

function createSummonEntity(sim, player, sourceHero, summonType, skill, index, total) {
  const def = HEROES[sourceHero.heroId];
  const isClone = summonType === 'clone';
  const level = sourceHero.level;
  const maxHp = isClone
    ? sourceHero.maxHp * skill.cloneHpRatio
    : skill.minionHp + skill.minionHpPerLevel * (level - 1);
  const damage = isClone
    ? sourceHero.damage * skill.cloneDamageRatio
    : skill.minionDamage + skill.minionDamagePerLevel * (level - 1);
  const point = findSummonSpawn(sim, sourceHero, index, total, isClone ? 64 : 30);
  const unit = {
    id: `summon-${player.id}-${++sim.summonSerial}`,
    kind: 'summon',
    summonType,
    owner: player.id,
    sourceHeroId: sourceHero.id,
    heroId: sourceHero.heroId,
    name: isClone ? '镜像' : '灵仆',
    icon: isClone ? def.icon : '仆',
    color: isClone ? def.color : '#5eead4',
    accent: isClone ? def.accent : '#ccfbf1',
    level,
    x: point.x,
    y: point.y,
    radius: isClone ? Math.max(9, sourceHero.radius * 0.92) : skill.minionRadius,
    hp: Math.round(maxHp),
    maxHp: Math.round(maxHp),
    damage,
    armor: isClone ? sourceHero.armor : skill.minionArmor,
    range: isClone ? sourceHero.range : skill.minionRange,
    speed: isClone ? sourceHero.speed : skill.minionSpeed,
    attackInterval: isClone ? sourceHero.attackInterval : skill.minionAttackInterval,
    ranged: isClone ? sourceHero.ranged : false,
    towerId: null,
    attackCd: 0,
    expiresAt: sim.time + skill.duration,
    duration: skill.duration,
    alive: true,
    target: null,
    chase: false,
    path: [],
    repathAt: 0,
    repathInterval: isClone ? 0.5 : 0.8,
    slowUntil: 0,
    slowFactor: 1,
    rootUntil: 0,
    enraged: false,
    shield: 0,
    shieldUntil: 0,
    lastDamagedAt: -99,
    lastManualAt: -99,
    earned: 0,
    nextAcquireAt: 0,
  };
  sim.summons.push(unit);
  addEvent(sim, 'summonSpawn', {
    x: unit.x,
    y: unit.y,
    owner: player.id,
    summonType,
    name: unit.name,
    color: unit.color,
    duration: skill.duration,
  });
  return unit;
}

function expireSummon(sim, unit, reason = 'expire') {
  if (!unit || !unit.alive) return;
  unit.alive = false;
  unit.hp = 0;
  unit.target = null;
  unit.chase = false;
  unit.path = [];
  addEvent(sim, 'summonExpire', {
    x: unit.x,
    y: unit.y,
    owner: unit.owner,
    summonType: unit.summonType,
    name: unit.name,
    color: unit.color,
  });
}

function handleSummonDeath(sim, unit) {
  if (!unit || !unit.alive) return;
  unit.alive = false;
  unit.hp = 0;
  unit.target = null;
  unit.chase = false;
  unit.path = [];
  addEvent(sim, 'summonDeath', {
    x: unit.x,
    y: unit.y,
    owner: unit.owner,
    summonType: unit.summonType,
    name: unit.name,
    color: unit.color,
  });
}

function syncSelected(player) {
  let hero = player.heroes.find((h) => h.id === player.selectedHeroId) || null;
  if (!hero) hero = player.heroes.find((h) => h.alive) || player.heroes[0] || null;
  player.hero = hero;
  player.heroId = hero ? hero.heroId : null;
  player.tower = hero
    ? player.towers.find((t) => t.id === hero.towerId) || player.towers[0] || null
    : player.towers.find((t) => t.alive) || player.towers[0] || null;
}

function ensureAliveSelection(player) {
  if (!player.hero || !player.hero.alive) {
    const next = player.heroes.find((h) => h.alive);
    if (next) {
      player.selectedHeroId = next.id;
      player.manualHeroSelect = false;
    }
  }
  syncSelected(player);
}

export function nextBuildBaseCost(player) {
  return BUILD_TOWER_BASE + BUILD_TOWER_PER_TOWER * player.towers.length;
}

export function buildTowerCost(player, heroId) {
  const def = HEROES[heroId];
  if (!def) return Infinity;
  return nextBuildBaseCost(player) + def.price;
}

function createHeroForTower(sim, player, tower, heroId) {
  const hero = createHeroEntity(sim, player, tower, heroId);
  tower.heroId = hero.id;
  player.heroes.push(hero);
  sim.heroes.push(hero);
  player.selectedHeroId = hero.id;
  player.manualHeroSelect = false;
  syncSelected(player);
  return hero;
}

export function summonHeroOnTower(sim, player, tower, heroId) {
  if (!sim || sim.over) return { ok: false, reason: '战斗已结束' };
  if (!player || player.eliminated) return { ok: false, reason: '你已被淘汰' };
  const def = HEROES[heroId];
  if (!def) return { ok: false, reason: '未知英雄' };
  if (!tower || !tower.alive) return { ok: false, reason: '魂塔已被摧毁' };
  if (tower.heroId) return { ok: false, reason: '这座魂塔已经有英雄了' };
  if (player.gold < def.price) return { ok: false, reason: '金币不足，无法召唤该英雄' };
  player.gold -= def.price;
  const hero = createHeroForTower(sim, player, tower, heroId);
  addEvent(sim, 'summon', {
    x: hero.x,
    y: hero.y,
    owner: player.id,
    heroId,
    name: hero.name,
    color: def.color,
    price: def.price,
    towerId: tower.id,
  });
  return { ok: true };
}

export function summonHero(sim, player, heroId) {
  if (!sim || sim.over) return { ok: false, reason: '战斗已结束' };
  if (!player || player.eliminated) return { ok: false, reason: '你已被淘汰' };
  const tower = player.towers.find((t) => t.alive && !t.heroId);
  if (!tower) return { ok: false, reason: '没有空置的魂塔可以召唤' };
  return summonHeroOnTower(sim, player, tower, heroId);
}

export function buildTower(sim, player, heroId, tx, ty) {
  if (!sim || sim.over) return { ok: false, reason: '战斗已结束' };
  if (!player || player.eliminated) return { ok: false, reason: '你已被淘汰' };
  if (sim.deathMode) return { ok: false, reason: '死亡模式：无法新建魂塔' };
  const def = HEROES[heroId];
  if (!def) return { ok: false, reason: '未知英雄' };
  if (!tileBuildable(sim.map, tx, ty)) return { ok: false, reason: '该地形无法建造魂塔' };
  if (sim.map.nodes.some((n) => n.x === tx && n.y === ty)) return { ok: false, reason: '不能建在资源点上' };
  if (sim.towers.some((t) => t.tx === tx && t.ty === ty)) return { ok: false, reason: '这里已经有魂塔了' };
  const cost = Math.ceil(buildTowerCost(player, heroId));
  if (player.gold < cost) return { ok: false, reason: `金币不足（需要 ${cost}）` };
  player.gold -= cost;
  const tower = createTowerEntity(sim, player, tx, ty);
  player.towers.push(tower);
  sim.towers.push(tower);
  const hero = createHeroForTower(sim, player, tower, heroId);
  addEvent(sim, 'buildTower', {
    x: tower.x,
    y: tower.y,
    owner: player.id,
    heroId,
    name: def.name,
    color: def.color,
    cost,
    towerId: tower.id,
  });
  addEvent(sim, 'summon', {
    x: hero.x,
    y: hero.y,
    owner: player.id,
    heroId,
    name: hero.name,
    color: def.color,
    price: def.price,
    towerId: tower.id,
  });
  return { ok: true, cost };
}

/* ------------------------------------------------------------------ */
/* 创建战斗                                                            */
/* ------------------------------------------------------------------ */

export function createBattle(room, map) {
  const sim = {
    map,
    time: 0,
    startedAt: Date.now(),
    players: [],
    heroes: [],
    towers: [],
    summons: [],
    summonSerial: 0,
    nodes: map.nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      gold: n.gold || RESOURCE_GOLD,
      available: true,
      respawnAt: 0,
      respawnTotal: RESOURCE_RESPAWN,
    })),
    events: [],
    eid: 1,
    over: false,
    winner: null,
    winnerTeam: null,
    endReason: null,
    deathMode: false,
    deathWarned: false,
    deathModeAt: 0,
    tutorial: !!room.tutorial,
    teamMode: room.teamMode === 'teams',
    manualAttack: room.manualAttack !== false,
    matchLimit: map.size === 'xlarge' ? 24 * 60 : map.w > 50 ? 20 * 60 : MATCH_LIMIT_SECONDS,
    deathModeAt: map.size === 'xlarge' ? 22 * 60 : map.w > 50 ? 18 * 60 : DEATH_MODE_AT,
    aiLevel: AI_LEVELS[room.aiLevel] ? room.aiLevel : 'normal',
    ai: {},
  };

  room.players.forEach((rp, index) => {
    const slot = rp.slot;
    const spawn = map.spawns[slot];
    const placement = rp.placement && rp.placement.ok !== false
      ? { x: rp.placement.x, y: rp.placement.y }
      : { x: spawn.default.x, y: spawn.default.y };
    const towerCenter = tileCenter(map, placement.x, placement.y);

    const aiBaseCfg = AI_LEVELS[sim.aiLevel] || AI_LEVELS.normal;
    // 6 CPS（噩梦）使用完整英雄平衡表；4 CPS（困难）按基础点击伤害/金币缩放，
    // 避免困难 AI 随机到苍隼时过强、随机到镜影时过弱。
    const useHeroTuning = rp.isAI && (aiBaseCfg.cps || 0) >= 4;
    const rawTuning = useHeroTuning ? (AI_HERO_TUNING[rp.heroId] || {}) : {};
    const balanceScale = (aiBaseCfg.cps || 0) >= 6 ? 1 : (aiBaseCfg.clickDamage || 0.55) / 0.55;
    const heroTuning = useHeroTuning
      ? {
          ...rawTuning,
          ...(rawTuning.clickDamage != null
            ? { clickDamage: (aiBaseCfg.clickDamage || 0.55) * (rawTuning.clickDamage / 0.55) }
            : {}),
          ...(rawTuning.startGold != null
            ? { startGold: Math.round(rawTuning.startGold * ((aiBaseCfg.startGoldBonus || 0) / 250)) }
            : {}),
        }
      : {};
    const scaleRange = (range, scale) => [
      range[0] * (scale || 1),
      range[1] * (scale || 1),
    ];
    const aiCfg = rp.isAI
      ? {
          ...aiBaseCfg,
          ...heroTuning,
          think: heroTuning.think || scaleRange(aiBaseCfg.think, heroTuning.thinkScale),
          spend: heroTuning.spend || scaleRange(aiBaseCfg.spend, heroTuning.spendScale),
          startGoldBonus:
            (aiBaseCfg.startGoldBonus || 0) + (heroTuning.startGold || 0),
        }
      : aiBaseCfg;

    const player = {
      id: rp.id,
      name: rp.name,
      slot,
      color: PLAYER_COLORS[slot % PLAYER_COLORS.length],
      isAI: rp.isAI,
      team: room.teamMode === 'teams' ? slot % 2 : null,
      connected: rp.connected !== false,
      heroId: null,
      preferredHeroId: HEROES[rp.heroId] ? rp.heroId : null,
      passive: !!rp.passive,
      gold: START_GOLD + (room.tutorial && !rp.isAI ? 400 : 0) +
        (rp.isAI ? (aiCfg.startGoldBonus || 0) : 0),
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      eliminated: false,
      eliminatedAt: null,
      towers: [],
      heroes: [],
      hero: null,
      tower: null,
      selectedHeroId: null,
      towerSerial: 0,
      heroSerial: 0,
      aiControlled: rp.isAI || rp.connected === false,
      autoSelectNearest: true,
      manualHeroSelect: false,
      aiClickBudget: 0,
    };

    const tower = createTowerEntity(sim, player, placement.x, placement.y);
    player.towers.push(tower);
    sim.towers.push(tower);
    player.tower = tower;
    sim.players.push(player);
    sim.ai[player.id] = {
      cfg: aiCfg,
      think: aiCfg.think[0] + Math.random() * (aiCfg.think[1] - aiCfg.think[0]),
      spend: aiCfg.spend[0] + Math.random() * (aiCfg.spend[1] - aiCfg.spend[0]),
      patrol: 0,
      lastGoal: null,
    };
  });

  // AI 在开战瞬间完成初始召唤；人类进入战斗后从英雄祭坛自由选择。
  for (const p of sim.players) {
    if (p.isAI) {
      const heroId = p.preferredHeroId || chooseAIHero();
      summonHero(sim, p, heroId);
    }
  }

  // 教学木桩：不主动行动、不反击，耐久放大，作为稳定的练习目标。
  for (const p of sim.players) {
    if (!p.passive) continue;
    for (const tower of p.towers) {
      tower.maxHp *= 100;
      tower.hp = tower.maxHp;
    }
    for (const hero of p.heroes) {
      hero.passive = true;
      hero.maxHp *= 100;
      hero.hp = hero.maxHp;
      hero.damage = 0;
    }
  }

  addEvent(sim, 'announce', { text: '战斗开始！部署魂塔，在英雄祭坛召唤你的英雄。', tone: 'start' });
  for (const p of sim.players) {
    for (const tower of p.towers) {
      addEvent(sim, 'spawn', {
        x: tower.x,
        y: tower.y,
        owner: p.id,
        color: p.color,
        name: p.name,
      });
    }
  }
  return sim;
}

/* ------------------------------------------------------------------ */
/* 战斗操作                                                            */
/* ------------------------------------------------------------------ */

function playerClones(sim, player) {
  return sim.summons.filter(
    (unit) => unit.alive && unit.owner === player.id && unit.summonType === 'clone'
  );
}

export function applyBattleAction(sim, playerId, action) {
  if (!sim || sim.over) return { ok: false, reason: '战斗已结束' };
  const player = playerOf(sim, playerId);
  if (!player || player.eliminated) return { ok: false, reason: '你已被淘汰' };
  let hero = player.hero;
  const tower = player.tower;

  switch (action.type) {
    case 'selectHero': {
      const own = player.heroes.find((h) => h.id === action.heroId);
      if (!own) return { ok: false, reason: '这不是你的英雄' };
      for (const unit of player.heroes) unit.inputDir = null;
      player.selectedHeroId = own.id;
      player.manualHeroSelect = true;
      syncSelected(player);
      return { ok: true };
    }
    case 'toggleKite': {
      if (!hero) return { ok: false, reason: '尚未召唤英雄' };
      if (!hero.alive) return { ok: false, reason: '英雄尚未复活' };
      hero.kite = !hero.kite;
      return { ok: true, kite: hero.kite };
    }
    case 'moveDir': {
      if (!hero) return { ok: false, reason: '尚未召唤英雄' };
      if (!hero.alive) return { ok: false, reason: '英雄尚未复活' };
      let dx = Math.max(-1, Math.min(1, Number(action.dx) || 0));
      let dy = Math.max(-1, Math.min(1, Number(action.dy) || 0));
      const len = Math.hypot(dx, dy);
      for (const unit of player.heroes) unit.inputDir = null;
      if (len > 0.01) {
        hero.inputDir = { x: dx / len, y: dy / len };
        hero.path = [];
        hero.target = null;
        hero.chase = false;
      }
      return { ok: true };
    }
    case 'toggleAutoSelect': {
      player.autoSelectNearest = !player.autoSelectNearest;
      if (player.autoSelectNearest) player.manualHeroSelect = false;
      return { ok: true, autoSelectNearest: player.autoSelectNearest };
    }
    case 'focusFire': {
      const target = entityById(sim, action.kind, action.id);
      if (!target || !target.alive || !isEnemy(sim, player.id, target.owner)) {
        return { ok: false, reason: '集火目标无效' };
      }
      const living = player.heroes.filter((h) => h.alive);
      if (!living.length) return { ok: false, reason: '没有可下令的英雄' };
      const clones = playerClones(sim, player);
      for (const unit of [...living, ...clones]) commandAttack(sim, unit, target);
      addEvent(sim, 'focus', {
        x: target.x,
        y: target.y,
        owner: player.id,
        kind: target.kind,
        targetId: target.id,
        count: living.length + clones.length,
      });
      return { ok: true, count: living.length + clones.length };
    }
    case 'move': {
      if (!hero) return { ok: false, reason: '尚未召唤英雄' };
      if (!hero.alive) return { ok: false, reason: '英雄尚未复活' };
      commandMove(sim, hero, action.x, action.y);
      for (const clone of playerClones(sim, player)) {
        commandMove(sim, clone, action.x, action.y);
      }
      return { ok: true };
    }
    case 'attack': {
      if (!hero) return { ok: false, reason: '尚未召唤英雄' };
      if (!hero.alive) return { ok: false, reason: '英雄尚未复活' };
      const target = entityById(sim, action.kind, action.id);
      if (!target || !target.alive || !isEnemy(sim, player.id, target.owner)) {
        return { ok: false, reason: '目标无效' };
      }
      if (player.autoSelectNearest && !player.manualHeroSelect) {
        const living = player.heroes.filter((h) => h.alive);
        const nearest = living.sort((a, b) => distance(a, target) - distance(b, target))[0];
        if (nearest && nearest.id !== player.selectedHeroId) {
          for (const unit of player.heroes) unit.inputDir = null;
          player.selectedHeroId = nearest.id;
          syncSelected(player);
          hero = player.hero;
        }
      }
      const clones = playerClones(sim, player);
      commandAttack(sim, hero, target);
      for (const clone of clones) commandAttack(sim, clone, target);
      if (action.manual && sim.manualAttack !== false) {
        manualAttackUnit(sim, player, hero, target);
        for (const clone of clones) manualAttackUnit(sim, player, clone, target);
      }
      return { ok: true };
    }
    case 'skill': {
      if (!hero) return { ok: false, reason: '尚未召唤英雄' };
      return castSkill(sim, player, action.x, action.y);
    }
    case 'summon': {
      return summonHero(sim, player, action.heroId);
    }
    case 'buildTower': {
      return buildTower(sim, player, action.heroId, Math.round(Number(action.x)), Math.round(Number(action.y)));
    }
    case 'upgradeHero': {
      return upgradeHero(sim, player);
    }
    case 'upgradeTower': {
      return upgradeTower(sim, player);
    }
    case 'buyItem': {
      return buyItem(sim, player, action.item);
    }
    case 'repair': {
      return repairTower(sim, player);
    }
    default:
      return { ok: false, reason: '未知操作' };
  }
}

function manualAttackUnit(sim, player, unit, target, damageMult = MANUAL_ATTACK_MULT) {
  if (sim.manualAttack === false) return false;
  if (!unit || !unit.alive || !target || !target.alive) return false;
  if (distance(unit, target) > attackReach(unit, target)) return false;
  if (sim.time - (unit.lastManualAt || -99) < MANUAL_ATTACK_MIN_INTERVAL) return false;
  unit.lastManualAt = sim.time;
  let raw = unit.damage * damageMult;
  if (unit.kind === 'hero') {
    const ownTower = player.towers.find((t) => t.id === unit.towerId);
    if (ownTower && !ownTower.alive) raw *= 1.2;
  }
  addEvent(sim, 'attack', {
    fromX: unit.x,
    fromY: unit.y,
    toX: target.x,
    toY: target.y,
    color: unit.color || HEROES[unit.heroId]?.color || '#66e0d2',
    ranged: unit.ranged,
    owner: unit.owner,
    manual: true,
  });
  damageUnit(sim, unit, target, raw, 'physical');
  return true;
}

function commandMove(sim, hero, x, y) {
  if (hero.inputDir) hero.inputDir = null;
  const path = findPathWorld(sim.map, hero.x, hero.y, x, y);
  hero.path = path;
  hero.target = null;
  hero.chase = false;
  hero.repathAt = sim.time + 0.4;
  return path.length > 0 || distance(hero, { x, y }) < 8;
}

function commandAttack(sim, hero, target) {
  if (!target || !target.alive) return false;
  if (hero.inputDir) hero.inputDir = null;
  const same =
    hero.target && hero.target.kind === target.kind && hero.target.id === target.id;
  hero.target = { kind: target.kind, id: target.id };
  hero.chase = true;
  if (!same) {
    hero.path = [];
    hero.repathAt = 0;
  }
  return true;
}

function ensureChasePath(sim, hero, target) {
  if (sim.time < hero.repathAt && hero.path.length) return;
  const path = findPathWorld(sim.map, hero.x, hero.y, target.x, target.y);
  hero.path = path;
  hero.repathAt = sim.time + (hero.repathInterval || 0.42);
  if (!path.length && distance(hero, target) > attackReach(hero, target) + 18) {
    // 实在无法接近时放弃，避免卡死
    hero.target = null;
    hero.chase = false;
  }
}

function heroMoveSpeed(sim, hero) {
  const tile = worldToTile(sim.map, hero.x, hero.y);
  let speed = hero.speed * terrainSpeed(sim.map, tile.x, tile.y);
  if (hero.slowUntil > sim.time) speed *= 1 - hero.slowFactor;
  if (hero.enraged) speed *= 1.12;
  return speed;
}

function moveAlongPath(sim, hero, dt) {
  if (!hero.path || hero.path.length === 0) return false;
  let remaining = heroMoveSpeed(sim, hero) * dt;
  while (remaining > 0 && hero.path.length) {
    const next = hero.path[0];
    const dx = next.x - hero.x;
    const dy = next.y - hero.y;
    const d = Math.hypot(dx, dy);
    if (d <= remaining) {
      hero.x = next.x;
      hero.y = next.y;
      remaining -= d;
      hero.path.shift();
    } else {
      hero.x += (dx / d) * remaining;
      hero.y += (dy / d) * remaining;
      remaining = 0;
    }
  }
  return hero.path.length > 0;
}

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (!lenSq) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function castSkill(sim, player, x, y) {
  const hero = player.hero;
  if (!hero) return { ok: false, reason: '尚未召唤英雄' };
  const def = HEROES[hero.heroId];
  const skill = def.skill;
  if (!hero.alive) return { ok: false, reason: '英雄尚未复活' };
  if (hero.skillCd > 0) return { ok: false, reason: '技能冷却中' };
  if (player.gold < skill.cost) return { ok: false, reason: '金币不足' };

  if (skill.id === 'mirage') {
    const active = sim.summons.filter(
      (s) => s.alive && s.summonType === 'clone' && s.sourceHeroId === hero.id
    ).length;
    if (active >= (skill.maxClones || 1)) return { ok: false, reason: '镜像仍在场' };
  } else if (skill.id === 'spirit') {
    const active = sim.summons.filter(
      (s) => s.alive && s.summonType === 'minion' && s.owner === player.id
    ).length;
    if (active >= skill.maxMinions) return { ok: false, reason: '灵仆数量已达上限' };
  }

  player.gold -= skill.cost;
  hero.skillCd = skill.cooldown;

  const levelDamage = (skill.damage || 0) + (skill.perLevel || 0) * (hero.level - 1);

  if (skill.id === 'ember') {
    addEvent(sim, 'skill', {
      skill: 'ember',
      x: hero.x,
      y: hero.y,
      radius: skill.radius,
      color: def.color,
    });
    for (const target of enemiesOf(sim, hero.owner)) {
      if (distance(hero, target) <= skill.radius + (target.radius || 0) * 0.35) {
        damageUnit(sim, hero, target, levelDamage, 'skill');
      }
    }
  } else if (skill.id === 'frost') {
    let tx = x;
    let ty = y;
    const dx = tx - hero.x;
    const dy = ty - hero.y;
    const d = Math.hypot(dx, dy);
    if (d > skill.range) {
      tx = hero.x + (dx / d) * skill.range;
      ty = hero.y + (dy / d) * skill.range;
    }
    addEvent(sim, 'skill', {
      skill: 'frost',
      x: tx,
      y: ty,
      radius: skill.radius,
      color: def.color,
    });
    for (const target of enemiesOf(sim, hero.owner)) {
      if (Math.hypot(target.x - tx, target.y - ty) <= skill.radius + (target.radius || 0) * 0.35) {
        damageUnit(sim, hero, target, levelDamage, 'skill');
        if (target.kind === 'hero' && target.alive) {
          target.slowUntil = sim.time + skill.slowDuration;
          target.slowFactor = skill.slow;
          addEvent(sim, 'slow', { x: target.x, y: target.y, owner: target.owner });
        }
      }
    }
  } else if (skill.id === 'shade') {
    const dx = x - hero.x;
    const dy = y - hero.y;
    const d = Math.hypot(dx, dy) || 1;
    let travel = Math.min(skill.dash, d);
    let nx = hero.x;
    let ny = hero.y;
    const steps = Math.ceil(travel / 5);
    for (let i = 1; i <= steps; i++) {
      const px = hero.x + (dx / d) * (travel * (i / steps));
      const py = hero.y + (dy / d) * (travel * (i / steps));
      const tile = worldToTile(sim.map, px, py);
      if (!tileBuildable(sim.map, tile.x, tile.y)) break;
      nx = px;
      ny = py;
    }
    const from = { x: hero.x, y: hero.y };
    hero.x = nx;
    hero.y = ny;
    hero.path = [];
    addEvent(sim, 'skill', {
      skill: 'shade',
      x: hero.x,
      y: hero.y,
      fromX: from.x,
      fromY: from.y,
      radius: skill.radius,
      color: def.color,
    });
    for (const target of enemiesOf(sim, hero.owner)) {
      if (distance(hero, target) <= skill.radius + (target.radius || 0) * 0.35) {
        damageUnit(sim, hero, target, levelDamage, 'skill');
      }
    }
  } else if (skill.id === 'bulwark') {
    const shield = skill.shield + skill.perLevel * (hero.level - 1);
    hero.shield = shield;
    hero.shieldUntil = sim.time + skill.duration;
    addEvent(sim, 'skill', {
      skill: 'bulwark',
      x: hero.x,
      y: hero.y,
      radius: 48,
      color: def.color,
      shield: Math.round(shield),
    });
  } else if (skill.id === 'mirage') {
    createSummonEntity(sim, player, hero, 'clone', skill, 0, 1);
    addEvent(sim, 'skill', {
      skill: 'mirage',
      x: hero.x,
      y: hero.y,
      radius: 54,
      color: def.color,
      owner: player.id,
    });
  } else if (skill.id === 'spirit') {
    const active = sim.summons.filter(
      (s) => s.alive && s.summonType === 'minion' && s.owner === player.id
    ).length;
    const count = Math.min(skill.count, Math.max(0, skill.maxMinions - active));
    for (let i = 0; i < count; i++) {
      createSummonEntity(sim, player, hero, 'minion', skill, i, count);
    }
    addEvent(sim, 'skill', {
      skill: 'spirit',
      x: hero.x,
      y: hero.y,
      radius: 64,
      color: def.color,
      owner: player.id,
      count,
    });
  } else if (skill.id === 'falcon') {
    const dx = x - hero.x;
    const dy = y - hero.y;
    const dist = Math.hypot(dx, dy) || 1;
    const tx = hero.x + (dx / dist) * Math.min(skill.range, dist);
    const ty = hero.y + (dy / dist) * Math.min(skill.range, dist);
    addEvent(sim, 'skill', {
      skill: 'falcon',
      x: tx,
      y: ty,
      fromX: hero.x,
      fromY: hero.y,
      width: skill.width,
      color: def.color,
    });
    for (const target of enemiesOf(sim, hero.owner)) {
      const lineDist = pointSegmentDistance(target.x, target.y, hero.x, hero.y, tx, ty);
      if (lineDist <= skill.width / 2 + (target.radius || 0)) {
        let dmg = levelDamage;
        if (target.hp / Math.max(1, target.maxHp) <= skill.executeThreshold) {
          dmg *= 1 + skill.executeBonus;
        }
        damageUnit(sim, hero, target, dmg, 'skill');
      }
    }
  } else if (skill.id === 'lunar') {
    const heal = skill.heal + skill.healPerLevel * (hero.level - 1);
    const shield = skill.shield + skill.shieldPerLevel * (hero.level - 1);
    addEvent(sim, 'skill', {
      skill: 'lunar',
      x: hero.x,
      y: hero.y,
      radius: skill.radius,
      color: def.color,
      owner: player.id,
    });
    for (const ally of alliesOf(sim, hero.owner)) {
      if (distance(hero, ally) > skill.radius) continue;
      const healed = Math.min(ally.maxHp - ally.hp, heal);
      ally.hp = Math.min(ally.maxHp, ally.hp + heal);
      ally.shield = (ally.shield || 0) + shield;
      ally.shieldUntil = sim.time + skill.duration;
      addEvent(sim, 'heal', {
        x: ally.x,
        y: ally.y,
        owner: player.id,
        amount: Math.round(healed),
        shield: Math.round(shield),
        color: def.color,
        kind: ally.kind,
      });
    }
  } else if (skill.id === 'thorn') {
    const dx = x - hero.x;
    const dy = y - hero.y;
    const dist = Math.hypot(dx, dy) || 1;
    const tx = hero.x + (dx / dist) * Math.min(skill.range, dist);
    const ty = hero.y + (dy / dist) * Math.min(skill.range, dist);
    addEvent(sim, 'skill', {
      skill: 'thorn',
      x: tx,
      y: ty,
      radius: skill.radius,
      color: def.color,
      owner: player.id,
    });
    for (const target of enemiesOf(sim, hero.owner)) {
      if (Math.hypot(target.x - tx, target.y - ty) <= skill.radius + (target.radius || 0) * 0.35) {
        damageUnit(sim, hero, target, levelDamage, 'skill');
        if (target.kind === 'hero' && target.alive) {
          target.rootUntil = sim.time + skill.rootDuration;
          addEvent(sim, 'root', {
            x: target.x,
            y: target.y,
            owner: target.owner,
            duration: skill.rootDuration,
            color: def.color,
          });
        }
      }
    }
  } else if (skill.id === 'volt') {
    const points = [{ x: hero.x, y: hero.y }];
    const hit = new Set();
    let current = closest(hero, enemiesOf(sim, hero.owner).filter((e) => e.alive && distance(hero, e) <= skill.chainRange));
    let dmg = levelDamage;
    for (let jump = 0; jump <= skill.jumps && current; jump += 1) {
      points.push({ x: current.x, y: current.y });
      const key = `${current.kind}:${current.id}`;
      hit.add(key);
      damageUnit(sim, hero, current, dmg, 'skill');
      if (current.kind === 'hero' || current.kind === 'summon') {
        current.slowUntil = sim.time + skill.slowDuration;
        current.slowFactor = skill.slow;
        addEvent(sim, 'slow', { x: current.x, y: current.y, owner: current.owner });
      }
      const next = closest(current, enemiesOf(sim, hero.owner).filter((e) => e.alive && !hit.has(`${e.kind}:${e.id}`) && distance(e, current) <= 170));
      current = next;
      dmg *= skill.falloff;
    }
    addEvent(sim, 'skill', {
      skill: 'volt',
      x: hero.x,
      y: hero.y,
      points,
      radius: 28,
      color: def.color,
      owner: player.id,
    });
  } else if (skill.id === 'wave') {
    const dx = x - hero.x;
    const dy = y - hero.y;
    const dist = Math.hypot(dx, dy) || 1;
    const tx = hero.x + (dx / dist) * Math.min(skill.range, dist);
    const ty = hero.y + (dy / dist) * Math.min(skill.range, dist);
    addEvent(sim, 'skill', {
      skill: 'wave',
      x: tx,
      y: ty,
      fromX: hero.x,
      fromY: hero.y,
      width: skill.width,
      radius: skill.width,
      color: def.color,
      owner: player.id,
    });
    for (const target of enemiesOf(sim, hero.owner)) {
      const lineDist = pointSegmentDistance(target.x, target.y, hero.x, hero.y, tx, ty);
      if (lineDist <= skill.width / 2 + (target.radius || 0)) {
        damageUnit(sim, hero, target, levelDamage, 'skill');
        if ((target.kind === 'hero' || target.kind === 'summon') && target.alive) {
          target.slowUntil = sim.time + skill.slowDuration;
          target.slowFactor = skill.slow;
          addEvent(sim, 'slow', { x: target.x, y: target.y, owner: target.owner });
        }
      }
    }
  } else if (skill.id === 'quake') {
    addEvent(sim, 'skill', {
      skill: 'quake',
      x: hero.x,
      y: hero.y,
      radius: skill.radius,
      color: def.color,
      owner: player.id,
    });
    for (const target of enemiesOf(sim, hero.owner)) {
      if (distance(hero, target) <= skill.radius + (target.radius || 0) * 0.35) {
        damageUnit(sim, hero, target, levelDamage, 'skill');
        if (target.kind === 'hero' && target.alive) {
          target.rootUntil = sim.time + skill.rootDuration;
          addEvent(sim, 'root', {
            x: target.x,
            y: target.y,
            owner: target.owner,
            duration: skill.rootDuration,
            color: def.color,
          });
        }
      }
    }
  } else if (skill.id === 'meteor') {
    const dx = x - hero.x;
    const dy = y - hero.y;
    const dist = Math.hypot(dx, dy) || 1;
    const tx = hero.x + (dx / dist) * Math.min(skill.range, dist);
    const ty = hero.y + (dy / dist) * Math.min(skill.range, dist);
    addEvent(sim, 'skill', {
      skill: 'meteor',
      x: tx,
      y: ty,
      radius: skill.radius,
      color: def.color,
      owner: player.id,
    });
    for (const target of enemiesOf(sim, hero.owner)) {
      if (Math.hypot(target.x - tx, target.y - ty) <= skill.radius + (target.radius || 0) * 0.35) {
        damageUnit(sim, hero, target, levelDamage, 'skill');
      }
    }
  } else if (skill.id === 'rally') {
    const heal = skill.heal + skill.healPerLevel * (hero.level - 1);
    const shield = skill.shield + skill.shieldPerLevel * (hero.level - 1);
    addEvent(sim, 'skill', {
      skill: 'rally',
      x: hero.x,
      y: hero.y,
      radius: skill.radius,
      color: def.color,
      owner: player.id,
    });
    for (const ally of alliesOf(sim, hero.owner)) {
      if (distance(hero, ally) > skill.radius) continue;
      const healed = Math.min(ally.maxHp - ally.hp, heal);
      ally.hp = Math.min(ally.maxHp, ally.hp + heal);
      ally.shield = (ally.shield || 0) + shield;
      ally.shieldUntil = sim.time + skill.duration;
      addEvent(sim, 'heal', {
        x: ally.x,
        y: ally.y,
        owner: player.id,
        amount: Math.round(healed),
        shield: Math.round(shield),
        color: def.color,
        kind: ally.kind,
      });
    }
  }

  addEvent(sim, 'skillCast', {
    x: hero.x,
    y: hero.y,
    owner: player.id,
    skill: skill.id,
    name: skill.name,
  });
  return { ok: true };
}

function upgradeHero(sim, player) {
  const hero = player.hero;
  if (!hero) return { ok: false, reason: '尚未召唤英雄' };
  if (hero.level >= HERO_UPGRADE.maxLevel) return { ok: false, reason: '英雄已满级' };
  if (player.eliminated) return { ok: false, reason: '你已被淘汰' };
  const cost = heroUpgradeCost(hero.level);
  if (player.gold < cost) return { ok: false, reason: '金币不足' };
  player.gold -= cost;
  hero.level += 1;
  refreshHeroStats(hero, true);
  if (hero.alive) hero.hp = Math.min(hero.maxHp, hero.hp + 20);
  addEvent(sim, 'upgrade', {
    x: hero.x,
    y: hero.y,
    owner: player.id,
    kind: 'hero',
    level: hero.level,
  });
  return { ok: true };
}

function upgradeTower(sim, player) {
  const tower = player.tower;
  if (!tower.alive) return { ok: false, reason: '魂塔已被摧毁' };
  if (tower.level >= TOWER.maxLevel) return { ok: false, reason: '魂塔已满级' };
  const cost = towerUpgradeCost(tower.level);
  if (player.gold < cost) return { ok: false, reason: '金币不足' };
  player.gold -= cost;
  tower.level += 1;
  refreshTowerStats(tower, true);
  addEvent(sim, 'upgrade', {
    x: tower.x,
    y: tower.y,
    owner: player.id,
    kind: 'tower',
    level: tower.level,
  });
  return { ok: true };
}

function buyItem(sim, player, itemId) {
  const def = ITEMS[itemId];
  const tower = player.tower;
  if (!def) return { ok: false, reason: '未知装备' };
  if (!tower.alive) return { ok: false, reason: '魂塔已被摧毁' };
  const owned = tower[`${itemId}Count`] || 0;
  if (owned >= def.max) return { ok: false, reason: '装备栏已满' };
  const cost = itemCost(itemId, owned);
  if (player.gold < cost) return { ok: false, reason: '金币不足' };
  player.gold -= cost;
  tower[`${itemId}Count`] = owned + 1;
  refreshTowerStats(tower, true);
  addEvent(sim, 'equip', {
    x: tower.x,
    y: tower.y,
    owner: player.id,
    item: itemId,
    count: tower[`${itemId}Count`],
  });
  return { ok: true };
}

function repairTower(sim, player) {
  const tower = player.tower;
  if (!tower.alive) return { ok: false, reason: '魂塔已被摧毁' };
  if (tower.hp >= tower.maxHp - 0.5) return { ok: false, reason: '魂塔耐久已满' };
  if (sim.time - tower.lastRepairAt < REPAIR_COOLDOWN) {
    return { ok: false, reason: `修复冷却 ${Math.ceil(REPAIR_COOLDOWN - (sim.time - tower.lastRepairAt))} 秒` };
  }
  if (player.gold < REPAIR_COST) return { ok: false, reason: '金币不足' };
  player.gold -= REPAIR_COST;
  tower.lastRepairAt = sim.time;
  tower.hp = Math.min(tower.maxHp, tower.hp + tower.maxHp * REPAIR_RATIO);
  addEvent(sim, 'repair', { x: tower.x, y: tower.y, owner: player.id });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 伤害、死亡、赏金                                                     */
/* ------------------------------------------------------------------ */

function damageUnit(sim, source, target, rawDamage, kind = 'physical') {
  if (!target || !target.alive || !source) return 0;
  // 英雄对建筑物的攻城加成，避免高等级魂塔变成无法处理的铁王八。
  if (target.kind === 'tower' && source.kind === 'hero') {
    rawDamage *= kind === 'skill' ? 1.3 : 1.55;
  }
  const armor = target.armor || 0;
  let amount = kind === 'skill' ? rawDamage - armor * 0.5 : rawDamage - armor;
  amount = Math.max(1, amount);
  if (target.shield > 0 && target.shieldUntil > sim.time) {
    const absorbed = Math.min(target.shield, amount);
    target.shield -= absorbed;
    amount -= absorbed;
    if (target.shield <= 0) target.shield = 0;
    addEvent(sim, 'shieldHit', {
      x: target.x,
      y: target.y,
      amount: Math.round(absorbed),
    });
  }
  if (amount <= 0) return 0;
  target.hp -= amount;
  target.lastDamagedAt = sim.time;
  const owner = playerOf(sim, source.owner);
  if (owner) owner.damageDealt += amount;
  addEvent(sim, 'hit', {
    x: target.x,
    y: target.y,
    amount: Math.round(amount),
    kind,
    owner: target.owner,
    sourceOwner: source.owner,
  });

  if (target.kind === 'hero' && target.hp <= 0) {
    target.hp = 0;
    handleHeroDeath(sim, target, source);
  } else if (target.kind === 'tower' && target.hp <= 0) {
    target.hp = 0;
    handleTowerDeath(sim, target, source);
  } else if (target.kind === 'summon' && target.hp <= 0) {
    target.hp = 0;
    handleSummonDeath(sim, target);
  }
  return amount;
}

function awardBounty(sim, victimUnit, sourceUnit) {
  const amount = Math.floor(victimUnit.earned * BOUNTY_RATIO);
  if (amount <= 0) return;
  const player = playerOf(sim, sourceUnit.owner);
  if (!player || player.eliminated) return;
  const sourcePlayer = player;
  sourcePlayer.gold += amount;
  // 赏金不计入“累计产出”，避免击杀赏金指数级滚雪球。
  addEvent(sim, 'gold', {
    x: victimUnit.x,
    y: victimUnit.y,
    amount,
    label: `赏金 +${amount}`,
    big: true,
  });
}

function handleHeroDeath(sim, hero, source) {
  if (!hero.alive) return;
  hero.alive = false;
  hero.hp = 0;
  hero.target = null;
  hero.chase = false;
  hero.path = [];
  hero.inputDir = null;
  hero.shield = 0;
  hero.deaths += 1;
  for (const unit of sim.summons) {
    if (unit.alive && unit.owner === hero.owner && unit.sourceHeroId === hero.id) {
      expireSummon(sim, unit, 'source');
    }
  }
  const player = playerOf(sim, hero.owner);
  if (player) player.deaths += 1;
  if (source) {
    const killer = playerOf(sim, source.owner);
    if (killer && killer.id !== player?.id) {
      killer.kills += 1;
      if (source.kind === 'hero') source.kills += 1;
    }
    awardBounty(sim, hero, source);
  }
  addEvent(sim, 'death', {
    x: hero.x,
    y: hero.y,
    owner: hero.owner,
    name: HEROES[hero.heroId].name,
  });

  const tower = player?.towers.find((t) => t.id === hero.towerId);
  if (player && tower && tower.alive) {
    const respawn = RESPAWN_BASE + RESPAWN_PER_LEVEL * (hero.level - 1);
    hero.respawnAt = sim.time + respawn;
    addEvent(sim, 'announce', {
      text: `${player.name} 的${hero.name}倒下了，${Math.ceil(respawn)} 秒后重生`,
      tone: 'death',
    });
    ensureAliveSelection(player);
  } else if (player) {
    hero.respawnAt = 0;
    addEvent(sim, 'announce', {
      text: `${player.name} 的${hero.name}倒下，且魂塔已毁，无法重生`,
      tone: 'danger',
    });
    ensureAliveSelection(player);
    checkPlayerElimination(sim, player);
  }
}

function handleTowerDeath(sim, tower, source) {
  if (!tower.alive) return;
  tower.alive = false;
  tower.hp = 0;
  tower.destroyedAt = sim.time;
  const player = playerOf(sim, tower.owner);
  if (player) {
    const killer = source ? playerOf(sim, source.owner) : null;
    if (killer && killer.id !== player.id) killer.kills += 1;
    if (source) awardBounty(sim, tower, source);
    addEvent(sim, 'towerDown', {
      x: tower.x,
      y: tower.y,
      owner: player.id,
      name: player.name,
      color: player.color,
    });
    const linked = player.heroes.find((h) => h.id === tower.heroId);
    addEvent(sim, 'announce', {
      text: linked
        ? `${player.name} 的魂塔被摧毁！${linked.name}${linked.alive ? '进入背水一战，且无法重生' : '无法重生'}`
        : `${player.name} 的魂塔被摧毁！`,
      tone: 'danger',
    });
    if (linked) {
      if (linked.alive) linked.enraged = true;
      else linked.respawnAt = 0;
    }
    syncSelected(player);
    checkPlayerElimination(sim, player);
  }
}

function checkPlayerElimination(sim, player) {
  if (!player || player.eliminated) return;
  const anyTower = player.towers.some((t) => t.alive);
  const anyHero = player.heroes.some((h) => h.alive);
  if (!anyTower && !anyHero) eliminatePlayer(sim, player);
}

function eliminatePlayer(sim, player) {
  if (player.eliminated) return;
  player.eliminated = true;
  player.eliminatedAt = sim.time;
  for (const hero of player.heroes) {
    hero.alive = false;
    hero.hp = 0;
    hero.path = [];
    hero.target = null;
    hero.inputDir = null;
  }
  for (const unit of sim.summons) {
    if (unit.alive && unit.owner === player.id) expireSummon(sim, unit, 'owner');
  }
  addEvent(sim, 'eliminated', {
    owner: player.id,
    name: player.name,
    color: player.color,
  });
  addEvent(sim, 'announce', {
    text: `${player.name} 已被淘汰`,
    tone: 'danger',
  });
  checkBattleEnd(sim);
}

function checkBattleEnd(sim) {
  if (sim.over || sim.tutorial) return;
  const remaining = sim.players.filter((p) => !p.eliminated);
  if (sim.teamMode) {
    const teams = [...new Set(remaining.map((p) => p.team).filter((t) => t != null))];
    if (teams.length <= 1) {
      const team = teams[0] ?? null;
      sim.winnerTeam = team;
      const winners = remaining
        .filter((p) => p.team === team)
        .sort((a, b) => scoreOf(b) - scoreOf(a));
      endBattle(sim, winners[0]?.id ?? null, 'last-standing');
    }
    return;
  }
  if (remaining.length <= 1) {
    const winner = remaining[0] || null;
    endBattle(sim, winner ? winner.id : null, 'last-standing');
  }
}

function endBattle(sim, winnerId, reason) {
  if (sim.over) return;
  sim.over = true;
  sim.winner = winnerId;
  sim.endReason = reason;
  sim.endedAt = sim.time;
  const winner = winnerId ? playerOf(sim, winnerId) : null;
  addEvent(sim, 'end', {
    winner: winnerId,
    name: winner ? winner.name : null,
    reason,
  });
  addEvent(sim, 'announce', {
    text: winner ? `${winner.name} 赢得了四境之战！` : '四境归于沉寂，平局',
    tone: 'start',
  });
}

/* ------------------------------------------------------------------ */
/* 主循环                                                              */
/* ------------------------------------------------------------------ */

function enterDeathMode(sim) {
  if (!sim || sim.deathMode || sim.tutorial) return;
  sim.deathMode = true;
  sim.deathModeAt = sim.time;
  addEvent(sim, 'deathMode', {
    text: '死亡模式：所有魂塔崩塌，无法再新建魂塔！',
    tone: 'danger',
  });
  for (const tower of [...sim.towers]) {
    if (!tower.alive) continue;
    handleTowerDeath(sim, tower, null);
    if (sim.over) break;
  }
  checkBattleEnd(sim);
}

export function tickBattle(sim, dt) {
  if (!sim || sim.over) return;
  dt = clamp(dt, 0, 0.12);
  sim.time += dt;

  if (!sim.tutorial && !sim.deathMode) {
    if (!sim.deathWarned && sim.time >= sim.deathModeAt - 30) {
      sim.deathWarned = true;
      addEvent(sim, 'announce', {
        text: '30 秒后进入死亡模式：所有魂塔将崩塌，且无法再新建魂塔！',
        tone: 'danger',
      });
    }
    if (sim.time >= sim.deathModeAt) enterDeathMode(sim);
    if (sim.over) return;
  }

  // 被动收入
  for (const p of sim.players) {
    if (p.eliminated) continue;
    for (const tower of p.towers) {
      if (!tower.alive) continue;
      const gain = tower.income * dt;
      p.gold += gain;
      tower.earned += gain;
    }
    for (const hero of p.heroes) {
      if (!hero.alive) continue;
      const gain = hero.income * dt;
      p.gold += gain;
      hero.earned += gain;
    }
  }

  // 资源点刷新
  for (const node of sim.nodes) {
    if (!node.available && sim.time >= node.respawnAt) {
      node.available = true;
      addEvent(sim, 'resourceSpawn', {
        x: node.x * sim.map.tile + sim.map.tile / 2,
        y: node.y * sim.map.tile + sim.map.tile / 2,
      });
    }
  }

  for (const hero of sim.heroes) updateHero(sim, hero, dt);
  for (const unit of sim.summons) updateSummon(sim, unit, dt);
  sim.summons = sim.summons.filter((unit) => unit.alive);
  for (const tower of sim.towers) updateTower(sim, tower, dt);

  // AI（包含掉线接管）
  for (const p of sim.players) {
    if (p.eliminated || p.passive) continue;
    p.aiControlled = p.isAI || !p.connected;
    if (!p.aiControlled) continue;
    const ai = sim.ai[p.id];
    if (!ai) continue;
    if (!p.hero) {
      const emptyTower = p.towers.find((t) => t.alive && !t.heroId);
      if (emptyTower) summonHero(sim, p, p.preferredHeroId || chooseAIHero());
    }
    if ((!p.hero || !p.hero.alive) && p.heroes.some((h) => h.alive)) {
      ensureAliveSelection(p);
    }
    const aiCfg = ai.cfg || AI_LEVELS[sim.aiLevel] || AI_LEVELS.normal;
    ai.think -= dt;
    ai.spend -= dt;
    if (ai.think <= 0) {
      ai.think = aiCfg.think[0] + Math.random() * (aiCfg.think[1] - aiCfg.think[0]);
      aiThink(sim, p, ai);
    }
    if (ai.spend <= 0) {
      ai.spend = aiCfg.spend[0] + Math.random() * (aiCfg.spend[1] - aiCfg.spend[0]);
      aiSpend(sim, p);
    }
  }

  // AI 等效点击：只模拟 AI 当前操作英雄的点击，按每个 AI 自己的 CPS 累积。
  // 无手动攻击模式：AI 也不模拟点击，只保留自动攻击/技能。
  for (const p of sim.players) {
    if (!p.isAI || p.eliminated || sim.manualAttack === false) continue;
    const aiClickCfg = sim.ai[p.id]?.cfg || AI_LEVELS[sim.aiLevel] || AI_LEVELS.normal;
    const aiCps = Math.max(1, aiClickCfg.cps || 5);
    p.aiClickBudget = Math.min(1.2, (p.aiClickBudget || 0) + aiCps * dt);
    const hero = p.hero;
    if (!hero || !hero.alive) continue;
    const target = resolveTarget(sim, hero.target);
    if (!target || !target.alive) continue;
    if (distance(hero, target) > attackReach(hero, target)) continue;
    if (p.aiClickBudget < 1) continue;
    if (manualAttackUnit(sim, p, hero, target, aiClickCfg.clickDamage || MANUAL_ATTACK_MULT)) p.aiClickBudget -= 1;
  }

  // 资源拾取
  collectResources(sim);

  if (!sim.over && !sim.tutorial && sim.time >= sim.matchLimit) {
    if (sim.teamMode) {
      const totals = new Map();
      for (const p of sim.players) {
        if (p.team == null) continue;
        totals.set(p.team, (totals.get(p.team) || 0) + scoreOf(p));
      }
      const teams = [...totals.entries()].sort((a, b) => b[1] - a[1]);
      const top = teams[0];
      const tie = teams[1] && Math.abs(teams[0][1] - teams[1][1]) < 1;
      sim.winnerTeam = tie ? null : top?.[0] ?? null;
      const best = !tie && top
        ? sim.players
            .filter((p) => p.team === top[0])
            .sort((a, b) => scoreOf(b) - scoreOf(a))[0]
        : null;
      endBattle(sim, tie ? null : best?.id ?? null, 'time-limit');
    } else {
      const ranked = [...sim.players].sort((a, b) => scoreOf(b) - scoreOf(a));
      const top = ranked[0];
      const tie = ranked[1] && Math.abs(scoreOf(ranked[0]) - scoreOf(ranked[1])) < 1;
      endBattle(sim, tie ? null : top?.id ?? null, 'time-limit');
    }
  }
}

function scoreOf(p) {
  const heroEarned = p.heroes.reduce((sum, h) => sum + h.earned, 0);
  const towerEarned = p.towers.reduce((sum, t) => sum + t.earned, 0);
  return p.kills * 160 + p.damageDealt * 0.35 + (heroEarned + towerEarned) * 0.08;
}

function moveHeroDirect(sim, hero, dx, dy, dt) {
  const tile = worldToTile(sim.map, hero.x, hero.y);
  const speed = hero.speed
    * (hero.slowUntil > sim.time ? 1 - hero.slowFactor : 1)
    * terrainSpeed(sim.map, tile.x, tile.y);
  const step = Math.max(0, speed) * dt;
  const nx = hero.x + dx * step;
  const ny = hero.y + dy * step;
  const tx = worldToTile(sim.map, nx, hero.y);
  if (tilePassable(sim.map, tx.x, tx.y)) hero.x = nx;
  const ty = worldToTile(sim.map, hero.x, ny);
  if (tilePassable(sim.map, ty.x, ty.y)) hero.y = ny;
}

function updateHero(sim, hero, dt) {
  hero.attackCd = Math.max(0, hero.attackCd - dt);
  hero.skillCd = Math.max(0, hero.skillCd - dt);
  if (hero.shieldUntil <= sim.time) hero.shield = 0;
  if (hero.slowUntil <= sim.time) hero.slowFactor = 1;
  const rooted = hero.rootUntil > sim.time;

  if (!hero.alive) {
    if (hero.respawnAt > 0 && sim.time >= hero.respawnAt) {
      const player = playerOf(sim, hero.owner);
      const tower = player?.towers.find((t) => t.id === hero.towerId);
      if (tower && tower.alive) {
        const point = spawnPointNearTower(sim.map, tower);
        hero.x = point.x;
        hero.y = point.y;
        hero.hp = hero.maxHp;
        hero.alive = true;
        hero.respawnAt = 0;
        hero.shield = 0;
        hero.shieldUntil = 0;
        hero.slowUntil = 0;
        hero.slowFactor = 1;
        hero.rootUntil = 0;
        hero.target = null;
        hero.path = [];
        hero.inputDir = null;
        addEvent(sim, 'respawn', {
          x: hero.x,
          y: hero.y,
          owner: hero.owner,
          name: HEROES[hero.heroId].name,
        });
        if (player) {
          if (!player.hero || !player.hero.alive) player.selectedHeroId = hero.id;
          syncSelected(player);
        }
      }
    }
    return;
  }

  // 靠近己方魂塔时缓慢恢复
  const player = playerOf(sim, hero.owner);
  const linkedTower = player?.towers.find((t) => t.id === hero.towerId);
  if (linkedTower && linkedTower.alive) {
    const d = distance(hero, linkedTower);
    if (d < TOWER.respawnRegenRange && hero.hp < hero.maxHp) {
      hero.hp = Math.min(hero.maxHp, hero.hp + TOWER.respawnRegenPerSecond * dt);
    }
  }

  const target = resolveTarget(sim, hero.target);
  if (hero.target && (!target || !target.alive)) {
    hero.target = null;
    hero.chase = false;
  }

  // WASD/方向键：持续按住时由服务器直接推进，松开后停止。
  if (hero.inputDir && !rooted) {
    hero.path = [];
    hero.target = null;
    hero.chase = false;
    moveHeroDirect(sim, hero, hero.inputDir.x, hero.inputDir.y, dt);
    return;
  }

  if (target && target.alive) {
    const reach = attackReach(hero, target);
    const d = distance(hero, target);
    if (hero.kite && !rooted && d < Math.max(30, reach * 0.88) - 8) {
      // 保持距离：先尝试攻击，再向目标反方向后撤到射程边缘。
      tryHeroAttack(sim, hero, target);
      const desired = Math.max(30, reach * 0.88);
      const dx = hero.x - target.x;
      const dy = hero.y - target.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (sim.time >= hero.repathAt || !hero.path.length) {
        const nx = hero.x + (dx / dist) * Math.max(20, desired - d + 16);
        const ny = hero.y + (dy / dist) * Math.max(20, desired - d + 16);
        hero.path = findPathWorld(sim.map, hero.x, hero.y, nx, ny);
        hero.repathAt = sim.time + 0.38;
      }
      if (hero.path.length) moveAlongPath(sim, hero, dt);
      return;
    }
    if (d <= reach) {
      hero.path = [];
      tryHeroAttack(sim, hero, target);
    } else if (hero.chase && !rooted) {
      ensureChasePath(sim, hero, target);
      moveAlongPath(sim, hero, dt);
    } else if (!rooted) {
      if (d > reach * 1.28) {
        hero.target = null;
      } else {
        tryHeroAttack(sim, hero, target);
      }
    }
  }

  if (!hero.target && hero.path.length && !rooted) {
    moveAlongPath(sim, hero, dt);
  }

  if (!hero.target && !hero.path.length && !hero.passive) {
    const found = nearestEnemyInRange(sim, hero, hero.range + 12);
    if (found) {
      hero.target = { kind: found.kind, id: found.id };
      hero.chase = false;
    }
  }
}

function tryHeroAttack(sim, hero, target) {
  if (hero.attackCd > 0) return;
  hero.attackCd = hero.attackInterval;
  const player = playerOf(sim, hero.owner);
  let raw = hero.damage;
  const ownTower = player?.towers.find((t) => t.id === hero.towerId);
  if (ownTower && !ownTower.alive) raw *= 1.2;
  addEvent(sim, 'attack', {
    fromX: hero.x,
    fromY: hero.y,
    toX: target.x,
    toY: target.y,
    color: hero.color || HEROES[hero.heroId]?.color || '#66e0d2',
    ranged: hero.ranged,
    owner: hero.owner,
  });
  damageUnit(sim, hero, target, raw, 'physical');
}

function updateSummon(sim, unit, dt) {
  if (!unit.alive) return;
  unit.attackCd = Math.max(0, unit.attackCd - dt);
  if (unit.slowUntil <= sim.time) unit.slowFactor = 1;
  if (sim.time >= unit.expiresAt) {
    expireSummon(sim, unit, 'timeout');
    return;
  }
  const owner = playerOf(sim, unit.owner);
  if (!owner || owner.eliminated) {
    expireSummon(sim, unit, 'owner');
    return;
  }
  const source = sim.heroes.find((h) => h.id === unit.sourceHeroId);
  if (!source || !source.alive) {
    expireSummon(sim, unit, 'source');
    return;
  }

  let target = resolveTarget(sim, unit.target);
  if (unit.target && (!target || !target.alive)) {
    unit.target = null;
    unit.chase = false;
    target = null;
  }

  if (!target) {
    // 镜像完全服从玩家：没有命令就停在原地，不自动索敌、不追击。
    if (unit.summonType === 'clone') {
      if (unit.path.length) moveAlongPath(sim, unit, dt);
      return;
    }
    if (sim.time >= unit.nextAcquireAt) {
      unit.nextAcquireAt = sim.time + 0.55;
      const found = nearestEnemyInRange(sim, unit, 360);
      if (found) {
        target = found;
        unit.target = { kind: target.kind, id: target.id };
        unit.chase = true;
      } else {
        const towers = sim.towers.filter((t) => t.alive && isEnemy(sim, unit.owner, t.owner));
        const tower = closest(unit, towers);
        if (tower) {
          target = tower;
          unit.target = { kind: tower.kind, id: tower.id };
          unit.chase = true;
        }
      }
    }
  }

  if (target) {
    const d = distance(unit, target);
    const reach = attackReach(unit, target);
    if (d <= reach) {
      unit.path = [];
      tryHeroAttack(sim, unit, target);
    } else {
      ensureChasePath(sim, unit, target);
      moveAlongPath(sim, unit, dt);
    }
    return;
  }

  // 只有灵仆会自动跟随召唤者；镜像必须等待玩家下一次指令。
  if (unit.summonType !== 'minion') return;
  const keep = 56;
  if (source && source.alive && distance(unit, source) > keep) {
    if (sim.time >= unit.repathAt || !unit.path.length) {
      unit.path = findPathWorld(sim.map, unit.x, unit.y, source.x, source.y);
      unit.repathAt = sim.time + (unit.repathInterval || 0.6);
    }
    moveAlongPath(sim, unit, dt);
  } else {
    unit.path = [];
  }
}

function updateTower(sim, tower, dt) {
  if (!tower.alive) return;
  tower.cannonCd = Math.max(0, tower.cannonCd - dt);
  if (tower.cannonCount <= 0 || tower.cannonCd > 0) return;
  let best = null;
  let bestDist = Infinity;
  for (const hero of [...sim.heroes, ...sim.summons]) {
    if (!hero.alive || !isEnemy(sim, tower.owner, hero.owner)) continue;
    const d = distance(tower, hero);
    if (d <= tower.cannonRange && d < bestDist) {
      best = hero;
      bestDist = d;
    }
  }
  if (!best) return;
  tower.cannonCd = ITEMS.cannon.interval / Math.max(1, tower.cannonCount);
  addEvent(sim, 'attack', {
    fromX: tower.x,
    fromY: tower.y,
    toX: best.x,
    toY: best.y,
    color: '#ffd166',
    ranged: true,
    owner: tower.owner,
    tower: true,
  });
  damageUnit(sim, tower, best, tower.cannonDamage, 'physical');
}

function collectResources(sim) {
  for (const hero of sim.heroes) {
    if (!hero.alive) continue;
    const player = playerOf(sim, hero.owner);
    if (!player || player.eliminated) continue;
    for (const node of sim.nodes) {
      if (!node.available) continue;
      const nx = node.x * sim.map.tile + sim.map.tile / 2;
      const ny = node.y * sim.map.tile + sim.map.tile / 2;
      if (Math.hypot(hero.x - nx, hero.y - ny) <= RESOURCE_PICKUP_RANGE) {
        node.available = false;
        const respawnDuration = resourceRespawnSeconds(sim.time);
        node.respawnAt = sim.time + respawnDuration;
        node.respawnTotal = respawnDuration;
        addGold(sim, player, node.gold, hero, nx, ny, `+${node.gold} 金币`);
        addEvent(sim, 'resourcePickup', { x: nx, y: ny, owner: player.id });
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

function aiThink(sim, p, ai) {
  const hero = p.hero;
  const tower = p.tower;
  if (!hero || !hero.alive) return;
  const cfg = ai.cfg || AI_LEVELS[sim.aiLevel] || AI_LEVELS.normal;

  const enemyHeroes = sim.heroes.filter((h) => h.alive && isEnemy(sim, p.id, h.owner));
  const enemyTowers = sim.towers.filter((t) => t.alive && isEnemy(sim, p.id, t.owner));
  const nearestHero = chooseAIHeroTarget(hero, enemyHeroes, cfg);
  const lowHp = hero.hp / hero.maxHp < cfg.retreat;
  const earlyGame = sim.time < 20;

  // 低血量回防
  if (lowHp && tower.alive) {
    if (distance(hero, tower) > 130) {
      aiMove(sim, p, tower.x + (Math.random() - 0.5) * 60, tower.y + (Math.random() - 0.5) * 60);
      return;
    }
  }

  // 己方塔被攻击时回防集火，避免被单英雄速推
  if (cfg.defend) {
    const threatened = p.towers
      .filter((t) => t.alive && sim.time - (t.lastDamagedAt || -99) < 3 && t.hp < t.maxHp * 0.98)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (threatened) {
      const attackers = enemiesOf(sim, p.id).filter(
        (e) => e.kind !== 'tower' && distance(e, threatened) < 340
      );
      const target = closest(threatened, attackers);
      if (target) {
        aiAttack(sim, p, target, cfg);
        return;
      }
    }
  }

  // 技能：困难/噩梦使用全队技能
  if (cfg.allSkills) {
    aiUseAllSkills(sim, p, cfg);
  } else {
  const skill = HEROES[hero.heroId].skill;
  if (nearestHero && p.gold >= skill.cost && hero.skillCd <= 0) {
    const d = distance(hero, nearestHero);
    let use = false;
    if (skill.id === 'frost') use = d < (skill.range || 200);
    else if (skill.id === 'shade') use = d < 190;
    else if (skill.id === 'ember') use = d < 120;
    else if (skill.id === 'bulwark') use = d < 190 && hero.shield <= 0;
    else if (skill.id === 'mirage') {
      const active = sim.summons.some(
        (s) => s.alive && s.summonType === 'clone' && s.sourceHeroId === hero.id
      );
      use = d < 260 && !active;
    } else if (skill.id === 'spirit') {
      const active = sim.summons.filter(
        (s) => s.alive && s.summonType === 'minion' && s.owner === p.id
      ).length;
      use = active < skill.maxMinions && (d < 360 || sim.time > 25);
    } else if (skill.id === 'rally') {
      use = alliesOf(sim, p.id).some((a) => a.hp < a.maxHp * 0.8);
    } else if (skill.id === 'wave' || skill.id === 'meteor') {
      use = d < (skill.range || 200) + 20;
    } else if (skill.id === 'quake') {
      use = d < 140;
    }
    if (use && !lowHp) castSkill(sim, p, nearestHero.x, nearestHero.y);
  }
  }

  // 追击附近敌人；前 20 秒只反击贴脸的对手，给玩家留出收集与建塔节奏
  if (nearestHero && distance(hero, nearestHero) < (earlyGame ? cfg.earlyEngage : cfg.engage)) {
    if (!lowHp && hero.hp / hero.maxHp > cfg.retreat * 0.72) {
      aiAttack(sim, p, nearestHero, cfg);
      return;
    }
  }

  // 攻击敌方魂塔：敌方英雄阵亡、魂塔残血或进入中后期时优先推进
  const targetTower = closest(hero, enemyTowers);
  const towerOwner = targetTower ? playerOf(sim, targetTower.owner) : null;
  const towerOwnerDead = towerOwner && (!towerOwner.hero || !towerOwner.hero.alive);
  if (
    targetTower &&
    (towerOwnerDead ||
      targetTower.hp < targetTower.maxHp * 0.55 ||
      sim.time > 60 ||
      (hero.level >= 4 && distance(hero, targetTower) < 340))
  ) {
    aiAttack(sim, p, targetTower, cfg);
    return;
  }

  // 收集资源（中后期除非缺钱，否则不再执着于资源）
  let node = null;
  let nodeDist = Infinity;
  for (const n of sim.nodes) {
    if (!n.available) continue;
    const nx = n.x * sim.map.tile + sim.map.tile / 2;
    const ny = n.y * sim.map.tile + sim.map.tile / 2;
    const d = Math.hypot(hero.x - nx, hero.y - ny);
    if (d < 900 && d < nodeDist) {
      node = { x: nx, y: ny };
      nodeDist = d;
    }
  }
  if (node && (p.gold < cfg.resourceGold || !targetTower)) {
    if (nodeDist > 26) aiMove(sim, p, node.x, node.y);
    return;
  }

  // 有塔可推就推，没有则巡逻到中央
  if (targetTower) {
    aiAttack(sim, p, targetTower, cfg);
    return;
  }

  // 巡逻到中央
  if (sim.time - ai.patrol > 2.5) {
    ai.patrol = sim.time;
    const c = sim.map.center;
    aiMove(
      sim,
      p,
      c.x * sim.map.tile + (Math.random() - 0.5) * 180,
      c.y * sim.map.tile + (Math.random() - 0.5) * 180
    );
  }
}

function aiSkillReach(skill) {
  if (skill.chainRange) return skill.chainRange + 30;
  if (skill.range) return skill.range + 30;
  if (skill.dash) return skill.dash + 45;
  if (skill.radius) return Math.max(220, skill.radius + 50);
  return 220;
}

function aiSkillTargetForHero(sim, p, hero, skill) {
  const enemies = enemiesOf(sim, p.id);
  const reach = aiSkillReach(skill);
  let best = null;
  let bestD = Infinity;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const d = distance(hero, enemy);
    if (d <= reach && d < bestD) {
      best = enemy;
      bestD = d;
    }
  }
  return best;
}

function aiUseAllSkills(sim, p, cfg) {
  const remember = p.selectedHeroId;
  for (const unit of p.heroes) {
    if (!unit.alive || unit.skillCd > 0) continue;
    const def = HEROES[unit.heroId];
    const skill = def.skill;
    if (!skill || p.gold < skill.cost + 10) continue;
    if (skill.id === 'bulwark' && unit.shield > 0) continue;
    if (skill.id === 'mirage') {
      const active = sim.summons.some(
        (s) => s.alive && s.summonType === 'clone' && s.sourceHeroId === unit.id
      );
      if (active) continue;
    }
    if (skill.id === 'spirit') {
      const active = sim.summons.filter(
        (s) => s.alive && s.summonType === 'minion' && s.owner === p.id
      ).length;
      if (active >= skill.maxMinions) continue;
    }
    if (skill.id === 'lunar' || skill.id === 'rally') {
      const wounded = alliesOf(sim, p.id).some((a) => a.hp < a.maxHp * 0.72);
      if (!wounded) continue;
      p.selectedHeroId = unit.id;
      syncSelected(p);
      castSkill(sim, p, unit.x, unit.y);
      continue;
    }
    const target = aiSkillTargetForHero(sim, p, unit, skill);
    if (!target) continue;
    p.selectedHeroId = unit.id;
    syncSelected(p);
    castSkill(sim, p, target.x, target.y);
  }
  p.selectedHeroId = remember;
  syncSelected(p);
}

function chooseAIHeroTarget(hero, enemyHeroes, cfg) {
  if (!enemyHeroes.length) return null;
  if (!cfg.smart) return closest(hero, enemyHeroes);
  let best = null;
  let bestScore = Infinity;
  for (const enemy of enemyHeroes) {
    const d = distance(hero, enemy);
    const missingHp = 1 - enemy.hp / Math.max(1, enemy.maxHp);
    const threat = enemy.damage * enemy.attackInterval;
    const score = d - missingHp * 420 - threat * 2.2;
    if (score < bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

function closest(from, list) {
  let best = null;
  let bestDist = Infinity;
  for (const item of list) {
    const d = distance(from, item);
    if (d < bestDist) {
      best = item;
      bestDist = d;
    }
  }
  return best;
}

function aiMove(sim, p, x, y) {
  const hero = p.hero;
  if (!hero.alive) return;
  const goal = `${Math.round(x / 16)},${Math.round(y / 16)}`;
  const ai = sim.ai[p.id];
  if (ai && ai.lastGoal === goal && hero.path.length > 0) return;
  if (ai) ai.lastGoal = goal;
  commandMove(sim, hero, x, y);
  for (const clone of playerClones(sim, p)) commandMove(sim, clone, x, y);
}

function aiAttack(sim, p, target, cfg = sim.ai[p.id]?.cfg || AI_LEVELS[sim.aiLevel] || AI_LEVELS.normal) {
  if (!target || !target.alive) return;
  const units = cfg.focus ? p.heroes.filter((h) => h.alive) : [p.hero];
  for (const unit of units) {
    if (!unit || !unit.alive) continue;
    commandAttack(sim, unit, target);
  }
  for (const clone of playerClones(sim, p)) commandAttack(sim, clone, target);
}

function aiSpend(sim, p) {
  if (p.eliminated) return;
  if (!p.tower || !p.tower.alive) {
    const altTower = p.towers.find((t) => t.alive);
    const altHero = altTower ? p.heroes.find((h) => h.towerId === altTower.id) : null;
    if (altHero) {
      p.selectedHeroId = altHero.id;
      syncSelected(p);
    }
  }
  let tower = p.tower;
  let hero = p.hero;
  const cfg = sim.ai[p.id]?.cfg || AI_LEVELS[sim.aiLevel] || AI_LEVELS.normal;
  const reserve = hero ? HEROES[hero.heroId].skill.cost : 0;

  // AI 有余钱时扩建魂塔，选择尚未拥有的英雄
  if (p.gold > cfg.buildGold) {
    const heroId = Object.keys(HEROES)[Math.floor(Math.random() * Object.keys(HEROES).length)];
    const cost = buildTowerCost(p, heroId);
    if (p.gold >= cost + cfg.buildReserve) {
      const occupied = new Set(sim.towers.map((t) => `${t.tx},${t.ty}`));
      const spot = chooseAIPlacement(sim.map, p.slot, occupied);
      if (spot) {
        const prev = p.selectedHeroId;
        const res = buildTower(sim, p, heroId, spot.x, spot.y);
        if (res.ok) {
          const prevHero = p.heroes.find((h) => h.id === prev);
          if (prevHero && prevHero.alive) {
            p.selectedHeroId = prev;
            syncSelected(p);
          }
          return;
        }
      }
    }
  }

  // 塔快被打碎时优先修复
  if (
    tower.alive &&
    tower.hp / tower.maxHp < cfg.repairAt &&
    sim.time - tower.lastRepairAt >= REPAIR_COOLDOWN &&
    p.gold >= REPAIR_COST + reserve
  ) {
    repairTower(sim, p);
    return;
  }
  if (tower.alive && tower.cannonCount < 2) {
    const cost = itemCost('cannon', tower.cannonCount);
    if (p.gold >= cost + reserve + 35) {
      buyItem(sim, p, 'cannon');
      return;
    }
  }
  if (hero && hero.level < HERO_UPGRADE.maxLevel) {
    const cost = heroUpgradeCost(hero.level);
    if (p.gold >= cost + reserve + 25) {
      upgradeHero(sim, p);
      return;
    }
  }
  if (tower.alive) {
    if (tower.level < TOWER.maxLevel) {
      const cost = towerUpgradeCost(tower.level);
      if (p.gold >= cost + reserve + 30) {
        upgradeTower(sim, p);
        return;
      }
    }
    if (tower.mintCount < 1) {
      const cost = itemCost('mint', tower.mintCount);
      if (p.gold >= cost + reserve + 90) {
        buyItem(sim, p, 'mint');
        return;
      }
    }
    if (tower.wallCount < 2 && p.gold >= itemCost('wall', tower.wallCount) + reserve + 100) {
      buyItem(sim, p, 'wall');
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* 序列化                                                              */
/* ------------------------------------------------------------------ */

export function serializeSim(sim, consumeEvents = true) {
  const players = sim.players.map((p) => {
    const tower = p.tower;
    const hero = p.hero;
    const heroEarned = p.heroes.reduce((sum, h) => sum + h.earned, 0);
    const towerEarned = p.towers.reduce((sum, t) => sum + t.earned, 0);
    return {
      id: p.id,
      name: p.name,
      slot: p.slot,
      color: p.color,
      isAI: p.isAI,
      team: p.team ?? null,
      passive: !!p.passive,
      connected: p.connected,
      aiControlled: p.aiControlled,
      autoSelectNearest: p.autoSelectNearest !== false,
      manualHeroSelect: !!p.manualHeroSelect,
      heroId: p.heroId,
      selectedHeroId: p.selectedHeroId,
      selectedTowerId: tower ? tower.id : null,
      gold: Math.floor(p.gold),
      kills: p.kills,
      deaths: p.deaths,
      eliminated: p.eliminated,
      damageDealt: Math.round(p.damageDealt),
      score: Math.round(scoreOf(p)),
      hasHero: p.heroes.length > 0,
      heroAlive: !!hero && hero.alive,
      towerAlive: !!tower && tower.alive,
      heroLevel: hero ? hero.level : 0,
      towerLevel: tower ? tower.level : 0,
      respawnIn: hero && !hero.alive ? Math.max(0, Math.ceil(hero.respawnAt - sim.time)) : 0,
      heroBounty: hero ? Math.floor(hero.earned * BOUNTY_RATIO) : 0,
      towerBounty: tower ? Math.floor(tower.earned * BOUNTY_RATIO) : 0,
      heroEarned: Math.floor(heroEarned),
      towerEarned: Math.floor(towerEarned),
      totalEarned: Math.floor(heroEarned + towerEarned),
      heroesAlive: p.heroes.filter((h) => h.alive).length,
      heroesTotal: p.heroes.length,
      towersAlive: p.towers.filter((t) => t.alive).length,
      towersTotal: p.towers.length,
      ownedHeroIds: p.heroes.map((h) => h.heroId),
      canBuildTower: true,
      buildBaseCost: nextBuildBaseCost(p),
      costs: {
        heroUpgrade: hero && hero.level < HERO_UPGRADE.maxLevel ? heroUpgradeCost(hero.level) : null,
        towerUpgrade: tower && tower.level < TOWER.maxLevel && tower.alive ? towerUpgradeCost(tower.level) : null,
        cannon: tower && tower.cannonCount < ITEMS.cannon.max ? itemCost('cannon', tower.cannonCount) : null,
        wall: tower && tower.wallCount < ITEMS.wall.max ? itemCost('wall', tower.wallCount) : null,
        mint: tower && tower.mintCount < ITEMS.mint.max ? itemCost('mint', tower.mintCount) : null,
        repair: REPAIR_COST,
        repairCd: tower ? Math.max(0, Math.ceil(REPAIR_COOLDOWN - (sim.time - tower.lastRepairAt))) : 0,
      },
    };
  });

  const heroes = sim.heroes.map((h) => ({
    id: h.id,
    kind: 'hero',
    owner: h.owner,
    towerId: h.towerId,
    heroId: h.heroId,
    name: h.name,
    x: h.x,
    y: h.y,
    radius: h.radius,
    hp: Math.max(0, Math.round(h.hp)),
    maxHp: Math.round(h.maxHp),
    armor: Math.round(h.armor * 10) / 10,
    damage: Math.round(h.damage * 10) / 10,
    income: Math.round(h.income * 100) / 100,
    level: h.level,
    alive: h.alive,
    atkRange: h.range,
    shield: Math.round(h.shield),
    shieldIn: Math.max(0, h.shieldUntil - sim.time),
    slowed: h.slowUntil > sim.time,
    rooted: h.rootUntil > sim.time,
    rootIn: Math.max(0, h.rootUntil - sim.time),
    enraged: h.enraged,
    kite: !!h.kite,
    skillCd: Math.max(0, h.skillCd),
    skillMaxCd: HEROES[h.heroId].skill.cooldown,
    respawnIn: h.alive ? 0 : Math.max(0, Math.ceil(h.respawnAt - sim.time)),
    earned: Math.floor(h.earned),
    bounty: Math.floor(h.earned * BOUNTY_RATIO),
    target: h.target,
    manualReadyIn: Math.max(0, MANUAL_ATTACK_MIN_INTERVAL - (sim.time - (h.lastManualAt || -99))),
  }));

  const towers = sim.towers.map((t) => ({
    id: t.id,
    kind: 'tower',
    owner: t.owner,
    name: t.name,
    x: t.x,
    y: t.y,
    tx: t.tx,
    ty: t.ty,
    radius: t.radius,
    hp: Math.max(0, Math.round(t.hp)),
    maxHp: Math.round(t.maxHp),
    armor: Math.round(t.armor * 10) / 10,
    level: t.level,
    alive: t.alive,
    heroId: t.heroId,
    cannonCount: t.cannonCount,
    wallCount: t.wallCount,
    mintCount: t.mintCount,
    cannonDamage: Math.round(t.cannonDamage * 10) / 10,
    cannonRange: Math.round(t.cannonRange),
    shield: Math.round(t.shield || 0),
    shieldIn: Math.max(0, (t.shieldUntil || 0) - sim.time),
    income: Math.round(t.income * 10) / 10,
    earned: Math.floor(t.earned),
    bounty: Math.floor(t.earned * BOUNTY_RATIO),
    destroyedAt: t.destroyedAt,
  }));

  const summons = sim.summons
    .filter((s) => s.alive)
    .map((s) => ({
      id: s.id,
      kind: 'summon',
      summonType: s.summonType,
      owner: s.owner,
      sourceHeroId: s.sourceHeroId,
      heroId: s.heroId,
      name: s.name,
      icon: s.icon,
      color: s.color,
      accent: s.accent,
      x: s.x,
      y: s.y,
      radius: s.radius,
      hp: Math.max(0, Math.round(s.hp)),
      maxHp: Math.round(s.maxHp),
      armor: Math.round((s.armor || 0) * 10) / 10,
      damage: Math.round(s.damage * 10) / 10,
      level: s.level,
      range: s.range,
      ranged: s.ranged,
      expiresIn: Math.max(0, Math.ceil(s.expiresAt - sim.time)),
      duration: s.duration,
      alive: true,
      target: s.target,
    }));

  const nodes = sim.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    gold: n.gold,
    available: n.available,
    respawnIn: n.available ? 0 : Math.max(0, Math.ceil(n.respawnAt - sim.time)),
    respawnTotal: n.respawnTotal || RESOURCE_RESPAWN,
  }));

  const events = sim.events;
  if (consumeEvents) sim.events = [];

  return {
    startedAt: sim.startedAt,
    time: Math.floor(sim.time * 10) / 10,
    timeLimit: sim.matchLimit,
    over: sim.over,
    winner: sim.winner,
    endReason: sim.endReason,
    teamMode: !!sim.teamMode,
    manualAttack: sim.manualAttack !== false,
    winnerTeam: sim.winnerTeam ?? null,
    deathMode: !!sim.deathMode,
    deathModeAt: sim.deathModeAt || 0,
    deathModeIn: Math.max(0, Math.ceil(sim.deathModeAt - sim.time)),
    players,
    heroes,
    towers,
    summons,
    nodes,
    events,
  };
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

export function pickAIPlayers(count, existingNames = []) {
  const names = AI_NAMES.filter((n) => !existingNames.includes(n));
  const pool = names.length ? names : AI_NAMES;
  const picked = [];
  const used = new Set(existingNames);
  for (let i = 0; i < count; i++) {
    let name = pool[Math.floor(Math.random() * pool.length)];
    let guard = 0;
    while (used.has(name) && guard++ < 30) {
      name = `${pool[Math.floor(Math.random() * pool.length)]}${guard + 1}`;
    }
    used.add(name);
    picked.push(`AI · ${name}`);
  }
  return picked;
}
