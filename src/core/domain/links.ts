// Web resources attached to courses: kind detection and default titles.

const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|twitch\.tv|dailymotion\.com|panopto\.(eu|com)|opencast\.|tube\.|mediathek|av\.tib\.eu|kaltura|loom\.com|echo360|video\d*\.)/i
const VIDEO_PATH = /\.(mp4|m4v|mov|webm|m3u8)(\?|#|$)|\/(paella|engage)\/|\/watch(\.html)?(\?|$)/i

export type LinkKind = 'link' | 'video'

export function detectLinkKind(url: string): LinkKind {
  try {
    const u = new URL(url)
    return VIDEO_HOSTS.test(u.hostname) || VIDEO_PATH.test(u.pathname + u.search) ? 'video' : 'link'
  } catch {
    return 'link'
  }
}

/** "moodle.uni-weimar.de", or "file name — host" when the URL points at a file. */
export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '')
    const doc = /\.(pdf|pptx?|docx?|xlsx?|zip|ipynb|tex|md|txt|mp4|m4v|mov|webm|mp3)$/i
    const file = doc.test(last) ? last.replace(doc, '').replace(/[_-]+/g, ' ').trim() : ''
    return file ? `${file} — ${host}` : host
  } catch {
    return url
  }
}
