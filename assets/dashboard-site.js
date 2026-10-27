/* 會員專區：「我的網站」卡片。已建立網站的會員看到網站狀態；還沒有網站的會員看到「建立我的網站」入口；不影響原本的檢測紀錄。 */
(function () {
  'use strict';
  var YC = window.YC, box = document.getElementById('dash-site');
  if (!YC || !box) return;
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var token = 0;

  function status(site, events) {
    var st = site.status;
    if (st === 'draft') return { text: '草稿（尚未送出）', color: '#9a8f80' };
    if (st === 'pending') return { text: '待上線（已送出申請，等待開通）', color: '#e0b05a' };
    if (st === 'suspended') return { text: '已暫停', color: '#f0776b' };
    if (st === 'cancelled') return { text: '已終止', color: '#f0776b' };
    var ev = (events || []).filter(function (e) { return e.type === 'deploy_queued' || e.type === 'deploy_ok' || e.type === 'deploy_failed'; })[0];
    if (ev && ev.type === 'deploy_queued') return Date.now() - new Date(ev.created_at).getTime() > 600000 ? { text: '更新可能失敗，請再按一次發佈', color: '#f0776b' } : { text: '更新中（約 1–2 分鐘）', color: '#e0b05a' };
    if (ev && ev.type === 'deploy_failed') return { text: '更新失敗，請到編輯器再按一次發佈', color: '#f0776b' };
    return { text: st === 'overdue' ? '上線中（已到期，請聯絡我們續約）' : '上線中', color: '#6cc08b' };
  }

  function daysLeft(d) {
    if (!d) return null;
    var tw = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);   // 以台灣日期計算
    return Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(tw + 'T00:00:00Z')) / 86400000);
  }
  function money(n) { return 'NT$ ' + Number(n).toLocaleString('en-US'); }
  function bankHtml(b, open) {
    if (!b || !(b.account || b.bank)) return open ? '<p style="margin:10px 0 0;font-size:14px">匯款資訊請用 LINE（@788cblaq）詢問。</p>' : '';
    var row = function (k, v) { return v ? '<tr><td style="padding:3px 14px 3px 0;color:#9a8f80;white-space:nowrap">' + k + '</td><td style="padding:3px 0;word-break:break-all">' + esc(v) + '</td></tr>' : ''; };
    return '<details class="ds-bank" style="margin:12px 0 0"' + (open ? ' open' : '') + '><summary style="cursor:pointer;font-size:14px">匯款資訊</summary>' +
      '<table style="border-collapse:collapse;font-size:14px;margin-top:6px">' + row('銀行', b.bank + (b.code ? '（' + b.code + '）' : '')) + row('帳號', b.account) + row('戶名', b.holder) + '</table>' +
      (b.note ? '<p style="margin:6px 0 0;font-size:13px;color:#9a8f80">' + esc(b.note) + '</p>' : '') +
      '<p style="margin:6px 0 0;font-size:13px;color:#9a8f80">匯款後請用 LINE（@788cblaq）或 Email（ycaxiom@gmail.com）告訴我們匯款帳號末五碼，我們確認後會更新到期日。</p></details>';
  }

  // 最近一次月報分數（每月 1 日自動檢測；沒有資料就不顯示）
  function reportHtml(list) {
    var cur = (list || [])[0], prev = (list || [])[1];
    if (!cur) return '';
    var lab = function (n) { return n >= 80 ? '良好' : n >= 60 ? '普通' : '需加強'; };
    var diff = function (a, b) { if (!prev) return ''; var d = a - b; return d > 0 ? '<span style="color:#34d399">▲ ' + d + '</span>' : d < 0 ? '<span style="color:#f87171">▼ ' + (-d) + '</span>' : '<span style="color:#9a8f80">持平</span>'; };
    var m = String(cur.month || '').slice(0, 7).replace('-', ' 年 ') + ' 月';
    var issues = Array.isArray(cur.top_issues) ? cur.top_issues.slice(0, 3) : [];
    return '<div class="ds-report" style="margin:12px 0 0;padding:10px 14px;border:1px solid rgba(255,255,255,.12);border-radius:8px">' +
      '<p style="margin:0 0 4px;font-size:14px"><b>網站體檢</b><span style="color:#9a8f80;font-size:12px">　' + esc(m) + '・每月自動更新</span></p>' +
      '<p style="margin:0;font-size:14px">SEO <b>' + esc(cur.seo_score) + '</b>（' + lab(cur.seo_score) + '）' + (prev ? ' ' + diff(cur.seo_score, prev.seo_score) : '') +
      '　　GEO <b>' + esc(cur.geo_score) + '</b>（' + lab(cur.geo_score) + '）' + (prev ? ' ' + diff(cur.geo_score, prev.geo_score) : '') + '</p>' +
      (issues.length ? '<details style="margin:6px 0 0"><summary style="cursor:pointer;font-size:13px;color:#9a8f80">最值得優先改善的事</summary><ol style="margin:6px 0 0;padding-left:20px;font-size:13.5px;line-height:1.7">' +
        issues.map(function (i) { return '<li>' + esc(i.title) + (i.detail ? '<br><span style="color:#9a8f80;font-size:12.5px">' + esc(i.detail) + '</span>' : '') + '</li>'; }).join('') + '</ol></details>' : '') +
      '</div>';
  }

  async function draw() {
    var my = ++token;
    box.innerHTML = '';
    if (!YC.enabled || !YC.loggedIn() || !YC.consented()) return;
    try {
      // 先接受寄到自己 Email 的協作邀請；自己的網站和協作中的網站一起列出
      try { await YC.client.functions.invoke('member-site', { body: { action: 'accept_invites' } }); } catch (e0) { /* ignore */ }
      var uid = YC.session.user.id;
      var cm = await YC.client.from('site_members').select('site_id').eq('member_id', uid).eq('status', 'active');
      var collabIds = cm.error ? [] : (cm.data || []).map(function (x) { return x.site_id; });
      var cols = 'id,member_id,tier,slug,status,layout,content,public_url,paid_until,first_published_at,last_published_at,suspend_reason,terms_accepted_at,custom_domain,domain_status,upgrade_pending,upgrade_amount';
      var r = collabIds.length
        ? await YC.client.from('rental_sites').select(cols).or('member_id.eq.' + uid + ',id.in.(' + collabIds.join(',') + ')').order('created_at')
        : await YC.client.from('rental_sites').select(cols).eq('member_id', uid).order('created_at');
      if (my !== token || r.error || !r.data) return;
      if (r.data) r.data = r.data.filter(function (x) { return !(x.status === "cancelled" && !x.first_published_at); });   // 自己刪除的草稿不顯示
      if (!r.data.length) {   // 還沒有網站：顯示入口
        box.innerHTML = '<div class="mem-card" style="margin-bottom:22px"><h2 style="margin:0 0 6px;font-size:18px">網站租用</h2>' +
          '<p style="margin:6px 0 0;font-size:14px;line-height:1.7">自己填寫店家資訊，我們負責發佈上線與維護，並每月自動檢測 SEO 與 AI 可見度。</p>' +
          '<p style="margin:14px 0 0"><a class="m-btn primary sm" href="' + esc(YC.url('builder/')) + '">建立我的網站</a>　<a href="' + esc(YC.url('rental/')) + '" style="font-size:14px">了解網站租用</a></p></div>';
        return;
      }
      // 一個會員可以有多個網站：每個網站一張卡片
      var cfg = await YC.client.from('settings').select('key,value').in('key', ['bank_transfer', 'plan']);
      var PM = null; try { PM = await import(YC.url('assets/rental-plan.js')); } catch (e1) { /* 略過價格 */ }
      if (my !== token) return;
      var bank = null, plan = null;
      (cfg.data || []).forEach(function (x) { if (x.key === 'bank_transfer') bank = x.value; if (x.key === 'plan') plan = x.value; });
      var cards = [];
      for (var k = 0; k < r.data.length; k++) cards.push(await siteCard(r.data[k], bank, plan, PM, r.data.length > 1));
      if (my !== token) return;
      box.innerHTML = cards.join('') +
        '<p style="margin:-8px 0 22px;font-size:14px"><a href="' + esc(YC.url('builder/') + '?new=1') + '">＋ 建立另一個網站</a></p>';
    } catch (err) { console.warn('dash-site', err); }
  }

  // 最近 30 天瀏覽次數（網站內建統計，不用 Cookie）
  function statsHtml(rows) {
    if (!rows) return '';
    var total = 0, today = 0, byPath = {}, tw = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    rows.forEach(function (r) { total += r.views; if (r.day === tw) today += r.views; byPath[r.path] = (byPath[r.path] || 0) + r.views; });
    var top = Object.keys(byPath).sort(function (a, b) { return byPath[b] - byPath[a]; }).slice(0, 5);
    return '<div style="margin:12px 0 0;padding:10px 14px;border:1px solid rgba(255,255,255,.12);border-radius:8px">' +
      '<p style="margin:0;font-size:14px"><b>網站瀏覽</b>　最近 30 天 <b>' + total.toLocaleString('en-US') + '</b> 次　今天 <b>' + today + '</b> 次</p>' +
      (top.length ? '<p style="margin:4px 0 0;font-size:13px;color:#9a8f80">最常被看的頁面：' + top.map(function (k) { return esc(k === '/' ? '首頁' : k) + ' ' + byPath[k]; }).join('、') + '</p>'
        : '<p style="margin:4px 0 0;font-size:13px;color:#9a8f80">網站上線並重新發佈後開始統計，不使用 Cookie、不記錄訪客個人資料。</p>') + '</div>';
  }
  // 聯絡表單留言
  function msgsHtml(rows, count) {
    if (!rows || !rows.length) return '';
    var d = function (t) { var x = new Date(t); return (x.getMonth() + 1) + '/' + x.getDate() + ' ' + String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
    return '<details style="margin:12px 0 0"><summary style="cursor:pointer;font-size:14px">網站留言與預約（共 ' + (count || rows.length) + ' 則，顯示最新 ' + rows.length + ' 則）</summary>' +
      '<ul style="margin:6px 0 0;padding-left:0;list-style:none;font-size:14px;line-height:1.7">' + rows.map(function (m) {
        return '<li style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)">' + (m.kind === 'booking' ? '<span style="display:inline-block;padding:0 8px;margin-right:6px;border:1px solid #e0b05a;color:#e0b05a;border-radius:999px;font-size:12px">預約</span>' : '') + (m.meta && m.meta.deposit ? (m.meta.deposit_paid ? '<span style="color:#6cc08b;font-size:12px;margin-right:6px">訂金已付</span>' : '<span style="color:#9a8f80;font-size:12px;margin-right:6px">訂金未付</span>') : '') + '<b>' + esc(m.name) + '</b>　<span style="color:#9a8f80">' + esc(m.contact) + '・' + esc(d(m.created_at)) + '</span>' +
          '<div style="white-space:pre-wrap">' + esc(m.message) + '</div></li>';
      }).join('') + '</ul></details>';
  }
  // 自訂網域：上線中的網站可以自己設定
  function domainHtml(s) {
    var canSet = s.status === 'live' || s.status === 'overdue';
    var id = esc(s.id);
    var cur = s.custom_domain ? '<p style="margin:0 0 6px;font-size:14px">目前：<b>' + esc(s.custom_domain) + '</b>　' + (s.domain_status === 'active' ? '<span style="color:#6cc08b">已生效</span>' : '<span style="color:#e0b05a">等待 DNS 設定生效</span>') + '</p>' : '';
    return '<details style="margin:12px 0 0"' + (s.custom_domain && s.domain_status !== 'active' ? ' open' : '') + '><summary style="cursor:pointer;font-size:14px">自訂網域' + (s.custom_domain ? '：' + esc(s.custom_domain) : '') + '</summary><div style="margin:8px 0 0">' + cur +
      (canSet ? '<div style="display:flex;gap:8px;flex-wrap:wrap"><input type="text" id="dom-' + id + '" placeholder="例如 www.yourshop.com" value="' + esc(s.custom_domain || '') + '" aria-label="網域" style="flex:1;min-width:180px;font:inherit;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:transparent;color:inherit">' +
        '<button type="button" class="m-btn sm" data-dom="set_domain" data-site="' + id + '">' + (s.custom_domain ? '更換' : '設定') + '</button>' +
        (s.custom_domain ? '<button type="button" class="m-btn sm" data-dom="check_domain" data-site="' + id + '">檢查</button><button type="button" class="m-btn sm" data-dom="clear_domain" data-site="' + id + '">移除</button>' : '') + '</div>' +
        '<p style="margin:6px 0 0;font-size:13px;color:#9a8f80">網域要自己先買好（例如在 GoDaddy、Gandi、中華電信 HiNet 等）。設定後畫面會告訴你要在網域的 DNS 新增哪一筆 CNAME。</p>'
        : '<p style="margin:0;font-size:13px;color:#9a8f80">網站上線後就可以在這裡綁定自己的網域。</p>') +
      '<div id="domout-' + id + '" aria-live="polite" style="margin:6px 0 0;font-size:14px"></div></div></details>';
  }
  // ── 網站收款（店家自己的綠界帳號）與訂單 ──
  async function invoke(body) {
    var r = await YC.client.functions.invoke('member-site', { body: body });
    if (r.error) { var j = null; try { j = await r.error.context.json(); } catch (e) { /* ignore */ } throw new Error((j && j.message) || '操作失敗，請稍後再試'); }
    return r.data;
  }
  var ORDER_ST = { paid: ['已付款', '#6cc08b'], awaiting: ['等待繳費', '#e0b05a'], created: ['未完成付款', '#9a8f80'], failed: ['付款失敗', '#f0776b'] };
  function ordersHtml(rows) {
    if (!rows || !rows.length) return '<p style="margin:8px 0 0;font-size:13px;color:#9a8f80">還沒有訂單。</p>';
    var d = function (t) { var x = new Date(t); return (x.getMonth() + 1) + '/' + x.getDate() + ' ' + String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
    return '<ul style="margin:8px 0 0;padding-left:0;list-style:none;font-size:14px;line-height:1.7">' + rows.map(function (o) {
      var st = ORDER_ST[o.status] || [o.status, '#9a8f80'], b = o.buyer || {};
      var what = o.kind === 'deposit' ? '預約訂金' : (o.items || []).map(function (i) { return esc(i.name) + ' x' + esc(i.qty); }).join('、');
      var info = o.status === 'awaiting' && o.pay_info ? '<div style="color:#e0b05a;font-size:13px">' + (o.pay_info.account ? '銀行 ' + esc(o.pay_info.bank) + ' 帳號 ' + esc(o.pay_info.account) : '繳費代碼 ' + esc(o.pay_info.code)) + '　期限 ' + esc(o.pay_info.expire) + '</div>' : '';
      return '<li style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)"><span style="display:inline-block;padding:0 8px;margin-right:6px;border:1px solid ' + st[1] + ';color:' + st[1] + ';border-radius:999px;font-size:12px">' + st[0] + '</span>' +
        (o.test ? '<span style="color:#e0b05a;font-size:12px;margin-right:6px">測試</span>' : '') + '<b>' + esc(money(o.amount)) + '</b>　<span style="color:#9a8f80">' + esc(d(o.created_at)) + '・' + esc(o.trade_no) + '</span>' +
        '<div>' + what + '</div><div style="color:#9a8f80;font-size:13px">' + esc(b.name || '') + '　' + esc(b.phone || '') + '　' + esc(b.email || '') + (b.address ? '　' + esc(b.address) : '') + (b.note ? '<br>備註：' + esc(b.note) : '') + '</div>' + info +
        (o.status === 'paid' ? '<div style="margin-top:4px">' + (o.fulfilled_at ? '<span style="color:#6cc08b;font-size:13px">已處理</span> <button type="button" class="m-btn sm" data-done="' + esc(o.trade_no) + '" data-site="' + esc(o.site_id) + '" data-undo="1">改回未處理</button>' : '<button type="button" class="m-btn sm" data-done="' + esc(o.trade_no) + '" data-site="' + esc(o.site_id) + '">標記已處理</button>') + '</div>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  function shopHtml(s, pay, orders) {
    var id = esc(s.id), mode = (pay && pay.mode) || 'off';
    var paid = (orders || []).filter(function (o) { return o.status === 'paid' && !o.fulfilled_at; }).length;
    var radio = function (v, label) { return '<label style="margin-right:14px;white-space:nowrap"><input type="radio" name="pm-' + id + '" value="' + v + '"' + (mode === v ? ' checked' : '') + '> ' + label + '</label>'; };
    var inp = function (k, ph, type, val) { return '<input type="' + (type || 'text') + '" id="pay-' + k + '-' + id + '" placeholder="' + esc(ph) + '" value="' + esc(val || '') + '" autocomplete="off" spellcheck="false" style="width:100%;font:inherit;padding:6px 10px;margin:4px 0;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:transparent;color:inherit">'; };
    var state = mode === 'live' ? '<span style="color:#6cc08b">正式收款中（特店 ' + esc(pay.merchant_id) + '）</span>' : mode === 'test' ? '<span style="color:#e0b05a">測試模式</span>' : '<span style="color:#9a8f80">未開啟</span>';
    return '<details style="margin:12px 0 0"' + (paid ? ' open' : '') + '><summary style="cursor:pointer;font-size:14px">網站收款與訂單：' + state + (paid ? '　<b style="color:#6cc08b">' + paid + ' 筆待處理</b>' : '') + '</summary>' +
      '<div style="margin:8px 0 0;padding:12px 14px;border:1px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px">' +
      '<p style="margin:0 0 8px">用你自己的綠界帳號，讓客人在網站上購買商品或付預約訂金，款項直接進你的綠界帳戶。商品與訂金金額在編輯器的「線上購買」與「更多內容」設定。</p>' +
      '<div>' + radio('off', '關閉') + radio('test', '測試模式') + radio('live', '正式收款') + '</div>' +
      '<div class="pay-live" data-site="' + id + '" style="margin:8px 0 0' + (mode === 'live' ? '' : ';display:none') + '">' +
      inp('mid', '特店編號 MerchantID（7 到 10 位數字）', 'text', pay && pay.merchant_id) +
      inp('key', mode === 'live' ? 'HashKey（已設定，不更換請留空）' : 'HashKey', 'password') + inp('iv', mode === 'live' ? 'HashIV（已設定，不更換請留空）' : 'HashIV', 'password') +
      '<p style="margin:4px 0 0;font-size:13px;color:#9a8f80">在綠界廠商管理後台：系統開發管理 → 系統介接設定，可以看到這三項。金鑰會加密保存，連我們也看不到明文。</p></div>' +
      '<p style="margin:6px 0 0;font-size:13px;color:#9a8f80">測試模式用綠界的測試環境，可以用測試卡號 4311-9522-2222-2222（有效期限填未來日期、安全碼任意、簡訊驗證碼 1234）走完整流程，不會真的收款。</p>' +
      '<p style="margin:8px 0 0"><button type="button" class="m-btn sm primary" data-paysave="' + id + '">儲存收款設定</button></p>' +
      '<div id="payout-' + id + '" aria-live="polite" style="margin:6px 0 0"></div>' +
      '<p style="margin:12px 0 0"><b>最近訂單</b></p>' + ordersHtml(orders) + '</div></details>';
  }
  box.addEventListener('change', function (ev) {
    var r = ev.target; if (!r.name || r.name.indexOf('pm-') !== 0) return;
    var el = box.querySelector('.pay-live[data-site="' + r.name.slice(3) + '"]'); if (el) el.style.display = r.value === 'live' ? '' : 'none';
  });
  box.addEventListener('click', async function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-paysave],[data-done]'); if (!b) return;
    if (b.hasAttribute('data-done')) {
      b.disabled = true;
      try { await invoke({ action: 'order_done', site_id: b.getAttribute('data-site'), trade_no: b.getAttribute('data-done'), done: !b.hasAttribute('data-undo') }); draw(); }
      catch (e) { b.disabled = false; alert(String(e.message || e)); }
      return;
    }
    var sid = b.getAttribute('data-paysave'), out = document.getElementById('payout-' + sid);
    var sel = box.querySelector('input[name="pm-' + sid + '"]:checked'), val = function (k) { var i = document.getElementById('pay-' + k + '-' + sid); return i ? i.value.trim() : ''; };
    var body = { action: 'set_pay', site_id: sid, mode: sel ? sel.value : 'off' };
    if (body.mode === 'live') { body.merchant_id = val('mid'); body.hash_key = val('key'); body.hash_iv = val('iv'); }
    if (body.mode === 'live' && !confirm('開啟正式收款後，客人在網站上付的錢會進到特店 ' + body.merchant_id + ' 的綠界帳戶。確定？')) return;
    b.disabled = true; out.textContent = '儲存中…';
    try { var j = await invoke(body); out.textContent = j.message || '已儲存'; setTimeout(draw, 2500); }
    catch (e) { out.textContent = String(e.message || e); }
    b.disabled = false;
  });

  // 網域按鈕（事件委派，畫面重畫後仍有效）
  box.addEventListener('click', async function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-dom]'); if (!b) return;
    var act = b.getAttribute('data-dom'), sid = b.getAttribute('data-site'), out = document.getElementById('domout-' + sid);
    var inp = document.getElementById('dom-' + sid), body = { action: act, site_id: sid };
    if (act === 'set_domain') { body.domain = (inp && inp.value || '').trim(); if (!body.domain) { out.textContent = '請輸入網域'; return; } }
    if (act === 'clear_domain' && !confirm('移除自訂網域後，網站會改回 pages.dev 網址。確定移除？')) return;
    b.disabled = true; out.textContent = '處理中…';
    try {
      var r = await YC.client.functions.invoke('member-site', { body: body });
      var j = r.data;
      if (r.error) { try { j = await r.error.context.json(); } catch (e3) { j = null; } throw new Error((j && j.message) || '操作失敗，請稍後再試'); }
      out.innerHTML = esc(j.message || '完成') + (j.cname_target ? '<div style="margin:6px 0 0;padding:8px 10px;border:1px solid rgba(255,255,255,.15);border-radius:8px">類型：<b>CNAME</b>　名稱：<b>' + esc(j.domain) + '</b>　指向：<b>' + esc(j.cname_target) + '</b></div>' : '') + (j.warning ? '<div style="color:#e0b05a">' + esc(j.warning) + '</div>' : '');
      if (act !== 'set_domain') setTimeout(draw, 2500);
    } catch (e4) { out.textContent = String(e4.message || e4); }
    b.disabled = false;
  });

  // ── 預約行事曆：接下來的預約，確認或取消 ──
  function bookingsHtml(s, rows) {
    if (!rows || !rows.length) return '';
    var stl = { pending: ['待確認', '#e0b05a'], confirmed: ['已確認', '#34d399'], cancelled: ['已取消', '#9a8f80'] };
    return '<details open style="margin:12px 0 0"><summary style="cursor:pointer;font-size:14px"><b>預約行事曆</b>（接下來 ' + rows.filter(function (m) { return m.slot_status !== 'cancelled'; }).length + ' 筆）</summary>' +
      '<ul style="margin:8px 0 0;padding-left:0;list-style:none;font-size:14px;line-height:1.7">' + rows.map(function (m) {
        var st = stl[m.slot_status] || stl.pending, mt = m.meta || {};
        var btns = m.slot_status === 'cancelled' ? '' : (m.slot_status === 'pending' ? '<button class="m-btn sm" data-bk="confirmed" data-id="' + esc(m.id) + '" data-site="' + esc(s.id) + '">確認</button> ' : '') +
          '<button class="m-btn sm" data-bk="cancelled" data-id="' + esc(m.id) + '" data-site="' + esc(s.id) + '">取消</button>';
        return '<li style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)"><b>' + esc(String(m.slot_date).slice(5).replace('-', '/')) + ' ' + esc(m.slot_time) + '</b>　' + esc(m.name) + '　' + esc(m.contact) +
          (mt.people ? '・' + esc(mt.people) + ' 人' : '') + (mt.item ? '・' + esc(mt.item) : '') + (mt.email ? '・' + esc(mt.email) : '') +
          ' <span style="color:' + st[1] + ';font-size:13px">' + st[0] + '</span>' + (btns ? '<div style="margin-top:4px">' + btns + '</div>' : '') + '</li>';
      }).join('') + '</ul><p id="bkout-' + esc(s.id) + '" style="margin:6px 0 0;font-size:13px;color:#9a8f80"></p></details>';
  }
  // ── 多人協作（進階方案，只有擁有者看得到）──
  function collabHtml(s, rows) {
    var id = esc(s.id);
    if (s.tier !== 'pro') return '';
    var list = (rows || []).filter(function (m) { return m.status !== 'removed'; });
    return '<details style="margin:12px 0 0"><summary style="cursor:pointer;font-size:14px"><b>一起編輯的人</b>（' + list.length + '／5）</summary>' +
      '<p style="margin:8px 0 0;font-size:13px;color:#9a8f80">輸入對方的 Email 邀請；對方用這個 Email 登入會員專區後就能編輯內容、發佈與處理預約。收款、網域、刪除網站只有你能操作。</p>' +
      (list.length ? '<ul style="margin:6px 0 0;padding-left:0;list-style:none;font-size:14px">' + list.map(function (m) {
        return '<li style="padding:4px 0">' + esc(m.email) + ' <span style="font-size:13px;color:' + (m.status === 'active' ? '#34d399' : '#e0b05a') + '">' + (m.status === 'active' ? '已加入' : '等待對方登入') + '</span> <button class="m-btn sm" data-collab="remove" data-site="' + id + '" data-email="' + esc(m.email) + '">移除</button></li>';
      }).join('') + '</ul>' : '') +
      '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><input type="email" id="collab-' + id + '" placeholder="對方的 Email" style="flex:1;min-width:200px;font:inherit;padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:transparent;color:inherit">' +
      '<button class="m-btn sm" data-collab="invite" data-site="' + id + '">邀請</button></div><p id="collabout-' + id + '" style="margin:6px 0 0;font-size:13px;color:#9a8f80"></p></details>';
  }
  box.addEventListener('click', async function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-bk],[data-collab]'); if (!b) return;
    var sid = b.getAttribute('data-site');
    if (b.hasAttribute('data-bk')) {
      var stv = b.getAttribute('data-bk'), out = document.getElementById('bkout-' + sid);
      var note = '';
      if (stv === 'cancelled') { note = prompt('取消這筆預約？可以寫一句說明給客人（選填）：', ''); if (note === null) return; }
      b.disabled = true;
      try { var j = await invoke({ action: 'set_booking', site_id: sid, message_id: b.getAttribute('data-id'), status: stv, note: note }); if (out) out.textContent = j.message || '已更新'; setTimeout(draw, 1500); }
      catch (e) { b.disabled = false; if (out) out.textContent = String(e.message || e); }
      return;
    }
    var act = b.getAttribute('data-collab'), o2 = document.getElementById('collabout-' + sid);
    var email = act === 'invite' ? (document.getElementById('collab-' + sid).value || '').trim() : b.getAttribute('data-email');
    if (!email) { o2.textContent = '請輸入 Email'; return; }
    if (act === 'remove' && !confirm('移除 ' + email + '？對方將不能再編輯這個網站。')) return;
    b.disabled = true; o2.textContent = '處理中…';
    try { var j2 = await invoke({ action: act === 'invite' ? 'invite_collab' : 'remove_collab', site_id: sid, email: email }); o2.textContent = j2.message || '完成'; setTimeout(draw, 2000); }
    catch (e2) { o2.textContent = String(e2.message || e2); }
    b.disabled = false;
  });

  async function siteCard(s, bank, plan, PM, many) {
      var today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      var bks = await YC.client.from('site_messages').select('id,name,contact,slot_date,slot_time,slot_status,meta').eq('site_id', s.id).gte('slot_date', today).order('slot_date').order('slot_time').limit(50);
      var bkHtml = bookingsHtml(s, bks && !bks.error ? bks.data : null);
      var name0 = (s.content && s.content.name) || s.slug;
      // 協作中的網站：只顯示網址、預約與編輯（收款、方案、網域由擁有者管理）
      if (s.member_id !== YC.session.user.id) {
        var live0 = s.public_url && (s.status === 'live' || s.status === 'overdue');
        return '<div class="mem-card" style="margin-bottom:22px"><h2 style="margin:0 0 6px;font-size:18px">' + esc(name0) + ' <span style="font-size:13px;font-weight:400;color:#9a8f80">協作中</span></h2>' +
          (live0 ? '<p style="margin:6px 0">網址：<a href="' + esc(s.public_url) + '" target="_blank" rel="noopener">' + esc(s.public_url) + '</a></p>' : '') +
          '<p style="margin:6px 0;font-size:13px;color:#9a8f80">你被邀請一起編輯這個網站。收款、網域與續約由網站擁有者管理。</p>' + bkHtml +
          '<p style="margin:14px 0 0"><a class="m-btn primary sm" href="' + esc(YC.url('builder/') + '?site=' + encodeURIComponent(s.id)) + '">編輯網站</a></p></div>';
      }
      var mem = s.tier === 'pro' ? await YC.client.from('site_members').select('email,status').eq('site_id', s.id) : null;
      var e = await YC.client.from('site_events').select('type,created_at').eq('site_id', s.id).order('created_at', { ascending: false }).limit(10);
      var pays = await YC.client.from('payments').select('amount,months,paid_on,period_to').eq('site_id', s.id).order('paid_on', { ascending: false }).order('created_at', { ascending: false }).limit(5);
      var rep = await YC.client.from('site_reports').select('month,seo_score,geo_score,top_issues').eq('site_id', s.id).eq('status', 'ok').order('month', { ascending: false }).limit(2);
      var since = new Date(Date.now() + 8 * 3600 * 1000 - 29 * 86400000).toISOString().slice(0, 10);
      var hits = await YC.client.from('site_daily_hits').select('day,path,views').eq('site_id', s.id).gte('day', since).limit(2000);
      var pay = await YC.client.from('site_pay_settings').select('mode,merchant_id,updated_at').eq('site_id', s.id).maybeSingle();
      var orders = await YC.client.from('shop_orders').select('trade_no,site_id,kind,items,amount,buyer,status,test,pay_info,created_at,paid_at,fulfilled_at').eq('site_id', s.id).order('created_at', { ascending: false }).limit(20);
      var msgs = await YC.client.from('site_messages').select('name,contact,message,created_at,kind,meta', { count: 'exact' }).eq('site_id', s.id).order('created_at', { ascending: false }).limit(10);
      var planHtml = '';
      try {
        var P = PM.planFor ? PM.planFor(s.layout) : PM.PLAN;
        var yq = PM.hasPrice && PM.hasPrice(P) ? PM.quote(12, s.layout) : null;
        planHtml = yq
          ? '<p style="margin:6px 0;font-size:14px;line-height:1.7">租用方案：' + esc(P.name) + '　' + (P.listMonthly ? '<span style="' + PM.STRIKE_STYLE + '">' + esc(PM.money(P.listMonthly)) + '</span> ' : '') + '<b>' + esc(PM.money(P.monthly)) + '／月</b>' +
            '<br><span style="font-size:13px;color:#9a8f80">一次付 12 個月只收 ' + P.yearPaidMonths + ' 個月：' + esc(PM.money(yq.amount)) + '</span></p>'
          : '<p style="margin:6px 0;font-size:14px;line-height:1.7">租用方案：' + esc(P.name) + '<br><span style="font-size:13px;color:#9a8f80">費用確認中，我們會與你聯絡確認。</span></p>';
      } catch (e2) { /* 略過 */ }
      var dl = daysLeft(s.paid_until);
      var needPay = s.upgrade_pending || s.status === 'pending' || s.status === 'overdue' || s.status === 'suspended' || (dl != null && dl <= 14);
      var st = status(s, e.data || []);
      var live = s.public_url && (s.status === 'live' || s.status === 'overdue');
      var name = (s.content && s.content.name) || s.slug;
      return '<div class="mem-card" style="margin-bottom:22px"><h2 style="margin:0 0 6px;font-size:18px">' + (many ? esc(name) : '我的網站') + '</h2>' +
        '<p style="margin:0 0 6px"><span style="display:inline-block;padding:2px 12px;border:1px solid ' + st.color + ';color:' + st.color + ';border-radius:999px;font-size:13px">' + esc(st.text) + '</span></p>' +
        (live ? '<p style="margin:6px 0">網址：<a href="' + esc(s.public_url) + '" target="_blank" rel="noopener">' + esc(s.public_url) + '</a></p>' : '') +
        (s.paid_until ? '<p style="margin:6px 0;font-size:14px">服務到期日：' + esc(s.paid_until) + (dl == null ? '' : dl >= 0 ? '（還有 ' + dl + ' 天）' : '（已過期 ' + (-dl) + ' 天）') + '</p>' : '') +
        (s.status === 'suspended' && s.suspend_reason ? '<p style="margin:6px 0;font-size:14px;color:#f0776b">暫停原因：' + esc(s.suspend_reason) + '</p>' : '') +
        reportHtml(rep && !rep.error ? rep.data : []) +
        (plan && plan.text ? '<p style="margin:6px 0;font-size:13px;color:#9a8f80;white-space:pre-line">' + esc(plan.text) + '</p>' : '') +
        planHtml + '<p style="margin:6px 0;font-size:13px;color:#9a8f80">方案等級：' + (s.tier === 'pro' ? '<b style="color:#e0b05a">進階方案</b>（預約行事曆、自訂程式碼、多人協作）' : '一般方案（需要預約行事曆、自訂程式碼或多人協作，請用 LINE 聯絡我們升級進階方案）') + '</p>' +
        (s.upgrade_pending ? '<div style="margin:12px 0 0;padding:12px 14px;border:1px solid #e0b05a;border-radius:10px;font-size:14px;line-height:1.7"><b style="color:#e0b05a">升級多頁版：待補差額 ' + esc(money(s.upgrade_amount || 0)) + '</b><br>請匯款到下方帳戶，匯款後用 LINE（@788cblaq）告訴我們帳號末五碼。我們確認收到後會自動發佈多頁版，在那之前網站維持一頁版。</div>' : '') +
        bankHtml(bank, needPay) +
        ((pays.data || []).length ? '<details style="margin:12px 0 0"><summary style="cursor:pointer;font-size:14px">收款紀錄（最近 ' + pays.data.length + ' 筆）</summary><ul style="margin:6px 0 0;padding-left:18px;font-size:14px;line-height:1.8">' +
          pays.data.map(function (p) { return '<li>' + esc(p.paid_on) + '　' + esc(money(p.amount)) + '（' + esc(p.months) + ' 個月，服務至 ' + esc(p.period_to) + '）</li>'; }).join('') + '</ul></details>' : '') +
        statsHtml(hits && !hits.error ? hits.data : null) +
        bkHtml + msgsHtml(msgs && !msgs.error ? msgs.data : null, msgs && msgs.count) +
        shopHtml(s, pay && !pay.error ? pay.data : null, orders && !orders.error ? orders.data : null) +
        domainHtml(s) + collabHtml(s, mem && !mem.error ? mem.data : null) +
        '<p style="margin:6px 0 0;font-size:13px"><a href="' + esc(YC.url('terms/rental/')) + '" target="_blank" rel="noopener">網站租用條款</a>' + (s.terms_accepted_at ? '<span style="color:#9a8f80">（你已於 ' + esc(String(s.terms_accepted_at).slice(0, 10)) + ' 同意）</span>' : '') + '</p>' +
        '<p style="margin:14px 0 0"><a class="m-btn primary sm" href="' + esc(YC.url('builder/') + '?site=' + encodeURIComponent(s.id)) + '">編輯網站</a></p></div>';
  }
  YC.onChange(function () { draw(); });
})();
