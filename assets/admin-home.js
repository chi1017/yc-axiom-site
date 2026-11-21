/* 管理後台「總覽」分頁：今天要處理的事、常用動作。
   只讀資料（管理員 RLS）；按下的動作都是既有功能（官網重新發布、每日檢查、到其他分頁篩選）。 */
(function () {
  'use strict';
  var YC = window.YC, box = document.getElementById('adm-home'), tabs = document.getElementById('adm-tabs');
  if (!YC || !box || !tabs) return;
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var st = { loaded: false, busy: false, data: null, at: null };
  var DAY = 86400000;

  function toast(t) {
    var el = document.getElementById('adm-toast');
    if (!el) { el = document.createElement('div'); el.id = 'adm-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.className = 'show'; clearTimeout(toast._t); toast._t = setTimeout(function () { el.className = ''; }, 2600);
  }
  async function fn(name, body) {
    var r = await YC.client.functions.invoke(name, { body: body });
    if (r.error) { var m = r.error.message || String(r.error); try { var j = await r.error.context.json(); m = j.message || m; } catch (e) { /* ignore */ } throw new Error(m); }
    return r.data || {};
  }

  async function load() {
    var now = Date.now();
    var res = await Promise.all([
      YC.client.from('admin_member_overview').select('member_id,email,created_at,status,latest_score,geo_score,last_scan_at,geo_scanned_at').order('created_at', { ascending: false }).limit(5000),
      YC.client.from('admin_rental_overview').select('id,slug,shop_name,status,days_left,paid_until,last_deploy_type,member_email,created_at').limit(2000),
      YC.client.from('site_code_reviews').select('site_id', { count: 'exact', head: true }).eq('status', 'pending')
    ]);
    if (res[0].error) throw res[0].error;
    var mem = res[0].data || [], rent = (res[1] && res[1].data) || [];
    var since = function (x, d) { return x && now - Date.parse(x) <= d * DAY; };
    st.data = {
      memToday: mem.filter(function (m) { return since(m.created_at, 1); }),
      mem7: mem.filter(function (m) { return since(m.created_at, 7); }).length,
      memTotal: mem.length,
      toContact: mem.filter(function (m) { return m.status === 'not_contacted' && (m.latest_score != null || m.geo_score != null); }),
      scans7: mem.filter(function (m) { return since(m.last_scan_at, 7) || since(m.geo_scanned_at, 7); }).length,
      pending: rent.filter(function (r) { return r.status === 'pending'; }),
      overdue: rent.filter(function (r) { return r.status === 'overdue'; }),
      soon: rent.filter(function (r) { return r.days_left != null && r.days_left >= 0 && r.days_left <= 7 && (r.status === 'live' || r.status === 'overdue'); }),
      failed: rent.filter(function (r) { return r.last_deploy_type === 'deploy_failed'; }),
      live: rent.filter(function (r) { return r.status === 'live'; }).length,
      rentTotal: rent.length,
      code: (res[2] && res[2].count) || 0
    };
    st.at = new Date(); st.loaded = true;
  }

  function goto(tab, filter) {
    var b = tabs.querySelector('[data-tab="' + tab + '"]'); if (!b) return;
    b.click();
    if (filter) setTimeout(function () { try { document.dispatchEvent(new CustomEvent('yc-admin-filter', { detail: { tab: tab, filter: filter } })); } catch (e) { /* ignore */ } }, 60);
  }

  function draw() {
    var d = st.data;
    if (!d) { box.innerHTML = '<div class="mem-card mem-empty"><p>載入中…</p></div>'; return; }
    var todo = [
      { n: d.pending.length, t: '待上線（確認收款後開通）', go: ['rental', { status: 'pending' }], tone: 'hi' },
      { n: d.failed.length, t: '客戶網站部署失敗', go: ['rental', { failedOnly: true }], tone: 'bad' },
      { n: d.code, t: '自訂程式碼等待審核', go: ['rental', {}], tone: 'hi' },
      { n: d.overdue.length, t: '逾期未續約', go: ['rental', { status: 'overdue' }], tone: 'bad' },
      { n: d.soon.length, t: '7 天內到期', go: ['rental', { due: '7' }], tone: 'mid' },
      { n: d.toContact.length, t: '做過檢測、還沒聯絡的會員', go: ['members', { status: 'not_contacted' }], tone: 'mid' }
    ];
    var open = todo.filter(function (x) { return x.n > 0; });
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    box.innerHTML =
      '<div class="ah-head"><p class="ah-sub">資料時間 ' + p2(st.at.getHours()) + ':' + p2(st.at.getMinutes()) + '</p><button type="button" class="m-btn sm" id="ah-reload">重新整理</button></div>' +
      '<section class="ah-sec" aria-labelledby="ah-h1"><h2 class="ah-h" id="ah-h1">待處理' + (open.length ? '（' + open.length + ' 類）' : '') + '</h2>' +
      (open.length ? '<div class="ah-todo">' + open.map(function (x, i) {
        return '<button type="button" class="ah-item ah-' + x.tone + '" data-i="' + i + '"><b>' + x.n + '</b><span>' + esc(x.t) + '</span><em aria-hidden="true">→</em></button>';
      }).join('') + '</div>' : '<p class="ah-ok">目前沒有待處理的事項。</p>') + '</section>' +
      '<section class="ah-sec" aria-labelledby="ah-h2"><h2 class="ah-h" id="ah-h2">常用動作</h2><div class="ah-acts">' +
      '<button type="button" class="ah-act" id="ah-pub"><b>重新發布官網</b><span>用目前的價格與顯示設定重新產生官網</span></button>' +
      '<button type="button" class="ah-act" id="ah-daily"><b>立即執行每日檢查</b><span>檢查早鳥、公告與官網是否為最新版</span></button>' +
      '<a class="ah-act" href="' + esc(YC.url('builder/') + '?new=1') + '" target="_blank" rel="noopener"><b>替客戶建立網站</b><span>做好後到「租用網站」轉移給客戶</span></a>' +
      '<a class="ah-act" href="' + esc(YC.url('quote/')) + '" target="_blank" rel="noopener"><b>開啟報價試算</b><span>和客戶一起勾選，印成報價單或複製到 LINE</span></a>' +
      '<button type="button" class="ah-act" data-go="prices"><b>改價格與活動</b><span>早鳥、公告列、報價試算單價、隱藏價錢</span></button>' +
      '<button type="button" class="ah-act" data-go="rental"><b>管理租用網站</b><span>搜尋、代客編輯、下載網站、批次重新發佈</span></button>' +
      '</div></section>' +
      '<section class="ah-sec" aria-labelledby="ah-h3"><h2 class="ah-h" id="ah-h3">數字</h2><div class="adm-chips ah-chips">' +
      '<button type="button" data-go="members"><b>' + d.memToday.length + '</b><span>今天新會員</span></button>' +
      '<button type="button" data-go="members"><b>' + d.mem7 + '</b><span>7 天內新會員</span></button>' +
      '<button type="button" data-go="members"><b>' + d.scans7 + '</b><span>7 天內做過檢測</span></button>' +
      '<button type="button" data-go="members"><b>' + d.memTotal + '</b><span>會員總數</span></button>' +
      '<button type="button" data-go="rental"><b>' + d.live + '</b><span>上線中的租用網站</span></button>' +
      '<button type="button" data-go="rental"><b>' + d.rentTotal + '</b><span>租用網站總數</span></button></div></section>' +
      (d.memToday.length ? '<section class="ah-sec" aria-labelledby="ah-h4"><h2 class="ah-h" id="ah-h4">今天新會員</h2><ul class="ah-list">' + d.memToday.slice(0, 8).map(function (m) { return '<li>' + esc(m.email) + '</li>'; }).join('') + '</ul></section>' : '');
    document.getElementById('ah-reload').onclick = refresh;
    Array.prototype.forEach.call(box.querySelectorAll('.ah-item'), function (b) { b.onclick = function () { var x = open[+b.getAttribute('data-i')]; goto(x.go[0], x.go[1]); }; });
    Array.prototype.forEach.call(box.querySelectorAll('[data-go]'), function (b) { b.onclick = function () { goto(b.getAttribute('data-go')); }; });
    document.getElementById('ah-pub').onclick = async function () {
      if (!window.confirm('用目前的設定重新發布官網？約 2–3 分鐘後全站更新。')) return;
      this.disabled = true;
      try { var r = await fn('site-settings', { action: 'publish' }); toast(r.message || '已開始重新產生官網，約 2–3 分鐘後全站更新。'); }
      catch (e) { toast('發布失敗：' + (e.message || e)); }
      this.disabled = false;
    };
    document.getElementById('ah-daily').onclick = async function () {
      this.disabled = true;
      try { var r = await fn('site-settings', { action: 'daily' }); toast(r.message || '每日檢查已執行'); }
      catch (e) { toast('執行失敗：' + (e.message || e)); }
      this.disabled = false;
    };
  }
  async function refresh() {
    if (st.busy) return; st.busy = true;
    try { await load(); } catch (e) { box.innerHTML = '<div class="mem-card mem-empty"><p>讀取失敗：' + esc(e.message || e) + '</p></div>'; st.busy = false; return; }
    st.busy = false; draw();
  }
  function show(on) {
    box.hidden = !on;
    if (on && YC.loggedIn && YC.loggedIn() && YC.isAdmin && YC.isAdmin()) { if (!st.loaded) { draw(); refresh(); } }
  }
  document.addEventListener('yc-admin-tab', function (e) { show(e.detail === 'home'); });
  // 登入為管理員後，沒有指定分頁就先看總覽
  var started = false;
  function start() {
    if (started || !YC.loggedIn || !YC.loggedIn() || !YC.isAdmin || !YC.isAdmin()) return;
    started = true;
    var h = location.hash.slice(1);
    if (!h || h === 'home') { var b = tabs.querySelector('[data-tab="home"]'); if (b) b.click(); }
  }
  // 手機版表格改成卡片：每格補上欄位名稱（從表頭抓）
  function label(scope) {
    Array.prototype.forEach.call((scope || document).querySelectorAll('.adm-table'), function (t) {
      var hs = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
      Array.prototype.forEach.call(t.querySelectorAll('tbody tr'), function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) { if (!td.hasAttribute('data-l') && hs[i]) td.setAttribute('data-l', hs[i]); });
      });
    });
  }
  var page = document.getElementById('page-admin');
  if (page && 'MutationObserver' in window) { var lt; new MutationObserver(function () { clearTimeout(lt); lt = setTimeout(function () { label(page); }, 30); }).observe(page, { childList: true, subtree: true }); }
  if (YC.onChange) YC.onChange(function () { setTimeout(start, 0); });
  setTimeout(start, 0);
})();
