/* 會員專區「我的網站」：網站數據（內建瀏覽統計）、GA4 狀態、網站設定總覽。
   只讀資料；由 dashboard-site.js 呼叫 window.YCInsights.html(site, hits, extra)。
   hits：最近 60 天 site_daily_hits [{day, path, views}]（台灣日期）。 */
(function () {
  'use strict';
  var GUIDE = 'files/yc-rental-guide.pdf';
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var url = function (p) { return window.YC && YC.url ? YC.url(p) : '../' + p; };
  var twDay = function (offset) { return new Date(Date.now() + 8 * 3600 * 1000 - (offset || 0) * 86400000).toISOString().slice(0, 10); };
  var fmt = function (n) { return Number(n || 0).toLocaleString('en-US'); };
  var WD = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  var PAGE = { '': '首頁', 'about': '關於我們', 'menu': '價目／菜單', 'interior': '環境照片', 'faq': '常見問題', 'news': '最新消息', 'visit': '來店資訊', 'contact': '聯絡我們', 'posts': '文章列表', 'works': '作品集', 'shop': '線上購買', 'booking': '預約', 'thanks': '送出成功頁', 'order': '付款完成頁' };

  function css() {
    if (document.getElementById('yi-css')) return;
    var st = document.createElement('style'); st.id = 'yi-css';
    st.textContent =
      '.yi{margin:14px 0 0;padding:14px 16px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:10px}' +
      '.yi-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0 0 10px}.yi-h b{font-size:15px}.yi-h a{font-size:13px}' +
      '.yi-kpi{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 12px}' +
      '.yi-kpi div{padding:10px 12px;border-radius:8px;background:rgba(255,255,255,.04)}.yi-kpi span{display:block;font-size:12px;color:var(--text-dim,#9a8f80)}' +
      '.yi-kpi b{display:block;font-size:22px;line-height:1.25;font-variant-numeric:tabular-nums}.yi-kpi em{font-style:normal;font-size:12px}' +
      '.yi-up{color:#6cc08b}.yi-down{color:#f0776b}.yi-flat{color:var(--text-dim,#9a8f80)}' +
      '.yi-chart{display:block;width:100%;height:84px;color:var(--accent,#c8ad8b)}.yi-axis{display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-dim,#9a8f80);margin:2px 0 12px}' +
      '.yi-sub{margin:12px 0 6px;font-size:13px;color:var(--text-dim,#9a8f80)}' +
      '.yi-bars{list-style:none;margin:0;padding:0;font-size:13.5px}.yi-bars li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;padding:4px 0}' +
      '.yi-bars i{grid-column:1/-1;display:block;height:4px;border-radius:2px;background:currentColor;opacity:.55;color:var(--accent,#c8ad8b)}' +
      '.yi-bars span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yi-bars b{font-variant-numeric:tabular-nums;font-weight:600}' +
      '.yi-wk{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:end;height:64px;margin:4px 0 2px}.yi-wk i{display:block;border-radius:3px 3px 0 0;background:var(--accent,#c8ad8b);opacity:.45;min-height:3px}.yi-wk i.top{opacity:1}' +
      '.yi-wkl{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;font-size:11.5px;text-align:center;color:var(--text-dim,#9a8f80)}' +
      '.yi-note{margin:10px 0 0;font-size:13px;line-height:1.7;color:var(--text-dim,#9a8f80)}' +
      '.yi-ga{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:12px 0 0;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,.04);font-size:13.5px;line-height:1.6}' +
      '.yi-list{list-style:none;margin:0;padding:0;font-size:14px;line-height:1.6}.yi-list li{display:grid;grid-template-columns:20px minmax(0,1fr);gap:2px 8px;padding:9px 0;border-bottom:1px solid var(--border,rgba(255,255,255,.1))}.yi-list li:last-child{border-bottom:0}' +
      '.yi-dot{width:10px;height:10px;border-radius:50%;margin-top:6px;background:var(--text-dim,#9a8f80)}.yi-ok .yi-dot{background:#6cc08b}.yi-todo .yi-dot{background:#e0b05a}' +
      '.yi-list small{display:block;font-size:12.5px;color:var(--text-dim,#9a8f80)}.yi-list code{font-size:12.5px;word-break:break-all}' +
      '.yi-acts{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0}' +
      '@media (max-width:520px){.yi{padding:12px}.yi-kpi b{font-size:19px}}';
    document.head.appendChild(st);
  }

  function change(cur, prev) {
    if (!prev) return cur ? '<em class="yi-flat">前段無資料</em>' : '';
    var d = Math.round((cur - prev) / prev * 100);
    if (d > 0) return '<em class="yi-up">▲ ' + d + '%</em>';
    if (d < 0) return '<em class="yi-down">▼ ' + (-d) + '%</em>';
    return '<em class="yi-flat">持平</em>';
  }
  function pageName(path, s) {
    var p = String(path || '/').replace(/^\/|\/$/g, ''), en = '';
    if (p === 'en' || p.indexOf('en/') === 0) { en = '（英文）'; p = p.replace(/^en\/?/, ''); }
    var m = p.match(/^posts\/([^/]+)$/);
    if (m) {
      var post = ((s.content && s.content.posts) || []).filter(function (x) { return x.id === m[1]; })[0];
      return '文章：' + (post && post.title ? post.title : m[1]) + en;
    }
    return (PAGE[p] != null ? PAGE[p] : '/' + p + '/') + en;
  }

  function chart(days) {
    var max = Math.max.apply(null, days.map(function (d) { return d.v; }).concat([1])), n = days.length, w = 300 / n;
    var bars = days.map(function (d, i) {
      var h = Math.max(d.v ? 2 : 0.6, d.v / max * 76);
      return '<rect x="' + (i * w + w * 0.15).toFixed(2) + '" y="' + (80 - h).toFixed(2) + '" width="' + (w * 0.7).toFixed(2) + '" height="' + h.toFixed(2) + '" rx="1" fill="currentColor" opacity="' + (i === n - 1 ? 1 : 0.6) + '"><title>' + esc(d.day.slice(5).replace('-', '/') + '　' + d.v + ' 次') + '</title></rect>';
    }).join('');
    return '<svg class="yi-chart" viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label="最近 30 天每日瀏覽次數，最高一天 ' + max + ' 次">' + bars + '</svg>' +
      '<div class="yi-axis"><span>' + esc(days[0].day.slice(5).replace('-', '/')) + '</span><span>最高一天 ' + fmt(max) + ' 次</span><span>今天</span></div>';
  }

  function statsHtml(s, rows) {
    rows = rows || [];
    var byDay = {}, byPath = {}, wk = [0, 0, 0, 0, 0, 0, 0], wkN = [0, 0, 0, 0, 0, 0, 0];
    var d30 = twDay(29), d7 = twDay(6), p30 = twDay(59), p7 = twDay(13), today = twDay(0);
    var t30 = 0, t7 = 0, pr30 = 0, pr7 = 0;
    rows.forEach(function (r) {
      byDay[r.day] = (byDay[r.day] || 0) + r.views;
      if (r.day >= d30) { t30 += r.views; byPath[r.path] = (byPath[r.path] || 0) + r.views; } else if (r.day >= p30) pr30 += r.views;
      if (r.day >= d7) t7 += r.views; else if (r.day >= p7) pr7 += r.views;
    });
    var days = []; for (var i = 29; i >= 0; i--) { var dd = twDay(i); days.push({ day: dd, v: byDay[dd] || 0 }); var wd = new Date(dd + 'T00:00:00Z').getUTCDay(); wk[wd] += byDay[dd] || 0; wkN[wd]++; }
    var head = '<div class="yi-h"><b>網站數據</b><a href="' + esc(url(GUIDE)) + '#data" target="_blank" rel="noopener">這些數字怎麼看？</a></div>';
    var gaLine = gaHtml(s);
    if (!t30 && !pr30) {
      return '<div class="yi" id="yi-data-' + esc(s.id) + '">' + head +
        '<p class="yi-note" style="margin:0">網站上線並重新發佈後開始統計，大約隔天就會看到數字。內建統計不使用 Cookie、不記錄訪客個人資料。</p>' + gaLine + '</div>';
    }
    var top = Object.keys(byPath).sort(function (a, b) { return byPath[b] - byPath[a]; }).slice(0, 6), topMax = top.length ? byPath[top[0]] : 1;
    var avg = wk.map(function (v, k) { return wkN[k] ? v / wkN[k] : 0; }), avgMax = Math.max.apply(null, avg.concat([0.0001])), best = avg.indexOf(Math.max.apply(null, avg));
    var order = [1, 2, 3, 4, 5, 6, 0];
    return '<div class="yi" id="yi-data-' + esc(s.id) + '">' + head +
      '<div class="yi-kpi">' +
        '<div><span>今天</span><b>' + fmt(byDay[today] || 0) + '</b><em class="yi-flat">次瀏覽</em></div>' +
        '<div><span>最近 7 天</span><b>' + fmt(t7) + '</b>' + change(t7, pr7) + '</div>' +
        '<div><span>最近 30 天</span><b>' + fmt(t30) + '</b>' + change(t30, pr30) + '</div>' +
      '</div><p class="yi-note" style="margin:-4px 0 10px">▲▼ 是和前一段同樣天數相比，例如最近 7 天比它之前的 7 天。</p>' + chart(days) +
      (top.length ? '<p class="yi-sub">最常被看的頁面（最近 30 天）</p><ul class="yi-bars">' + top.map(function (p) {
        return '<li><span>' + esc(pageName(p, s)) + '</span><b>' + fmt(byPath[p]) + '</b><i style="width:' + Math.max(4, Math.round(byPath[p] / topMax * 100)) + '%"></i></li>';
      }).join('') + '</ul>' : '') +
      '<p class="yi-sub">星期幾最多人看（最近 30 天，每天平均）</p>' +
      '<div class="yi-wk" aria-hidden="true">' + order.map(function (k) { return '<i' + (k === best ? ' class="top"' : '') + ' style="height:' + Math.max(4, Math.round(avg[k] / avgMax * 100)) + '%"></i>'; }).join('') + '</div>' +
      '<div class="yi-wkl">' + order.map(function (k) { return '<span>' + WD[k].slice(1) + '</span>'; }).join('') + '</div>' +
      '<p class="yi-note">最多人看的是<b>' + WD[best] + '</b>，平均每天 ' + Math.round(avg[best]) + ' 次。發最新消息、公告或活動，可以排在這天的前一兩天。</p>' +
      gaLine + '</div>';
  }

  function gaHtml(s) {
    var c = s.content || {};
    return c.ga4
      ? '<div class="yi-ga"><span>GA4 已連接（' + esc(c.ga4) + '）。想看訪客從哪裡來、用手機還是電腦、停留多久，請到 GA4 查看。</span>' +
        '<a class="m-btn sm" href="https://analytics.google.com/analytics/web/" target="_blank" rel="noopener">打開 GA4</a></div>'
      : '<div class="yi-ga"><span>還沒有連接 GA4。上面是網站內建的瀏覽統計；想知道訪客從哪裡來、用什麼裝置，可以免費申請 GA4，把評估 ID 填進編輯器。</span>' +
        '<a class="m-btn sm" href="' + esc(url(GUIDE)) + '#ga4" target="_blank" rel="noopener">怎麼設定</a></div>';
  }

  function item(state, title, desc, acts) {
    return '<li class="yi-' + state + '"><i class="yi-dot" aria-hidden="true"></i><div><b>' + title + '</b>' +
      '<span class="sr-only">（' + (state === 'ok' ? '已完成' : state === 'todo' ? '建議設定' : '說明') + '）</span>' +
      (desc ? '<small>' + desc + '</small>' : '') + (acts ? '<div class="yi-acts">' + acts + '</div>' : '') + '</div></li>';
  }
  function settingsHtml(s, extra) {
    var c = s.content || {}, live = s.public_url && (s.status === 'live' || s.status === 'overdue');
    var site = live ? String(s.public_url).replace(/\/?$/, '/') : '';
    if (s.custom_domain && s.domain_status === 'active') site = 'https://' + s.custom_domain + '/';
    var edit = function (label) { return '<a class="m-btn sm" href="' + esc(url('builder/') + '?site=' + encodeURIComponent(s.id)) + '">' + (label || '到編輯器設定') + '</a>'; };
    var guide = function (hash, label) { return '<a class="m-btn sm" href="' + esc(url(GUIDE)) + '#' + hash + '" target="_blank" rel="noopener">' + (label || '看步驟') + '</a>'; };
    var copy = function (text, label) { return '<button type="button" class="m-btn sm" data-yi-copy="' + esc(text) + '">' + (label || '複製') + '</button>'; };
    var seo = c.seo || {}, hrs = c.hours || {}, hasHours = Object.keys(hrs).some(function (k) { return hrs[k] && (hrs[k].open || hrs[k].closed); });
    var missing = [!c.address && '地址', !c.phone && '電話', !hasHours && '營業時間'].filter(Boolean);
    var social = c.social || {}, hasSocial = social.instagram || social.facebook || social.line;
    var L = [];
    L.push(s.custom_domain
      ? (s.domain_status === 'active' ? item('ok', '網域：' + esc(s.custom_domain), '已綁定自己的網域，HTTPS 安全連線自動啟用。')
        : item('todo', '網域：' + esc(s.custom_domain) + '（等待生效）', '還要到網域商的 DNS 新增一筆 CNAME，設定好後通常幾小時內生效。', guide('domain')))
      : item('info', '網址：' + (site ? esc(site.replace(/^https:\/\//, '')) : '上線後產生'), '目前用的是免費網址，HTTPS 安全連線已自動啟用。想用自己的網域（例如 www.你的店.com），可以在下方「自訂網域」綁定。', guide('domain')));
    if (s.last_published_at) L.push(item('ok', '最近一次發佈：' + esc(String(s.last_published_at).slice(0, 10)), '在編輯器改完內容要按「發佈」，網站才會更新。'));
    L.push(c.ga4 ? item('ok', 'GA4 流量分析：已連接', esc(c.ga4))
      : item('todo', 'GA4 流量分析：未連接', '選填。免費申請，可以看到訪客從哪裡來、用什麼裝置。', guide('ga4') + edit('填評估 ID')));
    L.push(c.gsc ? item('ok', 'Google Search Console：已放驗證碼', '如果還沒在 Google 按「驗證」，現在可以去按。驗證後記得提交 Sitemap。', site ? copy(site + 'sitemap.xml', '複製 Sitemap 網址') + guide('gsc') : guide('gsc'))
      : item('todo', 'Google Search Console：未設定', '建議設定。可以看到客人搜尋什麼字找到你、網站有沒有被 Google 收錄。Sitemap 系統已自動產生，只要提交一次。',
        (site ? copy(site + 'sitemap.xml', '複製 Sitemap 網址') : '') + guide('gsc')));
    L.push(seo.title || seo.description ? item('ok', '搜尋結果的標題與說明：已自訂', esc(seo.title || '') + (seo.title && seo.description ? '／' : '') + esc(seo.description || ''))
      : item('info', '搜尋結果的標題與說明：自動產生', '系統會用店名、地區與介紹自動產生，不改也可以。想自己寫可以到編輯器「收款與功能」分頁的「搜尋與分享」。', guide('seo')));
    L.push(seo.share ? item('ok', '分享預覽圖：已自訂', '分享到 LINE、Facebook 時會顯示你選的圖片。')
      : item('info', '分享預覽圖：使用主視覺照片', '分享到 LINE、Facebook 時會顯示首頁主視覺照片，也可以另外指定一張。', guide('seo')));
    L.push(missing.length ? item('todo', '店家基本資料：缺 ' + missing.join('、'), '地址、電話、營業時間要和 Google 商家檔案寫得一樣，Google 與 AI 才會認得是同一家店。', edit())
      : item('ok', '店家基本資料：地址、電話、營業時間都有填', '記得和 Google 商家檔案保持一致，改了這邊也要改那邊。', guide('nap', '為什麼要一致')));
    L.push(hasSocial ? item('ok', '社群連結：' + ['instagram', 'facebook', 'line'].filter(function (k) { return social[k]; }).map(function (k) { return k === 'line' ? 'LINE' : k === 'instagram' ? 'Instagram' : 'Facebook'; }).join('、'), '')
      : item('info', '社群連結：未填', '有 Instagram、Facebook 或 LINE 的話建議填上，幫助 Google 確認是同一家店。', edit()));
    var forms = [c.contactForm && '聯絡表單', c.bookingForm && '預約表單', c.booking && c.booking.url && '訂位／預約按鈕'].filter(Boolean);
    L.push(forms.length ? item('ok', '客人聯絡你的方式：' + forms.join('、'), '客人送出的留言與預約會出現在下方，也會寄到你的 Email。')
      : item('info', '客人聯絡你的方式：只有電話與社群', '可以開啟聯絡表單或預約表單，客人留言會寄到你的 Email。', edit()));
    var feats = [c.en && c.en.enabled && '英文版', c.shop && c.shop.enabled && '線上購買', c.showMap && 'Google 地圖'].filter(Boolean);
    if (feats.length) L.push(item('ok', '已開啟：' + feats.join('、'), ''));
    if (extra && extra.report) L.push(item('info', '每月網站體檢', '每個月初自動檢查 SEO 與 AI 搜尋可見度，分數在上方「網站體檢」。', guide('report', '分數怎麼看')));
    return '<details class="dq-sec yi-set" id="yi-set-' + esc(s.id) + '"><summary><b>網站設定總覽</b>（' + L.filter(function (x) { return x.indexOf('yi-todo') > -1; }).length + ' 項建議設定）</summary>' +
      '<ul class="yi-list">' + L.join('') + '</ul>' +
      '<p class="yi-note"><a href="' + esc(url(GUIDE)) + '" target="_blank" rel="noopener">下載使用手冊（PDF）</a>：每一項怎麼設定、數字怎麼看，都有一步一步的說明。</p></details>';
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-yi-copy]'); if (!b) return;
    var t = b.getAttribute('data-yi-copy'), old = b.textContent;
    var ok = function () { b.textContent = '已複製'; setTimeout(function () { b.textContent = old; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () { window.prompt('請複製這個網址', t); });
    else window.prompt('請複製這個網址', t);
  });

  window.YCInsights = {
    html: function (s, hits, extra) { try { css(); return statsHtml(s, hits) + settingsHtml(s, extra); } catch (e) { console.warn('yi', e); return ''; } }
  };
})();
