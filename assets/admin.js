/* 管理後台 /admin/ ：會員列表、跟進狀態、備註、檢測報告
   前端只負責顯示；誰能讀寫由資料庫 RLS（JWT app_metadata.role = 'admin'）決定。 */
(function () {
  'use strict';
  var YC = window.YC, root = document.getElementById('adm-root');
  if (!YC || !root) return;
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var STATUS = { not_contacted: '未聯絡', contacted: '已聯絡', negotiating: '洽談中', won: '已成交', not_fit: '不適合' };
  var STATUS_KEYS = Object.keys(STATUS);
  var state = { rows: [], q: '', status: 'all', score: 'all', geoScore: 'all', sort: 'last_desc', detail: null, loaded: false };
  var DISCLAIMER = '這些是提高被 AI 引用機會的因素，無法保證被 AI 推薦。';

  function scCls(n) { return n >= 80 ? 'sc-good' : (n >= 60 ? 'sc-mid' : 'sc-bad'); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDT(s) { var d = new Date(s); return isNaN(d) ? '' : d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function fmtD(s) { var d = new Date(s); return isNaN(d) ? '' : d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); }
  function msg(title, text, btn) { root.innerHTML = '<div class="mem-card mem-empty"><h2>' + esc(title) + '</h2><p>' + text + '</p>' + (btn || '') + '</div>'; }

  // ── 入口狀態 ──
  function drawGuest() {
    msg('管理後台', '請使用管理員帳號登入。', '<button class="m-btn primary" id="a-login">使用 Google 登入</button>');
    document.getElementById('a-login').onclick = function () { YC.openLogin({ title: '管理員登入', reason: '請使用管理員的 Google 帳號登入。' }); };
  }
  function drawDenied() {
    msg('沒有權限', '這個帳號不是管理員，無法使用管理後台。', '<button class="m-btn" id="a-out">登出</button> <a class="m-btn" href="../">回到首頁</a>');
    document.getElementById('a-out').onclick = function () { YC.signOut(); };
  }

  // ── 資料 ──
  async function load() {
    var r = await YC.client.from('admin_member_overview').select('*').order('created_at', { ascending: false }).limit(5000);
    if (r.error) throw r.error;
    state.rows = (r.data || []).map(function (x) { x.status = x.status || 'not_contacted'; x.notes = x.notes || ''; return x; });
    state.loaded = true;
  }

  // ── 篩選 / 排序 ──
  function scoreOk(r, f, s) {
    if (f === 'all') return true;
    if (f === 'none') return s == null;
    if (s == null) return false;
    if (f === 'lt70') return s < 70;
    if (f === '70_79') return s >= 70 && s < 80;
    if (f === 'ge80') return s >= 80;
    return true;
  }
  function view() {
    var q = state.q.trim().toLowerCase();
    var rows = state.rows.filter(function (r) {
      if (state.status !== 'all' && r.status !== state.status) return false;
      if (!scoreOk(r, state.score, r.latest_score) || !scoreOk(r, state.geoScore, r.geo_score)) return false;

      if (q && (String(r.email).toLowerCase().indexOf(q) < 0 && String(r.site_url || r.geo_site_url || '').toLowerCase().indexOf(q) < 0 && String(r.notes || '').toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var t = function (x) { return x ? +new Date(x) : 0; };
    var lastAny = function (r) { return Math.max(t(r.last_scan_at), t(r.geo_scanned_at)); };      // SEO 與 AI 可見度中較新的一次
    var by = {
      last_desc: function (a, b) { return lastAny(b) - lastAny(a); },
      last_asc: function (a, b) { return (lastAny(a) || Infinity) - (lastAny(b) || Infinity); },
      score_asc: function (a, b) { return (a.latest_score == null ? 999 : a.latest_score) - (b.latest_score == null ? 999 : b.latest_score); },
      score_desc: function (a, b) { return (b.latest_score == null ? -1 : b.latest_score) - (a.latest_score == null ? -1 : a.latest_score); },
      geo_asc: function (a, b) { return (a.geo_score == null ? 999 : a.geo_score) - (b.geo_score == null ? 999 : b.geo_score); },
      geo_desc: function (a, b) { return (b.geo_score == null ? -1 : b.geo_score) - (a.geo_score == null ? -1 : a.geo_score); },
      joined_desc: function (a, b) { return t(b.created_at) - t(a.created_at); }
    };
    return rows.sort(by[state.sort] || by.last_desc);
  }

  // ── 畫面：列表 ──
  function drawShell() {
    root.innerHTML =
      '<div class="mem-bar"><div class="mem-who">管理員：' + esc(YC.session.user.email || '') + '</div>' +
      '<div class="mem-actions"><button class="m-btn sm" id="a-refresh">重新整理</button><button class="m-btn sm" id="a-csv">匯出 CSV</button><button class="m-btn sm" id="a-logout">登出</button></div></div>' +
      '<div id="a-main"></div>';
    document.getElementById('a-logout').onclick = function () { YC.signOut(); };
    document.getElementById('a-refresh').onclick = async function () { try { await load(); } catch (e) { return toast('讀取失敗'); } state.detail ? drawDetail(state.detail) : drawList(); toast('已更新'); };
    document.getElementById('a-csv').onclick = exportCsv;
  }
  function chips() {
    var n = state.rows.length, low = state.rows.filter(function (r) { return r.latest_score != null && r.latest_score < 70; }).length;
    var lowGeo = state.rows.filter(function (r) { return r.geo_score != null && r.geo_score < 70; }).length;
    var fresh = state.rows.filter(function (r) { return r.status === 'not_contacted' && (r.latest_score != null || r.geo_score != null); }).length;
    return '<div class="adm-chips"><div><b>' + n + '</b><span>會員總數</span></div><div><b class="sc-bad">' + low + '</b><span>SEO 最新分數低於 70</span></div><div><b class="sc-bad">' + lowGeo + '</b><span>AI 可見度低於 70</span></div><div><b>' + fresh + '</b><span>有檢測、尚未聯絡</span></div></div>';
  }
  function statusSelect(r, cls) {
    return '<select class="adm-st st-' + esc(r.status) + ' ' + (cls || '') + '" data-id="' + esc(r.member_id) + '" aria-label="跟進狀態">' +
      STATUS_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('') + '</select>';
  }
  function drawList() {
    state.detail = null;
    var main = document.getElementById('a-main'); if (!main) return;
    if (!document.getElementById('a-tbody')) {
      main.innerHTML = '<div id="a-chips">' + chips() + '</div>' +
        '<div class="adm-tools">' +
        '<input type="search" id="f-q" placeholder="搜尋 Email、網址、備註" value="' + esc(state.q) + '">' +
        '<select id="f-status"><option value="all">狀態：全部</option>' + STATUS_KEYS.map(function (k) { return '<option value="' + k + '">' + STATUS[k] + '</option>'; }).join('') + '</select>' +
        '<select id="f-score"><option value="all">SEO 分數：全部</option><option value="lt70">SEO 低於 70</option><option value="70_79">SEO 70–79</option><option value="ge80">SEO 80 以上</option><option value="none">SEO 尚未檢測</option></select>' +
        '<select id="f-geo"><option value="all">AI 分數：全部</option><option value="lt70">AI 低於 70</option><option value="70_79">AI 70–79</option><option value="ge80">AI 80 以上</option><option value="none">AI 尚未檢測</option></select>' +
        '<select id="f-sort"><option value="last_desc">最後檢測：新到舊</option><option value="last_asc">最後檢測：舊到新</option><option value="score_asc">SEO 分數：低到高</option><option value="score_desc">SEO 分數：高到低</option><option value="geo_asc">AI 分數：低到高</option><option value="geo_desc">AI 分數：高到低</option><option value="joined_desc">註冊時間：新到舊</option></select>' +
        '<span id="a-count" class="adm-count"></span></div>' +
        '<div class="adm-wrap"><table class="adm-table"><thead><tr><th>Email／登入方式</th><th>網站</th><th>SEO 分</th><th>AI 分</th><th>SEO 前 3 大問題</th><th>AI 前 3 大問題</th><th>次數</th><th>最後檢測</th><th>跟進狀態</th><th>備註</th></tr></thead><tbody id="a-tbody"></tbody></table></div>';
      document.getElementById('f-status').value = state.status; document.getElementById('f-score').value = state.score; document.getElementById('f-geo').value = state.geoScore; document.getElementById('f-sort').value = state.sort;
      document.getElementById('f-q').oninput = function () { state.q = this.value; drawRows(); };
      document.getElementById('f-status').onchange = function () { state.status = this.value; drawRows(); };
      document.getElementById('f-score').onchange = function () { state.score = this.value; drawRows(); };
      document.getElementById('f-geo').onchange = function () { state.geoScore = this.value; drawRows(); };
      document.getElementById('f-sort').onchange = function () { state.sort = this.value; drawRows(); };
    }
    drawRows();
  }
  function drawRows() {
    var rows = view(), tb = document.getElementById('a-tbody'); if (!tb) return;
    document.getElementById('a-chips').innerHTML = chips();
    document.getElementById('a-count').textContent = '顯示 ' + rows.length + ' / ' + state.rows.length + ' 位';
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="10" class="adm-none">沒有符合條件的會員</td></tr>'; return; }
    tb.innerHTML = rows.map(function (r) {
      var issues = (r.top_issues || []).map(function (i) { return '<li>' + esc(i.title) + '</li>'; }).join('');
      var gIssues = (r.geo_top_issues || []).map(function (i) { return '<li>' + esc(i.title) + '</li>'; }).join('');
      var site = r.site_url || r.geo_site_url || '';
      var lastAt = [r.last_scan_at, r.geo_scanned_at].filter(Boolean).sort().pop();
      return '<tr data-id="' + esc(r.member_id) + '">' +
        '<td><a href="#" class="adm-mem" data-id="' + esc(r.member_id) + '">' + esc(r.email) + '</a><div class="adm-sub"><span class="adm-badge">' + (r.provider === 'google' ? 'Google' : 'Email') + '</span>' + (r.consented_at ? '' : '<span class="adm-badge warn">未同意</span>') + '<span>' + esc(fmtD(r.created_at)) + ' 註冊</span></div></td>' +
        '<td class="adm-url">' + (site ? '<a href="' + esc(site) + '" target="_blank" rel="noopener noreferrer">' + esc(site.replace(/^https?:\/\//, '')) + '</a>' + (r.site_count > 1 ? '<div class="adm-sub">共 ' + r.site_count + ' 個網站</div>' : '') : '<span class="adm-sub">—</span>') + '</td>' +
        '<td class="adm-score ' + (r.latest_score != null ? scCls(r.latest_score) : '') + '">' + (r.latest_score != null ? r.latest_score : '—') + '</td>' +
        '<td class="adm-score ' + (r.geo_score != null ? scCls(r.geo_score) : '') + '">' + (r.geo_score != null ? r.geo_score : '—') + '</td>' +
        '<td>' + (issues ? '<ol class="adm-issues">' + issues + '</ol>' : '<span class="adm-sub">—</span>') + '</td>' +
        '<td>' + (gIssues ? '<ol class="adm-issues">' + gIssues + '</ol>' : '<span class="adm-sub">—</span>') + '</td>' +
        '<td class="adm-num">SEO ' + (r.scan_count || 0) + '<br>AI ' + (r.geo_scan_count || 0) + '</td>' +
        '<td class="adm-time">' + (lastAt ? esc(fmtDT(lastAt)) : '—') + '</td>' +
        '<td>' + statusSelect(r) + '</td>' +
        '<td>' + notesBox(r, 2) + '</td></tr>';
    }).join('');
    bindEditors(tb);
    Array.prototype.forEach.call(tb.querySelectorAll('.adm-mem'), function (a) { a.onclick = function (e) { e.preventDefault(); openDetail(a.getAttribute('data-id')); }; });
  }

  // ── 狀態 / 備註（列表與詳細頁共用）──
  function notesBox(r, rows) {
    return '<textarea class="adm-notes" data-id="' + esc(r.member_id) + '" rows="' + rows + '" maxlength="5000" placeholder="備註…" aria-label="備註">' + esc(r.notes) + '</textarea><span class="adm-saved" data-for="' + esc(r.member_id) + '"></span>';
  }
  function findRow(id) { return state.rows.filter(function (r) { return r.member_id === id; })[0]; }
  async function saveLead(id, patch) {
    var res = await YC.client.from('leads').update(patch).eq('member_id', id).select('member_id');
    if (res.error) throw res.error;
    if (!res.data || !res.data.length) throw new Error('沒有更新到任何資料（權限不足或該會員沒有跟進紀錄）');
  }
  var timers = {};
  function bindEditors(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll('select.adm-st'), function (sel) {
      sel.onchange = async function () {
        var id = sel.getAttribute('data-id'), r = findRow(id), prev = r.status, next = sel.value;
        r.status = next; sel.className = sel.className.replace(/st-\w+/, 'st-' + next);
        try { await saveLead(id, { status: next }); toast('狀態已更新'); if (state.status !== 'all' && !state.detail) drawRows(); else if (document.getElementById('a-chips')) document.getElementById('a-chips').innerHTML = chips(); }
        catch (e) { r.status = prev; sel.value = prev; sel.className = sel.className.replace(/st-\w+/, 'st-' + prev); toast('儲存失敗：' + (e.message || e)); }
      };
    });
    Array.prototype.forEach.call(scope.querySelectorAll('textarea.adm-notes'), function (ta) {
      var id = ta.getAttribute('data-id'), tag = scope.querySelector('.adm-saved[data-for="' + id + '"]');
      var flush = async function () {
        clearTimeout(timers[id]); var r = findRow(id); if (!r || ta.value === r.notes && !ta.dataset.dirty) return;
        var val = ta.value; if (tag) tag.textContent = '儲存中…';
        try { await saveLead(id, { notes: val }); r.notes = val; delete ta.dataset.dirty; if (tag) { tag.textContent = '已儲存'; setTimeout(function () { if (tag.textContent === '已儲存') tag.textContent = ''; }, 1800); } }
        catch (e) { if (tag) tag.textContent = '儲存失敗'; toast('備註儲存失敗：' + (e.message || e)); }
      };
      ta.oninput = function () { ta.dataset.dirty = '1'; if (tag) tag.textContent = ''; clearTimeout(timers[id]); timers[id] = setTimeout(flush, 900); };
      ta.onblur = flush;
    });
  }
  function toast(t) {
    var el = document.getElementById('adm-toast');
    if (!el) { el = document.createElement('div'); el.id = 'adm-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.className = 'show'; clearTimeout(toast._t); toast._t = setTimeout(function () { el.className = ''; }, 2400);
  }

  // ── CSV ──
  function exportCsv() {
    var rows = view(), q = function (v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = ['Email', '登入方式', '網站', 'SEO最新分數', 'SEO前3大問題', 'AI可見度最新分數', 'AI前3大問題', 'SEO檢測次數', 'AI檢測次數', '最後檢測', '跟進狀態', '備註'];
    var lines = [head.map(q).join(',')].concat(rows.map(function (r) {
      var lastAt = [r.last_scan_at, r.geo_scanned_at].filter(Boolean).sort().pop();
      return [r.email, r.provider, r.site_url || r.geo_site_url, r.latest_score, (r.top_issues || []).map(function (i) { return i.title; }).join(' / '), r.geo_score, (r.geo_top_issues || []).map(function (i) { return i.title; }).join(' / '), r.scan_count, r.geo_scan_count || 0, lastAt ? fmtDT(lastAt) : '', STATUS[r.status], r.notes].map(q).join(',');
    }));
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'yc-axiom-members.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ── 詳細頁 ──
  async function openDetail(id) {
    var r = findRow(id); if (!r) return;
    state.detail = id;
    var main = document.getElementById('a-main');
    main.innerHTML = '<div class="mem-card"><p class="chk-note">載入中…</p></div>';
    try {
      var s = await YC.client.from('sites').select('id,url,fixed_issues,created_at').eq('member_id', id).order('created_at', { ascending: false });
      if (s.error) throw s.error;
      var sites = s.data || [], scans = [];
      if (sites.length) {
        var ids = sites.map(function (x) { return x.id; });
        var sc = await YC.client.from('scans').select('id,site_id,type,score,top_issues,scanned_at').in('site_id', ids).order('scanned_at', { ascending: false }).limit(1000);
        if (sc.error) sc = await YC.client.from('scans').select('id,site_id,score,top_issues,scanned_at').in('site_id', ids).order('scanned_at', { ascending: false }).limit(1000);   // 資料庫尚未升級（無 type 欄位）
        if (sc.error) throw sc.error; scans = (sc.data || []).map(function (x) { x.type = x.type === 'geo' ? 'geo' : 'seo'; return x; });
      }
      r._sites = sites; r._scans = scans;
    } catch (e) { main.innerHTML = '<div class="mem-card mem-empty"><h2>讀取失敗</h2><p>' + esc(e.message || e) + '</p><button class="m-btn" id="a-back0">回列表</button></div>'; document.getElementById('a-back0').onclick = drawList; return; }
    drawDetail(id);
  }
  function drawDetail(id) {
    var r = findRow(id), main = document.getElementById('a-main'); if (!r || !main) return drawList();
    var sites = r._sites || [], scans = r._scans || [];
    main.innerHTML =
      '<button class="m-btn sm" id="a-back">← 回會員列表</button>' +
      '<div class="mem-card" style="margin-top:14px"><div class="det-head"><div><h2>' + esc(r.email) + '</h2><div class="det-sub">' + (r.provider === 'google' ? 'Google 登入' : 'Email 登入') + '・' + esc(fmtD(r.created_at)) + ' 註冊・' + (r.consented_at ? esc(fmtD(r.consented_at)) + ' 同意保存紀錄' : '<b style="color:#fbbf24">尚未同意</b>') + '</div></div>' +
      '<div class="adm-lead">' + statusSelect(r) + '</div></div>' +
      '<h3 class="m-h3">備註</h3>' + notesBox(r, 4) +
      '<h3 class="m-h3">網站與檢測紀錄（' + sites.length + ' 個網站、' + scans.length + ' 次檢測）</h3>' +
      (sites.length ? sites.map(function (st) {
        var ss = scans.filter(function (x) { return x.site_id === st.id; }), fx = Object.keys(st.fixed_issues || {}).length;
        return '<div class="adm-site"><div class="adm-site-h"><a href="' + esc(st.url) + '" target="_blank" rel="noopener noreferrer">' + esc(st.url) + '</a><span class="adm-sub">已勾選修正 ' + fx + ' 項</span></div><div class="adm-scans">' +
          (ss.length ? ss.map(function (x) { return '<button class="adm-scan" data-id="' + esc(x.id) + '"><em class="adm-type ' + x.type + '">' + (x.type === 'geo' ? 'AI' : 'SEO') + '</em><b class="' + scCls(x.score) + '">' + x.score + '</b><span>' + esc(fmtDT(x.scanned_at)) + '</span></button>'; }).join('') : '<span class="adm-sub">尚無檢測</span>') + '</div></div>';
      }).join('') : '<p class="chk-note">這位會員還沒有檢測紀錄。</p>') +
      '<div id="a-report"></div></div>';
    document.getElementById('a-back').onclick = drawList;
    bindEditors(main);
    Array.prototype.forEach.call(main.querySelectorAll('.adm-scan'), function (b) { b.onclick = function () { showReport(b.getAttribute('data-id'), scans); }; });
    if (scans.length) showReport(scans[0].id, scans);
  }
  async function showReport(scanId, scans) {
    var box = document.getElementById('a-report'); if (!box) return;
    Array.prototype.forEach.call(document.querySelectorAll('.adm-scan'), function (b) { b.setAttribute('aria-current', String(b.getAttribute('data-id') === scanId)); });
    box.innerHTML = '<h3 class="m-h3">檢測報告</h3><p class="chk-note">載入中…</p>';
    var res = await YC.client.from('scans').select('id,score,scanned_at,report').eq('id', scanId).maybeSingle();
    var sType = (scans.filter(function (x) { return x.id === scanId; })[0] || {}).type === 'geo' ? 'geo' : 'seo';
    if (!res.data) { box.innerHTML = '<h3 class="m-h3">檢測報告</h3><p class="chk-note">讀取失敗。</p>'; return; }
    var rep = res.data.report || {}, sc = res.data;
    var checks = sType === 'geo' ? (rep.items || []).filter(function (i) { return i.status === 'pass' || i.status === 'warn' || i.status === 'fail'; }).map(function (i) { return { title: i.title, status: i.status, detail: i.note }; }) : (rep.checks || []);
    var groups = [['fail', '需修復'], ['warn', '警告'], ['pass', '通過']].map(function (g) {
      var items = checks.filter(function (c) { return c.status === g[0]; });
      return items.length ? '<h4 class="adm-h4">' + g[1] + '（' + items.length + '）</h4><ul class="adm-checks st-' + g[0] + '">' + items.map(function (c) { return '<li><b>' + esc(c.title) + '</b>' + (c.detail ? '<small>' + esc(c.detail) + '</small>' : '') + '</li>'; }).join('') + '</ul>' : '';
    }).join('');
    var acts = YC.issueList(rep, sType);
    box.innerHTML = '<h3 class="m-h3">檢測報告</h3>' +
      '<div class="adm-rep-head"><div class="adm-rep-score ' + scCls(sc.score) + '">' + sc.score + '</div><div><b>' + (sType === 'geo' ? 'AI 可見度（GEO）・' + esc(rep.gradeLabel || '') : esc(rep.scoreTitle || '')) + '</b><div class="adm-sub">' + esc(fmtDT(sc.scanned_at)) + '</div><p class="adm-sum">' + esc(sType === 'geo' ? DISCLAIMER : (rep.summary || '')) + '</p></div></div>' +
      (sType === 'geo' && (rep.categories || []).length ? '<div class="adm-metrics">' + rep.categories.map(function (c) { return '<span class="mp ' + (c.score == null ? '' : (c.score >= 80 ? 'pass' : (c.score >= 50 ? 'warn' : 'fail'))) + '">' + esc(c.id + '. ' + c.name) + ' ' + (c.countedMax ? Math.round(c.earned * 10) / 10 + '/' + c.countedMax : '—') + '</span>'; }).join('') + '</div>' : '') +
      ((rep.metrics || []).length ? '<div class="adm-metrics">' + rep.metrics.map(function (m) { return '<span class="mp ' + esc(m.status) + '">' + (m.status === 'pass' ? '✓' : (m.status === 'warn' ? '!' : '✗')) + ' ' + esc(m.label) + '</span>'; }).join('') + '</div>' : '') +
      (acts.length ? '<h4 class="adm-h4">改善建議（' + acts.length + '）</h4><ol class="adm-acts">' + acts.map(function (a) { return '<li><span class="lv ' + (a.level === 'high' ? '' : (a.level === 'low' ? 'l' : 'm')) + '">' + (a.level === 'high' ? '高' : (a.level === 'low' ? '低' : '中')) + '</span><span><b>' + esc(a.title) + '</b>' + (a.detail ? '<small>' + esc(a.detail) + '</small>' : '') + '</span></li>'; }).join('') + '</ol>' : '') +
      groups + '<details class="adm-raw"><summary>原始報告資料（JSON）</summary><pre>' + esc(JSON.stringify(rep, null, 2)).slice(0, 200000) + '</pre></details>';
  }

  // ── 啟動 ──
  var busy = false, again = false;
  async function render() {
    if (busy) { again = true; return; } busy = true;
    try {
      if (!YC.enabled) msg('管理後台', '會員系統尚未啟用。');
      else if (!YC.loggedIn()) { state.loaded = false; drawGuest(); }
      else if (!YC.isAdmin()) { state.rows = []; state.loaded = false; drawDenied(); }
      else if (!state.loaded) { msg('管理後台', '載入中…'); await load(); drawShell(); drawList(); }
    } catch (e) { console.warn('admin', e); msg('讀取失敗', '請重新整理頁面再試一次。'); }
    busy = false; if (again) { again = false; render(); }
  }
  YC.onChange(function () { render(); });
})();
