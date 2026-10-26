/* YC AXIOM 網站編輯器：左邊填內容、右邊即時預覽。
   預覽用的版型函式與「正式建置」是同一份程式（yc-axiom-sites 的 templates/shared/*），所以所見即所得。 */
const YC = window.YC;
const $ = (s, r) => (r || document).querySelector(s);
const DEFAULT_TPL_BASE = 'https://chi1017.github.io/yc-axiom-sites/';
const SAVE_DELAY = 2000, RENDER_DELAY = 150;
const TERMS_VERSION = '2026-10-v3';   // 條款有實質修改時改這個版本代號（會記錄客戶同意的是哪一版）
const MAX_ORIGINAL = 5 * 1024 * 1024, MAX_EDGE = 1600;

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
  events: [], dirty: false, saving: false, saveErr: false, lastSaved: null, fresh: new Set(), timers: {}, publishing: false
};

// ── 載入共用版型模組 ──
async function loadLib() {
  const base = tplBase();
  const [site, content, valid, slug, pal, hours, pages, ind] = await Promise.all([
    import(base + 'templates/shared/site.js'), import(base + 'templates/shared/content.js'), import(base + 'templates/shared/validate.js'),
    import(base + 'templates/shared/slug.js'), import(base + 'templates/shared/palettes.js'), import(base + 'templates/shared/hours.js'),
    import(base + 'templates/shared/pages.js'), import(base + 'templates/shared/industries.js')
  ]);
  S.lib = { buildSite: site.buildSite, ...content, validateForPublish: valid.validateForPublish, suggestions: valid.suggestions, slugError: slug.slugError, PALETTES: pal.PALETTES, PALETTE_IDS: pal.PALETTE_IDS, getPalette: pal.getPalette, isCustomPalette: pal.isCustomPalette, customPaletteId: pal.customPaletteId, parseCustomPalette: pal.parseCustomPalette, hours,
    pagesFor: pages.pagesFor, normalizeLayout: pages.normalizeLayout, normalizePages: pages.normalizePages, defaultPages: pages.defaultPages, pagesFromSections: pages.pagesFromSections, LAYOUT_LABELS: pages.LAYOUT_LABELS,
    INDUSTRIES: ind.INDUSTRIES, INDUSTRY_GROUPS: ind.INDUSTRY_GROUPS, getIndustry: ind.getIndustry };
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
    const r = await YC.client.from('rental_sites').select('*').eq('member_id', uid).order('created_at');
    if (r.error) throw r.error;
    S.mySites = r.data;
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
function paintSiteSwitch() {
  const box = $('#siteSwitch'); if (!box) return;
  const list = S.mySites || [];
  const sel = h('select', { class: 'sel', 'aria-label': '切換網站' },
    list.map((x) => h('option', { value: x.id, text: ((x.content && x.content.name) || x.slug) + '（' + x.slug + '）' })),
    h('option', { value: '__new', text: '＋ 建立新網站' }));
  sel.value = S.site.id;
  sel.addEventListener('change', async () => {
    const v = sel.value; sel.disabled = true;
    if (S.dirty || S.saving) await save();
    S.dirty = false;
    location.href = location.pathname + (v === '__new' ? '?new=1' : '?site=' + encodeURIComponent(v));
  });
  box.replaceChildren(sel);
}

function mount(site) {
  const L = S.lib;
  S.site = site; S.slug = site.slug;
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
  $('#barName').textContent = S.content.name || '我的網站';
  setSaveText();
  renderPreview();
  refreshStatus();
  bindChrome();
}

let frameScroll = 0, pendingAnchor = null;
function renderPreview(now) {
  clearTimeout(S.timers.render);
  S.timers.render = setTimeout(() => {
    const L = S.lib;
    let r;
    try {
      r = L.buildSite({ template: S.site.template, content: S.content, palette: S.palette, sections: S.sections, layout: S.layout, pages: S.pages, page: S.page,
        siteUrl: 'https://' + (S.slug || 'your-shop') + '.pages.dev/', preview: true, imageSrc: (role, p) => photoUrl(p.path) });
    } catch (e) { console.error(e); return; }
    S.pageList = r.pages || [];
    if (!S.pageList.some((p) => p.key === S.page)) S.page = 'home';
    paintPageTabs();
    const f = $('#frame');
    if (pendingAnchor === null) { try { frameScroll = f.contentWindow.scrollY || 0; } catch (e) { /* ignore */ } }
    f.onload = () => {
      try {
        const d = f.contentDocument;
        const a = pendingAnchor; pendingAnchor = null;
        const t = a && d.getElementById(a);
        if (t) t.scrollIntoView({ block: 'start' }); else f.contentWindow.scrollTo(0, a === null ? frameScroll : 0);
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
  try { const d = $('#frame').contentDocument; const t = d && d.getElementById(anchor); if (t) t.scrollIntoView({ block: 'start' }); } catch (e) { /* ignore */ }
}

// ── 自動儲存 ──
function touch() {
  S.dirty = true; S.saveErr = false; setSaveText();
  $('#barName').textContent = S.content.name || '我的網站';
  renderPreview(); refreshTodo();
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
    YC.client.from('rental_sites').select('status,public_url,paid_until,live_version_id,first_published_at,last_published_at,cf_project_name,terms_accepted_at,terms_version').eq('id', S.site.id).single(),
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
const FIELD_CARD = { template: 'c-basic', social: 'c-info', slug: 'c-basic', name: 'c-info', tagline: 'c-info', intro: 'c-info', address: 'c-info', phone: 'c-info', hours: 'c-hours', booking: 'c-booking', photos: 'c-photos', menu: 'c-menu', faq: 'c-faq', news: 'c-news', video: 'c-more', ga4: 'c-more', reviews: 'c-more', contactForm: 'c-more', showMap: 'c-more', bookingForm: 'c-more', posts: 'c-posts', en: 'c-en' };
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
  c.addEventListener('focusin', () => { if (anchor) scrollPreviewTo(anchor); });
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
  // 內建配色 + 自訂主色（自訂：選一個主色與淺色／深色底，其餘顏色自動搭配並保證文字清楚）
  const cur = L.parseCustomPalette(S.palette);
  const customIn = h('input', { type: 'color', id: 'f-custom', value: cur ? cur.accent.toLowerCase() : '#2f6f5c', 'aria-label': '自訂主色' });
  const modeSel = h('select', { id: 'f-custom-mode', 'aria-label': '自訂配色底色' },
    h('option', { value: 'l', text: '淺色底' }), h('option', { value: 'd', text: '深色底' }));
  modeSel.value = cur && cur.dark ? 'd' : 'l';
  const customSw = h('i', {});
  const customBtn = h('button', { type: 'button', class: 'pal pal-custom', 'data-id': 'custom', 'aria-pressed': String(!!cur) }, customSw, '自訂配色');
  const palBtns = L.PALETTE_IDS.map((id) => {
    const p = L.PALETTES[id];
    const b = h('button', { type: 'button', class: 'pal', 'data-id': id, 'aria-pressed': String(S.palette === id) },
      h('i', {}, [p.bg, p.surface, p.accent, p.text].map((c) => h('s', { style: 'background:' + c }))), p.label);
    b.addEventListener('click', () => { setPalette(id); });
    return b;
  });
  const allPalBtns = [...palBtns, customBtn];
  function paintCustomSwatch() {
    const p = L.getPalette(L.customPaletteId(customIn.value, modeSel.value === 'd'));
    customSw.replaceChildren(...[p.bg, p.surface, p.accent, p.text].map((c) => h('s', { style: 'background:' + c })));
  }
  function setPalette(id) {
    S.palette = id;
    allPalBtns.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.id === id || (x.dataset.id === 'custom' && L.isCustomPalette(id)))));
    touch();
  }
  function applyCustom() { paintCustomSwatch(); setPalette(L.customPaletteId(customIn.value, modeSel.value === 'd')); }
  customIn.addEventListener('input', applyCustom); modeSel.addEventListener('change', applyCustom);
  customBtn.addEventListener('click', applyCustom);
  paintCustomSwatch();
  const customRow = h('div', { class: 'custom-pal' }, h('span', { class: 'mute', text: '或自己挑主色：' }), customIn, modeSel,
    h('div', { class: 'msg mute', text: '只要選一個主色（例如店招的顏色），其餘顏色會自動搭配，文字一定看得清楚。' }));
  // 首頁樣式
  const sel = (path, opts, label) => {
    const id = 'f-' + path;
    const el = h('select', { id, class: 'sel' }, opts.map(([v, t]) => h('option', { value: v, text: t })));
    bindInput(el, path);
    return h('label', { class: 'field', for: id }, h('span', { text: label }), el);
  };
  const styleBox = h('div', { class: 'style-row' },
    sel('heroStyle', [['card', '標準：照片在文字旁'], ['full', '滿版大圖：照片鋪滿首頁上方']], '首頁主視覺'),
    sel('homeStyle', [['standard', '標準：區塊依序排列'], ['magazine', '雜誌風：大圖與圖文交錯']], '首頁排版'));
  P.append(card('c-basic', 'top', '網址與外觀', '選配色、版型與要顯示的內容。字體與排版細節由 YC AXIOM 統一設計。',
    industryField(),
    h('label', { class: 'field', for: 'f-slug' }, h('span', {}, h('em', { style: 'font-style:normal', text: '網址代稱' }), h('b', { id: 'slugLock', text: '' })), slugIn),
    h('div', { id: 'slugMsg', class: 'msg mute' }), h('div', { id: 'slugUrl', class: 'msg mute', style: 'margin-bottom:12px' }),
    h('div', { class: 'field' }, h('span', { text: '配色' }), h('div', { class: 'palettes' }, allPalBtns), customRow),
    styleBox,
    h('div', { id: 'layoutBox', class: 'field toggles' })));
  paintLayout();

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
    toggle('showMap', '顯示 Google 地圖', '在' + IND().visit.label + '顯示地圖（需要先填地址）。地圖要點了才會載入，不會拖慢網站。'),
    field('YouTube 影片網址（選填）', 'video', { max: 200, type: 'url', ph: 'https://www.youtube.com/watch?v=…', help: '放一支介紹影片。訪客點了才會載入播放器，不會拖慢網站。' }),
    h('div', { class: 'field' }, h('span', { text: '客人評價（選填，最多 6 則）' }), h('div', { class: 'msg mute', style: 'margin:0 0 8px', text: '請放真實的評價，可以摘自 Google 評論或客人留言；名字可以只寫稱呼（例如：林小姐）。' })),
    h('div', { id: 'reviewBox' }), h('button', { type: 'button', class: 'btn small', id: 'reviewAdd' }, '＋ 新增評價'), h('span', { id: 'reviewCnt', class: 'msg mute', style: 'margin-left:10px' }),
    h('div', { style: 'height:14px' }),
    field('Google Analytics 評估 ID（選填）', 'ga4', { max: 20, ph: 'G-XXXXXXXXXX', help: '網站已經內建瀏覽次數統計（在會員專區查看）。需要更詳細的分析才填；GA 會在訪客第一次操作或 6 秒後才載入。' })));
  // 文章：每篇一個網頁（posts/<代碼>/），代碼建立時產生、之後不變
  P.append(card('c-posts', 'posts', '文章', '最多 ' + L.LIMITS.posts + ' 篇。寫店裡的故事、新品、活動或常見問題的完整說明，每篇都會有自己的網頁，容易被搜尋與 AI 找到。',
    h('div', { id: 'postBox' }), h('button', { type: 'button', class: 'btn small', id: 'postAdd' }, '＋ 新增文章'), h('span', { id: 'postCnt', class: 'msg mute', style: 'margin-left:10px' })));
  $('#postAdd').onclick = () => {
    if (S.content.posts.length >= L.LIMITS.posts) return;
    const d = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    S.content.posts.unshift({ id: d + '-' + Math.random().toString(36).slice(2, 6), title: '', date: d, body: '' });
    paintPosts(); touch();
  };
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
  paintMenu(); paintNews(); paintFaq(); paintReviews(); paintPosts(); paintSlug(); paintLinks(); refreshTodo();
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
    const up = multiOpen() ? h('div', { class: 'upgrade' },
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
function askUpgrade() {
  const L = S.lib;
  const pages = L.pagesFromSections(S.sections);
  const names = L.pagesFor(S.site.template).filter((p) => pages[p.key]).map((p) => p.label).join('、');
  const live = ['live', 'overdue', 'pending'].includes(S.site.status);
  const goBtn = h('button', { class: 'btn primary' }, '確定升級');
  goBtn.addEventListener('click', async () => {
    goBtn.disabled = true; goBtn.textContent = '升級中…';
    if (!(await save())) { goBtn.disabled = false; goBtn.textContent = '確定升級'; toast('目前的內容還沒儲存成功，請稍後再試', 5000); return; }
    const r = await YC.client.from('rental_sites').update({ layout: 'multi', pages }).eq('id', S.site.id).select('layout,pages,upgraded_at').single();
    if (r.error) { goBtn.disabled = false; goBtn.textContent = '確定升級'; toast('升級失敗：' + r.error.message, 6000); return; }
    Object.assign(S.site, r.data);
    S.layout = 'multi'; S.pages = L.normalizePages(r.data.pages); S.page = 'home';
    closeModal(); paintLayout(); renderPreview(true); refreshTodo();
    toast('已升級成多頁版' + (live ? '，按「發佈」後正式網站才會更新' : ''), 5000);
  });
  modal('升級成多頁版？', [
    h('p', { text: '升級後，網站會分成首頁和幾個獨立頁面，預設開啟：' + names + '。之後可以自己勾選要哪些頁面。' }),
    h('p', {}, h('strong', { text: '升級後不能改回一頁版。' }), '你填的內容都會保留，不必重填。'),
    h('p', { class: 'msg mute', text: (priceText('multi') ? '多頁版' + priceText('multi') + '。升級不另收費，目前這一期已付的費用不變，下一期起改依多頁版計費。' : '多頁版的費用確認中，若與一頁版不同，會在下一期續約前與你確認。') + (live ? '升級後要按「發佈」，正式網站才會變成多頁。' : '') })],
  [h('button', { class: 'btn', onclick: closeModal }, '先不要'), goBtn]);
}

function paintSlug() {
  const m = $('#slugMsg'); if (!m) return;
  const locked = S.site.status !== 'draft';
  const inp = $('#f-slug'); inp.disabled = locked;
  $('#slugLock').textContent = locked ? '已鎖定（第一次發佈後不能修改）' : '';
  if (locked) { m.textContent = ''; }
  else { m.className = 'msg ' + (S.slugState.pending ? 'mute' : (S.slugState.msg ? (S.slugState.ok ? 'ok' : 'bad') : 'mute')); m.textContent = S.slugState.msg || ''; }
  inp.classList.toggle('bad', !locked && !S.slugState.ok && !S.slugState.pending);
  $('#slugUrl').textContent = (S.site.public_url ? '網站網址：' + S.site.public_url.replace(/^https:\/\//, '').replace(/\/$/, '') : '預計網址：' + (S.slug || '…') + '.pages.dev（實際網址以上線後為準）');
}
function paintLinks() {
  const b = $('#links'); if (!b) return;
  const live = S.site.public_url && ['live', 'overdue'].includes(S.site.status);
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
    const path = S.site.id + '/' + (sl.key === 'hero' ? 'hero' : 'room') + '-' + Date.now().toString(36) + '.' + ext;
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
  const id = FIELD_CARD[field.split('.')[0]]; const c = id && $('#' + id); if (!c) return;
  closeModal(); $('.app').dataset.tab = 'edit';
  c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const i = c.querySelector('input:not([disabled]),textarea'); if (i && field !== 'photos.hero') setTimeout(() => i.focus({ preventScroll: true }), 300);
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
      const pay = h('div', { style: 'color:var(--muted,#9a8f80)', text: '送出後以銀行轉帳付款，我們確認收款後才會開通網站。' });
      if (PM.hasPrice(P)) {
        const q = PM.quote(12, S.layout);
        priceBox = box(h('div', { style: 'font-weight:700' }, '租用方案：' + P.name),
          h('div', {}, P.listMonthly ? h('span', { style: PM.STRIKE_STYLE, text: PM.money(P.listMonthly) }) : null, ' ', h('b', { text: PM.money(P.monthly) + '／月' }), P.listMonthly ? '（特價）' : ''),
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

function bindChrome() {
  if (bindChrome.done) return; bindChrome.done = true;
  $('#btnPublish').addEventListener('click', publish);
  const stage = $('#stage'), d = $('#devDesk'), m = $('#devMob');
  d.addEventListener('click', () => { stage.classList.remove('mob'); d.setAttribute('aria-pressed', 'true'); m.setAttribute('aria-pressed', 'false'); });
  m.addEventListener('click', () => { stage.classList.add('mob'); m.setAttribute('aria-pressed', 'true'); d.setAttribute('aria-pressed', 'false'); });
  const app = $('.app'); app.dataset.tab = 'edit';
  const te = $('#tabEdit'), tv = $('#tabView');
  te.addEventListener('click', () => { app.dataset.tab = 'edit'; te.setAttribute('aria-selected', 'true'); tv.setAttribute('aria-selected', 'false'); });
  tv.addEventListener('click', () => { app.dataset.tab = 'view'; tv.setAttribute('aria-selected', 'true'); te.setAttribute('aria-selected', 'false'); renderPreview(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

YC.onChange((ev) => { if (ev === 'SIGNED_OUT') location.reload(); if (!booted) boot(); });
YC.init();
