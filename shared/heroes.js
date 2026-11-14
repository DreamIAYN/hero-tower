/**
 * 塔魂：四境争锋 — 规则数据
 * 所有数值都在这里集中定义，方便平衡性调整。
 */

export const START_GOLD = 340;
export const MATCH_LIMIT_SECONDS = 12 * 60;
export const RESPAWN_BASE = 5;
export const RESPAWN_PER_LEVEL = 0.6;
export const BUILD_TOWER_BASE = 70;
export const BUILD_TOWER_PER_TOWER = 50;
export const MANUAL_ATTACK_MULT = 0.55;
export const MANUAL_ATTACK_MIN_INTERVAL = 0.065;

export const AI_LEVELS = {
  easy: {
    id: 'easy',
    name: '休闲',
    desc: 'AI 反应较慢、较少集火，适合熟悉操作。',
    think: [0.72, 1.15],
    spend: [2.8, 4.5],
    engage: 390,
    earlyEngage: 190,
    retreat: 0.4,
    cps: 1,
    clickDamage: 0.4,
    startGoldBonus: 0,
    defend: false,
    focus: false,
    smart: false,
    buildGold: 760,
    buildReserve: 220,
    resourceGold: 650,
    repairAt: 0.45,
    allSkills: false,
  },
  normal: {
    id: 'normal',
    name: '标准',
    desc: 'AI 会集体集火、扩建魂塔和升级装备。',
    think: [0.42, 0.7],
    spend: [1.8, 3.0],
    engage: 500,
    earlyEngage: 260,
    retreat: 0.3,
    cps: 3,
    clickDamage: 0.3,
    startGoldBonus: 0,
    defend: false,
    focus: false,
    smart: false,
    buildGold: 520,
    buildReserve: 150,
    resourceGold: 900,
    repairAt: 0.58,
    allSkills: false,
  },
  hard: {
    id: 'hard',
    name: '困难',
    desc: '反应接近人类高手：4 CPS、会集火/回防、只放当前英雄技能。',
    think: [0.28, 0.48],
    spend: [1.2, 2.0],
    engage: 620,
    earlyEngage: 340,
    retreat: 0.2,
    cps: 4,
    clickDamage: 0.45,
    startGoldBonus: 70,
    defend: true,
    focus: true,
    smart: true,
    buildGold: 390,
    buildReserve: 80,
    resourceGold: 1900,
    repairAt: 0.74,
    allSkills: false,
  },
  nightmare: {
    id: 'nightmare',
    name: '噩梦',
    desc: '全英雄协同集火与全技能释放，极快决策，持续扩塔施压。',
    think: [0.14, 0.27],
    spend: [0.8, 1.45],
    engage: 700,
    earlyEngage: 390,
    retreat: 0.18,
    cps: 6,
    clickDamage: 0.55,
    startGoldBonus: 250,
    defend: true,
    focus: true,
    smart: true,
    buildGold: 300,
    buildReserve: 60,
    resourceGold: 2400,
    repairAt: 0.82,
    allSkills: true,
  },
};
export const AI_LEVEL_LIST = Object.values(AI_LEVELS);

/**
 * AI 专属英雄平衡表。
 * 只影响 AI 控制的英雄，不影响玩家使用同一英雄时的数值。
 * 目标：4 AI 混战、统一 6 CPS 标准下，每个 AI 的胜率尽量接近 25%。
 *
 * 字段：
 *   cps           覆盖 AI 点击 CPS（默认沿用 AI_LEVELS）
 *   clickDamage   覆盖 AI 手动点击伤害倍率（默认 0.55）
 *   startGold     额外开局金币（可为负数；叠加在 AI 难度加成上）
 *   thinkScale    决策间隔倍率（>1 更慢，<1 更快）
 *   spendScale    花钱间隔倍率（>1 更慢，<1 更快）
 *   engage / earlyEngage / retreat / buildGold / buildReserve / resourceGold
 *                 可选覆盖，用于进一步微调
 */
export const AI_HERO_TUNING = {
  falcon: {
    clickDamage: 0.39,
    startGold: -30,
    thinkScale: 1.15,
    spendScale: 1.15,
  },
  frost: {
    clickDamage: 0.6,
    startGold: 35,
  },
  spirit: {
    clickDamage: 0.59,
    startGold: 20,
  },
  lunar: {
    clickDamage: 0.61,
    startGold: 35,
  },
  shade: {
    clickDamage: 0.73,
    startGold: 85,
    thinkScale: 0.9,
    spendScale: 0.9,
  },
  ember: {
    clickDamage: 0.79,
    startGold: 95,
  },
  volt: {
    clickDamage: 0.78,
    startGold: 125,
  },
  thorn: {
    clickDamage: 0.71,
    startGold: 85,
  },
  bulwark: {
    clickDamage: 0.7,
    startGold: 30,
  },
  mirage: {
    clickDamage: 0.78,
    startGold: 115,
  },
};

export const PLAYER_COLORS = ['#5bd7ff', '#ff6b61', '#7ee787', '#c792ea', '#fbbf24', '#f472b6', '#2dd4bf', '#a3e635'];
export const PLAYER_COLOR_NAMES = ['苍蓝', '赤焰', '青翠', '紫电', '金耀', '桃夭', '碧潮', '青柠'];

export const TERRAIN = {
  PLAIN: 0,
  FOREST: 1,
  HILL: 2,
  MOUNTAIN: 3,
  WATER: 4,
};

export const TERRAIN_INFO = {
  0: { name: '平原', passable: true, speed: 1.0, buildable: true },
  1: { name: '森林', passable: true, speed: 0.72, buildable: true },
  2: { name: '丘陵', passable: true, speed: 0.84, buildable: true },
  3: { name: '山地', passable: false, speed: 0, buildable: false },
  4: { name: '水域', passable: false, speed: 0, buildable: false },
};

export const HEROES = {
  ember: {
    id: 'ember',
    name: '炎锋',
    title: '赤焰剑士',
    role: '近战 / 爆发',
    price: 140,
    hp: 300,
    damage: 30,
    armor: 3,
    range: 44,
    speed: 108,
    attackInterval: 0.78,
    radius: 13,
    ranged: false,
    color: '#ff824d',
    accent: '#ffd166',
    icon: '刃',
    skill: {
      id: 'ember',
      name: '烈焰回旋',
      desc: '以自身为中心引爆火环，对范围内所有敌方单位造成技能伤害。',
      cost: 35,
      cooldown: 8,
      radius: 112,
      damage: 72,
      perLevel: 11,
    },
    blurb: '攻守均衡的火焰剑士，擅长贴身缠斗与清场。',
  },
  frost: {
    id: 'frost',
    name: '霜翎',
    title: '极寒咏者',
    role: '远程 / 控制',
    price: 170,
    hp: 210,
    damage: 24,
    armor: 1,
    range: 192,
    speed: 92,
    attackInterval: 1.02,
    radius: 12,
    ranged: true,
    color: '#69d9ff',
    accent: '#d9f6ff',
    icon: '霜',
    skill: {
      id: 'frost',
      name: '冰封领域',
      desc: '在指定地点降下暴雪，对范围内敌人造成伤害并减速 55%。',
      cost: 45,
      cooldown: 10,
      radius: 86,
      damage: 52,
      perLevel: 8,
      slow: 0.55,
      slowDuration: 2.8,
      range: 235,
    },
    blurb: '脆弱但致命的远程法师，冰封领域能锁死战场。',
  },
  shade: {
    id: 'shade',
    name: '影刺',
    title: '暮色猎手',
    role: '刺客 / 追击',
    price: 150,
    hp: 205,
    damage: 36,
    armor: 1,
    range: 42,
    speed: 126,
    attackInterval: 0.62,
    radius: 12,
    ranged: false,
    color: '#c792ea',
    accent: '#f0abfc',
    icon: '影',
    skill: {
      id: 'shade',
      name: '暗影突袭',
      desc: '向指定方向瞬步，并对落点周围的敌人造成高额技能伤害。',
      cost: 40,
      cooldown: 7,
      radius: 74,
      damage: 64,
      perLevel: 9,
      dash: 178,
    },
    blurb: '高攻速的刺客，暗影突袭让他来去自如。',
  },
  mirage: {
    id: 'mirage',
    name: '镜影',
    title: '双生刺客',
    role: '近战 / 分身',
    price: 160,
    hp: 235,
    damage: 33,
    armor: 2,
    range: 46,
    speed: 118,
    attackInterval: 0.70,
    radius: 12,
    ranged: false,
    color: '#f472b6',
    accent: '#fbcfe8',
    icon: '镜',
    skill: {
      id: 'mirage',
      name: '镜影分身',
      desc: '分身 10 秒，继承 55% 生命与攻击；会复制你的移动/攻击指令。',
      cost: 70,
      cooldown: 20,
      duration: 10,
      cloneHpRatio: 0.55,
      cloneDamageRatio: 0.55,
      maxClones: 1,
    },
    blurb: '以镜像牵制敌人的双生刺客，镜像消失前可以创造多打少的机会。',
  },
  spirit: {
    id: 'spirit',
    name: '灵姝',
    title: '万灵唤者',
    role: '远程 / 召唤',
    price: 165,
    hp: 235,
    damage: 23,
    armor: 1,
    range: 176,
    speed: 94,
    attackInterval: 1.0,
    radius: 12,
    ranged: true,
    color: '#2dd4bf',
    accent: '#99f6e4',
    icon: '灵',
    skill: {
      id: 'spirit',
      name: '万灵奔涌',
      desc: '召唤 6 只持续 22 秒的灵仆；最多同时存在 12 只。',
      cost: 60,
      cooldown: 16,
      count: 6,
      maxMinions: 12,
      duration: 22,
      minionHp: 60,
      minionHpPerLevel: 10,
      minionDamage: 7,
      minionDamagePerLevel: 1.2,
      minionArmor: 0,
      minionSpeed: 125,
      minionRange: 32,
      minionAttackInterval: 1.0,
      minionRadius: 5,
    },
    blurb: '用成群灵仆淹没战场的召唤师，能同时推进多座塔。',
  },
  bulwark: {
    id: 'bulwark',
    name: '磐卫',
    title: '山岳守望',
    role: '坦克 / 护盾',
    price: 120,
    hp: 385,
    damage: 23,
    armor: 6,
    range: 40,
    speed: 80,
    attackInterval: 0.98,
    radius: 15,
    ranged: false,
    color: '#ffd166',
    accent: '#fff3c4',
    icon: '岩',
    skill: {
      id: 'bulwark',
      name: '岩甲护盾',
      desc: '获得一层可吸收伤害的护盾，持续 5 秒。',
      cost: 30,
      cooldown: 12,
      shield: 125,
      perLevel: 28,
      duration: 5,
    },
    blurb: '最坚实的壁垒，护盾与高护甲让他在前排屹立不倒。',
  },
  falcon: {
    id: 'falcon',
    name: '苍隼',
    title: '裂空射手',
    role: '远程 / 狙击',
    price: 175,
    hp: 195,
    damage: 38,
    armor: 1,
    range: 245,
    speed: 94,
    attackInterval: 1.15,
    radius: 11,
    ranged: true,
    color: '#60a5fa',
    accent: '#bfdbfe',
    icon: '隼',
    skill: {
      id: 'falcon',
      name: '裂空贯射',
      desc: '向指定方向射出贯穿箭，对路径上的敌人造成伤害；对残血目标额外 50%。',
      cost: 55,
      cooldown: 11,
      range: 320,
      width: 28,
      damage: 60,
      perLevel: 10,
      executeBonus: 0.5,
      executeThreshold: 0.35,
    },
    blurb: '超远射程的狙击手，贯穿箭可以同时惩罚一条线上的敌人。',
  },
  lunar: {
    id: 'lunar',
    name: '月弦',
    title: '月华祭司',
    role: '远程 / 守护',
    price: 165,
    hp: 225,
    damage: 20,
    armor: 2,
    range: 180,
    speed: 92,
    attackInterval: 1.0,
    radius: 12,
    ranged: true,
    color: '#a78bfa',
    accent: '#ddd6fe',
    icon: '月',
    skill: {
      id: 'lunar',
      name: '月华庇护',
      desc: '为自身与附近友方英雄、魂塔恢复生命并附加护盾。',
      cost: 60,
      cooldown: 14,
      radius: 170,
      heal: 70,
      healPerLevel: 12,
      shield: 55,
      shieldPerLevel: 8,
      duration: 5,
    },
    blurb: '能同时照顾英雄与魂塔的月之祭司，让整条战线更耐久。',
  },
  thorn: {
    id: 'thorn',
    name: '荆棘',
    title: '缚地者',
    role: '远程 / 控制',
    price: 155,
    hp: 230,
    damage: 21,
    armor: 2,
    range: 150,
    speed: 96,
    attackInterval: 1.0,
    radius: 12,
    ranged: true,
    color: '#84cc16',
    accent: '#d9f99d',
    icon: '棘',
    skill: {
      id: 'thorn',
      name: '荆棘缚地',
      desc: '在指定区域召出荆棘，造成伤害并定身敌方英雄 2 秒。',
      cost: 50,
      cooldown: 12,
      range: 230,
      radius: 90,
      damage: 40,
      perLevel: 7,
      rootDuration: 2,
    },
    blurb: '用荆棘锁住敌方英雄的走位，为队友创造集火窗口。',
  },
  volt: {
    id: 'volt',
    name: '雷铸',
    title: '雷霆先锋',
    role: '近战 / 链雷',
    price: 170,
    hp: 320,
    damage: 30,
    armor: 4,
    range: 50,
    speed: 105,
    attackInterval: 0.85,
    radius: 14,
    ranged: false,
    color: '#fbbf24',
    accent: '#fef3c7',
    icon: '雷',
    skill: {
      id: 'volt',
      name: '链雷',
      desc: '释放链状闪电，依次击中最多 4 个敌人，并短暂减速。',
      cost: 55,
      cooldown: 10,
      chainRange: 220,
      jumps: 3,
      damage: 55,
      perLevel: 8,
      falloff: 0.8,
      slow: 0.35,
      slowDuration: 1.2,
    },
    blurb: '冲进人群的雷霆先锋，链雷会惩罚聚在一起的敌人。',
  },
  tide: {
    id: 'tide',
    name: '潮歌',
    title: '逐浪咏者',
    role: '远程 / 控场',
    price: 175,
    hp: 240,
    damage: 24,
    armor: 2,
    range: 185,
    speed: 94,
    attackInterval: 1.05,
    radius: 12,
    ranged: true,
    color: '#38bdf8',
    accent: '#bae6fd',
    icon: '潮',
    skill: {
      id: 'wave',
      name: '潮涌',
      desc: '向指定方向推出一道潮浪，对路径上的敌人造成伤害并减速。',
      cost: 50,
      cooldown: 10,
      range: 260,
      width: 32,
      damage: 55,
      perLevel: 9,
      slow: 0.45,
      slowDuration: 2.2,
    },
    blurb: '用潮浪切开战场的远程法师，减速带让队友更容易追击。',
  },
  quake: {
    id: 'quake',
    name: '撼山',
    title: '裂地守卫',
    role: '近战 / 控场',
    price: 150,
    hp: 360,
    damage: 25,
    armor: 5,
    range: 44,
    speed: 82,
    attackInterval: 1.0,
    radius: 15,
    ranged: false,
    color: '#b08968',
    accent: '#e7c6a5',
    icon: '撼',
    skill: {
      id: 'quake',
      name: '裂地',
      desc: '重击地面，对周围敌人造成伤害并定身敌方英雄 1.5 秒。',
      cost: 50,
      cooldown: 13,
      radius: 112,
      damage: 65,
      perLevel: 10,
      rootDuration: 1.5,
    },
    blurb: '站桩能力极强的重装守卫，裂地可以打断敌方突进。',
  },
  meteor: {
    id: 'meteor',
    name: '星陨',
    title: '陨星术士',
    role: '远程 / 爆发',
    price: 180,
    hp: 205,
    damage: 27,
    armor: 1,
    range: 210,
    speed: 90,
    attackInterval: 1.1,
    radius: 11,
    ranged: true,
    color: '#fb7185',
    accent: '#fecdd3',
    icon: '星',
    skill: {
      id: 'meteor',
      name: '陨星落',
      desc: '在指定区域召唤陨星，对范围内敌人造成高额技能伤害。',
      cost: 65,
      cooldown: 14,
      range: 280,
      radius: 100,
      damage: 85,
      perLevel: 13,
    },
    blurb: '高风险的远程爆发法师，陨星落可以瞬间清空一片战场。',
  },
  drum: {
    id: 'drum',
    name: '战鼓',
    title: '荒原鼓手',
    role: '近战 / 辅助',
    price: 145,
    hp: 310,
    damage: 22,
    armor: 3,
    range: 46,
    speed: 100,
    attackInterval: 0.9,
    radius: 14,
    ranged: false,
    color: '#f59e0b',
    accent: '#fef3c7',
    icon: '鼓',
    skill: {
      id: 'rally',
      name: '战鼓激励',
      desc: '为周围友方英雄、魂塔恢复生命并附加护盾。',
      cost: 55,
      cooldown: 16,
      radius: 180,
      heal: 60,
      healPerLevel: 10,
      shield: 40,
      shieldPerLevel: 6,
      duration: 5,
    },
    blurb: '用鼓点维持战线的辅助战士，让队友在混战中站得更久。',
  },
};

export const HERO_LIST = Object.values(HEROES);

export const HERO_UPGRADE = {
  baseCost: 90,
  costPerLevel: 60,
  maxLevel: 8,
  hpGrowth: 0.13,
  damageGrowth: 0.14,
  armorGrowth: 1,
};

export const TOWER = {
  baseHp: 1000,
  baseArmor: 5,
  baseIncome: 2.2,
  radius: 25,
  levelHp: 230,
  levelArmor: 0.8,
  levelIncome: 0.48,
  maxLevel: 6,
  upgradeBaseCost: 130,
  upgradeCostPerLevel: 70,
  respawnRegenRange: 180,
  respawnRegenPerSecond: 5,
};

export const HERO_INCOME = 1.55;
export const HERO_INCOME_PER_LEVEL = 0.08;

export const ITEMS = {
  cannon: {
    id: 'cannon',
    name: '加农炮',
    icon: '炮',
    desc: '塔顶安装自动炮台，自动攻击附近敌方英雄。',
    max: 2,
    baseCost: 120,
    costPerOwned: 45,
    damage: 16,
    damagePerTowerLevel: 3,
    range: 178,
    rangePerLevel: 7,
    interval: 1.25,
  },
  wall: {
    id: 'wall',
    name: '护壁',
    icon: '壁',
    desc: '加固塔身：提高护甲与最大耐久。',
    max: 2,
    baseCost: 90,
    costPerOwned: 40,
    armor: 4,
    hp: 160,
  },
  mint: {
    id: 'mint',
    name: '聚金器',
    icon: '金',
    desc: '魂塔每秒额外产出金币。',
    max: 2,
    baseCost: 100,
    costPerOwned: 50,
    income: 1.2,
  },
};

export const REPAIR_COST = 90;
export const REPAIR_RATIO = 0.25;
export const REPAIR_COOLDOWN = 25;
export const RESOURCE_GOLD = 45;
export const RESOURCE_RESPAWN = 16;
export const RESOURCE_RESPAWN_MIN = 6;
export const RESOURCE_RESPAWN_STEP = 2;
export const RESOURCE_RESPAWN_STEP_SECONDS = 120;
export const DEATH_MODE_AT = 10 * 60;

export function resourceRespawnSeconds(time) {
  const steps = Math.floor(Math.max(0, time) / RESOURCE_RESPAWN_STEP_SECONDS);
  return Math.max(RESOURCE_RESPAWN_MIN, RESOURCE_RESPAWN - steps * RESOURCE_RESPAWN_STEP);
}
export const RESOURCE_PICKUP_RANGE = 30;
export const BOUNTY_RATIO = 0.5;

export const AI_NAMES = ['赤狐', '苍狼', '夜枭', '白鹿', '铁鸦', '青蛇', '灰熊', '云豹', '银狐', '赤鸢', '墨獾', '雪貂'];

export function itemCost(itemId, owned) {
  const def = ITEMS[itemId];
  if (!def) return Infinity;
  return def.baseCost + def.costPerOwned * owned;
}

export function heroUpgradeCost(level) {
  return HERO_UPGRADE.baseCost + HERO_UPGRADE.costPerLevel * (level - 1);
}

export function towerUpgradeCost(level) {
  return TOWER.upgradeBaseCost + TOWER.upgradeCostPerLevel * (level - 1);
}

export function heroStats(heroId, level) {
  const hero = HEROES[heroId];
  return {
    maxHp: Math.round(hero.hp * (1 + HERO_UPGRADE.hpGrowth * (level - 1))),
    damage: hero.damage * (1 + HERO_UPGRADE.damageGrowth * (level - 1)),
    armor: hero.armor + HERO_UPGRADE.armorGrowth * (level - 1),
    income: HERO_INCOME + HERO_INCOME_PER_LEVEL * (level - 1),
  };
}

export function towerStats(level, cannonCount, wallCount, mintCount) {
  return {
    maxHp: TOWER.baseHp + TOWER.levelHp * (level - 1) + (ITEMS.wall.hp * wallCount),
    armor: TOWER.baseArmor + TOWER.levelArmor * (level - 1) + (ITEMS.wall.armor * wallCount),
    income: TOWER.baseIncome + TOWER.levelIncome * (level - 1) + (ITEMS.mint.income * mintCount),
    cannonDamage:
      ITEMS.cannon.damage + ITEMS.cannon.damagePerTowerLevel * (level - 1),
    cannonRange: ITEMS.cannon.range + ITEMS.cannon.rangePerLevel * (level - 1),
  };
}
