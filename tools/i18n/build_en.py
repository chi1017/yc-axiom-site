import warnings; from bs4 import MarkupResemblesLocatorWarning; warnings.filterwarnings("ignore", category=MarkupResemblesLocatorWarning)
#!/usr/bin/env python3
"""官網英文版產生器：從中文頁面產生 /en/ 英文頁面。

做法：
1. 掃描中文頁面，把要翻譯的段落抽出來（段落裡的連結、粗體等標記換成 <a1>…</a1> 這類代號，
   所以同一句話在不同頁面、連結路徑不同也只要翻一次）。
2. 用 tools/i18n/en.json（中文 → 英文）替換，產生 en/<路徑>/index.html；
   連結改成英文頁、資源改成絕對路徑、加上 hreflang 與中英切換。
3. 沒有翻譯的段落寫到 tools/i18n/missing.json（保留中文，不會壞掉）。

用法：python3 tools/i18n/build_en.py [--check]
需要：pip install beautifulsoup4
"""
import html, json, os, re, subprocess, sys
from bs4 import BeautifulSoup, NavigableString, Comment, Tag

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SITE = 'https://yc-axiom.pages.dev'
DICT = os.path.join(ROOT, 'tools/i18n/en.json')
MISSING = os.path.join(ROOT, 'tools/i18n/missing.json')
CJK = re.compile(r'[　-〿㐀-鿿＀-￯]')
# 不做英文版：會員、後台、編輯器、示範、SEO／GEO 工具（工具本身不動）、驗證檔
SKIP = re.compile(r'^(en/|admin/|dashboard/|builder/|demo/|seo/|geo/|tools/website-check/|tools/image-compress/|google[0-9a-f]+\.html|.*-tool\.html|404\.html)')
INLINE = {'a', 'abbr', 'b', 'br', 'code', 'em', 'i', 'kbd', 'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'wbr'}
TRANS_ATTRS = ('title', 'alt', 'aria-label', 'placeholder', 'content', 'data-label', 'data-tip', 'data-title', 'value', 'data-original', 'data-text', 'data-g')

def pages():
    out = subprocess.check_output(['git', 'ls-files', '*.html'], cwd=ROOT).decode().split()
    return [f for f in out if f.endswith('.html') and not SKIP.match(f)]

def url_of(f):
    return '/' + (f[:-len('index.html')] if f.endswith('index.html') else f)

def norm(s):
    return re.sub(r'\s+', ' ', s).strip()

def has_cjk(s):
    return bool(s and CJK.search(s))

def is_leaf(tag):
    for d in tag.descendants:
        if isinstance(d, Tag) and d.name not in INLINE:
            return False
    return True

def to_ph(tag):
    """段落內容 → 代號字串，回傳 (key, attrs)"""
    attrs = {}
    n = [0]
    def walk(node):
        out = ''
        for c in node.children:
            if isinstance(c, Comment):
                continue
            if isinstance(c, NavigableString):
                out += html.escape(str(c), quote=False)
            elif c.name in ('br', 'wbr'):
                out += '<' + c.name + '>'
            else:
                n[0] += 1
                k = c.name + str(n[0])
                attrs[k] = (c.name, dict(c.attrs))
                out += '<' + k + '>' + walk(c) + '</' + k + '>'
        return out
    return norm(walk(tag)), attrs

TOK = re.compile(r'<(/?)([a-z]+)(\d*)>')
def from_ph(text, attrs):
    """英文代號字串 → HTML"""
    out, pos = [], 0
    for m in TOK.finditer(text):
        out.append(html.escape(html.unescape(text[pos:m.start()]), quote=False))
        close, name, num = m.group(1), m.group(2), m.group(3)
        if name in ('br', 'wbr') and not num:
            out.append('<' + name + '>')
        else:
            k = name + num
            if k not in attrs:
                raise ValueError('翻譯裡的標記 ' + m.group(0) + ' 在原文沒有：' + text[:80])
            if close:
                out.append('</' + attrs[k][0] + '>')
            else:
                tagname, a = attrs[k]
                s = ''.join(' ' + kk + ('' if v is None else '="' + html.escape(' '.join(v) if isinstance(v, list) else str(v)) + '"') for kk, v in a.items())
                out.append('<' + tagname + s + '>')
        pos = m.end()
    out.append(html.escape(html.unescape(text[pos:]), quote=False))
    return ''.join(out)

class Ctx:
    def __init__(self, d):
        self.d = d
        self.missing = {}
        self.used = set()
    def tr(self, key, where):
        if key in self.d and self.d[key]:
            self.used.add(key)
            return self.d[key]
        self.missing.setdefault(key, where)
        return None

JS_STR = re.compile(r'(["\'])((?:\\.|(?!\1).)*?[㐀-鿿＀-￯](?:\\.|(?!\1).)*?)\1')

def translate_json(o, cx, where):
    if isinstance(o, dict):
        for k, v in list(o.items()):
            if k == 'inLanguage':
                o[k] = 'en'
            else:
                o[k] = translate_json(v, cx, where)
        return o
    if isinstance(o, list):
        return [translate_json(v, cx, where) for v in o]
    if isinstance(o, str):
        if has_cjk(o):
            t = cx.tr(norm(o), where)
            return t if t else o
        if o.startswith(SITE + '/'):
            return en_url(o)
    return o

EN_PAGES = set()
def en_path(path):
    p = path.split('#')[0].split('?')[0]
    if p.endswith('index.html'):
        p = p[:-len('index.html')]
    if p in EN_PAGES:
        return '/en' + path if not path.startswith('/en/') else path
    return None

def en_url(u):
    if u.startswith(SITE + '/'):
        rest = u[len(SITE):]
        e = en_path(rest)
        return SITE + e if e else u
    return u

def absolutize(ref, base):
    if not ref or re.match(r'^(https?:|mailto:|tel:|data:|javascript:|#|//)', ref):
        return ref
    if ref.startswith('/'):
        return ref
    from urllib.parse import urljoin
    return urljoin(SITE + base, ref)[len(SITE):]

def fix_links(soup, base):
    for t in soup.find_all(True):
        for a in ('href', 'src', 'action', 'poster', 'data-src'):
            if t.has_attr(a):
                v = absolutize(t[a], base)
                if t.name in ('a', 'form') or (t.name == 'link' and a == 'href' and 'canonical' in (t.get('rel') or [])):
                    v2 = en_path(v) if v.startswith('/') else en_url(v)
                    v = v2 or v
                t[a] = v
        if t.has_attr('srcset'):
            parts = []
            for p in t['srcset'].split(','):
                bits = p.strip().split(' ', 1)
                bits[0] = absolutize(bits[0], base)
                parts.append(' '.join(bits))
            t['srcset'] = ', '.join(parts)
        if t.name == 'meta' and t.get('property') == 'og:url' and t.has_attr('content'):
            t['content'] = en_url(t['content'])

def translate_tree(soup, cx, where):
    def attrs_of(t):
        for a in TRANS_ATTRS:
            if t.has_attr(a) and isinstance(t[a], str) and has_cjk(t[a]):
                if t.name == 'meta' and a == 'content' and not (t.get('name') in ('description', 'keywords', 'twitter:title', 'twitter:description', 'apple-mobile-web-app-title') or (t.get('property') or '').startswith('og:')):
                    continue
                tt = cx.tr(norm(t[a]), where)
                if tt:
                    t[a] = tt
    def walk(node):
        for c in list(node.children):
            if isinstance(c, Comment):
                continue
            if isinstance(c, NavigableString):
                if has_cjk(str(c)) and node.name not in ('script', 'style'):
                    tt = cx.tr(norm(str(c)), where)
                    if tt:
                        lead = re.match(r'^\s*', str(c)).group(0); trail = re.search(r'\s*$', str(c)).group(0)
                        c.replace_with(lead + tt + trail)
                continue
            if not isinstance(c, Tag):
                continue
            attrs_of(c)
            if c.name == 'script':
                src = c.string or ''
                if (c.get('type') or '') == 'application/ld+json':
                    try:
                        data = json.loads(src)
                        c.string = json.dumps(translate_json(data, cx, where), ensure_ascii=False)
                    except Exception:
                        pass
                elif has_cjk(src):
                    def rep(m):
                        tt = cx.tr(norm(m.group(2)), where)
                        if not tt:
                            return m.group(0)
                        q = m.group(1)
                        return q + tt.replace('\\', '\\\\').replace(q, '\\' + q) + q
                    c.string = JS_STR.sub(rep, src)
                continue
            if c.name in ('style', 'svg', 'template', 'textarea'):
                continue
            if c.name not in ('html', 'head', 'body') and is_leaf(c) and has_cjk(c.get_text()):
                key, attrs = to_ph(c)
                for d in c.find_all(True):
                    attrs_of(d)
                key, attrs = to_ph(c)
                tt = cx.tr(key, where)
                if tt:
                    c.clear()
                    frag = BeautifulSoup(from_ph(tt, attrs), 'html.parser')
                    for x in list(frag.contents):
                        c.append(x)
                continue
            walk(c)
    attrs_of(soup.html) if soup.html else None
    walk(soup)

TOGGLE_ZH = '<a class="lang-toggle" href="{href}" hreflang="en" lang="en" aria-label="English version">EN</a>'
TOGGLE_EN = '<a class="lang-toggle" href="{href}" hreflang="zh-Hant" lang="zh-Hant" aria-label="中文版">中文</a>'

def alternates(path):
    return ('<link rel="alternate" hreflang="zh-Hant" href="' + SITE + path + '">'
            '<link rel="alternate" hreflang="en" href="' + SITE + '/en' + path + '">'
            '<link rel="alternate" hreflang="x-default" href="' + SITE + path + '">')

def add_alt_and_toggle(text, path, toggle):
    text = re.sub(r'<link rel="alternate" hreflang="[^"]*" href="[^"]*">', '', text)
    text = re.sub(r'<a class="lang-toggle"[^>]*>[^<]*</a>', '', text)
    text = text.replace('</head>', alternates(path) + '</head>', 1)
    m = re.search(r'(<div class="nav-right">\s*)', text)
    if m:
        text = text[:m.end()] + toggle + text[m.end():]
    return text

def main():
    check = '--check' in sys.argv
    d = json.load(open(DICT, encoding='utf-8')) if os.path.exists(DICT) else {}
    files = pages()
    for f in files:
        EN_PAGES.add(url_of(f))
    cx = Ctx(d)
    stale = []
    for f in files:
        path = url_of(f)
        src = open(os.path.join(ROOT, f), encoding='utf-8').read()
        # 中文頁：加 hreflang 與「EN」切換
        zh = add_alt_and_toggle(src, path, TOGGLE_ZH.format(href='/en' + path))
        if zh != src:
            if check: stale.append(f)
            else: open(os.path.join(ROOT, f), 'w', encoding='utf-8').write(zh)
        soup = BeautifulSoup(zh, 'html.parser')
        if soup.html:
            soup.html['lang'] = 'en'
        translate_tree(soup, cx, path)
        fix_links(soup, path)
        for m in soup.find_all('meta', attrs={'property': 'og:locale'}):
            m['content'] = 'en_US'
        out = str(soup)
        out = re.sub(r'<a [^>]*class="lang-toggle"[^>]*>[^<]*</a>', TOGGLE_EN.format(href=path), out)
        # 從英文版官網打開編輯器：介面用英文
        def _ui(m):
            u = m.group(1)
            if 'lang=' in u: return m.group(0)
            return 'href="' + u + ('&' if '?' in u else '?') + 'lang=en"'
        out = re.sub(r'href="(/builder/[^"]*)"', _ui, out)
        # 手機表頭空間小：諮詢按鈕用短字
        out = re.sub(r'(<a [^>]*class="nav-cta[^"]*"[^>]*>)Free Consultation(</a>)', r'\1<span class="cta-l">Free Consultation</span><span class="cta-s">Contact</span>\2', out)
        dest = os.path.join(ROOT, 'en', f)
        old = open(dest, encoding='utf-8').read() if os.path.exists(dest) else None
        if old != out:
            if check: stale.append('en/' + f)
            else:
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                open(dest, 'w', encoding='utf-8').write(out)
    # sitemap：每個有英文版的中文網址後面補一筆英文網址（重跑不重複）
    sm_path = os.path.join(ROOT, 'sitemap.xml')
    sm = open(sm_path, encoding='utf-8').read()
    sm2 = re.sub(r'\s*<url>\s*<loc>' + re.escape(SITE) + r'/en/[^<]*</loc>.*?</url>', '', sm, flags=re.S)
    def add_en(m):
        loc = m.group(2)
        if loc not in EN_PAGES: return m.group(0)
        return m.group(0) + m.group(1) + m.group(0).strip().replace('<loc>' + SITE + loc, '<loc>' + SITE + '/en' + loc, 1)
    sm2 = re.sub(r'(\n\s*)<url>\s*<loc>' + re.escape(SITE) + r'(/[^<]*)</loc>.*?</url>', lambda m: add_en(m), sm2, flags=re.S)
    if sm2 != sm:
        if check: stale.append('sitemap.xml')
        else: open(sm_path, 'w', encoding='utf-8').write(sm2)
    json.dump(cx.missing, open(MISSING, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('頁面', len(files), '／字典', len(d), '條（用到', len(cx.used), '）／缺翻譯', len(cx.missing), '條')
    if check and stale:
        print('英文版不是最新：', ', '.join(stale[:10])); sys.exit(1)

if __name__ == '__main__':
    main()
