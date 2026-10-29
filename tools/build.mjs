// 產生網站實際載入的壓縮檔，並自動更新 HTML 裡的版本號（?v=內容雜湊），讓瀏覽器拿到新版。
// 用法：npm run build（產生）／npm run check（只檢查 dist 是否和原始檔一致，GitHub Actions 用）
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

// 每一項：原始檔 → 輸出檔；bundle＝把 import 的檔案一起打包
const TARGETS = [
  // 全站共用：site.css 先刪掉網站裡完全沒用到的規則，再壓縮；site.js 只壓縮空白與語法（頁面 onclick 會直接呼叫裡面的函式）
  { in: 'assets/site.css', out: 'assets/dist/site.min.css', type: 'site-css' },
  { in: 'assets/site.js', out: 'assets/dist/site.min.js', type: 'script' },
  { in: 'assets/seo-tool.js', out: 'assets/dist/seo-tool.min.js', type: 'script' },
  { in: 'assets/seo-tool.css', out: 'assets/dist/seo-tool.min.css', type: 'css' },
  // 編輯器：builder.js 與它 import 的 preview-fx.js 打包成一個檔（共用版型模組另外從 yc-axiom-sites 的 templates/dist 載入）
  { in: 'builder/builder.js', out: 'builder/dist/builder.min.js', type: 'bundle' },
  { in: 'builder/preview/preview.js', out: 'builder/dist/preview.min.js', type: 'bundle' },
  { in: 'builder/builder.css', out: 'builder/dist/builder.min.css', type: 'css' },
];

async function make(t) {
  const common = { entryPoints: [join(ROOT, t.in)], write: false, logLevel: 'silent', charset: 'utf8', legalComments: 'none', target: ['es2019', 'safari13'] };
  let r;
  if (t.type === 'site-css') return minCss(await purgeSiteCss(readFileSync(join(ROOT, t.in), 'utf8')));
  if (t.type === 'css') r = await build({ ...common, loader: { '.css': 'css' }, minify: true });
  // 一般腳本：頂層的函式名稱會被 HTML 的 onclick 直接呼叫，所以只壓縮空白與語法，不改名字
  else if (t.type === 'script') r = await build({ ...common, minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false });
  else r = await build({ ...common, target: ['es2020'], bundle: true, format: 'esm', minify: true, external: t.external || [] });
  return r.outputFiles[0].text;
}

// 刪掉 site.css 裡網站完全沒用到的選擇器：掃描所有頁面（不含 demo 與編輯器）與 assets 裡的程式
// 動態加上的狀態 class（open、active、visible…）、data-theme、aria-* 一律保留
async function purgeSiteCss(css) {
  const { PurgeCSS } = await import('purgecss');
  const files = execSync('git ls-files "*.html" "assets/*.js"', { cwd: ROOT }).toString().trim().split('\n')
    .filter((f) => f && !/^demo\/|^builder\/|vendor\/|assets\/dist\//.test(f));
  const res = await new PurgeCSS().purge({
    content: files.map((f) => ({ raw: readFileSync(join(ROOT, f), 'utf8'), extension: f.endsWith('.js') ? 'js' : 'html' })),
    css: [{ raw: css }],
    defaultExtractor: (c) => c.match(/[A-Za-z0-9_-]+/g) || [],
    safelist: { standard: [/^(open|active|visible|in|show|showing|loaded|scrolled|revealed|is-|has-|js-)/], greedy: [/data-theme/, /aria-/], keyframes: [/.*/], variables: [/.*/] },
  });
  return res[0].css;
}
async function minCss(css) {
  const r = await build({ stdin: { contents: css, loader: 'css' }, write: false, minify: true, logLevel: 'silent', charset: 'utf8', legalComments: 'none', target: ['safari13', 'chrome90'] });
  return r.outputFiles[0].text;
}

const hashOf = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);
const htmlFiles = execSync('git ls-files "*.html"', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean);
let stale = [];
for (const t of TARGETS) {
  const text = await make(t);
  const outPath = join(ROOT, t.out);
  const old = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
  if (old !== text) {
    if (CHECK) stale.push(t.out);
    else { mkdirSync(dirname(outPath), { recursive: true }); writeFileSync(outPath, text); }
  }
  // HTML 裡引用這個檔案的地方，版本號換成內容雜湊
  const h = hashOf(text);
  const re = new RegExp('(' + t.out.split('/').pop().replace(/[.]/g, '\\.') + ')\\?v=[^"\']*', 'g');
  for (const f of [...htmlFiles, ...(t.refsIn || [])]) {
    const p = join(ROOT, f); const s = readFileSync(p, 'utf8');
    if (!s.includes(t.out.split('/').pop() + '?v=')) continue;
    const n = s.replace(re, '$1?v=' + h);
    if (n !== s) { if (CHECK) stale.push(f + '（' + t.out + ' 版本號）'); else writeFileSync(p, n); }
  }
  if (!CHECK) console.log(t.out.padEnd(36), (text.length / 1024).toFixed(1) + 'KB', '（原始檔', (readFileSync(join(ROOT, t.in)).length / 1024).toFixed(1) + 'KB）', 'v=' + h);
}
if (CHECK) {
  if (stale.length) { console.error('dist 不是最新，請執行 npm run build：\n  ' + stale.join('\n  ')); process.exit(1); }
  console.log('dist 與原始檔一致');
}
