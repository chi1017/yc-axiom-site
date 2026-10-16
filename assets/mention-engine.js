/* YC AXIOM AI 提及檢測引擎（半自動）
   不呼叫任何 AI API：工具產生問題 → 使用者自己拿去問 ChatGPT／Perplexity／Gemini 等 → 把回答貼回來 → 這裡在瀏覽器本機分析。
   分析項目：品牌有沒有被提到、排第幾、AI 認不認識品牌、一起被推薦的對手、AI 引用了哪些網站。
   AI 的回答會隨時間、帳號、地區而不同，結果是「當下的快照」，不是排名保證。 */
(function (root) {
  'use strict';

  var DISCLAIMER = 'AI 的回答會隨時間、帳號、地區與提問方式而不同，這份結果是當下的快照，不代表固定排名，也無法保證被 AI 推薦。';

  var ENGINES = [
    { id: 'chatgpt', name: 'ChatGPT', open: function (q) { return 'https://chatgpt.com/?q=' + encodeURIComponent(q); } },
    { id: 'perplexity', name: 'Perplexity', open: function (q) { return 'https://www.perplexity.ai/search?q=' + encodeURIComponent(q); } },
    { id: 'google', name: 'Google AI 摘要', open: function (q) { return 'https://www.google.com/search?q=' + encodeURIComponent(q); } },
    { id: 'gemini', name: 'Gemini', open: function () { return 'https://gemini.google.com/app'; } },
    { id: 'other', name: '其他 AI', open: null }
  ];
  function engineName(id) { for (var i = 0; i < ENGINES.length; i++) if (ENGINES[i].id === id) return ENGINES[i].name; return id || '未指定'; }

  // ═══════════════ 工具函式 ═══════════════
  function clean(s) { return String(s == null ? '' : s).normalize ? String(s == null ? '' : s).normalize('NFKC') : String(s == null ? '' : s); }
  // 比對用：轉小寫、去掉空白與常見標點，讓「YC AXIOM」「ycaxiom」「YC‧AXIOM」都對得上
  function key(s) { return clean(s).toLowerCase().replace(/[\s　·‧・．.\-_'’"「」『』]/g, ''); }
  function splitList(s) { return clean(s).split(/[,，、;；\n]/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function uniq(a) { var seen = {}; return a.filter(function (x) { var k = key(x); if (!k || seen[k]) return false; seen[k] = 1; return true; }); }
  function hostOf(s) {
    s = clean(s).trim().toLowerCase(); if (!s) return '';
    s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
    return s.split(/[\/?#]/)[0];
  }

  // ═══════════════ 品牌資料 ═══════════════
  function profileFrom(input) {
    var brand = clean(input.brand).trim();
    var p = {
      brand: brand,
      aliases: uniq(splitList(input.aliases || '')).filter(function (a) { return key(a) !== key(brand); }),
      domain: hostOf(input.domain || ''),
      area: clean(input.area).trim(),
      service: clean(input.service).trim(),
      competitors: uniq(splitList(input.competitors || '')).filter(function (c) { return key(c) !== key(brand); })
    };
    // 網址路徑（例如 github.io/yc-axiom-site）也算自己的網站
    var raw = clean(input.domain || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
    p.siteKey = raw && raw !== p.domain ? raw : '';
    p.names = [p.brand].concat(p.aliases).filter(Boolean);
    return p;
  }

  // ═══════════════ 產生問題 ═══════════════
  function genPrompts(p) {
    var a = p.area, s = p.service, b = p.brand;
    var at = a ? a + '的' : '';   // 「台中的網頁設計工作室」
    var list = [
      { id: 'd1', kind: 'discovery', text: (a ? a + '有推薦的' : '有推薦的') + s + '嗎？請列出幾家並說明推薦理由。' },
      { id: 'd2', kind: 'discovery', text: at + s + '有哪些評價比較好的？' },
      { id: 'd3', kind: 'discovery', text: (a ? '我在' + a + '，' : '') + '想找' + s + '，該怎麼選？有哪些可以考慮的店家或公司？' },
      { id: 'd4', kind: 'discovery', text: '幫我比較' + at + s + '，哪幾家比較值得找？' },
      { id: 'd5', kind: 'discovery', text: '預算有限，' + (a ? a + '有' : '有') + 'CP 值高的' + s + '推薦嗎？' },
      { id: 'b1', kind: 'brand', text: '你知道「' + b + '」嗎？他們提供什麼服務？評價如何？' },
      { id: 'b2', kind: 'brand', text: '「' + b + '」和' + (a ? a + '其他' : '其他') + s + '比起來，有什麼優點和缺點？' }
    ];
    return list;
  }

  // ═══════════════ 解析單一回答 ═══════════════
  var RE_ITEM = /^\s*(?:\d{1,2}\s*[.、)）．]|[-*•·●▪◦]\s|#{1,4}\s|\*\*|【|[①②③④⑤⑥⑦⑧⑨⑩])/;
  var RE_SPLIT_NAME = /[：:｜|—–(（]|\s-\s|，/;
  var GENERIC = /^(推薦|總結|結論|小提醒|提醒|注意|注意事項|建議|選擇|如何選擇|挑選|優點|缺點|價格|費用|預算|地址|電話|評價|特色|服務|服務項目|適合|適合對象|參考|參考資料|來源|資料來源|補充|其他|延伸閱讀|最後|簡單來說|快速比較|比較表|重點|聯絡|網站|官網|營業時間|優勢|風格|作品|案例|口碑|cp值|cp 值|預約|流程|說明|小結|tips?|summary|sources?|notes?)$/i;
  var RE_UNKNOWN = /(找不到|查不到|沒有(找到)?(太多|足夠|具體|明確|公開|相關)?(的)?(資訊|資料|紀錄|記錄)|無法(找到|查到|確認|提供|驗證)|目前沒有.{0,8}(資訊|資料)|不確定(這|是否|你說)|不太(清楚|熟悉|確定)|不熟悉|沒有聽過|並不知道|i (?:couldn['’]t|could not|can['’]t|cannot) find|no (?:reliable |specific |public )?information|not familiar|i['’]m not aware|i am not aware|don['’]t have (?:any )?(?:specific )?information)/i;
  var RE_DOMAIN = /(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+(?:com|net|org|tw|io|co|me|info|app|dev|shop|store|cc|biz|edu|gov|xyz|site|page|ai)(?:\.[a-z]{2})?)(?:\/[^\s)\]」』，。、]*)?/gi;
  var NOT_SOURCES = /^(chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google\.com|google\.com|bing\.com|copilot\.microsoft\.com)$/;

  // 「先確認預算」「看作品集」這類建議句不是店名
  var RE_ADVICE = /^(先|再|看|確認|比較|詢問|注意|選|留意|問|了解|查看|參考|避免|要求|評估|預留|準備|列出|多|找|確定|可以|建議|記得|不要|別)/;
  // 這類段落標題之後的條列是建議，不是推薦名單
  var RE_ADVICE_SECTION = /(如何|怎麼|挑選|選擇|建議|提醒|注意|小技巧|tips?|檢查|步驟|流程|總結|結論)/i;
  var RE_NUMBERED = /^\s*(?:\d{1,2}\s*[.、)）．]|[①②③④⑤⑥⑦⑧⑨⑩])/;
  function entriesOf(text) {
    var out = [], skip = false;
    clean(text).split(/\r?\n/).forEach(function (line) {
      line = line.replace(/^(\s*)\*\*\s*(\d{1,2}\s*[.、)）．])/, '$1$2 **');   // 「**1. 店名**」→「1. **店名**」
      line = line.replace(/^(\s*)(#{1,4})\s*(\d{1,2}\s*[.、)）．])/, '$1$3');     // 「### 1. 店名」→「1. 店名」
      var heading = /^\s*#{1,4}\s/.test(line) || /^\s*\*\*[^*]+\*\*\s*[：:]?\s*$/.test(line) || /^[^\s].{1,20}[：:]\s*$/.test(line);
      if (heading && !RE_NUMBERED.test(line)) { skip = RE_ADVICE_SECTION.test(line); return; }
      if (!RE_ITEM.test(line)) return;
      var body = line.replace(RE_ITEM, '').replace(/\*\*/g, '').replace(/^#+\s*/, '').replace(/[】]/g, ' ').trim();
      if (body.length < 2) return;
      var name = body.split(RE_SPLIT_NAME)[0].trim().replace(/[。.!！?？]+$/, '');
      if (RE_ADVICE.test(name)) name = '';
      out.push({ line: body, name: name.length <= 30 ? name : '', numbered: RE_NUMBERED.test(line), skip: skip });
    });
    out = out.filter(function (e) { return !e.skip; });
    // 有 2 個以上編號項目時，只看編號項目（項目底下的「-」細節不算另一家）
    if (out.filter(function (e) { return e.numbered; }).length >= 2) out = out.filter(function (e) { return e.numbered; });
    return out;
  }
  function hasName(text, names) { var k = key(text); return names.some(function (n) { var nk = key(n); return nk.length >= 2 && k.indexOf(nk) >= 0; }); }
  function domainsIn(text) {
    var found = {}, m; RE_DOMAIN.lastIndex = 0;
    while ((m = RE_DOMAIN.exec(clean(text)))) { var h = m[1].toLowerCase().replace(/^www\./, '').replace(/\.$/, ''); if (!NOT_SOURCES.test(h)) found[h] = 1; }
    return Object.keys(found);
  }

  function analyzeAnswer(p, prompt, engine, text) {
    text = clean(text);
    var r = { promptId: prompt.id, kind: prompt.kind, prompt: prompt.text, engine: engine, engineName: engineName(engine), chars: text.trim().length };
    var ownSite = function (d) { return p.domain && (d === p.domain || d.slice(-(p.domain.length + 1)) === '.' + p.domain); };
    var domains = domainsIn(text);
    var keyText = key(text);
    r.domainCited = !!(p.domain && domains.some(ownSite)) || !!(p.siteKey && keyText.indexOf(key(p.siteKey)) >= 0);
    r.mentioned = hasName(text, p.names) || r.domainCited;
    var entries = entriesOf(text);
    r.listCount = entries.filter(function (e) { return e.name && !GENERIC.test(e.name); }).length;
    r.position = null;
    var idx = 0;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i]; if (!e.name || GENERIC.test(e.name)) continue;
      idx++;
      if (hasName(e.line, p.names)) { r.position = idx; break; }
    }
    r.competitors = p.competitors.filter(function (c) { return hasName(text, [c]); });
    r.others = uniq(entries.map(function (e) { return e.name; }).filter(function (n) {
      return n && n.length >= 2 && !GENERIC.test(n) && !hasName(n, p.names) && !p.competitors.some(function (c) { return hasName(n, [c]); }) && !/[？?]$/.test(n) && !/^\d+$/.test(n);
    })).slice(0, 12);
    r.citedDomains = domains;
    r.ownDomainCited = r.domainCited;
    if (prompt.kind === 'brand') {
      var unknown = RE_UNKNOWN.test(text);
      r.recognized = !unknown && r.chars >= 40;
      r.unknownPhrase = unknown;
    }
    return r;
  }

  // ═══════════════ 彙整 ═══════════════
  function pct(a, b) { return b ? Math.round(a / b * 100) : null; }

  function summarize(p, answers) {
    var disc = answers.filter(function (a) { return a.kind === 'discovery'; });
    var brand = answers.filter(function (a) { return a.kind === 'brand'; });
    var mentioned = disc.filter(function (a) { return a.mentioned; });
    var positions = mentioned.map(function (a) { return a.position; }).filter(function (x) { return x != null; });
    var s = {
      answers: answers.length,
      discovery: { total: disc.length, mentioned: mentioned.length, rate: pct(mentioned.length, disc.length),
        avgPosition: positions.length ? Math.round(positions.reduce(function (x, y) { return x + y; }, 0) / positions.length * 10) / 10 : null,
        top3: positions.filter(function (x) { return x <= 3; }).length },
      brand: { total: brand.length, recognized: brand.filter(function (a) { return a.recognized; }).length },
      ownDomainCited: answers.filter(function (a) { return a.ownDomainCited; }).length
    };
    s.brand.rate = pct(s.brand.recognized, s.brand.total);

    // 各 AI
    var byEngine = {};
    disc.forEach(function (a) {
      var e = byEngine[a.engine] || (byEngine[a.engine] = { engine: a.engine, name: a.engineName, total: 0, mentioned: 0 });
      e.total++; if (a.mentioned) e.mentioned++;
    });
    s.byEngine = Object.keys(byEngine).map(function (k) { var e = byEngine[k]; e.rate = pct(e.mentioned, e.total); return e; });

    // 聲量占比：自己 vs 使用者填的對手（只算推薦類問題）
    var sov = [{ name: p.brand, own: true, count: mentioned.length }];
    p.competitors.forEach(function (c) { sov.push({ name: c, own: false, count: disc.filter(function (a) { return a.competitors.indexOf(c) >= 0; }).length }); });
    s.shareOfVoice = sov.sort(function (x, y) { return (y.count - x.count) || (x.own ? -1 : 1); });

    // 其他常被提到的名稱（自動擷取，僅供參考）
    var oc = {};
    disc.forEach(function (a) { a.others.forEach(function (n) { var k = key(n); oc[k] = oc[k] || { name: n, count: 0 }; oc[k].count++; }); });
    s.others = Object.keys(oc).map(function (k) { return oc[k]; }).sort(function (x, y) { return y.count - x.count; }).slice(0, 10);

    // AI 引用的網站
    var dc = {};
    answers.forEach(function (a) { a.citedDomains.forEach(function (d) { dc[d] = (dc[d] || 0) + 1; }); });
    s.domains = Object.keys(dc).map(function (d) { return { domain: d, count: dc[d], own: !!(p.domain && (d === p.domain || d.slice(-(p.domain.length + 1)) === '.' + p.domain)) }; })
      .sort(function (x, y) { return y.count - x.count; }).slice(0, 12);

    // 等級
    var r = s.discovery.rate;
    s.level = r == null ? { key: 'na', label: '尚未分析' } : (r >= 60 ? { key: 'good', label: '經常被推薦' } : (r >= 30 ? { key: 'fair', label: '偶爾被推薦' } : (r > 0 ? { key: 'low', label: '很少被推薦' } : { key: 'poor', label: '還沒被推薦' })));

    s.advice = advise(p, s);
    return s;
  }

  function advise(p, s) {
    var out = [];
    var d = s.discovery;
    if (d.total && d.rate === 0) {
      out.push({ level: 'high', title: 'AI 目前不會主動推薦你',
        body: '客人問「' + (p.area || '') + p.service + '推薦」時，AI 回答裡沒有出現' + p.brand + '。AI 推薦店家時很依賴站外資訊，建議先經營 Google 商家檔案與評論，並爭取出現在「' + (p.area || '') + p.service + '推薦」這類整理文章或平台上。' });
    } else if (d.total && d.rate < 60) {
      out.push({ level: 'medium', title: '有被推薦，但還不穩定',
        body: d.total + ' 個推薦類問題中有 ' + d.mentioned + ' 個提到你。持續增加站外提及（評論、合作夥伴、媒體或部落格介紹），被推薦的次數會比較穩定。' });
    }
    if (d.mentioned && d.avgPosition != null && d.avgPosition > 3) {
      out.push({ level: 'medium', title: '有被提到，但排在比較後面',
        body: '平均排在第 ' + d.avgPosition + ' 個。AI 通常把資訊最完整、評價最多的店家放前面：官網把服務、價格區間、地點寫清楚，並累積更多真實評論。' });
    }
    if (s.brand.total && s.brand.recognized < s.brand.total) {
      out.push({ level: s.brand.recognized === 0 ? 'high' : 'medium', title: s.brand.recognized === 0 ? 'AI 還不認識你的品牌' : 'AI 對你的品牌認識不完整',
        body: '直接問 AI「' + p.brand + '」時，有 ' + (s.brand.total - s.brand.recognized) + ' 次回答找不到資訊或不確定。全站店名寫法要一致，結構化資料加上 sameAs 連到官方社群，並在 Google 商家、社群與合作網站使用同一個名稱。' });
    }
    var mentionedAny = d.mentioned || s.brand.recognized;
    if (p.domain && mentionedAny && !s.ownDomainCited) {
      out.push({ level: 'low', title: 'AI 有提到你，但沒有引用你的官網',
        body: 'AI 可能是從其他網站得知你的資訊。在官網放上可直接引用的內容：常見問題、價格區間、服務流程與真實案例，並用 GEO 檢測確認 AI 爬蟲讀得到。' });
    }
    var ext = s.domains.filter(function (x) { return !x.own; }).slice(0, 3);
    if (ext.length) {
      out.push({ level: 'low', title: 'AI 最常引用的網站',
        body: '這些回答最常引用 ' + ext.map(function (x) { return x.domain; }).join('、') + '。看看這些網站是什麼類型（評論平台、整理文章、媒體），試著讓自己的品牌也出現在上面。' });
    }
    var rival = s.shareOfVoice.filter(function (x) { return !x.own && x.count > d.mentioned; })[0];
    if (rival) {
      out.push({ level: 'medium', title: '「' + rival.name + '」比你更常被推薦',
        body: '「' + rival.name + '」在 ' + rival.count + ' 個推薦類回答中出現，你出現 ' + d.mentioned + ' 次。可以用 GEO 檢測比較對方的官網，也看看對方在哪些網站上被介紹。' });
    }
    var order = { high: 0, medium: 1, low: 2 };
    out.sort(function (x, y) { return order[x.level] - order[y.level]; });
    if (!out.length && d.total) {
      out.push({ level: 'low', title: '表現不錯，持續追蹤',
        body: 'AI 在多數推薦類問題中都有提到你。建議每個月用同一組問題再測一次，觀察有沒有變化。' });
    }
    return out;
  }

  function analyze(input, rawAnswers) {
    var p = profileFrom(input);
    var prompts = genPrompts(p);
    var byId = {}; prompts.forEach(function (q) { byId[q.id] = q; });
    var answers = (rawAnswers || []).filter(function (a) { return a && byId[a.promptId] && clean(a.text).trim().length >= 10; })
      .map(function (a) { return analyzeAnswer(p, byId[a.promptId], a.engine || 'other', a.text); });
    var s = summarize(p, answers);
    return { tool: 'ai-mentions', version: 1, scannedAt: new Date().toISOString(), profile: p, prompts: prompts, answers: answers, summary: s, disclaimer: DISCLAIMER };
  }

  var MENTION = { analyze: analyze, genPrompts: genPrompts, profileFrom: profileFrom, analyzeAnswer: analyzeAnswer, ENGINES: ENGINES, engineName: engineName, DISCLAIMER: DISCLAIMER, key: key };
  if (typeof module !== 'undefined' && module.exports) module.exports = MENTION;
  root.MENTION = MENTION;
})(typeof window !== 'undefined' ? window : this);
