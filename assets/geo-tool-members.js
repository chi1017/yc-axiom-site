/* GEO 檢測工具 × 會員系統：訪客只看總分＋前 3 大問題；登入且同意後看完整報告與匯出。
   必須在 geo-tool.html 的主程式之後載入。YC 尚未啟用（沒填 Supabase 設定）時，完全不影響原本功能。 */
(function () {
  'use strict';
  if (!window.YC) return;
  var YC = window.YC;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function full() { return !YC.enabled || (YC.loggedIn() && YC.consented()); }
  function toast(msg) { try { if (typeof showToast === 'function') return showToast(msg, 3500); } catch (e) {} }

  var st = document.createElement('style');
  st.textContent =
    '#results.yc-gated .geo-full,#results.yc-gated #exportRow{display:none !important}' +
    '#yc-gate{background:var(--bg2);border:1px solid rgba(95,163,150,.28);border-radius:var(--radius,10px);padding:22px 24px;margin-bottom:18px}' +
    '#yc-gate h3{margin:0 0 4px;font-size:16px;color:var(--text)}#yc-gate .yc-sub{margin:0 0 14px;font-size:13px;color:var(--text2)}' +
    '#yc-gate ol{list-style:none;margin:0 0 16px;padding:0;display:grid;gap:8px}' +
    '#yc-gate li{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;background:rgba(0,0,0,.18);border-radius:8px;font-size:13px}' +
    '#yc-gate .yc-lv{flex-shrink:0;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;margin-top:2px;background:rgba(239,68,68,.2);color:#f87171}' +
    '#yc-gate .yc-lv.m{background:rgba(245,158,11,.2);color:#fbbf24}#yc-gate .yc-lv.l{background:rgba(95,163,150,.2);color:#7fd1c2}' +
    '#yc-gate li b{display:block;color:var(--text);font-weight:600}#yc-gate li span.d{display:block;color:var(--text3);font-size:12px;margin-top:2px}' +
    '#yc-gate .yc-cta{display:flex;gap:10px;flex-wrap:wrap;align-items:center}' +
    '#yc-gate button.yc-go{background:var(--accent);color:#0b0a09;border:0;border-radius:6px;padding:11px 20px;font:700 14px "Noto Sans TC",system-ui,sans-serif;cursor:pointer}' +
    '#yc-gate button.yc-go:hover{filter:brightness(1.08)}#yc-gate .yc-perks{font-size:12px;color:var(--text3)}';
  document.head.appendChild(st);

  var bw = document.querySelector('.badge-wrap');
  if (bw && YC.mountAuthBar) YC.mountAuthBar(bw);

  // ── 登入後自動接續檢測 ──
  var RESUME_KEY = 'yc_geo_resume_url';
  function rememberForResume() {
    try { if (tabState.t1.mode === 'url' && tabState.t1.label) sessionStorage.setItem(RESUME_KEY, tabState.t1.label); } catch (e) {}
  }
  async function resumeIfAny() {
    var u = null;
    if (!full()) return;
    try { u = sessionStorage.getItem(RESUME_KEY); if (u) sessionStorage.removeItem(RESUME_KEY); } catch (e) {}
    if (!u) return;
    try { if (typeof switchSource === 'function') switchSource('url'); document.getElementById('urlIn').value = u; await runUrl(); } catch (e) { console.warn('resume', e); }
  }

  // ── 閘門：訪客只看總分＋前 3 大問題 ──
  function lvClass(l) { return l === 'high' ? '' : (l === 'low' ? 'l' : 'm'); }
  function lvText(l) { return l === 'high' ? '高' : (l === 'low' ? '低' : '中'); }
  function applyGate(r) {
    var results = document.getElementById('results'); if (!results) return;
    var old = document.getElementById('yc-gate'); if (old) old.remove();
    if (full()) { results.classList.remove('yc-gated'); return; }
    results.classList.add('yc-gated');
    var issues = (r.issues || []).slice(0, 3);
    var loggedNoConsent = YC.loggedIn() && !YC.consented();
    var box = document.createElement('div'); box.id = 'yc-gate';
    box.innerHTML =
      '<h3>' + (issues.length ? '最需要先處理的 ' + issues.length + ' 個問題' : '沒有明顯的重大問題') + '</h3>' +
      '<p class="yc-sub">免費版只顯示總分與前 3 大問題。' + (loggedNoConsent ? '還差最後一步：同意保存紀錄，就能看完整報告。' : '登入後可看每一項的檢測結果與修正建議。') + '</p>' +
      (issues.length ? '<ol>' + issues.map(function (i) {
        return '<li><span class="yc-lv ' + lvClass(i.level) + '">' + lvText(i.level) + '</span><div><b>' + esc(i.title) + '</b>' + (i.why ? '<span class="d">' + esc(i.why) + '</span>' : '') + '</div></li>';
      }).join('') + '</ol>' : '') +
      '<div class="yc-cta"><button class="yc-go" id="yc-gate-btn">' + (loggedNoConsent ? '完成註冊，看完整報告' : '登入看完整報告') + '</button>' +
      '<span class="yc-perks">免費・不用設定密碼・完整報告與修正建議、PDF／JSON／CSV 下載</span></div>';
    var hero = results.querySelector('.score-hero');
    if (hero) hero.insertAdjacentElement('afterend', box); else results.insertBefore(box, results.firstChild);
    document.getElementById('yc-gate-btn').onclick = function () {
      if (loggedNoConsent) { YC.ensureConsent(); return; }
      rememberForResume(); YC.openLogin({ reason: '登入後可看完整的 AI 可見度報告、每項修正建議，並下載報告。免費，不需要設定密碼。' });
    };
  }

  var lastRendered = null;
  var origRender = window.renderResults;
  window.renderResults = function (r) {
    origRender.apply(this, arguments);
    lastRendered = r;
    try { applyGate(r); } catch (e) { console.error(e); }
  };

  ['exportPDF', 'exportJSON', 'exportCSV'].forEach(function (n) {
    var f = window[n]; if (typeof f !== 'function') return;
    window[n] = function () {
      if (!full()) { rememberForResume(); YC.openLogin({ reason: '登入後即可下載 PDF、JSON、CSV 等完整報告。' }); return; }
      return f.apply(this, arguments);
    };
  });

  var firstInit = true;
  YC.onChange(function (ev) {
    var res = document.getElementById('results');
    if (lastRendered && res && res.style.display !== 'none') applyGate(lastRendered);
    if (firstInit) { firstInit = false; resumeIfAny(); }
    else if (ev === 'RELOAD' || ev === 'SIGNED_IN' || ev === 'CONSENTED') resumeIfAny();
  });
})();
