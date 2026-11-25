/* 管理後台「關鍵字排名」分頁：即時向 Google Search Console 查詢網站的關鍵字平均排名（不存檔、不需要金鑰）。
   做法：管理員用同一個 Google 帳號再授權一次「Search Console 唯讀」權限，瀏覽器拿到 Google 的存取權杖（約 1 小時有效），
   直接向 Google 查詢；權杖只放在這個分頁的 sessionStorage，不送到我們的伺服器。
   看得到哪些網站＝這個 Google 帳號在 Search Console 有權限的網站（客戶把 ycaxiom@gmail.com 加為使用者即可）。 */
(function () {
  'use strict';
  var YC = window.YC, box = document.getElementById('adm-rank'), tabs = document.getElementById('adm-tabs');
  if (!YC || !box || !tabs) return;
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var st = { sites: null, email: '', data: null, sort: 'impressions', busy: false };
  var LS = 'yc-rank-kw';
  var mem = function () { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } };
  var save = function (site, kw) { try { var m = mem(); m[site] = kw; m._last = site; localStorage.setItem(LS, JSON.stringify(m)); } catch (e) { /* 無痕模式 */ } };

  var css = document.createElement('style');
  css.textContent =
    '.rk{display:grid;gap:14px}.rk-card{padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface,transparent)}' +
    '.rk-form{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:10px}.rk-form label{display:grid;gap:4px;font-size:13px;color:var(--text-dim)}' +
    '.rk-form select,.rk-form textarea{width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg,transparent);color:var(--text);font:inherit;font-size:15px}' +
    '.rk-form textarea{min-height:76px;resize:vertical}.rk-wide{grid-column:1/-1}.rk-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
    '.rk-note{margin:0;font-size:12.5px;color:var(--text-dim);line-height:1.7}.rk-sum{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;color:var(--text-dim);margin:0 0 10px}.rk-sum b{color:var(--text-bright,var(--text));font-size:18px;margin-right:4px}' +
    '.rk-table{width:100%;border-collapse:collapse;font-size:14px}.rk-table th,.rk-table td{padding:8px 8px;border-bottom:1px solid var(--border);text-align:left}' +
    '.rk-table th{font-weight:500;color:var(--text-dim);white-space:nowrap}.rk-table th button{all:unset;cursor:pointer}.rk-table th button:focus-visible{outline:2px solid var(--accent)}' +
    '.rk-table td.n,.rk-table th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.rk-pos{font-weight:700}.rk-p1{color:#6cc08b}' +
    '.rk-up{color:#6cc08b}.rk-down{color:#f0776b}.rk-flat,.rk-new{color:var(--text-dim)}' +
    '.rk-miss{margin:10px 0 0;font-size:13px;color:var(--text-dim)}.rk-setup ol{margin:6px 0 0;padding-left:20px;font-size:14px;line-height:1.8}.rk-setup code{word-break:break-all}' +
    '@media (max-width:640px){.rk-form{grid-template-columns:1fr}.rk-table thead{display:none}.rk-table tr{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:8px 0;border-bottom:1px solid var(--border)}.rk-table td{border:0;padding:0}.rk-table td.q{grid-column:1/-1;font-weight:600}.rk-table td.n::before{content:attr(data-l) " ";color:var(--text-dim);font-weight:400}}';
  document.head.appendChild(css);

  // ── Google 授權與 Search Console API（瀏覽器直接呼叫）──
  var SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly', TK = 'yc-gsc-token', PEND = 'yc-gsc-pending';
  var API = 'https://www.googleapis.com/webmasters/v3';
  function tokenGet() { try { var t = JSON.parse(sessionStorage.getItem(TK) || 'null'); return t && t.exp > Date.now() ? t.t : ''; } catch (e) { return ''; } }
  function tokenSet(t) { try { if (t) sessionStorage.setItem(TK, JSON.stringify({ t: t, exp: Date.now() + 55 * 60000 })); else sessionStorage.removeItem(TK); } catch (e) { /* 無痕模式 */ } }
  async function capture() {
    // 剛從 Google 授權回來：Supabase 的登入狀態裡會帶著 Google 的存取權杖（provider_token）
    var pend = false; try { pend = sessionStorage.getItem(PEND) === '1'; } catch (e) { /* ignore */ }
    if (!pend) return;
    try {
      var r = await YC.client.auth.getSession(), ses = (r && r.data && r.data.session) || YC.session;
      if (ses && ses.provider_token) { tokenSet(ses.provider_token); sessionStorage.removeItem(PEND); }
    } catch (e) { /* ignore */ }
  }
  async function authorize() {
    try { sessionStorage.setItem(PEND, '1'); } catch (e) { /* ignore */ }
    var email = YC.session && YC.session.user && YC.session.user.email;
    var r = await YC.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, scopes: SCOPE, skipBrowserRedirect: true,
      queryParams: Object.assign({ prompt: 'consent', include_granted_scopes: 'true' }, email ? { login_hint: email } : {}) } });
    if (r.error) throw r.error;
    location.href = r.data.url;
  }
  async function gapi(path, body) {
    var t = tokenGet(); if (!t) { var e0 = new Error('需要授權'); e0.code = 'auth'; throw e0; }
    var res = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ Authorization: 'Bearer ' + t }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    var j = await res.json().catch(function () { return {}; });
    if (res.status === 401) { tokenSet(''); var e1 = new Error('Google 授權已過期，請再授權一次。'); e1.code = 'auth'; throw e1; }
    if (!res.ok) {
      var m = (j.error && j.error.message) || String(res.status), e2 = new Error(m);
      e2.code = /has not been used|is disabled|SERVICE_DISABLED/i.test(m) ? 'api_off' : res.status === 403 ? 'forbidden' : 'failed';
      throw e2;
    }
    return j;
  }
  var iso = function (t) { return new Date(t).toISOString().slice(0, 10); };
  async function fn(body) {
    if (body.action === 'gsc_sites') {
      var j = await gapi('/sites');
      return { email: (YC.session && YC.session.user && YC.session.user.email) || '', sites: (j.siteEntry || []).filter(function (x) { return x.permissionLevel !== 'siteUnverifiedUser'; }).map(function (x) { return { url: x.siteUrl }; }) };
    }
    // gsc_rank：最近 days 天 vs 前一段同樣天數；資料約晚 3 天
    var DAY = 86400000, end = Date.now() - 3 * DAY, start = end - (body.days - 1) * DAY, pEnd = start - DAY, pStart = pEnd - (body.days - 1) * DAY;
    var kw = body.keywords || [], base = { dimensions: ['query'], type: 'web', rowLimit: 1000 };
    if (kw.length) base.dimensionFilterGroups = [{ groupType: 'or', filters: kw.map(function (k) { return { dimension: 'query', operator: 'contains', expression: k }; }) }];
    var path = '/sites/' + encodeURIComponent(body.site) + '/searchAnalytics/query';
    var both = await Promise.all([gapi(path, Object.assign({}, base, { startDate: iso(start), endDate: iso(end) })), gapi(path, Object.assign({}, base, { startDate: iso(pStart), endDate: iso(pEnd) }))]);
    var pm = {}; (both[1].rows || []).forEach(function (r) { pm[r.keys[0]] = r; });
    var r1 = function (n) { return Math.round(n * 10) / 10; };
    var rows = (both[0].rows || []).map(function (r) { var p = pm[r.keys[0]]; return { query: r.keys[0], position: r1(r.position), prev: p ? r1(p.position) : null, clicks: r.clicks, impressions: r.impressions }; })
      .sort(function (a, b) { return b.impressions - a.impressions; }).slice(0, 100);
    return { site: body.site, from: iso(start), to: iso(end), rows: rows, missing: kw.filter(function (k) { return !rows.some(function (r) { return r.query.indexOf(k) > -1; }); }) };
  }
  function authHtml(msg) {
    return '<div class="rk-card rk-setup"><b>用 Google 帳號授權查詢</b>' + (msg ? '<p class="rk-note">' + esc(msg) + '</p>' : '') +
      '<p class="rk-note">按下後會跳到 Google，請選<b>登入後台的同一個帳號</b>，並允許「查看 Search Console 資料」（唯讀）。授權約 1 小時有效，過期再按一次即可。不需要設定任何金鑰。</p>' +
      '<div class="rk-acts" style="margin-top:10px"><button type="button" class="m-btn" id="rk-auth">用 Google 授權</button></div></div>';
  }
  function bindAuth() { var rt = document.getElementById('rk-retry'); if (rt) rt.onclick = function () { st.sites = null; load(); };
    var b = document.getElementById('rk-auth'); if (b) b.onclick = function () { b.disabled = true; authorize().catch(function (e) { b.disabled = false; window.alert('授權失敗：' + (e.message || e)); }); }; }
  function errHtml(e) {
    if (e.code === 'auth') return authHtml(e.message === '需要授權' ? '' : e.message);
    if (e.code === 'api_off') return '<div class="rk-card rk-setup"><b>還差一步：啟用 Search Console API</b><p class="rk-note">Google 回覆這個專案還沒啟用 Search Console API。請到 Google Cloud Console 的「API 和服務 → 程式庫」搜尋「Google Search Console API」按「啟用」（不用建立金鑰），通常要等 2～5 分鐘才會生效。</p><div class="rk-acts" style="margin:10px 0"><button type="button" class="m-btn" id="rk-retry">再試一次</button></div><p class="rk-note">' + esc(e.message) + '</p></div>';
    if (e.code === 'forbidden') return '<div class="rk-card rk-setup"><b>這個 Google 帳號沒有這個網站的權限</b><p class="rk-note">請客戶到 Search Console →「設定」→「使用者和權限」→「新增使用者」，填入你登入後台的 Gmail，權限選「受限」。</p></div>';
    return '<div class="rk-card"><p class="rk-note">查詢失敗：' + esc(e.message || e) + '</p></div>';
  }

  function setupHtml(email, msg) {
    return '<div class="rk-card rk-setup"><b>還不能查詢</b><p class="rk-note">' + esc(msg || '') + '</p><ol>' +
      (email ? '' : '<li>到 Google Cloud 建立專案，啟用「Google Search Console API」。</li><li>建立服務帳戶並產生 JSON 金鑰，把整段 JSON 設成 Supabase 的 Secret：<code>GSC_SERVICE_ACCOUNT</code>（金鑰請自己設定，不要貼給任何人）。</li>') +
      '<li>請客戶到 Search Console →「設定」→「使用者和權限」→「新增使用者」，填入 ' + (email ? '<code>' + esc(email) + '</code>' : '服務帳戶的 Email') + '，權限選「受限」。</li>' +
      '<li>回到這裡按「重新整理網站清單」。</li></ol></div>';
  }

  function draw() {
    if (!st.sites) { box.innerHTML = '<div class="rk-card"><p class="rk-note">載入網站清單中…</p></div>'; return; }
    var m = mem(), cur = (document.getElementById('rk-site') || {}).value || m._last || (st.sites[0] && st.sites[0].url) || '';
    var kw = (m[cur] || []).join('\n');
    var form = st.sites.length ? '<div class="rk-card"><div class="rk-form">' +
      '<label>網站<select id="rk-site">' + st.sites.map(function (s) { return '<option value="' + esc(s.url) + '"' + (s.url === cur ? ' selected' : '') + '>' + esc(s.url.replace(/^sc-domain:/, '網域：')) + '</option>'; }).join('') + '</select></label>' +
      '<label>期間<select id="rk-days"><option value="7">最近 7 天</option><option value="28" selected>最近 28 天</option><option value="90">最近 3 個月</option></select></label>' +
      '<label class="rk-wide">要追蹤的關鍵字（選填，一行一個，最多 20 個；空白就列出曝光最多的前 100 個搜尋字詞）<textarea id="rk-kw" placeholder="台中攝影棚&#10;台中攝影棚租借">' + esc(kw) + '</textarea></label>' +
      '<div class="rk-acts rk-wide"><button type="button" class="m-btn" id="rk-go">查詢排名</button><button type="button" class="m-btn sm" id="rk-reload">重新整理網站清單</button></div>' +
      '<p class="rk-note rk-wide">排名是 Google Search Console 統計的「平均排名」，1～10 是搜尋結果第一頁。資料約晚 3 天，▲▼ 是和前一段同樣天數相比。查詢帳號：' + esc(st.email) + '</p>' +
      '</div></div>' : '<div class="rk-card rk-setup"><b>這個 Google 帳號目前看不到任何網站</b><p class="rk-note">請客戶到 Search Console →「設定」→「使用者和權限」→「新增使用者」，填入 ' + esc(st.email || '你登入後台的 Gmail') + '，權限選「受限」，再按「重新整理網站清單」。</p><div class="rk-acts"><button type="button" class="m-btn sm" id="rk-reload">重新整理網站清單</button></div></div>';
    box.innerHTML = '<div class="rk">' + form + '<div id="rk-out" aria-live="polite">' + (st.data ? table() : '') + '</div></div>';
    var go = document.getElementById('rk-go'); if (go) go.onclick = run;
    var rl = document.getElementById('rk-reload'); if (rl) rl.onclick = function () { st.sites = null; load(); };
    var sel = document.getElementById('rk-site'); if (sel) sel.onchange = function () { var k = mem()[sel.value] || []; document.getElementById('rk-kw').value = k.join('\n'); };
    bindTable();
  }

  function change(r) {
    if (r.prev == null) return '<span class="rk-new">新出現</span>';
    var d = Math.round((r.prev - r.position) * 10) / 10;
    if (d >= 0.5) return '<span class="rk-up">▲ ' + d + '</span>';
    if (d <= -0.5) return '<span class="rk-down">▼ ' + (-d) + '</span>';
    return '<span class="rk-flat">持平</span>';
  }
  function sorted() {
    var rows = st.data.rows.slice(), k = st.sort;
    rows.sort(function (a, b) { return k === 'position' ? a.position - b.position : k === 'clicks' ? b.clicks - a.clicks : b.impressions - a.impressions; });
    return rows;
  }
  function table() {
    var d = st.data, rows = sorted();
    var top10 = rows.filter(function (r) { return r.position <= 10; }).length, clicks = rows.reduce(function (a, r) { return a + r.clicks; }, 0);
    var th = function (k, label, cls) { return '<th class="' + (cls || '') + '"' + (st.sort === k ? ' aria-sort="' + (k === 'position' ? 'ascending' : 'descending') + '"' : '') + '><button type="button" data-sort="' + k + '">' + label + (st.sort === k ? ' ↓' : '') + '</button></th>'; };
    return '<div class="rk-card"><p class="rk-sum"><span><b>' + rows.length + '</b>個搜尋字詞</span><span><b>' + top10 + '</b>個在第一頁</span><span><b>' + clicks + '</b>次點擊</span><span>' + esc(d.from) + ' ～ ' + esc(d.to) + '</span></p>' +
      (rows.length ? '<table class="rk-table"><thead><tr><th>搜尋字詞</th>' + th('position', '排名', 'n') + '<th class="n">變化</th>' + th('clicks', '點擊', 'n') + th('impressions', '曝光', 'n') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td class="q">' + esc(r.query) + '</td><td class="n rk-pos' + (r.position <= 10 ? ' rk-p1' : '') + '" data-l="排名">' + r.position + '</td><td class="n" data-l="變化">' + change(r) + '</td><td class="n" data-l="點擊">' + r.clicks + '</td><td class="n" data-l="曝光">' + r.impressions + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="rk-note">這段期間沒有搜尋資料。新網站通常要上線並提交 Sitemap 幾週後才會出現。</p>') +
      (d.missing && d.missing.length ? '<p class="rk-miss">這段期間沒有出現在 Google 搜尋結果：' + d.missing.map(esc).join('、') + '</p>' : '') +
      (rows.length ? '<div class="rk-acts" style="margin-top:12px"><button type="button" class="m-btn sm" id="rk-copy">複製表格</button><button type="button" class="m-btn sm" id="rk-csv">下載 CSV</button></div>' : '') +
      '</div>';
  }
  function bindTable() {
    Array.prototype.forEach.call(box.querySelectorAll('[data-sort]'), function (b) { b.onclick = function () { st.sort = b.getAttribute('data-sort'); document.getElementById('rk-out').innerHTML = table(); bindTable(); }; });
    var lines = function (sep) {
      var q = function (v) { v = String(v); return sep === ',' && /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      return [['搜尋字詞', '平均排名', '前一段排名', '點擊', '曝光'].join(sep)].concat(sorted().map(function (r) { return [q(r.query), r.position, r.prev == null ? '' : r.prev, r.clicks, r.impressions].join(sep); })).join('\n');
    };
    var cp = document.getElementById('rk-copy');
    if (cp) cp.onclick = function () {
      var t = st.data.site + '　' + st.data.from + '～' + st.data.to + '\n' + lines('\t');
      var ok = function () { cp.textContent = '已複製'; setTimeout(function () { cp.textContent = '複製表格'; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(ok, function () { window.prompt('請複製', t); }); else window.prompt('請複製', t);
    };
    var cv = document.getElementById('rk-csv');
    if (cv) cv.onclick = function () {
      var host = st.data.site.replace(/^sc-domain:|^https?:\/\//g, '').replace(/\/.*$/, '');
      var a = document.createElement('a'), u = URL.createObjectURL(new Blob(['﻿' + lines(',')], { type: 'text/csv;charset=utf-8' }));
      a.href = u; a.download = '關鍵字排名-' + host + '-' + st.data.to + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    };
  }

  async function run() {
    if (st.busy) return;
    var site = document.getElementById('rk-site').value, days = document.getElementById('rk-days').value;
    var kw = document.getElementById('rk-kw').value.split(/[\n,，、]+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 20);
    save(site, kw);
    var b = document.getElementById('rk-go'); st.busy = true; b.disabled = true; b.textContent = '查詢中…';
    var out = document.getElementById('rk-out');
    try { st.data = await fn({ action: 'gsc_rank', site: site, days: Number(days), keywords: kw }); st.sort = kw.length ? 'position' : 'impressions'; out.innerHTML = table(); bindTable(); }
    catch (e) { out.innerHTML = errHtml(e); bindAuth(); }
    st.busy = false; b.disabled = false; b.textContent = '查詢排名';
  }

  async function load() {
    await capture();
    if (!tokenGet()) { box.innerHTML = '<div class="rk">' + authHtml('') + '</div>'; bindAuth(); return; }
    draw();
    try { var r = await fn({ action: 'gsc_sites' }); st.sites = r.sites || []; st.email = r.email || ''; draw(); }
    catch (e) { st.sites = null; box.innerHTML = '<div class="rk">' + errHtml(e) + '</div>'; bindAuth(); }
  }
  document.addEventListener('yc-admin-tab', function (e) {
    var on = e.detail === 'rank'; box.hidden = !on;
    if (on && !st.sites && YC.isAdmin && YC.isAdmin()) load();
  });
  // 從 Google 授權回來：自動切到這個分頁
  function resume() {
    var pend = false; try { pend = sessionStorage.getItem(PEND) === '1'; } catch (e) { /* ignore */ }
    if (!pend || !YC.isAdmin || !YC.isAdmin()) return;
    var b = tabs.querySelector('[data-tab="rank"]'); if (b && b.getAttribute('aria-selected') !== 'true') b.click();
  }
  if (YC.onChange) YC.onChange(function () { setTimeout(resume, 50); });
  setTimeout(resume, 300);
})();
