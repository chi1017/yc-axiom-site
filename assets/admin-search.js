/* 管理後台全域搜尋：一個框同時找
   1. 租用網站（店名、網址代稱、會員 Email、網址、自訂網域）→ 打開網站詳情
   2. 會員與名單（Email、檢測網址、備註）→ 切到會員分頁並帶入搜尋
   3. 收款紀錄（匯款末五碼／備註、金額、日期）→ 打開該網站
   4. 後台設定與按鈕（例如「隱藏價錢」「早鳥」「功能開關」）→ 直接帶到那一段
   資料只在第一次使用時讀取；誰能讀由資料庫 RLS（管理員）決定。 */
(function () {
  'use strict';
  var YC = window.YC;
  var tabs = document.getElementById('adm-tabs');
  if (!YC || !tabs) return;
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var STATUS = { draft: '草稿', pending: '待上線', live: '上線中', overdue: '逾期', suspended: '已暫停', cancelled: '已終止' };

  // 後台設定與常用動作（關鍵字可以用口語）
  var PLACES = [
    ['隱藏官網所有價錢', '價格 價錢 隱藏 洽詢 報價', 'prices', 'ps-h0'],
    ['關閉官網所有聯絡方式', '聯絡 LINE Email IG 表單 關閉 暫停諮詢', 'prices', 'ps-h0'],
    ['隱私權政策的聯絡方式', '隱私 個資 聯絡', 'prices', 'ps-h0'],
    ['方案價格（一般價格）', '價格 月租 年繳 一頁版 多頁版 進階 方案', 'prices', 'ps-h1'],
    ['早鳥活動', '早鳥 優惠 截止 折扣', 'prices', 'ps-h2'],
    ['頂部公告列', '公告 橫幅 bar 活動', 'prices', 'ps-h3'],
    ['滑出卡片', '卡片 彈出 促銷', 'prices', 'ps-h4'],
    ['價格修改紀錄', '紀錄 歷史 還原 修改', 'prices', 'ps-h5'],
    ['匯款與方案設定', '匯款 銀行 帳號 戶名 轉帳 收款', 'rental', '#rn-settings'],
    ['排程模擬（到期提醒、自動暫停）', '排程 模擬 提醒 到期 暫停 cron', 'rental', '#rn-simbtn'],
    ['只看部署失敗的網站', '部署 失敗 錯誤', 'rental', '#rn-fail'],
    ['個別客戶的功能開關', '功能 開關 開通 頁尾 製作標示 進階 預約 行事曆 程式碼 協作 共同編輯 線上購買 作品集 文章 英文版 菜單 價目 消息 常見問題 影片 評價 區塊 表單 地圖', 'hint', '先在這個框搜尋店名或網址，打開網站後在「功能開關」設定。'],
    ['確認收款、暫停、還原版本、自訂網域', '收款 付款 暫停 恢復 終止 還原 版本 網域 domain', 'hint', '先在這個框搜尋店名或網址，打開網站詳情就有這些按鈕。'],
    ['會員與名單', '會員 名單 檢測 SEO GEO 備註 跟進', 'members', '']
  ];

  var data = null, loading = null;
  async function load() {
    if (data) return data;
    if (loading) return loading;
    loading = (async function () {
      var c = YC.client;
      var rs = await Promise.all([
        c.from('admin_rental_overview').select('id,shop_name,slug,member_email,public_url,custom_domain,status').limit(2000),
        c.from('admin_member_overview').select('member_id,email,site_url,geo_site_url,notes').limit(5000),
        c.from('payments').select('id,site_id,amount,paid_on,reference,months').order('paid_on', { ascending: false }).limit(2000)
      ]);
      data = { sites: rs[0].data || [], members: rs[1].data || [], pays: rs[2].data || [] };
      return data;
    })();
    return loading;
  }

  var box = document.createElement('div');
  box.className = 'as-box';
  box.innerHTML = '<label class="as-lbl" for="as-q">全域搜尋</label><input type="search" id="as-q" autocomplete="off" placeholder="搜尋店名、Email、網址、匯款末五碼，或設定名稱（例如：隱藏價錢、早鳥、功能開關）" aria-controls="as-res">' +
    '<div id="as-res" class="as-res" role="listbox" hidden></div>';
  var css = document.createElement('style');
  css.textContent = '.as-box{position:relative;margin:0 0 18px}.as-lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}' +
    '#as-q{width:100%;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:11px 14px;font:inherit;font-size:15px}' +
    '#as-q:focus{outline:2px solid var(--accent);outline-offset:1px}' +
    '.as-res{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:800;background:var(--bg,#111);border:1px solid var(--border);border-radius:8px;box-shadow:0 18px 40px rgba(0,0,0,.35);max-height:min(70vh,520px);overflow:auto;padding:6px}' +
    '.as-g{font-size:12px;color:var(--text-dim);padding:8px 10px 4px;letter-spacing:.06em}.as-i{display:block;width:100%;text-align:left;background:none;border:0;color:var(--text);padding:9px 10px;border-radius:6px;cursor:pointer;font:inherit;font-size:14px}' +
    '.as-i:hover,.as-i[aria-selected=true]{background:rgba(255,255,255,.06)}.as-i b{color:var(--text-bright)}.as-i small{display:block;color:var(--text-dim);font-size:12px;margin-top:2px}.as-none{padding:12px 10px;color:var(--text-dim);font-size:14px}';
  document.head.appendChild(css);
  tabs.parentNode.insertBefore(box, tabs.nextSibling);
  // 只有管理員看得到分頁時才顯示
  var sync = function () { box.hidden = tabs.hidden; };
  sync(); new MutationObserver(sync).observe(tabs, { attributes: true, attributeFilter: ['hidden'] });

  var q = box.querySelector('#as-q'), res = box.querySelector('#as-res'), items = [], cur = -1;
  var has = function (v, t) { return String(v || '').toLowerCase().indexOf(t) >= 0; };
  function tab(t) { var b = tabs.querySelector('[data-tab="' + t + '"]'); if (b) b.click(); }
  function go(it) {
    res.hidden = true;
    if (it.kind === 'site') document.dispatchEvent(new CustomEvent('yc-admin-open-site', { detail: { id: it.id } }));
    else if (it.kind === 'member') { tab('members'); setTimeout(function () { var f = document.getElementById('f-q'); if (f) { f.value = it.email; f.dispatchEvent(new Event('input')); f.scrollIntoView({ block: 'center' }); } }, 200); }
    else if (it.kind === 'place') {
      if (it.tab === 'hint') { q.value = ''; q.placeholder = it.target; q.focus(); return; }
      tab(it.tab);
      if (!it.target) return;
      var n = 0, find = function () {
        var el = it.target.charAt(0) === '#' ? document.querySelector(it.target) : document.getElementById(it.target);
        if (!el) { if (n++ < 30) setTimeout(find, 200); return; }
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        if (el.tagName === 'BUTTON') el.click(); else if (el.type === 'checkbox' && !el.checked) el.click();
        el.classList.add('as-flash'); setTimeout(function () { el.classList.remove('as-flash'); }, 1600);
      };
      setTimeout(find, 150);
    }
  }
  async function search() {
    var t = q.value.trim().toLowerCase();
    if (!t) { res.hidden = true; return; }
    var parts = [], groups = [];
    var places = PLACES.filter(function (p) { return has(p[0], t) || p[1].toLowerCase().split(' ').some(function (k) { return k && (k.indexOf(t) >= 0 || t.indexOf(k) >= 0); }); }).slice(0, 6)
      .map(function (p) { return { kind: 'place', label: p[0], sub: p[2] === 'hint' ? p[3] : p[2] === 'prices' ? '價格與活動' : p[2] === 'rental' ? '租用網站' : '會員與名單', tab: p[2], target: p[3] }; });
    if (places.length) groups.push(['後台設定', places]);
    var d;
    try { d = await load(); } catch (e) { d = { sites: [], members: [], pays: [] }; }
    if (q.value.trim().toLowerCase() !== t) return;   // 使用者已經改字
    var sites = d.sites.filter(function (s) { return has(s.shop_name, t) || has(s.slug, t) || has(s.member_email, t) || has(s.public_url, t) || has(s.custom_domain, t); }).slice(0, 8)
      .map(function (s) { return { kind: 'site', id: s.id, label: s.shop_name || '（未命名）', sub: (STATUS[s.status] || s.status) + '・' + (s.slug || '') + '・' + (s.member_email || '') }; });
    if (sites.length) groups.push(['租用網站', sites]);
    var mem = d.members.filter(function (m) { return has(m.email, t) || has(m.site_url, t) || has(m.geo_site_url, t) || has(m.notes, t); }).slice(0, 8)
      .map(function (m) { return { kind: 'member', email: m.email, label: m.email, sub: (m.site_url || m.geo_site_url || '') + (m.notes ? '・備註：' + String(m.notes).slice(0, 30) : '') }; });
    if (mem.length) groups.push(['會員與名單', mem]);
    var byId = {}; d.sites.forEach(function (s) { byId[s.id] = s; });
    var pays = d.pays.filter(function (p) { return has(p.reference, t) || String(p.amount) === t.replace(/[^\d]/g, '') || has(p.paid_on, t); }).slice(0, 6)
      .map(function (p) { var s = byId[p.site_id] || {}; return { kind: 'site', id: p.site_id, label: 'NT$ ' + Number(p.amount).toLocaleString('en-US') + '・' + p.paid_on, sub: (s.shop_name || '') + (p.reference ? '・' + p.reference : '') + '・' + p.months + ' 個月' }; });
    if (pays.length) groups.push(['收款紀錄', pays]);
    items = []; cur = -1;
    groups.forEach(function (g) { parts.push('<div class="as-g">' + esc(g[0]) + '</div>'); g[1].forEach(function (it) { items.push(it); parts.push('<button type="button" class="as-i" role="option" data-i="' + (items.length - 1) + '"><b>' + esc(it.label) + '</b><small>' + esc(it.sub) + '</small></button>'); }); });
    res.innerHTML = parts.length ? parts.join('') : '<div class="as-none">找不到符合「' + esc(q.value.trim()) + '」的結果</div>';
    res.hidden = false;
    Array.prototype.forEach.call(res.querySelectorAll('.as-i'), function (b) { b.onclick = function () { go(items[+b.getAttribute('data-i')]); }; });
  }
  var timer;
  q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(search, 120); });
  q.addEventListener('focus', function () { load().catch(function () {}); if (q.value.trim()) search(); });
  q.addEventListener('keydown', function (e) {
    var bs = res.querySelectorAll('.as-i');
    if (e.key === 'Escape') { res.hidden = true; return; }
    if (!bs.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length; bs.forEach(function (b, i) { b.setAttribute('aria-selected', String(i === cur)); }); bs[cur].scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { e.preventDefault(); go(items[cur < 0 ? 0 : cur]); }
  });
  document.addEventListener('click', function (e) { if (!box.contains(e.target)) res.hidden = true; });
  var fl = document.createElement('style'); fl.textContent = '.as-flash{outline:2px solid var(--accent)!important;outline-offset:4px;transition:outline-color .3s}'; document.head.appendChild(fl);
})();
