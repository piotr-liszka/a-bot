import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron';
import { join } from 'node:path';
import { WorkerManager, type ExecCommand, type InstallOptions, type TerminalKind, type WorkerInput } from './workers';

const workers = new WorkerManager();

function registerIpc() {
  ipcMain.handle('workers:list', () => workers.list());
  ipcMain.handle('workers:save', (_e, input: WorkerInput & { id?: string }) => workers.save(input));
  ipcMain.handle('workers:remove', (_e, id: string) => workers.remove(id));
  ipcMain.handle('workers:link', (_e, id: string, deviceId: string) => workers.link(id, deviceId));
  ipcMain.handle('workers:outdated', (_e, id: string) => workers.outdated(id));
  ipcMain.handle('workers:test', (_e, input: WorkerInput) => workers.test(input));
  ipcMain.handle('workers:install', (e, id: string, opts: InstallOptions) => workers.install(id, opts, e.sender));
  ipcMain.handle('workers:desktop', (_e, id: string) => workers.desktop(id));
  ipcMain.handle('workers:exec', (_e, id: string, command: ExecCommand) => workers.exec(id, command));
  ipcMain.handle('terminal:open', (e, id: string, kind: TerminalKind, cols: number, rows: number) => workers.openTerminal(id, kind, cols, rows, e.sender));
  ipcMain.on('terminal:write', (_e, termId: string, data: string) => workers.writeTerminal(termId, data));
  ipcMain.on('terminal:resize', (_e, termId: string, cols: number, rows: number) => workers.resizeTerminal(termId, cols, rows));
  ipcMain.on('terminal:close', (_e, termId: string) => workers.closeTerminal(termId));
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'a-bot',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181f' : '#f8f7f4',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());

  // Links in bot answers open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => workers.dispose());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
