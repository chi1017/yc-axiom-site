/* SEO／GEO 檢測工具：手機版操作輔助（只在 640px 以下作用，不改檢測規則與計分）
   1. 結果出來後，在總分下方加上「報告目錄」，點一項直接跳到那一段（SEO 工具會先把各段收合，點開才展開）。
   2. 往下看報告時，右下角出現「目錄」按鈕，隨時回到目錄。
   3. 目錄最下面有「重新檢測」，回到輸入網址的地方。 */
(function () {
  'use strict';
  var mq = window.matchMedia('(max-width: 640px)');
  var de = document.documentElement;
  var results = document.getElementById('results');
  if (!results) return;
  var isSeo = !!document.getElementById('checkList');
  var lastKey = '', collapsedFor = '', seen = {}, timer = 0;

  function visible(el) { return !!el && el.offsetParent !== null && el.getBoundingClientRect().height > 0; }
  function clean(t) { return (t || '').replace(/\bNEW\b/g, '').replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, '').replace(/\s+/g, ' ').trim(); }

  function sections() {
    var out = [];
    if (isSeo) {
      Array.prototype.forEach.call(results.querySelectorAll('.rsec'), function (sec) {
        if (!visible(sec)) return;
        var head = sec.querySelector('.rsec-head'), body = sec.querySelector('.rsec-body');
        if (!head || !body || !body.textContent.trim()) return;
        var t = head.querySelector('.rsec-title');
        var title = clean(t ? t.textContent : '');
        var sub = '';
        Array.prototype.forEach.call(head.querySelectorAll('span[id]'), function (s) { if (!sub && s.textContent.trim()) sub = clean(s.textContent); });
        if (title) out.push({ el: sec, head: head, title: title, sub: sub, key: body.id });
      });
    } else {
      Array.prototype.forEach.call(results.querySelectorAll('.geo-section, .actions-row'), function (sec) {
        if (!visible(sec)) return;
        var h = sec.querySelector('h3');
        var title = h ? clean(h.textContent) : (sec.classList.contains('actions-row') ? '匯出報告' : '');
        var sub = sec.querySelector('.sub');
        if (title) out.push({ el: sec, title: title, sub: sub ? clean(sub.textContent) : '' });
      });
    }
    return out;
  }

  function jump(s) {
    if (s.head && !s.head.classList.contains('open') && typeof window.toggleSec === 'function') window.toggleSec(s.head);
    setTimeout(function () { s.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
  }

  function inputCard() { return document.querySelector('.input-card'); }

  function build() {
    timer = 0;
    var toc = document.getElementById('mToc');
    if (!mq.matches || !visible(results)) { if (toc) toc.remove(); fab(false); return; }
    var list = sections();
    if (!list.length) return;
    // SEO 工具：每份新報告第一次出現時，把各段收合（「優先行動方案」保持展開），報告變短、用目錄找
    var titleEl = document.getElementById('scoreTitle'), numEl = document.getElementById('scoreNum');
    var report = (titleEl ? titleEl.textContent : '') + '|' + (numEl ? numEl.textContent : '');
    var key = report + '|' + list.length;
    if (isSeo && numEl && numEl.textContent.trim() !== '0' && typeof window.toggleSec === 'function') {
      if (report !== collapsedFor) { collapsedFor = report; seen = {}; }
      list.forEach(function (s) {
        if (seen[s.key]) return;   // 已經處理過的段落，保留使用者自己展開或收起的狀態
        seen[s.key] = true;
        if (s.key === 'actionResult') { if (!s.head.classList.contains('open')) window.toggleSec(s.head); return; }
        if (s.head.classList.contains('open')) window.toggleSec(s.head);
      });
    }
    if (key === lastKey && toc && toc.isConnected) return;
    lastKey = key;
    if (!toc) {
      toc = document.createElement('div'); toc.id = 'mToc'; toc.className = 'm-toc';
      var hero = results.querySelector('.score-hero');
      if (hero && hero.parentNode) hero.parentNode.insertBefore(toc, hero.nextSibling); else results.insertBefore(toc, results.firstChild);
    }
    toc.innerHTML = '';
    var h = document.createElement('div'); h.className = 'm-toc-h'; h.textContent = '報告目錄'; toc.appendChild(h);
    var hint = document.createElement('p'); hint.className = 'm-toc-hint'; hint.textContent = '點一項直接跳到那一段' + (isSeo ? '，各段已先收合，點標題可以展開或收起' : ''); toc.appendChild(hint);
    list.forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'm-toc-row';
      var t = document.createElement('span'); t.className = 'm-toc-t';
      var st = document.createElement('strong'); st.textContent = s.title; t.appendChild(st);
      if (s.sub) { var sm = document.createElement('small'); sm.textContent = s.sub; t.appendChild(sm); }
      var go = document.createElement('span'); go.className = 'm-toc-go'; go.setAttribute('aria-hidden', 'true'); go.textContent = '›';
      b.appendChild(t); b.appendChild(go);
      b.addEventListener('click', function () { jump(s); });
      toc.appendChild(b);
    });
    var again = document.createElement('button'); again.type = 'button'; again.className = 'm-toc-again'; again.textContent = '重新檢測其他網址';
    again.addEventListener('click', function () { var c = inputCard(); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    toc.appendChild(again);
    placeFab();
  }
  function queue() { if (!timer) timer = setTimeout(build, 350); }

  // 右下角的「目錄」按鈕：在報告裡往下捲、看不到目錄時出現
  var fabEl = null;
  function fab(show) {
    if (!fabEl) {
      if (!show) return;
      fabEl = document.createElement('button'); fabEl.type = 'button'; fabEl.id = 'mTocFab'; fabEl.className = 'm-toc-fab'; fabEl.textContent = '目錄';
      fabEl.setAttribute('aria-label', '回到報告目錄');
      fabEl.addEventListener('click', function () { var t = document.getElementById('mToc'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      document.body.appendChild(fabEl);
    }
    fabEl.classList.toggle('show', !!show);
  }
  function placeFab() {
    var toc = document.getElementById('mToc');
    if (!toc || !mq.matches) { fab(false); return; }
    var embedded = de.classList.contains('embedded');
    var vt = embedded ? (window.__ycVt || 0) : window.scrollY;
    var vh = embedded ? (window.__ycVh || window.innerHeight) : window.innerHeight;
    var r = toc.getBoundingClientRect(), top = r.top + (embedded ? 0 : window.scrollY);
    var res = results.getBoundingClientRect(), resBottom = res.bottom + (embedded ? 0 : window.scrollY);
    fab(top + r.height < vt && resBottom > vt + 120);
    if (fabEl && embedded) fabEl.style.top = Math.max(0, vt + vh - 64) + 'px';
  }

  new MutationObserver(queue).observe(results, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  if (mq.addEventListener) mq.addEventListener('change', queue);
  window.addEventListener('yc-viewport', placeFab);
  window.addEventListener('scroll', placeFab, { passive: true });
  queue();
})();
