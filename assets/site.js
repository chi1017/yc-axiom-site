
    /* ── Heading entrance ──
       Previously a character-scramble "decode" effect — replaced with a
       quiet fade + rise so headings feel considered rather than glitchy. */
    function decodeTextEffect(element) {
        if (element.hasAttribute('data-keep-html')) {
            // keep inner markup (e.g. the accent-coloured word) instead of flattening it to plain text
            if (!element.dataset.html) element.dataset.html = element.innerHTML;
            element.innerHTML = element.dataset.html;
        } else {
            element.innerText = element.dataset.original || element.innerText;
        }
        element.style.transition = 'none';
        element.style.opacity = '0';
        element.style.transform = 'translateY(10px)';
        void element.offsetHeight;
        element.style.transition = 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)';
        requestAnimationFrame(() => {
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        });
    }

    /* ── Magnetic Physics Buttons ──
       Toned down further: low pull strength + a tight clamp, so it reads as
       a faint nudge toward the cursor rather than the button swinging. */
    if (window.innerWidth > 1024) {
        const MAG_STRENGTH = 0.12;
        const MAG_MAX = 7;
        document.querySelectorAll('.magnetic').forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                const tx = Math.max(-MAG_MAX, Math.min(MAG_MAX, x * MAG_STRENGTH));
                const ty = Math.max(-MAG_MAX, Math.min(MAG_MAX, y * MAG_STRENGTH));
                btn.style.transform = `translate(${tx}px, ${ty}px)`;
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = `translate(0px, 0px)`;
            });
        });
    }

    /* ── Retina / High-DPI Hero Particle Canvas ── */
    const canvas = document.getElementById('hero-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        let mouseX = 0, mouseY = 0;
        
        function resizeCanvas() {
            const dpr = window.devicePixelRatio || 1;
            const width = canvas.parentElement.clientWidth;
            const height = canvas.parentElement.clientHeight;
            
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top;
        });

        const displayWidth = () => canvas.parentElement.clientWidth;
        const displayHeight = () => canvas.parentElement.clientHeight;

        for (let i = 0; i < 50; i++) {
            particles.push({
                x: Math.random() * displayWidth(),
                y: Math.random() * displayHeight(),
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 1
            });
        }

        function drawParticles() {
            const w = displayWidth();
            const h = displayHeight();
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(95, 163, 150, 0.6)';
            ctx.strokeStyle = 'rgba(95, 163, 150, 0.08)';

            particles.forEach((p, i) => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0 || p.x > w) p.vx *= -1;
                if (p.y < 0 || p.y > h) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();

                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }

                // Interactive Mouse Distort
                const mDist = Math.hypot(p.x - mouseX, p.y - mouseY);
                if (mDist < 100) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(95, 163, 150, 0.25)';
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(mouseX, mouseY);
                    ctx.stroke();
                }
            });
            requestAnimationFrame(drawParticles);
        }
        drawParticles();
    }

    /* ── 3D Card Tilt Effect ──
       Kept intentionally understated: divisor pushed way up and each axis
       hard-clamped to ±TILT_MAX degrees, so even a wide card (about-features,
       form-box) never rotates further than a faint tilt — a hint of depth,
       not a wobble. */
    const TILT_MAX = 3.5;
    document.querySelectorAll('.tilt-card').forEach(card => {
        // Cards that contain links/buttons/fields stay still: a tilting, moving target made them jittery and hard to click.
        if (card.querySelector('a, button, input, textarea, select')) return;
        // Measure once on enter: re-measuring a rotated card every move feeds back into the tilt and makes it shake.
        let rect = null;
        card.addEventListener('mouseenter', () => { rect = card.getBoundingClientRect(); });
        card.addEventListener('mousemove', (e) => {
            if (!rect) rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = Math.max(-TILT_MAX, Math.min(TILT_MAX, (y - centerY) / 42));
            const rotateY = Math.max(-TILT_MAX, Math.min(TILT_MAX, (centerX - x) / 42));

            card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) translateY(0px)';
        });
    });

    /* ── Number Counter Animation ── */
    function animateCounters() {
        document.querySelectorAll('.counter').forEach(counter => {
            const target = +counter.getAttribute('data-target');
            let count = 0;
            const speed = Math.max(1, target / 30);
            
            const updateCount = () => {
                count += speed;
                if (count < target) {
                    counter.innerText = Math.ceil(count);
                    setTimeout(updateCount, 35);
                } else {
                    counter.innerText = target;
                }
            };
            updateCount();
        });
    }

    /* ── Scroll Progress Bar ── */
    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        document.getElementById('scroll-progress').style.width = scrolled + '%';
    });

    /* ── IntersectionObserver Scroll Reveal & Text Decode Trigger ── */
    let counterTriggered = false;
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                if (!counterTriggered && entry.target.querySelector('.counter')) {
                    animateCounters();
                    counterTriggered = true;
                }
                const decodeEl = entry.target.querySelector('.decode-text');
                if (decodeEl && !decodeEl.dataset.decoded) {
                    decodeTextEffect(decodeEl);
                    decodeEl.dataset.decoded = "true";
                }
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    /* ── Custom Cursor Motion ── */
    const cursorDot = document.getElementById('cursor-dot');
    const cursorFollower = document.getElementById('cursor-follower');

    if (window.innerWidth > 1024) {
        window.addEventListener('mousemove', (e) => {
            const posX = e.clientX;
            const posY = e.clientY;

            cursorDot.style.left = `${posX}px`;
            cursorDot.style.top = `${posY}px`;

            cursorFollower.animate({
                left: `${posX}px`,
                top: `${posY}px`
            }, { duration: 400, fill: "forwards" });
        });

        /* Mouse events inside the embedded SEO tool iframe never reach this page, so the
           decorative cursor would freeze at the iframe's edge — hide it while over the tool
           (and while the pointer is outside the window). */
        const hideCursor = () => { cursorDot.style.opacity = '0'; cursorFollower.style.opacity = '0'; };
        const showCursor = () => { cursorDot.style.opacity = ''; cursorFollower.style.opacity = ''; };
        const seoToolFrame = document.getElementById('seoToolFrame');
        if (seoToolFrame) {
            seoToolFrame.addEventListener('mouseenter', hideCursor);
            seoToolFrame.addEventListener('mouseleave', showCursor);
        }
        document.documentElement.addEventListener('mouseleave', hideCursor);
        document.documentElement.addEventListener('mouseenter', showCursor);

        document.querySelectorAll('a, button, .form-chip, .work-item, .faq-item, .tilt-card').forEach(el => {
            el.addEventListener('mouseenter', () => {
                cursorFollower.style.transform = 'translate(-50%, -50%) scale(1.4)';
                cursorFollower.style.borderColor = 'var(--accent)';
                cursorFollower.style.backgroundColor = 'rgba(95, 163, 150, 0.05)';
            });
            el.addEventListener('mouseleave', () => {
                cursorFollower.style.transform = 'translate(-50%, -50%) scale(1)';
                cursorFollower.style.borderColor = 'rgba(95, 163, 150, 0.4)';
                cursorFollower.style.backgroundColor = 'transparent';
            });
        });
    }

    /* ── Portfolio Filter System ── */
    function filterWorks(category, btn) {
        document.querySelectorAll('.works-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const items = document.querySelectorAll('.work-item');
        items.forEach(item => {
            const categories = item.dataset.category.split(' ');
            if (category === 'all' || categories.includes(category)) {
                item.classList.remove('hidden');
                item.classList.add('fade-in');
            } else {
                item.classList.add('hidden');
                item.classList.remove('fade-in');
            }
        });
    }

    /* ── FAQ Accordion ── */
    function toggleFaq(element) {
        const item = element.parentElement;
        const open = item.classList.toggle('open');
        element.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function faqKeydown(e, element) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            toggleFaq(element);
        }
    }

    /* ── Pricing Tabs ── */
    function switchTab(id) {
        document.querySelectorAll('.pricing-tab').forEach((t, i) => {
            t.classList.toggle('active', ['list','buyout','monthly'][i] === id);
        });
        document.querySelectorAll('.pricing-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('tab-' + id).classList.add('active');
    }

    /* ── Page Navigation ── */
    /* ── SEO tool: auto-size the embedded tool so it scrolls with the page (no inner scrollbar) ── */
    (function () {
        var fr = document.getElementById('seoToolFrame');
        if (!fr) return;
        var raf = 0;
        function sendViewport() {
            raf = 0;
            if (!fr.contentWindow) return;
            var r = fr.getBoundingClientRect();
            var top = Math.max(0, 96 - r.top);
            var bottom = Math.min(r.height, window.innerHeight - r.top);
            fr.contentWindow.postMessage({ type: 'seo-viewport', top: top, height: Math.max(0, bottom - top) }, '*');
        }
        function queue() { if (!raf) raf = requestAnimationFrame(sendViewport); }
        window.addEventListener('scroll', queue, { passive: true });
        window.addEventListener('resize', queue);
        window.addEventListener('message', function (e) {
            if (e.source !== fr.contentWindow || !e.data || e.data.type !== 'seo-tool-height') return;
            var h = Math.ceil(e.data.height);
            if (h > 200) fr.style.height = h + 'px';
            queue();
        });
        fr.addEventListener('load', queue);
    })();

    
    /* ── Page load: tracking + heading entrance ── */
    (function () {
        function ready() {
            if (window.ycTrack) window.ycTrack.page();
            var active = document.querySelector('.page.active');
            var h = active && active.id !== 'page-home' && active.querySelector('.decode-text');
            if (h && typeof decodeTextEffect === 'function') decodeTextEffect(h);
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
    })();

    function toggleMobileMenu() {
        const m = document.getElementById('mobile-menu');
        m.classList.toggle('open');
        document.body.style.overflow = m.classList.contains('open') ? 'hidden' : '';
    }
    // 手機選單：按 Esc 關閉
    document.addEventListener('keydown', function (e) {
        var m = document.getElementById('mobile-menu');
        if (e.key === 'Escape' && m && m.classList.contains('open')) toggleMobileMenu();
    });

;

(function(){
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var hero = document.querySelector('#page-home .hero');
    var frame = hero ? hero.querySelector('.hero-logo-frame') : null;
    var ring2 = hero ? hero.querySelector('.hero-logo-ring-2') : null;

    var glows = Array.prototype.slice.call(document.querySelectorAll('.page-header-glow'));

    if(!frame && !ring2 && !glows.length) return;

    var ticking = false;
    function update(){
        var y = window.scrollY || window.pageYOffset;

        if(hero){
            var heroH = hero.offsetHeight;
            if(y < heroH){
                if(frame) frame.style.transform = 'translateZ(0) translateY(' + (y * 0.12).toFixed(2) + 'px)';
                if(ring2) ring2.style.transform = 'translateY(' + (y * 0.22).toFixed(2) + 'px)';
            }
        }

        for(var i = 0; i < glows.length; i++){
            var g = glows[i];
            if(g.offsetParent === null) continue; // hidden (inactive) page — skip
            if(y < 640){
                g.style.transform = 'translateY(' + (y * 0.18).toFixed(2) + 'px)';
            }
        }

        ticking = false;
    }
    window.addEventListener('scroll', function(){
        if(!ticking){ window.requestAnimationFrame(update); ticking = true; }
    }, {passive: true});
})();

;

/* Theme toggle: dark (default) / light, remembered per visitor */
(function () {
    var root = document.documentElement;
    var meta = document.querySelector('meta[name="theme-color"]');
    function current() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
    function sync() {
        var light = current() === 'light';
        var btn = document.getElementById('theme-toggle');
        if (btn) {
            var label = light ? '切換為深色模式' : '切換為淺色模式';
            btn.setAttribute('aria-label', label);
            btn.setAttribute('title', label);
        }
        if (meta) meta.setAttribute('content', light ? '#F6F3EC' : '#5FA396');
    }
    window.toggleTheme = function () {
        var next = current() === 'light' ? 'dark' : 'light';
        root.classList.add('theme-anim');
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('yc-theme', next); } catch (e) {}
        sync();
        setTimeout(function () { root.classList.remove('theme-anim'); }, 400);
    };
    sync();
})();

;

/* Hero 3D monogram: lazy, idle-built, pauses off-screen, skipped for reduced-motion. Flat SVG is the fallback. */
(function(){
    var mark = document.querySelector('.logo-mark--hero');
    var obj = document.getElementById('logo3dObj');
    if(!mark || !obj) return;
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var built = false, running = false, visible = false, rafId = null;
    var rx = 0, ry = 0, tx = 0, ty = 0, t0 = 0, pointerOn = false, px = 0, py = 0;

    function build(){
        if(built) return; built = true;
        var html = '', i, n, z, b;
        n = 10;
        for(i = 0; i < n; i++){
            z = -14 + i * 2.6; b = (0.45 + 0.55 * (i / (n - 1))).toFixed(2);
            html += '<svg class="logo3d-layer" viewBox="0 0 64 64" fill="none" style="transform:translateZ(' + z.toFixed(1) + 'px);filter:brightness(' + b + ')"><use href="#ring3d"/></svg>';
        }
        n = 12;
        for(i = 0; i < n; i++){
            z = 18 + i * 2.4; b = (0.4 + 0.6 * (i / (n - 1))).toFixed(2);
            html += '<svg class="logo3d-layer" viewBox="0 0 64 64" fill="none" style="transform:translateZ(' + z.toFixed(1) + 'px);filter:brightness(' + b + ')' + (i === n - 1 ? ' drop-shadow(0 0 4px rgba(95,163,150,.7))' : '') + '"><use href="#y3d"/></svg>';
        }
        obj.innerHTML = html;
        // 3D layers are in the DOM; reveal on the next frame so the cross-fade runs
        requestAnimationFrame(function(){ mark.classList.add('is-3d'); });
    }

    function loop(t){
        if(!running) return;
        if(!t0) t0 = t;
        if(pointerOn && !coarse){
            ty = px * 40; tx = -py * 22;
        } else {
            ty = Math.sin((t - t0) / 1700) * 18;
            tx = Math.cos((t - t0) / 2300) * 6;
        }
        rx += (tx - rx) * 0.08; ry += (ty - ry) * 0.08;
        obj.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
        rafId = requestAnimationFrame(loop);
    }
    function start(){ if(running || !visible || document.hidden) return; running = true; rafId = requestAnimationFrame(loop); }
    function stop(){ running = false; if(rafId){ cancelAnimationFrame(rafId); rafId = null; } }

    if(!coarse){
        window.addEventListener('pointermove', function(e){
            var r = mark.getBoundingClientRect();
            if(!r.width) return;
            px = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
            py = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
            pointerOn = true;
        }, {passive: true});
        document.addEventListener('pointerleave', function(){ pointerOn = false; });
    }
    document.addEventListener('visibilitychange', function(){ document.hidden ? stop() : start(); });

    function init(){
        if(!('IntersectionObserver' in window)) return;
        var io = new IntersectionObserver(function(es){
            visible = es[0].isIntersecting;
            if(visible){
                (window.requestIdleCallback || function(f){ setTimeout(f, 200); })(function(){ build(); start(); });
            } else stop();
        }, {threshold: 0.1});
        io.observe(mark);
    }
    if(document.readyState === 'complete') init(); else window.addEventListener('load', init);
})();

/* ── 導覽列「會員專區」入口：未登入顯示「會員登入」；已登入顯示「會員專區」下拉選單（會員專區／我的網站／網站編輯器／管理後台／登出） ──
   不需要在每一頁載入 Supabase：用瀏覽器裡的登入紀錄判斷狀態，只有按「登出」時才會載入登入元件。 */
(function () {
    'use strict';
    var navRight = document.querySelector('nav .nav-right');
    if (!navRight || document.getElementById('yc-nav-member')) return;
    var me = document.querySelector('script[src*="assets/site.js"]');
    var root = me ? new URL('../', me.src).href : location.origin + '/';
    var CFG = window.YC_CONFIG || {};
    var ref = 'gatgcuntwqibpxhjviqw';
    try { if (CFG.supabaseUrl) ref = new URL(CFG.supabaseUrl).hostname.split('.')[0]; } catch (e) {}
    var KEY = 'sb-' + ref + '-auth-token';

    // 回傳 null（未登入）或 { admin: 是否為管理員 }
    function readState() {
        try {
            var raw = localStorage.getItem(KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || !(o.access_token || o.refresh_token)) return null;
            var admin = false;
            try {
                var pl = JSON.parse(decodeURIComponent(escape(atob(String(o.access_token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
                admin = !!(pl && pl.app_metadata && pl.app_metadata.role === 'admin');
            } catch (e) {}
            return { admin: admin };
        } catch (e) { return null; }
    }
    function loadScript(src) {
        return new Promise(function (ok, no) {
            var s = document.createElement('script');
            s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s);
        });
    }
    async function signOut() {
        try {
            if (window.YC && typeof window.YC.signOut === 'function') {
                await window.YC.signOut();
            } else {
                if (!window.YC_CONFIG) await loadScript(root + 'assets/supabase-config.js');
                if (!window.supabase) await loadScript(root + 'assets/vendor/supabase-2.117.2.min.js');
                var c = window.YC_CONFIG;
                if (window.supabase && c && c.supabaseUrl) {
                    await window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } }).auth.signOut();
                }
            }
        } catch (e) { /* 連線失敗時仍清掉這台裝置上的登入紀錄 */ }
        try { localStorage.removeItem(KEY); } catch (e) {}
        render();
    }

    var st = document.createElement('style');
    st.textContent =
        '.nav-member{position:relative;display:flex;align-items:center;margin-right:4px}' +
        '.nav-member>a{font-family:var(--f-ui);font-size:13px;font-weight:600;letter-spacing:.05em;color:var(--accent);padding:8px 6px;text-decoration:none;white-space:nowrap;transition:color .2s}' +
        '.nav-member>a:hover{color:var(--text-bright)}' +
        '.nav-member.has-menu>a::after{content:"";display:inline-block;margin-left:6px;width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg)}' +
        '.nav-member-menu{position:absolute;top:100%;right:0;min-width:176px;margin:0;padding:12px 0 0;list-style:none;opacity:0;visibility:hidden;transition:opacity .18s,visibility .18s;z-index:60}' +
        '.nav-member-menu::before{content:"";position:absolute;inset:12px 0 0 0;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 14px 34px rgba(0,0,0,.28);z-index:-1}' +
        '.nav-member.has-menu:hover .nav-member-menu,.nav-member.has-menu:focus-within .nav-member-menu{opacity:1;visibility:visible}' +
        '.nav-member-menu li{padding:0 6px}.nav-member-menu li:first-child{padding-top:6px}.nav-member-menu li:last-child{padding-bottom:6px}' +
        '.nav-member-menu a,.nav-member-menu button{display:block;width:100%;text-align:left;box-sizing:border-box;padding:9px 12px;border:none;background:none;border-radius:7px;cursor:pointer;font-family:var(--f-ui);font-size:14px;font-weight:500;color:var(--text);text-decoration:none;white-space:nowrap;letter-spacing:0}' +
        '.nav-member-menu a:hover,.nav-member-menu button:hover,.nav-member-menu a:focus-visible,.nav-member-menu button:focus-visible{background:var(--accent-dim);color:var(--accent)}' +
        '.nav-member-menu .sep{height:1px;margin:4px 12px;background:var(--border);padding:0}' +
        '@media (max-width:768px){.nav-member{display:none}}';
    document.head.appendChild(st);

    var wrap = document.createElement('div');
    wrap.id = 'yc-nav-member'; wrap.className = 'nav-member';
    var link = document.createElement('a');
    link.href = root + 'dashboard/';
    var menu = document.createElement('ul');
    menu.className = 'nav-member-menu'; menu.setAttribute('aria-label', '會員選單');
    wrap.appendChild(link); wrap.appendChild(menu);
    navRight.insertBefore(wrap, navRight.firstChild);

    function item(label, href) {
        var li = document.createElement('li'), a = document.createElement('a');
        a.href = href; a.textContent = label; li.appendChild(a); return li;
    }
    var mm = document.getElementById('mobile-menu');
    var mobileEls = [];
    function clearMobile() { mobileEls.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); }); mobileEls = []; }
    function addMobile(label, href, onclick) {
        if (!mm) return;
        var a = document.createElement('a');
        a.className = 'mobile-nav-btn mobile-member'; a.href = href; a.textContent = label;
        if (onclick) a.onclick = function (e) { e.preventDefault(); onclick(); };
        mm.appendChild(a); mobileEls.push(a);
    }

    var last = '';
    function render() {
        var s = readState();
        var sig = s ? (s.admin ? 'admin' : 'member') : 'out';
        if (sig === last) return;
        last = sig;
        menu.innerHTML = '';
        clearMobile();
        if (!s) {
            link.textContent = '會員登入';
            link.setAttribute('aria-label', '會員登入或註冊');
            wrap.classList.remove('has-menu');
            addMobile('會員登入', root + 'dashboard/');
            return;
        }
        link.textContent = '會員專區';
        link.setAttribute('aria-label', '會員專區選單');
        wrap.classList.add('has-menu');
        menu.appendChild(item('會員專區', root + 'dashboard/'));
        menu.appendChild(item('我的網站', root + 'dashboard/#dash-site'));
        menu.appendChild(item('網站編輯器', root + 'builder/'));
        if (s.admin) menu.appendChild(item('管理後台', root + 'admin/'));
        var sep = document.createElement('li'); sep.className = 'sep'; sep.setAttribute('role', 'separator'); menu.appendChild(sep);
        var lo = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.textContent = '登出'; b.onclick = signOut; lo.appendChild(b); menu.appendChild(lo);
        addMobile('會員專區', root + 'dashboard/');
        addMobile('網站編輯器', root + 'builder/');
        if (s.admin) addMobile('管理後台', root + 'admin/');
        addMobile('登出', '#', signOut);
    }
    render();
    window.addEventListener('storage', render);
    setInterval(render, 1500);
})();

/* ── 手機版（App 樣式）：下方固定分頁列（首頁／服務／網站租用／LINE 諮詢／選單）。
   只在手機寬度顯示；選單鍵打開原本的全螢幕選單，Threads、Instagram 移到選單最下面。 ── */
(function () {
    'use strict';
    if (/\/admin\//.test(location.pathname) || document.getElementById('yc-tabbar')) return;
    var mm = document.getElementById('mobile-menu');
    var me = document.querySelector('script[src*="assets/site.js"]');
    var root = me ? new URL('../', me.src).href : location.origin + '/';
    var rel = location.href.indexOf(root) === 0 ? location.href.slice(root.length).split(/[?#]/)[0] : '';
    var cur = (rel === '' || rel === 'index.html') ? 'home' : /^services\//.test(rel) ? 'services' : /^rental\//.test(rel) ? 'rental' : '';
    var lineA = document.querySelector('a.line-float');
    var ico = function (d) { return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
    var tabs = [
        { k: 'home', href: root, label: '首頁', icon: ico('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>') },
        { k: 'services', href: root + 'services/', label: '服務', icon: ico('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>') },
        { k: 'rental', href: root + 'rental/', label: '網站租用', icon: ico('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>') },
        { k: 'line', href: lineA ? lineA.getAttribute('href') : '', label: 'LINE 諮詢', icon: lineA && lineA.querySelector('svg') ? lineA.querySelector('svg').outerHTML.replace(/width="\d+"/, 'width="24"').replace(/height="\d+"/, 'height="24"') : '' },
        { k: 'menu', label: '選單', icon: ico('<path d="M4 7h16M4 12h16M4 17h16"/>') }
    ];
    var nav = document.createElement('div');   // 不用 <nav>：網站樣式裡的 nav 規則是給上方導覽列的
    nav.id = 'yc-tabbar'; nav.className = 'tabbar'; nav.setAttribute('role', 'navigation'); nav.setAttribute('aria-label', '主要分頁');
    tabs.forEach(function (t) {
        if (t.k === 'line' && !t.href) return;
        var el;
        if (t.k === 'menu') {
            if (!mm) return;
            el = document.createElement('button'); el.type = 'button';
            el.setAttribute('aria-expanded', 'false'); el.setAttribute('aria-controls', 'mobile-menu');
            el.addEventListener('click', function () { if (typeof toggleMobileMenu === 'function') toggleMobileMenu(); });
        } else {
            el = document.createElement('a'); el.href = t.href;
            if (t.k === 'line') { el.target = '_blank'; el.rel = 'noopener'; el.className = 'tab-line'; el.setAttribute('aria-label', lineA.getAttribute('aria-label') || 'LINE 諮詢'); }
            if (t.k === cur) el.setAttribute('aria-current', 'page');
        }
        el.dataset.k = t.k;
        el.innerHTML = t.icon + '<span>' + t.label + '</span>';
        nav.appendChild(el);
    });
    document.body.appendChild(nav);
    document.documentElement.classList.add('has-tabbar');
    if (mm) {
        // 選單打開時，「選單」分頁亮起
        var mb = nav.querySelector('[data-k="menu"]');
        new MutationObserver(function () { if (mb) mb.setAttribute('aria-expanded', mm.classList.contains('open') ? 'true' : 'false'); }).observe(mm, { attributes: true, attributeFilter: ['class'] });
        // Threads、Instagram：手機上放進選單
        var sf = document.querySelectorAll('.social-float a.sf-threads, .social-float a.sf-ig');
        if (sf.length && !mm.querySelector('.mobile-social')) {
            var row = document.createElement('div'); row.className = 'mobile-social';
            sf.forEach(function (a) { var c = a.cloneNode(true); c.removeAttribute('data-tip'); c.className = 'mobile-social-a'; c.insertAdjacentHTML('beforeend', '<span>' + (a.classList.contains('sf-ig') ? 'Instagram' : 'Threads') + '</span>'); row.appendChild(c); });
            mm.appendChild(row);
        }
    }
})();
