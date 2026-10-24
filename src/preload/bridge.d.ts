export interface Bridge {
  invoke(path: string, input?: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }>
  on(channel: 'db:changed' | 'chat:event' | 'menu:command', cb: (...args: unknown[]) => void): () => void
  platform: string
}

declare global {
  interface Window {
    bridge: Bridge
  }
}
