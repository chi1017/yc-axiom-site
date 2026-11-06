/* 預覽框（iframe）的輔助程式，編輯器與全螢幕預覽共用。
   1. 預覽框為了安全不執行網站自己的程式，捲動動畫與手機選單由外層頁面代為處理（效果與正式網站相同）。
   2. morphFrame：內容改變時只更新有變的地方（不重新載入整頁），預覽不會閃、不會跳回頂端，照片也不會重新出現。
   3. wireEditPills：滑鼠移到預覽的區塊上，出現「編輯這裡」按鈕，點了打開左邊對應的設定。
   4. wireInlineEdit：電腦版可以直接在預覽上點文字修改（店名、標語、介紹、價目、問答、區塊文字等）。 */

// 執行時加上的 class，更新內容時要保留（in＝已出現的捲動動畫、open＝手機選單打開、yc-*＝編輯器的提示）
const KEEP_CLASS = /^(in|open|yc-hover|yc-flash|yc-txt|yc-txt-on)$/;
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
  '.yc-pill:hover{background:#25695c}.yc-pill2{background:#fff;color:#1d2a33;box-shadow:0 4px 14px rgba(0,0,0,.25),inset 0 0 0 1px rgba(0,0,0,.12)}.yc-pill2:hover{background:#f2f2f2}@media(hover:none){.yc-pill{font-size:15px;padding:12px 18px}}';
export function sectionKey(el) {
  if (!el) return '';
  if (el.matches('header.top')) return 'header';
  if (el.matches('footer')) return 'footer';
  if (el.id) return el.id;
  if (el.classList.contains('contact-strip')) return 'visit';
  if (el.classList.contains('page-head')) return 'top';
  return '';
}
// 點到主視覺（或頁首大圖）的照片：跳到「照片」設定，不是店家資訊
const photoKey = (t, key) => ((key === 'top') && t && t.closest && t.closest('figure, picture, img, .ph-img, .hero-img') ? 'heroPhoto' : key);
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
    const key = photoKey(e.target, sectionKey(el));
    if (!el || !key) { hide(); return; }
    if (el !== curEl || pill.dataset.key !== key) {
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
  // 手機與平板（沒有滑鼠）：點一下區塊顯示「編輯」按鈕，再點按鈕跳到設定；點連結、按鈕照常
  const touchy = () => w.matchMedia('(hover: none)').matches || (w.parent && w.parent.matchMedia && w.parent.matchMedia('(hover: none)').matches);
  // 手機：點到可以直接改的文字時，按鈕改成「改這段字」，旁邊另有「這一區的設定」
  const pill2 = d.createElement('button'); pill2.type = 'button'; pill2.className = 'yc-pill yc-pill2'; pill2.textContent = '這一區的設定';
  d.documentElement.appendChild(pill2);
  let txtEl = null, txt = null;
  const clearTxt = () => { if (txtEl) txtEl.classList.remove('yc-txt'); txtEl = null; txt = null; pill2.style.display = 'none'; pill.dataset.mode = ''; };
  const hide0 = hide;
  const hideAll = () => { hide0(); clearTxt(); };
  d.addEventListener('click', (e) => {
    if (!touchy() || e.target === pill || e.target === pill2) return;
    if (e.target.closest && e.target.closest('a, button, input, select, textarea, label, summary, iframe, video')) return;
    const el = e.target.closest && e.target.closest('main > section, header.top, footer');
    const key = photoKey(e.target, sectionKey(el));
    clearTxt();
    if (!el || !key) { hideAll(); return; }
    if (curEl) curEl.classList.remove('yc-hover');
    curEl = el; el.classList.add('yc-hover');
    const x = d.__ycTextAt ? d.__ycTextAt(e.target) : null;
    if (x) { txt = x; txtEl = x.el; txtEl.classList.add('yc-txt'); pill.dataset.mode = 'text'; pill.textContent = '✎ 改這段字'; }
    else pill.textContent = '✎ 編輯' + (labelOf ? labelOf(key) : '');
    pill.dataset.key = key;
    pill.style.display = 'block';
    const r = el.getBoundingClientRect();
    const y = key === 'header' ? r.bottom + 6 : Math.min(Math.max(e.clientY - 56, Math.max(r.top, 0) + 10), r.bottom - 50);
    pill.style.top = (w.scrollY + y) + 'px';
    pill.style.left = Math.max(8, Math.min(w.scrollX + e.clientX - pill.offsetWidth / 2, w.scrollX + w.innerWidth - pill.offsetWidth - 8)) + 'px';
    if (x) {
      pill2.style.display = 'block'; pill2.style.top = pill.style.top;
      const l = parseFloat(pill.style.left), room = w.scrollX + w.innerWidth - (l + pill.offsetWidth + 8);
      if (room >= pill2.offsetWidth + 8) pill2.style.left = (l + pill.offsetWidth + 8) + 'px';
      else { pill.style.left = Math.max(8, w.scrollX + w.innerWidth - pill.offsetWidth - pill2.offsetWidth - 24) + 'px'; pill2.style.left = (parseFloat(pill.style.left) + pill.offsetWidth + 8) + 'px'; }
    }
  });
  pill.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (pill.dataset.mode === 'text' && txt && d.__ycTextEdit) { const x = txt; hideAll(); d.__ycTextEdit(x); return; }
    hideAll(); onPick(pill.dataset.key);
  });
  pill2.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const k = pill.dataset.key; hideAll(); onPick(k); });
}
// 預覽上直接改字（電腦版）：滑鼠移到可以改的文字上會出現虛線，點一下就能直接打字；
// Enter 或點別的地方完成，Esc 取消。find(文字) 回傳 { set(新文字), max, label } 或 null。
const INLINE_CSS = '.yc-txt{outline:1px dashed rgba(47,127,112,.8);outline-offset:2px;cursor:text;border-radius:2px}' +
  '.yc-txt-on{outline:2px solid #2f7f70!important;outline-offset:2px;background:rgba(47,127,112,.08);cursor:text}' +
  '.yc-tip{position:absolute;z-index:2147483001;font:500 12px/1.4 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif;background:#1d2a33;color:#fff;padding:5px 9px;border-radius:6px;pointer-events:none;white-space:nowrap;display:none}';
const normText = (t) => String(t || '').replace(/\s+/g, ' ').trim();
export function wireInlineEdit(f, { find, onInput, onDone, onStart, onTouchEdit }) {
  const d = f.contentDocument, w = f.contentWindow; if (!d) return;
  if (!d.getElementById('yc-inline-css')) { const st = d.createElement('style'); st.id = 'yc-inline-css'; st.textContent = INLINE_CSS; d.documentElement.appendChild(st); }
  if (d.__ycInline) return;
  d.__ycInline = true;
  const hoverable = () => w.matchMedia('(hover: hover)').matches && !(w.parent && w.parent.matchMedia && w.parent.matchMedia('(hover: none)').matches);
  const tip = d.createElement('div'); tip.className = 'yc-tip'; d.documentElement.appendChild(tip);
  let hot = null, hotT = null, edit = null;
  const SKIP = 'a, button, input, select, textarea, label, nav, .yc-pill, .yc-tip, script, style';
  const targetOf = (node) => {
    let el = node && node.nodeType === 1 ? node : node && node.parentElement;
    if (!el || !el.closest || el.closest(SKIP) || !el.closest('main, header.top, footer')) return null;
    // 只有「整個元素就是一段文字」才可以直接改（不含其他元素），避免改到排版用的外框
    if (el.children.length) return null;
    const t = find(normText(el.textContent));
    return t ? { el, t } : null;
  };
  // 手機與平板：點文字後由「改這段字」按鈕交給編輯器開輸入面板（不在預覽裡直接打字，鍵盤與捲動較穩）
  if (onTouchEdit) { d.__ycTextAt = (node) => (hoverable() ? null : targetOf(node)); d.__ycTextEdit = (x) => onTouchEdit({ el: x.el, t: x.t, text: normText(x.el.textContent), win: w }); }
  const clearHot = () => { if (hot) hot.classList.remove('yc-txt'); hot = null; hotT = null; tip.style.display = 'none'; };
  d.addEventListener('mousemove', (e) => {
    if (edit || !hoverable()) return;
    const x = targetOf(e.target);
    if (!x) { clearHot(); return; }
    if (x.el !== hot) { clearHot(); hot = x.el; hotT = x.t; hot.classList.add('yc-txt'); tip.textContent = '點一下直接修改' + (x.t.label ? '：' + x.t.label : ''); }
    const r = hot.getBoundingClientRect();
    tip.style.display = 'block';
    tip.style.top = (w.scrollY + Math.max(r.top - 28, 4)) + 'px';
    tip.style.left = Math.max(4, Math.min(w.scrollX + r.left, w.scrollX + w.innerWidth - tip.offsetWidth - 4)) + 'px';
  });
  d.addEventListener('mouseleave', () => { if (!edit) clearHot(); });
  const finish = (cancel) => {
    if (!edit) return;
    const { el, t, orig } = edit; edit = null;
    if (cancel) { el.textContent = orig; t.set(orig); }
    el.removeAttribute('contenteditable'); el.classList.remove('yc-txt-on');
    try { w.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
    onDone(cancel);
  };
  // 在 mousedown 時就打開編輯，瀏覽器會把游標放在點的位置
  d.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !hoverable()) return;
    if (edit && edit.el.contains(e.target)) return;
    if (edit) finish(false);
    const x = targetOf(e.target);
    if (!x) return;
    clearHot();
    const orig = normText(x.el.textContent);
    edit = { el: x.el, t: x.t, orig };
    try { x.el.contentEditable = 'plaintext-only'; } catch (er) { x.el.contentEditable = 'true'; }
    if (x.el.contentEditable !== 'plaintext-only') x.el.contentEditable = 'true';
    x.el.classList.add('yc-txt-on');
    x.el.spellcheck = false;
    if (onStart) onStart();
  }, true);
  d.addEventListener('click', (e) => { if (edit && edit.el.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);
  d.addEventListener('input', (e) => {
    if (!edit || e.target !== edit.el) return;
    let v = edit.el.textContent.replace(/[\r\n]+/g, ' ');
    if (edit.t.max && [...v].length > edit.t.max) { v = [...v].slice(0, edit.t.max).join(''); edit.el.textContent = v; const s = w.getSelection(), r = d.createRange(); r.selectNodeContents(edit.el); r.collapse(false); s.removeAllRanges(); s.addRange(r); }
    edit.t.set(v.trim() ? v : edit.orig);
    onInput();
  });
  d.addEventListener('keydown', (e) => {
    if (!edit) return;
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(false); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(true); }
  });
  d.addEventListener('focusout', (e) => { if (edit && e.target === edit.el) finish(false); });
  // 貼上時只保留純文字
  d.addEventListener('paste', (e) => {
    if (!edit) return;
    e.preventDefault();
    const t = (e.clipboardData && e.clipboardData.getData('text/plain') || '').replace(/[\r\n]+/g, ' ');
    d.execCommand('insertText', false, t);
  });
  return { editing: () => !!edit };
}

// 左邊在改某個區塊時，預覽裡那個區塊閃一下
export function flashSection(f, el) {
  if (!el) return;
  el.classList.remove('yc-flash'); void el.offsetWidth; el.classList.add('yc-flash');
  setTimeout(() => el.classList.remove('yc-flash'), 1300);
}
