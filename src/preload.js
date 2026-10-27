'use strict';

// Schmale Brücke zwischen Oberfläche und Hauptprozess (keine Node-APIs im Renderer).
// Die Browser-Version (mert.win/pic) baut dieselbe Schnittstelle in src/web/api.js nach.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel, cb) => {
  const f = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, f);
  return () => ipcRenderer.removeListener(channel, f);
};

contextBridge.exposeInMainWorld('api', {
  info: () => invoke('app:info'),
  getSettings: () => invoke('settings:get'),
  setSettings: (s) => invoke('settings:set', s),
  initialFiles: () => invoke('app:initial-files'),
  onOpenFiles: (cb) => on('app:open-files', cb),
  onClosing: (cb) => on('app:closing', cb),
  onSystemTheme: (cb) => on('app:system-theme', cb),
  closeNow: () => invoke('app:close-now'),
  updateReady: () => ipcRenderer.send('app:update-ready'),
  setTitle: (title) => invoke('app:set-title', title),
  toggleFullscreen: () => invoke('win:fullscreen'),
  setFullscreen: (on) => invoke('win:set-fullscreen', on),
  onFullscreen: (cb) => on('app:fullscreen', cb),

  openDialog: (opts) => invoke('file:open-dialog', opts),
  saveDialog: (opts) => invoke('file:save-dialog', opts),
  readFile: (file) => invoke('file:read', file),
  writeFile: (file, data) => invoke('file:write', file, data),
  exists: (file) => invoke('file:exists', file),
  siblings: (file) => invoke('file:siblings', file),
  pathForFile: (file) => webUtils.getPathForFile(file),

  readClipboardImage: () => invoke('clip:read-image'),
  writeClipboardImage: (png) => invoke('clip:write-image', png),
  writeClipboardText: (text) => invoke('clip:write-text', text),

  openExternal: (url) => invoke('shell:open-external', url),
  reveal: (p) => invoke('shell:reveal', p),
});
