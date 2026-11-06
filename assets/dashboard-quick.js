// 會員專區「快速更新」：不用打開編輯器就能做的小事（手機也好按）。
// 臨時公休、網站公告、發一則消息、改營業時間，以及看網站、分享到 LINE、複製網址。
// 做法和編輯器一樣：改網站草稿（rental_sites.content）後呼叫 publish-site 發佈。
(function () {
  'use strict';
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var twDay = function (n) { return new Date(Date.now() + 288e5 + (n || 0) * 864e5).toISOString().slice(0, 10); };
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], DL = { mon: '週一', tue: '週二', wed: '週三', thu: '週四', fri: '週五', sat: '週六', sun: '週日' };
  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  var md = function (d) { var t = new Date(d + 'T00:00:00Z'); return (t.getUTCMonth() + 1) + '/' + t.getUTCDate() + '（' + WD[t.getUTCDay()] + '）'; };
  var span = function (n) { return n.from === n.to ? md(n.from) : md(n.from) + ' – ' + md(n.to); };
  var todayKey = function () { return DAYS[(new Date(Date.now() + 288e5).getUTCDay() + 6) % 7]; };
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  var sites = {};

  // 共用版型模組（正規化內容，用來判斷編輯器裡有沒有還沒發佈的修改）；只在打開表單時才下載
  var lib = null;
  function tplBase() {
    var q = new URLSearchParams(location.search).get('tplbase');
    if (q && /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/$/.test(q)) return q;
    return location.origin + '/tpl/';
  }
  function getLib() { if (!lib) lib = import(tplBase() + 'templates/dist/builder-lib.js').catch(function () { lib = null; return null; }); return lib; }

  function css() {
    if (document.getElementById('yq-css')) return;
    var st = document.createElement('style'); st.id = 'yq-css';
    st.textContent =
      '.yq{margin:14px 0 4px;padding:16px;border:1px solid var(--border);border-radius:6px;background:color-mix(in srgb,var(--accent) 5%,transparent)}' +
      '.yq-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:0 0 12px}.yq-h b{font:700 15px var(--f-ui);color:var(--text-bright)}.yq-h span{font-size:12.5px;color:var(--text-dim)}' +
      '.yq-now{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:0 0 12px;padding:10px 12px;border-radius:6px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--border));font-size:14px;line-height:1.6}' +
      '.yq-now em{font-style:normal;font-size:12px;font-weight:700;padding:1px 8px;border-radius:4px;background:var(--accent);color:#0b0a09}.yq-now span{flex:1 1 180px}' +
      '.yq-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}' +
      '.yq-t{display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-height:64px;padding:12px 14px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text-bright);font:600 14.5px var(--f-ui);text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
      '.yq-t small{font:400 12px/1.45 var(--f-ui);color:var(--text-dim)}.yq-t:hover,.yq-t:focus-visible{border-color:var(--accent)}.yq-t:active{transform:scale(.98)}' +
      '.yq-share{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}.yq-share .m-btn{flex:1 1 auto;min-height:42px}' +
      '.yq-line{background:#06c755!important;border-color:#06c755!important;color:#fff!important}' +
      '@media (max-width:640px){.yq{padding:14px 12px}.yq-grid{grid-template-columns:1fr 1fr}.yq-share .m-btn{flex:1 1 40%}}' +
      // 表單：手機是從下方滑出的面板，電腦是置中的視窗
      '.yq-bg{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.55)}' +
      '.yq-sh{width:min(520px,100%);max-height:calc(100dvh - 32px);overflow:auto;padding:22px 20px 18px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);box-shadow:0 20px 60px rgba(0,0,0,.45);overscroll-behavior:contain}' +
      '.yq-sh h3{margin:0 0 4px;font:800 18px var(--f-ui);color:var(--text-bright)}.yq-sh .yq-sub{margin:0 0 14px;font-size:13px;color:var(--text-dim);line-height:1.6}' +
      '.yq-sh label{display:block;margin:12px 0 0;font-size:13px;font-weight:600;color:var(--text-bright)}' +
      '.yq-sh input[type=text],.yq-sh input[type=date],.yq-sh input[type=time],.yq-sh textarea{display:block;width:100%;box-sizing:border-box;margin:6px 0 0;padding:11px 12px;border-radius:6px;border:1px solid var(--border);background:transparent;color:inherit;font:16px var(--f-ui)}' +
      '.yq-sh input:focus,.yq-sh textarea:focus{outline:2px solid var(--accent);outline-offset:0;border-color:var(--accent)}' +
      '.yq-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.yq-chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 0}' +
      '.yq-chip{padding:8px 14px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--text);font:600 13.5px var(--f-ui);cursor:pointer}.yq-chip[aria-pressed=true]{border-color:var(--accent);background:var(--accent-dim);color:var(--accent)}' +
      '.yq-hr{display:grid;grid-template-columns:3.2em 1fr 1fr auto;gap:6px;align-items:center;margin:6px 0 0}.yq-hr>b{font-size:14px;font-weight:600}.yq-hr input[type=time]{margin:0;padding:9px 8px}.yq-hr label{margin:0;display:flex;gap:4px;align-items:center;font-weight:400;white-space:nowrap}' +
      '.yq-hr.off input[type=time]{opacity:.35}' +
      '.yq-warn{margin:14px 0 0;padding:10px 12px;border-radius:6px;border:1px solid rgba(224,176,90,.6);color:#e0b05a;font-size:13px;line-height:1.6}' +
      '.yq-msg{margin:12px 0 0;font-size:14px;line-height:1.6}.yq-msg.err{color:#f0776b}.yq-msg ul{margin:6px 0 0;padding-left:18px}' +
      '.yq-act{position:sticky;bottom:-18px;display:flex;gap:8px;justify-content:flex-end;margin:18px -20px -18px;padding:12px 20px 18px;background:var(--surface);border-top:1px solid var(--border)}.yq-act .m-btn{min-height:44px}' +
      '.yq-note{margin:6px 0 0;font-size:12.5px;color:var(--text-dim);line-height:1.6}' +
      '@media (max-width:640px){.yq-bg{align-items:flex-end;padding:0}.yq-sh{width:100%;max-height:92dvh;border-radius:14px 14px 0 0;padding:18px 16px calc(16px + env(safe-area-inset-bottom));animation:yqUp .22s ease-out}.yq-act{margin:18px -16px calc(-16px - env(safe-area-inset-bottom));padding:12px 16px calc(14px + env(safe-area-inset-bottom))}.yq-act .m-btn{flex:1}}' +
      '@keyframes yqUp{from{transform:translateY(30px);opacity:.4}to{transform:none;opacity:1}}@media (prefers-reduced-motion:reduce){.yq-sh{animation:none}}';
    document.head.appendChild(st);
  }

  // ── 卡片上的快速更新區 ──
  function liveNotice(c) { var n = c && c.notice; return n && n.text && n.to && n.to >= twDay() ? n : null; }
  function hoursLine(c) {
    var h = c && c.hours && c.hours[todayKey()];
    if (!h) return '還沒設定';
    if (h.closed) return '今天公休';
    return h.open && h.close ? '今天 ' + h.open + '–' + h.close : '還沒設定';
  }
  function inner(s) {
    var c = s.content || {}, n = liveNotice(c), url = s.public_url;
    return '<div class="yq-h"><b>快速更新</b><span>不用打開編輯器，按一下就更新網站</span></div>' +
      (n ? '<div class="yq-now"><em>' + (n.closed ? '臨時公休' : '公告') + '</em><span>' + esc(span(n)) + '　' + esc(n.text) + (n.from > twDay() ? '<br><small style="color:var(--text-dim)">已經顯示在網站上，期間過了自動消失</small>' : '') + '</span>' +
        '<button type="button" class="m-btn sm" data-yq="cancel">取消公告</button></div>' : '') +
      '<div class="yq-grid">' +
      '<button type="button" class="yq-t" data-yq="closed">臨時公休<small>選日期，期間過了自動消失</small></button>' +
      '<button type="button" class="yq-t" data-yq="hours">營業時間<small>' + esc(hoursLine(c)) + '</small></button>' +
      '<button type="button" class="yq-t" data-yq="news">發一則消息<small>放在最新消息最上面</small></button>' +
      '<button type="button" class="yq-t" data-yq="notice">網站公告<small>活動、優惠、提醒</small></button></div>' +
      (url ? '<div class="yq-share"><a class="m-btn sm" href="' + esc(url) + '" target="_blank" rel="noopener">看網站</a>' +
        '<a class="m-btn sm yq-line" href="' + esc('https://line.me/R/share?text=' + encodeURIComponent((c.name ? c.name + '\n' : '') + url)) + '" target="_blank" rel="noopener">分享到 LINE</a>' +
        '<button type="button" class="m-btn sm" data-yq="copy">複製網址</button>' +
        (navigator.share ? '<button type="button" class="m-btn sm" data-yq="share">其他分享</button>' : '') + '</div>' : '');
  }
  function html(s) {
    if (!s || !s.public_url || !(s.status === 'live' || s.status === 'overdue')) return '';
    css(); sites[s.id] = s;
    return '<div class="yq" data-yq-site="' + esc(s.id) + '">' + inner(s) + '</div>';
  }
  function repaint(id) { var el = document.querySelector('.yq[data-yq-site="' + id + '"]'); if (el && sites[id]) el.innerHTML = inner(sites[id]); }

  // ── 表單 ──
  var open = null;
  function close() { if (!open) return; var o = open; open = null; o.bg.remove(); document.documentElement.style.overflow = ''; if (o.back && o.back.focus) o.back.focus(); }
  function sheet(title, sub, body, okText) {
    close();
    var bg = document.createElement('div'); bg.className = 'yq-bg';
    bg.innerHTML = '<div class="yq-sh mem" role="dialog" aria-modal="true" aria-labelledby="yq-ttl"><h3 id="yq-ttl">' + esc(title) + '</h3>' + (sub ? '<p class="yq-sub">' + sub + '</p>' : '') +
      '<form novalidate>' + body + '<div class="yq-pend"></div><div class="yq-msg" aria-live="polite"></div>' +
      '<div class="yq-act"><button type="button" class="m-btn" data-x>取消</button><button type="submit" class="m-btn primary">' + esc(okText || '發佈到網站') + '</button></div></form></div>';
    document.body.appendChild(bg);
    document.documentElement.style.overflow = 'hidden';
    open = { bg: bg, back: document.activeElement };
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.closest('[data-x]')) close(); });
    var first = bg.querySelector('input,textarea,button'); if (first && matchMedia('(min-width:641px)').matches) setTimeout(function () { first.focus(); }, 30);
    return bg.querySelector('form');
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) close(); });

  // 編輯器裡有沒有還沒發佈的修改（有的話，這次發佈會一起上線）
  async function pendingCheck(s, form) {
    try {
      var L = await getLib(); if (!L || !L.content) return;
      var r = await YC.client.from('rental_sites').select('content').eq('id', s.id).single();
      var v = await YC.client.from('site_versions').select('content').eq('site_id', s.id).order('created_at', { ascending: false }).limit(1);
      if (r.error || v.error || !v.data || !v.data[0]) return;
      var N = L.content.normalizeContent;
      if (JSON.stringify(N(r.data.content)) !== JSON.stringify(N(v.data[0].content)) && form.isConnected)
        form.querySelector('.yq-pend').innerHTML = '<p class="yq-warn">編輯器裡還有修改沒有發佈，按下「發佈到網站」會一起上線。不想一起上線的話，先到編輯器處理。</p>';
    } catch (e) { /* 略過 */ }
  }

  // 讀最新草稿 → 套用修改 → 存回 → 發佈
  async function apply(s, form, mutate) {
    var msg = form.querySelector('.yq-msg'), btn = form.querySelector('[type=submit]');
    msg.className = 'yq-msg'; msg.textContent = '發佈中…'; btn.disabled = true;
    try {
      var r = await YC.client.from('rental_sites').select('content').eq('id', s.id).single();
      if (r.error || !r.data) throw new Error('讀不到網站內容，請稍後再試');
      var c = JSON.parse(JSON.stringify(r.data.content || {}));
      mutate(c);
      var u = await YC.client.from('rental_sites').update({ content: c }).eq('id', s.id);
      if (u.error) throw new Error('存檔失敗，請稍後再試');
      s.content = c; repaint(s.id);
      var p = await YC.client.functions.invoke('publish-site', { body: { site_id: s.id } });
      if (p.error) {
        var j = null; try { j = await p.error.context.json(); } catch (e0) { /* ignore */ }
        if (j && j.errors) { msg.className = 'yq-msg err'; msg.innerHTML = '已存到草稿，但還不能發佈，請到編輯器完成：<ul>' + j.errors.map(function (x) { return '<li>' + esc(x.msg) + '</li>'; }).join('') + '</ul>'; btn.disabled = false; return; }
        throw new Error(((j && j.message) || '發佈失敗，請稍後再試') + '（修改已存到草稿）');
      }
      done(s, (p.data && p.data.message) || '已送出');
    } catch (e) { msg.className = 'yq-msg err'; msg.textContent = String(e.message || e); btn.disabled = false; }
  }
  function done(s, text) {
    var form = sheet('已更新', '', '<p class="yq-msg">' + esc(text) + '</p>', '好');
    var act = form.querySelector('.yq-act');
    act.innerHTML = '<a class="m-btn" href="' + esc(s.public_url) + '" target="_blank" rel="noopener">看網站</a><button type="submit" class="m-btn primary">好</button>';
    form.addEventListener('submit', function (e) { e.preventDefault(); close(); });
  }
  var val = function (f, n) { var i = f.querySelector('[name="' + n + '"]'); return i ? i.value.trim() : ''; };
  function bad(form, text) { var m = form.querySelector('.yq-msg'); m.className = 'yq-msg err'; m.textContent = text; }
  var hasEn = function (s) { return !!(s.content && s.content.en && s.content.en.enabled); };
  var enField = function (s, name, ph, max) { return hasEn(s) ? '<label>英文（選填）<input type="text" name="' + name + '" maxlength="' + max + '" placeholder="' + esc(ph) + '" autocomplete="off" enterkeyhint="done"></label>' : ''; };

  // 公告／臨時公休
  function noticeForm(s, closed) {
    var c = s.content || {}, n = liveNotice(c);
    var keep = n && !!n.closed === closed ? n : null;
    var from = keep ? (keep.from < twDay() ? twDay() : keep.from) : twDay(), to = keep ? keep.to : closed ? twDay() : twDay(6);
    var text = keep ? keep.text : closed ? '臨時公休，造成不便敬請見諒' : '';
    var chips = closed
      ? [['今天', 0, 0], ['明天', 1, 1], ['今明兩天', 0, 1]]
      : [['一週', 0, 6], ['兩週', 0, 13], ['一個月', 0, 29]];
    var form = sheet(closed ? '臨時公休' : '網站公告',
      closed ? '網站每一頁上方會出現公休公告，期間內線上預約也不開放。期間過了公告自動消失，不用回來改。' : '網站每一頁上方會出現一行公告，期間過了自動消失。',
      '<div class="yq-chips" role="group" aria-label="快速選日期">' + chips.map(function (x) { return '<button type="button" class="yq-chip" data-d="' + x[1] + ',' + x[2] + '">' + x[0] + '</button>'; }).join('') + '</div>' +
      '<div class="yq-2"><label>' + (closed ? '公休開始' : '開始顯示') + '<input type="date" name="from" value="' + from + '" min="' + twDay() + '" required></label>' +
      '<label>' + (closed ? '公休結束' : '最後一天') + '<input type="date" name="to" value="' + to + '" min="' + twDay() + '" required></label></div>' +
      '<label>' + (closed ? '說明' : '公告內容') + '<input type="text" name="text" maxlength="80" value="' + esc(text) + '" placeholder="' + (closed ? '例如：員工旅遊，11/12 恢復營業' : '例如：週年慶全品項九折，到月底') + '" enterkeyhint="done" required></label>' +
      enField(s, 'textEn', closed ? '空白＝自動顯示 Temporarily closed 與日期' : '空白＝英文版不顯示這則公告', 200) +
      (keep ? '' : n ? '<p class="yq-note">發佈後會取代目前的公告。</p>' : ''));
    var sync = function () { var f = form.querySelector('[name=from]'), t = form.querySelector('[name=to]'); if (f.value) t.min = f.value; form.querySelectorAll('.yq-chip').forEach(function (b) { var d = b.getAttribute('data-d').split(','); b.setAttribute('aria-pressed', String(f.value === twDay(+d[0]) && t.value === twDay(+d[1]))); }); };
    form.addEventListener('click', function (e) { var b = e.target.closest('.yq-chip'); if (!b) return; var d = b.getAttribute('data-d').split(','); form.querySelector('[name=from]').value = twDay(+d[0]); form.querySelector('[name=to]').value = twDay(+d[1]); sync(); });
    form.addEventListener('input', sync); sync();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = val(form, 'from'), t = val(form, 'to'), tx = val(form, 'text'), en = val(form, 'textEn');
      if (!DATE_RE.test(f) || !DATE_RE.test(t)) return bad(form, '請選擇日期');
      if (t < f) return bad(form, '結束日期不能早於開始日期');
      if (t < twDay()) return bad(form, '結束日期已經過了');
      if ((Date.parse(t) - Date.parse(f)) / 864e5 > 61) return bad(form, '公告期間最多兩個月');
      if (!tx) return bad(form, closed ? '請寫一句說明，例如「臨時公休，造成不便敬請見諒」' : '請寫公告內容');
      apply(s, form, function (c) { c.notice = { text: tx, from: f, to: t, closed: closed }; if (en) c.notice.textEn = en; });
    });
    pendingCheck(s, form);
  }
  function cancelForm(s) {
    var n = liveNotice(s.content || {}); if (!n) return;
    var form = sheet('取消公告', '網站上方的「' + esc(n.text) + '」會拿掉' + (n.closed ? '，預約也恢復開放' : '') + '。', '', '取消公告並發佈');
    form.addEventListener('submit', function (e) { e.preventDefault(); apply(s, form, function (c) { c.notice = { text: '', from: '', to: '', closed: false }; }); });
    pendingCheck(s, form);
  }

  // 發一則消息
  function newsForm(s) {
    var list = ((s.content && s.content.news) || []).filter(function (x) { return x && x.title; });
    var full = list.length >= 6 ? list[list.length - 1] : null;
    var form = sheet('發一則消息', '會放在網站「最新消息」的最上面。', '<label>標題<input type="text" name="title" maxlength="60" placeholder="例如：秋季新品上市，栗子蒙布朗開賣" enterkeyhint="done" required></label>' +
      enField(s, 'titleEn', '空白＝英文版不顯示這則', 150) +
      '<label>日期<input type="date" name="date" value="' + twDay() + '"></label>' +
      (full ? '<p class="yq-note">最新消息最多 6 則，最舊的「' + esc(full.title) + '」會被換下來（之後可以在編輯器的版本紀錄找回）。</p>' : ''));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = val(form, 'title'), d = val(form, 'date'), en = val(form, 'titleEn');
      if (!t) return bad(form, '請寫標題');
      var item = { date: DATE_RE.test(d) ? d : twDay(), title: t }; if (en) item.titleEn = en;
      apply(s, form, function (c) { c.news = [item].concat((c.news || []).filter(function (x) { return x && x.title; })).slice(0, 6); });
    });
    pendingCheck(s, form);
  }

  // 營業時間
  function hoursForm(s) {
    var h = (s.content && s.content.hours) || {};
    var row = function (d) { var x = h[d] || {}; return '<div class="yq-hr' + (x.closed ? ' off' : '') + '" data-d="' + d + '"><b>' + DL[d] + '</b>' +
      '<input type="time" name="o-' + d + '" value="' + esc(x.open || '') + '" step="300" aria-label="' + DL[d] + '開始"' + (x.closed ? ' disabled' : '') + '>' +
      '<input type="time" name="c-' + d + '" value="' + esc(x.close || '') + '" step="300" aria-label="' + DL[d] + '結束"' + (x.closed ? ' disabled' : '') + '>' +
      '<label><input type="checkbox" name="x-' + d + '"' + (x.closed ? ' checked' : '') + '>休</label></div>'; };
    var form = sheet('營業時間', '改完會更新網站上的營業時間，以及 Google 看到的營業資訊。只是哪幾天臨時不開，用「臨時公休」比較方便。',
      DAYS.map(row).join('') + '<p style="margin:8px 0 0"><button type="button" class="m-btn sm" data-all>週一的時間套用到每天</button></p>' +
      '<label>備註（選填）<input type="text" name="note" maxlength="80" value="' + esc((s.content && s.content.hoursNote) || '') + '" placeholder="例如：國定假日照常營業" enterkeyhint="done"></label>');
    form.addEventListener('change', function (e) { var cb = e.target; if (cb.type !== 'checkbox') return; var r = cb.closest('.yq-hr'); r.classList.toggle('off', cb.checked); r.querySelectorAll('input[type=time]').forEach(function (i) { i.disabled = cb.checked; }); });
    form.addEventListener('click', function (e) {
      if (!e.target.closest('[data-all]')) return;
      var o = form.querySelector('[name=o-mon]').value, c = form.querySelector('[name=c-mon]').value, x = form.querySelector('[name=x-mon]').checked;
      DAYS.slice(1).forEach(function (d) { form.querySelector('[name=o-' + d + ']').value = o; form.querySelector('[name=c-' + d + ']').value = c; var cb = form.querySelector('[name=x-' + d + ']'); cb.checked = x; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var out = {}, open1 = false;
      for (var i = 0; i < DAYS.length; i++) {
        var d = DAYS[i], closed = form.querySelector('[name=x-' + d + ']').checked, o = val(form, 'o-' + d), c = val(form, 'c-' + d);
        if (!closed && (!!o !== !!c || (o && (!TIME_RE.test(o) || !TIME_RE.test(c))))) return bad(form, DL[d] + '的營業時間要填開始和結束');
        out[d] = closed ? { open: '', close: '', closed: true } : { open: o, close: c, closed: false };
        if (!closed && o) open1 = true;
      }
      if (!open1) return bad(form, '至少要有一天有營業時間（整週都不開的話，用「臨時公休」）');
      var note = val(form, 'note');
      apply(s, form, function (c) { c.hours = out; c.hoursNote = note; });
    });
    pendingCheck(s, form);
  }

  async function copy(s, btn) {
    try { await navigator.clipboard.writeText(s.public_url); }
    catch (e) { var t = document.createElement('textarea'); t.value = s.public_url; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e2) { /* ignore */ } t.remove(); }
    var old = btn.textContent; btn.textContent = '已複製'; setTimeout(function () { btn.textContent = old; }, 1600);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.yq [data-yq]'); if (!b) return;
    var wrap = b.closest('.yq'), s = sites[wrap.getAttribute('data-yq-site')]; if (!s) return;
    var k = b.getAttribute('data-yq');
    if (k === 'closed') noticeForm(s, true);
    else if (k === 'notice') noticeForm(s, false);
    else if (k === 'cancel') cancelForm(s);
    else if (k === 'news') newsForm(s);
    else if (k === 'hours') hoursForm(s);
    else if (k === 'copy') copy(s, b);
    else if (k === 'share') navigator.share({ title: (s.content && s.content.name) || '', url: s.public_url }).catch(function () { /* 取消 */ });
  });

  window.YCQuick = { html: html };
})();
