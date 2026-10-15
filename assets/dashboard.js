/* 會員專區 /dashboard/ ：網站列表、SEO 與 AI 可見度（GEO）各自的分數趨勢、修正清單、諮詢、刪除帳號 */
(function () {
  'use strict';
  var YC = window.YC, root = document.getElementById('dash-root');
  if (!YC || !root) return;
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var LINE = YC.LINE_URL;
  var state = { sites: [], scans: {}, sel: null, tab: {}, reports: {}, token: 0, deleted: false };
  var TYPES = { seo: { name: 'SEO 檢測', short: 'SEO', tool: 'seo/' }, geo: { name: 'AI 可見度（GEO）', short: 'AI 可見度', tool: 'geo/' } };
  var DISCLAIMER = '這些是提高被 AI 引用機會的因素，無法保證被 AI 推薦。';

  function scCls(n) { return n >= 80 ? 'sc-good' : (n >= 60 ? 'sc-mid' : 'sc-bad'); }
  function fmtDate(s) { var d = new Date(s); return isNaN(d) ? '' : d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); }
  function fmtDT(s) { var d = new Date(s); if (isNaN(d)) return ''; var p = function (n) { return (n < 10 ? '0' : '') + n; }; return fmtDate(s) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function hostOf(u) { try { var x = new URL(u); return x.host + (x.pathname === '/' ? '' : x.pathname); } catch (e) { return u; } }

  // ── 畫面狀態 ──
  function empty(title, text, btnHtml) {
    root.innerHTML = '<div class="mem-card mem-empty"><h2>' + esc(title) + '</h2><p>' + text + '</p>' + (btnHtml || '') + '</div>';
  }
  function drawGuest() {
    empty('請先登入', '登入後可以看到你檢測過的網站、分數變化，以及逐項修正清單。<br>免費，不用設定密碼。',
      '<button class="m-btn primary" id="d-login">登入 / 註冊</button>');
    document.getElementById('d-login').onclick = function () { YC.openLogin({ title: '登入會員專區', reason: '登入後可查看檢測紀錄、分數變化與修正清單。免費，不需要設定密碼。' }); };
  }
  function drawNeedConsent() {
    empty('還差最後一步', '請先同意保存檢測紀錄，才能開通會員專區。',
      '<button class="m-btn primary" id="d-consent">完成註冊</button>');
    document.getElementById('d-consent').onclick = function () { YC.ensureConsent(); };
  }
  function drawUnavailable() { empty('會員功能即將開放', '登入與檢測紀錄功能正在準備中，請稍後再來。', '<a class="m-btn" href="../seo/">回到 SEO 檢測工具</a>'); }

  // ── 資料載入 ──
  async function load() {
    var c = YC.client;
    var s = await c.from('sites').select('id,url,fixed_issues,created_at').order('created_at', { ascending: false });
    if (s.error) throw s.error;
    var sc = await c.from('scans').select('id,site_id,type,score,top_issues,scanned_at').order('scanned_at', { ascending: true }).limit(3000);
    if (sc.error) {            // 資料庫尚未升級（沒有 type 欄位）時，退回舊查詢，全部視為 SEO
      sc = await c.from('scans').select('id,site_id,score,top_issues,scanned_at').order('scanned_at', { ascending: true }).limit(3000);
      if (sc.error) throw sc.error;
    }
    state.sites = s.data || []; state.scans = {};
    (sc.data || []).forEach(function (r) { r.type = r.type === 'geo' ? 'geo' : 'seo'; (state.scans[r.site_id] = state.scans[r.site_id] || []).push(r); });
    state.sites.forEach(function (x) {
      var all = state.scans[x.id] || [];
      x._scans = { seo: all.filter(function (r) { return r.type === 'seo'; }), geo: all.filter(function (r) { return r.type === 'geo'; }) };
      x._last = { seo: x._scans.seo.length ? x._scans.seo[x._scans.seo.length - 1] : null, geo: x._scans.geo.length ? x._scans.geo[x._scans.geo.length - 1] : null };
      x._latest = all.length ? all[all.length - 1] : null;      // 兩種檢測中最新的一筆（排序、預設分頁用）
    });
    state.sites.sort(function (a, b) { return (b._latest ? +new Date(b._latest.scanned_at) : 0) - (a._latest ? +new Date(a._latest.scanned_at) : 0); });
  }
  async function loadReport(site, type) {
    var last = site._last[type];
    if (!last) return null;
    if (state.reports[last.id]) return state.reports[last.id];
    var r = await YC.client.from('scans').select('report').eq('id', last.id).maybeSingle();
    var rep = r.data && r.data.report;
    if (rep) state.reports[last.id] = rep;
    return rep || null;
  }

  // ── 主畫面 ──
  function drawShell() {
    var mail = YC.session.user.email || '';
    root.innerHTML =
      '<div class="mem-bar"><div class="mem-who">登入身分：' + esc(mail) + '</div>' +
      '<div class="mem-actions"><a class="m-btn" href="../seo/">SEO 檢測</a><a class="m-btn" href="../geo/">AI 可見度檢測</a>' +
      '<a class="m-btn primary" href="' + esc(LINE) + '" target="_blank" rel="noopener">免費 15 分鐘諮詢</a>' +
      '<button class="m-btn" id="d-logout">登出</button></div></div>' +
      '<div id="d-body"></div>' +
      '<div class="mem-danger"><p>想停止使用？可刪除帳號與全部資料（網站、檢測紀錄、同意紀錄），立即清除、無法復原。詳見<a href="../privacy/">隱私權政策</a>。</p>' +
      '<button class="m-btn danger sm" id="d-delacc">刪除我的帳號與所有資料</button></div>';
    document.getElementById('d-logout').onclick = function () { YC.signOut(); };
    document.getElementById('d-delacc').onclick = confirmDeleteAccount;
  }
  function drawBody() {
    var body = document.getElementById('d-body');
    if (!state.sites.length) {
      body.innerHTML = '<div class="mem-card mem-empty" style="margin-top:20px"><h2>還沒有檢測紀錄</h2><p>登入後到 SEO 檢測或 GEO（AI 可見度）檢測輸入網址，分析完成後會自動存到這裡，並分別追蹤兩種分數。</p><div class="mem-actions" style="justify-content:center"><a class="m-btn primary" href="../seo/">開始 SEO 檢測</a><a class="m-btn" href="../geo/">檢測 AI 可見度</a></div></div>';
      return;
    }
    if (!state.sel || !state.sites.some(function (x) { return x.id === state.sel; })) state.sel = state.sites[0].id;
    body.innerHTML = '<div class="mem-grid"><div class="mem-sites" id="d-sites"></div><div class="mem-card" id="d-detail"></div></div>';
    drawSites(); drawDetail();
  }
  function drawSites() {
    var box = document.getElementById('d-sites');
    box.innerHTML = state.sites.map(function (x) {
      var a = x._last.seo, g = x._last.geo, n = x._scans.seo.length + x._scans.geo.length;
      function chip(l, lab) { return '<span class="si-chip"><em>' + lab + '</em><b class="' + (l ? scCls(l.score) : 'sc-none') + '">' + (l ? l.score : '–') + '</b></span>'; }
      return '<button class="site-item" data-id="' + esc(x.id) + '" aria-current="' + (x.id === state.sel) + '">' +
        '<span class="si-url">' + esc(hostOf(x.url)) + '</span>' +
        '<span class="si-scores">' + chip(a, 'SEO') + chip(g, 'AI') + '</span>' +
        '<span class="si-meta">' + n + ' 次檢測' + (x._latest ? '・最近 ' + esc(fmtDate(x._latest.scanned_at)) : '') + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.site-item'), function (b) {
      b.onclick = function () { state.sel = b.getAttribute('data-id'); drawSites(); drawDetail(); };
    });
  }

  function trendSvg(scans, label) {
    var W = 640, H = 190, L = 34, R = 16, T = 14, B = 28;
    var n = scans.length, pw = W - L - R, ph = H - T - B;
    var X = function (i) { return L + (n === 1 ? pw / 2 : pw * i / (n - 1)); };
    var Y = function (v) { return T + ph * (1 - v / 100); };
    var g = '';
    [0, 25, 50, 75, 100].forEach(function (v) { g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + '</text>'; });
    g += '<line class="tl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(80) + '" y2="' + Y(80) + '"/><text x="' + (W - R) + '" y="' + (Y(80) - 5) + '" text-anchor="end">目標 80</text>';
    var pts = scans.map(function (s, i) { return X(i) + ',' + Y(s.score); }).join(' ');
    var line = n > 1 ? '<polyline class="ln" points="' + pts + '"/>' : '';
    var dots = scans.map(function (s, i) {
      return '<circle class="pt" cx="' + X(i) + '" cy="' + Y(s.score) + '" r="4.5"><title>' + esc(fmtDT(s.scanned_at)) + '　' + s.score + ' 分</title></circle>' +
        (n <= 12 || i === n - 1 ? '<text class="vl" x="' + X(i) + '" y="' + (Y(s.score) - 10) + '" text-anchor="middle">' + s.score + '</text>' : '');
    }).join('');
    var xl = '<text x="' + X(0) + '" y="' + (H - 6) + '" text-anchor="' + (n === 1 ? 'middle' : 'start') + '">' + esc(fmtDate(scans[0].scanned_at)) + '</text>' +
      (n > 1 ? '<text x="' + X(n - 1) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(fmtDate(scans[n - 1].scanned_at)) + '</text>' : '');
    return '<svg class="trend" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label || '分數趨勢圖') + '">' + g + line + dots + xl + '</svg>';
  }

  function pickTab(site) {
    var t = state.tab[site.id];
    if (t === 'seo' || t === 'geo') return t;
    return site._latest && site._latest.type === 'geo' ? 'geo' : 'seo';
  }
  function scoreCard(site, type, cur) {
    var scans = site._scans[type], last = site._last[type], T = TYPES[type];
    var first = scans[0], delta = last && first && scans.length > 1 ? last.score - first.score : null;
    return '<button type="button" class="sc-card' + (type === cur ? ' on' : '') + '" data-tab="' + type + '" aria-pressed="' + (type === cur) + '">' +
      '<span class="sc-name">' + esc(T.name) + '</span>' +
      (last ? '<span class="sc-num ' + scCls(last.score) + '">' + last.score + '</span>' +
        '<span class="sc-sub">' + scans.length + ' 次檢測' + (delta !== null ? '・與首次相比 <i class="' + (delta > 0 ? 'd-up' : (delta < 0 ? 'd-down' : 'd-flat')) + '">' + (delta > 0 ? '+' : '') + delta + '</i>' : '') + '</span>'
        : '<span class="sc-num sc-none">–</span><span class="sc-sub">尚未檢測</span>') +
      '</button>';
  }

  async function drawDetail() {
    var site = state.sites.filter(function (x) { return x.id === state.sel; })[0];
    var box = document.getElementById('d-detail');
    if (!site || !box) return;
    var type = pickTab(site), T = TYPES[type];
    var scans = site._scans[type], last = site._last[type], first = scans[0];
    var tok = ++state.token;
    var toolHref = '../' + T.tool + '?url=' + encodeURIComponent(site.url);
    var firstAny = site._scans.seo.concat(site._scans.geo).sort(function (x, y) { return +new Date(x.scanned_at) - +new Date(y.scanned_at); })[0];
    box.innerHTML =
      '<div class="det-head"><div><h2>' + esc(site.url) + '</h2><div class="det-sub">首次檢測 ' + esc(firstAny ? fmtDate(firstAny.scanned_at) : fmtDate(site.created_at)) + '</div></div>' +
      '<div class="mem-actions"><button class="m-btn danger sm" id="d-delsite">刪除此網站紀錄</button></div></div>' +
      '<div class="sc-cards" role="group" aria-label="選擇檢測類型">' + scoreCard(site, 'seo', type) + scoreCard(site, 'geo', type) + '</div>' +
      '<div class="det-act"><a class="m-btn primary sm" id="d-rescan" href="' + esc(toolHref) + '">' + (last ? '重新檢測 ' : '檢測 ') + esc(T.short) + '</a></div>' +
      (last ? '<h3 class="m-h3">' + esc(T.short) + ' 分數趨勢</h3>' + trendSvg(scans, T.name + '分數趨勢圖') + (scans.length === 1 ? '<p class="chk-note">再檢測一次，就能看到分數變化的曲線。</p>' : '')
            : '<p class="chk-note" style="margin-top:20px">這個網站還沒有' + esc(T.name) + '紀錄，按上方按鈕就能開始。</p>') +
      (type === 'geo' ? '<p class="chk-note">' + esc(DISCLAIMER) + '</p>' : '') +
      (last ? '<h3 class="m-h3">修正清單</h3><div id="d-chk"><p class="chk-note">載入中…</p></div>' : '') +
      (scans.length ? '<h3 class="m-h3">檢測紀錄</h3><div style="overflow-x:auto"><table class="scan-table"><thead><tr><th>時間</th><th>分數</th><th>變化</th></tr></thead><tbody>' +
        scans.slice().reverse().map(function (s) {
          var i = scans.indexOf(s), d = i > 0 ? s.score - scans[i - 1].score : null;
          return '<tr><td>' + esc(fmtDT(s.scanned_at)) + '</td><td class="' + scCls(s.score) + '"><b>' + s.score + '</b></td><td class="' + (d === null ? 'd-flat' : (d > 0 ? 'd-up' : (d < 0 ? 'd-down' : 'd-flat'))) + '">' + (d === null ? '—' : (d > 0 ? '+' + d : d)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '') +
      '<div class="mem-card mem-cta"><p>' + (type === 'geo' && last && last.score < 80
          ? '<b>AI 可見度還有改善空間，想有人直接幫你改？</b><br>LINE 約 15 分鐘，我幫你看這個網站最值得先處理的項目，免費。'
          : '<b>修正清單看不懂，或想有人直接幫你改？</b><br>LINE 約 15 分鐘，我幫你看這個網站最值得先處理的項目，免費。') + '</p>' +
      '<a class="m-btn primary" href="' + esc(LINE) + '" target="_blank" rel="noopener">' + (type === 'geo' && last && last.score < 80 ? '找 YC 幫你優化' : '免費 15 分鐘諮詢') + '</a></div>';
    Array.prototype.forEach.call(box.querySelectorAll('.sc-card'), function (b) {
      b.onclick = function () { state.tab[site.id] = b.getAttribute('data-tab'); drawDetail(); };
    });
    document.getElementById('d-delsite').onclick = function () { confirmDeleteSite(site); };
    if (!last) return;
    var rep = null;
    try { rep = await loadReport(site, type); } catch (e) { console.warn(e); }
    if (tok !== state.token) return;
    drawChecklist(site, rep, type);
  }

  function drawChecklist(site, rep, type) {
    var host = document.getElementById('d-chk'); if (!host) return;
    var issues = rep ? YC.issueList(rep, type) : [];
    if (!issues.length) { host.innerHTML = '<p class="chk-note">' + (rep ? '最近一次檢測沒有需要修正的項目，做得很好。' : '讀取檢測報告失敗，請重新整理再試一次。') + '</p>'; return; }
    var fixed = site.fixed_issues || {};
    function lv(l) { return l === 'high' ? '' : (l === 'low' ? 'l' : 'm'); }
    function lt(l) { return l === 'high' ? '高' : (l === 'low' ? '低' : '中'); }
    host.innerHTML = '<div class="chk-progress"><span id="chk-cnt"></span><span class="chk-bar"><i id="chk-bar"></i></span></div><ul class="chk-list">' +
      issues.map(function (i) {
        return '<li class="' + (fixed[i.key] ? 'done' : '') + '"><label><input type="checkbox" data-k="' + esc(i.key) + '"' + (fixed[i.key] ? ' checked' : '') + '>' +
          '<span class="lv ' + lv(i.level) + '">' + lt(i.level) + '</span><span><b>' + esc(i.title) + '</b>' + (i.detail ? '<small>' + esc(i.detail) + '</small>' : '') + '</span></label></li>';
      }).join('') + '</ul><p class="chk-note">改好後勾選；重新檢測時，仍有問題的項目會自動取消打勾。</p><div class="mem-msg" id="chk-msg" role="alert"></div>';
    function progress() {
      var done = issues.filter(function (i) { return fixed[i.key]; }).length;
      document.getElementById('chk-cnt').textContent = '已修正 ' + done + ' / ' + issues.length + ' 項';
      document.getElementById('chk-bar').style.width = Math.round(done / issues.length * 100) + '%';
    }
    progress();
    Array.prototype.forEach.call(host.querySelectorAll('input[type=checkbox]'), function (cb) {
      cb.onchange = async function () {
        var k = cb.getAttribute('data-k'), prev = Object.assign({}, fixed);
        var next = Object.assign({}, fixed); if (cb.checked) next[k] = true; else delete next[k];
        fixed = next; site.fixed_issues = next; cb.closest('li').classList.toggle('done', cb.checked); progress();
        var r = await YC.client.from('sites').update({ fixed_issues: next }).eq('id', site.id);
        if (r && r.error) {
          fixed = prev; site.fixed_issues = prev; cb.checked = !cb.checked; cb.closest('li').classList.toggle('done', cb.checked); progress();
          document.getElementById('chk-msg').textContent = '儲存失敗，請稍後再試。';
        } else { document.getElementById('chk-msg').textContent = ''; }
      };
    });
  }

  // ── 刪除 ──
  function confirmBox(title, text, okLabel, onOk) {
    var m = YC.modal('<button class="ycm-x" aria-label="關閉">×</button><h3>' + esc(title) + '</h3><p>' + text + '</p>' +
      '<button class="ycm-btn" id="cf-ok" style="border-color:#f0776b;color:#f0776b">' + esc(okLabel) + '</button><button class="ycm-btn" id="cf-no">取消</button><div class="ycm-err" id="cf-err" role="alert"></div>');
    m.querySelector('.ycm-x').onclick = m.querySelector('#cf-no').onclick = YC.closeModal;
    m.querySelector('#cf-ok').onclick = async function () {
      this.disabled = true; var err = m.querySelector('#cf-err'); err.textContent = '';
      try { await onOk(); } catch (e) { err.textContent = '操作失敗：' + (e && e.message || e); m.querySelector('#cf-ok').disabled = false; }
    };
  }
  function confirmDeleteSite(site) {
    confirmBox('刪除這個網站的紀錄？', '「' + esc(hostOf(site.url)) + '」的所有檢測紀錄（SEO 與 AI 可見度）與修正清單都會被刪除，無法復原。', '確定刪除', async function () {
      var r = await YC.client.from('sites').delete().eq('id', site.id);
      if (r.error) throw r.error;
      YC.closeModal(); state.sel = null; await load(); drawBody();
    });
  }
  function confirmDeleteAccount() {
    confirmBox('刪除帳號與所有資料？', '這會立即刪除你的帳號、所有網站、檢測紀錄與同意紀錄，<b>無法復原</b>。如果之後還想用，需要重新註冊。', '確定刪除我的帳號', async function () {
      state.deleted = true;
      try { await YC.deleteAccount(); } catch (e) { state.deleted = false; throw e; }
      YC.closeModal();
      root.innerHTML = '<div class="mem-card mem-empty"><h2>帳號與資料已刪除</h2><p>你的所有資料已從系統清除。謝謝你使用 YC AXIOM 的 SEO／GEO 檢測工具。</p><a class="m-btn" href="../">回到首頁</a></div>';
    });
  }

  // ── 入口 ──
  var rendering = false, again = false;
  async function render() {
    if (state.deleted) return;
    if (rendering) { again = true; return; }
    rendering = true;
    try {
      if (!YC.enabled) drawUnavailable();
      else if (!YC.loggedIn()) drawGuest();
      else if (!YC.consented()) drawNeedConsent();
      else {
        if (!document.getElementById('d-body')) { drawShell(); document.getElementById('d-body').innerHTML = '<div class="mem-card mem-empty" style="margin-top:20px"><p>載入中…</p></div>'; }
        await load(); drawBody();
      }
    } catch (e) {
      console.warn('dashboard', e);
      root.innerHTML = '<div class="mem-card mem-empty"><h2>讀取失敗</h2><p>請重新整理頁面再試一次。</p></div>';
    }
    rendering = false;
    if (again) { again = false; render(); }
  }
  YC.onChange(function () { if (state.deleted) return; if (!YC.loggedIn() || !YC.consented()) root.innerHTML = ''; render(); });
})();
