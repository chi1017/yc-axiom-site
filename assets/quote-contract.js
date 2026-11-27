/* 報價試算：管理員「產生合約」。由 site.js 在管理員按下按鈕時才載入。
   合約為「網站設計製作（買斷）＋選擇性年費服務」；乙方為個人接案（不開立統一發票）。
   依據：民法債編承攬（第 490 條以下）、著作權法、個人資料保護法及其施行細則、消費者保護法第 11 條之 1（審閱期）。
   電腦：用瀏覽器列印（可存成 PDF）；手機：產生 PDF 後用分享選單儲存。 */
(function () {
  'use strict';
  var SELF = { name: '洪紹棋', brand: 'YC AXIOM', line: '@788cblaq', mail: 'ycaxiom@gmail.com', web: 'yc-axiom.pages.dev' };
  var DISC = { 0: 1, 1: 1, 2: 0.95, 3: 0.9 };
  var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

  var CSS =
    '.qc{color:#111;font:11pt/1.75 -apple-system,"PingFang TC","Microsoft JhengHei","Noto Sans TC","Noto Sans CJK TC",sans-serif;background:#fff}' +
    '.qc h1{font-size:18pt;text-align:center;letter-spacing:.12em;margin:0 0 4pt}' +
    '.qc .qc-no{text-align:center;font-size:9.5pt;color:#555;margin:0 0 14pt}' +
    '.qc h2{font-size:11.5pt;margin:12pt 0 3pt}' +
    '.qc p{margin:0 0 4pt}.qc ol{margin:0 0 4pt;padding-left:18pt}.qc li{margin:0 0 2pt}' +
    '.qc table{width:100%;border-collapse:collapse;margin:4pt 0 8pt;font-size:10pt}' +
    '.qc th,.qc td{border:1px solid #bbb;padding:4pt 6pt;text-align:left;vertical-align:top}.qc th{background:#f3f1ed;font-weight:600}' +
    '.qc td.n,.qc th.n{text-align:right;white-space:nowrap}.qc tr.t td{font-weight:700}' +
    '.qc .qc-parties td{border:0;padding:1pt 0}.qc .qc-parties td:first-child{width:22%;color:#444}' +
    '.qc .qc-sign{display:grid;grid-template-columns:1fr 1fr;gap:18pt;margin-top:16pt}' +
    '.qc .qc-sign div{border-top:1.5px solid #111;padding-top:6pt;font-size:10pt;line-height:2.1}' +
    '.qc .qc-blank{display:inline-block;min-width:120pt;border-bottom:1px solid #777}' +
    '.qc .qc-small{font-size:9pt;color:#555}' +
    '.qc .qc-annex{margin-top:16pt;padding-top:8pt;border-top:2px solid #111}' +
    '.qc-page{break-before:page;page-break-before:always}';

  function nt(n) { return 'NT$' + Math.round(n).toLocaleString('en-US'); }
  function cnNum(n) { return CN[n] || String(n); }
  function blank(v, w) { return v ? v : '<span class="qc-blank"' + (w ? ' style="min-width:' + w + 'pt"' : '') + '>&nbsp;</span>'; }

  function build(o) {
    var s = o.s, e = o.esc, term = o.term, d = DISC[term] || 1, p = o.party || {};
    var once = s.once, dep = o.depOf(once), rest = once - dep, D = (o.Q && o.Q.deposit) || 30;
    var yItems = term ? s.ylines.concat(s.mlines.map(function (l) { return { name: l.name + '（每月 ' + nt(l.amt) + '，以 12 個月計）', amt: l.amt * 12 }; })) : [];
    var yBase = yItems.reduce(function (a, l) { return a + l.amt; }, 0), yDisc = Math.round(yBase * d), yAll = yDisc * term;
    // 買斷時勾選的月費項目（例如在地能見度月約、AI 提及月報）改列為「月費服務」，最短期間以項目名稱標示的月數為準（例如「6 個月起」），沒有標示則按月
    var mItems = !term ? s.mlines : [], mAmt = mItems.reduce(function (a, l) { return a + l.amt; }, 0);
    var mMin = mItems.reduce(function (a, l) { var m = /(\d+)\s*個月起/.exec(l.name); return Math.max(a, m ? +m[1] : 1); }, 1);
    var droppedYearly = !term && s.ylines.length;
    var hosting = term && s.ylines.some(function (l) { return /主機/.test(l.name); });
    var asks = s.lines.filter(function (l) { return l.ask; });
    var no = o.qno().replace(/^YC-/, 'YC-C-');
    var A = e(p.name || ''), n = 0;
    var art = function (title, body) { n++; return '<h2>第' + cnNum(n) + '條　' + title + '</h2>' + body; };

    var h = '<div class="qc">';
    h += '<h1>網站設計製作' + (term ? '暨年度服務' : mAmt ? '暨月費服務' : '') + '合約書</h1><p class="qc-no">合約編號：' + e(no) + '</p>';
    h += '<table class="qc-parties"><tr><td>委託人（甲方）</td><td>' + blank(A, 200) + '</td></tr>' +
      '<tr><td>受託人（乙方）</td><td>' + SELF.name + '（' + SELF.brand + '）</td></tr></table>';
    h += '<p>甲乙雙方就網站設計製作' + (term ? '及網站上線後之年度服務' : mAmt ? '及月費服務' : '') + '事宜，同意訂立本合約，條款如下：</p>';

    h += art('合約標的', '<p>乙方依本合約及附件一「報價明細」為甲方設計製作網站' + (o.site ? '（預計網址：' + e(o.site) + '）' : '') + '，並於驗收後交付網站檔案。附件一為本合約之一部分；附件一未列之項目，不在本合約範圍內，甲方另有需求時由雙方另行報價。' +
      (asks.length ? '附件一標示「另外報價」之項目，須經雙方另以書面確認金額後始生效力。' : '') + '</p>');

    h += art('合約期間', '<p>網站製作部分自簽約日起至驗收合格並交付完成之日止。' +
      (term ? '年度服務部分自網站正式上線之日起算' + cnNum(term) + '年，期滿前三十日，雙方得以書面（含 Email、LINE 訊息，下同）協議續約；未續約者，期滿後年度服務自動終止。'
        : mAmt ? '月費服務部分自雙方書面確認之開始日起算，最短服務期間為' + cnNum(mMin) + '個月；最短期間屆滿後按月自動續約，任一方得於當月十五日前以書面（含 Email、LINE 訊息，下同）通知於次月起終止。'
        : '本合約不含網站上線後之年度服務（如主機代管、網站維護）；甲方日後需要時，雙方另行簽約。') + '</p>');

    var pay = '<ol><li>網站製作費用合計' + nt(once) + '，分兩期支付：簽約時支付訂金 ' + D + '%（' + nt(dep) + '）；驗收合格後七日內支付尾款（' + nt(rest) + '）。</li>';
    if (term && yBase) pay += '<li>年度服務費用每年 ' + nt(yDisc) + (d < 1 ? '（原價 ' + nt(yBase) + '，依' + cnNum(term) + '年約給予' + (d === 0.95 ? '九五折' : '九折') + '）' : '') + '，' + cnNum(term) + '年合計 ' + nt(yAll) + '。每一服務年度開始前七日內，支付該年度費用。</li>';
    if (mAmt) pay += '<li>月費服務費用每月 ' + nt(mAmt) + '，甲方應於每月五日前支付當月費用；第一個月於服務開始前支付。</li>';
    pay += '<li>付款方式為匯款或轉帳至乙方指定帳戶，帳戶資料由乙方另以書面提供。</li>' +
      '<li>乙方為個人，不開立統一發票，得提供收據或簽收單。本合約所載金額為乙方應收之總額；甲方如依所得稅法或全民健康保險法規定應扣繳稅款或補充保險費，由甲方依法辦理，並提供扣繳憑單予乙方。</li>' +
      '<li>甲方逾期付款，經乙方書面催告後十四日內仍未付款者，乙方得暫停尚未完成之工作或年度服務，工作期限並相應順延。</li></ol>';
    h += art('費用與付款', pay);

    h += art('製作流程與時程', '<ol><li>甲方應於簽約後提供網站所需之文字、照片、商標及帳號等素材（下稱「素材」）。</li>' +
      '<li>乙方於收到完整素材之日起 ' + (o.days || 14) + ' 個工作天內交付網站初稿。甲方延遲提供素材或確認意見者，時程相應順延。</li>' +
      '<li>初稿交付後，甲方得提出修改意見，修改次數依附件一所載方案為準；超出次數或變更已確認之內容、架構者，乙方得另行報價。</li></ol>');

    h += art('驗收', '<p>乙方通知完成後，甲方應於七日內驗收，如有不符合附件一之處，應以書面具體列出。乙方修正後再行驗收。甲方逾期未提出具體修正意見，或已將網站正式上線使用者，視為驗收合格。</p>');

    h += art('瑕疵擔保', '<p>網站交付後一年內，如因乙方製作之程式錯誤，致附件一所列功能無法正常運作，乙方應於接獲甲方書面通知後合理期間內免費修補。但因甲方或第三人自行修改、甲方提供之素材、第三方服務（如金流、地圖、社群平台）規則變更、瀏覽器或作業系統更新，或不可抗力所致者，不在此限。</p>');

    h += art('著作權與智慧財產權', '<ol><li>甲方付清網站製作費用全部款項後，乙方為本合約製作之網站設計及程式之著作財產權，依著作權法第十二條約定歸甲方所有；付清前，著作財產權歸乙方所有，甲方僅得為驗收目的使用。</li>' +
      '<li>乙方為著作人，享有著作人格權，並同意不對甲方及甲方授權之人行使。</li>' +
      '<li>乙方原有或通用之版型架構、程式元件、工具，以及網站所使用之開放原始碼軟體、字型與圖庫素材，不在移轉範圍；乙方授權甲方於本網站範圍內永久、免費使用，開放原始碼軟體依其授權條款使用。</li>' +
      '<li>甲方提供之素材，甲方保證有合法使用權利；如因甲方素材致第三人主張權利，由甲方負責處理並負擔費用。</li>' +
      '<li>乙方得將本網站列為作品案例展示，但甲方以書面表示不同意，或內容涉及甲方未公開資訊者除外。</li></ol>');

    h += art('網域與主機', '<ol><li>網域以甲方名義申請並登記於甲方名下，網域年費由甲方負擔。</li>' +
      (hosting ? '<li>年度服務期間，乙方以甲方名義代為申請、設定及管理網站主機；年度服務終止時，乙方應將主機帳號、網站檔案及相關設定移交甲方。</li>'
        : '<li>網站主機由甲方自行準備或另行委託；乙方協助將網站檔案部署至甲方指定之主機一次。</li>') + '</ol>');

    if (term && yItems.length) {
      h += art('年度服務內容', '<p>年度服務項目如下（詳附件一）：</p><ol>' + yItems.map(function (l) { return '<li>' + e(l.name) + '</li>'; }).join('') + '</ol>' +
        '<p>年度服務不包含新增頁面、改版或新功能開發；甲方需要時，由乙方另行報價。</p>');
    }

    if (mAmt) {
      h += art('月費服務內容', '<ol><li>月費服務項目如下（詳附件一）：' + mItems.map(function (l) { return e(l.name) + '（每月 ' + nt(l.amt) + '）'; }).join('、') + '。各項目之工作內容，以報價試算之項目說明為準。</li>' +
        '<li>乙方每月提供工作紀錄與成效報告，內容包括當月完成事項、搜尋排名與 AI 提及檢查結果及下月建議。</li>' +
        '<li>甲方應提供執行所需之資料與帳號權限（如 Google 商家檔案管理權限），並於收到乙方確認請求後五個工作天內回覆；甲方延遲致當月工作無法完成者，不影響當月費用。</li>' +
        '<li>月費服務不包含新增頁面、改版或新功能開發；甲方需要時，由乙方另行報價。</li></ol>');
    }

    h += art('成效說明', '<p>搜尋引擎之排名，以及 ChatGPT、Gemini、Perplexity、Google AI 摘要等 AI 工具之回答內容，均由第三方依其規則決定，並可能隨時變動。乙方依本合約完成約定之工作項目，並提供修改前後之檢測或成效報告，但不保證特定搜尋排名、曝光量、營業額，或一定被 AI 工具提及、推薦。</p>');

    h += art('個人資料保護', '<ol><li>網站透過表單、預約或訂單蒐集之訪客個人資料，甲方為蒐集者；乙方如受甲方委託處理，應依個人資料保護法及其施行細則第八條規定，僅於本合約目的範圍內處理及利用，並採取適當安全措施，不得為其他目的利用或提供予第三人。</li>' +
      '<li>本合約終止或甲方要求時，乙方應依甲方指示返還或刪除前項個人資料。</li>' +
      '<li>雙方因履行本合約而取得之對方聯絡資料，僅得用於履行本合約。</li></ol>');

    h += art('保密', '<p>雙方因本合約知悉對方之營業資訊、帳號密碼及其他非公開資訊，應負保密義務，非經對方書面同意不得洩漏，但依法令或主管機關要求者除外。本條義務於合約終止後仍繼續有效。</p>');

    h += art('合約終止', '<ol><li>網站製作完成前，甲方得依民法第五百十一條隨時終止合約，但應支付乙方已完成部分之費用；已支付之訂金得抵充之，不足部分由甲方補足，超過部分由乙方退還。</li>' +
      (mAmt ? '<li>月費服務於最短服務期間內，甲方提前終止者，已開始月份之費用不予退還，並應支付最短期間剩餘月數費用之百分之五十作為補償；乙方提前終止者，不得請求未開始月份之費用。最短期間屆滿後，依第二條通知終止，雙方均無須支付補償。</li>' : '') +
      (term ? '<li>年度服務期間，任一方得於三十日前以書面通知終止。已開始之服務年度費用不予退還；尚未開始之年度，甲方無須支付。甲方提前終止' + (d < 1 ? '時，已履行年度之費用改按原價計算，差額由甲方補足。' : '者，乙方不另收違約金。') + '</li>' : '') +
      '<li>一方違反本合約，經他方書面催告後十四日內仍未改善者，他方得終止本合約，並得請求損害賠償。</li></ol>');

    h += art('責任範圍', '<p>乙方因本合約對甲方負擔之損害賠償責任，以甲方依本合約已支付之費用總額為上限；但乙方有故意或重大過失者，不在此限。乙方對網站營業額、搜尋排名、AI 工具之推薦結果或廣告成效不負保證責任。</p>');

    h += art('不可抗力', '<p>因天災、戰爭、政府命令、大規模網路或電力中斷、第三方平台服務中斷等不可歸責於雙方之事由，致無法履行或遲延者，雙方均不負責任，履行期限相應順延。</p>');

    h += art('通知', '<p>雙方同意以本合約所載之 Email、電話或 LINE 帳號作為通知方式，以書面（含 Email、LINE 訊息）送達者，視為已通知。聯絡方式變更時，應即通知對方。</p>');

    if (o.extra) h += art('特別約定', '<ol>' + String(o.extra).split(/\n+/).filter(Boolean).map(function (t) { return '<li>' + e(t.trim()) + '</li>'; }).join('') + '</ol><p>本條與其他條款不一致時，以本條為準。</p>');

    h += art('準據法與管轄', '<p>本合約以中華民國法律為準據法。因本合約發生爭議時，雙方應先誠意協商；協商不成，同意以臺灣臺中地方法院為第一審管轄法院。</p>');

    h += art('其他約定', '<ol><li>本合約之修改或補充，應經雙方以書面同意。</li><li>甲方確認已於簽約前取得本合約，並有' + (o.review || 3) + '日以上之合理期間審閱全部條款。</li><li>本合約一式二份，雙方各執一份為憑。</li></ol>');

    h += '<div class="qc-sign"><div><b>甲方（委託人）</b><br>名稱：' + blank(A, 130) + '<br>負責人／代表人：' + blank(e(p.rep || ''), 100) + '（簽章）<br>統一編號：' + blank(e(p.tax || ''), 110) + '<br>地址：' + blank(e(p.addr || ''), 150) + '<br>電話：' + blank(e(p.tel || ''), 120) + '<br>Email：' + blank(e(p.mail || ''), 130) + '</div>' +
      '<div><b>乙方（受託人）</b><br>姓名：' + SELF.name + '（簽章）<br>品牌：' + SELF.brand + '<br>地址：' + blank('', 150) + '<br>電話：' + blank('', 120) + '<br>Email：' + SELF.mail + '<br>LINE：' + SELF.line + '</div></div>';
    h += '<p style="margin-top:14pt;text-align:center;letter-spacing:.3em">中華民國 ' + blank('', 30) + ' 年 ' + blank('', 24) + ' 月 ' + blank('', 24) + ' 日</p>';

    // 附件一
    var row = function (l) { return '<tr><td>' + e(l.name) + '</td><td class="n">' + (l.ask ? '另外報價' : l.inc ? '已包含' : nt(l.amt)) + '</td></tr>'; };
    h += '<div class="qc-page qc-annex"><h2 style="margin-top:0">附件一　報價明細（報價編號 ' + e(o.qno()) + '，' + e(o.today()) + '）</h2>' +
      '<table><thead><tr><th>網站製作項目（一次性）</th><th class="n">金額</th></tr></thead><tbody>' + s.lines.map(row).join('') + '</tbody>' +
      '<tfoot><tr class="t"><td>製作費用合計</td><td class="n">' + nt(once) + '</td></tr><tr><td>簽約訂金 ' + D + '%</td><td class="n">' + nt(dep) + '</td></tr><tr><td>驗收尾款</td><td class="n">' + nt(rest) + '</td></tr></tfoot></table>';
    if (term && yItems.length) {
      h += '<table><thead><tr><th>年度服務項目</th><th class="n">每年</th></tr></thead><tbody>' + yItems.map(row).join('') + '</tbody><tfoot>' +
        '<tr><td>年度服務原價</td><td class="n">' + nt(yBase) + '</td></tr>' +
        (d < 1 ? '<tr><td>' + cnNum(term) + '年約優惠（' + (d === 0.95 ? '九五折' : '九折') + '）</td><td class="n">' + nt(yDisc) + '／年</td></tr>' : '') +
        '<tr class="t"><td>' + cnNum(term) + '年合計</td><td class="n">' + nt(yAll) + '</td></tr></tfoot></table>';
    }
    if (mAmt) {
      h += '<table><thead><tr><th>月費服務項目（最短' + cnNum(mMin) + '個月）</th><th class="n">每月</th></tr></thead><tbody>' + mItems.map(row).join('') + '</tbody><tfoot>' +
        '<tr class="t"><td>每月合計</td><td class="n">' + nt(mAmt) + '</td></tr><tr><td>最短期間合計（' + cnNum(mMin) + '個月）</td><td class="n">' + nt(mAmt * mMin) + '</td></tr></tfoot></table>';
    }
    if (droppedYearly) h += '<p class="qc-small">試算時勾選的年費項目，未納入本合約（買斷不含年度服務）。</p>';
    h += '<p class="qc-small">修改次數與各項目內容，以報價試算之項目說明為準。</p></div>';
    h += '</div>';
    return h;
  }

  function loadLib(src) { return new Promise(function (ok, no) { var x = document.createElement('script'); x.src = src; x.onload = ok; x.onerror = no; document.head.appendChild(x); }); }

  // 手機：畫成 PDF（在段落之間換頁，避免一行字被切成兩半），產生後再按一次「儲存」叫出分享選單
  async function toPdf(html, name) {
    if (!window.jspdf) await loadLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    if (!window.html2canvas) await loadLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    var W = 680, snap = document.createElement('div');
    snap.style.cssText = 'position:absolute;left:-10000px;top:0;width:' + W + 'px;background:#fff';
    snap.innerHTML = '<style>' + CSS + '.qc{font-size:13.5px}.qc-page{margin-top:24px}</style>' + html;
    document.body.appendChild(snap);
    try {
      var root = snap.querySelector('.qc'), top0 = root.getBoundingClientRect().top;
      var cuts = [].slice.call(root.querySelectorAll('h1,.qc-no,table,tr,p,li,ol,.qc-sign,.qc-annex')).map(function (el) { return el.getBoundingClientRect().bottom - top0; });
      var canvas = await window.html2canvas(root, { scale: 2, backgroundColor: '#ffffff', logging: false, windowWidth: W });
      var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' }), pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      var M = 40, scale = canvas.width / root.offsetWidth, ptPerCss = (pw - M * 2) / root.offsetWidth, pageCss = (ph - M * 2) / ptPerCss;
      var annex = root.querySelector('.qc-annex'), annexTop = annex ? annex.getBoundingClientRect().top - top0 - 8 : Infinity;
      var y = 0, total = root.offsetHeight, first = true;
      while (y < total - 1) {
        var lim = y + pageCss, end = total;
        if (annexTop > y + 10 && annexTop < lim) end = annexTop;
        else if (lim < total) { var ok = cuts.filter(function (c) { return c > y + 40 && c <= lim; }); end = ok.length ? Math.max.apply(null, ok) : lim; }
        var hpx = Math.ceil((end - y) * scale), c = document.createElement('canvas'); c.width = canvas.width; c.height = hpx;
        var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, hpx); cx.drawImage(canvas, 0, Math.floor(y * scale), canvas.width, hpx, 0, 0, canvas.width, hpx);
        if (!first) doc.addPage(); first = false;
        doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, pw - M * 2, (end - y) * ptPerCss);
        y = end;
      }
      var n = doc.getNumberOfPages();
      for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(i + ' / ' + n, pw / 2, ph - 18, { align: 'center' }); }
      return new File([doc.output('blob')], name, { type: 'application/pdf' });
    } finally { snap.remove(); }
  }
  function sheetDialog(file) {
    var ov = document.createElement('div'); ov.className = 'yc-qimg';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', '合約已產生');
    ov.innerHTML = '<div class="yc-qimg-bar"><span>合約 PDF 已產生</span><button type="button" data-x>關閉</button></div>' +
      '<p style="color:#ddd;font-size:14px;line-height:1.7;margin:16px 0">按「儲存合約 PDF」，在分享選單選「儲存到檔案」，或直接傳到 LINE 給客戶審閱。</p>' +
      '<div class="yc-qimg-acts"><button type="button" class="btn-primary" data-s>儲存合約 PDF</button></div>';
    document.body.appendChild(ov); document.documentElement.style.overflow = 'hidden';
    var close = function () { ov.remove(); document.documentElement.style.overflow = ''; };
    ov.querySelector('[data-x]').onclick = close;
    ov.querySelector('[data-s]').onclick = function () {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: file.name }).catch(function () {}); return; }
      var a = document.createElement('a'), u = URL.createObjectURL(file); a.href = u; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 8000);
    };
    ov.querySelector('[data-s]').focus();
  }

  window.YCContract = {
    build: build,
    open: async function (o) {
      var html = build(o), who = (o.party && o.party.name) || '';
      var name = 'YC-AXIOM-合約-' + (who ? who.replace(/[\\/:*?"<>|\s]+/g, '') + '-' : '') + o.today().replace(/\//g, '') + '.pdf';
      if (o.touch) {
        try { sheetDialog(await toPdf(html, name)); return; } catch (e) { console.warn('contract pdf', e); }
      }
      var sh = document.getElementById('yc-qsheet') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'yc-qsheet' }));
      sh.innerHTML = '<style>' + CSS + '</style>' + html;
      var root = document.documentElement, t0 = document.title;
      document.title = name.replace(/\.pdf$/, '');
      root.classList.add('yc-printing');
      var off = function () { root.classList.remove('yc-printing'); document.title = t0; window.removeEventListener('afterprint', off); };
      window.addEventListener('afterprint', off);
      window.print();
      setTimeout(off, 1500);
    }
  };
})();
