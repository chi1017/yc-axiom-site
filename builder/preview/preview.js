/* 預覽「最新送出的版本」：網站擁有者或管理員才看得到（由資料庫的 RLS 決定）。
   用的是與正式部署相同的版型函式，只是圖片網址改指向 Supabase，所以看到的就是上線後的樣子。 */
const YC = window.YC;
const $ = (s) => document.querySelector(s);
const DEFAULT_TPL_BASE = 'https://chi1017.github.io/yc-axiom-sites/';
function tplBase() {
  const q = new URLSearchParams(location.search).get('tplbase');
  if (q && /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/$/.test(q)) return q;
  return DEFAULT_TPL_BASE;
}
const STATUS = { draft: '草稿', pending: '待上線', live: '上線中', overdue: '逾期', suspended: '已暫停', cancelled: '已終止' };
function say(t, btn) {
  const m = $('#msg'); m.hidden = false; m.replaceChildren(Object.assign(document.createElement('p'), { textContent: t }));
  if (btn) { const b = document.createElement('button'); b.textContent = btn.text; b.onclick = btn.fn; b.style.cssText = 'font:inherit;padding:8px 16px;border-radius:8px;border:0;background:#5fa396;color:#fff;cursor:pointer'; m.append(b); }
  $('#top').hidden = true; $('#stage').hidden = true;
}
let done = false;
async function run() {
  if (done) return;
  if (!YC.enabled) return say('會員功能尚未開放');
  if (!YC.loggedIn()) return say('請先登入（需要是網站擁有者或管理員）', { text: '登入', fn: () => YC.openLogin({ title: '登入以預覽網站' }) });
  const id = new URLSearchParams(location.search).get('site') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return say('網址不正確：缺少網站編號');
  done = true;
  try {
    const base = tplBase();
    const lib = await import(base + 'templates/shared/site.js');
    const s = await YC.client.from('rental_sites').select('id,slug,template,status,palette,sections,content,public_url,layout,pages').eq('id', id).maybeSingle();
    if (s.error) throw s.error;
    if (!s.data) { done = false; return say('找不到這個網站，或你沒有檢視權限'); }
    // ?version=<id>：預覽指定版本（管理員還原前確認用）；沒帶就預覽最新送出的版本
    const vid = new URLSearchParams(location.search).get('version') || '';
    if (vid && !/^[0-9a-f-]{36}$/i.test(vid)) { done = false; return say('網址不正確：版本編號格式錯誤'); }
    let vq = YC.client.from('site_versions').select('content,palette,sections,layout,pages,created_at').eq('site_id', id);
    vq = vid ? vq.eq('id', vid).limit(1) : vq.order('created_at', { ascending: false }).limit(1);
    const v = await vq;
    if (vid && !(v.data && v.data[0])) { done = false; return say('找不到這個版本，或你沒有檢視權限'); }
    const ver = v.data && v.data[0];
    const src = ver || { content: s.data.content, palette: s.data.palette, sections: s.data.sections, layout: s.data.layout, pages: s.data.pages, created_at: null };
    const url = (s.data.public_url || 'https://' + s.data.slug + '.pages.dev/');
    // 多頁版：用上方的選單切換頁面；預覽裡點站內連結也會切換
    const show = (page) => {
      const r = lib.buildSite({ template: s.data.template, content: src.content, palette: src.palette, sections: src.sections, layout: src.layout, pages: src.pages, page, siteUrl: url, preview: false,
        imageSrc: (role, p) => YC_CONFIG.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/site-photos/' + p.path.split('/').map(encodeURIComponent).join('/') });
      const sel = $('#pPage');
      sel.hidden = r.pages.length < 2;
      sel.replaceChildren(...r.pages.map((p) => Object.assign(document.createElement('option'), { value: p.key, textContent: p.label, selected: p.key === (page || 'home') })));
      sel.onchange = () => show(sel.value);
      const f = $('#frame');
      f.onload = () => {
        try {
          f.contentDocument.addEventListener('click', (ev) => {
            const a = ev.target.closest && ev.target.closest('a'); if (!a) return;
            const href = a.getAttribute('href') || '';
            if (href.startsWith('#') || /^(https?:|mailto:|tel:)/i.test(href)) return;
            ev.preventDefault();
            const path = href.replace(/^(\.\.\/|\.\/)+/, '').split('#')[0];
            const pg = r.pages.find((p) => p.path === path); if (pg) show(pg.key);
          });
        } catch (e) { /* ignore */ }
      };
      f.srcdoc = r.html;
    };
    show('home');
    $('#msg').hidden = true; $('#top').hidden = false; $('#stage').hidden = false;
    $('#pName').textContent = (src.content && src.content.name) || s.data.slug;
    $('#pInfo').textContent = '代稱 ' + s.data.slug + ' · 狀態：' + (STATUS[s.data.status] || s.data.status) + ' · ' + (ver ? (vid ? '指定版本 ' : '版本時間 ') + new Date(ver.created_at).toLocaleString('zh-TW') : '尚無送出的版本，顯示的是草稿');
    document.title = '預覽：' + ((src.content && src.content.name) || s.data.slug);
  } catch (e) { done = false; console.error(e); say('載入失敗：' + String((e && e.message) || e)); }
}
$('#dDesk').onclick = () => { $('#stage').classList.remove('mob'); $('#dDesk').setAttribute('aria-pressed', 'true'); $('#dMob').setAttribute('aria-pressed', 'false'); };
$('#dMob').onclick = () => { $('#stage').classList.add('mob'); $('#dMob').setAttribute('aria-pressed', 'true'); $('#dDesk').setAttribute('aria-pressed', 'false'); };
YC.onChange(() => run());
YC.init();
