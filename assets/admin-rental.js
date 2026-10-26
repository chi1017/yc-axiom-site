/* 管理後台「租用網站」分頁：清單／篩選／詳情，以及確認收款、重新發佈、暫停／恢復、還原版本、網域。
   前端只負責顯示與送出請求；誰能讀寫由資料庫 RLS（JWT app_metadata.role = 'admin'）與 Edge Function admin-site 決定。 */
(function () {
  'use strict';
  var YC = window.YC;
  var root = document.getElementById('adm-rental'), members = document.getElementById('adm-root'), tabs = document.getElementById('adm-tabs');
  if (!YC || !root || !members || !tabs) return;

  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var safeUrl = function (u) { return /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : ''; };
  var STATUS = { draft: '草稿', pending: '待上線', live: '上線中', overdue: '逾期', suspended: '已暫停', cancelled: '已終止' };
  var STATUS_COLOR = { draft: '#9a8f80', pending: '#e0b05a', live: '#6cc08b', overdue: '#f59e0b', suspended: '#f0776b', cancelled: '#9ca3af' };
  var EVENT_LABEL = {
    published_first: '客戶首次送出上線申請', version_saved: '客戶更新送審內容', deploy_queued: '排入部署', deploy_ok: '部署成功', deploy_failed: '部署失敗',
    email_sent: '寄信成功', email_failed: '寄信失敗', terms_accepted: '客戶同意租用條款', payment_confirmed: '確認收款', payment_failed: '線上付款失敗', payment_mismatch: '付款金額不符', recurring_failed: '自動扣款失敗', recurring_cancelled: '客戶取消自動扣款', suspended: '暫停網站', restored: '恢復網站', terminated: '終止租用',
    republish_queued: '重新發佈', version_restore_queued: '還原版本', domain_set: '設定網域', domain_checked: '檢查網域', domain_active: '網域生效', domain_failed: '網域設定失敗', domain_cleared: '移除網域',
    reminder_sent: '系統：寄出到期提醒', auto_overdue: '系統：到期，自動改為逾期', auto_live: '系統：到期日已延後，改回上線中', long_suspend_notified: '系統：暫停滿 30 天，已通知管理員', cron_anomaly: '系統：資料異常',
    monthly_report: '月報檢測完成', report_failed: '月報檢測失敗', photos_cleaned: '清理沒被引用的舊照片'
  };
  var MAIL_LABEL = { adminFirstPublish: '管理員通知', customerGoLive: '網站上線通知（客戶）', customerReceipt: '收款通知（客戶）',
    customerReminder: '即將到期提醒（客戶）', customerOverdue: '已到期通知（客戶）', customerSuspended: '已暫停通知（客戶）', customerMonthlyReport: '月報（客戶）', adminAutoSuspended: '自動暫停通知（管理員）', adminLongSuspended: '暫停滿 30 天通知（管理員）' };
  var state = { domMsg: '', rows: [], loaded: false, q: '', status: 'all', due: 'all', failedOnly: false, layout: 'all', sort: 'due_asc', sel: null, bank: null, plan: null, tab: 'members', det: null, loading: false, simOpen: false, sim: { date: '', site: '', out: null, err: '', busy: false, runs: null, runsErr: '' } };
  var token = 0, watchTimer = null;

  // ── 小工具 ──
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDT(s) { var d = new Date(s); return isNaN(d) ? '' : d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function fmtD(s) { if (!s) return ''; var d = new Date(s); return isNaN(d) ? '' : d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); }
  function twToday() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
  function addMonths(dateStr, n) {
    var a = dateStr.split('-').map(Number), first = new Date(Date.UTC(a[0], a[1] - 1 + n, 1));
    var last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(a[2], last))).toISOString().slice(0, 10);
  }
  function money(n) { return 'NT$ ' + Number(n).toLocaleString('en-US'); }
  function badge(st) { var c = STATUS_COLOR[st] || '#9a8f80'; return '<span class="rn-badge" style="color:' + c + ';border-color:' + c + '">' + esc(STATUS[st] || st) + '</span>'; }
  function dueText(r) {
    if (!r.paid_until) return '<span class="rn-dim">—</span>';
    var d = r.days_left, tail = d == null ? '' : d < 0 ? '<span class="rn-bad">已過 ' + (-d) + ' 天</span>' : d <= 7 ? '<span class="rn-warn">剩 ' + d + ' 天</span>' : '<span class="rn-dim">剩 ' + d + ' 天</span>';
    return esc(r.paid_until) + '<div class="rn-sub">' + tail + '</div>';
  }
  function deployText(r) {
    if (!r.last_deploy_type) return '<span class="rn-dim">尚無</span>';
    var ok = r.last_deploy_type === 'deploy_ok';
    return '<span class="' + (ok ? 'rn-ok' : 'rn-bad') + '">' + (ok ? '成功' : '失敗') + '</span><div class="rn-sub">' + esc(fmtDT(r.last_deploy_at)) + '</div>';
  }
  function toast(t) {
    var el = document.getElementById('adm-toast');
    if (!el) { el = document.createElement('div'); el.id = 'adm-toast'; document.body.appendChild(el); }
    el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('show'); }, 4200);
  }
  function findRow(id) { return state.rows.filter(function (r) { return r.id === id; })[0]; }

  // ── 樣式（只影響本分頁） ──
  var css = document.createElement('style');
  css.textContent =
    '#adm-rental[hidden]{display:none}.rn-badge{display:inline-block;padding:1px 10px;border:1px solid;border-radius:999px;font-size:12px;white-space:nowrap}' +
    '.rn-dim{color:var(--text-dim)}.rn-ok{color:#34d399}.rn-bad{color:#f87171}.rn-warn{color:#fbbf24}.rn-sub{font-size:12px;color:var(--text-dim);margin-top:2px}' +
    '.rn-table{min-width:1100px}.rn-row{cursor:pointer}.rn-row:hover td{background:rgba(255,255,255,.03)}.rn-row:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}' +
    '.rn-shop{color:var(--text-bright);font-weight:700}.rn-tools label.rn-chk{display:flex;gap:6px;align-items:center;font-size:13.5px;color:var(--text)}' +
    '.rn-drawer{position:fixed;top:0;right:0;bottom:0;width:min(640px,100%);background:var(--bg,#111);border-left:1px solid var(--border);z-index:900;overflow-y:auto;padding:22px 22px 60px;box-shadow:-8px 0 30px rgba(0,0,0,.35)}' +
    '.rn-drawer.mem,.rn-mback.mem{max-width:none;margin:0}.rn-back{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:890}.rn-dh{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.rn-dh h2{margin:0 0 6px;font-size:20px;color:var(--text-bright)}' +
    '.rn-kv{display:grid;grid-template-columns:110px 1fr;gap:6px 14px;font-size:14px;margin:10px 0}.rn-kv dt{color:var(--text-dim)}.rn-kv dd{margin:0;word-break:break-all}' +
    '.rn-acts{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.rn-acts .m-btn{font-size:13.5px}.rn-danger{border-color:rgba(248,113,113,.6)!important;color:#f87171!important}' +
    '.rn-h{font:700 14px var(--f-ui);color:var(--text-bright);margin:24px 0 8px}.rn-tl{list-style:none;margin:0;padding:0;border-left:2px solid var(--border)}.rn-tl li{padding:6px 0 6px 14px;font-size:13.5px;position:relative}' +
    '.rn-tl li:before{content:"";position:absolute;left:-6px;top:13px;width:10px;height:10px;border-radius:50%;background:var(--border)}.rn-tl li.ok:before{background:#34d399}.rn-tl li.bad:before{background:#f87171}.rn-tl time{display:block;font-size:12px;color:var(--text-dim)}' +
    '.rn-vers,.rn-pays{list-style:none;margin:0;padding:0;display:grid;gap:6px}.rn-vers li,.rn-pays li{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:4px;padding:8px 12px;font-size:13.5px}' +
    '.rn-form{display:grid;gap:12px}.rn-form label{display:grid;gap:4px;font-size:13px;color:var(--text-dim)}.rn-form input,.rn-form select,.rn-form textarea{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;font:14px var(--f-ui);padding:9px 11px}' +
    '.rn-note{font-size:13px;color:var(--text-dim);line-height:1.7;margin:0}.rn-preview{padding:10px 12px;border:1px dashed var(--accent);border-radius:4px;font-size:13.5px;color:var(--text-bright)}' +
    '.rn-mback{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px}.rn-modal{background:var(--surface);border:1px solid var(--border);border-radius:8px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;padding:22px}' +
    '.rn-modal h3{margin:0 0 12px;font-size:18px;color:var(--text-bright)}.rn-macts{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}.rn-err{color:#f87171;font-size:13px;min-height:18px}' +
    '.rn-sim{border:1px dashed var(--accent);border-radius:8px;padding:16px 18px;margin:0 0 16px;display:grid;gap:12px}.rn-sim h3{margin:0;font-size:16px;color:var(--text-bright)}.rn-sim .rn-srow{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}' +
    '.rn-sim .rn-srow label{display:grid;gap:4px;font-size:13px;color:var(--text-dim)}.rn-sim input,.rn-sim select{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;font:14px var(--f-ui);padding:8px 10px;min-height:38px}' +
    '.rn-sim table{width:100%;border-collapse:collapse;font-size:13.5px}.rn-sim th,.rn-sim td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:top}.rn-sim th{color:var(--text-dim);font-weight:600;font-size:12.5px}' +
    '.rn-sim .rn-runs{list-style:none;margin:0;padding:0;font-size:13px;color:var(--text-dim);display:grid;gap:3px}.rn-mode{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;border:1px solid var(--accent);color:var(--accent)}' +
    '@media (max-width:640px){.rn-kv{grid-template-columns:90px 1fr}.rn-drawer{padding:16px 14px 60px}}';
  document.head.appendChild(css);

  // ── 分頁切換 ──
  function setTab(t) {
    state.tab = t;
    members.style.display = t === 'members' ? '' : 'none';
    root.hidden = t !== 'rental';
    Array.prototype.forEach.call(tabs.querySelectorAll('[data-tab]'), function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === t)); });
    try { history.replaceState(null, '', t === 'rental' ? '#rental' : location.pathname + location.search); } catch (e) { /* ignore */ }
    if (t === 'rental') render();
  }
  Array.prototype.forEach.call(tabs.querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); }); });

  // ── 資料 ──
  async function load() {
    var r = await YC.client.from('admin_rental_overview').select('*').order('created_at', { ascending: false }).limit(2000);
    if (r.error) throw r.error;
    state.rows = r.data || [];
    // 版型（一頁／多頁）不在總覽 view 裡，另外讀 rental_sites 合併（管理員可讀全部）
    var lay = await YC.client.from('rental_sites').select('id,layout,upgraded_at').limit(2000);
    var byId = {}; (lay.data || []).forEach(function (x) { byId[x.id] = x; });
    state.rows.forEach(function (x) { var l = byId[x.id]; x.layout = l && l.layout === 'multi' ? 'multi' : 'single'; x.upgraded_at = l ? l.upgraded_at : null; });
    loadIndustries();
    var s = await YC.client.from('settings').select('key,value').in('key', ['bank_transfer', 'plan']);
    state.bank = null; state.plan = null;
    (s.data || []).forEach(function (x) { if (x.key === 'bank_transfer') state.bank = x.value; if (x.key === 'plan') state.plan = x.value; });
    state.loaded = true;
  }
  async function loadDetail(id) {
    var c = YC.client;
    var rs = await Promise.all([
      c.from('site_events').select('id,type,detail,created_at').eq('site_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100),
      c.from('site_versions').select('id,created_at').eq('site_id', id).order('created_at', { ascending: false }).limit(20),
      c.from('payments').select('id,amount,months,method,paid_on,period_from,period_to,reference,confirmed_by,created_at').eq('site_id', id).order('paid_on', { ascending: false }).order('created_at', { ascending: false }).limit(50),
      c.from('site_reports').select('month,status,seo_score,geo_score,error,emailed_at').eq('site_id', id).order('month', { ascending: false }).limit(3)
    ]);
    rs.slice(0, 3).forEach(function (x) { if (x.error) throw x.error; });
    return { events: rs[0].data || [], versions: rs[1].data || [], payments: rs[2].data || [], reports: rs[3].error ? [] : (rs[3].data || []) };
  }
  async function call(action, siteId, params) {
    var r = await YC.client.functions.invoke('admin-site', { body: Object.assign({ action: action, site_id: siteId }, params || {}) });
    if (r.error) {
      var body = null; try { body = await r.error.context.json(); } catch (e) { /* ignore */ }
      throw new Error((body && body.message) || '操作失敗，請稍後再試');
    }
    return r.data || {};
  }

  // ── 排程模擬（驗收用） ──
  // 預覽：dry_run，不寄信、不改資料；實際執行：真的寄信／改狀態／部署（用假日期時只能針對單一網站，後端也會強制檢查）
  var RULE_NAME = { reminder: '到期提醒', to_overdue: '轉為逾期', overdue_notice: '補寄已到期通知', auto_suspend: '自動暫停', long_suspend_notice: '暫停滿 30 天通知', back_to_live: '改回上線中', anomaly: '資料異常' };
  async function callCron(body) {
    var r = await YC.client.functions.invoke('rental-cron', { body: body });
    if (r.error) {
      var b = null, st = r.error.context && r.error.context.status; try { b = await r.error.context.json(); } catch (e) { /* ignore */ }
      var m = (b && b.message) || (st === 404 ? 'rental-cron 尚未部署（Supabase → Edge Functions → 建立 rental-cron，Verify JWT 關閉）' : '呼叫失敗，請稍後再試');
      var err = new Error(m); err.data = b; throw err;
    }
    return r.data || {};
  }
  function simSites() { return state.rows.filter(function (r) { return ['live', 'overdue', 'suspended'].indexOf(r.status) >= 0; }); }
  function simHtml() {
    var m = state.sim, date = m.date || twToday();
    var sites = simSites();
    return '<section class="rn-sim" id="rn-sim" aria-label="排程模擬">' +
      '<h3>排程模擬（驗收用）</h3>' +
      '<p class="rn-note">選一個日期，看排程在那一天會對網站做什麼。<b>預覽</b>不會寄信、不會改任何資料。<b>實際執行</b>會真的寄信、改狀態、部署維護頁；用「不是今天」的日期實際執行時，必須指定單一網站（避免誤對真實客戶動作）。</p>' +
      '<div class="rn-srow"><label>模擬日期（台灣）<input type="date" id="rn-sd" value="' + esc(date) + '"></label>' +
      '<label>網站<select id="rn-ss"><option value="">所有網站（只能預覽，或實際執行「今天」）</option>' + sites.map(function (r) { return '<option value="' + esc(r.id) + '"' + (m.site === r.id ? ' selected' : '') + '>' + esc((r.shop_name || r.slug) + '（' + r.slug + '）・' + (STATUS[r.status] || r.status) + '・到期 ' + (r.paid_until || '—')) + '</option>'; }).join('') + '</select></label>' +
      '<button class="m-btn sm" id="rn-sp" ' + (m.busy ? 'disabled' : '') + '>預覽（不寄信、不改資料）</button>' +
      '<button class="m-btn sm rn-danger" id="rn-sr" ' + (m.busy ? 'disabled' : '') + '>實際執行…</button></div>' +
      '<div id="rn-sout" aria-live="polite">' + (m.busy ? '<p class="rn-note">執行中…</p>' : m.err ? '<p class="rn-err">' + esc(m.err) + '</p>' : simOutHtml(m.out)) + '</div>' +
      '<div><b style="font-size:13.5px;color:var(--text-bright)">最近的排程紀錄</b><div id="rn-runs">' + runsHtml() + '</div></div></section>';
  }
  function simOutHtml(o) {
    if (!o) return '';
    var rows = o.planned || o.results || [], dry = o.mode === 'dry_run';
    var head = '<p class="rn-note"><span class="rn-mode">' + (dry ? '預覽' : o.mode === 'simulated' ? '模擬日期・實際執行' : '實際執行') + '</span>　以 <b>' + esc(o.today) + '</b> 當作「今天」，檢查了 ' + esc((o.counts || {}).sites == null ? '—' : o.counts.sites) + ' 個網站，' + (rows.length ? rows.length + ' 項動作：' : '這一天沒有任何網站需要處理。') + '</p>';
    var tbl = rows.length ? '<div class="adm-wrap"><table><thead><tr><th>網站</th><th>目前狀態</th><th>到期日</th><th>動作</th><th>' + (dry ? '會發生什麼' : '結果') + '</th></tr></thead><tbody>' + rows.map(function (x) {
      var res = dry ? esc(x.label) + (x.detail ? '<div class="rn-sub">' + esc(x.detail) + '</div>' : '') : '<span class="' + (x.outcome === 'done' ? 'rn-ok' : x.outcome === 'failed' ? 'rn-bad' : 'rn-dim') + '">' + (x.outcome === 'done' ? '完成' : x.outcome === 'failed' ? '失敗' : '略過') + '</span>' + (x.note ? '<div class="rn-sub">' + esc(x.note) + '</div>' : '');
      return '<tr><td><div class="rn-shop">' + esc(x.shop_name || x.slug) + '</div><div class="rn-sub">' + esc(x.slug) + '</div></td><td>' + badge(x.status) + '</td><td>' + esc(x.paid_until || '—') + '</td><td>' + esc(RULE_NAME[x.rule] || x.rule) + '</td><td>' + res + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '';
    var wk = '';
    if (o.weekly) {
      var secs = (o.weekly.sections || []).filter(function (z) { return z.count; }).map(function (z) { return z.title + ' ' + z.count; }).join('、');
      wk = '<p class="rn-note">管理員週摘要：' + (o.weekly.would_send ? '這天（週一）會寄出' : o.weekly.sent ? '<span class="rn-ok">已寄出</span>' : o.weekly.skipped ? '今天已經寄過' : '<span class="rn-bad">寄送失敗：' + esc(o.weekly.error || '') + '</span>') + (secs ? '（內容：' + esc(secs) + '）' : '（本週沒有需要處理的事項）') + '</p>';
    }
    var errs = (o.errors || []).length ? '<p class="rn-err">' + o.errors.map(esc).join('<br>') + '</p>' : '';
    return head + tbl + wk + errs + (o.truncated ? '<p class="rn-warn">處理時間到了，剩下的會在下一輪繼續（不會重複寄信）。</p>' : '');
  }
  function runsHtml() {
    var m = state.sim;
    if (m.runsErr) return '<p class="rn-note">' + esc(m.runsErr) + '</p>';
    if (!m.runs) return '<p class="rn-note">讀取中…</p>';
    if (!m.runs.length) return '<p class="rn-note">還沒有排程執行紀錄（排程設定好、第一次跑過就會出現在這裡）。</p>';
    return '<ul class="rn-runs">' + m.runs.map(function (x) {
      var sm = x.summary || {}, n = (sm.results || []).length, bad = (sm.errors || []).length;
      return '<li>' + esc(fmtDT(x.created_at)) + '・' + (x.job === 'weekly' ? '每週摘要' : '每日規則') + '・' + (x.mode === 'simulated' ? '模擬（' + esc(x.run_date) + '）' : '真實') + '・' + esc(x.triggered_by) + (x.job === 'daily' ? '・處理 ' + n + ' 項' + (bad ? '，<span class="rn-bad">' + bad + ' 項失敗</span>' : '') : '') + '</li>';
    }).join('') + '</ul>';
  }
  async function loadRuns() {
    var m = state.sim; m.runs = null; m.runsErr = '';
    try {
      var r = await YC.client.from('cron_runs').select('id,job,run_date,mode,triggered_by,created_at,summary').order('created_at', { ascending: false }).limit(6);
      if (r.error) throw r.error;
      m.runs = r.data || [];
    } catch (e) { m.runsErr = (e && (e.code === '42P01' || /cron_runs|schema cache|does not exist/i.test(String(e.message || '')))) ? '資料庫還沒有升級：請先在 Supabase SQL Editor 執行 007_rental_cron.sql。' : '讀取失敗：' + (e.message || e); }
    var el = document.getElementById('rn-runs'); if (el) el.innerHTML = runsHtml();
  }
  function bindSim() {
    var m = state.sim, $ = function (id) { return document.getElementById(id); };
    if (!m.date) m.date = twToday();
    $('rn-sd').onchange = function () { m.date = this.value; };
    $('rn-ss').onchange = function () { m.site = this.value; };
    var body = function (dry) { var b = { job: 'daily', dry_run: dry }; if ($('rn-sd').value) b.as_of = $('rn-sd').value; if ($('rn-ss').value) b.site_id = $('rn-ss').value; return b; };
    var run = async function (b) {
      m.busy = true; m.err = ''; drawList();
      try { m.out = await callCron(b); } catch (e) { m.err = e.message || String(e); m.out = null; }
      m.busy = false;
      if (b.dry_run !== true) { try { await load(); } catch (e) { /* ignore */ } }
      drawList(); loadRuns();
    };
    $('rn-sp').onclick = function () { if (!$('rn-sd').value) { m.err = '請選擇日期'; drawList(); return; } m.date = $('rn-sd').value; m.site = $('rn-ss').value; run(body(true)); };
    $('rn-sr').onclick = function () {
      var date = $('rn-sd').value, site = $('rn-ss').value, row = site ? findRow(site) : null, isToday = date === twToday();
      if (!date) { m.err = '請選擇日期'; drawList(); return; }
      m.date = date; m.site = site;
      if (!isToday && !site) { m.err = '用「不是今天」的日期實際執行時，必須先選一個網站（避免誤對真實客戶寄信或暫停）。'; drawList(); return; }
      var who = row ? '網站「' + esc(row.shop_name || row.slug) + '」（信會寄到 ' + esc(row.member_email) + '）' : '<b>所有網站</b>';
      confirmDialog('實際執行排程？', '<div class="rn-form"><p class="rn-note">將以 <b>' + esc(date) + '</b>' + (isToday ? '（今天）' : '（模擬日期）') + ' 當作「今天」，對 ' + who + ' <b>實際執行</b>：符合條件的網站會真的寄出信件、改變狀態，必要時部署維護頁。' + (isToday ? '' : '事件時間軸會標示模擬日期。') + '</p>' +
        '<p class="rn-note">不確定的話，先按「預覽」看會發生什麼。這個動作不會刪除任何資料。</p></div>', '實際執行', true, async function () { closeModal(); await run(body(false)); });
    };
  }

  // ── 行業名稱：從版型專案讀行業清單（讀不到時顯示行業代碼）──
  var IND = null;
  function loadIndustries() {
    if (IND) return;
    IND = {};
    import('https://chi1017.github.io/yc-axiom-sites/templates/shared/industries.js').then(function (m) {
      m.INDUSTRIES.forEach(function (i) { IND[i.key] = i.label; });
      if (state.tab === 'rental') drawList();
    }).catch(function () { /* 讀不到就顯示代碼 */ });
  }
  function indLabel(k) { return (IND && IND[k]) || k || '—'; }
  var LAYOUT = { single: '一頁版', multi: '多頁版' };

  // ── 篩選 / 排序 ──
  function view() {
    var q = state.q.trim().toLowerCase();
    var rows = state.rows.filter(function (r) {
      if (state.status !== 'all' && r.status !== state.status) return false;
      if (state.due === '7' && !(r.days_left != null && r.days_left >= 0 && r.days_left <= 7)) return false;
      if (state.due === '30' && !(r.days_left != null && r.days_left >= 0 && r.days_left <= 30)) return false;
      if (state.due === 'over' && !(r.days_left != null && r.days_left < 0)) return false;
      if (state.failedOnly && r.last_deploy_type !== 'deploy_failed') return false;
      if (state.layout !== 'all' && r.layout !== state.layout) return false;
      if (q && [r.slug, r.shop_name, r.member_email, r.custom_domain, indLabel(r.template)].join('\n').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var t = function (x) { return x ? +new Date(x) : 0; };
    var by = {
      due_asc: function (a, b) { return (a.paid_until ? Date.parse(a.paid_until) : Infinity) - (b.paid_until ? Date.parse(b.paid_until) : Infinity); },
      due_desc: function (a, b) { return (b.paid_until ? Date.parse(b.paid_until) : -Infinity) - (a.paid_until ? Date.parse(a.paid_until) : -Infinity); },
      pub_desc: function (a, b) { return t(b.last_published_at) - t(a.last_published_at); },
      created_desc: function (a, b) { return t(b.created_at) - t(a.created_at); }
    };
    return rows.sort(by[state.sort] || by.due_asc);
  }

  // ── 畫面：列表 ──
  function opts(list, cur) { return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }
  function drawList() {
    var rows = state.rows, count = function (st) { return rows.filter(function (r) { return r.status === st; }).length; };
    var soon = rows.filter(function (r) { return r.days_left != null && r.days_left >= 0 && r.days_left <= 7 && (r.status === 'live' || r.status === 'overdue'); }).length;
    var failed = rows.filter(function (r) { return r.last_deploy_type === 'deploy_failed'; }).length;
    var v = view();
    root.innerHTML =
      '<div class="adm-chips"><div><b>' + rows.length + '</b><span>全部網站</span></div><div><b>' + count('pending') + '</b><span>待上線</span></div><div><b>' + count('live') + '</b><span>上線中</span></div>' +
      '<div><b>' + count('overdue') + '</b><span>逾期</span></div><div><b>' + count('suspended') + '</b><span>已暫停</span></div><div><b>' + soon + '</b><span>7 天內到期</span></div><div><b>' + failed + '</b><span>最近部署失敗</span></div></div>' +
      (state.simOpen ? simHtml() : '') +
      '<div class="adm-tools rn-tools">' +
      '<input type="search" id="rn-q" placeholder="搜尋 網址代稱／店名／Email" value="' + esc(state.q) + '" aria-label="搜尋">' +
      '<select id="rn-status" aria-label="狀態">' + opts([['all', '全部狀態']].concat(Object.keys(STATUS).map(function (k) { return [k, STATUS[k]]; })), state.status) + '</select>' +
      '<select id="rn-layout" aria-label="版型">' + opts([['all', '全部版型'], ['single', '一頁版'], ['multi', '多頁版']], state.layout) + '</select>' +
      '<select id="rn-due" aria-label="到期">' + opts([['all', '全部到期日'], ['7', '7 天內到期'], ['30', '30 天內到期'], ['over', '已過期']], state.due) + '</select>' +
      '<label class="rn-chk"><input type="checkbox" id="rn-fail"' + (state.failedOnly ? ' checked' : '') + '>只看部署失敗</label>' +
      '<select id="rn-sort" aria-label="排序">' + opts([['due_asc', '到期日：近 → 遠'], ['due_desc', '到期日：遠 → 近'], ['pub_desc', '最近發佈'], ['created_desc', '建立時間（新 → 舊）']], state.sort) + '</select>' +
      '<button class="m-btn sm" id="rn-settings">匯款與方案設定</button><button class="m-btn sm" id="rn-simbtn" aria-expanded="' + (state.simOpen ? 'true' : 'false') + '">排程模擬</button><button class="m-btn sm" id="rn-reload">重新整理</button>' +
      '<span class="adm-count">' + v.length + ' / ' + rows.length + ' 個網站</span></div>' +
      '<div class="adm-wrap"><table class="adm-table rn-table"><thead><tr><th>狀態</th><th>店名／代稱</th><th>會員</th><th>網址</th><th>到期日</th><th>最近部署</th><th>最近發佈</th></tr></thead><tbody>' +
      (v.length ? v.map(function (r) {
        var u = safeUrl(r.public_url);
        return '<tr class="rn-row" tabindex="0" data-id="' + esc(r.id) + '"><td>' + badge(r.status) + '</td><td><div class="rn-shop">' + esc(r.shop_name || '（未命名）') + '</div><div class="rn-sub">' + esc(r.slug) + '・' + esc(indLabel(r.template)) + '・' + esc(LAYOUT[r.layout] || '一頁版') + '</div></td>' +
          '<td style="word-break:break-all">' + esc(r.member_email) + '</td><td class="adm-url">' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u.replace(/^https:\/\//, '').replace(/\/$/, '')) + '</a>' : '<span class="rn-dim">—</span>') + (r.custom_domain ? '<div class="rn-sub">' + esc(r.custom_domain) + (r.domain_status === 'active' ? '（已生效）' : '（設定中）') + '</div>' : '') + '</td>' +
          '<td>' + dueText(r) + '</td><td>' + deployText(r) + '</td><td class="adm-time">' + (r.last_published_at ? esc(fmtDT(r.last_published_at)) : '<span class="rn-dim">—</span>') + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="adm-none">' + (rows.length ? '沒有符合條件的網站' : '還沒有客戶建立網站') + '</td></tr>') + '</tbody></table></div>';
    bindList();
  }
  function bindList() {
    var $ = function (id) { return document.getElementById(id); };
    var redraw = function () { var pos = $('rn-q') && document.activeElement === $('rn-q'); drawList(); if (pos) { var e = $('rn-q'); e.focus(); e.setSelectionRange(e.value.length, e.value.length); } };
    $('rn-q').oninput = function () { state.q = this.value; redraw(); };
    $('rn-status').onchange = function () { state.status = this.value; drawList(); };
    $('rn-due').onchange = function () { state.due = this.value; drawList(); };
    $('rn-layout').onchange = function () { state.layout = this.value; drawList(); };
    $('rn-fail').onchange = function () { state.failedOnly = this.checked; drawList(); };
    $('rn-sort').onchange = function () { state.sort = this.value; drawList(); };
    $('rn-simbtn').onclick = function () { state.simOpen = !state.simOpen; drawList(); if (state.simOpen) loadRuns(); };
    if (state.simOpen) bindSim();
    $('rn-reload').onclick = async function () { try { await load(); drawList(); toast('已重新整理'); } catch (e) { toast('讀取失敗：' + (e.message || e)); } };
    $('rn-settings').onclick = openSettings;
    Array.prototype.forEach.call(root.querySelectorAll('.rn-row'), function (tr) {
      var open = function () { openDetail(tr.getAttribute('data-id')); };
      tr.onclick = function (e) { if (e.target.closest('a')) return; open(); };
      tr.onkeydown = function (e) { if (e.key === 'Enter') open(); };
    });
  }

  // ── 詳情側欄 ──
  function closeDrawer() {
    clearTimeout(watchTimer); state.sel = null; state.det = null;
    var d = document.getElementById('rn-drawer'), b = document.getElementById('rn-dback'); if (d) d.remove(); if (b) b.remove();
  }
  async function openDetail(id) {
    var r = findRow(id); if (!r) return;
    closeDrawer(); state.sel = id; state.domMsg = '';
    var back = document.createElement('div'); back.className = 'rn-back'; back.id = 'rn-dback'; back.onclick = closeDrawer;
    var d = document.createElement('aside'); d.className = 'rn-drawer mem'; d.id = 'rn-drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', '網站詳情');
    d.innerHTML = '<p class="rn-note">載入中…</p>';
    document.body.appendChild(back); document.body.appendChild(d);
    try { state.det = await loadDetail(id); } catch (e) { d.innerHTML = '<p class="rn-err">讀取失敗：' + esc(e.message || e) + '</p><button class="m-btn" id="rn-x">關閉</button>'; document.getElementById('rn-x').onclick = closeDrawer; return; }
    if (state.sel !== id) return;
    drawDetail();
  }
  function evSummary(e) {
    var d = e.detail || {}, bits = [];
    if (e.type === 'payment_confirmed') bits.push(money(d.amount) + '・' + d.months + ' 個月' + (d.period_to ? '・到期 ' + d.period_to : ''), d.warning || '');
    else if (e.type === 'suspended') bits.push(d.auto ? '系統自動暫停' : '', d.reason ? '原因：' + d.reason : '');
    else if (e.type === 'terminated') bits.push(d.status_from ? '原狀態：' + (STATUS[d.status_from] || d.status_from) : '', d.reason ? '原因：' + d.reason : '');
    else if (e.type === 'reminder_sent') bits.push('到期日 ' + (d.paid_until || '') + '，剩 ' + (d.days_left == null ? '?' : d.days_left) + ' 天');
    else if (e.type === 'auto_overdue') bits.push('到期日 ' + (d.paid_until || ''));
    else if (e.type === 'long_suspend_notified') bits.push('自 ' + (d.since || '') + '，共 ' + (d.days || '') + ' 天');
    else if (e.type === 'monthly_report') bits.push((d.month || '').slice(0, 7) + '　SEO ' + d.seo + '／GEO ' + d.geo);
    else if (e.type === 'report_failed') bits.push((d.month || '').slice(0, 7), d.error || '');
    else if (e.type === 'photos_cleaned') bits.push('刪除 ' + (d.count || 0) + ' 個');
    else if (e.type === 'deploy_ok') bits.push(d.mode === 'maintenance' ? '維護頁' : d.mode === 'closed' ? '已停止服務頁' : (d.url || ''), d.skipped || '');
    else if (e.type === 'deploy_failed') bits.push(d.message || '');
    else if (e.type === 'email_sent' || e.type === 'email_failed') bits.push(MAIL_LABEL[d.template] || d.template || '', d.error || '');
    else if (e.type === 'version_restore_queued') bits.push(d.overwrite_draft ? '已覆蓋會員草稿' : '未覆蓋會員草稿');
    else if (e.type.indexOf('domain_') === 0) bits.push(d.domain || '', d.cf_status ? 'Cloudflare：' + d.cf_status : '', d.message || '');
    else if (e.type === 'restored') bits.push('狀態改為 ' + (STATUS[d.status_to] || d.status_to || ''));
    else if (e.type === 'terms_accepted') bits.push(d.version || '');
    if (d.simulated_as_of) bits.push('（模擬日期 ' + d.simulated_as_of + '）');
    if (d.by) bits.push(d.by === 'system' ? '系統排程' : '操作者 ' + d.by);
    return bits.filter(Boolean).join('　');
  }
  function drawDetail() {
    var r = findRow(state.sel), d = document.getElementById('rn-drawer'), det = state.det; if (!r || !d || !det) return;
    var u = safeUrl(r.public_url), canDeploy = r.status === 'live' || r.status === 'overdue';
    var acts = [];
    if (['pending', 'live', 'overdue', 'suspended'].indexOf(r.status) >= 0) acts.push('<button class="m-btn primary sm" data-act="pay">確認收款</button>');
    if (canDeploy || r.status === 'suspended') acts.push('<button class="m-btn sm" data-act="republish">' + (r.status === 'suspended' ? '重新部署維護頁' : '重新發佈') + '</button>');
    if (['pending', 'live', 'overdue'].indexOf(r.status) >= 0) acts.push('<button class="m-btn sm rn-danger" data-act="suspend">暫停網站</button>');
    if (r.status === 'suspended') acts.push('<button class="m-btn sm" data-act="restore">恢復網站</button>');
    if (['pending', 'live', 'overdue', 'suspended'].indexOf(r.status) >= 0) acts.push('<button class="m-btn sm rn-danger" data-act="terminate">終止租用</button>');
    if (r.status === 'cancelled') {
      acts.push('<button class="m-btn sm" data-act="restore">恢復租用</button>');
      acts.push('<button class="m-btn sm rn-danger" data-act="purge">永久刪除</button>');
    }
    acts.push('<a class="m-btn sm" target="_blank" rel="noopener" href="' + esc(YC.url('builder/preview/') + '?site=' + encodeURIComponent(r.id)) + '">預覽最新版本</a>');
    var kv = [
      ['會員', esc(r.member_email)],
      ['行業／版型', esc(indLabel(r.template)) + '・' + esc(LAYOUT[r.layout] || '一頁版') + (r.upgraded_at ? '<span class="rn-dim">（' + esc(fmtDT(r.upgraded_at)) + ' 由一頁版升級）</span>' : '')],
      ['網址', u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>' : '—'],
      ['服務到期', r.paid_until ? esc(r.paid_until) + (r.days_left == null ? '' : r.days_left < 0 ? '（已過 ' + (-r.days_left) + ' 天）' : '（剩 ' + r.days_left + ' 天）') : '—'],
      ['累計收款', r.payment_count ? money(r.paid_total) + '（' + r.payment_count + ' 筆）' : '—'],
      ['租用條款', r.terms_accepted_at ? esc(fmtDT(r.terms_accepted_at)) + '・' + esc(r.terms_version || '') : '<span class="rn-bad">尚未同意</span>'],
      ['建立', esc(fmtDT(r.created_at))], ['首次發佈', r.first_published_at ? esc(fmtDT(r.first_published_at)) : '—'], ['最近發佈', r.last_published_at ? esc(fmtDT(r.last_published_at)) : '—'],
      ['最近部署', r.last_deploy_type ? (r.last_deploy_type === 'deploy_ok' ? '<span class="rn-ok">成功</span>' : '<span class="rn-bad">失敗</span>') + '　' + esc(fmtDT(r.last_deploy_at)) + (r.last_deploy_message ? '<div class="rn-sub">' + esc(r.last_deploy_message) + '</div>' : '') : '—']
    ];
    var rp = (det.reports || [])[0];
    if (rp) kv.push(['最近月報', esc(String(rp.month).slice(0, 7)) + '　' + (rp.status === 'ok' ? 'SEO <b>' + esc(rp.seo_score) + '</b>／GEO <b>' + esc(rp.geo_score) + '</b>' + (rp.emailed_at ? '<span class="rn-dim">（已寄給客戶）</span>' : '<span class="rn-warn">（尚未寄出）</span>') : '<span class="rn-bad">檢測失敗</span>' + (rp.error ? '<div class="rn-sub">' + esc(rp.error) + '</div>' : ''))]);
    if (r.status === 'suspended') kv.splice(2, 0, ['暫停', esc(fmtDT(r.suspended_at)) + (r.suspend_reason ? '・' + esc(r.suspend_reason) : '')]);
    var tl = det.events.map(function (e) {
      var cls = e.type === 'deploy_ok' || e.type === 'email_sent' || e.type === 'payment_confirmed' ? 'ok' : (e.type === 'deploy_failed' || e.type === 'email_failed' || e.type === 'domain_failed' || e.type === 'report_failed' || e.type === 'cron_anomaly' ? 'bad' : '');
      return '<li class="' + cls + '"><b>' + esc(EVENT_LABEL[e.type] || e.type) + '</b><time>' + esc(fmtDT(e.created_at)) + '</time>' + (evSummary(e) ? '<div class="rn-sub">' + esc(evSummary(e)) + '</div>' : '') + '</li>';
    }).join('');
    d.innerHTML =
      '<div class="rn-dh"><div><h2>' + esc(r.shop_name || '（未命名）') + '</h2><div>' + badge(r.status) + ' <span class="rn-sub" style="display:inline">代稱 ' + esc(r.slug) + '</span></div></div><button class="m-btn sm" id="rn-x" aria-label="關閉">關閉</button></div>' +
      '<div class="rn-acts">' + acts.join('') + '</div>' +
      '<dl class="rn-kv">' + kv.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('') + '</dl>' +
      '<h3 class="rn-h">自訂網域</h3><div id="rn-dom">' + domainHtml(r) + '</div>' +
      '<h3 class="rn-h">版本（最近 ' + det.versions.length + ' 版）</h3>' + (det.versions.length ? '<ul class="rn-vers">' + det.versions.map(function (v) {
        var isLive = v.id === r.live_version_id;
        return '<li><span>' + esc(fmtDT(v.created_at)) + (isLive ? ' <span class="rn-badge" style="color:#6cc08b;border-color:#6cc08b">目前上線</span>' : '') + '</span><span><a class="m-btn sm" target="_blank" rel="noopener" href="' + esc(YC.url('builder/preview/') + '?site=' + encodeURIComponent(r.id) + '&version=' + encodeURIComponent(v.id)) + '">預覽</a> ' +
          (canDeploy && !isLive ? '<button class="m-btn sm" data-ver="' + esc(v.id) + '" data-vt="' + esc(fmtDT(v.created_at)) + '">還原此版</button>' : '') + '</span></li>';
      }).join('') + '</ul>' : '<p class="rn-note">還沒有送出過的版本。</p>') +
      '<h3 class="rn-h">收款紀錄</h3>' + (det.payments.length ? '<ul class="rn-pays">' + det.payments.map(function (p) {
        return '<li><span>' + esc(p.paid_on) + '・<b>' + esc(money(p.amount)) + '</b>・' + esc(p.months) + ' 個月・' + esc({ bank_transfer: '轉帳', credit: '信用卡', credit_recurring: '信用卡自動扣款', atm: 'ATM' }[p.method] || '轉帳') + '</span><span class="rn-dim">' + esc(p.period_from) + ' → ' + esc(p.period_to) + (p.reference ? '・' + esc(p.reference) : '') + '</span></li>';
      }).join('') + '</ul>' : '<p class="rn-note">還沒有收款紀錄。</p>') +
      '<h3 class="rn-h">事件時間軸</h3>' + (tl ? '<ul class="rn-tl">' + tl + '</ul>' : '<p class="rn-note">沒有事件。</p>');
    document.getElementById('rn-x').onclick = closeDrawer;
    Array.prototype.forEach.call(d.querySelectorAll('[data-act]'), function (b) { b.onclick = function () { doAction(b.getAttribute('data-act'), r); }; });
    Array.prototype.forEach.call(d.querySelectorAll('[data-ver]'), function (b) { b.onclick = function () { askRestoreVersion(r, b.getAttribute('data-ver'), b.getAttribute('data-vt')); }; });
    bindDomain(r);
  }
  function domainHtml(r) {
    var has = !!r.custom_domain;
    return (has ? '<p style="margin:0 0 8px;font-size:14px">目前：<b>' + esc(r.custom_domain) + '</b>・' + (r.domain_status === 'active' ? '<span class="rn-ok">已生效</span>' : '<span class="rn-warn">等待 DNS 設定／生效</span>') + '</p>' : '<p class="rn-note" style="margin-bottom:8px">尚未設定。客戶要用自己的網域時，輸入網域後會顯示要請客戶設定的 CNAME。</p>') +
      '<div class="adm-tools" style="margin:0"><input type="text" id="rn-domain" placeholder="例如 www.example.com" value="' + esc(r.custom_domain || '') + '" aria-label="網域" style="flex:1;min-width:200px"><button class="m-btn sm" id="rn-dset">' + (has ? '更換網域' : '設定網域') + '</button>' +
      (has ? '<button class="m-btn sm" id="rn-dchk">檢查網域</button><button class="m-btn sm rn-danger" id="rn-dclr">移除</button>' : '') + '</div><div id="rn-dout" class="rn-note" style="margin-top:8px">' + state.domMsg + '</div>';
  }
  function bindDomain(r) {
    var out = document.getElementById('rn-dout'); if (!out) return;
    var run = async function (action, params, btn) {
      btn.disabled = true; out.textContent = '處理中…';
      try {
        var res = await call(action, r.id, params);
        // 結果文字存起來：refreshAfter 會重畫側欄，重畫時要能再顯示
        state.domMsg = esc(res.message || '完成') + (res.cname_target ? '<div class="rn-preview" style="margin-top:8px">CNAME　名稱：<b>' + esc(res.domain || r.custom_domain) + '</b>　指向：<b>' + esc(res.cname_target) + '</b></div>' : '') + (res.warning ? '<div class="rn-warn">' + esc(res.warning) + '</div>' : '');
        out.innerHTML = state.domMsg;
        await refreshAfter(r.id, /重新發佈|部署/.test(res.message || ''));
      } catch (e) { state.domMsg = ''; out.innerHTML = '<span class="rn-err">' + esc(e.message || e) + '</span>'; }
      btn.disabled = false;
    };
    var s = document.getElementById('rn-dset'), c = document.getElementById('rn-dchk'), x = document.getElementById('rn-dclr');
    s.onclick = function () { var v = document.getElementById('rn-domain').value.trim(); if (!v) { out.innerHTML = '<span class="rn-err">請輸入網域</span>'; return; } run('set_domain', { domain: v }, s); };
    if (c) c.onclick = function () { run('check_domain', {}, c); };
    if (x) x.onclick = function () { confirmDialog('移除自訂網域？', '<p class="rn-note">會從 Cloudflare 移除這個網域，網站改回 pages.dev 網址並重新發佈。</p>', '移除', true, function () { return run('clear_domain', {}, x); }); };
  }

  // ── 對話框 ──
  function closeModal() { var m = document.getElementById('rn-modal'); if (m) m.remove(); }
  function modal(title, bodyHtml, okLabel, danger, onOk) {
    closeModal();
    var m = document.createElement('div'); m.className = 'rn-mback mem'; m.id = 'rn-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="rn-modal"><h3>' + esc(title) + '</h3>' + bodyHtml + '<div class="rn-err" id="rn-merr" aria-live="polite"></div><div class="rn-macts"><button class="m-btn" id="rn-mc">取消</button><button class="m-btn primary' + (danger ? ' rn-danger' : '') + '" id="rn-mok">' + esc(okLabel) + '</button></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
    document.getElementById('rn-mc').onclick = closeModal;
    var ok = document.getElementById('rn-mok');
    ok.onclick = async function () {
      ok.disabled = true; var errBox = document.getElementById('rn-merr'); errBox.textContent = '';
      try { var keep = await onOk(); if (keep !== false) closeModal(); } catch (e) { errBox.textContent = String(e.message || e); ok.disabled = false; }
    };
    var first = m.querySelector('input,select,textarea'); (first || ok).focus();
    return m;
  }
  function confirmDialog(title, bodyHtml, okLabel, danger, fn) { modal(title, bodyHtml, okLabel, danger, async function () { await fn(); }); }

  async function refreshAfter(id, watch) {
    try { await load(); } catch (e) { /* 列表重整失敗不影響 */ }
    if (state.tab === 'rental') drawList();
    if (state.sel === id) { try { state.det = await loadDetail(id); drawDetail(); } catch (e) { /* ignore */ } }
    if (watch) watchDeploy(id);
  }
  // 觸發部署後，每 8 秒看一次事件，直到出現新的部署結果（最多 3 分鐘）
  function watchDeploy(id) {
    clearTimeout(watchTimer);
    var since = Date.now() - 2000, tries = 0;
    var tick = async function () {
      tries++;
      try {
        var e = await YC.client.from('site_events').select('type,created_at').eq('site_id', id).in('type', ['deploy_ok', 'deploy_failed']).order('created_at', { ascending: false }).limit(1);
        var ev = e.data && e.data[0];
        if (ev && Date.parse(ev.created_at) > since) { toast(ev.type === 'deploy_ok' ? '部署完成' : '部署失敗，請看事件時間軸'); await refreshAfter(id, false); return; }
      } catch (err) { /* ignore */ }
      if (tries < 22) watchTimer = setTimeout(tick, 8000);
    };
    watchTimer = setTimeout(tick, 8000);
  }

  // ── 動作 ──
  function doAction(act, r) {
    var shop = esc(r.shop_name || r.slug);
    if (act === 'pay') return askPayment(r);
    if (act === 'republish') {
      return confirmDialog(r.status === 'suspended' ? '重新部署維護頁？' : '重新發佈？', '<p class="rn-note">' + (r.status === 'suspended' ? '會再部署一次「網站維護中」頁。' : '會用目前上線的版本重新部署一次（部署失敗時使用）。') + '</p>', '確定', false,
        async function () { var res = await call('republish', r.id); toast(res.message || '已排入'); await refreshAfter(r.id, true); });
    }
    if (act === 'suspend') {
      return modal('暫停「' + (r.shop_name || r.slug) + '」？', '<div class="rn-form"><p class="rn-note">暫停後，網站網址會改顯示「網站維護中」頁，客戶不能發佈更新；資料與內容都會保留。收到款項或按「恢復網站」後會回到正常。</p>' +
        '<label>原因（客戶在會員專區看得到）<textarea id="rn-reason" rows="2" maxlength="200" placeholder="例如：服務逾期未續約"></textarea></label></div>', '暫停網站', true,
        async function () { var res = await call('suspend', r.id, { reason: document.getElementById('rn-reason').value.trim() }); toast(res.message || '已暫停'); await refreshAfter(r.id, true); });
    }
    if (act === 'terminate') {
      return modal('終止「' + (r.shop_name || r.slug) + '」的租用？', '<div class="rn-form"><p class="rn-note">終止後，網站網址會改顯示「已停止服務」頁（不會被搜尋引擎收錄），客戶不能再發佈更新；<b>所有資料（草稿、版本、照片、收款紀錄）都會保留</b>，之後隨時可以按「恢復租用」。確定不再需要時，才在「已終止」的網站上按「永久刪除」。</p>' +
        '<label>原因（只有後台看得到，選填）<textarea id="rn-reason" rows="2" maxlength="200" placeholder="例如：客戶表示不再續約"></textarea></label></div>', '終止租用', true,
        async function () { var res = await call('terminate', r.id, { reason: document.getElementById('rn-reason').value.trim() }); toast(res.message || '已終止'); await refreshAfter(r.id, /分鐘/.test(res.message || '')); });
    }
    if (act === 'purge') {
      return modal('永久刪除「' + (r.shop_name || r.slug) + '」？', '<div class="rn-form"><p class="rn-note"><b>這個動作無法復原。</b>會一併刪除：網站（' + esc(r.slug) + '.pages.dev）、所有照片、草稿與歷史版本、收款紀錄、事件與月報。客戶的會員帳號不會被刪除。</p>' +
        '<label>請輸入網址代稱 <b>' + esc(r.slug) + '</b> 確認<input id="rn-confirm" type="text" autocomplete="off" placeholder="' + esc(r.slug) + '"></label></div>', '永久刪除', true,
        async function () {
          var v = document.getElementById('rn-confirm').value.trim();
          if (v !== r.slug) throw new Error('輸入的代稱不一致，請再確認');
          var res = await call('purge', r.id, { confirm_slug: v });
          toast(res.message || '已永久刪除');
          closeDrawer();
          try { await load(); } catch (e) { /* 列表重整失敗不影響 */ }
          if (state.tab === 'rental') drawList();
        });
    }
    if (act === 'restore') {
      return confirmDialog((r.status === 'cancelled' ? '恢復租用「' : '恢復「') + (r.shop_name || r.slug) + '」？', '<p class="rn-note">' + (r.status === 'cancelled' ? '網站會從「已終止」恢復。' : '') + '會依服務到期日恢復為「上線中」或「逾期」，並重新部署原本上線的版本。若到期日已過，請同時確認收款。</p>', '恢復', false,
        async function () { var res = await call('restore', r.id); toast(res.message || '已恢復'); await refreshAfter(r.id, true); });
    }
  }
  function askPayment(r) {
    var today = twToday(), pend = r.status === 'pending';
    var body = '<div class="rn-form"><p class="rn-note">客戶：' + esc(r.member_email) + '（' + esc(r.shop_name || r.slug) + '）</p>' +
      '<label>金額（新台幣，整數）<input type="number" id="rn-amt" min="1" step="1" inputmode="numeric"></label>' +
      '<label>租用月數<select id="rn-mon"><option value="1">1 個月</option><option value="3">3 個月</option><option value="6">6 個月</option><option value="12">12 個月</option><option value="custom">自訂…</option></select></label>' +
      '<label id="rn-cm-w" hidden>自訂月數（1–60）<input type="number" id="rn-cm" min="1" max="60" step="1"></label>' +
      '<label>匯款帳號末五碼／備註<input type="text" id="rn-ref" maxlength="100"></label>' +
      '<label>收款日<input type="date" id="rn-paid" value="' + today + '"></label>' +
      '<div class="rn-preview" id="rn-pv" aria-live="polite"></div>' +
      '<p class="rn-note">' + (pend ? '確認後會<b>立刻部署上線</b>（使用客戶最新送出的版本），並寄「網站已上線」與收款通知給客戶。' : r.status === 'suspended' ? '確認後會自動恢復網站並重新部署，並寄收款通知給客戶。' : '確認後會延長服務到期日，並寄收款通知給客戶。') + '</p></div>';
    modal('確認收款', body, '確認收款並' + (pend ? '上線' : '更新'), false, async function () {
      var amt = Number(document.getElementById('rn-amt').value), mon = document.getElementById('rn-mon').value === 'custom' ? Number(document.getElementById('rn-cm').value) : Number(document.getElementById('rn-mon').value);
      if (!Number.isInteger(amt) || amt < 1) throw new Error('請輸入正確的金額（整數）');
      if (!Number.isInteger(mon) || mon < 1 || mon > 60) throw new Error('月數必須是 1 到 60');
      var res = await call('confirm_payment', r.id, { amount: amt, months: mon, reference: document.getElementById('rn-ref').value.trim(), paid_on: document.getElementById('rn-paid').value });
      toast(res.message || '已記錄收款'); await refreshAfter(r.id, !!res.deploying);
    });
    var PMOD = null, amtTouched = false;
    var amtEl = document.getElementById('rn-amt');
    amtEl.addEventListener('input', function () { amtTouched = true; });
    var upd = function () {
      var sel = document.getElementById('rn-mon').value, cm = document.getElementById('rn-cm');
      document.getElementById('rn-cm-w').hidden = sel !== 'custom';
      var n = sel === 'custom' ? Number(cm.value) : Number(sel), pv = document.getElementById('rn-pv');
      if (!Number.isInteger(n) || n < 1 || n > 60) { pv.textContent = '請選擇月數'; return; }
      var from = r.paid_until && r.paid_until > today ? r.paid_until : today;
      pv.textContent = '服務期間 ' + from + ' → ' + addMonths(from, n) + (pend ? '（首次上線）' : '');
      if (PMOD) {
        // 依網站的版型算應收金額；多頁版價格未定案時不預填，請自行輸入與客戶談定的金額
        var P = PMOD.planFor ? PMOD.planFor(r.layout) : PMOD.PLAN;
        var q = PMOD.quote(n, r.layout);
        if (q) {
          pv.textContent += '　｜　依方案「' + P.name + '」應收 ' + PMOD.money(q.amount) + (q.freeMonths ? '（' + q.months + ' 個月只收 ' + q.paidMonths + ' 個月）' : '');
          if (!amtTouched) amtEl.value = String(q.amount);   // 預填金額，仍可自行修改
        } else {
          pv.textContent += '　｜　「' + P.name + '」的價格尚未定案，請輸入與客戶確認的金額';
          if (!amtTouched) amtEl.value = '';
        }
      }
    };
    ['rn-mon', 'rn-cm'].forEach(function (id) { var e = document.getElementById(id); e.oninput = upd; e.onchange = upd; });
    upd();
    import(YC.url('assets/rental-plan.js')).then(function (m) { PMOD = m; upd(); }).catch(function () { /* 沒有方案模組就不預填 */ });
  }
  function askRestoreVersion(r, vid, vt) {
    modal('還原到這個版本？', '<div class="rn-form"><p class="rn-note">會把 <b>' + esc(vt) + '</b> 的版本部署到正式網站（約 1–2 分鐘）。建議先按「預覽」確認內容。</p>' +
      '<label style="display:flex;flex-direction:row;gap:8px;align-items:flex-start;color:var(--text)"><input type="checkbox" id="rn-ow"><span>同時覆蓋客戶的草稿（預設不勾：客戶正在編輯的內容不會被蓋掉）</span></label></div>', '還原並發佈', true,
      async function () { var res = await call('restore_version', r.id, { version_id: vid, overwrite_draft: document.getElementById('rn-ow').checked }); toast(res.message || '已排入'); await refreshAfter(r.id, true); });
  }
  function openSettings() {
    var b = state.bank || {}, pl = state.plan || {};
    var f = function (id, label, val, ph) { return '<label>' + label + '<input type="text" id="' + id + '" value="' + esc(val || '') + '" maxlength="100" placeholder="' + esc(ph || '') + '"></label>'; };
    modal('匯款與方案設定', '<div class="rn-form"><p class="rn-note">這裡的內容會顯示在客戶的會員專區「我的網站」。請在這裡填寫，不要貼到聊天或 repo。</p>' +
      f('rn-sb', '銀行名稱', b.bank) + f('rn-sc', '銀行代碼', b.code) + f('rn-sa', '帳號', b.account) + f('rn-sh', '戶名', b.holder) + f('rn-sn', '備註（例如：匯款後請告知末五碼）', b.note) +
      '<label>租用方案說明（選填，顯示在客戶卡片，最多 500 字）<textarea id="rn-sp" rows="3" maxlength="500">' + esc(pl.text || '') + '</textarea></label></div>', '儲存', false, async function () {
      var v = function (id) { return document.getElementById(id).value.trim(); };
      var bank = { bank: v('rn-sb'), code: v('rn-sc'), account: v('rn-sa'), holder: v('rn-sh'), note: v('rn-sn') };
      if (bank.account && !/^[0-9\- ]{4,30}$/.test(bank.account)) throw new Error('帳號只能包含數字、空白與連字號（4–30 碼）');
      if (bank.code && !/^[0-9]{3,7}$/.test(bank.code)) throw new Error('銀行代碼應為 3–7 位數字');
      await saveSetting('bank_transfer', bank); await saveSetting('plan', { text: v('rn-sp') });
      await load(); toast('已儲存設定');
    });
  }
  // 不用 upsert：一般情況下會員端 grant 只允許更新 value，改成「先查、有就 update、沒有才 insert」
  async function saveSetting(key, value) {
    var c = YC.client, ex = await c.from('settings').select('key').eq('key', key).maybeSingle();
    if (ex.error) throw new Error('讀取設定失敗：' + ex.error.message);
    var r = ex.data ? await c.from('settings').update({ value: value }).eq('key', key) : await c.from('settings').insert({ key: key, value: value });
    if (r.error) throw new Error('儲存失敗：' + r.error.message);
  }

  // ── 啟動 ──
  function msg(t) { root.innerHTML = '<div class="mem-card mem-empty"><p>' + t + '</p></div>'; }
  var busy = false, again = false;
  async function render() {
    if (busy) { again = true; return; } busy = true;
    try {
      var admin = YC.enabled && YC.loggedIn() && YC.isAdmin();
      tabs.hidden = !admin;
      if (!admin) { if (state.tab !== 'members') setTabQuiet('members'); state.loaded = false; closeDrawer(); }
      else if (state.tab === 'rental') {
        if (!state.loaded) { msg('載入中…'); await load(); }
        drawList();
      }
    } catch (e) {
      console.warn('admin-rental', e);
      var missing = e && (e.code === '42P01' || /admin_rental_overview|schema cache|does not exist/i.test(String(e.message || '')));
      msg(missing ? '資料庫還沒有升級：請先在 Supabase SQL Editor 執行 <code>006_rental_admin.sql</code>，再重新整理。' : '讀取失敗：' + esc(e.message || e));
    }
    busy = false; if (again) { again = false; render(); }
  }
  function setTabQuiet(t) { state.tab = t; members.style.display = ''; root.hidden = true; Array.prototype.forEach.call(tabs.querySelectorAll('[data-tab]'), function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === t)); }); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (document.getElementById('rn-modal')) closeModal(); else if (state.sel) closeDrawer(); } });
  YC.onChange(function () { render(); });
  if (location.hash === '#rental') { state.tab = 'rental'; members.style.display = 'none'; root.hidden = false; Array.prototype.forEach.call(tabs.querySelectorAll('[data-tab]'), function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === 'rental')); }); }
})();
