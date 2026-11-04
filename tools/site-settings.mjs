// 官網「價格與活動」設定的共用邏輯（Node 建置與瀏覽器後台預覽共用，不依賴任何套件）。
// 設定來源：Supabase 資料表 site_settings（後台「價格與活動」分頁修改）。
// 建置時（tools/apply-settings.mjs）把頁面裡的 {{yc:名稱}} 換成實際文字，並產生 assets/rental-plan.js 的設定與公告列／卡片的 JSON。
// 規則：早鳥進行中顯示「早鳥價 NT$xxx／月（至 yyyy/m/d）」；早鳥結束只顯示一般價格。任何情況都不出現「原價」「特價」。
// 必須與 yc-axiom-sites 的 supabase/functions/_shared/pricing.mjs 的計算方式一致。

export const DEFAULTS = {
  prices: { single_month: 700, single_year: 7000, multi_month: 1000, multi_year: 10000, pro_month: 400, pro_year: 4000 },
  early: { enabled: true, single_month: 599, single_year: 5990, multi_month: 899, multi_year: 8990, deadline: '2027-02-03T23:59:00+08:00', quota: null },
  bar: { enabled: true, follow_early: true, text: '小店月租網站早鳥價 {早鳥價}／月，至 {截止日}', text_mobile: '早鳥價 {早鳥價}／月', button: '看方案 →', link: '/rental/', start: null, end: null, dismiss_days: 7 },
  card: { enabled: true, follow_early: true, title: '早鳥價 {早鳥價}／月', body: '小店專屬月租網站，自己填內容就能上線', b1_text: '看方案', b1_link: '/rental/', b2_text: 'LINE 詢問', b2_link: 'https://line.me/R/ti/p/%40788cblaq', scroll_pct: 40, delay_sec: 10, pages: ['/', '/rental/', '/services/', '/pricing/', '/articles/*'], dismiss_days: 7, start: null, end: null }
};

// 卡片永遠不顯示的頁面（工具頁、編輯器、會員專區、後台）
export const CARD_NEVER = [/^\/seo\//, /^\/geo\//, /^\/tools\//, /^\/builder\//, /^\/dashboard\//, /^\/admin\//];

export const num = (n) => Number(n).toLocaleString('en-US');
export const money = (n) => 'NT$' + num(n);
const ms = (iso) => (iso ? Date.parse(iso) : NaN);

// ISO 時間 → 台灣日期「2027/2/3」
export function taipeiDate(iso) {
  const t = ms(iso); if (!Number.isFinite(t)) return '';
  const d = new Date(t + 8 * 3600 * 1000);
  return d.getUTCFullYear() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
}

// 補齊缺少的欄位（舊設定或部分設定）
export function normalize(s) {
  const o = s || {};
  return {
    prices: { ...DEFAULTS.prices, ...(o.prices || {}) },
    early: { ...DEFAULTS.early, ...(o.early || {}) },
    bar: { ...DEFAULTS.bar, ...(o.bar || {}) },
    card: { ...DEFAULTS.card, ...(o.card || {}), pages: Array.isArray(o.card && o.card.pages) ? o.card.pages : DEFAULTS.card.pages }
  };
}

// 早鳥是否進行中：開關打開、還沒過截止時間、名額（選填）還沒滿
export function earlyActive(s, now = new Date(), used = 0) {
  const e = normalize(s).early;
  if (!e.enabled) return false;
  if (!(now.getTime() <= ms(e.deadline))) return false;
  if (e.quota && used >= Number(e.quota)) return false;
  return true;
}

// 新客人目前適用的價格
export function effective(s, now = new Date(), used = 0) {
  const n = normalize(s), early = earlyActive(n, now, used);
  const src = early ? n.early : n.prices;
  return {
    early,
    until: taipeiDate(n.early.deadline),
    single: { month: src.single_month, year: src.single_year },
    multi: { month: src.multi_month, year: src.multi_year },
    pro: { month: n.prices.pro_month, year: n.prices.pro_year }
  };
}

// 「一次付 12 個月…」：年繳剛好等於整數個月時說「只收 N 個月」
export function yearPhrase(month, year, sep = '，') {
  const k = year / month;
  return Number.isInteger(k) && k < 12 ? '一次付 12 個月只收 ' + k + ' 個月' + sep + money(year) : '一次付 12 個月' + sep + money(year);
}
function yearRow(label, month, year) {
  const k = year / month;
  return label + '年繳（一次付 12 個月' + (Number.isInteger(k) && k < 12 ? '，只收 ' + k + ' 個月' : '') + '）';
}

// 條款版本：價格或早鳥條件改變時跟著變，客人下次發佈時要重新同意
export function termsVersion(s) {
  const n = normalize(s);
  const key = JSON.stringify([n.prices, n.early.single_month, n.early.single_year, n.early.multi_month, n.early.multi_year, n.early.deadline]);
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return '2026-11-v9-' + h.toString(36).slice(0, 6);
}

// 頁面裡 {{yc:名稱}} 對應的文字
export function tokens(s, eff) {
  const E = eff, sm = E.single.month, sy = E.single.year, mm = E.multi.month, my = E.multi.year;
  const label = (m) => (E.early ? '早鳥價 ' + money(m) + '／月（至 ' + E.until + '）' : '每月 ' + money(m));
  const labelHtml = (m) => (E.early ? '<strong>早鳥價 ' + money(m) + '／月</strong>（至 ' + E.until + '）' : '<strong>' + money(m) + '／月</strong>');
  const terms = (m) => (E.early ? '早鳥價每月新台幣 ' + num(m) + ' 元（至 ' + E.until + '）' : '每月新台幣 ' + num(m) + ' 元');
  const termsYear = (m, y) => { const k = y / m; return '一次付 12 個月' + (Number.isInteger(k) && k < 12 ? '只收 ' + k + ' 個月' : '') + '，即新台幣 ' + num(y) + ' 元'; };
  return {
    from: money(sm), multi_from: money(mm),
    single_label: label(sm), multi_label: label(mm),
    single_label_html: labelHtml(sm), multi_label_html: labelHtml(mm),
    single_year: money(sy), multi_year: money(my),
    single_year_phrase: yearPhrase(sm, sy), multi_year_phrase: yearPhrase(mm, my),
    single_year_phrase_sp: yearPhrase(sm, sy, ' '), multi_year_phrase_sp: yearPhrase(mm, my, ' '),
    single_year_row: yearRow('一頁版', sm, sy), multi_year_row: yearRow('多頁版', mm, my),
    pro_month: money(E.pro.month), pro_year: money(E.pro.year),
    single_month_num: String(sm), multi_month_num: String(mm), pro_month_num: String(E.pro.month),
    terms_single: terms(sm), terms_multi: terms(mm),
    terms_single_year: termsYear(sm, sy), terms_multi_year: termsYear(mm, my),
    terms_pro_month: num(E.pro.month), terms_pro_year: num(E.pro.year),
    terms_refund: '例如一頁版一次付 ' + num(sy) + ' 元、已使用 3 個月，退還 ' + num(sy) + ' − 3 × ' + num(sm) + ' = ' + num(Math.max(0, sy - 3 * sm)) + ' 元',
    terms_lock_note: E.early ? '早鳥價：在早鳥活動期間開始租用（第一次確認收款在活動期間內）的網站，之後續約、升級多頁版與加購進階功能，都維持當時的早鳥價格。'
      : '先前活動價格：在先前價格活動期間開始租用的網站，之後續約、升級多頁版與加購進階功能，都維持當時的價格。',
    terms_version: termsVersion(s)
  };
}

const TOKEN_RE = /\{\{yc:([a-z_]+)\}\}/g;
export function render(text, tok) {
  return text.replace(TOKEN_RE, (m, k) => {
    if (!(k in tok)) throw new Error('未知的價格標記 ' + m);
    return tok[k];
  });
}
export const hasTokens = (text) => /\{\{yc:[a-z_]+\}\}/.test(text);

// 公告列與卡片文字裡可以用的變數
export function promoVars(s, eff) {
  const n = normalize(s);
  return { '{早鳥價}': money(n.early.single_month), '{多頁早鳥價}': money(n.early.multi_month), '{截止日}': taipeiDate(n.early.deadline), '{一頁版價}': money(eff.single.month), '{多頁版價}': money(eff.multi.month) };
}
const fill = (t, v) => String(t || '').replace(/\{[^{}]+\}/g, (m) => (m in v ? v[m] : m));

// 建置時寫成 assets/site-promo.json 的內容；前端顯示前再檢查一次開始與結束時間
export function promo(s, eff, now = new Date()) {
  const n = normalize(s), v = promoVars(n, eff);
  const live = (x) => !!x.enabled && (!x.follow_early || eff.early) && !(x.end && now.getTime() > ms(x.end));
  const id = (x) => { const k = JSON.stringify(x); let h = 5381; for (let i = 0; i < k.length; i++) h = (Math.imul(h, 33) ^ k.charCodeAt(i)) >>> 0; return h.toString(36); };
  const bar = { show: live(n.bar), text: fill(n.bar.text, v), text_mobile: fill(n.bar.text_mobile || n.bar.text, v), button: fill(n.bar.button, v), link: n.bar.link || '', start: n.bar.start || null, end: n.bar.end || null, dismiss_days: Number(n.bar.dismiss_days) || 0 };
  const card = { show: live(n.card), title: fill(n.card.title, v), body: fill(n.card.body, v), b1_text: fill(n.card.b1_text, v), b1_link: n.card.b1_link || '', b2_text: fill(n.card.b2_text, v), b2_link: n.card.b2_link || '', scroll_pct: Number(n.card.scroll_pct) || 0, delay_sec: Number(n.card.delay_sec) || 0, pages: n.card.pages, start: n.card.start || null, end: n.card.end || null, dismiss_days: Number(n.card.dismiss_days) || 0 };
  bar.id = id(bar); card.id = id(card);   // 內容改變時 id 會變，客人之前的「關閉」只對舊內容有效
  return { bar, card };
}

// 每日檢查用：目前狀態（早鳥／公告列／卡片是否進行中）
export function stateOf(s, now = new Date(), used = 0) {
  const eff = effective(s, now, used), p = promo(s, eff, now);
  return { early: eff.early, bar: p.bar.show, card: p.card.show };
}

// assets/rental-plan.js 內嵌的設定（編輯器、會員專區、後台確認收款用）
export function planSettings(s, eff) {
  const n = normalize(s);
  return {
    early: eff.early, until: eff.until,
    single: eff.single, multi: eff.multi, pro: eff.pro,
    regular: { single: { month: n.prices.single_month, year: n.prices.single_year }, multi: { month: n.prices.multi_month, year: n.prices.multi_year } },
    terms_version: termsVersion(n)
  };
}

// 卡片在這一頁要不要出現（後台的頁面清單；結尾 * 代表底下所有頁面）
export function cardAllowed(pages, path) {
  if (CARD_NEVER.some((re) => re.test(path))) return false;
  return (pages || []).some((p) => (p.endsWith('*') ? path.startsWith(p.slice(0, -1)) : path === p || path === p + 'index.html'));
}

// 頂部公告列的 HTML（建置時插入每個公開頁面；後台預覽也用同一份）
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function barHead(bar) {
  const cfg = JSON.stringify({ id: bar.id, start: bar.start, end: bar.end, days: bar.dismiss_days });
  return `<style id="yc-bar-css">:root{--yc-bar-h:0px}html.has-yc-bar{--yc-bar-h:40px}@media(max-width:768px){html.has-yc-bar{--yc-bar-h:38px}}
.yc-bar{display:none}html.has-yc-bar .yc-bar{display:flex;position:fixed;top:0;left:0;right:0;height:var(--yc-bar-h);z-index:70;align-items:center;justify-content:center;background:#B59B6A;color:#14120f;font:600 14px/1.2 "Instrument Sans","Noto Sans TC",system-ui,sans-serif;padding:0 48px}
html.has-yc-bar body{padding-top:var(--yc-bar-h)}html.has-yc-bar body>nav{top:var(--yc-bar-h)}html.has-yc-bar #scroll-progress{top:var(--yc-bar-h)}
.yc-bar a{color:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:12px;min-height:100%;max-width:100%;white-space:nowrap;overflow:hidden}
.yc-bar-t{overflow:hidden;text-overflow:ellipsis}.yc-bar-tm{display:none}.yc-bar-b{border-bottom:1.5px solid currentColor;flex:none}
.yc-bar a:focus-visible,.yc-bar-x:focus-visible{outline:2px solid #14120f;outline-offset:2px}
.yc-bar-x{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:40px;height:40px;border:0;background:none;color:inherit;font-size:22px;line-height:1;cursor:pointer}
@media(max-width:768px){.yc-bar{font-size:13px;padding:0 44px 0 12px}.yc-bar-td{display:none}.yc-bar-tm{display:inline}}</style>
<script>(function(){var B=${cfg};var n=Date.now();if(B.start&&n<Date.parse(B.start))return;if(B.end&&n>Date.parse(B.end))return;try{var v=JSON.parse(localStorage.getItem('yc-promo-bar')||'null');if(v&&v.id===B.id&&n-v.t<B.days*864e5)return}catch(e){}document.documentElement.classList.add('has-yc-bar')})();</script>`;
}
export function barBody(bar) {
  return `<div class="yc-bar" id="yc-bar" role="region" aria-label="優惠公告"><a href="${esc(bar.link)}" data-yc-promo="bar"><span class="yc-bar-t yc-bar-td">${esc(bar.text)}</span><span class="yc-bar-t yc-bar-tm">${esc(bar.text_mobile)}</span>${bar.button ? `<span class="yc-bar-b">${esc(bar.button)}</span>` : ''}</a><button type="button" class="yc-bar-x" aria-label="關閉優惠公告">×</button></div>
<script>(function(){var r=document.documentElement,b=document.getElementById('yc-bar');if(!b)return;var D=${Number(bar.dismiss_days) || 0},ID=${JSON.stringify(bar.id)};function ga(e){try{if(window.gtag)gtag('event',e,{placement:'bar'})}catch(x){}}
if(r.classList.contains('has-yc-bar'))ga('early_bird_view');
function close(){r.classList.remove('has-yc-bar');try{localStorage.setItem('yc-promo-bar',JSON.stringify({id:ID,t:Date.now()}))}catch(x){}ga('early_bird_close')}
b.querySelector('.yc-bar-x').addEventListener('click',close);b.querySelector('a').addEventListener('click',function(){ga('early_bird_click')});
b.addEventListener('keydown',function(e){if(e.key==='Escape'){close();var m=document.querySelector('main');if(m){m.setAttribute('tabindex','-1');m.focus({preventScroll:true})}}});})();</script>`;
}

