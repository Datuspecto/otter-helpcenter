import { Node, mergeAttributes } from '@tiptap/core'

/** 예외 안내 블록 — 문서당 하나, 항상 맨 끝 */
export const Exception = Node.create({
  name: 'exception',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-exception]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-exception': 'true', class: 'exception' }), 0]
  },
  addCommands() {
    return {
      insertException: () => ({ chain, editor }) => {
        if (editor.state.doc.content.content.some(n => n.type.name === 'exception')) {
          alert('예외 안내는 문서당 하나만 넣을 수 있습니다.')
          return false
        }
        return chain().focus().insertContentAt(editor.state.doc.content.size, {
          type: 'exception',
          content: [{ type: 'bulletList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [
              { type: 'text', marks: [{ type: 'bold' }], text: '조건' },
              { type: 'text', text: ' — 설명을 적어 주세요.' }]}]}]}],
        }).run()
      },
    }
  },
})
