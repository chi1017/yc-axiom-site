/* 管理後台「價格與活動」分頁：方案價格、早鳥活動、頂部公告列、滑出卡片。
   儲存：資料庫函式 save_site_settings（資料庫層只允許管理員）；發布：Edge Function site-settings 觸發 GitHub Actions 重新建置官網。
   預覽：用建置時留下的 /admin/preview-src/ 範本，套用表單裡的設定，顯示公告列與卡片。 */
import { DEFAULTS, normalize, effective, tokens, render, promo, barHead, barBody, cardAllowed, taipeiDate, money, hidePriceText, hideContactHtml } from '../tools/site-settings.mjs?v=2026-11-10b';

const YC = window.YC;
const box = document.getElementById('adm-prices');
const tabs = document.getElementById('adm-tabs');
if (YC && box && tabs) init();

function init() {
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = { row: null, used: 0, hist: [], built: null, form: null, loaded: false, busy: false, msg: '', msgBad: false, publishPending: false, page: 'home', device: 'desktop', allowPast: false };
  const VARS = ['{早鳥價}', '{多頁早鳥價}', '{截止日}', '{一頁版價}', '{多頁版價}'];
  const PREVIEW_PATH = { home: '/', rental: '/rental/', pricing: '/pricing/' };

  // 台灣時間 <-> datetime-local
  const toLocal = (iso) => { const t = Date.parse(iso || ''); if (!Number.isFinite(t)) return ''; return new Date(t + 8 * 3600e3).toISOString().slice(0, 16); };
  const toIso = (v) => (v ? v + ':00+08:00' : null);
  const fmtDT = (iso) => { const t = Date.parse(iso || ''); if (!Number.isFinite(t)) return '—'; const d = new Date(t + 8 * 3600e3); return d.toISOString().slice(0, 16).replace('T', ' ').replace(/-/g, '/'); };

  const css = document.createElement('style');
  css.textContent = '#adm-prices[hidden]{display:none}.ps-wrap{display:grid;gap:18px;margin-top:16px}.ps-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:20px;align-items:start}' +
    '@media(max-width:1100px){.ps-grid{grid-template-columns:1fr}}.ps-sec{border:1px solid var(--border);border-radius:8px;padding:16px 18px;display:grid;gap:12px}.ps-sec h3{margin:0;font-size:16px;color:var(--text-bright)}' +
    '.ps-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.ps-sec label{display:grid;gap:4px;font-size:13px;color:var(--text-dim)}.ps-sec label.ps-chk{display:flex;gap:8px;align-items:center;color:var(--text);font-size:14px}' +
    '.ps-sec input[type=text],.ps-sec input[type=number],.ps-sec input[type=datetime-local],.ps-sec textarea,.ps-note-in{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;font:14px var(--f-ui);padding:8px 10px;min-height:40px;width:100%;box-sizing:border-box}' +
    '.ps-sec input[aria-invalid=true]{border-color:#f87171}.ps-sec input[type=checkbox]{width:20px;height:20px}.ps-hint{font-size:12.5px;color:var(--text-dim);margin:0;line-height:1.6}.ps-err{color:#f87171;font-size:13px;margin:0}' +
    '.ps-status{display:flex;flex-wrap:wrap;gap:10px 22px;border:1px solid var(--border);border-radius:8px;padding:14px 18px;font-size:14px}.ps-status b{color:var(--text-bright)}' +
    '.ps-bar{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 0;background:var(--bg,#111);border-top:1px solid var(--border)}.ps-msg{font-size:14px}.ps-msg.bad{color:#f87171}.ps-msg.ok{color:#34d399}' +
    '.ps-pv{position:sticky;top:12px;display:grid;gap:10px}.ps-pv .ps-tools{display:flex;flex-wrap:wrap;gap:8px}.ps-pv button[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}' +
    '.ps-fwrap{border:1px solid var(--border);border-radius:6px;overflow:hidden;background:#111;position:relative}.ps-frame{border:0;background:#111;display:block;transform-origin:0 0}' +
    '.ps-hist{list-style:none;margin:0;padding:0;display:grid;gap:6px}.ps-hist li{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:4px;padding:8px 12px;font-size:13.5px}';
  document.head.appendChild(css);

  // ── 讀取 ──
  async function load() {
    const c = YC.client;
    const [r, h, u] = await Promise.all([
      c.from('site_settings').select('data,version,updated_at,updated_by,published_at,published_by,state').eq('id', 1).maybeSingle(),
      c.from('settings_history').select('id,version,data,note,changed_by,changed_at').order('id', { ascending: false }).limit(50),
      c.rpc('early_bird_used')
    ]);
    if (r.error) throw r.error;
    if (!r.data) throw new Error('site_settings 沒有資料');
    st.row = r.data; st.hist = h.data || []; st.used = Number(u.data) || 0;
    st.form = normalize(JSON.parse(JSON.stringify(r.data.data)));
    st.allowPast = false;
    try { const b = await fetch('/settings-state.json', { cache: 'no-cache' }); st.built = b.ok ? await b.json() : null; } catch (e) { st.built = null; }
    st.loaded = true;
  }

  // ── 表單 ──
  const num = (sec, k, label, extra) => `<label>${label}<input type="number" inputmode="numeric" min="0" step="1" data-f="${sec}.${k}" value="${esc(st.form[sec][k] == null ? '' : st.form[sec][k])}"${extra || ''}></label>`;
  const txt = (sec, k, label, ph) => `<label>${label}<input type="text" data-f="${sec}.${k}" value="${esc(st.form[sec][k] || '')}"${ph ? ` placeholder="${esc(ph)}"` : ''}></label>`;
  const dt = (sec, k, label) => `<label>${label}<input type="datetime-local" data-f="${sec}.${k}" data-dt="1" value="${esc(toLocal(st.form[sec][k]))}"></label>`;
  const chk = (sec, k, label) => `<label class="ps-chk"><input type="checkbox" data-f="${sec}.${k}"${st.form[sec][k] ? ' checked' : ''}>${label}</label>`;

  function formHtml() {
    const f = st.form;
    return `
<section class="ps-sec" aria-labelledby="ps-h0"><h3 id="ps-h0">官網顯示</h3>
  ${chk('display', 'hide_prices', '隱藏官網所有價錢')}
  <p class="ps-hint">打開後，官網所有頁面（首頁、網站租用、價格、服務、關於、文章，含英文版）的價錢都會換成「價格請洽詢」，頂部公告列與滑出卡片也不顯示。服務條款、編輯器、會員專區的價格與實際收費不變。按「儲存並發布」後約 2–3 分鐘生效；關掉再發布一次就恢復。</p>
  ${chk('display', 'hide_contact', '關閉官網所有聯絡方式')}
  <p class="ps-hint">打開後，官網會隱藏「免費諮詢」按鈕、右側 LINE／IG／Threads 浮動按鈕、各頁的 LINE 與諮詢區塊、頁尾聯絡連結，聯絡頁的表單與聯絡資訊也會關閉並改顯示「目前暫停接受諮詢」。隱私權政策、服務條款、會員專區的聯絡窗口保留。同樣按「儲存並發布」生效。</p>
</section>
<section class="ps-sec" aria-labelledby="ps-h1"><h3 id="ps-h1">方案價格（一般價格）</h3>
  <div class="ps-row">${num('prices', 'single_month', '一頁版月租')}${num('prices', 'single_year', '一頁版年繳')}${num('prices', 'multi_month', '多頁版月租')}${num('prices', 'multi_year', '多頁版年繳')}</div>
  <div class="ps-row">${num('prices', 'pro_month', '進階功能月加購')}${num('prices', 'pro_year', '進階功能年加購')}</div>
  <p class="ps-hint">早鳥結束後，全站與新客人帳單都用這組價格。早鳥期間開始租用的網站會維持當時的早鳥價。</p>
</section>
<section class="ps-sec" aria-labelledby="ps-h2"><h3 id="ps-h2">早鳥活動</h3>
  ${chk('early', 'enabled', '早鳥活動開啟')}
  <div class="ps-row">${num('early', 'single_month', '一頁版早鳥月租')}${num('early', 'single_year', '一頁版早鳥年繳')}${num('early', 'multi_month', '多頁版早鳥月租')}${num('early', 'multi_year', '多頁版早鳥年繳')}</div>
  <div class="ps-row">${dt('early', 'deadline', '截止時間（台灣時間）')}${num('early', 'quota', '名額上限（選填，留空＝不限）')}</div>
  <label class="ps-chk"><input type="checkbox" id="ps-allow-past"${st.allowPast ? ' checked' : ''}>提前結束早鳥（允許截止時間早於現在）</label>
  <div><button type="button" class="m-btn" id="ps-end-now">把截止時間設為現在</button></div>
  <p class="ps-hint">目前已有 ${st.used} 個網站使用早鳥價${f.early.quota ? '（上限 ' + esc(f.early.quota) + '）' : ''}。名額滿了會在下次建置時自動結束早鳥。</p>
</section>
<section class="ps-sec" aria-labelledby="ps-h3"><h3 id="ps-h3">頂部公告列</h3>
  ${chk('bar', 'enabled', '顯示公告列')}${chk('bar', 'follow_early', '只在早鳥進行中顯示')}
  ${txt('bar', 'text', '電腦版文字')}${txt('bar', 'text_mobile', '手機版文字（留空＝同電腦版）')}
  <div class="ps-row">${txt('bar', 'button', '按鈕文字')}${txt('bar', 'link', '連結', '/rental/')}</div>
  <div class="ps-row">${dt('bar', 'start', '開始時間（選填）')}${dt('bar', 'end', '結束時間（選填）')}${num('bar', 'dismiss_days', '關閉後幾天不再顯示')}</div>
</section>
<section class="ps-sec" aria-labelledby="ps-h4"><h3 id="ps-h4">滑出卡片</h3>
  ${chk('card', 'enabled', '顯示卡片')}${chk('card', 'follow_early', '只在早鳥進行中顯示')}
  ${txt('card', 'title', '標題')}${txt('card', 'body', '說明')}
  <div class="ps-row">${txt('card', 'b1_text', '按鈕一文字')}${txt('card', 'b1_link', '按鈕一連結')}</div>
  <div class="ps-row">${txt('card', 'b2_text', '按鈕二文字（選填）')}${txt('card', 'b2_link', '按鈕二連結')}</div>
  <div class="ps-row">${num('card', 'scroll_pct', '捲動百分比（0–100）')}${num('card', 'delay_sec', '停留秒數（0–600）')}${num('card', 'dismiss_days', '關閉後幾天不再顯示')}</div>
  <div class="ps-row">${dt('card', 'start', '開始時間（選填）')}${dt('card', 'end', '結束時間（選填）')}</div>
  <label>顯示頁面（一行一個，結尾 * 代表底下所有頁面）<textarea rows="5" data-f="card.pages">${esc((f.card.pages || []).join('\n'))}</textarea></label>
  <p class="ps-hint">工具頁（/seo/、/geo/、/tools/）、/builder/、/dashboard/、/admin/ 一律不顯示卡片。</p>
</section>
<p class="ps-hint">文字可用的變數：${VARS.map(esc).join('、')}</p>`;
  }

  function readForm() {
    const f = JSON.parse(JSON.stringify(st.form));
    box.querySelectorAll('[data-f]').forEach((el) => {
      const [sec, k] = el.getAttribute('data-f').split('.');
      if (el.type === 'checkbox') f[sec][k] = el.checked;
      else if (el.type === 'number') f[sec][k] = el.value.trim() === '' ? null : Number(el.value);
      else if (el.getAttribute('data-dt')) f[sec][k] = toIso(el.value);
      else if (k === 'pages') f[sec][k] = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
      else f[sec][k] = el.value.trim();
    });
    const ap = document.getElementById('ps-allow-past'); st.allowPast = !!(ap && ap.checked);
    return f;
  }

  // 欄位檢查（資料庫也會再檢查一次）
  function validate(f) {
    const errs = [];
    const bad = (key, m) => errs.push({ key, m });
    const posInt = (v) => Number.isInteger(v) && v > 0;
    Object.keys(DEFAULTS.prices).forEach((k) => { if (!posInt(f.prices[k])) bad('prices.' + k, '方案價格只能是正整數'); });
    ['single_month', 'single_year', 'multi_month', 'multi_year'].forEach((k) => { if (!posInt(f.early[k])) bad('early.' + k, '早鳥價格只能是正整數'); });
    if (f.early.quota != null && !posInt(f.early.quota)) bad('early.quota', '名額上限要是正整數或留空');
    if (!f.early.deadline) bad('early.deadline', '請設定早鳥截止時間');
    else if (f.early.enabled && Date.parse(f.early.deadline) < Date.now() && !st.allowPast) bad('early.deadline', '截止時間不能早於現在（要提前結束早鳥，請勾選「提前結束早鳥」）');
    ['bar', 'card'].forEach((p) => {
      const name = p === 'bar' ? '公告列' : '卡片', x = f[p];
      if (x.start && x.end && Date.parse(x.end) <= Date.parse(x.start)) bad(p + '.end', name + '的結束時間要晚於開始時間');
      if (!Number.isInteger(x.dismiss_days) || x.dismiss_days < 0 || x.dismiss_days > 365) bad(p + '.dismiss_days', name + '的「關閉後幾天不再顯示」要是 0–365 的整數');
    });
    if (!Number.isInteger(f.card.scroll_pct) || f.card.scroll_pct < 0 || f.card.scroll_pct > 100) bad('card.scroll_pct', '捲動百分比要是 0–100');
    if (!Number.isInteger(f.card.delay_sec) || f.card.delay_sec < 0 || f.card.delay_sec > 600) bad('card.delay_sec', '停留秒數要是 0–600');
    const link = (v) => !v || /^\/[^\s"'<>]*$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v);
    [['bar', 'link'], ['card', 'b1_link'], ['card', 'b2_link']].forEach(([p, k]) => { if (!link(f[p][k])) bad(p + '.' + k, '連結要以 / 或 https:// 開頭'); });
    if (f.bar.enabled && !f.bar.text) bad('bar.text', '請填公告列文字');
    if (f.card.enabled && !f.card.title) bad('card.title', '請填卡片標題');
    if (f.card.b2_text && !f.card.b2_link) bad('card.b2_link', '按鈕二有文字就要有連結');
    (f.card.pages || []).forEach((pg) => { if (!/^\/[^\s]*$/.test(pg)) bad('card.pages', '顯示頁面要以 / 開頭：' + pg); });
    [['bar', 'text'], ['bar', 'text_mobile'], ['bar', 'button'], ['card', 'title'], ['card', 'body'], ['card', 'b1_text'], ['card', 'b2_text']].forEach(([p, k]) => {
      (String(f[p][k] || '').match(/\{[^{}]+\}/g) || []).forEach((v) => { if (!VARS.includes(v)) bad(p + '.' + k, '不認得的變數 ' + v + '（可用：' + VARS.join('、') + '）'); });
    });
    return errs;
  }

  function showErrors(errs) {
    box.querySelectorAll('[data-f]').forEach((el) => el.removeAttribute('aria-invalid'));
    box.querySelectorAll('.ps-err[data-for]').forEach((el) => el.remove());
    errs.forEach((e) => {
      const el = box.querySelector(`[data-f="${e.key}"]`);
      if (!el) return;
      el.setAttribute('aria-invalid', 'true');
      const p = document.createElement('p'); p.className = 'ps-err'; p.setAttribute('data-for', e.key); p.textContent = e.m;
      el.closest('label').appendChild(p);
    });
    if (errs.length) { const first = box.querySelector('[aria-invalid=true]'); if (first) first.focus(); }
  }

  // ── 狀態 ──
  function statusHtml() {
    const r = st.row, now = new Date(), eff = effective(r.data, now, st.used), pr = promo(r.data, eff, now);
    const dl = Date.parse(normalize(r.data).early.deadline), days = Math.ceil((dl - now.getTime()) / 864e5);
    const builtV = st.built && st.built.version;
    const stale = builtV != null && builtV !== r.version;
    return `<div class="ps-status" role="status">
  <span>早鳥：<b class="${eff.early ? 'rn-ok' : 'rn-dim'}">${eff.early ? '進行中' : '已結束'}</b>${eff.early ? '，距離截止還有 <b>' + Math.max(0, days) + '</b> 天（' + esc(eff.until) + '）' : ''}</span>
  <span>新客人價格：一頁版 <b>${money(eff.single.month)}</b>／月、多頁版 <b>${money(eff.multi.month)}</b>／月</span>
  ${normalize(r.data).display.hide_prices ? '<span>官網價錢：<b class="rn-warn">隱藏中</b></span>' : ''}
  ${normalize(r.data).display.hide_contact ? '<span>聯絡方式：<b class="rn-warn">關閉中</b></span>' : ''}
  <span>公告列：<b>${pr.bar.show ? '顯示' : '不顯示'}</b>　卡片：<b>${pr.card.show ? '顯示' : '不顯示'}</b></span>
  <span>設定版本：<b>第 ${r.version} 版</b>（${esc(fmtDT(r.updated_at))}，${esc(r.updated_by || '')}）</span>
  <span>最後發布：<b>${esc(fmtDT(r.published_at))}</b>${r.published_by ? '（' + esc(r.published_by) + '）' : ''}</span>
  <span>官網目前：${builtV != null ? '第 ' + builtV + ' 版（建置於 ' + esc(fmtDT(st.built.built_at)) + '）' : '尚未用新版建置'}${stale ? '　<b class="rn-warn">官網還不是最新版本，請按「儲存並發布」或「只重新發布」</b>' : ''}</span>
</div>`;
  }

  function histHtml() {
    if (!st.hist.length) return '<p class="rn-note">還沒有修改紀錄。</p>';
    return '<ul class="ps-hist">' + st.hist.map((h) => {
      const n = normalize(h.data);
      const sum = '一般 ' + money(n.prices.single_month) + '／' + money(n.prices.multi_month) + '；早鳥' + (n.early.enabled ? ' ' + money(n.early.single_month) + '／' + money(n.early.multi_month) + '，至 ' + taipeiDate(n.early.deadline) : '關閉') + '；公告列' + (n.bar.enabled ? '開' : '關') + '、卡片' + (n.card.enabled ? '開' : '關') + (n.display.hide_prices ? '；價錢隱藏' : '') + (n.display.hide_contact ? '；聯絡關閉' : '');
      const cur = h.version === st.row.version;
      return `<li><span><b>第 ${h.version} 版</b>　${esc(fmtDT(h.changed_at))}　${esc(h.changed_by || '')}${h.note ? '　「' + esc(h.note) + '」' : ''}<div class="rn-sub">${esc(sum)}</div></span>${cur ? '<span class="rn-dim">目前版本</span>' : `<button type="button" class="m-btn" data-restore="${h.id}" data-ver="${h.version}">還原到這一版</button>`}</li>`;
    }).join('') + '</ul>';
  }

  // ── 預覽 ──
  let previewTimer = 0;
  const srcCache = {};
  async function preview() {
    const frame = document.getElementById('ps-frame'), note = document.getElementById('ps-pv-note');
    if (!frame) return;
    const f = readForm(), now = new Date();
    let html;
    try {
      if (!srcCache[st.page]) {
        const r = await fetch('preview-src/' + st.page + '.html', { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        srcCache[st.page] = await r.text();
      }
      const eff = effective(f, now, st.used), pr = promo(f, eff, now), path = PREVIEW_PATH[st.page];
      html = render(srcCache[st.page], tokens(f, eff));
      if (f.display && f.display.hide_prices) html = hidePriceText(html, false);
      if (f.display && f.display.hide_contact) html = hideContactHtml(html, false);
      html = html.replace('id="page-loader"', 'id="page-loader-off" hidden').replace(/<script[^>]*googletagmanager[\s\S]*?<\/script>/gi, '').replace(/<script>\s*window\.dataLayer[\s\S]*?<\/script>/gi, '');
      const base = `<base href="${location.origin}${path}">`;
      const pv = `<script>window.YC_PROMO_PREVIEW=${JSON.stringify({ path, cfg: { card: pr.card } }).replace(/</g, '\\u003c')};</script>`;
      const force = pr.bar.show ? '<script>document.documentElement.classList.add("has-yc-bar")</script>' : '';
      html = html.replace(/<head([^>]*)>/i, (m) => m + base + pv);
      if (pr.bar.show) html = html.replace(/<\/head>/i, barHead(pr.bar) + force + '</head>').replace(/<body([^>]*)>/i, (m) => m + barBody(pr.bar));
      const why = [];
      if (f.display && f.display.hide_prices) why.push('官網價錢隱藏中');
      if (f.display && f.display.hide_contact) why.push('聯絡方式關閉中');
      why.push(eff.early ? '早鳥進行中（至 ' + eff.until + '）' : '早鳥未進行，只顯示一般價格');
      why.push(pr.bar.show ? '公告列顯示' : '公告列不顯示');
      why.push(!pr.card.show ? '卡片不顯示' : cardAllowed(pr.card.pages, path) ? '卡片顯示（預覽中立即滑出，正式網站依捲動或停留時間）' : '卡片在這一頁不顯示');
      note.textContent = why.join('；');
    } catch (e) {
      note.textContent = '預覽範本還沒產生（官網用新版建置一次後就會有）：' + (e.message || e);
      html = '<p style="font:15px sans-serif;padding:24px">預覽範本尚未產生</p>';
    }
    fit();
    frame.srcdoc = html;
  }
  // 電腦版用 1280px 寬、手機版用 390px 寬的畫面縮放到預覽框
  function fit() {
    const wrap = document.getElementById('ps-fwrap'), frame = document.getElementById('ps-frame');
    if (!wrap || !frame) return;
    const w = st.device === 'mobile' ? 390 : 1280, h = st.device === 'mobile' ? 800 : 860;
    const sc = Math.min(1, wrap.parentNode.clientWidth / w);
    frame.style.width = w + 'px'; frame.style.height = h + 'px'; frame.style.transform = 'scale(' + sc + ')';
    wrap.style.width = Math.round(w * sc) + 'px'; wrap.style.height = Math.round(h * sc) + 'px';
  }
  window.addEventListener('resize', fit);
  const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(preview, 400); };

  // ── 畫面 ──
  function draw() {
    box.innerHTML = `<div class="ps-wrap">
${statusHtml()}
<div class="ps-grid">
  <form id="ps-form" novalidate>${formHtml()}</form>
  <div class="ps-pv" aria-label="預覽">
    <div class="ps-tools" role="group" aria-label="預覽頁面">
      ${['home', 'rental', 'pricing'].map((p) => `<button type="button" class="m-btn" data-page="${p}" aria-pressed="${st.page === p}">${{ home: '首頁', rental: '/rental/', pricing: '/pricing/' }[p]}</button>`).join('')}
      <button type="button" class="m-btn" data-device="desktop" aria-pressed="${st.device === 'desktop'}">電腦</button>
      <button type="button" class="m-btn" data-device="mobile" aria-pressed="${st.device === 'mobile'}">手機</button>
    </div>
    <p class="ps-hint" id="ps-pv-note" aria-live="polite"></p>
    <div class="ps-fwrap" id="ps-fwrap"><iframe id="ps-frame" class="ps-frame" title="套用新設定後的頁面預覽" sandbox="allow-scripts"></iframe></div>
  </div>
</div>
<div class="ps-bar">
  <label class="ps-hint" style="flex:1 1 220px">修改說明（選填）<input type="text" id="ps-note" class="ps-note-in" maxlength="200" placeholder="例如：一頁版早鳥改 499"></label>
  <button type="button" class="m-btn primary" id="ps-save">儲存並發布</button>
  <button type="button" class="m-btn" id="ps-republish">只重新發布</button>
  <button type="button" class="m-btn" id="ps-daily">立即執行每日檢查</button>
  <button type="button" class="m-btn" id="ps-reset">放棄修改</button>
  <span class="ps-msg${st.msgBad ? ' bad' : st.msg ? ' ok' : ''}" id="ps-msg" role="status">${esc(st.msg)}</span>
</div>
<section class="ps-sec" aria-labelledby="ps-h5"><h3 id="ps-h5">修改紀錄</h3>${histHtml()}<p class="ps-hint">還原會建立一個新版本（舊紀錄不會被覆蓋），並自動重新發布官網。</p></section>
</div>`;
    bind();
    preview();
  }

  function setMsg(t, bad) { st.msg = t; st.msgBad = !!bad; const el = document.getElementById('ps-msg'); if (el) { el.textContent = t; el.className = 'ps-msg' + (bad ? ' bad' : t ? ' ok' : ''); } }
  function setBusy(b) { st.busy = b; box.querySelectorAll('.ps-bar button,[data-restore]').forEach((x) => { x.disabled = b; }); }

  async function publish() {
    const r = await YC.client.functions.invoke('site-settings', { body: { action: 'publish' } });
    if (r.error) {
      let m = r.error.message || String(r.error);
      try { const j = await r.error.context.json(); m = j.message || m; } catch (e) { /* ignore */ }
      throw new Error(m);
    }
    return r.data;
  }
  const errText = (e) => { const m = (e && e.message) || String(e); return /not_admin|42501/.test(m) ? '只有管理員可以修改' : m; };

  async function onSave() {
    if (st.busy) return;
    const f = readForm(), errs = validate(f);
    showErrors(errs);
    if (errs.length) { setMsg('有 ' + errs.length + ' 個欄位需要修正', true); return; }
    if (JSON.stringify(f) === JSON.stringify(normalize(st.row.data))) { setMsg('設定沒有變更。要重新產生官網請按「只重新發布」。', true); return; }
    const eff = effective(f, new Date(), st.used);
    if (!window.confirm('確定儲存並發布？\n新客人價格：一頁版 ' + money(eff.single.month) + '／月、多頁版 ' + money(eff.multi.month) + '／月' + (eff.early ? '（早鳥至 ' + eff.until + '）' : '（早鳥未進行）') + '\n價格有變時，客人下次發佈網站要重新同意租用條款。')) return;
    setBusy(true); setMsg('儲存中…');
    try {
      const note = (document.getElementById('ps-note') || {}).value || '';
      const s = await YC.client.rpc('save_site_settings', { p_data: f, p_note: note.trim(), p_allow_past: st.allowPast });
      if (s.error) throw s.error;
      setMsg('已儲存第 ' + s.data.version + ' 版，觸發重新建置中…');
      let pm;
      try { pm = (await publish()).message; } catch (e) { await reload(); setMsg('設定已儲存，但發布失敗：' + errText(e) + '。請按「只重新發布」再試一次。', true); return; }
      await reload(); setMsg(pm || '已開始重新產生官網，約 2–3 分鐘後全站更新。');
    } catch (e) { setMsg('儲存失敗：' + errText(e), true); }
    finally { setBusy(false); }
  }

  async function onRepublish() {
    if (st.busy) return; setBusy(true); setMsg('觸發重新建置中…');
    try { const d = await publish(); await reload(); setMsg(d.message || '已開始重新產生官網。'); } catch (e) { setMsg('發布失敗：' + errText(e), true); }
    finally { setBusy(false); }
  }

  async function onDaily() {
    if (st.busy) return; setBusy(true); setMsg('檢查中…');
    try {
      const r = await YC.client.functions.invoke('site-settings', { body: { action: 'daily' } });
      if (r.error) { let m = r.error.message; try { m = (await r.error.context.json()).message || m; } catch (e) { /* ignore */ } throw new Error(m); }
      await reload();
      setMsg(r.data.changed ? '狀態有變化：' + (r.data.changes || []).join('；') + (r.data.deployed ? '。已重新建置並寄信通知。' : '') : (r.data.message || '狀態沒有變化。'));
    } catch (e) { setMsg('每日檢查失敗：' + errText(e), true); }
    finally { setBusy(false); }
  }

  async function onRestore(id, ver) {
    if (st.busy) return;
    if (!window.confirm('確定還原到第 ' + ver + ' 版？會建立新版本並重新發布官網。')) return;
    setBusy(true); setMsg('還原中…');
    try {
      const r = await YC.client.rpc('restore_site_settings', { p_history_id: Number(id) });
      if (r.error) throw r.error;
      let pm;
      try { pm = (await publish()).message; } catch (e) { await reload(); setMsg('已還原為第 ' + r.data.version + ' 版，但發布失敗：' + errText(e) + '。請按「只重新發布」。', true); return; }
      await reload(); setMsg('已還原（第 ' + r.data.version + ' 版）。' + (pm || ''));
    } catch (e) { setMsg('還原失敗：' + errText(e), true); }
    finally { setBusy(false); }
  }

  async function reload() { await load(); const m = st.msg, b = st.msgBad; draw(); setMsg(m, b); }

  function bind() {
    const form = document.getElementById('ps-form');
    form.addEventListener('input', schedulePreview);
    form.addEventListener('change', schedulePreview);
    form.addEventListener('submit', (e) => e.preventDefault());
    document.getElementById('ps-end-now').addEventListener('click', () => {
      const el = box.querySelector('[data-f="early.deadline"]');
      el.value = new Date(Date.now() + 8 * 3600e3 - 60e3).toISOString().slice(0, 16);
      document.getElementById('ps-allow-past').checked = true;
      schedulePreview();
    });
    box.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { st.page = b.getAttribute('data-page'); box.querySelectorAll('[data-page]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); preview(); }));
    box.querySelectorAll('[data-device]').forEach((b) => b.addEventListener('click', () => { st.device = b.getAttribute('data-device'); box.querySelectorAll('[data-device]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); preview(); }));
    document.getElementById('ps-save').addEventListener('click', onSave);
    document.getElementById('ps-republish').addEventListener('click', onRepublish);
    document.getElementById('ps-daily').addEventListener('click', onDaily);
    document.getElementById('ps-reset').addEventListener('click', () => { st.form = normalize(JSON.parse(JSON.stringify(st.row.data))); st.allowPast = false; setMsg(''); draw(); });
    box.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', () => onRestore(b.getAttribute('data-restore'), b.getAttribute('data-ver'))));
  }

  // ── 分頁切換 ──
  let active = false;
  async function show(on) {
    active = on; box.hidden = !on;
    if (!on) return;
    const admin = YC.enabled && YC.loggedIn() && YC.isAdmin();
    if (!admin) { box.innerHTML = ''; return; }
    if (!st.loaded) {
      box.innerHTML = '<div class="mem-card mem-empty"><p>載入中…</p></div>';
      try { await load(); } catch (e) {
        const missing = /site_settings|schema cache|does not exist/i.test(String(e && e.message));
        box.innerHTML = '<div class="mem-card mem-empty"><p>' + (missing ? '資料庫還沒有升級：請先執行 <code>021_site_settings.sql</code>。' : '讀取失敗：' + esc(e.message || e)) + '</p></div>';
        return;
      }
    }
    draw();
  }
  document.addEventListener('yc-admin-tab', (e) => show(e.detail === 'prices'));
  YC.onChange(() => { st.loaded = false; if (active) show(true); });
  window.addEventListener('beforeunload', (e) => {
    if (!active || !st.loaded || !document.getElementById('ps-form')) return;
    try { if (JSON.stringify(readForm()) !== JSON.stringify(normalize(st.row.data))) { e.preventDefault(); e.returnValue = ''; } } catch (x) { /* ignore */ }
  });
  if (location.hash === '#prices') show(true);
}
