import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'

const EVENTS = new Set(['db:changed', 'chat:event', 'menu:command'])

const bridge = {
  invoke: (path: string, input?: unknown) => ipcRenderer.invoke('api:invoke', path, input),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    if (!EVENTS.has(channel)) throw new Error(`Channel not allowed: ${channel}`)
    const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  importDroppedFiles: (courseId: string, files: File[]) =>
    ipcRenderer.invoke(
      'files:importDropped',
      courseId,
      files.map((f) => webUtils.getPathForFile(f)).filter(Boolean)
    ),
  platform: process.platform
}

contextBridge.exposeInMainWorld('bridge', bridge)

export type Bridge = typeof bridge
