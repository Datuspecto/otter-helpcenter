import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

marked.setOptions({ gfm: true, breaks: false })

/* 굵게는 CommonMark 표준 규칙을 그대로 따릅니다.
   `**[자동]**으로` 처럼 닫는 ** 앞이 문장부호이고 뒤가 글자면 굵게가 되지 않습니다.
   그런 문장은 `**[자동]** 상태로` 처럼 뒤에 명사를 넣어 씁니다. (drafts/README.md 참조) */

/** 마크다운 → 에디터 HTML.
 *  본문 끝의 `---` + `**예외 안내**` 구간을 예외 안내 블록으로 승격시킵니다. */
export function mdToHtml(md) {
  let exception = null
  const m = md.match(/\n---\s*\n+\*\*예외 안내\*\*\s*\n([\s\S]*)$/)
  if (m) {
    exception = m[1].trim()
    md = md.slice(0, m.index)
  }
  let html = marked.parse(md.trim())
  if (exception !== null) {
    const inner = marked.parse(exception)
    html += `<div data-exception="true">${inner}</div>`
  }
  return html
}

const td = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
})
td.use(gfm)
// 기본 escape는 `[`, `]` 등을 백슬래시 처리해 `[매장관리]` 같은 표기를 망가뜨립니다.
// 우리 문서 규칙에서 링크 참조 문법을 쓰지 않으므로 대괄호 이스케이프만 되돌립니다.
const origEscape = td.escape.bind(td)
td.escape = (str) => origEscape(str).replace(/\\([\[\]])/g, '$1')

// 예외 안내 블록 → 규칙대로 직렬화
td.addRule('exception', {
  filter: (node) => node.nodeName === 'DIV' && node.getAttribute('data-exception') === 'true',
  replacement: (content) => `\n\n---\n\n**예외 안내**\n${content.trim()}\n`,
})
// 이미지: 항상 자기 줄에
td.addRule('blockImage', {
  filter: (node) => node.nodeName === 'IMG',
  replacement: (_c, node) => `\n\n![${node.getAttribute('alt') || ''}](${node.getAttribute('src')})\n\n`,
})

/** Tiptap이 만든 표 마크업을 turndown이 이해하는 형태로 정리 */
function cleanForTurndown(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  root.querySelectorAll('colgroup').forEach((n) => n.remove())
  root.querySelectorAll('th, td').forEach((cell) => {
    cell.removeAttribute('colspan'); cell.removeAttribute('rowspan')
    cell.removeAttribute('colwidth'); cell.removeAttribute('style')
    // 셀 안의 <p>를 풀어 텍스트만 남김 (여러 문단은 공백으로 합침)
    const ps = [...cell.querySelectorAll('p')]
    if (ps.length) cell.innerHTML = ps.map((x) => x.innerHTML.trim()).filter(Boolean).join(' ')
  })
  root.querySelectorAll('table').forEach((t) => {
    t.removeAttribute('style')
    // thead가 없으면 첫 행을 thead로 승격 (turndown-plugin-gfm 요구사항)
    if (!t.querySelector('thead')) {
      const first = t.querySelector('tr')
      if (first) {
        // 마크다운 표는 머리행이 필수 — 없으면 첫 행을 승격해 셀을 th로 바꿈
        first.querySelectorAll('td').forEach((td) => {
          const th = doc.createElement('th')
          th.innerHTML = td.innerHTML
          td.replaceWith(th)
        })
        const thead = doc.createElement('thead')
        thead.appendChild(first)
        t.insertBefore(thead, t.firstChild)
      }
    }
  })
  return root.innerHTML
}

/** turndown 출력 정규화 — 우리 마크다운 규칙에 맞춤 */
function normalize(md) {
  md = md.replace(/^[ \t]+$/gm, '')                       // 공백만 있는 줄 비우기
  md = md.replace(/^(\s*)[-*]\s{2,}/gm, '$1- ')           // '-   항목' → '- 항목'
  md = md.replace(/^(\s*)(\d+)\.\s{2,}/gm, '$1$2. ')     // '1.  항목' → '1. 항목'
  // 연속된 목록 항목 사이의 빈 줄 제거
  let prev
  do { prev = md; md = md.replace(/^([ \t]*(?:[-*]|\d+\.) .+)\n\n(?=[ \t]*(?:[-*]|\d+\.) )/gm, '$1\n') } while (md !== prev)
  md = md.replace(/\*\*예외 안내\*\*\n(?=[-*] )/g, '**예외 안내**\n\n')  // 예외 안내 뒤 빈 줄
  md = md.replace(/\n{3,}/g, '\n\n')
  return md.trim() + '\n'
}

/** 에디터 HTML → 마크다운 */
export function htmlToMd(html) {
  return normalize(td.turndown(cleanForTurndown(html)))
}

/** 붙여넣은 텍스트가 마크다운인지 판별 (2종 이상 신호) */
export function looksLikeMarkdown(text) {
  if (!text || text.length < 12) return false
  const signals = [
    /^#{2,3}\s+\S/m,        // ## 제목
    /^\|.+\|\s*$/m,          // | 표 |
    /^[-*]\s+\S/m,           // - 목록
    /^\d+\.\s+\S/m,          // 1. 목록
    /\*\*[^*\n]+\*\*/,       // **굵게**
    /!\[[^\]]*\]\([^)]+\)/,  // ![](img)
    /\[[^\]]+\]\([^)]+\)/,   // [링크](url)
  ]
  return signals.filter((r) => r.test(text)).length >= 2
}

/** 프론트매터 파싱 / 직렬화 */
const FM_ORDER = ['title','slug','category','type','summary','env','audience','tags','thumb','order','status']
export function parseDoc(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(': ')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 2).trim()
  }
  return { meta, body: m[2] }
}
export function serializeDoc(meta, body) {
  const keys = [...FM_ORDER.filter((k) => meta[k] != null && meta[k] !== ''),
                ...Object.keys(meta).filter((k) => !FM_ORDER.includes(k) && meta[k])]
  const fm = keys.map((k) => `${k}: ${meta[k]}`).join('\n')
  return `---\n${fm}\n---\n\n${body.trim()}\n`
}
