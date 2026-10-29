const HINT = 'Enter the project URL, e.g. https://abcdefgh.supabase.co (Project Settings → API), not the dashboard link.'

/** Normalizes what people paste into the "Project URL" field to the project's API origin. */
export function projectUrl(input: string): string {
  let raw = input.trim()
  if (raw && !/^[a-z]+:\/\//i.test(raw)) raw = `https://${raw}`
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(HINT)
  }
  // The dashboard link (supabase.com/dashboard/project/<ref>/…) names the project ref.
  if (/(^|\.)supabase\.com$/i.test(url.hostname)) {
    const ref = url.pathname.match(/\/project\/([a-z0-9]{10,})/i)?.[1]
    if (!ref) throw new Error(HINT)
    return `https://${ref.toLowerCase()}.supabase.co`
  }
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') throw new Error(HINT)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !local) throw new Error('The project URL must start with https://')
  return url.origin
}

/** Turns Supabase auth errors into something a person can act on. */
export function authErrorMessage(message: string): string {
  if (/unexpected token|not valid json|<!doctype/i.test(message)) return `That address did not answer like a Supabase project. ${HINT}`
  if (/confirm/i.test(message)) return 'Confirm your email address first (check your inbox), then sign in.'
  return message
}
