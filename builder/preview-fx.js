/* 預覽框（iframe）的輔助程式，編輯器與全螢幕預覽共用。
   1. 預覽框為了安全不執行網站自己的程式，捲動動畫與手機選單由外層頁面代為處理（效果與正式網站相同）。
   2. morphFrame：內容改變時只更新有變的地方（不重新載入整頁），預覽不會閃、不會跳回頂端，照片也不會重新出現。
   3. wireEditPills：滑鼠移到預覽的區塊上，出現「編輯這裡」按鈕，點了打開左邊對應的設定。 */

// 執行時加上的 class，更新內容時要保留（in＝已出現的捲動動畫、open＝手機選單打開、yc-*＝編輯器的提示）
const KEEP_CLASS = /^(in|open|yc-hover|yc-flash)$/;
const KEEP_HTML_CLASS = /^(js-rv|js-nav)$/;

function syncAttrs(a, b, keepClass) {
  // 手機選單按鈕：顯示與展開狀態由外層程式控制
  const isNavBtn = a.classList && a.classList.contains('nav-btn');
  for (const { name } of [...a.attributes]) {
    if (b.hasAttribute(name)) continue;
    if (isNavBtn && (name === 'aria-expanded')) continue;
    if (name === 'class' && keepClass && [...a.classList].some((c) => keepClass.test(c))) continue;
    a.removeAttribute(name);
  }
  for (const { name, value } of [...b.attributes]) {
    if (isNavBtn && (name === 'hidden' || name === 'aria-expanded')) continue;
    if (name === 'class' && keepClass) {
      const kept = [...a.classList].filter((c) => keepClass.test(c) && !b.classList.contains(c));
      const v = kept.length ? value + ' ' + kept.join(' ') : value;
      if (a.getAttribute('class') !== v) a.setAttribute('class', v);
      continue;
    }
    if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  }
}
const sameNode = (x, y) => x.nodeType === y.nodeType && (x.nodeType !== 1 || (x.tagName === y.tagName && (x.id || '') === (y.id || '')));
function morphNode(a, b) {
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  syncAttrs(a, b, KEEP_CLASS);
  if (a.tagName === 'STYLE' || a.tagName === 'SCRIPT' || a.tagName === 'TEXTAREA') { if (a.textContent !== b.textContent) a.textContent = b.textContent; return; }
  morphChildren(a, b);
}
function morphChildren(a, b) {
  const doc = a.ownerDocument;
  let cur = a.firstChild;
  for (const bn of [...b.childNodes]) {
    let match = null;
    if (cur && sameNode(cur, bn)) match = cur;
    else if (bn.nodeType === 1 && bn.id) { for (let x = cur; x; x = x.nextSibling) if (x.nodeType === 1 && x.id === bn.id && x.tagName === bn.tagName) { match = x; break; } }
    if (match) { if (match !== cur) a.insertBefore(match, cur); morphNode(match, bn); cur = match.nextSibling; }
    else a.insertBefore(doc.importNode(bn, true), cur);
  }
  while (cur) { const n = cur.nextSibling; a.removeChild(cur); cur = n; }
}
// 用新的整頁 HTML 更新預覽框目前的內容；回傳 false 表示要改用整頁重新載入
export function morphFrame(f, html) {
  const d = f.contentDocument;
  if (!d || !d.body || d.readyState === 'loading') return false;
  try {
    const nd = new DOMParser().parseFromString(html, 'text/html');
    syncAttrs(d.documentElement, nd.documentElement, KEEP_HTML_CLASS);
    morphChildren(d.head, nd.head);
    syncAttrs(d.body, nd.body, KEEP_CLASS);
    morphChildren(d.body, nd.body);
    return true;
  } catch (e) { console.warn('morph', e); return false; }
}

// 捲動動畫：replay＝重新播放一次（換了動畫樣式時）；否則畫面內的區塊直接顯示，不會每改一個字就閃一次
export function startReveal(f, replay) {
  const d = f.contentDocument, w = f.contentWindow;
  if (!d || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const vh = () => w.innerHeight;
  const all = () => [...d.querySelectorAll('.rv')];
  if (!replay) all().forEach((el) => { if (el.getBoundingClientRect().top < vh()) el.classList.add('in'); });
  // 先「瞬間」藏起還沒出現的區塊（不要看到淡出），再開始動畫
  const freeze = d.createElement('style'); freeze.textContent = '.rv{transition:none!important}';
  d.head.appendChild(freeze);
  d.documentElement.classList.add('js-rv');
  void d.body.offsetHeight;
  freeze.remove(); void d.body.offsetHeight;
  const show = () => all().forEach((el) => { if (!el.classList.contains('in') && el.getBoundingClientRect().top < vh() * 0.92) el.classList.add('in'); });
  setTimeout(show, replay ? 350 : 0);
  if (!d.__ycReveal) { d.__ycReveal = true; w.addEventListener('scroll', show, { passive: true }); w.addEventListener('resize', show); }
}
// 內容更新後：新出現在畫面內的區塊直接顯示（不播動畫）
export function settleReveal(f) {
  const d = f.contentDocument, w = f.contentWindow;
  if (!d || !d.documentElement.classList.contains('js-rv')) return;
  const freeze = d.createElement('style'); freeze.textContent = '.rv{transition:none!important}';
  d.head.appendChild(freeze);
  d.querySelectorAll('.rv:not(.in)').forEach((el) => { if (el.getBoundingClientRect().top < w.innerHeight) el.classList.add('in'); });
  void d.body.offsetHeight; freeze.remove();
}
// 手機版的選單按鈕（≡）：用事件委派，內容更新後仍然有效
export function wireNav(f) {
  const d = f.contentDocument; if (!d) return;
  const b = d.querySelector('.nav-btn'), n = d.getElementById('site-nav');
  if (!b || !n) return;
  d.documentElement.classList.add('js-nav'); b.hidden = false;
  if (d.__ycNav) return;
  d.__ycNav = true;
  d.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.nav-btn'), nav = d.getElementById('site-nav'), bb = d.querySelector('.nav-btn');
    if (!nav || !bb) return;
    const set = (o) => { bb.setAttribute('aria-expanded', o ? 'true' : 'false'); nav.classList.toggle('open', o); };
    if (btn) set(bb.getAttribute('aria-expanded') !== 'true');
    else if (e.target.closest && e.target.closest('#site-nav a')) set(false);
  });
}

// 滑鼠移到預覽的區塊上，顯示「編輯這裡」；點了呼叫 onPick(區塊的 id 或種類)
const PILL_CSS = '.yc-hover{outline:2px dashed rgba(47,127,112,.75)!important;outline-offset:-2px}' +
  '.yc-flash{animation:ycflash 1.2s ease}@keyframes ycflash{0%,40%{box-shadow:inset 0 0 0 3px rgba(47,127,112,.9)}100%{box-shadow:inset 0 0 0 3px rgba(47,127,112,0)}}' +
  '.yc-pill{position:absolute;z-index:2147483000;display:none;font:600 13px/1 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif;padding:8px 12px;border-radius:999px;border:0;background:#2f7f70;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}' +
  '.yc-pill:hover{background:#25695c}';
export function sectionKey(el) {
  if (!el) return '';
  if (el.matches('header.top')) return 'header';
  if (el.matches('footer')) return 'footer';
  if (el.id) return el.id;
  if (el.classList.contains('contact-strip')) return 'visit';
  if (el.classList.contains('page-head')) return 'top';
  return '';
}
export function wireEditPills(f, onPick, labelOf) {
  const d = f.contentDocument, w = f.contentWindow; if (!d) return;
  if (!d.getElementById('yc-pill-css')) { const st = d.createElement('style'); st.id = 'yc-pill-css'; st.textContent = PILL_CSS; d.documentElement.appendChild(st); }
  if (d.__ycPill) return;
  d.__ycPill = true;
  const pill = d.createElement('button'); pill.type = 'button'; pill.className = 'yc-pill';
  d.documentElement.appendChild(pill);
  let curEl = null;
  const hide = () => { pill.style.display = 'none'; if (curEl) curEl.classList.remove('yc-hover'); curEl = null; };
  d.addEventListener('mousemove', (e) => {
    if (e.target === pill) return;
    const el = e.target.closest && e.target.closest('main > section, header.top, footer');
    const key = sectionKey(el);
    if (!el || !key) { hide(); return; }
    if (el !== curEl) {
      if (curEl) curEl.classList.remove('yc-hover');
      curEl = el; el.classList.add('yc-hover');
      pill.textContent = '✎ 編輯' + (labelOf ? labelOf(key) : '');
      pill.dataset.key = key;
    }
    const r = el.getBoundingClientRect();
    pill.style.display = 'block';
    // 頁首：放在頁首下方，避免蓋住選單；其他區塊放在右上角的留白處
    pill.style.top = (w.scrollY + (key === 'header' ? r.bottom + 6 : Math.max(r.top, 0) + 10)) + 'px';
    pill.style.left = Math.max(8, w.scrollX + r.right - pill.offsetWidth - 12) + 'px';
  });
  d.addEventListener('mouseleave', hide);
  pill.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onPick(pill.dataset.key); });
}
// 左邊在改某個區塊時，預覽裡那個區塊閃一下
export function flashSection(f, el) {
  if (!el) return;
  el.classList.remove('yc-flash'); void el.offsetWidth; el.classList.add('yc-flash');
  setTimeout(() => el.classList.remove('yc-flash'), 1300);
}
