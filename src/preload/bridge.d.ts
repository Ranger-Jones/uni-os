export interface Bridge {
  invoke(path: string, input?: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }>
  on(channel: 'db:changed' | 'chat:event' | 'menu:command' | 'update:state', cb: (...args: unknown[]) => void): () => void
  importDroppedFiles(courseId: string, files: File[]): Promise<{ ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }>
  platform: string
}

declare global {
  interface Window {
    bridge: Bridge
  }
}
