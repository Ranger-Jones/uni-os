import { join } from 'node:path'
import { app, BrowserWindow, dialog, nativeTheme, shell } from 'electron'
import { defaultUserDataDir } from '@core/settings'
import { isSafeExternalUrl } from '@core/url'
import { AppContext } from './context'
import { registerDropImport, registerIpc } from './ipc'
import { importFiles } from '@core/repo/files'
import { handleFileScheme, registerFileScheme } from './protocol'
import { scheduleBackups } from './backup'
import { ChatService } from './llm/chat'
import { createRouter } from './router'
import { watchExternalChanges } from './watcher'

app.setName('UniOS')
app.setPath('userData', defaultUserDataDir())
registerFileScheme()

let mainWindow: BrowserWindow | null = null
const ctx = new AppContext(join(app.getPath('userData'), 'settings.json'))

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // macOS gets the borderless look with inset traffic lights; Windows/Linux keep their native frame.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 14 } } : { autoHideMenuBar: true }),
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
  handleFileScheme(ctx)
  const router = createRouter(ctx, {
    chooseFolder: async (title) => {
      const r = await dialog.showOpenDialog({ title, properties: ['openDirectory', 'createDirectory'] })
      return r.canceled ? null : (r.filePaths[0] ?? null)
    },
    chooseFiles: async (title) => {
      const r = await dialog.showOpenDialog({ title, properties: ['openFile', 'multiSelections'] })
      return r.canceled ? [] : r.filePaths
    },
    openPath: async (path) => {
      const err = await shell.openPath(path)
      if (err) throw new Error(err)
    },
    showInFolder: (path) => shell.showItemInFolder(path),
    applyTheme: (theme) => {
      nativeTheme.themeSource = theme
    },
    appInfo: () => ({ version: app.getVersion(), userDataDir: app.getPath('userData'), platform: process.platform })
  }, new ChatService(ctx, () => mainWindow?.webContents ?? null))
  registerIpc(router)
  registerDropImport((courseId, paths) => importFiles(ctx.db, ctx.filesDir, courseId, paths))
  mainWindow = createWindow()
  watchExternalChanges(ctx, () => mainWindow)
  scheduleBackups(ctx)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => ctx.close())
