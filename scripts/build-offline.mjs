import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFile(path.join(root, p), 'utf8');

function exportNames(code) {
  return [...code.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
}
function stripExports(code) {
  return code.replace(/^export\s+/gm, '');
}
function stripImports(code) {
  return code.replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?\s*\n?/gm, '');
}
function importNames(code, fromFile) {
  const out = [];
  for (const m of code.matchAll(/^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/gm)) {
    if (m[2].endsWith(fromFile)) out.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean));
  }
  return out;
}
function wrapModule(name, code, exports, deps = '') {
  return `const ${name} = (() => {\n${deps}\n${stripExports(stripImports(code))}\nreturn { ${exports.join(', ')} };\n})();`;
}

const heroesSrc = await read('shared/heroes.js');
const mapgenSrc = await read('shared/mapgen.js');
const engineSrc = await read('shared/engine.js');

const heroExports = exportNames(heroesSrc);
const mapExports = exportNames(mapgenSrc);
const engineExports = exportNames(engineSrc);
const mapDeps = importNames(mapgenSrc, 'heroes.js');
const engineHeroDeps = importNames(engineSrc, 'heroes.js');
const engineMapDeps = importNames(engineSrc, 'mapgen.js');

const heroModule = wrapModule('heroes', heroesSrc, heroExports);
const mapModule = wrapModule('mapgen', mapgenSrc, mapExports, `const { ${mapDeps.join(', ')} } = heroes;`);
const engineModule = wrapModule(
  'engine',
  engineSrc,
  engineExports,
  `const { ${engineHeroDeps.join(', ')} } = heroes;\nconst { ${engineMapDeps.join(', ')} } = mapgen;`
);
const engineBundle = `(function () {\n${heroModule}\n${mapModule}\n${engineModule}\nwindow.TowerOffline = { heroes, mapgen, engine };\n})();`;

let client = await read('public/client.js');
client = client.replace(/^import\s+\{\s*generateMap\s*\}\s+from\s+['"]\/shared\/mapgen\.js['"];\s*\n/, '');
client = `const { generateMap } = window.TowerOffline.mapgen;\n` + client;

let css = await read('public/styles.css');
const fontHei = (await fs.readFile(path.join(root, 'public/fonts/fandol-hei.woff2'))).toString('base64');
const fontBold = (await fs.readFile(path.join(root, 'public/fonts/fandol-hei-bold.woff2'))).toString('base64');
css = css.replace(/url\("\/fonts\/fandol-hei\.woff2[^"]*"\)/g, `url("data:font/woff2;base64,${fontHei}")`);
css = css.replace(/url\("\/fonts\/fandol-hei-bold\.woff2[^"]*"\)/g, `url("data:font/woff2;base64,${fontBold}")`);

const mock = await read('offline/mock-server.js');
const escapeInline = (s) => s.replace(/<\/script/gi, '<\\/script');
const offlineCss = `
.start-row, #join-form, #tutorial-btn, #spectate-ai-btn, #replay-list-btn { display: none !important; }
.offline-badge {
  margin: 0 0 10px; padding: 8px 10px; border: 1px solid rgba(102,224,210,.34);
  border-radius: 8px; background: rgba(102,224,210,.07); color: var(--cyan);
  font-size: 10px; display: flex; align-items: center; gap: 8px; justify-content: space-between;
}
.offline-badge b { font-size: 11px; letter-spacing: .08em; }
.offline-badge span { color: var(--muted); font-size: 8px; text-align: right; }
`;

let html = await read('public/index.html');
html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>塔魂：四境争锋 · 离线版</title>');
html = html.replace(/<link rel="stylesheet" href="\/styles\.css[^"]*" \/>/, () => `<style>\n${css}\n${offlineCss}\n</style>`);
html = html.replace(
  /<div class="start-panel">/,
  '<div class="offline-badge"><b>离线单机版</b><span>作者 DeepSeek · 无需联网 · 2 / 4 / 6 / 8 人 · 1v1 / AI 陪玩</span></div>\n            <div class="start-panel">'
);
const scripts = `<script>\n${escapeInline(engineBundle)}\n</script>
<script>\n${escapeInline(mock)}\n</script>
<script>try { sessionStorage.removeItem('tower-souls-session-v1'); } catch (e) {}</script>
<script>\n${escapeInline(client)}\n</script>`;
html = html.replace(/<script type="module" src="\/client\.js[^"]*"><\/script>/, () => scripts);
if (html.includes('/client.js')) throw new Error('client script not replaced');
if (html.includes('/styles.css')) throw new Error('stylesheet not replaced');
await fs.writeFile(path.join(root, '塔魂离线版.html'), html, 'utf8');
await fs.copyFile(path.join(root, '塔魂离线版.html'), path.join(root, 'public/offline.html'));
console.log(`offline.html built: ${(html.length / 1024).toFixed(1)} KiB`);
console.log('exports:', { heroes: heroExports.length, map: mapExports.length, engine: engineExports.length });
