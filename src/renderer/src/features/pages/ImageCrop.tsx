import { useBlockNoteEditor, useComponentsContext, useEditorState } from '@blocknote/react'
import { Crop } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../components/ui/Button'
import { api } from '../../lib/api'

export interface CropTarget {
  blockId: string
  url: string
  previewWidth?: number
}

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const FULL: Box = { left: 0, top: 0, right: 1, bottom: 1 }
/** Smallest crop, as a fraction of the image side. */
const MIN = 0.03

/** Toolbar button shown while a single stored image block is selected. */
export function ImageCropButton({ onCrop }: { onCrop(target: CropTarget): void }) {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor()
  const block = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable) return undefined
      const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block]
      const b = blocks.length === 1 ? blocks[0] : undefined
      const url = b?.type === 'image' ? (b.props as { url?: string }).url : undefined
      return b && url?.startsWith('unios-file:') ? b : undefined
    }
  })
  if (!block) return null
  const props = block.props as { url: string; previewWidth?: number }
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      label="Crop image"
      mainTooltip="Crop image"
      icon={<Crop size={16} />}
      onClick={() => onCrop({ blockId: block.id, url: props.url, previewWidth: props.previewWidth })}
    />
  )
}

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLES: { h: Handle; style: React.CSSProperties; cursor: string }[] = [
  { h: 'nw', style: { left: 0, top: 0 }, cursor: 'nwse-resize' },
  { h: 'n', style: { left: '50%', top: 0 }, cursor: 'ns-resize' },
  { h: 'ne', style: { left: '100%', top: 0 }, cursor: 'nesw-resize' },
  { h: 'e', style: { left: '100%', top: '50%' }, cursor: 'ew-resize' },
  { h: 'se', style: { left: '100%', top: '100%' }, cursor: 'nwse-resize' },
  { h: 's', style: { left: '50%', top: '100%' }, cursor: 'ns-resize' },
  { h: 'sw', style: { left: 0, top: '100%' }, cursor: 'nesw-resize' },
  { h: 'w', style: { left: 0, top: '50%' }, cursor: 'ew-resize' }
]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** New box after dragging `handle` by (dx, dy), given in fractions of the image. */
function dragBox(start: Box, handle: Handle, dx: number, dy: number): Box {
  if (handle === 'move') {
    const w = start.right - start.left
    const h = start.bottom - start.top
    const left = clamp(start.left + dx, 0, 1 - w)
    const top = clamp(start.top + dy, 0, 1 - h)
    return { left, top, right: left + w, bottom: top + h }
  }
  const b = { ...start }
  if (handle.includes('w')) b.left = clamp(start.left + dx, 0, start.right - MIN)
  if (handle.includes('e')) b.right = clamp(start.right + dx, start.left + MIN, 1)
  if (handle.includes('n')) b.top = clamp(start.top + dy, 0, start.bottom - MIN)
  if (handle.includes('s')) b.bottom = clamp(start.bottom + dy, start.top + MIN, 1)
  return b
}

/** The image element of a block in the editor, if it is on screen. */
const imageOf = (blockId: string) => document.querySelector<HTMLImageElement>(`.bn-block-outer[data-id="${CSS.escape(blockId)}"] img`)

/**
 * Crop frame laid directly over an image block in the editor; the cropped image replaces the block's image
 * (undo restores it). It floats above the page instead of living inside the editor's DOM, which ProseMirror owns.
 */
export function InlineCropper({ pageId, target, onClose, onCropped }: { pageId: string; target: CropTarget | null; onClose(): void; onCropped(url: string, previewWidth?: number): void }) {
  const [box, setBox] = useState<Box>(FULL)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const drag = useRef<{ handle: Handle; x: number; y: number; start: Box } | null>(null)

  useEffect(() => {
    setBox(FULL)
    setError(null)
    setRect(null)
    if (!target) return
    const img = imageOf(target.blockId)
    if (!img) return onClose()
    setSize({ w: img.naturalWidth, h: img.naturalHeight })
    // Follow the image while the page scrolls or the layout changes.
    const update = () => setRect(img.getBoundingClientRect())
    update()
    const ro = new ResizeObserver(update)
    ro.observe(img)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [target, onClose])

  const unchanged = box.left === 0 && box.top === 0 && box.right === 1 && box.bottom === 1
  const apply = async () => {
    if (!target || busy || unchanged) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.assets.crop({ pageId, url: target.url, box })
      onCropped(r.url, target.previewWidth ? Math.max(80, Math.round(target.previewWidth * (box.right - box.left))) : undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    if (!target) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'Enter') void applyRef.current()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [target, onClose])

  const onPointerDown = (handle: Handle) => (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { handle, x: e.clientX, y: e.clientY, start: box }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || !rect) return
    setBox(dragBox(d.start, d.handle, (e.clientX - d.x) / rect.width, (e.clientY - d.y) / rect.height))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  if (!target || !rect) return null
  const pct = (v: number) => `${v * 100}%`
  return createPortal(
    <div role="group" aria-label="Crop image">
      <div
        className="fixed z-50 touch-none select-none"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Dims what will be cut away. */}
        {[
          { left: 0, top: 0, width: '100%', height: pct(box.top) },
          { left: 0, top: pct(box.bottom), width: '100%', height: pct(1 - box.bottom) },
          { left: 0, top: pct(box.top), width: pct(box.left), height: pct(box.bottom - box.top) },
          { left: pct(box.right), top: pct(box.top), width: pct(1 - box.right), height: pct(box.bottom - box.top) }
        ].map((style, i) => (
          <div key={i} className="pointer-events-none absolute bg-black/45" style={style} />
        ))}
        <div
          className="absolute cursor-move outline outline-2 outline-accent"
          style={{ left: pct(box.left), top: pct(box.top), width: pct(box.right - box.left), height: pct(box.bottom - box.top) }}
          onPointerDown={onPointerDown('move')}
        >
          {HANDLES.map(({ h, style, cursor }) => (
            <span
              key={h}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white bg-accent"
              style={{ ...style, cursor }}
              onPointerDown={onPointerDown(h)}
            />
          ))}
        </div>
      </div>
      <div
        className="fixed z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-line bg-raised p-1 shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
        style={{ left: rect.left + rect.width / 2, top: Math.min(rect.bottom + 8, window.innerHeight - 44) }}
      >
        {size && (
          <span className="px-1.5 text-[12px] text-muted tabular-nums">
            {Math.round((box.right - box.left) * size.w)} × {Math.round((box.bottom - box.top) * size.h)} px
          </span>
        )}
        {error && <span className="px-1.5 text-[12px] text-danger">{error}</span>}
        <Button size="sm" variant="ghost" disabled={busy || unchanged} onClick={() => setBox(FULL)}>
          Reset
        </Button>
        <Button size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={() => void apply()} disabled={busy || unchanged}>
          {busy ? 'Cropping…' : 'Crop'}
        </Button>
      </div>
    </div>,
    document.body
  )
}
