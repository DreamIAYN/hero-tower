/**
 * 塔魂：四境争锋 — 10 CPS 机器人竞技场
 *
 * 目标：
 *  - 用服务器同一套 engine 规则（applyBattleAction）驱动多个机器人；
 *  - 所有操作都经过引擎校验，不直接改状态；
 *  - 手动点击攻击严格 <= 10 次/秒；
 *  - 其余操作（移动/技能/建造/升级/修复/买装备）都走合法 action。
 *
 * 用法示例：
 *   node scripts/bot-arena.mjs \
 *     --lineup swarm,ai:nightmare,ai:nightmare,ai:nightmare \
 *     --matches 100 --seed 1000 \
 *     --out data/bot-results/swarm_vs_nightmare.json
 *
 * lineup 记号：
 *   swarm / sniper / summoner / bruiser / adaptive / random
 *   ai:<easy|normal|hard|nightmare>[:heroId]
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  AI_LEVELS,
  HEROES,
  HERO_LIST,
  HERO_UPGRADE,
  TOWER,
  ITEMS,
  heroUpgradeCost,
  towerUpgradeCost,
  itemCost,
} from '../shared/heroes.js';
import { generateMap, tileBuildable } from '../shared/mapgen.js';
import {
  applyBattleAction,
  buildTowerCost,
  chooseAIPlacement,
  createBattle,
  tickBattle,
} from '../shared/engine.js';

const DT = 1 / 30;
const ACTION_INTERVAL = 0.1; // 10 actions/s 上限（含点击攻击）
const MATCH_SECONDS = 12 * 60;

const HERO_IDS = Object.keys(HEROES);

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

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function inAttackRange(hero, target) {
  return distance(hero, target) <= hero.range + (target.radius || 14) + 1.5;
}

function heroLabel(hero) {
  return `${HEROES[hero.heroId]?.name || hero.heroId} Lv${hero.level}`;
}

function occupiedSet(sim) {
  return new Set(sim.towers.map((t) => `${t.tx},${t.ty}`));
}

/* ------------------------------------------------------------------ */
/* 机器人配置                                                          */
/* ------------------------------------------------------------------ */

const POLICIES = {
  swarm: {
    id: 'swarm',
    name: '镜像海',
    desc: '多镜影叠分身，全队抱团，点击由本体+全部分身共同结算。',
    openingHero: 'mirage',
    heroPool: ['mirage', 'mirage', 'mirage', 'mirage'],
    maxTowers: 4,
    placement: 'forward',
    buildStyle: 'forward',
    maxPerHero: 4,
    deathball: true,
    kite: false,
    targetMode: 'tower',
    retreat: 0.18,
    aggro: 720,
    spendOrder: ['repair', 'build', 'upgradeHero', 'cannon', 'upgradeTower', 'mint', 'wall'],
    buildReserve: 60,
    upgradeReserve: 55,
    skillReserve: 50,
    cloneReserve: 55,
    maxClones: 3,
    skills: true,
    focusEvery: 0.65,
    moveEvery: 0.4,
    spendEvery: 0.65,
    earlyBuildTime: 40,
    minTowersBeforeItems: 2,
    minTowersBeforeHeroUpgrade: 2,
    cloneMinDist: 320,
  },
  swarm2: {
    id: 'swarm2',
    name: '镜像海·运营',
    desc: '先补塔再叠镜像，抱团集火，利用分身把 10 CPS 点击伤害放大。',
    openingHero: 'mirage',
    heroPool: ['mirage', 'mirage', 'mirage', 'lunar'],
    maxTowers: 4,
    placement: 'home',
    buildStyle: 'safe',
    maxPerHero: 3,
    deathball: true,
    kite: false,
    targetMode: 'hero',
    retreat: 0.22,
    aggro: 550,
    spendOrder: ['repair', 'build', 'upgradeHero', 'cannon', 'upgradeTower', 'mint', 'wall'],
    buildReserve: 25,
    upgradeReserve: 40,
    skillReserve: 40,
    cloneReserve: 0,
    maxClones: 3,
    skills: true,
    focusEvery: 0.8,
    moveEvery: 0.4,
    spendEvery: 0.65,
    earlyBuildTime: 20,
    minTowersBeforeItems: 2,
    minTowersBeforeHeroUpgrade: 1,
    cloneMinDist: 360,
  },
  sniper: {
    id: 'sniper',
    name: '苍隼风筝',
    desc: '苍隼/霜翎远程保持距离，利用 245 射程与 10 CPS 点射。',
    openingHero: 'falcon',
    heroPool: ['falcon', 'frost', 'thorn', 'lunar'],
    maxTowers: 3,
    placement: 'forward',
    buildStyle: 'safe',
    maxPerHero: 1,
    deathball: false,
    kite: true,
    targetMode: 'hero',
    retreat: 0.24,
    aggro: 640,
    spendOrder: ['repair', 'build', 'cannon', 'upgradeHero', 'upgradeTower', 'mint', 'wall'],
    buildReserve: 90,
    upgradeReserve: 70,
    skillReserve: 45,
    cloneReserve: 0,
    maxClones: 0,
    skills: true,
    focusEvery: 0.9,
    moveEvery: 0.35,
    spendEvery: 0.8,
    earlyBuildTime: 60,
    minTowersBeforeItems: 2,
    minTowersBeforeHeroUpgrade: 1,
    cloneMinDist: 320,
  },
  sniper_multi: {
    id: 'sniper_multi',
    name: '多隼哨塔',
    desc: '苍隼为主，补第二苍隼/月弦/荆棘，多塔提供自动火力与治疗。',
    openingHero: 'falcon',
    heroPool: ['falcon', 'falcon', 'lunar', 'thorn'],
    maxTowers: 4,
    placement: 'home',
    buildStyle: 'safe',
    maxPerHero: 2,
    deathball: false,
    kite: true,
    targetMode: 'hero',
    retreat: 0.27,
    aggro: 620,
    spendOrder: ['repair', 'build', 'upgradeHero', 'cannon', 'upgradeTower', 'mint', 'wall'],
    buildReserve: 70,
    upgradeReserve: 55,
    skillReserve: 45,
    cloneReserve: 0,
    maxClones: 0,
    skills: true,
    focusEvery: 0.9,
    moveEvery: 0.35,
    spendEvery: 0.75,
    earlyBuildTime: 30,
    minTowersBeforeItems: 2,
    minTowersBeforeHeroUpgrade: 1,
    cloneMinDist: 320,
  },
  sniper_turtle: {
    id: 'sniper_turtle',
    name: '守塔狙击',
    desc: '低仇恨守塔，优先资源与生存，等三家互耗后再收割。',
    openingHero: 'falcon',
    heroPool: ['falcon', 'frost', 'lunar', 'thorn'],
    maxTowers: 4,
    placement: 'home',
    buildStyle: 'safe',
    maxPerHero: 1,
    deathball: false,
    kite: true,
    targetMode: 'balanced',
    retreat: 0.34,
    aggro: 470,
    spendOrder: ['repair', 'build', 'upgradeHero', 'cannon', 'upgradeTower', 'mint', 'wall'],
    buildReserve: 60,
    upgradeReserve: 50,
    skillReserve: 45,
    cloneReserve: 0,
    maxClones: 0,
    skills: true,
    focusEvery: 1.0,
    moveEvery: 0.4,
    spendEvery: 0.7,
    earlyBuildTime: 25,
    minTowersBeforeItems: 2,
    minTowersBeforeHeroUpgrade: 1,
    cloneMinDist: 320,
  },
  sniper_tank: {
    id: 'sniper_tank',
    name: '坦克狙击',
    desc: '苍隼主输出，磐卫/月弦吸收火力，专门克制 AI 的最近目标选择。',
    openingHero: 'falcon',
    heroPool: ['falcon', 'bulwark', 'lunar', 'thorn'],
    maxTowers: 4,
    placement: 'home',
    buildStyle: 'safe',
    maxPerHero: 1,
    deathball: false,
    kite: true,
    targetMode: 'hero',
    retreat: 0.25,
    aggro: 620,
    spendOrder: ['repair', 'build', 'upgradeHero', 'cannon', 'upgradeTower', 'mint', 'wall'],
    buildReserve: 65,
    upgradeReserve: 55,
    skillReserve: 45,
    cloneReserve: 0,
    maxClones: 0,
    skills: true,
    focusEvery: 0.9,
    moveEvery: 0.35,
    spendEvery: 0.75,
    earlyBuildTime: 30,
    minTowersBeforeItems: 2,
    minTowersBeforeHeroUpgrade: 1,
    cloneMinDist: 320,
  },
  sniper_best: {
    id: 'sniper_best',
    name: '苍隼·最优',
    desc: '10 CPS 下综合胜率最高的配置：苍隼主输出、霜翎副手，守家开局、优先击杀残血。',
    openingHero: 'falcon',
    heroPool: ['falcon', 'frost'],
    maxTowers: 2,
    placement: 'home',
    buildStyle: 'forward',
    maxPerHero: 1,
    deathball: false,
    kite: true,
    targetMode: 'hero',
    retreat: 0.2,
    aggro: 760,
    spendOrder: ['repair', 'upgradeHero', 'cannon', 'build', 'upgradeTower', 'mint', 'wall'],
    buildReserve: 40,
    upgradeReserve: 35,
    skillReserve: 35,
    cloneReserve: 0,
    maxClones: 0,
    skills: true,
    focusEvery: 0.8,
    moveEvery: 0.3,
    spendEvery: 0.55,
    earlyBuildTime: 20,
    minTowersBeforeItems: 1,
    minTowersBeforeHeroUpgrade: 1,
    cloneMinDist: 320,
    repairAt: 0.62,
    towerDangerPenalty: 0,
  },
  sniper_rush: {
    id: 'sniper_rush',
    name: '单隼速攻',
    desc: '只养一只苍隼，钱全部投入等级/装备，最快速度结束比赛。',
    openingHero: 'falcon',
    heroPool: ['falcon', 'falcon'],
    maxTowers: 2,
    placement: 'forward',
    buildStyle: 'forward',
    maxPerHero: 2,
    deathball: false,
    kite: true,
    targetMode: 'hero',
    retreat: 0.2,
    aggro: 760,
    spendOrder: ['repair', 'upgradeHero', 'cannon', 'build', 'upgradeTower', 'mint', 'wall'],
    buildReserve: 40,
    upgradeReserve: 35,
    skillReserve: 35,
    cloneReserve: 0,
    maxClones: 0,
    skills: true,
    focusEvery: 0.8,
    moveEvery: 0.3,
    spendEvery: 0.55,
    earlyBuildTime: 20,
    minTowersBeforeItems: 1,
    minTowersBeforeHeroUpgrade: 1,
    cloneMinDist: 320,
    repairAt: 0.62,
    towerDangerPenalty: 18,
  },
  summoner: {
    id: 'summoner',
    name: '灵姝运营',
    desc: '灵姝灵仆多线推进，优先经济、资源和塔，用召唤物磨塔。',
    openingHero: 'spirit',
    heroPool: ['spirit', 'spirit', 'lunar', 'thorn'],
    maxTowers: 4,
    placement: 'forward',
    buildStyle: 'safe',
    maxPerHero: 2,
    deathball: false,
    kite: true,
    targetMode: 'tower',
    retreat: 0.25,
    aggro: 620,
    spendOrder: ['repair', 'build', 'upgradeHero', 'cannon', 'upgradeTower', 'mint', 'wall'],
    buildReserve: 80,
    upgradeReserve: 60,
    skillReserve: 55,
    cloneReserve: 0,
    maxClones: 0,
    skills: true,
    focusEvery: 0.9,
    moveEvery: 0.4,
    spendEvery: 0.7,
    earlyBuildTime: 45,
    minTowersBeforeItems: 2,
    minTowersBeforeHeroUpgrade: 2,
    cloneMinDist: 320,
  },
  bruiser: {
    id: 'bruiser',
    name: '雷铸推进',
    desc: '磐卫/雷铸前排抗塔，集火拆塔，塔毁后追杀无法复活的英雄。',
    openingHero: 'bulwark',
    heroPool: ['bulwark', 'ember', 'volt', 'mirage'],
    maxTowers: 4,
    placement: 'forward',
    buildStyle: 'forward',
    maxPerHero: 1,
    deathball: true,
    kite: false,
    targetMode: 'tower',
    retreat: 0.22,
    aggro: 700,
    spendOrder: ['repair', 'build', 'cannon', 'upgradeHero', 'upgradeTower', 'mint', 'wall'],
    buildReserve: 70,
    upgradeReserve: 60,
    skillReserve: 50,
    cloneReserve: 55,
    maxClones: 1,
    skills: true,
    focusEvery: 0.65,
    moveEvery: 0.4,
    spendEvery: 0.65,
    earlyBuildTime: 40,
    minTowersBeforeItems: 2,
    minTowersBeforeHeroUpgrade: 1,
    cloneMinDist: 300,
  },
  adaptive: {
    id: 'adaptive',
    name: '四境自适应',
    desc: '根据地图/资源点选择镜像海、苍隼或灵姝开局，综合运营与集火。',
    openingHero: null,
    heroPool: ['mirage', 'falcon', 'spirit', 'lunar', 'bulwark'],
    maxTowers: 4,
    placement: 'forward',
    buildStyle: 'balanced',
    maxPerHero: 2,
    deathball: true,
    kite: true,
    targetMode: 'balanced',
    retreat: 0.21,
    aggro: 700,
    spendOrder: ['repair', 'build', 'upgradeHero', 'cannon', 'upgradeTower', 'mint', 'wall'],
    buildReserve: 70,
    upgradeReserve: 55,
    skillReserve: 50,
    cloneReserve: 55,
    maxClones: 2,
    skills: true,
    focusEvery: 0.7,
    moveEvery: 0.4,
    spendEvery: 0.7,
    earlyBuildTime: 40,
    minTowersBeforeItems: 2,
    minTowersBeforeHeroUpgrade: 1,
    cloneMinDist: 320,
  },
  random: {
    id: 'random',
    name: '随机合法',
    desc: '新手基线：只做引擎接受的随机动作，不代表最优策略。',
    openingHero: null,
    heroPool: HERO_IDS,
    maxTowers: 3,
    placement: 'home',
    buildStyle: 'safe',
    maxPerHero: 3,
    deathball: false,
    kite: false,
    targetMode: 'balanced',
    retreat: 0.15,
    aggro: 500,
    spendOrder: ['repair', 'build', 'upgradeHero', 'cannon', 'upgradeTower'],
    buildReserve: 100,
    upgradeReserve: 80,
    skillReserve: 60,
    cloneReserve: 0,
    maxClones: 0,
    skills: true,
    focusEvery: 1.2,
    moveEvery: 0.8,
    spendEvery: 1.5,
    earlyBuildTime: 90,
    minTowersBeforeItems: 2,
    minTowersBeforeHeroUpgrade: 1,
    cloneMinDist: 320,
  },
};

/* ------------------------------------------------------------------ */
/* 开局与建塔选点                                                      */
/* ------------------------------------------------------------------ */

function chooseOpeningPlacement(map, slot, style, occupied, rng) {
  if (style === 'home' || style === 'random') {
    return chooseAIPlacement(map, slot, occupied);
  }
  const spawn = map.spawns[slot];
  const candidates = [];
  for (let y = 1; y < map.h - 1; y++) {
    for (let x = 1; x < map.w - 1; x++) {
      if (!tileBuildable(map, x, y)) continue;
      if (map.nodes.some((n) => n.x === x && n.y === y)) continue;
      if (occupied.has(`${x},${y}`)) continue;
      const ds = Math.hypot(x - spawn.cx, y - spawn.cy);
      const dc = Math.hypot(x - map.center.x, y - map.center.y);
      const dnode = Math.min(
        ...map.nodes.map((n) => Math.hypot(x - n.x, y - n.y))
      );
      // 不贴脸其他出生点
      const dOther = Math.min(
        ...map.spawns
          .filter((s) => s.index !== slot)
          .map((s) => Math.hypot(x - s.cx, y - s.cy))
      );
      if (dOther < 3.5) continue;
      let score;
      // 四阵营方向：尽量待在自己出生点所在的象限，避免 4 人局两边各挤两个人
      const sx = Math.sign(spawn.cx - map.center.x);
      const sy = Math.sign(spawn.cy - map.center.y);
      const sameQuadrant =
        Math.sign(x - map.center.x) === sx && Math.sign(y - map.center.y) === sy;
      if (style === 'central') {
        score =
          -Math.abs(dc - 6.5) * 1.8 -
          dnode * 0.55 +
          (ds > 4 ? 0.8 : -3) +
          (sameQuadrant ? 0.8 : -0.8);
      } else {
        // forward：离自己 7~9 格、靠近资源点、不要离中心太远
        score =
          -Math.abs(ds - 8) * 2.1 -
          dnode * 0.6 +
          (dc < 11 ? 1.4 : 0) +
          (dOther > 7 ? 1.2 : 0) +
          (sameQuadrant ? 2.4 : -2.4);
      }
      candidates.push({ x, y, score: score + rng() * 0.9 });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best ? { x: best.x, y: best.y } : chooseAIPlacement(map, slot, occupied);
}

function chooseBuildSpot(sim, me, style, rng) {
  const occ = occupiedSet(sim);
  const hero = me.hero;
  const ownTowers = me.towers.filter((t) => t.alive);
  const anchor = hero || ownTowers[0];
  if (!anchor) return null;
  const enemies = [
    ...sim.heroes.filter((h) => h.alive && h.owner !== me.id),
    ...sim.towers.filter((t) => t.alive && t.owner !== me.id),
  ];
  const candidates = [];
  for (let y = 1; y < sim.map.h - 1; y++) {
    for (let x = 1; x < sim.map.w - 1; x++) {
      if (!tileBuildable(sim.map, x, y)) continue;
      if (sim.map.nodes.some((n) => n.x === x && n.y === y)) continue;
      if (occ.has(`${x},${y}`)) continue;
      const px = x * sim.map.tile + sim.map.tile / 2;
      const py = y * sim.map.tile + sim.map.tile / 2;
      const dHero = Math.hypot(px - anchor.x, py - anchor.y);
      const dNode = Math.min(
        ...sim.nodes
          .filter((n) => n.available)
          .map((n) => Math.hypot(x - n.x, y - n.y)),
        Infinity
      );
      const dEnemyTower = Math.min(
        ...sim.towers
          .filter((t) => t.alive && t.owner !== me.id)
          .map((t) => Math.hypot(x - t.tx, y - t.ty)),
        Infinity
      );
      const dEnemyHero = Math.min(
        ...sim.heroes
          .filter((h) => h.alive && h.owner !== me.id)
          .map((h) => Math.hypot(px - h.x, py - h.y)),
        Infinity
      );
      const dOwn = Math.min(
        ...ownTowers.map((t) => Math.hypot(x - t.tx, y - t.ty)),
        Infinity
      );
      if (dEnemyTower < 2.2 || dEnemyHero < 3.2) continue;
      let score;
      if (style === 'safe') {
        score =
          -dHero * 0.32 -
          dEnemyTower * 0.9 -
          dEnemyHero * 0.55 -
          dNode * 0.12 +
          (dOwn < 2.5 ? -2 : 0);
      } else if (style === 'balanced') {
        score =
          -dHero * 0.55 -
          dNode * 0.55 -
          dEnemyTower * 0.3 -
          dEnemyHero * 0.25 +
          (dOwn < 2 ? -1 : 0);
      } else {
        score =
          -Math.abs(dHero - 3.5) * 1.2 -
          dNode * 0.45 +
          Math.min(4, dEnemyTower) * 0.18 -
          dEnemyHero * 0.12;
      }
      candidates.push({ x, y, score: score + rng() * 0.7 });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best ? { x: best.x, y: best.y } : null;
}

/* ------------------------------------------------------------------ */
/* 机器人                                                              */
/* ------------------------------------------------------------------ */

class PolicyBot {
  constructor(spec, index, rng, trace = false, actionInterval = ACTION_INTERVAL) {
    this.id = spec.id;
    this.name = spec.name;
    this.slot = index;
    this.cfg = POLICIES[spec.policy];
    if (!this.cfg) throw new Error(`unknown policy: ${spec.policy}`);
    this.rng = rng;
    this.nextActionAt = 0;
    this.actionInterval = actionInterval;
    this.actions = 0;
    this.rejected = 0;
    this.lastError = null;
    this.clickTimes = [];
    this.actionTimes = [];
    this.hitClicks = 0;
    this.attackActions = 0;
    this.lastFocusAt = -99;
    this.lastFocusTarget = null;
    this.lastMoveAt = -99;
    this.lastMoveGoal = null;
    this.lastSpendAt = -99;
    this.lastSelectAt = -99;
    this.lastKiteToggleAt = -99;
    this.mainHeroId = null;
    this.openingHero = spec.heroId || this.pickOpeningHero();
    this.spendIndex = 0;
    this.skillCasts = 0;
    this.builds = 0;
    this.upgrades = 0;
    this.repairs = 0;
    this.items = 0;
    this.retreatTicks = 0;
    this.currentTarget = null;
    this.targetLockUntil = -99;
    this.retreatUntil = 0;
    this.trace = trace;
  }

  pickOpeningHero() {
    if (this.cfg.openingHero) return this.cfg.openingHero;
    return this.cfg.heroPool[Math.floor(this.rng() * this.cfg.heroPool.length)];
  }

  pickBuildHero(me) {
    const counts = {};
    for (const h of me.heroes) counts[h.heroId] = (counts[h.heroId] || 0) + 1;
    for (const id of this.cfg.heroPool) {
      if ((counts[id] || 0) < this.cfg.maxPerHero) return id;
    }
    return null;
  }

  update(sim) {
    if (sim.over) return;
    if (sim.time + 1e-9 < this.nextActionAt) return;
    const acted = this.think(sim);
    if (acted) {
      this.nextActionAt = Math.max(this.nextActionAt, sim.time) + this.actionInterval;
    }
  }

  do(sim, action, isClick = false) {
    const res = applyBattleAction(sim, this.id, action);
    this.actions += 1;
    this.actionTimes.push(sim.time);
    if (this.trace) {
      const me = sim.players.find((p) => p.id === this.id);
      const h = me?.hero;
      console.log(
        `t=${sim.time.toFixed(2)} ${this.cfg.id} ${action.type}` +
          (action.kind ? ` ${action.kind}:${action.id}` : '') +
          (action.heroId ? ` hero=${action.heroId}` : '') +
          ` ok=${res.ok}` +
          (h ? ` hp=${Math.round(h.hp)}/${h.maxHp} pos=${Math.round(h.x)},${Math.round(h.y)} gold=${Math.round(me.gold)}` : '') +
          (res.ok ? '' : ` reason=${res.reason}`)
      );
    }
    if (action.type === 'attack') {
      this.attackActions += 1;
      this.clickTimes.push(sim.time);
    }
    if (res.ok) {
      if (isClick) this.hitClicks += 1;
    } else {
      this.rejected += 1;
      this.lastError = res.reason;
    }
    return res;
  }

  think(sim) {
    const me = sim.players.find((p) => p.id === this.id);
    if (!me || me.eliminated) return false;

    // 1. 初始召唤
    if (!me.heroes.length) {
      const empty = me.towers.find((t) => t.alive && !t.heroId);
      if (empty && me.gold >= (HEROES[this.openingHero]?.price || 999)) {
        return this.do(sim, { type: 'summon', heroId: this.openingHero }).ok;
      }
      return false;
    }

    // 2. 保证有活着的选中英雄
    if (!me.hero || !me.hero.alive) {
      const alive = me.heroes.find((h) => h.alive);
      if (alive) return this.do(sim, { type: 'selectHero', heroId: alive.id }).ok;
      return false;
    }

    // 3. 主英雄选择：优先等级/攻击力最高的活英雄
    const aliveHeroes = me.heroes.filter((h) => h.alive);
    const bestMain = aliveHeroes
      .slice()
      .sort((a, b) => b.level - a.level || b.damage - a.damage)[0];
    if (
      bestMain &&
      me.hero.id !== bestMain.id &&
      sim.time - this.lastSelectAt > 1.5 &&
      !this.hasReadySkill(me, me.hero)
    ) {
      this.lastSelectAt = sim.time;
      return this.do(sim, { type: 'selectHero', heroId: bestMain.id }).ok;
    }
    const hero = me.hero;

    // 4. 首次开启风筝
    if (this.cfg.kite && !hero.kite && sim.time - this.lastKiteToggleAt > 2) {
      this.lastKiteToggleAt = sim.time;
      return this.do(sim, { type: 'toggleKite' }).ok;
    }

    const target = this.chooseTarget(sim, me, hero);
    const inRange = target && inAttackRange(hero, target);

    // 5. 低血撤退（但如果能收掉残血目标，先打）
    if (
      hero.hp / hero.maxHp < this.cfg.retreat &&
      !(target && target.kind === 'hero' && target.hp / target.maxHp < 0.22)
    ) {
      if (this.tryRetreat(sim, me, hero)) return true;
    }

    // 6. 高价值技能：在射程内时优先，否则只在赶路时放召唤/护盾
    const skillAction = this.maybeSkill(sim, me, hero, target, inRange);
    if (skillAction) {
      this.skillCasts += 1;
      return this.do(sim, skillAction).ok;
    }

    // 7. 在射程内：点击攻击（严格 10 次/秒上限由 ACTION_INTERVAL 保证）
    if (inRange) {
      const res = this.do(
        sim,
        { type: 'attack', kind: target.kind, id: target.id, manual: true },
        true
      );
      return res.ok;
    }

    // 8. 不在射程内：先用经济/维修动作填满赶路时间
    if (this.trySpend(sim, me, hero)) return true;

    // 9. 追击 / 集火 / 移动
    if (target) {
      if (this.cfg.deathball) {
        if (
          sim.time - this.lastFocusAt > this.cfg.focusEvery ||
          !this.lastFocusTarget ||
          this.lastFocusTarget.id !== target.id
        ) {
          this.lastFocusAt = sim.time;
          this.lastFocusTarget = { id: target.id, kind: target.kind };
          return this.do(sim, {
            type: 'focusFire',
            kind: target.kind,
            id: target.id,
          }).ok;
        }
        // 集火路径已经在跑，不要再用 move 重置路径
        return false;
      }
      if (this.moveTo(sim, hero, target.x, target.y, 0.85)) return true;
      return false;
    }

    // 10. 没有目标：收资源 / 巡逻
    const node = this.nearestNode(sim, me, hero);
    if (node) {
      if (this.moveTo(sim, hero, node.x, node.y, 0.65)) return true;
    }
    if (sim.time - this.lastMoveAt > 1.2) {
      const c = sim.map.center;
      this.moveTo(
        sim,
        hero,
        c.x * sim.map.tile + (this.rng() - 0.5) * 220,
        c.y * sim.map.tile + (this.rng() - 0.5) * 220,
        1.2
      );
      return true;
    }
    return false;
  }

  hasReadySkill(me, hero) {
    if (!hero || !hero.alive) return false;
    const skill = HEROES[hero.heroId]?.skill;
    return !!skill && hero.skillCd <= 0 && me.gold >= skill.cost;
  }

  maybeSkill(sim, me, hero, target, inRange) {
    if (!this.cfg.skills) return null;
    const ready = me.heroes
      .filter((h) => h.alive && h.skillCd <= 0 && me.gold >= HEROES[h.heroId].skill.cost + 8)
      .sort((a, b) => {
        const pa = this.skillPriority(HEROES[a.heroId].skill.id);
        const pb = this.skillPriority(HEROES[b.heroId].skill.id);
        return pb - pa;
      });
    if (!ready.length) return null;

    // 如果当前选中英雄的技能可用且值得放，先放它，避免来回切换
    if (hero && ready.some((h) => h.id === hero.id)) {
      const act = this.skillActionFor(sim, me, hero, target, inRange);
      if (act) return act;
    }
    for (const h of ready) {
      if (h.id === hero.id) continue;
      const act = this.skillActionFor(sim, me, h, target, inRange);
      if (!act) continue;
      return { type: 'selectHero', heroId: h.id };
    }
    return null;
  }

  skillPriority(id) {
    switch (id) {
      case 'mirage':
        return 100;
      case 'spirit':
        return 95;
      case 'lunar':
        return 80;
      case 'bulwark':
        return 70;
      case 'frost':
        return 60;
      case 'thorn':
        return 55;
      case 'ember':
        return 50;
      case 'volt':
        return 45;
      case 'falcon':
        return 40;
      case 'shade':
        return 35;
      default:
        return 10;
    }
  }

  skillActionFor(sim, me, hero, target, inRange) {
    const skill = HEROES[hero.heroId].skill;
    if (!skill || hero.skillCd > 0) return null;
    if (me.gold < skill.cost + 8) return null;

    const activeClones = sim.summons.filter(
      (s) => s.alive && s.summonType === 'clone' && s.owner === me.id
    ).length;
    const activeMinions = sim.summons.filter(
      (s) => s.alive && s.summonType === 'minion' && s.owner === me.id
    ).length;

    if (skill.id === 'mirage') {
      if (activeClones >= this.cfg.maxClones) return null;
      const ownClone = sim.summons.some(
        (s) => s.alive && s.summonType === 'clone' && s.sourceHeroId === hero.id
      );
      if (ownClone) return null;
      if (me.gold < skill.cost + this.cfg.cloneReserve) return null;
      // 赶路时也可以提前放，但目标不能太远
      if (!target) return null;
      const d = distance(hero, target);
      if (d > this.cfg.cloneMinDist) return null;
      return { type: 'skill', x: hero.x, y: hero.y };
    }

    if (skill.id === 'spirit') {
      if (activeMinions >= skill.maxMinions) return null;
      if (me.gold < skill.cost + this.cfg.skillReserve) return null;
      if (!target) {
        // 没有目标时，中后期仍然可以召唤推塔
        if (sim.time > 35 && activeMinions < 6) {
          return { type: 'skill', x: hero.x, y: hero.y };
        }
        return null;
      }
      if (distance(hero, target) > 560) return null;
      return { type: 'skill', x: hero.x, y: hero.y };
    }

    if (!target && skill.id !== 'lunar' && skill.id !== 'bulwark') return null;

    if (skill.id === 'lunar') {
      const wounded = [...me.heroes, ...me.towers].some(
        (a) => a.alive && a.hp < a.maxHp * 0.82 && distance(hero, a) < skill.radius
      );
      if (!wounded) return null;
      if (me.gold < skill.cost + this.cfg.skillReserve) return null;
      return { type: 'skill', x: hero.x, y: hero.y };
    }

    if (skill.id === 'bulwark') {
      if (hero.hp / hero.maxHp > 0.86 && !inRange) return null;
      if (me.gold < skill.cost + this.cfg.skillReserve) return null;
      return { type: 'skill', x: hero.x, y: hero.y };
    }

    if (!target) return null;
    const d = distance(hero, target);

    if (skill.id === 'ember') {
      if (d > skill.radius + 12) return null;
      return { type: 'skill', x: hero.x, y: hero.y };
    }
    if (skill.id === 'frost' || skill.id === 'thorn') {
      if (d > skill.range + 10) return null;
      return { type: 'skill', x: target.x, y: target.y };
    }
    if (skill.id === 'shade') {
      if (d > skill.dash + skill.radius) return null;
      return { type: 'skill', x: target.x, y: target.y };
    }
    if (skill.id === 'falcon') {
      if (d > skill.range + 10) return null;
      return { type: 'skill', x: target.x, y: target.y };
    }
    if (skill.id === 'volt') {
      if (d > skill.chainRange) return null;
      return { type: 'skill', x: target.x, y: target.y };
    }
    return null;
  }

  chooseTarget(sim, me, hero) {
    const enemies = sim.heroes.filter((h) => h.alive && h.owner !== me.id);
    const towers = sim.towers.filter((t) => t.alive && t.owner !== me.id);
    const mode = this.cfg.targetMode;

    // 目标粘滞：避免在塔和英雄之间每 0.1 秒来回切换
    if (this.currentTarget && sim.time < this.targetLockUntil) {
      const locked =
        this.currentTarget.kind === 'hero'
          ? enemies.find((h) => h.id === this.currentTarget.id)
          : towers.find((t) => t.id === this.currentTarget.id);
      if (locked) {
        const d = distance(hero, locked);
        // 锁塔时，如果自己快死了且敌方英雄贴脸，允许切人
        const panicHero =
          mode === 'tower' &&
          hero.hp / hero.maxHp < 0.28 &&
          enemies.find((h) => inAttackRange(hero, h))
        if (panicHero) return panicHero;
        if (d <= this.cfg.aggro + 140) return locked;
      }
    }

    let best = null;
    let bestScore = -Infinity;

    for (const h of enemies) {
      const d = distance(hero, h);
      if (d > this.cfg.aggro) continue;
      const hpRatio = h.hp / Math.max(1, h.maxHp);
      let score = 0;
      if (mode === 'hero') score += 45;
      else if (mode === 'tower') score += 12;
      else score += 28;
      score += (1 - hpRatio) * 90;
      score -= d * 0.075;
      if (hpRatio < 0.35) score += 45;
      if (h.heroId === 'lunar' || h.heroId === 'spirit') score += 14;
      if (inAttackRange(hero, h)) score += 35;
      // 不要追到敌方塔炮堆里
      const nearEnemyTower = towers.some(
        (t) => distance(h, t) < t.cannonRange + 30
      );
      if (nearEnemyTower && !inAttackRange(hero, h)) score -= (this.cfg.towerDangerPenalty ?? 18);
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }

    for (const t of towers) {
      const d = distance(hero, t);
      if (d > this.cfg.aggro + 120) continue;
      const hpRatio = t.hp / Math.max(1, t.maxHp);
      let score = 0;
      if (mode === 'tower') score += 52;
      else if (mode === 'hero') score += 12;
      else score += 26;
      score += (1 - hpRatio) * 65;
      score -= d * 0.055;
      if (hpRatio < 0.35) score += 38;
      if (inAttackRange(hero, t)) score += 28;
      // 塔后有人时，先打人
      if (enemies.some((h) => distance(h, t) < 190 && h.hp / h.maxHp < 0.5)) {
        score -= 12;
      }
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }

    // 己方塔被攻击时，优先回防
    const threatened = me.towers
      .filter((t) => t.alive && sim.time - (t.lastDamagedAt || -99) < 2.2 && t.hp < t.maxHp * 0.98)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (threatened) {
      const attacker = enemies
        .filter((h) => distance(h, threatened) < 330)
        .sort((a, b) => distance(a, threatened) - distance(b, threatened))[0];
      if (attacker) {
        const d = distance(hero, attacker);
        let score = 100 - d * 0.05 + (1 - attacker.hp / attacker.maxHp) * 30;
        if (score > bestScore) {
          bestScore = score;
          best = attacker;
        }
      }
    }

    if (best) {
      if (!this.currentTarget || this.currentTarget.id !== best.id || this.currentTarget.kind !== best.kind) {
        this.currentTarget = { id: best.id, kind: best.kind };
        this.targetLockUntil = sim.time + (mode === 'tower' ? 2.0 : 1.0);
      }
    } else {
      this.currentTarget = null;
    }
    return best;
  }

  tryRetreat(sim, me, hero) {
    const towers = me.towers.filter((t) => t.alive);
    if (!towers.length) return false;
    const tower = towers
      .slice()
      .sort((a, b) => distance(hero, a) - distance(hero, b))[0];
    const d = distance(hero, tower);
    if (d > 92) {
      this.retreatTicks += 1;
      return this.moveTo(sim, hero, tower.x, tower.y, 0.35);
    }
    return false;
  }

  moveTo(sim, hero, x, y, throttle) {
    const goal = `${Math.round(x / 24)},${Math.round(y / 24)}`;
    if (distance(hero, { x, y }) < 18) return false;
    // 同目标且仍有路径时不要重新寻路，否则每 0.1 秒重置路径会原地抖动
    if (
      this.lastMoveGoal === goal &&
      (sim.time - this.lastMoveAt < throttle || hero.path.length > 0)
    ) {
      return false;
    }
    this.lastMoveAt = sim.time;
    this.lastMoveGoal = goal;
    return this.do(sim, { type: 'move', x, y }).ok;
  }

  nearestNode(sim, me, hero) {
    let best = null;
    let bestD = Infinity;
    for (const n of sim.nodes) {
      if (!n.available) continue;
      const x = n.x * sim.map.tile + sim.map.tile / 2;
      const y = n.y * sim.map.tile + sim.map.tile / 2;
      const d = Math.hypot(hero.x - x, hero.y - y);
      if (d < bestD && d < 760) {
        bestD = d;
        best = { x, y };
      }
    }
    return best;
  }

  trySpend(sim, me, hero) {
    if (sim.time - this.lastSpendAt < this.cfg.spendEvery) return false;
    this.lastSpendAt = sim.time;

    const selectedTower = me.tower;
    const order = this.cfg.spendOrder;
    for (const key of order) {
      if (key === 'repair') {
        const tower = selectedTower;
        if (
          tower &&
          tower.alive &&
          tower.hp < tower.maxHp * (this.cfg.repairAt || 0.62) &&
          sim.time - (tower.lastRepairAt || -99) >= 25 &&
          me.gold >= 90
        ) {
          this.repairs += 1;
          return this.do(sim, { type: 'repair' }).ok;
        }
      } else if (key === 'build') {
        if (me.towers.length >= this.cfg.maxTowers) continue;
        const heroId = this.pickBuildHero(me);
        if (!heroId) continue;
        const cost = Math.ceil(buildTowerCost(me, heroId));
        if (me.gold < cost + this.cfg.buildReserve) continue;
        if (sim.time < this.cfg.earlyBuildTime && me.towers.length >= 2) continue;
        const spot = chooseBuildSpot(sim, me, this.cfg.buildStyle, this.rng);
        if (!spot) continue;
        const res = this.do(sim, {
          type: 'buildTower',
          heroId,
          x: spot.x,
          y: spot.y,
        });
        if (res.ok) {
          this.builds += 1;
          return true;
        }
        continue;
      } else if (key === 'upgradeHero') {
        if (!hero || !hero.alive || hero.level >= HERO_UPGRADE.maxLevel) continue;
        if (me.towers.length < (this.cfg.minTowersBeforeHeroUpgrade || 1)) continue;
        const cost = heroUpgradeCost(hero.level);
        if (me.gold < cost + this.cfg.upgradeReserve) continue;
        const res = this.do(sim, { type: 'upgradeHero' });
        if (res.ok) {
          this.upgrades += 1;
          return true;
        }
        continue;
      } else if (key === 'cannon') {
        const tower = selectedTower;
        if (!tower || !tower.alive || tower.cannonCount >= ITEMS.cannon.max) continue;
        if (me.towers.length < (this.cfg.minTowersBeforeItems || 1)) continue;
        const cost = itemCost('cannon', tower.cannonCount);
        if (me.gold < cost + this.cfg.upgradeReserve) continue;
        const res = this.do(sim, { type: 'buyItem', item: 'cannon' });
        if (res.ok) {
          this.items += 1;
          return true;
        }
        continue;
      } else if (key === 'upgradeTower') {
        const tower = selectedTower;
        if (!tower || !tower.alive || tower.level >= TOWER.maxLevel) continue;
        if (me.towers.length < (this.cfg.minTowersBeforeItems || 1)) continue;
        const cost = towerUpgradeCost(tower.level);
        if (me.gold < cost + this.cfg.upgradeReserve) continue;
        const res = this.do(sim, { type: 'upgradeTower' });
        if (res.ok) {
          this.upgrades += 1;
          return true;
        }
        continue;
      } else if (key === 'mint') {
        const tower = selectedTower;
        if (!tower || !tower.alive || tower.mintCount >= ITEMS.mint.max) continue;
        if (me.towers.length < (this.cfg.minTowersBeforeItems || 1)) continue;
        const cost = itemCost('mint', tower.mintCount);
        if (me.gold < cost + this.cfg.upgradeReserve + 40) continue;
        const res = this.do(sim, { type: 'buyItem', item: 'mint' });
        if (res.ok) {
          this.items += 1;
          return true;
        }
        continue;
      } else if (key === 'wall') {
        const tower = selectedTower;
        if (!tower || !tower.alive || tower.wallCount >= ITEMS.wall.max) continue;
        if (me.towers.length < (this.cfg.minTowersBeforeItems || 1)) continue;
        const cost = itemCost('wall', tower.wallCount);
        if (me.gold < cost + this.cfg.upgradeReserve + 50) continue;
        const res = this.do(sim, { type: 'buyItem', item: 'wall' });
        if (res.ok) {
          this.items += 1;
          return true;
        }
      }
    }
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 随机合法基线                                                        */
/* ------------------------------------------------------------------ */

class RandomBot {
  constructor(spec, index, rng, trace = false, actionInterval = ACTION_INTERVAL) {
    this.id = spec.id;
    this.name = spec.name;
    this.slot = index;
    this.rng = rng;
    this.nextActionAt = 0;
    this.actionInterval = actionInterval;
    this.actions = 0;
    this.rejected = 0;
    this.lastError = null;
    this.clickTimes = [];
    this.actionTimes = [];
    this.hitClicks = 0;
    this.attackActions = 0;
    this.heroId = spec.heroId || HERO_IDS[Math.floor(rng() * HERO_IDS.length)];
  }

  update(sim) {
    if (sim.over) return;
    if (sim.time + 1e-9 < this.nextActionAt) return;
    const acted = this.think(sim);
    if (acted) this.nextActionAt = Math.max(this.nextActionAt, sim.time) + ACTION_INTERVAL;
  }

  do(sim, action, isClick = false) {
    const res = applyBattleAction(sim, this.id, action);
    this.actions += 1;
    this.actionTimes.push(sim.time);
    if (this.trace) {
      const me = sim.players.find((p) => p.id === this.id);
      const h = me?.hero;
      console.log(
        `t=${sim.time.toFixed(2)} ${this.cfg.id} ${action.type}` +
          (action.kind ? ` ${action.kind}:${action.id}` : '') +
          (action.heroId ? ` hero=${action.heroId}` : '') +
          ` ok=${res.ok}` +
          (h ? ` hp=${Math.round(h.hp)}/${h.maxHp} pos=${Math.round(h.x)},${Math.round(h.y)} gold=${Math.round(me.gold)}` : '') +
          (res.ok ? '' : ` reason=${res.reason}`)
      );
    }
    if (action.type === 'attack') {
      this.attackActions += 1;
      this.clickTimes.push(sim.time);
    }
    if (res.ok) {
      if (isClick) this.hitClicks += 1;
    } else {
      this.rejected += 1;
      this.lastError = res.reason;
    }
    return res;
  }

  think(sim) {
    const me = sim.players.find((p) => p.id === this.id);
    if (!me || me.eliminated) return false;
    if (!me.heroes.length) {
      if (me.towers.some((t) => t.alive && !t.heroId) && me.gold >= HEROES[this.heroId].price) {
        return this.do(sim, { type: 'summon', heroId: this.heroId }).ok;
      }
      return false;
    }
    if (!me.hero || !me.hero.alive) {
      const alive = me.heroes.find((h) => h.alive);
      if (alive) return this.do(sim, { type: 'selectHero', heroId: alive.id }).ok;
      return false;
    }
    const hero = me.hero;
    const enemies = sim.heroes.filter((h) => h.alive && h.owner !== me.id);
    const target = enemies
      .slice()
      .sort((a, b) => distance(hero, a) - distance(hero, b))[0];
    const r = this.rng();

    if (target && inAttackRange(hero, target) && r < 0.62) {
      return this.do(
        sim,
        { type: 'attack', kind: 'hero', id: target.id, manual: true },
        true
      ).ok;
    }

    if (r < 0.72) {
      const x = clamp(hero.x + (this.rng() - 0.5) * 420, 40, sim.map.w * sim.map.tile - 40);
      const y = clamp(hero.y + (this.rng() - 0.5) * 420, 40, sim.map.h * sim.map.tile - 40);
      return this.do(sim, { type: 'move', x, y }).ok;
    }

    if (r < 0.82 && hero.skillCd <= 0) {
      if (me.gold >= HEROES[hero.heroId].skill.cost) {
        return this.do(sim, {
          type: 'skill',
          x: target ? target.x : hero.x + 80,
          y: target ? target.y : hero.y,
        }).ok;
      }
    }

    if (r < 0.9) {
      if (me.towers.length < 2) {
        const heroId = HERO_IDS[Math.floor(this.rng() * HERO_IDS.length)];
        const cost = Math.ceil(buildTowerCost(me, heroId));
        if (me.gold >= cost + 120) {
          const occ = occupiedSet(sim);
          const spot = chooseAIPlacement(sim.map, me.slot, occ);
          if (spot) {
            return this.do(sim, {
              type: 'buildTower',
              heroId,
              x: spot.x,
              y: spot.y,
            }).ok;
          }
        }
      }
      if (hero.level < HERO_UPGRADE.maxLevel) {
        const cost = heroUpgradeCost(hero.level);
        if (me.gold >= cost + 100) {
          return this.do(sim, { type: 'upgradeHero' }).ok;
        }
      }
    }

    if (target) {
      return this.do(sim, { type: 'focusFire', kind: 'hero', id: target.id }).ok;
    }
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 对局                                                                */
/* ------------------------------------------------------------------ */

function parseLineup(text) {
  return text.split(',').map((raw, index) => {
    const parts = raw.trim().split(':');
    if (parts[0] === 'ai') {
      const level = parts[1] || 'nightmare';
      return {
        kind: 'ai',
        aiLevel: level,
        heroId: parts[2] || null,
        policy: `ai-${level}`,
        name: `AI-${level}-${index}`,
        id: `p${index}`,
        slot: index,
      };
    }
    const policy = parts[0];
    return {
      kind: 'bot',
      policy,
      heroId: parts[1] || null,
      name: `${POLICIES[policy]?.name || policy}-${index}`,
      id: `p${index}`,
      slot: index,
    };
  });
}

function wilson(wins, n) {
  if (!n) return [0, 0, 0];
  const p = wins / n;
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [p, Math.max(0, center - half), Math.min(1, center + half)];
}

function maxClicksInWindow(times) {
  if (!times.length) return 0;
  let best = 0;
  let left = 0;
  for (let right = 0; right < times.length; right++) {
    while (times[right] - times[left] >= 1 - 1e-9) left++;
    best = Math.max(best, right - left + 1);
  }
  return best;
}

function snapshotPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    slot: p.slot,
    eliminated: p.eliminated,
    gold: Math.round(p.gold * 10) / 10,
    kills: p.kills,
    deaths: p.deaths,
    damage: Math.round(p.damageDealt),
    towers: p.towers.length,
    towersAlive: p.towers.filter((t) => t.alive).length,
    heroes: p.heroes.length,
    heroesAlive: p.heroes.filter((h) => h.alive).length,
    maxHeroLevel: p.heroes.reduce((m, h) => Math.max(m, h.level), 0),
    score: Math.round(
      p.kills * 160 +
        p.damageDealt * 0.35 +
        [...p.heroes, ...p.towers].reduce((s, u) => s + u.earned, 0) * 0.08
    ),
  };
}

function runMatch(lineup, seed, options = {}) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const map = generateMap(seed);
  const occupied = new Set();
  const roomPlayers = [];

  for (let i = 0; i < lineup.length; i++) {
    const spec = lineup[i];
    let placement;
    if (spec.kind === 'ai') {
      placement = chooseAIPlacement(map, i, occupied);
    } else {
      const cfg = POLICIES[spec.policy];
      placement = chooseOpeningPlacement(
        map,
        i,
        options.placement || cfg?.placement || 'forward',
        occupied,
        rng
      );
    }
    if (!placement) placement = { x: map.spawns[i].default.x, y: map.spawns[i].default.y };
    occupied.add(`${placement.x},${placement.y}`);
    roomPlayers.push({
      id: spec.id,
      name: spec.name,
      slot: i,
      isAI: spec.kind === 'ai',
      connected: true,
      heroId: spec.kind === 'ai' ? spec.heroId || HERO_IDS[Math.floor(rng() * HERO_IDS.length)] : null,
      placement: { x: placement.x, y: placement.y },
    });
  }

  const aiLevels = [...new Set(lineup.filter((s) => s.kind === 'ai').map((s) => s.aiLevel))];
  const aiLevel = aiLevels[0] || 'normal';
  const room = {
    players: roomPlayers,
    aiLevel,
    tutorial: false,
  };

  const originalRandom = Math.random;
  Math.random = rng;
  let sim;
  try {
    sim = createBattle(room, map);
  } finally {
    Math.random = originalRandom;
  }

  const bots = [];
  for (let i = 0; i < lineup.length; i++) {
    if (lineup[i].kind !== 'bot') continue;
    const spec = { ...lineup[i], id: roomPlayers[i].id, name: roomPlayers[i].name };
    const bot =
      spec.policy === 'random'
        ? new RandomBot(spec, i, rng, !!options.trace, options.actionInterval || ACTION_INTERVAL)
        : new PolicyBot(spec, i, rng, !!options.trace, options.actionInterval || ACTION_INTERVAL);
    bots.push(bot);
  }

  const snapshots = {};
  const snapTimes = [120, 300, 600];
  let nextSnap = 0;
  let lastEventClear = 0;

  // 开局动作（召唤）
  const originalRandom2 = Math.random;
  Math.random = rng;
  try {
    for (const bot of bots) bot.update(sim);
    while (!sim.over && sim.time < (options.maxSeconds || MATCH_SECONDS) + 0.01) {
      tickBattle(sim, DT);
      for (const bot of bots) bot.update(sim);
      if (nextSnap < snapTimes.length && sim.time >= snapTimes[nextSnap]) {
        snapshots[snapTimes[nextSnap]] = sim.players.map(snapshotPlayer);
        nextSnap += 1;
      }
      if (sim.time - lastEventClear > 5) {
        sim.events.length = 0;
        lastEventClear = sim.time;
      }
    }
  } finally {
    Math.random = originalRandom2;
  }

  const players = sim.players.map((p) => {
    const bot = bots.find((b) => b.id === p.id);
    const snap = snapshotPlayer(p);
    return {
      ...snap,
      policy: lineup.find((s) => s.id === p.id)?.policy || (p.isAI ? `ai-${aiLevel}` : 'unknown'),
      placement: roomPlayers.find((rp) => rp.id === p.id)?.placement || null,
      spawn: { x: map.spawns[p.slot].cx, y: map.spawns[p.slot].cy },
      heroIds: p.heroes.map((h) => h.heroId),
      clicks: bot ? bot.clickTimes.length : 0,
      hitClicks: bot ? bot.hitClicks : 0,
      attackActions: bot ? bot.attackActions : 0,
      actions: bot ? bot.actions : 0,
      rejected: bot ? bot.rejected : 0,
      maxCps: bot ? maxClicksInWindow(bot.clickTimes) : 0,
      maxAps: bot ? maxClicksInWindow(bot.actionTimes) : 0,
      lastError: bot ? bot.lastError : null,
      skillCasts: bot?.skillCasts ?? null,
      builds: bot?.builds ?? null,
      upgrades: bot?.upgrades ?? null,
      repairs: bot?.repairs ?? null,
      items: bot?.items ?? null,
    };
  });

  const winner = sim.winner ? players.find((p) => p.id === sim.winner) : null;
  return {
    seed,
    lineup: lineup.map((s) => s.policy || s.kind),
    aiLevel,
    duration: Math.round(sim.time * 10) / 10,
    endReason: sim.endReason,
    winner: winner
      ? {
          id: winner.id,
          policy: winner.policy,
          slot: winner.slot,
          name: winner.name,
        }
      : null,
    players,
    snapshots,
    allCpsOk:
      players.filter((p) => p.maxCps > 10).length === 0 &&
      players.filter((p) => p.maxAps > 10).length === 0,
  };
}

/* ------------------------------------------------------------------ */
/* 汇总                                                                */
/* ------------------------------------------------------------------ */

function summarize(results, lineupLabels) {
  const n = results.length;
  const winsByPolicy = {};
  const winsBySlot = {};
  const playByPolicy = {};
  const playBySlot = {};
  const durations = [];
  const reasons = {};
  let draws = 0;
  let maxCps = 0;
  let maxAps = 0;
  let rejected = 0;
  let actions = 0;
  let clicks = 0;
  let hitClicks = 0;

  for (const r of results) {
    durations.push(r.duration);
    reasons[r.endReason] = (reasons[r.endReason] || 0) + 1;
    if (!r.winner) draws += 1;
    for (const p of r.players) {
      playByPolicy[p.policy] = (playByPolicy[p.policy] || 0) + 1;
      playBySlot[p.slot] = (playBySlot[p.slot] || 0) + 1;
      maxCps = Math.max(maxCps, p.maxCps || 0);
      maxAps = Math.max(maxAps, p.maxAps || 0);
      rejected += p.rejected || 0;
      actions += p.actions || 0;
      clicks += p.clicks || 0;
      hitClicks += p.hitClicks || 0;
    }
    if (r.winner) {
      winsByPolicy[r.winner.policy] = (winsByPolicy[r.winner.policy] || 0) + 1;
      winsBySlot[r.winner.slot] = (winsBySlot[r.winner.slot] || 0) + 1;
    }
  }

  const policyRows = Object.keys(playByPolicy).map((policy) => {
    const wins = winsByPolicy[policy] || 0;
    const plays = playByPolicy[policy];
    const [rate, lo, hi] = wilson(wins, plays);
    return {
      policy,
      wins,
      plays,
      winRate: rate,
      ci95: [lo, hi],
    };
  });
  policyRows.sort((a, b) => b.winRate - a.winRate || b.plays - a.plays);

  const slotRows = Object.keys(playBySlot).map((slot) => {
    const wins = winsBySlot[slot] || 0;
    const plays = playBySlot[slot];
    const [rate, lo, hi] = wilson(wins, plays);
    return { slot: Number(slot), wins, plays, winRate: rate, ci95: [lo, hi] };
  });

  durations.sort((a, b) => a - b);
  return {
    matches: n,
    lineup: lineupLabels,
    draws,
    drawRate: n ? draws / n : 0,
    avgDuration: durations.reduce((a, b) => a + b, 0) / Math.max(1, n),
    medianDuration: durations[Math.floor(durations.length / 2)] || 0,
    reasons,
    maxCps,
    cpsOk: maxCps <= 10,
    maxAps,
    apsOk: maxAps <= 10,
    rejected,
    actions,
    clicks,
    clickHitRate: clicks ? hitClicks / clicks : 0,
    policyRows,
    slotRows,
  };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { matches: 20, seed: 1, out: null, lineup: null, maxSeconds: MATCH_SECONDS };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--matches') args.matches = Number(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--lineup') args.lineup = argv[++i];
    else if (a === '--max-seconds') args.maxSeconds = Number(argv[++i]);
    else if (a === '--placement') args.placement = argv[++i];
    else if (a === '--trace') args.trace = true;
    else if (a === '--cps') args.cps = Number(argv[++i]);
    else if (a === '--override') args.override = JSON.parse(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/bot-arena.mjs --lineup swarm,ai:nightmare,ai:nightmare,ai:nightmare \\
    --matches 100 --seed 1000 --out data/bot-results/run.json

Policies: ${Object.keys(POLICIES).join(', ')}
Lineup tokens: <policy>[:heroId] | ai:<easy|normal|hard|nightmare>[:heroId]`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }
  if (!args.lineup) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (args.override) {
    for (const [policy, patch] of Object.entries(args.override)) {
      if (!POLICIES[policy]) throw new Error(`unknown policy override: ${policy}`);
      Object.assign(POLICIES[policy], patch);
    }
  }
  const lineup = parseLineup(args.lineup);
  if (lineup.length < 2 || lineup.length > 4) {
    throw new Error('lineup 需要 2–4 个席位');
  }
  const results = [];
  const t0 = Date.now();
  for (let i = 0; i < args.matches; i++) {
    const seed = args.seed + i;
    const r = runMatch(lineup, seed, {
      maxSeconds: args.maxSeconds,
      placement: args.placement,
      trace: args.trace,
      actionInterval: args.cps ? 1 / Math.max(1, Math.min(15, args.cps)) : ACTION_INTERVAL,
    });
    results.push(r);
    const w = r.winner ? r.winner.policy : 'draw';
    if ((i + 1) % 10 === 0 || i === args.matches - 1) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `[${i + 1}/${args.matches}] seed=${seed} ${r.duration}s winner=${w} ` +
          `cps=${Math.max(...r.players.map((p) => p.maxCps))} ` +
          `rejected=${r.players.reduce((s, p) => s + p.rejected, 0)} (${elapsed}s)`
      );
    }
  }
  const summary = summarize(results, lineup.map((s) => s.policy || s.kind));
  const payload = {
    generatedAt: new Date().toISOString(),
    args,
    summary,
    results,
  };
  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(payload, null, 2));
    console.log(`\nwrote ${args.out}`);
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
