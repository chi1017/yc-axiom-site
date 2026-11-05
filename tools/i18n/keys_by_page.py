# 列出每一頁的待翻譯段落（含共用段落出現次數），給翻譯用
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import build_en as B
from bs4 import BeautifulSoup
d = json.load(open(B.DICT, encoding='utf-8'))
files = B.pages()
for f in files: B.EN_PAGES.add(B.url_of(f))
per = {}
for f in files:
    cx = B.Ctx({})
    soup = BeautifulSoup(open(os.path.join(B.ROOT, f), encoding='utf-8').read(), 'html.parser')
    B.translate_tree(soup, cx, B.url_of(f))
    per[B.url_of(f)] = list(cx.missing.keys())
cnt = {}
for ks in per.values():
    for k in ks: cnt[k] = cnt.get(k, 0) + 1
json.dump({'per': per, 'cnt': cnt}, open(os.path.join(os.path.dirname(__file__), 'keys.json'), 'w', encoding='utf-8'), ensure_ascii=False)
want = sys.argv[1:]
seen = set(d)
out = []
for p in want:
    for k in per.get(p, []):
        if k not in seen:
            seen.add(k); out.append(k)
print(json.dumps(out, ensure_ascii=False, indent=0))
