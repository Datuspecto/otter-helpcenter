import http from 'node:http'
import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = path.resolve(process.cwd(), '..')          // otter-helpcenter/
const DRAFTS = path.join(ROOT, 'drafts')
const REV = path.join(ROOT, 'editor-proto', '.revisions')
const UPLOADS = path.join(ROOT, 'editor-proto', 'uploads')
const DIST = path.join(process.cwd(), 'dist')
const PORT = 4180
fss.mkdirSync(REV, { recursive: true })
fss.mkdirSync(UPLOADS, { recursive: true })

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp',
  '.mp4':'video/mp4' }

const parseFM = (raw) => {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(': ')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 2).trim()
  }
  return { meta, body: m[2] }
}

async function listDocs() {
  const out = []
  for (const cat of await fs.readdir(DRAFTS)) {
    const dir = path.join(DRAFTS, cat)
    if (!(await fs.stat(dir)).isDirectory()) continue
    for (const f of await fs.readdir(dir)) {
      if (!f.endsWith('.md')) continue
      const raw = await fs.readFile(path.join(dir, f), 'utf8')
      const { meta, body } = parseFM(raw)
      if (!meta.slug) continue
      out.push({ ...meta, category: meta.category || cat, file: `${cat}/${f}`,
        notes: (body.match(/<!--[\s\S]*?-->/g) || []).length,
        chars: body.replace(/\s/g, '').length })
    }
  }
  return out.sort((a, b) => (a.category + String(a.order).padStart(3,'0')).localeCompare(b.category + String(b.order).padStart(3,'0')))
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}
const readBody = (req) => new Promise((ok, no) => {
  const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no)
})

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname
  try {
    if (p === '/api/articles' && req.method === 'GET') return json(res, 200, await listDocs())

    if (p.startsWith('/api/articles/') && req.method === 'GET') {
      const file = decodeURIComponent(p.slice('/api/articles/'.length))
      const raw = await fs.readFile(path.join(DRAFTS, file), 'utf8')
      const { meta, body } = parseFM(raw)
      const revDir = path.join(REV, file.replace(/\//g, '__'))
      let revisions = []
      try { revisions = (await fs.readdir(revDir)).sort().reverse().slice(0, 20) } catch {}
      return json(res, 200, { file, meta, body, revisions })
    }

    if (p.startsWith('/api/articles/') && req.method === 'PUT') {
      const file = decodeURIComponent(p.slice('/api/articles/'.length))
      const { meta, body } = JSON.parse((await readBody(req)).toString())
      const full = path.join(DRAFTS, file)
      // 리비전 스냅샷
      try {
        const prev = await fs.readFile(full, 'utf8')
        const revDir = path.join(REV, file.replace(/\//g, '__'))
        await fs.mkdir(revDir, { recursive: true })
        await fs.writeFile(path.join(revDir, new Date().toISOString().replace(/[:.]/g, '-') + '.md'), prev)
      } catch {}
      const order = ['title','slug','category','type','summary','env','audience','tags','thumb','order','status']
      const keys = [...order.filter(k => meta[k]), ...Object.keys(meta).filter(k => !order.includes(k) && meta[k])]
      const fm = keys.map(k => `${k}: ${meta[k]}`).join('\n')
      await fs.writeFile(full, `---\n${fm}\n---\n\n${String(body).trim()}\n`)
      return json(res, 200, { ok: true, savedAt: new Date().toISOString() })
    }

    if (p.startsWith('/api/revision/') && req.method === 'GET') {
      const [file, rev] = decodeURIComponent(p.slice('/api/revision/'.length)).split('|')
      const raw = await fs.readFile(path.join(REV, file.replace(/\//g, '__'), rev), 'utf8')
      return json(res, 200, parseFM(raw))
    }

    if (p === '/api/upload' && req.method === 'POST') {
      const buf = await readBody(req)
      const ext = (url.searchParams.get('ext') || 'png').replace(/[^a-z0-9]/gi, '')
      const name = crypto.randomBytes(6).toString('hex') + '.' + ext
      await fs.writeFile(path.join(UPLOADS, name), buf)
      return json(res, 200, { url: '/uploads/' + name })
    }

    // 정적 파일
    let f
    if (p.startsWith('/uploads/')) f = path.join(UPLOADS, p.slice(9))
    else if (p.startsWith('/legacy-images/')) f = path.join(ROOT, 'legacy-images', p.slice(15))
    else if (p.startsWith('/images/')) f = path.join(ROOT, 'legacy-images', p.slice(8))
    else f = path.join(DIST, p === '/' ? 'index.html' : p)
    try {
      let data
      try { data = await fs.readFile(f) }
      catch (e) {
        if (p.startsWith('/assets/')) { f = path.join(ROOT, 'preview', 'assets', p.slice(8)); data = await fs.readFile(f) }
        else throw e
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
      return res.end(data)
    } catch {
      const data = await fs.readFile(path.join(DIST, 'index.html'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(data)
    }
  } catch (e) {
    return json(res, 500, { error: String(e) })
  }
})
srv.listen(PORT, () => console.log(`에디터 프로토타입: http://localhost:${PORT}`))
