// 編輯器英文介面：只有選了英文介面才會載入（中文使用者不會下載這個檔）。
// 做法：畫面上所有中文介面文字（文字、placeholder、aria-label、title）依字典換成英文，
// 之後新增或改變的畫面也會自動翻譯（MutationObserver）。輸入框裡使用者自己填的內容不會動。
import DICT from './ui-en-dict.js';

const CJK = /[一-鿿]/;
const cjkLen = (s) => (s.match(/[一-鿿]/g) || []).length;
// 片段替換（一段文字裡有好幾個中文片段時）只用「夠長」或「本來就是句子片段」的詞，依長度由長到短；
// 短詞（星期、配色名、行業名…）只做整段比對，避免改到使用者自己內容裡的字
const isFrag = (k) => cjkLen(k) >= 4 || (cjkLen(k) >= 2 && /^[\s，。：、（）「」]|[\s，。：、（）「」]$/.test(k));
const frag = Object.keys(DICT).filter(isFrag).sort((a, b) => b.length - a.length);
// 含數字的句子
const RULES = [
  [/^發佈前還有 ?(\d+) ?項要完成$/, '$1 item(s) left to finish'],
  [/^(\d+) 個價目品項的英文名稱$/, '$1 price items need English names'],
  [/^(\d+) 題常見問題（沒英文的不會出現在英文版）$/, '$1 FAQs (those without English are left out of the English site)'],
  [/^(\d+) 則最新消息（沒英文的不會出現在英文版）$/, '$1 news items (those without English are left out of the English site)'],
  [/^(\d+) 篇文章（沒英文的不會出現在英文版）$/, '$1 articles (those without English are left out of the English site)'],
  [/^(\d+) 則評價（沒英文的不會出現在英文版）$/, '$1 reviews (those without English are left out of the English site)'],
  [/^(\d+) 項商品的英文名稱$/, '$1 products need English names'],
  [/^(\d+) 個自訂區塊$/, '$1 custom sections'],
  [/^有 (\d+) 則評價是範例內容，請換成客人的真實評價或刪除$/, '$1 review(s) are sample content; replace them with real customer reviews or delete them'],
  [/^還有 (\d+) 段文字和範例一模一樣，建議改成你自己的說法$/, '$1 passage(s) are identical to the sample text; consider rewriting them in your own words'],
  [/^上次在這台裝置 (\S+ \S+) 的修改，因為網路不穩沒有存上去。要還原這些修改嗎？$/, 'Changes made on this device at $1 weren\u2019t saved because the connection dropped. Restore them?'],
  [/^發佈後就會顯示，到 (\S+) 為止。(這段期間線上預約也不開放。)?$/, (m, d, b) => 'Shows once you publish, until ' + d + '.' + (b ? ' Online booking is unavailable during these dates.' : '')],
  [/^發佈後顯示到 (\S+) 為止，之後自動消失。(這段期間線上預約也不開放。)?$/, (m, d, b) => 'Shows after you publish until ' + d + ', then disappears automatically.' + (b ? ' Online booking is unavailable during these dates.' : '')],
  [/^上傳中 (\d+)\/(\d+)…$/, 'Uploading $1/$2…'],
  [/^(.{2,10})（進階功能・每月加 NT\$([\d,]+)）$/, (m, x, n) => T(x) + ' (advanced feature, +NT$' + n + '/month)'],
  [/^進階 \+NT\$([\d,]+)／月$/, (m, n) => 'Advanced +NT$' + n + '/mo'],
  [/^已套用到 (\d+) 天，公休的日子沒有改$/, 'Applied to $1 day(s); closed days were left unchanged'],
  [/^登入免費，不用設定密碼；你剛剛編輯的內容會帶進帳號。發佈後我們確認付款，網站才會正式上線(?:（每月 NT\$([\d,]+) 起）)?。$/, (m, n) => 'Signing in is free and needs no password; what you just edited is brought into your account. After you publish, your site goes live once payment is confirmed' + (n ? ' (from NT$' + n + '/month)' : '') + '.'],
  [/^已上傳 (\d+) 張照片$/, 'Uploaded $1 photo(s)'],
  [/^一次選多張(.{1,8})照片（還可以放 (\d+) 張）$/, (m, x, n) => 'Choose several ' + low(T(x)) + ' photos (' + n + ' more allowed)']
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE = new RegExp(frag.map(esc).join('|'), 'g');
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

const has = (k) => Object.prototype.hasOwnProperty.call(DICT, k);
const T = (k) => (has(k) ? DICT[k] : k);
const low = (x) => (/^[A-Z][a-z]/.test(x) ? x[0].toLowerCase() + x.slice(1) : x);
// 「標籤＋固定字」的組合（標籤是行業用詞、區塊名稱等短詞）
const COMBO = [
  [/^(\d+)\. (.+)$/, (m, n, x) => n + '. ' + t(x)],
  [/^＋ 新增(.{1,8})$/, (m, x) => '＋ Add ' + low(T(x))],
  [/^(.{1,8})名稱 (\d+)$/, (m, x, n) => T(x) + ' name ' + n],
  [/^(.{1,8})說明 (\d+)$/, (m, x, n) => T(x) + ' note ' + n],
  [/^(.{1,8})名稱$/, (m, x) => (has(x) ? T(x) + ' name' : m)],
  [/^(.{1,8}) 副標題$/, (m, x) => T(x) + ' subheading'],
  [/^(必填|範例|建議) (\d+)$/, (m, x, n) => T(x) + ' ' + n],
  [/^修改：(.{1,20})$/, (m, x) => 'Edit: ' + low(T(x))],
  [/^登入後(.{2,10})$/, (m, x) => (has(x) ? 'Sign in to ' + low(T(x)) : m)]
];
export function t(s) {
  if (!s || !CJK.test(s)) return s;
  if (has(s)) return DICT[s];
  const tr = s.trim();
  // 用函式取代，替換後的文字裡有 $ 符號（例如 NT$400）時才不會被當成特殊符號
  if (has(tr)) return s.replace(tr, () => DICT[tr]);
  for (const [re, to] of RULES) if (re.test(tr)) { const r = tr.replace(re, to); return s.replace(tr, () => r); }
  for (const [re, fn] of COMBO) { const m = tr.match(re); if (m) { const r = fn(...m); if (r !== tr) return s.replace(tr, () => r); } }
  // 片段替換後，剩下單獨成詞的短詞（前後是空白或標點）整詞比對
  return s.replace(RE, (m) => DICT[m]).replace(/[\u4e00-\u9fff]+/g, (w) => T(w));
}

// 不翻譯：輸入框、可編輯區、標記 data-no-tr 的元素（例如使用者自己的網站名稱）
// 自己改過的節點記下改成的值，觀察到的是自己造成的變動就不再處理（避免來回觸發）
const done = new WeakMap();
const skip = (el) => !el || el.closest('textarea,[contenteditable="true"],[data-no-tr],script,style');
function textNode(n) {
  if (skip(n.parentElement)) return;
  const v = n.nodeValue; if (!CJK.test(v) || done.get(n) === v) return;
  const nv = t(v); done.set(n, nv); if (nv !== v) n.nodeValue = nv;
}
function attrs(el) {
  if (el.closest('[data-no-tr]')) return;
  let m = done.get(el); if (!m) done.set(el, (m = {}));
  for (const a of ATTRS) { const v = el.getAttribute(a); if (v && CJK.test(v) && m[a] !== v) { const nv = t(v); m[a] = nv; if (nv !== v) el.setAttribute(a, nv); } }
}
function walk(root) {
  if (root.nodeType === 3) return textNode(root);
  if (root.nodeType !== 1) return;
  attrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { if (n.nodeType === 3) textNode(n); else attrs(n); }
}

export function install() {
  document.documentElement.lang = 'en';
  const fixTitle = () => { if (CJK.test(document.title)) document.title = t(document.title); };
  fixTitle();
  walk(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') textNode(m.target);
      else if (m.type === 'attributes') attrs(m.target);
      else m.addedNodes.forEach(walk);
    }
    fixTitle();
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // 原生對話框
  const wrap = (fn) => (msg, ...rest) => fn.call(window, t(String(msg == null ? '' : msg)), ...rest);
  window.alert = wrap(window.alert); window.confirm = wrap(window.confirm); window.prompt = wrap(window.prompt);
  // 上方試用列的官網連結：改連英文版官網
  document.querySelectorAll('.trial-bar a[href^="../"]').forEach((a) => { const h = a.getAttribute('href'); if (!/^\.\.\/en\//.test(h)) a.setAttribute('href', '../en/' + h.slice(3)); });
  return t;
}
