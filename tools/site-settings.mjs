// 官網「價格與活動」設定的共用邏輯（Node 建置與瀏覽器後台預覽共用，不依賴任何套件）。
// 設定來源：Supabase 資料表 site_settings（後台「價格與活動」分頁修改）。
// 建置時（tools/apply-settings.mjs）把頁面裡的 {{yc:名稱}} 換成實際文字，並產生 assets/rental-plan.js 的設定與公告列／卡片的 JSON。
// 規則：早鳥進行中顯示「早鳥價 NT$xxx／月（至 yyyy/m/d）」；早鳥結束只顯示一般價格。任何情況都不出現「原價」「特價」。
// 必須與 yc-axiom-sites 的 supabase/functions/_shared/pricing.mjs 的計算方式一致。

export const DEFAULTS = {
  prices: { single_month: 700, single_year: 7000, multi_month: 1000, multi_year: 10000, pro_month: 400, pro_year: 4000 },
  early: { enabled: true, single_month: 599, single_year: 5990, multi_month: 899, multi_year: 8990, deadline: '2027-02-03T23:59:00+08:00', quota: null },
  bar: { enabled: true, follow_early: true, text: '中小企業月租網站早鳥價 {早鳥價}／月，至 {截止日}', text_mobile: '早鳥價 {早鳥價}／月', button: '看方案 →', link: '/rental/', start: null, end: null, dismiss_days: 7 },
  display: { hide_prices: false, hide_contact: false, hide_contact_privacy: false },
  quote: {
    v: 3,
    note: '以上為線上試算金額，正式金額以報價單為準。',
    deposit: 30,
    plans: [
      { id: 'A', name: '一頁式網頁', en: 'One-page site', price: 3000, desc: '單頁滾動式・既有版型換成品牌配色・最多 5 個區塊・手機版・基本 SEO・修改 2 次', desc_en: 'Single scrolling page on a ready-made layout in your colours, up to 5 sections, mobile-ready, basic SEO, 2 rounds of changes' },
      { id: 'B', name: '多頁式網頁', en: 'Multi-page site', price: 7000, desc: '最多 4 頁（例如首頁、關於、服務、聯絡）・既有版型換成品牌配色・手機版・基本 SEO・修改 2 次', desc_en: 'Up to 4 pages (e.g. home, about, services, contact) on a ready-made layout in your colours, mobile-ready, basic SEO, 2 rounds of changes' },
      { id: 'N', name: '只要單項服務', en: 'Services only', price: 0, desc: '已經有網站，只需要 SEO、設計稿、文案、數據、網域或維護等服務', desc_en: 'You already have a site and only need SEO, design, copy, data, domain or maintenance' }
    ],
    items: [
      { id: 'sec', g: '規模', name: '增加區塊（每個）', en: 'Extra section (each)', unit: 'qty', max: 10, p: { A: 500, B: null, N: null },
        d: '一頁式基本 5 個區塊。每多一個區塊（例如作品集、團隊、價目表、客人評價）就加一個。', d_en: 'The one-page site includes 5 sections. Add one for each extra block, such as a portfolio, team, price list or reviews.' },
      { id: 'page', g: '規模', name: '增加頁面（每頁）', en: 'Extra page (each)', unit: 'qty', max: 20, p: { A: null, B: 1000, N: null },
        d: '多頁式基本 4 頁。每多一頁（例如作品集、常見問題、課程介紹、隱私權政策）就加一頁。', d_en: 'The multi-page site includes 4 pages. Add one for each extra page, such as a portfolio, FAQ, course page or privacy policy.' },
      { id: 'rev', g: '規模', name: '多修改一次（每次）', en: 'Extra round of changes (each)', unit: 'qty', max: 5, p: { A: 500, B: 800, N: null },
        d: '基本含 2 次修改。想多調整幾輪版面或內容時加購。', d_en: 'Two rounds of changes are included. Add more if you expect several rounds of layout or content edits.' },
      { id: 'copy', g: '內容與設計', name: '文案撰寫與整理', en: 'Copywriting and editing', unit: 'once', p: { A: 1500, B: 3000, N: 1500 },
        d: '我們依訪談整理品牌故事、服務特色與首頁文案，用客人會搜尋的說法寫，你確認後再上線。不勾的話由你提供文字。', d_en: 'We write your brand story, service highlights and homepage copy from an interview, in the words customers search for, and you approve it before launch. Leave it unticked if you will supply the text.' },
      { id: 'photo', g: '內容與設計', name: '照片挑選與修圖', en: 'Photo selection and retouching', unit: 'once', p: { A: 800, B: 1500, N: null },
        d: '從你提供的照片挑出適合的，統一調色、裁切與壓縮，讓網站好看又不拖慢速度。不含外拍。', d_en: 'We pick the best of your photos and colour-correct, crop and compress them. Photo shoots are not included.' },
      { id: 'illus', g: '內容與設計', name: '客製插圖或圖示', en: 'Custom illustrations or icons', unit: 'once', p: { A: 1500, B: 2500, N: null },
        d: '依品牌風格畫一組專屬圖示或插圖，取代通用素材，讓網站更有辨識度。', d_en: 'A set of icons or illustrations drawn in your brand style instead of stock graphics.' },
      { id: 'motion', g: '內容與設計', name: '開場動畫與進階捲動效果', en: 'Intro animation and scroll effects', unit: 'once', p: { A: 1500, B: 2500, N: null },
        d: '進站開場動畫、捲動時分段展開、數字跑動等效果，讓網站更有記憶點。基本進場效果已包含。', d_en: 'An intro animation, staged reveals and counting numbers as people scroll. Basic entrance motion is already included.' },
      { id: 'en', g: '內容與設計', name: '中英雙語', en: 'Chinese and English versions', unit: 'once', p: { A: 2000, B: 4000, N: null },
        d: '加一套英文版網頁，含語言切換與各自的 SEO 設定。英文內容可由你提供，或加購文案一起處理。', d_en: 'A full English version with a language switch and its own SEO setup.' },
      { id: 'uiux1', g: '內容與設計', name: '單頁 UI/UX 設計稿（Figma）', en: 'One-page UI/UX design (Figma)', unit: 'once', p: { A: null, B: null, N: 3000 },
        d: '只要設計、不含開發：一頁 Figma 設計稿與互動原型，可以交給你的工程師製作。', d_en: 'Design only: one Figma page with a clickable prototype your developers can build from.' },
      { id: 'uiux2', g: '內容與設計', name: '多頁 UI/UX 流程設計（Figma）', en: 'Multi-page UI/UX design (Figma)', unit: 'once', p: { A: null, B: null, N: 6000 },
        d: '只要設計、不含開發：整站頁面流程、元件規範與互動原型，適合要自己開發的團隊。', d_en: 'Design only: full page flows, a component guide and a prototype.' },
      { id: 'embed', g: '功能', name: '嵌入預約、地圖等外部服務', en: 'Embed booking, maps or other services', unit: 'once', p: { A: 500, B: 500, N: null },
        d: '把你已經在用的預約系統、Google 地圖、表單或影片放進網站，樣式調整成和網站一致。', d_en: 'Place the booking system, Google Map, form or video you already use into the site, styled to match.' },
      { id: 'form', g: '功能', name: '預約表單或表單分流', en: 'Booking form or routed forms', unit: 'once', p: { A: 1000, B: 1500, N: null },
        d: '依服務類型分成不同表單，或做一個預約表單，送出後通知到你的 Email。', d_en: 'Separate forms per service, or a booking form, with notifications sent to your email.' },
      { id: 'shop', g: '功能', name: '購物車與綠界金流（含 10 項商品）', en: 'Cart and ECPay checkout (10 products)', unit: 'once', p: { A: 4000, B: 5000, N: null },
        d: '商品頁、購物車與結帳，串接綠界（台灣常見的第三方金流），付款成功自動通知。需要先申請綠界商店帳號。', d_en: 'Product pages, cart and checkout connected to ECPay, with automatic payment notifications. You need your own ECPay merchant account.' },
      { id: 'sku', g: '功能', name: '增加商品（每 10 項）', en: 'More products (per 10)', unit: 'qty', max: 10, p: { A: 1000, B: 1000, N: null },
        d: '購物車基本含 10 項商品，每多 10 項加一次。', d_en: 'Checkout includes 10 products; add one for each extra 10.' },
      { id: 'pay', g: '功能', name: '多一種金流或物流（每種）', en: 'Extra payment or shipping method (each)', unit: 'qty', max: 4, p: { A: 2000, B: 2000, N: null },
        d: '例如加 LINE Pay、超商取貨、宅配。', d_en: 'For example LINE Pay, convenience-store pickup or home delivery.' },
      { id: 'coupon', g: '功能', name: '優惠碼', en: 'Discount codes', unit: 'once', p: { A: 1500, B: 1500, N: null },
        d: '可以設定折扣碼、滿額折扣與使用期限，方便做活動。', d_en: 'Discount codes, spend-and-save offers and expiry dates for promotions.' },
      { id: 'member', g: '功能', name: '會員系統（Google 登入、會員專區）', en: 'Member system (Google sign-in, member area)', unit: 'once', p: { A: null, B: 5000, N: null },
        d: '客人用 Google 帳號一鍵登入，有自己的會員專區，可以設定會員限定的內容，付款後自動開通。', d_en: 'Customers sign in with Google, get a member area, and can unlock member-only content automatically after paying.' },
      { id: 'feat', g: '功能', name: '客製功能（每項）', en: 'Custom feature (each)', unit: 'qty', max: 10, p: { A: 3000, B: 3000, N: 3000 },
        d: '版型沒有的功能，例如上傳檔案並扣除使用次數、店家或老師專用後台、特殊預約規則。每一項功能算一次。', d_en: 'Features the layouts don’t have, such as uploads that use up a plan’s credits, an owner or teacher dashboard, or special booking rules. Each feature counts once.' },
      { id: 'ga', g: '功能', name: 'GA4／Meta Pixel 轉化追蹤', en: 'GA4 / Meta Pixel conversion tracking', unit: 'once', p: { A: 1000, B: 1000, N: 1500 },
        d: '設定 Google Analytics 4、Search Console 與 Meta Pixel，追蹤表單送出、LINE 點擊、購買等動作。', d_en: 'Set up GA4, Search Console and Meta Pixel to track form submissions, LINE clicks and purchases.' },
      { id: 'cms', g: '功能', name: '內容管理後台（自己新增、修改內容）', en: 'Content management back office', unit: 'once', p: { A: 3000, B: 5000, N: null },
        d: '網站附一個網頁後台，你可以自己新增或修改文字、照片、最新消息與頁面內容，電腦、手機都能用，不用寫程式。含後台帳號開通與操作教學。', d_en: 'A web back office where you add or edit text, photos, news and page content yourself, on a computer or phone, with no code. Includes account setup and training.' },
      { id: 'sys', g: '功能', name: '串接現有系統或後台', en: 'Connect to your existing systems', unit: 'ask', p: { A: null, B: 0, N: 0 },
        d: '和你現有的 POS、ERP、庫存或會員系統串接，需要先看系統規格才能報價。', d_en: 'Connect with your POS, ERP, stock or membership system. We need to see the system first to quote.' },
      { id: 'seorep', g: 'SEO 與 AI 搜尋', name: 'SEO 檢測報告', en: 'SEO audit report', unit: 'once', p: { A: 2500, B: 2500, N: 2500 },
        d: '全站健康度掃描，包含關鍵字排名、頁面速度、Meta 設定、結構化資料等，並提供改善建議報告。', d_en: 'A full health scan covering rankings, speed, meta tags and structured data, with a report of recommended fixes.' },
      { id: 'seoopt', g: 'SEO 與 AI 搜尋', name: '網站 SEO 優化', en: 'SEO optimisation', unit: 'once', p: { A: null, B: null, N: 8000 },
        d: '依檢測結果執行優化，包含 Meta 標籤、標題結構、內部連結、網站速度與手機相容性。新網站已包含基本 SEO。', d_en: 'Fixes based on the audit: meta tags, headings, internal links, speed and mobile compatibility. New sites already include basic SEO.' },
      { id: 'seo', g: 'SEO 與 AI 搜尋', name: '關鍵字策略與內容架構', en: 'Keyword strategy and content structure', unit: 'once', p: { A: 5000, B: 6000, N: 6000 },
        d: '找出客人實際會搜尋的字，規劃哪一頁對應哪一組關鍵字，並調整標題、內文與內部連結。', d_en: 'Find the words customers actually search, map them to pages, and adjust titles, copy and internal links.' },
      { id: 'seoy', g: 'SEO 與 AI 搜尋', name: 'SEO／GEO 文章經營（年約）', en: 'SEO / GEO content programme (yearly)', unit: 'year', p: { A: 48000, B: 48000, N: 48000 },
        d: '一年鎖定 10 組關鍵字，每月撰寫並發布 5 篇文章，同時寫給 Google 和 ChatGPT、Gemini 等 AI 搜尋看（SEO＋GEO），並追蹤排名與成效。無法保證排名或被 AI 推薦。', d_en: 'A year targeting 10 keyword groups, with 5 articles written and published each month for both Google and AI search (SEO + GEO), plus ranking and results tracking. Rankings and AI recommendations cannot be guaranteed.' },
      { id: 'domain', g: '網域與信箱', name: '網域代購與串接（網域年費另計）', en: 'Domain purchase and connection (domain fee extra)', unit: 'once', p: { A: 500, B: 500, N: 500 },
        d: '幫你用你的名義買網域（例如 .com.tw）並接到網站。網域本身的註冊年費依註冊商價格另計，網域登記在你名下。', d_en: 'We buy a domain in your name (e.g. .com.tw) and connect it. The registry’s yearly fee is extra and the domain is registered to you.' },
      { id: 'dns', g: '網域與信箱', name: 'DNS 設定代管', en: 'DNS setup', unit: 'once', p: { A: 1000, B: 1000, N: 1000 },
        d: '已經有網域時，協助設定 A Record、CNAME 等指向，確保網域正確連到網站或信箱。', d_en: 'If you already have a domain, we set up A records, CNAMEs and other records so it points to your site or email.' },
      { id: 'mail', g: '網域與信箱', name: '企業信箱設定（每個信箱）', en: 'Business email setup (each mailbox)', unit: 'qty', max: 10, p: { A: 500, B: 500, N: 500 },
        d: '協助開通 Google Workspace 品牌信箱（例如 hello@你的網域）並完成設定。Google 的月費依官方價格，由你直接付給 Google。', d_en: 'We set up Google Workspace mailboxes on your domain. Google’s subscription is paid by you directly at Google’s price.' },
      { id: 'etl1', g: '數據與市場', name: '單次資料清洗（單一資料源）', en: 'One-off data clean-up (one source)', unit: 'once', p: { A: 2000, B: 2000, N: 2000 },
        d: '把一個平台匯出的訂單、庫存或客戶資料整理乾淨，交給你一份可以直接用的表格。', d_en: 'Clean one platform’s orders, stock or customer export into a usable spreadsheet.' },
      { id: 'etl2', g: '數據與市場', name: '多來源資料整合（含自動化腳本）', en: 'Multi-source data integration (with automation)', unit: 'once', p: { A: 5000, B: 5000, N: 5000 },
        d: '兩個以上平台的資料合併成一份報表，並寫好自動化腳本，下次放新檔案就能直接產出。', d_en: 'Merge data from two or more platforms into one report, with a script for next time.' },
      { id: 'mkt1', g: '數據與市場', name: '競品分析報告（10 家內）', en: 'Competitor report (up to 10)', unit: 'once', p: { A: 8000, B: 8000, N: 8000 },
        d: '整理 10 家以內競爭對手的價格、服務、網站與評價，找出你可以切入的差異點。', d_en: 'Compare up to 10 competitors on price, services, websites and reviews.' },
      { id: 'mkt2', g: '數據與市場', name: '深度產業掃描報告（20 家以上）', en: 'In-depth market scan (20+)', unit: 'once', p: { A: 15000, B: 15000, N: 15000 },
        d: '掃描 20 家以上同業，加上市場缺口分析，適合開新品牌、新據點或調整定位時使用。', d_en: 'A scan of 20+ businesses with a market-gap analysis.' },
      { id: 'host', g: '上線後（每年）', name: '主機代管', en: 'Managed hosting', unit: 'year', p: { A: 1800, B: 1800, N: 1800 },
        d: '由 YC 幫你申請、設定並管理網站主機，含 HTTPS 安全連線、CDN 加速、上線監控與主機問題處理，主機開在你的名下。不需要時也可以自己準備主機。', d_en: 'We set up and manage your site hosting, with HTTPS, CDN, uptime monitoring and hosting support. The hosting account is in your name; you can also use your own hosting.' },
      { id: 'backup', g: '上線後（每年）', name: '每日自動備份', en: 'Daily backups', unit: 'year', p: { A: 1800, B: 1800, N: 1800 },
        d: '每天自動備份網站資料，保留 30 天，發生問題時可以還原到任何一天。', d_en: 'Automatic daily backups kept for 30 days, restorable to any day.' },
      { id: 'care', g: '上線後（每年）', name: '網站維護合約', en: 'Maintenance contract', unit: 'year', p: { A: 5400, B: 5400, N: 5400 },
        d: '內容更新、程式錯誤修正與基本技術支援，每月含 2 小時服務時數，超過另計。', d_en: 'Content updates, bug fixes and basic support, with 2 hours a month included; extra time billed separately.' },
      { id: 'datam', g: '上線後（每月）', name: '商業資料月報', en: 'Monthly business data report', unit: 'month', p: { A: 800, B: 800, N: 800 },
        d: '每月整理訂單、庫存或帳務資料，自動產出 Excel／PDF 月報，數字異常時提醒你。', d_en: 'Each month we tidy orders, stock or accounts into an Excel/PDF report and flag anything unusual.' }
    ]
  },
  card: { enabled: true, follow_early: true, title: '早鳥價 {早鳥價}／月', body: '中小企業專屬月租網站，自己填內容就能上線', b1_text: '看方案', b1_link: '/rental/', b2_text: 'LINE 詢問', b2_link: 'https://line.me/R/ti/p/%40788cblaq', scroll_pct: 40, delay_sec: 10, pages: ['/', '/rental/', '/services/', '/pricing/', '/articles/*'], dismiss_days: 7, start: null, end: null }
};

// 卡片永遠不顯示的頁面（工具頁、編輯器、會員專區、後台）
export const CARD_NEVER = [/^\/seo\//, /^\/geo\//, /^\/tools\//, /^\/builder\//, /^\/dashboard\//, /^\/admin\//];

export const num = (n) => Number(n).toLocaleString('en-US');
export const money = (n) => 'NT$' + num(n);
const ms = (iso) => (iso ? Date.parse(iso) : NaN);

// ISO 時間 → 台灣日期「2027/2/3」
export function taipeiDate(iso) {
  const t = ms(iso); if (!Number.isFinite(t)) return '';
  const d = new Date(t + 8 * 3600 * 1000);
  return d.getUTCFullYear() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
}

// 補齊缺少的欄位（舊設定或部分設定）
export function normalize(s) {
  const o = s || {};
  return {
    prices: { ...DEFAULTS.prices, ...(o.prices || {}) },
    early: { ...DEFAULTS.early, ...(o.early || {}) },
    bar: { ...DEFAULTS.bar, ...(o.bar || {}) },
    card: { ...DEFAULTS.card, ...(o.card || {}), pages: Array.isArray(o.card && o.card.pages) ? o.card.pages : DEFAULTS.card.pages },
    display: { ...DEFAULTS.display, ...(o.display || {}) },
    quote: normQuote(o.quote)
  };
}

// 報價試算：價格只接受 0 以上整數（0＝已包含），null＝這個方案不提供
function normQuote(q) {
  const D = DEFAULTS.quote, IDS = D.plans.map((p) => p.id);
  // 第 3 版起改為「起價＋加購」的價格結構：舊版設定直接換成新的預設（訂金比例與說明保留）
  if (!q || !Array.isArray(q.plans) || !Array.isArray(q.items) || (Number(q.v) || 0) < D.v) return { ...JSON.parse(JSON.stringify(D)), ...(q && q.note != null ? { note: String(q.note).slice(0, 200) } : {}), ...(q && Number.isInteger(Number(q.deposit)) && Number(q.deposit) >= 0 && Number(q.deposit) <= 100 ? { deposit: Number(q.deposit) } : {}) };
  const int = (v) => (v === null || v === '' || v === undefined ? null : Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null);
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  // 舊版設定沒有「只要單項服務」：補上預設方案，舊項目在這個方案先不提供
  const oldItem = (x) => D.items.find((d) => d.id === x.id);
  return {
    v: D.v,
    note: str(q.note == null ? D.note : q.note, 200),
    deposit: Number.isInteger(Number(q.deposit)) && Number(q.deposit) >= 0 && Number(q.deposit) <= 100 ? Number(q.deposit) : D.deposit,
    plans: IDS.map((id) => { const x = q.plans.find((p) => p && p.id === id) || D.plans.find((p) => p.id === id); return { id, name: str(x.name, 40), en: str(x.en, 60), price: id === 'N' ? 0 : int(x.price) || 0, desc: str(x.desc, 120), desc_en: str(x.desc_en, 160), ...(x.off ? { off: true } : {}) }; }),
    items: q.items.filter((x) => x && x.name).slice(0, 60).map((x, i) => ({
      id: str(x.id || 'i' + i, 20), g: str(x.g, 20), name: str(x.name, 60), en: str(x.en, 80),
      unit: ['once', 'qty', 'month', 'year', 'ask'].includes(x.unit) ? x.unit : 'once', ...(x.unit === 'qty' ? { max: Math.min(50, Math.max(1, int(x.max) || 10)) } : {}),
      ...(x.excl ? { excl: str(x.excl, 20) } : {}),
      d: str(x.d == null ? (oldItem(x) || {}).d : x.d, 300), d_en: str(x.d_en == null ? (oldItem(x) || {}).d_en : x.d_en, 400),
      p: Object.fromEntries(IDS.map((k) => [k, int(x.p && k in x.p ? x.p[k] : (oldItem(x) ? oldItem(x).p[k] : null))]))
    }))
  };
}

// 早鳥是否進行中：開關打開、還沒過截止時間、名額（選填）還沒滿
export function earlyActive(s, now = new Date(), used = 0) {
  const e = normalize(s).early;
  if (!e.enabled) return false;
  if (!(now.getTime() <= ms(e.deadline))) return false;
  if (e.quota && used >= Number(e.quota)) return false;
  return true;
}

// 新客人目前適用的價格
export function effective(s, now = new Date(), used = 0) {
  const n = normalize(s), early = earlyActive(n, now, used);
  const src = early ? n.early : n.prices;
  return {
    early,
    until: taipeiDate(n.early.deadline),
    single: { month: src.single_month, year: src.single_year },
    multi: { month: src.multi_month, year: src.multi_year },
    pro: { month: n.prices.pro_month, year: n.prices.pro_year }
  };
}

// 「一次付 12 個月…」：年繳剛好等於整數個月時說「只收 N 個月」
export function yearPhrase(month, year, sep = '，') {
  const k = year / month;
  return Number.isInteger(k) && k < 12 ? '一次付 12 個月只收 ' + k + ' 個月' + sep + money(year) : '一次付 12 個月' + sep + money(year);
}
function yearRow(label, month, year) {
  const k = year / month;
  return label + '年繳（一次付 12 個月' + (Number.isInteger(k) && k < 12 ? '，只收 ' + k + ' 個月' : '') + '）';
}

// 條款版本：價格或早鳥條件改變時跟著變，客人下次發佈時要重新同意
export function termsVersion(s) {
  const n = normalize(s);
  const key = JSON.stringify([n.prices, n.early.single_month, n.early.single_year, n.early.multi_month, n.early.multi_year, n.early.deadline]);
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return '2026-11-v9-' + h.toString(36).slice(0, 6);
}

// 頁面裡 {{yc:名稱}} 對應的文字
export function tokens(s, eff) {
  const E = eff, sm = E.single.month, sy = E.single.year, mm = E.multi.month, my = E.multi.year;
  const label = (m) => (E.early ? '早鳥價 ' + money(m) + '／月（至 ' + E.until + '）' : '每月 ' + money(m));
  const labelHtml = (m) => (E.early ? '<strong>早鳥價 ' + money(m) + '／月</strong>（至 ' + E.until + '）' : '<strong>' + money(m) + '／月</strong>');
  const terms = (m) => (E.early ? '早鳥價每月新台幣 ' + num(m) + ' 元（至 ' + E.until + '）' : '每月新台幣 ' + num(m) + ' 元');
  const termsYear = (m, y) => { const k = y / m; return '一次付 12 個月' + (Number.isInteger(k) && k < 12 ? '只收 ' + k + ' 個月' : '') + '，即新台幣 ' + num(y) + ' 元'; };
  return {
    from: money(sm), multi_from: money(mm),
    single_label: label(sm), multi_label: label(mm),
    single_label_html: labelHtml(sm), multi_label_html: labelHtml(mm),
    single_year: money(sy), multi_year: money(my),
    single_year_phrase: yearPhrase(sm, sy), multi_year_phrase: yearPhrase(mm, my),
    single_year_phrase_sp: yearPhrase(sm, sy, ' '), multi_year_phrase_sp: yearPhrase(mm, my, ' '),
    single_year_row: yearRow('一頁版', sm, sy), multi_year_row: yearRow('多頁版', mm, my),
    pro_month: money(E.pro.month), pro_year: money(E.pro.year),
    single_month_num: String(sm), multi_month_num: String(mm), pro_month_num: String(E.pro.month),
    terms_single: terms(sm), terms_multi: terms(mm),
    terms_single_year: termsYear(sm, sy), terms_multi_year: termsYear(mm, my),
    terms_pro_month: num(E.pro.month), terms_pro_year: num(E.pro.year),
    terms_refund: '例如一頁版一次付 ' + num(sy) + ' 元、已使用 3 個月，退還 ' + num(sy) + ' − 3 × ' + num(sm) + ' = ' + num(Math.max(0, sy - 3 * sm)) + ' 元',
    terms_lock_note: E.early ? '早鳥價：在早鳥活動期間開始租用（第一次確認收款在活動期間內）的網站，之後續約、升級多頁版與加購進階功能，都維持當時的早鳥價格。'
      : '先前活動價格：在先前價格活動期間開始租用的網站，之後續約、升級多頁版與加購進階功能，都維持當時的價格。',
    terms_version: termsVersion(s),
    // 定價頁「月租試算」用的數字（放在 data 屬性；隱藏價錢時整個試算區塊會被移除）
    calc_data: esc(JSON.stringify({ sm, sy, mm, my, pm: E.pro.month, py: E.pro.year, early: !!E.early, until: E.until })),
    // 定價頁「報價試算」（客製網站）的方案與加購價格；隱藏價錢時整個區塊會被移除
    quote_data: esc(JSON.stringify(normalize(s).quote))
  };
}

// 英文版頁面（/en/）用的 {{yc:名稱}} 文字
export function tokensEn(s, eff) {
  const E = eff, sm = E.single.month, sy = E.single.year, mm = E.multi.month, my = E.multi.year;
  const label = (m) => (E.early ? 'early-bird ' + money(m) + '/month (until ' + E.until + ')' : money(m) + '/month');
  const labelHtml = (m) => (E.early ? '<strong>early-bird ' + money(m) + '/month</strong> (until ' + E.until + ')' : '<strong>' + money(m) + '/month</strong>');
  const yp = (m, y, sep) => { const k = y / m; return 'pay 12 months up front' + (Number.isInteger(k) && k < 12 ? ' for the price of ' + k : '') + sep + money(y); };
  const yr = (l, m, y) => { const k = y / m; return l + ' yearly (pay 12 months' + (Number.isInteger(k) && k < 12 ? ', charged for ' + k : '') + ')'; };
  const terms = (m) => (E.early ? 'early-bird NT$' + num(m) + ' per month (until ' + E.until + ')' : 'NT$' + num(m) + ' per month');
  const termsYear = (m, y) => { const k = y / m; return 'pay 12 months up front' + (Number.isInteger(k) && k < 12 ? ' and be charged for only ' + k : '') + ', i.e. NT$' + num(y); };
  return {
    ...tokens(s, eff),
    single_label: label(sm), multi_label: label(mm), single_label_html: labelHtml(sm), multi_label_html: labelHtml(mm),
    single_year_phrase: yp(sm, sy, ', '), multi_year_phrase: yp(mm, my, ', '), single_year_phrase_sp: yp(sm, sy, ' '), multi_year_phrase_sp: yp(mm, my, ' '),
    single_year_row: yr('One-page', sm, sy), multi_year_row: yr('Multi-page', mm, my),
    terms_single: terms(sm), terms_multi: terms(mm), terms_single_year: termsYear(sm, sy), terms_multi_year: termsYear(mm, my),
    terms_refund: 'For example, if you paid NT$' + num(sy) + ' for a one-page site for a year and used 3 months, the refund is ' + num(sy) + ' − 3 × ' + num(sm) + ' = NT$' + num(Math.max(0, sy - 3 * sm)),
    terms_lock_note: E.early ? 'Early-bird price: sites that start renting during the early-bird period (first payment confirmed within the period) keep the early-bird price for later renewals, multi-page upgrades and add-ons.'
      : 'Earlier promotional price: sites that started renting during an earlier promotion keep that price for later renewals, multi-page upgrades and add-ons.'
  };
}

const TOKEN_RE = /\{\{yc:([a-z_]+)\}\}/g;
export function render(text, tok) {
  return text.replace(TOKEN_RE, (m, k) => {
    if (!(k in tok)) throw new Error('未知的價格標記 ' + m);
    return tok[k];
  });
}
export const hasTokens = (text) => /\{\{yc:[a-z_]+\}\}/.test(text);

// 公告列與卡片文字裡可以用的變數
export function promoVars(s, eff) {
  const n = normalize(s);
  return { '{早鳥價}': money(n.early.single_month), '{多頁早鳥價}': money(n.early.multi_month), '{截止日}': taipeiDate(n.early.deadline), '{一頁版價}': money(eff.single.month), '{多頁版價}': money(eff.multi.month) };
}
// ── 隱藏所有價錢（後台開關）──
// 開啟時，建置官網會把頁面上的價格（含後台設定的租用價格與頁面寫死的客製報價）換成「價格請洽詢」，
// 並拿掉結構化資料裡的價格。條款、編輯器、會員專區、後台與範例頁不處理（付款與條款仍需要實際價格）。
export const PRICE_NOTE = '價格請洽詢';
export const PRICE_NOTE_EN = 'Price on request';
export const HIDE_EXEMPT = /^(en\/)?(terms|builder|dashboard|admin|demo|showcase|rental\/styles|tools\/website-check|learn\/ai-friendly-content)\//;
export const pricesHidden = (s) => !!normalize(s).display.hide_prices;
const AMT = 'NT\\$\\s?\\d[\\d,]*(?:\\s*[–\\-~]\\s*(?:NT\\$\\s?)?\\d[\\d,]*)?\\+?';
const ZH_RE = new RegExp('(?:(?:從|約)\\s*)?(?:一次付 ?12 ?個月(?:只收 ?\\d+ ?個月|加)?[，,]?\\s*)?(?:早鳥價\\s*)?(?:每月加?\\s*)?' + AMT + '(?:\\s*起)?(?:\\s*[／/]\\s*[月年])?(?:\\s*起)?', 'g');
const EN_RE = new RegExp('(?:pay 12 months up front(?: for the price of \\d+)?,?\\s*)?(?:(?:from|starting at|starts? at|about|around|add|for)(?:\\s|&nbsp;)+)?(?:early-bird\\s+)?\\+?' + AMT + '(?:\\s*\\/\\s*(?:month|year|mo|yr))?(?:\\s+(?:a|per)\\s+(?:month|year))?', 'gi');
export function hidePriceText(text, en) {
  const N = en ? PRICE_NOTE_EN : PRICE_NOTE;
  let t = String(text)
    // 結構化資料：拿掉非 0 的價格（免費工具的 0 元保留）
    .replace(/"price":\s*"[1-9]\d*",\s*"priceCurrency":\s*"TWD",?\s*/g, '')
    .replace(en ? EN_RE : ZH_RE, N);
  const q = N.replace(/[$]/g, '');
  const until = en ? new RegExp('(' + q + '(?:</strong>)?)\\s*\\(until [\\d/]+\\)', 'g') : new RegExp('(' + q + '(?:</strong>)?)\\s*（至\\s*[\\d/]+）', 'g');
  const dup1 = en ? new RegExp(q + '\\s*\\((?:or\\s*)?' + q + '[^)]*\\)', 'g') : new RegExp(q + '[；，、\\s]{0,3}（' + q + '）', 'g');
  const dup2 = new RegExp(q + '([；;，,、\\s]{1,3}|\\s*and\\s*)' + q, 'g');
  for (let i = 0; i < 3; i++) t = t.replace(until, '$1').replace(dup1, N).replace(dup2, N);
  if (!en) t = t.replace(/價格請洽詢的/g, '');   // 「另有每月 NT$499 起的網站租用」→「另有網站租用」
  return t;
}

// ── 關閉聯絡方式（後台開關）──
// 開啟時，建置官網會隱藏所有聯絡管道：選單「免費諮詢」、右側 LINE／IG／Threads 浮動按鈕、各頁「加 LINE」按鈕與諮詢區塊、
// 頁尾與內文的聯絡連結、聯絡頁的表單與聯絡資訊，並從結構化資料與 llms.txt 拿掉 Email、LINE、IG、Threads。
// 隱私權政策與條款（法規需要的聯絡窗口）、編輯器、會員專區、後台不處理。
export const CONTACT_EXEMPT = /^(en\/)?(builder|dashboard|admin|demo|rental\/styles)\//;
// 隱私權政策與條款：只關掉選單、浮動按鈕、頁尾等站務元件；政策內文的聯絡方式另由「隱私權政策的聯絡方式也關閉」控制
export const CONTACT_LEGAL = /^(en\/)?(privacy|terms)\//;
export const privacyContactHidden = (s) => { const d = normalize(s).display; return !!(d.hide_contact && d.hide_contact_privacy); };
const CHROME_CSS = '<style id="yc-no-contact">body .nav-right .nav-cta,.nav-cta,.mobile-cta,.mobile-social-a,.line-float,.social-float,.footer-status,.tab-line,.footer-nav a[href*="/contact"]{display:none!important}</style>';
export const contactHidden = (s) => !!normalize(s).display.hide_contact;
const CONTACT_A = 'a[href*="line.me"],a[href^="mailto:"],a[href^="tel:"],a[href*="instagram.com"],a[href*="threads.com"],a[href*="threads.net"],a[href*="/contact/"]:not(.lang-toggle),a[href$="/contact"]:not(.lang-toggle)';
const CONTACT_CSS = '<style id="yc-no-contact">body .nav-right .nav-cta,.nav-cta,.mobile-cta,.line-float,.social-float,.contact-grid,.footer-status,.seo-cta,.geo-cta,#cta.cta,' + CONTACT_A +
  ',.cta-banner:has(' + CONTACT_A + '),li:has(>' + CONTACT_A.split(',').join('),li:has(>') + '),.contact-info-item{display:none!important}' +
  '.yc-nc-note{margin:48px 0 0;font-size:17px;line-height:1.8;opacity:.85}</style>';
const CONTACT_WORDS = /788cblaq|ycaxiom@gmail\.com|axiomyc2026|axiom_yc|@ycaxiom|line\.me|threads\.(com|net)|instagram\.com/i;
function stripLd(o) {
  if (Array.isArray(o)) return o.map(stripLd).filter((x) => !(typeof x === 'string' && CONTACT_WORDS.test(x)));
  if (!o || typeof o !== 'object') return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'email' || k === 'telephone' || k === 'contactPoint') continue;
    if (typeof v === 'string' && CONTACT_WORDS.test(v) && /^(url|sameAs)$/.test(k)) continue;
    r[k] = stripLd(v);
  }
  return r;
}
export function hideContactHtml(html, en, mode, privacyToo) {
  if (mode === 'legal') {
    let t = String(html);
    if (/<\/head>/i.test(t) && !t.includes('id="yc-no-contact"')) t = t.replace(/<\/head>/i, CHROME_CSS + '\n</head>');
    if (privacyToo) {
      t = t.replace(/<li>(?:(?!<\/li>)[\s\S])*?(mailto:|line\.me)(?:(?!<\/li>)[\s\S])*?<\/li>/g, '')
        .replace(/<p>(?:(?!<\/p>)[\s\S])*?(mailto:|line\.me)(?:(?!<\/p>)[\s\S])*?<\/p>/g, '<p>' + (en ? 'Our contact channels are paused for now. They will be listed here again once they reopen.' : '目前暫停開放聯絡管道，恢復後會在這裡公布。') + '</p>')
        .replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (m, a, b, c) => { try { return a + JSON.stringify(stripLd(JSON.parse(b)), null, 2) + c; } catch (e) { return m; } });
    }
    return t;
  }
  let s = String(html).replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (m, a, b, c) => {
    try { return a + JSON.stringify(stripLd(JSON.parse(b)), null, 2) + c; } catch (e) { return m; }
  });
  if (/<\/head>/i.test(s) && !s.includes('id="yc-no-contact"')) s = s.replace(/<\/head>/i, CONTACT_CSS + '\n</head>');
  // 表頭與手機選單的「免費諮詢」按鈕整個拿掉（只靠 CSS 隱藏時，手機版表頭的樣式會把空按鈕又顯示出來）
  s = s.replace(/<a\b[^>]*class="[^"]*\b(nav-cta|mobile-cta)\b[^"]*"[^>]*>[\s\S]*?<\/a>/g, '');
  s = scrubInvites(s, en);
  // 文字被拿掉後只剩空殼的聯絡連結也一併拿掉
  s = s.replace(/<a\b[^>]*href="[^"]*(?:line\.me|mailto:|tel:|instagram\.com|threads\.(?:com|net)|\/contact\/?|#contact)[^"]*"[^>]*>\s*<\/a>/g, '');
  // 聯絡頁：表單與聯絡資訊隱藏，改放一段說明
  if (s.includes('<div class="contact-grid"')) {
    const h = en ? 'Inquiries are paused for now.' : '目前暫停接受諮詢.';
    s = s.replace(/<title>[\s\S]*?<\/title>/, '<title>' + (en ? 'Contact YC AXIOM' : '聯絡 YC AXIOM') + '</title>');
    s = s.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/, (m, at) => '<h1' + at.replace(/\s*data-original="[^"]*"/g, '') + ' data-original="' + h + '">' + h + '</h1>')
      .replace(/(<div class="contact-grid")/, '<p class="yc-nc-note">' + (en ? 'Feel free to browse our work and articles.' : '歡迎先參考作品集與文章。') + '</p>\n$1');
  }
  return s;
}
// 內文裡「用 LINE 問我們」「聯絡我們協助」這類邀請聯絡的句子整句拿掉（只處理標籤之間的文字，不動程式與結構化資料）
const INVITE_ZH = /(用|加|傳|透過|先|直接)\s*LINE.{0,10}(我們|問|聊|說明|聯絡|告訴|進行|詢問)|LINE\s*(傳|問|聊|聯絡)|聯絡我們|免費諮詢|免費評估|歡迎.{0,6}(詢問|來信|聯絡)/;
const INVITE_EN = /\b(message|contact|reach|ask|tell|email) us\b|\b(via|on|over) LINE\b|\badd (us on )?LINE\b|free (consultation|assessment|quote)/i;
function dropInvites(text, en) {
  const re = en ? INVITE_EN : INVITE_ZH;
  if (!re.test(text)) return text;
  const parts = en ? text.split(/(?<=[.!?])(\s+)/) : text.match(/[^。！？]*[。！？]?/g) || [text];
  return parts.filter((x) => !re.test(x)).join('');
}
function scrubInvites(html, en) {
  // 「歡迎先用 LINE 或<a>聯絡表單</a>詢問。」這種句子中間夾連結
  html = html.replace(/[^。>]*(用|加)\s*LINE\s*或\s*<a[^>]*>[^<]*<\/a>[^。<]*。/g, '');
  // 網頁標題（<title>）不動：「聯絡我們｜YC AXIOM」被整句拿掉會變成沒有標題
  return html.split(/(<title>[\s\S]*?<\/title>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<[^>]+>)/).map((t, i) => (i % 2 ? t : dropInvites(t, en))).join('');
}
export function hideContactText(text) {
  return String(text).split('\n').filter((l) => !CONTACT_WORDS.test(l)).join('\n');
}

const fill = (t, v) => String(t || '').replace(/\{[^{}]+\}/g, (m) => (m in v ? v[m] : m));

// 建置時寫成 assets/site-promo.json 的內容；前端顯示前再檢查一次開始與結束時間
export function promo(s, eff, now = new Date()) {
  const n = normalize(s), v = promoVars(n, eff);
  // 隱藏價錢時，公告列與卡片（內容多半是價格）一併不顯示
  const live = (x) => !n.display.hide_prices && !!x.enabled && (!x.follow_early || eff.early) && !(x.end && now.getTime() > ms(x.end));
  const id = (x) => { const k = JSON.stringify(x); let h = 5381; for (let i = 0; i < k.length; i++) h = (Math.imul(h, 33) ^ k.charCodeAt(i)) >>> 0; return h.toString(36); };
  const bar = { show: live(n.bar), text: fill(n.bar.text, v), text_mobile: fill(n.bar.text_mobile || n.bar.text, v), button: fill(n.bar.button, v), link: n.bar.link || '', start: n.bar.start || null, end: n.bar.end || null, dismiss_days: Number(n.bar.dismiss_days) || 0 };
  const noC = !!n.display.hide_contact && CONTACT_WORDS.test(String(n.card.b2_link || ''));
  const card = { show: live(n.card), title: fill(n.card.title, v), body: fill(n.card.body, v), b1_text: fill(n.card.b1_text, v), b1_link: n.card.b1_link || '', b2_text: noC ? '' : fill(n.card.b2_text, v), b2_link: noC ? '' : n.card.b2_link || '', scroll_pct: Number(n.card.scroll_pct) || 0, delay_sec: Number(n.card.delay_sec) || 0, pages: n.card.pages, start: n.card.start || null, end: n.card.end || null, dismiss_days: Number(n.card.dismiss_days) || 0 };
  bar.id = id(bar); card.id = id(card);   // 內容改變時 id 會變，客人之前的「關閉」只對舊內容有效
  return { bar, card };
}

// 每日檢查用：目前狀態（早鳥／公告列／卡片是否進行中）
export function stateOf(s, now = new Date(), used = 0) {
  const eff = effective(s, now, used), p = promo(s, eff, now);
  return { early: eff.early, bar: p.bar.show, card: p.card.show };
}

// assets/rental-plan.js 內嵌的設定（編輯器、會員專區、後台確認收款用）
export function planSettings(s, eff) {
  const n = normalize(s);
  return {
    early: eff.early, until: eff.until,
    single: eff.single, multi: eff.multi, pro: eff.pro,
    regular: { single: { month: n.prices.single_month, year: n.prices.single_year }, multi: { month: n.prices.multi_month, year: n.prices.multi_year } },
    terms_version: termsVersion(n)
  };
}

// 卡片在這一頁要不要出現（後台的頁面清單；結尾 * 代表底下所有頁面）
export function cardAllowed(pages, path) {
  if (CARD_NEVER.some((re) => re.test(path))) return false;
  return (pages || []).some((p) => (p.endsWith('*') ? path.startsWith(p.slice(0, -1)) : path === p || path === p + 'index.html'));
}

// 頂部公告列的 HTML（建置時插入每個公開頁面；後台預覽也用同一份）
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function barHead(bar) {
  const cfg = JSON.stringify({ id: bar.id, start: bar.start, end: bar.end, days: bar.dismiss_days });
  return `<style id="yc-bar-css">:root{--yc-bar-h:0px}html.has-yc-bar{--yc-bar-h:40px}@media(max-width:768px){html.has-yc-bar{--yc-bar-h:38px}}
.yc-bar{display:none}html.has-yc-bar .yc-bar{display:flex;position:fixed;top:0;left:0;right:0;height:var(--yc-bar-h);z-index:70;align-items:center;justify-content:center;background:#B59B6A;color:#14120f;font:600 14px/1.2 "Instrument Sans","Noto Sans TC",system-ui,sans-serif;padding:0 48px}
html.has-yc-bar body{padding-top:var(--yc-bar-h)}html.has-yc-bar body>nav{top:var(--yc-bar-h)}html.has-yc-bar #scroll-progress{top:var(--yc-bar-h)}
.yc-bar a{color:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:12px;min-height:100%;max-width:100%;white-space:nowrap;overflow:hidden}
.yc-bar-t{overflow:hidden;text-overflow:ellipsis}.yc-bar-tm{display:none}.yc-bar-b{border-bottom:1.5px solid currentColor;flex:none}
.yc-bar a:focus-visible,.yc-bar-x:focus-visible{outline:2px solid #14120f;outline-offset:2px}
.yc-bar-x{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:40px;height:40px;border:0;background:none;color:inherit;font-size:22px;line-height:1;cursor:pointer}
@media(max-width:768px){.yc-bar{font-size:13px;padding:0 44px 0 12px}.yc-bar-td{display:none}.yc-bar-tm{display:inline}}</style>
<script>(function(){var B=${cfg};var n=Date.now();if(B.start&&n<Date.parse(B.start))return;if(B.end&&n>Date.parse(B.end))return;try{var v=JSON.parse(localStorage.getItem('yc-promo-bar')||'null');if(v&&v.id===B.id&&n-v.t<B.days*864e5)return}catch(e){}document.documentElement.classList.add('has-yc-bar')})();</script>`;
}
export function barBody(bar) {
  return `<div class="yc-bar" id="yc-bar" role="region" aria-label="優惠公告"><a href="${esc(bar.link)}" data-yc-promo="bar"><span class="yc-bar-t yc-bar-td">${esc(bar.text)}</span><span class="yc-bar-t yc-bar-tm">${esc(bar.text_mobile)}</span>${bar.button ? `<span class="yc-bar-b">${esc(bar.button)}</span>` : ''}</a><button type="button" class="yc-bar-x" aria-label="關閉優惠公告">×</button></div>
<script>(function(){var r=document.documentElement,b=document.getElementById('yc-bar');if(!b)return;var D=${Number(bar.dismiss_days) || 0},ID=${JSON.stringify(bar.id)};function ga(e){try{if(window.gtag)gtag('event',e,{placement:'bar'})}catch(x){}}
if(r.classList.contains('has-yc-bar'))ga('early_bird_view');
function close(){r.classList.remove('has-yc-bar');try{localStorage.setItem('yc-promo-bar',JSON.stringify({id:ID,t:Date.now()}))}catch(x){}ga('early_bird_close')}
b.querySelector('.yc-bar-x').addEventListener('click',close);b.querySelector('a').addEventListener('click',function(){ga('early_bird_click')});
b.addEventListener('keydown',function(e){if(e.key==='Escape'){close();var m=document.querySelector('main');if(m){m.setAttribute('tabindex','-1');m.focus({preventScroll:true})}}});})();</script>`;
}

