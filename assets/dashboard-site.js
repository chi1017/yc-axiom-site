/* 會員專區：「我的網站」卡片。只有已建立網站的會員才會看到；不影響原本的檢測紀錄。 */
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

  async function draw() {
    var my = ++token;
    box.innerHTML = '';
    if (!YC.enabled || !YC.loggedIn() || !YC.consented()) return;
    try {
      var r = await YC.client.from('rental_sites').select('id,slug,status,public_url,paid_until,last_published_at,suspend_reason,terms_accepted_at,custom_domain,domain_status').eq('member_id', YC.session.user.id).order('created_at').limit(1);
      if (my !== token || r.error || !r.data || !r.data.length) return;
      var s = r.data[0];
      var e = await YC.client.from('site_events').select('type,created_at').eq('site_id', s.id).order('created_at', { ascending: false }).limit(10);
      var pays = await YC.client.from('payments').select('amount,months,paid_on,period_to').eq('site_id', s.id).order('paid_on', { ascending: false }).order('created_at', { ascending: false }).limit(5);
      var cfg = await YC.client.from('settings').select('key,value').in('key', ['bank_transfer', 'plan']);
      if (my !== token) return;
      var bank = null, plan = null;
      (cfg.data || []).forEach(function (x) { if (x.key === 'bank_transfer') bank = x.value; if (x.key === 'plan') plan = x.value; });
      var dl = daysLeft(s.paid_until);
      var needPay = s.status === 'pending' || s.status === 'overdue' || s.status === 'suspended' || (dl != null && dl <= 14);
      var st = status(s, e.data || []);
      var live = s.public_url && (s.status === 'live' || s.status === 'overdue');
      box.innerHTML = '<div class="mem-card" style="margin-bottom:22px"><h2 style="margin:0 0 6px;font-size:18px">我的網站</h2>' +
        '<p style="margin:0 0 6px"><span style="display:inline-block;padding:2px 12px;border:1px solid ' + st.color + ';color:' + st.color + ';border-radius:999px;font-size:13px">' + esc(st.text) + '</span></p>' +
        (live ? '<p style="margin:6px 0">網址：<a href="' + esc(s.public_url) + '" target="_blank" rel="noopener">' + esc(s.public_url) + '</a></p>' : '') +
        (s.paid_until ? '<p style="margin:6px 0;font-size:14px">服務到期日：' + esc(s.paid_until) + (dl == null ? '' : dl >= 0 ? '（還有 ' + dl + ' 天）' : '（已過期 ' + (-dl) + ' 天）') + '</p>' : '') +
        (s.status === 'suspended' && s.suspend_reason ? '<p style="margin:6px 0;font-size:14px;color:#f0776b">暫停原因：' + esc(s.suspend_reason) + '</p>' : '') +
        (plan && plan.text ? '<p style="margin:6px 0;font-size:13px;color:#9a8f80;white-space:pre-line">' + esc(plan.text) + '</p>' : '') +
        bankHtml(bank, needPay) +
        ((pays.data || []).length ? '<details style="margin:12px 0 0"><summary style="cursor:pointer;font-size:14px">收款紀錄（最近 ' + pays.data.length + ' 筆）</summary><ul style="margin:6px 0 0;padding-left:18px;font-size:14px;line-height:1.8">' +
          pays.data.map(function (p) { return '<li>' + esc(p.paid_on) + '　' + esc(money(p.amount)) + '（' + esc(p.months) + ' 個月，服務至 ' + esc(p.period_to) + '）</li>'; }).join('') + '</ul></details>' : '') +
        (s.custom_domain ? '<p style="margin:10px 0 0;font-size:13px;color:#9a8f80">自訂網域：' + esc(s.custom_domain) + (s.domain_status === 'active' ? '（已啟用）' : '（設定中，等待 DNS 生效）') + '</p>'
          : '<p style="margin:10px 0 0;font-size:13px;color:#9a8f80">想綁定自己的網域？請用 LINE（@788cblaq）聯絡我們，由我們協助設定。</p>') +
        '<p style="margin:6px 0 0;font-size:13px"><a href="' + esc(YC.url('terms/rental/')) + '" target="_blank" rel="noopener">網站租用條款</a>' + (s.terms_accepted_at ? '<span style="color:#9a8f80">（你已於 ' + esc(String(s.terms_accepted_at).slice(0, 10)) + ' 同意）</span>' : '') + '</p>' +
        '<p style="margin:14px 0 0"><a class="m-btn primary sm" href="' + esc(YC.url('builder/')) + '">編輯網站</a></p></div>';
    } catch (err) { console.warn('dash-site', err); }
  }
  YC.onChange(function () { draw(); });
})();
