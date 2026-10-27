/* 預覽框（iframe）為了安全不執行網站自己的程式，這裡由外層頁面代為處理捲動動畫與手機選單，效果與正式網站相同。
   編輯器與全螢幕預覽共用。 */
// 捲動動畫：預覽框為了安全不執行網站自己的程式，所以由編輯器代為觸發（效果與正式網站相同）
export function startReveal(f, replay) {
  const d = f.contentDocument, w = f.contentWindow;
  if (!d || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const els = [...d.querySelectorAll('.rv')];
  if (!els.length) return;
  const vh = () => w.innerHeight;
  // 一般重繪時，畫面內的區塊直接顯示，不要每改一個字就閃一次
  if (!replay) els.forEach((el) => { if (el.getBoundingClientRect().top < vh()) el.classList.add('in'); });
  // 先「瞬間」藏起還沒出現的區塊（不要看到淡出），再開始動畫
  const freeze = d.createElement('style'); freeze.textContent = '.rv{transition:none!important}';
  d.head.appendChild(freeze);
  d.documentElement.classList.add('js-rv');
  void d.body.offsetHeight;
  freeze.remove(); void d.body.offsetHeight;
  const show = () => els.forEach((el) => { if (!el.classList.contains('in') && el.getBoundingClientRect().top < vh() * 0.92) el.classList.add('in'); });
  setTimeout(show, replay ? 350 : 0);
  w.addEventListener('scroll', show, { passive: true });
  w.addEventListener('resize', show);
}
// 手機版的選單按鈕（≡）：同樣由編輯器代為處理，預覽裡點得開、關得起來
export function wireNav(f) {
  const d = f.contentDocument; if (!d) return;
  const b = d.querySelector('.nav-btn'), n = d.getElementById('site-nav');
  if (!b || !n) return;
  d.documentElement.classList.add('js-nav'); b.hidden = false;
  const set = (o) => { b.setAttribute('aria-expanded', o ? 'true' : 'false'); n.classList.toggle('open', o); };
  b.addEventListener('click', () => set(b.getAttribute('aria-expanded') !== 'true'));
  n.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
}
