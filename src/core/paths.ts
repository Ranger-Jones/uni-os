import { isAbsolute, relative, resolve, sep } from 'node:path'

/** Absolute path of `rel` inside `root`, or null if it would escape `root`. */
export function resolveInside(root: string, rel: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(rel)
  } catch {
    return null
  }
  if (!decoded || isAbsolute(decoded)) return null
  const abs = resolve(root, decoded)
  const r = relative(root, abs)
  if (!r || r.startsWith('..') || isAbsolute(r) || r.split(sep).includes('..')) return null
  return abs
}

/** A file name safe to use as the last path segment. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/[\u0000-\u001f:]/g, '_').replace(/^\.+/, '').trim()
  return cleaned || 'file'
}

const OPENABLE = new Set(['webm', 'm4v', 'pdf', 'txt', 'md', 'csv', 'json', 'rtf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'ods', 'odp', 'pages', 'numbers', 'key', 'epub', 'mp3', 'm4a', 'mp4', 'mov', 'zip'])

/** Whether a stored file may be handed to the OS default app (documents only — never scripts or executables). */
export function isSafeToOpen(name: string): boolean {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  return OPENABLE.has(ext)
}

/** Single byte range from an HTTP Range header (what <video> sends when seeking); null if absent/unsatisfiable. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  return start >= size || start > end ? null : { start, end }
}
