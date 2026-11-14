/**
 * 导出英雄完整数据与技能表：
 *   node scripts/export-hero-data.mjs
 * 输出 HERO_DATA.md 与 data/hero-data.json
 */
import fs from 'node:fs';
import {
  AI_HERO_TUNING,
  AI_LEVELS,
  HEROES,
  HERO_UPGRADE,
  heroStats,
  heroUpgradeCost,
} from '../shared/heroes.js';

const ids = Object.keys(HEROES);
const fmt1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const fmt2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const pct = (v) => `${Math.round(v * 100)}%`;

function identityTable() {
  const rows = [
    '| 英雄 | id | 称号 | 图标 | 主色 | 简介 |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const id of ids) {
    const h = HEROES[id];
    rows.push(`| ${h.name} | \`${id}\` | ${h.title} | ${h.icon} | ${h.color} | ${h.blurb} |`);
  }
  return rows.join('\n');
}

function statsTable() {
  const rows = [
    '| 英雄 | 定位 | 价格 | 类型 | 生命 | 攻击 | 护甲 | 射程 | 移速 | 攻速间隔 | 半径 | 自动 DPS | 6 CPS 点击 DPS | 10 CPS 点击 DPS |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const id of ids) {
    const h = HEROES[id];
    const s = heroStats(id, 1);
    rows.push(
      `| ${h.name} \`${id}\` | ${h.role} | ${h.price} | ${h.ranged ? '远程' : '近战'} | ${s.maxHp} | ${fmt1(s.damage)} | ${fmt1(s.armor)} | ${h.range} | ${h.speed} | ${h.attackInterval}s | ${h.radius} | ${fmt1(h.damage / h.attackInterval)} | ${fmt1(h.damage * 0.55 * 6)} | ${fmt1(h.damage * 0.55 * 10)} |`
    );
  }
  return rows.join('\n');
}

function growthTable() {
  const rows = [
    '| 英雄 | HP L1 / L4 / L8 | 攻击 L1 / L4 / L8 | 护甲 L1 / L4 / L8 | 产金 L1 / L8 |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const id of ids) {
    const h = HEROES[id];
    const l1 = heroStats(id, 1);
    const l4 = heroStats(id, 4);
    const l8 = heroStats(id, 8);
    rows.push(
      `| ${h.name} | ${l1.maxHp} / ${l4.maxHp} / ${l8.maxHp} | ${fmt1(l1.damage)} / ${fmt1(l4.damage)} / ${fmt1(l8.damage)} | ${fmt1(l1.armor)} / ${fmt1(l4.armor)} / ${fmt1(l8.armor)} | ${fmt2(l1.income)} / ${fmt2(l8.income)} |`
    );
  }
  return rows.join('\n');
}

function skillValue(id, level) {
  const h = HEROES[id];
  const sk = h.skill;
  const lv = level - 1;
  switch (sk.id) {
    case 'ember':
      return `伤害 ${sk.damage + sk.perLevel * lv}`;
    case 'frost':
      return `伤害 ${sk.damage + sk.perLevel * lv}，减速 ${pct(sk.slow)} / ${sk.slowDuration}s`;
    case 'shade':
      return `位移 ${sk.dash}，落点伤害 ${sk.damage + sk.perLevel * lv}`;
    case 'bulwark':
      return `护盾 ${sk.shield + sk.perLevel * lv} / ${sk.duration}s`;
    case 'mirage': {
      const s = heroStats(id, level);
      return `分身 ${sk.duration}s，继承 ${pct(sk.cloneHpRatio)} HP / ${pct(sk.cloneDamageRatio)} 攻击（约 ${Math.round(s.maxHp * sk.cloneHpRatio)} HP / ${fmt1(s.damage * sk.cloneDamageRatio)} 攻击）`;
    }
    case 'spirit':
      return `召唤 ${sk.count} 只，持续 ${sk.duration}s；灵仆 ${sk.minionHp + sk.minionHpPerLevel * lv} HP / ${fmt1(sk.minionDamage + sk.minionDamagePerLevel * lv)} 攻击`;
    case 'falcon':
      return `伤害 ${sk.damage + sk.perLevel * lv}；残血（<${pct(sk.executeThreshold)}）额外 +${pct(sk.executeBonus)}`;
    case 'lunar':
      return `治疗 ${sk.heal + sk.healPerLevel * lv}，护盾 ${sk.shield + sk.shieldPerLevel * lv} / ${sk.duration}s`;
    case 'thorn':
      return `伤害 ${sk.damage + sk.perLevel * lv}，定身 ${sk.rootDuration}s`;
    case 'volt':
      return `伤害 ${sk.damage + sk.perLevel * lv}，最多 ${sk.jumps + 1} 个目标，每跳 ×${sk.falloff}`;
    default:
      return '';
  }
}

function skillTable() {
  const rows = [
    '| 英雄 | 技能 | 消耗 | 冷却 | 作用距离/范围 | L1 效果 | L8 效果 |',
    '| --- | --- | ---: | ---: | --- | --- | --- |',
  ];
  for (const id of ids) {
    const h = HEROES[id];
    const sk = h.skill;
    let reach = '';
    if (sk.range) reach = `射程 ${sk.range}`;
    if (sk.radius) reach += `${reach ? '，' : ''}半径 ${sk.radius}`;
    if (sk.dash) reach += `${reach ? '，' : ''}位移 ${sk.dash}`;
    if (sk.chainRange) reach += `${reach ? '，' : ''}链距 ${sk.chainRange}`;
    if (sk.width) reach += `${reach ? '，' : ''}宽 ${sk.width}`;
    rows.push(
      `| ${h.name} | ${sk.name} | ${sk.cost} | ${sk.cooldown}s | ${reach || '自身'} | ${skillValue(id, 1)} | ${skillValue(id, 8)} |`
    );
  }
  return rows.join('\n');
}

function skillDetails() {
  const out = [];
  for (const id of ids) {
    const h = HEROES[id];
    const sk = h.skill;
    out.push(`### ${h.name} · ${sk.name}`);
    out.push(`- 称号：${h.title}；定位：${h.role}；价格 ${h.price}；${h.ranged ? '远程' : '近战'}；射程 ${h.range}。`);
    out.push(`- 简介：${h.blurb}`);
    out.push(`- 消耗 ${sk.cost} 金币，冷却 ${sk.cooldown}s。`);
    out.push(`- L1：${skillValue(id, 1)}。`);
    out.push(`- L8：${skillValue(id, 8)}。`);
    if (sk.id === 'mirage') {
      out.push('- 同一镜影英雄同时只能有 1 个镜像；镜像复制玩家的移动/攻击指令，不自动索敌，不能放技能；召唤者死亡或到期消失。');
    } else if (sk.id === 'spirit') {
      out.push('- 同一玩家最多同时存在 12 只灵仆；灵仆自动索敌/推塔，召唤者死亡或到期消失。');
    } else if (sk.id === 'lunar') {
      out.push('- 影响自身与附近友方英雄、魂塔；护盾持续 5 秒。');
    } else if (sk.id === 'falcon') {
      out.push('- 直线贯穿，路径上的所有敌人都会命中；对 35% 以下生命目标伤害 ×1.5。');
    } else if (sk.id === 'frost') {
      out.push('- 指定区域释放；减速 55%，持续 2.8 秒。');
    } else if (sk.id === 'thorn') {
      out.push('- 指定区域释放；命中敌方英雄定身 2 秒。');
    } else if (sk.id === 'volt') {
      out.push('- 依次链 4 个目标，伤害每跳 ×0.8，并减速 35% / 1.2 秒。');
    }
    out.push('');
  }
  return out.join('\n');
}

function aiTable() {
  const rows = [
    '| 英雄 | AI clickDamage | AI startGold | AI thinkScale | AI spendScale |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const id of ids) {
    const t = AI_HERO_TUNING[id] || {};
    rows.push(
      `| ${HEROES[id].name} | ${t.clickDamage ?? '—'} | ${t.startGold ?? '—'} | ${t.thinkScale ?? '—'} | ${t.spendScale ?? '—'} |`
    );
  }
  return rows.join('\n');
}

function aiLevelTable() {
  const rows = [
    '| 难度 | CPS | clickDamage | 开局金币 | 决策间隔 | 花钱间隔 | 集火 | 回防 | 智能选目标 | 全队技能 |',
    '| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |',
  ];
  for (const key of ['easy', 'normal', 'hard', 'nightmare']) {
    const c = AI_LEVELS[key];
    rows.push(
      `| ${c.name} | ${c.cps} | ${c.clickDamage} | +${c.startGoldBonus} | ${c.think[0]}–${c.think[1]}s | ${c.spend[0]}–${c.spend[1]}s | ${c.focus ? '✓' : '—'} | ${c.defend ? '✓' : '—'} | ${c.smart ? '✓' : '—'} | ${c.allSkills ? '✓' : '—'} |`
    );
  }
  return rows.join('\n');
}

const md = `# 塔魂：四境争锋 — 英雄完整数据与技能

> 数据来源：\`shared/heroes.js\`。以下为玩家与 AI 共用的英雄基础数据；AI 专属修正见文末，不影响玩家使用同一英雄时的数值。
>
> 手动点击：每次造成 **55% 攻击力**，最小间隔 **0.065s**（约 15 CPS），不重置自动攻击。  
> 6 CPS 点击 DPS = 攻击力 × 0.55 × 6（未计护甲）；10 CPS 点击 DPS = 攻击力 × 0.55 × 10。

## 0. 英雄身份

${identityTable()}

## 1. 基础属性（L1）

${statsTable()}

## 2. 等级成长（L1 / L4 / L8）

每级：最大生命 **+13%**、攻击 **+14%**、护甲 **+1**、产金 **+0.08/s**；最高 8 级。  
升级时回复新增最大生命差值，并额外回复 20 HP。

${growthTable()}

## 3. 升级成本

| 升级 | 费用 |
| --- | ---: |
| L1 → L2 | 90 |
| L2 → L3 | 150 |
| L3 → L4 | 210 |
| L4 → L5 | 270 |
| L5 → L6 | 330 |
| L6 → L7 | 390 |
| L7 → L8 | 450 |
| **L1 → L8 合计** | **1890** |

重生时间：\`5 + 0.6 × (等级 - 1)\` 秒，L1 为 5 秒，L8 为 9.2 秒。

## 4. 技能总表

${skillTable()}

## 5. 各英雄技能细节

${skillDetails()}

## 6. AI 专属修正（不影响玩家）

AI 在 **6 CPS / 噩梦** 下使用完整平衡表；**4 CPS / 困难** 按基础点击伤害与金币缩放使用。玩家使用同一英雄时不受影响。

${aiTable()}

## 7. AI 难度参数

${aiLevelTable()}

## 8. 备注

- 英雄的基础生命/攻击/护甲/射程/移速/攻速不受 AI 平衡表影响。
- 技能伤害/护盾/治疗按英雄等级成长（L1 + 每级成长）。
- 镜像继承的是**施法时**镜影英雄的生命/攻击；灵仆按召唤者等级成长。
- 魂塔、装备、资源点数据不在此表，见 \`shared/heroes.js\` 的 \`TOWER\` / \`ITEMS\`。
`;

fs.writeFileSync('HERO_DATA.md', md);
const json = {
  generatedAt: new Date().toISOString(),
  heroes: ids.map((id) => {
    const h = HEROES[id];
    return {
      id,
      name: h.name,
      title: h.title,
      role: h.role,
      price: h.price,
      ranged: h.ranged,
      range: h.range,
      speed: h.speed,
      attackInterval: h.attackInterval,
      radius: h.radius,
      base: { hp: h.hp, damage: h.damage, armor: h.armor },
      levels: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((lv) => {
        const s = heroStats(id, lv);
        return [lv, { hp: s.maxHp, damage: s.damage, armor: s.armor, income: s.income }];
      })),
      skill: h.skill,
      aiTuning: AI_HERO_TUNING[id] || {},
    };
  }),
  aiLevels: AI_LEVELS,
  upgradeCosts: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((lv) => [lv, heroUpgradeCost(lv)])),
  heroUpgrade: HERO_UPGRADE,
};
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/hero-data.json', JSON.stringify(json, null, 2));
console.log('wrote HERO_DATA.md and data/hero-data.json');
