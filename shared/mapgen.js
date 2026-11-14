/**
 * 程序化地图生成 + 网格寻路
 * 地图使用 40 × 30 的方形网格，每格 32px。
 */

import { TERRAIN, TERRAIN_INFO } from './heroes.js';

export const MAP_W = 40;
export const MAP_H = 30;
export const TILE = 32;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const SPAWNS = [
  {
    index: 0,
    name: '西北 · 霜谷',
    cx: 7,
    cy: 7,
    zone: { x0: 2, y0: 2, x1: 13, y1: 12 },
    default: { x: 7, y: 7 },
    facing: { x: 1, y: 1 },
  },
  {
    index: 1,
    name: '东南 · 赤林',
    cx: 32,
    cy: 22,
    zone: { x0: 26, y0: 17, x1: 37, y1: 27 },
    default: { x: 32, y: 22 },
    facing: { x: -1, y: -1 },
  },
  {
    index: 2,
    name: '东北 · 苍岩',
    cx: 32,
    cy: 7,
    zone: { x0: 26, y0: 2, x1: 37, y1: 12 },
    default: { x: 32, y: 7 },
    facing: { x: -1, y: 1 },
  },
  {
    index: 3,
    name: '西南 · 幽沼',
    cx: 7,
    cy: 22,
    zone: { x0: 2, y0: 17, x1: 13, y1: 27 },
    default: { x: 7, y: 22 },
    facing: { x: 1, y: -1 },
  },
  {
    index: 4,
    name: '北境 · 寒风',
    cx: 20,
    cy: 5,
    zone: { x0: 14, y0: 2, x1: 26, y1: 10 },
    default: { x: 20, y: 5 },
    facing: { x: 0, y: 1 },
  },
  {
    index: 5,
    name: '南境 · 烈阳',
    cx: 20,
    cy: 24,
    zone: { x0: 14, y0: 20, x1: 26, y1: 28 },
    default: { x: 20, y: 24 },
    facing: { x: 0, y: -1 },
  },
  {
    index: 6,
    name: '西境 · 沉沙',
    cx: 5,
    cy: 15,
    zone: { x0: 2, y0: 10, x1: 11, y1: 20 },
    default: { x: 5, y: 15 },
    facing: { x: 1, y: 0 },
  },
  {
    index: 7,
    name: '东境 · 潮生',
    cx: 34,
    cy: 15,
    zone: { x0: 29, y0: 10, x1: 38, y1: 20 },
    default: { x: 34, y: 15 },
    facing: { x: -1, y: 0 },
  },
];

const CENTER = { x: 20, y: 15 };

const NODE_ANCHORS = [
  { x: 20, y: 7 },
  { x: 33, y: 15 },
  { x: 20, y: 23 },
  { x: 7, y: 15 },
  { x: 14, y: 15 },
  { x: 26, y: 15 },
  { x: 20, y: 11 },
  { x: 20, y: 19 },
  { x: 13, y: 8 },
  { x: 27, y: 8 },
  { x: 13, y: 22 },
  { x: 27, y: 22 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function idx(x, y) {
  return y * MAP_W + x;
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function protectedCell(x, y, radius = 5.4) {
  for (const s of SPAWNS) {
    if (dist2(x, y, s.cx, s.cy) < radius * radius) return true;
  }
  if (dist2(x, y, CENTER.x, CENTER.y) < 5.2 * 5.2) return true;
  return false;
}

function setTile(tiles, x, y, type) {
  if (!inBounds(x, y)) return;
  if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) return;
  tiles[idx(x, y)] = type;
}

function blob(tiles, rng, cx, cy, radius, type, options = {}) {
  const avoidProtected = options.avoidProtected ?? false;
  const density = options.density ?? 0.82;
  const r = Math.ceil(radius);
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inBounds(x, y)) continue;
      if (dist2(x, y, cx, cy) > radius * radius) continue;
      if (avoidProtected && protectedCell(x, y)) continue;
      if (x <= 1 || y <= 1 || x >= MAP_W - 2 || y >= MAP_H - 2) continue;
      if (rng() < density) setTile(tiles, x, y, type);
    }
  }
}

function mountainRidge(tiles, rng) {
  let x = 3 + Math.floor(rng() * (MAP_W - 6));
  let y = 3 + Math.floor(rng() * (MAP_H - 6));
  if (protectedCell(x, y)) return;
  let angle = rng() * Math.PI * 2;
  const steps = 12 + Math.floor(rng() * 22);
  for (let i = 0; i < steps; i++) {
    if (!protectedCell(x, y, 4.8)) {
      setTile(tiles, x, y, TERRAIN.MOUNTAIN);
      if (rng() < 0.62) setTile(tiles, x + 1, y, TERRAIN.MOUNTAIN);
      if (rng() < 0.42) setTile(tiles, x, y + 1, TERRAIN.MOUNTAIN);
      if (rng() < 0.2) setTile(tiles, x - 1, y + 1, TERRAIN.MOUNTAIN);
    }
    angle += (rng() - 0.5) * 0.95;
    x += Math.round(Math.cos(angle));
    y += Math.round(Math.sin(angle));
    x = Math.max(3, Math.min(MAP_W - 4, x));
    y = Math.max(3, Math.min(MAP_H - 4, y));
    if (protectedCell(x, y, 5.8)) {
      // 绕过保护区
      angle += 1.7;
      x += Math.round(Math.cos(angle)) * 2;
      y += Math.round(Math.sin(angle)) * 2;
      x = Math.max(3, Math.min(MAP_W - 4, x));
      y = Math.max(3, Math.min(MAP_H - 4, y));
    }
  }
}

function carveDisc(tiles, cx, cy, radius, type = TERRAIN.PLAIN) {
  const r = Math.ceil(radius);
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inBounds(x, y)) continue;
      if (dist2(x, y, cx, cy) <= radius * radius) setTile(tiles, x, y, type);
    }
  }
}

function carveCorridor(tiles, rng, from, to) {
  let x = from.x;
  let y = from.y;
  let guard = 0;
  while ((x !== to.x || y !== to.y) && guard++ < 200) {
    carveDisc(tiles, x, y, rng() < 0.18 ? 1.8 : 1.05, TERRAIN.PLAIN);
    const dx = to.x - x;
    const dy = to.y - y;
    const options = [];
    if (dx !== 0) options.push([Math.sign(dx), 0]);
    if (dy !== 0) options.push([0, Math.sign(dy)]);
    if (dx !== 0 && dy !== 0 && rng() < 0.42) options.push([Math.sign(dx), Math.sign(dy)]);
    if (options.length === 0) break;
    // 偶尔横向抖动，让通道更自然
    const pick = options[Math.floor(rng() * options.length)];
    x = Math.max(2, Math.min(MAP_W - 3, x + pick[0]));
    y = Math.max(2, Math.min(MAP_H - 3, y + pick[1]));
    if (rng() < 0.22) {
      x = Math.max(2, Math.min(MAP_W - 3, x + (rng() < 0.5 ? -1 : 1)));
    }
  }
  carveDisc(tiles, to.x, to.y, 1.3, TERRAIN.PLAIN);
}

function findPassableNear(tiles, tx, ty, maxRadius = 8) {
  const base = idx(
    Math.max(1, Math.min(MAP_W - 2, tx)),
    Math.max(1, Math.min(MAP_H - 2, ty))
  );
  if (TERRAIN_INFO[tiles[base]].passable) {
    return { x: tx, y: ty };
  }
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (!inBounds(x, y)) continue;
        if (x <= 1 || y <= 1 || x >= MAP_W - 2 || y >= MAP_H - 2) continue;
        if (TERRAIN_INFO[tiles[idx(x, y)]].passable) return { x, y };
      }
    }
  }
  return null;
}

function reachableFrom(tiles, start) {
  const seen = new Uint8Array(MAP_W * MAP_H);
  const queue = [start];
  seen[idx(start.x, start.y)] = 1;
  while (queue.length) {
    const cur = queue.shift();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = cur.x + dx;
        const y = cur.y + dy;
        if (!inBounds(x, y)) continue;
        const p = idx(x, y);
        if (seen[p]) continue;
        if (!TERRAIN_INFO[tiles[p]].passable) continue;
        seen[p] = 1;
        queue.push({ x, y });
      }
    }
  }
  return seen;
}

function generateBaseMap(seed = Math.floor(Math.random() * 2 ** 31)) {
  const rng = mulberry32(seed);
  const tiles = new Array(MAP_W * MAP_H).fill(TERRAIN.PLAIN);

  // 地图边缘：连绵山脉
  for (let x = 0; x < MAP_W; x++) {
    tiles[idx(x, 0)] = TERRAIN.MOUNTAIN;
    tiles[idx(x, MAP_H - 1)] = TERRAIN.MOUNTAIN;
  }
  for (let y = 0; y < MAP_H; y++) {
    tiles[idx(0, y)] = TERRAIN.MOUNTAIN;
    tiles[idx(MAP_W - 1, y)] = TERRAIN.MOUNTAIN;
  }

  // 山脉
  const ridgeCount = 14 + Math.floor(rng() * 6);
  for (let i = 0; i < ridgeCount; i++) mountainRidge(tiles, rng);

  // 森林
  const forestCount = 16 + Math.floor(rng() * 8);
  for (let i = 0; i < forestCount; i++) {
    const x = 2 + Math.floor(rng() * (MAP_W - 4));
    const y = 2 + Math.floor(rng() * (MAP_H - 4));
    if (protectedCell(x, y, 4.1)) continue;
    blob(tiles, rng, x, y, 1.2 + rng() * 2.4, TERRAIN.FOREST, { density: 0.78 });
  }

  // 丘陵
  const hillCount = 9;
  for (let i = 0; i < hillCount; i++) {
    const x = 3 + Math.floor(rng() * (MAP_W - 6));
    const y = 3 + Math.floor(rng() * (MAP_H - 6));
    if (protectedCell(x, y, 4.6)) continue;
    blob(tiles, rng, x, y, 1.6 + rng() * 2.6, TERRAIN.HILL, {
      density: 0.7,
      avoidProtected: true,
    });
  }

  // 湖泊
  for (let i = 0; i < 3; i++) {
    const x = 5 + Math.floor(rng() * (MAP_W - 10));
    const y = 4 + Math.floor(rng() * (MAP_H - 8));
    if (protectedCell(x, y, 6.4)) continue;
    blob(tiles, rng, x, y, 1.7 + rng() * 2.8, TERRAIN.WATER, {
      density: 0.88,
      avoidProtected: true,
    });
  }

  // 出生地 & 中央竞技场
  for (const s of SPAWNS) carveDisc(tiles, s.cx, s.cy, 5.6, TERRAIN.PLAIN);
  carveDisc(tiles, CENTER.x, CENTER.y, 5.2, TERRAIN.PLAIN);

  // 从每个出生地通往中央的道路
  for (const s of SPAWNS) {
    carveCorridor(tiles, rng, { x: s.cx, y: s.cy }, CENTER);
    // 第二条带偏移的路线，降低单点堵塞
    if (rng() < 0.8) {
      carveCorridor(
        tiles,
        rng,
        { x: s.cx + (s.facing.x > 0 ? 2 : -2), y: s.cy + (s.facing.y > 0 ? 2 : -2) },
        { x: CENTER.x + (s.facing.x > 0 ? -3 : 3), y: CENTER.y + (s.facing.y > 0 ? -3 : 3) }
      );
    }
  }

  // 环形道路，增加绕后空间
  const ring = [
    { x: 12, y: 8 },
    { x: 27, y: 8 },
    { x: 32, y: 15 },
    { x: 27, y: 22 },
    { x: 12, y: 22 },
    { x: 7, y: 15 },
  ];
  for (let i = 0; i < ring.length; i++) {
    carveCorridor(tiles, rng, ring[i], ring[(i + 1) % ring.length]);
  }

  // 保证出生地可达
  let reach = reachableFrom(tiles, CENTER);
  for (const s of SPAWNS) {
    if (!reach[idx(s.cx, s.cy)]) {
      carveCorridor(tiles, rng, { x: s.cx, y: s.cy }, CENTER);
      reach = reachableFrom(tiles, CENTER);
    }
    if (!reach[idx(s.cx, s.cy)]) {
      // 兜底：直接清出一条直线
      let x = s.cx;
      let y = s.cy;
      const sx = Math.sign(CENTER.x - x);
      const sy = Math.sign(CENTER.y - y);
      while (x !== CENTER.x && y !== CENTER.y) {
        carveDisc(tiles, x, y, 1.2, TERRAIN.PLAIN);
        if (x !== CENTER.x) x += sx;
        if (y !== CENTER.y) y += sy;
      }
      carveDisc(tiles, CENTER.x, CENTER.y, 1.4, TERRAIN.PLAIN);
      reach = reachableFrom(tiles, CENTER);
    }
  }

  // 资源点：固定锚点，吸附到可达的最近可通行格
  const nodes = [];
  const used = new Set();
  for (let i = 0; i < NODE_ANCHORS.length; i++) {
    const anchor = NODE_ANCHORS[i];
    let spot = findPassableNear(tiles, anchor.x, anchor.y, 7);
    if (!spot) spot = { x: anchor.x, y: anchor.y };
    let guard = 0;
    while ((used.has(idx(spot.x, spot.y)) || !reach[idx(spot.x, spot.y)]) && guard++ < 60) {
      const next = findPassableNear(
        tiles,
        Math.max(2, Math.min(MAP_W - 3, spot.x + (rng() < 0.5 ? -1 : 1))),
        Math.max(2, Math.min(MAP_H - 3, spot.y + (rng() < 0.5 ? -1 : 1))),
        8
      );
      if (!next) break;
      spot = next;
    }
    if (used.has(idx(spot.x, spot.y))) continue;
    used.add(idx(spot.x, spot.y));
    nodes.push({ id: `r${i}`, x: spot.x, y: spot.y, gold: 45 });
  }

  return {
    version: 1,
    seed,
    w: MAP_W,
    h: MAP_H,
    tile: TILE,
    tiles,
    spawns: SPAWNS.map((s) => ({
      index: s.index,
      name: s.name,
      cx: s.cx,
      cy: s.cy,
      zone: s.zone,
      default: s.default,
      facing: s.facing,
    })),
    nodes,
    center: CENTER,
  };
}


/* ------------------------------------------------------------------ */
/* 地图尺寸：标准 40×30 / 大地图 56×42                                  */
/* ------------------------------------------------------------------ */

const LARGE_W = 96;
const LARGE_H = 72;
const XLARGE_W = 128;
const XLARGE_H = 96;

function scaledMap(base, seed, size = 'large') {
  const xl = size === 'xlarge';
  const w = xl ? XLARGE_W : LARGE_W;
  const h = xl ? XLARGE_H : LARGE_H;
  // 大地图暂时使用全平地：不使用山地/水域/森林/丘陵。
  const tiles = new Array(w * h).fill(TERRAIN.PLAIN);
  const map = {
    version: 2,
    size: xl ? 'xlarge' : 'large',
    flat: true,
    seed,
    w,
    h,
    tile: TILE,
    tiles,
    spawns: [],
    nodes: [],
    center: { x: Math.round((base.center.x / base.w) * w), y: Math.round((base.center.y / base.h) * h) },
  };
  const sx = w / base.w;
  const sy = h / base.h;
  map.spawns = base.spawns.map((spawn) => ({
    ...spawn,
    cx: Math.round(spawn.cx * sx),
    cy: Math.round(spawn.cy * sy),
    zone: {
      x0: Math.round(spawn.zone.x0 * sx),
      y0: Math.round(spawn.zone.y0 * sy),
      x1: Math.round(spawn.zone.x1 * sx),
      y1: Math.round(spawn.zone.y1 * sy),
    },
    default: {
      x: Math.round(spawn.default.x * sx),
      y: Math.round(spawn.default.y * sy),
    },
  }));

  const paint = (tx, ty, type = TERRAIN.PLAIN) => {
    if (tx < 1 || ty < 1 || tx >= w - 1 || ty >= h - 1) return;
    tiles[ty * w + tx] = type;
  };
  const disc = (cx, cy, radius) => {
    const r = Math.ceil(radius);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) paint(x, y, TERRAIN.PLAIN);
      }
    }
  };
  const corridor = (from, to, radius = 1.7) => {
    let x = from.x;
    let y = from.y;
    let guard = 0;
    while ((x !== to.x || y !== to.y) && guard++ < 300) {
      disc(x, y, radius);
      if (x !== to.x) x += Math.sign(to.x - x);
      if (y !== to.y) y += Math.sign(to.y - y);
    }
    disc(to.x, to.y, radius);
  };
  const passable = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return TERRAIN_INFO[tiles[y * w + x]].passable;
  };
  const findSpot = (tx, ty, maxRadius = 10) => {
    const cx = Math.max(1, Math.min(w - 2, Math.round(tx)));
    const cy = Math.max(1, Math.min(h - 2, Math.round(ty)));
    if (passable(cx, cy)) return { x: cx, y: cy };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (passable(x, y)) return { x, y };
        }
      }
    }
    return null;
  };
  const reachFrom = (start) => {
    const seen = new Uint8Array(w * h);
    if (!passable(start.x, start.y)) return seen;
    const queue = [start];
    seen[start.y * w + start.x] = 1;
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = cur.x + dx;
          const y = cur.y + dy;
          if (!passable(x, y)) continue;
          const p = y * w + x;
          if (seen[p]) continue;
          seen[p] = 1;
          queue.push({ x, y });
        }
      }
    }
    return seen;
  };

  // 开出生地与中央；把每一条主路拓宽，避免缩放后出现断裂
  for (const spawn of map.spawns) disc(spawn.cx, spawn.cy, 7);
  disc(map.center.x, map.center.y, 6);
  for (const spawn of map.spawns) {
    corridor({ x: spawn.cx, y: spawn.cy }, map.center, 2.0);
    corridor(
      { x: spawn.cx + (spawn.facing.x > 0 ? 3 : -3), y: spawn.cy + (spawn.facing.y > 0 ? 3 : -3) },
      { x: map.center.x + (spawn.facing.x > 0 ? -4 : 4), y: map.center.y + (spawn.facing.y > 0 ? -4 : 4) },
      1.7
    );
  }

  // 资源点：向中央集中的十字形；大地图 48 个、超大图 64 个
  const cx = map.center.x;
  const cy = map.center.y;
  const arms = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  const anchors = xl
    ? [
        { x: cx - 2, y: cy },
        { x: cx + 2, y: cy },
        { x: cx - 4, y: cy },
        { x: cx + 4, y: cy },
        { x: cx, y: cy - 2 },
        { x: cx, y: cy + 2 },
        { x: cx, y: cy - 4 },
        { x: cx, y: cy + 4 },
      ]
    : [
        { x: cx - 2, y: cy },
        { x: cx + 2, y: cy },
        { x: cx, y: cy - 2 },
        { x: cx, y: cy + 2 },
      ];
  const rings = xl
    ? [
        { dist: 6, offsets: [-1, 1] },
        { dist: 14, offsets: [-2, 0, 2] },
        { dist: 22, offsets: [-2, 0, 2] },
        { dist: 30, offsets: [-2, 0, 2] },
        { dist: 38, offsets: [-2, 0, 2] },
      ]
    : [
        { dist: 5, offsets: [-1, 1] },
        { dist: 11, offsets: [-2, 0, 2] },
        { dist: 18, offsets: [-2, 0, 2] },
        { dist: 26, offsets: [-2, 0, 2] },
      ];
  for (const ring of rings) {
    for (const arm of arms) {
      for (const offset of ring.offsets) {
        anchors.push({
          x: cx + (arm.dx !== 0 ? arm.dx * ring.dist : offset),
          y: cy + (arm.dy !== 0 ? arm.dy * ring.dist : offset),
        });
      }
    }
  }
  const used = new Set();
  let reach = reachFrom(map.center);
  for (let i = 0; i < anchors.length; i++) {
    let spot = findSpot(anchors[i].x, anchors[i].y, 12);
    if (!spot) continue;
    if (!reach[spot.y * w + spot.x]) {
      corridor(spot, map.center, 1.5);
      reach = reachFrom(map.center);
    }
    if (used.has(spot.y * w + spot.x)) {
      const alt = findSpot(spot.x + 2, spot.y + 2, 10);
      if (!alt || used.has(alt.y * w + alt.x)) continue;
      spot = alt;
    }
    used.add(spot.y * w + spot.x);
    map.nodes.push({ id: `${size}-r${i}`, x: spot.x, y: spot.y, gold: 45 });
  }

  return map;
}

export function generateMap(seed = Math.floor(Math.random() * 2 ** 31), options = {}) {
  const base = generateBaseMap(seed);
  if (options.size === 'large' || options.size === 'xlarge') {
    return scaledMap(base, seed, options.size);
  }
  return base;
}

/* ------------------------------------------------------------------ */
/* 寻路                                                                */
/* ------------------------------------------------------------------ */

class MinHeap {
  constructor() {
    this.data = [];
  }
  push(node) {
    const a = this.data;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.data;
    if (a.length === 0) return null;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.data.length;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export function tilePassable(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  return TERRAIN_INFO[map.tiles[y * map.w + x]].passable;
}

export function terrainSpeed(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return 0;
  return TERRAIN_INFO[map.tiles[y * map.w + x]].speed;
}

export function tileBuildable(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  return TERRAIN_INFO[map.tiles[y * map.w + x]].buildable;
}

export function tileCenter(map, tx, ty) {
  return {
    x: tx * map.tile + map.tile / 2,
    y: ty * map.tile + map.tile / 2,
  };
}

export function worldToTile(map, x, y) {
  return {
    x: Math.max(0, Math.min(map.w - 1, Math.floor(x / map.tile))),
    y: Math.max(0, Math.min(map.h - 1, Math.floor(y / map.tile))),
  };
}

export function nearestPassableTile(map, tx, ty, maxRadius = 10) {
  if (tilePassable(map, tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (tilePassable(map, x, y)) return { x, y };
      }
    }
  }
  return null;
}

export function findPath(map, sx, sy, tx, ty) {
  if (!tilePassable(map, sx, sy)) {
    const s = nearestPassableTile(map, sx, sy, 6);
    if (!s) return [];
    sx = s.x;
    sy = s.y;
  }
  if (!tilePassable(map, tx, ty)) {
    const t = nearestPassableTile(map, tx, ty, 8);
    if (!t) return [];
    tx = t.x;
    ty = t.y;
  }
  if (sx === tx && sy === ty) return [];

  const w = map.w;
  const total = w * map.h;
  const start = sy * w + sx;
  const goal = ty * w + tx;
  const gScore = new Float32Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const open = new MinHeap();
  gScore[start] = 0;
  open.push({ i: start, f: 0 });

  while (open.size) {
    const cur = open.pop();
    const ci = cur.i;
    if (closed[ci]) continue;
    closed[ci] = 1;
    if (ci === goal) break;
    const cx = ci % w;
    const cy = (ci / w) | 0;
    for (const [dx, dy, len] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!tilePassable(map, nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (!tilePassable(map, cx + dx, cy) || !tilePassable(map, cx, cy + dy)) continue;
      }
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const speed = terrainSpeed(map, nx, ny);
      const step = len / speed;
      const tentative = gScore[ci] + step;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        came[ni] = ci;
        const hx = Math.abs(tx - nx);
        const hy = Math.abs(ty - ny);
        const h = (hx + hy) + (Math.SQRT2 - 2) * Math.min(hx, hy);
        open.push({ i: ni, f: tentative + h });
      }
    }
  }

  if (came[goal] === -1 && start !== goal) return [];
  const path = [];
  let cur = goal;
  while (cur !== start && cur !== -1) {
    path.push({ x: (cur % w) * map.tile + map.tile / 2, y: ((cur / w) | 0) * map.tile + map.tile / 2 });
    cur = came[cur];
  }
  path.reverse();
  return path;
}

export function findPathWorld(map, fromX, fromY, toX, toY) {
  const a = worldToTile(map, fromX, fromY);
  const b = worldToTile(map, toX, toY);
  const path = findPath(map, a.x, a.y, b.x, b.y);
  if (path.length === 0) return [];
  // 如果点击点可通行，让最后一步精确落在点击位置
  if (tilePassable(map, b.x, b.y)) {
    const last = path[path.length - 1];
    const target = tileCenter(map, b.x, b.y);
    if (last && last.x === target.x && last.y === target.y) {
      const exact = { x: toX, y: toY };
      const exactTile = worldToTile(map, exact.x, exact.y);
      if (tilePassable(map, exactTile.x, exactTile.y)) {
        const dx = exact.x - target.x;
        const dy = exact.y - target.y;
        if (Math.hypot(dx, dy) < map.tile * 0.55) path[path.length - 1] = exact;
      }
    }
  }
  return path;
}

export function isLinePassable(map, x1, y1, x2, y2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 8);
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    const tile = worldToTile(map, x, y);
    if (!tilePassable(map, tile.x, tile.y)) return false;
  }
  return true;
}
