// 建置官網時套用後台「價格與活動」設定（由 yc-axiom-sites 的 deploy-official-site.yml 在部署前執行）。
// 用法：node tools/apply-settings.mjs <要部署的資料夾>
//   1. 從 Supabase 讀 site_settings（公開可讀，用 assets/supabase-config.js 裡的公開金鑰）與已使用的早鳥名額
//   2. 把所有頁面、llms.txt 裡的 {{yc:名稱}} 換成實際價格文字（含結構化資料的 Offer 價格）
//   3. 改寫 assets/rental-plan.js 的設定、產生 assets/site-promo.json（公告列與卡片）、settings-state.json（後台顯示狀態）
//   4. 每個公開頁面加上頂部公告列（建置時就放進 HTML，前端只決定要不要顯示，不會造成版面跳動）
//   5. 留一份未套用的 首頁／rental／pricing 範本給後台「預覽」使用
// 讀不到設定或還有沒換掉的標記時，建置失敗（不部署），正式網站維持舊版。
// 測試：SITE_SETTINGS_FILE=設定.json SETTINGS_USED=0 SETTINGS_NOW=2027-03-01T00:00:00Z node tools/apply-settings.mjs <資料夾>
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { normalize, effective, tokens, render, hasTokens, promo, planSettings, stateOf, barHead, barBody, tokensEn, pricesHidden, hidePriceText, HIDE_EXEMPT, contactHidden, hideContactHtml, hideContactText, CONTACT_EXEMPT } from './site-settings.mjs';

const OUT = process.argv[2];
if (!OUT || !existsSync(OUT)) { console.log('::error::缺少要部署的資料夾'); process.exit(1); }
const fail = (m) => { console.log('::error::' + m); process.exit(1); };

async function loadSettings() {
  if (process.env.SITE_SETTINGS_FILE) {
    const j = JSON.parse(readFileSync(process.env.SITE_SETTINGS_FILE, 'utf8'));
    return { data: j.data || j, version: j.version || 0, used: Number(process.env.SETTINGS_USED || 0) };
  }
  const cfg = readFileSync(join(OUT, 'assets/supabase-config.js'), 'utf8');
  const url = (cfg.match(/supabaseUrl:\s*'([^']+)'/) || [])[1], key = (cfg.match(/supabaseAnonKey:\s*'([^']+)'/) || [])[1];
  if (!url || !key) fail('assets/supabase-config.js 找不到 Supabase 網址或公開金鑰');
  const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const r = await fetch(url + '/rest/v1/site_settings?id=eq.1&select=data,version,updated_at', { headers: h });
  if (!r.ok) fail('讀取 site_settings 失敗：HTTP ' + r.status);
  const rows = await r.json();
  if (!rows[0]) fail('site_settings 沒有資料');
  const u = await fetch(url + '/rest/v1/rpc/early_bird_used', { method: 'POST', headers: h, body: '{}' });
  const used = u.ok ? Number(await u.json()) || 0 : 0;
  return { data: rows[0].data, version: rows[0].version, used };
}

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === '.git' || n === 'node_modules') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

// 公告列：不放在編輯器、會員專區、後台、工具內嵌頁、範例網站、業務展示頁
const NO_BAR = /^(en|builder|dashboard|admin|demo|showcase|seo\/dashboard|rental\/styles)\/|^[a-z-]+-tool\.html$|^google[0-9a-f]+\.html$/;
const S = await loadSettings();
const data = normalize(S.data);
const now = process.env.SETTINGS_NOW ? new Date(process.env.SETTINGS_NOW) : new Date();
const eff = effective(data, now, S.used);
const tok = tokens(data, eff), tokEn = tokensEn(data, eff);
const pr = promo(data, eff, now);
const HIDE = pricesHidden(data), NOC = contactHidden(data);
console.log('價格設定 v' + S.version + '：早鳥' + (eff.early ? '進行中（至 ' + eff.until + '）' : '未進行') + '，一頁版 ' + tok.from + '／月、多頁版 ' + tok.multi_from + '／月；公告列' + (pr.bar.show ? '顯示' : '不顯示') + '、卡片' + (pr.card.show ? '顯示' : '不顯示') + (HIDE ? '；官網價錢隱藏中' : '') + (NOC ? '；聯絡方式關閉中' : ''));

// 預覽用範本（套用前）
const PREVIEW = { 'index.html': 'home.html', 'rental/index.html': 'rental.html', 'pricing/index.html': 'pricing.html' };
mkdirSync(join(OUT, 'admin/preview-src'), { recursive: true });
for (const [src, dst] of Object.entries(PREVIEW)) if (existsSync(join(OUT, src))) copyFileSync(join(OUT, src), join(OUT, 'admin/preview-src', dst));

let changed = 0, bars = 0, hidden = 0, noc = 0;
for (const f of walk(OUT)) {
  const rel = relative(OUT, f).split('\\').join('/');
  if (rel.startsWith('admin/preview-src/')) continue;
  if (!/\.(html|txt|xml|json|webmanifest)$/.test(rel)) continue;
  let s = readFileSync(f, 'utf8'), o = s;
  if (hasTokens(s)) s = render(s, rel.startsWith('en/') ? tokEn : tok);
  if (HIDE && !HIDE_EXEMPT.test(rel) && !rel.startsWith('assets/')) {
    s = hidePriceText(s, rel.startsWith('en/'));
    hidden += s !== o ? 1 : 0;
  }
  if (NOC && !CONTACT_EXEMPT.test(rel) && !rel.startsWith('assets/')) {
    if (rel.endsWith('.html')) s = hideContactHtml(s, rel.startsWith('en/'));
    else if (rel.endsWith('.txt')) s = hideContactText(s);
    if (s !== o) noc++;
  }
  if (rel.endsWith('.html') && pr.bar.show && !NO_BAR.test(rel) && /<\/head>/i.test(s) && /<body[^>]*>/i.test(s) && !s.includes('id="yc-bar"')) {
    s = s.replace(/<\/head>/i, barHead(pr.bar) + '\n</head>').replace(/<body([^>]*)>/i, (m) => m + '\n' + barBody(pr.bar));
    bars++;
  }
  if (s !== o) { writeFileSync(f, s); changed++; }
}

// assets/rental-plan.js 內嵌設定
const rp = join(OUT, 'assets/rental-plan.js');
if (existsSync(rp)) {
  const s = readFileSync(rp, 'utf8');
  const re = /(\/\/ @yc-settings-begin\n)[\s\S]*?(\n\/\/ @yc-settings-end)/;
  if (!re.test(s)) fail('assets/rental-plan.js 找不到 @yc-settings 標記');
  writeFileSync(rp, s.replace(re, (m, a, b) => a + 'const S = ' + JSON.stringify(planSettings(data, eff)) + ';' + b));
}

writeFileSync(join(OUT, 'assets/site-promo.json'), JSON.stringify({ version: S.version, built_at: now.toISOString(), early: eff.early, bar: pr.bar.show ? pr.bar : { show: false }, card: pr.card.show ? pr.card : { show: false } }));
writeFileSync(join(OUT, 'settings-state.json'), JSON.stringify({ version: S.version, built_at: now.toISOString(), state: stateOf(data, now, S.used), used: S.used }));

// 最後檢查：不能留下沒換掉的標記
const left = walk(OUT).filter((f) => /\.(html|txt|xml|js|json)$/.test(f) && !relative(OUT, f).startsWith('admin/preview-src') && !relative(OUT, f).startsWith('tools/') && hasTokens(readFileSync(f, 'utf8')));
if (left.length) fail('還有沒換掉的價格標記：' + left.map((f) => relative(OUT, f)).join('、'));
// 隱藏價錢時：結構化資料必須仍是合法 JSON，公開頁面不能留下價格
if (HIDE) {
  const leak = [];
  for (const f of walk(OUT)) {
    const rel = relative(OUT, f).split('\\').join('/');
    if (!rel.endsWith('.html') || HIDE_EXEMPT.test(rel) || rel.startsWith('admin/')) continue;
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch (e) { fail(rel + ' 的結構化資料在隱藏價錢後格式錯誤'); } }
    if (/NT\$\s?[1-9]/.test(s.replace(/<script[\s\S]*?<\/script>/g, ''))) leak.push(rel);
  }
  if (leak.length) fail('隱藏價錢後仍有價格：' + leak.join('、'));
}
console.log('已套用：' + changed + ' 個檔案，公告列 ' + bars + ' 頁' + (HIDE ? '，隱藏價錢 ' + hidden + ' 個檔案' : '') + (NOC ? '，關閉聯絡方式 ' + noc + ' 個檔案' : ''));
