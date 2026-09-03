/** 마크다운 → HTML. 미리보기(build.py)에서 검증된 규칙을 그대로 옮겼습니다.
 *  - `**예외 안내**` 로 시작하는 마지막 블록 → 자동 박스
 *  - 존재하지 않는 /help 링크 → 회색 텍스트로 강등
 *  - h2/h3 에 id 부여 + 목차 수집
 *  굵게는 CommonMark 표준을 따릅니다. (drafts/README.md 참조) */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function inline(t, slugs, base) {
  let s = esc(t)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, (m, inner, off, whole) => {
    // CommonMark: 닫는 ** 앞이 문장부호이고 뒤가 글자면 굵게 아님
    const after = whole.slice(off + m.length, off + m.length + 1)
    const last = inner.slice(-1)
    if (/[\p{P}\p{S}]/u.test(last) && after && /[\p{L}\p{N}]/u.test(after)) return m
    return `<strong>${inner}</strong>`
  })
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => `<img src="${src.startsWith('/') ? base + src : src}" alt="${alt}">`)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, href) => {
    if (href.startsWith('/help/')) {
      if (!slugs.has(href)) return `<span class="deadlink" title="준비 중인 문서">${text}</span>`
      return `<a href="${base}${href.slice(5)}">${text}</a>`
    }
    return `<a href="${href}"${href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`
  })
  return s
}

export function renderMd(md, { slugs = new Set(), base = '/help' } = {}) {
  md = md.replace(/<!--[\s\S]*?-->/g, '')          // 편집자 주석 제거
  const lines = md.split('\n')
  const out = []
  const toc = []
  let i = 0, inExc = false, hn = 0

  while (i < lines.length) {
    const s = lines[i].trim()
    if (!s) { i++; continue }
    if (s === '**예외 안내**') {
      out.push('<div class="exception"><div class="exception-title">예외 안내</div>')
      inExc = true; i++; continue
    }
    if (s === '---') { if (inExc) { out.push('</div>'); inExc = false } i++; continue }
    if (s.startsWith('#')) {
      if (inExc) { out.push('</div>'); inExc = false }
      const lv = s.length - s.replace(/^#+/, '').length
      const txt = s.replace(/^#+\s*/, '')
      const id = `sec-${++hn}`
      if (lv === 2 || lv === 3) toc.push({ id, t: txt.replace(/[*`]/g, ''), lv })
      out.push(`<h${lv + 1} id="${id}">${inline(txt, slugs, base)}</h${lv + 1}>`)
      i++; continue
    }
    if (s.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
        i++
      }
      const isSep = rows[1] && rows[1].every((c) => /^:?-+:?$/.test(c))
      const head = isSep ? rows[0] : null
      const data = isSep ? rows.slice(2) : rows
      let t = '<table>'
      if (head) t += '<thead><tr>' + head.map((c) => `<th>${inline(c, slugs, base)}</th>`).join('') + '</tr></thead>'
      t += '<tbody>' + data.map((r) => '<tr>' + r.map((c) => `<td>${inline(c, slugs, base)}</td>`).join('') + '</tr>').join('') + '</tbody></table>'
      out.push(t); continue
    }
    if (/^[-*] /.test(s) || /^\d+\. /.test(s)) {
      const ordered = /^\d+\. /.test(s)
      const items = []
      while (i < lines.length) {
        const c = lines[i].trim()
        if (/^[-*] /.test(c) || /^\d+\. /.test(c)) { items.push(c.replace(/^([-*]|\d+\.)\s+/, '')); i++ }
        else if (c === '') {
          const nxt = (lines[i + 1] || '').trim()
          if (/^[-*] /.test(nxt) || /^\d+\. /.test(nxt)) i++
          else break
        } else break
      }
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}>` + items.map((x) => `<li>${inline(x, slugs, base)}</li>`).join('') + `</${tag}>`)
      continue
    }
    if (s.startsWith('![')) { out.push(`<figure>${inline(s, slugs, base)}</figure>`); i++; continue }
    const buf = []
    while (i < lines.length && lines[i].trim() && !/^(#|\||[-*] |\d+\. |!\[)/.test(lines[i].trim()) && lines[i].trim() !== '---') {
      buf.push(lines[i].trim()); i++
    }
    out.push('<p>' + buf.map((b) => inline(b, slugs, base)).join('<br>') + '</p>')
  }
  if (inExc) out.push('</div>')
  return { html: out.join('\n'), toc }
}

export { esc }
