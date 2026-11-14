import { generateMap } from '/shared/mapgen.js';

/* ================================================================== */
/* 常量 / DOM                                                         */
/* ================================================================== */

const TG = { PLAIN: 0, FOREST: 1, HILL: 2, MOUNTAIN: 3, WATER: 4 };
const TUTORIAL_STEPS = [
  { key: 'place', title: '部署第一座魂塔', text: '点击地图任意可建造地块放下魂塔。没有领地限制，山地和水域不能建。', highlight: '#game' },
  { key: 'lock', title: '锁定部署', text: '点击右侧「锁定部署」进入战斗。', highlight: '#lock-btn' },
  { key: 'summon', title: '召唤初始英雄', text: '战斗开始后，从英雄祭坛选择一位英雄。推荐炎锋，近战爆发更适合练习。', highlight: '#btn-open-altar' },
  { key: 'move', title: '移动与切换英雄', text: '点击地面移动当前英雄；点击右侧头像或地图上的己方英雄可切换操作对象。', highlight: '#game' },
  { key: 'build', title: '建造第二座魂塔', text: '点击「新建魂塔」，可以重复选择同一位英雄。教学房间额外提供了 400 金币。', highlight: '#build-tower-btn' },
  { key: 'focus', title: '全队集火', text: '按 F 或按住 Shift 点击地图中央的「训练木桩」，所有存活英雄会一起攻击它。', highlight: '#focus-button' },
  { key: 'skill', title: '释放技能', text: '按 Q 或点击技能按钮，释放当前英雄的专属技能。', highlight: '#skill-button' },
  { key: 'pause', title: '暂停与继续', text: '按 P 或点击顶栏暂停按钮。确认 AI 与对局计时冻结后，再按 P 继续。', highlight: '#pause-btn' },
  { key: 'done', title: '教学完成', text: '你已经掌握部署、多英雄、集火、技能与暂停。继续练习，或退出教学开始正式对局。', highlight: null },
];

const PHASE_LABEL = {
  lobby: ['集结中', ''],
  draft: ['部署魂塔', 'draft'],
  battle: ['战斗中', 'live'],
  ended: ['战斗结束', 'danger'],
};

const TEAM_COLORS = ['#5bd7ff', '#ff6b61'];
const CJK_FONT = '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", "TowerCJK", sans-serif';
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const fmtInt = (n) => Math.floor(Number(n) || 0).toLocaleString('zh-CN');
const fmtTime = (sec) => {
  const s = Math.max(0, Math.ceil(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rgba = (hex, alpha) => {
  const h = String(hex || '#66e0d2').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
};
const hash01 = (x, y, seed) => {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1274126177, 2246822519) ^ Math.imul(seed | 0, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const els = {
  app: $('#app'),
  stage: $('#stage'),
  canvas: $('#game'),
  mapZoomOut: $('#map-zoom-out'),
  mapZoomIn: $('#map-zoom-in'),
  mapCenter: $('#map-center'),
  minimap: $('#minimap'),
  mapHand: $('#map-hand'),
  commandPanel: $('.command-panel'),
  mobilePanelToggle: $('#mobile-panel-toggle'),
  mobileControls: $('#mobile-controls'),
  mobileStick: $('#mobile-stick'),
  mobileStickKnob: $('#mobile-stick-knob'),
  mobileSwap: $('#mobile-swap'),
  mobileFocus: $('#mobile-focus'),
  mobileSkill: $('#mobile-skill'),
  mobileSkillCd: $('#mobile-skill-cd'),
  mobileAttack: $('#mobile-attack'),
  phasePill: $('#phase-pill'),
  timerPill: $('#timer-pill'),
  attackModePill: $('#attack-mode-pill'),
  mapInputHint: $('#map-input-hint'),
  roomPill: $('#room-pill'),
  connDot: $('#conn-dot'),
  connText: $('#conn-text'),
  helpBtn: $('#help-btn'),
  pauseBtn: $('#pause-btn'),
  exitBtn: $('#exit-btn'),
  endReplayBtn: $('#end-replay-btn'),
  replayListBtn: $('#replay-list-btn'),
  replayListScreen: $('#replay-list-screen'),
  replayList: $('#replay-list'),
  replayListClose: $('#replay-list-close'),
  replayBar: $('#replay-bar'),
  replayPlay: $('#replay-play'),
  replaySeek: $('#replay-seek'),
  replayTime: $('#replay-time'),
  replaySpeed: $('#replay-speed'),
  replayExport: $('#replay-export'),
  replayExit: $('#replay-exit'),
  pauseOverlay: $('#pause-overlay'),
  pauseResumeBtn: $('#pause-resume-btn'),
  focusButton: $('#focus-button'),
  helpModal: $('#help-modal'),
  helpClose: $('#help-close'),
  playerCount: $('#player-count'),
  playerList: $('#player-list'),
  draftBanner: $('#draft-banner'),
  draftBannerText: $('#draft-banner-text'),
  announce: $('#announce'),
  spectate: $('#spectate-banner'),
  toasts: $('#toasts'),
  hoverTip: $('#hover-tip'),
  tutorialPanel: $('#tutorial-panel'),
  tutorialStepCount: $('#tutorial-step-count'),
  tutorialTitle: $('#tutorial-title'),
  tutorialText: $('#tutorial-text'),
  tutorialDots: $('#tutorial-dots'),
  tutorialSkip: $('#tutorial-skip'),
  tutorialExit: $('#tutorial-exit'),

  battleUI: $('#battle-ui'),
  draftUI: $('#draft-ui'),
  lobbyUI: $('#lobby-ui'),

  goldValue: $('#gold-value'),
  incomeValue: $('#income-value'),
  bountyValue: $('#bounty-value'),

  heroRoster: $('#hero-roster'),
  myColorDot: $('#my-color-dot'),
  buildTowerBtn: $('#build-tower-btn'),
  btnOpenAltar: $('#btn-open-altar'),
  heroUnit: $('#hero-unit'),
  heroName: $('#hero-name'),
  heroLevel: $('#hero-level'),
  heroHpFill: $('#hero-hp-fill'),
  heroHpText: $('#hero-hp-text'),
  heroDmg: $('#hero-dmg'),
  heroArmor: $('#hero-armor'),
  heroState: $('#hero-state'),
  btnHeroUpgrade: $('#btn-hero-upgrade'),
  heroUpgradeCost: $('#hero-upgrade-cost'),

  towerUnit: $('#tower-unit'),
  towerName: $('#tower-name'),
  towerLevel: $('#tower-level'),
  towerHpFill: $('#tower-hp-fill'),
  towerHpText: $('#tower-hp-text'),
  towerArmor: $('#tower-armor'),
  towerIncome: $('#tower-income'),
  towerItemCount: $('#tower-item-count'),
  towerItems: $('#tower-items'),
  btnTowerUpgrade: $('#btn-tower-upgrade'),
  towerUpgradeCost: $('#tower-upgrade-cost'),
  btnRepair: $('#btn-repair'),
  repairCost: $('#repair-cost'),

  equipGrid: $('#equip-grid'),
  ownCannon: $('#own-cannon'),
  ownWall: $('#own-wall'),
  ownMint: $('#own-mint'),
  costCannon: $('#cost-cannon'),
  costWall: $('#cost-wall'),
  costMint: $('#cost-mint'),

  skillButton: $('#skill-button'),
  kiteButton: $('#kite-button'),
  autoSelectButton: $('#auto-select-button'),
  mobileKite: $('#mobile-kite'),
  skillCd: $('#skill-cd'),
  skillName: $('#skill-name'),
  skillDesc: $('#skill-desc'),
  skillCost: $('#skill-cost'),
  aiHint: $('#ai-takeover-hint'),

  draftCountdown: $('#draft-countdown'),
  draftSummary: $('#draft-summary'),
  lockBtn: $('#lock-btn'),
  unlockBtn: $('#unlock-btn'),
  lobbySideText: $('#lobby-side-text'),
  lobbySideSlots: $('#lobby-side-slots'),

  startScreen: $('#start-screen'),
  lobbyScreen: $('#lobby-screen'),
  endScreen: $('#end-screen'),
  loadingScreen: $('#loading-screen'),
  loadingTitle: $('#loading-title'),
  loadingText: $('#loading-text'),
  loadingAbort: $('#loading-abort'),

  nameInput: $('#name-input'),
  quickBtn: $('#quick-btn'),
  tutorialBtn: $('#tutorial-btn'),
  spectateAiBtn: $('#spectate-ai-btn'),
  spectatorBanner: $('#spectator-banner'),
  spectatorExit: $('#spectator-exit'),
  createBtn: $('#create-btn'),
  joinToggle: $('#join-toggle'),
  joinForm: $('#join-form'),
  codeInput: $('#code-input'),
  joinBtn: $('#join-btn'),
  startAiLevel: $('#start-ai-level'),
  startAttackMode: $('#start-attack-mode'),
  startMapSize: $('#start-map-size'),
  startTeamMode: $('#start-team-mode'),
  startPlayers: $('#start-players'),
  startError: $('#start-error'),

  lobbyCode: $('#lobby-code'),
  copyCode: $('#copy-code'),
  lobbySlots: $('#lobby-slots'),
  slotChoice: $('#slot-choice'),
  lobbyAiLevel: $('#lobby-ai-level'),
  lobbyAttackMode: $('#lobby-attack-mode'),
  lobbyMapSize: $('#lobby-map-size'),
  lobbyTeamMode: $('#lobby-team-mode'),
  lobbySideMode: $('#lobby-side-mode'),
  startGameBtn: $('#start-game-btn'),
  leaveLobbyBtn: $('#leave-lobby-btn'),
  lobbyNote: $('#lobby-note'),

  altarModal: $('#altar-modal'),
  altarTitle: $('#altar-title'),
  altarSub: $('#altar-sub'),
  altarGrid: $('#altar-grid'),
  altarStatus: $('#altar-status'),
  altarFoot: $('#altar-foot'),
  altarClose: $('#altar-close'),
  eliminatedModal: $('#eliminated-modal'),
  eliminatedClose: $('#eliminated-close'),
  spectateContinueBtn: $('#spectate-continue-btn'),
  spectateRestartBtn: $('#spectate-restart-btn'),
  quickRestartBtn: $('#quick-restart-btn'),

  endTitle: $('#end-title'),
  endWinner: $('#end-winner'),
  endRanking: $('#end-ranking'),
  endNote: $('#end-note'),
  rematchBtn: $('#rematch-btn'),
  leaveEndBtn: $('#leave-end-btn'),
};

/* ================================================================== */
/* 状态                                                               */
/* ================================================================== */

const app = {
  code: null,
  playerId: null,
  init: null,
  state: null,
  map: null,
  catalog: null,
  es: null,
  connected: false,
  connecting: false,
  connectingSince: 0,
  everInit: false,
  pendingLoading: false,
  reconnectShown: false,
  recoveringSession: false,

  demoMap: null,
  mapCanvas: null,
  mapCanvasKey: '',

  view: { w: 1, h: 1, dpr: 1, scale: 1, ox: 0, oy: 0, zoom: 1, camX: null, camY: null, battleCentered: false },
  canvasPointer: null,
  panMode: false,
  minimapDrag: false,
  mouse: { x: 0, y: 0, worldX: 0, worldY: 0, over: false, tile: null },
  visuals: new Map(),
  effects: [],
  seenEventId: 0,
  shake: 0,
  time: 0,
  battleStartedAt: 0,
  lastFrame: performance.now(),

  draftSig: '',
  endSig: '',
  altarMode: null,
  buildMode: null,
  altarPromptedBattle: null,
  eliminatedPromptedBattle: null,
  focusMode: false,
  focusMark: null,
  tutorial: { active: false, step: 0, moved: false, focusUsed: false, skillUsed: false, pausedSeen: false, dismissed: false, code: null },
  skillAim: null,
  wasd: new Set(),
  lastPointerType: null,
  mobile: false,
  mobilePanelOpen: true,
  _restarting: false,
  autoModeHintShown: false,
  lobbySig: '',
  announceTimer: 0,
  toastCount: 0,
  lastAutoMsg: 0,
  aiLevel: 'normal',
  attackMode: 'manual',
  mapSize: 'standard',
  teamMode: 'ffa',
  maxPlayers: 4,
  spectator: false,
  replayMode: false,
  replay: null,
  replayRaf: 0,
};

const sessionKey = 'tower-souls-session-v1';
const nameKey = 'tower-souls-name-v1';
const aiLevelKey = 'tower-souls-ai-level-v1';
const attackModeKey = 'tower-souls-attack-mode-v1';
const mapSizeKey = 'tower-souls-map-size-v1';
const teamModeKey = 'tower-souls-team-mode-v1';
const playersKey = 'tower-souls-players-v1';
let recoveryProbeTimer = null;
let recoveryProbeAttempts = 0;

/* ================================================================== */
/* 启动                                                               */
/* ================================================================== */

init();

function init() {
  app.demoMap = generateMap(0x4a17c0de);
  buildMapCanvas(app.demoMap);
  els.nameInput.value = localStorage.getItem(nameKey) || randomName();
  app.aiLevel = readAILevelPreference();
  app.attackMode = readAttackModePreference();
  app.mapSize = readMapSizePreference();
  app.teamMode = readTeamModePreference();
  app.maxPlayers = readPlayersPreference();
  bindEvents();
  updateAILevelButtons();
  app.mobile = isMobileTouch();
  updateMobileUI();
  if (window.matchMedia) {
    const mq = window.matchMedia('(pointer: coarse)');
    mq.addEventListener?.('change', () => {
      app.mobile = isMobileTouch();
      updateMobileUI();
    });
  }
  resizeCanvas();
  new ResizeObserver(() => resizeCanvas()).observe(els.stage);
  requestAnimationFrame(frame);
  setInterval(() => { if (app.wasd.size) sendWasd(); }, 120);

  const saved = readSession();
  if (saved) {
    setLoading('正在回到四境…', '正在恢复上一局连接');
    app.pendingLoading = true;
    app.recoveringSession = true;
    connectStream(saved.code, saved.playerId);
    app.connectingSince = Date.now();
  } else {
    showStart();
  }
}

function randomName() {
  const left = ['霜', '焰', '影', '岩', '风', '星', '夜', '雷'];
  const right = ['行者', '猎手', '守望', '旅人', '之刃', '歌者'];
  return left[Math.floor(Math.random() * left.length)] + right[Math.floor(Math.random() * right.length)];
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(sessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.code && parsed.playerId) return parsed;
  } catch {
    /* noop */
  }
  return null;
}

function saveSession(code, playerId) {
  try {
    sessionStorage.setItem(sessionKey, JSON.stringify({ code, playerId }));
  } catch {
    /* noop */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(sessionKey);
  } catch {
    /* noop */
  }
}

/* ================================================================== */
/* 网络                                                               */
/* ================================================================== */

async function api(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await resp.json();
    } catch {
      data = { ok: false, error: '服务器返回异常' };
    }
    if (!resp.ok && data && !data.error) data.error = `请求失败 (${resp.status})`;
    if (!resp.ok && data) data.error = data.error || `请求失败 (${resp.status})`;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function connectStream(code, playerId) {
  clearRecoveryProbe();
  closeStream();
  app.code = code;
  app.playerId = playerId;
  app.everInit = false;
  app.connected = false;
  const url = `/api/stream?code=${encodeURIComponent(code)}&pid=${encodeURIComponent(playerId)}`;
  const es = new EventSource(url);
  app.es = es;

  es.addEventListener('init', (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch {
      return;
    }
    app.everInit = true;
    app.connected = true;
    app.connecting = false;
    app.recoveringSession = false;
    app.spectator = !!data.spectator;
    clearRecoveryProbe();
    app.init = data;
    app.playerId = data.playerId || app.playerId;
    app.code = data.code || app.code;
    app.map = data.map;
    app.catalog = data.catalog;
    applyMap(app.map);
    saveSession(app.code, app.playerId);
    updateConnection(true);
    if (app.pendingLoading) {
      els.loadingTitle.textContent = '战场同步中…';
      els.loadingText.textContent = '正在载入四境地图';
    }
  });

  es.addEventListener('state', (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch {
      return;
    }
    app.connected = true;
    app.connecting = false;
    app.recoveringSession = false;
    clearRecoveryProbe();
    updateConnection(true);
    handleState(data);
    if (app.pendingLoading) {
      app.pendingLoading = false;
      hideLoading();
    }
    if (app.reconnectShown) {
      app.reconnectShown = false;
      hideLoading();
    }
  });

  es.addEventListener('map', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data?.map) applyMap(data.map);
    } catch {
      /* noop */
    }
  });

  es.addEventListener('open', () => {
    app.connected = true;
    updateConnection(true);
  });

  es.addEventListener('error', () => {
    app.connected = false;
    app.connecting = true;
    updateConnection(false);
    if (!app.everInit && app.pendingLoading) {
      if (app.recoveringSession) {
        if (!app.reconnectShown) {
          app.reconnectShown = true;
          setLoading('正在恢复上一局', '服务器可能正在重启，正在等待房间恢复…');
          els.loadingAbort.classList.remove('hidden');
        }
        scheduleRecoveryProbe();
        return;
      }
      if (Date.now() - app.connectingSince > 6500) {
        abortConnection('无法进入房间', '房间可能已结束，或服务器没有启动。');
      }
      return;
    }
    if (app.everInit && !app.reconnectShown) {
      app.reconnectShown = true;
      setLoading('连接中断', 'AI 正在暂时接管你的英雄，正在尝试重连…');
      els.loadingAbort.classList.remove('hidden');
      setTimeout(() => {
        if (app.reconnectShown && !app.connected) {
          els.loadingText.textContent = '仍在重连。若服务器已关闭，请返回首页。';
        }
      }, 4200);
    }
    if (app.everInit) scheduleRecoveryProbe();
  });
}

function clearRecoveryProbe() {
  if (recoveryProbeTimer) {
    clearTimeout(recoveryProbeTimer);
    recoveryProbeTimer = null;
  }
  recoveryProbeAttempts = 0;
}

function scheduleRecoveryProbe(delay = 4500) {
  if (recoveryProbeTimer) return;
  recoveryProbeTimer = setTimeout(async () => {
    recoveryProbeTimer = null;
    if (!app.reconnectShown || app.connected || !app.code || !app.playerId) return;
    let data = null;
    try {
      data = await api('/api/room', { code: app.code, playerId: app.playerId });
    } catch {
      data = null;
    }
    if (data && data.error && /房间不存在|身份无效/.test(data.error)) {
      abortConnection('无法恢复上一局', '服务器已重启或房间已关闭，请返回首页开始新局。');
      return;
    }
    recoveryProbeAttempts += 1;
    if (data && data.phase && !app.connected) {
      // EventSource 在部分 HTTP 错误后会进入 CLOSED，不再自动重连；房间恢复时主动重建。
      const shouldReconnect =
        !app.es ||
        app.es.readyState === EventSource.CLOSED ||
        recoveryProbeAttempts >= 1;
      if (shouldReconnect) {
        connectStream(app.code, app.playerId);
        scheduleRecoveryProbe(5000);
        return;
      }
      els.loadingText.textContent = '房间仍在，正在恢复连接…';
    }
    if (app.reconnectShown && !app.connected) {
      if (recoveryProbeAttempts >= 6) {
        els.loadingText.textContent = '服务器长时间未响应。请点击「返回首页」后重新进入。';
      } else {
        scheduleRecoveryProbe(5000);
      }
    }
  }, delay);
}

function closeStream() {
  if (app.es) {
    app.es.close();
    app.es = null;
  }
}

function abortConnection(title, text) {
  clearRecoveryProbe();
  closeStream();
  app.pendingLoading = false;
  app.reconnectShown = false;
  app.recoveringSession = false;
  app.everInit = false;
  app.connecting = false;
  clearSession();
  app.state = null;
  app.init = null;
  app.map = null;
  app.code = null;
  app.playerId = null;
  hideLoading();
  showStart();
  if (title) showToast(`${title}：${text}`, 'error', 4200);
}

function applyMap(map) {
  if (!map) return;
  if (app.map && app.map.seed !== map.seed) {
    app.visuals.clear();
    app.effects = [];
  }
  app.map = map;
  app.view.zoom = map.w >= 120 ? 2.2 : map.w > 50 ? 2 : 1;
  app.view.camX = (map.center.x + 0.5) * map.tile;
  app.view.camY = (map.center.y + 0.5) * map.tile;
  app.view.battleCentered = false;
  buildMapCanvas(map);
  resizeCanvas();
}

function handleState(state) {
  const prevPhase = app.state?.phase;
  if (state.battle && state.battle.startedAt !== app.battleStartedAt) {
    app.battleStartedAt = state.battle.startedAt;
    app.seenEventId = 0;
  }
  app.state = state;
  if (state.hostId && app.init) app.init.isHost = state.hostId === app.playerId;
  processEvents(state.battle?.events || []);
  syncVisuals();
  applyPhaseUI(prevPhase);
  updateHeader();
  updatePlayerList();
  updateCommandPanel();
  updateDraftUI();
  updateLobbyUI();
  updateEndUI();
  maybeAutoOpenAltar();
  updateEliminationUI();
  updatePauseUI();
  syncTutorial();
}

async function togglePause() {
  clearWasd();
  const state = app.state;
  const me = myPlayer();
  if (!state || state.phase !== 'battle' || !state.canPause) {
    showToast('只有单人 vs AI 对局可以暂停', 'error', 1600);
    return;
  }
  if (!me || me.eliminated) return;
  const result = await sendAction({ type: 'togglePause' });
  if (!result.ok && result.error && result.error !== 'paused') showToast(result.error, 'error');
}

function toggleFocusMode() {
  const state = app.state;
  const me = myPlayer();
  const battle = state?.battle;
  if (!state || state.phase !== 'battle' || !battle || battle.over) return;
  if (state.paused) {
    showToast('战斗已暂停，按 P 继续', '', 1200);
    return;
  }
  if (!me || me.eliminated) return;
  if (!myHeroes().some((h) => h.alive)) {
    showToast('没有存活的英雄可以集火', 'error', 1500);
    return;
  }
  app.focusMode = !app.focusMode;
  updateFocusButton();
  if (app.focusMode) {
    showAnnounce('集火模式 · 点击一个敌方目标，所有英雄一起攻击', '');
  } else {
    hideAnnounce();
  }
  updateMobileUI();
}

function toggleKiteMode() {
  const state = app.state;
  const hero = myHero();
  const me = myPlayer();
  if (!state || state.phase !== 'battle' || state.paused || !hero || !hero.alive || me?.eliminated) return;
  sendAction({ type: 'toggleKite' }, { silent: true }).then((r) => {
    if (!r.ok) return;
    showToast(r.kite ? '保持距离：开启 · 攻击时自动后撤' : '保持距离：关闭', 'gold', 1600);
  });
}

function toggleAutoSelectMode() {
  const state = app.state;
  const me = myPlayer();
  if (!state || state.phase !== 'battle' || state.paused || !me || me.eliminated) return;
  sendAction({ type: 'toggleAutoSelect' }, { silent: true }).then((r) => {
    if (!r.ok) return;
    showToast(r.autoSelectNearest ? '自动选人：开启 · 点击敌人自动选最近英雄' : '自动选人：关闭', 'gold', 1800);
  });
}

function updateAutoSelectButton() {
  const me = myPlayer();
  const state = app.state;
  const enabled = me?.autoSelectNearest !== false;
  const disabled = !me || me.eliminated || !state || state.phase !== 'battle' || state.paused || state.battle?.over;
  els.autoSelectButton.classList.toggle('active', enabled);
  els.autoSelectButton.disabled = disabled;
  els.autoSelectButton.title = !enabled
    ? '自动选人：关闭'
    : me?.manualHeroSelect
      ? '自动选人：开启；当前手动指定了英雄，关闭再开启可恢复自动'
      : '自动选人：开启；点击敌人自动选择最近英雄';
}

function updateKiteButton() {
  const hero = myHero();
  const me = myPlayer();
  const state = app.state;
  const enabled = !!hero?.kite;
  const disabled = !hero || !hero.alive || !me || me.eliminated || !state || state.phase !== 'battle' || state.paused;
  els.kiteButton.classList.toggle('active', enabled);
  els.kiteButton.disabled = disabled;
  els.mobileKite.classList.toggle('kite-on', enabled);
  els.mobileKite.disabled = disabled;
}

function updateFocusButton() {
  if (!els.focusButton) return;
  els.focusButton.classList.toggle('active', !!app.focusMode);
  const small = els.focusButton.querySelector('small');
  if (small) small.textContent = app.focusMode ? '点击敌方目标发动集火' : '所有英雄攻击同一目标';
}

function updatePauseUI() {
  const state = app.state;
  const me = myPlayer();
  const battle = state?.battle;
  const canPause = !!(state && state.phase === 'battle' && state.canPause && me && !me.eliminated && battle && !battle.over);
  const paused = !!(state && state.phase === 'battle' && state.paused);
  els.pauseBtn.classList.toggle('hidden', !canPause);
  els.pauseBtn.classList.toggle('paused', paused);
  els.pauseBtn.textContent = paused ? '▶' : 'Ⅱ';
  els.pauseBtn.title = paused ? '继续战斗 (P)' : '暂停 (P)';
  els.pauseOverlay.classList.toggle('hidden', !paused);
  if (paused) {
    app.focusMode = false;
    app.buildMode = null;
    cancelSkillAim(false);
    closeAltar();
    updateFocusButton();
  }
}

function hideTutorialUI() {
  app.tutorial.active = false;
  app.tutorial.dismissed = false;
  app.tutorial.code = null;
  if (els.tutorialPanel) els.tutorialPanel.classList.add('hidden');
  clearTutorialHighlight();
}

function clearTutorialHighlight() {
  document.querySelectorAll('.tutorial-glow').forEach((el) => el.classList.remove('tutorial-glow'));
  els.stage.classList.remove('tutorial-stage-glow');
}

function applyTutorialHighlight(selector) {
  clearTutorialHighlight();
  if (!selector) return;
  if (selector === '#game') {
    els.stage.classList.add('tutorial-stage-glow');
    return;
  }
  const el = document.querySelector(selector);
  if (el) el.classList.add('tutorial-glow');
}

function renderTutorialStep() {
  if (!app.tutorial.active) {
    els.tutorialPanel.classList.add('hidden');
    clearTutorialHighlight();
    return;
  }
  const step = TUTORIAL_STEPS[app.tutorial.step] || TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1];
  const done = step.key === 'done';
  const guideTotal = TUTORIAL_STEPS.length - 1;
  els.tutorialPanel.classList.remove('hidden');
  els.tutorialStepCount.textContent = done ? '完成' : `${app.tutorial.step + 1} / ${guideTotal}`;
  els.tutorialTitle.textContent = step.title;
  els.tutorialText.textContent = step.text;
  els.tutorialDots.innerHTML = Array.from({ length: guideTotal }, (_, i) => {
    const cls = i < app.tutorial.step ? 'done' : i === app.tutorial.step ? 'current' : '';
    return `<i class="${cls}"></i>`;
  }).join('');
  els.tutorialSkip.textContent = done ? '继续练习' : '跳过教学';
  applyTutorialHighlight(done ? null : step.highlight);
}

function syncTutorial() {
  const state = app.state;
  if (!state) {
    if (app.tutorial.active) hideTutorialUI();
    return;
  }
  if (!state.tutorial) {
    if (app.tutorial.active || !els.tutorialPanel.classList.contains('hidden')) hideTutorialUI();
    return;
  }
  if (!app.tutorial.active && !app.tutorial.dismissed) {
    app.tutorial = {
      active: true,
      step: 0,
      moved: false,
      focusUsed: false,
      skillUsed: false,
      pausedSeen: false,
      dismissed: false,
      code: state.code,
    };
    renderTutorialStep();
  }
  if (!app.tutorial.active) return;

  const me = myPlayer();
  if (!me) return;
  let changed = false;
  for (let guard = 0; guard < TUTORIAL_STEPS.length; guard++) {
    if (app.tutorial.step >= TUTORIAL_STEPS.length - 1) break;
    const key = TUTORIAL_STEPS[app.tutorial.step].key;
    let complete = false;
    if (key === 'place') complete = !!me.placed || state.phase === 'battle';
    else if (key === 'lock') complete = state.phase === 'battle';
    else if (key === 'summon') complete = myHeroes().length > 0;
    else if (key === 'move') complete = !!app.tutorial.moved;
    else if (key === 'build') complete = (me.towersTotal || 0) >= 2;
    else if (key === 'focus') complete = !!app.tutorial.focusUsed;
    else if (key === 'skill') complete = !!app.tutorial.skillUsed;
    else if (key === 'pause') {
      if (state.paused) app.tutorial.pausedSeen = true;
      complete = !!app.tutorial.pausedSeen && !state.paused;
    }
    if (!complete) break;
    app.tutorial.step += 1;
    changed = true;
  }
  if (changed) renderTutorialStep();
  else if (app.tutorial.step >= TUTORIAL_STEPS.length - 1) {
    // done step is already rendered by the last change; keep it visible
  }
}

function noteTutorialAction(type) {
  if (!app.tutorial.active || app.tutorial.dismissed) return;
  if (type === 'move' || type === 'selectHero') app.tutorial.moved = true;
  if (type === 'focusFire') app.tutorial.focusUsed = true;
  if (type === 'skill') app.tutorial.skillUsed = true;
  syncTutorial();
}

function maybeAutoOpenAltar() {
  const state = app.state;
  if (!state || state.phase !== 'battle' || !state.battle) return;
  if (app.altarPromptedBattle === state.battle.startedAt) return;
  const me = myPlayer();
  if (!me || me.eliminated) return;
  if (myHeroes().length === 0 && emptyTower()) {
    app.altarPromptedBattle = state.battle.startedAt;
    openAltar('summon');
  } else {
    app.altarPromptedBattle = state.battle.startedAt;
  }
}

async function startFreshGame() {
  if (app._restarting) return;
  app._restarting = true;
  const me = myPlayer();
  const name = me?.name || localStorage.getItem(nameKey) || randomName();
  closeStream();
  clearSession();
  closeAltar();
  app.buildMode = null;
  app.focusMode = false;
  app.focusMark = null;
  app.state = null;
  app.init = null;
  app.map = null;
  app.code = null;
  app.playerId = null;
  app.connected = false;
  app.pendingLoading = true;
  app.connectingSince = Date.now();
  setLoading('开启新局…', '正在创建新的四境');
  els.startScreen.classList.add('hidden');
  els.lobbyScreen.classList.add('hidden');
  els.endScreen.classList.add('hidden');
  els.spectate.classList.add('hidden');
  closeEliminatedModal();
  try {
    const data = await api('/api/quick', { name });
    if (!data.ok) {
      showStart();
      showToast(data.error || '新局创建失败', 'error');
      return;
    }
    beginConnect(data.code, data.playerId);
  } catch {
    showStart();
    showToast('无法连接服务器，新局创建失败', 'error');
  } finally {
    app._restarting = false;
  }
}

async function sendAction(action, opts = {}) {
  if (!app.code || !app.playerId) return { ok: false, error: '尚未连接' };
  if (app.state?.paused && action.type !== 'togglePause' && action.type !== 'selectHero') {
    if (!opts.silent) showToast('战斗已暂停，按 P 继续', '', 1200);
    return { ok: false, error: 'paused' };
  }
  try {
    const data = await api('/api/action', {
      code: app.code,
      playerId: app.playerId,
      action,
    });
    if (!data.ok && !opts.silent) showToast(data.error || '操作失败', 'error');
    if (data.ok) noteTutorialAction(action.type);
    return data;
  } catch {
    if (!opts.silent) showToast('网络异常，指令未送达', 'error');
    return { ok: false, error: 'network' };
  }
}

/* ================================================================== */
/* 开始 / 大厅 / 房间流程                                             */
/* ================================================================== */

function bindEvents() {
  els.quickBtn.addEventListener('click', quickPlay);
  els.tutorialBtn.addEventListener('click', startTutorial);
  els.spectateAiBtn.addEventListener('click', startSpectate);
  els.spectatorExit.addEventListener('click', leaveRoom);
  els.createBtn.addEventListener('click', createRoom);
  els.joinToggle.addEventListener('click', () => {
    els.joinForm.classList.toggle('hidden');
    if (!els.joinForm.classList.contains('hidden')) els.codeInput.focus();
  });
  els.joinBtn.addEventListener('click', joinRoom);
  els.codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
  });
  els.nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') quickPlay();
  });

  els.roomPill.addEventListener('click', copyRoomCode);
  els.copyCode.addEventListener('click', copyRoomCode);
  els.startGameBtn.addEventListener('click', () => sendAction({ type: 'start' }));
  els.leaveLobbyBtn.addEventListener('click', leaveRoom);
  els.leaveEndBtn.addEventListener('click', leaveRoom);
  els.rematchBtn.addEventListener('click', () => sendAction({ type: 'rematch' }));
  els.loadingAbort.addEventListener('click', () => abortConnection(null, null));

  els.slotChoice.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-slots]');
    if (!btn || !isHost()) return;
    sendAction({ type: 'setSlots', value: Number(btn.dataset.slots) });
  });
  els.startAiLevel.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-ai-level]');
    if (!btn) return;
    app.aiLevel = btn.dataset.aiLevel;
    try { localStorage.setItem(aiLevelKey, app.aiLevel); } catch { /* noop */ }
    updateAILevelButtons();
  });
  els.startAttackMode.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-attack-mode]');
    if (!btn) return;
    app.attackMode = btn.dataset.attackMode === 'auto' ? 'auto' : 'manual';
    try { localStorage.setItem(attackModeKey, app.attackMode); } catch { /* noop */ }
    updateModeButtons();
  });
  els.startMapSize.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-map-size]');
    if (!btn) return;
    app.mapSize = btn.dataset.mapSize === 'xlarge' ? 'xlarge' : btn.dataset.mapSize === 'large' ? 'large' : 'standard';
    try { localStorage.setItem(mapSizeKey, app.mapSize); } catch { /* noop */ }
    updateModeButtons();
  });
  els.startTeamMode.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-team-mode]');
    if (!btn) return;
    app.teamMode = btn.dataset.teamMode === 'teams' ? 'teams' : 'ffa';
    try { localStorage.setItem(teamModeKey, app.teamMode); } catch { /* noop */ }
    updateModeButtons();
  });
  els.startPlayers.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-players]');
    if (!btn) return;
    app.maxPlayers = Number(btn.dataset.players) || 4;
    try { localStorage.setItem(playersKey, String(app.maxPlayers)); } catch { /* noop */ }
    updateModeButtons();
  });
  els.lobbyAttackMode.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-attack-mode]');
    if (!btn || !isHost()) return;
    sendAction({ type: 'setManualAttack', value: btn.dataset.attackMode !== 'auto' }, { silent: true });
  });
  els.lobbyMapSize.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-map-size]');
    if (!btn || !isHost()) return;
    sendAction({ type: 'setMapSize', value: btn.dataset.mapSize });
  });
  els.lobbyTeamMode.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-team-mode]');
    if (!btn || !isHost()) return;
    sendAction({ type: 'setTeamMode', value: btn.dataset.teamMode });
  });
  els.lobbyAiLevel.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-ai-level]');
    if (!btn || !isHost()) return;
    sendAction({ type: 'setAILevel', value: btn.dataset.aiLevel });
  });

  els.lockBtn.addEventListener('click', () => {
    const me = myPlayer();
    if (!me) return;
    if (me.ready) return;
    sendAction({ type: 'lock' });
  });
  els.unlockBtn.addEventListener('click', () => sendAction({ type: 'unlock' }));
  els.btnHeroUpgrade.addEventListener('click', () => sendAction({ type: 'upgradeHero' }));
  els.buildTowerBtn.addEventListener('click', () => openAltar('build'));
  els.btnOpenAltar.addEventListener('click', () => openAltar('summon'));
  els.altarClose.addEventListener('click', closeAltar);
  els.altarModal.addEventListener('click', (e) => {
    if (e.target === els.altarModal) closeAltar();
  });
  els.pauseBtn.addEventListener('click', togglePause);
  els.exitBtn.addEventListener('click', exitCurrentGame);
  els.endReplayBtn.addEventListener('click', () => {
    const id = app.state?.result?.replayId;
    if (id) openReplay(id);
    else openReplayList();
  });
  els.replayListBtn.addEventListener('click', openReplayList);
  els.replayListClose.addEventListener('click', closeReplayList);
  els.replayPlay.addEventListener('click', toggleReplayPlay);
  els.replaySpeed.addEventListener('click', cycleReplaySpeed);
  els.replayExport.addEventListener('click', toggleReplayExport);
  els.replayExit.addEventListener('click', closeReplay);
  els.replaySeek.addEventListener('input', seekReplay);
  els.pauseResumeBtn.addEventListener('click', togglePause);
  els.focusButton.addEventListener('click', toggleFocusMode);
  els.kiteButton.addEventListener('click', toggleKiteMode);
  els.autoSelectButton.addEventListener('click', toggleAutoSelectMode);
  els.mobileKite.addEventListener('click', toggleKiteMode);
  els.mobilePanelToggle.addEventListener('click', toggleMobilePanel);
  els.mobileSwap.addEventListener('click', swapMobileHero);
  els.mobileFocus.addEventListener('click', toggleFocusMode);
  els.mobileSkill.addEventListener('click', () => handleSkillButton());
  els.mobileAttack.addEventListener('pointerdown', startMobileAttack);
  els.mobileAttack.addEventListener('pointerup', stopMobileAttack);
  els.mobileAttack.addEventListener('pointercancel', stopMobileAttack);
  els.mobileAttack.addEventListener('pointerleave', stopMobileAttack);
  bindMobileStick();
  els.tutorialSkip.addEventListener('click', () => {
    app.tutorial.active = false;
    app.tutorial.dismissed = true;
    els.tutorialPanel.classList.add('hidden');
    clearTutorialHighlight();
    showToast('已跳过教学，可继续在当前房间练习', '', 1800);
  });
  els.tutorialExit.addEventListener('click', leaveRoom);
  els.quickRestartBtn.addEventListener('click', startFreshGame);
  els.spectateRestartBtn.addEventListener('click', startFreshGame);
  els.spectateContinueBtn.addEventListener('click', closeEliminatedModal);
  els.eliminatedClose.addEventListener('click', closeEliminatedModal);
  els.eliminatedModal.addEventListener('click', (e) => {
    if (e.target === els.eliminatedModal) closeEliminatedModal();
  });
  els.btnTowerUpgrade.addEventListener('click', () => sendAction({ type: 'upgradeTower' }));
  els.btnRepair.addEventListener('click', () => sendAction({ type: 'repair' }));
  els.heroRoster.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('[data-hero-select]');
    if (!card) return;
    e.preventDefault();
    sendAction({ type: 'selectHero', heroId: card.dataset.heroSelect });
  });
  els.altarGrid.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('[data-altar-hero]');
    if (!card || card.disabled) return;
    e.preventDefault();
    chooseAltarHero(card.dataset.altarHero);
  });
  els.equipGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-item]');
    if (!btn) return;
    sendAction({ type: 'buyItem', item: btn.dataset.item });
  });
  els.skillButton.addEventListener('click', () => handleSkillButton());

  window.addEventListener('pointerdown', (e) => {
    app.lastPointerType = e.pointerType || app.lastPointerType;
  }, true);
  els.canvas.addEventListener('pointermove', onPointerMove);
  els.canvas.addEventListener('pointerleave', () => {
    app.mouse.over = false;
    els.hoverTip.classList.add('hidden');
  });
  els.canvas.addEventListener('pointerdown', onCanvasDown);
  els.canvas.addEventListener('pointerup', onCanvasUp);
  els.canvas.addEventListener('pointercancel', onCanvasCancel);
  els.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  els.mapZoomOut.addEventListener('click', () => zoomViewAt(app.view.zoom / 1.25, app.view.w / 2, app.view.h / 2));
  els.mapZoomIn.addEventListener('click', () => zoomViewAt(app.view.zoom * 1.25, app.view.w / 2, app.view.h / 2));
  els.mapCenter.addEventListener('click', centerCameraOnPlayer);
  els.mapHand.addEventListener('click', togglePanMode);
  els.minimap.addEventListener('pointerdown', onMinimapPointer);
  els.minimap.addEventListener('pointermove', (e) => {
    if (app.minimapDrag) onMinimapPointer(e);
  });
  els.minimap.addEventListener('pointerup', () => { app.minimapDrag = false; });
  els.minimap.addEventListener('pointercancel', () => { app.minimapDrag = false; });
  window.addEventListener('pointerup', () => { app.minimapDrag = false; });
  window.addEventListener('pointercancel', () => { app.minimapDrag = false; });
  els.playerList.addEventListener('click', (e) => {
    const card = e.target.closest('.pcard[data-player-id]');
    if (!card) return;
    centerCameraOnPlayer(card.dataset.playerId);
  });
  els.canvas.addEventListener('wheel', (e) => {
    if (!currentMap()) return;
    e.preventDefault();
    const rect = els.canvas.getBoundingClientRect();
    const factor = e.deltaY > 0 ? 1 / 1.14 : 1.14;
    zoomViewAt(app.view.zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  els.helpBtn.addEventListener('click', () => {
    els.helpModal.classList.remove('hidden');
  });
  els.helpClose.addEventListener('click', () => els.helpModal.classList.add('hidden'));
  els.helpModal.addEventListener('click', (e) => {
    if (e.target === els.helpModal) els.helpModal.classList.add('hidden');
  });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => clearWasd());
  window.addEventListener('beforeunload', () => closeStream());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearWasd();
  });
}

function startBusy(btn, text) {
  btn.dataset.old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span>${esc(text)}</span>`;
}

function startIdle(btn) {
  if (btn.dataset.old) {
    btn.innerHTML = btn.dataset.old;
    delete btn.dataset.old;
  }
  btn.disabled = false;
}

function readName() {
  const name = (els.nameInput.value || '').trim().slice(0, 12);
  const finalName = name || randomName();
  localStorage.setItem(nameKey, finalName);
  return finalName;
}

function showStartError(text) {
  els.startError.textContent = text;
  els.startError.classList.remove('hidden');
}

function clearStartError() {
  els.startError.classList.add('hidden');
}

function readAILevelPreference() {
  try {
    const v = localStorage.getItem(aiLevelKey);
    if (v === 'easy' || v === 'normal' || v === 'hard' || v === 'nightmare') return v;
  } catch {
    /* noop */
  }
  return 'normal';
}

function updateAILevelButtons() {
  for (const btn of $$('#start-ai-level button')) {
    btn.classList.toggle('active', btn.dataset.aiLevel === app.aiLevel);
  }
  updateModeButtons();
}

function updateModeButtons() {
  for (const btn of $$('#start-attack-mode button')) {
    btn.classList.toggle('active', btn.dataset.attackMode === app.attackMode);
  }
  for (const btn of $$('#start-map-size button')) {
    btn.classList.toggle('active', btn.dataset.mapSize === app.mapSize);
  }
  for (const btn of $$('#start-team-mode button')) {
    btn.classList.toggle('active', btn.dataset.teamMode === app.teamMode);
  }
  for (const btn of $$('#start-players button')) {
    btn.classList.toggle('active', Number(btn.dataset.players) === app.maxPlayers);
  }
  const names = { easy: '休闲', normal: '标准', hard: '困难', nightmare: '噩梦' };
  const maps = { standard: '标准图', large: '大地图', xlarge: '超大图' };
  const modes = { ffa: '自由混战', teams: teamModeLabel() };
  const attackName = app.attackMode === 'auto' ? '自动战斗' : '手速模式';
  const small = els.quickBtn?.querySelector('small');
  if (small) small.textContent = `你 + ${Math.max(1, app.maxPlayers - 1)} 名 AI · ${names[app.aiLevel] || '标准'} · ${maps[app.mapSize] || '标准图'} · ${modes[app.teamMode] || '自由混战'} · ${attackName}`;
}

function teamModeLabel(max = app.maxPlayers) {
  if (app.teamMode !== 'teams') return '自由混战';
  return `团队 ${Math.max(1, Math.floor(max / 2))}v${Math.max(1, Math.floor(max / 2))}`;
}

function readAttackModePreference() {
  try {
    const v = localStorage.getItem(attackModeKey);
    if (v === 'manual' || v === 'auto') return v;
  } catch { /* noop */ }
  return 'manual';
}

function readMapSizePreference() {
  try {
    const v = localStorage.getItem(mapSizeKey);
    if (v === 'large' || v === 'xlarge' || v === 'standard') return v;
  } catch { /* noop */ }
  return 'standard';
}

function readTeamModePreference() {
  try {
    const v = localStorage.getItem(teamModeKey);
    if (v === 'teams' || v === 'ffa') return v;
  } catch { /* noop */ }
  return 'ffa';
}

function readPlayersPreference() {
  try {
    const v = Number(localStorage.getItem(playersKey));
    if ([4, 6, 8].includes(v)) return v;
  } catch { /* noop */ }
  return 4;
}

async function quickPlay() {
  clearStartError();
  startBusy(els.quickBtn, '正在集结 AI…');
  try {
    const data = await api('/api/quick', { name: readName(), aiLevel: app.aiLevel, mapSize: app.mapSize, teamMode: app.teamMode, maxPlayers: app.maxPlayers, manualAttack: app.attackMode !== 'auto' });
    if (!data.ok) {
      showStartError(data.error || '创建失败');
      return;
    }
    beginConnect(data.code, data.playerId);
  } catch {
    showStartError('无法连接服务器，请确认 npm start 已运行。');
  } finally {
    startIdle(els.quickBtn);
  }
}

async function startTutorial() {
  clearStartError();
  startBusy(els.tutorialBtn, '进入教学…');
  try {
    const data = await api('/api/tutorial', { name: readName() });
    if (!data.ok) {
      showStartError(data.error || '教学房间创建失败');
      return;
    }
    app.tutorial = { active: false, step: 0, moved: false, focusUsed: false, skillUsed: false, pausedSeen: false, dismissed: false, code: null };
    beginConnect(data.code, data.playerId);
  } catch {
    showStartError('无法连接服务器，请确认 npm start 已运行。');
  } finally {
    startIdle(els.tutorialBtn);
  }
}

async function startSpectate() {
  clearStartError();
  startBusy(els.spectateAiBtn, '正在创建观战局…');
  try {
    const data = await api('/api/spectate', { name: readName(), aiLevel: app.aiLevel, mapSize: app.mapSize, teamMode: app.teamMode, maxPlayers: app.maxPlayers, manualAttack: app.attackMode !== 'auto' });
    if (!data.ok) {
      showStartError(data.error || '观战房间创建失败');
      return;
    }
    app.spectator = true;
    beginConnect(data.code, data.playerId);
    app.spectator = true;
  } catch {
    showStartError('无法连接服务器，请确认 npm start 已运行。');
  } finally {
    startIdle(els.spectateAiBtn);
  }
}

async function createRoom() {
  clearStartError();
  startBusy(els.createBtn, '创建中…');
  try {
    const data = await api('/api/create', { name: readName(), aiLevel: app.aiLevel, mapSize: app.mapSize, teamMode: app.teamMode, maxPlayers: app.maxPlayers, manualAttack: app.attackMode !== 'auto' });
    if (!data.ok) {
      showStartError(data.error || '创建失败');
      return;
    }
    beginConnect(data.code, data.playerId);
  } catch {
    showStartError('无法连接服务器，请确认 npm start 已运行。');
  } finally {
    startIdle(els.createBtn);
  }
}

async function joinRoom() {
  clearStartError();
  const code = (els.codeInput.value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    showStartError('请输入正确的房间号');
    return;
  }
  startBusy(els.joinBtn, '进入…');
  try {
    const data = await api('/api/join', { code, name: readName() });
    if (!data.ok) {
      showStartError(data.error || '加入失败');
      return;
    }
    beginConnect(data.code, data.playerId);
  } catch {
    showStartError('无法连接服务器，请确认 npm start 已运行。');
  } finally {
    startIdle(els.joinBtn);
  }
}

function beginConnect(code, playerId) {
  app.wasd.clear();
  app.connecting = true;
  app.spectator = false;
  stopReplayLoop();
  app.replayMode = false;
  app.replay = null;
  els.replayBar?.classList.add('hidden');
  els.replayListScreen?.classList.add('hidden');
  els.exitBtn?.classList.remove('hidden');
  els.app.classList.remove('spectating');
  els.spectatorBanner?.classList.add('hidden');
  els.commandPanel?.classList.remove('hidden');
  app.pendingLoading = true;
  app.recoveringSession = false;
  app.connectingSince = Date.now();
  app.state = null;
  app.init = null;
  app.map = null;
  app.demoMap = generateMap(0x4a17c0de);
  saveSession(code, playerId);
  els.startScreen.classList.add('hidden');
  els.lobbyScreen.classList.add('hidden');
  els.endScreen.classList.add('hidden');
  setLoading('进入四境…', '正在连接战斗房间');
  connectStream(code, playerId);
}

function showStart() {
  clearRecoveryProbe();
  app.wasd.clear();
  closeStream();
  stopReplayLoop();
  app.spectator = false;
  app.replayMode = false;
  app.replay = null;
  els.replayBar?.classList.add('hidden');
  els.replayListScreen?.classList.add('hidden');
  els.exitBtn?.classList.add('hidden');
  els.app.classList.remove('spectating');
  els.spectatorBanner?.classList.add('hidden');
  els.commandPanel?.classList.remove('hidden');
  app.state = null;
  app.init = null;
  app.map = null;
  app.code = null;
  app.playerId = null;
  app.connected = false;
  app.pendingLoading = false;
  app.recoveringSession = false;
  updateConnection(false);
  els.startScreen.classList.remove('hidden');
  els.lobbyScreen.classList.add('hidden');
  els.endScreen.classList.add('hidden');
  els.helpModal.classList.add('hidden');
  closeEliminatedModal();
  hideTutorialUI();
  hideLoading();
  app.effects = [];
  app.shake = 0;
  app.battleStartedAt = 0;
  app.seenEventId = 0;
  app.autoModeHintShown = false;
  els.app.classList.remove('in-room');
  els.app.classList.add('no-room');
  if (!app.map && app.demoMap) buildMapCanvas(app.demoMap);
  resizeCanvas();
  els.playerList.innerHTML = '<div class="empty-state">等待连接…</div>';
  els.playerCount.textContent = '0 / 4';
  els.phasePill.className = 'status-pill';
  els.phasePill.innerHTML = '<i></i><b>未连接</b>';
  els.timerPill.textContent = '--:--';
  els.roomPill.disabled = true;
  els.roomPill.querySelector('b').textContent = '----';
  els.battleUI.classList.add('hidden');
  els.draftUI.classList.add('hidden');
  els.lobbyUI.classList.add('hidden');
  els.hoverTip.classList.add('hidden');
  els.spectate.classList.add('hidden');
  syncVisuals();
}

function exitCurrentGame() {
  if (app.replayMode) {
    closeReplay();
    return;
  }
  if (!app.state) {
    showStart();
    return;
  }
  const inBattle = app.state.phase === 'battle' || app.state.phase === 'draft';
  const text = inBattle ? '确定退出当前对局？退出后本局将交给 AI 托管。' : '确定退出当前房间？';
  if (!window.confirm(text)) return;
  leaveRoom();
}

function leaveRoom() {
  clearWasd(false);
  const code = app.code;
  const playerId = app.playerId;
  if (code && playerId && !app.spectator) {
    fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ code, playerId, action: { type: 'leave' } }),
    }).catch(() => {});
  }
  closeStream();
  clearSession();
  app.state = null;
  app.init = null;
  app.map = null;
  app.code = null;
  app.playerId = null;
  app.connected = false;
  app.pendingLoading = false;
  hideLoading();
  showStart();
  showToast('已离开房间', '', 1800);
}

function setLoading(title, text) {
  els.loadingTitle.textContent = title;
  els.loadingText.textContent = text;
  els.loadingAbort.classList.add('hidden');
  els.loadingScreen.classList.remove('hidden');
}

function hideLoading() {
  els.loadingScreen.classList.add('hidden');
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.width = '1px';
  ta.style.height = '1px';
  ta.style.padding = '0';
  ta.style.border = 'none';
  ta.style.outline = 'none';
  ta.style.boxShadow = 'none';
  ta.style.background = 'transparent';
  ta.style.opacity = '0.01';
  ta.style.fontSize = '16px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

async function copyRoomCode() {
  const code = String(app.code || '').trim();
  if (!code) return;
  let ok = false;
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (!ok) ok = fallbackCopyText(code);
  if (ok) {
    showToast(`房间号 ${code} 已复制`, 'gold', 1800);
  } else {
    showToast('自动复制失败，请在弹窗中手动复制', 'error', 2400);
    window.prompt('房间号（按 Ctrl/Cmd+C 复制）', code);
  }
}

/* ================================================================== */
/* 阶段 / 界面切换                                                    */
/* ================================================================== */

function applyPhaseUI(prevPhase) {
  if (!app.state) return;
  const phase = app.state.phase;
  els.app.classList.add('in-room');
  els.app.classList.remove('no-room');
  els.startScreen.classList.add('hidden');
  els.lobbyScreen.classList.add('hidden');
  els.endScreen.classList.add('hidden');
  hideLoading();

  const spectator = !!app.spectator;
  const passive = spectator || !!app.replayMode;
  els.app.classList.toggle('spectating', passive);
  els.replayBar?.classList.toggle('hidden', !app.replayMode);
  els.commandPanel?.classList.toggle('hidden', passive);
  els.spectatorBanner?.classList.toggle('hidden', !spectator || phase === 'ended');
  els.exitBtn?.classList.remove('hidden');
  els.battleUI.classList.toggle('hidden', phase !== 'battle' && phase !== 'ended');
  els.draftUI.classList.toggle('hidden', phase !== 'draft');
  els.lobbyUI.classList.toggle('hidden', phase !== 'lobby');
  if (app.mobile) {
    if (phase === 'battle' && prevPhase !== 'battle' && !app.replayMode) {
      app.mobilePanelOpen = false;
      showToast('左侧摇杆移动 · 按住「攻」连续攻击 · 右上角 ▤ 打开面板', 'gold', 3600);
    } else if (phase === 'lobby' || phase === 'draft' || phase === 'ended') {
      app.mobilePanelOpen = true;
    }
    updateMobileUI();
  }
  if (phase !== 'battle' && phase !== 'ended') {
    els.spectate.classList.add('hidden');
    closeEliminatedModal();
  }
  if (phase !== 'battle') {
    closeAltar();
    app.buildMode = null;
    app.focusMode = false;
    app.focusMark = null;
    cancelSkillAim(false);
    updateFocusButton();
  }

  if (phase === 'lobby') {
    els.lobbyScreen.classList.remove('hidden');
  } else if (phase === 'ended') {
    els.endScreen.classList.remove('hidden');
  }

  const draftMode = phase === 'draft';
  els.draftBanner.classList.toggle('hidden', !draftMode);
  els.roomPill.disabled = !app.code;
  if (app.code) els.roomPill.querySelector('b').textContent = app.code;

  if (prevPhase && prevPhase !== phase) {
    els.toasts.innerHTML = '';
    app.toastCount = 0;
    if (phase === 'battle') {
      showAnnounce('战斗开始 · 点击敌人立即攻击，收集金币建造更多魂塔', '');
    } else if (phase === 'draft') {
      hideAnnounce();
    } else if (phase === 'ended') {
      hideAnnounce();
    }
  }
}

function updateHeader() {
  if (!app.state) return;
  const phase = app.state.phase;
  const paused = phase === 'battle' && app.state.paused;
  const deathMode = phase === 'battle' && app.state.battle?.deathMode;
  const [label, cls] = deathMode
    ? ['死亡模式', 'death']
    : paused
      ? ['已暂停', 'draft']
      : PHASE_LABEL[phase] || ['—', ''];
  els.phasePill.className = `status-pill ${cls}`;
  els.phasePill.innerHTML = `<i></i><b>${label}</b>`;

  let timer = '--:--';
  if (phase === 'draft') {
    if (app.state.draft?.startAt) timer = '开战';
    else timer = `${Math.max(0, app.state.draft?.timeLeft || 0)}s`;
  } else if (phase === 'battle' && app.state.battle) {
    timer = fmtTime((app.state.battle.timeLimit || 720) - app.state.battle.time);
  } else if (phase === 'ended') {
    timer = '终局';
  } else if (phase === 'lobby') {
    timer = '等待';
  }
  els.timerPill.textContent = timer;
  const manual = isManualAttackMode();
  if (els.attackModePill) {
    els.attackModePill.className = `status-pill ${manual ? '' : 'draft'}`;
    els.attackModePill.querySelector('b').textContent = manual ? '手速' : '自动';
    els.attackModePill.title = manual
      ? '手速模式：点击敌人立即追加手动攻击'
      : '自动战斗：点击敌人只追击，伤害由自动攻击结算';
  }
  if (els.mapInputHint) {
    els.mapInputHint.innerHTML = manual
      ? '<kbd>WASD</kbd> / 左键 移动 · 右键拖动地图 · 滚轮缩放 · 点英雄选中 · 连点敌人立即攻击'
      : '<kbd>WASD</kbd> / 左键 移动 · 右键拖动地图 · 滚轮缩放 · 点英雄选中 · 自动战斗：点击敌人只追击';
  }
  els.roomPill.querySelector('b').textContent = app.code || '----';
}

function updateConnection(on) {
  els.connDot.className = `conn-dot ${on ? 'on' : app.connecting ? 'warn' : ''}`;
  els.connText.textContent = on ? '已连接' : app.connecting ? '连接中' : '离线';
}

function isHost() {
  return !!(app.state && app.state.hostId === app.playerId);
}
function isManualAttackMode() {
  if (app.replayMode) return app.replay?.data?.manualAttack !== false;
  if (app.state?.manualAttack === false) return false;
  if (app.state?.battle?.manualAttack === false) return false;
  return true;
}

function myPlayer() {
  return app.state?.players?.find((p) => p.id === app.playerId) || null;
}

function myHeroes() {
  return (app.state?.battle?.heroes || []).filter((h) => h.owner === app.playerId);
}

function myTowers() {
  return (app.state?.battle?.towers || []).filter((t) => t.owner === app.playerId);
}

function myHero() {
  const me = myPlayer();
  const heroes = myHeroes();
  if (!heroes.length) return null;
  return (
    heroes.find((h) => h.id === me?.selectedHeroId) ||
    heroes.find((h) => h.alive) ||
    heroes[0] ||
    null
  );
}

function myTower() {
  const me = myPlayer();
  const towers = myTowers();
  const hero = myHero();
  return (
    towers.find((t) => t.id === me?.selectedTowerId) ||
    (hero && towers.find((t) => t.id === hero.towerId)) ||
    towers.find((t) => t.alive) ||
    towers[0] ||
    null
  );
}

function emptyTower() {
  return myTowers().find((t) => t.alive && !t.heroId) || null;
}

function playerById(id) {
  return app.state?.players?.find((p) => p.id === id) || null;
}

function heroDef(heroId) {
  return app.catalog?.heroes?.find((h) => h.id === heroId) || null;
}

function colorOf(owner) {
  return playerById(owner)?.color || '#66e0d2';
}

/* ================================================================== */
/* 玩家列表                                                           */
/* ================================================================== */

function updatePlayerList() {
  const state = app.state;
  if (!state) return;
  const teamMode = state.teamMode === 'teams';
  const players = [...state.players].sort((a, b) => {
    if (teamMode && a.team !== b.team) return (a.team ?? 0) - (b.team ?? 0);
    return a.slot - b.slot;
  });
  const total = state.phase === 'lobby' ? state.maxPlayers : Math.max(players.length, state.maxPlayers || 4);
  els.playerCount.textContent = `${players.length} / ${total}`;

  if (!players.length) {
    els.playerList.innerHTML = '<div class="empty-state">等待玩家加入…</div>';
    return;
  }

  const battle = state.battle;
  const cards = [];
  let lastTeam = null;
  for (const p of players) {
    const allHeroes = battle ? battle.heroes.filter((x) => x.owner === p.id) : [];
    const allTowers = battle ? battle.towers.filter((x) => x.owner === p.id) : [];
    const hero =
      allHeroes.find((x) => x.id === p.selectedHeroId) ||
      allHeroes.find((x) => x.alive) ||
      allHeroes[0] ||
      null;
    const tower =
      allTowers.find((x) => x.id === p.selectedTowerId) ||
      (hero && allTowers.find((x) => x.id === hero.towerId)) ||
      allTowers.find((x) => x.alive) ||
      allTowers[0] ||
      null;
    const def = heroDef(hero?.heroId || p.heroId);
    const isMe = p.id === app.playerId;
    const isHostPlayer = state.hostId === p.id;
    const heroAlive = battle ? (p.heroesAlive || 0) > 0 : true;
    const hpPct = battle ? (hero ? clamp((hero.hp / Math.max(1, hero.maxHp)) * 100, 0, 100) : 0) : 100;
    const towerPct = battle && tower ? clamp((tower.hp / Math.max(1, tower.maxHp)) * 100, 0, 100) : 100;
    const status = playerStatus(p, hero, tower);
    const tags = [
      isMe ? '<span class="tag you">你</span>' : '',
      isHostPlayer ? '<span class="tag host">房主</span>' : '',
      state.teamMode === 'teams' && p.team != null ? `<span class="tag team">队${p.team + 1}</span>` : '',
      p.isAI ? '<span class="tag ai">AI</span>' : '',
      p.aiControlled && !p.isAI ? '<span class="tag ai">托管</span>' : '',
    ]
      .filter(Boolean)
      .join('');
    const extra = battle
      ? `<div class="pcard-meta">
           <span>金币 <b>${fmtInt(p.gold)}</b></span>
           <span>K/D <b>${p.kills}/${p.deaths}</b></span>
           <span>英雄 <b>${p.heroesAlive || 0}/${p.heroesTotal || 0}</b></span>
         </div>`
      : `<div class="pcard-meta">
           <span>${p.ready ? '已锁定' : p.placed ? '魂塔就位' : '准备中'}</span>
           <span>${p.connected ? '在线' : '掉线'}</span>
         </div>`;
    const headerHero = battle
      ? `${def?.name || '尚未召唤'}${hero ? ` · 塔 ${p.towersAlive || 0}/${p.towersTotal || 0}` : ''}`
      : '第一座魂塔';
    if (teamMode && p.team !== lastTeam) {
      lastTeam = p.team;
      const count = players.filter((x) => x.team === p.team).length;
      cards.push(`<div class="team-group-header team${p.team}" style="--tc:${TEAM_COLORS[p.team] || '#8ea6b3'}"><b>队伍 ${p.team + 1}</b><span>${count} 人 · 点击队友定位</span></div>`);
    }
    cards.push(`
      <div class="pcard ${isMe ? 'me' : ''} ${p.eliminated ? 'eliminated' : battle && (p.heroesTotal || 0) > 0 && !heroAlive ? 'dead' : ''}" data-player-id="${esc(p.id)}" style="--pc:${esc(p.color)}${teamMode && p.team != null ? `;--tc:${TEAM_COLORS[p.team] || '#8ea6b3'}` : ''}">
        <div class="pcard-top">
          <span class="pcard-name">${esc(p.name)}</span>
          <span class="pcard-tags">${tags}</span>
        </div>
        <div class="pcard-hero">
          <b>${esc(headerHero)}</b>
          ${battle ? `<span class="lv">Lv.${p.heroLevel || 0}</span>` : ''}
        </div>
        <div class="pcard-bars">
          <div class="pcard-bar hero"><i style="width:${hpPct}%"></i></div>
          <div class="pcard-bar tower"><i style="width:${towerPct}%"></i></div>
        </div>
        ${extra}
        <div class="pcard-status ${status.tone}">${esc(status.text)}</div>
      </div>
    `);
  }
  els.playerList.innerHTML = cards.join('');
}

function playerStatus(p, hero, tower) {
  if (p.eliminated) return { text: '已淘汰', tone: 'danger' };
  if (!app.state.battle) {
    if (p.ready) return { text: '已锁定 · 等待开战', tone: 'ready' };
    if (p.placed) return { text: '魂塔已放置', tone: 'ready' };
    return { text: p.connected ? '部署中' : '掉线', tone: '' };
  }
  const aliveHeroes = p.heroesAlive || 0;
  const aliveTowers = p.towersAlive || 0;
  if (aliveHeroes === 0 && (p.heroesTotal || 0) === 0) return { text: '等待召唤英雄', tone: '' };
  if (aliveHeroes === 0) {
    if (aliveTowers > 0) return { text: '英雄全部阵亡 · 等待重生', tone: 'danger' };
    return { text: '无法重生', tone: 'danger' };
  }
  if (aliveTowers === 0) return { text: '魂塔全毁 · 背水一战', tone: 'danger' };
  if (p.selectedHeroId && hero && !hero.alive) return { text: '当前英雄阵亡 · 可换人', tone: 'danger' };
  if (p.aiControlled && !p.isAI) return { text: 'AI 托管中', tone: '' };
  return { text: `作战中 · ${aliveTowers} 塔`, tone: 'ready' };
}

/* ================================================================== */
/* 右侧面板                                                           */
/* ================================================================== */

function updateCommandPanel() {
  if (!app.state) return;
  const phase = app.state.phase;
  const spectator = !!app.spectator;
  const passive = spectator || !!app.replayMode;
  els.app.classList.toggle('spectating', passive);
  els.replayBar?.classList.toggle('hidden', !app.replayMode);
  els.commandPanel?.classList.toggle('hidden', passive);
  els.spectatorBanner?.classList.toggle('hidden', !spectator || phase === 'ended');
  els.exitBtn?.classList.remove('hidden');
  els.battleUI.classList.toggle('hidden', phase !== 'battle' && phase !== 'ended');
  els.draftUI.classList.toggle('hidden', phase !== 'draft');
  els.lobbyUI.classList.toggle('hidden', phase !== 'lobby');
  if (phase === 'battle' || phase === 'ended') updateBattleUI();
}

function updateBattleUI() {
  const state = app.state;
  const battle = state.battle;
  const me = myPlayer();
  if (!battle || !me) return;
  const heroes = myHeroes();
  const towers = myTowers();
  const hero = myHero();
  const tower = myTower();
  const empty = emptyTower();
  const def = heroDef(hero?.heroId);
  const gold = me.gold || 0;

  els.goldValue.textContent = fmtInt(gold);
  const income = heroes.reduce((sum, h) => sum + (h.alive ? h.income || 0 : 0), 0) +
    towers.reduce((sum, t) => sum + (t.alive ? t.income || 0 : 0), 0);
  els.incomeValue.textContent = `+${income.toFixed(1)} / 秒`;
  els.bountyValue.textContent = `累计 ${fmtInt(me.totalEarned || 0)}`;

  renderHeroRoster(me);
  if (els.myColorDot) {
    els.myColorDot.style.background = me.color;
    els.myColorDot.style.color = me.color;
  }
  els.buildTowerBtn.disabled = me.eliminated || battle.over || state.paused || !!battle.deathMode;
  els.buildTowerBtn.title = battle.deathMode
    ? '死亡模式：无法新建魂塔'
    : `下一座魂塔建造费 ${fmtInt(me.buildBaseCost || 0)} + 英雄价格`;

  // 初始英雄召唤入口
  const canSummonInitial = !!empty && !me.eliminated && !battle.over && !state.paused;
  els.btnOpenAltar.classList.toggle('hidden', !canSummonInitial);
  els.btnOpenAltar.querySelector('span').textContent = '召唤初始英雄';
  els.btnOpenAltar.querySelector('em').textContent = '祭坛';

  if (hero) {
    const heroName = `${hero.name} · ${def?.title || ''}`;
    els.heroName.textContent = heroName;
    els.heroLevel.textContent = `Lv.${hero.level || 1}`;
    const hpPct = clamp((hero.hp / Math.max(1, hero.maxHp)) * 100, 0, 100);
    els.heroHpFill.style.width = `${hpPct}%`;
    els.heroHpText.textContent = `${fmtInt(hero.hp)} / ${fmtInt(hero.maxHp)}`;
    els.heroDmg.textContent = Math.round(hero.damage || 0);
    els.heroArmor.textContent = hero.armor || 0;
    let stateText = '存活';
    if (me.eliminated) stateText = '已淘汰';
    else if (!hero.alive) stateText = tower?.alive ? `重生 ${hero.respawnIn}s` : '无法重生';
    else if (hero.enraged) stateText = '背水一战';
    else if (hero.shield > 0) stateText = `护盾 ${hero.shield}`;
    else if (hero.rooted) stateText = '定身';
    else if (hero.slowed) stateText = '减速中';
    else if (hero.kite) stateText = '保持距离';
    else if (def?.skill?.id === 'mirage') {
      const active = (battle.summons || []).filter(
        (s) => s.alive && s.owner === me.id && s.sourceHeroId === hero.id && s.summonType === 'clone'
      ).length;
      stateText = `镜像 ${active}/${def.skill.maxClones || 1}`;
    } else if (def?.skill?.id === 'spirit') {
      const active = (battle.summons || []).filter(
        (s) => s.alive && s.owner === me.id && s.summonType === 'minion'
      ).length;
      stateText = `灵仆 ${active}/${def.skill.maxMinions || 12}`;
    }
    els.heroState.textContent = stateText;
    els.heroState.style.color = stateText.includes('重') || stateText.includes('淘汰') ? 'var(--red)' : '';
  } else {
    els.heroName.textContent = '尚未召唤英雄';
    els.heroLevel.textContent = '—';
    els.heroHpFill.style.width = '0%';
    els.heroHpText.textContent = '0 / 0';
    els.heroDmg.textContent = '—';
    els.heroArmor.textContent = '—';
    els.heroState.textContent = empty ? '祭坛可召唤' : '等待魂塔';
    els.heroState.style.color = 'var(--gold)';
  }

  const heroCost = me.costs?.heroUpgrade;
  if (!hero) {
    els.heroUpgradeCost.textContent = '先召唤';
    els.btnHeroUpgrade.disabled = true;
  } else if (heroCost == null) {
    els.heroUpgradeCost.textContent = '满级';
    els.btnHeroUpgrade.disabled = true;
    els.btnHeroUpgrade.classList.remove('unaffordable');
  } else {
    els.heroUpgradeCost.textContent = fmtInt(heroCost);
    els.btnHeroUpgrade.disabled = me.eliminated || !hero.alive || gold < heroCost || battle.over || state.paused;
    els.btnHeroUpgrade.classList.toggle('unaffordable', gold < heroCost);
  }

  els.towerName.textContent = tower
    ? tower.alive
      ? `魂塔 · ${towers.filter((t) => t.alive).length}/${towers.length}`
      : '魂塔（已毁）'
    : '尚未建造';
  els.towerLevel.textContent = tower ? `Lv.${tower.level}` : '—';
  const towerPct = tower ? clamp((tower.hp / Math.max(1, tower.maxHp)) * 100, 0, 100) : 0;
  els.towerHpFill.style.width = `${towerPct}%`;
  els.towerHpText.textContent = tower ? `${fmtInt(tower.hp)} / ${fmtInt(tower.maxHp)}` : '0 / 0';
  els.towerArmor.textContent = tower ? tower.armor : '—';
  els.towerIncome.textContent = tower?.alive ? `+${(tower.income || 0).toFixed(1)}/s` : '—';
  const itemTotal = tower ? tower.cannonCount + tower.wallCount + tower.mintCount : 0;
  els.towerItemCount.textContent = `装备 ${itemTotal}`;
  renderTowerItemChips(tower);

  const towerCost = me.costs?.towerUpgrade;
  if (towerCost == null) {
    els.towerUpgradeCost.textContent = tower?.alive ? '满级' : '不可用';
    els.btnTowerUpgrade.disabled = true;
  } else {
    els.towerUpgradeCost.textContent = fmtInt(towerCost);
    els.btnTowerUpgrade.disabled = me.eliminated || !tower?.alive || gold < towerCost || battle.over || state.paused;
    els.btnTowerUpgrade.classList.toggle('unaffordable', gold < towerCost);
  }

  const repairCd = me.costs?.repairCd || 0;
  const repairFull = tower && tower.hp >= tower.maxHp - 1;
  els.repairCost.textContent = repairCd > 0 ? `${repairCd}s` : fmtInt(me.costs?.repair ?? 90);
  els.btnRepair.disabled = me.eliminated || !tower?.alive || repairFull || repairCd > 0 || gold < (me.costs?.repair ?? 90) || battle.over || state.paused;
  els.btnRepair.classList.toggle('unaffordable', gold < (me.costs?.repair ?? 90));

  updateEquipCard('cannon', tower, me, gold, tower?.cannonCount || 0);
  updateEquipCard('wall', tower, me, gold, tower?.wallCount || 0);
  updateEquipCard('mint', tower, me, gold, tower?.mintCount || 0);

  if (hero && def) {
    els.skillName.textContent = def.skill.name;
    els.skillDesc.textContent = `${def.skill.desc.slice(0, 22)}${def.skill.desc.length > 22 ? '…' : ''}`;
    els.skillButton.title = def.skill.desc;
    els.skillCost.textContent = def.skill.cost;
    const cd = hero.skillCd || 0;
    const maxCd = hero.skillMaxCd || def.skill.cooldown;
    els.skillCd.style.width = `${clamp((cd / Math.max(0.01, maxCd)) * 100, 0, 100)}%`;
    const canUse = hero.alive && !me.eliminated && !battle.over && !state.paused && cd <= 0 && gold >= def.skill.cost;
    els.skillButton.disabled = !canUse;
    els.skillButton.classList.toggle('unaffordable', gold < def.skill.cost);
  } else {
    els.skillName.textContent = '英雄祭坛';
    els.skillDesc.textContent = '召唤英雄后解锁专属技能';
    els.skillButton.title = '';
    els.skillCost.textContent = '—';
    els.skillCd.style.width = '0%';
    els.skillButton.disabled = true;
    els.skillButton.classList.remove('unaffordable');
  }

  els.aiHint.classList.toggle('hidden', !(me.aiControlled && !me.isAI));
  updateEliminationUI();
  const anyHeroAlive = heroes.some((h) => h.alive);
  if (!anyHeroAlive) app.focusMode = false;
  if (app.skillAim && (!hero || !hero.alive || me.eliminated || battle.over || state.paused || app.skillAim.heroId !== hero.id)) {
    cancelSkillAim(false);
  }
  els.focusButton.disabled = !anyHeroAlive || me.eliminated || battle.over || state.paused;
  updateFocusButton();
  updateKiteButton();
  updateAutoSelectButton();
  updatePauseUI();
  updateMobileUI();
}

function renderHeroRoster(me) {
  const heroes = myHeroes();
  if (!heroes.length) {
    els.heroRoster.innerHTML = `<div class="roster-empty">尚未召唤英雄<br>从祭坛选择第一位英雄</div>`;
    return;
  }
  const selectedId = me.selectedHeroId;
  els.heroRoster.innerHTML = heroes
    .map((h) => {
      const def = heroDef(h.heroId);
      if (!def) return '';
      const selected = h.id === selectedId;
      const hp = clamp((h.hp / Math.max(1, h.maxHp)) * 100, 0, 100);
      return `
        <button class="roster-card ${selected ? 'selected' : ''} ${h.alive ? '' : 'dead'}"
          data-hero-select="${esc(h.id)}" style="--rc:${esc(def.color)}"
          title="${esc(h.name)} · Lv.${h.level}${h.alive ? '' : ' · 阵亡'}">
          <span class="r-level">Lv${h.level}</span>
          <span class="r-icon">${esc(def.icon)}</span>
          <span class="r-name">${esc(h.name)}</span>
          <span class="r-hp"><i style="width:${hp}%"></i></span>
        </button>
      `;
    })
    .join('');
}

function openAltar(mode) {
  const me = myPlayer();
  if (!me) return;
  if (app.state?.paused) {
    showToast('战斗已暂停，按 P 继续', '', 1200);
    return;
  }
  const empty = emptyTower();
  let nextMode = mode || (empty ? 'summon' : 'build');
  if (nextMode === 'summon' && !empty) nextMode = 'build';
  app.altarMode = nextMode;
  app.buildMode = null;
  els.altarModal.classList.remove('hidden');
  renderAltar();
}

function closeAltar() {
  els.altarModal.classList.add('hidden');
  app.altarMode = null;
}

async function chooseAltarHero(heroId) {
  const state = app.state;
  const me = myPlayer();
  if (!me || !state?.battle || me.eliminated) return;
  const def = heroDef(heroId);
  if (!def) return;
  const mode = app.altarMode || (emptyTower() ? 'summon' : 'build');
  if (mode === 'build') {
    const cost = (me.buildBaseCost || 0) + def.price;
    if (me.gold < cost) {
      showToast(`金币不足，需要 ${cost}`, 'error');
      return;
    }
    closeAltar();
    app.buildMode = { heroId, name: def.name, cost };
    showAnnounce(`点击地图放置${def.name}的魂塔 · 消耗 ${cost} 金币`, '');
    return;
  }
  const result = await sendAction({ type: 'summon', heroId });
  if (result.ok) closeAltar();
}

function renderAltar() {
  const state = app.state;
  const me = myPlayer();
  const battle = state?.battle;
  if (!me || !battle) return;
  const mode = app.altarMode || (emptyTower() ? 'summon' : 'build');
  const isBuild = mode === 'build';
  const empty = emptyTower();
  const heroes = app.catalog?.heroes || [];
  const ownedCount = (id) => (me.ownedHeroIds || []).filter((hid) => hid === id).length;
  const currentHero = myHero();
  const disabledAll = me.eliminated || battle.over;

  els.altarTitle.textContent = isBuild ? '建造新魂塔' : '召唤初始英雄';
  els.altarSub.textContent = isBuild
    ? `选择英雄后，点击地图任意可建造处放置魂塔。建造基础费 ${fmtInt(me.buildBaseCost || 0)} 金币 + 英雄价格。`
    : '选择一位英雄，与你的初始魂塔绑定。英雄价格从金币中扣除。';
  els.altarFoot.textContent = isBuild
    ? '可以重复召唤同一英雄；魂塔被摧毁后仍可继续建造新塔。'
    : '召唤后英雄会出现在魂塔旁；战斗中可点击地图上的英雄或头像切换操作对象。';

  els.altarGrid.innerHTML = heroes
    .map((h) => {
      const have = ownedCount(h.id);
      const isCurrent = currentHero?.heroId === h.id;
      const cost = isBuild ? (me.buildBaseCost || 0) + h.price : h.price;
      let why = '';
      if (disabledAll) why = '战斗已结束';
      else if (!isBuild && !empty) why = '没有空置魂塔';
      else if (me.gold < cost) why = '金币不足';
      const disabled = !!why;
      return `
        <button class="altar-card ${isCurrent ? 'current' : ''}" data-altar-hero="${esc(h.id)}"
          style="--hc:${esc(h.color)}" ${disabled ? 'disabled' : ''}>
          <span class="a-icon">${esc(h.icon)}</span>
          <span class="a-body">
            <span class="a-top"><b>${esc(h.name)}</b><span>${esc(h.role)}</span><span class="a-price">${cost}${have > 0 ? ` · 已有${have}` : ''}</span></span>
            <span class="a-stats">HP ${h.hp} · 攻击 ${h.damage} · 护甲 ${h.armor}</span>
            <span class="a-skill"><b>${esc(h.skill.name)}</b> · ${h.skill.cost} 金币 / ${h.skill.cooldown}s</span>
            ${why ? `<span class="a-why">${esc(why)}</span>` : ''}
          </span>
        </button>
      `;
    })
    .join('');

  // 点击由 altarGrid 的事件委托处理，避免状态刷新时丢失点击。

  const towerCount = me.towersTotal || 0;
  els.altarStatus.innerHTML = isBuild
    ? `当前魂塔 <b>${towerCount}</b> · 持有金币 <b>${fmtInt(me.gold)}</b> · 下一座基础建造费 <b>${fmtInt(me.buildBaseCost || 0)}</b>`
    : `持有金币 <b>${fmtInt(me.gold)}</b> · 可重复召唤同一英雄`;
}

function updateEliminationUI() {
  const state = app.state;
  const me = myPlayer();
  if (!state || state.phase !== 'battle' || !state.battle || !me) {
    els.spectate.classList.add('hidden');
    closeEliminatedModal();
    return;
  }
  const eliminated = me.eliminated && !state.battle.over;
  els.spectate.classList.toggle('hidden', !eliminated);
  if (!eliminated) {
    closeEliminatedModal();
    return;
  }
  if (app.eliminatedPromptedBattle !== state.battle.startedAt) {
    app.eliminatedPromptedBattle = state.battle.startedAt;
    els.eliminatedModal.classList.remove('hidden');
  }
}

function closeEliminatedModal() {
  els.eliminatedModal.classList.add('hidden');
}

function renderTowerItemChips(tower) {
  if (!tower) {
    els.towerItems.innerHTML = '';
    return;
  }
  let chips = '';
  if (tower.cannonCount) chips += `<span title="加农炮 ×${tower.cannonCount}">炮</span>`.repeat(tower.cannonCount);
  if (tower.wallCount) chips += `<span title="护壁 ×${tower.wallCount}">壁</span>`.repeat(tower.wallCount);
  if (tower.mintCount) chips += `<span title="聚金器 ×${tower.mintCount}">金</span>`.repeat(tower.mintCount);
  if (!chips) chips = '<span class="empty" title="暂无装备">·</span><span class="empty">·</span><span class="empty">·</span>';
  els.towerItems.innerHTML = chips;
}

function updateEquipCard(item, tower, me, gold, owned) {
  const cost = me.costs?.[item];
  const btn = els.equipGrid.querySelector(`[data-item="${item}"]`);
  const max = 2;
  const ownEl = els[`own${item[0].toUpperCase()}${item.slice(1)}`];
  const costEl = els[`cost${item[0].toUpperCase()}${item.slice(1)}`];
  if (ownEl) ownEl.textContent = `${owned} / ${max}`;
  if (costEl) costEl.textContent = cost == null ? '已满' : fmtInt(cost);
  if (btn) {
    btn.disabled = me.eliminated || !tower?.alive || cost == null || gold < cost || app.state?.paused;
    btn.classList.toggle('unaffordable', cost != null && gold < cost);
  }
}

/* ================================================================== */
/* 大厅                                                               */
/* ================================================================== */

function updateLobbyUI() {
  const state = app.state;
  if (!state || state.phase !== 'lobby') return;
  els.lobbyCode.textContent = app.code || '----';
  const host = state.hostId === app.playerId;
  const sorted = [...state.players].sort((a, b) => a.slot - b.slot);
  const sig = `${state.maxPlayers}|${state.mapSize}|${state.teamMode}|${state.manualAttack !== false}|${sorted.map((p) => `${p.id}:${p.name}:${p.connected}:${p.team}`).join(',')}|${state.hostId}`;
  if (sig !== app.lobbySig) {
    app.lobbySig = sig;
    const slots = [];
    for (let i = 0; i < state.maxPlayers; i++) {
      const p = sorted.find((x) => x.slot === i);
      if (p) {
        const tags = [];
        if (p.id === state.hostId) tags.push('房主');
        if (p.id === app.playerId) tags.push('你');
        if (state.teamMode === 'teams' && p.team != null) tags.push(`队伍 ${p.team + 1}`);
        if (!p.connected) tags.push('掉线');
        slots.push(`
          <div class="lobby-slot" style="--sc:${esc(p.color)}">
            <span class="slot-color"></span>
            <span class="slot-body">
              <b>${esc(p.name)}</b>
              <span>${esc(tags.join(' · ') || '已就位')}</span>
            </span>
            <span class="slot-tag">${i === 0 ? '一号位' : `${i + 1} 号位`}</span>
          </div>
        `);
      } else {
        slots.push(`<div class="lobby-slot empty">空位 · 开战时由 AI 补足</div>`);
      }
    }
    els.lobbySlots.innerHTML = slots.join('');
  }

  for (const btn of $$('#slot-choice button')) {
    btn.classList.toggle('active', Number(btn.dataset.slots) === state.maxPlayers);
    btn.disabled = !host;
  }
  for (const btn of $$('#lobby-ai-level button')) {
    btn.classList.toggle('active', btn.dataset.aiLevel === (state.aiLevel || 'normal'));
    btn.disabled = !host;
  }
  for (const btn of $$('#lobby-attack-mode button')) {
    btn.classList.toggle('active', (btn.dataset.attackMode === 'auto') === (state.manualAttack === false));
    btn.disabled = !host;
  }
  for (const btn of $$('#lobby-map-size button')) {
    btn.classList.toggle('active', btn.dataset.mapSize === (state.mapSize || 'standard'));
    btn.disabled = !host;
  }
  for (const btn of $$('#lobby-team-mode button')) {
    btn.classList.toggle('active', btn.dataset.teamMode === (state.teamMode || 'ffa'));
    btn.disabled = !host;
  }
  els.startGameBtn.disabled = !host;
  const emptySlots = state.maxPlayers - state.players.length;
  els.startGameBtn.innerHTML = host
    ? `开始战斗 <small>${emptySlots > 0 ? `空位由 ${emptySlots} 名 AI 补足` : '全员已就位'}</small>`
    : `等待房主开始 <small>${state.players.length}/${state.maxPlayers} 人已就位</small>`;
  els.startGameBtn.classList.toggle('secondary', !host);
  const levelName = { easy: '休闲', normal: '标准', hard: '困难', nightmare: '噩梦' }[state.aiLevel || 'normal'] || '标准';
  const mapName = state.mapSize === 'xlarge' ? '超大图 128×96' : state.mapSize === 'large' ? '大地图 96×72' : '标准图 40×30';
  const modeName = state.teamMode === 'teams' ? `团队 ${Math.max(1, Math.floor(state.maxPlayers / 2))}v${Math.max(1, Math.floor(state.maxPlayers / 2))}` : '自由混战';
  const attackName = state.manualAttack === false ? '自动战斗' : '手速模式';
  els.lobbyNote.textContent = host
    ? `${mapName} · ${modeName} · ${attackName} · AI 难度：${levelName}。把房间号发给朋友，或者直接开始让 AI 加入战局。`
    : `房主开始后，所有玩家进入魂塔部署阶段。${mapName} · ${modeName} · ${attackName} · AI 难度：${levelName}。`;
  els.lobbySideSlots.textContent = `${state.players.length} / ${state.maxPlayers}`;
  if (els.lobbySideMode) els.lobbySideMode.textContent = `${modeName} · ${attackName}`;
  els.lobbySideText.textContent = host ? '你可以调整人数、地图和模式，空位会自动由 AI 补足。' : '等待房主调整设置并开始战斗。';
}

/* ================================================================== */
/* 选将                                                               */
/* ================================================================== */

function updateDraftUI() {
  const state = app.state;
  if (!state || state.phase !== 'draft') return;
  const me = myPlayer();
  if (!me) return;
  const sig = `${me.ready}|${me.placed}`;
  if (sig !== app.draftSig) {
    app.draftSig = sig;
    renderDraftSummary(me);
  } else {
    renderDraftSummary(me);
  }
  const startIn = state.draft?.startIn || 0;
  const timeLeft = state.draft?.timeLeft || 0;
  els.draftCountdown.textContent = startIn > 0 ? `${startIn}s 后开战` : `${timeLeft}s`;
  els.lockBtn.disabled = !!(me.ready || !me.placed);
  els.lockBtn.textContent = me.ready ? '已锁定 · 等待开战' : '锁定部署';
  els.unlockBtn.classList.toggle('hidden', !me.ready);

  const readyCount = state.players.filter((p) => p.ready).length;
  els.draftBannerText.textContent =
    startIn > 0
      ? `全员就绪 · ${startIn} 秒后进入战斗`
      : `${readyCount}/${state.players.length} 已锁定 · 地图任意可建造处均可放置魂塔`;
}

function renderDraftSummary(me) {
  let text = '';
  if (!me.placement) {
    text = '尚未放置魂塔。<br>点击地图任意可建造地块即可建塔，不再有领地限制。';
  } else if (!me.ready) {
    text = `魂塔坐标 (${me.placement.x}, ${me.placement.y})<br>可重新点击地图调整位置，确认后锁定部署。`;
  } else {
    text = `已锁定魂塔 (${me.placement.x}, ${me.placement.y})<br>等待其他玩家准备后自动开战。`;
  }
  els.draftSummary.innerHTML = text;
}

/* ================================================================== */
/* 结算                                                               */
/* ================================================================== */

function updateEndUI() {
  const state = app.state;
  if (!state || state.phase !== 'ended' || !state.result) return;
  const result = state.result;
  const sig = `${result.winnerId}|${result.winnerTeam}|${result.teamMode}|${result.reason}|${result.replayId || ''}|${result.ranking?.map((r) => `${r.id}:${r.kills}:${r.eliminated}:${r.team}`).join(',')}`;
  if (sig === app.endSig) {
    els.rematchBtn.classList.toggle('hidden', !isHost());
    els.endReplayBtn.classList.toggle('hidden', !result.replayId);
    return;
  }
  app.endSig = sig;
  const me = myPlayer();
  const mine = result.teamMode
    ? result.winnerTeam != null && me?.team === result.winnerTeam
    : result.winnerId === app.playerId;
  els.endTitle.textContent = mine
    ? result.teamMode
      ? '你的队伍赢得了四境'
      : '你赢得了四境'
    : result.winnerName
      ? `${result.winnerName} 获胜`
      : '平局';
  els.endTitle.style.color = mine ? 'var(--gold)' : '';
  els.endWinner.innerHTML = `
    <div class="end-crown">${mine ? '冠' : '塔'}</div>
    <div>
      <b>${esc(result.winnerName || '无人幸存')}</b>
      <span>${result.reason === 'time-limit' ? `${Math.round((result.timeLimit || 720) / 60)} 分钟战绩结算` : '最后幸存的魂塔与英雄'} · 战斗时长 ${fmtTime(result.time)}</span>
    </div>
  `;
  els.endRanking.innerHTML = (result.ranking || [])
    .map(
      (r) => `
      <div class="rank-row ${result.teamMode ? (r.team === result.winnerTeam ? 'winner' : '') : (r.id === result.winnerId ? 'winner' : '')}">
        <span class="rk">#${r.rank}</span>
        <span class="rname" style="color:${esc(r.color)}">${esc(r.name)}${r.id === app.playerId ? ' · 你' : ''}${result.teamMode && r.team != null ? ` · 队${r.team + 1}` : ''}</span>
        <span class="rstat">${r.kills} 击杀</span>
        <span class="rstat">${r.eliminated ? '淘汰' : r.towerAlive ? '塔在' : '无塔'}</span>
      </div>
    `
    )
    .join('');
  els.rematchBtn.classList.toggle('hidden', !isHost());
  els.endReplayBtn.classList.toggle('hidden', !result.replayId);
  els.endNote.textContent = isHost() ? '你可以重开一局，其他玩家会回到大厅。' : '等待房主重开一局。';
  if (result.teamMode) {
    els.endNote.textContent = isHost()
      ? '团队模式结算。你可以重开一局，其他玩家会回到大厅。'
      : '团队模式结算。等待房主重开一局。';
  }
}

/* ================================================================== */
/* 提示 / 公告                                                        */
/* ================================================================== */

function showToast(text, tone = '', timeout = 2600) {
  if (!text) return;
  if (app.toastCount > 4) {
    els.toasts.firstElementChild?.remove();
    app.toastCount--;
  }
  const div = document.createElement('div');
  div.className = `toast ${tone}`;
  div.textContent = text;
  els.toasts.appendChild(div);
  app.toastCount++;
  setTimeout(() => {
    if (!div.isConnected) return;
    div.classList.add('fade');
    setTimeout(() => {
      if (div.isConnected) div.remove();
      app.toastCount = Math.max(0, app.toastCount - 1);
    }, 300);
  }, timeout);
}

function showAnnounce(text, tone = '') {
  if (!text) return;
  els.announce.textContent = text;
  els.announce.className = `announce ${tone}`;
  clearTimeout(app.announceTimer);
  app.announceTimer = setTimeout(() => {
    els.announce.classList.add('hidden');
  }, 3600);
}

function hideAnnounce() {
  clearTimeout(app.announceTimer);
  els.announce.classList.add('hidden');
}

/* ================================================================== */
/* 事件 -> 视觉特效                                                   */
/* ================================================================== */

function processEvents(events) {
  for (const ev of events) {
    if (!ev || typeof ev.id !== 'number') continue;
    if (ev.id <= app.seenEventId) continue;
    app.seenEventId = ev.id;
    handleEvent(ev);
  }
}

function screenPos(x, y) {
  return { x: app.view.ox + x * app.view.scale, y: app.view.oy + y * app.view.scale };
}

function handleEvent(ev) {
  switch (ev.type) {
    case 'deathMode': {
      showAnnounce(ev.text || '死亡模式：所有魂塔崩塌，无法再新建魂塔！', 'danger');
      showToast(ev.text || '死亡模式：所有魂塔崩塌，无法再新建魂塔！', 'danger', 4200);
      app.shake = Math.max(app.shake, 24);
      break;
    }
    case 'announce': {
      showAnnounce(ev.text, ev.tone === 'danger' ? 'danger' : ev.tone === 'start' ? '' : '');
      if (ev.tone === 'danger') showToast(ev.text, 'danger', 3000);
      break;
    }
    case 'attack': {
      const a = screenPos(ev.fromX, ev.fromY);
      const b = screenPos(ev.toX, ev.toY);
      addEffect({ type: 'tracer', x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: ev.color || '#fff', life: ev.ranged ? 0.18 : 0.12 });
      if (ev.manual) {
        addEffect({ type: 'ring', x: b.x, y: b.y, radius: 13, color: '#fff5c9', life: 0.2, width: 1.5 });
      }
      break;
    }
    case 'hit': {
      const p = screenPos(ev.x, ev.y);
      addEffect({
        type: 'text',
        x: p.x + (Math.random() - 0.5) * 14,
        y: p.y - 12,
        text: `-${Math.round(ev.amount)}`,
        color: ev.kind === 'skill' ? '#ffcf6b' : '#eaf7ff',
        size: ev.kind === 'skill' ? 14 : 11,
        vy: -24,
        life: 0.8,
      });
      break;
    }
    case 'shieldHit': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'text', x: p.x, y: p.y - 14, text: `盾 -${Math.round(ev.amount)}`, color: '#6be7ff', size: 10, vy: -20, life: 0.7 });
      break;
    }
    case 'gold': {
      const p = screenPos(ev.x, ev.y);
      addEffect({
        type: 'text',
        x: p.x,
        y: p.y - 18,
        text: ev.label || `+${ev.amount}`,
        color: '#ffcf6b',
        size: ev.big ? 14 : 11,
        vy: -26,
        life: ev.big ? 1.2 : 0.9,
      });
      break;
    }
    case 'skill': {
      const p = screenPos(ev.x, ev.y);
      if (ev.skill === 'shade' && ev.fromX != null) {
        const a = screenPos(ev.fromX, ev.fromY);
        addEffect({ type: 'dash', x1: a.x, y1: a.y, x2: p.x, y2: p.y, color: ev.color, life: 0.3 });
      }
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: ev.radius * app.view.scale, color: ev.color || '#ffcf6b', life: 0.55, width: 3 });
      if (ev.skill === 'bulwark') {
        addEffect({ type: 'shield', x: p.x, y: p.y, radius: 20, color: ev.color || '#ffd166', life: 0.65 });
      }
      if (ev.skill === 'mirage') {
        addEffect({ type: 'ring', x: p.x, y: p.y, radius: 34, color: '#f9a8d4', life: 0.7, width: 2 });
        if (ev.owner === app.playerId) showToast('镜影分身出现 · 移动/攻击会同步给镜像', 'gold', 2000);
      }
      if (ev.skill === 'spirit') {
        addEffect({ type: 'ring', x: p.x, y: p.y, radius: 46, color: '#5eead4', life: 0.7, width: 2 });
        if (ev.owner === app.playerId) showToast(`灵仆降临 · ${ev.count || 6} 只`, 'gold', 1800);
      }
      if (ev.skill === 'falcon' && ev.fromX != null) {
        const a = screenPos(ev.fromX, ev.fromY);
        addEffect({ type: 'dash', x1: a.x, y1: a.y, x2: p.x, y2: p.y, color: ev.color || '#60a5fa', life: 0.35 });
      }
      if (ev.skill === 'thorn') {
        addEffect({ type: 'ring', x: p.x, y: p.y, radius: ev.radius * app.view.scale, color: '#84cc16', life: 0.6, width: 2 });
      }
      if (ev.skill === 'volt' && Array.isArray(ev.points)) {
        for (let i = 1; i < ev.points.length; i++) {
          const a = screenPos(ev.points[i - 1].x, ev.points[i - 1].y);
          const b = screenPos(ev.points[i].x, ev.points[i].y);
          addEffect({ type: 'dash', x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: ev.color || '#fbbf24', life: 0.3 });
        }
      }
      break;
    }
    case 'skillCast': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 10, color: HERO_COLOR_FALLBACK, life: 0.3, width: 1 });
      break;
    }
    case 'death': {
      const p = screenPos(ev.x, ev.y);
      burst(p.x, p.y, '#ff8b82', 16, 90, 0.8);
      addEffect({ type: 'text', x: p.x, y: p.y - 26, text: '英雄陨落', color: '#ffb5b0', size: 13, vy: -18, life: 1.2 });
      break;
    }
    case 'towerDown': {
      const p = screenPos(ev.x, ev.y);
      burst(p.x, p.y, ev.color || '#ffcf6b', 42, 150, 1.2);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 70, color: '#ff8b5c', life: 0.8, width: 4 });
      addEffect({ type: 'text', x: p.x, y: p.y - 40, text: '魂塔摧毁', color: '#ffb28e', size: 16, vy: -16, life: 1.6 });
      app.shake = Math.max(app.shake, 16);
      break;
    }
    case 'slow': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 22, color: '#9eeaff', life: 0.5, width: 2 });
      break;
    }
    case 'upgrade': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: ev.kind === 'tower' ? 34 : 24, color: '#ffcf6b', life: 0.6, width: 2 });
      break;
    }
    case 'equip': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'text', x: p.x, y: p.y - 38, text: '装备已安装', color: '#ffcf6b', size: 10, vy: -16, life: 0.8 });
      break;
    }
    case 'repair': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'text', x: p.x, y: p.y - 34, text: '修复 +', color: '#9ef0c9', size: 11, vy: -18, life: 0.8 });
      break;
    }
    case 'respawn': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 34, color: '#7ee787', life: 0.8, width: 2 });
      break;
    }
    case 'focus': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 34, color: '#ff6b61', life: 0.8, width: 3 });
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 18, color: '#ffd166', life: 0.55, width: 1.5 });
      app.focusMark = {
        kind: ev.kind,
        targetId: ev.targetId,
        until: performance.now() + 3600,
      };
      if (ev.owner === app.playerId) {
        showToast(`集火目标锁定 · ${ev.count || 1} 位英雄`, 'danger', 1800);
      }
      break;
    }
    case 'heal': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 22, color: ev.color || '#a78bfa', life: 0.5, width: 1.5 });
      if (ev.amount > 0) {
        addEffect({ type: 'text', x: p.x, y: p.y - 18, text: `+${ev.amount}`, color: '#9ef0c9', size: 10, vy: -18, life: 0.8 });
      }
      break;
    }
    case 'root': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 24, color: '#84cc16', life: 0.7, width: 2 });
      addEffect({ type: 'text', x: p.x, y: p.y - 28, text: '定身', color: '#d9f99d', size: 10, vy: -14, life: 0.9 });
      break;
    }
    case 'summonSpawn': {
      const p = screenPos(ev.x, ev.y);
      addEffect({
        type: 'ring',
        x: p.x,
        y: p.y,
        radius: ev.summonType === 'clone' ? 24 : 10,
        color: ev.color || '#66e0d2',
        life: 0.45,
        width: ev.summonType === 'clone' ? 2 : 1,
      });
      break;
    }
    case 'summonExpire': {
      const p = screenPos(ev.x, ev.y);
      addEffect({
        type: 'ring',
        x: p.x,
        y: p.y,
        radius: ev.summonType === 'clone' ? 20 : 7,
        color: ev.color || '#66e0d2',
        life: 0.35,
        width: 1,
      });
      break;
    }
    case 'summonDeath': {
      const p = screenPos(ev.x, ev.y);
      burst(p.x, p.y, ev.color || '#66e0d2', ev.summonType === 'clone' ? 10 : 5, 55, 0.5);
      break;
    }
    case 'summon': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 44, color: ev.color || '#66e0d2', life: 0.9, width: 2.5 });
      addEffect({ type: 'text', x: p.x, y: p.y - 34, text: `${ev.name || '英雄'}降临`, color: ev.color || '#66e0d2', size: 11, vy: -18, life: 1 });
      if (ev.owner === app.playerId) showToast(`${ev.name} 已加入队伍`, 'gold', 1600);
      break;
    }
    case 'buildTower': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 48, color: ev.color || '#ffcf6b', life: 0.75, width: 3 });
      burst(p.x, p.y, ev.color || '#ffcf6b', 18, 90, 0.8);
      if (ev.owner === app.playerId) showToast(`魂塔建成 · ${ev.cost} 金币`, 'gold', 1800);
      break;
    }
    case 'despawn': {
      const p = screenPos(ev.x, ev.y);
      burst(p.x, p.y, '#b7a5ff', 14, 70, 0.6);
      break;
    }
    case 'spawn': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 50, color: ev.color || '#66e0d2', life: 0.9, width: 2 });
      break;
    }
    case 'resourceSpawn': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 20, color: '#ffcf6b', life: 0.6, width: 1.5 });
      break;
    }
    case 'resourcePickup': {
      const p = screenPos(ev.x, ev.y);
      addEffect({ type: 'ring', x: p.x, y: p.y, radius: 26, color: '#ffcf6b', life: 0.45, width: 2 });
      break;
    }
    case 'eliminated': {
      break;
    }
    case 'end': {
      break;
    }
    default:
      break;
  }
}

const HERO_COLOR_FALLBACK = '#66e0d2';

function addEffect(fx) {
  if (app.effects.length > 260) app.effects.shift();
  app.effects.push({ t: 0, ...fx });
}

function burst(x, y, color, count, speed, life) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.25 + Math.random() * 0.9);
    addEffect({
      type: 'particle',
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v - 20,
      color,
      size: 1.5 + Math.random() * 2.4,
      life: life * (0.5 + Math.random() * 0.6),
    });
  }
}

/* ================================================================== */
/* 移动端简易操作层                                                   */
/* ================================================================== */

function isMobileTouch() {
  return !!(
    window.matchMedia?.('(pointer: coarse)').matches &&
    navigator.maxTouchPoints > 0
  );
}

function updateMobileUI() {
  if (!els.mobileControls) return;
  if (!app.mobile) {
    els.commandPanel?.classList.remove('mobile-collapsed');
    els.mobileControls.classList.add('hidden');
    return;
  }
  const state = app.state;
  const phase = state?.phase;
  const battle = state?.battle;
  const me = myPlayer();
  const canControl = !!(
    phase === 'battle' &&
    battle &&
    !battle.over &&
    me &&
    !me.eliminated &&
    !state.paused
  );
  const collapsed = !app.mobilePanelOpen;
  els.commandPanel?.classList.toggle('mobile-collapsed', collapsed);
  els.mobilePanelToggle.classList.toggle('active', app.mobilePanelOpen);
  els.mobilePanelToggle.title = app.mobilePanelOpen ? '收起操作面板' : '打开操作面板';
  const showControls = canControl && collapsed;
  els.mobileControls.classList.toggle('hidden', !showControls);
  if (!showControls) {
    if (app.skillAim) cancelSkillAim(false);
    stopMobileStick();
    stopMobileAttack();
    return;
  }
  const hero = myHero();
  const def = heroDef(hero?.heroId);
  const cd = hero?.skillCd || 0;
  const cost = def?.skill?.cost || 0;
  els.mobileSkill.disabled = !hero || !hero.alive || cd > 0 || (me.gold || 0) < cost;
  els.mobileSkillCd.textContent = cd > 0 ? `${Math.ceil(cd)}` : '';
  els.mobileFocus.classList.toggle('focus-on', !!app.focusMode);
  els.mobileSwap.disabled = myHeroes().filter((h) => h.alive).length <= 1;
}

function toggleMobilePanel() {
  if (!app.mobile) return;
  app.mobilePanelOpen = !app.mobilePanelOpen;
  cancelSkillAim(false);
  stopMobileStick();
  stopMobileAttack();
  updateMobileUI();
}

function swapMobileHero() {
  const living = myHeroes().filter((h) => h.alive);
  if (living.length <= 1) {
    showToast('没有其他存活英雄', '', 1200);
    return;
  }
  const current = myHero();
  const idx = living.findIndex((h) => h.id === current?.id);
  const next = living[(idx + 1) % living.length];
  sendAction({ type: 'selectHero', heroId: next.id }, { silent: true });
  showToast(`切换到 ${next.name}`, '', 1000);
}

function stopMobileStick() {
  const stick = app.mobileStickState;
  if (!stick) return;
  if (stick.timer) clearInterval(stick.timer);
  stick.timer = null;
  stick.active = false;
  stick.pointerId = null;
  stick.dx = 0;
  stick.dy = 0;
  if (els.mobileStickKnob) els.mobileStickKnob.style.transform = '';
}

function sendMobileStickMove() {
  const stick = app.mobileStickState;
  if (!stick?.active || !app.mobile || app.mobilePanelOpen) return;
  const state = app.state;
  if (!state || state.phase !== 'battle' || state.paused) return;
  const hero = myHero();
  if (!hero || !hero.alive || myPlayer()?.eliminated) return;
  const len = Math.hypot(stick.dx, stick.dy);
  if (len < 0.22) return;
  const nx = stick.dx / len;
  const ny = stick.dy / len;
  sendAction({ type: 'move', x: hero.x + nx * 150, y: hero.y + ny * 150 }, { silent: true });
}

function bindMobileStick() {
  app.mobileStickState = { active: false, pointerId: null, timer: null, dx: 0, dy: 0 };
  const stickEl = els.mobileStick;
  if (!stickEl) return;

  const update = (e) => {
    const rect = stickEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width / 2 - 12;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    els.mobileStickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    app.mobileStickState.dx = dx / max;
    app.mobileStickState.dy = dy / max;
  };

  stickEl.addEventListener('pointerdown', (e) => {
    if (!app.mobile) return;
    e.preventDefault();
    stopMobileStick();
    const stick = app.mobileStickState;
    stick.active = true;
    stick.pointerId = e.pointerId;
    stickEl.setPointerCapture?.(e.pointerId);
    update(e);
    sendMobileStickMove();
    stick.timer = setInterval(sendMobileStickMove, 180);
  });

  stickEl.addEventListener('pointermove', (e) => {
    const stick = app.mobileStickState;
    if (!stick?.active || stick.pointerId !== e.pointerId) return;
    e.preventDefault();
    update(e);
  });

  const end = (e) => {
    const stick = app.mobileStickState;
    if (!stick?.active || (e && stick.pointerId !== e.pointerId)) return;
    stopMobileStick();
  };
  stickEl.addEventListener('pointerup', end);
  stickEl.addEventListener('pointercancel', end);
  stickEl.addEventListener('pointerleave', (e) => {
    if (e.buttons === 0) end(e);
  });
}

function findNearestEnemy(hero) {
  const battle = app.state?.battle;
  if (!battle || !hero) return null;
  let best = null;
  let bestD = Infinity;
  const list = [
    ...(battle.heroes || []),
    ...(battle.summons || []),
    ...(battle.towers || []),
  ];
  for (const unit of list) {
    if (!unit.alive || unit.owner === hero.owner) continue;
    const d = Math.hypot(unit.x - hero.x, unit.y - hero.y);
    if (d < bestD) {
      best = unit;
      bestD = d;
    }
  }
  return best;
}

function sendAttackCommand(target) {
  const manual = isManualAttackMode();
  if (!manual && !app.autoModeHintShown) {
    app.autoModeHintShown = true;
    showToast('自动战斗模式：点击敌人只用于追击，伤害由自动攻击结算', 'gold', 2600);
  }
  return sendAction({ type: 'attack', kind: target.kind, id: target.id, manual }, { silent: true });
}

function mobileAttackOnce() {
  const state = app.state;
  if (!state || state.phase !== 'battle' || state.paused || app.mobilePanelOpen) return;
  const hero = myHero();
  if (!hero || !hero.alive || myPlayer()?.eliminated) return;
  const target = findNearestEnemy(hero);
  if (!target) return false;
  sendAttackCommand(target);
  return true;
}

function startMobileAttack(e) {
  if (!app.mobile) return;
  e.preventDefault();
  stopMobileAttack();
  els.mobileAttack.setPointerCapture?.(e.pointerId);
  els.mobileAttack.classList.add('pressed');
  if (!mobileAttackOnce()) showToast('附近没有可攻击目标', '', 1000);
  if (isManualAttackMode()) app.mobileAttackTimer = setInterval(mobileAttackOnce, 95);
}

function stopMobileAttack() {
  if (app.mobileAttackTimer) clearInterval(app.mobileAttackTimer);
  app.mobileAttackTimer = null;
  els.mobileAttack?.classList.remove('pressed');
}

/* ================================================================== */
/* 输入                                                               */
/* ================================================================== */

function updatePointerFromEvent(e) {
  const rect = els.canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  app.mouse.x = sx;
  app.mouse.y = sy;
  app.mouse.over = true;
  app.lastPointerType = e.pointerType || app.lastPointerType;
  const w = screenToWorld(sx, sy);
  app.mouse.worldX = w.x;
  app.mouse.worldY = w.y;
  const map = currentMap();
  if (map) {
    const tx = Math.floor(w.x / map.tile);
    const ty = Math.floor(w.y / map.tile);
    if (tx >= 0 && ty >= 0 && tx < map.w && ty < map.h) app.mouse.tile = { x: tx, y: ty };
    else app.mouse.tile = null;
  }
  return { x: sx, y: sy, worldX: w.x, worldY: w.y };
}

function onPointerMove(e) {
  const drag = app.canvasPointer;
  if (drag && drag.id === e.pointerId) {
    const total = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (!drag.moved && total > 6) drag.moved = true;
    if (drag.moved) {
      panViewBy(e.clientX - drag.lastX, e.clientY - drag.lastY);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      updatePointerFromEvent(e);
      els.hoverTip.classList.add('hidden');
      return;
    }
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  }
  updatePointerFromEvent(e);
  if (e.pointerType === 'touch') {
    els.hoverTip.classList.add('hidden');
  } else {
    updateHoverTip();
  }
}

function togglePanMode() {
  app.panMode = !app.panMode;
  els.mapHand.classList.toggle('active', app.panMode);
  els.stage.classList.toggle('pan-mode', app.panMode);
  showToast(app.panMode ? '拖动地图：开启，左键拖动地图，不再攻击/移动' : '拖动地图：关闭，左键恢复攻击/移动', 'gold', 1800);
}

function startCanvasPan(e, allowClick) {
  app.canvasPointer = {
    id: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    moved: false,
    allowClick,
  };
  if (e.pointerType === 'touch') {
    e.preventDefault();
    els.hoverTip.classList.add('hidden');
  }
  try {
    els.canvas.setPointerCapture(e.pointerId);
  } catch {
    /* noop */
  }
}

function onCanvasDown(e) {
  if (!app.state) return;
  const panButton = e.button === 1 || e.button === 2;
  if (e.button === 0 && !app.panMode) {
    // 战斗点击立即执行，拖动地图改用右键/中键或“手”模式，避免攻击时误拖。
    performCanvasClick(e);
    return;
  }
  if (e.button === 0 || panButton) {
    e.preventDefault();
    updatePointerFromEvent(e);
    startCanvasPan(e, false);
  }
}

function onCanvasUp(e) {
  const pointer = app.canvasPointer;
  if (!pointer || pointer.id !== e.pointerId) return;
  app.canvasPointer = null;
  try {
    els.canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* noop */
  }
}

function onCanvasCancel(e) {
  if (!app.canvasPointer || app.canvasPointer.id !== e.pointerId) return;
  app.canvasPointer = null;
  try {
    els.canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* noop */
  }
}

function performCanvasClick(e) {
  if (app.wasd.size) clearWasd();
  if (!app.state) return;
  const phase = app.state.phase;
  if (app.state.paused) return;
  const pointer = updatePointerFromEvent(e);
  if (e.pointerType === 'touch') {
    e.preventDefault();
    els.hoverTip.classList.add('hidden');
  }

  if (phase === 'battle' && app.skillAim) {
    const aim = app.skillAim;
    app.skillAim = null;
    els.skillButton.classList.remove('aiming');
    hideAnnounce();
    if (!aim || myHero()?.id !== aim.heroId) {
      showToast('英雄已切换，技能瞄准已取消', '', 1400);
      return;
    }
    castSkillAtPoint(pointer.worldX, pointer.worldY);
    return;
  }

  if (phase === 'draft') {
    const me = myPlayer();
    if (!me || me.ready) return;
    const tile = app.mouse.tile;
    if (!tile) return;
    const check = canPlaceAt(me, tile.x, tile.y);
    if (!check.ok) {
      showToast(check.reason, 'error', 1800);
      return;
    }
    sendAction({ type: 'place', x: tile.x, y: tile.y });
    return;
  }

  if (phase !== 'battle') return;
  const me = myPlayer();
  if (!me || me.eliminated) return;

  if (app.buildMode) {
    const tile = app.mouse.tile;
    if (!tile) return;
    const check = canPlaceAt(me, tile.x, tile.y);
    if (!check.ok) {
      showToast(check.reason, 'error', 1800);
      return;
    }
    const mode = app.buildMode;
    sendAction({ type: 'buildTower', heroId: mode.heroId, x: tile.x, y: tile.y }).then((r) => {
      if (r.ok) {
        app.buildMode = null;
        hideAnnounce();
      }
    });
    return;
  }

  const clicked = entityAt(app.mouse.x, app.mouse.y);
  if (clicked) {
    if (clicked.owner === app.playerId) {
      if (clicked.kind === 'hero') {
        sendAction({ type: 'selectHero', heroId: clicked.id }, { silent: true });
      } else if (clicked.kind === 'summon') {
        showToast('镜像会复制你的移动/攻击指令；灵仆会自动作战', '', 1600);
      } else {
        const linked = app.state.battle?.heroes?.find((h) => h.id === clicked.heroId);
        if (linked) sendAction({ type: 'selectHero', heroId: linked.id }, { silent: true });
        else openAltar('summon');
      }
      return;
    }
    if (!myHero()?.alive) {
      showToast('先用祭坛召唤英雄，或选择一位存活英雄', 'error', 1600);
      return;
    }
    if (app.focusMode || e.shiftKey) {
      app.focusMode = false;
      updateFocusButton();
      sendAction({ type: 'focusFire', kind: clicked.kind, id: clicked.id }, { silent: true }).then((r) => {
        if (!r.ok && r.error) showToast(r.error, 'error');
      });
      return;
    }
    // 手速模式：每次点击立即尝试一次手动攻击；自动战斗模式只下达追击指令。
    sendAttackCommand(clicked);
    return;
  }

  if (!myHero()?.alive) return;
  if (app.focusMode) {
    app.focusMode = false;
    updateFocusButton();
  }
  const w = screenToWorld(app.mouse.x, app.mouse.y);
  sendAction({ type: 'move', x: w.x, y: w.y }, { silent: true });
}

function onKeyDown(e) {
  if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (app.replayMode) {
    if (e.key === 'Escape') closeReplay();
    else if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      toggleReplayPlay();
    }
    return;
  }
  if (app.spectator) {
    if (e.key === 'Escape') {
      els.helpModal.classList.add('hidden');
    } else if (e.key === '?' || e.key.toLowerCase() === 'h') {
      els.helpModal.classList.toggle('hidden');
    }
    return;
  }
  const wasd = wasdKeyName(e.key);
  if (wasd) {
    if (e.repeat) {
      e.preventDefault();
      return;
    }
    if (!app.state || app.state.phase !== 'battle' || app.state.paused || app.state.over) return;
    e.preventDefault();
    app.wasd.add(wasd);
    sendWasd();
    return;
  }

  if (e.key === 'Escape') {
    if (!els.altarModal.classList.contains('hidden')) {
      closeAltar();
      return;
    }
    if (app.buildMode) {
      app.buildMode = null;
      showToast('已取消建塔', '', 1200);
      return;
    }
    if (app.skillAim) {
      cancelSkillAim();
      return;
    }
    if (app.focusMode) {
      app.focusMode = false;
      updateFocusButton();
      showToast('已取消集火模式', '', 1200);
      return;
    }
    els.helpModal.classList.add('hidden');
    return;
  }
  if (e.key === '?' || (e.key === 'h' && !e.metaKey && !e.ctrlKey)) {
    els.helpModal.classList.toggle('hidden');
    return;
  }
  if (e.key.toLowerCase() === 't' && !e.repeat) {
    if (!els.helpModal.classList.contains('hidden')) return;
    toggleAutoSelectMode();
    return;
  }
  if (e.key.toLowerCase() === 'k' && !e.repeat) {
    if (!els.helpModal.classList.contains('hidden')) return;
    toggleKiteMode();
    return;
  }
  if (e.key.toLowerCase() === 'f' && !e.repeat) {
    if (!els.helpModal.classList.contains('hidden')) return;
    toggleFocusMode();
    return;
  }
  if (e.key.toLowerCase() === 'p' && !e.repeat) {
    togglePause();
    return;
  }
  if (e.key.toLowerCase() === 'q' && !e.repeat) {
    if (!els.helpModal.classList.contains('hidden')) return;
    castSkillAtCursor();
  }
}

const WASD_NAMES = {
  w: 'w', a: 'a', s: 's', d: 'd',
  arrowup: 'w', arrowleft: 'a', arrowdown: 's', arrowright: 'd',
};

function wasdKeyName(key) {
  return WASD_NAMES[String(key || '').toLowerCase()] || null;
}

function wasdVector() {
  let x = 0;
  let y = 0;
  if (app.wasd.has('a')) x -= 1;
  if (app.wasd.has('d')) x += 1;
  if (app.wasd.has('w')) y -= 1;
  if (app.wasd.has('s')) y += 1;
  return { x, y };
}

function sendWasd() {
  const state = app.state;
  if (!state || state.phase !== 'battle' || state.paused || state.over || app.spectator || app.replayMode) return;
  const v = wasdVector();
  sendAction({ type: 'moveDir', dx: v.x, dy: v.y }, { silent: true });
}

function clearWasd(send = true) {
  if (!app.wasd?.size) return;
  app.wasd.clear();
  if (send) sendWasd();
}

function onKeyUp(e) {
  const wasd = wasdKeyName(e.key);
  if (!wasd) return;
  if (app.wasd.delete(wasd)) {
    e.preventDefault();
    sendWasd();
  }
}

function skillNeedsAim(def) {
  return !!(def?.skill && (def.skill.range || def.skill.dash));
}

function handleSkillButton() {
  const hero = myHero();
  const state = app.state;
  const def = heroDef(hero?.heroId);
  if (!state || state.phase !== 'battle' || state.paused || !hero || !def) {
    castSkillAtCursor();
    return;
  }
  const touch = app.lastPointerType === 'touch' ||
    (window.matchMedia?.('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
  if (!touch) {
    castSkillAtCursor();
    return;
  }
  if (app.skillAim) {
    cancelSkillAim();
    return;
  }
  if (!skillNeedsAim(def)) {
    castSkillAtPoint(hero.x + 40, hero.y);
    return;
  }
  app.skillAim = { heroId: hero.id, skillId: def.skill.id };
  els.skillButton.classList.add('aiming');
  showAnnounce(`技能瞄准 · 点击地图施放「${def.skill.name}」`, '');
}

function cancelSkillAim(show = true) {
  if (!app.skillAim) return;
  app.skillAim = null;
  els.skillButton.classList.remove('aiming');
  hideAnnounce();
  if (show) showToast('已取消技能瞄准', '', 1200);
}

function castSkillAtPoint(x, y) {
  const state = app.state;
  if (!state || state.phase !== 'battle' || state.paused) return;
  const hero = myHero();
  const me = myPlayer();
  if (!hero) {
    showToast('先从英雄祭坛召唤一位英雄', 'error', 1500);
    return;
  }
  if (!hero.alive || me?.eliminated) return;
  sendAction({ type: 'skill', x, y }, { silent: true });
}

function castSkillAtCursor() {
  const state = app.state;
  if (!state || state.phase !== 'battle' || state.paused) return;
  const hero = myHero();
  const me = myPlayer();
  if (!hero) {
    showToast('先从英雄祭坛召唤一位英雄', 'error', 1500);
    return;
  }
  if (!hero.alive || me?.eliminated) return;
  let x;
  let y;
  if (!app.mouse.over || app.lastPointerType === 'touch') {
    x = hero.x + 40;
    y = hero.y;
  } else {
    x = app.mouse.worldX;
    y = app.mouse.worldY;
  }
  castSkillAtPoint(x, y);
}

function canPlaceAt(me, tx, ty) {
  const map = app.map;
  if (!map) return { ok: false, reason: '地图尚未就绪' };
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return { ok: false, reason: '超出地图范围' };
  const t = map.tiles[ty * map.w + tx];
  if (!isBuildableTerrain(t)) return { ok: false, reason: '该地形无法建造魂塔' };
  if ((map.nodes || []).some((n) => n.x === tx && n.y === ty)) return { ok: false, reason: '不能建在资源点上' };
  if (app.state?.phase === 'battle') {
    const towers = app.state.battle?.towers || [];
    if (towers.some((tw) => tw.tx === tx && tw.ty === ty)) return { ok: false, reason: '这里已经有魂塔了' };
  } else {
    for (const p of app.state?.players || []) {
      if (!p.placement) continue;
      if (p.id === me?.id) continue;
      if (p.placement.x === tx && p.placement.y === ty) return { ok: false, reason: '这里已经有魂塔了' };
    }
  }
  return { ok: true };
}

function isBuildableTerrain(t) {
  return t === TG.PLAIN || t === TG.FOREST || t === TG.HILL;
}

function isPassableTerrain(t) {
  return t === TG.PLAIN || t === TG.FOREST || t === TG.HILL;
}

/* ================================================================== */
/* 悬停提示                                                           */
/* ================================================================== */

function entityAt(sx, sy) {
  const battle = app.state?.battle;
  if (!battle) return null;
  const scale = app.view.scale;
  let best = null;
  let bestD = Infinity;
  for (const h of battle.heroes) {
    if (!h.alive) continue;
    const p = screenPos(h.x, h.y);
    const d = Math.hypot(p.x - sx, p.y - sy);
    const r = Math.max(12, h.radius * scale + 6);
    if (d < r && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  for (const s of battle.summons || []) {
    if (!s.alive) continue;
    const p = screenPos(s.x, s.y);
    const d = Math.hypot(p.x - sx, p.y - sy);
    const r = Math.max(7, s.radius * scale + 5);
    if (d < r && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  for (const t of battle.towers) {
    if (!t.alive) continue;
    const p = screenPos(t.x, t.y);
    const d = Math.hypot(p.x - sx, p.y - sy);
    const r = Math.max(18, t.radius * scale + 8);
    if (d < r && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function entityLabel(entity) {
  const p = playerById(entity.owner);
  if (!p) return '';
  if (entity.kind === 'hero') return `${p.name} · ${entity.name}`;
  if (entity.kind === 'summon') {
    return `${p.name} · ${entity.name}`;
  }
  return `${p.name} 的魂塔`;
}

function updateHoverTip() {
  if (!app.mouse.over || app.state?.phase !== 'battle') {
    els.hoverTip.classList.add('hidden');
    return;
  }
  const ent = entityAt(app.mouse.x, app.mouse.y);
  if (!ent) {
    els.hoverTip.classList.add('hidden');
    return;
  }
  const p = playerById(ent.owner);
  if (!p) {
    els.hoverTip.classList.add('hidden');
    return;
  }
  const prefix = ent.owner === app.playerId ? '<span class="tip-you">你</span> ' : '';
  let html = `<b style="color:${esc(p.color)}">${prefix}${esc(entityLabel(ent))}</b>`;
  if (ent.kind === 'hero') {
    html += `
      <div class="tip-row"><span>生命</span><b>${fmtInt(ent.hp)} / ${fmtInt(ent.maxHp)}</b></div>
      <div class="tip-row"><span>攻击 / 护甲</span><b>${Math.round(ent.damage)} / ${ent.armor}</b></div>
      <div class="tip-row"><span>等级</span><b>Lv.${ent.level}</b></div>
      <div class="tip-row"><span>赏金</span><b>${fmtInt(ent.bounty)}</b></div>
      ${ent.enraged ? '<div class="tip-row"><span>状态</span><b>背水一战</b></div>' : ''}
      ${ent.rooted ? '<div class="tip-row"><span>状态</span><b>定身</b></div>' : ''}
    `;
  } else if (ent.kind === 'summon') {
    html += `
      <div class="tip-row"><span>类型</span><b>${ent.summonType === 'clone' ? '镜像 · 10 秒' : '灵仆 · 22 秒'}</b></div>
      <div class="tip-row"><span>生命</span><b>${fmtInt(ent.hp)} / ${fmtInt(ent.maxHp)}</b></div>
      <div class="tip-row"><span>攻击</span><b>${Math.round(ent.damage)}</b></div>
      <div class="tip-row"><span>剩余</span><b>${ent.expiresIn}s</b></div>
    `;
  } else {
    html += `
      <div class="tip-row"><span>耐久</span><b>${fmtInt(ent.hp)} / ${fmtInt(ent.maxHp)}</b></div>
      <div class="tip-row"><span>护甲 / 等级</span><b>${ent.armor} / Lv.${ent.level}</b></div>
      <div class="tip-row"><span>加农炮</span><b>${ent.cannonCount} / 2</b></div>
      <div class="tip-row"><span>赏金</span><b>${fmtInt(ent.bounty)}</b></div>
    `;
  }
  els.hoverTip.innerHTML = html;
  els.hoverTip.classList.remove('hidden');
  const rect = els.stage.getBoundingClientRect();
  const tipW = els.hoverTip.offsetWidth || 190;
  const tipH = els.hoverTip.offsetHeight || 90;
  let left = app.mouse.x + 16;
  let top = app.mouse.y + 16;
  if (left + tipW > rect.width - 8) left = app.mouse.x - tipW - 12;
  if (top + tipH > rect.height - 8) top = app.mouse.y - tipH - 10;
  els.hoverTip.style.left = `${clamp(left, 8, Math.max(8, rect.width - tipW - 8))}px`;
  els.hoverTip.style.top = `${clamp(top, 8, Math.max(8, rect.height - tipH - 8))}px`;
  els.canvas.style.cursor = 'pointer';
}

/* ================================================================== */
/* 地图预渲染                                                         */
/* ================================================================== */

function buildMapCanvas(map) {
  if (!map) return;
  const key = `${map.seed}-${map.w}-${map.h}`;
  if (key === app.mapCanvasKey && app.mapCanvas) return;
  const T = map.tile;
  const canvas = document.createElement('canvas');
  canvas.width = map.w * T;
  canvas.height = map.h * T;
  const g = canvas.getContext('2d');
  const seed = map.seed | 0;

  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x];
      const n = hash01(x, y, seed);
      const n2 = hash01(x + 41, y + 17, seed + 9);
      drawTerrainTile(g, x, y, T, t, n, n2, seed);
    }
  }

  // 细网格，增加战术棋盘感
  g.save();
  g.globalAlpha = 0.055;
  g.strokeStyle = '#a7d8d5';
  g.lineWidth = 1;
  for (let x = 0; x <= map.w; x++) {
    g.beginPath();
    g.moveTo(x * T + 0.5, 0);
    g.lineTo(x * T + 0.5, map.h * T);
    g.stroke();
  }
  for (let y = 0; y <= map.h; y++) {
    g.beginPath();
    g.moveTo(0, y * T + 0.5);
    g.lineTo(map.w * T, y * T + 0.5);
    g.stroke();
  }
  g.restore();

  // 边缘压暗
  const vignette = g.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    Math.min(canvas.width, canvas.height) * 0.32,
    canvas.width / 2,
    canvas.height / 2,
    Math.max(canvas.width, canvas.height) * 0.72
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(2,6,10,0.42)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, canvas.width, canvas.height);

  app.mapCanvas = canvas;
  app.mapCanvasKey = key;
}

function drawTerrainTile(g, x, y, T, t, n, n2, seed) {
  const px = x * T;
  const py = y * T;
  if (t === TG.PLAIN) {
    const shade = Math.floor(18 + n * 10);
    g.fillStyle = `rgb(${19 + shade * 0.18},${40 + shade * 0.34},${33 + shade * 0.26})`;
    g.fillRect(px, py, T, T);
    g.globalAlpha = 0.35;
    g.strokeStyle = '#3f6b55';
    g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const gx = px + ((n2 * 31 + i * 11.7) % (T - 6)) + 3;
      const gy = py + ((n * 27 + i * 9.3) % (T - 6)) + 3;
      g.beginPath();
      g.moveTo(gx, gy + 3);
      g.lineTo(gx + 1.5, gy);
      g.stroke();
    }
    g.globalAlpha = 1;
    if (n > 0.78) {
      g.fillStyle = 'rgba(140,177,130,0.13)';
      g.beginPath();
      g.arc(px + 8 + n2 * 14, py + 9 + n * 12, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  } else if (t === TG.FOREST) {
    g.fillStyle = `rgb(${11 + n * 4},${31 + n * 6},${24 + n * 5})`;
    g.fillRect(px, py, T, T);
    for (let i = 0; i < 3; i++) {
      const cx = px + 6 + ((hash01(x * 3 + i, y, seed) * 21) % 22);
      const cy = py + 7 + ((hash01(x, y * 3 + i, seed + 2) * 19) % 20);
      const r = 3.5 + hash01(x + i, y + i, seed) * 3;
      g.fillStyle = 'rgba(2,12,10,0.55)';
      g.beginPath();
      g.arc(cx + 1.2, cy + 2.2, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = i === 0 ? '#1f4b37' : '#245a3f';
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(104,172,126,0.28)';
      g.beginPath();
      g.arc(cx - r * 0.25, cy - r * 0.28, r * 0.38, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.12;
    g.fillStyle = '#7ee787';
    g.fillRect(px, py, T, 1);
    g.globalAlpha = 1;
  } else if (t === TG.HILL) {
    g.fillStyle = `rgb(${49 + n * 9},${48 + n * 7},${39 + n * 6})`;
    g.fillRect(px, py, T, T);
    g.strokeStyle = 'rgba(150,143,110,0.25)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      const yy = py + 8 + i * 9 + n * 3;
      g.moveTo(px + 4, yy);
      g.quadraticCurveTo(px + 12, yy - 5, px + 19, yy);
      g.quadraticCurveTo(px + 25, yy + 4, px + 29, yy - 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(210,197,147,0.13)';
    g.fillRect(px + 3 + n2 * 20, py + 4 + n * 18, 2, 2);
  } else if (t === TG.MOUNTAIN) {
    g.fillStyle = `rgb(${28 + n * 9},${32 + n * 9},${40 + n * 10})`;
    g.fillRect(px, py, T, T);
    const peaks = 1 + Math.floor(n2 * 2);
    for (let i = 0; i < peaks; i++) {
      const cx = px + 6 + i * 13 + (n2 * 6) % 6;
      const baseY = py + T - 1;
      const peakY = py + 3 + ((n * 13 + i * 7) % 9);
      const half = 8 + ((n2 * 10 + i * 3) % 7);
      g.fillStyle = i === 0 ? '#333b49' : '#3c4555';
      g.beginPath();
      g.moveTo(cx - half, baseY);
      g.lineTo(cx, peakY);
      g.lineTo(cx + half, baseY);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(195,214,231,0.32)';
      g.beginPath();
      g.moveTo(cx, peakY);
      g.lineTo(cx + half * 0.38, peakY + (baseY - peakY) * 0.36);
      g.lineTo(cx + half * 0.04, peakY + 4);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath();
      g.moveTo(cx, peakY);
      g.lineTo(cx - half, baseY);
      g.lineTo(cx, baseY);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 0.18;
    g.fillStyle = '#9db1c4';
    g.fillRect(px, py, T, 1);
    g.globalAlpha = 1;
  } else if (t === TG.WATER) {
    g.fillStyle = `rgb(${13 + n * 7},${38 + n * 9},${55 + n * 10})`;
    g.fillRect(px, py, T, T);
    g.strokeStyle = 'rgba(96,190,214,0.38)';
    g.lineWidth = 1.1;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      const yy = py + 7 + i * 9 + n * 2;
      g.moveTo(px + 4, yy);
      g.quadraticCurveTo(px + 10, yy - 3, px + 16, yy);
      g.quadraticCurveTo(px + 22, yy + 3, px + 28, yy);
      g.stroke();
    }
    g.fillStyle = 'rgba(126,231,255,0.16)';
    g.fillRect(px + 5 + n * 18, py + 6 + n2 * 16, 3, 1);
  } else {
    g.fillStyle = '#18202a';
    g.fillRect(px, py, T, T);
  }
}

/* ================================================================== */
/* 尺寸 / 坐标                                                        */
/* ================================================================== */

function resizeCanvas() {
  const rect = els.stage.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  app.view.w = w;
  app.view.h = h;
  app.view.dpr = dpr;
  const targetW = Math.round(w * dpr);
  const targetH = Math.round(h * dpr);
  if (els.canvas.width !== targetW || els.canvas.height !== targetH) {
    els.canvas.width = targetW;
    els.canvas.height = targetH;
  }
  applyView();
}

function fitScaleFor(map) {
  if (!map) return 1;
  return Math.min(app.view.w / (map.w * map.tile), app.view.h / (map.h * map.tile)) * 0.995;
}

function clampView() {
  const map = currentMap();
  if (!map) return;
  const worldW = map.w * map.tile;
  const worldH = map.h * map.tile;
  const sw = worldW * app.view.scale;
  const sh = worldH * app.view.scale;
  if (sw <= app.view.w) app.view.ox = (app.view.w - sw) / 2;
  else app.view.ox = Math.max(app.view.w - sw, Math.min(0, app.view.ox));
  if (sh <= app.view.h) app.view.oy = (app.view.h - sh) / 2;
  else app.view.oy = Math.max(app.view.h - sh, Math.min(0, app.view.oy));
  app.view.camX = (app.view.w / 2 - app.view.ox) / app.view.scale;
  app.view.camY = (app.view.h / 2 - app.view.oy) / app.view.scale;
}

function applyView() {
  const map = currentMap();
  if (!map || !app.view.w) return;
  const fit = fitScaleFor(map);
  app.view.zoom = Math.max(1, Math.min(4, app.view.zoom || 1));
  app.view.scale = fit * app.view.zoom;
  if (app.view.camX == null || app.view.camY == null) {
    app.view.camX = map.center.x * map.tile;
    app.view.camY = map.center.y * map.tile;
  }
  app.view.ox = app.view.w / 2 - app.view.camX * app.view.scale;
  app.view.oy = app.view.h / 2 - app.view.camY * app.view.scale;
  clampView();
}

function panViewBy(dx, dy) {
  app.view.ox += dx;
  app.view.oy += dy;
  clampView();
}

function zoomViewAt(nextZoom, sx, sy) {
  const map = currentMap();
  if (!map) return;
  const before = screenToWorld(sx, sy);
  app.view.zoom = Math.max(1, Math.min(4, nextZoom));
  app.view.scale = fitScaleFor(map) * app.view.zoom;
  app.view.ox = sx - before.x * app.view.scale;
  app.view.oy = sy - before.y * app.view.scale;
  clampView();
}

function centerCameraOnPlayer(playerId = app.playerId) {
  const battle = app.state?.battle;
  const me = battle?.players?.find((p) => p.id === playerId);
  const hero = me ? battle.heroes?.find((h) => h.owner === playerId && (h.id === me.selectedHeroId || h.alive)) || battle.heroes?.find((h) => h.owner === playerId) : null;
  const tower = me ? battle.towers?.find((t) => t.owner === playerId && t.alive) : null;
  const map = currentMap();
  const x = hero?.x ?? tower?.x ?? (map ? (map.center.x + 0.5) * map.tile : 0);
  const y = hero?.y ?? tower?.y ?? (map ? (map.center.y + 0.5) * map.tile : 0);
  if (!map) return;
  app.view.camX = x;
  app.view.camY = y;
  applyView();
}

function currentMap() {
  return app.map || app.demoMap;
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - app.view.ox) / app.view.scale,
    y: (sy - app.view.oy) / app.view.scale,
  };
}

function worldToScreen(x, y) {
  return {
    x: app.view.ox + x * app.view.scale,
    y: app.view.oy + y * app.view.scale,
  };
}

/* ================================================================== */
/* 视觉插值                                                           */
/* ================================================================== */

function syncVisuals() {
  const battle = app.state?.battle;
  if (!battle) {
    app.visuals.clear();
    return;
  }
  const alive = new Set();
  for (const h of battle.heroes) {
    alive.add(h.id);
    let v = app.visuals.get(h.id);
    if (!v) {
      v = { x: h.x, y: h.y, tx: h.x, ty: h.y };
      app.visuals.set(h.id, v);
    }
    v.tx = h.x;
    v.ty = h.y;
  }
  for (const t of battle.towers) {
    alive.add(t.id);
    let v = app.visuals.get(t.id);
    if (!v) {
      v = { x: t.x, y: t.y, tx: t.x, ty: t.y };
      app.visuals.set(t.id, v);
    }
    v.tx = t.x;
    v.ty = t.y;
  }
  for (const unit of battle.summons || []) {
    alive.add(unit.id);
    let v = app.visuals.get(unit.id);
    if (!v) {
      v = { x: unit.x, y: unit.y, tx: unit.x, ty: unit.y };
      app.visuals.set(unit.id, v);
    }
    v.tx = unit.x;
    v.ty = unit.y;
  }
  for (const key of app.visuals.keys()) {
    if (!alive.has(key)) app.visuals.delete(key);
  }
}

function visualOf(entity) {
  let v = app.visuals.get(entity.id);
  if (!v) {
    v = { x: entity.x, y: entity.y, tx: entity.x, ty: entity.y };
    app.visuals.set(entity.id, v);
  }
  return v;
}

/* ================================================================== */
/* 渲染主循环                                                         */
/* ================================================================== */

const ctx = els.canvas.getContext('2d');

function frame(ts) {
  const dt = Math.min(0.05, Math.max(0.001, (ts - app.lastFrame) / 1000));
  app.lastFrame = ts;
  app.time += dt;
  for (const v of app.visuals.values()) {
    const k = 1 - Math.exp(-dt * 16);
    v.x += (v.tx - v.x) * k;
    v.y += (v.ty - v.y) * k;
  }
  for (const fx of app.effects) fx.t += dt;
  app.effects = app.effects.filter((fx) => fx.t < fx.life);
  if (app.shake > 0) app.shake = Math.max(0, app.shake - dt * 46);
  render(dt);
  requestAnimationFrame(frame);
}

function ownerTeam(ownerId) {
  const p = app.state?.battle?.players?.find((x) => x.id === ownerId) || app.state?.players?.find((x) => x.id === ownerId);
  return p?.team ?? null;
}

function onMinimapPointer(e) {
  const map = currentMap();
  if (!map) return;
  e.preventDefault();
  app.minimapDrag = true;
  const rect = els.minimap.getBoundingClientRect();
  const fx = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  const fy = clamp((e.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  app.view.camX = fx * map.w * map.tile;
  app.view.camY = fy * map.h * map.tile;
  applyView();
}

function drawMinimap() {
  const map = currentMap();
  const canvas = els.minimap;
  if (!map || !canvas) return;
  const ctx2 = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx2.clearRect(0, 0, W, H);
  ctx2.fillStyle = 'rgba(4,10,16,0.9)';
  ctx2.fillRect(0, 0, W, H);
  if (app.mapCanvas) {
    ctx2.globalAlpha = 0.72;
    ctx2.drawImage(app.mapCanvas, 0, 0, W, H);
    ctx2.globalAlpha = 1;
  }
  const sx = W / (map.w * map.tile);
  const sy = H / (map.h * map.tile);
  ctx2.fillStyle = 'rgba(255,207,107,0.8)';
  for (const n of map.nodes || []) {
    ctx2.fillRect(n.x * map.tile * sx - 1, n.y * map.tile * sy - 1, 2, 2);
  }
  const battle = app.state?.battle;
  if (battle) {
    for (const t of battle.towers) {
      if (!t.alive) continue;
      ctx2.fillStyle = t.owner === app.playerId ? '#ffffff' : (ownerTeam(t.owner) != null ? TEAM_COLORS[ownerTeam(t.owner)] : '#889');
      ctx2.fillRect(t.x * sx - 2, t.y * sy - 2, 4, 4);
    }
    for (const h of battle.heroes) {
      if (!h.alive) continue;
      const me = h.owner === app.playerId;
      const team = ownerTeam(h.owner);
      ctx2.beginPath();
      ctx2.arc(h.x * sx, h.y * sy, me ? 4 : 3, 0, Math.PI * 2);
      ctx2.fillStyle = me ? '#ffffff' : team != null ? TEAM_COLORS[team] : '#ff8b82';
      ctx2.fill();
      ctx2.lineWidth = 1;
      ctx2.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx2.stroke();
    }
  }
  const tl = screenToWorld(0, 0);
  const br = screenToWorld(app.view.w, app.view.h);
  ctx2.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx2.lineWidth = 1.5;
  ctx2.strokeRect(tl.x * sx, tl.y * sy, Math.max(4, (br.x - tl.x) * sx), Math.max(4, (br.y - tl.y) * sy));
}

function render() {
  const map = currentMap();
  if (!map) return;
  const { w, h, dpr } = app.view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#040a10';
  ctx.fillRect(0, 0, w, h);

  const shakeX = app.shake ? (Math.random() - 0.5) * app.shake : 0;
  const shakeY = app.shake ? (Math.random() - 0.5) * app.shake : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  const mw = map.w * map.tile;
  const mh = map.h * map.tile;
  if (app.mapCanvas) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(app.mapCanvas, app.view.ox, app.view.oy, mw * app.view.scale, mh * app.view.scale);
  }

  drawSpawnOverlays();
  drawResources();
  drawTowers();
  drawSummons();
  drawHeroes();
  drawTutorialTargets();
  drawEffects();
  drawFocusMark();
  drawDraftCursor();
  drawAmbient();

  ctx.restore();
  drawMinimap();
}

/* ------------------------------------------------------------------ */
/* 场景绘制                                                           */
/* ------------------------------------------------------------------ */

function drawSpawnOverlays() {
  const state = app.state;
  if (!state || !app.map) return;
  const inDraft = state.phase === 'draft';
  const players = state.players || [];

  if (inDraft) {
    for (const p of players) {
      if (!p.placement) continue;
      const wpos = screenPos(
        p.placement.x * app.map.tile + app.map.tile / 2,
        p.placement.y * app.map.tile + app.map.tile / 2
      );
      drawGhostTower(wpos.x, wpos.y, p.color, p.id === app.playerId ? 0.82 : 0.48, null);
    }
    const own = myPlayer();
    if (own && !own.ready && app.mouse.tile) {
      const check = canPlaceAt(own, app.mouse.tile.x, app.mouse.tile.y);
      if (check.ok) {
        const wpos = screenPos(
          app.mouse.tile.x * app.map.tile + app.map.tile / 2,
          app.mouse.tile.y * app.map.tile + app.map.tile / 2
        );
        drawGhostTower(wpos.x, wpos.y, own.color, 0.5, null);
      }
    }
  }

  // 战斗内建塔预览
  if (state.phase === 'battle' && app.buildMode && app.mouse.tile) {
    const me = myPlayer();
    const check = canPlaceAt(me, app.mouse.tile.x, app.mouse.tile.y);
    if (check.ok) {
      const wpos = screenPos(
        app.mouse.tile.x * app.map.tile + app.map.tile / 2,
        app.mouse.tile.y * app.map.tile + app.map.tile / 2
      );
      drawGhostTower(wpos.x, wpos.y, me?.color || '#66e0d2', 0.58, app.buildMode.heroId);
    }
  }
}

function drawGhostTower(sx, sy, color, alpha, heroId) {
  const r = Math.max(12, 25 * app.view.scale);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgba(color, 0.12);
  ctx.beginPath();
  ctx.arc(sx, sy, r * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.8);
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(8,16,24,0.85)';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const px = sx + Math.cos(a) * r;
    const py = sy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.85);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * (0.7 + Math.sin(app.time * 3) * 0.15);
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  if (heroId) {
    const def = heroDef(heroId);
    if (def) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(240,250,255,0.75)';
      ctx.font = `600 ${Math.max(9, r * 0.7)}px ${CJK_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, sx, sy + 0.5);
    }
  }
  ctx.restore();
}

function drawDraftCursor() {
  const state = app.state;
  if (!state) return;
  const inDraft = state.phase === 'draft';
  const inBuild = state.phase === 'battle' && !!app.buildMode;
  if (!inDraft && !inBuild) return;
  const me = myPlayer();
  if (!me) return;
  if (inDraft && me.ready) return;
  const tile = app.mouse.tile;
  if (!tile) return;
  const map = app.map;
  const check = canPlaceAt(me, tile.x, tile.y);
  const sx = app.view.ox + tile.x * map.tile * app.view.scale;
  const sy = app.view.oy + tile.y * map.tile * app.view.scale;
  const size = map.tile * app.view.scale;
  ctx.save();
  ctx.fillStyle = check.ok ? 'rgba(126,231,135,0.18)' : 'rgba(255,107,97,0.2)';
  ctx.fillRect(sx, sy, size, size);
  ctx.strokeStyle = check.ok ? '#7ee787' : '#ff6b61';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(sx + 0.5, sy + 0.5, size - 1, size - 1);
  ctx.restore();
}

function drawResources() {
  const state = app.state;
  const battle = state?.battle;
  const nodes = battle?.nodes || (state?.phase === 'draft' || state?.phase === 'lobby' ? app.map?.nodes : []);
  if (!nodes || !app.map) return;
  const T = app.map.tile;
  nodes.forEach((n, idx) => {
    const p = screenPos(n.x * T + T / 2, n.y * T + T / 2);
    const available = battle ? n.available : true;
    const respawn = battle ? n.respawnIn || 0 : 0;
    const pulse = 0.5 + 0.5 * Math.sin(app.time * 2.4 + idx * 1.7);
    ctx.save();
    if (available) {
      const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 26);
      glow.addColorStop(0, 'rgba(255,207,107,0.26)');
      glow.addColorStop(1, 'rgba(255,207,107,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(13,22,27,0.88)';
      ctx.strokeStyle = `rgba(255,207,107,${0.5 + pulse * 0.35})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffcf6b';
      ctx.font = `bold 12px ${CJK_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('¤', p.x, p.y + 0.5);
      ctx.fillStyle = 'rgba(255,207,107,0.75)';
      ctx.font = '10px Consolas, monospace';
      ctx.fillText(`+${n.gold}`, p.x, p.y + 19);
    } else {
      const total = n.respawnTotal || app.catalog?.resourceRespawn || 16;
      const frac = battle ? clamp(respawn / total, 0, 1) : 1;
      ctx.fillStyle = 'rgba(9,17,23,0.62)';
      ctx.strokeStyle = 'rgba(255,207,107,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,207,107,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - frac));
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,207,107,0.45)';
      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${respawn}s`, p.x, p.y + 18);
    }
    ctx.restore();
  });
}

function drawTowers() {
  const battle = app.state?.battle;
  if (!battle) return;
  for (const tower of battle.towers) {
    const v = visualOf(tower);
    const p = worldToScreen(v.x, v.y);
    const r = Math.max(17, tower.radius * app.view.scale);
    const color = colorOf(tower.owner);
    const ownerPlayer = playerById(tower.owner);
    const isOwn = tower.owner === app.playerId;
    const isSelected = isOwn && ownerPlayer?.selectedTowerId === tower.id;
    if (!tower.alive) {
      drawRubble(p.x, p.y, r, color);
      continue;
    }
    ctx.save();
    // 地面光圈
    const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r * 2.3);
    glow.addColorStop(0, rgba(color, 0.2));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.3, 0, Math.PI * 2);
    ctx.fill();

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + r * 0.72, r * 0.95, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    // 底座
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = p.x + Math.cos(a) * r;
      const py = p.y + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    const stone = ctx.createLinearGradient(p.x, p.y - r, p.x, p.y + r);
    stone.addColorStop(0, '#2c3a46');
    stone.addColorStop(1, '#111b24');
    ctx.fillStyle = stone;
    ctx.fill();
    ctx.strokeStyle = rgba(color, 0.55);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 内圈
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.63, 0, Math.PI * 2);
    ctx.fillStyle = '#0b151d';
    ctx.fill();
    ctx.strokeStyle = rgba(color, 0.32);
    ctx.stroke();

    // 魂晶
    ctx.save();
    ctx.translate(p.x, p.y - r * 0.07);
    ctx.rotate(app.time * 0.45);
    ctx.shadowBlur = 13;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.4);
    ctx.lineTo(r * 0.27, 0);
    ctx.lineTo(0, r * 0.4);
    ctx.lineTo(-r * 0.27, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.3);
    ctx.lineTo(r * 0.1, 0);
    ctx.lineTo(0, r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 炮台
    if (tower.cannonCount > 0) {
      for (let i = 0; i < tower.cannonCount; i++) {
        const a = i === 0 ? -0.9 : 2.2;
        const bx = p.x + Math.cos(a) * r * 0.66;
        const by = p.y + Math.sin(a) * r * 0.66;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(a);
        ctx.fillStyle = '#7e6a43';
        ctx.strokeStyle = 'rgba(255,207,107,0.55)';
        ctx.lineWidth = 0.8;
        ctx.fillRect(-r * 0.13, -r * 0.1, r * 0.48, r * 0.2);
        ctx.strokeRect(-r * 0.13, -r * 0.1, r * 0.48, r * 0.2);
        ctx.fillStyle = '#ffcf6b';
        ctx.beginPath();
        ctx.arc(r * 0.36, 0, r * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 选中塔高亮；其他己方塔只保留微弱标记
    if (isSelected || isOwn) {
      ctx.strokeStyle = rgba(color, isSelected ? 0.9 : 0.28);
      ctx.lineWidth = isSelected ? 1.8 : 1;
      ctx.setLineDash(isSelected ? [5, 5] : [2, 7]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (isSelected ? 1.22 : 1.14), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (tower.shield > 0) {
      ctx.strokeStyle = 'rgba(167,139,250,0.75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 血条
    const bw = Math.max(46, r * 1.9);
    drawBar(p.x - bw / 2, p.y - r - 13, bw, 4, tower.hp / tower.maxHp, color, `${tower.level}`);
    // 名字
    ctx.fillStyle = 'rgba(202,224,232,0.72)';
    ctx.font = `10px ${CJK_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const owner = playerById(tower.owner);
    ctx.fillText(owner?.name || '', p.x, p.y + r + 5);
    ctx.restore();
  }
}

function drawRubble(x, y, r, color) {
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + r * 0.55, r, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b242b';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.8, y + r * 0.5);
  ctx.lineTo(x - r * 0.4, y - r * 0.12);
  ctx.lineTo(x, y + r * 0.06);
  ctx.lineTo(x + r * 0.35, y - r * 0.28);
  ctx.lineTo(x + r * 0.85, y + r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,177,185,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 0.36;
  for (let i = 0; i < 3; i++) {
    const t = (app.time * 0.3 + i * 0.33) % 1;
    ctx.fillStyle = rgba(color, 0.28 * (1 - t));
    ctx.beginPath();
    ctx.arc(x + Math.sin(i * 2 + app.time) * r * 0.4, y - t * r * 1.8, 2 + t * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSummons() {
  const battle = app.state?.battle;
  if (!battle) return;
  const hovered = app.mouse.over ? entityAt(app.mouse.x, app.mouse.y) : null;
  for (const unit of battle.summons || []) {
    if (!unit.alive) continue;
    const v = visualOf(unit);
    const p = worldToScreen(v.x, v.y);
    const color = unit.color || colorOf(unit.owner);
    const isClone = unit.summonType === 'clone';
    const r = Math.max(isClone ? 8 : 3.5, unit.radius * app.view.scale);
    const frac = clamp((unit.expiresIn || 0) / Math.max(1, unit.duration || 1), 0, 1);
    const isHover = hovered?.id === unit.id;

    ctx.save();
    if (isClone) {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x - 7, p.y + 3, r * 0.82, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.82;
      ctx.shadowBlur = 12;
      ctx.shadowColor = color;
      ctx.strokeStyle = rgba(color, 0.8);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      const body = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, 1, p.x, p.y, r);
      body.addColorStop(0, 'rgba(38,53,65,0.95)');
      body.addColorStop(1, 'rgba(11,20,27,0.78)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = `700 ${Math.max(9, r * 1.0)}px ${CJK_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(unit.icon || '镜', p.x, p.y + 0.5);
      drawBar(p.x - 17, p.y - r - 10, 34, 3, unit.hp / unit.maxHp, color, null);
    } else {
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      ctx.fillStyle = rgba(color, 0.92);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r * 0.9, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r * 0.9, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, r * 0.28), 0, Math.PI * 2);
      ctx.fill();
      if (isHover) {
        ctx.fillStyle = rgba(color, 0.95);
        ctx.font = `9px ${CJK_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(unit.name, p.x, p.y - r - 5);
      }
      drawBar(p.x - 8, p.y - r - 8, 16, 2.5, unit.hp / unit.maxHp, color, null);
    }

    // 剩余时间弧
    ctx.strokeStyle = rgba(color, isClone ? 0.55 : 0.38);
    ctx.lineWidth = isClone ? 1.4 : 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + (isClone ? 5.5 : 4.5), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    if (isClone) {
      ctx.fillStyle = 'rgba(232,247,250,0.75)';
      ctx.font = `9px ${CJK_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(unit.name, p.x, p.y + r + 3);
    }
    ctx.restore();
  }
}

function drawHeroes() {
  const battle = app.state?.battle;
  if (!battle) return;
  const hovered = app.mouse.over ? entityAt(app.mouse.x, app.mouse.y) : null;
  for (const hero of battle.heroes) {
    if (!hero.alive) continue;
    const v = visualOf(hero);
    const p = worldToScreen(v.x, v.y);
    const r = Math.max(12, hero.radius * app.view.scale);
    const color = colorOf(hero.owner);
    const def = heroDef(hero.heroId);
    const ownerPlayer = playerById(hero.owner);
    const isOwn = hero.owner === app.playerId;
    const isSelected = isOwn && ownerPlayer?.selectedHeroId === hero.id;
    const isHover = hovered?.id === hero.id;

    if (isOwn) {
      ctx.save();
      ctx.strokeStyle = rgba(color, 0.18);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(28, hero.atkRange * app.view.scale), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    // 背水一战光环
    if (hero.enraged) {
      const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r * 2.7);
      g.addColorStop(0, 'rgba(255,107,97,0.3)');
      g.addColorStop(1, 'rgba(255,107,97,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x + 1, p.y + r * 0.85, r * 0.85, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // 选中环：只有当前操作英雄显示强高亮
    if (isSelected) {
      ctx.strokeStyle = rgba(color, 0.86 + Math.sin(app.time * 5) * 0.12);
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 5.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (isOwn || isHover) {
      ctx.strokeStyle = rgba(color, isOwn ? 0.36 : 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 团队色外环：同队英雄一眼可辨
    if (app.state.teamMode && ownerPlayer?.team != null) {
      const teamColor = TEAM_COLORS[ownerPlayer.team] || '#8ea6b3';
      ctx.save();
      ctx.strokeStyle = rgba(teamColor, isOwn ? 0.9 : 0.72);
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 玩家色外环
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 英雄本体
    const body = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, 1, p.x, p.y, r);
    body.addColorStop(0, '#263541');
    body.addColorStop(1, '#0b141b');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r - 1.3, 0, Math.PI * 2);
    ctx.fill();

    if (def) {
      ctx.fillStyle = def.color;
      ctx.font = `700 ${Math.max(10, r * 1.05)}px ${CJK_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, p.x, p.y + 0.5);
    }

    // 护盾
    if (hero.shield > 0) {
      ctx.strokeStyle = 'rgba(107,231,255,0.8)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 2.5 + Math.sin(app.time * 3) * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 减速
    if (hero.slowed) {
      ctx.fillStyle = 'rgba(158,234,255,0.9)';
      for (let i = 0; i < 3; i++) {
        const a = app.time * 1.5 + (i * Math.PI * 2) / 3;
        const px = p.x + Math.cos(a) * (r + 3);
        const py = p.y + Math.sin(a) * (r + 3);
        ctx.beginPath();
        ctx.arc(px, py, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 定身藤蔓
    if (hero.rooted) {
      ctx.strokeStyle = 'rgba(132,204,22,0.85)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(217,249,157,0.8)';
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i + 0.4;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * (r + 3), p.y + Math.sin(a) * (r + 3), 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 血条
    const bw = Math.max(34, r * 2.3);
    drawBar(p.x - bw / 2, p.y - r - 12, bw, 3.5, hero.hp / hero.maxHp, color, `${hero.level}`);
    if (isOwn) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.strokeStyle = 'rgba(4, 13, 20, 0.8)';
      ctx.lineWidth = 0.8;
      const bx = p.x + bw / 2 - 12;
      const by = p.y - r - 25;
      ctx.beginPath();
      ctx.roundRect(bx, by, 13, 10, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#07131c';
      ctx.font = `700 9px ${CJK_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('你', bx + 6.5, by + 5.1);
      ctx.restore();
    }
    if (isSelected) {
      ctx.fillStyle = 'rgba(232,247,250,0.9)';
      ctx.font = `10px ${CJK_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.fillText(hero.name, p.x, p.y + r + 4);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}

function drawBar(x, y, w, h, frac, color, levelText) {
  frac = clamp(frac, 0, 1);
  ctx.save();
  ctx.fillStyle = 'rgba(2,7,11,0.82)';
  ctx.strokeStyle = 'rgba(255,255,255,0.11)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 2);
  ctx.fill();
  ctx.stroke();
  if (frac > 0) {
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,255,255,0.78)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, Math.max(0.5, (w - 1) * frac), h - 1, 1.5);
    ctx.fill();
  }
  if (levelText) {
    ctx.fillStyle = 'rgba(224,240,244,0.82)';
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Lv${levelText}`, x, y - 2);
  }
  ctx.restore();
}

function drawEffects() {
  for (const fx of app.effects) {
    const k = clamp(fx.t / fx.life, 0, 1);
    const fade = 1 - k;
    ctx.save();
    if (fx.type === 'tracer') {
      ctx.globalAlpha = fade;
      ctx.strokeStyle = fx.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = fx.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.arc(fx.x2, fx.y2, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (fx.type === 'ring') {
      const radius = fx.radius * (0.35 + 0.65 * k);
      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = (fx.width || 2) * fade;
      ctx.shadowBlur = 12;
      ctx.shadowColor = fx.color;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (fx.type === 'shield') {
      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius + k * 16, 0, Math.PI * 2);
      ctx.stroke();
    } else if (fx.type === 'dash') {
      ctx.globalAlpha = fade * 0.85;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3 * fade;
      ctx.shadowBlur = 14;
      ctx.shadowColor = fx.color;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
    } else if (fx.type === 'text') {
      ctx.globalAlpha = fade;
      ctx.fillStyle = fx.color;
      ctx.font = `700 ${fx.size || 11}px ${CJK_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.fillText(fx.text, fx.x, fx.y + (fx.vy || -22) * k);
    } else if (fx.type === 'particle') {
      ctx.globalAlpha = fade;
      ctx.fillStyle = fx.color;
      ctx.shadowBlur = 5;
      ctx.shadowColor = fx.color;
      const px = fx.x + fx.vx * k * fx.life;
      const py = fx.y + fx.vy * k * fx.life + 60 * k * k * fx.life;
      ctx.beginPath();
      ctx.arc(px, py, fx.size * (1 - k * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawTutorialTargets() {
  if (!app.tutorial.active) return;
  const key = TUTORIAL_STEPS[app.tutorial.step]?.key;
  if (key !== 'focus') return;
  const state = app.state;
  const battle = state?.battle;
  if (!state || !battle) return;
  const passiveOwners = new Set(state.players.filter((p) => p.passive).map((p) => p.id));
  if (!passiveOwners.size) return;
  for (const tower of battle.towers) {
    if (!tower.alive || !passiveOwners.has(tower.owner)) continue;
    const v = visualOf(tower);
    const p = worldToScreen(v.x, v.y);
    const r = Math.max(24, tower.radius * app.view.scale + 8);
    const pulse = 1 + Math.sin(app.time * 4) * 0.08;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 207, 107, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 207, 107, 0.95)';
    ctx.font = `10px ${CJK_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('训练木桩', p.x, p.y - r - 5);
    ctx.restore();
  }
}

function drawFocusMark() {
  const mark = app.focusMark;
  if (!mark) return;
  const battle = app.state?.battle;
  if (!battle || performance.now() > mark.until) {
    app.focusMark = null;
    return;
  }
  const entity =
    mark.kind === 'hero'
      ? battle.heroes.find((h) => h.id === mark.targetId)
      : mark.kind === 'summon'
        ? (battle.summons || []).find((s) => s.id === mark.targetId)
        : battle.towers.find((t) => t.id === mark.targetId);
  if (!entity || !entity.alive) {
    app.focusMark = null;
    return;
  }
  const v = visualOf(entity);
  const p = worldToScreen(v.x, v.y);
  const r = Math.max(20, (entity.radius || 14) * app.view.scale + 8);
  const pulse = 1 + Math.sin(app.time * 6) * 0.08;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 107, 97, 0.9)';
  ctx.lineWidth = 1.3;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255, 207, 107, 0.85)';
  ctx.lineWidth = 1;
  const arm = 5;
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i + Math.PI / 4;
    const x = p.x + Math.cos(a) * (r + 3);
    const y = p.y + Math.sin(a) * (r + 3);
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a + Math.PI / 2) * arm, y - Math.sin(a + Math.PI / 2) * arm);
    ctx.lineTo(x + Math.cos(a + Math.PI / 2) * arm, y + Math.sin(a + Math.PI / 2) * arm);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 160, 150, 0.95)';
  ctx.font = `9px ${CJK_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('集火', p.x, p.y - r - 3);
  ctx.restore();
}

function drawAmbient() {
  if (app.state) return;
  // 首页地图上的微光尘埃
  ctx.save();
  for (let i = 0; i < 26; i++) {
    const x = (hash01(i, 4, 91) * app.view.w + app.time * (6 + (i % 4) * 3)) % app.view.w;
    const y = hash01(i, 7, 33) * app.view.h + Math.sin(app.time * 0.6 + i) * 8;
    const a = 0.08 + 0.18 * (0.5 + 0.5 * Math.sin(app.time * 1.3 + i * 2));
    ctx.fillStyle = i % 3 === 0 ? `rgba(255,207,107,${a})` : `rgba(102,224,210,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + (i % 3) * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}


/* ================================================================== */
/* 回放                                                               */
/* ================================================================== */

function fmtReplayDate(ms) {
  try {
    return new Date(ms).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

async function loadReplayList() {
  els.replayList.innerHTML = '<div class="empty-state">正在读取回放…</div>';
  try {
    const res = await fetch('/api/replays', { cache: 'no-store' });
    const data = await res.json();
    const replays = data.replays || [];
    if (!replays.length) {
      els.replayList.innerHTML = '<div class="empty-state">还没有已结束的对局回放。</div>';
      return;
    }
    els.replayList.innerHTML = replays
      .map(
        (r) => `
        <button class="replay-list-item" data-replay-id="${esc(r.id)}">
          <span class="rl-main">
            <b>${esc(r.winner ? `${r.winner} 获胜` : '平局')} · 房间 ${esc(r.code)} · ${r.manualAttack === false ? '自动战斗' : '手速模式'}</b>
            <small>${esc((r.players || []).join(' / '))}</small>
          </span>
          <span class="rl-meta">${fmtTime(r.duration || 0)}<br>${esc(fmtReplayDate(r.endedAt))}</span>
        </button>`
      )
      .join('');
    for (const btn of els.replayList.querySelectorAll('[data-replay-id]')) {
      btn.addEventListener('click', () => openReplay(btn.dataset.replayId));
    }
  } catch {
    els.replayList.innerHTML = '<div class="empty-state">读取回放失败，请稍后再试。</div>';
  }
}

function openReplayList() {
  els.replayListScreen.classList.remove('hidden');
  void loadReplayList();
}

function closeReplayList() {
  els.replayListScreen.classList.add('hidden');
}

function replayFrameAt(time) {
  const frames = app.replay?.frames || [];
  if (!frames.length) return null;
  let i = 0;
  while (i + 1 < frames.length && frames[i + 1].t <= time) i += 1;
  const a = frames[i];
  const b = frames[i + 1] || a;
  const span = Math.max(0.001, b.t - a.t);
  const alpha = b === a ? 0 : clamp((time - a.t) / span, 0, 1);
  const blend = (key) => {
    const right = new Map((b[key] || []).map((x) => [x.id, x]));
    return (a[key] || []).map((x) => {
      const y = right.get(x.id);
      if (!y) return x;
      return {
        ...x,
        x: x.x + (y.x - x.x) * alpha,
        y: x.y + (y.y - x.y) * alpha,
        hp: x.hp + (y.hp - x.hp) * alpha,
        shield: (x.shield || 0) + ((y.shield || 0) - (x.shield || 0)) * alpha,
      };
    });
  };
  return {
    phase: 'battle',
    code: app.replay.data.code,
    hostId: null,
    aiLevel: app.replay.data.aiLevel || 'normal',
    manualAttack: app.replay.data.manualAttack !== false,
    maxPlayers: a.players.length,
    players: a.players,
    battle: {
      startedAt: app.replay.data.createdAt,
      time,
      timeLimit: app.replay.data.result?.time || app.replay.duration,
      over: a.over,
      winner: a.winner,
      endReason: a.endReason,
      deathMode: !!a.deathMode,
      deathModeAt: a.deathModeAt || 0,
      teamMode: !!a.teamMode,
      manualAttack: app.replay.data.manualAttack !== false,
      winnerTeam: a.winnerTeam ?? null,
      players: a.players,
      heroes: blend('heroes'),
      towers: blend('towers'),
      summons: blend('summons'),
      nodes: a.nodes,
      events: [],
    },
    result: null,
    paused: false,
    canPause: false,
    tutorial: false,
    teamMode: !!a.teamMode,
    mapSeed: app.replay.data.map?.seed,
    replay: true,
  };
}

function setReplayTime(time, force = false) {
  const r = app.replay;
  if (!r) return;
  const next = clamp(time, 0, r.duration);
  if (next + 0.01 < r.time) {
    r.eventIndex = 0;
    app.seenEventId = 0;
    app.effects = [];
  }
  r.time = next;
  app.state = replayFrameAt(next);
  app.state.result = r.data.result;
  while (r.eventIndex < r.events.length && r.events[r.eventIndex].t <= next) {
    const ev = r.events[r.eventIndex];
    r.eventIndex += 1;
    processEvents([ev]);
  }
  syncVisuals();
  if (force || performance.now() - (r.lastUiAt || 0) > 100) {
    r.lastUiAt = performance.now();
    updateHeader();
    updatePlayerList();
  }
  updateReplayBar();
}

function updateReplayBar() {
  const r = app.replay;
  if (!r) return;
  const d = Math.max(0.1, r.duration);
  els.replaySeek.max = String(d);
  if (document.activeElement !== els.replaySeek) els.replaySeek.value = String(r.time);
  els.replayTime.textContent = `${fmtTime(r.time)} / ${fmtTime(r.duration)}`;
  els.replayPlay.textContent = r.playing ? 'Ⅱ' : '▶';
  els.replaySpeed.textContent = `${r.speed}x`;
  if (app.replayExport) {
    els.replayPlay.disabled = true;
    els.replaySeek.disabled = true;
    els.replaySpeed.disabled = true;
    els.replayExit.disabled = true;
  } else {
    els.replayPlay.disabled = false;
    els.replaySeek.disabled = false;
    els.replaySpeed.disabled = false;
    els.replayExit.disabled = false;
  }
}

function startReplayLoop() {
  stopReplayLoop();
  let last = performance.now();
  const step = (now) => {
    if (!app.replayMode || !app.replay) return;
    const r = app.replay;
    const dt = Math.min(0.12, (now - last) / 1000);
    last = now;
    if (r.playing) {
      const next = Math.min(r.duration, r.time + dt * r.speed);
      setReplayTime(next);
      if (next >= r.duration - 0.001) {
        r.playing = false;
        updateReplayBar();
      }
    }
    app.replayRaf = requestAnimationFrame(step);
  };
  app.replayRaf = requestAnimationFrame(step);
}

function stopReplayLoop() {
  if (app.replayRaf) cancelAnimationFrame(app.replayRaf);
  app.replayRaf = 0;
}

function toggleReplayPlay() {
  const r = app.replay;
  if (!r || app.replayExport) return;
  if (r.time >= r.duration - 0.01) setReplayTime(0, true);
  r.playing = !r.playing;
  updateReplayBar();
}

function cycleReplaySpeed() {
  const r = app.replay;
  if (!r || app.replayExport) return;
  r.speed = r.speed === 1 ? 2 : r.speed === 2 ? 4 : 1;
  updateReplayBar();
}

function seekReplay() {
  const r = app.replay;
  if (!r || app.replayExport) return;
  setReplayTime(Number(els.replaySeek.value) || 0);
}

function replayExportMime() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function toggleReplayExport() {
  if (app.replayExport) {
    cancelReplayExport();
    return;
  }
  const r = app.replay;
  if (!app.replayMode || !r) return;
  if (!window.MediaRecorder || !els.canvas.captureStream) {
    showToast('当前浏览器不支持 Canvas 录制，请使用 Chrome/Edge', 'error', 2600);
    return;
  }
  const mime = replayExportMime();
  if (!mime) {
    showToast('当前浏览器不支持 MP4 录制，请使用 Chrome/Edge', 'error', 3000);
    return;
  }
  let stream;
  try {
    stream = els.canvas.captureStream(30);
  } catch {
    showToast('无法创建录制流', 'error', 2200);
    return;
  }
  const chunks = [];
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  } catch {
    showToast('MP4 录制初始化失败，请尝试 Chrome/Edge', 'error', 2600);
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  const original = { time: r.time, playing: r.playing, speed: r.speed };
  r.speed = 1;
  r.playing = false;
  setReplayTime(0, true);
  const exportState = app.replayExport = {
    recorder,
    stream,
    chunks,
    mime,
    original,
    raf: 0,
    stopped: false,
    canceled: false,
  };
  recorder.onstart = () => {
    r.playing = true;
    updateReplayBar();
  };
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size) chunks.push(ev.data);
  };
  recorder.onerror = () => {
    showToast('MP4 录制失败', 'error', 2600);
    cancelReplayExport();
  };
  recorder.onstop = () => {
    if (exportState.canceled) {
      stream.getTracks().forEach((track) => track.stop());
      app.replayExport = null;
      els.replayExport.classList.remove('exporting');
      els.replayExport.textContent = '导出 MP4';
      updateReplayBar();
      return;
    }
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tower-souls-${app.replay?.data?.code || 'replay'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    stream.getTracks().forEach((track) => track.stop());
    const current = app.replay;
    if (current) {
      current.speed = original.speed;
      current.playing = original.playing;
      setReplayTime(current.time, true);
      updateReplayBar();
    }
    app.replayExport = null;
    els.replayExport.classList.remove('exporting');
    els.replayExport.textContent = '导出 MP4';
    updateReplayBar();
    showToast(`MP4 已生成（${fmtTime(r.duration)}）`, 'gold', 2600);
  };
  els.replayExport.classList.add('exporting');
  els.replayExport.textContent = '取消导出';
  updateReplayBar();
  showToast('开始按 1× 实时录制 MP4（无声）；可再次点击取消', 'gold', 2600);
  recorder.start(250);
  const monitor = () => {
    if (!app.replayExport) return;
    const cur = app.replay;
    if (!cur) {
      cancelReplayExport();
      return;
    }
    const pct = Math.min(100, Math.round((cur.time / Math.max(0.1, cur.duration)) * 100));
    els.replayExport.textContent = `导出中 ${pct}%`;
    updateReplayBar();
    if (cur.time >= cur.duration - 0.02) {
      finishReplayExport();
      return;
    }
    app.replayExport.raf = requestAnimationFrame(monitor);
  };
  app.replayExport.raf = requestAnimationFrame(monitor);
}

function finishReplayExport() {
  const e = app.replayExport;
  if (!e || e.stopped) return;
  e.stopped = true;
  if (e.raf) cancelAnimationFrame(e.raf);
  try {
    if (e.recorder.state !== 'inactive') e.recorder.stop();
  } catch {
    /* noop */
  }
}

function cancelReplayExport() {
  const e = app.replayExport;
  if (!e) return;
  e.stopped = true;
  e.canceled = true;
  if (e.raf) cancelAnimationFrame(e.raf);
  const current = app.replay;
  if (current) {
    current.speed = e.original.speed;
    current.playing = e.original.playing;
    setReplayTime(e.original.time, true);
    updateReplayBar();
  }
  try {
    if (e.recorder.state !== 'inactive') e.recorder.stop();
  } catch {
    /* noop */
  }
  e.stream.getTracks().forEach((track) => track.stop());
  app.replayExport = null;
  els.replayExport.classList.remove('exporting');
  els.replayExport.textContent = '导出 MP4';
  updateReplayBar();
  showToast('已取消导出', '', 1600);
}

async function openReplay(id) {
  try {
    setLoading('载入回放…', '正在读取战斗记录');
    let data = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await fetch(`/api/replay?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (res.ok) {
        data = await res.json();
        break;
      }
      if (res.status !== 404) break;
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    if (!data?.replay) {
      hideLoading();
      showToast('回放尚未生成或已过期', 'error', 2200);
      return;
    }
    closeStream();
    clearSession();
    stopReplayLoop();
    app.spectator = false;
    app.replayMode = true;
    app.code = data.replay.code;
    app.playerId = null;
    app.catalog = data.catalog;
    app.init = { catalog: data.catalog };
    app.map = data.replay.map;
    app.effects = [];
    app.seenEventId = 0;
    app.battleStartedAt = data.replay.createdAt || 0;
    app.replay = {
      data: data.replay,
      frames: data.replay.frames || [],
      events: data.replay.events || [],
      duration: data.replay.duration || 0,
      time: 0,
      playing: true,
      speed: 1,
      eventIndex: 0,
      lastUiAt: 0,
      dataResult: data.replay.result || null,
    };
    if (!app.replay.frames.length) {
      hideLoading();
      showToast('这局回放没有可用帧', 'error', 2200);
      return;
    }
    els.startScreen.classList.add('hidden');
    els.lobbyScreen.classList.add('hidden');
    els.endScreen.classList.add('hidden');
    els.replayListScreen.classList.add('hidden');
    els.loadingScreen.classList.add('hidden');
    els.app.classList.add('in-room');
    els.app.classList.remove('no-room');
    applyMap(data.replay.map);
    resizeCanvas();
    setReplayTime(0, true);
    applyPhaseUI(null);
    els.replayBar.classList.remove('hidden');
    updateReplayBar();
    startReplayLoop();
    updateReplayBar();
  } catch {
    hideLoading();
    showToast('回放载入失败', 'error', 2200);
  }
}

function closeReplay() {
  if (app.replayExport) cancelReplayExport();
  stopReplayLoop();
  app.replayMode = false;
  app.replay = null;
  app.state = null;
  app.map = null;
  app.catalog = null;
  app.init = null;
  els.replayBar.classList.add('hidden');
  els.replayListScreen.classList.add('hidden');
  showStart();
}


/* ================================================================== */
/* 首次启动                                                           */
/* ================================================================== */

els.app.classList.add('no-room');

/* 调试 / 自动化接口：便于本地测试与开发者查看状态 */
window.__towerSouls = {
  get app() {
    return app;
  },
  get state() {
    return app.state;
  },
  get map() {
    return app.map;
  },
  get catalog() {
    return app.catalog;
  },
  worldToScreen,
  sendAction,
};
