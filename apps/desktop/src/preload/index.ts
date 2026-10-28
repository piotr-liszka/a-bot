import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

function on<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_e: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('abot', {
  platform: process.platform,
  isDesktop: true,
  workers: {
    list: () => ipcRenderer.invoke('workers:list'),
    save: (input: unknown) => ipcRenderer.invoke('workers:save', input),
    remove: (id: string) => ipcRenderer.invoke('workers:remove', id),
    link: (id: string, deviceId: string) => ipcRenderer.invoke('workers:link', id, deviceId),
    test: (input: unknown) => ipcRenderer.invoke('workers:test', input),
    install: (id: string, opts: unknown) => ipcRenderer.invoke('workers:install', id, opts),
    desktop: (id: string) => ipcRenderer.invoke('workers:desktop', id),
    exec: (id: string, command: string) => ipcRenderer.invoke('workers:exec', id, command),
    onProgress: (listener: (e: unknown) => void) => on('workers:progress', listener),
  },
  terminal: {
    open: (id: string, kind: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:open', id, kind, cols, rows),
    write: (termId: string, data: string) => ipcRenderer.send('terminal:write', termId, data),
    resize: (termId: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', termId, cols, rows),
    close: (termId: string) => ipcRenderer.send('terminal:close', termId),
    onData: (listener: (e: { termId: string; data: string }) => void) => on('terminal:data', listener),
    onExit: (listener: (e: { termId: string }) => void) => on('terminal:exit', listener),
  },
});
