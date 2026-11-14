/**
 * 用无头 Chromium 打开游戏内回放，按固定时间步抓取整页截图。
 * 之后可用 scripts/encode-replay-webp.py 合成动画 WebP。
 *
 *   node scripts/capture-ai-replay.mjs --id <replayId> --fps 10 \
 *     --out data/replays/frames_ai_ffa
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME =
  '/home/huolongguo10/.dsh/cache/chromium/chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell';
const PORT = 9223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const args = {
    id: 'ai-ffa-314194-mw7s4imf',
    fps: 10,
    out: 'data/replays/frames_ai_ffa',
    width: 1600,
    height: 1000,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--id') args.id = argv[++i];
    else if (a === '--fps') args.fps = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--width') args.width = Number(argv[++i]);
    else if (a === '--height') args.height = Number(argv[++i]);
    else throw new Error(`unknown arg: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.out, { recursive: true });
  const profile = `/tmp/tower-replay-chrome-${Date.now()}`;
  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${PORT}`,
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${args.width},${args.height}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  chrome.stderr.on('data', () => {});

  let version;
  for (let i = 0; i < 80; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      break;
    } catch {
      await sleep(100);
    }
  }
  if (!version) throw new Error('chromium did not start');

  const tab = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:4317`, {
      method: 'PUT',
    })
  ).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const cmd = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evalv = async (expression, awaitPromise = false) => {
    const r = await cmd('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };

  try {
    await cmd('Page.enable');
    await cmd('Runtime.enable');
    await sleep(1200);

    // 打开回放
    await evalv(`document.querySelector('#replay-list-btn').click()`);
    await sleep(500);
    const opened = await evalv(`(() => {
      const items = [...document.querySelectorAll('.replay-list-item')];
      const item = items.find((el) => el.textContent.includes('${args.id.slice(0, 8)}')) || items[0];
      if (!item) return false;
      item.click();
      return true;
    })()`);
    if (!opened) throw new Error('no replay item found');
    for (let i = 0; i < 40; i++) {
      const ready = await evalv(
        `!!(window.__towerSouls?.app?.replay && document.querySelector('#replay-bar') && !document.querySelector('#replay-bar').classList.contains('hidden'))`
      );
      if (ready) break;
      await sleep(150);
    }
    await sleep(500);
    const info = await evalv(`(() => {
      const a = window.__towerSouls.app;
      if (a.replay?.playing) document.querySelector('#replay-play').click();
      return { duration: a.replay.duration, frames: a.replay.frames.length, playing: a.replay.playing };
    })()`);
    if (!info.duration) throw new Error('replay not loaded');
    console.log('replay', args.id, info);

    const total = Math.floor(info.duration * args.fps) + 1;
    const every = Math.max(1, Math.floor(total / 20));
    for (let i = 0; i < total; i++) {
      const t = i / args.fps;
      await evalv(`(() => {
        const el = document.querySelector('#replay-seek');
        el.value = '${t.toFixed(3)}';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      await evalv(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`, true);
      await sleep(18);
      const shot = await cmd('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      });
      const file = path.join(args.out, `frame_${String(i).padStart(5, '0')}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      if (i % every === 0) {
        console.log(`frame ${i}/${total} t=${t.toFixed(1)}s`);
      }
    }
    console.log(`done: ${total} frames at ${args.fps} fps -> ${args.out}`);
  } finally {
    ws.close();
    chrome.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
