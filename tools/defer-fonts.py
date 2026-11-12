#!/usr/bin/env python3
"""把 Google 字型改成頁面載入完成後才下載（不拖慢主要內容出現的時間）。
用法：python3 tools/defer-fonts.py（可重複執行，已改過的頁面不會再改）"""
import re, subprocess, html, os, urllib.parse
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PRE = re.compile(r'[ \t]*<link[^>]*rel="preload"[^>]*fonts\.googleapis\.com/css2[^>]*>\n?|[ \t]*<link[^>]*fonts\.googleapis\.com/css2[^>]*rel="preload"[^>]*>\n?')
CSS = re.compile(r'<link(?=[^>]*fonts\.googleapis\.com/css2)(?=[^>]*media="print")[^>]*>')
n = 0
for f in subprocess.check_output(['git', 'ls-files', '*.html'], cwd=ROOT).decode().split():
    p = os.path.join(ROOT, f); s = open(p, encoding='utf-8').read(); o = s
    if 'id="yc-webfont"' in s: continue
    m = CSS.search(s)
    if not m: continue
    url = html.unescape(re.search(r'href="([^"]+)"', m.group(0)).group(1))
    js = ('<script id="yc-webfont">/* 字型等頁面顯示後才下載，主要內容不用等字型 */(function(){var u=' + repr(url).replace("'", '"') +
          ';function a(){var l=document.createElement("link");l.rel="stylesheet";l.href=u;document.head.appendChild(l);}'
          'if(document.readyState==="complete")a();else addEventListener("load",function(){setTimeout(a,0);});})();</script>')
    # 首頁也一樣：開場標語的字在 1.35 秒後才逐字出現，字型通常在那之前就下載完
    s = s[:m.start()] + js + s[m.end():]
    s = PRE.sub('', s)
    if s != o: open(p, 'w', encoding='utf-8').write(s); n += 1
print('改了', n, '頁')
