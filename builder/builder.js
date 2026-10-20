/* YC AXIOM 網站編輯器：左邊填內容、右邊即時預覽。
   預覽用的版型函式與「正式建置」是同一份程式（yc-axiom-sites 的 templates/shared/*），所以所見即所得。 */
const YC = window.YC;
const $ = (s, r) => (r || document).querySelector(s);
const DEFAULT_TPL_BASE = 'https://chi1017.github.io/yc-axiom-sites/';
const SAVE_DELAY = 2000, RENDER_DELAY = 150;
const TERMS_VERSION = '2026-10-v1';   // 條款有實質修改時改這個版本代號（會記錄客戶同意的是哪一版）
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
  lib: null, site: null, content: null, palette: 'forest', sections: null, slug: '', slugState: { ok: true, msg: '' },
  events: [], dirty: false, saving: false, saveErr: false, lastSaved: null, fresh: new Set(), timers: {}, publishing: false
};

// ── 載入共用版型模組 ──
async function loadLib() {
  const base = tplBase();
  const [site, content, valid, slug, pal, hours] = await Promise.all([
    import(base + 'templates/shared/site.js'), import(base + 'templates/shared/content.js'), import(base + 'templates/shared/validate.js'),
    import(base + 'templates/shared/slug.js'), import(base + 'templates/shared/palettes.js'), import(base + 'templates/shared/hours.js')
  ]);
  S.lib = { buildSite: site.buildSite, ...content, validateForPublish: valid.validateForPublish, suggestions: valid.suggestions, slugError: slug.slugError, PALETTES: pal.PALETTES, PALETTE_IDS: pal.PALETTE_IDS, getPalette: pal.getPalette, isCustomPalette: pal.isCustomPalette, customPaletteId: pal.customPaletteId, parseCustomPalette: pal.parseCustomPalette, hours };
}

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
    const r = await YC.client.from('rental_sites').select('*').eq('member_id', uid).order('created_at').limit(1);
    if (r.error) throw r.error;
    if (!r.data.length) return showCreate();
    mount(r.data[0]);
  } catch (e) {
    booted = false;
    console.error(e);
    gate([h('h1', { text: '載入失敗' }), h('p', { text: String((e && e.message) || e) }), h('button', { class: 'btn', onclick: () => location.reload() }, '重新整理')]);
  }
}

// ── 第一次：建立網站 ──
function showCreate() {
  const L = S.lib;
  const slug = h('input', { type: 'text', id: 'cSlug', maxlength: '30', autocomplete: 'off', spellcheck: 'false', placeholder: 'my-cafe' });
  const name = h('input', { type: 'text', id: 'cName', maxlength: '40', placeholder: '例如：午後日光咖啡' });
  const msg = h('div', { class: 'msg mute', text: '3–30 個字，只能用小寫英文、數字與連字號（-）。' });
  const url = h('div', { class: 'msg mute' });
  const btn = h('button', { class: 'btn primary', disabled: true }, '建立我的網站');
  let ok = false, t;
  const check = () => {
    clearTimeout(t); ok = false; btn.disabled = true;
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
      btn.disabled = !ok;
    }, 400);
  };
  slug.addEventListener('input', check);
  btn.addEventListener('click', async () => {
    if (!ok) return; btn.disabled = true; btn.textContent = '建立中…';
    const c = L.emptyContent(); c.name = name.value.trim();
    const r = await YC.client.from('rental_sites').insert({ member_id: YC.session.user.id, slug: slug.value, template: 'cafe', palette: 'forest', sections: L.defaultSections(), content: c }).select('*').single();
    if (r.error) { msg.className = 'msg bad'; msg.textContent = '建立失敗：' + (/duplicate|unique/i.test(r.error.message) ? '這個名稱剛被使用了，請換一個' : r.error.message); btn.textContent = '建立我的網站'; btn.disabled = false; return; }
    mount(r.data);
  });
  gate([h('h1', { text: '建立你的網站' }), h('p', { text: '先決定網站的網址代稱與店名，之後都可以在編輯器裡修改內容（網址代稱在第一次發佈後就不能再改）。' }),
    h('label', { class: 'field', for: 'cSlug' }, h('span', { text: '網址代稱' }), slug), msg, url,
    h('label', { class: 'field', for: 'cName', style: 'margin-top:14px' }, h('span', { text: '店名（之後可修改）' }), name), btn]);
}

// ── 編輯器 ──
function mount(site) {
  const L = S.lib;
  S.site = site; S.slug = site.slug;
  S.content = L.normalizeContent(site.content);
  S.palette = L.normalizePalette(site.palette);
  S.sections = L.normalizeSections(site.sections);
  $('#gate').hidden = true; $('#app').hidden = false;
  buildPanel();
  $('#barName').textContent = S.content.name || '我的網站';
  setSaveText();
  renderPreview();
  refreshStatus();
  bindChrome();
}

let frameScroll = 0;
function renderPreview() {
  clearTimeout(S.timers.render);
  S.timers.render = setTimeout(() => {
    const L = S.lib;
    let html;
    try {
      html = L.buildSite({ template: S.site.template, content: S.content, palette: S.palette, sections: S.sections,
        siteUrl: 'https://' + (S.slug || 'your-shop') + '.pages.dev/', preview: true, imageSrc: (role, p) => photoUrl(p.path) }).html;
    } catch (e) { console.error(e); return; }
    const f = $('#frame');
    try { frameScroll = f.contentWindow.scrollY || 0; } catch (e) { /* ignore */ }
    f.onload = () => {
      try {
        const d = f.contentDocument;
        f.contentWindow.scrollTo(0, frameScroll);
        d.addEventListener('click', (ev) => {
          const a = ev.target.closest && ev.target.closest('a'); if (!a) return;
          const href = a.getAttribute('href') || '';
          if (href.startsWith('#')) { ev.preventDefault(); const t = href.length > 1 ? d.querySelector(href) : null; if (t) t.scrollIntoView({ behavior: 'smooth' }); else f.contentWindow.scrollTo({ top: 0, behavior: 'smooth' }); }
        });
      } catch (e) { /* ignore */ }
    };
    f.srcdoc = html;
  }, RENDER_DELAY);
}
function scrollPreviewTo(anchor) {
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
  const snapshot = clone({ content: S.content, palette: S.palette, sections: S.sections });
  const payload = { content: snapshot.content, palette: snapshot.palette, sections: snapshot.sections };
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
  S.dirty = JSON.stringify({ content: S.content, palette: S.palette, sections: S.sections }) !== JSON.stringify(snapshot);
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
    YC.client.from('rental_sites').select('status,public_url,paid_until,live_version_id,first_published_at,last_published_at,cf_project_name,terms_accepted_at').eq('id', S.site.id).single(),
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
const FIELD_CARD = { social: 'c-info', slug: 'c-basic', name: 'c-info', tagline: 'c-info', intro: 'c-info', address: 'c-info', phone: 'c-info', hours: 'c-hours', booking: 'c-booking', photos: 'c-photos', menu: 'c-menu', faq: 'c-faq', news: 'c-news' };
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
  const toggles = L.SECTION_KEYS.map((k) => {
    const cb = h('input', { type: 'checkbox' }); cb.checked = !!S.sections[k];
    cb.addEventListener('change', () => { S.sections[k] = cb.checked; touch(); if (cb.checked) scrollPreviewTo(k); });
    return h('label', {}, cb, L.SECTION_LABELS[k]);
  });
  P.append(card('c-basic', 'top', '網址與外觀', '選配色、決定要顯示哪些區塊。版型與字體由 YC AXIOM 統一設計。',
    h('label', { class: 'field', for: 'f-slug' }, h('span', {}, h('em', { style: 'font-style:normal', text: '網址代稱' }), h('b', { id: 'slugLock', text: '' })), slugIn),
    h('div', { id: 'slugMsg', class: 'msg mute' }), h('div', { id: 'slugUrl', class: 'msg mute', style: 'margin-bottom:12px' }),
    h('div', { class: 'field' }, h('span', { text: '配色' }), h('div', { class: 'palettes' }, allPalBtns), customRow),
    h('div', { class: 'field toggles' }, h('span', { text: '要顯示的區塊' }), toggles)));

  P.append(card('c-info', 'about', '店家資訊', null,
    field('店名', 'name', { max: 40, ph: '例如：午後日光咖啡' }),
    field('一句話介紹', 'tagline', { max: 60, ph: '例如：手沖單品與自烤甜點' }),
    field('店家介紹', 'intro', { area: true, max: 600, rows: 6, ph: '店的故事、特色、座位與使用方式…（可分段）' }),
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
    const sync = () => { o.disabled = c.disabled = cl.checked; };
    o.value = S.content.hours[d].open; c.value = S.content.hours[d].close; cl.checked = S.content.hours[d].closed; sync();
    o.addEventListener('input', () => { S.content.hours[d].open = o.value; touch(); });
    c.addEventListener('input', () => { S.content.hours[d].close = c.value; touch(); });
    cl.addEventListener('change', () => { S.content.hours[d].closed = cl.checked; if (cl.checked) { S.content.hours[d].open = ''; S.content.hours[d].close = ''; o.value = c.value = ''; } sync(); touch(); });
    return { d, o, c, cl, el: h('div', { class: 'hours-row' }, h('strong', { text: DAYL[d] }), o, c, h('label', { class: 'closed' }, cl, '公休')) };
  });
  const copyBtn = h('button', { type: 'button', class: 'btn small' }, '把週一的時間套用到全部');
  copyBtn.addEventListener('click', () => {
    const src = S.content.hours.mon;
    rows.forEach((r) => { if (r.d === 'mon') return; Object.assign(S.content.hours[r.d], { open: src.open, close: src.close, closed: src.closed }); r.o.value = src.open; r.c.value = src.close; r.cl.checked = src.closed; r.o.disabled = r.c.disabled = src.closed; });
    touch();
  });
  P.append(card('c-hours', 'visit', '營業時間', '每天填開始與結束時間；沒營業的那天勾「公休」。',
    rows.map((r) => r.el), h('div', { style: 'margin:4px 0 12px' }, copyBtn), field('備註（選填）', 'hoursNote', { max: 80, ph: '例如：國定假日營業時間以粉絲專頁公告為準' })));

  P.append(card('c-booking', 'top', '訂位按鈕', '填了才會出現在網站首頁。連結必須是 https:// 開頭（例如你的訂位系統或 LINE 預約頁）。',
    field('按鈕文字', 'booking.label', { max: 12, ph: '例如：線上訂位' }), field('連結', 'booking.url', { max: 500, type: 'url', ph: 'https://' }), h('div', { id: 'bookMsg', class: 'msg bad' })));

  // 照片
  const slots = [{ key: 'hero', label: '主視覺照片（必填）', get: () => S.content.photos.hero, set: (v) => { S.content.photos.hero = v; } }];
  for (let i = 0; i < 3; i++) slots.push({ key: 'room' + i, label: '店內照片 ' + (i + 1) + '（選填）', get: () => S.content.photos.room[i] || null,
    set: (v) => { const r = S.content.photos.room; if (v) { r[i] = v; } else { r.splice(i, 1); } } });
  const photoBox = h('div', { id: 'photoBox' });
  P.append(card('c-photos', 'top', '照片', 'JPG、PNG、WebP、HEIC 皆可，單張原檔不超過 5MB。系統會自動縮小並轉成適合網頁的格式。', photoBox));
  S.slots = slots; paintPhotos();

  // 清單
  P.append(card('c-menu', 'menu', '菜單', '最多 12 項。價格只填數字。', h('div', { id: 'menuBox' }), h('button', { type: 'button', class: 'btn small', id: 'menuAdd' }, '＋ 新增品項'), h('span', { id: 'menuCnt', class: 'msg mute', style: 'margin-left:10px' })));
  P.append(card('c-news', 'news', '最新消息', '最多 6 則。', h('div', { id: 'newsBox' }), h('button', { type: 'button', class: 'btn small', id: 'newsAdd' }, '＋ 新增消息'), h('span', { id: 'newsCnt', class: 'msg mute', style: 'margin-left:10px' })));
  P.append(card('c-faq', 'faq', '常見問題', '最多 8 題。每題的回答建議 30–300 字，搜尋引擎與 AI 最愛引用這種問與答。', h('div', { id: 'faqBox' }), h('button', { type: 'button', class: 'btn small', id: 'faqAdd' }, '＋ 新增問題'), h('span', { id: 'faqCnt', class: 'msg mute', style: 'margin-left:10px' })));
  $('#menuAdd').onclick = () => { if (S.content.menu.length < L.LIMITS.menu) { S.content.menu.push({ name: '', price: null }); paintMenu(); touch(); const i = $('#menuBox input'); } };
  $('#newsAdd').onclick = () => { if (S.content.news.length < L.LIMITS.news) { S.content.news.push({ date: new Date().toISOString().slice(0, 10), title: '' }); paintNews(); touch(); } };
  $('#faqAdd').onclick = () => { if (S.content.faq.length < L.LIMITS.faq) { S.content.faq.push({ q: '', a: '' }); paintFaq(); touch(); } };
  paintMenu(); paintNews(); paintFaq(); paintSlug(); paintLinks(); refreshTodo();
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
    const n = h('input', { type: 'text', maxlength: '40', placeholder: '品名', 'aria-label': '品名 ' + (i + 1) }), p = h('input', { type: 'number', min: '0', max: '99999', step: '1', inputmode: 'numeric', placeholder: '價格', 'aria-label': '價格 ' + (i + 1) });
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
function paintFaq() {
  const L = S.lib, box = $('#faqBox'); box.replaceChildren();
  S.content.faq.forEach((f, i) => {
    const q = h('input', { type: 'text', maxlength: '60', placeholder: '問題，例如：需要訂位嗎？', 'aria-label': '問題 ' + (i + 1) }), a = h('textarea', { maxlength: '300', rows: '3', placeholder: '回答（建議 30–300 字）', 'aria-label': '回答 ' + (i + 1) });
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
  const r = L.validateForPublish(L.normalizeContent(S.content), L.normalizeSections(S.sections), S.slug, S.content);
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
  const sg = S.lib.suggestions(S.lib.normalizeContent(S.content), S.lib.normalizeSections(S.sections));
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
      if (first && !S.site.terms_accepted_at) {
        const t = await YC.client.rpc('rental_accept_terms', { p_site_id: S.site.id, p_version: TERMS_VERSION });
        if (t.error) throw new Error('無法記錄條款同意，請稍後再試');
        S.site.terms_accepted_at = t.data || new Date().toISOString();
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
    const needTerms = !S.site.terms_accepted_at;
    const chk = h('input', { type: 'checkbox', id: 'termsOk' });
    const sendBtn = h('button', { class: 'btn primary', id: 'termsGo', onclick: go }, '送出申請');
    if (needTerms) sendBtn.disabled = true;
    chk.addEventListener('change', () => { sendBtn.disabled = !chk.checked; });
    modal('送出上線申請？', [h('p', { text: '送出後，網址代稱「' + S.slug + '」就不能再修改。' }), h('p', { text: '我們會確認後為你開通網站，開通後會以 Email 通知你。在那之前你仍可以繼續編輯。' }),
      needTerms && h('label', { class: 'terms-ok', style: 'display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;font-size:14px;line-height:1.6' }, chk,
        h('span', {}, '我已閱讀並同意', h('a', { href: YC.url('terms/rental/'), target: '_blank', rel: 'noopener' }, '《網站租用條款》')))],
      [h('button', { class: 'btn', onclick: closeModal }, '再檢查一下'), sendBtn]);
  } else if (st === 'pending') {
    modal('更新送審內容？', [h('p', { text: '你的網站還在等待開通。更新後，開通時會使用最新的內容。' })], [h('button', { class: 'btn', onclick: closeModal }, '取消'), h('button', { class: 'btn primary', onclick: go }, '更新')]);
  } else {
    modal('發佈更新？', [h('p', { text: '目前編輯的內容會更新到正式網站，約 1–2 分鐘後生效。' })], [h('button', { class: 'btn', onclick: closeModal }, '取消'), h('button', { class: 'btn primary', onclick: go }, '發佈')]);
  }
}

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
