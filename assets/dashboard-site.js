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

  async function draw() {
    var my = ++token;
    box.innerHTML = '';
    if (!YC.enabled || !YC.loggedIn() || !YC.consented()) return;
    try {
      var r = await YC.client.from('rental_sites').select('id,slug,status,public_url,paid_until,last_published_at').eq('member_id', YC.session.user.id).order('created_at').limit(1);
      if (my !== token || r.error || !r.data || !r.data.length) return;
      var s = r.data[0];
      var e = await YC.client.from('site_events').select('type,created_at').eq('site_id', s.id).order('created_at', { ascending: false }).limit(10);
      if (my !== token) return;
      var st = status(s, e.data || []);
      var live = s.public_url && (s.status === 'live' || s.status === 'overdue');
      box.innerHTML = '<div class="mem-card" style="margin-bottom:22px"><h2 style="margin:0 0 6px;font-size:18px">我的網站</h2>' +
        '<p style="margin:0 0 6px"><span style="display:inline-block;padding:2px 12px;border:1px solid ' + st.color + ';color:' + st.color + ';border-radius:999px;font-size:13px">' + esc(st.text) + '</span></p>' +
        (live ? '<p style="margin:6px 0">網址：<a href="' + esc(s.public_url) + '" target="_blank" rel="noopener">' + esc(s.public_url) + '</a></p>' : '') +
        (s.paid_until ? '<p style="margin:6px 0;font-size:14px">服務到期日：' + esc(s.paid_until) + '</p>' : '') +
        '<p style="margin:14px 0 0"><a class="m-btn primary sm" href="' + esc(YC.url('builder/')) + '">編輯網站</a></p></div>';
    } catch (err) { console.warn('dash-site', err); }
  }
  YC.onChange(function () { draw(); });
})();
