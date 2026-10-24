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

const OPENABLE = new Set(['pdf', 'txt', 'md', 'csv', 'json', 'rtf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'ods', 'odp', 'pages', 'numbers', 'key', 'epub', 'mp3', 'm4a', 'mp4', 'mov', 'zip'])

/** Whether a stored file may be handed to the OS default app (documents only — never scripts or executables). */
export function isSafeToOpen(name: string): boolean {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  return OPENABLE.has(ext)
}
