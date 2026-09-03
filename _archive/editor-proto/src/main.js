import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { Exception } from './exception.js'
import { mdToHtml, htmlToMd, looksLikeMarkdown } from './md.js'
window.__md = { mdToHtml, htmlToMd, looksLikeMarkdown }  // 검증용

const CATS = {
  'getting-started':'시작하기','integrations':'연동','orders':'주문 접수','automation':'주문 자동화',
  'settings':'설정','biz-manager':'비즈니스 매니저','reviews':'리뷰 관리','pricing':'요금·결제',
  'troubleshooting':'문제 해결','contact':'문의'
}
const app = document.getElementById('app')
const api = (u, o) => fetch(u, o).then(r => r.json())
let editor = null, current = null, dirty = false, lastPaste = null

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))

/* ---------- 목록 ---------- */
async function renderList() {
  const docs = await api('/api/articles')
  const groups = {}
  docs.forEach(d => (groups[d.category] ||= []).push(d))
  app.innerHTML = `
  <header class="ad-top"><div class="ad-brand"><img src="/assets/otter-logo.svg" alt="Otter"><span>어드민</span></div>
    <div class="ad-top-r"><input id="fq" placeholder="문서 검색"><button class="btn ghost" id="upload-md">마크다운 업로드</button><button class="btn ghost" id="export">전체 내보내기</button><button class="btn">새 문서</button></div>
  </header>
  <div class="ad-wrap">
    <div class="ad-head"><h1>문서 ${docs.length}편</h1>
      <p>초안 ${docs.filter(d=>d.status!=='published').length} · 발행 ${docs.filter(d=>d.status==='published').length} · 확인필요 ${docs.reduce((a,d)=>a+d.notes,0)}건</p></div>
    ${Object.entries(groups).map(([c, list]) => `
      <section class="ad-grp"><h2>${CATS[c]||c} <em>${list.length}</em></h2>
        <ul class="ad-list">${list.map(d => `
          <li data-file="${esc(d.file)}" draggable="true">
            <span class="grip">⠿</span>
            <span class="ttl">${esc(d.title)}</span>
            <span class="slug">${esc(d.slug)}</span>
            ${d.notes ? `<span class="warn">확인필요 ${d.notes}</span>` : ''}
            <span class="chars">${d.chars}자</span>
            <span class="badge ${d.status==='published'?'pub':''}">${d.status==='published'?'발행':'초안'}</span>
          </li>`).join('')}</ul></section>`).join('')}
  </div>`
  app.querySelectorAll('.ad-list li').forEach(li =>
    li.addEventListener('click', () => openDoc(li.dataset.file)))
  const fq = document.getElementById('fq')
  fq.addEventListener('input', () => {
    const v = fq.value.trim().toLowerCase()
    app.querySelectorAll('.ad-list li').forEach(li =>
      li.style.display = li.textContent.toLowerCase().includes(v) ? '' : 'none')
  })
  document.getElementById('export').onclick = () => alert('전체 마크다운 내보내기 — 실제 구현에서 zip 다운로드')
  document.getElementById('upload-md').onclick = () => alert('마크다운 파일 업로드 — 실제 구현에서 드래그앤드롭')
  // 드래그 순서 변경
  let drag = null
  app.querySelectorAll('.ad-list li').forEach(li => {
    li.addEventListener('dragstart', () => { drag = li; li.classList.add('dragging') })
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); drag = null })
    li.addEventListener('dragover', e => {
      e.preventDefault()
      if (!drag || drag === li || drag.parentNode !== li.parentNode) return
      const r = li.getBoundingClientRect()
      li.parentNode.insertBefore(drag, (e.clientY - r.top) / r.height > .5 ? li.nextSibling : li)
    })
  })
}

/* ---------- 편집 ---------- */
async function openDoc(file) {
  const d = await api('/api/articles/' + encodeURIComponent(file))
  current = d; dirty = false
  app.innerHTML = `
  <header class="ad-top">
    <div class="ad-brand"><button class="back" id="back">←</button><span>${esc(d.meta.title)}</span></div>
    <div class="ad-top-r">
      <span id="saved" class="saved"></span>
      <button class="btn ghost" id="md-toggle">마크다운 보기</button>
      <button class="btn ghost" id="hist">이력 ${d.revisions.length}</button>
      <button class="btn ghost" id="save">저장 <kbd>⌘S</kbd></button>
      <button class="btn primary" id="publish">발행</button>
    </div>
  </header>
  <div class="ed-wrap">
    <div class="ed-main">
      <input id="title" class="ed-title" value="${esc(d.meta.title)}" placeholder="문서 제목">
      <div class="toolbar" id="tb">
        <button data-a="h2">제목2</button><button data-a="h3" class="hl">제목3</button>
        <i></i><button data-a="bold"><b>B</b></button><button data-a="link">링크</button>
        <i></i><button data-a="ul">목록</button><button data-a="ol">번호</button>
        <i></i><button data-a="table">표</button><button data-a="image">이미지</button>
        <i></i><button data-a="exception" class="exc">예외 안내</button>
        <i></i><button data-a="hr">구분선</button>
      </div>
      <div class="tb-table" id="tbt" hidden>
        <span class="tbt-label">표</span>
        <button data-t="colBefore">← 열 추가</button>
        <button data-t="colAfter">열 추가 →</button>
        <button data-t="delCol" class="del">열 삭제</button>
        <i></i>
        <button data-t="rowBefore">↑ 행 추가</button>
        <button data-t="rowAfter">행 추가 ↓</button>
        <button data-t="delRow" class="del">행 삭제</button>
        <i></i>
        <button data-t="delTable" class="del">표 삭제</button>
      </div>
      <div id="ed" class="doc ed-surface"></div>
      <textarea id="raw" class="ed-raw" hidden></textarea>
    </div>
    <aside class="ed-side">
      <label>카테고리<select id="m-category">${Object.entries(CATS).map(([k,v])=>`<option value="${k}"${d.meta.category===k?' selected':''}>${v}</option>`).join('')}</select></label>
      <label>순서<input id="m-order" type="number" value="${esc(d.meta.order||1)}"></label>
      <label>slug<input id="m-slug" value="${esc(d.meta.slug)}"></label>
      <label>요약 <span class="cnt" id="sum-cnt"></span><textarea id="m-summary" rows="4">${esc(d.meta.summary)}</textarea></label>
      <label>태그<input id="m-tags" value="${esc(d.meta.tags)}"></label>
      <label>실행 환경<select id="m-env">${['all','windows','chrome','app','bizmanager'].map(v=>`<option${d.meta.env===v?' selected':''}>${v}</option>`).join('')}</select></label>
      <label>배너 이미지
        <div class="thumb-row">
          <input id="m-thumb" value="${esc(d.meta.thumb||'')}" placeholder="비우면 카테고리 배너">
          <button type="button" id="thumb-pick">파일</button>
        </div>
      </label>
      <div class="banner-prev" id="banner-prev">
        <img id="banner-img" src="" alt="">
        <span class="drop-hint">클릭하거나 이미지를 끌어다 놓으세요</span>
      </div>
      <button type="button" class="thumb-reset" id="thumb-reset" hidden>카테고리 배너로 되돌리기</button>
      <label>상태<select id="m-status"><option value="draft"${d.meta.status!=='published'?' selected':''}>초안</option><option value="published"${d.meta.status==='published'?' selected':''}>발행</option></select></label>
    </aside>
  </div>
  <div id="hist-panel" class="hist-panel" hidden></div>`

  editor = new Editor({
    element: document.getElementById('ed'),
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Image.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
      Exception,
    ],
    content: mdToHtml(d.body),
    onUpdate: () => { dirty = true; setSaved('저장 안 됨', true) },
    editorProps: {
      handlePaste(view, event) {
        // 이미지 붙여넣기 → 업로드
        const items = [...(event.clipboardData?.items || [])]
        const img = items.find(i => i.type.startsWith('image/'))
        if (img) {
          const f = img.getAsFile()
          uploadImage(f); return true
        }
        // 마크다운 붙여넣기 → 자동 변환
        const text = event.clipboardData?.getData('text/plain')
        if (text && looksLikeMarkdown(text)) {
          lastPaste = text
          editor.chain().focus().insertContent(mdToHtml(text)).run()
          showUndoPaste()
          return true
        }
        return false
      },
      handleDrop(view, event) {
        const f = event.dataTransfer?.files?.[0]
        if (f && f.type.startsWith('image/')) { uploadImage(f); return true }
        return false
      },
    },
  })

  document.getElementById('back').onclick = () => { if (confirmLeave()) renderList() }
  document.getElementById('save').onclick = save
  document.getElementById('publish').onclick = publish
  document.getElementById('md-toggle').onclick = toggleRaw
  document.getElementById('hist').onclick = toggleHist
  document.getElementById('tb').addEventListener('click', e => {
    const a = e.target.closest('button')?.dataset.a; if (a) doAction(a)
  })
  document.getElementById('tbt').addEventListener('click', e => {
    const t = e.target.closest('button')?.dataset.t; if (t) doTableAction(t)
  })
  document.getElementById('title').addEventListener('input', () => { dirty = true; setSaved('저장 안 됨', true) })
  app.querySelectorAll('.ed-side input,.ed-side select,.ed-side textarea').forEach(el =>
    el.addEventListener('input', () => { dirty = true; setSaved('저장 안 됨', true); if (el.id==='m-summary') sumCnt() }))
  sumCnt()
  setupBanner()
  setSaved('저장됨')
}

/* 배너 이미지 — 업로드 / 드래그 / 되돌리기 */
function refreshBanner() {
  const t = document.getElementById('m-thumb').value.trim()
  const cat = document.getElementById('m-category').value
  document.getElementById('banner-img').src = t ? (t.startsWith('/') ? t : '/' + t)
                                                : `/assets/hero-${cat}.svg`
  document.getElementById('thumb-reset').hidden = !t
  document.getElementById('banner-prev').classList.toggle('custom', !!t)
}
async function setBannerFile(file) {
  if (!file || !file.type.startsWith('image/')) return
  const ext = (file.name || 'png').split('.').pop()
  const r = await fetch('/api/upload?ext=' + ext, { method: 'POST', body: file }).then(r => r.json())
  document.getElementById('m-thumb').value = r.url
  dirty = true; setSaved('저장 안 됨', true); refreshBanner()
}
function setupBanner() {
  const prev = document.getElementById('banner-prev')
  const pick = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'
    i.onchange = () => setBannerFile(i.files[0]); i.click()
  }
  document.getElementById('thumb-pick').onclick = pick
  prev.onclick = pick
  prev.addEventListener('dragover', e => { e.preventDefault(); prev.classList.add('over') })
  prev.addEventListener('dragleave', () => prev.classList.remove('over'))
  prev.addEventListener('drop', e => {
    e.preventDefault(); prev.classList.remove('over')
    setBannerFile(e.dataTransfer.files[0])
  })
  document.getElementById('thumb-reset').onclick = () => {
    document.getElementById('m-thumb').value = ''
    dirty = true; setSaved('저장 안 됨', true); refreshBanner()
  }
  document.getElementById('m-thumb').addEventListener('input', refreshBanner)
  document.getElementById('m-category').addEventListener('change', refreshBanner)
  refreshBanner()
}

function sumCnt() {
  const v = document.getElementById('m-summary').value.length
  const el = document.getElementById('sum-cnt')
  el.textContent = `${v}자`
  el.className = 'cnt' + (v < 60 ? ' bad' : v > 160 ? ' bad' : ' ok')
}
function setSaved(t, warn) {
  const el = document.getElementById('saved'); if (!el) return
  el.textContent = t; el.className = 'saved' + (warn ? ' warn' : '')
}
async function uploadImage(file) {
  const ext = (file.name || 'png').split('.').pop()
  const r = await fetch('/api/upload?ext=' + ext, { method: 'POST', body: file }).then(r => r.json())
  editor.chain().focus().setImage({ src: r.url }).run()
}
function showUndoPaste() {
  const b = document.createElement('div')
  b.className = 'toast'
  b.innerHTML = '마크다운으로 변환했어요 <button>원문 그대로 붙여넣기</button>'
  document.body.appendChild(b)
  b.querySelector('button').onclick = () => {
    editor.chain().focus().undo().run()
    editor.chain().focus().insertContent(lastPaste.split('\n').map(l => `<p>${esc(l)}</p>`).join('')).run()
    b.remove()
  }
  setTimeout(() => b.remove(), 6000)
}
function doAction(a) {
  const c = editor.chain().focus()
  if (a === 'h2') c.toggleHeading({ level: 2 }).run()
  if (a === 'h3') c.toggleHeading({ level: 3 }).run()
  if (a === 'bold') c.toggleBold().run()
  if (a === 'ul') c.toggleBulletList().run()
  if (a === 'ol') c.toggleOrderedList().run()
  if (a === 'hr') c.setHorizontalRule().run()
  if (a === 'table') openTablePicker()
  if (a === 'link') { const u = prompt('링크 주소', '/help/'); if (u) c.setLink({ href: u }).run() }
  if (a === 'image') { const i = document.createElement('input'); i.type='file'; i.accept='image/*,video/mp4'
    i.onchange = () => uploadImage(i.files[0]); i.click() }
  if (a === 'exception') c.insertException().run()
}
/* 표 크기 선택 팝오버 */
function openTablePicker() {
  document.querySelector('.tp')?.remove()
  const btn = document.querySelector('[data-a="table"]')
  const el = document.createElement('div')
  el.className = 'tp'
  const MAX = 6
  el.innerHTML = `<div class="tp-grid">${Array.from({length: MAX*MAX}, (_, i) =>
    `<span data-r="${Math.floor(i/MAX)+1}" data-c="${i%MAX+1}"></span>`).join('')}</div>
    <div class="tp-label">크기를 고르세요</div>`
  document.body.appendChild(el)
  const r = btn.getBoundingClientRect()
  el.style.left = r.left + 'px'
  el.style.top = (r.bottom + window.scrollY + 6) + 'px'
  const cells = [...el.querySelectorAll('.tp-grid span')]
  const label = el.querySelector('.tp-label')
  cells.forEach(cell => {
    cell.addEventListener('mouseenter', () => {
      const R = +cell.dataset.r, C = +cell.dataset.c
      cells.forEach(x => x.classList.toggle('on', +x.dataset.r <= R && +x.dataset.c <= C))
      label.textContent = `${R}행 × ${C}열 (머리행 포함)`
    })
    cell.addEventListener('click', () => {
      editor.chain().focus().insertTable({ rows: +cell.dataset.r, cols: +cell.dataset.c, withHeaderRow: true }).run()
      el.remove()
    })
  })
  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!el.contains(e.target)) { el.remove(); document.removeEventListener('click', h) }
  }), 0)
}

/* 표 안에 있을 때만 표 도구모음 표시 */
function syncTableBar() {
  const bar = document.getElementById('tbt')
  if (!bar || !editor) return
  bar.hidden = !editor.isActive('table')
}
function doTableAction(t) {
  const c = editor.chain().focus()
  const map = {
    colBefore: 'addColumnBefore', colAfter: 'addColumnAfter', delCol: 'deleteColumn',
    rowBefore: 'addRowBefore', rowAfter: 'addRowAfter', delRow: 'deleteRow',
    delTable: 'deleteTable',
  }
  if (t === 'delTable' && !confirm('표를 삭제할까요?')) return
  c[map[t]]().run()
}

function collectMeta() {
  const g = id => document.getElementById(id).value.trim()
  return { ...current.meta, title: g('title'), slug: g('m-slug'), category: g('m-category'),
    summary: g('m-summary'), tags: g('m-tags'), env: g('m-env'), thumb: g('m-thumb'),
    order: g('m-order'), status: g('m-status') }
}
function currentMd() {
  const raw = document.getElementById('raw')
  return raw.hidden ? htmlToMd(editor.getHTML()) : raw.value
}
async function save() {
  const body = currentMd()
  await api('/api/articles/' + encodeURIComponent(current.file),
    { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta: collectMeta(), body }) })
  dirty = false; setSaved('저장됨 ' + new Date().toLocaleTimeString('ko-KR'))
  current = await api('/api/articles/' + encodeURIComponent(current.file))
  document.getElementById('hist').textContent = '이력 ' + current.revisions.length
}
function publish() {
  const md = currentMd()
  const problems = []
  const notes = md.match(/<!--[\s\S]*?-->/g) || []
  if (notes.length) problems.push(`확인필요 주석 ${notes.length}건`)
  if (document.getElementById('m-summary').value.trim().length < 30) problems.push('요약이 너무 짧습니다')
  const dead = [...md.matchAll(/\]\((\/help\/[^)]+)\)/g)].map(m => m[1])
  if (dead.length) problems.push(`내부 링크 ${dead.length}건 — 대상 문서 존재 여부 확인 필요`)
  if (problems.length) {
    if (!confirm('발행 전 확인이 필요합니다:\n\n· ' + problems.join('\n· ') + '\n\n그래도 발행할까요?')) return
  }
  document.getElementById('m-status').value = 'published'
  save().then(() => alert('발행되었습니다.'))
}
function toggleRaw() {
  const raw = document.getElementById('raw'), ed = document.getElementById('ed')
  const btn = document.getElementById('md-toggle')
  if (raw.hidden) {
    raw.value = htmlToMd(editor.getHTML()); raw.hidden = false; ed.hidden = true
    btn.textContent = '편집 화면으로'
  } else {
    editor.commands.setContent(mdToHtml(raw.value)); raw.hidden = true; ed.hidden = false
    btn.textContent = '마크다운 보기'
  }
}
async function toggleHist() {
  const el = document.getElementById('hist-panel')
  if (!el.hidden) { el.hidden = true; return }
  el.hidden = false
  el.innerHTML = `<h3>수정 이력</h3>${current.revisions.length ? '' : '<p class="none">아직 저장 이력이 없습니다. 저장할 때마다 여기에 쌓입니다.</p>'}
    <ul>${current.revisions.map(r => `<li><span>${r.replace('.md','').replace('T',' ').slice(0,19)}</span><button data-r="${r}">이 시점 보기</button></li>`).join('')}</ul>
    <button class="btn ghost close">닫기</button>`
  el.querySelector('.close').onclick = () => el.hidden = true
  el.querySelectorAll('button[data-r]').forEach(b => b.onclick = async () => {
    const d = await api('/api/revision/' + encodeURIComponent(current.file + '|' + b.dataset.r))
    if (confirm('이 시점 내용으로 되돌릴까요? 현재 내용은 저장 이력에 남습니다.')) {
      editor.commands.setContent(mdToHtml(d.body)); dirty = true; setSaved('저장 안 됨', true); el.hidden = true
    }
  })
}
function confirmLeave() {
  return !dirty || confirm('저장하지 않은 변경이 있습니다. 나가시겠어요?')
}
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = '' } })
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (editor) save() }
})
renderList()
