import { join } from 'node:path'
import { app, BrowserWindow, dialog, nativeTheme, shell } from 'electron'
import { defaultUserDataDir } from '@core/settings'
import { isSafeExternalUrl } from '@core/url'
import { AppContext } from './context'
import { registerIpc } from './ipc'
import { createRouter } from './router'
import { watchExternalChanges } from './watcher'

app.setName('UniOS')
app.setPath('userData', defaultUserDataDir())

let mainWindow: BrowserWindow | null = null
const ctx = new AppContext(join(app.getPath('userData'), 'settings.json'))

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#191919' : '#ffffff',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: false
    }
  })
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  return win
}

app.whenReady().then(() => {
  nativeTheme.themeSource = ctx.settings.theme
  const router = createRouter(ctx, {
    chooseFolder: async (title) => {
      const r = await dialog.showOpenDialog({ title, properties: ['openDirectory', 'createDirectory'] })
      return r.canceled ? null : (r.filePaths[0] ?? null)
    },
    applyTheme: (theme) => {
      nativeTheme.themeSource = theme
    },
    appInfo: () => ({ version: app.getVersion(), userDataDir: app.getPath('userData'), platform: process.platform })
  })
  registerIpc(router)
  mainWindow = createWindow()
  watchExternalChanges(ctx, () => mainWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => ctx.close())
