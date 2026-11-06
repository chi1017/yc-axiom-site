/* YC AXIOM 網站編輯器：左邊填內容、右邊即時預覽。
   預覽用的版型函式與「正式建置」是同一份程式（yc-axiom-sites 的 templates/shared/*），所以所見即所得。 */
import { startReveal, wireNav, morphFrame, settleReveal, wireEditPills, wireInlineEdit, flashSection, sectionKey } from './preview-fx.js';
const YC = window.YC;
const $ = (s, r) => (r || document).querySelector(s);
// 版型檔案由官網自己提供（部署官網時從 yc-axiom-sites 複製到 /tpl/）
const DEFAULT_TPL_BASE = location.origin + '/tpl/';
const SAVE_DELAY = 2000, RENDER_DELAY = 90;
// 條款版本：由後台價格設定產生（assets/rental-plan.js 的 TERMS_VERSION）；價格改變時版本會變，客人下次發佈要重新同意
const termsVersion = () => (S.plan && S.plan.TERMS_VERSION) || '2026-10-v8';
const MAX_ORIGINAL = 5 * 1024 * 1024, MAX_EDGE = 1600;
// 標題字型檔（預覽用完整的常用字版本；正式網站只放用到的字）
const FONT_FILE = { serif: 'NotoSerifTC-Bold-common.woff2', sans: 'NotoSansTC-Bold-common.woff2', round: 'Huninn-common.woff2', kai: 'LXGWWenKaiTC-Bold-common.woff2' };

// 載入時記住 ?tplbase=（之後網址會被整理掉）
const TPL_Q = new URLSearchParams(location.search).get('tplbase');
function tplBase() {
  // 只有本機測試（127.0.0.1／localhost）允許用 ?tplbase= 指定版型來源
  const q = TPL_Q;
  if (q && /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/$/.test(q)) return q;
  return DEFAULT_TPL_BASE;
}

// ── 小工具 ──
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }
const clone = (o) => JSON.parse(JSON.stringify(o));
const pad = (n) => (n < 10 ? '0' : '') + n;
function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms || 3200); }
function modal(title, bodyNodes, actions) {
  closeModal();
  const back = h('div', { class: 'mback', id: 'modal', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal' }, h('h3', { text: title }), ...[].concat(bodyNodes), h('div', { class: 'acts' }, actions)));
  back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
  document.body.append(back);
  const first = back.querySelector('button.primary') || back.querySelector('button'); if (first) first.focus({ preventScroll: true });
  return back;
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); }
function gate(nodes) { const g = $('#gate'); g.hidden = false; g.replaceChildren(h('div', { class: 'gate-card' }, nodes)); $('#app').hidden = true; }

const S = {
  lib: null, plan: null, site: null, content: null, palette: 'forest', sections: null, slug: '', slugState: { ok: true, msg: '' },
  layout: 'single', pages: null, page: 'home', pageList: [],
  events: [], dirty: false, saving: false, saveErr: false, lastSaved: null, fresh: new Set(), timers: {}, publishing: false, hist: [], hpos: 0, applying: false
};

// ── 試用模式：沒登入也能用範例內容試編輯，內容暫存在這個瀏覽器（localStorage）；按儲存／發佈才要求登入 ──
const TRIAL_KEY = 'yc-builder-trial';
function readTrial() { try { const v = JSON.parse(localStorage.getItem(TRIAL_KEY) || 'null'); return v && v.content ? v : null; } catch (e) { return null; } }
function writeTrial(extra) {
  const cur = readTrial() || {};
  const v = Object.assign(cur, { template: S.site.template, palette: S.palette, sections: S.sections, layout: S.layout === 'multi' ? 'multi' : 'single', content: S.content, slug: S.slug, savedAt: Date.now() }, extra || {});
  try { localStorage.setItem(TRIAL_KEY, JSON.stringify(v)); return true; } catch (e) { return false; }
}
function clearTrial() { try { localStorage.removeItem(TRIAL_KEY); } catch (e) { /* ignore */ } }
// 範例內容：與「版型展示」同一份虛構店家資料（templates/gallery/samples.mjs）；讀不到時用空白內容
async function sampleContent(key) {
  const L = S.lib, c = L.emptyContent();
  try {
    const M = await import(tplBase() + 'templates/gallery/samples.mjs');
    const sm = M.SAMPLES.find((x) => x.k === key) || M.SAMPLES.find((x) => x.k === 'cafe');
    Object.assign(c, { name: sm.name, tagline: sm.tag, intro: sm.intro, address: sm.area + (sm.area.endsWith('全區') ? '' : '示範路 100 號'), phone: '04-0000-0000',
      menu: sm.items.map(([name, price]) => ({ name, price: price || null })), faq: sm.faq.map(([q, a]) => ({ q, a })) });
    if (M.HOURS && M.HOURS[sm.h]) c.hours = M.HOURS[sm.h];
    return { content: L.normalizeContent(c), palette: sm.pal || 'forest' };
  } catch (e) { c.name = '我的店'; return { content: L.normalizeContent(c), palette: 'forest' }; }
}
// 官網「風格範例」：/builder/?showcase=<id> 直接套用版面、配色、字型、區塊順序與範例文字（照片請換成自己的）
async function showcasePreset(id) {
  if (!/^[a-z0-9-]{3,30}$/.test(id || '')) return null;
  try { const M = await import(tplBase() + 'templates/gallery/showcases.mjs'); return M.showcaseForEditor(id); } catch (e) { return null; }
}
async function startTrial() {
  booted = 'trial';
  gate([h('p', { text: '載入編輯器…' })]);
  try {
    await loadLib();
    const L = S.lib, q = new URLSearchParams(location.search);
    const preset = await showcasePreset(q.get('showcase'));
    if (preset) {
      clearTrial();
      S.trial = true; document.body.classList.add('is-trial');
      const multi = preset.layout === 'multi' && L.getIndustry(preset.template);
      mount({ id: 'trial', member_id: 'trial', slug: 'my-shop', status: 'draft', template: preset.template, palette: preset.palette,
        sections: L.defaultSections(), content: L.normalizeContent(preset.content), layout: multi ? 'multi' : 'single', pages: multi ? L.defaultPages() : null });
      S.dirty = true; save();
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
      toast('已套用風格範例。把店名、文字換成你的，照片上傳自己的就完成了。', 6000);
      return;
    }
    const saved = readTrial();
    const key = (saved && saved.template) || (L.getIndustry(q.get('industry') || '') ? q.get('industry') : 'cafe');
    const smp = saved ? { content: saved.content, palette: saved.palette } : await sampleContent(key);
    S.trial = true; document.body.classList.add('is-trial');
    const sLayout = saved && saved.layout === 'multi' ? 'multi' : 'single';
    mount({ id: 'trial', member_id: 'trial', slug: (saved && saved.slug) || 'my-shop', status: 'draft', template: key, palette: smp.palette,
      sections: saved ? saved.sections : L.defaultSections(), content: smp.content, layout: sLayout, pages: sLayout === 'multi' ? L.defaultPages() : null });
    if (!saved) { S.dirty = true; save(); }
  } catch (e) {
    console.error(e);
    gate([h('h1', { text: '載入失敗' }), h('p', { text: String((e && e.message) || e) }), h('button', { class: 'btn', onclick: () => location.reload() }, '重新整理')]);
  }
}
// 試用中按「儲存／發佈／上傳」：先把內容暫存，再請對方登入；登入回來後會帶著內容建立網站
function askLoginToKeep(what) {
  save(); writeTrial({ pending: true });
  if (!YC.enabled) { toast('會員功能即將開放，你編輯的內容已暫存在這個瀏覽器。', 5000); return; }
  // 發佈不是免費上線：登入免費，確認付款後才正式上線（價格從方案設定讀，避免寫死）
  const PM = S.plan, mo = PM && PM.planFor && PM.hasPrice && PM.hasPrice(PM.planFor('single')) ? PM.planFor('single').monthly : 0;
  const reason = what === '發佈'
    ? '登入免費，不用設定密碼；你剛剛編輯的內容會帶進帳號。發佈後我們確認付款，網站才會正式上線' + (mo ? '（每月 NT$' + mo.toLocaleString('en-US') + ' 起）' : '') + '。'
    : '登入後會把你剛剛編輯的內容帶進帳號，建立你自己的網站。登入免費，不用設定密碼。';
  YC.openLogin({ title: '登入後' + what, reason });
}

// 版型模組可能還是瀏覽器快取的舊版（GitHub Pages 約 10 分鐘更新），缺新函式時用本機版本，編輯器不會因此打不開
function colorWarningsLocal(pal) {
  const cr = pal.contrast || ((a, b) => { const x = pal.luminance(a), y = pal.luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); });
  return (c) => {
    const w = [];
    if (cr(c.text, c.bg) < 4.5) w.push('文字和背景顏色太接近，可能看不清楚');
    else if (cr(c.text, c.surface) < 4.5) w.push('文字和區塊底色太接近，有底色的區塊可能看不清楚');
    if (cr(c.accent, c.bg) < 3) w.push('主色和背景太接近，按鈕和連結會不明顯');
    return w;
  };
}
// ── 載入共用版型模組 ──
async function loadLib() {
  const base = tplBase();
  let site, content, valid, slug, pal, hours, pages, ind, code = {}, i18n = {};
  try {
    // 一個打包好的檔案（templates/dist/builder-lib.js）就包含全部共用模組，只要下載一次
    const L = await import(base + 'templates/dist/builder-lib.js');
    ({ site, content, valid, slug, pal, hours, pages, ind } = L); code = L.code || {}; i18n = L.i18n || {};
  } catch (e) {
    // 備援：打包檔讀不到時，改成一個一個載入原始模組（舊做法）
    [site, content, valid, slug, pal, hours, pages, ind] = await Promise.all([
      import(base + 'templates/shared/site.js'), import(base + 'templates/shared/content.js'), import(base + 'templates/shared/validate.js'),
      import(base + 'templates/shared/slug.js'), import(base + 'templates/shared/palettes.js'), import(base + 'templates/shared/hours.js'),
      import(base + 'templates/shared/pages.js'), import(base + 'templates/shared/industries.js')
    ]);
    try { code = await import(base + 'templates/shared/code.js'); } catch (e2) { code = {}; }
    try { i18n = await import(base + 'templates/shared/i18n.js'); } catch (e2) { i18n = {}; }
  }
  S.lib = { buildSite: site.buildSite, ...content, validateForPublish: valid.validateForPublish, suggestions: valid.suggestions, slugError: slug.slugError, PALETTES: pal.PALETTES, PALETTE_IDS: pal.PALETTE_IDS, getPalette: pal.getPalette, isCustomPalette: pal.isCustomPalette, customPaletteId: pal.customPaletteId, parseCustomPalette: pal.parseCustomPalette, derivePalette: pal.derivePalette, paletteFrom4: pal.paletteFrom4, colorWarnings: pal.colorWarnings || colorWarningsLocal(pal), luminance: pal.luminance, hours,
    pagesFor: pages.pagesFor, normalizeLayout: pages.normalizeLayout, normalizePages: pages.normalizePages, defaultPages: pages.defaultPages, pagesFromSections: pages.pagesFromSections, LAYOUT_LABELS: pages.LAYOUT_LABELS,
    INDUSTRIES: ind.INDUSTRIES, INDUSTRY_GROUPS: ind.INDUSTRY_GROUPS, getIndustry: ind.getIndustry,
    codeHash: code.codeHash, hasCustomCode: code.hasCustomCode, missingEn: i18n.missingEn };
  // 方案（價格）模組：載入失敗時不影響編輯，只是不開放選多頁版、不顯示價格
  try { S.plan = await import(YC.url('assets/rental-plan.js')); } catch (e) { S.plan = null; }
}
// 目前網站的行業設定（舊網站沒有對應行業時當作咖啡店）
const IND = () => S.lib.getIndustry(S.site && S.site.template) || S.lib.getIndustry('cafe');
const multiOpen = () => !!(S.plan && S.plan.PLANS && S.plan.PLANS.multi && S.plan.PLANS.multi.selectable);
const isMulti = () => S.layout === 'multi';
// 方案月費文字（例如「每月 NT$899」）；價格未定或模組沒載入時回傳空字串
function priceText(layout) {
  const PM = S.plan; if (!PM || !PM.planFor) return '';
  const P = PM.planFor(layout, S.site && S.site.price_lock);
  return PM.hasPrice(P) ? '每月 ' + PM.money(P.monthly) : '';
}
// 區塊／頁面的名稱跟著行業走（菜單→服務項目、店內環境→作品集…）
function sectionLabel(k) {
  const i = IND();
  if (k === 'menu') return i.offer.nav;
  if (k === 'interior') return i.space.label;
  return S.lib.SECTION_LABELS[k];
}
const bookWord = () => (IND().offer === S.lib.getIndustry('cafe').offer ? '訂位' : '預約');

const photoUrl = (path) => YC_CONFIG.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/site-photos/' + path.split('/').map(encodeURIComponent).join('/');

// ── 進入點 ──
let booted = false;
// ── 編輯器介面語言：?lang=en 或之前選過英文（記在這台瀏覽器）。英文介面的字典另外載入，中文使用者不會下載 ──
const UI_EN = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  try { if (q === 'en' || q === 'zh') localStorage.setItem('yc-builder-ui', q); return localStorage.getItem('yc-builder-ui') === 'en'; } catch (e) { return q === 'en'; }
})();
if (UI_EN) import(new URL('./ui-en.min.js?v=5f1fb41b2b', import.meta.url).href).then((m) => m.install()).catch(() => {});
function setUiLang(lang) {
  try { localStorage.setItem('yc-builder-ui', lang); } catch (e) { /* 無痕模式：只靠網址 */ }
  const u = new URL(location.href); u.searchParams.set('lang', lang); location.href = u.href;
}
const uiLangBtn = () => h('button', { type: 'button', class: 'btn', 'data-no-tr': '', onclick: () => { closeModal(); setUiLang(UI_EN ? 'zh' : 'en'); } }, UI_EN ? '介面改成中文' : 'English interface');

async function boot() {
  if (booted) return;
  if (!YC.enabled || !YC.loggedIn()) return startTrial();
  if (!YC.consented()) {
    gate([h('h1', { text: '還差最後一步' }), h('p', { text: '請先完成註冊（同意條款），才能使用編輯器。' }), h('button', { class: 'btn primary', onclick: () => YC.ensureConsent() }, '完成註冊')]);
    return;
  }
  booted = true;
  try {
    gate([h('p', { text: '載入編輯器…' })]);
    await loadLib();
    const uid = YC.session.user.id;
    const pendingTrial = readTrial();
    // 一個會員可以有多個網站：網址 ?site=<id> 指定要編輯哪一個，沒指定就開上次編輯的（或第一個）
    // 先接受寄到自己 Email 的協作邀請，再把「自己的網站」和「協作中的網站」一起列出
    try { await YC.client.functions.invoke('member-site', { body: { action: 'accept_invites' } }); } catch (e) { /* ignore */ }
    const cm = await YC.client.from('site_members').select('site_id').eq('member_id', uid).eq('status', 'active');
    const collabIds = cm.error ? [] : (cm.data || []).map((x) => x.site_id);
    const r = collabIds.length
      ? await YC.client.from('rental_sites').select('*').or('member_id.eq.' + uid + ',id.in.(' + collabIds.join(',') + ')').order('created_at')
      : await YC.client.from('rental_sites').select('*').eq('member_id', uid).order('created_at');
    if (r.error) throw r.error;
    // 會員自己刪除的草稿（狀態改成已終止、從沒上線過）不再顯示
    S.mySites = r.data.filter((x) => !(x.status === 'cancelled' && !x.first_published_at));
    r.data = S.mySites;
    const q = new URLSearchParams(location.search);
    // 已登入的會員從「風格範例」進來：用範例內容建立新網站
    const scp = await showcasePreset(q.get('showcase'));
    if (scp) return showCreate({ ...scp, sections: S.lib.defaultSections(), slug: '' });
    if (pendingTrial && pendingTrial.pending) return showCreate(pendingTrial);
    if (!r.data.length || q.get('new') === '1') return showCreate();
    let last = ''; try { last = localStorage.getItem('yc-builder-site') || ''; } catch (e) { /* ignore */ }
    const pick = r.data.find((x) => x.id === q.get('site')) || r.data.find((x) => x.id === last) || r.data[0];
    mount(pick);
  } catch (e) {
    booted = false;
    console.error(e);
    gate([h('h1', { text: '載入失敗' }), h('p', { text: String((e && e.message) || e) }), h('button', { class: 'btn', onclick: () => location.reload() }, '重新整理')]);
  }
}

// ── 第一次：建立網站 ──
function showCreate(trial) {
  const L = S.lib;
  const slug = h('input', { type: 'text', id: 'cSlug', maxlength: '30', autocomplete: 'off', spellcheck: 'false', placeholder: 'my-shop' });
  const name = h('input', { type: 'text', id: 'cName', maxlength: '40', placeholder: '你的店名或品牌名稱' });
  // 行業：依群組列出；決定網站的用詞、頁面名稱與給搜尋引擎看的店家類型
  const ind = h('select', { id: 'cInd', class: 'sel' }, h('option', { value: '', text: '請選擇' }),
    L.INDUSTRY_GROUPS.map((g) => h('optgroup', { label: g }, L.INDUSTRIES.filter((i) => i.group === g).map((i) => h('option', { value: i.key, text: i.label })))));
  const indMsg = h('div', { class: 'msg mute', text: '網站的用詞（例如菜單、服務項目、課程）會依行業自動調整。之後也可以在編輯器裡更改。' });
  let layout = trial && trial.layout === 'multi' && multiOpen() ? 'multi' : 'single';
  const lay = (v, title, desc) => {
    const r = h('input', { type: 'radio', name: 'cLayout', value: v }); r.checked = v === layout;
    r.addEventListener('change', () => { if (r.checked) layout = v; });
    return h('label', { class: 'choice' }, r, h('span', {}, h('strong', { text: title }), h('small', { text: desc })));
  };
  const layoutBox = multiOpen() ? h('div', { class: 'field', style: 'margin-top:14px' }, h('span', { text: '網站版型' }),
    lay('single', '一頁版' + (priceText('single') ? '（' + priceText('single') + '）' : ''), '所有內容放在同一頁，適合資訊不多的店家。之後可以升級成多頁版。'),
    lay('multi', '多頁版' + (priceText('multi') ? '（' + priceText('multi') + '）' : ''), '首頁加上關於、價目、照片、消息、常見問題、聯絡等分頁，可自己勾選要哪些頁。' + (priceText('multi') ? '' : '多頁版費用確認中，開通前會先與你確認。'))) : null;
  const msg = h('div', { class: 'msg mute', text: '3–30 個字，只能用小寫英文、數字與連字號（-）。' });
  const url = h('div', { class: 'msg mute' });
  const btn = h('button', { class: 'btn primary', disabled: true }, '建立我的網站');
  let ok = false, t;
  const sync = () => { btn.disabled = !(ok && ind.value); };
  ind.addEventListener('change', sync);
  const check = () => {
    clearTimeout(t); ok = false; sync();
    const v = slug.value.trim().toLowerCase(); slug.value = v;
    url.textContent = v ? '網站網址會是：' + v + '.pages.dev' : '';
    const err = L.slugError(v);
    if (err) { msg.className = 'msg ' + (v ? 'bad' : 'mute'); msg.textContent = v ? err : '3–30 個字，只能用小寫英文、數字與連字號（-）。'; return; }
    msg.className = 'msg mute'; msg.textContent = '檢查中…';
    t = setTimeout(async () => {
      const r = await YC.client.rpc('rental_slug_available', { p_slug: v });
      if (slug.value !== v) return;
      if (r.error) { msg.className = 'msg bad'; msg.textContent = '檢查失敗，請稍後再試'; return; }
      ok = !!r.data; msg.className = 'msg ' + (ok ? 'ok' : 'bad'); msg.textContent = ok ? '✓ 這個名稱可以使用' : '這個名稱已被使用，請換一個';
      sync();
    }, 400);
  };
  slug.addEventListener('input', check);
  btn.addEventListener('click', async () => {
    if (!ok || !ind.value) return; btn.disabled = true; btn.textContent = '建立中…';
    const c = trial ? L.normalizeContent(trial.content) : L.emptyContent(); c.name = name.value.trim() || c.name;
    const row = { member_id: YC.session.user.id, slug: slug.value, template: ind.value, palette: trial ? L.normalizePalette(trial.palette) : 'forest', sections: trial ? L.normalizeSections(trial.sections) : L.defaultSections(), content: c };
    if (layout === 'multi') { row.layout = 'multi'; row.pages = L.defaultPages(); }
    const r = await YC.client.from('rental_sites').insert(row).select('*').single();
    if (r.error) {
      const m = r.error.message || '';
      msg.className = 'msg bad';
      msg.textContent = '建立失敗：' + (/duplicate|unique/i.test(m) ? '這個名稱剛被使用了，請換一個' : /row-level security|policy/i.test(m) ? '你的網站數量已達上限（每位會員最多 5 個），需要更多請聯絡我們' : m);
      btn.textContent = '建立我的網站'; btn.disabled = false; return;
    }
    if (trial) clearTrial();
    S.mySites = (S.mySites || []).concat(r.data);
    try { history.replaceState(null, '', location.pathname + '?site=' + r.data.id); } catch (e) { /* ignore */ }
    mount(r.data);
  });
  const back = (S.mySites || []).length ? h('p', { style: 'margin:0 0 8px' }, h('a', { href: location.pathname, text: '← 回到我的網站' })) : null;
  if (trial) {
    if (trial.template && L.getIndustry(trial.template)) { ind.value = trial.template; }
    if (trial.content && trial.content.name) name.value = trial.content.name;
    if (trial.slug && trial.slug !== 'my-shop') { slug.value = trial.slug; setTimeout(check, 0); }
    sync();
  }
  const trialNote = trial ? h('div', { class: 'msg ok', style: 'margin:0 0 12px' }, '已帶入你試用時編輯的內容。範例中的地址與電話是虛構的，建立後記得改成你的資料。 ',
    h('a', { href: '#', onclick: (e) => { e.preventDefault(); clearTrial(); location.href = location.pathname; } }, '不要帶入')) : null;
  gate([back, h('h1', { text: trial ? '建立你的網站' : (S.mySites || []).length ? '建立另一個網站' : '建立你的網站' }), trialNote, h('p', { text: '先決定行業、網址代稱與店名，之後都可以在編輯器裡修改內容（網址代稱在第一次發佈後就不能再改）。' }),
    h('label', { class: 'field', for: 'cInd' }, h('span', { text: '行業' }), ind), indMsg,
    layoutBox,
    h('label', { class: 'field', for: 'cSlug', style: 'margin-top:14px' }, h('span', { text: '網址代稱' }), slug), msg, url,
    h('label', { class: 'field', for: 'cName', style: 'margin-top:14px' }, h('span', { text: '店名（之後可修改）' }), name), btn]);
}

// ── 編輯器 ──
// 上方的網站切換（有多個網站時）與「建立新網站」
function paintSiteSwitch(into) {
  const box = into || $('#siteSwitch'); if (!box) return;
  if (S.trial) { box.replaceChildren(); return; }
  const list = S.mySites || [];
  const sel = h('select', { class: 'sel', 'aria-label': '切換網站' },
    list.map((x) => h('option', { value: x.id, text: ((x.content && x.content.name) || x.slug) + '（' + x.slug + '）' + (x.member_id !== YC.session.user.id ? '・協作' : '') })),
    h('option', { value: '__new', text: '＋ 建立新網站' }));
  sel.value = S.site.id;
  sel.addEventListener('change', async () => {
    const v = sel.value; sel.disabled = true;
    if (S.dirty || S.saving) await save();
    S.dirty = false;
    location.href = location.pathname + (v === '__new' ? '?new=1' : '?site=' + encodeURIComponent(v));
  });
  const canDelete = S.isOwner && ['draft', 'pending'].includes(S.site.status) && !S.site.first_published_at;
  box.replaceChildren(sel, canDelete ? h('button', { type: 'button', class: 'btn small danger', title: '刪除這個網站', onclick: askDeleteSite }, '刪除') : '');
}
// 刪除還沒上線過的網站：要輸入「刪除」兩個字確認。資料不會真的消失（改成已終止並隱藏），需要時可請管理員復原。
function askDeleteSite() {
  const name = (S.content && S.content.name) || S.site.slug;
  const inp = h('input', { type: 'text', placeholder: '請輸入：刪除', 'aria-label': '確認刪除' });
  const msg = h('div', { class: 'msg bad' });
  const go = h('button', { type: 'button', class: 'btn primary', disabled: true }, '確定刪除');
  inp.addEventListener('input', () => { const v = inp.value.trim(); go.disabled = v !== '刪除' && !(UI_EN && v.toLowerCase() === 'delete'); });
  go.addEventListener('click', async () => {
    go.disabled = true; msg.textContent = '刪除中…';
    clearTimeout(S.timers.save); S.dirty = false;
    const r = await YC.client.functions.invoke('member-site', { body: { action: 'delete_site', site_id: S.site.id } });
    let j = r.data;
    if (r.error) { try { j = await r.error.context.json(); } catch (e) { j = null; } msg.textContent = (j && j.message) || '刪除失敗，請稍後再試'; go.disabled = false; return; }
    try { localStorage.removeItem('yc-builder-site'); } catch (e) { /* ignore */ }
    const rest = (S.mySites || []).filter((x) => x.id !== S.site.id);
    toast(j.message || '已刪除');
    setTimeout(() => { location.href = location.pathname + (rest.length ? '?site=' + encodeURIComponent(rest[0].id) : '?new=1'); }, 900);
  });
  modal('刪除網站「' + name + '」？', [
    h('p', { text: '這個網站還沒有上線，刪除後會從你的網站列表中移除，不能再編輯。' }),
    h('p', { class: 'msg mute', text: '如果是誤刪，可以用 LINE（@788cblaq）聯絡我們協助復原。' }),
    h('label', { class: 'field' }, h('span', { text: '請輸入「刪除」兩個字確認' }), inp), msg
  ], [h('button', { type: 'button', class: 'btn', onclick: closeModal }, '取消'), go]);
  setTimeout(() => inp.focus(), 50);
}

function mount(site) {
  const L = S.lib;
  S.site = site; S.slug = site.slug;
  S.isOwner = S.trial || site.member_id === YC.session.user.id;   // 協作者不能改網址代稱、行業、版型，也不能刪除網站
  S.isPro = site.tier === 'pro';
  if (!S.trial) { try { localStorage.setItem('yc-builder-site', site.id); } catch (e) { /* ignore */ } }
  paintSiteSwitch();
  paintTrialBar();
  S.content = L.normalizeContent(site.content);
  S.palette = L.normalizePalette(site.palette);
  S.sections = L.normalizeSections(site.sections);
  S.layout = L.normalizeLayout(site.layout);
  S.pages = L.normalizePages(site.pages);
  S.page = 'home';
  $('#gate').hidden = true; $('#app').hidden = false;
  buildPanel();
  S.hist = [snap()]; S.hpos = 0; paintUndo();
  $('#barName').textContent = S.content.name || '我的網站';
  setSaveText();
  renderPreview();
  refreshStatus();
  bindChrome();
  if (!S.trial) setTimeout(offerBackup, 300);
}

let frameScroll = 0, pendingAnchor = null;
const frameState = { ready: false, page: null };
function renderPreview(now) {
  clearTimeout(S.timers.render);
  S.timers.render = setTimeout(() => {
    const L = S.lib;
    let r;
    try {
      const args = () => ({ template: S.site.template, content: S.content, palette: S.palette, sections: S.sections, layout: S.layout, pages: S.pages, page: S.page,
        siteUrl: 'https://' + (S.slug || 'your-shop') + '.pages.dev/', preview: true, imageSrc: (role, p) => photoUrl(p.path), lang: EN_MODE() ? 'en' : '',
        ...previewFont() });
      r = L.buildSite(args());
      if (updateSubsetFont(r.html)) r = L.buildSite(args());
    } catch (e) { console.error(e); return; }
    if (S.page === 'home') paintSeoHints(r);
    S.pageList = r.pages || [];
    if (!S.pageList.some((p) => p.key === S.page)) S.page = 'home';
    paintPageTabs();
    // 手機版在「編輯」分頁時看不到預覽：先不更新預覽框，切到「預覽」時再更新（打字更順）
    if (isMob() && $('.app').dataset.tab !== 'view' && !peekOn()) return;
    // 正在預覽上直接改字：預覽的文字已經是使用者打的，先不更新（避免游標跳掉），改完再更新
    if (S.inlineEdit) return;
    const f = $('#frame');
    // 同一頁的內容更新：只改有變的地方（不重新載入），預覽不閃、不跳
    if (frameState.ready && frameState.page === S.page && !S.replayMotion && morphFrame(f, r.html)) {
      wireNav(f); settleReveal(f);
      const a = pendingAnchor; pendingAnchor = null;
      if (a) { try { const t = f.contentDocument.getElementById(a); if (t) { t.scrollIntoView({ block: 'start' }); flashSection(f, t); } } catch (e) { /* ignore */ } }
      return;
    }
    frameState.ready = false; frameState.page = S.page;
    if (pendingAnchor === null) { try { frameScroll = f.contentWindow.scrollY || 0; } catch (e) { /* ignore */ } }
    f.onload = () => {
      frameState.ready = true;
      try {
        const d = f.contentDocument;
        wireEditPills(f, pickSection, (k) => { const c = cardForKey(k); const el = c && $('#' + c.card); const t = el && el.querySelector('h2'); return t ? '「' + t.textContent.replace(/（.*?）/g, '') + '」' : ''; });
        wireInlineEdit(f, { find: inlineFind, onStart: () => { S.inlineEdit = true; }, onInput: () => touch(), onDone: () => { S.inlineEdit = false; touch(); syncPanel(); renderPreview(true); }, onTouchEdit: openTextSheet });
        const a = pendingAnchor; pendingAnchor = null;
        const t = a && d.getElementById(a);
        if (t) t.scrollIntoView({ block: 'start' }); else f.contentWindow.scrollTo(0, a === null ? frameScroll : 0);
        const replay = S.replayMotion; S.replayMotion = false;
        startReveal(f, replay); wireNav(f);
        d.addEventListener('click', (ev) => {
          const el = ev.target.closest && ev.target.closest('a'); if (!el) return;
          // 預覽裡的中英切換：直接切換編輯語言
          if (el.classList.contains('lang-link')) { ev.preventDefault(); setLang(EN_MODE() ? 'zh' : 'en'); return; }
          const href = el.getAttribute('href') || '';
          if (href.startsWith('#')) { ev.preventDefault(); const x = href.length > 1 ? d.querySelector(href) : null; if (x) x.scrollIntoView({ behavior: 'smooth' }); else f.contentWindow.scrollTo({ top: 0, behavior: 'smooth' }); return; }
          if (/^(https?:|mailto:|tel:)/i.test(href)) return;   // 外部連結照常開新視窗
          // 站內連結（多頁版的導覽）：預覽裡切換到那一頁
          ev.preventDefault();
          const [path, hash] = href.replace(/^(\.\.\/|\.\/)+/, '').split('#');
          const pg = S.pageList.find((p) => p.path === path);
          if (pg) goPage(pg.key, hash || '');
        });
      } catch (e) { /* ignore */ }
    };
    f.srcdoc = r.html;
  }, now ? 0 : RENDER_DELAY);
}
// 全螢幕預覽：先存檔，再在新分頁看「客人會看到的樣子」（不顯示灰色提示，還沒發佈也可以看）
async function openFullPreview() {
  if (!S.site) return;
  const w = window.open('', '_blank');   // 先開視窗，避免存檔後被瀏覽器當成彈出視窗擋掉
  const ok = await save();
  if (!ok) { if (w) w.close(); toast('儲存失敗，請稍後再試'); return; }
  const q = new URLSearchParams({ site: S.site.id, draft: '1' });
  const tb = new URLSearchParams(location.search).get('tplbase'); if (tb) q.set('tplbase', tb);
  if (S.page && S.page !== 'home') q.set('page', S.page);
  const url = new URL('preview/?' + q, location.href).href;
  if (w) w.location.href = url; else location.href = url;
}
// 預覽用的標題字型子集：只下載標題實際用到的字（Edge Function font-subset），取代 1–3MB 的完整字型檔。
// 標題出現新的字時才換一次網址（字只增不減，避免一直重新下載）；字太多或服務不可用時改用完整字型。
const SUBSET_MAX = 400;
function headingChars(html) {
  const out = new Set(), re = /<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>|<a class="brand"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const t = (m[2] || m[3] || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    for (const ch of t) if (ch.trim()) out.add(ch);
  }
  return out;
}
function updateSubsetFont(html) {
  const st = S.content.style;
  if (st.font === 'custom' || S.subsetOff) return false;
  const key = FONT_FILE[st.font] ? st.font : 'serif';
  if (!S.subsetFont || S.subsetFont.key !== key) S.subsetFont = { key, chars: new Set(), url: '' };
  const f = S.subsetFont; let grew = false;
  for (const ch of headingChars(html)) if (!f.chars.has(ch)) { f.chars.add(ch); grew = true; }
  if (!grew && f.url) return false;
  if (f.chars.size > SUBSET_MAX) { S.subsetOff = true; f.url = ''; return true; }
  if (!f.chars.size) return false;
  f.url = YC_CONFIG.supabaseUrl.replace(/\/$/, '') + '/functions/v1/font-subset?f=' + key + '&t=' + encodeURIComponent([...f.chars].sort().join(''));
  return true;
}
// 預覽用的標題字型：內建字型直接讀字型檔；上傳的字型從私有空間下載後用暫存網址（不會公開）
function previewFont() {
  const st = S.content.style;
  if (st.font !== 'custom') {
    const key = FONT_FILE[st.font] ? st.font : 'serif';
    if (S.subsetOff) return { previewFontUrl: tplBase() + 'templates/base/fonts/' + FONT_FILE[key] };
    return { previewFontUrl: S.subsetFont && S.subsetFont.key === key ? S.subsetFont.url : '', previewFontFormat: '' };
  }
  const cf = st.customFont;
  if (cf && S.fontBlob && S.fontBlob.path === cf.path) return { previewFontUrl: S.fontBlob.url, previewFontFormat: '' };
  if (cf) loadFontBlob();
  return { previewFontUrl: '', previewFontFormat: '' };
}
async function loadFontBlob() {
  if (S.trial) return;
  const cf = S.content.style.customFont;
  if (!cf || S.fontLoading === cf.path || (S.fontBlob && S.fontBlob.path === cf.path)) return;
  S.fontLoading = cf.path;
  const r = await YC.client.storage.from('site-fonts').download(cf.path);
  S.fontLoading = '';
  if (r.error || !r.data) return;
  if (S.fontBlob) URL.revokeObjectURL(S.fontBlob.url);
  S.fontBlob = { path: cf.path, url: URL.createObjectURL(r.data) };
  renderPreview(true);
}
const FONT_EXT = ['woff2', 'woff', 'ttf', 'otf'];
async function uploadFont(file, msg, btn) {
  if (S.trial) return askLoginToKeep('上傳字型');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!FONT_EXT.includes(ext)) { msg.className = 'msg bad'; msg.textContent = '只能上傳 TTF、OTF、WOFF 或 WOFF2 字型檔'; return; }
  if (file.size > 20 * 1024 * 1024) { msg.className = 'msg bad'; msg.textContent = '字型檔超過 20MB，請改用較小的檔案（例如只含常用字的版本）'; return; }
  btn.disabled = true; msg.className = 'msg mute'; msg.textContent = '上傳中…';
  const path = S.site.id + '/font-' + Math.random().toString(36).slice(2, 12).replace(/[^a-z0-9]/g, 'x').padEnd(10, 'x') + '.' + ext;
  const r = await YC.client.storage.from('site-fonts').upload(path, file, { contentType: 'application/octet-stream', upsert: false });
  btn.disabled = false;
  if (r.error) { msg.className = 'msg bad'; msg.textContent = '上傳失敗：' + r.error.message; return; }
  const old = S.content.style.customFont && S.content.style.customFont.path;
  S.content.style.customFont = { path, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || '自訂字型' };
  S.content.style.font = 'custom';
  touch();
  if (old && old !== path) YC.client.storage.from('site-fonts').remove([old]).catch(() => {});
  msg.className = 'msg ok'; msg.textContent = '已上傳。網站只會放標題用到的字，不會拖慢網站。';
  paintFontBox(); loadFontBlob();
}
function paintFontBox() {
  const box = $('#fontBox'); if (!box) return;
  const st = S.content.style, cf = st.customFont;
  const file = h('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2', hidden: true });
  const msg = h('div', { class: 'msg mute' });
  const up = h('button', { type: 'button', class: 'btn small' }, cf ? '換一個字型檔' : '上傳字型檔');
  up.addEventListener('click', () => file.click());
  file.addEventListener('change', () => { const f = file.files[0]; file.value = ''; if (f) uploadFont(f, msg, up); });
  box.hidden = st.font !== 'custom';
  box.replaceChildren(h('div', { class: 'font-up' }, h('span', { text: cf ? '目前：' + cf.name : '還沒上傳字型' }), up, file), msg,
    h('div', { class: 'msg mute', text: 'TTF、OTF、WOFF、WOFF2 都可以，最大 20MB。請確認你有這個字型的網頁使用授權。字型檔不會公開，網站只會放標題用到的字。' }));
}
// 進階功能的價格（每月加多少）；標在卡片標題與手機設定清單上，開之前就看得到要加錢
const proAdd = () => (S.plan && S.plan.proFor && S.site ? S.plan.proFor(S.site.price_lock).monthly : 400);
const proTitle = () => (S.isPro ? '（進階功能）' : '（進階功能・每月加 NT$' + Number(proAdd()).toLocaleString('en-US') + '）');
const PRO_CARDS = ['c-cal', 'c-code'];
// 進階方案功能的說明（一般方案可以先設定、在預覽看效果，升級後才會出現在正式網站）
function proNote() {
  if (S.isPro) return h('div', { class: 'msg ok', text: '你的網站是進階方案，這個功能已開放。' });
  const add = S.plan && S.plan.proFor ? S.plan.proFor(S.site.price_lock).monthly : 400;
  const msg = S.site.pro_pending ? '進階功能已申請，確認收到差額後就會開通。現在可以先設定、在預覽看效果。'
    : '這是進階功能（每月加 NT$' + Number(add).toLocaleString('en-US') + '）。可以先設定、在預覽看效果；到會員專區「我的網站」按「加購進階功能」開通後，才會出現在正式網站。';
  return h('div', { class: 'msg pro-lock' }, msg, ' ', h('a', { href: YC.url('dashboard/'), target: '_blank', rel: 'noopener', text: '前往會員專區' }));
}
function goPage(key, anchor) {
  if (!S.pageList.some((p) => p.key === key)) return;
  S.page = key; pendingAnchor = anchor || '';
  renderPreview(true);
}
// 多頁版：預覽上方的分頁切換
function paintPageTabs() {
  const box = $('#pageTabs'); if (!box) return;
  box.hidden = !isMulti();
  if (!isMulti()) return;
  box.replaceChildren(...S.pageList.map((p) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(p.key === S.page) }, p.label);
    b.addEventListener('click', () => goPage(p.key));
    return b;
  }));
}
// 左側卡片對應的頁面（多頁版編輯時，右邊自動切到那一頁）
const ANCHOR_PAGE = { about: 'about', menu: 'menu', interior: 'interior', news: 'news', faq: 'faq', visit: 'visit', contact: 'visit' };
function scrollPreviewTo(anchor) {
  if (isMulti()) {
    const want = ANCHOR_PAGE[anchor] && S.pageList.some((p) => p.key === ANCHOR_PAGE[anchor]) ? ANCHOR_PAGE[anchor] : null;
    if (want && want !== S.page) { goPage(want, anchor); return; }
  }
  try {
    const f = $('#frame'), d = f.contentDocument, t = d && d.getElementById(anchor);
    if (t) { t.scrollIntoView({ block: 'start' }); if (S.lastFlash !== anchor) { S.lastFlash = anchor; flashSection(f, t); } }
  } catch (e) { /* ignore */ }
}
// ── 預覽上直接改字：用預覽裡的文字找回是哪一個欄位 ──
// 回傳 { set(新文字), max, label }；同一段文字在多個欄位出現時用第一個。
const paraSplit = (v) => String(v || '').split(/\n{1,}/).map((t) => t.trim()).filter(Boolean);
const paraSep = (v) => (/\n\s*\n/.test(String(v || '')) ? '\n\n' : '\n');
function inlineFind(text) {
  if (!text || !S.content) return null;
  const c = S.content, L0 = S.lib.LIMITS, I = IND();
  const en = EN_MODE(), K = (k) => (en ? k + 'En' : k);
  const L = en ? Object.fromEntries(Object.entries(L0).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 2.5) : v])) : L0;
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const noQ = (t) => norm(t).replace(/[？?]$/, '');
  const want = norm(text), wantQ = noQ(text);
  const hit = (v) => v && norm(v) === want;
  // 多段文字：找到是第幾段，改那一段
  const para = (obj, key0, max, label) => {
    const key = K(key0);
    const ps = paraSplit(obj[key]); const i = ps.findIndex((p) => norm(p) === want);
    if (i < 0) return null;
    return { max, label, set: (v) => { const cur = paraSplit(obj[key]); const sep = paraSep(obj[key]); cur[i] = v; obj[key] = cur.join(sep); } };
  };
  const line = (obj, key0, max, label) => { const key = K(key0); return hit(obj[key]) ? { max, label, set: (v) => { obj[key] = v; } } : null; };
  let r = line(c, 'name', L.name, '店名') || line(c, 'tagline', L.tagline, '標語') || para(c, 'intro', L.intro, '介紹') || line(c, 'hoursNote', L.hoursNote, '營業時間備註');
  if (r) return r;
  for (const m of c.menu) if ((r = line(m, 'name', L.menuName, I.offer.item + '名稱'))) return r;
  for (const q of c.faq) {
    if (q[K('q')] && noQ(q[K('q')]) === wantQ) return { max: L.faqQ, label: '常見問題', set: (v) => { q[K('q')] = v; } };
    if ((r = line(q, 'a', L.faqA, '回答'))) return r;
  }
  for (const b of c.blocks) {
    if ((r = line(b, 'title', L.blockTitle, '區塊標題') || para(b, 'body', L.blockBody, '區塊內容'))) return r;
    for (const it of b.items || []) if ((r = line(it, 't', L.itemTitle, '項目') || line(it, 'v', 20, '數字或規格') || line(it, 'd', L.itemText, '說明'))) return r;
    if (b.kind === 'compare' && ((r = line(b, 'cap1', 20, '照片標籤') || line(b, 'cap2', 20, '照片標籤')))) return r;
  }
  for (const v of c.reviews) if ((r = line(v, 'text', L.reviewText, '評價'))) return r;
  for (const n of c.news) if ((r = line(n, 'title', L.newsTitle, '消息標題'))) return r;
  for (const p of c.posts) if ((r = line(p, 'title', L.postTitle, '文章標題'))) return r;
  for (const k of Object.keys(c.subs || {}).filter((k) => !k.endsWith('En'))) if ((r = line(c.subs, k, L.sub, '副標題'))) return r;
  if (c.shop && c.shop.items) for (const it of c.shop.items) if ((r = line(it, 'name', L.shopName, '商品名稱') || line(it, 'desc', L.shopDesc, '商品說明'))) return r;
  return null;
}
// 預覽上改完字：左邊的欄位換成新的內容（保留捲動位置）
function syncPanel() { const P = $('#panel'); const sc = P.scrollTop; buildPanel(); P.scrollTop = sc; }

// ── 預覽 → 左邊：點預覽上的「編輯」打開對應的設定卡片 ──
function cardForKey(k) {
  if (!k) return null;
  if (k.startsWith('b-')) return { card: 'c-blocks', focus: () => { const i = S.content.blocks.findIndex((b) => 'b-' + b.id === k); const items = $('#blockBox') ? $('#blockBox').children : []; return items[i] && items[i].querySelector('input,textarea'); } };
  const cal = S.content.bookingCal && S.content.bookingCal.enabled;
  const M = { heroPhoto: ['c-photos'], name: ['c-info', '#f-name'], tagline: ['c-info', '#f-tagline'], intro: ['c-info', '#f-intro'], address: ['c-info', '#f-address'], blocks: ['c-blocks'],
    header: ['c-info', '#f-name'], top: ['c-info', '#f-name'], footer: ['c-info', '#f-name'], about: ['c-info', '#f-intro'], video: ['c-more', '#f-video'], menu: ['c-menu'], interior: ['c-photos'],
    shop: ['c-shop'], reviews: ['c-more', '#reviewBox textarea'], news: ['c-news'], posts: ['c-posts'], faq: ['c-faq'], booking: cal ? ['c-cal'] : ['c-more', '#f-bookingForm'],
    visit: ['c-hours'], info: ['c-hours'], contact: ['c-more', '#f-contactForm'] };
  const m = M[k]; if (!m) return null;
  return { card: m[0], focus: () => (m[1] ? $(m[1]) : $('#' + m[0]).querySelector('input:not([disabled]):not([type=checkbox]),textarea')) };
}
function pickSection(k) { const c = cardForKey(k); if (c) openCard(c.card, c.focus); }
// 打開某張卡片（切到它的分組、捲到它、閃一下、游標放進第一個欄位）
function openCard(id, focusFn) {
  const c = $('#' + id); if (!c) return;
  closeModal(); setTab('edit');
  clearSearch();
  if (c.hidden) showGroup(c.dataset.group || 'all', false);
  if (isMob()) { enterCard(c); } else c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  c.classList.remove('card-flash'); void c.offsetWidth; c.classList.add('card-flash');
  const el = focusFn && focusFn();
  if (el) setTimeout(() => el.focus({ preventScroll: true }), 350);
}

// ── 自動儲存 ──
// ── 復原／重做：每次停手 0.7 秒記一筆（配色、區塊開關、內容）；最多 60 筆 ──
const snap = () => JSON.stringify({ content: S.content, palette: S.palette, sections: S.sections });
function recordHist() {
  clearTimeout(S.timers.hist);
  const cur = snap();
  if (S.hist[S.hpos] === cur) return;
  S.hist = S.hist.slice(0, S.hpos + 1); S.hist.push(cur);
  if (S.hist.length > 60) S.hist.shift();
  S.hpos = S.hist.length - 1; paintUndo();
}
function applySnap(json, msg) {
  const o = JSON.parse(json);
  S.content = S.lib.normalizeContent(o.content); S.palette = o.palette; S.sections = o.sections;
  const sc = $('#panel').scrollTop;
  buildPanel(); $('#panel').scrollTop = sc;
  S.applying = true; touch(); S.applying = false; paintUndo();
  if (msg) toast(msg, 1500);
}
function undo() { recordHist(); if (S.hpos > 0) { S.hpos--; applySnap(S.hist[S.hpos], '已復原'); } }
function redo() { recordHist(); if (S.hpos < S.hist.length - 1) { S.hpos++; applySnap(S.hist[S.hpos], '已重做'); } }
function paintUndo() { const u = $('#btnUndo'), r = $('#btnRedo'); if (u) u.disabled = S.hpos <= 0; if (r) r.disabled = S.hpos >= S.hist.length - 1; }

function touch() {
  if (!S.applying) { clearTimeout(S.timers.hist); S.timers.hist = setTimeout(recordHist, 700); }
  S.dirty = true; S.saveErr = false; setSaveText(); if (S.trial) S.trialEdited = true;
  $('#barName').textContent = S.content.name || '我的網站';
  renderPreview(); clearTimeout(S.timers.todo); S.timers.todo = setTimeout(refreshTodo, 400);
  clearTimeout(S.timers.save); S.timers.save = setTimeout(save, SAVE_DELAY);
}
function setSaveText() {
  const e = $('#saveState'); e.classList.toggle('err', S.saveErr);
  if (S.trial) { e.textContent = S.dirty ? '試用中・尚未暫存' : '試用中・已暫存在這個瀏覽器'; return; }
  if ((S.saveErr || S.dirty) && navigator.onLine === false) { e.classList.add('err'); e.textContent = '沒有網路・修改先存在這台裝置'; }
  else if (S.saveErr) e.textContent = '還沒存上去，稍後自動重試（修改先存在這台裝置）';
  else if (S.saving) e.textContent = '儲存中…';
  else if (S.dirty) e.textContent = '尚未儲存（2 秒後自動儲存）';
  else e.textContent = S.lastSaved ? '已儲存 ' + pad(S.lastSaved.getHours()) + ':' + pad(S.lastSaved.getMinutes()) + ':' + pad(S.lastSaved.getSeconds()) : '已儲存';
}
async function save() {
  clearTimeout(S.timers.save);
  if (S.saving) { S.timers.save = setTimeout(save, 500); return true; }
  if (!S.dirty) return true;
  if (S.trial) { writeTrial(); S.dirty = false; S.lastSaved = new Date(); setSaveText(); return true; }
  S.saving = true; setSaveText();
  const snapshot = clone({ content: S.content, palette: S.palette, sections: S.sections, pages: S.pages });
  const payload = { content: snapshot.content, palette: snapshot.palette, sections: snapshot.sections };
  if (isMulti()) payload.pages = snapshot.pages;   // 一頁版不存 pages（升級時才寫入）
  writeBackup(snapshot);
  const wantSlug = S.slug;
  if (S.site.status === 'draft' && wantSlug !== S.site.slug && S.slugState.ok && !S.lib.slugError(wantSlug)) payload.slug = wantSlug;
  const r = await YC.client.from('rental_sites').update(payload).eq('id', S.site.id).select('slug').single();
  S.saving = false;
  if (r.error) {
    S.saveErr = true; setSaveText(); console.warn('save', r.error);
    if (/duplicate|unique/i.test(r.error.message)) { S.slugState = { ok: false, msg: '這個名稱剛被使用了' }; paintSlug(); }
    S.timers.save = setTimeout(save, 5000);
    return false;
  }
  S.site.slug = r.data.slug; S.site.content = snapshot.content; S.site.palette = snapshot.palette; S.site.sections = snapshot.sections;
  if (isMulti()) S.site.pages = snapshot.pages;
  S.dirty = JSON.stringify({ content: S.content, palette: S.palette, sections: S.sections, pages: S.pages }) !== JSON.stringify(snapshot);
  S.lastSaved = new Date(); setSaveText();
  if (S.dirty) S.timers.save = setTimeout(save, 300); else clearBackup();
  return true;
}
// ── 網路不穩：每次存檔前先把內容存在這台裝置；存上去了才刪掉。下次打開時如果還在，問要不要還原 ──
const backupKey = () => 'yc-builder-unsaved-' + (S.site && S.site.id);
function writeBackup(snap) { if (S.trial || !S.site) return; try { localStorage.setItem(backupKey(), JSON.stringify({ at: Date.now(), ...snap })); } catch (e) { /* 空間不足等：略過 */ } }
function clearBackup() { try { localStorage.removeItem(backupKey()); } catch (e) { /* ignore */ } }
function readBackup() { try { const v = JSON.parse(localStorage.getItem(backupKey()) || 'null'); return v && v.content ? v : null; } catch (e) { return null; } }
function offerBackup() {
  const b = readBackup(); if (!b) return;
  const L = S.lib, same = JSON.stringify(L.normalizeContent(b.content)) === JSON.stringify(S.content) && b.palette === S.palette;
  if (same) { clearBackup(); return; }
  const t = new Date(b.at);
  modal('有修改還沒存上去', [h('p', { text: '上次在這台裝置 ' + (t.getMonth() + 1) + '/' + t.getDate() + ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + ' 的修改，因為網路不穩沒有存上去。要還原這些修改嗎？' }),
    h('p', { class: 'msg mute', text: '還原後會自動存檔。如果之後在別的裝置或會員專區改過，選「不用」保留現在的內容。' })],
  [h('button', { type: 'button', class: 'btn', onclick: () => { clearBackup(); closeModal(); } }, '不用'),
    h('button', { type: 'button', class: 'btn primary', onclick: () => {
      closeModal();
      S.content = L.normalizeContent(b.content); if (b.palette) S.palette = L.normalizePalette(b.palette); if (b.sections) S.sections = L.normalizeSections(b.sections); if (b.pages && isMulti()) S.pages = L.normalizePages(b.pages);
      syncPanel(); touch(); toast('已還原，正在存檔', 2500);
    } }, '還原修改')]);
}
window.addEventListener('online', () => { if (S.dirty || S.saveErr) { clearTimeout(S.timers.save); save(); } });
window.addEventListener('offline', () => setSaveText());
window.addEventListener('beforeunload', (e) => { if (S.trial) { if (S.dirty) save(); return; } if (S.dirty || S.saving) { writeBackup(clone({ content: S.content, palette: S.palette, sections: S.sections, pages: S.pages })); e.preventDefault(); e.returnValue = ''; } });
// 手機切到別的 App 時（不一定會觸發 beforeunload）也先存一份在裝置上，並試著存檔
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && !S.trial && S.site && (S.dirty || S.saving)) { writeBackup(clone({ content: S.content, palette: S.palette, sections: S.sections, pages: S.pages })); save(); } });

// ── 狀態 ──
function deriveStatus() {
  const st = S.site.status;
  if (st === 'draft') return { text: '草稿', cls: '' };
  if (st === 'pending') return { text: '待上線（已送出申請）', cls: 'pending' };
  if (st === 'suspended') return { text: '已暫停', cls: 'bad' };
  if (st === 'cancelled') return { text: '已終止', cls: 'bad' };
  const ev = S.events.find((e) => ['deploy_queued', 'deploy_ok', 'deploy_failed'].includes(e.type));
  if (ev && ev.type === 'deploy_queued') {
    const age = Date.now() - new Date(ev.created_at).getTime();
    return age > 10 * 60 * 1000 ? { text: '更新可能失敗', cls: 'bad' } : { text: '更新中', cls: 'busy' };
  }
  if (ev && ev.type === 'deploy_failed') return { text: '更新失敗', cls: 'bad' };
  return { text: st === 'overdue' ? '上線中（待續約）' : '上線中', cls: 'live' };
}
async function refreshStatus() {
  if (S.trial) { const b = $('#barStatus'); b.textContent = '試用'; b.className = 'badge pending'; paintSlug(); paintLinks(); return { text: '試用', cls: 'pending' }; }
  const [s, e] = await Promise.all([
    YC.client.from('rental_sites').select('status,public_url,paid_until,live_version_id,first_published_at,last_published_at,cf_project_name,terms_accepted_at,terms_version,upgrade_pending,upgrade_amount').eq('id', S.site.id).single(),
    YC.client.from('site_events').select('type,detail,created_at').eq('site_id', S.site.id).order('created_at', { ascending: false }).limit(20)
  ]);
  if (s.data) Object.assign(S.site, s.data);
  if (e.data) S.events = e.data;
  const d = deriveStatus(); const b = $('#barStatus'); b.textContent = d.text; b.className = 'badge ' + d.cls;
  paintSlug(); paintLinks();
  clearTimeout(S.timers.poll);
  if (d.cls === 'busy') S.timers.poll = setTimeout(refreshStatus, 6000);
  return d;
}

// ── 左側表單 ──
const FIELD_CARD = { blocks: 'c-blocks', seo: 'c-seo', style: 'c-style', template: 'c-basic', social: 'c-info', slug: 'c-basic', name: 'c-info', tagline: 'c-info', intro: 'c-info', address: 'c-info', phone: 'c-info', hours: 'c-hours', notice: 'c-notice', booking: 'c-booking', photos: 'c-photos', menu: 'c-menu', faq: 'c-faq', news: 'c-news', video: 'c-more', ga4: 'c-more', reviews: 'c-more', contactForm: 'c-more', showMap: 'c-more', bookingForm: 'c-more', posts: 'c-posts', en: 'c-en', shop: 'c-shop', bookingDeposit: 'c-more', bookingCal: 'c-cal', code: 'c-code', order: 'c-order' };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAYL = { mon: '週一', tue: '週二', wed: '週三', thu: '週四', fri: '週五', sat: '週六', sun: '週日' };

// ── 英文版：「English」編輯模式下，文字欄位改成讀寫同一個物件的「欄位名＋En」（例如 name → nameEn）；
// 中文內容放在提示文字裡對照。價格、日期、照片、電話這類不分語言的欄位兩邊共用。
const EN_MODE = () => S.lang === 'en' && !!(S.content && S.content.en && S.content.en.enabled);
const TX_PATHS = ['name', 'tagline', 'intro', 'address', 'hoursNote', 'booking.label', 'shop.note', 'seo.title', 'seo.description'];
function tx(el, obj, key, after) {
  const en = EN_MODE(), k = en ? key + 'En' : key;
  el.value = obj[k] == null ? '' : obj[k];
  if (en) {
    el.lang = 'en'; el.classList.add('en-in');
    const zh = String(obj[key] || '').replace(/\s+/g, ' ').trim();
    el.placeholder = zh ? '中文：' + (zh.length > 40 ? zh.slice(0, 40) + '…' : zh) : 'English';
    if (el.maxLength > 0) el.maxLength = Math.round(el.maxLength * 2.5);
  }
  el.addEventListener('input', () => { obj[k] = el.value; if (after) after(el.value); touch(); });
  return el;
}
function bindInput(el, path, onChange) {
  if (EN_MODE() && TX_PATHS.includes(path)) {
    const ks = path.split('.'); const key = ks.pop();
    return tx(el, ks.length ? getPath(S.content, ks.join('.')) : S.content, key, onChange ? () => onChange() : null);
  }
  el.value = getPath(S.content, path) || '';
  el.addEventListener('input', () => { setPath(S.content, path, el.value); if (onChange) onChange(); touch(); });
  return el;
}
function field(label, path, o) {
  o = o || {};
  const id = 'f-' + path.replace(/\./g, '-');
  const el = o.area ? h('textarea', { id, maxlength: String(o.max || 600), rows: String(o.rows || 5), placeholder: o.ph || '' })
    : h('input', { id, type: o.type || 'text', maxlength: String(o.max || 100), placeholder: o.ph || '', autocomplete: 'off', inputmode: o.inputmode });
  const cnt = o.max && o.area ? h('b', { class: 'cnt', style: 'color:inherit;font-weight:400' }) : null;
  const upd = () => { if (cnt) cnt.textContent = [...el.value].length + '/' + o.max; };
  bindInput(el, path, upd); upd();
  return h('label', { class: 'field', for: id }, h('span', {}, h('em', { style: 'font-style:normal', text: label }), cnt), el, o.help ? h('div', { class: 'msg mute', text: o.help }) : null);
}
// 切換編輯語言：左邊欄位改成讀寫中文或英文，右邊預覽同步切換
function setLang(lang) {
  if (lang === 'en' && !(S.content.en && S.content.en.enabled)) return;
  if (S.lang === lang) return;
  S.lang = lang; syncPanel(); renderPreview(true);
  toast(lang === 'en' ? '現在編輯英文版：欄位裡填英文，灰色提示是中文內容' : '回到中文編輯');
}
function card(id, anchor, title, sub, ...kids) {
  const c = h('section', { class: 'card', id, 'data-anchor': anchor }, h('h2', { text: title }), sub ? h('p', { class: 'sub', text: sub }) : null, ...kids);
  // 換到另一張卡片時才把預覽捲過去（同一張卡片裡換欄位不會一直跳）
  c.addEventListener('focusin', () => { if (anchor && S.focusAnchor !== anchor) { S.focusAnchor = anchor; scrollPreviewTo(anchor); } });
  return c;
}

function buildPanel() {
  const L = S.lib, P = $('#panel'); P.replaceChildren();
  if (S.content.en && S.content.en.enabled) {
    const b = (lang, text) => h('button', { type: 'button', 'aria-pressed': String((S.lang === 'en') === (lang === 'en')), onclick: () => setLang(lang) }, text);
    P.append(h('div', { class: 'lang-bar' + (EN_MODE() ? ' is-en' : ''), role: 'group', 'aria-label': '編輯語言' }, h('span', { text: '編輯語言' }), b('zh', '中文'), b('en', 'English'),
      EN_MODE() ? h('small', { text: '填英文；灰色提示是中文內容' }) : null));
  }
  P.classList.toggle('lang-en', EN_MODE());
  P.append(h('details', { id: 'checks', class: 'checks', hidden: true }));
  P.append(h('div', { id: 'links', class: 'card', hidden: true }));

  // 基本設定
  const slugIn = h('input', { type: 'text', id: 'f-slug', maxlength: '30', autocomplete: 'off', spellcheck: 'false' });
  slugIn.value = S.slug;
  let st;
  slugIn.addEventListener('input', () => {
    const v = slugIn.value.trim().toLowerCase(); slugIn.value = v; S.slug = v; clearTimeout(st);
    const err = L.slugError(v);
    if (err) { S.slugState = { ok: false, msg: err }; paintSlug(); touch(); return; }
    if (v === S.site.slug) { S.slugState = { ok: true, msg: '' }; paintSlug(); touch(); return; }
    if (S.trial) { S.slugState = { ok: true, msg: '登入建立網站時，會再確認這個名稱能不能用' }; paintSlug(); touch(); return; }
    S.slugState = { ok: false, msg: '檢查中…', pending: true }; paintSlug();
    st = setTimeout(async () => {
      const r = await YC.client.rpc('rental_slug_available', { p_slug: v });
      if (S.slug !== v) return;
      S.slugState = r.error ? { ok: false, msg: '檢查失敗，請稍後再試' } : (r.data ? { ok: true, msg: '✓ 這個名稱可以使用' } : { ok: false, msg: '這個名稱已被使用，請換一個' });
      paintSlug(); touch();
    }, 400);
  });
  // 內建配色 + 完全自訂（背景、區塊底色、主色、文字 4 色都能調；也可以只挑主色讓系統自動搭配）
  const cur = L.parseCustomPalette(S.palette);
  const KEYS4 = [['bg', '背景'], ['surface', '區塊底色'], ['accent', '主色'], ['text', '文字']];
  const start4 = S.content.style.colors || (cur ? (({ bg, surface, accent, text }) => ({ bg, surface, accent, text }))(L.getPalette(S.palette)) : null) || (({ bg, surface, accent, text }) => ({ bg, surface, accent, text }))(L.derivePalette('#2F6F5C', false));
  const in4 = {};
  const fields4 = KEYS4.map(([k, label]) => {
    in4[k] = h('input', { type: 'color', id: 'f-c4-' + k, value: start4[k].toLowerCase() });
    in4[k].addEventListener('input', () => applyCustom());
    return h('label', { class: 'c4', for: 'f-c4-' + k }, in4[k], h('span', { text: label }));
  });
  const modeSel = h('select', { id: 'f-custom-mode', 'aria-label': '自動搭配的底色' },
    h('option', { value: 'l', text: '淺色底' }), h('option', { value: 'd', text: '深色底' }));
  modeSel.value = L.luminance(start4.bg) < 0.4 ? 'd' : 'l';
  const autoBtn = h('button', { type: 'button', class: 'btn small', text: '依主色自動搭配' });
  const warnBox = h('div', { class: 'msg warn', role: 'status' });
  const customSw = h('i', {});
  const customBtn = h('button', { type: 'button', class: 'pal pal-custom', 'data-id': 'custom', 'aria-pressed': String(!!cur) }, customSw, '自訂配色');
  const palBtns = L.PALETTE_IDS.map((id) => {
    const p = L.PALETTES[id];
    const b = h('button', { type: 'button', class: 'pal', 'data-id': id, 'aria-pressed': String(S.palette === id) },
      h('i', {}, [p.bg, p.surface, p.accent, p.text].map((c) => h('s', { style: 'background:' + c }))), p.label);
    b.addEventListener('click', () => { S.content.style.colors = null; setPalette(id); });
    return b;
  });
  const allPalBtns = [...palBtns, customBtn];
  const read4 = () => Object.fromEntries(KEYS4.map(([k]) => [k, in4[k].value.toUpperCase()]));
  function paintCustomSwatch() {
    const c = read4();
    customSw.replaceChildren(...[c.bg, c.surface, c.accent, c.text].map((x) => h('s', { style: 'background:' + x })));
    const w = L.colorWarnings(c);
    warnBox.textContent = w.length ? '提醒：' + w.join('；') + '。' : '';
    warnBox.hidden = !w.length;
  }
  function setPalette(id) {
    S.palette = id;
    allPalBtns.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.id === id || (x.dataset.id === 'custom' && L.isCustomPalette(id)))));
    touch();
  }
  // 4 色存在內容裡；配色代碼仍記主色（相容舊版與資料庫格式）
  function applyCustom() {
    const c = read4();
    paintCustomSwatch();
    S.content.style.colors = c;
    setPalette(L.customPaletteId(c.accent, L.luminance(c.bg) < 0.4));
  }
  function autoFill() {
    const p = L.derivePalette(in4.accent.value.toUpperCase(), modeSel.value === 'd');
    KEYS4.forEach(([k]) => { in4[k].value = p[k].toLowerCase(); });
    applyCustom();
  }
  autoBtn.addEventListener('click', autoFill); modeSel.addEventListener('change', autoFill);
  customBtn.addEventListener('click', applyCustom);
  paintCustomSwatch();
  const customRow = h('div', { class: 'custom-pal' },
    h('div', { class: 'c4-row' }, fields4),
    h('div', { class: 'c4-auto' }, h('span', { class: 'mute', text: '不想一個個挑？' }), modeSel, autoBtn),
    warnBox,
    h('div', { class: 'msg mute', text: '點色塊就能改顏色，預覽會馬上更新。只挑主色再按「依主色自動搭配」，其餘 3 色會配好、文字一定看得清楚。' }));
  // 首頁樣式
  const sel = (path, opts, label) => {
    const id = 'f-' + path;
    const el = h('select', { id, class: 'sel' }, opts.map(([v, t]) => h('option', { value: v, text: t })));
    bindInput(el, path, path === 'homeStyle' ? () => paintOrder() : null);
    return h('label', { class: 'field', for: id }, h('span', { text: label }), el);
  };
  const styleBox = h('div', { class: 'style-row' },
    sel('heroStyle', [['card', '標準：照片在文字旁'], ['full', '滿版大圖：照片鋪滿首頁上方']], '首頁主視覺'),
    sel('homeStyle', (L.HOME_STYLES || ['standard', 'magazine']).map((k) => [k, ({ standard: '標準：區塊依序排列', magazine: '雜誌風：大圖與圖文交錯', center: '置中大字：標題置中、照片橫幅', bento: '方格拼貼：首頁照片拼貼、標題在左欄', sidebar: '左側選單：電腦版選單固定在左邊' })[k] || k]), '版型風格'));
  P.append(card('c-basic', 'top', '網址與外觀', '選配色、版型與要顯示的內容。字型與按鈕在下一張卡片。',
    industryField(),
    h('label', { class: 'field', for: 'f-slug' }, h('span', {}, h('em', { style: 'font-style:normal', text: '網址代稱' }), h('b', { id: 'slugLock', text: '' })), slugIn),
    h('div', { id: 'slugMsg', class: 'msg mute' }), h('div', { id: 'slugUrl', class: 'msg mute', style: 'margin-bottom:12px' }),
    h('div', { class: 'field' }, h('span', { text: '配色' }), h('div', { class: 'palettes' }, allPalBtns), customRow),
    styleBox,
    h('div', { class: 'field' }, h('span', { text: '一鍵換風格' }),
      h('button', { type: 'button', class: 'btn small', id: 'lookPick', onclick: () => openLookPicker() }, '從風格範例套用外觀…'),
      h('div', { class: 'msg mute', text: '只換配色、字型、按鈕、版型與排列方式；你的文字、照片與價目都不會變。換了不喜歡可以按「復原」。' })),
    h('div', { id: 'layoutBox', class: 'field toggles' })));
  paintLayout();

  // 字型與按鈕
  const fontSel = h('select', { id: 'f-style-font', class: 'sel' }, L.FONTS.map((k) => h('option', { value: k, text: L.FONT_LABELS[k] })));
  fontSel.value = S.content.style.font;
  fontSel.addEventListener('change', () => { S.content.style.font = fontSel.value; paintFontBox(); touch(); });
  const btnBox = h('div', { class: 'seg-btns', role: 'group', 'aria-label': '按鈕形狀' }, L.BUTTONS.map((k) => {
    const b = h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(S.content.style.button === k), style: 'border-radius:' + ({ pill: '999px', round: '10px', square: '2px' })[k] }, L.BUTTON_LABELS[k]);
    b.addEventListener('click', () => { S.content.style.button = k; btnBox.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); touch(); });
    return b;
  }));
  const flOn = h('input', { type: 'checkbox', id: 'f-style-floatLine' }); flOn.checked = !!S.content.style.floatLine;
  flOn.addEventListener('change', () => { S.content.style.floatLine = flOn.checked; touch(); });
  const styleSel = (key, list, labels, label, anchor) => {
    const id = 'f-style-' + key;
    const el = h('select', { id, class: 'sel' }, list.map((k) => h('option', { value: k, text: labels[k] })));
    el.value = S.content.style[key];
    el.addEventListener('change', () => {
      S.content.style[key] = el.value;
      // 換了捲動動畫：預覽跳到第一個區塊，重新播放一次讓店家看到效果
      if (key === 'motion') { S.replayMotion = true; try { if ($('#frame').contentDocument.getElementById('about')) pendingAnchor = 'about'; } catch (e) { /* ignore */ } }
      touch(); if (anchor) scrollPreviewTo(anchor);
    });
    return h('label', { class: 'field', for: id }, h('span', { text: label }), el);
  };
  P.append(card('c-style', 'top', '外觀細節', '字型、按鈕、背景與各區塊的排列方式。全部都不會讓網站變慢。',
    h('label', { class: 'field', for: 'f-style-font' }, h('span', { text: '標題字型' }), fontSel), h('div', { id: 'fontBox', class: 'field', hidden: true }),
    h('div', { class: 'field' }, h('span', { text: '按鈕形狀' }), btnBox),
    h('div', { class: 'style-row' },
      styleSel('head', L.HEAD_STYLES, L.HEAD_LABELS, '區塊標題樣式', 'about'),
      styleSel('texture', L.TEXTURES, L.TEXTURE_LABELS, '背景紋理', 'menu'),
      styleSel('motion', L.MOTIONS, L.MOTION_LABELS, '捲動動畫')),
    h('div', { class: 'msg mute', style: 'margin:-4px 0 12px', text: '背景紋理會套用在有底色的區塊上。換了捲動動畫，預覽會自動播放一次，往下捲也看得到。' }),
    h('div', { class: 'style-row' },
      styleSel('menuStyle', L.MENU_STYLES, { list: '列表', cards: '卡片' }, '價目樣式', 'menu'),
      styleSel('gallery', L.GALLERY_STYLES, { masonry: '錯落排列', grid: '整齊方格', slide: '橫向滑動' }, '照片排列', 'interior'),
      styleSel('reviewStyle', L.REVIEW_STYLES, { cards: '卡片', quote: '大字引言' }, '評價樣式', 'reviews')),
    h('div', { class: 'field' }, h('label', { class: 'check', for: 'f-style-floatLine' }, flOn, h('strong', { text: '在畫面右下角顯示「LINE 聯絡」按鈕' })),
      h('div', { class: 'msg mute', text: '需要先在「店家資訊」填 LINE 連結。手機上客人隨時一按就能加你的 LINE。' }))));

  P.append(card('c-info', 'about', '店家資訊', null,
    field('店名', 'name', { max: 40, ph: '你的店名或品牌名稱' }),
    field('一句話介紹', 'tagline', { max: 60, ph: '一句話說明你的特色' }),
    field('店家介紹', 'intro', { area: true, max: 600, rows: 6, ph: '店的故事、特色、提供什麼、適合誰…（可分段）' }),
    field('地址', 'address', { max: 120, ph: '例如：高雄市苓雅區四維三路100號', help: '請寫完整地址（含縣市與區），搜尋與地圖才找得到你。' }),
    field('電話', 'phone', { max: 24, type: 'tel', ph: '例如：07-123-4567', inputmode: 'tel' }),
    h('div', { class: 'field' }, h('span', { text: '社群連結（選填，需 https:// 開頭）' })),
    field('Instagram', 'social.instagram', { max: 200, type: 'url', ph: 'https://www.instagram.com/…' }),
    field('Facebook', 'social.facebook', { max: 200, type: 'url', ph: 'https://www.facebook.com/…' }),
    field('LINE', 'social.line', { max: 200, type: 'url', ph: 'https://line.me/…' })));

  // 營業時間
  const rows = DAYS.map((d) => {
    const o = h('input', { type: 'time', 'aria-label': DAYL[d] + ' 開始' }), c = h('input', { type: 'time', 'aria-label': DAYL[d] + ' 結束' });
    const cl = h('input', { type: 'checkbox' });
    const rd = h('div', { class: 'hrs', 'aria-live': 'polite' });
    // 手機的時間欄位可能只顯示 24 小時制：另外用文字標出「上午／下午」
    const ap = (v) => { if (!/^\d{1,2}:\d{2}$/.test(v || '')) return '未填'; const [H, M] = v.split(':').map(Number); return (H < 12 ? '上午 ' : '下午 ') + (H % 12 || 12) + ':' + String(M).padStart(2, '0'); };
    const refresh = () => { rd.textContent = cl.checked ? '公休' : ap(o.value) + ' – ' + ap(c.value); };
    const sync = () => { o.disabled = c.disabled = cl.checked; refresh(); };
    o.value = S.content.hours[d].open; c.value = S.content.hours[d].close; cl.checked = S.content.hours[d].closed; sync();
    o.addEventListener('input', () => { S.content.hours[d].open = o.value; refresh(); touch(); });
    c.addEventListener('input', () => { S.content.hours[d].close = c.value; refresh(); touch(); });
    cl.addEventListener('change', () => { S.content.hours[d].closed = cl.checked; if (cl.checked) { S.content.hours[d].open = ''; S.content.hours[d].close = ''; o.value = c.value = ''; } sync(); touch(); });
    return { d, o, c, cl, refresh, el: h('div', { class: 'hours-row' }, h('strong', { text: DAYL[d] }), o, c, h('label', { class: 'closed' }, cl, '公休'), rd) };
  });
  // 把某一天的時間套用到其他「有營業」的日子；公休的日子不動。來源預設是第一個有營業的日子
  const srcSel = h('select', { class: 'sel', 'aria-label': '要套用哪一天的時間', style: 'width:auto;display:inline-block;margin:0 6px' });
  const paintSrc = () => {
    const open = DAYS.filter((d) => !S.content.hours[d].closed && S.content.hours[d].open && S.content.hours[d].close);
    const cur = open.includes(srcSel.value) ? srcSel.value : open[0] || '';
    srcSel.replaceChildren(...open.map((d) => h('option', { value: d, text: DAYL[d] })));
    srcSel.value = cur; copyWrap.hidden = open.length === 0;
  };
  const copyBtn = h('button', { type: 'button', class: 'btn small' }, '套用到其他營業日');
  const copyWrap = h('div', { style: 'margin:4px 0 12px;display:flex;align-items:center;flex-wrap:wrap;gap:6px' }, h('span', { class: 'msg mute', style: 'margin:0', text: '把' }), srcSel, h('span', { class: 'msg mute', style: 'margin:0', text: '的時間' }), copyBtn);
  copyBtn.addEventListener('click', () => {
    const k = srcSel.value, src = S.content.hours[k]; if (!k || !src) return;
    let n = 0;
    rows.forEach((r) => { if (r.d === k || S.content.hours[r.d].closed) return; Object.assign(S.content.hours[r.d], { open: src.open, close: src.close }); r.o.value = src.open; r.c.value = src.close; r.refresh(); n++; });
    touch(); toast(n ? '已套用到 ' + n + ' 天，公休的日子沒有改' : '其他日子都是公休，沒有可以套用的', 3000);
  });
  rows.forEach((r) => { [r.o, r.c].forEach((x) => x.addEventListener('change', paintSrc)); r.cl.addEventListener('change', paintSrc); });
  paintSrc();
  P.append(card('c-hours', 'visit', '營業時間', '每天填開始與結束時間；沒營業的那天勾「公休」。',
    rows.map((r) => r.el), copyWrap, field('備註（選填）', 'hoursNote', { max: 80, ph: '例如：國定假日營業時間以粉絲專頁公告為準' })));

  P.append(noticeCard());

  P.append(card('c-booking', 'top', bookWord() + '按鈕', '填了才會出現在網站首頁。連結必須是 https:// 開頭（例如你的' + bookWord() + '系統或 LINE 預約頁）。',
    field('按鈕文字', 'booking.label', { max: 12, ph: '例如：線上' + bookWord() }), field('連結', 'booking.url', { max: 500, type: 'url', ph: 'https://' }), h('div', { id: 'bookMsg', class: 'msg bad' })));

  // 照片
  const slots = [{ key: 'hero', label: '主視覺照片（必填）', get: () => S.content.photos.hero, set: (v) => { S.content.photos.hero = v; } }];
  for (let i = 0; i < L.LIMITS.room; i++) slots.push({ key: 'room' + i, label: IND().space.label + '照片 ' + (i + 1) + '（選填）', get: () => S.content.photos.room[i] || null,
    set: (v) => { const r = S.content.photos.room; if (v) { r[i] = v; } else { r.splice(i, 1); } } });
  const photoBox = h('div', { id: 'photoBox' });
  P.append(card('c-photos', 'top', '照片', 'JPG、PNG、WebP、HEIC 皆可，單張原檔不超過 5MB。系統會自動縮小並轉成適合網頁的格式。', photoBox));
  S.slots = slots; paintPhotos();

  // 清單
  P.append(card('c-menu', 'menu', IND().offer.label, '最多 ' + L.LIMITS.menu + ' 項。價格只填數字。', h('div', { id: 'menuBox' }), h('button', { type: 'button', class: 'btn small', id: 'menuAdd' }, '＋ 新增' + IND().offer.item), h('span', { id: 'menuCnt', class: 'msg mute', style: 'margin-left:10px' })));
  P.append(card('c-news', 'news', '最新消息', '最多 6 則。', h('div', { id: 'newsBox' }), h('button', { type: 'button', class: 'btn small', id: 'newsAdd' }, '＋ 新增消息'), h('span', { id: 'newsCnt', class: 'msg mute', style: 'margin-left:10px' })));
  P.append(card('c-faq', 'faq', '常見問題', '最多 8 題。每題的回答建議 30–300 字，搜尋引擎與 AI 最愛引用這種問與答。', h('div', { id: 'faqBox' }), h('button', { type: 'button', class: 'btn small', id: 'faqAdd' }, '＋ 新增問題'), h('span', { id: 'faqCnt', class: 'msg mute', style: 'margin-left:10px' })));
  $('#menuAdd').onclick = () => { if (S.content.menu.length < L.LIMITS.menu) { S.content.menu.push({ name: '', price: null }); paintMenu(); touch(); const i = $('#menuBox input'); } };
  $('#newsAdd').onclick = () => { if (S.content.news.length < L.LIMITS.news) { S.content.news.push({ date: new Date().toISOString().slice(0, 10), title: '' }); paintNews(); touch(); } };
  $('#faqAdd').onclick = () => { if (S.content.faq.length < L.LIMITS.faq) { S.content.faq.push({ q: '', a: '' }); paintFaq(); touch(); } };
  // 更多內容：聯絡表單、地圖、影片、客人評價、Google Analytics
  const toggle = (path, label, help) => {
    const cb = h('input', { type: 'checkbox', id: 'f-' + path }); cb.checked = !!S.content[path];
    cb.addEventListener('change', () => { S.content[path] = cb.checked; touch(); if (cb.checked) scrollPreviewTo(path === 'contactForm' ? 'contact' : 'visit'); });
    return h('div', { class: 'field' }, h('label', { class: 'check', for: 'f-' + path }, cb, h('strong', { text: label })), h('div', { class: 'msg mute', text: help }));
  };
  P.append(card('c-more', 'reviews', '更多內容', '都是選用的，需要再開。',
    toggle('contactForm', '顯示聯絡表單', '客人可以在網站上留言，留言會寄到你的登入 Email，也可以在會員專區查看。'),
    toggle('bookingForm', '顯示線上預約', '客人可以選日期、時間送出預約申請（會檢查是否在營業時間內），申請會寄到你的 Email。網站不會自動保留時段，請你收到後主動與客人確認。'),
    field('預約訂金（選填，元）', 'bookingDeposit', { max: 6, type: 'number', inputmode: 'numeric', ph: '0＝不收訂金', help: '有填金額時，客人送出預約後要先付訂金才算送出。需要先在會員專區開啟「網站收款」（用你自己的綠界帳號）。' }),
    toggle('showMap', '顯示 Google 地圖', '在' + IND().visit.label + '顯示地圖（需要先填地址）。地圖要點了才會載入，不會拖慢網站。'),
    field('YouTube 影片網址（選填）', 'video', { max: 200, type: 'url', ph: 'https://www.youtube.com/watch?v=…', help: '放一支介紹影片。訪客點了才會載入播放器，不會拖慢網站。' }),
    h('div', { class: 'field' }, h('span', { text: '客人評價（選填，最多 6 則）' }), h('div', { class: 'msg mute', style: 'margin:0 0 8px', text: '請放真實的評價，可以摘自 Google 評論或客人留言；名字可以只寫稱呼（例如：林小姐）。' })),
    h('div', { id: 'reviewBox' }), h('button', { type: 'button', class: 'btn small', id: 'reviewAdd' }, '＋ 新增評價'), h('span', { id: 'reviewCnt', class: 'msg mute', style: 'margin-left:10px' }),
    h('div', { style: 'height:14px' }),
    field('Google Analytics 評估 ID（選填）', 'ga4', { max: 20, ph: 'G-XXXXXXXXXX', help: '網站已經內建瀏覽次數統計（在會員專區查看）。需要更詳細的分析才填；GA 會在訪客第一次操作或 6 秒後才載入。' })));
  // 線上購買：商品（名稱、價格、說明、照片），付款走店家自己的綠界帳號（會員專區設定）
  const shopOn = h('input', { type: 'checkbox', id: 'f-shop-enabled' }); shopOn.checked = !!S.content.shop.enabled;
  shopOn.addEventListener('change', () => { S.content.shop.enabled = shopOn.checked; touch(); if (shopOn.checked) scrollPreviewTo('shop'); });
  P.append(card('c-shop', 'shop', '線上購買（選填）', '最多 ' + L.LIMITS.shopItems + ' 項。客人在網站上選數量、填資料後線上付款，款項直接進你的綠界帳戶。收款要先到會員專區的「網站收款與訂單」開啟，沒開啟時網站只顯示商品，請客人用電話或 LINE 訂購。',
    h('div', { class: 'field' }, h('label', { class: 'check', for: 'f-shop-enabled' }, shopOn, h('strong', { text: '在網站顯示線上購買' }))),
    h('div', { id: 'itemBox' }), h('button', { type: 'button', class: 'btn small', id: 'itemAdd' }, '＋ 新增商品'), h('span', { id: 'itemCnt', class: 'msg mute', style: 'margin-left:10px' }),
    h('div', { style: 'height:14px' }),
    field('購買須知（選填）', 'shop.note', { area: true, max: 300, rows: 3, ph: '例如：付款後 3 個工作天內出貨；運費已含在售價；可到店自取', help: '目前不另外計算運費，請把運費算進售價或在這裡說明。' })));
  $('#itemAdd').onclick = () => {
    if (S.content.shop.items.length >= L.LIMITS.shopItems) return;
    S.content.shop.items.push({ id: Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, 'x').padEnd(8, 'x'), name: '', price: null, desc: '', photo: null });
    if (!S.content.shop.enabled) { S.content.shop.enabled = true; shopOn.checked = true; }
    paintItems(); touch(); scrollPreviewTo('shop');
  };
  // 文章：每篇一個網頁（posts/<代碼>/），代碼建立時產生、之後不變
  P.append(card('c-posts', 'posts', '文章', '最多 ' + L.LIMITS.posts + ' 篇。寫店裡的故事、新品、活動或常見問題的完整說明，每篇都會有自己的網頁，容易被搜尋與 AI 找到。',
    h('div', { id: 'postBox' }), h('button', { type: 'button', class: 'btn small', id: 'postAdd' }, '＋ 新增文章'), h('span', { id: 'postCnt', class: 'msg mute', style: 'margin-left:10px' })));
  $('#postAdd').onclick = () => {
    if (S.content.posts.length >= L.LIMITS.posts) return;
    const d = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    S.content.posts.unshift({ id: d + '-' + Math.random().toString(36).slice(2, 6), title: '', date: d, body: '' });
    paintPosts(); touch();
  };
  // 自訂區塊：標題、文字、照片、按鈕
  P.append(card('c-blocks', 'top', '自訂區塊（選填）', '最多 ' + L.LIMITS.blocks + ' 個。除了圖文，也可以加服務流程、數字亮點、合作客戶與認證、服務地區、設備與規格、施工前後對比。想放的內容沒有現成欄位時用這裡，例如：包場服務、品牌故事、合作夥伴、徵才。',
    h('div', { id: 'blockBox' }), h('button', { type: 'button', class: 'btn small primary', id: 'blockTpl' }, '＋ 從範本加入（附範例文字）'), ' ', h('button', { type: 'button', class: 'btn small', id: 'blockAdd' }, '＋ 新增圖文區塊'), ' ',
    h('select', { class: 'sel', id: 'blockKind', 'aria-label': '其他區塊類型', style: 'width:auto;display:inline-block;margin:4px 6px 4px 0' },
      h('option', { value: '', text: '＋ 新增其他區塊…' }),
      ['steps', 'stats', 'logos', 'areas', 'gear', 'compare'].map((k) => h('option', { value: k, text: (L.BLOCK_KIND_LABELS || {})[k] || k }))), ' ',
    h('button', { type: 'button', class: 'btn small', id: 'blockAddHtml' }, '＋ 嵌入程式碼（進階）'), h('span', { id: 'blockCnt', class: 'msg mute', style: 'margin-left:10px' }),
    h('div', { class: 'msg mute', style: 'margin-top:8px', text: '「嵌入程式碼」可以貼 Google 表單、Instagram、Google 日曆、訂位系統等提供的嵌入碼（進階方案，發佈後由我們審核才會出現在網站）。' })));
  const addBlock = (kind) => {
    if (S.content.blocks.length >= L.LIMITS.blocks) return;
    const id = 'k' + Math.random().toString(36).slice(2, 9).replace(/[^a-z0-9]/g, 'x');
    const base = { id, kind, title: '', body: '', photo: null, btnLabel: '', btnUrl: '', side: 'right', hidden: false };
    if (kind === 'html') base.html = '';
    if (['steps', 'stats', 'logos', 'areas', 'gear'].includes(kind)) { base.title = L.BLOCK_KIND_LABELS[kind]; base.items = [{ t: '', v: '', d: '' }]; }
    if (kind === 'compare') { base.title = '施工前後對比'; base.photo2 = null; base.cap1 = '施工前'; base.cap2 = '施工後'; }
    S.content.blocks.push(base);
    S.content.order = L.normalizeOrder(S.content.order, S.content.blocks);
    paintBlocks(); paintOrder(); touch(); setTimeout(() => scrollPreviewTo('b-' + id), 300);
  };
  $('#blockAdd').onclick = () => addBlock('text');
  $('#blockTpl').onclick = () => openBlockTemplates();
  $('#blockAddHtml').onclick = () => addBlock('html');
  $('#blockKind').onchange = () => { const k = $('#blockKind').value; $('#blockKind').value = ''; if (k) addBlock(k); };
  // 首頁區塊順序
  P.append(card('c-order', 'top', '首頁區塊順序與副標題', '拖曳左邊的 ⋮⋮ 或用「上移／下移」調整首頁區塊的先後，也可以替每個區塊寫一句副標題。沒有內容或沒開啟的區塊不會出現在網站上。',
    h('div', { id: 'orderNote', class: 'msg mute', style: 'margin:0 0 8px' }), h('ol', { id: 'orderBox', class: 'order-list' }),
    h('button', { type: 'button', class: 'btn small', id: 'orderReset' }, '恢復預設順序')));
  $('#orderReset').onclick = () => { S.content.order = L.normalizeOrder([], S.content.blocks); paintOrder(); touch(); };
  // 搜尋與分享
  const shareSlot = { key: 'share', label: '分享圖片', get: () => S.content.seo.share, set: (v) => { S.content.seo.share = v; } };
  const shareBox = h('div', { id: 'shareBox' });
  P.append(card('c-seo', 'top', '搜尋與分享（選填）', '系統會自動產生網頁標題與描述，通常不用改。想自己寫，填在這裡就會取代自動的版本。',
    field('網頁標題', 'seo.title', { max: L.LIMITS.seoTitle, ph: '留空＝自動產生', help: '顯示在 Google 搜尋結果與瀏覽器分頁上。建議包含店名、地區與店家類型，30 字以內最完整。' }),
    field('網頁描述', 'seo.description', { area: true, max: L.LIMITS.seoDesc, rows: 3, ph: '留空＝自動產生', help: '顯示在搜尋結果標題下方。建議 80–160 字，寫清楚你是誰、在哪裡、提供什麼。' }),
    h('div', { class: 'field' }, h('span', { text: '分享到 LINE／Facebook 時的圖片（選填，沒有就用主視覺）' }), shareBox,
      h('div', { class: 'msg mute', text: '建議橫式、寬 1200 像素左右的照片。' }))));
  S.shareSlot = shareSlot; paintShare();
  // 預約行事曆（進階方案）
  const calOn = h('input', { type: 'checkbox', id: 'f-cal-enabled' }); calOn.checked = !!S.content.bookingCal.enabled;
  calOn.addEventListener('change', () => {
    S.content.bookingCal.enabled = calOn.checked;
    if (calOn.checked && !S.content.bookingForm) { S.content.bookingForm = true; const b = $('#f-bookingForm'); if (b) b.checked = true; }
    touch(); scrollPreviewTo('booking');
  });
  P.append(card('c-cal', 'booking', '預約行事曆' + proTitle(), '客人在網站上直接選日期與時段，每個時段有名額上限，額滿就不能再選。你在會員專區確認或取消，客人有留 Email 會收到通知。',
    proNote(),
    h('div', { class: 'field' }, h('label', { class: 'check', for: 'f-cal-enabled' }, calOn, h('strong', { text: '使用預約行事曆（取代原本的預約申請表）' }))),
    h('div', { id: 'calBox' })));
  // 自訂程式碼（進階方案）
  const codeArea = (path, label, ph) => {
    const el = h('textarea', { id: 'f-' + path.replace('.', '-'), class: 'code', rows: '6', maxlength: String(L.LIMITS.code || 20000), spellcheck: 'false', placeholder: ph });
    bindInput(el, path, () => { clearTimeout(S.timers.code); S.timers.code = setTimeout(paintCodeStatus, 800); });
    return h('label', { class: 'field', for: el.id }, h('span', { text: label }), el);
  };
  P.append(card('c-code', 'top', '自訂程式碼' + proTitle(), '放 Meta Pixel、LINE Tag、聊天外掛、網站驗證碼等第三方提供的程式碼。預覽不會執行；發佈後由我們審核，核准才會放進正式網站（同一段程式碼只審一次）。',
    proNote(),
    codeArea('code.head', '放在 <head> 裡（追蹤碼、驗證碼）', '<script>…</script> 或 <meta …>'),
    codeArea('code.body', '放在頁面最後（聊天外掛等）', '<script src="https://…"></script>'),
    h('div', { id: 'codeStatus', class: 'msg mute' }),
    h('div', { class: 'msg mute', text: '程式碼可能讓網站變慢或出錯，請只貼你信任的服務提供的程式碼。' })));
  // 版本紀錄
  P.append(card('c-history', 'top', '版本紀錄', '每次按「發佈」都會留一個版本（保留最近 20 個）。改壞了可以還原成之前的版本，還原後再按一次發佈才會更新網站。',
    h('button', { type: 'button', class: 'btn small', id: 'histOpen' }, '查看過去的版本')));
  $('#histOpen').onclick = openHistory;

  // 英文版
  const enOn = h('input', { type: 'checkbox', id: 'f-en-enabled' }); enOn.checked = !!S.content.en.enabled;
  enOn.addEventListener('change', () => { S.content.en.enabled = enOn.checked; if (!enOn.checked) S.lang = 'zh'; touch(); syncPanel(); renderPreview(true); });
  const enKids = [h('div', { class: 'field' }, h('label', { class: 'check', for: 'f-en-enabled' }, enOn, h('strong', { text: '開啟英文版' })))];
  if (S.content.en.enabled) {
    const miss = S.lib.missingEn ? S.lib.missingEn(S.content) : [];
    enKids.push(h('p', { class: 'msg mute', text: '網站上的固定文字（營業時間、預約、頁名、按鈕）會自動換成英文；店名、介紹、價目這些內容由你填英文。沒填英文的品名會沿用中文；常見問題、消息、文章沒填英文的那一則，不會出現在英文版。' }),
      h('div', { class: 'en-actions' }, h('button', { type: 'button', class: 'btn small' + (EN_MODE() ? '' : ' primary'), onclick: () => setLang(EN_MODE() ? 'zh' : 'en') }, EN_MODE() ? '回到中文編輯' : '切換到英文編輯（English）')),
      miss.length ? h('div', { class: 'en-miss' }, h('strong', { text: '還沒填英文：' }), h('ul', {}, ...miss.map((m) => h('li', {}, h('button', { type: 'button', class: 'linkish', onclick: () => { setLang('en'); const c = cardForKey(m.key); if (c) openCard(c.card, c.focus); } }, m.label)))))
        : h('p', { class: 'msg ok', text: '✓ 英文內容都填好了' }));
  }
  P.append(card('c-en', 'top', '英文版（選填）', '開啟後，網站每一頁都會有英文版（網址 /en/…），右上角可以切換中英文，Google 也會知道兩種語言是同一家店。', ...enKids));
  $('#reviewAdd').onclick = () => { if (S.content.reviews.length < L.LIMITS.reviews) { S.content.reviews.push({ name: '', text: '' }); paintReviews(); touch(); } };
  paintMenu(); paintNews(); paintFaq(); paintReviews(); paintPosts(); paintItems(); paintBlocks(); paintOrder(); paintSlug(); paintLinks(); refreshTodo();
  paintFontBox(); paintCal(); paintCodeStatus();
  if (!S.isOwner) { const ind = $('#f-industry'); if (ind) { ind.disabled = true; ind.title = '只有網站擁有者能更改行業'; } }
  buildGroupNav();
}

// ── 編輯面板分組：上方的分組按鈕只顯示該組的卡片，不用一直往下捲 ──
const GROUPS = [
  { key: 'look', label: '外觀', cards: ['c-basic', 'c-style'] },
  { key: 'info', label: '店家資料', cards: ['c-info', 'c-hours', 'c-notice', 'c-booking', 'c-photos'] },
  { key: 'content', label: '內容', cards: ['c-menu', 'c-news', 'c-faq', 'c-more', 'c-posts', 'c-blocks'] },
  { key: 'feature', label: '收款與功能', cards: ['c-shop', 'c-cal', 'c-en', 'c-seo', 'c-code'] },
  { key: 'layout', label: '版面與紀錄', cards: ['c-order', 'c-history'] },
  { key: 'all', label: '全部', cards: null }
];
const groupOf = (cardId) => (GROUPS.find((g) => g.cards && g.cards.includes(cardId)) || {}).key;
function buildGroupNav() {
  const P = $('#panel');
  let cur = 'look';
  try { cur = localStorage.getItem('yc-builder-group') || 'look'; } catch (e) { /* ignore */ }
  if (!GROUPS.some((g) => g.key === cur)) cur = 'look';
  const search = h('input', { type: 'search', id: 'setSearch', class: 'set-search', placeholder: '找設定：例如 電話、配色、預約、字型', 'aria-label': '搜尋設定', autocomplete: 'off' });
  search.addEventListener('input', () => runSearch(search.value));
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; runSearch(''); } if (e.key === 'Enter') { const c = $('#panel section.card:not([hidden])'); if (c) openCard(c.id, () => c.querySelector('input:not([disabled]),textarea,select')); } });
  const nav = h('nav', { class: 'group-nav', 'aria-label': '編輯分類' }, GROUPS.map((g) => h('button', { type: 'button', 'data-g': g.key, 'aria-pressed': 'false', onclick: () => { clearSearch(); showGroup(g.key, true); } }, g.label)),
    h('button', { type: 'button', class: 'guide-btn', onclick: () => openGuide(), title: '使用教學' }, '？ 教學'), search, h('div', { id: 'searchMsg', class: 'msg mute', hidden: true }));
  P.prepend(nav);
  P.querySelectorAll('section.card').forEach((c) => { c.dataset.group = groupOf(c.id) || 'feature'; });
  buildMobList();
  const reopen = $('.app').dataset.mode === 'card' && S.mCardId;
  showGroup(cur, false);
  if (reopen) { const c = $('#' + S.mCardId); if (c) { if (c.hidden) showGroup(c.dataset.group || 'all', false); enterCard(c, true); } else $('.app').dataset.mode = 'list'; }
  let seen = false; try { seen = localStorage.getItem('yc-builder-guide') === '1'; } catch (e) { /* ignore */ }
  if (!seen) setTimeout(openGuide, 600);
}
// 搜尋設定：依卡片標題、說明與欄位名稱比對，只顯示符合的卡片
const SYN = { 電話: '電話', 顏色: '配色 顏色 主色', 配色: '配色 顏色', 字: '字型 字體', 字型: '字型 字體 上傳', 預約: '預約 訂位 行事曆 時段', 訂位: '訂位 預約', 照片: '照片 圖片 主視覺', 圖片: '照片 圖片', 地址: '地址 地圖', 時間: '營業時間 時段 公休 公告', 公休: '公休 公告 營業時間', 公告: '公告 公休', 價格: '價目 菜單 價格 商品', 網址: '網址 代稱 網域', 程式: '程式碼 嵌入', 追蹤: '程式碼 Analytics', 分享: '分享 搜尋', 英文: '英文' };
let searchPrev = null;
function clearSearch() { const s = $('#setSearch'); if (s && s.value) { s.value = ''; runSearch(''); } }
function runSearch(q) {
  const P = $('#panel'), msg = $('#searchMsg');
  q = q.trim();
  if (!q) {
    msg.hidden = true;
    if (searchPrev) { const g = searchPrev; searchPrev = null; showGroup(g, false); }
    return;
  }
  if (!searchPrev) searchPrev = (P.querySelector('.group-nav button[aria-pressed=true]') || {}).dataset ? P.querySelector('.group-nav button[aria-pressed=true]').dataset.g : 'look';
  const words = (SYN[q] || q).toLowerCase().split(/\s+/).filter(Boolean);
  let n = 0;
  P.querySelectorAll('section.card').forEach((c) => {
    const text = (c.textContent + ' ' + [...c.querySelectorAll('input,textarea')].map((i) => i.placeholder || '').join(' ')).toLowerCase();
    const hit = words.some((w) => text.includes(w));
    c.hidden = !hit; if (hit) n++;
  });
  P.querySelectorAll('.group-nav button[data-g]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  paintMobList();
  msg.hidden = false; msg.textContent = n ? '找到 ' + n + ' 張相關的設定卡片（按 Enter 直接打開第一張，按 Esc 清除）' : '找不到「' + q + '」，換個說法試試看';
}
function showGroup(key, scroll) {
  const P = $('#panel');
  P.querySelectorAll('.group-nav button[data-g]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === key)));
  P.querySelectorAll('section.card').forEach((c) => { c.hidden = key !== 'all' && c.dataset.group !== key; });
  if (!$('#setSearch') || !$('#setSearch').value) searchPrev = null;
  try { localStorage.setItem('yc-builder-group', key); } catch (e) { /* ignore */ }
  if (scroll) P.scrollTo({ top: 0, behavior: 'smooth' });
  paintMobList();
}
// 第一次進編輯器的簡短引導（之後可按「？ 教學」再看）
function openGuide() {
  // 手機與電腦的畫面不同（手機是下方分頁、沒有左右兩欄）；試用中還不會存到帳號
  const mob = isMob();
  const save = S.trial ? (mob ? '試用中的內容會暫存在這支手機，登入後才會存到你的帳號。' : '試用中的內容會暫存在這個瀏覽器，登入後才會存到你的帳號。') : '不用一次填完，系統每 2 秒自動儲存。';
  const steps = mob ? [
    ['1　填內容', '用下方的分頁切換「外觀、店家、內容、功能」，點一項就能填寫。' + save],
    ['2　看預覽', '點下方的「預覽」看網站的樣子；在設定頁也可以按右下角「邊改邊看」，上面顯示網站、下面改設定。點預覽上的文字，再按「改這段字」就能直接修改。灰色的 [提示文字] 不會出現在正式網站。'],
    ['3　按發佈', '必填項目完成後，按右上角「發佈」。' + (S.trial ? '登入、確認付款後網站才會正式上線。' : '之後每次修改再按一次發佈，網站約 1–2 分鐘更新。')],
    ['小技巧', '改錯了可以按上方的「↶ 復原」；想回到以前發佈的版本，到右上角「⋯」裡的版本紀錄還原。']
  ] : [
    ['1　填內容', '左邊依分類填寫：先選外觀，再填店家資料與照片。' + save],
    ['2　看預覽', '右邊會即時顯示網站的樣子，可以切換電腦、平板與手機，選單、捲動動畫都能直接試。點預覽裡的文字可以直接修改。灰色的 [提示文字] 不會出現在正式網站。'],
    ['3　按發佈', '必填項目完成後，按右上角「發佈」。' + (S.trial ? '登入、確認付款後網站才會正式上線。' : '之後每次修改再按一次發佈，網站約 1–2 分鐘更新。')],
    ['小技巧', '改錯了可以按「復原」；想回到以前發佈的版本，到「版面與紀錄」的版本紀錄還原。']
  ];
  modal('三步驟做好你的網站', [h('ol', { class: 'guide' }, steps.map(([t, d]) => h('li', {}, h('strong', { text: t }), h('p', { text: d }))))],
    [h('button', { type: 'button', class: 'btn primary', onclick: () => { try { localStorage.setItem('yc-builder-guide', '1'); } catch (e) { /* ignore */ } closeModal(); } }, '開始編輯')]);
}

// 行業：可以更改；會改變網站用詞、頁面名稱與網址（多頁版）、給搜尋引擎看的店家類型
function industryField() {
  const L = S.lib;
  const sel = h('select', { id: 'f-industry', class: 'sel' },
    L.INDUSTRY_GROUPS.map((g) => h('optgroup', { label: g }, L.INDUSTRIES.filter((i) => i.group === g).map((i) => h('option', { value: i.key, text: i.label })))));
  sel.value = IND().key;
  sel.addEventListener('change', () => {
    const to = L.getIndustry(sel.value), from = IND();
    if (!to || to.key === from.key) return;
    const live = ['live', 'overdue', 'pending'].includes(S.site.status);
    const moved = isMulti() ? L.pagesFor(to.key).filter((p) => { const o = L.pagesFor(from.key).find((x) => x.key === p.key); return o && o.path !== p.path && S.pages[p.key]; }) : [];
    const goBtn = h('button', { class: 'btn primary' }, '確定更改');
    goBtn.addEventListener('click', async () => {
      if (S.trial) {
        S.site.template = to.key;
        if (!S.trialEdited) { const smp = await sampleContent(to.key); S.content = smp.content; S.palette = smp.palette; }
        closeModal(); buildPanel(); renderPreview(true); S.dirty = true; save();
        toast('已改為「' + to.label + '」', 3000); return;
      }
      goBtn.disabled = true; goBtn.textContent = '更改中…';
      if (!(await save())) { goBtn.disabled = false; goBtn.textContent = '確定更改'; toast('目前的內容還沒儲存成功，請稍後再試', 5000); return; }
      const r = await YC.client.from('rental_sites').update({ template: to.key }).eq('id', S.site.id).select('template').single();
      if (r.error) {
        closeModal(); sel.value = from.key;
        toast(/permission|privilege|denied/i.test(r.error.message) ? '目前還不能自己更改行業，請聯絡我們協助' : '更改失敗：' + r.error.message, 6000);
        return;
      }
      S.site.template = r.data.template;
      closeModal(); buildPanel(); renderPreview(true);
      toast('已改為「' + to.label + '」' + (live ? '，按「發佈」後正式網站才會更新' : ''), 5000);
    });
    modal('更改行業為「' + to.label + '」？', [
      h('p', { text: '網站的用詞與頁面名稱會改成這個行業的說法（例如「' + from.offer.label + '」會變成「' + to.offer.label + '」），你填的內容都會保留。' }),
      moved.length ? h('p', { class: 'msg mute', text: '多頁版有些頁面的網址會改變：' + moved.map((p) => '/' + L.pagesFor(from.key).find((x) => x.key === p.key).path + ' → /' + p.path).join('、') + '。已經分享出去的舊網址會找不到頁面。' }) : null,
      live ? h('p', { class: 'msg mute', text: '改完要按「發佈」，正式網站才會更新。' }) : null],
    [h('button', { class: 'btn', onclick: () => { closeModal(); sel.value = from.key; } }, '取消'), goBtn]);
  });
  return h('label', { class: 'field', for: 'f-industry' }, h('span', { text: '行業' }), sel);
}

// 版型：一頁版用區塊開關；多頁版用頁面勾選（首頁一定有）
function paintLayout() {
  const L = S.lib, box = $('#layoutBox'); if (!box) return;
  if (!isMulti()) {
    const toggles = L.SECTION_KEYS.map((k) => {
      const cb = h('input', { type: 'checkbox' }); cb.checked = !!S.sections[k];
      cb.addEventListener('change', () => { S.sections[k] = cb.checked; touch(); if (cb.checked) scrollPreviewTo(k); });
      return h('label', {}, cb, sectionLabel(k));
    });
    const up = multiOpen() && S.isOwner ? h('div', { class: 'upgrade' },
      h('div', { class: 'msg mute', text: '想把內容分成多個頁面（關於、' + IND().offer.nav + '、' + IND().space.label + '、常見問題…）？可以升級成多頁版。' }),
      h('button', { type: 'button', class: 'btn small', onclick: askUpgrade }, '升級成多頁版')) : null;
    box.replaceChildren(h('span', { text: '版型：一頁版（所有內容在同一頁）' }), h('div', { class: 'msg mute', style: 'margin:0 0 4px', text: '要顯示的區塊：' }), ...toggles, up || '');
    return;
  }
  const list = L.pagesFor(S.site.template).map((p) => {
    const cb = h('input', { type: 'checkbox' }); cb.checked = !!S.pages[p.key];
    cb.addEventListener('change', () => {
      S.pages[p.key] = cb.checked;
      if (L.SECTION_KEYS.includes(p.key)) S.sections[p.key] = cb.checked;   // 與發佈檢查一致
      if (!cb.checked && S.page === p.key) S.page = 'home';
      touch();
      if (cb.checked) setTimeout(() => goPage(p.key), RENDER_DELAY + 20);
    });
    return h('label', {}, cb, p.label, h('small', { class: 'mute', text: '　/' + p.path }));
  });
  const home = h('input', { type: 'checkbox', checked: true, disabled: true });
  box.replaceChildren(h('span', { text: '版型：多頁版' }), h('div', { class: 'msg mute', style: 'margin:0 0 4px', text: '要有哪些頁面（沒有內容的頁面不會出現在正式網站）：' }),
    h('label', {}, home, '首頁', h('small', { class: 'mute', text: '　一定會有' })), ...list);
}
// 升級成多頁版：已付費、還有剩餘天數的網站要補差額；確認收到差額後才發佈多頁版（在那之前正式網站維持一頁版）
async function askUpgrade() {
  if (S.trial) return askLoginToKeep('升級成多頁版');
  const L = S.lib;
  const pages = L.pagesFromSections(S.sections);
  const names = L.pagesFor(S.site.template).filter((p) => pages[p.key]).map((p) => p.label).join('、');
  const live = ['live', 'overdue', 'pending'].includes(S.site.status);
  let q = { amount: 0, days: 0, yearly: false };
  try { const r = await YC.client.functions.invoke('member-site', { body: { action: 'upgrade_quote', site_id: S.site.id } }); if (r.data && r.data.ok) q = r.data; } catch (e) { /* 取不到就照 0 顯示，送出時伺服器會再算一次 */ }
  const money = (n) => 'NT$ ' + Number(n).toLocaleString('en-US');
  const goBtn = h('button', { class: 'btn primary' }, q.amount ? '確定升級（補差額 ' + money(q.amount) + '）' : '確定升級');
  goBtn.addEventListener('click', async () => {
    goBtn.disabled = true; goBtn.textContent = '升級中…';
    if (!(await save())) { goBtn.disabled = false; goBtn.textContent = '確定升級'; toast('目前的內容還沒儲存成功，請稍後再試', 5000); return; }
    const r = await YC.client.functions.invoke('member-site', { body: { action: 'upgrade_layout', site_id: S.site.id, pages } });
    let j = r.data;
    if (r.error) { try { j = await r.error.context.json(); } catch (e) { j = null; } goBtn.disabled = false; goBtn.textContent = '確定升級'; toast((j && j.message) || '升級失敗，請稍後再試', 6000); return; }
    Object.assign(S.site, { layout: 'multi', pages: j.pages, upgraded_at: j.upgraded_at, upgrade_pending: j.upgrade_pending, upgrade_amount: j.amount });
    S.layout = 'multi'; S.pages = L.normalizePages(j.pages); S.page = 'home';
    closeModal(); paintLayout(); paintLinks(); renderPreview(true); refreshTodo();
    toast(j.message, 8000);
  });
  const fee = q.amount
    ? h('p', {}, h('strong', { text: '升級差額：' + money(q.amount) }), '（這一期還剩 ' + q.days + ' 天，' + (q.yearly ? '年繳' : '月繳') + '，依兩種方案的價差按天數計算）。升級後你可以先編輯、預覽多頁版；我們確認收到差額後，會自動發佈多頁版，在那之前正式網站維持一頁版。')
    : h('p', { class: 'msg mute', text: '你的網站目前沒有剩餘的已付天數，升級不用補差額，' + (live ? '升級後按「發佈」正式網站就會變成多頁。' : '開通時依多頁版收費。') });
  modal('升級成多頁版？', [
    h('p', { text: '升級後，網站會分成首頁和幾個獨立頁面，預設開啟：' + names + '。之後可以自己勾選要哪些頁面。' }),
    h('p', {}, h('strong', { text: '升級後不能改回一頁版。' }), '你填的內容都會保留，不必重填。'),
    fee,
    h('p', { class: 'msg mute', text: priceText('multi') ? '下一期起依多頁版計費：' + priceText('multi') + '。' : '' })],
  [h('button', { class: 'btn', onclick: closeModal }, '先不要'), goBtn]);
}

function paintSlug() {
  const m = $('#slugMsg'); if (!m) return;
  const locked = S.site.status !== 'draft' || !S.isOwner;
  const inp = $('#f-slug'); inp.disabled = locked;
  $('#slugLock').textContent = locked ? (S.isOwner ? '已鎖定（第一次發佈後不能修改）' : '只有網站擁有者能修改') : '';
  if (locked) { m.textContent = ''; }
  else { m.className = 'msg ' + (S.slugState.pending ? 'mute' : (S.slugState.msg ? (S.slugState.ok ? 'ok' : 'bad') : 'mute')); m.textContent = S.slugState.msg || ''; }
  inp.classList.toggle('bad', !locked && !S.slugState.ok && !S.slugState.pending);
  $('#slugUrl').textContent = (S.site.public_url ? '網站網址：' + S.site.public_url.replace(/^https:\/\//, '').replace(/\/$/, '') : '預計網址：' + (S.slug || '…') + '.pages.dev（實際網址以上線後為準）');
}
function paintLinks() {
  const b = $('#links'); if (!b) return;
  const live = S.site.public_url && ['live', 'overdue'].includes(S.site.status);
  if (S.site.upgrade_pending) {
    b.hidden = false;
    b.replaceChildren(h('h2', { text: '多頁版等待補差額' }),
      h('p', { class: 'sub', text: '請匯款升級差額 NT$ ' + Number(S.site.upgrade_amount || 0).toLocaleString('en-US') + '（匯款資訊在會員專區），匯款後用 LINE（@788cblaq）告訴我們帳號末五碼。確認收到後會自動發佈多頁版。' }),
      h('p', { class: 'sub', style: 'margin:0', text: '在那之前可以繼續編輯與預覽多頁版，按「發佈」會先存成待上線的版本，正式網站維持一頁版' + (live ? '（' + S.site.public_url + '）' : '') + '。' }));
    return;
  }
  b.hidden = !live;
  if (live) b.replaceChildren(h('h2', { text: '你的網站已上線' }), h('p', { class: 'sub' }, '網址：', h('a', { href: S.site.public_url, target: '_blank', rel: 'noopener', text: S.site.public_url })),
    h('p', { class: 'sub', style: 'margin:0', text: '修改內容後按右上角「發佈」，約 1–2 分鐘更新到正式網站。' }));
}

// ── 拖曳排序：每一列左邊有「⋮⋮」把手，按住拖到想要的位置放開；鍵盤可用上下方向鍵 ──
// 原本的「上移／下移」按鈕保留。arr＝要排序的資料，after＝排完後重畫並儲存。
function dragSort(box, arr, after) {
  if (!box) return;
  box.classList.add('dsort');
  const rows = () => [...box.children].filter((x) => !x.classList.contains('dsort-skip'));
  rows().forEach((row, idx) => {
    if (row.querySelector(':scope > .drag')) return;
    const hd = h('button', { type: 'button', class: 'drag', title: '按住拖曳調整順序', 'aria-label': '調整順序：第 ' + (idx + 1) + ' 項（按上下方向鍵移動）' }, '⋮⋮');
    row.prepend(hd);
    let from = -1, moved = false;
    // 拖曳中列會在 DOM 裡移動（會失去 pointer capture），所以移動與放開改在整個頁面上監聽
    const onMove = (e) => {
      if (from < 0) return;
      const list = rows().filter((x) => x !== row);
      const next = list.find((x) => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      if (next) { if (row.nextElementSibling !== next) { box.insertBefore(row, next); moved = true; } }
      else if (list.length && list[list.length - 1].nextElementSibling !== row) { list[list.length - 1].after(row); moved = true; }
      // 拖到邊緣時自動捲動設定面板
      const P = $('#panel'), pr = P.getBoundingClientRect();
      if (e.clientY < pr.top + 40) P.scrollTop -= 12; else if (e.clientY > pr.bottom - 40) P.scrollTop += 12;
    };
    const end = () => {
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end);
      if (from < 0) return;
      const to = rows().indexOf(row); row.classList.remove('dragging'); box.classList.remove('dsorting');
      const f = from; from = -1;
      if (moved && to !== f && to >= 0) { const [x] = arr.splice(f, 1); arr.splice(to, 0, x); }
      after();
    };
    hd.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      from = rows().indexOf(row); moved = false; row.classList.add('dragging'); box.classList.add('dsorting');
      document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
    });
    hd.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const i = rows().indexOf(row), j = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]]; after();
      const nr = rows()[j]; const nh = nr && nr.querySelector(':scope > .drag'); if (nh) nh.focus();
    });
  });
}
// ── 複製：區塊（照片不複製，避免刪掉一個時另一個也沒了）、價目、常見問題、區塊裡的項目 ──
function dupBlock(i) {
  const L = S.lib, b = S.content.blocks[i];
  if (!b || S.content.blocks.length >= L.LIMITS.blocks) { toast('自訂區塊已達上限（' + L.LIMITS.blocks + ' 個）'); return; }
  const id = 'k' + Math.random().toString(36).slice(2, 9).replace(/[^a-z0-9]/g, 'x');
  const c = JSON.parse(JSON.stringify(b)); c.id = id; c.photo = null; if ('photo2' in c) c.photo2 = null;
  if (c.title) c.title = [...(c.title + '（複本）')].slice(0, L.LIMITS.blockTitle).join('');
  S.content.blocks.splice(i + 1, 0, c);
  const o = S.content.order, at = o.indexOf('b:' + b.id);
  if (at >= 0) o.splice(at + 1, 0, 'b:' + id);
  S.content.order = L.normalizeOrder(o, S.content.blocks);
  paintBlocks(); paintOrder(); touch(); setTimeout(() => scrollPreviewTo('b-' + id), 300);
  toast('已複製區塊（照片沒有複製，可以另外上傳）', 2500);
}
function dupIn(arr, i, max, repaint) {
  if (arr.length >= max) { toast('已達上限（' + max + ' 項）'); return; }
  arr.splice(i + 1, 0, JSON.parse(JSON.stringify(arr[i]))); repaint(); touch();
}
// 常用的小按鈕（複製、刪除、上移、下移）改成圖示，文字放在提示與無障礙標籤；清單欄位不再被擠窄
const ICON_SVG = {
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  del: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>'
};
function iconBtn(text, onclick, cls) {
  const k = /^複製/.test(text) ? 'copy' : /^(刪除|移除)/.test(text) ? 'del' : /^上移/.test(text) ? 'up' : /^下移/.test(text) ? 'down' : null;
  if (!k) return h('button', { type: 'button', class: 'btn small ' + (cls || ''), onclick }, text);
  const b = h('button', { type: 'button', class: 'btn small ibtn ' + (cls || ''), title: text, 'aria-label': text, onclick });
  b.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_SVG[k] + '</svg>';
  return b;
}
function paintMenu() {
  const L = S.lib, box = $('#menuBox'); box.replaceChildren();
  S.content.menu.forEach((m, i) => {
    const n = h('input', { type: 'text', maxlength: '40', placeholder: IND().offer.item + '名稱', 'aria-label': IND().offer.item + '名稱 ' + (i + 1) }), p = h('input', { type: 'number', min: '0', max: '99999', step: '1', inputmode: 'numeric', placeholder: '價格', 'aria-label': '價格 ' + (i + 1) });
    // 一句說明（選填），例如份量、口味、限量；顯示在品名下方
    const ds = h('input', { type: 'text', class: 'm-desc-in', maxlength: String(L.LIMITS.menuDesc || 80), placeholder: '一句說明（選填），例如：每日限量 20 杯、可做冰的', 'aria-label': IND().offer.item + '說明 ' + (i + 1) });
    tx(n, m, 'name'); tx(ds, m, 'desc'); p.value = m.price == null ? '' : m.price;
    p.addEventListener('input', () => { m.price = p.value === '' ? null : Number(p.value); touch(); });
    box.append(h('div', { class: 'row2 row2-dup' }, n, p, ds, h('span', { class: 'ord-btns' }, soldBtn(m, paintMenu, 'menu'), iconBtn('複製', () => dupIn(S.content.menu, i, L.LIMITS.menu, paintMenu)), iconBtn('刪除', () => { S.content.menu.splice(i, 1); paintMenu(); touch(); }, 'danger'))));
  });
  $('#menuAdd').disabled = S.content.menu.length >= L.LIMITS.menu; $('#menuCnt').textContent = S.content.menu.length + '/' + L.LIMITS.menu;
  dragSort(box, S.content.menu, () => { paintMenu(); touch(); scrollPreviewTo('menu'); });
}
// 今日售完：只對今天有效，隔天網站自動恢復
const twToday = () => new Date(Date.now() + 288e5).toISOString().slice(0, 10);
function soldBtn(item, repaint, anchor) {
  const on = item.soldOut === twToday();
  return h('button', { type: 'button', class: 'btn small so-btn', 'aria-pressed': String(on), title: '今天賣完了就按一下，網站顯示「今日售完」，明天自動恢復',
    onclick: () => { if (on) delete item.soldOut; else item.soldOut = twToday(); touch(); repaint(); scrollPreviewTo(anchor); } }, on ? '今日售完 ✓' : '售完');
}
function paintNews() {
  const L = S.lib, box = $('#newsBox'); box.replaceChildren();
  S.content.news.forEach((m, i) => {
    const d = h('input', { type: 'date', 'aria-label': '日期 ' + (i + 1) }), t = h('input', { type: 'text', maxlength: '60', placeholder: '消息標題', 'aria-label': '標題 ' + (i + 1) });
    d.value = m.date; tx(t, m, 'title');
    d.addEventListener('input', () => { m.date = d.value; touch(); });
    // 消息照片（選填）
    const sl = { key: 'news', label: '消息照片', get: () => m.photo || null, set: (v) => { if (v) m.photo = v; else delete m.photo; } };
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif', hidden: true });
    const nm = h('div', { class: 'nm' });
    const up = h('button', { type: 'button', class: 'btn small' }, m.photo ? '換照片' : '加照片');
    up.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => { const f = file.files[0]; file.value = ''; if (f) { await uploadPhoto(sl, f, nm, up); paintNews(); scrollPreviewTo('news'); } });
    const rm = m.photo ? iconBtn('移除照片', async () => { const old = m.photo.path; delete m.photo; touch(); await trashPhoto(old); paintNews(); }, 'danger') : null;
    box.append(h('div', { class: 'news-item' }, h('div', { class: 'rowN' }, d, t, iconBtn('刪除', () => { S.content.news.splice(i, 1); paintNews(); touch(); }, 'danger')),
      h('div', { class: 'news-ph' }, m.photo ? h('img', { src: photoUrl(m.photo.path), alt: m.title || '消息照片' }) : null, up, rm, nm, file)));
  });
  $('#newsAdd').disabled = S.content.news.length >= L.LIMITS.news; $('#newsCnt').textContent = S.content.news.length + '/' + L.LIMITS.news;
  dragSort(box, S.content.news, () => { paintNews(); touch(); });
}
function paintPosts() {
  const L = S.lib, box = $('#postBox'); if (!box) return; box.replaceChildren();
  S.content.posts.forEach((p, i) => {
    const t = h('input', { type: 'text', maxlength: String(L.LIMITS.postTitle), placeholder: '文章標題', 'aria-label': '文章標題 ' + (i + 1) });
    const d = h('input', { type: 'date', 'aria-label': '文章日期 ' + (i + 1) });
    const b = h('textarea', { maxlength: String(L.LIMITS.postBody), rows: '6', placeholder: '文章內容（空一行就是新段落）', 'aria-label': '文章內容 ' + (i + 1) });
    const cnt = h('div', { class: 'msg mute', style: 'text-align:right' });
    d.value = p.date;
    const upd = () => { cnt.textContent = [...b.value].length + '/' + b.maxLength; };
    tx(t, p, 'title'); d.addEventListener('input', () => { p.date = d.value; touch(); });
    tx(b, p, 'body', upd); upd();
    box.append(h('div', { class: 'faq-item' }, h('div', { class: 'rowN' }, d, t), b, cnt,
      h('div', { class: 'msg mute', text: '網址：/posts/' + p.id + '/' }),
      h('div', { style: 'text-align:right' }, iconBtn('刪除這篇', () => { if (confirm('確定刪除這篇文章？')) { S.content.posts.splice(i, 1); paintPosts(); touch(); } }, 'danger'))));
  });
  $('#postAdd').disabled = S.content.posts.length >= L.LIMITS.posts; $('#postCnt').textContent = S.content.posts.length + '/' + L.LIMITS.posts;
}
function orderLabel(k) {
  const I = IND();
  if (k.startsWith('b:')) { const b = S.content.blocks.find((x) => x.id === k.slice(2)); return ((b && b.kind && b.kind !== 'text' && (S.lib.BLOCK_KIND_LABELS || {})[b.kind]) || '自訂') + '：' + ((b && b.title) || '（未命名區塊）') + (b && b.hidden ? '（隱藏中）' : ''); }
  return ({ menu: I.offer.label, interior: I.space.label, visit: I.visit.label })[k] || S.lib.ORDER_LABELS[k] || k;
}
function paintOrder() {
  const box = $('#orderBox'); if (!box) return;
  const o = S.content.order;
  $('#orderNote').textContent = S.content.homeStyle === 'magazine' ? '目前首頁排版是「雜誌風」，版面固定，這裡的順序要改回「標準」排版才會套用。' : '';
  const subIn = (k) => {
    if (!S.lib.SUB_KEYS.includes(k)) return null;
    const el = h('input', { type: 'text', class: 'ord-sub', maxlength: String(S.lib.LIMITS.sub), placeholder: '副標題（選填）', 'aria-label': orderLabel(k) + ' 副標題' });
    tx(el, S.content.subs, k);
    el.addEventListener('focus', () => scrollPreviewTo(k));
    return el;
  };
  box.replaceChildren(...o.map((k, i) => h('li', {}, h('div', { class: 'ord-main' }, h('span', { text: (i + 1) + '. ' + orderLabel(k) }), subIn(k)),
    h('span', { class: 'ord-btns' },
      iconBtn('上移', () => { [o[i - 1], o[i]] = [o[i], o[i - 1]]; paintOrder(); touch(); scrollPreviewTo(k.startsWith('b:') ? 'b-' + k.slice(2) : k); }),
      iconBtn('下移', () => { [o[i + 1], o[i]] = [o[i], o[i + 1]]; paintOrder(); touch(); scrollPreviewTo(k.startsWith('b:') ? 'b-' + k.slice(2) : k); })))));
  box.querySelectorAll('li').forEach((li, i) => { const [u, d] = li.querySelectorAll('button'); u.disabled = i === 0; d.disabled = i === o.length - 1; });
  dragSort(box, o, () => { paintOrder(); touch(); });
}
function paintBlocks() {
  const L = S.lib, box = $('#blockBox'); if (!box) return; box.replaceChildren();
  S.content.blocks.forEach((b, i) => {
    const delBlock = () => iconBtn('刪除這個區塊', () => { if (!confirm('確定刪除這個區塊？')) return; S.content.blocks.splice(i, 1); S.content.order = L.normalizeOrder(S.content.order, S.content.blocks); paintBlocks(); paintOrder(); touch(); }, 'danger');
    if (b.items || b.kind === 'compare') { box.append(richBlockEditor(b, i)); return; }
    if (b.kind === 'html') {
      const t2 = h('input', { type: 'text', maxlength: String(L.LIMITS.blockTitle), placeholder: '區塊標題（選填），例如：追蹤我們的 Instagram', 'aria-label': '嵌入區塊標題 ' + (i + 1) });
      const code = h('textarea', { class: 'code', maxlength: String(L.LIMITS.html || 20000), rows: '6', spellcheck: 'false', placeholder: '貼上嵌入碼，例如 <iframe src="https://…"></iframe>', 'aria-label': '嵌入程式碼 ' + (i + 1) });
      const hid2 = h('input', { type: 'checkbox' });
      tx(t2, b, 'title', () => paintOrder()); code.value = b.html || ''; hid2.checked = b.hidden;
      code.addEventListener('input', () => { b.html = code.value; touch(); clearTimeout(S.timers.code); S.timers.code = setTimeout(paintCodeStatus, 800); });
      hid2.addEventListener('change', () => { b.hidden = hid2.checked; paintOrder(); touch(); });
      [t2, code].forEach((el) => el.addEventListener('focus', () => scrollPreviewTo('b-' + b.id)));
      box.append(h('div', { class: 'faq-item' }, h('div', { class: 'blk-kind' }, '嵌入程式碼', h('span', { class: 'pro-badge', text: '進階' })), t2, h('div', { style: 'height:8px' }), code,
        h('div', { class: 'msg mute', text: '預覽只顯示一個框，不會執行程式碼。發佈後由我們審核，核准才會出現在正式網站。' }),
        h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:8px' }, h('label', { class: 'check' }, hid2, '暫時隱藏'), delBlock())));
      return;
    }
    const t = h('input', { type: 'text', maxlength: String(L.LIMITS.blockTitle), placeholder: '區塊標題，例如：包場服務', 'aria-label': '區塊標題 ' + (i + 1) });
    const body = h('textarea', { maxlength: String(L.LIMITS.blockBody), rows: '5', placeholder: '內容（空一行就是新段落）', 'aria-label': '區塊內容 ' + (i + 1) });
    const bl = h('input', { type: 'text', maxlength: String(L.LIMITS.btnLabel), placeholder: '按鈕文字（選填）', 'aria-label': '按鈕文字 ' + (i + 1) });
    const bu = h('input', { type: 'url', maxlength: '500', placeholder: '按鈕連結 https://（選填）', 'aria-label': '按鈕連結 ' + (i + 1) });
    const side = h('select', { class: 'sel', 'aria-label': '照片位置 ' + (i + 1) }, h('option', { value: 'right', text: '照片在右' }), h('option', { value: 'left', text: '照片在左' }));
    const hid = h('input', { type: 'checkbox' });
    tx(t, b, 'title', () => paintOrder()); tx(body, b, 'body'); tx(bl, b, 'btnLabel'); bu.value = b.btnUrl; side.value = b.side; hid.checked = b.hidden;
    const go = () => scrollPreviewTo('b-' + b.id);
    bu.addEventListener('input', () => { b.btnUrl = bu.value; touch(); });
    side.addEventListener('change', () => { b.side = side.value; touch(); go(); });
    hid.addEventListener('change', () => { b.hidden = hid.checked; paintOrder(); touch(); });
    [t, body].forEach((el) => el.addEventListener('focus', go));
    const sl = { key: 'block', label: '區塊照片', get: () => b.photo, set: (v) => { b.photo = v; } };
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif', hidden: true });
    const nm = h('div', { class: 'nm' });
    const up = h('button', { type: 'button', class: 'btn small' }, b.photo ? '更換照片' : '上傳照片（選填）');
    up.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => { const f = file.files[0]; file.value = ''; if (f) { await uploadPhoto(sl, f, nm, up); paintBlocks(); go(); } });
    const del = b.photo ? iconBtn('移除照片', async () => { const old = b.photo.path; b.photo = null; touch(); await trashPhoto(old); paintBlocks(); }, 'danger') : null;
    box.append(h('div', { class: 'faq-item' }, t, h('div', { style: 'height:8px' }), body,
      h('div', { class: 'photo', style: 'margin-top:8px' }, h('div', { class: 'th' }, b.photo ? h('img', { src: photoUrl(b.photo.path), alt: b.title || '區塊照片' }) : '無照片'),
        h('div', { class: 'ctl' }, nm, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, up, del, focalBtn(() => b.photo, (v) => { b.photo = v; }, b.title || '區塊照片')), file, side)),
      h('div', { class: 'row2', style: 'margin-top:8px' }, bl, bu),
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;flex-wrap:wrap' },
        h('label', { class: 'check' }, hid, '暫時隱藏'),
        h('span', { class: 'ord-btns' }, iconBtn('複製這個區塊', () => dupBlock(i)),
        iconBtn('刪除這個區塊', () => { if (!confirm('確定刪除這個區塊？')) return; S.content.blocks.splice(i, 1); S.content.order = L.normalizeOrder(S.content.order, S.content.blocks); paintBlocks(); paintOrder(); touch(); }, 'danger')))));
  });
  $('#blockAddHtml').disabled = S.content.blocks.length >= L.LIMITS.blocks;
  $('#blockAdd').disabled = S.content.blocks.length >= L.LIMITS.blocks; if ($('#blockTpl')) $('#blockTpl').disabled = S.content.blocks.length >= L.LIMITS.blocks; if ($('#blockKind')) $('#blockKind').disabled = S.content.blocks.length >= L.LIMITS.blocks; $('#blockCnt').textContent = S.content.blocks.length + '/' + L.LIMITS.blocks;
}
// 結構化區塊的編輯介面：服務流程、數字亮點、合作客戶與認證、服務地區、設備與規格、前後對比
const ITEM_FIELDS = {
  steps: [['t', '步驟名稱，例如：免費到府估價', 40], ['d', '說明（選填）', 200, true]],
  stats: [['v', '數字，例如：28 年、1,200 家', 20], ['t', '說明，例如：在地經驗', 40]],
  logos: [['t', '客戶或認證名稱，例如：ISO 9001', 40], ['d', '補充（選填），例如：品質管理認證', 200]],
  areas: [['t', '地區，例如：台中市西屯區', 40], ['d', '備註（選填），例如：免車馬費', 200]],
  gear: [['t', '設備名稱，例如：CNC 五軸加工機', 40], ['v', '規格或產地（選填）', 20], ['d', '說明（選填）', 200, true]]
};
function richBlockEditor(b, i) {
  const L = S.lib, go = () => scrollPreviewTo('b-' + b.id);
  const label = (L.BLOCK_KIND_LABELS || {})[b.kind] || '區塊';
  const t = h('input', { type: 'text', maxlength: String(L.LIMITS.blockTitle), placeholder: '區塊標題，例如：' + label, 'aria-label': label + '標題 ' + (i + 1) });
  const body = h('textarea', { maxlength: String(L.LIMITS.blockBody), rows: '2', placeholder: '一句簡短說明（選填）', 'aria-label': label + '說明 ' + (i + 1) });
  tx(t, b, 'title', () => paintOrder()); tx(body, b, 'body');
  [t, body].forEach((el) => el.addEventListener('focus', go));
  const parts = [h('div', { class: 'blk-kind' }, label), t, h('div', { style: 'height:8px' }), body];
  if (b.items) {
    const max = b.kind === 'areas' ? L.LIMITS.areaItems : L.LIMITS.blockItems;
    const list = h('div', { class: 'rb-items' });
    const paint = () => {
      list.replaceChildren(...b.items.map((it, j) => {
        const row = h('div', { class: 'rb-item' });
        (ITEM_FIELDS[b.kind] || []).forEach(([k, ph, n, long]) => {
          const el = long ? h('textarea', { rows: '2', maxlength: String(n), placeholder: ph, 'aria-label': label + ' 第 ' + (j + 1) + ' 項：' + ph }) : h('input', { type: 'text', maxlength: String(n), placeholder: ph, 'aria-label': label + ' 第 ' + (j + 1) + ' 項：' + ph });
          tx(el, it, k);
          el.addEventListener('focus', go);
          row.append(el);
        });
        row.append(h('span', { class: 'ord-btns' },
          iconBtn('上移', () => { if (j > 0) { [b.items[j - 1], b.items[j]] = [b.items[j], b.items[j - 1]]; paint(); touch(); } }),
          iconBtn('下移', () => { if (j < b.items.length - 1) { [b.items[j + 1], b.items[j]] = [b.items[j], b.items[j + 1]]; paint(); touch(); } }),
          iconBtn('複製', () => dupIn(b.items, j, max, paint)),
          iconBtn('刪除這一項', () => { b.items.splice(j, 1); paint(); touch(); }, 'danger')));
        return row;
      }));
      add.disabled = b.items.length >= max; cnt.textContent = b.items.length + '/' + max;
      dragSort(list, b.items, () => { paint(); touch(); go(); });
    };
    const add = h('button', { type: 'button', class: 'btn small' }, '＋ 新增一項');
    const cnt = h('span', { class: 'msg mute', style: 'margin-left:8px' });
    add.addEventListener('click', () => { if (b.items.length < max) { b.items.push({ t: '', v: '', d: '' }); paint(); touch(); const last = list.lastElementChild; if (last) last.querySelector('input,textarea').focus(); } });
    paint();
    parts.push(h('div', { style: 'height:8px' }), list, h('div', { style: 'margin-top:6px' }, add, cnt));
  }
  if (b.kind === 'compare') {
    const ph = (key, cap, def) => {
      const sl = { key: 'block', label: def + '照片', get: () => b[key], set: (v) => { b[key] = v; } };
      const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif', hidden: true });
      const nm = h('div', { class: 'nm' });
      const up = h('button', { type: 'button', class: 'btn small' }, b[key] ? '更換' + def + '照片' : '上傳' + def + '照片');
      up.addEventListener('click', () => file.click());
      file.addEventListener('change', async () => { const f = file.files[0]; file.value = ''; if (f) { await uploadPhoto(sl, f, nm, up); paintBlocks(); go(); } });
      const del = b[key] ? iconBtn('移除照片', async () => { const old = b[key].path; b[key] = null; touch(); await trashPhoto(old); paintBlocks(); }, 'danger') : null;
      const capIn = h('input', { type: 'text', maxlength: '20', placeholder: '照片標籤，例如：' + def, 'aria-label': def + '照片標籤' });
      tx(capIn, b, cap);
      return h('div', { class: 'photo', style: 'margin-top:8px' }, h('div', { class: 'th' }, b[key] ? h('img', { src: photoUrl(b[key].path), alt: def }) : def),
        h('div', { class: 'ctl' }, nm, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, up, del, focalBtn(() => b[key], (v) => { b[key] = v; }, def + '照片')), file, capIn));
    };
    parts.push(ph('photo', 'cap1', '施工前'), ph('photo2', 'cap2', '施工後'));
  }
  const bl = h('input', { type: 'text', maxlength: String(L.LIMITS.btnLabel), placeholder: '按鈕文字（選填），例如：免費估價', 'aria-label': '按鈕文字 ' + (i + 1) });
  const bu = h('input', { type: 'url', maxlength: '500', placeholder: '按鈕連結 https://（選填）', 'aria-label': '按鈕連結 ' + (i + 1) });
  const hid = h('input', { type: 'checkbox' });
  tx(bl, b, 'btnLabel'); bu.value = b.btnUrl; hid.checked = b.hidden;
  bu.addEventListener('input', () => { b.btnUrl = bu.value; touch(); });
  hid.addEventListener('change', () => { b.hidden = hid.checked; paintOrder(); touch(); });
  parts.push(h('div', { class: 'row2', style: 'margin-top:8px' }, bl, bu),
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;flex-wrap:wrap' }, h('label', { class: 'check' }, hid, '暫時隱藏'),
      h('span', { class: 'ord-btns' }, iconBtn('複製這個區塊', () => dupBlock(i)), iconBtn('刪除這個區塊', () => { if (!confirm('確定刪除這個區塊？')) return; S.content.blocks.splice(i, 1); S.content.order = L.normalizeOrder(S.content.order, S.content.blocks); paintBlocks(); paintOrder(); touch(); }, 'danger'))));
  return h('div', { class: 'faq-item' }, ...parts);
}
function paintShare() {
  const box = $('#shareBox'), sl = S.shareSlot; if (!box) return;
  const cur = sl.get();
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif', hidden: true });
  const nm = h('div', { class: 'nm' });
  const up = h('button', { type: 'button', class: 'btn small' }, cur ? '更換圖片' : '上傳圖片');
  up.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => { const f = file.files[0]; file.value = ''; if (f) { await uploadPhoto(sl, f, nm, up); paintShare(); } });
  const del = cur ? iconBtn('移除', async () => { const old = cur.path; sl.set(null); touch(); await trashPhoto(old); paintShare(); }, 'danger') : null;
  box.replaceChildren(h('div', { class: 'photo' }, h('div', { class: 'th' }, cur ? h('img', { src: photoUrl(cur.path), alt: '分享圖片' }) : '未上傳'),
    h('div', { class: 'ctl' }, nm, h('div', { style: 'display:flex;gap:8px' }, up, del), file)));
}
// ── 預約行事曆的設定：每段長度、名額、提前時間、可預約天數、每週時段、不開放的日期 ──
function paintCal() {
  const L = S.lib, box = $('#calBox'); if (!box) return;
  const cal = S.content.bookingCal;
  const num = (key, label, opts) => {
    const el = h('select', { class: 'sel', id: 'f-cal-' + key }, opts.map(([v, t]) => h('option', { value: String(v), text: t })));
    el.value = String(cal[key]);
    el.addEventListener('change', () => { cal[key] = Number(el.value); touch(); scrollPreviewTo('booking'); });
    return h('label', { class: 'field', for: el.id }, h('span', { text: label }), el);
  };
  const cap = h('input', { type: 'number', id: 'f-cal-capacity', min: '1', max: '50', step: '1', inputmode: 'numeric' }); cap.value = cal.capacity;
  cap.addEventListener('input', () => { const n = Math.round(Number(cap.value)); if (n >= 1 && n <= 50) { cal.capacity = n; touch(); } });
  const days = DAYS.map((d) => {
    const ranges = cal.weekly[d];
    const rows = ranges.map((r, j) => {
      const a = h('input', { type: 'time', step: '900', 'aria-label': DAYL[d] + ' 時段 ' + (j + 1) + ' 開始' }), b = h('input', { type: 'time', step: '900', 'aria-label': DAYL[d] + ' 時段 ' + (j + 1) + ' 結束' });
      a.value = r.start; b.value = r.end;
      a.addEventListener('change', () => { r.start = a.value; touch(); }); b.addEventListener('change', () => { r.end = b.value; touch(); });
      return h('span', { class: 'cal-range' }, a, '–', b, iconBtn('移除', () => { ranges.splice(j, 1); paintCal(); touch(); }, 'danger'));
    });
    const add = ranges.length < (L.LIMITS.calRanges || 4) ? h('button', { type: 'button', class: 'btn small' }, '＋ 時段') : null;
    if (add) add.addEventListener('click', () => {
      const h0 = S.content.hours[d], last = ranges[ranges.length - 1];
      ranges.push(last ? { start: last.end, end: last.end < '20:00' ? String(Number(last.end.slice(0, 2)) + 2).padStart(2, '0') + last.end.slice(2) : '22:00' } : { start: h0.open || '10:00', end: h0.close || '18:00' });
      paintCal(); touch();
    });
    return h('div', { class: 'cal-row' }, h('strong', { text: DAYL[d] }), h('div', { class: 'cal-ranges' }, rows.length ? rows : h('span', { class: 'mute', text: '不開放' }), add));
  });
  const copy = h('button', { type: 'button', class: 'btn small' }, '把週一的時段套用到全部');
  copy.addEventListener('click', () => { DAYS.forEach((d) => { if (d !== 'mon') cal.weekly[d] = cal.weekly.mon.map((r) => ({ ...r })); }); paintCal(); touch(); });
  const fromHours = h('button', { type: 'button', class: 'btn small' }, '依營業時間自動填');
  fromHours.addEventListener('click', () => { DAYS.forEach((d) => { const x = S.content.hours[d]; cal.weekly[d] = !x.closed && x.open && x.close && x.open < x.close ? [{ start: x.open, end: x.close }] : []; }); paintCal(); touch(); });
  const dIn = h('input', { type: 'date', 'aria-label': '不開放預約的日期' });
  const dAdd = h('button', { type: 'button', class: 'btn small' }, '加入');
  dAdd.addEventListener('click', () => { const v = dIn.value; if (!v || cal.closed.includes(v) || cal.closed.length >= (L.LIMITS.calClosed || 60)) return; cal.closed.push(v); cal.closed.sort(); paintCal(); touch(); });
  const chips = cal.closed.map((d, j) => h('span', { class: 'chip' }, d.replace(/-/g, '/'), h('button', { type: 'button', 'aria-label': '移除 ' + d, onclick: () => { cal.closed.splice(j, 1); paintCal(); touch(); } }, '×')));
  box.replaceChildren(
    h('div', { class: 'style-row' },
      num('slotMinutes', '每個時段多長', (L.SLOT_MINUTES || [30, 60]).map((m) => [m, m < 60 ? m + ' 分鐘' : (m / 60) + ' 小時'])),
      h('label', { class: 'field', for: 'f-cal-capacity' }, h('span', { text: '每個時段可接幾組' }), cap),
      num('leadHours', '最晚提前多久', [[0, '不限制'], [1, '1 小時前'], [2, '2 小時前'], [3, '3 小時前'], [6, '6 小時前'], [12, '12 小時前'], [24, '前一天'], [48, '兩天前']]),
      num('maxDays', '開放幾天內的預約', [[7, '7 天'], [14, '14 天'], [30, '30 天'], [60, '60 天'], [90, '90 天']])),
    h('div', { class: 'field' }, h('span', { text: '每週可預約的時段' }), ...days, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px' }, fromHours, copy)),
    h('div', { class: 'field' }, h('span', { text: '不開放預約的日期（店休、包場等）' }), h('div', { class: 'cal-closed' }, dIn, dAdd), h('div', { class: 'chips' }, chips)));
}
// 自訂程式碼的審核狀態：用和發佈時相同的雜湊比對
async function paintCodeStatus() {
  const el = $('#codeStatus'); if (!el) return;
  const L = S.lib;
  if (!L.codeHash || !L.hasCustomCode) { el.textContent = ''; return; }
  const c = L.normalizeContent(S.content);
  if (!L.hasCustomCode(c)) { el.className = 'msg mute'; el.textContent = '目前沒有自訂程式碼。'; return; }
  if (S.trial) { el.className = 'msg mute'; el.textContent = '登入並發佈後，自訂程式碼會送給我們審核。'; return; }
  const hash = await L.codeHash(c);
  const r = await YC.client.from('site_code_reviews').select('status,note').eq('site_id', S.site.id).eq('hash', hash).maybeSingle();
  const rv = r.data;
  const t = !rv ? ['mute', '這段程式碼還沒送審：按「發佈」後會送給我們審核。'] : rv.status === 'approved' ? ['ok', '這段程式碼已核准，會放進正式網站。'] : rv.status === 'pending' ? ['mute', '審核中：核准後網站會自動更新。'] : ['bad', '這段程式碼沒有通過審核' + (rv.note ? '：' + rv.note : '') + '。修改後重新發佈會再審一次。'];
  el.className = 'msg ' + t[0]; el.textContent = (S.isPro ? '' : '（升級進階方案後才會放進網站）') + t[1];
}
// 自訂標題／描述空白時，提示自動產生的內容
function paintSeoHints(r) {
  const t = $('#f-seo-title'), d = $('#f-seo-description');
  if (t && !S.content.seo.title) t.placeholder = '留空＝自動：' + r.title;
  if (d && !S.content.seo.description) d.placeholder = '留空＝自動：' + r.description;
}
// 版本紀錄：列出最近發佈的版本，可以還原成草稿
async function openHistory() {
  if (S.trial) return askLoginToKeep('查看版本紀錄');
  const r = await YC.client.from('site_versions').select('id,created_at,content,palette,sections,pages').eq('site_id', S.site.id).order('created_at', { ascending: false }).limit(20);
  if (r.error) { toast('讀取版本失敗，請稍後再試'); return; }
  const live = S.site.live_version_id;
  const fmt = (t) => { const x = new Date(t); return x.getFullYear() + '/' + (x.getMonth() + 1) + '/' + x.getDate() + ' ' + pad(x.getHours()) + ':' + pad(x.getMinutes()); };
  const rows = (r.data || []).map((v) => h('li', { style: 'display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)' },
    h('span', {}, fmt(v.created_at), v.id === live ? h('b', { style: 'margin-left:8px;color:var(--ok,#6cc08b)', text: '目前網站上的版本' }) : null,
      h('span', { class: 'msg mute', style: 'display:block', text: ((v.content && v.content.name) || '') + (v.content && v.content.tagline ? '・' + v.content.tagline : '') })),
    iconBtn('還原', () => {
      if (!confirm('把編輯中的內容換成 ' + fmt(v.created_at) + ' 的版本？（之後還可以按「復原」回來）')) return;
      recordHist();
      S.content = S.lib.normalizeContent(v.content); S.palette = v.palette || S.palette; S.sections = v.sections || S.sections;
      if (isMulti() && v.pages) S.pages = S.lib.normalizePages(v.pages);
      closeModal(); buildPanel(); touch(); recordHist(); toast('已還原，確認沒問題後按「發佈」更新網站');
    })));
  modal('版本紀錄', [rows.length ? h('ul', { style: 'list-style:none;margin:0;padding:0;max-height:60vh;overflow:auto' }, rows) : h('p', { text: '還沒有發佈過的版本。' })],
    [h('button', { type: 'button', class: 'btn', onclick: closeModal }, '關閉')]);
}
function paintItems() {
  const L = S.lib, box = $('#itemBox'); if (!box) return; box.replaceChildren();
  S.content.shop.items.forEach((it, i) => {
    const n = h('input', { type: 'text', maxlength: String(L.LIMITS.shopName), placeholder: '商品名稱', 'aria-label': '商品名稱 ' + (i + 1) });
    const p = h('input', { type: 'number', min: '1', max: String(L.LIMITS.shopPrice), step: '1', inputmode: 'numeric', placeholder: '價格', 'aria-label': '商品價格 ' + (i + 1) });
    const d = h('textarea', { maxlength: String(L.LIMITS.shopDesc), rows: '2', placeholder: '簡短說明（選填），例如：六入禮盒、常溫可放 7 天', 'aria-label': '商品說明 ' + (i + 1) });
    tx(n, it, 'name'); p.value = it.price == null ? '' : it.price; tx(d, it, 'desc');
    p.addEventListener('input', () => { it.price = p.value === '' ? null : Number(p.value); touch(); });
    const sl = { key: 'item', label: '商品照片', get: () => it.photo, set: (v) => { it.photo = v; } };
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif', hidden: true });
    const nm = h('div', { class: 'nm' });
    const up = h('button', { type: 'button', class: 'btn small' }, it.photo ? '更換照片' : '上傳照片');
    up.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => { const f = file.files[0]; file.value = ''; if (f) { await uploadPhoto(sl, f, nm, up); paintItems(); } });
    const del = it.photo ? iconBtn('移除照片', async () => { const old = it.photo.path; it.photo = null; touch(); await trashPhoto(old); paintItems(); }, 'danger') : null;
    box.append(h('div', { class: 'faq-item' },
      h('div', { class: 'row2' }, n, p, soldBtn(it, paintItems, 'shop')),
      h('div', { style: 'height:8px' }), d,
      h('div', { class: 'photo', style: 'margin-top:8px' }, h('div', { class: 'th' }, it.photo ? h('img', { src: photoUrl(it.photo.path), alt: it.name || '商品照片' }) : '無照片'),
        h('div', { class: 'ctl' }, nm, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, up, del, focalBtn(() => it.photo, (v) => { it.photo = v; }, it.name || '商品照片')), file)),
      h('div', { style: 'text-align:right' },
        i > 0 ? iconBtn('上移', () => { const a = S.content.shop.items; [a[i - 1], a[i]] = [a[i], a[i - 1]]; paintItems(); touch(); }) : null, ' ',
        iconBtn('刪除這項', () => { if (confirm('確定刪除這個商品？')) { S.content.shop.items.splice(i, 1); paintItems(); touch(); } }, 'danger'))));
  });
  $('#itemAdd').disabled = S.content.shop.items.length >= L.LIMITS.shopItems; $('#itemCnt').textContent = S.content.shop.items.length + '/' + L.LIMITS.shopItems;
  dragSort(box, S.content.shop.items, () => { paintItems(); touch(); });
}
function paintReviews() {
  const L = S.lib, box = $('#reviewBox'); if (!box) return; box.replaceChildren();
  S.content.reviews.forEach((r, i) => {
    const n = h('input', { type: 'text', maxlength: String(L.LIMITS.reviewName), placeholder: '稱呼，例如：林小姐', 'aria-label': '評價者 ' + (i + 1) });
    const t = h('textarea', { maxlength: String(L.LIMITS.reviewText), rows: '3', placeholder: '評價內容', 'aria-label': '評價內容 ' + (i + 1) });
    tx(n, r, 'name'); tx(t, r, 'text');
    box.append(h('div', { class: 'faq-item' }, n, h('div', { style: 'height:8px' }), t, h('div', { style: 'text-align:right' }, iconBtn('刪除這則', () => { S.content.reviews.splice(i, 1); paintReviews(); touch(); }, 'danger'))));
  });
  $('#reviewAdd').disabled = S.content.reviews.length >= L.LIMITS.reviews; $('#reviewCnt').textContent = S.content.reviews.length + '/' + L.LIMITS.reviews;
  dragSort(box, S.content.reviews, () => { paintReviews(); touch(); scrollPreviewTo('reviews'); });
}
function paintFaq() {
  const L = S.lib, box = $('#faqBox'); box.replaceChildren();
  S.content.faq.forEach((f, i) => {
    const q = h('input', { type: 'text', maxlength: '60', placeholder: '問題，例如：需要' + bookWord() + '嗎？', 'aria-label': '問題 ' + (i + 1) }), a = h('textarea', { maxlength: '300', rows: '3', placeholder: '回答（建議 30–300 字）', 'aria-label': '回答 ' + (i + 1) });
    const cnt = h('div', { class: 'msg mute', style: 'text-align:right' });
    const upd = () => { const n = [...a.value].length; cnt.textContent = n + '/' + a.maxLength + (n && n < 30 && !EN_MODE() ? '（建議至少 30 字）' : ''); };
    tx(q, f, 'q'); tx(a, f, 'a', upd); upd();
    box.append(h('div', { class: 'faq-item' }, q, h('div', { style: 'height:8px' }), a, cnt, h('div', { style: 'text-align:right' }, iconBtn('複製這題', () => dupIn(S.content.faq, i, L.LIMITS.faq, paintFaq)), ' ', iconBtn('刪除這題', () => { S.content.faq.splice(i, 1); paintFaq(); touch(); }, 'danger'))));
  });
  $('#faqAdd').disabled = S.content.faq.length >= L.LIMITS.faq; $('#faqCnt').textContent = S.content.faq.length + '/' + L.LIMITS.faq;
  dragSort(box, S.content.faq, () => { paintFaq(); touch(); scrollPreviewTo('faq'); });
}

// ── 區塊範本：從風格範例挑區塊（服務流程、數字亮點、服務地區…），連同範例文字一起加入，再改成自己的 ──
let SC_MOD = null;
async function scModule() { if (!SC_MOD) SC_MOD = import(tplBase() + 'templates/gallery/showcases.mjs').catch(() => { SC_MOD = null; return null; }); return SC_MOD; }
async function openBlockTemplates() {
  const L = S.lib, M = await scModule();
  if (!M) { toast('範本載入失敗，請稍後再試'); return; }
  const mine = S.site.template, myGroup = (L.getIndustry(mine) || {}).group;
  const rank = (x) => (x.k === mine ? 0 : (L.getIndustry(x.k) || {}).group === myGroup ? 1 : 2);
  const seen = new Set(), all = [];
  (M.SHOWCASES || []).slice().sort((a, b) => rank(a) - rank(b)).forEach((sc) => (sc.content.blocks || []).forEach((b) => {
    if (b.kind === 'html' || b.kind === 'compare' || !((b.items && b.items.length) || b.body)) return;
    const key = (b.kind || 'text') + '|' + b.title; if (seen.has(key)) return; seen.add(key);
    all.push({ b, sc, r: rank(sc) });
  }));
  let kind = '', scope = all.some((x) => x.r < 2) ? 'near' : 'all';
  const list = h('div', { class: 'tpl-list' });
  const kindLabel = (k) => (!k || k === 'text' ? '圖文' : L.BLOCK_KIND_LABELS[k]);
  const kinds = [['', '全部'], ...['steps', 'stats', 'areas', 'gear', 'logos', 'text'].map((k) => [k, kindLabel(k)])];
  const kindBtns = kinds.map(([k, t]) => h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(k === kind), onclick: (e) => { kind = k; kindBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === e.currentTarget))); paint(); } }, t));
  const scopeSel = h('select', { class: 'sel', 'aria-label': '範本來源', style: 'width:auto', onchange: (e) => { scope = e.target.value; paint(); } },
    h('option', { value: 'near', text: '同行業與相近行業' }), h('option', { value: 'all', text: '所有行業' }));
  scopeSel.value = scope;
  function paint() {
    const rows = all.filter((x) => (!kind || (x.b.kind || 'text') === kind) && (scope === 'all' || x.r < 2));
    list.replaceChildren(...(rows.length ? rows.map(({ b, sc }) => {
      const prev = b.items ? b.items.slice(0, 4).map((it) => [it.v, it.t].filter(Boolean).join(' ')).join('、') + (b.items.length > 4 ? '…' : '') : (b.body || '').slice(0, 60) + '…';
      return h('button', { type: 'button', class: 'tpl-row', onclick: () => { insertTemplate(b); closeModal(); } },
        h('span', { class: 'tpl-kind', text: kindLabel(b.kind) }),
        h('strong', { text: b.title }), h('small', { text: prev }), h('em', { text: '來自：' + sc.label }));
    }) : [h('p', { class: 'msg mute', text: '這個類型目前沒有範本，可以改看「所有行業」。' })]));
  }
  paint();
  const left = L.LIMITS.blocks - S.content.blocks.length;
  const mb = modal('從範本加入區塊', [h('p', { class: 'msg mute', text: '挑一個接近的區塊，會連同範例文字一起加入，再把文字改成你的。還可以加 ' + left + ' 個區塊。' }),
    h('div', { class: 'seg-btns crop-tools' }, kindBtns, scopeSel), list], [h('button', { type: 'button', class: 'btn', onclick: closeModal }, '取消')]);
  mb.querySelector('.modal').classList.add('modal-wide');
}
function insertTemplate(src) {
  const L = S.lib; if (S.content.blocks.length >= L.LIMITS.blocks) return;
  recordHist();
  const id = 'k' + Math.random().toString(36).slice(2, 9).replace(/[^a-z0-9]/g, 'x');
  const b = JSON.parse(JSON.stringify(src)); b.id = id; b.photo = null; delete b.photo2; b.hidden = false; if (!b.kind) b.kind = 'text';
  ['btnLabel', 'btnUrl'].forEach((k) => { if (b[k] == null) b[k] = ''; }); if (!b.side) b.side = 'right';
  S.content.blocks.push(b);
  S.content.order = L.normalizeOrder(S.content.order, S.content.blocks);
  paintBlocks(); paintOrder(); touch(); setTimeout(() => scrollPreviewTo('b-' + id), 300);
  toast('已加入「' + b.title + '」，記得把範例文字改成你的。', 3500);
}
// ── 範例內容檢查：從風格範例或行業範例開始的網站，提醒還沒換掉的示範地址、電話、評價與文字 ──
let EX_TEXT = null;
async function exampleTexts() {
  if (EX_TEXT) return EX_TEXT;
  const M = await scModule(); const set = new Set();
  const add = (t) => { t = String(t || '').trim(); if (t.length >= 6) set.add(t); };
  if (M) (M.SHOWCASES || []).concat(M.ONE_PAGE || []).forEach((sc) => {
    const c = sc.content; add(c.tagline); add(c.intro);
    (c.reviews || []).forEach((r) => add(r.text)); (c.faq || []).forEach((q) => add(q.a));
    (c.blocks || []).forEach((b) => { add(b.body); (b.items || []).forEach((it) => add(it.d)); });
    (c.posts || []).forEach((p) => add(p.body));
  });
  EX_TEXT = set; return set;
}
async function exampleWarnings() {
  const c = S.content, ex = await exampleTexts(), out = [];
  if (/示範路/.test(c.address || '')) out.push({ field: 'address', msg: '地址還是範例地址，請換成你的地址' });
  if (/(^|\D)0\d{1,2}-0000-\d{4}/.test(c.phone || '')) out.push({ field: 'phone', msg: '電話還是範例號碼，請換成你的電話' });
  const rv = (c.reviews || []).filter((r) => ex.has(String(r.text || '').trim()));
  if (rv.length) out.push({ field: 'reviews', msg: '有 ' + rv.length + ' 則評價是範例內容，請換成客人的真實評價或刪除' });
  if (Object.values(c.subs || {}).some((t) => /示範內容/.test(t || ''))) out.push({ field: 'order', msg: '區塊副標題還寫著「示範內容」，請修改' });
  let n = 0; const chk = (t) => { if (ex.has(String(t || '').trim())) n++; };
  chk(c.tagline); chk(c.intro); (c.faq || []).forEach((q) => chk(q.a)); (c.blocks || []).forEach((b) => { chk(b.body); (b.items || []).forEach((it) => chk(it.d)); }); (c.posts || []).forEach((p) => chk(p.body));
  if (n) out.push({ field: 'intro', msg: '還有 ' + n + ' 段文字和範例一模一樣，建議改成你自己的說法' });
  return out;
}
// ── 一鍵換風格：把風格範例的外觀（配色、字型、按鈕、紋理、標題樣式、動畫、版型）套到目前的網站，內容不變 ──
const LOOK_KEYS = ['font', 'button', 'texture', 'motion', 'head', 'menuStyle', 'gallery', 'reviewStyle'];
async function openLookPicker() {
  let list = [];
  try { const M = await import(tplBase() + 'templates/gallery/showcases.mjs'); list = M.SHOWCASES || []; } catch (e) { toast('風格範例載入失敗，請稍後再試'); return; }
  if (!list.length) return;
  const L = S.lib, mine = S.site.template, myGroup = (L.getIndustry(mine) || {}).group;
  // 同行業、同類別的排前面
  const rank = (x) => (x.k === mine ? 0 : (L.getIndustry(x.k) || {}).group === myGroup ? 1 : 2);
  list = list.slice().sort((a, b) => rank(a) - rank(b));
  const thumb = (id) => new URL('../rental/styles/' + id + '/thumb.webp', location.href).href;
  const cards = list.map((x) => {
    const pal = L.getPalette(x.palette);
    const sw = h('i', { class: 'look-sw' }, [pal.bg, pal.surface, pal.accent, pal.text].map((c) => h('s', { style: 'background:' + c })));
    const img = h('img', { src: thumb(x.id), alt: '', loading: 'lazy', onerror: (e) => { e.target.remove(); } });
    return h('button', { type: 'button', class: 'look-card', onclick: () => { applyLook(x); closeModal(); } },
      h('span', { class: 'look-th' }, img, sw), h('strong', { text: x.styleName }), h('small', { text: x.label }));
  });
  // 依行業分類篩選（範例變多了，預設先看同行業與相近行業）
  const groups = [...new Set(list.map((x) => (L.getIndustry(x.k) || {}).group).filter(Boolean))];
  const grid = h('div', { class: 'look-grid' }, cards);
  const filter = (v) => cards.forEach((c, i) => { const g = (L.getIndustry(list[i].k) || {}).group; c.hidden = v === 'near' ? rank(list[i]) > 1 : v !== 'all' && g !== v; });
  const sel = h('select', { class: 'sel', 'aria-label': '依行業分類篩選', style: 'width:auto', onchange: (e) => filter(e.target.value) },
    h('option', { value: 'all', text: '全部風格（' + list.length + '）' }), h('option', { value: 'near', text: '同行業與相近行業' }), groups.map((g) => h('option', { value: g, text: g })));
  if (list.some((x) => rank(x) <= 1)) { sel.value = 'near'; filter('near'); }
  const mb = modal('一鍵換風格', [h('p', { class: 'msg mute', text: '點一個風格，外觀會馬上換成那個樣子；文字、照片與價目都保留。不喜歡可以按上方「復原」。' }), h('div', { style: 'margin:0 0 10px' }, sel), grid],
    [h('button', { type: 'button', class: 'btn', onclick: closeModal }, '取消')]);
  mb.querySelector('.modal').classList.add('modal-wide');
}
function applyLook(x) {
  recordHist();
  const st = x.content.style || {};
  LOOK_KEYS.forEach((k) => { if (st[k] != null) S.content.style[k] = st[k]; });
  S.content.style.colors = null;
  if (x.content.heroStyle) S.content.heroStyle = x.content.heroStyle;
  if (x.content.homeStyle) S.content.homeStyle = x.content.homeStyle;
  S.palette = x.palette;
  S.replayMotion = true;
  syncPanel(); touch();
  toast('已套用「' + x.styleName + '」的外觀。不喜歡可以按「復原」。', 4000);
}

// ── 照片重點位置：點照片上想保留的地方（臉、商品、招牌），網站裁切成橫幅、方形或直式時都會保留那個點 ──
function focalBtn(get, set, label) {
  const p = get(); if (!p) return null;
  return h('button', { type: 'button', class: 'btn small', title: '選照片的重點，手機版與各種版型裁切時不會切掉', onclick: () => openFocal(get, set, label) }, p.fx != null ? '重點位置 ✓' : '調整重點位置');
}
function openFocal(get, set, label) {
  const p = get(); if (!p) return;
  let fx = p.fx != null ? p.fx : 50, fy = p.fy != null ? p.fy : 50;
  const src = photoUrl(p.path);
  const dot = h('span', { class: 'focal-dot' });
  const big = h('div', { class: 'focal-pick', role: 'slider', tabindex: '0', 'aria-label': '照片重點位置（方向鍵可微調）', 'aria-valuetext': '' }, h('img', { src, alt: label || '照片', draggable: 'false' }), dot);
  const shapes = [['橫幅', '21/9'], ['橫式', '4/3'], ['方形', '1/1'], ['直式', '3/4']].map(([t, r]) => {
    const im = h('img', { src, alt: '', style: 'aspect-ratio:' + r }); return { im, el: h('figure', { class: 'focal-shape' }, im, h('figcaption', { text: t })) };
  });
  const paint = () => {
    dot.style.left = fx + '%'; dot.style.top = fy + '%';
    shapes.forEach((x) => { x.im.style.objectPosition = fx + '% ' + fy + '%'; });
    big.setAttribute('aria-valuetext', '水平 ' + fx + '%，垂直 ' + fy + '%');
  };
  const apply = () => {
    const cur = get(); if (!cur) return;
    const n = { ...cur }; delete n.fx; delete n.fy;
    if (fx !== 50 || fy !== 50) { n.fx = fx; n.fy = fy; }
    set(n); touch();
  };
  const at = (e) => { const img = big.querySelector('img'), r = img.getBoundingClientRect(); fx = Math.round(Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100))); fy = Math.round(Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100))); paint(); apply(); };
  let down = false;
  big.addEventListener('pointerdown', (e) => { down = true; big.setPointerCapture(e.pointerId); at(e); });
  big.addEventListener('pointermove', (e) => { if (down) at(e); });
  big.addEventListener('pointerup', () => { down = false; });
  big.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key]; if (!d) return;
    e.preventDefault(); fx = Math.min(100, Math.max(0, fx + d[0])); fy = Math.min(100, Math.max(0, fy + d[1])); paint(); apply();
  });
  paint();
  const mb = modal('照片重點位置' + (label ? '：' + label : ''), [
    h('p', { class: 'msg mute', text: '點一下（或拖曳）照片上最重要的地方，例如人臉、商品或招牌。網站在電腦、手機與不同版型裁切照片時，都會保留這個點。右邊預覽會跟著變。' }),
    h('div', { class: 'focal-wrap' }, big, h('div', { class: 'focal-shapes' }, shapes.map((x) => x.el)))
  ], [
    h('button', { type: 'button', class: 'btn', onclick: () => { fx = 50; fy = 50; paint(); apply(); } }, '回到置中'),
    h('button', { type: 'button', class: 'btn primary', onclick: () => { closeModal(); repaintPhotoLists(); } }, '完成')
  ]);
  mb.querySelector('.modal').classList.add('modal-wide');
}
function repaintPhotoLists() { paintPhotos(); paintBlocks(); if ($('#itemBox')) paintItems(); }

// ── 照片 ──
function paintPhotos() {
  const box = $('#photoBox'); box.replaceChildren();
  S.slots.forEach((sl, idx) => {
    const cur = sl.get();
    const canAdd = sl.key === 'hero' || idx - 1 <= S.content.photos.room.length;   // 店內照片依序補位
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif', hidden: true });
    const th = h('div', { class: 'th' }, cur ? h('img', { src: photoUrl(cur.path), alt: sl.label, style: cur.fx != null ? 'object-position:' + cur.fx + '% ' + cur.fy + '%' : '' }) : '未上傳');
    const nm = h('div', { class: 'nm', id: 'pm-' + sl.key });
    const up = h('button', { type: 'button', class: 'btn small', disabled: !canAdd }, cur ? '更換照片' : '上傳照片');
    up.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => { const f = file.files[0]; file.value = ''; if (f) await uploadPhoto(sl, f, nm, up); });
    const del = cur ? iconBtn('移除', async () => { const old = cur.path; sl.set(null); touch(); await trashPhoto(old); paintPhotos(); }, 'danger') : null;
    // 店內照片往前移（調整網站上的順序）
    const ri = sl.key === 'hero' ? -1 : idx - 1;
    const mv = cur && ri > 0 ? iconBtn('往前移', () => { const r = S.content.photos.room; [r[ri - 1], r[ri]] = [r[ri], r[ri - 1]]; touch(); paintPhotos(); scrollPreviewTo('interior'); }) : null;
    box.append(h('div', { class: 'photo' }, th, h('div', { class: 'ctl' }, h('strong', { text: sl.label }), nm, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, up, del, mv, focalBtn(() => sl.get(), (v) => sl.set(v), sl.label)), file)));
  });
  // 一次選多張（直接放進空的照片位置，不逐張裁切；之後可以個別「調整重點位置」）；手機另有「拍照」
  const free = S.lib.LIMITS.room - S.content.photos.room.length;
  if (free > 0 && !S.trial) {
    const many = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif', multiple: true, hidden: true });
    const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
    const st = h('div', { class: 'nm' });
    const bm = h('button', { type: 'button', class: 'btn small' }, '一次選多張' + IND().space.label + '照片（還可以放 ' + free + ' 張）');
    const bc = h('button', { type: 'button', class: 'btn small mob-only' }, '拍照');
    bm.addEventListener('click', () => many.click()); bc.addEventListener('click', () => cam.click());
    const run = async (files) => {
      files = [...files].slice(0, free); if (!files.length) return;
      bm.disabled = bc.disabled = true;
      let ok = 0;
      for (let i = 0; i < files.length; i++) {
        st.textContent = '上傳中 ' + (i + 1) + '/' + files.length + '…';
        const at = S.content.photos.room.length; if (at >= S.lib.LIMITS.room) break;
        const sl = { key: 'room', label: IND().space.label + '照片', get: () => S.content.photos.room[at] || null, set: (v) => { if (v) S.content.photos.room[at] = v; } };
        try { await uploadPhotoQuick(sl, files[i]); ok++; } catch (e) { st.textContent = String(e.message || e); }
      }
      paintPhotos(); scrollPreviewTo('interior');
      toast(ok ? '已上傳 ' + ok + ' 張照片' : '沒有上傳成功', 2600);
    };
    many.addEventListener('change', () => { const f = many.files; run(f).finally(() => { many.value = ''; }); });
    cam.addEventListener('change', () => { const f = cam.files; run(f).finally(() => { cam.value = ''; }); });
    box.append(h('div', { class: 'photo-many' }, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, bm, bc), st, many, cam));
  }
}
// 多張上傳：不跳出裁切視窗，整張縮小後上傳
async function uploadPhotoQuick(sl, file) {
  const out = await compress(file, sl.label, true);
  const { blob, ext, w, h: hh } = out;
  const path = S.site.id + '/room-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + '.' + ext;
  const r = await YC.client.storage.from('site-photos').upload(path, blob, { contentType: blob.type, cacheControl: '3600', upsert: false });
  if (r.error) throw new Error('上傳失敗：' + r.error.message);
  S.fresh.add(path); sl.set({ path, w, h: hh }); touch();
}
async function trashPhoto(path) {
  if (!path || !S.fresh.has(path)) return;     // 已發佈過的照片可能還被舊版本使用，不刪
  S.fresh.delete(path);
  YC.client.storage.from('site-photos').remove([path]).catch(() => {});
}
async function loadHeic() {
  if (window.heic2any) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.integrity = 'sha384-OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL'; s.crossOrigin = 'anonymous';
    s.onload = res; s.onerror = () => rej(new Error('HEIC 轉換工具載入失敗，請改用 JPG 或 PNG')); document.head.append(s);
  });
}
async function toBitmap(file) {
  const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { if (!heic) throw new Error('這個檔案無法讀取，請改用 JPG、PNG 或 WebP'); }
  await loadHeic();
  const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return createImageBitmap(Array.isArray(out) ? out[0] : out);
}
// ── 上傳前裁切：選比例、拖曳框選、旋轉；也可以直接用原圖 ──
const CROP_RATIOS = [['原始比例', 0], ['橫式 3:2', 3 / 2], ['寬幅 16:9', 16 / 9], ['方形', 1], ['直式 3:4', 3 / 4]];
function bmpToCanvas(bmp, edge) {
  const k = Math.min(1, edge / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); return cv;
}
function rotateCanvas(cv) {
  const o = document.createElement('canvas'); o.width = cv.height; o.height = cv.width;
  const g = o.getContext('2d'); g.translate(o.width, 0); g.rotate(Math.PI / 2); g.drawImage(cv, 0, 0); return o;
}
function cropDialog(src, label) {
  return new Promise((done) => {
    let cv = src, ratio = 0, box = { x: 0, y: 0, w: 1, h: 1 };
    const view = h('div', { class: 'crop-view' });
    const frame = h('div', { class: 'crop-box', tabindex: '0', role: 'group', 'aria-label': '裁切範圍：拖曳移動，右下角拖曳調整大小，方向鍵可微調' }, h('span', { class: 'crop-grip', 'aria-hidden': 'true' }));
    const size = h('div', { class: 'msg mute crop-size' });
    const fitRatio = () => {
      if (!ratio) { box = { x: 0, y: 0, w: 1, h: 1 }; return; }
      const img = cv.width / cv.height; let w = 1, hh = img / ratio; if (hh > 1) { hh = 1; w = ratio / img; }
      box = { x: (1 - w) / 2, y: (1 - hh) / 2, w, h: hh };
    };
    const paint = () => {
      frame.style.left = box.x * 100 + '%'; frame.style.top = box.y * 100 + '%'; frame.style.width = box.w * 100 + '%'; frame.style.height = box.h * 100 + '%';
      const pw = Math.round(box.w * cv.width), ph = Math.round(box.h * cv.height);
      size.textContent = '裁切後約 ' + pw + ' × ' + ph + ' 像素' + (Math.max(pw, ph) < 900 ? '（偏小，放大後可能不夠清楚）' : '');
    };
    const mount = () => { cv.className = 'crop-img'; view.replaceChildren(cv, frame); paint(); };
    const clamp = () => { box.w = Math.min(1, Math.max(0.08, box.w)); box.h = Math.min(1, Math.max(0.08, box.h)); box.x = Math.min(1 - box.w, Math.max(0, box.x)); box.y = Math.min(1 - box.h, Math.max(0, box.y)); };
    let drag = null;
    frame.addEventListener('pointerdown', (e) => {
      e.preventDefault(); frame.setPointerCapture(e.pointerId);
      const r = view.getBoundingClientRect();
      drag = { mode: e.target.classList.contains('crop-grip') ? 'size' : 'move', sx: e.clientX, sy: e.clientY, b: { ...box }, W: r.width, H: r.height };
    });
    frame.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.sx) / drag.W, dy = (e.clientY - drag.sy) / drag.H, b = drag.b;
      if (drag.mode === 'move') box = { ...b, x: b.x + dx, y: b.y + dy };
      else {
        let w = Math.min(1 - b.x, Math.max(0.08, b.w + dx)), hh = Math.min(1 - b.y, Math.max(0.08, b.h + dy));
        if (ratio) { const img = cv.width / cv.height; hh = w * img / ratio; if (b.y + hh > 1) { hh = 1 - b.y; w = hh * ratio / img; } }
        box = { ...b, w, h: hh };
      }
      clamp(); paint();
    });
    frame.addEventListener('pointerup', () => { drag = null; });
    frame.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[e.key]; if (!d) return;
      e.preventDefault(); box.x += d[0]; box.y += d[1]; clamp(); paint();
    });
    const ratioBtns = CROP_RATIOS.map(([t, r]) => h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(r === ratio), onclick: (ev) => {
      ratio = r; fitRatio(); paint(); ratioBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget)));
    } }, t));
    const rot = h('button', { type: 'button', class: 'btn small', onclick: () => { cv = rotateCanvas(cv); fitRatio(); mount(); } }, '↻ 旋轉');
    const finish = (v) => { closeModal(); done(v); };
    const mb = modal('裁切照片' + (label ? '：' + label : ''), [
      h('p', { class: 'msg mute', text: '拖曳框框選要保留的範圍，右下角可以調整大小。不需要裁切的話，直接按「用原圖」。' }),
      h('div', { class: 'seg-btns crop-tools' }, ratioBtns, rot), view, size
    ], [
      h('button', { type: 'button', class: 'btn', onclick: () => finish(null) }, '取消'),
      h('button', { type: 'button', class: 'btn', onclick: () => finish({ cv, box: { x: 0, y: 0, w: 1, h: 1 } }) }, '用原圖'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => finish({ cv, box: { ...box } }) }, '裁切並上傳')
    ]);
    mb.querySelector('.modal').classList.add('modal-wide');
    mb.addEventListener('click', (e) => { if (e.target === mb) done(null); });
    mount();
  });
}
async function compress(file, label, noCrop) {
  if (file.size > MAX_ORIGINAL) throw new Error('照片超過 5MB，請先縮小再上傳');
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('只能上傳圖片檔');
  const bmp = await toBitmap(file);
  const src = bmpToCanvas(bmp, 2400); if (bmp.close) bmp.close();
  const pick = noCrop ? { cv: src, box: { x: 0, y: 0, w: 1, h: 1 } } : await cropDialog(src, label);
  if (!pick) return null;
  const { cv: c0, box } = pick;
  const sx = Math.round(box.x * c0.width), sy = Math.round(box.y * c0.height), sw = Math.max(1, Math.round(box.w * c0.width)), sh = Math.max(1, Math.round(box.h * c0.height));
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), hh = Math.max(1, Math.round(sh * scale));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
  cv.getContext('2d').drawImage(c0, sx, sy, sw, sh, 0, 0, w, hh);
  let blob = await new Promise((r) => cv.toBlob(r, 'image/webp', 0.82));
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85)); ext = 'jpg'; }
  if (!blob) throw new Error('照片轉檔失敗');
  return { blob, ext, w, h: hh };
}
async function uploadPhoto(sl, file, nm, btn) {
  if (S.trial) return askLoginToKeep('上傳照片');
  btn.disabled = true; nm.className = 'nm'; nm.textContent = '處理中…';
  try {
    const out = await compress(file, sl.label);
    if (!out) { nm.textContent = ''; btn.disabled = false; return; }
    const { blob, ext, w, h: hh } = out;
    const path = S.site.id + '/' + (['hero', 'item', 'block', 'share', 'news'].includes(sl.key) ? sl.key : 'room') + '-' + Date.now().toString(36) + '.' + ext;
    const r = await YC.client.storage.from('site-photos').upload(path, blob, { contentType: blob.type, cacheControl: '3600', upsert: false });
    if (r.error) throw new Error('上傳失敗：' + r.error.message);
    S.fresh.add(path);
    const old = sl.get() && sl.get().path;
    sl.set({ path, w, h: hh });
    touch(); if (old) await trashPhoto(old);
    paintPhotos();
  } catch (e) { nm.className = 'nm'; nm.style.color = 'var(--danger)'; nm.textContent = String(e.message || e); btn.disabled = false; }
}

// ── 必填檢查 ──
function validate() {
  const L = S.lib;
  const r = L.validateForPublish(L.normalizeContent(S.content), L.normalizeSections(S.sections), S.slug, S.content, { template: S.site.template });
  if (!S.slugState.ok && !r.errors.some((e) => e.field === 'slug') && S.site.status === 'draft') r.errors.push({ field: 'slug', msg: S.slugState.msg || '網址代稱尚未確認可用' });
  r.ok = r.errors.length === 0; return r;
}
// 檢查清單的項目：打開那張設定卡片，捲到那個欄位並閃一下（照片類只捲過去、不開鍵盤）
const FIELD_EL = { name: '#f-name', tagline: '#f-tagline', intro: '#f-intro', address: '#f-address', phone: '#f-phone', 'booking.url': '#f-booking-url', 'booking.label': '#f-booking-label', hoursNote: '#f-hoursNote', video: '#f-video', ga4: '#f-ga4' };
function goField(field) {
  const id = FIELD_CARD[field.split('.')[0]]; if (!id) return;
  const card = $('#' + id);
  const target = () => {
    if (FIELD_EL[field] && $(FIELD_EL[field])) return $(FIELD_EL[field]);
    if (field.startsWith('photos')) return card.querySelector('.photo');
    if (field.startsWith('hours')) return card.querySelector('.hours-row');
    return card.querySelector('input:not([disabled]):not([type=checkbox]),textarea');
  };
  const isPhoto = field.startsWith('photos') || field === 'order';
  openCard(id, () => (isPhoto ? null : target()));
  setTimeout(() => {
    const el = target(); if (!el) return;
    const box = el.closest('.field, .photo, .hours-row, .faq-item') || el;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    box.classList.remove('field-flash'); void box.offsetWidth; box.classList.add('field-flash');
  }, 420);
}
function refreshTodo() {
  const box = $('#checks'); if (!box) return;
  const v = validate();
  const bm = $('#bookMsg'); if (bm) { const e = v.errors.find((x) => x.field.startsWith('booking')); bm.textContent = e ? e.msg : ''; }
  const sg = S.lib.suggestions(S.lib.normalizeContent(S.content), S.lib.normalizeSections(S.sections), S.site.template);
  const need = v.errors.filter((e) => ['name', 'address', 'hours', 'photos.hero'].includes(e.field) || e.field === 'slug' || /^(booking|social)/.test(e.field));
  const seq = (refreshTodo.seq = (refreshTodo.seq || 0) + 1);
  exampleWarnings().catch(() => []).then((ex) => { if (seq === refreshTodo.seq) paintChecks(box, need, ex, sg); });
}
// 發佈前檢查：必填、範例內容、搜尋建議合成一張可收合的卡片；收合時只佔一行，不把設定往下推
function paintChecks(box, need, ex, sg) {
  const link = (e) => h('li', {}, h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); goField(e.field); }, text: e.msg }));
  const sec = (cls, title, list) => (list.length ? h('div', { class: 'ck-sec ' + cls }, h('strong', { text: title }), h('ul', {}, list.map(link))) : null);
  const chip = (cls, n, t) => (n ? h('span', { class: 'ck-chip ' + cls, text: t + ' ' + n }) : null);
  const total = need.length + ex.length + sg.length;
  const state = need.length ? 'need' : ex.length ? 'ex' : 'ok';
  const title = need.length ? '發佈前還有 ' + need.length + ' 項要完成' : ex.length ? '可以發佈了，還有範例內容沒換' : '可以發佈了';
  let open = box.open;
  if (refreshTodo.first !== false) { refreshTodo.first = false; try { open = sessionStorage.getItem('yc-checks-open') === '1'; } catch (e) { open = false; } }
  box.hidden = false; box.dataset.state = state;
  box.replaceChildren(
    h('summary', {}, h('span', { class: 'ck-dot', 'aria-hidden': 'true' }), h('span', { class: 'ck-title', text: title }),
      h('span', { class: 'ck-chips' }, chip('need', need.length, '必填'), chip('ex', ex.length, '範例'), chip('sg', sg.length, '建議')), total ? h('span', { class: 'ck-more', 'aria-hidden': 'true' }) : null),
    total ? h('div', { class: 'ck-body' }, sec('need', '發佈前必須完成', need), sec('ex', '還沒換掉的範例內容', ex), sec('sg', '讓網站更容易被搜尋與 AI 找到（建議）', sg)) : null);
  box.open = !!open && total > 0;
  if (!box.ckBound) { box.ckBound = true; box.addEventListener('toggle', () => { try { sessionStorage.setItem('yc-checks-open', box.open ? '1' : '0'); } catch (e) { /* ignore */ } }); }
}

// ── 發佈 ──
async function publish() {
  if (S.trial) return askLoginToKeep('發佈');
  if (S.publishing) return;
  const v = validate();
  if (!v.ok) {
    modal('還有項目沒完成', [h('p', { text: '請先補齊下面的項目，才能發佈：' }), h('ul', {}, v.errors.map((e) => h('li', {}, h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); goField(e.field); }, text: e.msg }))))],
      [h('button', { class: 'btn primary', onclick: closeModal }, '知道了')]);
    return;
  }
  const st = S.site.status, first = st === 'draft';
  const go = async () => {
    closeModal(); S.publishing = true; const btn = $('#btnPublish'); btn.disabled = true; btn.textContent = '處理中…';
    try {
      const ok = await save(); if (!ok) throw new Error('草稿尚未儲存成功，請稍後再按發佈');
      if (needTerms()) {
        const t = await YC.client.rpc('rental_accept_terms', { p_site_id: S.site.id, p_version: termsVersion() });
        if (t.error) throw new Error('無法記錄條款同意，請稍後再試');
        S.site.terms_accepted_at = t.data || new Date().toISOString(); S.site.terms_version = termsVersion();
      }
      const r = await YC.client.functions.invoke('publish-site', { body: { site_id: S.site.id } });
      if (r.error) {
        let body = null; try { body = await r.error.context.json(); } catch (e) { /* ignore */ }
        if (body && body.errors) { modal('還有項目沒完成', [h('ul', {}, body.errors.map((e) => h('li', { text: e.msg })))], [h('button', { class: 'btn primary', onclick: closeModal }, '知道了')]); return; }
        throw new Error((body && body.message) || '發佈失敗，請稍後再試');
      }
      S.fresh.clear();
      await refreshStatus(); paintSlug();
      if (S.site.public_url && ['live', 'overdue'].includes(S.site.status) && st !== 'draft') publishedSheet(r.data.message || '已送出');
      else toast(r.data.message || '已送出', 5000);
    } catch (e) { toast(String(e.message || e), 5000); }
    finally { S.publishing = false; btn.disabled = false; btn.textContent = '發佈'; }
  };
  if (first) {
    let priceBox = null;
    const PM = S.plan;
    if (PM && PM.planFor) {
      const lock = S.site.price_lock;
      const P = PM.planFor(S.layout, lock);
      const pages = isMulti() ? S.pageList.filter((p) => p.key !== 'home').map((p) => p.label).join('、') : '';
      const box = (...kids) => h('div', { style: 'margin:12px 0 0;padding:12px 14px;border:1px solid var(--line,#3a342c);border-radius:10px;font-size:14px;line-height:1.7' }, ...kids);
      const pay = h('div', { style: 'color:var(--muted,#9a8f80)', text: '送出後請到會員專區付款，付款確認後網站就會開通。' });
      if (PM.hasPrice(P)) {
        const q = PM.quote(12, S.layout, S.site.tier, lock);
        priceBox = box(h('div', { style: 'font-weight:700' }, '租用方案：' + P.name),
          h('div', {}, h('b', { text: S.site.tier === 'pro' || !PM.earlyBird || lock ? PM.money(q.monthly || P.monthly) + '／月' : PM.earlyBird(P.monthly) }), S.site.tier === 'pro' ? '（含進階功能）' : ''),
          h('div', { style: 'color:var(--muted,#9a8f80)', text: (PM.yearText ? PM.yearText(S.layout, S.site.tier, lock) : '一次付 12 個月：' + PM.money(q.amount)) + '。' + (isMulti() ? '包含' + pages + '等頁面。' : sectionLabel('menu') + '、' + sectionLabel('interior') + '、常見問題、最新消息都包含，不另外加價。') }),
          pay);
      } else {
        // 價格尚未定案的方案（目前是多頁版）：不顯示任何金額
        priceBox = box(h('div', { style: 'font-weight:700' }, '租用方案：' + P.name),
          h('div', { text: '費用確認中。送出申請後，我們會先與你確認費用，你同意後再付款開通。' }), pay);
      }
    }
    const t = termsBox('送出申請');
    modal('送出上線申請？', [h('p', { text: '送出後，網址代稱「' + S.slug + '」就不能再修改。' }), h('p', { text: '我們會確認後為你開通網站，開通後會以 Email 通知你。在那之前你仍可以繼續編輯。' }), priceBox, t.label],
      [h('button', { class: 'btn', onclick: closeModal }, '再檢查一下'), t.btn]);
  } else if (st === 'pending') {
    const t = termsBox('更新');
    modal('更新送審內容？', [h('p', { text: '你的網站還在等待開通。更新後，開通時會使用最新的內容。' }), t.label], [h('button', { class: 'btn', onclick: closeModal }, '取消'), t.btn]);
  } else {
    const t = termsBox('發佈');
    modal('發佈更新？', [h('p', { text: '目前編輯的內容會更新到正式網站，約 1–2 分鐘後生效。' }), t.label], [h('button', { class: 'btn', onclick: closeModal }, '取消'), t.btn]);
  }
  // 還沒同意、或同意的是舊版條款：要勾選同意才能按
  function termsBox(label) {
    const need = needTerms(), updated = need && !!S.site.terms_accepted_at;
    const chk = h('input', { type: 'checkbox', id: 'termsOk' });
    const btn = h('button', { class: 'btn primary', id: 'termsGo', onclick: go }, label);
    if (need) btn.disabled = true;
    chk.addEventListener('change', () => { btn.disabled = !chk.checked; });
    const box = need ? h('label', { class: 'terms-ok', style: 'display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;font-size:14px;line-height:1.6' }, chk,
      h('span', {}, updated ? '條款已更新，請先閱讀並同意新版' : '我已閱讀並同意', h('a', { href: YC.url('terms/rental/'), target: '_blank', rel: 'noopener' }, '《網站租用條款》'))) : null;
    return { label: box, btn };
  }
}
// 是否需要（重新）同意條款：從沒同意過，或同意的不是目前版本
function needTerms() { return !S.site.terms_accepted_at || (S.site.terms_version || '') !== termsVersion(); }

// 網站公告／臨時公休：期間內每一頁上方顯示，過了自動消失（會員專區也能一鍵設定）
function noticeCard() {
  const n = S.content.notice || (S.content.notice = { text: '', from: '', to: '', closed: false });
  const today = new Date(Date.now() + 288e5).toISOString().slice(0, 10);
  const txt = h('input', { type: 'text', id: 'f-notice-text', maxlength: '80', placeholder: '例如：員工旅遊，11/12 恢復營業', autocomplete: 'off' });
  const from = h('input', { type: 'date', id: 'f-notice-from', 'aria-label': '開始日期' }), to = h('input', { type: 'date', id: 'f-notice-to', 'aria-label': '結束日期' });
  const closed = h('input', { type: 'checkbox', id: 'f-notice-closed' });
  const msg = h('div', { class: 'msg mute' });
  from.value = n.from || ''; to.value = n.to || ''; closed.checked = !!n.closed;
  const paint = () => {
    const live = n.text && n.from && (n.to || n.from) >= today;
    msg.className = 'msg ' + (n.text && n.to && n.to < today ? 'bad' : 'mute');
    msg.textContent = !n.text ? '沒有填內容就不會顯示。' : !n.from ? '請選開始日期。' : n.to && n.to < today ? '結束日期已經過了，網站上不會顯示。' : live ? (n.from > today ? '發佈後就會顯示，到 ' + (n.to || n.from) + ' 為止。' : '發佈後顯示到 ' + (n.to || n.from) + ' 為止，之後自動消失。') + (n.closed ? '這段期間線上預約也不開放。' : '') : '';
  };
  tx(txt, n, 'text', paint);
  const date = () => { n.from = from.value; if (to.value && from.value && to.value < from.value) to.value = from.value; n.to = to.value || from.value; to.min = from.value || ''; paint(); touch(); scrollPreviewTo('top'); };
  from.addEventListener('change', date); to.addEventListener('change', date);
  closed.addEventListener('change', () => { n.closed = closed.checked; paint(); touch(); });
  const quick = (label, a, b) => h('button', { type: 'button', class: 'btn small', onclick: () => { const d = (k) => new Date(Date.now() + 288e5 + k * 864e5).toISOString().slice(0, 10); from.value = d(a); to.value = d(b); date(); } }, label);
  const clear = h('button', { type: 'button', class: 'btn small', onclick: () => { n.text = ''; n.textEn = ''; n.from = ''; n.to = ''; n.closed = false; txt.value = ''; from.value = ''; to.value = ''; closed.checked = false; paint(); touch(); } }, '清除公告');
  paint();
  return card('c-notice', 'top', '網站公告／臨時公休', '例如臨時公休、活動、優惠。期間內每一頁上方都會顯示，過了日期自動消失，不用回來改。',
    h('label', { class: 'field', for: 'f-notice-text' }, h('span', { text: '公告內容' }), txt),
    h('div', { class: 'field' }, h('span', { text: '顯示期間' }), h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, from, to),
      h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px' }, quick('今天', 0, 0), quick('明天', 1, 1), quick('一週', 0, 6))),
    h('label', { class: 'check' }, closed, '這是公休（期間內不營業，線上預約也不開放）'), msg, h('div', { style: 'margin-top:8px' }, clear));
}

// 發佈後：看網站、分享到 LINE、複製網址
function publishedSheet(msg) {
  const url = S.site.public_url, name = (S.content && S.content.name) || '';
  const copy = h('button', { type: 'button', class: 'btn' }, '複製網址');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); } catch (e) { const t = h('textarea', {}); t.value = url; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch (e2) { /* ignore */ } t.remove(); }
    copy.textContent = '已複製'; setTimeout(() => { copy.textContent = '複製網址'; }, 1600);
  });
  const m = modal('已送出更新', [h('p', { text: msg }),
    h('div', { class: 'more-list' },
      h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, '看網站'),
      h('a', { class: 'btn line-share', href: 'https://line.me/R/share?text=' + encodeURIComponent((name ? name + '\n' : '') + url), target: '_blank', rel: 'noopener' }, '分享到 LINE'),
      copy,
      navigator.share ? h('button', { type: 'button', class: 'btn', onclick: () => navigator.share({ title: name, url }).catch(() => {}) }, '其他分享方式') : null)],
  [h('button', { type: 'button', class: 'btn primary', onclick: closeModal }, '好')]);
  m.classList.add('sheet');
}

// 手機：點預覽上的文字 →「改這段字」→ 下方面板直接改，上面的預覽同步顯示
function openTextSheet(x) {
  const { el, t, win } = x, orig = x.text;
  const L = S.lib, many = t.max && t.max > 80;
  const inp = many ? h('textarea', { rows: '3', maxlength: t.max ? String(t.max) : null, enterkeyhint: 'done' }) : h('input', { type: 'text', maxlength: t.max ? String(t.max) : null, enterkeyhint: 'done', autocomplete: 'off' });
  inp.value = orig;
  const cnt = h('div', { class: 'msg mute', style: 'text-align:right' });
  const upd = () => { if (t.max) cnt.textContent = [...inp.value].length + '/' + t.max; };
  let done = false;
  const finish = (cancel) => {
    if (done) return; done = true;
    if (cancel) { t.set(orig); el.textContent = orig; }
    el.classList.remove('yc-txt-on'); closeModal();
    S.inlineEdit = false; touch(); syncPanel(); renderPreview(true);
  };
  inp.addEventListener('input', () => {
    let v = inp.value.replace(/[\r\n]+/g, ' ');
    if (v !== inp.value) inp.value = v;
    t.set(v.trim() ? v : orig); el.textContent = v.trim() ? v : orig; upd(); touch();
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(false); } });
  S.inlineEdit = true; $('#toast').classList.remove('show');
  el.classList.add('yc-txt-on');
  // 改的那段字移到預覽上方看得到的地方
  try { const r = el.getBoundingClientRect(); win.scrollTo({ top: Math.max(0, win.scrollY + r.top - 70) }); } catch (e) { /* ignore */ }
  const m = modal(t.label ? '修改：' + t.label : '修改文字', [inp, cnt, h('p', { class: 'msg mute', text: '上面的預覽會跟著變。改完按「完成」，會自動存檔。' })],
    [h('button', { type: 'button', class: 'btn', onclick: () => finish(true) }, '取消'), h('button', { type: 'button', class: 'btn primary', onclick: () => finish(false) }, '完成')]);
  m.classList.add('sheet', 'txt-sheet');
  m.addEventListener('click', (e) => { if (e.target === m) finish(false); }, true);
  upd();
  setTimeout(() => { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* ignore */ } }, 60);
  void L;
}

// 手機：在設定頁打開「邊改邊看」的小預覽（上方顯示網站，下方是設定）
const CARD_ANCHOR = { 'c-info': 'about', 'c-hours': 'visit', 'c-notice': 'top', 'c-menu': 'menu', 'c-photos': 'interior', 'c-news': 'news', 'c-faq': 'faq', 'c-shop': 'shop', 'c-posts': 'posts', 'c-cal': 'booking', 'c-booking': 'top', 'c-basic': 'top', 'c-style': 'about', 'c-more': 'reviews', 'c-blocks': 'top' };
const peekOn = () => { const a = $('.app'); return !!(a && a.classList.contains('peek') && a.dataset.mode === 'card'); };
function setPeek(on) {
  const app = $('.app'); if (!app) return;
  app.classList.toggle('peek', on);
  try { localStorage.setItem('yc-builder-peek', on ? '1' : '0'); } catch (e) { /* ignore */ }
  const b = $('#peekBtn'); if (b) { b.setAttribute('aria-pressed', String(on)); b.querySelector('span').textContent = on ? '收起預覽' : '邊改邊看'; }
  if (on) { renderPreview(true); peekFollow(); }
}
function peekFollow() {
  if (!peekOn() || !S.mCardId) return;
  const a = CARD_ANCHOR[S.mCardId];
  setTimeout(() => { if (a === 'top') { try { $('#frame').contentWindow.scrollTo(0, 0); } catch (e) { /* ignore */ } } else if (a) scrollPreviewTo(a); }, 120);
}

// ── 手機版（像 App 一樣）：下方分頁 → 設定清單 → 點一項進入那一頁設定，左上「‹」或手機的返回鍵回清單 ──
const isMob = () => matchMedia('(max-width:860px)').matches;
function buildMobList() {
  const P = $('#panel');
  const q = h('input', { type: 'search', class: 'm-search', placeholder: '搜尋設定，例如 電話、配色、預約', 'aria-label': '搜尋設定', autocomplete: 'off' });
  q.addEventListener('input', () => { const s = $('#setSearch'); if (s) { s.value = q.value; runSearch(q.value); } paintMobList(); });
  const head = h('div', { id: 'mhead', class: 'mhead' }, h('h1', { id: 'mH1', class: 'm-h1' }), q);
  const rows = h('div', { id: 'mrows', class: 'mrows', role: 'list' });
  const nav = P.querySelector('.group-nav'); nav.after(head);
  const first = P.querySelector('section.card'); if (first) first.before(rows); else P.append(rows);
  P.dataset.mode = 'list';
}
function paintMobList() {
  const P = $('#panel'), rows = $('#mrows'); if (!rows) return;
  const s = $('#setSearch'), searching = !!(s && s.value.trim());
  const pressed = P.querySelector('.group-nav button[aria-pressed=true]');
  const g = GROUPS.find((x) => pressed && x.key === pressed.dataset.g);
  $('#mH1').textContent = searching ? '搜尋結果' : (g ? g.label : '設定');
  rows.replaceChildren(...[...P.querySelectorAll('section.card')].filter((c) => !c.hidden).map((c) => {
    const t = c.querySelector('h2'), sub = c.querySelector('.sub');
    const title = t ? t.textContent.replace(/（.*?）/g, '').trim() : c.id;
    const pro = PRO_CARDS.includes(c.id) ? h('em', { class: 'pro-badge', text: S.isPro ? '進階・已開通' : '進階 +NT$' + Number(proAdd()).toLocaleString('en-US') + '／月' }) : null;
    return h('button', { type: 'button', class: 'mrow', role: 'listitem', onclick: () => openCard(c.id) },
      h('span', { class: 'mrow-t' }, h('strong', {}, title, pro), sub ? h('small', { text: sub.textContent.trim() }) : ''),
      h('span', { class: 'mrow-go', 'aria-hidden': 'true', text: '›' }));
  }));
  if (searching && !rows.children.length) rows.append(h('p', { class: 'msg mute', text: '找不到相關的設定，換個說法試試看' }));
  paintMobTabs();
}
function paintMobTabs() {
  const app = $('.app'), P = $('#panel'); if (!app) return;
  const pressed = P && P.querySelector('.group-nav button[aria-pressed=true]');
  const cur = app.dataset.tab === 'view' ? 'view' : (pressed ? pressed.dataset.g : '');
  document.querySelectorAll('#mtabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.k === cur ? 'page' : 'false'));
}
function enterCard(c, keepScroll) {
  const P = $('#panel'), app = $('.app');
  if (P.dataset.mode !== 'card' && !keepScroll) S.mListScroll = P.scrollTop;
  S.mCardId = c.id;
  P.querySelectorAll('section.card.is-open').forEach((x) => x.classList.remove('is-open'));
  c.classList.add('is-open'); P.dataset.mode = 'card'; app.dataset.mode = 'card';
  const t = c.querySelector('h2'); $('#mCardTitle').textContent = t ? t.textContent.replace(/（.*?）/g, '').trim() : '';
  P.scrollTop = 0;
  if (!(history.state && history.state.mcard)) history.pushState({ mcard: c.id }, '');
  if (peekOn() && !keepScroll) { renderPreview(true); peekFollow(); }
}
function leaveCard() {
  const P = $('#panel'), app = $('.app'); if (!P || P.dataset.mode !== 'card') return;
  P.querySelectorAll('section.card.is-open').forEach((x) => x.classList.remove('is-open'));
  P.dataset.mode = 'list'; app.dataset.mode = 'list';
  paintMobList(); P.scrollTop = S.mListScroll || 0;
}
function backToList() { if (history.state && history.state.mcard) history.back(); else leaveCard(); }
window.addEventListener('popstate', () => leaveCard());
// 「更多」裡加到主畫面的說明
function openInstallHelp() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  modal('加到手機主畫面', [h('p', { text: '加到主畫面後，編輯器會像 App 一樣用整個螢幕打開，不會有瀏覽器的網址列。' }),
    h('ol', {}, ...(ios
      ? [h('li', { text: '用 Safari 打開這一頁' }), h('li', { text: '點下方的「分享」按鈕' }), h('li', { text: '選「加入主畫面」，再按「新增」' })]
      : [h('li', { text: '用 Chrome 打開這一頁' }), h('li', { text: '點右上角的「⋮」' }), h('li', { text: '選「加到主畫面」或「安裝應用程式」' })])),
    h('p', { class: 'msg mute', text: '第一次從主畫面打開時，可能需要重新登入一次。' })],
  [h('button', { type: 'button', class: 'btn primary', onclick: closeModal }, '知道了')]).classList.add('sheet');
}

// 手機版：編輯／預覽切換
function setTab(t) {
  const app = $('.app'); if (!app) return;
  const changed = app.dataset.tab && app.dataset.tab !== t;
  app.dataset.tab = t;
  const te = $('#tabEdit'), tv = $('#tabView');
  if (te) te.setAttribute('aria-selected', String(t === 'edit'));
  if (tv) tv.setAttribute('aria-selected', String(t === 'view'));
  paintMobTabs();
  if (changed && matchMedia('(max-width:860px)').matches) {
    window.scrollTo(0, 0);
    if (t === 'view' && !setTab.tipped) { setTab.tipped = true; toast('點預覽上的文字可以直接改；點區塊可以跳到那裡的設定', 3600); }
  }
}
// 手機版的「更多」：全螢幕預覽、切換網站、刪除、教學、回會員專區
function openMoreSheet() {
  if (S.trial) {
    const m = modal('試用模式', [h('p', { text: '目前是試用模式，內容只暫存在這個瀏覽器。登入後才能儲存到帳號、上傳照片與發佈。' }),
      h('div', { class: 'more-list' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => { closeModal(); askLoginToKeep('儲存'); } }, '登入並儲存'),
        h('button', { type: 'button', class: 'btn', onclick: () => { closeModal(); openFullPreview(); } }, '全螢幕預覽'),
        h('button', { type: 'button', class: 'btn', onclick: () => { closeModal(); openGuide(); } }, '使用教學'),
        h('a', { class: 'btn', href: '../rental/' }, '網站租用說明'),
        h('a', { class: 'btn', href: '../' }, '回官網首頁'),
        h('button', { type: 'button', class: 'btn', onclick: async () => { closeModal(); clearTrial(); location.reload(); } }, '清除試用內容，重新開始'), uiLangBtn())],
      [h('button', { type: 'button', class: 'btn', onclick: closeModal }, '關閉')]);
    m.classList.add('sheet'); return;
  }
  const d = deriveStatus();
  const sw = h('div', { class: 'more-switch' }); paintSiteSwitch(sw);
  const m = modal(((S.content && S.content.name) || S.site.slug), [
    h('p', { class: 'more-status' }, h('span', { class: 'badge ' + d.cls, text: d.text }), ' ' + S.site.slug),
    h('div', { class: 'more-list' },
      h('button', { type: 'button', class: 'btn', onclick: () => { closeModal(); openFullPreview(); } }, '全螢幕預覽'),
      $('#c-order') ? h('button', { type: 'button', class: 'btn', onclick: () => { closeModal(); openCard('c-order'); } }, '首頁區塊順序') : '',
      $('#c-history') ? h('button', { type: 'button', class: 'btn', onclick: () => { closeModal(); openCard('c-history'); } }, '版本紀錄與還原') : '',
      h('button', { type: 'button', class: 'btn', onclick: () => { closeModal(); openInstallHelp(); } }, '加到手機主畫面'),
      h('button', { type: 'button', class: 'btn', onclick: () => { closeModal(); openGuide(); } }, '使用教學'),
      h('a', { class: 'btn', href: '../dashboard/' }, '回到會員專區'),
      h('button', { type: 'button', class: 'btn', onclick: async () => { closeModal(); if (S.dirty || S.saving) await save(); S.dirty = false; YC.switchAccount().catch((e) => toast('無法切換帳號：' + (e.message || e))); } }, '切換 Google 帳號'), uiLangBtn()),
    h('div', { class: 'field', style: 'margin-top:14px' }, h('span', { text: '切換網站' }), sw)],
    [h('button', { type: 'button', class: 'btn', onclick: closeModal }, '關閉')]);
  m.classList.add('sheet');
}

function paintTrialBar() {
  const tb = $('#trialBar'); if (!tb) return;
  tb.hidden = false;
  const msg = $('#tbMsg'), btn = $('#trialLogin'), sv = $('#btnSave'), back = $('.bar-back');
  if (S.trial) {
    msg.replaceChildren(h('span', { class: 'tb-long', text: '目前是' }), '試用模式', h('span', { class: 'tb-long', text: '，' }), h('span', { class: 'tb-short', text: '・' }), '登入後才能儲存', h('span', { class: 'tb-long', text: '與發布' }));
    btn.hidden = false; btn.onclick = () => askLoginToKeep('儲存');
    if (sv) { sv.hidden = false; sv.onclick = () => askLoginToKeep('儲存'); }
    if (back) { back.href = '../rental/'; back.title = '回到網站租用'; back.setAttribute('aria-label', '回到網站租用'); back.innerHTML = '←<span class="bb-t"> 網站租用</span>'; }
  } else {
    msg.textContent = ''; btn.hidden = true; if (sv) sv.hidden = true;
  }
}
// 預覽裝置：電腦（1280）、平板（820）用真實寬度排版後等比縮小放進預覽區；手機（390）照原本的手機外框
const DEVICES = { desk: 1280, tab: 820, mob: 390 };
// 電腦版：拖曳中間的分隔線調整編輯欄寬度（記住；雙擊恢復預設）
function bindSplitter() {
  const sp = $('#splitter'), split = $('.split'); if (!sp || !split) return;
  const DEF = 480, MIN = 360;
  const max = () => Math.max(MIN, Math.min(820, window.innerWidth * 0.62));
  const set = (w, keep) => { w = Math.round(Math.min(max(), Math.max(MIN, w))); split.style.setProperty('--panel-w', w + 'px'); sp.setAttribute('aria-valuenow', String(w)); if (keep) { try { localStorage.setItem('yc-builder-panel', String(w)); } catch (e) { /* ignore */ } } };
  let w0 = DEF; try { const v = Number(localStorage.getItem('yc-builder-panel')); if (v) w0 = v; } catch (e) { /* ignore */ }
  set(w0);
  let drag = null;
  sp.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, w: $('#panel').getBoundingClientRect().width }; sp.setPointerCapture(e.pointerId); document.body.classList.add('resizing'); });
  sp.addEventListener('pointermove', (e) => { if (drag) set(drag.w + e.clientX - drag.x); });
  const end = () => { if (!drag) return; drag = null; document.body.classList.remove('resizing'); set($('#panel').getBoundingClientRect().width, true); };
  sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
  sp.addEventListener('dblclick', () => set(DEF, true));
  sp.addEventListener('keydown', (e) => { const d = { ArrowLeft: -24, ArrowRight: 24 }[e.key]; if (!d) return; e.preventDefault(); set($('#panel').getBoundingClientRect().width + d, true); });
}
function bindDevice() {
  const stage = $('#stage'), box = $('#frameBox'), f = $('#frame');
  const btn = { desk: $('#devDesk'), tab: $('#devTab'), mob: $('#devMob') };
  let dev = 'desk';
  try { const v = localStorage.getItem('yc-builder-device'); if (DEVICES[v]) dev = v; } catch (e) { /* ignore */ }
  const small = window.matchMedia('(max-width:860px)');
  function fit() {
    const clear = () => { stage.classList.remove('fit'); box.style.width = box.style.height = ''; f.style.width = f.style.height = f.style.transform = ''; };
    if (small.matches || dev === 'mob') { clear(); stage.classList.toggle('mob', dev === 'mob' && !small.matches); return; }
    stage.classList.remove('mob'); stage.classList.add('fit');
    const cs = getComputedStyle(stage), W = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), H = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (W <= 0 || H <= 0) return;
    const T = DEVICES[dev], k = Math.min(1, W / T);
    box.style.width = Math.floor(T * k) + 'px'; box.style.height = Math.floor(H) + 'px'; box.style.margin = '0 auto';
    f.style.width = T + 'px'; f.style.height = Math.ceil(H / k) + 'px'; f.style.transform = k < 1 ? 'scale(' + k + ')' : '';
  }
  function set(v) {
    dev = v; last = ''; Object.entries(btn).forEach(([k, b]) => b && b.setAttribute('aria-pressed', String(k === v)));
    try { localStorage.setItem('yc-builder-device', v); } catch (e) { /* ignore */ }
    fit();
  }
  Object.entries(btn).forEach(([k, b]) => b && b.addEventListener('click', () => set(k)));
  // 尺寸變動只在下一個畫面重算一次，且差不到 2px 不重算（避免捲軸出現／消失造成來回閃動）
  let raf = 0, last = '';
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const key = Math.round(stage.clientWidth / 2) + 'x' + Math.round(stage.clientHeight / 2) + dev; if (key !== last) { last = key; fit(); } }); };
  if (window.ResizeObserver) new ResizeObserver(later).observe(stage); else window.addEventListener('resize', later);
  if (small.addEventListener) small.addEventListener('change', fit);
  set(dev);
}
function bindChrome() {
  if (bindChrome.done) return; bindChrome.done = true;
  $('#btnPublish').addEventListener('click', publish);
  $('#btnFull').addEventListener('click', openFullPreview);
  const bu = $('#btnUi'); if (bu) { if (UI_EN) { bu.textContent = '中文'; bu.lang = 'zh-Hant'; bu.title = '把編輯器介面改成中文'; } bu.addEventListener('click', () => setUiLang(UI_EN ? 'zh' : 'en')); }
  bindDevice(); bindSplitter();
  setTab('edit');
  $('#tabEdit').addEventListener('click', () => setTab('edit'));
  $('#tabView').addEventListener('click', () => { setTab('view'); renderPreview(); });
  $('#btnFull2').addEventListener('click', openFullPreview);
  $('#btnMore').addEventListener('click', openMoreSheet);
  $('#mBack').addEventListener('click', backToList);
  document.querySelectorAll('#mtabs button').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.k, P = $('#panel');
    if (k === 'view') { setTab('view'); renderPreview(); return; }
    const wasCard = P.dataset.mode === 'card';
    leaveCard(); S.mListScroll = 0;
    if (wasCard && history.state && history.state.mcard) history.back();
    setTab('edit'); clearSearch(); const ms = P.querySelector('.m-search'); if (ms) ms.value = '';
    showGroup(k, false); P.scrollTop = 0;
  }));
  // 手機：設定頁右下角「邊改邊看」按鈕
  const app = $('.app');
  const pb = h('button', { type: 'button', id: 'peekBtn', class: 'peek-btn', 'aria-pressed': 'false', title: '在上方顯示網站預覽，邊改邊看' });
  pb.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/></svg>';
  pb.append(h('span', { text: '邊改邊看' }));
  pb.addEventListener('click', () => setPeek(!app.classList.contains('peek')));
  app.append(pb);
  let peek0 = false; try { peek0 = localStorage.getItem('yc-builder-peek') === '1'; } catch (e) { /* ignore */ }
  if (peek0) setPeek(true);
  // 手機鍵盤：單行欄位的 Enter 跳到下一格（鍵盤上顯示「下一項」），最後一格收起鍵盤；正在打字的欄位保持在畫面中間
  const FIELD = 'input[type=text],input[type=tel],input[type=url],input[type=email],input[type=number],input:not([type])';
  const nextOf = (el) => {
    const scope = el.closest('section.card') || $('#panel');
    const list = [...scope.querySelectorAll(FIELD + ',textarea,select')].filter((x) => !x.disabled && x.offsetParent !== null && !x.closest('[hidden]'));
    return list[list.indexOf(el) + 1] || null;
  };
  document.addEventListener('focusin', (e) => {
    const el = e.target; if (!isMob() || !el.matches || !el.closest('#panel section.card')) return;
    if (el.matches(FIELD) && !el.hasAttribute('enterkeyhint')) el.setAttribute('enterkeyhint', nextOf(el) ? 'next' : 'done');
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || !isMob() || !el.matches || !el.matches(FIELD) || !el.closest('#panel section.card')) return;
    e.preventDefault();
    const n = nextOf(el); if (n && n.tagName !== 'SELECT') n.focus(); else el.blur();
  });
  const keepVisible = () => {
    const a = document.activeElement;
    if (!isMob() || !a || !a.closest || !a.closest('#panel')) return;
    const vv = window.visualViewport, r = a.getBoundingClientRect(), bottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
    if (r.bottom > bottom - 12 || r.top < 60) a.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { clearTimeout(keepVisible.t); keepVisible.t = setTimeout(keepVisible, 120); });
  document.addEventListener('focusin', () => { clearTimeout(keepVisible.t); keepVisible.t = setTimeout(keepVisible, 350); });
  // 手機：打字時（鍵盤打開）先收起下方的工具列，避免擋住正在輸入的欄位
  document.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches('#panel input:not([type=checkbox]):not([type=radio]):not([type=color]), #panel textarea, #panel select')) app.classList.add('typing'); });
  document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!(a && a.matches && a.matches('#panel input, #panel textarea, #panel select'))) app.classList.remove('typing'); }, 80));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    // 輸入框裡交給瀏覽器自己的復原；其他地方 Ctrl/⌘+Z 復原、Ctrl/⌘+Shift+Z 或 Ctrl+Y 重做
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing || !(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  });
  $('#btnUndo').addEventListener('click', undo); $('#btnRedo').addEventListener('click', redo);
}

YC.onChange((ev) => {
  if (ev === 'SIGNED_OUT') location.reload();
  if (S.trial && YC.loggedIn()) { save(); location.reload(); return; }
  if (!booted) boot();
});
YC.init();
