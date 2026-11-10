// 官網「價格與活動」設定的共用邏輯（Node 建置與瀏覽器後台預覽共用，不依賴任何套件）。
// 設定來源：Supabase 資料表 site_settings（後台「價格與活動」分頁修改）。
// 建置時（tools/apply-settings.mjs）把頁面裡的 {{yc:名稱}} 換成實際文字，並產生 assets/rental-plan.js 的設定與公告列／卡片的 JSON。
// 規則：早鳥進行中顯示「早鳥價 NT$xxx／月（至 yyyy/m/d）」；早鳥結束只顯示一般價格。任何情況都不出現「原價」「特價」。
// 必須與 yc-axiom-sites 的 supabase/functions/_shared/pricing.mjs 的計算方式一致。

export const DEFAULTS = {
  prices: { single_month: 700, single_year: 7000, multi_month: 1000, multi_year: 10000, pro_month: 400, pro_year: 4000 },
  early: { enabled: true, single_month: 599, single_year: 5990, multi_month: 899, multi_year: 8990, deadline: '2027-02-03T23:59:00+08:00', quota: null },
  bar: { enabled: true, follow_early: true, text: '中小企業月租網站早鳥價 {早鳥價}／月，至 {截止日}', text_mobile: '早鳥價 {早鳥價}／月', button: '看方案 →', link: '/rental/', start: null, end: null, dismiss_days: 7 },
  display: { hide_prices: false, hide_contact: false, hide_contact_privacy: false },
  card: { enabled: true, follow_early: true, title: '早鳥價 {早鳥價}／月', body: '中小企業專屬月租網站，自己填內容就能上線', b1_text: '看方案', b1_link: '/rental/', b2_text: 'LINE 詢問', b2_link: 'https://line.me/R/ti/p/%40788cblaq', scroll_pct: 40, delay_sec: 10, pages: ['/', '/rental/', '/services/', '/pricing/', '/articles/*'], dismiss_days: 7, start: null, end: null }
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
    card: { ...DEFAULTS.card, ...(o.card || {}), pages: Array.isArray(o.card && o.card.pages) ? o.card.pages : DEFAULTS.card.pages },
    display: { ...DEFAULTS.display, ...(o.display || {}) }
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

// 英文版頁面（/en/）用的 {{yc:名稱}} 文字
export function tokensEn(s, eff) {
  const E = eff, sm = E.single.month, sy = E.single.year, mm = E.multi.month, my = E.multi.year;
  const label = (m) => (E.early ? 'early-bird ' + money(m) + '/month (until ' + E.until + ')' : money(m) + '/month');
  const labelHtml = (m) => (E.early ? '<strong>early-bird ' + money(m) + '/month</strong> (until ' + E.until + ')' : '<strong>' + money(m) + '/month</strong>');
  const yp = (m, y, sep) => { const k = y / m; return 'pay 12 months up front' + (Number.isInteger(k) && k < 12 ? ' for the price of ' + k : '') + sep + money(y); };
  const yr = (l, m, y) => { const k = y / m; return l + ' yearly (pay 12 months' + (Number.isInteger(k) && k < 12 ? ', charged for ' + k : '') + ')'; };
  const terms = (m) => (E.early ? 'early-bird NT$' + num(m) + ' per month (until ' + E.until + ')' : 'NT$' + num(m) + ' per month');
  const termsYear = (m, y) => { const k = y / m; return 'pay 12 months up front' + (Number.isInteger(k) && k < 12 ? ' and be charged for only ' + k : '') + ', i.e. NT$' + num(y); };
  return {
    ...tokens(s, eff),
    single_label: label(sm), multi_label: label(mm), single_label_html: labelHtml(sm), multi_label_html: labelHtml(mm),
    single_year_phrase: yp(sm, sy, ', '), multi_year_phrase: yp(mm, my, ', '), single_year_phrase_sp: yp(sm, sy, ' '), multi_year_phrase_sp: yp(mm, my, ' '),
    single_year_row: yr('One-page', sm, sy), multi_year_row: yr('Multi-page', mm, my),
    terms_single: terms(sm), terms_multi: terms(mm), terms_single_year: termsYear(sm, sy), terms_multi_year: termsYear(mm, my),
    terms_refund: 'For example, if you paid NT$' + num(sy) + ' for a one-page site for a year and used 3 months, the refund is ' + num(sy) + ' − 3 × ' + num(sm) + ' = NT$' + num(Math.max(0, sy - 3 * sm)),
    terms_lock_note: E.early ? 'Early-bird price: sites that start renting during the early-bird period (first payment confirmed within the period) keep the early-bird price for later renewals, multi-page upgrades and add-ons.'
      : 'Earlier promotional price: sites that started renting during an earlier promotion keep that price for later renewals, multi-page upgrades and add-ons.'
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
// ── 隱藏所有價錢（後台開關）──
// 開啟時，建置官網會把頁面上的價格（含後台設定的租用價格與頁面寫死的客製報價）換成「價格請洽詢」，
// 並拿掉結構化資料裡的價格。條款、編輯器、會員專區、後台與範例頁不處理（付款與條款仍需要實際價格）。
export const PRICE_NOTE = '價格請洽詢';
export const PRICE_NOTE_EN = 'Price on request';
export const HIDE_EXEMPT = /^(en\/)?(terms|builder|dashboard|admin|demo|showcase|rental\/styles|tools\/website-check|learn\/ai-friendly-content)\//;
export const pricesHidden = (s) => !!normalize(s).display.hide_prices;
const AMT = 'NT\\$\\s?\\d[\\d,]*(?:\\s*[–\\-~]\\s*(?:NT\\$\\s?)?\\d[\\d,]*)?\\+?';
const ZH_RE = new RegExp('(?:(?:從|約)\\s*)?(?:一次付 ?12 ?個月(?:只收 ?\\d+ ?個月|加)?[，,]?\\s*)?(?:早鳥價\\s*)?(?:每月加?\\s*)?' + AMT + '(?:\\s*起)?(?:\\s*[／/]\\s*[月年])?(?:\\s*起)?', 'g');
const EN_RE = new RegExp('(?:pay 12 months up front(?: for the price of \\d+)?,?\\s*)?(?:(?:from|starting at|starts? at|about|around|add|for)(?:\\s|&nbsp;)+)?(?:early-bird\\s+)?\\+?' + AMT + '(?:\\s*\\/\\s*(?:month|year|mo|yr))?(?:\\s+(?:a|per)\\s+(?:month|year))?', 'gi');
export function hidePriceText(text, en) {
  const N = en ? PRICE_NOTE_EN : PRICE_NOTE;
  let t = String(text)
    // 結構化資料：拿掉非 0 的價格（免費工具的 0 元保留）
    .replace(/"price":\s*"[1-9]\d*",\s*"priceCurrency":\s*"TWD",?\s*/g, '')
    .replace(en ? EN_RE : ZH_RE, N);
  const q = N.replace(/[$]/g, '');
  const until = en ? new RegExp('(' + q + '(?:</strong>)?)\\s*\\(until [\\d/]+\\)', 'g') : new RegExp('(' + q + '(?:</strong>)?)\\s*（至\\s*[\\d/]+）', 'g');
  const dup1 = en ? new RegExp(q + '\\s*\\((?:or\\s*)?' + q + '[^)]*\\)', 'g') : new RegExp(q + '[；，、\\s]{0,3}（' + q + '）', 'g');
  const dup2 = new RegExp(q + '([；;，,、\\s]{1,3}|\\s*and\\s*)' + q, 'g');
  for (let i = 0; i < 3; i++) t = t.replace(until, '$1').replace(dup1, N).replace(dup2, N);
  if (!en) t = t.replace(/價格請洽詢的/g, '');   // 「另有每月 NT$499 起的網站租用」→「另有網站租用」
  return t;
}

// ── 關閉聯絡方式（後台開關）──
// 開啟時，建置官網會隱藏所有聯絡管道：選單「免費諮詢」、右側 LINE／IG／Threads 浮動按鈕、各頁「加 LINE」按鈕與諮詢區塊、
// 頁尾與內文的聯絡連結、聯絡頁的表單與聯絡資訊，並從結構化資料與 llms.txt 拿掉 Email、LINE、IG、Threads。
// 隱私權政策與條款（法規需要的聯絡窗口）、編輯器、會員專區、後台不處理。
export const CONTACT_EXEMPT = /^(en\/)?(builder|dashboard|admin|demo|rental\/styles)\//;
// 隱私權政策與條款：只關掉選單、浮動按鈕、頁尾等站務元件；政策內文的聯絡方式另由「隱私權政策的聯絡方式也關閉」控制
export const CONTACT_LEGAL = /^(en\/)?(privacy|terms)\//;
export const privacyContactHidden = (s) => { const d = normalize(s).display; return !!(d.hide_contact && d.hide_contact_privacy); };
const CHROME_CSS = '<style id="yc-no-contact">.nav-cta,.mobile-cta,.mobile-social-a,.line-float,.social-float,.footer-status,.tab-line,.footer-nav a[href*="/contact"]{display:none!important}</style>';
export const contactHidden = (s) => !!normalize(s).display.hide_contact;
const CONTACT_A = 'a[href*="line.me"],a[href^="mailto:"],a[href^="tel:"],a[href*="instagram.com"],a[href*="threads.com"],a[href*="threads.net"],a[href*="/contact/"]:not(.lang-toggle),a[href$="/contact"]:not(.lang-toggle)';
const CONTACT_CSS = '<style id="yc-no-contact">.nav-cta,.mobile-cta,.line-float,.social-float,.contact-grid,.footer-status,.seo-cta,.geo-cta,#cta.cta,' + CONTACT_A +
  ',.cta-banner:has(' + CONTACT_A + '),li:has(>' + CONTACT_A.split(',').join('),li:has(>') + '),.contact-info-item{display:none!important}' +
  '.yc-nc-note{margin:48px 0 0;font-size:17px;line-height:1.8;opacity:.85}</style>';
const CONTACT_WORDS = /788cblaq|ycaxiom@gmail\.com|axiomyc2026|@ycaxiom|line\.me|threads\.(com|net)|instagram\.com/i;
function stripLd(o) {
  if (Array.isArray(o)) return o.map(stripLd).filter((x) => !(typeof x === 'string' && CONTACT_WORDS.test(x)));
  if (!o || typeof o !== 'object') return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'email' || k === 'telephone' || k === 'contactPoint') continue;
    if (typeof v === 'string' && CONTACT_WORDS.test(v) && /^(url|sameAs)$/.test(k)) continue;
    r[k] = stripLd(v);
  }
  return r;
}
export function hideContactHtml(html, en, mode, privacyToo) {
  if (mode === 'legal') {
    let t = String(html);
    if (/<\/head>/i.test(t) && !t.includes('id="yc-no-contact"')) t = t.replace(/<\/head>/i, CHROME_CSS + '\n</head>');
    if (privacyToo) {
      t = t.replace(/<li>(?:(?!<\/li>)[\s\S])*?(mailto:|line\.me)(?:(?!<\/li>)[\s\S])*?<\/li>/g, '')
        .replace(/<p>(?:(?!<\/p>)[\s\S])*?(mailto:|line\.me)(?:(?!<\/p>)[\s\S])*?<\/p>/g, '<p>' + (en ? 'Our contact channels are paused for now. They will be listed here again once they reopen.' : '目前暫停開放聯絡管道，恢復後會在這裡公布。') + '</p>')
        .replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (m, a, b, c) => { try { return a + JSON.stringify(stripLd(JSON.parse(b)), null, 2) + c; } catch (e) { return m; } });
    }
    return t;
  }
  let s = String(html).replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (m, a, b, c) => {
    try { return a + JSON.stringify(stripLd(JSON.parse(b)), null, 2) + c; } catch (e) { return m; }
  });
  if (/<\/head>/i.test(s) && !s.includes('id="yc-no-contact"')) s = s.replace(/<\/head>/i, CONTACT_CSS + '\n</head>');
  s = scrubInvites(s, en);
  // 聯絡頁：表單與聯絡資訊隱藏，改放一段說明
  if (s.includes('<div class="contact-grid"')) {
    const h = en ? 'Inquiries are paused for now.' : '目前暫停接受諮詢.';
    s = s.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/, (m, at) => '<h1' + at.replace(/\s*data-original="[^"]*"/g, '') + ' data-original="' + h + '">' + h + '</h1>')
      .replace(/(<div class="contact-grid")/, '<p class="yc-nc-note">' + (en ? 'Feel free to browse our work and articles.' : '歡迎先參考作品集與文章。') + '</p>\n$1');
  }
  return s;
}
// 內文裡「用 LINE 問我們」「聯絡我們協助」這類邀請聯絡的句子整句拿掉（只處理標籤之間的文字，不動程式與結構化資料）
const INVITE_ZH = /(用|加|傳|透過|先|直接)\s*LINE.{0,10}(我們|問|聊|說明|聯絡|告訴|進行|詢問)|LINE\s*(傳|問|聊|聯絡)|聯絡我們|免費諮詢|免費評估|歡迎.{0,6}(詢問|來信|聯絡)/;
const INVITE_EN = /\b(message|contact|reach|ask|tell|email) us\b|\b(via|on|over) LINE\b|\badd (us on )?LINE\b|free (consultation|assessment|quote)/i;
function dropInvites(text, en) {
  const re = en ? INVITE_EN : INVITE_ZH;
  if (!re.test(text)) return text;
  const parts = en ? text.split(/(?<=[.!?])(\s+)/) : text.match(/[^。！？]*[。！？]?/g) || [text];
  return parts.filter((x) => !re.test(x)).join('');
}
function scrubInvites(html, en) {
  // 「歡迎先用 LINE 或<a>聯絡表單</a>詢問。」這種句子中間夾連結
  html = html.replace(/[^。>]*(用|加)\s*LINE\s*或\s*<a[^>]*>[^<]*<\/a>[^。<]*。/g, '');
  return html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<[^>]+>)/).map((t, i) => (i % 2 ? t : dropInvites(t, en))).join('');
}
export function hideContactText(text) {
  return String(text).split('\n').filter((l) => !CONTACT_WORDS.test(l)).join('\n');
}

const fill = (t, v) => String(t || '').replace(/\{[^{}]+\}/g, (m) => (m in v ? v[m] : m));

// 建置時寫成 assets/site-promo.json 的內容；前端顯示前再檢查一次開始與結束時間
export function promo(s, eff, now = new Date()) {
  const n = normalize(s), v = promoVars(n, eff);
  // 隱藏價錢時，公告列與卡片（內容多半是價格）一併不顯示
  const live = (x) => !n.display.hide_prices && !!x.enabled && (!x.follow_early || eff.early) && !(x.end && now.getTime() > ms(x.end));
  const id = (x) => { const k = JSON.stringify(x); let h = 5381; for (let i = 0; i < k.length; i++) h = (Math.imul(h, 33) ^ k.charCodeAt(i)) >>> 0; return h.toString(36); };
  const bar = { show: live(n.bar), text: fill(n.bar.text, v), text_mobile: fill(n.bar.text_mobile || n.bar.text, v), button: fill(n.bar.button, v), link: n.bar.link || '', start: n.bar.start || null, end: n.bar.end || null, dismiss_days: Number(n.bar.dismiss_days) || 0 };
  const noC = !!n.display.hide_contact && CONTACT_WORDS.test(String(n.card.b2_link || ''));
  const card = { show: live(n.card), title: fill(n.card.title, v), body: fill(n.card.body, v), b1_text: fill(n.card.b1_text, v), b1_link: n.card.b1_link || '', b2_text: noC ? '' : fill(n.card.b2_text, v), b2_link: noC ? '' : n.card.b2_link || '', scroll_pct: Number(n.card.scroll_pct) || 0, delay_sec: Number(n.card.delay_sec) || 0, pages: n.card.pages, start: n.card.start || null, end: n.card.end || null, dismiss_days: Number(n.card.dismiss_days) || 0 };
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

