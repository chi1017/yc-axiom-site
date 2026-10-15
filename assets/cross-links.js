/* SEO 檢測 ⇄ GEO 檢測 互相導流：
   ・SEO 結果下方出現「再檢測 AI 可見度」卡片（帶同一個網址）；GEO 結果下方出現「再檢測 SEO」卡片。
   ・SEO 工具支援 ?url= 自動帶入並開始檢測（GEO 工具原本就支援）。
   必須在各工具主程式（與 *-tool-members.js）之後載入；不依賴會員系統，YC 未啟用時也能運作。 */
(function () {
  'use strict';
  var IS_SEO = typeof tabState !== 'undefined' && !!document.getElementById('t1Url');
  var IS_GEO = !IS_SEO && !!document.getElementById('geoCta');
  if (!IS_SEO && !IS_GEO) return;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function okUrl(u) { return typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u) ? u : ''; }

  // 這支腳本在根目錄的 seo-tool.html / geo-tool.html 內執行，兄弟頁面都在根目錄下的資料夾
  var TARGET = IS_SEO ? { path: 'geo/', label: 'AI 可見度' } : { path: 'seo/', label: 'SEO' };

  var st = document.createElement('style');
  st.textContent =
    '#xlink-card{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--bg2);border:1px solid rgba(95,163,150,.28);border-radius:var(--radius,10px);padding:16px 20px;margin:0 0 20px}' +
    '#xlink-card .xl-t{margin:0 0 3px;font-size:15px;font-weight:700;color:var(--text)}' +
    '#xlink-card .xl-d{margin:0;font-size:12.5px;line-height:1.6;color:var(--text2)}' +
    '#xlink-card .xl-n{margin:6px 0 0;font-size:11.5px;color:var(--text3)}' +
    '#xlink-card a.xl-go{display:inline-block;flex-shrink:0;background:var(--accent);color:#0b0a09;border-radius:6px;padding:10px 18px;font:700 14px "Noto Sans TC",system-ui,sans-serif;text-decoration:none;white-space:nowrap}' +
    '#xlink-card a.xl-go:hover{filter:brightness(1.08)}' +
    '#results#results.yc-gated.yc-gated > #xlink-card{display:flex !important}';
  document.head.appendChild(st);

  function currentUrl(r) {
    try {
      if (IS_SEO) return tabState && tabState.t1 && tabState.t1.mode === 'url' ? okUrl(tabState.t1.label) : '';
      return r && r.mode === 'url' ? okUrl(r.url) : '';
    } catch (e) { return ''; }
  }

  function render(r) {
    var results = document.getElementById('results');
    if (!results) return;
    var old = document.getElementById('xlink-card'); if (old) old.remove();
    var hero = results.querySelector('.score-hero'); if (!hero) return;
    var u = currentUrl(r);
    var href = TARGET.path + (u ? '?url=' + encodeURIComponent(u) : '');
    var card = document.createElement('div'); card.id = 'xlink-card';
    if (IS_SEO) {
      card.innerHTML =
        '<div><p class="xl-t">再檢測 AI 可見度</p>' +
        '<p class="xl-d">越來越多人用 ChatGPT、Perplexity、Google AI 摘要找店家。SEO 看的是搜尋排名，AI 可見度看的是網站容不容易被 AI 讀懂與引用，' + (u ? '同一個網址可以直接再測一次。' : '輸入網址就能測。') + '</p>' +
        '<p class="xl-n">這些是提高被 AI 引用機會的因素，無法保證被 AI 推薦。</p></div>' +
        '<a class="xl-go" id="xlink-go" href="' + esc(href) + '" target="_top">再檢測 AI 可見度 →</a>';
    } else {
      card.innerHTML =
        '<div><p class="xl-t">再檢測 SEO</p>' +
        '<p class="xl-d">AI 可見度和搜尋排名的基礎相通。' + (u ? '同一個網址可以再用 SEO 工具檢查 Meta 標籤、關鍵字、效能與結構化資料。' : '用 SEO 工具檢查 Meta 標籤、關鍵字、效能與結構化資料。') + '</p></div>' +
        '<a class="xl-go" id="xlink-go" href="' + esc(href) + '" target="_top">再檢測 SEO →</a>';
    }
    var anchor = hero, nx = hero.nextElementSibling;
    if (nx && nx.id === 'yc-gate') anchor = nx;
    anchor.insertAdjacentElement('afterend', card);
  }

  // ── 包裝 renderResults（在會員腳本之後，所以結果與閘門已經就緒）──
  var orig = window.renderResults;
  if (typeof orig === 'function') {
    window.renderResults = function (r) {
      var out = orig.apply(this, arguments);
      try { render(r); } catch (e) { console.warn('xlink', e); }
      return out;
    };
  }

  // ── SEO 工具：?url= 自動帶入並開始檢測 ──
  if (IS_SEO) {
    var q = '';
    try { q = okUrl(new URLSearchParams(location.search).get('url') || ''); } catch (e) {}
    if (q) {
      var go = async function () {
        try {
          var inp = document.getElementById('t1Url'); if (!inp) return;
          if (typeof switchTab === 'function') switchTab('file');
          if (typeof switchSource === 'function') switchSource('t1', 'url');
          inp.value = q;
          await fetchUrl('t1');
          if (tabState.t1.html) runAnalysis();
        } catch (e) { console.warn('autorun', e); }
      };
      if (document.readyState === 'complete') setTimeout(go, 0); else window.addEventListener('load', function () { setTimeout(go, 0); });
    }
  }
})();
