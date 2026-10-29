/* YC AXIOM 會員系統：登入、同意、儲存檢測（共用於 seo-tool.html、/seo/、dashboard、admin）
   依賴：assets/supabase-config.js、assets/vendor/supabase-*.min.js */
(function () {
  'use strict';
  var CFG = window.YC_CONFIG || {};
  var CONSENT_VERSION = '2026-10-15-v1';
  var CONSENT_TEXT = '我同意 YC AXIOM 保存我的檢測紀錄，並寄送檢測報告與網站改善建議';
  var LINE_URL = 'https://line.me/R/ti/p/%40788cblaq';
  var listeners = [];
  var YC = window.YC = {
    enabled: !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase),
    client: null, session: null, member: null,
    CONSENT_VERSION: CONSENT_VERSION, LINE_URL: LINE_URL,
    features: CFG.features || {}
  };

  // ── 網站根目錄（頁面可先設定 window.YC_BASE，如 "../../"）──
  function baseUrl() { return new URL(window.YC_BASE || './', location.href); }
  YC.url = function (p) { return new URL(p, baseUrl()).href; };

  // ── 初始化 ──
  YC.init = function () {
    if (!YC.enabled) { if (!YC.ready) setTimeout(function () { emit('INIT'); }, 0); return null; }   // 未啟用：仍通知頁面「已就緒」，讓會員專區／管理後台顯示未開放，而不是一直載入中
    if (YC.client) return YC.client;
    YC.client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      // 嵌在 iframe 裡的工具不處理登入回傳（Google 登入一律回到外層頁面），也避免和外層重複兌換同一個登入碼
      auth: { flowType: 'pkce', detectSessionInUrl: window.parent === window, persistSession: true, autoRefreshToken: true }
    });
    YC.client.auth.onAuthStateChange(function (ev, session) {
      YC.session = session || null;
      // 注意：不可在此 callback 內直接 await supabase 呼叫（會死鎖），用 setTimeout 跳出
      setTimeout(function () { YC.refreshMember().then(function () { emit(ev); }); }, 0);
    });
    YC.client.auth.getSession().then(function (r) {
      YC.session = (r.data && r.data.session) || null;
      return YC.refreshMember();
    }).then(function () { emit('INIT'); });
    return YC.client;
  };
  YC.onChange = function (cb) { listeners.push(cb); if (YC.ready) cb('INIT'); };
  function emit(ev) {
    YC.ready = true;
    listeners.forEach(function (cb) { try { cb(ev, YC); } catch (e) { console.error(e); } });
    // 把狀態變化通知同源 iframe（SEO 工具嵌在 /seo/ 內）
    try { Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (f) { if (f.contentWindow) f.contentWindow.postMessage({ type: 'yc-auth', ev: ev }, location.origin); }); } catch (e) {}
    // 清掉 OAuth 回來時網址上的 code / error 參數
    if (YC.session && /[?&](code|error)=/.test(location.search)) { try { history.replaceState(null, '', location.pathname + location.hash.replace(/^#access_token.*/, '')); } catch (e) {} }
  }
  // iframe 內：收到父頁通知後重新讀取登入狀態
  YC.reload = async function () {
    if (!YC.client) return;
    var r = await YC.client.auth.getSession();
    YC.session = (r.data && r.data.session) || null;
    await YC.refreshMember(); emit('RELOAD');
  };
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'yc-auth' || window.parent === window) return;
    YC.reload().catch(function () {});
  });
  // 在 iframe 內時，登入 / 同意視窗交給父頁顯示（iframe 很高，視窗會跑到畫面外）
  function parentYC() {
    try { if (window.parent !== window && window.parent.YC && window.parent.YC !== YC && window.parent.YC.enabled) return window.parent.YC; } catch (e) {}
    return null;
  }

  YC.refreshMember = async function () {
    YC.member = null;
    if (!YC.client || !YC.session) return null;
    try {
      var r = await YC.client.from('members').select('id,email,provider,consented_at,consent_version').eq('id', YC.session.user.id).maybeSingle();
      YC.member = r.data || null;
    } catch (e) { console.warn('refreshMember', e); }
    return YC.member;
  };
  YC.loggedIn = function () { return !!YC.session; };
  YC.consented = function () { return !!(YC.member && YC.member.consented_at); };
  YC.isAdmin = function () {
    var m = YC.session && YC.session.user && YC.session.user.app_metadata;
    return !!(m && m.role === 'admin');
  };

  // ── 登入 ──
  function returnUrl() {
    // 影像嵌在 /seo/ 的 iframe 內時，回到父頁（同源）；否則回到目前頁面
    try { var t = window.top.location; return t.origin + t.pathname; } catch (e) { return location.origin + location.pathname; }
  }
  YC.signInWithGoogle = async function () {
    if (!YC.client) throw new Error('會員功能尚未啟用');
    // prompt=select_account：每次都讓 Google 顯示帳號選擇畫面，手機或電腦登入多個 Google 帳號時可以選要用哪一個
    var r = await YC.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl(), skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
    if (r.error) throw r.error;
    (window.top || window).location.href = r.data.url;   // Google 不允許在 iframe 內開啟，必須整頁跳轉
  };
  // 切換 Google 帳號：直接開 Google 帳號選擇畫面，選好後回到這一頁，換成新帳號的登入狀態（不會刪除任何資料）
  YC.switchAccount = function () { return YC.signInWithGoogle(); };
  YC.signInWithEmail = async function (email) {
    if (!YC.features.magicLink) throw new Error('Email 魔法連結尚未開放');
    var r = await YC.client.auth.signInWithOtp({ email: email, options: { emailRedirectTo: returnUrl(), shouldCreateUser: true } });
    if (r.error) throw r.error;
  };
  // 信中的驗證碼登入：換瀏覽器或手機信件 App 內開連結而失敗時的備援
  YC.verifyEmailOtp = async function (email, token) {
    if (!YC.features.magicLink) throw new Error('Email 登入尚未開放');
    var r = await YC.client.auth.verifyOtp({ email: email, token: String(token).trim(), type: 'email' });
    if (r.error) throw r.error;
  };
  YC.signOut = async function () { if (YC.client) await YC.client.auth.signOut(); YC.session = null; YC.member = null; emit('SIGNED_OUT'); };

  // ── 同意 / 刪除帳號 ──
  YC.acceptConsent = async function () {
    var r = await YC.client.rpc('accept_consent', { p_version: CONSENT_VERSION });
    if (r.error) throw r.error;
    await YC.refreshMember(); emit('CONSENTED');
  };
  YC.deleteAccount = async function () {
    var r = await YC.client.functions.invoke('delete-account', { body: { confirm: true } });
    if (r.error) throw r.error;
    // 帳號已在伺服器刪除：只清本機登入狀態（不再向伺服器登出）
    try { await YC.client.auth.signOut({ scope: 'local' }); } catch (e) {}
    YC.session = null; YC.member = null; emit('SIGNED_OUT');
  };

  // ── URL 正規化 / 前 3 大問題 / 儲存 ──
  YC.normalizeUrl = function (u) {
    try {
      var x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u);
      var path = x.pathname.replace(/\/+$/, '');
      return (x.protocol + '//' + x.host.toLowerCase() + path).slice(0, 2000);
    } catch (e) { return null; }
  };
  YC.topIssues = function (r, n) {
    n = n || 3; var out = [], seen = {};
    var rank = { high: 0, medium: 1, mid: 1, low: 2 };
    var acts = (r.actions || []).slice().sort(function (a, b) { return (rank[a.priority] != null ? rank[a.priority] : 3) - (rank[b.priority] != null ? rank[b.priority] : 3); });
    acts.forEach(function (a) { if (out.length < n && a.title && !seen[a.title]) { seen[a.title] = 1; out.push({ title: String(a.title).slice(0, 120), detail: String(a.detail || '').slice(0, 240), level: a.priority || 'medium' }); } });
    ['fail', 'warn'].forEach(function (s) {
      (r.checks || []).forEach(function (c) { if (out.length < n && c.status === s && c.title && !seen[c.title]) { seen[c.title] = 1; out.push({ title: String(c.title).slice(0, 120), detail: String(c.detail || '').slice(0, 240), level: s === 'fail' ? 'high' : 'medium' }); } });
    });
    return out;
  };
  // 完整問題清單（修正清單用）：actions 依優先度，再補 fail / warn 檢查項；以標題為 key
  YC.issueKey = function (t) { return String(t || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120); };
  // type = 'geo' 時 key 加上 "geo:" 前綴：同一個網站的 SEO／AI 可見度共用 sites.fixed_issues，前綴避免兩邊同名項目互相覆蓋
  YC.issueList = function (r, type) {
    var out = [], seen = {}, pre = type === 'geo' ? 'geo:' : '';
    var rank = { high: 0, medium: 1, mid: 1, low: 2 };
    var acts = ((r && r.actions) || []).slice().sort(function (a, b) { return (rank[a.priority] != null ? rank[a.priority] : 3) - (rank[b.priority] != null ? rank[b.priority] : 3); });
    function add(title, detail, level) {
      var k = pre + YC.issueKey(title); if (!YC.issueKey(title) || seen[k]) return; seen[k] = 1;
      out.push({ key: k, title: String(title).slice(0, 120), detail: String(detail || '').slice(0, 300), level: level || 'medium' });
    }
    acts.forEach(function (a) { if (a.title) add(a.title, a.detail, a.priority); });
    ['fail', 'warn'].forEach(function (st) {
      ((r && r.checks) || []).forEach(function (c) { if (c.status === st && c.title) add(c.title, c.detail, st === 'fail' ? 'high' : 'medium'); });
    });
    return out;
  };
  function slimReport(r) {
    var copy = {}; Object.keys(r).forEach(function (k) { if (k !== '_rawHtml' && k !== '_compReport') copy[k] = r[k]; });
    var s = JSON.stringify(copy);
    if (s.length > 1500000) {
      copy = { score: r.score, scoreTitle: r.scoreTitle, summary: r.summary, metrics: r.metrics, checks: r.checks, actions: r.actions, info: r.info, pass: r.pass, warn: r.warn, fail: r.fail };
    }
    return JSON.parse(JSON.stringify(copy));
  }
  // type：'seo'（預設）或 'geo'。seo 不送 type 欄位，由資料庫預設值 'seo' 補上（資料庫尚未升級時也能運作）
  YC.saveScan = async function (rawUrl, report, type) {
    type = type === 'geo' ? 'geo' : 'seo';
    if (report == null || report.score == null || !isFinite(report.score)) throw new Error('沒有可儲存的分數');
    var url = YC.normalizeUrl(rawUrl);
    if (!url) throw new Error('網址格式不正確');
    var uid = YC.session.user.id, c = YC.client;
    var s = await c.from('sites').select('id,fixed_issues').eq('member_id', uid).eq('url', url).maybeSingle();
    var siteId = s.data && s.data.id;
    var fixed = (s.data && s.data.fixed_issues) || {};
    if (!siteId) {
      var ins = await c.from('sites').insert({ member_id: uid, url: url }).select('id').single();
      if (ins.error) throw ins.error;
      siteId = ins.data.id;
    }
    var row = { site_id: siteId, score: Math.max(0, Math.min(100, Math.round(report.score))), top_issues: YC.topIssues(report, 3), report: slimReport(report) };
    if (type === 'geo') row.type = 'geo';
    var sc = await c.from('scans').insert(row).select('id').single();
    if (sc.error) throw sc.error;
    // 重新檢測後仍有問題的項目，取消「已修正」打勾
    try {
      var present = {}; YC.issueList(report, type).forEach(function (i) { present[i.key] = 1; });
      var next = {}, changed = false;
      Object.keys(fixed).forEach(function (k) { if (present[k]) changed = true; else next[k] = fixed[k]; });
      if (changed) await c.from('sites').update({ fixed_issues: next }).eq('id', siteId);
    } catch (e) { console.warn('reset fixed', e); }
    return { siteId: siteId, scanId: sc.data.id, url: url, type: type };
  };

  // ── UI：樣式 ──
  var css = '' +
    '.ycm-back{position:fixed;inset:0;z-index:99999;background:rgba(5,6,8,.72);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)}' +
    '.ycm{width:100%;max-width:420px;background:var(--surface,#14120F);color:var(--text,#EDE8DC);border:1px solid var(--border,rgba(245,240,230,.14));border-radius:10px;padding:26px 24px 22px;font:14px/1.7 "Noto Sans TC",system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
    '.ycm h3{margin:0 0 6px;font-size:19px;color:var(--text,#fff)}' +
    '.ycm p{margin:0 0 14px;color:var(--text2,var(--text-dim,#b9b2a3));font-size:13.5px}' +
    '.ycm .ycm-x{float:right;background:none;border:0;color:var(--text3,var(--text-dim,#8a8576));font-size:22px;line-height:1;cursor:pointer}' +
    '.ycm button.ycm-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px 14px;border-radius:6px;border:1px solid var(--border,rgba(245,240,230,.18));background:transparent;color:inherit;font:600 14px "Noto Sans TC",system-ui,sans-serif;cursor:pointer;margin-top:10px}' +
    '.ycm button.ycm-primary{background:#fff;color:#1f1f1f;border-color:#fff}' +
    '.ycm button.ycm-accent{background:var(--accent,#5FA396);color:#0b0a09;border-color:var(--accent,#5FA396)}' +
    '.ycm button:disabled{opacity:.45;cursor:not-allowed}' +
    '.ycm .ycm-note{font-size:12px;color:var(--text3,var(--text-dim,#8a8576));margin-top:14px}' +
    '.ycm .ycm-note a,.ycm a{color:var(--accent,#5FA396)}' +
    '.ycm .ycm-err{color:#f0776b;font-size:12.5px;margin-top:10px;min-height:1em}' +
    '.ycm label.ycm-check{display:flex;gap:10px;align-items:flex-start;margin:14px 0 4px;cursor:pointer;color:var(--text,#EDE8DC);font-size:13.5px}' +
    '.ycm label.ycm-check input{margin-top:5px;width:16px;height:16px;accent-color:#5FA396}' +
    '.ycm .ycm-or{display:flex;align-items:center;gap:10px;margin:14px 0 0;color:var(--text3,var(--text-dim,#8a8576));font-size:12px}.ycm .ycm-or:before,.ycm .ycm-or:after{content:"";flex:1;height:1px;background:var(--border,rgba(245,240,230,.14))}' +
    '.ycm input[type=email]{width:100%;box-sizing:border-box;margin-top:10px;padding:11px 12px;border-radius:6px;border:1px solid var(--border,rgba(245,240,230,.18));background:rgba(255,255,255,.04);color:inherit;font-size:14px}' +
    '.yc-menu{position:relative;display:inline-block}.yc-menu-pop{position:absolute;right:0;top:calc(100% + 6px);min-width:190px;background:var(--surface,#14120F);border:1px solid var(--border,rgba(245,240,230,.14));border-radius:8px;padding:6px;z-index:9999;box-shadow:0 12px 40px rgba(0,0,0,.45);display:none}' +
    '.yc-menu.open .yc-menu-pop{display:block}.yc-menu-pop a,.yc-menu-pop button{display:block;width:100%;text-align:left;padding:8px 10px;border-radius:5px;border:0;background:none;color:var(--text,#EDE8DC);font:13px "Noto Sans TC",system-ui,sans-serif;text-decoration:none;cursor:pointer}' +
    '.yc-menu-pop a:hover,.yc-menu-pop button:hover{background:rgba(255,255,255,.06)}.yc-menu-pop .yc-mail{padding:6px 10px 8px;font-size:12px;color:var(--text3,var(--text-dim,#8a8576));word-break:break-all;border-bottom:1px solid var(--border,rgba(245,240,230,.1));margin-bottom:4px}';
  function injectCss() { if (document.getElementById('yc-auth-css')) return; var s = document.createElement('style'); s.id = 'yc-auth-css'; s.textContent = css; document.head.appendChild(s); }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var GOOGLE_SVG = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.9 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

  function modal(html) {
    injectCss(); closeModal();
    var back = document.createElement('div'); back.className = 'ycm-back'; back.id = 'yc-modal';
    back.innerHTML = '<div class="ycm" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(back); return back;
  }
  function closeModal() { var m = document.getElementById('yc-modal'); if (m) m.remove(); }
  YC.closeModal = closeModal; YC.modal = modal; YC.esc = esc;

  // ── 登入視窗 ──
  YC.openLogin = function (opts) {
    opts = opts || {};
    var pp = parentYC(); if (pp) return pp.openLogin(opts);
    if (!YC.enabled) { modal('<button class="ycm-x" aria-label="關閉" onclick="YC.closeModal()">×</button><h3>會員功能即將開放</h3><p>登入功能正在準備中，請稍後再試。</p>'); return; }
    var magic = !!YC.features.magicLink;
    var m = modal(
      '<button class="ycm-x" aria-label="關閉">×</button>' +
      '<h3>' + esc(opts.title || '登入看完整報告') + '</h3><p>' + esc(opts.reason || '登入後可看完整 SEO 報告、自動儲存每次檢測紀錄，並下載 PDF。免費，不需要設定密碼。') + '</p>' +
      '<button class="ycm-btn ycm-primary" id="ycm-google">' + GOOGLE_SVG + '使用 Google 帳號登入</button>' +
      (magic ? '<div class="ycm-or">或</div><input type="email" id="ycm-email" placeholder="輸入你的 Email" autocomplete="email"><button class="ycm-btn" id="ycm-magic">寄登入連結到我的信箱</button>' : '') +
      '<div class="ycm-err" id="ycm-err" role="alert"></div>' +
      '<div class="ycm-note">首次登入需同意保存檢測紀錄。詳見<a href="' + esc(YC.url('privacy/')) + '" target="_blank" rel="noopener">隱私權政策</a>。</div>');
    var err = m.querySelector('#ycm-err');
    m.querySelector('.ycm-x').onclick = closeModal;
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
    m.querySelector('#ycm-google').onclick = function () { this.disabled = true; YC.signInWithGoogle().catch(function (e) { err.textContent = '登入失敗：' + (e.message || e); m.querySelector('#ycm-google').disabled = false; }); };
    if (magic) m.querySelector('#ycm-magic').onclick = function () {
      var v = (m.querySelector('#ycm-email').value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { err.textContent = '請輸入正確的 Email'; return; }
      this.disabled = true;
      YC.signInWithEmail(v).then(function () { showCodeStep(m, v); })
        .catch(function (e) { err.textContent = '寄送失敗：' + friendly(e); m.querySelector('#ycm-magic').disabled = false; });
    };
  };
  function friendly(e) {
    var t = String((e && e.message) || e || '');
    if (/rate limit|too many|over_email_send_rate_limit|after \d+ seconds/i.test(t)) return '寄送太頻繁，請稍等一分鐘再試。';
    if (/expired|invalid|otp/i.test(t)) return '驗證碼不正確或已過期，請重新寄送。';
    return t;
  }
  function showCodeStep(m, mail) {
    m.querySelector('.ycm').innerHTML =
      '<h3>請收信</h3><p>登入信已寄到 ' + esc(mail) + '。點信中的連結即可登入（請在同一個瀏覽器開啟）。<br>如果連結打不開，改輸入信中的驗證碼：</p>' +
      '<input type="text" id="ycm-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="驗證碼" style="width:100%;box-sizing:border-box;margin-top:4px;padding:11px 12px;border-radius:6px;border:1px solid var(--border,rgba(245,240,230,.18));background:rgba(255,255,255,.04);color:inherit;font-size:18px;letter-spacing:.25em;text-align:center">' +
      '<button class="ycm-btn ycm-accent" id="ycm-verify">用驗證碼登入</button><button class="ycm-btn" id="ycm-close2">關閉</button><div class="ycm-err" id="ycm-err2" role="alert"></div>' +
      '<div class="ycm-note">沒收到？請看垃圾信件匣，或稍等一分鐘後重新寄送。</div>';
    var e2 = m.querySelector('#ycm-err2'), btn = m.querySelector('#ycm-verify'), inp = m.querySelector('#ycm-code');
    m.querySelector('#ycm-close2').onclick = closeModal;
    var go = function () {
      var c = (inp.value || '').replace(/\s+/g, '');
      if (!/^\d{6,10}$/.test(c)) { e2.textContent = '請輸入信中的數字驗證碼'; return; }
      btn.disabled = true; e2.textContent = '';
      YC.verifyEmailOtp(mail, c).then(function () { closeModal(); }).catch(function (e) { e2.textContent = friendly(e); btn.disabled = false; });
    };
    btn.onclick = go; inp.onkeydown = function (ev) { if (ev.key === 'Enter') go(); };
    inp.focus();
  }

  // ── 同意視窗（首次登入；不同意 = 刪除帳號）──
  var consentOpen = false;
  YC.ensureConsent = function () {
    var pp = parentYC();
    if (pp) {   // 由父頁顯示視窗；完成後以本頁重新讀取狀態
      if (!YC.loggedIn()) return Promise.resolve(false);
      if (YC.consented()) return Promise.resolve(true);
      return pp.ensureConsent().then(function (ok) { return YC.reload().then(function () { return ok && YC.consented(); }); });
    }
    return new Promise(function (resolve) {
      if (!YC.loggedIn()) return resolve(false);
      if (YC.consented()) return resolve(true);
      if (consentOpen) return resolve(false);
      consentOpen = true;
      var m = modal(
        '<h3>歡迎加入，最後一步</h3><p>登入需要你的同意，才會建立會員資料。</p>' +
        '<label class="ycm-check"><input type="checkbox" id="ycm-agree"><span>' + esc(CONSENT_TEXT) + '</span></label>' +
        '<div class="ycm-note" style="margin-top:6px">我們只會寄信到你登入用的 Email；不會寄信到被檢測網站上的信箱。詳見<a href="' + esc(YC.url('privacy/')) + '" target="_blank" rel="noopener">隱私權政策</a>。</div>' +
        '<button class="ycm-btn ycm-accent" id="ycm-ok" disabled>同意並繼續</button>' +
        '<button class="ycm-btn" id="ycm-no">不同意（取消並刪除帳號）</button>' +
        '<div class="ycm-err" id="ycm-err" role="alert"></div>');
      var ok = m.querySelector('#ycm-ok'), no = m.querySelector('#ycm-no'), err = m.querySelector('#ycm-err');
      m.querySelector('#ycm-agree').onchange = function () { ok.disabled = !this.checked; };
      ok.onclick = function () {
        ok.disabled = true;
        YC.acceptConsent().then(function () { consentOpen = false; closeModal(); resolve(true); })
          .catch(function (e) { err.textContent = '儲存失敗：' + (e.message || e); ok.disabled = false; });
      };
      no.onclick = function () {
        no.disabled = true; ok.disabled = true;
        YC.deleteAccount().catch(function () { return YC.signOut(); }).then(function () { consentOpen = false; closeModal(); resolve(false); });
      };
    });
  };

  // ── 登入狀態列（tool header 內的按鈕）──
  YC.mountAuthBar = function (container) {
    injectCss();
    var host = document.createElement('span'); host.className = 'yc-menu'; host.id = 'yc-authbar';
    container.insertBefore(host, container.firstChild);
    function draw() {
      if (!YC.enabled) { host.innerHTML = ''; return; }
      if (!YC.loggedIn()) { host.innerHTML = '<button class="hist-toggle" id="yc-login-btn">登入 / 註冊</button>'; host.querySelector('#yc-login-btn').onclick = function () { YC.openLogin(); }; return; }
      var mail = (YC.session.user.email || '會員');
      host.innerHTML = '<button class="hist-toggle" id="yc-me" aria-haspopup="true">👤 <span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:bottom">' + esc(mail) + '</span></button>' +
        '<div class="yc-menu-pop" role="menu"><div class="yc-mail">' + esc(mail) + '</div>' +
        '<a href="' + esc(YC.url('dashboard/')) + '" target="_top">會員專區</a>' +
        (YC.isAdmin() ? '<a href="' + esc(YC.url('admin/')) + '" target="_top">管理後台</a>' : '') +
        '<a href="' + esc(YC.url('privacy/')) + '" target="_blank" rel="noopener">隱私權政策</a>' +
        '<button id="yc-switch">切換 Google 帳號</button><button id="yc-logout">登出</button></div>';
      host.querySelector('#yc-me').onclick = function (e) { e.stopPropagation(); host.classList.toggle('open'); };
      host.querySelector('#yc-switch').onclick = function () { YC.switchAccount().catch(function (e) { alert('無法切換帳號：' + (e.message || e)); }); };
      host.querySelector('#yc-logout').onclick = function () { YC.signOut(); };
    }
    document.addEventListener('click', function () { host.classList.remove('open'); });
    YC.onChange(draw);
  };

  // ── 登入導回時的錯誤（連結過期、取消授權…）──
  function readAuthError() {
    var q = new URLSearchParams(location.search), h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    var code = q.get('error_code') || h.get('error_code') || q.get('error') || h.get('error');
    return code ? { code: code, desc: q.get('error_description') || h.get('error_description') || '' } : null;
  }
  function cleanAuthUrl() {
    try {
      var u = new URL(location.href);
      ['code', 'error', 'error_code', 'error_description', 'state'].forEach(function (k) { u.searchParams.delete(k); });
      if (/^#(error|access_token)/.test(u.hash)) u.hash = '';
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }
  var authErr = window.parent === window ? readAuthError() : null;
  if (authErr) {
    YC.authError = authErr;
    YC.onChange(function () {
      if (YC.authError && !YC.loggedIn()) {
        var c = YC.authError.code, msg = /otp_expired|expired/i.test(c + YC.authError.desc) ? '登入連結已失效或已被使用（連結只能用一次、有效時間很短）。請重新登入；如果用 Email，也可以改輸入信中的驗證碼。'
          : (/access_denied/i.test(c) ? '已取消登入。需要時可以再按一次登入。' : '登入沒有成功，請再試一次。');
        YC.authError = null; cleanAuthUrl();
        YC.openLogin({ title: '登入沒有成功', reason: msg });
      }
    });
  }

  // 自動初始化（頁面載入後）
  YC.init();
})();
