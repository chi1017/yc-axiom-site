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
        d: '一頁式網站基本有 5 個段落（例如介紹、服務、作品、評價、聯絡）。想多放一段內容，就多加一個。適合：一頁式網站要放的內容比較多時。', d_en: 'A one-page site has 5 sections as standard (such as intro, services, work, reviews, contact). Add one for each extra section. Suits: One-page sites with more to say.' },
      { id: 'page', g: '規模', name: '增加頁面（每頁）', en: 'Extra page (each)', unit: 'qty', max: 20, p: { A: null, B: 1000, N: null },
        d: '多頁式網站基本 4 頁。想多一頁，例如作品集、常見問題、文章、隱私權政策，就多加一頁。適合：多頁式網站要放的內容比較多時。', d_en: 'A multi-page site has 4 pages as standard. Add one for each extra page, such as portfolio, FAQ, articles or privacy policy. Suits: Multi-page sites with more content.' },
      { id: 'rev', g: '規模', name: '多修改一次（每次）', en: 'Extra round of changes (each)', unit: 'qty', max: 5, p: { A: 500, B: 800, N: null },
        d: '基本可以修改 2 次。想再多調整幾輪版面或文字，就多加一次。適合：想反覆調整到滿意，或要給老闆、合夥人多看幾次的人。', d_en: '2 rounds of changes are included. Add a round for each extra round of layout or text changes. Suits: Anyone who wants more rounds of tweaks, or more people to review.' },
      { id: 'copy', g: '內容與設計', name: '文案撰寫與整理', en: 'Copywriting and editing', unit: 'once', p: { A: 1500, B: 3000, N: 1500 },
        d: '網站上的文字由我們來寫。先跟你聊聊你的店，再寫成客人看得懂、Google 也搜得到的介紹，你確認後才上線。沒勾的話，文字由你提供。適合：不知道網站要寫什麼，或沒時間寫的人。', d_en: 'We write the words on your site. We talk with you about your business first, then write it so customers understand and Google can find it, and nothing goes live until you approve. Without this, you supply the text. Suits: Anyone unsure what to write or short of time.' },
      { id: 'photo', g: '內容與設計', name: '照片挑選與修圖', en: 'Photo selection and retouching', unit: 'once', p: { A: 800, B: 1500, N: null },
        d: '從你給的照片裡挑出好的，統一顏色、裁切成適合網站的大小，並壓縮讓網站不會變慢。不含外出拍照。適合：手邊有很多照片，但不知道哪些適合放網站的人。', d_en: 'We pick the best of your photos, match their colours, crop them for the site and compress them so the site stays fast. Photo shoots are not included. Suits: Anyone with lots of photos who isn\'t sure which suit the site.' },
      { id: 'illus', g: '內容與設計', name: '客製插圖或圖示', en: 'Custom illustrations or icons', unit: 'once', p: { A: 1500, B: 2500, N: null },
        d: '依你的品牌風格畫一組專屬的小圖示或插圖，取代網路上常見的素材，讓網站一看就知道是你。適合：想讓網站更有個人特色、跟別家不一樣的品牌。', d_en: 'A set of icons or illustrations drawn in your brand style instead of common stock images, so the site is recognisably yours. Suits: Brands that want to stand out from the rest.' },
      { id: 'motion', g: '內容與設計', name: '開場動畫與進階捲動效果', en: 'Intro animation and scroll effects', unit: 'once', p: { A: 1500, B: 2500, N: null },
        d: '打開網站時的開場動畫、往下滑時內容一段段出現、數字跑動等效果，讓客人印象更深。基本的淡入效果已經包含。適合：重視第一印象的品牌，例如設計、精品、活動。', d_en: 'An opening animation, content that appears as you scroll, counting numbers and similar effects that make the site more memorable. Basic fade-ins are already included. Suits: Brands that care about first impressions, such as design, luxury or events.' },
      { id: 'en', g: '內容與設計', name: '中英雙語', en: 'Chinese and English versions', unit: 'once', p: { A: 2000, B: 4000, N: null },
        d: '多做一套英文版網站，右上角可以切換中英文，英文版也能被國外的 Google 搜到。英文內容可以你提供，或加購文案一起處理。適合：有外國客人、觀光客或海外合作的店家。', d_en: 'An English version of your site with a language switch, which overseas Google searches can also find. You can supply the English text or add copywriting. Suits: Businesses with foreign customers, tourists or overseas partners.' },
      { id: 'uiux1', g: '內容與設計', name: '單頁網站設計圖（Figma，不含製作）', en: 'One-page design (Figma, design only)', unit: 'once', p: { A: null, B: null, N: 3000 },
        d: '只做設計、不做網站：畫出一頁的網站設計圖，還能點點看怎麼操作，交給你的工程師照著做。適合：已經有工程師，只需要設計的公司。', d_en: 'Design only, no build: a one-page design you can click through to see how it works, ready for your own developer. Suits: Companies with their own developer who only need design.' },
      { id: 'uiux2', g: '內容與設計', name: '整站設計圖與操作流程（Figma，不含製作）', en: 'Full-site design and flows (Figma, design only)', unit: 'once', p: { A: null, B: null, N: 6000 },
        d: '只做設計、不做網站：整個網站每一頁的設計圖、怎麼從一頁到下一頁，以及按鈕、顏色等統一規範，交給你的團隊製作。適合：要自己開發 App 或大型網站的團隊。', d_en: 'Design only, no build: every page of the site, how pages connect, and shared rules for buttons and colours, ready for your team to build. Suits: Teams building their own app or larger site.' },
      { id: 'embed', g: '功能', name: '嵌入預約、地圖等外部服務', en: 'Embed booking, maps or other services', unit: 'once', p: { A: 500, B: 500, N: null },
        d: '把你已經在用的東西放進網站，例如預約系統、Google 地圖、表單或 YouTube 影片，並調成跟網站一樣的風格。適合：已經有預約系統或常用工具的店家。', d_en: 'We bring tools you already use into your site, such as a booking system, Google Maps, forms or YouTube videos, styled to match. Suits: Businesses already using a booking system or other tools.' },
      { id: 'form', g: '功能', name: '預約表單或表單分流', en: 'Booking form or routed forms', unit: 'once', p: { A: 1000, B: 1500, N: null },
        d: '在網站上做一個預約或詢問表單，客人填完送出，你的 Email 就會收到通知。服務多的話，可以依項目分成不同表單。適合：想讓客人直接在網站上預約或詢價的店家。', d_en: 'A booking or enquiry form on your site; when customers submit it, you get an email. With several services, it can split into different forms. Suits: Businesses that want bookings or enquiries straight from the site.' },
      { id: 'shop', g: '功能', name: '購物車與綠界金流（含 10 項商品）', en: 'Cart and ECPay checkout (10 products)', unit: 'once', p: { A: 4000, B: 5000, N: null },
        d: '讓客人直接在網站上買東西：商品頁、購物車、結帳，用綠界收信用卡或轉帳（台灣常見的收款服務），付款成功會自動通知你。含 10 項商品，需要先申請綠界帳號。適合：想在網站上直接賣商品的店家。', d_en: 'Customers can buy directly on your site: product pages, cart and checkout, with card or transfer payments through ECPay (a common Taiwanese payment service) and automatic notices when paid. 10 products included; an ECPay account is needed first. Suits: Businesses that want to sell products on their site.' },
      { id: 'sku', g: '功能', name: '增加商品（每 10 項）', en: 'More products (per 10)', unit: 'qty', max: 10, p: { A: 1000, B: 1000, N: null },
        d: '購物車基本可以放 10 項商品，每多 10 項加一次。適合：商品比較多的店家。', d_en: 'The shop includes 10 products; add this for every 10 more. Suits: Shops with more products.' },
      { id: 'pay', g: '功能', name: '多一種金流或物流（每種）', en: 'Extra payment or shipping method (each)', unit: 'qty', max: 4, p: { A: 2000, B: 2000, N: null },
        d: '多一種付款或寄送方式，例如 LINE Pay、超商取貨、宅配，每加一種算一次。適合：客人習慣用不同方式付款或取貨的店家。', d_en: 'One more payment or delivery option, such as LINE Pay, convenience-store pickup or home delivery, charged per option. Suits: Shops whose customers pay or collect in different ways.' },
      { id: 'coupon', g: '功能', name: '優惠碼', en: 'Discount codes', unit: 'once', p: { A: 1500, B: 1500, N: null },
        d: '可以設定折扣碼，例如「輸入 NEW100 折 100 元」、滿額折扣與使用期限，方便做活動。適合：常辦優惠活動的店家。', d_en: 'Set up discount codes (for example, enter NEW100 for NT$100 off), spend-and-save offers and expiry dates for promotions. Suits: Shops that run regular promotions.' },
      { id: 'member', g: '功能', name: '會員系統（Google 登入、會員專區）', en: 'Member system (Google sign-in, member area)', unit: 'once', p: { A: null, B: 5000, N: null },
        d: '客人用 Google 帳號一鍵登入，有自己的會員專區，可以設定只有會員才看得到的內容，付款後自動開通。適合：有課程、會員專屬內容或常客制度的品牌。', d_en: 'Customers sign in with Google in one click and get their own members\' area, with members-only content that unlocks automatically after payment. Suits: Brands with courses, members-only content or loyalty schemes.' },
      { id: 'feat', g: '功能', name: '客製功能（每項）', en: 'Custom feature (each)', unit: 'qty', max: 10, p: { A: 3000, B: 3000, N: 3000 },
        d: '版型裡沒有、你的生意特別需要的功能，例如上傳檔案並扣使用次數、老師專用後台、特殊預約規則。每一項功能算一次。適合：有特殊流程、現成網站做不到的店家。', d_en: 'A feature your business needs that the layouts don\'t have, such as uploads that use up credits, a teacher-only dashboard or special booking rules. Charged per feature. Suits: Businesses with special processes off-the-shelf sites can\'t handle.' },
      { id: 'ga', g: '功能', name: '網站流量與廣告追蹤（GA4／Meta Pixel）', en: 'Visitor and ad tracking (GA4 / Meta Pixel)', unit: 'once', p: { A: 1000, B: 1000, N: 1500 },
        d: '裝好 Google 的網站統計工具（GA4、Search Console）和 Facebook／IG 廣告追蹤，讓你知道客人從哪裡來、有多少人填表單、點 LINE 或下單。適合：想知道網站有沒有帶來客人，或有在下廣告的店家。', d_en: 'We set up Google\'s analytics tools (GA4, Search Console) and Facebook/Instagram ad tracking, so you can see where visitors come from and how many fill in forms, tap LINE or buy. Suits: Businesses that want to know whether the site brings customers, or that run ads.' },
      { id: 'cms', g: '功能', name: '內容管理後台（自己新增、修改內容）', en: 'Content management back office', unit: 'once', p: { A: 3000, B: 5000, N: null },
        d: '網站附一個管理後台，你自己就能新增或修改文字、照片、最新消息和作品，電腦、手機都能用，不用會寫程式。含帳號開通與操作教學。適合：內容常常要更新、不想每次都找人改的店家。', d_en: 'Your site comes with an admin panel where you can add or edit text, photos, news and projects yourself on a computer or phone, with no coding. Account setup and training included. Suits: Businesses that update content often and don\'t want to call someone each time.' },
      { id: 'sys', g: '功能', name: '串接現有系統或後台', en: 'Connect to your existing systems', unit: 'ask', p: { A: null, B: 0, N: 0 },
        d: '讓網站跟你現在用的系統互相連動，例如收銀機、庫存或會員系統。每套系統不同，要先看過才能報價。適合：已經有收銀、庫存或會員系統的店家。', d_en: 'Connect your site to systems you already use, such as your POS, stock or membership system. Every system differs, so we quote after looking at it. Suits: Businesses with existing POS, stock or membership systems.' },
      { id: 'seorep', g: 'SEO 與 AI 搜尋', name: 'SEO 網站健檢報告', en: 'SEO website check-up report', unit: 'once', p: { A: 2500, B: 2500, N: 2500 },
        d: '幫你的網站做一次完整健康檢查：速度快不快、手機好不好看、Google 有沒有收錄、標題寫得好不好，整理成一份報告，告訴你哪些要先修。決定重做網站時，報告費可全額折抵。適合：覺得網站怪怪的、Google 搜不到，但不知道問題在哪的人。', d_en: 'A full health check of your site: speed, mobile, whether Google has indexed it and how well titles are written, in a report that tells you what to fix first. Fully credited if you then choose a rebuild. Suits: Anyone whose site feels off or can\'t be found on Google, but isn\'t sure why.' },
      { id: 'seoopt', g: 'SEO 與 AI 搜尋', name: '網站 SEO 優化', en: 'SEO optimisation', unit: 'once', p: { A: null, B: null, N: 8000 },
        d: '依檢查結果實際動手修：讓網站變快、修好手機版、重寫每頁的標題與描述、整理網址，並處理 Google 沒收錄的頁面。新做的網站已包含基本 SEO，不用另外買。適合：已經有網站，但 Google 搜不太到的店家。', d_en: 'We actually make the fixes: faster pages, a working mobile layout, rewritten page titles and descriptions, tidy URLs, and pages Google hasn\'t indexed. New sites already include basic SEO. Suits: Businesses with a site that Google barely shows.' },
      { id: 'seo', g: 'SEO 與 AI 搜尋', name: '關鍵字策略與內容架構', en: 'Keyword strategy and content structure', unit: 'once', p: { A: 5000, B: 6000, N: 6000 },
        d: '先查出客人實際會在 Google 打哪些字，再規劃哪一頁對應哪些字，調整標題、內文和頁面之間的連結，讓對的客人搜得到你。適合：想在 Google 被更多潛在客人找到的店家。', d_en: 'We find the words customers actually type into Google, then plan which page answers which words and adjust titles, text and links between pages so the right people find you. Suits: Businesses that want more potential customers to find them on Google.' },
      { id: 'seogeo', g: 'SEO 與 AI 搜尋', name: 'SEO＋GEO 標準組合（既有網站）', en: 'SEO + GEO standard bundle (existing sites)', unit: 'once', p: { A: null, B: null, N: 15000 },
        d: '網站已經有了、但 SEO 不夠好時的組合：先把 SEO 地基修好，再做 GEO 完整套組，讓 Google 和 AI 都讀得懂你。比分開買省 NT$2,000。勾這項就不用再勾「網站 SEO 優化」和「GEO 完整套組」。適合：網站還能用、想一次把 Google 和 AI 都顧好的店家。', d_en: 'For existing sites whose SEO needs work: we fix the SEO foundations first, then do the full GEO bundle, so both Google and AI understand you. NT$2,000 less than separately. No need to tick SEO optimisation or the GEO bundle as well. Suits: Businesses whose site still works and want Google and AI covered in one go.' },
      { id: 'geopack', g: 'SEO 與 AI 搜尋', name: 'GEO 完整優化套組', en: 'Full GEO optimisation bundle', unit: 'once', p: { A: 9000, B: 9000, N: 9000 },
        d: 'GEO 就是讓 ChatGPT、Gemini 這些 AI 回答問題時，讀得懂你、願意提到你。套組把下面 8 件事一次做好，約 7 到 14 天，做完附修改前後的檢測分數。比單買省 NT$3,100。勾了套組就不用再勾單項。適合：想讓客人問 AI 時也能找到你的店家。', d_en: 'GEO helps AI tools like ChatGPT and Gemini understand you and mention you when they answer questions. The bundle covers all eight items below in about 7 to 14 days, with before-and-after scores. NT$3,100 less than buying separately. No need to tick the single items. Suits: Businesses that want to be found when customers ask AI.' },
      { id: 'geobot', g: 'SEO 與 AI 搜尋', name: 'GEO：讓 AI 讀得到你的網站', en: 'GEO: let AI read your site', unit: 'once', p: { A: 800, B: 800, N: 800 },
        d: 'AI 要先「讀得到」你的網站，才可能推薦你。我們檢查網站有沒有不小心擋住 ChatGPT 等 AI 來讀取，並依你的意願打開。適合：不確定 AI 讀不讀得到自己網站的人。', d_en: 'AI has to be able to read your site before it can recommend you. We check whether your site accidentally blocks AI tools like ChatGPT and open access as you prefer. Suits: Anyone unsure whether AI can read their site.' },
      { id: 'geollms', g: 'SEO 與 AI 搜尋', name: 'GEO：給 AI 的網站摘要（llms.txt）', en: 'GEO: site summary for AI (llms.txt)', unit: 'once', p: { A: 1000, B: 1000, N: 1000 },
        d: '寫一份專門給 AI 看的「網站重點摘要」，放在網站上：你是誰、賣什麼、在哪裡、哪些頁面最重要，讓 AI 不用自己猜。適合：希望 AI 介紹你時講得正確的店家。', d_en: 'A short summary of your site written for AI and placed on the site: who you are, what you offer, where, and which pages matter most, so AI doesn\'t have to guess. Suits: Businesses that want AI to describe them correctly.' },
      { id: 'geoschema', g: 'SEO 與 AI 搜尋', name: 'GEO：店家資料卡（結構化資料）', en: 'GEO: business data card (structured data)', unit: 'once', p: { A: 1500, B: 1500, N: 1500 },
        d: '在網站裡加上一段機器專用的「店家資料卡」，寫明店名、地址、電話、營業時間、服務與價格範圍。Google 和 AI 可以直接讀，比較不會寫錯你的資料。適合：常被搜尋到錯誤電話、錯誤時間的店家。', d_en: 'A machine-readable business card inside your site with your name, address, phone, hours, services and price range. Google and AI read it directly, so they get your details wrong less often. Suits: Businesses whose details often show up wrong in searches.' },
      { id: 'geofaq', g: 'SEO 與 AI 搜尋', name: 'GEO：常見問題 10 題', en: 'GEO: 10 FAQs', unit: 'once', p: { A: 2500, B: 2500, N: 2500 },
        d: '依客人真的會問的問題，寫 10 題常見問題放在網站上，每題第一句就是答案。客人問 AI 的本來就是問題，寫好的問答最容易被 AI 直接引用。適合：每天被客人問同樣問題的店家。', d_en: 'Ten FAQs based on questions customers really ask, each answered in the first sentence. People ask AI questions, so good Q&A is the easiest thing for AI to quote. Suits: Businesses that answer the same questions every day.' },
      { id: 'geonap', g: 'SEO 與 AI 搜尋', name: 'GEO：各平台店家資料統一', en: 'GEO: matching details on every platform', unit: 'once', p: { A: 1500, B: 1500, N: 1500 },
        d: '把你在網站、Google 地圖、Facebook、Instagram、LINE 上的店名、地址、電話、營業時間全部對過一次，不一致的協助改成一樣。資料越一致，AI 越敢推薦。適合：搬過家、換過電話，或各平台資料寫法不一樣的店家。', d_en: 'We check your name, address, phone and hours on your site, Google Maps, Facebook, Instagram and LINE, and help make them all match. The more consistent, the more confidently AI recommends you. Suits: Businesses that have moved, changed numbers or list details differently on each platform.' },
      { id: 'geogbp', g: 'SEO 與 AI 搜尋', name: 'GEO：Google 地圖商家資料優化', en: 'GEO: Google Maps business listing', unit: 'once', p: { A: 2000, B: 2000, N: 2000 },
        d: '整理你在 Google 地圖上的商家資料：類別、服務、介紹、照片和網站連結，並給你邀請客人留評論的 QR Code 與 LINE 訊息範本。在地搜尋和 AI 推薦都很看這份資料與評論。適合：有店面或服務地區，想在 Google 地圖被找到的店家。', d_en: 'We tidy your Google Maps business listing: category, services, description, photos and website link, plus a QR code and LINE message for asking customers to review you. Local search and AI rely heavily on this listing and its reviews. Suits: Businesses with a shopfront or service area that want to be found on Google Maps.' },
      { id: 'geoans', g: 'SEO 與 AI 搜尋', name: 'GEO：重點頁改成先講答案（每頁）', en: 'GEO: answer-first rewrite (per page)', unit: 'qty', max: 20, p: { A: 800, B: 800, N: 800 },
        d: '把重要頁面的開頭改成「先講答案」：兩三句話說清楚你是誰、在哪裡、適合誰、多少錢起。AI 摘錄時常常只取段落開頭。每改一頁算一次。適合：網站文字很多、但重點藏在後面的店家。', d_en: 'We rewrite the start of key pages to give the answer first: two or three sentences on who you are, where, who it suits and the starting price. AI often quotes only the start of a section. Charged per page. Suits: Sites with lots of text where the key points are buried.' },
      { id: 'geofact', g: 'SEO 與 AI 搜尋', name: 'GEO：品牌正確資料頁', en: 'GEO: brand facts page', unit: 'once', p: { A: 2000, B: 2000, N: 2000 },
        d: '做一頁「品牌正確資料」：成立時間、負責人、服務範圍、證照、得獎與媒體報導。AI 介紹你時有官方資料可以引用，比較不會說錯，或把你和同名的店搞混。適合：有同名店家，或常被介紹錯誤的品牌。', d_en: 'One page of correct brand facts: founding date, owner, service area, licences, awards and press. AI has an official source to quote, so it is less likely to get you wrong or confuse you with similar names. Suits: Brands with similar names or that are often described wrongly.' },
      { id: 'geomon', g: 'SEO 與 AI 搜尋', name: 'GEO：AI 提及月報', en: 'GEO: monthly AI mention report', unit: 'month', p: { A: 800, B: 800, N: 800 },
        d: '每個月用 10 個客人會問的問題，去問 ChatGPT、Gemini、Perplexity 和 Google 的 AI 摘要，記錄有沒有提到你、排第幾、參考了哪些網站，附截圖和建議。適合：做完 GEO 後，想知道 AI 實際有沒有推薦自己的店家。', d_en: 'Each month we ask ChatGPT, Gemini, Perplexity and Google AI Overviews 10 questions customers would ask, and record whether you\'re mentioned, where you rank and which sites they cite, with screenshots and advice. Suits: Businesses that have done GEO and want to know whether AI actually recommends them.' },
      { id: 'seoy', g: 'SEO 與 AI 搜尋', name: 'SEO／GEO 文章經營（年約）', en: 'SEO / GEO content programme (yearly)', unit: 'year', p: { A: 48000, B: 48000, N: 48000 },
        d: '一年鎖定 10 組客人會搜的關鍵字，每月幫你寫並發布 5 篇文章，同時寫給 Google 和 AI 看，並追蹤排名變化。無法保證排名或一定被 AI 推薦。適合：想靠文章長期累積被搜到的機會，但自己沒時間寫的店家。', d_en: 'A year targeting 10 keywords customers search for, with 5 articles written and published each month for both Google and AI, and ranking tracking. Rankings and AI recommendations can\'t be guaranteed. Suits: Businesses that want articles to build visibility over time but have no time to write.' },
      { id: 'domain', g: '網域與信箱', name: '網域代購與串接（網域年費另計）', en: 'Domain purchase and connection (domain fee extra)', unit: 'once', p: { A: 500, B: 500, N: 500 },
        d: '網域就是網站的地址，例如 yourshop.com.tw。我們用你的名義幫你買，並接到網站上，網域登記在你名下。網域每年的費用依註冊商價格另外付。適合：還沒有自己網址的店家。', d_en: 'A domain is your site\'s address, such as yourshop.com.tw. We buy it in your name and connect it to your site; it stays registered to you. The yearly domain fee is paid separately at the registrar\'s price. Suits: Businesses without their own web address yet.' },
      { id: 'dns', g: '網域與信箱', name: '網址設定（DNS）', en: 'Domain setup (DNS)', unit: 'once', p: { A: 1000, B: 1000, N: 1000 },
        d: '已經有網址，但不知道怎麼讓它連到新網站或信箱時，我們幫你把設定做好（DNS 就是網址的導航設定）。適合：有網址，但設定卡住的人。', d_en: 'If you already have a domain but don\'t know how to point it to your new site or email, we set it up for you (DNS is the address\'s routing settings). Suits: Anyone with a domain whose setup is stuck.' },
      { id: 'mail', g: '網域與信箱', name: '企業信箱設定（每個信箱）', en: 'Business email setup (each mailbox)', unit: 'qty', max: 10, p: { A: 500, B: 500, N: 500 },
        d: '幫你開一個用自己網址的信箱，例如 hello@yourshop.com.tw，看起來比免費信箱專業。使用 Google 的服務，月費由你直接付給 Google。每個信箱算一次。適合：想要專業信箱的店家或公司。', d_en: 'An email address on your own domain, such as hello@yourshop.com.tw, which looks more professional than a free address. It uses Google\'s service, and you pay Google\'s monthly fee directly. Charged per mailbox. Suits: Businesses that want a professional email address.' },
      { id: 'etl1', g: '數據與市場', name: '資料整理（單一來源）', en: 'Data clean-up (one source)', unit: 'once', p: { A: 2000, B: 2000, N: 2000 },
        d: '把你從某個平台匯出的資料（例如訂單、庫存、客戶名單）整理乾淨：刪重複、補格式、統一寫法，交給你一份可以直接用的表格。適合：資料亂七八糟、要花很多時間整理的店家。', d_en: 'We clean up data exported from one platform (such as orders, stock or customer lists): removing duplicates, fixing formats and making entries consistent, then give you a ready-to-use spreadsheet. Suits: Businesses with messy data that takes ages to tidy.' },
      { id: 'etl2', g: '數據與市場', name: '多來源資料整合與自動報表', en: 'Multi-source data merge and automatic reports', unit: 'once', p: { A: 5000, B: 5000, N: 5000 },
        d: '把兩個以上平台的資料合成一份報表，並寫好自動處理的小程式，下次只要放新檔案，報表就自動產生。適合：每個月都要手動合併好幾份資料的人。', d_en: 'We merge data from two or more platforms into one report and write a small program, so next time you just add new files and the report builds itself. Suits: Anyone who merges several data files by hand every month.' },
      { id: 'mkt1', g: '數據與市場', name: '競品分析報告（10 家內）', en: 'Competitor report (up to 10)', unit: 'once', p: { A: 8000, B: 8000, N: 8000 },
        d: '調查 10 家以內的競爭對手：價格、服務、網站和評價，整理成報告，找出你可以做得不一樣的地方。適合：想知道同業怎麼做、自己怎麼定價的店家。', d_en: 'We research up to 10 competitors, covering prices, services, websites and reviews, and report where you can stand out. Suits: Businesses wondering how competitors operate and how to price.' },
      { id: 'mkt2', g: '數據與市場', name: '深度產業掃描報告（20 家以上）', en: 'In-depth market scan (20+)', unit: 'once', p: { A: 15000, B: 15000, N: 15000 },
        d: '調查 20 家以上的同業，再加上市場缺口分析：哪些需求還沒人做好。適合：要開新品牌、新分店或調整定位時。', d_en: 'We research 20 or more businesses in your field and analyse market gaps: needs no one is meeting well yet. Suits: Anyone launching a new brand or branch, or repositioning.' },
      { id: 'host', g: '上線後（每年）', name: '主機代管', en: 'Managed hosting', unit: 'year', p: { A: 1800, B: 1800, N: 1800 },
        d: '網站要放在「主機」上，別人才看得到。我們幫你申請、設定和管理，含安全連線（網址前面的鎖頭）、加速與故障處理，主機開在你名下。也可以自己準備主機。適合：不想自己處理技術問題的店家。', d_en: 'A website needs hosting to be online. We set it up and manage it for you, including secure connections (the padlock by the address), speed-ups and fixing outages, in your name. You can also arrange your own hosting. Suits: Businesses that don\'t want to deal with technical issues.' },
      { id: 'backup', g: '上線後（每年）', name: '每日自動備份', en: 'Daily backups', unit: 'year', p: { A: 1800, B: 1800, N: 1800 },
        d: '每天自動幫網站存一份備份，保留 30 天。萬一出問題或改錯，可以還原到任何一天。適合：網站資料很重要、不能出錯的店家。', d_en: 'An automatic backup of your site every day, kept for 30 days. If something breaks or is changed by mistake, it can be restored to any day. Suits: Businesses whose site data matters too much to lose.' },
      { id: 'care', g: '上線後（每年）', name: '網站維護合約', en: 'Maintenance contract', unit: 'year', p: { A: 5400, B: 5400, N: 5400 },
        d: '上線後有人幫你照顧網站：改文字、換照片、修錯誤、回答技術問題，每月含 2 小時，超過另計。適合：沒有自己的工程師，又希望網站有人顧的店家。', d_en: 'Someone looks after your site after launch: editing text, changing photos, fixing errors and answering technical questions, with 2 hours a month included and extra time charged. Suits: Businesses without a developer that want their site looked after.' },
      { id: 'vis', g: '上線後（每月）', name: '在地能見度月約（6 個月起）', en: 'Local visibility plan (6-month minimum)', unit: 'month', p: { A: 3000, B: 3000, N: 3000 },
        d: '每個月幫你經營「在地被找到」這件事：Google 地圖商家貼 4 篇文、回覆評論、補 2 題常見問題、依排名資料調整頁面、檢查 AI 有沒有提到你，並寄月報給你。6 個月起。適合：想長期穩定被附近客人找到，但沒時間經營的店家。', d_en: 'Each month we work on helping local customers find you: 4 Google Maps posts, review replies, 2 new FAQs, page tweaks based on rankings, an AI mention check and a report. Six-month minimum. Suits: Businesses that want steady local visibility but have no time to manage it.' },
      { id: 'datam', g: '上線後（每月）', name: '商業資料月報', en: 'Monthly business data report', unit: 'month', p: { A: 800, B: 800, N: 800 },
        d: '每個月幫你整理訂單、庫存或帳務資料，自動做成 Excel 或 PDF 月報，數字不對勁時提醒你。適合：想每月看清楚營運數字，又不想自己做表的店家。', d_en: 'Each month we tidy your order, stock or accounts data into an Excel or PDF report, and flag anything that looks wrong. Suits: Businesses that want clear monthly numbers without building the reports.' }
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

