/* YC AXIOM GEO（AI 可見度）檢測引擎
   純前端、無外部相依。輸入：網頁原始碼 + robots.txt + llms.txt 內容；輸出：分數、各項結果、前 3 大問題。
   計分規則見「GEO檢測頁計畫」：A 爬蟲存取 20、B 內容可讀性 20、C 店家基本資料 20、D 問答式內容 15、E 可信度 10、F 標題結構 10，
   另有 llms.txt 加分（最多 +3）。通過＝滿分、警告＝一半、需修正＝0；「無法判斷」「不適用」不計入分母。
   這些是提高被 AI 引用機會的因素，無法保證被 AI 推薦。 */
(function (root) {
  'use strict';

  var DISCLAIMER = '這些是提高被 AI 引用機會的因素，無法保證被 AI 推薦。';

  // ═══════════════ robots.txt（RFC 9309）═══════════════
  function parseRobots(text) {
    var groups = [], cur = null, lastWasAgent = false;
    String(text || '').replace(/^﻿/, '').split(/\r\n|\n|\r/).forEach(function (raw) {
      var line = raw.replace(/#.*$/, '').trim();
      if (!line) return;
      var i = line.indexOf(':'); if (i < 0) return;
      var key = line.slice(0, i).trim().toLowerCase(), val = line.slice(i + 1).trim();
      if (key === 'user-agent') {
        if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
        cur.agents.push(val.toLowerCase()); lastWasAgent = true;
      } else if (key === 'allow' || key === 'disallow') {
        lastWasAgent = false;
        if (cur) cur.rules.push({ type: key, path: val });
      } else { lastWasAgent = false; }   // sitemap、crawl-delay 等：不影響存取判斷
    });
    return groups;
  }
  function patternToRegex(p) {
    var anchored = /\$$/.test(p); if (anchored) p = p.slice(0, -1);
    var re = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp('^' + re + (anchored ? '$' : ''));
  }
  // 回傳 { allowed, group: 'specific'|'wildcard'|'none', rule, blockedSomething }
  function robotsCheck(groups, ua, path) {
    ua = ua.toLowerCase(); path = path || '/';
    var spec = groups.filter(function (g) { return g.agents.indexOf(ua) >= 0; });
    var which = 'specific';
    if (!spec.length) { spec = groups.filter(function (g) { return g.agents.indexOf('*') >= 0; }); which = 'wildcard'; }
    if (!spec.length) return { allowed: true, group: 'none', rule: null, blockedSomething: false };
    var rules = [].concat.apply([], spec.map(function (g) { return g.rules; }));
    var best = null, blockedSomething = false;
    rules.forEach(function (r) {
      if (r.type === 'disallow' && r.path) blockedSomething = true;
      if (!r.path) return;                                   // 空的 Disallow＝不限制；空的 Allow 無意義
      var m; try { m = patternToRegex(r.path).test(path); } catch (e) { m = false; }
      if (!m) return;
      var len = r.path.length;
      if (!best || len > best.len || (len === best.len && r.type === 'allow' && best.rule.type !== 'allow')) best = { len: len, rule: r };
    });
    if (!best) return { allowed: true, group: which, rule: null, blockedSomething: blockedSomething };
    return { allowed: best.rule.type === 'allow', group: which, rule: best.rule, blockedSomething: blockedSomething };
  }

  // ═══════════════ 工具函式 ═══════════════
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function tlen(s) { return norm(s).replace(/\s/g, '').length; }
  function arr(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }
  function qs(doc, sel) { try { return Array.prototype.slice.call(doc.querySelectorAll(sel)); } catch (e) { return []; } }
  function metaContent(doc, sel) { var m = doc.querySelector(sel); return m ? norm(m.getAttribute('content')) : ''; }

  function visibleText(doc) {
    if (!doc.body) return '';
    var clone = doc.body.cloneNode(true);
    qs(clone, 'script,style,noscript,template,svg,iframe').forEach(function (n) { n.remove(); });
    return norm(clone.textContent);
  }
  function countWords(text) {
    var cjk = (text.match(/[㐀-鿿豈-﫿]/g) || []).length;
    var latin = (text.match(/[A-Za-z]{2,}/g) || []).length;
    return cjk + latin;
  }

  // JSON-LD：展開 @graph / 陣列，回傳所有節點（含巢狀的 author / address 等由使用者再取）
  function jsonLdNodes(doc) {
    var out = [];
    function walk(n) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n['@graph']) walk(n['@graph']);
      if (n['@type']) out.push(n);
    }
    qs(doc, 'script[type="application/ld+json"]').forEach(function (s) {
      try { walk(JSON.parse(s.textContent.trim())); } catch (e) { /* 壞掉的 JSON-LD 視為沒有 */ }
    });
    return out;
  }
  function typesOf(n) { return arr(n['@type']).map(String); }
  var LOCAL_TYPES = /^(LocalBusiness|ProfessionalService|Store|Restaurant|CafeOrCoffeeShop|BarOrPub|Bakery|FastFoodRestaurant|Hotel|LodgingBusiness|BedAndBreakfast|Hostel|Motel|Resort|HealthAndBeautyBusiness|BeautySalon|HairSalon|NailSalon|DaySpa|HealthClub|Dentist|Physician|MedicalBusiness|MedicalClinic|Optician|Pharmacy|Hospital|VeterinaryCare|AutoRepair|AutoDealer|AutomotiveBusiness|LegalService|Attorney|Notary|AccountingService|FinancialService|InsuranceAgency|RealEstateAgent|TravelAgency|EmploymentAgency|HomeAndConstructionBusiness|Electrician|Plumber|Locksmith|MovingCompany|RoofingContractor|GeneralContractor|HousePainter|Florist|BookStore|ClothingStore|ShoeStore|JewelryStore|FurnitureStore|ElectronicsStore|GroceryStore|ConvenienceStore|DepartmentStore|PetStore|SportingGoodsStore|ToyStore|HardwareStore|Library|Museum|Gym|SportsActivityLocation|EntertainmentBusiness|ChildCare|School|EducationalOrganization|Photograph(y|er)Studio|PhotographyBusiness|ArtGallery|PhotoStudio|ComputerStore|InternetCafe|TattooParlor|MassageTherapist|Massage|SelfStorage|ShoppingCenter|TouristInformationCenter|FoodEstablishment|WholesaleStore|DryCleaningOrLaundry|ArchiveOrganization|AutoPartsStore)$/;
  function isLocal(n) { return typesOf(n).some(function (t) { return LOCAL_TYPES.test(t); }); }
  function isOrg(n) { return typesOf(n).some(function (t) { return /^(Organization|Corporation|NGO|OnlineBusiness|OnlineStore|NewsMediaOrganization|GovernmentOrganization|SportsOrganization|Airline|Consortium|LibrarySystem|MedicalOrganization|PerformingGroup|Project|ResearchOrganization|WorkersUnion)$/.test(t); }); }
  function isArticle(n) { return typesOf(n).some(function (t) { return /^(Article|BlogPosting|NewsArticle|TechArticle|ScholarlyArticle|Report|SocialMediaPosting|LiveBlogPosting)$/.test(t); }); }

  function textOf(v) { if (v == null) return ''; if (typeof v === 'string') return norm(v); if (typeof v === 'object') return norm(v.name || v['@id'] || ''); return norm(String(v)); }

  // ═══════════════ 單項建立 ═══════════════
  function item(def) {
    var it = { id: def.id, cat: def.cat, title: def.title, max: def.max, status: def.status, note: def.note || '', why: def.why || '', fix: def.fix || '' };
    if (def.kind) it.kind = def.kind;
    if (def.suppressIssue) it.suppressIssue = true;
    if (def.issueLoss != null) it.issueLoss = def.issueLoss;
    it.counted = (it.status === 'pass' || it.status === 'warn' || it.status === 'fail');
    it.earned = it.status === 'pass' ? it.max : (it.status === 'warn' ? Math.round(it.max * 5) / 10 : 0);
    return it;
  }

  var CATS = [
    { id: 'A', name: 'AI 爬蟲存取', max: 20, hint: 'AI 的「搜尋機器人」能不能進到你的網站' },
    { id: 'B', name: '內容可讀性', max: 20, hint: '不執行 JavaScript 時，AI 看到的是文章還是空白頁' },
    { id: 'C', name: '店家基本資料', max: 20, hint: '店名、地址、電話、營業時間，AI 找得到嗎' },
    { id: 'D', name: '問答式內容', max: 15, hint: '有沒有整理成 AI 容易直接引用的問與答' },
    { id: 'E', name: '可信度訊號', max: 10, hint: '作者、日期、真實案例與評價' },
    { id: 'F', name: '標題結構', max: 10, hint: '標題層級清楚，AI 才抓得到重點' }
  ];
  var CAT_ORDER = { A: 0, C: 1, B: 2, D: 3, F: 4, E: 5 };   // 失分相同時的排序

  // ═══════════════ A. AI 爬蟲 ═══════════════
  var BOTS = [
    { id: 'a_oai', ua: 'OAI-SearchBot', max: 5, kind: 'search', title: 'ChatGPT 搜尋爬蟲（OAI-SearchBot）可讀取',
      why: 'OAI-SearchBot 是 ChatGPT 搜尋用來找網頁的爬蟲。被擋住的話，ChatGPT 搜尋就很難引用你的網站。',
      fix: '在網站的 robots.txt 加上「User-agent: OAI-SearchBot」與「Allow: /」，或移除對它的 Disallow 規則。' },
    { id: 'a_perp', ua: 'PerplexityBot', max: 5, kind: 'search', title: 'Perplexity 搜尋爬蟲（PerplexityBot）可讀取',
      why: 'PerplexityBot 是 Perplexity 搜尋用的爬蟲。被擋住的話，Perplexity 的答案就不會引用你的網站。',
      fix: '在 robots.txt 加上「User-agent: PerplexityBot」與「Allow: /」，或移除對它的 Disallow 規則。' },
    { id: 'a_gpt', ua: 'GPTBot', max: 4, kind: 'training', title: 'OpenAI 內容爬蟲（GPTBot）可讀取',
      why: 'GPTBot 是 OpenAI 蒐集網頁內容（包含模型訓練）的爬蟲。擋掉它不一定影響 ChatGPT 搜尋的引用，要不要開放由你決定；若希望內容被 OpenAI 的產品理解與使用，就需要允許。',
      fix: '若願意開放，在 robots.txt 加上「User-agent: GPTBot」與「Allow: /」；若不想被用於訓練，保持封鎖也可以，但要知道這會降低在 OpenAI 產品中的可見度。' },
    { id: 'a_claude', ua: 'ClaudeBot', max: 3, kind: 'training', title: 'Anthropic 爬蟲（ClaudeBot）可讀取',
      why: 'ClaudeBot 是 Anthropic（Claude）蒐集網頁內容的爬蟲。被擋住時，Claude 比較難取得你網站的內容。',
      fix: '在 robots.txt 加上「User-agent: ClaudeBot」與「Allow: /」，或移除對它的 Disallow 規則。' },
    { id: 'a_gext', ua: 'Google-Extended', max: 3, kind: 'training', title: 'Google AI 使用許可（Google-Extended）',
      why: 'Google-Extended 控制 Google 能否把你的內容用在 Gemini 等 AI 產品上。它不影響一般 Google 搜尋的排名。',
      fix: '若願意讓 Google 的 AI 使用內容，在 robots.txt 加上「User-agent: Google-Extended」與「Allow: /」，或移除對它的 Disallow 規則。' }
  ];
  var EXTRA_BOTS = ['ChatGPT-User', 'Applebot-Extended', 'CCBot', 'Bytespider'];

  function pathOf(url) { try { var u = new URL(url); return (u.pathname || '/') + (u.search || ''); } catch (e) { return '/'; } }

  function robotsMeta(doc) {
    var out = { noindex: false, nosnippet: false, maxSnippet0: false, raw: [] };
    qs(doc, 'meta[name]').forEach(function (m) {
      var name = (m.getAttribute('name') || '').toLowerCase();
      if (!/^(robots|googlebot|bingbot|googlebot-news|gptbot|oai-searchbot|perplexitybot|claudebot)$/.test(name)) return;
      var c = (m.getAttribute('content') || '').toLowerCase();
      out.raw.push(name + ': ' + c);
      if (/(^|[\s,])noindex([\s,]|$)/.test(c) || /(^|[\s,])none([\s,]|$)/.test(c)) out.noindex = true;
      if (/(^|[\s,])nosnippet([\s,]|$)/.test(c)) out.nosnippet = true;
      if (/max-snippet\s*:\s*0([\s,]|$)/.test(c)) out.maxSnippet0 = true;
    });
    return out;
  }

  function checkA(doc, ctx, extra) {
    var items = [], groups = null, path = pathOf(ctx.url);
    var rs = ctx.mode === 'html' ? 'unknown' : ((ctx.robots && ctx.robots.status) || 'unknown');
    if (rs === 'ok') groups = parseRobots(ctx.robots.text);
    var meta = robotsMeta(doc);
    var metaBlock = meta.noindex || meta.nosnippet || meta.maxSnippet0;
    var metaWhat = [meta.noindex ? 'noindex' : '', meta.nosnippet ? 'nosnippet' : '', meta.maxSnippet0 ? 'max-snippet:0' : ''].filter(Boolean).join('、');

    BOTS.forEach(function (b) {
      var status, note;
      if (metaBlock) { status = 'fail'; note = '這個頁面設定了 ' + metaWhat + '，等於要求搜尋與 AI 不要使用這頁內容。'; }
      else if (rs === 'unknown') { status = 'unknown'; note = ctx.mode === 'html' ? '你提供的是 HTML 原始碼，無法讀取網站的 robots.txt，這一項暫不計分。' : '沒能取得這個網站的 robots.txt（可能是抓取服務被擋），這一項暫不計分。'; }
      else if (rs === 'none') { status = 'pass'; note = '網站沒有 robots.txt，預設允許所有爬蟲讀取。'; }
      else {
        var r = robotsCheck(groups, b.ua, path);
        if (r.allowed) {
          status = 'pass';
          note = r.group === 'specific' ? 'robots.txt 有針對 ' + b.ua + ' 設定，且允許讀取這個頁面。' : '沒有針對 ' + b.ua + ' 另外設限，依一般規則允許。';
          if (r.blockedSomething) note += '（網站有擋部分目錄，但這個頁面可以讀。）';
        } else {
          status = 'fail';
          note = 'robots.txt 禁止 ' + b.ua + ' 讀取這個頁面（規則：' + (r.rule ? 'Disallow: ' + r.rule.path : '') + '，套用於' + (r.group === 'specific' ? '針對它的設定' : '「所有爬蟲」的設定') + '）。';
        }
      }
      items.push(item({ id: b.id, cat: 'A', title: b.title, max: b.max, status: status, note: note, why: b.why, fix: b.fix, kind: b.kind, suppressIssue: metaBlock }));
    });
    if (metaBlock) {
      items.push(item({ id: 'a_meta', cat: 'A', title: '頁面沒有禁止搜尋與 AI 使用（meta robots）', max: 0, status: 'fail',
        note: '偵測到 ' + metaWhat + '（' + meta.raw.join('；') + '）。',
        why: '這個設定是直接叫搜尋引擎與 AI「不要收錄、不要引用」這個頁面，是影響最大的問題。',
        fix: '到網站後台或 HTML 的 <head>，移除 <meta name="robots" content="…noindex / nosnippet / max-snippet:0…">。若是 WordPress，檢查「設定 → 閱讀 → 不鼓勵搜尋引擎索引」是否被勾選。', issueLoss: 20 }));
    }
    // 不計分、僅供參考：其他常見 AI 爬蟲
    var extraBots = [];
    EXTRA_BOTS.forEach(function (ua) {
      if (rs === 'ok') { var r = robotsCheck(groups, ua, path); extraBots.push({ ua: ua, state: r.allowed ? 'allowed' : 'blocked' }); }
      else extraBots.push({ ua: ua, state: rs === 'none' ? 'allowed' : 'unknown' });
    });
    extra.extraBots = extraBots; extra.robotsStatus = rs; extra.metaBlock = metaBlock;
    return items;
  }

  // ═══════════════ B. 內容可讀性 ═══════════════
  function checkB(doc, extra) {
    var items = [], text = visibleText(doc), words = countWords(text);
    extra.textLen = words;
    var bodyHtml = doc.body ? doc.body.innerHTML : '';
    var emptyRoot = !!doc.querySelector('#root:empty, #app:empty, #__next:empty, #__nuxt:empty, #root > noscript:only-child') ||
      (qs(doc, 'script[src]').length > 0 && words < 200 && /id=["'](root|app|__next|__nuxt)["']/.test(bodyHtml));
    extra.spaShell = words < 200 && (emptyRoot || qs(doc, 'script[src]').length >= 2);
    var status = words >= 600 ? 'pass' : (words >= 200 ? 'warn' : 'fail');
    var note = '不執行 JavaScript 時，這個頁面約有 ' + words + ' 個字（中文字與英文單字合計）。';
    if (extra.spaShell) note += ' 看起來內容要靠 JavaScript 才會出現，多數 AI 爬蟲不會執行 JavaScript，可能看到一個空白頁。';
    items.push(item({ id: 'b_text', cat: 'B', title: '不用 JavaScript 也看得到足夠的文字', max: 12, status: status, note: note,
      why: 'AI 爬蟲多半只讀網頁原始碼、不會跑 JavaScript。文字太少或要靠程式才會顯示，AI 就讀不到你在賣什麼、做什麼。',
      fix: '把主要介紹文字直接寫在 HTML 裡（服務內容、特色、流程、價格區間等，建議合計 600 字以上）。若網站用前端框架（React、Vue 等），請改用伺服器端渲染（SSR）或預先產生靜態頁面。' }));

    var hasMain = !!doc.querySelector('main, article, [role="main"]');
    var pCount = qs(doc, 'p').filter(function (p) { return tlen(p.textContent) >= 15; }).length;
    var sem = hasMain || pCount >= 3 ? 'pass' : (pCount >= 1 ? 'warn' : 'fail');
    items.push(item({ id: 'b_sem', cat: 'B', title: '內容放在有意義的區塊（main／article／段落）', max: 4, status: sem,
      note: (hasMain ? '找到 main 或 article 區塊。' : '沒有 main 或 article 區塊。') + '有 ' + pCount + ' 段完整段落。',
      why: '用 main、article 與段落標籤包住內容，AI 才分得出哪裡是正文、哪裡是選單與頁尾。',
      fix: '把頁面主要內容包在 <main> 內（文章用 <article>），內文用 <p> 段落，而不是一整堆 <div> 加 <br>。' }));

    var imgs = qs(doc, 'img').filter(function (im) {
      var w = parseInt(im.getAttribute('width'), 10), h = parseInt(im.getAttribute('height'), 10);
      if ((w && w <= 2) || (h && h <= 2)) return false;
      if (im.getAttribute('aria-hidden') === 'true' || im.getAttribute('role') === 'presentation') return false;
      return true;
    });
    if (!imgs.length) {
      items.push(item({ id: 'b_alt', cat: 'B', title: '圖片都有文字說明（alt）', max: 4, status: 'na', note: '頁面沒有圖片，這一項不計分。', why: '', fix: '' }));
    } else {
      var withAlt = imgs.filter(function (im) { return norm(im.getAttribute('alt')).length > 0; }).length;
      var ratio = withAlt / imgs.length;
      items.push(item({ id: 'b_alt', cat: 'B', title: '圖片都有文字說明（alt）', max: 4, status: ratio >= 0.8 ? 'pass' : (ratio >= 0.4 ? 'warn' : 'fail'),
        note: imgs.length + ' 張圖片中有 ' + withAlt + ' 張有 alt 文字（' + Math.round(ratio * 100) + '%）。',
        why: 'AI 看不懂圖片本身，只能靠 alt 文字知道圖在說什麼；店面、作品、菜單的圖片尤其需要。',
        fix: '替每張有意義的圖片補上簡短描述，例如 alt="台中西區咖啡店店內座位"。純裝飾圖片可留空白 alt。' }));
    }
    return items;
  }

  // ═══════════════ C. 店家基本資料 ═══════════════
  var RE_ADDR_TW = /[一-龥]{1,4}[縣市][一-龥]{1,5}[區鄉鎮市][一-龥\d\-之]{1,16}(路|街|大道|巷|弄)/;
  var RE_ADDR_TW2 = /(路|街|大道)[一-龥\d\-之]{0,8}\d+[\-之]?\d*號/;
  var RE_ADDR_EN = /\d+[A-Za-z\-]*\s+[A-Za-z0-9 .]+\s(Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Lane|Ln\.?)\b/i;
  var RE_PHONE = /(\+?886[\s\-]?|0)9\d{2}[\s\-]?\d{3}[\s\-]?\d{3}|\(?0\d{1,2}\)?[\s\-－)）]?\d{3,4}[\s\-－]?\d{4}|\+?886[\s\-]?\d{1,2}[\s\-]?\d{3,4}[\s\-]?\d{4}/;
  var RE_RANGE = /\d{1,2}\s*[:：]\s*\d{2}\s*(?:[\-~–—－～]|至|到)\s*(?:翌日\s*|隔日\s*)?\d{1,2}\s*[:：]\s*\d{2}/;
  var RE_RANGE2 = /\d{1,2}\s*(?:點|時|am|pm|AM|PM)\s*(?:[\-~–—－～]|至|到)\s*\d{1,2}\s*(?:點|時|am|pm|AM|PM)?/;

  function checkC(doc, extra, text, nodes) {
    var items = [];
    var biz = nodes.filter(function (n) { return isLocal(n) || isOrg(n); });
    var local = nodes.filter(isLocal);
    function anyField(f) { return biz.some(function (n) { return n[f] != null && (typeof n[f] !== 'string' || n[f].trim()); }); }

    // 店名
    var ldName = biz.map(function (n) { return textOf(n.name); }).filter(Boolean)[0];
    var ogName = metaContent(doc, 'meta[property="og:site_name"]');
    var title = norm((doc.querySelector('title') || {}).textContent);
    var brandFromTitle = '';
    if (title) { var seg = title.split(/\s*[｜|—–\-·•:：]\s*/); if (seg.length > 1) brandFromTitle = seg[seg.length - 1]; }
    var nameStatus = (ldName || ogName) ? 'pass' : (brandFromTitle ? 'warn' : 'fail');
    items.push(item({ id: 'c_name', cat: 'C', title: '明確的店名／品牌名', max: 3, status: nameStatus,
      note: ldName ? '結構化資料中有名稱：' + ldName + '。' : (ogName ? '設定了網站名稱（og:site_name）：' + ogName + '。' : (brandFromTitle ? '只能從網頁標題推測品牌名為「' + brandFromTitle + '」，沒有明確標示。' : '找不到明確的店名或品牌名。')),
      why: 'AI 回答「某某店在哪裡」時，需要確定你的名稱寫法；名稱不一致或沒標示，容易被當成別家。',
      fix: '在結構化資料（LocalBusiness 或 Organization）中填入 name，並設定 <meta property="og:site_name">，全站店名寫法保持一致。' }));

    // 地址
    var ldAddr = biz.some(function (n) { return n.address && (typeof n.address === 'string' ? n.address.trim() : (n.address.streetAddress || n.address.addressLocality || n.address.addressRegion)); });
    var textAddr = RE_ADDR_TW.test(text) || RE_ADDR_TW2.test(text) || RE_ADDR_EN.test(text);
    var areaOnly = /服務(範圍|地區|據點|區域)|可到府|全台(灣)?可|全台(灣)?服務|台灣全區/.test(text) || biz.some(function (n) { return n.areaServed; });
    var addrStatus = (ldAddr || textAddr) ? 'pass' : (areaOnly ? 'warn' : 'fail');
    items.push(item({ id: 'c_addr', cat: 'C', title: '看得到完整地址', max: 4, status: addrStatus,
      note: ldAddr && textAddr ? '頁面文字與結構化資料都有地址。' : (ldAddr ? '結構化資料有地址。' : (textAddr ? '頁面文字中有地址。' : (areaOnly ? '有提到服務地區，但沒有完整地址。' : '找不到地址。'))),
      why: '「附近」「台中哪裡有…」這類問題，AI 要靠地址才能判斷你是否符合；沒有地址就很難被推薦給在地客人。',
      fix: '在頁尾或聯絡頁用文字寫出完整地址（縣市、區、路名、門牌），並在結構化資料加上 address。若是無店面的工作室，至少寫明服務地區（areaServed）。' }));

    // 電話
    var ldPhone = biz.some(function (n) { return n.telephone || (n.contactPoint && arr(n.contactPoint).some(function (c) { return c && c.telephone; })); });
    var telLink = qs(doc, 'a[href^="tel:"]').length > 0;
    var textPhone = RE_PHONE.test(text.replace(/\d{4}-\d{2}-\d{2}/g, ''));
    var otherContact = qs(doc, 'a[href*="line.me"], a[href^="mailto:"]').length > 0 || /LINE\s*(ID)?[:：]?\s*@?\w+/i.test(text) || /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text);
    var phoneStatus = (ldPhone || telLink || textPhone) ? 'pass' : (otherContact ? 'warn' : 'fail');
    items.push(item({ id: 'c_phone', cat: 'C', title: '看得到聯絡電話', max: 4, status: phoneStatus,
      note: (ldPhone || telLink || textPhone) ? '找到電話號碼' + (telLink ? '（含可點擊的 tel: 連結）' : '') + '。' : (otherContact ? '有 LINE 或 Email 可聯絡，但沒有電話。' : '找不到任何聯絡方式。'),
      why: '詢問「怎麼聯絡」「電話多少」時，AI 會直接引用頁面上的電話；沒有電話就只能請人自己去找。',
      fix: '用文字寫出電話（不要只放在圖片裡），並做成 <a href="tel:+886…"> 連結，同時填入結構化資料的 telephone。若沒有電話，至少清楚寫出 LINE／Email。' }));

    // 營業時間
    var ldHours = biz.some(function (n) { return n.openingHours || n.openingHoursSpecification; });
    var hoursLabel = /營業時間|服務時間|營業日|開放時間|Opening Hours|Business Hours|Hours/i.test(text);
    var hoursRange = RE_RANGE.test(text) || RE_RANGE2.test(text);
    var hoursStatus = (ldHours || (hoursLabel && hoursRange)) ? 'pass' : ((hoursLabel || hoursRange) ? 'warn' : 'fail');
    items.push(item({ id: 'c_hours', cat: 'C', title: '看得到營業／服務時間', max: 3, status: hoursStatus,
      note: ldHours ? '結構化資料有營業時間。' : (hoursLabel && hoursRange ? '頁面文字有營業時間與時段。' : (hoursLabel ? '提到營業時間，但沒有具體時段。' : (hoursRange ? '有時段，但沒有標示是營業時間。' : '找不到營業時間。'))),
      why: '「現在有開嗎」「幾點打烊」是 AI 常被問的問題；沒有寫就無法回答。',
      fix: '用文字寫出「營業時間：週一至週五 10:00–19:00」這類格式，並在結構化資料加上 openingHoursSpecification。若採預約制，明確寫出「預約制」與可預約時段。' }));

    // 結構化資料
    var hasType = local.length > 0 || biz.length > 0;
    items.push(item({ id: 'c_schema_type', cat: 'C', title: '有店家／組織的結構化資料（LocalBusiness 或 Organization）', max: 3, status: hasType ? 'pass' : 'fail',
      note: hasType ? '找到 ' + (local.length ? 'LocalBusiness 類型（' + typesOf(local[0]).join('、') + '）' : 'Organization 類型') + ' 的 JSON-LD。' : '沒有找到 LocalBusiness 或 Organization 的結構化資料。',
      why: '結構化資料是專門寫給機器看的「名片」，AI 可以直接讀出店名、地址、電話，不必從文字猜。',
      fix: '在首頁 <head> 加上 JSON-LD（<script type="application/ld+json">），類型選最貼近的 LocalBusiness 子類型（如 ProfessionalService、Restaurant），沒有實體店面可用 Organization。' }));
    var fields = ['name', 'url', 'address', 'telephone', 'openingHours', 'sameAs'];
    var present = fields.filter(function (f) {
      if (f === 'openingHours') return anyField('openingHours') || anyField('openingHoursSpecification');
      if (f === 'sameAs') return biz.some(function (n) { return arr(n.sameAs).length >= 1; });
      if (f === 'address') return anyField('address') || anyField('areaServed');
      if (f === 'telephone') return anyField('telephone') || biz.some(function (n) { return n.contactPoint; });
      return anyField(f);
    });
    var completeOK = hasType && present.length >= 4 && present.indexOf('name') >= 0 && present.indexOf('url') >= 0;
    var missing = fields.filter(function (f) { return present.indexOf(f) < 0; });
    items.push(item({ id: 'c_schema_fields', cat: 'C', title: '結構化資料欄位完整', max: 3, status: !hasType ? 'fail' : (completeOK ? 'pass' : 'warn'),
      note: !hasType ? '沒有結構化資料，所以欄位也無從檢查。' : '六個重點欄位（name、url、address、telephone、openingHours、sameAs）中有 ' + present.length + ' 個' + (missing.length ? '，缺少：' + missing.join('、') : '') + '。',
      why: '欄位越完整，AI 越能一次拿到正確資訊；缺欄位等於名片少寫了幾行。',
      fix: '補上缺少的欄位。sameAs 放你的官方社群或地圖頁面網址（Facebook、Instagram、Google 商家等）。必須與頁面上看得到的資訊一致。' }));
    return items;
  }

  // ═══════════════ D. 問答式內容 ═══════════════
  var RE_QWORD = /(如何|怎麼|怎樣|為什麼|為何|什麼是|是什麼|多少|可以嗎|是否|嗎[？?]?$|哪些|哪裡|何時|多久|\bhow\b|\bwhat\b|\bwhy\b|\bwhen\b|\bwhere\b)/i;
  function isQuestionText(t) { t = norm(t); return t.length >= 4 && t.length <= 80 && (/[？?]\s*$/.test(t) || (RE_QWORD.test(t) && t.length <= 40 && /[？?]|嗎|如何|怎麼|為什麼|多少|什麼是|是什麼|哪/.test(t))); }
  function questionEls(doc) {
    var sel = 'h1,h2,h3,h4,h5,h6,summary,dt,[class*="question" i],[class*="faq-q" i],[class*="accordion-title" i],[class*="accordion-header" i]';
    return qs(doc, sel).filter(function (e) { return !e.closest('nav,header,footer') || /faq|question/i.test(e.className || ''); });
  }
  function answerFor(q) {
    if (q.tagName === 'SUMMARY') {
      var d = q.parentElement, t = norm(d.textContent).replace(norm(q.textContent), ''); return norm(t);
    }
    var n = q.nextElementSibling;
    if (!n && q.parentElement && /^(BUTTON|SPAN|H\d|DIV)$/.test(q.tagName)) n = q.parentElement.nextElementSibling;
    if (!n) return '';
    if (q.tagName === 'DT') { return norm(n.textContent); }
    if (/^(H[1-6]|SUMMARY)$/.test(n.tagName)) return '';
    var p = n.tagName === 'P' ? n : (n.querySelector && n.querySelector('p'));
    return norm((p || n).textContent);
  }

  function checkD(doc, extra, nodes, text) {
    var items = [];
    var qEls = questionEls(doc);
    var headingsQ = qs(doc, 'h2,h3,h4,h5,h6').filter(function (h) { return isQuestionText(h.textContent); });
    var details = qs(doc, 'details > summary').length;
    var faqHeading = qs(doc, 'h1,h2,h3,h4,h5,h6').some(function (h) { return /常見問題|常見問答|FAQ|Q\s*&\s*A|Q＆A|問與答|Q&amp;A/i.test(h.textContent); });
    var faqClass = qs(doc, '[class*="faq" i],[id*="faq" i]').length > 0;
    var faqStatus = (faqHeading || headingsQ.length >= 3 || details >= 3 || (faqClass && qEls.filter(function (e) { return isQuestionText(e.textContent); }).length >= 2)) ? 'pass' :
      ((headingsQ.length >= 1 || details >= 1 || faqClass) ? 'warn' : 'fail');
    extra.hasFaq = faqStatus === 'pass';
    items.push(item({ id: 'd_faq', cat: 'D', title: '有「常見問題」區塊', max: 5, status: faqStatus,
      note: faqStatus === 'pass' ? '找到常見問題區塊或多個問句標題。' : (faqStatus === 'warn' ? '有零星的問句，但還不夠成一個完整的常見問題區塊（建議至少 3 題）。' : '找不到常見問題區塊。'),
      why: 'AI 回答問題時，最愛引用「問題＋簡短答案」的格式。客人常問的事（價格、流程、地點、預約）寫成 Q&A，被引用的機會高很多。',
      fix: '在首頁或服務頁加一個「常見問題」區塊，列出 5–8 題客人真的會問的問題，每題用問句當標題，下面直接用 1–3 句話回答。' }));

    var faqLd = nodes.filter(function (n) { return typesOf(n).indexOf('FAQPage') >= 0; });
    var qCount = 0;
    faqLd.forEach(function (n) { arr(n.mainEntity).forEach(function (q) { if (q && typesOf(q).indexOf('Question') >= 0 && q.acceptedAnswer) qCount++; }); });
    var microdata = qs(doc, '[itemtype*="FAQPage"]').length > 0;
    var fsStatus = (qCount >= 2 || microdata) ? 'pass' : (faqLd.length ? 'warn' : 'fail');
    items.push(item({ id: 'd_faqschema', cat: 'D', title: '常見問題有加上 FAQPage 結構化資料', max: 5, status: fsStatus,
      note: qCount >= 2 ? '結構化資料中有 FAQPage，共 ' + qCount + ' 組問答。' : (microdata ? '找到 FAQPage 的 microdata 標記。' : (faqLd.length ? '有 FAQPage，但問答不足 2 組或格式不完整。' : (extra.hasFaq ? '頁面有常見問題，但沒有加 FAQPage 結構化資料。' : '沒有 FAQPage 結構化資料。'))),
      why: '把問答用 FAQPage 標記起來，等於直接把「題目與標準答案」交給 AI 與搜尋引擎，最容易被整段引用。',
      fix: '在頁面加入 FAQPage 的 JSON-LD，每一組含 Question（name）與 acceptedAnswer（text）；內容必須與頁面上看得到的問答一致。' }));

    // 直接回答
    var pairs = 0;
    qEls.forEach(function (q) {
      if (!isQuestionText(q.textContent)) return;
      var a = answerFor(q), L = tlen(a);
      if (L >= 30 && L <= 300) pairs++;
    });
    var h1 = doc.querySelector('h1'), lead = '';
    if (h1) { var n = h1.nextElementSibling, guard = 0; while (n && guard++ < 4 && !(n.tagName === 'P' || (n.textContent && tlen(n.textContent) >= 15))) n = n.nextElementSibling; lead = n ? norm((n.tagName === 'P' ? n : (n.querySelector('p') || n)).textContent) : ''; }
    var leadOK = tlen(lead) >= 15 && tlen(lead) <= 120;
    var dStatus = (pairs >= 2 || leadOK) ? 'pass' : ((pairs === 1 || tlen(lead) > 120) ? 'warn' : 'fail');
    items.push(item({ id: 'd_direct', cat: 'D', title: '問題後面有簡短、直接的回答', max: 5, status: dStatus,
      note: pairs >= 2 ? '找到 ' + pairs + ' 組「問句＋30–300 字簡短回答」。' : (leadOK ? '主標題後的第一段（' + tlen(lead) + ' 字）直接說明了這頁在講什麼。' : (pairs === 1 ? '只有 1 組問答符合格式。' : (tlen(lead) > 120 ? '主標題後的第一段太長（' + tlen(lead) + ' 字），不易被直接引用。' : '沒有找到「問句＋簡短回答」的段落。'))),
      why: 'AI 引用時偏好 30–300 字、一段話就能講清楚的答案；答案拖很長或藏在長篇大論裡，就比較不會被選中。',
      fix: '每個問題下方先用 1–3 句話給出結論（30–300 字），細節再往後補。頁面開頭也用一句話說明「我們是誰、提供什麼」。' }));
    return items;
  }

  // ═══════════════ E. 可信度 ═══════════════
  function checkE(doc, ctx, extra, nodes, text) {
    var items = [];
    var artNodes = nodes.filter(isArticle);
    var ogArticle = metaContent(doc, 'meta[property="og:type"]').toLowerCase() === 'article';
    var path = pathOf(ctx.url);
    var pathArticle = /\/(articles?|blog|news|posts?|journal)\//i.test(path) && !/\/(articles?|blog|news|posts?|journal)\/?$/i.test(path);
    var isArt = artNodes.length > 0 || ogArticle || pathArticle;
    extra.isArticle = isArt;
    if (!isArt) {
      items.push(item({ id: 'e_author', cat: 'E', title: '文章有標示作者', max: 3, status: 'na', note: '這不是文章頁，這一項不計分。' }));
      items.push(item({ id: 'e_date', cat: 'E', title: '文章有標示發布與更新日期', max: 3, status: 'na', note: '這不是文章頁，這一項不計分。' }));
    } else {
      var ldAuthor = artNodes.some(function (n) { return n.author && textOf(arr(n.author)[0]); });
      var visAuthor = /(作者|撰文|文\s*[／/]|Written by|By)\s*[:：]?\s*\S+/.test(text) || qs(doc, '[rel="author"], .author, .byline, [class*="author" i], [itemprop="author"]').length > 0;
      var metaAuthor = !!metaContent(doc, 'meta[name="author"]');
      var aStatus = (ldAuthor || visAuthor) ? 'pass' : (metaAuthor ? 'warn' : 'fail');
      items.push(item({ id: 'e_author', cat: 'E', title: '文章有標示作者', max: 3, status: aStatus,
        note: (ldAuthor || visAuthor) ? '找到作者資訊。' : (metaAuthor ? '只有隱藏的 meta author，讀者在頁面上看不到作者。' : '找不到作者。'),
        why: 'AI 判斷內容是否可信時，會參考「誰寫的」。有具名作者（最好附簡介）比匿名內容更容易被採用。',
        fix: '在文章開頭或結尾標示作者姓名與簡短介紹，並在 Article 結構化資料加上 author（含 name）。' }));
      var pub = artNodes.some(function (n) { return n.datePublished; }) || !!metaContent(doc, 'meta[property="article:published_time"]') || qs(doc, 'time[datetime]').length > 0;
      var mod = artNodes.some(function (n) { return n.dateModified; }) || !!metaContent(doc, 'meta[property="article:modified_time"]') || qs(doc, '[itemprop="dateModified"]').length > 0;
      var dStatus = (pub && mod) ? 'pass' : ((pub || mod) ? 'warn' : 'fail');
      items.push(item({ id: 'e_date', cat: 'E', title: '文章有標示發布與更新日期', max: 3, status: dStatus,
        note: pub && mod ? '發布日期與更新日期都有。' : (pub ? '只有發布日期，沒有更新日期。' : (mod ? '只有更新日期，沒有發布日期。' : '找不到日期。')),
        why: 'AI 偏好新鮮、可確認時間的內容；沒有日期，無法判斷資訊是否過時。',
        fix: '在文章頁顯示發布日期與最後更新日期，並在 Article 結構化資料加上 datePublished 與 dateModified。' }));
    }
    var ldReview = nodes.some(function (n) { return typesOf(n).some(function (t) { return /^(Review|AggregateRating)$/.test(t); }) || n.review || n.aggregateRating; });
    // 案例／作品／評價：比對標題、導覽列、連結、按鈕與短文字區塊（不分大小寫），不只看 h1–h4
    var proofZh = /作品|案例|評價|客戶回饋|顧客回饋|見證|得獎|好評/;
    var proofEn = /\b(portfolio|testimonials?|case\s*stud(y|ies)|customer\s*reviews?|client\s*reviews?|reviews?)\b/i;
    var proofEnExact = /^(our |my |selected |featured |recent |latest |view |see )?(works|cases|projects)( →| >|»)?$/i;
    var secExact = /^[\s\d.、：:\-–—·•]*(案例|作品|評價|見證|好評|客戶評價|Reviews?)[\s]*$/i;
    var proofHit = '';
    qs(doc, 'h1,h2,h3,h4,h5,h6,a,button,[role="button"],[role="tab"],summary,label,nav li,nav span,li,p,span,div,figcaption').some(function (e) {
      if (e.closest('template,noscript,script,style')) return false;
      if (e.children.length > 3) return false;                       // 大容器不比對，只看短文字節點
      var t = norm(e.textContent); if (!t || t.length > 24) return false;
      if (proofZh.test(t) || proofEn.test(t) || proofEnExact.test(t) || secExact.test(t)) { proofHit = t; return true; }
      return false;
    });
    var secHeading = !!proofHit || qs(doc, '[class*="testimonial" i],[class*="review" i],[class*="portfolio" i],[class*="case-" i]').length > 0;
    var rStatus = ldReview ? 'pass' : (secHeading ? 'pass' : 'fail');
    items.push(item({ id: 'e_proof', cat: 'E', title: '有真實案例或客戶評價', max: 4, status: rStatus,
      note: ldReview ? '結構化資料中有評價（Review／AggregateRating）。' : (secHeading ? ('找到案例、作品或評價區塊' + (proofHit ? '（「' + proofHit + '」）' : '') + '。') : '找不到案例或評價。') + '（工具無法驗證內容真偽，請確保內容真實。）',
      why: '真實案例與客人的評價，是 AI 與消費者判斷「這家店可不可靠」的重要依據。',
      fix: '在首頁或專頁放上真實的客戶案例、作品或評價（可附店家名稱、時間、成果）。只放真實內容，不要編造；有真實評分資料時可加上 Review／AggregateRating 結構化資料。' }));
    return items;
  }

  // ═══════════════ F. 標題結構 ═══════════════
  var GENERIC_H1 = /^(首頁|home|homepage|welcome|歡迎|歡迎光臨|index|untitled|logo|main|網站|我的網站|標題)$/i;
  // 偵測店名／品牌名：結構化資料 name → og:site_name；找不到回傳空字串（不從標題猜，避免把服務名稱當店名）
  function detectSiteName(doc, nodes) {
    var biz = nodes.filter(function (n) { return isLocal(n) || isOrg(n); });
    var n1 = biz.map(function (n) { return textOf(n.name); }).filter(Boolean)[0];
    if (n1) return norm(n1);
    var og = metaContent(doc, 'meta[property="og:site_name"]');
    if (og) return og;
    return '';          // 標題的品牌段落順序不固定（店名｜服務 或 服務｜店名），不拿來猜
  }
  function checkF(doc, nodes) {
    var items = [];
    var hs = qs(doc, 'h1,h2,h3,h4,h5,h6').filter(function (h) { return !h.closest('template,noscript'); });
    var h1s = hs.filter(function (h) { return h.tagName === 'H1'; });
    var oneStatus = h1s.length === 1 ? 'pass' : (h1s.length > 1 ? 'warn' : 'fail');
    items.push(item({ id: 'f_h1_one', cat: 'F', title: '全頁只有一個主標題（H1）', max: 3, status: oneStatus,
      note: '找到 ' + h1s.length + ' 個 H1。',
      why: 'H1 是這一頁的「書名」。一個頁面只有一個，AI 才能確定這頁的主題。',
      fix: h1s.length ? '保留最能代表這頁主題的一個 H1，其餘改為 H2 或 H3。' : '為頁面加上一個 H1，內容說明這頁在講什麼（含地區與服務更好）。' }));
    var t = h1s.length ? norm(h1s[0].textContent) : '';
    var L = tlen(t);
    var dStatus = !t ? 'fail' : (GENERIC_H1.test(t) ? 'fail' : ((L < 4 || L > 70) ? 'warn' : 'pass'));
    items.push(item({ id: 'f_h1_desc', cat: 'F', title: '主標題有說明這頁在講什麼', max: 3, status: dStatus,
      note: !t ? '沒有 H1，無從判斷。' : '目前的 H1：「' + (t.length > 40 ? t.slice(0, 40) + '…' : t) + '」。' + (GENERIC_H1.test(t) ? '這是很籠統的標題。' : (L < 4 || L > 70 ? '長度偏' + (L < 4 ? '短' : '長') + '。' : '')),
      why: '「首頁」「歡迎」這類標題對 AI 沒有任何資訊；寫清楚「誰、做什麼、在哪裡」才讀得懂。',
      fix: (function () {
        var nm = detectSiteName(doc, nodes || []);
        if (nm && nm.length <= 20) return '把 H1 改成「地區＋店名＋主要服務」的具體描述，例如：「（地區）｜' + nm + ' （主要服務）」，長度約 10–40 字。';
        return '把 H1 改成「地區＋店名＋主要服務」的具體描述，例如：高雄左營｜小方光影設計 商業攝影，長度約 10–40 字。';
      })() }));
    var h2 = hs.filter(function (h) { return h.tagName === 'H2'; }).length;
    var skip = false, empty = 0, prev = 0;
    hs.forEach(function (h) {
      var lv = parseInt(h.tagName.slice(1), 10);
      if (prev && lv > prev + 1) skip = true;
      prev = lv;
      if (!norm(h.textContent) && !h.querySelector('img[alt]')) empty++;
    });
    var probs = []; if (h2 < 2) probs.push('H2 只有 ' + h2 + ' 個（建議至少 2 個）'); if (skip) probs.push('標題層級有跳級（例如 H1 直接接 H3）'); if (empty) probs.push('有 ' + empty + ' 個空白標題');
    items.push(item({ id: 'f_levels', cat: 'F', title: '標題層級清楚（H2／H3 不跳級）', max: 4, status: probs.length === 0 ? 'pass' : (probs.length === 1 && h2 >= 1 ? 'warn' : 'fail'),
      note: probs.length ? probs.join('；') + '。' : '標題層級完整：H2 有 ' + h2 + ' 個，沒有跳級或空白標題。',
      why: 'AI 會用標題把長文切成一段段來理解與引用；層級混亂或缺標題，就切不出重點。',
      fix: '依序使用 H1 → H2 → H3，不要為了樣式跳級；每個大段落給一個 H2，移除空白標題。' }));
    return items;
  }

  // ═══════════════ llms.txt 加分 ═══════════════
  function checkLlms(ctx) {
    var l = ctx.llms || { status: 'unknown' };
    if (ctx.mode === 'html') return { status: 'unknown', bonus: 0, note: '你提供的是 HTML 原始碼，無法檢查網站根目錄的 llms.txt。' };
    var ok = l.status === 'ok' && l.text && !/<\s*(!doctype|html|head|body)\b/i.test(l.text.slice(0, 600)) && norm(l.text).length >= 50;
    if (ok) return { status: 'found', bonus: 3, note: '網站有 llms.txt（約 ' + norm(l.text).length + ' 字），額外加 3 分。' };
    if (l.status === 'unknown') return { status: 'unknown', bonus: 0, note: '沒能取得 llms.txt（可能是抓取服務被擋），這項加分暫不計。' };
    return { status: 'missing', bonus: 0, note: '網站根目錄沒有 llms.txt。這是選擇性加分項，不扣分；它是給 AI 看的網站導覽文字檔，但目前沒有主要 AI 業者保證會讀取它。' };
  }

  // ═══════════════ 主分析 ═══════════════
  /* ctx: { url, html, mode: 'url'|'html', robots: {status:'ok'|'none'|'unknown', text}, llms: {status, text} } */
  function analyze(ctx) {
    var doc = ctx.doc || new DOMParser().parseFromString(ctx.html || '', 'text/html');
    var extra = {};
    var nodes = jsonLdNodes(doc);
    var text = visibleText(doc);
    var items = [].concat(
      checkA(doc, ctx, extra), checkB(doc, extra), checkC(doc, extra, text, nodes),
      checkD(doc, extra, nodes, text), checkE(doc, ctx, extra, nodes, text), checkF(doc, nodes));

    var cats = CATS.map(function (c) {
      var its = items.filter(function (i) { return i.cat === c.id; });
      var counted = its.filter(function (i) { return i.counted; });
      return { id: c.id, name: c.name, hint: c.hint, max: c.max,
        countedMax: counted.reduce(function (s, i) { return s + i.max; }, 0),
        earned: counted.reduce(function (s, i) { return s + i.earned; }, 0),
        score: null };
    });
    cats.forEach(function (c) { c.score = c.countedMax ? Math.round(c.earned / c.countedMax * 100) : null; });
    var maxSum = cats.reduce(function (s, c) { return s + c.countedMax; }, 0);
    var earnedSum = cats.reduce(function (s, c) { return s + c.earned; }, 0);
    var base = maxSum ? Math.round(earnedSum / maxSum * 100) : null;
    var llms = checkLlms(ctx);
    var score = base == null ? null : Math.min(100, base + llms.bonus);
    var grade = score == null ? { key: 'na', label: '無法評分' } : (score >= 80 ? { key: 'good', label: '良好' } : (score >= 60 ? { key: 'fair', label: '普通' } : { key: 'poor', label: '需加強' }));

    // 問題清單：依失分多寡，同分時 A、C、B、D、F、E
    var issues = items.filter(function (i) {
      return !i.suppressIssue && (i.status === 'warn' || i.status === 'fail') && (i.issueLoss != null ? i.issueLoss > 0 : i.max - i.earned > 0);
    }).map(function (i, idx) {
      var loss = i.issueLoss != null ? i.issueLoss : Math.round((i.max - i.earned) * 10) / 10;
      return { id: i.id, cat: i.cat, title: i.title, status: i.status, loss: loss, note: i.note, why: i.why, fix: i.fix, _idx: idx };
    }).sort(function (a, b) { return (b.loss - a.loss) || (CAT_ORDER[a.cat] - CAT_ORDER[b.cat]) || (a._idx - b._idx); });
    issues.forEach(function (i) { i.level = i.loss >= 5 ? 'high' : (i.loss >= 2.5 ? 'medium' : 'low'); delete i._idx; });

    return {
      tool: 'geo', version: 1, url: ctx.url || '', mode: ctx.mode || 'url', scannedAt: new Date().toISOString(),
      score: score, baseScore: base, bonus: llms.bonus, grade: grade.key, gradeLabel: grade.label,
      needHelp: score != null && score < 80,
      categories: cats, items: items, issues: issues, llms: llms, extraBots: extra.extraBots || [],
      info: { robots: extra.robotsStatus, textLen: extra.textLen, spaShell: !!extra.spaShell, isArticle: !!extra.isArticle, metaBlock: !!extra.metaBlock },
      disclaimer: DISCLAIMER,
      // 與 SEO 工具報告相容的欄位，讓會員系統（前 3 大問題、修正清單）共用同一套程式
      actions: issues.map(function (i) { return { title: i.title, detail: (i.why || i.note).slice(0, 200), priority: i.level }; }),
      checks: items.filter(function (i) { return i.status === 'warn' || i.status === 'fail'; }).map(function (i) { return { title: i.title, status: i.status, detail: i.note }; })
    };
  }

  var GEO = { analyze: analyze, parseRobots: parseRobots, robotsCheck: robotsCheck, jsonLdNodes: jsonLdNodes, visibleText: visibleText, countWords: countWords, DISCLAIMER: DISCLAIMER, CATS: CATS, BOTS: BOTS, LINE_URL: 'https://line.me/R/ti/p/%40788cblaq' };
  if (typeof module !== 'undefined' && module.exports) module.exports = GEO;
  root.GEO = GEO;
})(typeof window !== 'undefined' ? window : this);
