// Text extraction for imported files. Failures never throw: the file is kept, just without text.
import { extractText as pdfText, getDocumentProxy } from 'unpdf'
import { joinPages } from './pageText'

export interface Extracted {
  text: string | null
  pageCount: number | null
}

/** Types whose text we extract (everything else is copied without being read into memory). */
export const extractable = (mime: string): boolean => mime === 'application/pdf' || TEXT_TYPES.has(mime)

const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json'])

export async function extractText(data: Uint8Array, mime: string): Promise<Extracted> {
  try {
    if (mime === 'application/pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(data))
      const { totalPages, text } = await pdfText(pdf, { mergePages: false })
      const pages = text.map((t) => t.replace(/[ \t]+\n/g, '\n').trim())
      // Keep page boundaries ("[Page N]") so tools can point to the slide; no text at all means a scanned PDF.
      return { text: pages.some(Boolean) ? joinPages(pages) : null, pageCount: totalPages }
    }
    if (TEXT_TYPES.has(mime)) return { text: new TextDecoder().decode(data), pageCount: null }
  } catch {
    // unreadable or encrypted document
  }
  return { text: null, pageCount: null }
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4'
}

export const mimeFor = (name: string): string => MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
