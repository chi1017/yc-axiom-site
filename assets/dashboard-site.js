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
      var r = await YC.client.from('rental_sites').select('id,slug,status,layout,content,public_url,paid_until,last_published_at,suspend_reason,terms_accepted_at,custom_domain,domain_status').eq('member_id', YC.session.user.id).order('created_at');
      if (my !== token || r.error || !r.data) return;
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
    return '<details style="margin:12px 0 0"><summary style="cursor:pointer;font-size:14px">網站留言（共 ' + (count || rows.length) + ' 則，顯示最新 ' + rows.length + ' 則）</summary>' +
      '<ul style="margin:6px 0 0;padding-left:0;list-style:none;font-size:14px;line-height:1.7">' + rows.map(function (m) {
        return '<li style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)"><b>' + esc(m.name) + '</b>　<span style="color:#9a8f80">' + esc(m.contact) + '・' + esc(d(m.created_at)) + '</span>' +
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

  async function siteCard(s, bank, plan, PM, many) {
      var e = await YC.client.from('site_events').select('type,created_at').eq('site_id', s.id).order('created_at', { ascending: false }).limit(10);
      var pays = await YC.client.from('payments').select('amount,months,paid_on,period_to').eq('site_id', s.id).order('paid_on', { ascending: false }).order('created_at', { ascending: false }).limit(5);
      var rep = await YC.client.from('site_reports').select('month,seo_score,geo_score,top_issues').eq('site_id', s.id).eq('status', 'ok').order('month', { ascending: false }).limit(2);
      var since = new Date(Date.now() + 8 * 3600 * 1000 - 29 * 86400000).toISOString().slice(0, 10);
      var hits = await YC.client.from('site_daily_hits').select('day,path,views').eq('site_id', s.id).gte('day', since).limit(2000);
      var msgs = await YC.client.from('site_messages').select('name,contact,message,created_at', { count: 'exact' }).eq('site_id', s.id).order('created_at', { ascending: false }).limit(10);
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
      var needPay = s.status === 'pending' || s.status === 'overdue' || s.status === 'suspended' || (dl != null && dl <= 14);
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
        planHtml +
        bankHtml(bank, needPay) +
        ((pays.data || []).length ? '<details style="margin:12px 0 0"><summary style="cursor:pointer;font-size:14px">收款紀錄（最近 ' + pays.data.length + ' 筆）</summary><ul style="margin:6px 0 0;padding-left:18px;font-size:14px;line-height:1.8">' +
          pays.data.map(function (p) { return '<li>' + esc(p.paid_on) + '　' + esc(money(p.amount)) + '（' + esc(p.months) + ' 個月，服務至 ' + esc(p.period_to) + '）</li>'; }).join('') + '</ul></details>' : '') +
        statsHtml(hits && !hits.error ? hits.data : null) +
        msgsHtml(msgs && !msgs.error ? msgs.data : null, msgs && msgs.count) +
        domainHtml(s) +
        '<p style="margin:6px 0 0;font-size:13px"><a href="' + esc(YC.url('terms/rental/')) + '" target="_blank" rel="noopener">網站租用條款</a>' + (s.terms_accepted_at ? '<span style="color:#9a8f80">（你已於 ' + esc(String(s.terms_accepted_at).slice(0, 10)) + ' 同意）</span>' : '') + '</p>' +
        '<p style="margin:14px 0 0"><a class="m-btn primary sm" href="' + esc(YC.url('builder/') + '?site=' + encodeURIComponent(s.id)) + '">編輯網站</a></p></div>';
  }
  YC.onChange(function () { draw(); });
})();
