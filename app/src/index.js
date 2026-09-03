import { renderMd } from './md.js'
import { shell, lnb, articlePage, homePage } from './views.js'
import { handleAdmin } from './admin.js'

const POPULAR = ['pricing-guide', 'accept-order', 'auto-accept', 'store-pause', 'supported-apps', 'what-is-otterpos']

const html = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...extra } })

async function loadNav(env, preview) {
  const where = preview ? '' : "WHERE status='published'"
  const [cats, arts] = await Promise.all([
    env.DB.prepare('SELECT * FROM categories ORDER BY sort_order').all(),
    env.DB.prepare(`SELECT slug, category, title, status FROM articles ${where} ORDER BY category, sort_order`).all(),
  ])
  const byCat = {}
  for (const a of arts.results) (byCat[a.category] ||= []).push(a)
  const slugs = new Set(arts.results.map((a) => `/help/${a.category}/${a.slug}`))
  return { cats: cats.results, byCat, slugs }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const BASE = env.BASE_PATH || '/help'
    const NOINDEX = env.NOINDEX === 'true'
    const PREVIEW = env.PREVIEW_MODE === 'true'
    const origin = env.SITE_ORIGIN || url.origin

    // BASE 밖의 요청은 손대지 않습니다 (본도메인 앞단에 붙을 때 안전장치)
    if (!url.pathname.startsWith(BASE)) return new Response('Not Found', { status: 404 })
    let p = url.pathname.slice(BASE.length) || '/'
    if (p !== '/' && p.endsWith('/')) {
      return Response.redirect(origin + BASE + p.slice(0, -1), 301)
    }

    const noindexHeader = NOINDEX ? { 'x-robots-tag': 'noindex, nofollow' } : {}

    if (p === '/robots.txt') {
      const body = NOINDEX
        ? 'User-agent: *\nDisallow: /\n'
        : `User-agent: *\nAllow: /\n\nSitemap: ${origin}${BASE}/sitemap.xml\n`
      return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }

    if (p === '/search-index.json' || p === '/index.json') {
      const { results } = await env.DB.prepare(
        `SELECT slug, category, title, summary, body_md FROM articles ${PREVIEW ? '' : "WHERE status='published'"} ORDER BY category, sort_order`).all()
      const cats = await env.DB.prepare('SELECT key, name FROM categories').all()
      const nameOf = Object.fromEntries(cats.results.map((c) => [c.key, c.name]))
      const idx = results.map((a) => ({
        t: a.title, s: a.summary, u: `${a.category}/${a.slug}`, c: nameOf[a.category] || a.category,
        b: a.body_md.replace(/<!--[\s\S]*?-->/g, '').replace(/[#*|`\[\]()>-]/g, ' ').replace(/\s+/g, ' ').slice(0, 1200),
      }))
      return new Response(JSON.stringify(idx), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' },
      })
    }

    if (p === '/sitemap.xml') {
      if (NOINDEX) return new Response('Not Found', { status: 404 })
      const { results } = await env.DB.prepare(
        "SELECT slug, category, updated_at FROM articles WHERE status='published'").all()
      const urls = results.map((a) =>
        `<url><loc>${origin}${BASE}/${a.category}/${a.slug}</loc><lastmod>${(a.updated_at || '').slice(0, 10)}</lastmod></url>`).join('')
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}${BASE}/</loc></url>${urls}</urlset>`,
        { headers: { 'content-type': 'application/xml; charset=utf-8' } })
    }

    // 어드민 (로그인 · API · 편집 화면)
    if (p === '/admin' || p.startsWith('/admin/')) {
      return handleAdmin(request, env, p, BASE)
    }

    // 정적 자산 (style.css, search.js, assets/*, images/*)
    if (/^\/(style\.css|search\.js|assets\/|images\/)/.test(p)) {
      const res = await env.ASSETS.fetch(new URL(p, url.origin))
      if (res.status === 200) return res
    }
    // 업로드 이미지 (R2)
    if (p.startsWith('/media/')) {
      if (!env.MEDIA) return new Response('Media storage not enabled', { status: 503 })
      const obj = await env.MEDIA.get(p.slice('/media/'.length))
      if (!obj) return new Response('Not Found', { status: 404 })
      return new Response(obj.body, {
        headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
                   'cache-control': 'public, max-age=31536000, immutable' },
      })
    }

    const nav = await loadNav(env, PREVIEW)

    // 홈
    if (p === '/') {
      const { results } = await env.DB.prepare(
        `SELECT slug, category, title FROM articles WHERE ${PREVIEW ? '1=1' : "status='published'"} AND slug IN (${POPULAR.map(() => '?').join(',')})`)
        .bind(...POPULAR).all()
      const body = homePage({ cats: nav.cats, byCat: nav.byCat, popular: results, base: BASE })
      return html(shell({ title: '고객센터', body, base: BASE, cls: 'home', noindex: NOINDEX, preview: PREVIEW,
        canonical: NOINDEX ? '' : `${origin}${BASE}/`,
        summary: '오터포스 사용 중 궁금한 점을 찾아보세요. 주문 접수, 배달앱 연동, 요금·결제 안내를 제공합니다.' }),
        200, noindexHeader)
    }

    // 문서
    const m = p.match(/^\/([a-z0-9-]+)\/([a-z0-9-]+)$/)
    if (m) {
      const [, category, slug] = m
      const art = await env.DB.prepare(
        `SELECT * FROM articles WHERE category=? AND slug=? ${PREVIEW ? '' : "AND status='published'"}`).bind(category, slug).first()
      if (!art) return html(notFound(BASE), 404, noindexHeader)
      const cat = nav.cats.find((c) => c.key === category) || {}
      const { html: content, toc } = renderMd(art.body_md, { slugs: nav.slugs, base: BASE })
      const body = articlePage({ art, cat, html: content, toc, base: BASE })
      return html(shell({ title: art.title, body, base: BASE, gnbSearch: true,
        lnbHtml: '', noindex: NOINDEX, preview: PREVIEW, summary: art.summary,
        canonical: NOINDEX ? '' : `${origin}${BASE}/${category}/${slug}` })
        .replace('<main class="wrap">', `<main class="wrap">${lnb(nav.cats, nav.byCat, category, slug, BASE)}`),
        200, noindexHeader)
    }

    return html(notFound(BASE), 404, noindexHeader)
  },
}

const notFound = (base) => shell({
  title: '문서를 찾을 수 없습니다', base, noindex: true,
  body: `<div class="home-body"><h1>문서를 찾을 수 없습니다</h1>
<p class="lead">주소가 바뀌었거나 아직 준비 중인 문서일 수 있습니다.</p>
<p><a href="${base}/">고객센터 홈으로 가기</a></p></div>`,
})
