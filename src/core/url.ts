/** Only web links may leave the app via the system browser. */
export function isSafeExternalUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
