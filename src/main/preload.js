const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStatus:            ()      => ipcRenderer.invoke('get-status'),
  checkUpdates:         ()      => ipcRenderer.invoke('check-updates'),
  updateDiscord:        ()      => ipcRenderer.invoke('update-discord'),
  updateBetterDiscord:  ()      => ipcRenderer.invoke('update-betterdiscord'),
  repairDiscord:        ()      => ipcRenderer.invoke('repair-discord'),
  launchDiscord:        ()      => ipcRenderer.invoke('launch-discord'),
  setSetting:           (k, v)  => ipcRenderer.invoke('set-setting', { key: k, value: v }),
  getHistory:           ()      => ipcRenderer.invoke('get-history'),
  clearHistory:         ()      => ipcRenderer.invoke('clear-history'),
  openExternal:         (url)   => ipcRenderer.invoke('open-external', url),
  minimizeWindow:       ()      => ipcRenderer.invoke('minimize-window'),
  closeWindow:          ()      => ipcRenderer.invoke('close-window'),
  quitApp:              ()      => ipcRenderer.invoke('quit-app'),

  // Events from main process
  onUpdateCheckResult:  (cb) => ipcRenderer.on('update-check-result',  (_, d) => cb(d)),
  onUpdateCheckError:   (cb) => ipcRenderer.on('update-check-error',   (_, d) => cb(d)),
  onBDUpdateRequired:   (cb) => ipcRenderer.on('bd-update-required',   (_, d) => cb(d)),
  onBDUpdateProgress:   (cb) => ipcRenderer.on('bd-update-progress',   (_, d) => cb(d)),
  onBDUpdateDone:       (cb) => ipcRenderer.on('bd-update-done',       (_, d) => cb(d)),
  onBDUpdateError:      (cb) => ipcRenderer.on('bd-update-error',      (_, d) => cb(d)),
});
