export const isMac = window.bridge.platform === 'darwin'

/** Primary shortcut modifier: ⌘ on macOS, Ctrl elsewhere. */
export const isModKey = (e: KeyboardEvent): boolean => (isMac ? e.metaKey : e.ctrlKey)

export const shortcut = (key: string): string => (isMac ? `⌘${key}` : `Ctrl+${key}`)
