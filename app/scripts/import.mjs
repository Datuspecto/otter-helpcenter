// drafts/*.md -> .seed.sql  (D1 시드 생성)
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const DRAFTS = path.join(ROOT, 'drafts')
const OUT = path.join(import.meta.dirname, '..', '.seed.sql')

const CATS = [
  ['getting-started', '시작하기', '오터포스를 처음 시작하시나요'],
  ['integrations', '연동', '배달앱·배달대행·POS 연동'],
  ['orders', '주문 접수', '주문을 받고 처리하기'],
  ['automation', '주문 자동화', '자동 수락과 자동 배차'],
  ['settings', '설정', '프린터·매장·가게 설정'],
  ['biz-manager', '비즈니스 매니저', '매출 분석 웹 콘솔'],
  ['reviews', '리뷰 관리', '배달앱 리뷰 통합 관리'],
  ['pricing', '요금·결제', '이용요금과 결제 안내'],
  ['troubleshooting', '문제 해결', '문제가 생겼을 때'],
  ['contact', '문의', '고객센터 연락처'],
]

const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)

function parse(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) return null
  const meta = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(': ')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 2).trim()
  }
  return { meta, body: m[2].trim() }
}

const lines = ['PRAGMA defer_foreign_keys = true;']
CATS.forEach(([k, n, d], i) => {
  lines.push(`INSERT INTO categories (key,name,description,thumb_url,hero_url,sort_order) VALUES (${q(k)},${q(n)},${q(d)},${q('/assets/thumb-' + k + '.svg')},${q('/assets/hero-' + k + '.svg')},${i + 1});`)
})

let n = 0, skipped = []
for (const cat of fs.readdirSync(DRAFTS)) {
  const dir = path.join(DRAFTS, cat)
  if (!fs.statSync(dir).isDirectory()) continue
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.md')) continue
    const p = parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    if (!p || !p.meta.slug) { skipped.push(`${cat}/${f}`); continue }
    const m = p.meta
    // 본문에 남은 편집자 주석은 DB에 그대로 보관하되, 렌더링·봇 단계에서 제거합니다.
    lines.push(
      `INSERT INTO articles (slug,category,type,title,summary,body_md,status,env,audience,tags,thumb,sort_order) VALUES (` +
      [q(m.slug), q(m.category || cat), q(m.type || 'article'), q(m.title), q(m.summary || ''),
       q(p.body), q('draft'), q(m.env || 'all'), q(m.audience || 'owner'),
       q(m.tags || ''), m.thumb ? q(m.thumb) : 'NULL', Number(m.order || 99)].join(',') + ');')
    n++
  }
}
fs.writeFileSync(OUT, lines.join('\n') + '\n')
console.log(`시드 생성: 카테고리 ${CATS.length}개 · 문서 ${n}편 -> .seed.sql`)
if (skipped.length) console.log('건너뜀:', skipped.join(', '))
