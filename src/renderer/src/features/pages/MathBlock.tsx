import { createReactBlockSpec } from '@blocknote/react'
import katex from 'katex'
import { useEffect, useMemo, useRef, useState } from 'react'

function Formula({ latex, onChange, editable }: { latex: string; onChange: (v: string) => void; editable: boolean }) {
  const [editing, setEditing] = useState(!latex && editable)
  const [draft, setDraft] = useState(latex)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setDraft(latex), [latex])
  useEffect(() => {
    if (!editing) return
    // The editor moves its selection after inserting a block; take focus once it is done.
    const t = setTimeout(() => input.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [editing])

  const rendered = useMemo(() => {
    try {
      return { html: katex.renderToString(draft || '\\square', { displayMode: true, throwOnError: true }), error: null }
    } catch (e) {
      return { html: null, error: e instanceof Error ? e.message.replace(/^KaTeX parse error: /, '') : String(e) }
    }
  }, [draft])

  const commit = () => {
    setEditing(false)
    if (draft !== latex) onChange(draft)
  }

  return (
    <div className="unios-math-block w-full" contentEditable={false}>
      <div
        className={`unios-math rounded-md ${editable ? 'cursor-pointer hover:bg-hover' : ''} ${!draft ? 'unios-math-empty' : ''}`}
        onClick={() => editable && setEditing(true)}
        dangerouslySetInnerHTML={rendered.html ? { __html: rendered.html } : undefined}
      >
        {rendered.html ? undefined : <span className="text-danger">{draft}</span>}
      </div>
      {editing && (
        <div className="mt-1 rounded-md border border-line bg-raised p-2">
          <textarea
            ref={input}
            value={draft}
            rows={Math.max(1, draft.split('\n').length)}
            placeholder="LaTeX, e.g. \int_a^b f(x)\,dx = F(b) - F(a)"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if ((e.key === 'Enter' && (e.metaKey || !e.shiftKey)) || e.key === 'Escape') {
                e.preventDefault()
                commit()
              }
            }}
            className="w-full resize-none bg-transparent font-mono text-[13px] outline-none placeholder:text-faint"
          />
          <div className="flex justify-between text-[11.5px] text-faint">
            <span className={rendered.error ? 'text-danger' : ''}>{rendered.error ?? 'Enter to finish · Shift+Enter for a new line'}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Display formula block (LaTeX rendered with KaTeX). Exported to Markdown as a ```latex fence. */
export const MathBlock = createReactBlockSpec(
  { type: 'math', propSchema: { latex: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <Formula latex={block.props.latex} editable={editor.isEditable} onChange={(latex) => editor.updateBlock(block, { props: { latex } })} />
    )
  }
)
