/* YC AXIOM 網站編輯器：左邊填內容、右邊即時預覽。
   預覽用的版型函式與「正式建置」是同一份程式（yc-axiom-sites 的 templates/shared/*），所以所見即所得。 */
import { startReveal, wireNav, morphFrame, settleReveal, wireEditPills, flashSection, sectionKey } from './preview-fx.js';
const YC = window.YC;
const $ = (s, r) => (r || document).querySelector(s);
const DEFAULT_TPL_BASE = 'https://chi1017.github.io/yc-axiom-sites/';
const SAVE_DELAY = 2000, RENDER_DELAY = 150;
const TERMS_VERSION = '2026-10-v6';   // 條款有實質修改時改這個版本代號（會記錄客戶同意的是哪一版）
const MAX_ORIGINAL = 5 * 1024 * 1024, MAX_EDGE = 1600;
// 標題字型檔（預覽用完整的常用字版本；正式網站只放用到的字）
const FONT_FILE = { serif: 'NotoSerifTC-Bold-common.woff2', sans: 'NotoSansTC-Bold-common.woff2', round: 'Huninn-common.woff2', kai: 'LXGWWenKaiTC-Bold-common.woff2' };

function tplBase() {
  // 只有本機測試（127.0.0.1／localhost）允許用 ?tplbase= 指定版型來源
  const q = new URLSearchParams(location.search).get('tplbase');
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
  const first = back.querySelector('button.primary') || back.querySelector('button'); if (first) first.focus();
  return back;
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); }
function gate(nodes) { const g = $('#gate'); g.hidden = false; g.replaceChildren(h('div', { class: 'gate-card' }, nodes)); $('#app').hidden = true; }

const S = {
  lib: null, plan: null, site: null, content: null, palette: 'forest', sections: null, slug: '', slugState: { ok: true, msg: '' },
  layout: 'single', pages: null, page: 'home', pageList: [],
  events: [], dirty: false, saving: false, saveErr: false, lastSaved: null, fresh: new Set(), timers: {}, publishing: false, hist: [], hpos: 0, applying: false
};

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
  let site, content, valid, slug, pal, hours, pages, ind, code = {};
  try {
    // 一個打包好的檔案（templates/dist/builder-lib.js）就包含全部共用模組，只要下載一次
    const L = await import(base + 'templates/dist/builder-lib.js');
    ({ site, content, valid, slug, pal, hours, pages, ind } = L); code = L.code || {};
  } catch (e) {
    // 備援：打包檔讀不到時，改成一個一個載入原始模組（舊做法）
    [site, content, valid, slug, pal, hours, pages, ind] = await Promise.all([
      import(base + 'templates/shared/site.js'), import(base + 'templates/shared/content.js'), import(base + 'templates/shared/validate.js'),
      import(base + 'templates/shared/slug.js'), import(base + 'templates/shared/palettes.js'), import(base + 'templates/shared/hours.js'),
      import(base + 'templates/shared/pages.js'), import(base + 'templates/shared/industries.js')
    ]);
    try { code = await import(base + 'templates/shared/code.js'); } catch (e2) { code = {}; }
  }
  S.lib = { buildSite: site.buildSite, ...content, validateForPublish: valid.validateForPublish, suggestions: valid.suggestions, slugError: slug.slugError, PALETTES: pal.PALETTES, PALETTE_IDS: pal.PALETTE_IDS, getPalette: pal.getPalette, isCustomPalette: pal.isCustomPalette, customPaletteId: pal.customPaletteId, parseCustomPalette: pal.parseCustomPalette, derivePalette: pal.derivePalette, paletteFrom4: pal.paletteFrom4, colorWarnings: pal.colorWarnings || colorWarningsLocal(pal), luminance: pal.luminance, hours,
    pagesFor: pages.pagesFor, normalizeLayout: pages.normalizeLayout, normalizePages: pages.normalizePages, defaultPages: pages.defaultPages, pagesFromSections: pages.pagesFromSections, LAYOUT_LABELS: pages.LAYOUT_LABELS,
    INDUSTRIES: ind.INDUSTRIES, INDUSTRY_GROUPS: ind.INDUSTRY_GROUPS, getIndustry: ind.getIndustry,
    codeHash: code.codeHash, hasCustomCode: code.hasCustomCode };
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
  const P = PM.planFor(layout);
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
async function boot() {
  if (booted) return;
  if (!YC.enabled) return gate([h('h1', { text: '網站編輯器即將開放' }), h('p', { text: '會員功能正在準備中，請稍後再來。' })]);
  if (!YC.loggedIn()) {
    return gate([h('h1', { text: '請先登入' }), h('p', { text: '登入後就能建立並編輯你的網站。免費，不用設定密碼。' }),
      h('button', { class: 'btn primary', onclick: () => YC.openLogin({ title: '登入網站編輯器', reason: '登入後可建立並編輯你的網站。' }) }, '登入 / 註冊')]);
  }
  if (!YC.consented()) {
    gate([h('h1', { text: '還差最後一步' }), h('p', { text: '請先完成註冊（同意條款），才能使用編輯器。' }), h('button', { class: 'btn primary', onclick: () => YC.ensureConsent() }, '完成註冊')]);
    return;
  }
  booted = true;
  try {
    gate([h('p', { text: '載入編輯器…' })]);
    await loadLib();
    const uid = YC.session.user.id;
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
function showCreate() {
  const L = S.lib;
  const slug = h('input', { type: 'text', id: 'cSlug', maxlength: '30', autocomplete: 'off', spellcheck: 'false', placeholder: 'my-shop' });
  const name = h('input', { type: 'text', id: 'cName', maxlength: '40', placeholder: '你的店名或品牌名稱' });
  // 行業：依群組列出；決定網站的用詞、頁面名稱與給搜尋引擎看的店家類型
  const ind = h('select', { id: 'cInd', class: 'sel' }, h('option', { value: '', text: '請選擇' }),
    L.INDUSTRY_GROUPS.map((g) => h('optgroup', { label: g }, L.INDUSTRIES.filter((i) => i.group === g).map((i) => h('option', { value: i.key, text: i.label })))));
  const indMsg = h('div', { class: 'msg mute', text: '網站的用詞（例如菜單、服務項目、課程）會依行業自動調整。之後也可以在編輯器裡更改。' });
  let layout = 'single';
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
    const c = L.emptyContent(); c.name = name.value.trim();
    const row = { member_id: YC.session.user.id, slug: slug.value, template: ind.value, palette: 'forest', sections: L.defaultSections(), content: c };
    if (layout === 'multi') { row.layout = 'multi'; row.pages = L.defaultPages(); }
    const r = await YC.client.from('rental_sites').insert(row).select('*').single();
    if (r.error) {
      const m = r.error.message || '';
      msg.className = 'msg bad';
      msg.textContent = '建立失敗：' + (/duplicate|unique/i.test(m) ? '這個名稱剛被使用了，請換一個' : /row-level security|policy/i.test(m) ? '你的網站數量已達上限（每位會員最多 5 個），需要更多請聯絡我們' : m);
      btn.textContent = '建立我的網站'; btn.disabled = false; return;
    }
    S.mySites = (S.mySites || []).concat(r.data);
    try { history.replaceState(null, '', location.pathname + '?site=' + r.data.id); } catch (e) { /* ignore */ }
    mount(r.data);
  });
  const back = (S.mySites || []).length ? h('p', { style: 'margin:0 0 8px' }, h('a', { href: location.pathname, text: '← 回到我的網站' })) : null;
  gate([back, h('h1', { text: (S.mySites || []).length ? '建立另一個網站' : '建立你的網站' }), h('p', { text: '先決定行業、網址代稱與店名，之後都可以在編輯器裡修改內容（網址代稱在第一次發佈後就不能再改）。' }),
    h('label', { class: 'field', for: 'cInd' }, h('span', { text: '行業' }), ind), indMsg,
    layoutBox,
    h('label', { class: 'field', for: 'cSlug', style: 'margin-top:14px' }, h('span', { text: '網址代稱' }), slug), msg, url,
    h('label', { class: 'field', for: 'cName', style: 'margin-top:14px' }, h('span', { text: '店名（之後可修改）' }), name), btn]);
}

// ── 編輯器 ──
// 上方的網站切換（有多個網站時）與「建立新網站」
function paintSiteSwitch(into) {
  const box = into || $('#siteSwitch'); if (!box) return;
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
  inp.addEventListener('input', () => { go.disabled = inp.value.trim() !== '刪除'; });
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
  S.isOwner = site.member_id === YC.session.user.id;   // 協作者不能改網址代稱、行業、版型，也不能刪除網站
  S.isPro = site.tier === 'pro';
  try { localStorage.setItem('yc-builder-site', site.id); } catch (e) { /* ignore */ }
  paintSiteSwitch();
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
}

let frameScroll = 0, pendingAnchor = null;
const frameState = { ready: false, page: null };
function renderPreview(now) {
  clearTimeout(S.timers.render);
  S.timers.render = setTimeout(() => {
    const L = S.lib;
    let r;
    try {
      r = L.buildSite({ template: S.site.template, content: S.content, palette: S.palette, sections: S.sections, layout: S.layout, pages: S.pages, page: S.page,
        siteUrl: 'https://' + (S.slug || 'your-shop') + '.pages.dev/', preview: true, imageSrc: (role, p) => photoUrl(p.path),
        ...previewFont() });
      if (updateSubsetFont(r.html)) r = L.buildSite({ template: S.site.template, content: S.content, palette: S.palette, sections: S.sections, layout: S.layout, pages: S.pages, page: S.page,
        siteUrl: 'https://' + (S.slug || 'your-shop') + '.pages.dev/', preview: true, imageSrc: (role, p) => photoUrl(p.path),
        ...previewFont() });
    } catch (e) { console.error(e); return; }
    if (S.page === 'home') paintSeoHints(r);
    S.pageList = r.pages || [];
    if (!S.pageList.some((p) => p.key === S.page)) S.page = 'home';
    paintPageTabs();
    // 手機版在「編輯」分頁時看不到預覽：先不更新預覽框，切到「預覽」時再更新（打字更順）
    if (isMob() && $('.app').dataset.tab !== 'view') return;
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
        const a = pendingAnchor; pendingAnchor = null;
        const t = a && d.getElementById(a);
        if (t) t.scrollIntoView({ block: 'start' }); else f.contentWindow.scrollTo(0, a === null ? frameScroll : 0);
        const replay = S.replayMotion; S.replayMotion = false;
        startReveal(f, replay); wireNav(f);
        d.addEventListener('click', (ev) => {
          const el = ev.target.closest && ev.target.closest('a'); if (!el) return;
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
// 進階方案功能的說明（一般方案可以先設定、在預覽看效果，升級後才會出現在正式網站）
function proNote() {
  if (S.isPro) return h('div', { class: 'msg ok', text: '你的網站是進階方案，這個功能已開放。' });
  const add = S.plan && S.plan.PRO_ADDON ? S.plan.PRO_ADDON.monthly : 400;
  const msg = S.site.pro_pending ? '進階功能已申請，確認收到差額後就會開通。現在可以先設定、在預覽看效果。'
    : '這是進階功能（每月加 NT$' + add + '）。可以先設定、在預覽看效果；到會員專區「我的網站」按「加購進階功能」開通後，才會出現在正式網站。';
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
// ── 預覽 → 左邊：點預覽上的「編輯」打開對應的設定卡片 ──
function cardForKey(k) {
  if (!k) return null;
  if (k.startsWith('b-')) return { card: 'c-blocks', focus: () => { const i = S.content.blocks.findIndex((b) => 'b-' + b.id === k); const items = $('#blockBox') ? $('#blockBox').children : []; return items[i] && items[i].querySelector('input,textarea'); } };
  const cal = S.content.bookingCal && S.content.bookingCal.enabled;
  const M = { header: ['c-info', '#f-name'], top: ['c-info', '#f-name'], footer: ['c-info', '#f-name'], about: ['c-info', '#f-intro'], video: ['c-more', '#f-video'], menu: ['c-menu'], interior: ['c-photos'],
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
  S.dirty = true; S.saveErr = false; setSaveText();
  $('#barName').textContent = S.content.name || '我的網站';
  renderPreview(); clearTimeout(S.timers.todo); S.timers.todo = setTimeout(refreshTodo, 400);
  clearTimeout(S.timers.save); S.timers.save = setTimeout(save, SAVE_DELAY);
}
function setSaveText() {
  const e = $('#saveState'); e.classList.toggle('err', S.saveErr);
  if (S.saveErr) e.textContent = '儲存失敗，稍後自動重試';
  else if (S.saving) e.textContent = '儲存中…';
  else if (S.dirty) e.textContent = '尚未儲存（2 秒後自動儲存）';
  else e.textContent = S.lastSaved ? '已儲存 ' + pad(S.lastSaved.getHours()) + ':' + pad(S.lastSaved.getMinutes()) + ':' + pad(S.lastSaved.getSeconds()) : '已儲存';
}
async function save() {
  clearTimeout(S.timers.save);
  if (S.saving) { S.timers.save = setTimeout(save, 500); return true; }
  if (!S.dirty) return true;
  S.saving = true; setSaveText();
  const snapshot = clone({ content: S.content, palette: S.palette, sections: S.sections, pages: S.pages });
  const payload = { content: snapshot.content, palette: snapshot.palette, sections: snapshot.sections };
  if (isMulti()) payload.pages = snapshot.pages;   // 一頁版不存 pages（升級時才寫入）
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
  if (S.dirty) S.timers.save = setTimeout(save, 300);
  return true;
}
window.addEventListener('beforeunload', (e) => { if (S.dirty || S.saving) { e.preventDefault(); e.returnValue = ''; } });

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
const FIELD_CARD = { blocks: 'c-blocks', seo: 'c-seo', style: 'c-style', template: 'c-basic', social: 'c-info', slug: 'c-basic', name: 'c-info', tagline: 'c-info', intro: 'c-info', address: 'c-info', phone: 'c-info', hours: 'c-hours', booking: 'c-booking', photos: 'c-photos', menu: 'c-menu', faq: 'c-faq', news: 'c-news', video: 'c-more', ga4: 'c-more', reviews: 'c-more', contactForm: 'c-more', showMap: 'c-more', bookingForm: 'c-more', posts: 'c-posts', en: 'c-en', shop: 'c-shop', bookingDeposit: 'c-more', bookingCal: 'c-cal', code: 'c-code' };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAYL = { mon: '週一', tue: '週二', wed: '週三', thu: '週四', fri: '週五', sat: '週六', sun: '週日' };

function bindInput(el, path, onChange) {
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
function card(id, anchor, title, sub, ...kids) {
  const c = h('section', { class: 'card', id, 'data-anchor': anchor }, h('h2', { text: title }), sub ? h('p', { class: 'sub', text: sub }) : null, ...kids);
  // 換到另一張卡片時才把預覽捲過去（同一張卡片裡換欄位不會一直跳）
  c.addEventListener('focusin', () => { if (anchor && S.focusAnchor !== anchor) { S.focusAnchor = anchor; scrollPreviewTo(anchor); } });
  return c;
}

function buildPanel() {
  const L = S.lib, P = $('#panel'); P.replaceChildren();
  P.append(h('div', { id: 'todo', class: 'todo', hidden: true }));
  P.append(h('details', { id: 'tips', class: 'card', hidden: true }));
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
  const copyBtn = h('button', { type: 'button', class: 'btn small' }, '把週一的時間套用到全部');
  copyBtn.addEventListener('click', () => {
    const src = S.content.hours.mon;
    rows.forEach((r) => { if (r.d === 'mon') return; Object.assign(S.content.hours[r.d], { open: src.open, close: src.close, closed: src.closed }); r.o.value = src.open; r.c.value = src.close; r.cl.checked = src.closed; r.o.disabled = r.c.disabled = src.closed; r.refresh(); });
    touch();
  });
  P.append(card('c-hours', 'visit', '營業時間', '每天填開始與結束時間；沒營業的那天勾「公休」。',
    rows.map((r) => r.el), h('div', { style: 'margin:4px 0 12px' }, copyBtn), field('備註（選填）', 'hoursNote', { max: 80, ph: '例如：國定假日營業時間以粉絲專頁公告為準' })));

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
  P.append(card('c-blocks', 'top', '自訂區塊（選填）', '最多 ' + L.LIMITS.blocks + ' 個。想放的內容沒有現成欄位時用這裡，例如：包場服務、品牌故事、合作夥伴、徵才。',
    h('div', { id: 'blockBox' }), h('button', { type: 'button', class: 'btn small', id: 'blockAdd' }, '＋ 新增圖文區塊'), ' ',
    h('button', { type: 'button', class: 'btn small', id: 'blockAddHtml' }, '＋ 嵌入程式碼（進階）'), h('span', { id: 'blockCnt', class: 'msg mute', style: 'margin-left:10px' }),
    h('div', { class: 'msg mute', style: 'margin-top:8px', text: '「嵌入程式碼」可以貼 Google 表單、Instagram、Google 日曆、訂位系統等提供的嵌入碼（進階方案，發佈後由我們審核才會出現在網站）。' })));
  const addBlock = (kind) => {
    if (S.content.blocks.length >= L.LIMITS.blocks) return;
    const id = 'k' + Math.random().toString(36).slice(2, 9).replace(/[^a-z0-9]/g, 'x');
    S.content.blocks.push(kind === 'html' ? { id, kind: 'html', title: '', body: '', photo: null, btnLabel: '', btnUrl: '', side: 'right', hidden: false, html: '' }
      : { id, kind: 'text', title: '', body: '', photo: null, btnLabel: '', btnUrl: '', side: 'right', hidden: false });
    S.content.order = L.normalizeOrder(S.content.order, S.content.blocks);
    paintBlocks(); paintOrder(); touch(); setTimeout(() => scrollPreviewTo('b-' + id), 300);
  };
  $('#blockAdd').onclick = () => addBlock('text');
  $('#blockAddHtml').onclick = () => addBlock('html');
  // 首頁區塊順序
  P.append(card('c-order', 'top', '首頁區塊順序與副標題', '用「上移／下移」調整首頁區塊的先後，也可以替每個區塊寫一句副標題。沒有內容或沒開啟的區塊不會出現在網站上。',
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
  P.append(card('c-cal', 'booking', '預約行事曆（進階方案）', '客人在網站上直接選日期與時段，每個時段有名額上限，額滿就不能再選。你在會員專區確認或取消，客人有留 Email 會收到通知。',
    proNote(),
    h('div', { class: 'field' }, h('label', { class: 'check', for: 'f-cal-enabled' }, calOn, h('strong', { text: '使用預約行事曆（取代原本的預約申請表）' }))),
    h('div', { id: 'calBox' })));
  // 自訂程式碼（進階方案）
  const codeArea = (path, label, ph) => {
    const el = h('textarea', { id: 'f-' + path.replace('.', '-'), class: 'code', rows: '6', maxlength: String(L.LIMITS.code || 20000), spellcheck: 'false', placeholder: ph });
    bindInput(el, path, () => { clearTimeout(S.timers.code); S.timers.code = setTimeout(paintCodeStatus, 800); });
    return h('label', { class: 'field', for: el.id }, h('span', { text: label }), el);
  };
  P.append(card('c-code', 'top', '自訂程式碼（進階方案）', '放 Meta Pixel、LINE Tag、聊天外掛、網站驗證碼等第三方提供的程式碼。預覽不會執行；發佈後由我們審核，核准才會放進正式網站（同一段程式碼只審一次）。',
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
  enOn.addEventListener('change', () => { S.content.en.enabled = enOn.checked; touch(); });
  P.append(card('c-en', 'top', '英文版（選填）', '開啟後網站會多一個英文頁（網址 /en/），給外國客人看，Google 也會知道這是同一家店的英文版。',
    h('div', { class: 'field' }, h('label', { class: 'check', for: 'f-en-enabled' }, enOn, h('strong', { text: '開啟英文頁' }))),
    field('英文店名', 'en.name', { max: 60, ph: 'e.g. Afternoon Sun Coffee' }),
    field('英文一句話介紹', 'en.tagline', { max: 100, ph: 'e.g. Pour-over coffee and home-baked desserts' }),
    field('英文介紹', 'en.intro', { area: true, max: 1000, rows: 5, ph: 'Who you are, what you offer, what makes you special…' }),
    field('英文地址（選填）', 'en.address', { max: 160, ph: 'e.g. No. 100, Siwei 3rd Rd., Lingya Dist., Kaohsiung', help: '沒填會用中文地址。價目會沿用中文品名與價格。' })));
  $('#reviewAdd').onclick = () => { if (S.content.reviews.length < L.LIMITS.reviews) { S.content.reviews.push({ name: '', text: '' }); paintReviews(); touch(); } };
  paintMenu(); paintNews(); paintFaq(); paintReviews(); paintPosts(); paintItems(); paintBlocks(); paintOrder(); paintSlug(); paintLinks(); refreshTodo();
  paintFontBox(); paintCal(); paintCodeStatus();
  if (!S.isOwner) { const ind = $('#f-industry'); if (ind) { ind.disabled = true; ind.title = '只有網站擁有者能更改行業'; } }
  buildGroupNav();
}

// ── 編輯面板分組：上方的分組按鈕只顯示該組的卡片，不用一直往下捲 ──
const GROUPS = [
  { key: 'look', label: '外觀', cards: ['c-basic', 'c-style'] },
  { key: 'info', label: '店家資料', cards: ['c-info', 'c-hours', 'c-booking', 'c-photos'] },
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
const SYN = { 電話: '電話', 顏色: '配色 顏色 主色', 配色: '配色 顏色', 字: '字型 字體', 字型: '字型 字體 上傳', 預約: '預約 訂位 行事曆 時段', 訂位: '訂位 預約', 照片: '照片 圖片 主視覺', 圖片: '照片 圖片', 地址: '地址 地圖', 時間: '營業時間 時段', 價格: '價目 菜單 價格 商品', 網址: '網址 代稱 網域', 程式: '程式碼 嵌入', 追蹤: '程式碼 Analytics', 分享: '分享 搜尋', 英文: '英文' };
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
  const steps = [
    ['1　填內容', '左邊依分類填寫：先選外觀，再填店家資料與照片。不用一次填完，系統每 2 秒自動儲存。'],
    ['2　看預覽', '右邊會即時顯示網站的樣子，可以切換桌面版與手機版，選單、捲動動畫都能直接試。灰色的 [提示文字] 不會出現在正式網站。'],
    ['3　按發佈', '必填項目完成後，按右上角「發佈」。之後每次修改再按一次發佈，網站約 1–2 分鐘更新。'],
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

function iconBtn(text, onclick, cls) { return h('button', { type: 'button', class: 'btn small ' + (cls || ''), onclick }, text); }
function paintMenu() {
  const L = S.lib, box = $('#menuBox'); box.replaceChildren();
  S.content.menu.forEach((m, i) => {
    const n = h('input', { type: 'text', maxlength: '40', placeholder: IND().offer.item + '名稱', 'aria-label': IND().offer.item + '名稱 ' + (i + 1) }), p = h('input', { type: 'number', min: '0', max: '99999', step: '1', inputmode: 'numeric', placeholder: '價格', 'aria-label': '價格 ' + (i + 1) });
    n.value = m.name; p.value = m.price == null ? '' : m.price;
    n.addEventListener('input', () => { m.name = n.value; touch(); });
    p.addEventListener('input', () => { m.price = p.value === '' ? null : Number(p.value); touch(); });
    box.append(h('div', { class: 'row2' }, n, p, iconBtn('刪除', () => { S.content.menu.splice(i, 1); paintMenu(); touch(); }, 'danger')));
  });
  $('#menuAdd').disabled = S.content.menu.length >= L.LIMITS.menu; $('#menuCnt').textContent = S.content.menu.length + '/' + L.LIMITS.menu;
}
function paintNews() {
  const L = S.lib, box = $('#newsBox'); box.replaceChildren();
  S.content.news.forEach((m, i) => {
    const d = h('input', { type: 'date', 'aria-label': '日期 ' + (i + 1) }), t = h('input', { type: 'text', maxlength: '60', placeholder: '消息標題', 'aria-label': '標題 ' + (i + 1) });
    d.value = m.date; t.value = m.title;
    d.addEventListener('input', () => { m.date = d.value; touch(); }); t.addEventListener('input', () => { m.title = t.value; touch(); });
    box.append(h('div', { class: 'rowN' }, d, t, iconBtn('刪除', () => { S.content.news.splice(i, 1); paintNews(); touch(); }, 'danger')));
  });
  $('#newsAdd').disabled = S.content.news.length >= L.LIMITS.news; $('#newsCnt').textContent = S.content.news.length + '/' + L.LIMITS.news;
}
function paintPosts() {
  const L = S.lib, box = $('#postBox'); if (!box) return; box.replaceChildren();
  S.content.posts.forEach((p, i) => {
    const t = h('input', { type: 'text', maxlength: String(L.LIMITS.postTitle), placeholder: '文章標題', 'aria-label': '文章標題 ' + (i + 1) });
    const d = h('input', { type: 'date', 'aria-label': '文章日期 ' + (i + 1) });
    const b = h('textarea', { maxlength: String(L.LIMITS.postBody), rows: '6', placeholder: '文章內容（空一行就是新段落）', 'aria-label': '文章內容 ' + (i + 1) });
    const cnt = h('div', { class: 'msg mute', style: 'text-align:right' });
    t.value = p.title; d.value = p.date; b.value = p.body;
    const upd = () => { cnt.textContent = [...b.value].length + '/' + L.LIMITS.postBody; };
    t.addEventListener('input', () => { p.title = t.value; touch(); }); d.addEventListener('input', () => { p.date = d.value; touch(); });
    b.addEventListener('input', () => { p.body = b.value; upd(); touch(); }); upd();
    box.append(h('div', { class: 'faq-item' }, h('div', { class: 'rowN' }, d, t), b, cnt,
      h('div', { class: 'msg mute', text: '網址：/posts/' + p.id + '/' }),
      h('div', { style: 'text-align:right' }, iconBtn('刪除這篇', () => { if (confirm('確定刪除這篇文章？')) { S.content.posts.splice(i, 1); paintPosts(); touch(); } }, 'danger'))));
  });
  $('#postAdd').disabled = S.content.posts.length >= L.LIMITS.posts; $('#postCnt').textContent = S.content.posts.length + '/' + L.LIMITS.posts;
}
function orderLabel(k) {
  const I = IND();
  if (k.startsWith('b:')) { const b = S.content.blocks.find((x) => x.id === k.slice(2)); return '自訂：' + ((b && b.title) || '（未命名區塊）') + (b && b.hidden ? '（隱藏中）' : ''); }
  return ({ menu: I.offer.label, interior: I.space.label, visit: I.visit.label })[k] || S.lib.ORDER_LABELS[k] || k;
}
function paintOrder() {
  const box = $('#orderBox'); if (!box) return;
  const o = S.content.order;
  $('#orderNote').textContent = S.content.homeStyle === 'magazine' ? '目前首頁排版是「雜誌風」，版面固定，這裡的順序要改回「標準」排版才會套用。' : '';
  const subIn = (k) => {
    if (!S.lib.SUB_KEYS.includes(k)) return null;
    const el = h('input', { type: 'text', class: 'ord-sub', maxlength: String(S.lib.LIMITS.sub), placeholder: '副標題（選填）', 'aria-label': orderLabel(k) + ' 副標題' });
    el.value = S.content.subs[k] || '';
    el.addEventListener('input', () => { if (el.value.trim()) S.content.subs[k] = el.value; else delete S.content.subs[k]; touch(); });
    el.addEventListener('focus', () => scrollPreviewTo(k));
    return el;
  };
  box.replaceChildren(...o.map((k, i) => h('li', {}, h('div', { class: 'ord-main' }, h('span', { text: (i + 1) + '. ' + orderLabel(k) }), subIn(k)),
    h('span', { class: 'ord-btns' },
      iconBtn('上移', () => { [o[i - 1], o[i]] = [o[i], o[i - 1]]; paintOrder(); touch(); scrollPreviewTo(k.startsWith('b:') ? 'b-' + k.slice(2) : k); }),
      iconBtn('下移', () => { [o[i + 1], o[i]] = [o[i], o[i + 1]]; paintOrder(); touch(); scrollPreviewTo(k.startsWith('b:') ? 'b-' + k.slice(2) : k); })))));
  box.querySelectorAll('li').forEach((li, i) => { const [u, d] = li.querySelectorAll('button'); u.disabled = i === 0; d.disabled = i === o.length - 1; });
}
function paintBlocks() {
  const L = S.lib, box = $('#blockBox'); if (!box) return; box.replaceChildren();
  S.content.blocks.forEach((b, i) => {
    const delBlock = () => iconBtn('刪除這個區塊', () => { if (!confirm('確定刪除這個區塊？')) return; S.content.blocks.splice(i, 1); S.content.order = L.normalizeOrder(S.content.order, S.content.blocks); paintBlocks(); paintOrder(); touch(); }, 'danger');
    if (b.kind === 'html') {
      const t2 = h('input', { type: 'text', maxlength: String(L.LIMITS.blockTitle), placeholder: '區塊標題（選填），例如：追蹤我們的 Instagram', 'aria-label': '嵌入區塊標題 ' + (i + 1) });
      const code = h('textarea', { class: 'code', maxlength: String(L.LIMITS.html || 20000), rows: '6', spellcheck: 'false', placeholder: '貼上嵌入碼，例如 <iframe src="https://…"></iframe>', 'aria-label': '嵌入程式碼 ' + (i + 1) });
      const hid2 = h('input', { type: 'checkbox' });
      t2.value = b.title; code.value = b.html || ''; hid2.checked = b.hidden;
      t2.addEventListener('input', () => { b.title = t2.value; paintOrder(); touch(); });
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
    t.value = b.title; body.value = b.body; bl.value = b.btnLabel; bu.value = b.btnUrl; side.value = b.side; hid.checked = b.hidden;
    const go = () => scrollPreviewTo('b-' + b.id);
    t.addEventListener('input', () => { b.title = t.value; paintOrder(); touch(); });
    body.addEventListener('input', () => { b.body = body.value; touch(); });
    bl.addEventListener('input', () => { b.btnLabel = bl.value; touch(); });
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
        h('div', { class: 'ctl' }, nm, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, up, del), file, side)),
      h('div', { class: 'row2', style: 'margin-top:8px' }, bl, bu),
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:8px' },
        h('label', { class: 'check' }, hid, '暫時隱藏'),
        iconBtn('刪除這個區塊', () => { if (!confirm('確定刪除這個區塊？')) return; S.content.blocks.splice(i, 1); S.content.order = L.normalizeOrder(S.content.order, S.content.blocks); paintBlocks(); paintOrder(); touch(); }, 'danger'))));
  });
  $('#blockAddHtml').disabled = S.content.blocks.length >= L.LIMITS.blocks;
  $('#blockAdd').disabled = S.content.blocks.length >= L.LIMITS.blocks; $('#blockCnt').textContent = S.content.blocks.length + '/' + L.LIMITS.blocks;
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
    n.value = it.name; p.value = it.price == null ? '' : it.price; d.value = it.desc || '';
    n.addEventListener('input', () => { it.name = n.value; touch(); });
    p.addEventListener('input', () => { it.price = p.value === '' ? null : Number(p.value); touch(); });
    d.addEventListener('input', () => { it.desc = d.value; touch(); });
    const sl = { key: 'item', label: '商品照片', get: () => it.photo, set: (v) => { it.photo = v; } };
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif', hidden: true });
    const nm = h('div', { class: 'nm' });
    const up = h('button', { type: 'button', class: 'btn small' }, it.photo ? '更換照片' : '上傳照片');
    up.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => { const f = file.files[0]; file.value = ''; if (f) { await uploadPhoto(sl, f, nm, up); paintItems(); } });
    const del = it.photo ? iconBtn('移除照片', async () => { const old = it.photo.path; it.photo = null; touch(); await trashPhoto(old); paintItems(); }, 'danger') : null;
    box.append(h('div', { class: 'faq-item' },
      h('div', { class: 'row2' }, n, p),
      h('div', { style: 'height:8px' }), d,
      h('div', { class: 'photo', style: 'margin-top:8px' }, h('div', { class: 'th' }, it.photo ? h('img', { src: photoUrl(it.photo.path), alt: it.name || '商品照片' }) : '無照片'),
        h('div', { class: 'ctl' }, nm, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, up, del), file)),
      h('div', { style: 'text-align:right' },
        i > 0 ? iconBtn('上移', () => { const a = S.content.shop.items; [a[i - 1], a[i]] = [a[i], a[i - 1]]; paintItems(); touch(); }) : null, ' ',
        iconBtn('刪除這項', () => { if (confirm('確定刪除這個商品？')) { S.content.shop.items.splice(i, 1); paintItems(); touch(); } }, 'danger'))));
  });
  $('#itemAdd').disabled = S.content.shop.items.length >= L.LIMITS.shopItems; $('#itemCnt').textContent = S.content.shop.items.length + '/' + L.LIMITS.shopItems;
}
function paintReviews() {
  const L = S.lib, box = $('#reviewBox'); if (!box) return; box.replaceChildren();
  S.content.reviews.forEach((r, i) => {
    const n = h('input', { type: 'text', maxlength: String(L.LIMITS.reviewName), placeholder: '稱呼，例如：林小姐', 'aria-label': '評價者 ' + (i + 1) });
    const t = h('textarea', { maxlength: String(L.LIMITS.reviewText), rows: '3', placeholder: '評價內容', 'aria-label': '評價內容 ' + (i + 1) });
    n.value = r.name; t.value = r.text;
    n.addEventListener('input', () => { r.name = n.value; touch(); }); t.addEventListener('input', () => { r.text = t.value; touch(); });
    box.append(h('div', { class: 'faq-item' }, n, h('div', { style: 'height:8px' }), t, h('div', { style: 'text-align:right' }, iconBtn('刪除這則', () => { S.content.reviews.splice(i, 1); paintReviews(); touch(); }, 'danger'))));
  });
  $('#reviewAdd').disabled = S.content.reviews.length >= L.LIMITS.reviews; $('#reviewCnt').textContent = S.content.reviews.length + '/' + L.LIMITS.reviews;
}
function paintFaq() {
  const L = S.lib, box = $('#faqBox'); box.replaceChildren();
  S.content.faq.forEach((f, i) => {
    const q = h('input', { type: 'text', maxlength: '60', placeholder: '問題，例如：需要' + bookWord() + '嗎？', 'aria-label': '問題 ' + (i + 1) }), a = h('textarea', { maxlength: '300', rows: '3', placeholder: '回答（建議 30–300 字）', 'aria-label': '回答 ' + (i + 1) });
    const cnt = h('div', { class: 'msg mute', style: 'text-align:right' });
    q.value = f.q; a.value = f.a;
    const upd = () => { const n = [...a.value].length; cnt.textContent = n + '/300' + (n && n < 30 ? '（建議至少 30 字）' : ''); };
    q.addEventListener('input', () => { f.q = q.value; touch(); }); a.addEventListener('input', () => { f.a = a.value; upd(); touch(); }); upd();
    box.append(h('div', { class: 'faq-item' }, q, h('div', { style: 'height:8px' }), a, cnt, h('div', { style: 'text-align:right' }, iconBtn('刪除這題', () => { S.content.faq.splice(i, 1); paintFaq(); touch(); }, 'danger'))));
  });
  $('#faqAdd').disabled = S.content.faq.length >= L.LIMITS.faq; $('#faqCnt').textContent = S.content.faq.length + '/' + L.LIMITS.faq;
}

// ── 照片 ──
function paintPhotos() {
  const box = $('#photoBox'); box.replaceChildren();
  S.slots.forEach((sl, idx) => {
    const cur = sl.get();
    const canAdd = sl.key === 'hero' || idx - 1 <= S.content.photos.room.length;   // 店內照片依序補位
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif', hidden: true });
    const th = h('div', { class: 'th' }, cur ? h('img', { src: photoUrl(cur.path), alt: sl.label }) : '未上傳');
    const nm = h('div', { class: 'nm', id: 'pm-' + sl.key });
    const up = h('button', { type: 'button', class: 'btn small', disabled: !canAdd }, cur ? '更換照片' : '上傳照片');
    up.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => { const f = file.files[0]; file.value = ''; if (f) await uploadPhoto(sl, f, nm, up); });
    const del = cur ? iconBtn('移除', async () => { const old = cur.path; sl.set(null); touch(); await trashPhoto(old); paintPhotos(); }, 'danger') : null;
    box.append(h('div', { class: 'photo' }, th, h('div', { class: 'ctl' }, h('strong', { text: sl.label }), nm, h('div', { style: 'display:flex;gap:8px' }, up, del), file)));
  });
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
async function compress(file) {
  if (file.size > MAX_ORIGINAL) throw new Error('照片超過 5MB，請先縮小再上傳');
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('只能上傳圖片檔');
  const bmp = await toBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), hh = Math.max(1, Math.round(bmp.height * scale));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, hh); if (bmp.close) bmp.close();
  let blob = await new Promise((r) => cv.toBlob(r, 'image/webp', 0.82));
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85)); ext = 'jpg'; }
  if (!blob) throw new Error('照片轉檔失敗');
  return { blob, ext, w, h: hh };
}
async function uploadPhoto(sl, file, nm, btn) {
  btn.disabled = true; nm.className = 'nm'; nm.textContent = '處理中…';
  try {
    const { blob, ext, w, h: hh } = await compress(file);
    const path = S.site.id + '/' + (['hero', 'item', 'block', 'share'].includes(sl.key) ? sl.key : 'room') + '-' + Date.now().toString(36) + '.' + ext;
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
function goField(field) {
  const id = FIELD_CARD[field.split('.')[0]]; if (!id) return;
  openCard(id, () => (field === 'photos.hero' ? null : $('#' + id).querySelector('input:not([disabled]),textarea')));
}
function refreshTodo() {
  const box = $('#todo'); if (!box) return;
  const v = validate();
  const bm = $('#bookMsg'); if (bm) { const e = v.errors.find((x) => x.field.startsWith('booking')); bm.textContent = e ? e.msg : ''; }
  const tips = $('#tips');
  const sg = S.lib.suggestions(S.lib.normalizeContent(S.content), S.lib.normalizeSections(S.sections), S.site.template);
  tips.hidden = !sg.length;
  if (sg.length) tips.replaceChildren(h('summary', { style: 'cursor:pointer;font-weight:700', text: '讓網站更容易被搜尋與 AI 找到（建議，共 ' + sg.length + ' 項）' }),
    h('ul', { style: 'margin:8px 0 0;padding-left:20px;font-size:14px;color:var(--muted)' }, sg.map((e) => h('li', {}, h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); goField(e.field); }, text: e.msg })))));
  const need = v.errors.filter((e) => ['name', 'address', 'hours', 'photos.hero'].includes(e.field) || e.field === 'slug' || /^(booking|social)/.test(e.field));
  box.hidden = need.length === 0;
  if (need.length) box.replaceChildren(h('strong', { text: '發佈前還需要完成：' }), h('ul', {}, need.map((e) => h('li', {}, h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); goField(e.field); }, text: e.msg })))));
}

// ── 發佈 ──
async function publish() {
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
        const t = await YC.client.rpc('rental_accept_terms', { p_site_id: S.site.id, p_version: TERMS_VERSION });
        if (t.error) throw new Error('無法記錄條款同意，請稍後再試');
        S.site.terms_accepted_at = t.data || new Date().toISOString(); S.site.terms_version = TERMS_VERSION;
      }
      const r = await YC.client.functions.invoke('publish-site', { body: { site_id: S.site.id } });
      if (r.error) {
        let body = null; try { body = await r.error.context.json(); } catch (e) { /* ignore */ }
        if (body && body.errors) { modal('還有項目沒完成', [h('ul', {}, body.errors.map((e) => h('li', { text: e.msg })))], [h('button', { class: 'btn primary', onclick: closeModal }, '知道了')]); return; }
        throw new Error((body && body.message) || '發佈失敗，請稍後再試');
      }
      S.fresh.clear();
      toast(r.data.message || '已送出', 5000);
      await refreshStatus(); paintSlug();
    } catch (e) { toast(String(e.message || e), 5000); }
    finally { S.publishing = false; btn.disabled = false; btn.textContent = '發佈'; }
  };
  if (first) {
    let priceBox = null;
    const PM = S.plan;
    if (PM && PM.planFor) {
      const P = PM.planFor(S.layout);
      const pages = isMulti() ? S.pageList.filter((p) => p.key !== 'home').map((p) => p.label).join('、') : '';
      const box = (...kids) => h('div', { style: 'margin:12px 0 0;padding:12px 14px;border:1px solid var(--line,#3a342c);border-radius:10px;font-size:14px;line-height:1.7' }, ...kids);
      const pay = h('div', { style: 'color:var(--muted,#9a8f80)', text: '送出後請到會員專區付款，付款確認後網站就會開通。' });
      if (PM.hasPrice(P)) {
        const q = PM.quote(12, S.layout, S.site.tier);
        priceBox = box(h('div', { style: 'font-weight:700' }, '租用方案：' + P.name),
          h('div', {}, P.listMonthly && S.site.tier !== 'pro' ? h('span', { style: PM.STRIKE_STYLE, text: PM.money(P.listMonthly) }) : null, ' ', h('b', { text: PM.money(q.monthly || P.monthly) + '／月' }), S.site.tier === 'pro' ? '（含進階功能）' : P.listMonthly ? '（特價）' : ''),
          h('div', { style: 'color:var(--muted,#9a8f80)', text: '一次付 12 個月只收 ' + P.yearPaidMonths + ' 個月：' + PM.money(q.amount) + '。' + (isMulti() ? '包含' + pages + '等頁面。' : sectionLabel('menu') + '、' + sectionLabel('interior') + '、常見問題、最新消息都包含，不另外加價。') }),
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
function needTerms() { return !S.site.terms_accepted_at || (S.site.terms_version || '') !== TERMS_VERSION; }

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
    return h('button', { type: 'button', class: 'mrow', role: 'listitem', onclick: () => openCard(c.id) },
      h('span', { class: 'mrow-t' }, h('strong', { text: title }), sub ? h('small', { text: sub.textContent.trim() }) : ''),
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
    if (t === 'view' && !setTab.tipped) { setTab.tipped = true; toast('點預覽上的區塊，就能跳到那裡的設定', 3200); }
  }
}
// 手機版的「更多」：全螢幕預覽、切換網站、刪除、教學、回會員專區
function openMoreSheet() {
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
      h('button', { type: 'button', class: 'btn', onclick: async () => { closeModal(); if (S.dirty || S.saving) await save(); S.dirty = false; YC.switchAccount().catch((e) => toast('無法切換帳號：' + (e.message || e))); } }, '切換 Google 帳號')),
    h('div', { class: 'field', style: 'margin-top:14px' }, h('span', { text: '切換網站' }), sw)],
    [h('button', { type: 'button', class: 'btn', onclick: closeModal }, '關閉')]);
  m.classList.add('sheet');
}

function bindChrome() {
  if (bindChrome.done) return; bindChrome.done = true;
  $('#btnPublish').addEventListener('click', publish);
  $('#btnFull').addEventListener('click', openFullPreview);
  const stage = $('#stage'), d = $('#devDesk'), m = $('#devMob');
  d.addEventListener('click', () => { stage.classList.remove('mob'); d.setAttribute('aria-pressed', 'true'); m.setAttribute('aria-pressed', 'false'); });
  m.addEventListener('click', () => { stage.classList.add('mob'); m.setAttribute('aria-pressed', 'true'); d.setAttribute('aria-pressed', 'false'); });
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
  // 手機：打字時（鍵盤打開）先收起下方的工具列，避免擋住正在輸入的欄位
  const app = $('.app');
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

YC.onChange((ev) => { if (ev === 'SIGNED_OUT') location.reload(); if (!booted) boot(); });
YC.init();
