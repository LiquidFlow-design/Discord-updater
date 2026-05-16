const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStatus:           ()           => ipcRenderer.invoke('get-status'),
  checkUpdates:        ()           => ipcRenderer.invoke('check-updates'),
  updateDiscord:       ()           => ipcRenderer.invoke('update-discord'),
  updateBetterDiscord: ()           => ipcRenderer.invoke('update-betterdiscord'),
  repairDiscord:       ()           => ipcRenderer.invoke('repair-discord'),
  launchDiscord:       (variantId)  => ipcRenderer.invoke('launch-discord', variantId),
  setSetting:          (k, v)       => ipcRenderer.invoke('set-setting', { key: k, value: v }),
  getHistory:          ()           => ipcRenderer.invoke('get-history'),
  clearHistory:        ()           => ipcRenderer.invoke('clear-history'),
  openExternal:        (url)        => ipcRenderer.invoke('open-external', url),
  minimizeWindow:      ()           => ipcRenderer.invoke('minimize-window'),
  closeWindow:         ()           => ipcRenderer.invoke('close-window'),
  quitApp:             ()           => ipcRenderer.invoke('quit-app'),

  // Backup & Rollback
  createBackup:        (label)      => ipcRenderer.invoke('create-backup', { label }),
  listBackups:         ()           => ipcRenderer.invoke('list-backups'),
  rollbackBD:          (name)       => ipcRenderer.invoke('rollback-bd', { backupName: name }),
  deleteBackup:        (name)       => ipcRenderer.invoke('delete-backup', { backupName: name }),

  // Quick Links
  getQuickLinks:       ()           => ipcRenderer.invoke('get-quick-links'),
  addQuickLink:        (link)       => ipcRenderer.invoke('add-quick-link', link),
  removeQuickLink:     (id)         => ipcRenderer.invoke('remove-quick-link', { id }),

  // Favorite Servers
  getFavoriteServers:   ()           => ipcRenderer.invoke('get-favorite-servers'),
  addFavoriteServer:    (server)     => ipcRenderer.invoke('add-favorite-server', server),
  updateFavoriteServer: (id, updates)=> ipcRenderer.invoke('update-favorite-server', { id, updates }),
  removeFavoriteServer: (id)         => ipcRenderer.invoke('remove-favorite-server', { id }),

  // Notification Log
  getNotificationLog:  ()           => ipcRenderer.invoke('get-notification-log'),
  clearNotificationLog:()           => ipcRenderer.invoke('clear-notification-log'),

  // Crash
  getCrashStatus:      ()           => ipcRenderer.invoke('get-crash-status'),
  dismissCrash:        ()           => ipcRenderer.invoke('dismiss-crash'),

  // App Self-Update
  checkAppUpdate:      ()  => ipcRenderer.invoke('check-app-update'),
  getAppVersion:       ()  => ipcRenderer.invoke('get-app-version'),
  getAppUpdateInfo:    ()  => ipcRenderer.invoke('get-app-update-info'),
  installAppUpdate:    ()  => ipcRenderer.invoke('install-app-update'),

  // Events from main
  onUpdateCheckResult: (cb) => ipcRenderer.on('update-check-result', (_, d) => cb(d)),
  onUpdateCheckError:  (cb) => ipcRenderer.on('update-check-error',  (_, d) => cb(d)),
  onBDUpdateRequired:  (cb) => ipcRenderer.on('bd-update-required',  (_, d) => cb(d)),
  onBDUpdateProgress:  (cb) => ipcRenderer.on('bd-update-progress',  (_, d) => cb(d)),
  onBDUpdateDone:      (cb) => ipcRenderer.on('bd-update-done',      (_, d) => cb(d)),
  onBDUpdateError:     (cb) => ipcRenderer.on('bd-update-error',     (_, d) => cb(d)),
  onRollbackProgress:  (cb) => ipcRenderer.on('rollback-progress',   (_, d) => cb(d)),
  onDiscordCrashed:    (cb) => ipcRenderer.on('discord-crashed',     (_, d) => cb(d)),
  onThemeChanged:      (cb) => ipcRenderer.on('theme-changed',       (_, d) => cb(d)),
  onLanguageChanged:   (cb) => ipcRenderer.on('language-changed',    (_, d) => cb(d)),
  onAppUpdateAvailable:(cb) => ipcRenderer.on('app-update-available', (_, d) => cb(d)),
  onAppUpdateProgress: (cb) => ipcRenderer.on('app-update-progress',  (_, d) => cb(d)),
});
