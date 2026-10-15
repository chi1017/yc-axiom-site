/* 會員專區 /seo/dashboard/ ：網站列表、分數趨勢、修正清單、諮詢、刪除帳號 */
(function () {
  'use strict';
  var YC = window.YC, root = document.getElementById('dash-root');
  if (!YC || !root) return;
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var LINE = YC.LINE_URL;
  var state = { sites: [], scans: {}, sel: null, reports: {}, token: 0, deleted: false };

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
  function drawUnavailable() { empty('會員功能即將開放', '登入與檢測紀錄功能正在準備中，請稍後再來。', '<a class="m-btn" href="../">回到 SEO 檢測工具</a>'); }

  // ── 資料載入 ──
  async function load() {
    var c = YC.client;
    var s = await c.from('sites').select('id,url,fixed_issues,created_at').order('created_at', { ascending: false });
    if (s.error) throw s.error;
    var sc = await c.from('scans').select('id,site_id,score,top_issues,scanned_at').order('scanned_at', { ascending: true }).limit(2000);
    if (sc.error) throw sc.error;
    state.sites = s.data || []; state.scans = {};
    (sc.data || []).forEach(function (r) { (state.scans[r.site_id] = state.scans[r.site_id] || []).push(r); });
    state.sites.forEach(function (x) { x._scans = state.scans[x.id] || []; x._last = x._scans.length ? x._scans[x._scans.length - 1] : null; });
    state.sites.sort(function (a, b) { return (b._last ? +new Date(b._last.scanned_at) : 0) - (a._last ? +new Date(a._last.scanned_at) : 0); });
  }
  async function loadReport(site) {
    if (!site._last) return null;
    if (state.reports[site._last.id]) return state.reports[site._last.id];
    var r = await YC.client.from('scans').select('report').eq('id', site._last.id).maybeSingle();
    var rep = r.data && r.data.report;
    if (rep) state.reports[site._last.id] = rep;
    return rep || null;
  }

  // ── 主畫面 ──
  function drawShell() {
    var mail = YC.session.user.email || '';
    root.innerHTML =
      '<div class="mem-bar"><div class="mem-who">登入身分：' + esc(mail) + '</div>' +
      '<div class="mem-actions"><a class="m-btn" href="../">檢測新網站</a>' +
      '<a class="m-btn primary" href="' + esc(LINE) + '" target="_blank" rel="noopener">免費 15 分鐘諮詢</a>' +
      '<button class="m-btn" id="d-logout">登出</button></div></div>' +
      '<div id="d-body"></div>' +
      '<div class="mem-danger"><p>想停止使用？可刪除帳號與全部資料（網站、檢測紀錄、同意紀錄），立即清除、無法復原。詳見<a href="../../privacy/">隱私權政策</a>。</p>' +
      '<button class="m-btn danger sm" id="d-delacc">刪除我的帳號與所有資料</button></div>';
    document.getElementById('d-logout').onclick = function () { YC.signOut(); };
    document.getElementById('d-delacc').onclick = confirmDeleteAccount;
  }
  function drawBody() {
    var body = document.getElementById('d-body');
    if (!state.sites.length) {
      body.innerHTML = '<div class="mem-card mem-empty" style="margin-top:20px"><h2>還沒有檢測紀錄</h2><p>到 SEO 檢測工具輸入網址，分析完成後會自動存到這裡。</p><a class="m-btn primary" href="../">開始檢測</a></div>';
      return;
    }
    if (!state.sel || !state.sites.some(function (x) { return x.id === state.sel; })) state.sel = state.sites[0].id;
    body.innerHTML = '<div class="mem-grid"><div class="mem-sites" id="d-sites"></div><div class="mem-card" id="d-detail"></div></div>';
    drawSites(); drawDetail();
  }
  function drawSites() {
    var box = document.getElementById('d-sites');
    box.innerHTML = state.sites.map(function (x) {
      var l = x._last;
      return '<button class="site-item" data-id="' + esc(x.id) + '" aria-current="' + (x.id === state.sel) + '">' +
        '<span class="si-url">' + esc(hostOf(x.url)) + '</span>' +
        '<span class="si-score ' + (l ? scCls(l.score) : '') + '">' + (l ? l.score : '–') + '</span>' +
        '<span class="si-meta">' + x._scans.length + ' 次檢測' + (l ? '・' + esc(fmtDate(l.scanned_at)) : '') + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.site-item'), function (b) {
      b.onclick = function () { state.sel = b.getAttribute('data-id'); drawSites(); drawDetail(); };
    });
  }

  function trendSvg(scans) {
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
    return '<svg class="trend" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="分數趨勢圖">' + g + line + dots + xl + '</svg>';
  }

  async function drawDetail() {
    var site = state.sites.filter(function (x) { return x.id === state.sel; })[0];
    var box = document.getElementById('d-detail');
    if (!site || !box) return;
    var scans = site._scans, last = site._last;
    var first = scans[0], delta = last && first && scans.length > 1 ? last.score - first.score : null;
    var tok = ++state.token;
    box.innerHTML =
      '<div class="det-head"><div><h2>' + esc(site.url) + '</h2><div class="det-sub">首次檢測 ' + esc(last ? fmtDate(first.scanned_at) : fmtDate(site.created_at)) + '</div></div>' +
      '<div class="mem-actions"><button class="m-btn primary sm" id="d-rescan">重新檢測這個網站</button><button class="m-btn danger sm" id="d-delsite">刪除此網站紀錄</button></div></div>' +
      (last ? '<div class="det-stats"><div><b class="' + scCls(last.score) + '">' + last.score + '</b><span>最新分數</span></div><div><b>' + scans.length + '</b><span>檢測次數</span></div>' +
        (delta !== null ? '<div><b class="' + (delta > 0 ? 'd-up' : (delta < 0 ? 'd-down' : 'd-flat')) + '">' + (delta > 0 ? '+' : '') + delta + '</b><span>與首次相比</span></div>' : '') + '</div>' +
        '<h3 class="m-h3">分數趨勢</h3>' + trendSvg(scans) + (scans.length === 1 ? '<p class="chk-note">再檢測一次，就能看到分數變化的曲線。</p>' : '') : '<p class="chk-note">這個網站還沒有檢測紀錄。</p>') +
      '<h3 class="m-h3">修正清單</h3><div id="d-chk"><p class="chk-note">載入中…</p></div>' +
      (scans.length ? '<h3 class="m-h3">檢測紀錄</h3><div style="overflow-x:auto"><table class="scan-table"><thead><tr><th>時間</th><th>分數</th><th>變化</th></tr></thead><tbody>' +
        scans.slice().reverse().map(function (s) {
          var i = scans.indexOf(s), d = i > 0 ? s.score - scans[i - 1].score : null;
          return '<tr><td>' + esc(fmtDT(s.scanned_at)) + '</td><td class="' + scCls(s.score) + '"><b>' + s.score + '</b></td><td class="' + (d === null ? 'd-flat' : (d > 0 ? 'd-up' : (d < 0 ? 'd-down' : 'd-flat'))) + '">' + (d === null ? '—' : (d > 0 ? '+' + d : d)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '') +
      '<div class="mem-card mem-cta"><p><b>修正清單看不懂，或想有人直接幫你改？</b><br>LINE 約 15 分鐘，我幫你看這個網站最值得先處理的項目，免費。</p>' +
      '<a class="m-btn primary" href="' + esc(LINE) + '" target="_blank" rel="noopener">免費 15 分鐘諮詢</a></div>';
    document.getElementById('d-rescan').onclick = function () { try { sessionStorage.setItem('yc_resume_url', site.url); } catch (e) {} location.href = '../'; };
    document.getElementById('d-delsite').onclick = function () { confirmDeleteSite(site); };
    if (!last) { document.getElementById('d-chk').innerHTML = '<p class="chk-note">—</p>'; return; }
    var rep = null;
    try { rep = await loadReport(site); } catch (e) { console.warn(e); }
    if (tok !== state.token) return;
    drawChecklist(site, rep);
  }

  function drawChecklist(site, rep) {
    var host = document.getElementById('d-chk'); if (!host) return;
    var issues = rep ? YC.issueList(rep) : [];
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
    confirmBox('刪除這個網站的紀錄？', '「' + esc(hostOf(site.url)) + '」的所有檢測紀錄與修正清單都會被刪除，無法復原。', '確定刪除', async function () {
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
      root.innerHTML = '<div class="mem-card mem-empty"><h2>帳號與資料已刪除</h2><p>你的所有資料已從系統清除。謝謝你使用 YC AXIOM 的 SEO 檢測工具。</p><a class="m-btn" href="../../">回到首頁</a></div>';
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
