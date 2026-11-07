/**
 * 无依赖冒烟测试：
 *   node scripts/smoke.mjs
 *
 * 覆盖：地图连通性 / 资源点可达 / 建塔校验 / 12 分钟 AI 混战 / 数值稳定性
 */

import assert from 'node:assert/strict';
import { generateMap, MAP_W, MAP_H, TILE } from '../shared/mapgen.js';
import { TERRAIN_INFO, HEROES } from '../shared/heroes.js';
import {
  applyBattleAction,
  buildTowerCost,
  chooseAIPlacement,
  createBattle,
  serializeSim,
  tickBattle,
  validateTowerPlacement,
} from '../shared/engine.js';

const seeds = [1, 7, 42, 99, 123, 777, 999, 2026, 31415, 88888];
let checkedMaps = 0;

function reachable(map, start) {
  const seen = new Uint8Array(map.w * map.h);
  const q = [start];
  seen[start.y * map.w + start.x] = 1;
  while (q.length) {
    const cur = q.shift();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = cur.x + dx;
        const y = cur.y + dy;
        if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
        const i = y * map.w + x;
        if (seen[i]) continue;
        if (!TERRAIN_INFO[map.tiles[i]].passable) continue;
        seen[i] = 1;
        q.push({ x, y });
      }
    }
  }
  return seen;
}

for (const seed of seeds) {
  const map = generateMap(seed);
  assert.equal(map.w, MAP_W);
  assert.equal(map.h, MAP_H);
  assert.equal(map.tiles.length, MAP_W * MAP_H);
  const reach = reachable(map, map.center);
  assert.ok(reach[map.center.y * map.w + map.center.x], `seed ${seed}: center not passable`);
  for (const spawn of map.spawns) {
    assert.ok(
      TERRAIN_INFO[map.tiles[spawn.cy * map.w + spawn.cx]].passable,
      `seed ${seed}: spawn ${spawn.index} not passable`
    );
    assert.ok(reach[spawn.cy * map.w + spawn.cx], `seed ${seed}: spawn ${spawn.index} unreachable`);
    const spot = chooseAIPlacement(map, spawn.index);
    assert.ok(spot, `seed ${seed}: no AI placement for spawn ${spawn.index}`);
    const check = validateTowerPlacement(map, spawn.index, spot.x, spot.y);
    assert.ok(check.ok, `seed ${seed}: AI placement rejected: ${check.reason}`);
  }
  assert.ok(map.nodes.length >= 6, `seed ${seed}: too few resource nodes`);
  for (const n of map.nodes) {
    assert.ok(TERRAIN_INFO[map.tiles[n.y * map.w + n.x]].passable, `seed ${seed}: node blocked`);
    assert.ok(reach[n.y * map.w + n.x], `seed ${seed}: node unreachable`);
  }
  checkedMaps++;
}

// 战斗内英雄召唤 / 多塔建造 / 点击瞬击
{
  const map = generateMap(4411);
  const room = {
    players: [
      { id: 'human', name: 'Human', slot: 0, isAI: false, connected: true, heroId: null, placement: chooseAIPlacement(map, 0) },
      { id: 'bot', name: 'Bot', slot: 1, isAI: true, connected: true, heroId: 'bulwark', placement: chooseAIPlacement(map, 1) },
    ],
  };
  const sim = createBattle(room, map);
  const human = sim.players[0];
  assert.equal(human.heroes.length, 0, 'human should start without hero');
  assert.equal(human.towers.length, 1, 'human starts with one tower');
  let res = applyBattleAction(sim, 'human', { type: 'summon', heroId: 'ember' });
  assert.ok(res.ok, 'initial summon should succeed');
  assert.equal(human.heroes.length, 1);
  assert.equal(human.towers[0].heroId, human.heroes[0].id);
  assert.ok(human.gold < 340);
  human.gold = 2000;
  const occupied = new Set(sim.towers.map((t) => `${t.tx},${t.ty}`));
  const spot = chooseAIPlacement(map, 0, occupied);
  assert.ok(spot, 'free build spot');
  res = applyBattleAction(sim, 'human', { type: 'buildTower', heroId: 'frost', x: spot.x, y: spot.y });
  assert.ok(res.ok, `build tower should succeed: ${res.reason}`);
  assert.equal(human.towers.length, 2);
  assert.equal(human.heroes.length, 2);
  assert.equal(human.selectedHeroId, human.heroes[1].id, 'new hero becomes selected');
  res = applyBattleAction(sim, 'human', { type: 'buildTower', heroId: 'frost', x: spot.x, y: spot.y });
  assert.equal(res.ok, false, 'duplicate hero rejected');
  const occ2 = new Set(sim.towers.map((t) => `${t.tx},${t.ty}`));
  const spot2 = chooseAIPlacement(map, 0, occ2);
  human.gold = 5000;
  res = applyBattleAction(sim, 'human', { type: 'buildTower', heroId: 'shade', x: spot2.x, y: spot2.y });
  assert.ok(res.ok, 'third tower should succeed');
  const occ3 = new Set(sim.towers.map((t) => `${t.tx},${t.ty}`));
  const spot3 = chooseAIPlacement(map, 0, occ3);
  res = applyBattleAction(sim, 'human', { type: 'buildTower', heroId: 'bulwark', x: spot3.x, y: spot3.y });
  assert.ok(res.ok, 'fourth tower should succeed with unlimited towers');
  const occ4 = new Set(sim.towers.map((t) => `${t.tx},${t.ty}`));
  const spot4 = chooseAIPlacement(map, 0, occ4);
  res = applyBattleAction(sim, 'human', { type: 'buildTower', heroId: 'ember', x: spot4.x, y: spot4.y });
  assert.ok(res.ok, 'duplicate hero tower should succeed');
  assert.equal(human.towers.length, 5);
  assert.equal(human.heroes.length, 5);
  assert.ok(buildTowerCost(human, 'shade') > 0);

  // 手动点击攻击：在射程内应立即扣血
  const attacker = human.hero;
  const victim = sim.players[1].hero;
  victim.x = attacker.x + 30;
  victim.y = attacker.y;
  sim.time += 1;
  res = applyBattleAction(sim, 'human', { type: 'focusFire', kind: 'hero', id: victim.id });
  assert.ok(res.ok, 'focus fire should succeed');
  for (const h of human.heroes.filter((x) => x.alive)) {
    assert.deepEqual(h.target, { kind: 'hero', id: victim.id }, 'all living heroes focus the target');
  }
  const before = victim.hp;
  victim.hp = 1;
  res = applyBattleAction(sim, 'human', { type: 'attack', kind: 'hero', id: victim.id, manual: true });
  assert.ok(res.ok);
  assert.ok(victim.hp < before, 'manual click should deal immediate damage');
  assert.equal(victim.alive, false, 'focus/manual attack kills the target');
  const afterDeath = serializeSim(sim, false);
  assert.equal(afterDeath.players[1].respawnIn, 5, 'level-1 respawn cooldown is 5s');
}

// 新英雄：镜像数量限制 / 灵仆数量限制 / 到期回收
{
  function makeDuel(heroId) {
    const map = generateMap(8821);
    const room = {
      players: [
        { id: 'caster', name: 'Caster', slot: 0, isAI: false, connected: true, heroId: null, placement: chooseAIPlacement(map, 0) },
        { id: 'dummy', name: 'Dummy', slot: 1, isAI: true, connected: true, heroId: 'bulwark', placement: chooseAIPlacement(map, 1), passive: true },
      ],
    };
    const sim = createBattle(room, map);
    const player = sim.players[0];
    player.gold = 5000;
    const res = applyBattleAction(sim, 'caster', { type: 'summon', heroId });
    assert.ok(res.ok, `${heroId} summon`);
    return { sim, player };
  }

  {
    const { sim, player } = makeDuel('mirage');
    let res = applyBattleAction(sim, 'caster', { type: 'skill', x: player.hero.x + 80, y: player.hero.y });
    assert.ok(res.ok, 'mirage skill');
    assert.equal(sim.summons.filter((s) => s.summonType === 'clone').length, 1, 'one clone');
    assert.equal(serializeSim(sim, false).summons.length, 1, 'clone serialized');
    player.hero.skillCd = 0;
    player.gold = 5000;
    res = applyBattleAction(sim, 'caster', { type: 'skill', x: player.hero.x + 80, y: player.hero.y });
    assert.equal(res.ok, false, 'clone cap rejects a second clone');
    for (let i = 0; i < 100; i++) tickBattle(sim, 0.12);
    assert.equal(sim.summons.length, 0, 'clone expires after 10s');
  }

  {
    const { sim, player } = makeDuel('spirit');
    let res = applyBattleAction(sim, 'caster', { type: 'skill', x: player.hero.x + 80, y: player.hero.y });
    assert.ok(res.ok, 'spirit skill');
    assert.equal(sim.summons.filter((s) => s.summonType === 'minion').length, 6, 'six minions');
    player.hero.skillCd = 0;
    player.gold = 5000;
    res = applyBattleAction(sim, 'caster', { type: 'skill', x: player.hero.x + 80, y: player.hero.y });
    assert.ok(res.ok, 'second spirit cast');
    assert.equal(sim.summons.filter((s) => s.summonType === 'minion').length, 12, 'minion cap 12');
    player.hero.skillCd = 0;
    player.gold = 5000;
    res = applyBattleAction(sim, 'caster', { type: 'skill', x: player.hero.x + 80, y: player.hero.y });
    assert.equal(res.ok, false, 'minion cap rejects overflow');
    for (let i = 0; i < 200; i++) tickBattle(sim, 0.12);
    assert.equal(sim.summons.length, 0, 'minions expire after 22s');
  }
}

for (const seed of [123, 999, 2026]) {
  const map = generateMap(seed);
  const room = { players: [] };
  const heroes = Object.keys(HEROES);
  for (let i = 0; i < 4; i++) {
    const placement = chooseAIPlacement(map, i);
    room.players.push({
      id: `p${i}`,
      name: `P${i}`,
      slot: i,
      isAI: true,
      connected: true,
      heroId: heroes[i],
      placement,
    });
  }
  const sim = createBattle(room, map);
  let ticks = 0;
  while (!sim.over && ticks < 30 * 60 * 15) {
    tickBattle(sim, 1 / 30);
    ticks++;
    if (ticks % 300 === 0) {
      for (const p of sim.players) {
        assert.ok(Number.isFinite(p.gold), `seed ${seed}: non-finite gold`);
        assert.ok(p.gold < 5_000_000, `seed ${seed}: runaway economy`);
        assert.ok(Number.isFinite(p.hero.x) && Number.isFinite(p.hero.y), `seed ${seed}: bad hero position`);
      }
    }
  }
  assert.ok(sim.over, `seed ${seed}: match did not end`);
  const snap = serializeSim(sim, false);
  assert.ok(snap.players.length === 4);
  for (const p of snap.players) {
    assert.ok(Number.isFinite(p.gold));
    assert.ok(p.gold >= 0);
    assert.ok(Number.isFinite(p.heroLevel));
    assert.ok(Number.isFinite(p.towerLevel));
  }
  console.log(
    `  seed ${String(seed).padStart(4)}  ${sim.time.toFixed(0).padStart(3)}s  winner=${sim.winner ?? 'draw'}  reason=${sim.endReason}`
  );
}

console.log(`\n✓ ${checkedMaps} 张地图通过连通性与建塔校验`);
console.log('✓ 3 场完整 AI 混战通过数值稳定性校验');
console.log('✓ 镜像/灵仆数量上限与到期回收校验通过');
console.log(`✓ 地图尺寸 ${MAP_W}×${MAP_H} / tile ${TILE}px\n`);
