import { esc } from './md.js'

/** 공개 페이지 셸 — 미리보기에서 확정된 3단 레이아웃 */
export function shell({ title, body, base, cls = '', gnbSearch = false, noindex, canonical, summary, preview = false }) {
  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 오터포스 고객센터</title>
${summary ? `<meta name="description" content="${esc(summary)}">` : ''}
${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:title" content="${esc(title)} · 오터포스 고객센터">
${summary ? `<meta property="og:description" content="${esc(summary)}">` : ''}
<link rel="stylesheet" href="${base}/style.css">
</head><body class="${cls}" data-hero="a">
<header class="gnb"><div class="wrap">
<a class="logo" href="${base}/"><img src="${base}/assets/otter-logo.svg" alt="Otter"><span class="sub">고객센터</span></a>
<div class="gnb-right">${gnbSearch ? searchBox('gnb-search', '검색') : ''}<button class="icon-btn search-toggle" aria-label="검색"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5" stroke-linecap="round"/></svg></button><button class="icon-btn nav-toggle" aria-label="메뉴"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><a class="gnb-cta" href="https://www.tryotter.co.kr" target="_blank" rel="noopener">오터포스 홈페이지</a></div>
</div></header>
<div class="backdrop"></div>
${preview ? '<div class="preview-bar">사내 검토용 미리보기입니다. 작성 중인 문서가 포함되어 있고 일부 내용은 확인 중입니다.</div>' : ''}
<main class="wrap">${body}</main>
<footer><div class="wrap">
<p>해결되지 않으셨나요? 고객센터 <b>070-8874-5455</b> · <a href="https://pf.kakao.com/_FrxhJK/chat" target="_blank" rel="noopener">카카오톡 문의</a> · <a href="${base}/contact/customer-support">운영 시간 안내</a></p>
<p class="tiny">테크놀로지인프라스트럭처코리아 유한회사</p>
</div></footer>
<script>window.BASE="${base}/";</script>
<div id="lb"><img></div>
<script src="${base}/search.js"></script>
</body></html>`
}

const searchBox = (cls, ph) =>
  `<div class="search ${cls}"><input id="q" placeholder="${ph}" autocomplete="off"><div id="res"></div></div>`

/** 좌측 대분류/중분류 트리 */
export function lnb(cats, byCat, curCat, curSlug, base) {
  const parts = [`<nav class="lnb"><a class="lnb-home" href="${base}/">고객센터 홈</a><ul>`]
  for (const c of cats) {
    const docs = byCat[c.key] || []
    if (!docs.length) {
      parts.push(`<li class="grp off"><span class="grp-t">${esc(c.name)}<em>준비 중</em></span></li>`)
      continue
    }
    const items = docs.map((d) =>
      `<li><a href="${base}/${c.key}/${d.slug}"${c.key === curCat && d.slug === curSlug ? ' class="on"' : ''}>${esc(d.title)}</a></li>`).join('')
    parts.push(`<li class="grp"><details${c.key === curCat ? ' open' : ''}><summary class="grp-t">${esc(c.name)}</summary><ul class="grp-items">${items}</ul></details></li>`)
  }
  parts.push(`</ul><a class="lnb-cta" href="https://www.tryotter.co.kr" target="_blank" rel="noopener">오터포스 홈페이지</a></nav>`)
  return parts.join('')
}

/** 문서 페이지 */
export function articlePage({ art, cat, html, toc, base }) {
  const banner = art.thumb === 'none' ? ''
    : `<figure class="doc-hero"><img src="${art.thumb ? (art.thumb.startsWith('/') ? base + art.thumb : art.thumb) : base + (cat.hero_url || '')}" alt=""></figure>`
  const items = toc.map((t) => `<li class="lv${t.lv}"><a href="#${t.id}">${esc(t.t)}</a></li>`).join('')
  const tocSide = toc.length ? `<nav class="toc"><h4>목차</h4><ul>${items}</ul></nav>` : ''
  const tocM = toc.length ? `<details class="toc-m"><summary>목차</summary><ul>${items}</ul></details>` : ''
  return `<article class="doc">${banner}<h1>${esc(art.title)}</h1>
<div class="meta">${art.status !== 'published' ? '<span class="badge-draft">초안</span>' : ''}최종 수정 ${(art.updated_at || '').slice(0, 10)} · ${esc(art.env)}</div>
${tocM}${html}
<div class="helpful"><span>이 문서가 도움이 되었나요?</span><button>도움돼요</button><button>아쉬워요</button></div>
</article>${tocSide}`
}

/** 홈 */
export function homePage({ cats, byCat, popular, base }) {
  const cards = cats.map((c) => {
    const docs = byCat[c.key] || []
    const href = docs.length ? `${base}/${c.key}/${docs[0].slug}` : '#'
    return `<li class="${docs.length ? '' : 'empty'}"><a href="${href}">` +
      `<div class="row-txt"><b>${esc(c.name)}</b><span>${esc(c.description || '')}</span>` +
      `<em>${docs.length ? docs.length + '개 문서' : '준비 중'}</em></div>` +
      `<img class="thumb" src="${base}${c.thumb_url}" alt=""></a></li>`
  }).join('')
  const pop = popular.map((d) => `<li><a href="${base}/${d.category}/${d.slug}">${esc(d.title)}</a></li>`).join('')
  return `<section class="hero"><div class="hero-bg"></div><div class="hero-inner">
<h1>무엇을 도와드릴까요?</h1><p>오터포스 사용 중 궁금한 점을 찾아보세요.</p>
${searchBox('hero-search', '아티클 제목, 내용')}</div></section>
<div class="home-body">
${pop ? `<h2>자주 찾는 문서</h2><ol class="popular">${pop}</ol>` : ''}
<h2>전체 카테고리</h2><ul class="cat-rows">${cards}</ul></div>`
}
