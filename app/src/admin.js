import { isAuthed, makeToken, sessionCookie, clearCookie } from './auth.js'
import { esc } from './md.js'

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } })

const FIELDS = ['slug', 'category', 'type', 'title', 'summary', 'body_md', 'status', 'env', 'audience', 'tags', 'thumb', 'sort_order']

/** 어드민 라우터. p는 BASE를 제거한 경로 (예: /admin/api/articles) */
export async function handleAdmin(request, env, p, BASE) {
  const authed = await isAuthed(request, env)

  // ---- 로그인 ----
  if (p === '/admin/login' && request.method === 'POST') {
    const { password } = await request.json().catch(() => ({}))
    if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
      await new Promise((r) => setTimeout(r, 400))          // 무차별 대입 완화
      return json({ ok: false, error: '비밀번호가 올바르지 않습니다.' }, 401)
    }
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(await makeToken(env), BASE) })
  }
  if (p === '/admin/logout') {
    return json({ ok: true }, 200, { 'set-cookie': clearCookie(BASE) })
  }

  // ---- API 인증 ----
  const isApi = p.startsWith('/admin/api/')
  if (isApi) {
    // Claude 등 외부 도구는 Bearer 토큰으로 접근합니다.
    const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const viaToken = env.API_TOKEN && bearer && bearer === env.API_TOKEN
    if (!authed && !viaToken) return json({ error: 'unauthorized' }, 401)
    return apiRoutes(request, env, p.slice('/admin/api'.length), viaToken ? 'api' : 'human')
  }

  // ---- SPA 정적 자산 (번들 JS·CSS) ----
  if (p.startsWith('/admin/assets/')) {
    const res = await env.ASSETS.fetch(new URL(p, request.url))
    if (res.status === 200) {
      const h = new Headers(res.headers)
      h.set('x-robots-tag', 'noindex, nofollow')
      return new Response(res.body, { status: 200, headers: h })
    }
    return new Response('Not Found', { status: 404 })
  }

  // ---- 화면 ----
  if (!authed) return new Response(loginPage(BASE), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' } })
  const res = await env.ASSETS.fetch(new URL('/admin/index.html', request.url))
  return new Response(res.body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' } })
}

async function apiRoutes(request, env, path, author) {
  const m = request.method

  if (path === '/articles' && m === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT a.id, a.slug, a.category, a.title, a.summary, a.status, a.sort_order, a.updated_at,
             LENGTH(a.body_md) AS chars,
             (SELECT COUNT(*) FROM article_revisions r WHERE r.article_id = a.id) AS revisions
      FROM articles a ORDER BY a.category, a.sort_order`).all()
    const cats = await env.DB.prepare('SELECT key, name, sort_order FROM categories ORDER BY sort_order').all()
    return json({ articles: results, categories: cats.results })
  }

  if (path === '/articles' && m === 'POST') {
    const b = await request.json()
    const r = await env.DB.prepare(
      `INSERT INTO articles (slug,category,title,summary,body_md,status,env,audience,tags,thumb,sort_order)
       VALUES (?,?,?,?,?,'draft',?,?,?,?,?)`)
      .bind(b.slug, b.category, b.title || '제목 없음', b.summary || '', b.body_md || '',
            b.env || 'all', b.audience || 'owner', b.tags || '', b.thumb || null, b.sort_order ?? 99)
      .run()
    return json({ ok: true, id: r.meta.last_row_id })
  }

  let mm
  if ((mm = path.match(/^\/articles\/(\d+)$/))) {
    const id = Number(mm[1])
    if (m === 'GET') {
      const art = await env.DB.prepare('SELECT * FROM articles WHERE id=?').bind(id).first()
      if (!art) return json({ error: 'not found' }, 404)
      const revs = await env.DB.prepare(
        'SELECT id, created_at, author FROM article_revisions WHERE article_id=? ORDER BY created_at DESC LIMIT 30').bind(id).all()
      return json({ article: art, revisions: revs.results })
    }
    if (m === 'PUT') {
      const b = await request.json()
      const prev = await env.DB.prepare('SELECT * FROM articles WHERE id=?').bind(id).first()
      if (!prev) return json({ error: 'not found' }, 404)
      // 저장 시마다 이전본을 이력으로 남깁니다
      await env.DB.prepare(
        'INSERT INTO article_revisions (article_id,title,summary,body_md,author) VALUES (?,?,?,?,?)')
        .bind(id, prev.title, prev.summary, prev.body_md, author).run()
      const patch = FIELDS.filter((f) => b[f] !== undefined)
      // API(Claude)는 발행 상태를 바꿀 수 없습니다 — 발행은 사람만
      const safe = author === 'api' ? patch.filter((f) => f !== 'status') : patch
      const sets = safe.map((f) => `${f}=?`).concat("updated_at=datetime('now')")
      const vals = safe.map((f) => b[f])
      if (safe.includes('status')) {
        sets.push(b.status === 'published' ? "published_at=COALESCE(published_at, datetime('now'))" : 'published_at=published_at')
      }
      await env.DB.prepare(`UPDATE articles SET ${sets.join(',')} WHERE id=?`).bind(...vals, id).run()
      const art = await env.DB.prepare('SELECT * FROM articles WHERE id=?').bind(id).first()
      return json({ ok: true, article: art })
    }
  }

  if ((mm = path.match(/^\/revisions\/(\d+)$/)) && m === 'GET') {
    const rev = await env.DB.prepare('SELECT * FROM article_revisions WHERE id=?').bind(Number(mm[1])).first()
    return rev ? json(rev) : json({ error: 'not found' }, 404)
  }

  if (path === '/reorder' && m === 'POST') {
    const { items } = await request.json()          // [{id, sort_order}]
    const stmt = env.DB.prepare('UPDATE articles SET sort_order=?, updated_at=datetime(\'now\') WHERE id=?')
    await env.DB.batch(items.map((it) => stmt.bind(it.sort_order, it.id)))
    return json({ ok: true, count: items.length })
  }

  if (path === '/upload' && m === 'POST') {
    if (!env.MEDIA) return json({ error: 'R2가 아직 활성화되지 않았습니다. Cloudflare 대시보드에서 R2를 켠 뒤 재배포해 주세요.' }, 503)
    const url = new URL(request.url)
    const ext = (url.searchParams.get('ext') || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase()
    const name = url.searchParams.get('name') || ''
    const mime = request.headers.get('content-type') || 'application/octet-stream'
    const key = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`
    const body = await request.arrayBuffer()
    await env.MEDIA.put(key, body, { httpMetadata: { contentType: mime } })
    await env.DB.prepare('INSERT INTO assets (key,filename,mime,bytes) VALUES (?,?,?,?)')
      .bind(key, name, mime, body.byteLength).run()
    return json({ url: `/media/${key}`, bytes: body.byteLength })
  }

  if (path === '/export' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM articles ORDER BY category, sort_order').all()
    const files = results.map((a) => ({
      path: `${a.category}/${a.slug}.md`,
      content: `---\ntitle: ${a.title}\nslug: ${a.slug}\ncategory: ${a.category}\ntype: ${a.type}\n` +
        `summary: ${a.summary}\nenv: ${a.env}\naudience: ${a.audience}\ntags: ${a.tags}\n` +
        (a.thumb ? `thumb: ${a.thumb}\n` : '') + `order: ${a.sort_order}\nstatus: ${a.status}\n---\n\n${a.body_md}\n`,
    }))
    return json({ count: files.length, files })
  }

  return json({ error: 'not found' }, 404)
}

const loginPage = (base) => `<!DOCTYPE html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>어드민 로그인</title><meta name="robots" content="noindex,nofollow">
<link rel="stylesheet" href="${base}/style.css">
<style>body{display:grid;place-items:center;min-height:100vh;background:var(--bg-2)}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:36px 32px;width:340px;text-align:center}
.card img{height:22px;margin-bottom:6px}.card p{color:var(--ink-3);font-size:13px;margin:0 0 22px}
.card input{width:100%;height:42px;border:1px solid var(--line);border-radius:9px;padding:0 14px;font-size:14px;font-family:inherit;outline:none}
.card input:focus{border-color:var(--accent)}
.card button{width:100%;height:42px;margin-top:10px;border:0;border-radius:9px;background:var(--ink);color:#fff;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer}
.card button:hover{background:var(--accent)}
.err{color:var(--accent);font-size:13px;margin-top:12px;min-height:18px}</style>
</head><body><form class="card" id="f">
<img src="${base}/assets/otter-logo.svg" alt="Otter"><p>고객센터 어드민</p>
<input type="password" id="pw" placeholder="비밀번호" autofocus>
<button type="submit">로그인</button><div class="err" id="e"></div>
</form><script>
document.getElementById('f').onsubmit=async(ev)=>{ev.preventDefault();
 const r=await fetch('${base}/admin/login',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({password:document.getElementById('pw').value})}).then(r=>r.json());
 if(r.ok) location.reload(); else document.getElementById('e').textContent=r.error||'로그인 실패';};
</script></body></html>`
