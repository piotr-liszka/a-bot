import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('abot', {
  platform: process.platform,
  isDesktop: true,
});
