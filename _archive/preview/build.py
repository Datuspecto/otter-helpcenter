#!/usr/bin/env python3
"""오터 헬프센터 미리보기 빌더 — drafts/*.md -> preview/site/*.html
   최종 구현(Astro + Cloudflare)이 아니라 '어떻게 보이는지' 확인용 정적 렌더러입니다."""
import os, re, json, shutil, html, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, "preview", "site")

CATS = [
    ("getting-started", "시작하기",        "오터포스를 처음 시작하시나요"),
    ("integrations",    "연동",            "배달앱·배달대행·POS 연동"),
    ("orders",          "주문 접수",       "주문을 받고 처리하기"),
    ("automation",      "주문 자동화",     "자동 수락과 자동 배차"),
    ("settings",        "설정",            "프린터·매장·가게 설정"),
    ("biz-manager",     "비즈니스 매니저", "매출 분석 웹 콘솔"),
    ("reviews",         "리뷰 관리",       "배달앱 리뷰 통합 관리"),
    ("pricing",         "요금·결제",       "이용요금과 결제 안내"),
    ("troubleshooting", "문제 해결",       "문제가 생겼을 때"),
    ("contact",         "문의",            "고객센터 연락처"),
]
CATNAME = {k: v for k, v, _ in CATS}

# ---------- 프론트매터 ----------
def parse(path):
    raw = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    if not m:
        return None
    meta, body = {}, m.group(2)
    for line in m.group(1).split("\n"):
        if ": " in line:
            k, v = line.split(": ", 1)
            meta[k.strip()] = v.strip()
    notes = re.findall(r"<!--\s*(.*?)\s*-->", body, re.S)
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    meta["_notes"] = notes
    return meta, body

# ---------- 마크다운 ----------
def inline(t):
    t = html.escape(t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", r'<img src="\2" alt="\1">', t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', t)
    return t

def md(body, slugs, toc=None):
    out, lines, i = [], body.split("\n"), 0
    in_exc = False
    hn = [0]
    while i < len(lines):
        ln = lines[i].rstrip()
        s = ln.strip()
        if not s:
            i += 1; continue
        # 예외 안내 블록 시작
        if s == "**예외 안내**":
            out.append('<div class="exception"><div class="exception-title">예외 안내</div>')
            in_exc = True; i += 1; continue
        if s == "---":
            if in_exc:
                out.append("</div>"); in_exc = False
            i += 1; continue
        if s.startswith("#"):
            if in_exc: out.append("</div>"); in_exc = False
            lv = len(s) - len(s.lstrip("#"))
            txt = s.lstrip("#").strip()
            hn[0] += 1; hid = f"sec-{hn[0]}"
            if toc is not None and lv in (2, 3):
                toc.append({"id": hid, "t": re.sub(r"[*`]", "", txt), "lv": lv})
            out.append(f'<h{lv+1} id="{hid}">{inline(txt)}</h{lv+1}>')
            i += 1; continue
        # 표
        if s.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            if len(rows) >= 2 and set("".join(rows[1]).replace(" ", "")) <= set("-:"):
                head, data = rows[0], rows[2:]
            else:
                head, data = None, rows
            t = ["<table>"]
            if head:
                t.append("<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead>")
            t.append("<tbody>")
            for r in data:
                t.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
            t.append("</tbody></table>")
            out.append("".join(t)); continue
        # 목록
        if re.match(r"^[-*] ", s) or re.match(r"^\d+\. ", s):
            ordered = bool(re.match(r"^\d+\. ", s))
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines):
                c = lines[i].strip()
                if re.match(r"^[-*] ", c) or re.match(r"^\d+\. ", c):
                    items.append(re.sub(r"^([-*]|\d+\.)\s+", "", c)); i += 1
                elif c == "":
                    nxt = lines[i+1].strip() if i+1 < len(lines) else ""
                    if re.match(r"^[-*] ", nxt) or re.match(r"^\d+\. ", nxt): i += 1
                    else: break
                else: break
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
            continue
        # 이미지 단독
        if s.startswith("!["):
            out.append(f'<figure>{inline(s)}</figure>'); i += 1; continue
        # 문단
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\||[-*] |\d+\. |!\[)", lines[i].strip()) and lines[i].strip() != "---":
            buf.append(lines[i].strip()); i += 1
        out.append("<p>" + "<br>".join(inline(b) for b in buf) + "</p>")
    if in_exc: out.append("</div>")
    h = "\n".join(out)
    # 없는 문서 링크는 텍스트로 강등 (규칙 검증용)
    def deadlink(m):
        href, text = m.group(1), m.group(2)
        if href.startswith("/help/") and href not in slugs:
            return f'<span class="deadlink" title="아직 없는 문서: {href}">{text}</span>'
        return m.group(0)
    return re.sub(r'<a href="([^"]+)">([^<]+)</a>', deadlink, h)

SEARCH_BOX = ('<div class="search {cls}"><input id="q" placeholder="{ph}" autocomplete="off">'
              '<div id="res"></div></div>')

# ---------- 좌측 전체 트리 ----------
def lnb_html(bycat, cur_cat, cur_slug, depth):
    up = "../" * depth
    parts = ['<nav class="lnb"><a class="lnb-home" href="%sindex.html">고객센터 홈</a><ul>' % up]
    for key, name, _ in CATS:
        docs = bycat.get(key, [])
        if not docs:
            parts.append(f'<li class="grp off"><span class="grp-t">{name}<em>준비 중</em></span></li>')
            continue
        op = " open" if key == cur_cat else ""
        items = "".join(
            f'<li><a href="{up}{key}/{o["slug"]}.html"'
            f'{" class=\"on\"" if (key==cur_cat and o["slug"]==cur_slug) else ""}>'
            f'{html.escape(o["title"])}</a></li>' for o in docs)
        parts.append(
            f'<li class="grp"><details{op}><summary class="grp-t">{name}</summary>'
            f'<ul class="grp-items">{items}</ul></details></li>')
    parts.append('</ul><a class="lnb-cta" href="https://www.tryotter.co.kr" target="_blank" rel="noopener">오터포스 홈페이지</a></nav>')
    return "".join(parts)

# ---------- 템플릿 ----------
def page(title, body, depth=0, search=False, lnb="", cls=""):
    up = "../" * depth
    gnb_search = SEARCH_BOX.format(cls="gnb-search", ph="검색") if search else ""
    return f"""<!DOCTYPE html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} · 오터포스 고객센터</title>
<link rel="stylesheet" href="{up}style.css">
</head><body class="{cls}" data-hero="a">
<header class="gnb"><div class="wrap">
<a class="logo" href="{up}index.html"><img src="{up}assets/otter-logo.svg" alt="Otter"><span class="sub">고객센터</span></a>
<div class="gnb-right">{gnb_search}<button class="icon-btn search-toggle" aria-label="검색"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5" stroke-linecap="round"/></svg></button><button class="icon-btn nav-toggle" aria-label="메뉴"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><a class="gnb-cta" href="https://www.tryotter.co.kr" target="_blank" rel="noopener">오터포스 홈페이지</a></div>
</div></header>
<div class="backdrop"></div>
<main class="wrap">{lnb}{body}</main>
<footer><div class="wrap">
<p>해결되지 않으셨나요? 고객센터 <b>070-8874-5455</b> · <a href="https://pf.kakao.com/_FrxhJK/chat" target="_blank" rel="noopener">카카오톡 문의</a> · <a href="{up}contact/customer-support.html">운영 시간 안내</a></p>
<p class="tiny">테크놀로지인프라스트럭처코리아 유한회사 · 이 페이지는 <b>미리보기</b>이며 실제 서비스가 아닙니다.</p>
</div></footer>
<script>window.BASE="{up}";</script><div id="lb"><img></div>
<script src="{up}search.js"></script>
</body></html>"""

# ---------- 빌드 ----------
def build():
    if os.path.exists(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT)
    docs = []
    for f in sorted(glob.glob(os.path.join(ROOT, "drafts", "*", "*.md"))):
        r = parse(f)
        if not r: continue
        meta, body = r
        if "slug" not in meta: continue
        meta["_body"] = body
        docs.append(meta)
    slugs = {f"/help/{d['category']}/{d['slug']}" for d in docs}

    # 이미지 복사
    src = os.path.join(ROOT, "legacy-images")
    if os.path.isdir(src): shutil.copytree(src, os.path.join(OUT, "images"))
    a = os.path.join(ROOT, "preview", "assets")
    if os.path.isdir(a): shutil.copytree(a, os.path.join(OUT, "assets"))
    for f in ("style.css", "search.js"):
        shutil.copy(os.path.join(ROOT, "preview", f), os.path.join(OUT, f))

    bycat = {}
    for d in docs: bycat.setdefault(d["category"], []).append(d)
    for k in bycat: bycat[k].sort(key=lambda d: int(d.get("order", 99)))

    # 아티클
    for d in docs:
        cat = d["category"]
        os.makedirs(os.path.join(OUT, cat), exist_ok=True)
        notes = ""
        if d["_notes"]:
            items = "".join(f"<li>{html.escape(n)}</li>" for n in d["_notes"])
            notes = f'<details class="notes"><summary>편집자 확인 필요 {len(d["_notes"])}건</summary><ul>{items}</ul></details>'
        toc = []
        content = md(d["_body"], slugs, toc)
        tochtml = tocm = ""
        if toc:
            items = "".join(
                f'<li class="lv{t["lv"]}"><a href="#{t["id"]}">{html.escape(t["t"])}</a></li>' for t in toc)
            tochtml = f'<nav class="toc"><h4>목차</h4><ul>{items}</ul></nav>'
            tocm = f'<details class="toc-m"><summary>목차</summary><ul>{items}</ul></details>' 
        thumb = d.get("thumb", "").strip()
        if thumb == "none":
            banner = ""
        elif thumb:
            banner = f'<figure class="doc-hero"><img src="../{thumb}" alt=""></figure>'
        else:
            banner = f'<figure class="doc-hero"><img src="../assets/hero-{cat}.svg" alt=""></figure>'
        body = f"""<article class="doc">{banner}<h1>{html.escape(d['title'])}</h1>
<div class="meta">최종 수정 2026-08-25 · {html.escape(d.get('env','all'))}</div>
{tocm}{notes}{content}
<div class="helpful"><span>이 문서가 도움이 되었나요?</span><button>도움돼요</button><button>아쉬워요</button></div>
</article>{tochtml}"""
        open(os.path.join(OUT, cat, d["slug"] + ".html"), "w", encoding="utf-8").write(
            page(d["title"], body, 1, search=True, lnb=lnb_html(bycat, cat, d["slug"], 1)))


    # 홈
    cards = ""
    for key, name, desc in CATS:
        n = len(bycat.get(key, []))
        cls = "" if n else " empty"
        cnt = f"{n}개 문서" if n else "준비 중"
        href = f'{key}/{bycat[key][0]["slug"]}.html' if n else "#"
        cards += (f'<li class="{cls.strip()}"><a href="{href}">'
                  f'<div class="row-txt"><b>{name}</b><span>{desc}</span><em>{cnt}</em></div>'
                  f'<img class="thumb" src="assets/thumb-{key}.svg" alt=""></a></li>')
    pop = "".join(
        f'<li><a href="{d["category"]}/{d["slug"]}.html">{html.escape(d["title"])}</a></li>'
        for d in docs if d["slug"] in ("pricing-guide","accept-order","auto-accept","store-pause","supported-apps","what-is-otterpos"))
    hero_search = SEARCH_BOX.format(cls="hero-search", ph="아티클 제목, 내용")
    body = f"""<section class="hero"><div class="hero-bg"></div><div class="hero-inner"><h1>무엇을 도와드릴까요?</h1>
<p>오터포스 사용 중 궁금한 점을 찾아보세요.</p>{hero_search}</div></section>
<div class="home-body">
<h2>자주 찾는 문서</h2><ol class="popular">{pop}</ol>
<h2>전체 카테고리</h2><ul class="cat-rows">{cards}</ul></div>"""
    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page("고객센터", body, 0, cls="home"))

    # 검색 인덱스
    idx = [{"t": d["title"], "s": d.get("summary",""),
            "u": f'{d["category"]}/{d["slug"]}.html', "c": CATNAME.get(d["category"], d["category"]),
            "b": re.sub(r"\s+", " ", re.sub(r"[#*|`\[\]()>-]", " ", d["_body"]))[:1200]} for d in docs]
    open(os.path.join(OUT, "index.json"), "w", encoding="utf-8").write(json.dumps(idx, ensure_ascii=False))
    print(f"빌드 완료: {len(docs)}편 · {len(bycat)}개 카테고리 -> preview/site/")
    return docs, bycat

if __name__ == "__main__":
    build()
