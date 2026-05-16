const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, Notification, nativeTheme } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
let originalFs;
try { originalFs = require('original-fs'); } catch (e) { originalFs = fs; }
const https = require('https');
const { execSync, exec, spawn } = require('child_process');
const schedule = require('node-schedule');

const APP_VERSION = '1.0.2';
let store;
app.setAppUserModelId('com.discordupdater.app');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let updateCheckJob = null;
let crashCheckInterval = null;
let discordRunningBefore = false;

// ─── Store ───────────────────────────────────────────────────────────────────
async function initStore() {
  const { default: Store } = await import('electron-store');
  store = new Store({
    defaults: {
      autoStart: false,
      minimizeToTray: true,
      checkInterval: 60,
      lastDiscordVersion: null,
      lastBDVersion: null,
      latestBDVersion: null,
      updateHistory: [],
      notificationLog: [],
      notifications: true,
      autoUpdateBD: true,
      maxBackups: 5,
      theme: 'dark',
      crashDetection: true,
      autoRepairOnCrash: false,
      quickLinks: [],
      favoriteServers: [],
      language: 'de',
    }
  });
}

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 940, height: 660, minWidth: 820, minHeight: 580,
    frame: false, transparent: false, backgroundColor: '#1e1f22',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
  });
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.once('ready-to-show', () => { applyTheme(); mainWindow.show(); });
  mainWindow.on('close', (e) => {
    if (!isQuitting && store.get('minimizeToTray')) { e.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Theme ───────────────────────────────────────────────────────────────────
function applyTheme() {
  const theme = store ? store.get('theme') : 'dark';
  nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark';
  if (mainWindow) mainWindow.webContents.send('theme-changed', theme);
}

// ─── Tray ────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();
  tray = new Tray(trayIcon);
  tray.setToolTip('Discord Updater');
  updateTrayMenu();
  tray.on('click', () => {
    if (mainWindow) { mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show(); }
    else createWindow();
  });
}

function updateTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Discord Updater', enabled: false },
    { type: 'separator' },
    { label: 'Öffnen', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } else createWindow(); } },
    { label: 'Auf Updates prüfen', click: () => checkForUpdates() },
    { label: 'Discord starten', click: () => launchDiscord('stable').catch(() => {}) },
    { type: 'separator' },
    { label: 'Beenden', click: () => { isQuitting = true; app.quit(); } }
  ]));
}

// ─── Discord Detection ───────────────────────────────────────────────────────
const DISCORD_VARIANTS = [
  { id: 'stable', name: 'Discord Stable', exe: 'Discord.exe',      folder: 'Discord' },
  { id: 'canary', name: 'Discord Canary', exe: 'DiscordCanary.exe', folder: 'DiscordCanary' },
  { id: 'ptb',    name: 'Discord PTB',    exe: 'DiscordPTB.exe',    folder: 'DiscordPTB' },
];

function getLocalAppData() {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
}

function findAllDiscordInstallations() {
  if (process.platform !== 'win32') {
    const p = findDiscordInstallation();
    return p ? [{ id: 'stable', name: 'Discord', path: p, version: getDiscordVersion(p) }] : [];
  }
  return DISCORD_VARIANTS
    .map(v => {
      const p = path.join(getLocalAppData(), v.folder);
      if (!fs.existsSync(p)) return null;
      return { ...v, path: p, version: getDiscordVersion(p) };
    })
    .filter(Boolean);
}

function findDiscordInstallation() {
  if (process.platform === 'win32') {
    const local = getLocalAppData();
    for (const v of DISCORD_VARIANTS) {
      const p = path.join(local, v.folder);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
  const paths = process.platform === 'darwin'
    ? ['/Applications/Discord.app', path.join(os.homedir(), 'Applications', 'Discord.app')]
    : ['/usr/bin/discord', '/usr/share/discord', path.join(os.homedir(), '.local/share/discord'), '/opt/discord'];
  return paths.find(p => fs.existsSync(p)) || null;
}

function getDiscordVersion(discordPath) {
  try {
    if (!discordPath) return null;
    if (process.platform === 'win32') {
      const appFolders = fs.readdirSync(discordPath)
        .filter(e => e.startsWith('app-') && fs.statSync(path.join(discordPath, e)).isDirectory()).sort();
      return appFolders.length ? appFolders[appFolders.length - 1].replace('app-', '') : null;
    } else if (process.platform === 'darwin') {
      const plist = path.join(discordPath, 'Contents', 'Info.plist');
      if (fs.existsSync(plist)) {
        const m = fs.readFileSync(plist, 'utf8').match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
        return m ? m[1] : null;
      }
    } else {
      const vf = path.join(discordPath, 'resources', 'build_info.json');
      if (fs.existsSync(vf)) return JSON.parse(fs.readFileSync(vf, 'utf8')).version || null;
    }
  } catch (e) {}
  return null;
}

function findBetterDiscord() {
  const platform = process.platform;
  const paths = platform === 'win32'
    ? [path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'BetterDiscord')]
    : platform === 'darwin'
      ? [path.join(os.homedir(), 'Library', 'Application Support', 'BetterDiscord')]
      : [path.join(os.homedir(), '.config', 'BetterDiscord')];
  return paths.find(p => fs.existsSync(p)) || null;
}

function getBDInstalledVersion() {
  try {
    const bdPath = findBetterDiscord();
    if (!bdPath) return null;
    const versionFile = path.join(bdPath, 'data', 'version.json');
    if (fs.existsSync(versionFile)) {
      const meta = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      if (meta.version) return meta.version;
    }
    const asarFile = path.join(bdPath, 'data', 'betterdiscord.asar');
    if (fs.existsSync(asarFile)) return 'Installiert';
    const discordPath = findDiscordInstallation();
    if (discordPath && process.platform === 'win32') {
      const appFolders = fs.readdirSync(discordPath).filter(e => e.startsWith('app-')).sort();
      if (appFolders.length) {
        const indexJs = path.join(discordPath, appFolders[appFolders.length - 1], 'modules', 'discord_desktop_core-1', 'discord_desktop_core', 'index.js');
        if (fs.existsSync(indexJs)) {
          const content = fs.readFileSync(indexJs, 'utf8');
          if (content.includes('BetterDiscord') || content.includes('betterdiscord')) return 'Installiert';
        }
      }
    }
  } catch (e) {}
  return null;
}

// ─── Crash Detection ─────────────────────────────────────────────────────────
function isDiscordRunning() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /FI "IMAGENAME eq Discord.exe" /NH', { stdio: 'pipe' }).toString();
      return out.toLowerCase().includes('discord.exe');
    } else if (process.platform === 'darwin') {
      return execSync('pgrep -x Discord', { stdio: 'pipe' }).toString().trim().length > 0;
    } else {
      return execSync('pgrep -x discord', { stdio: 'pipe' }).toString().trim().length > 0;
    }
  } catch (e) { return false; }
}

function startCrashDetection() {
  stopCrashDetection();
  if (!store || !store.get('crashDetection')) return;
  discordRunningBefore = isDiscordRunning();
  crashCheckInterval = setInterval(() => {
    if (!store || !store.get('crashDetection')) return;
    const runningNow = isDiscordRunning();
    if (discordRunningBefore && !runningNow) onDiscordCrashDetected();
    discordRunningBefore = runningNow;
  }, 10000);
}

function stopCrashDetection() {
  if (crashCheckInterval) { clearInterval(crashCheckInterval); crashCheckInterval = null; }
}

function onDiscordCrashDetected() {
  console.log('Discord crash detected');
  addToHistory({ type: 'discord_crash', timestamp: new Date().toISOString() });
  addToNotificationLog('Discord Absturz erkannt', 'Discord wurde unerwartet beendet.');
  if (store.get('notifications')) showNotification('Discord Absturz erkannt', 'Discord wurde unerwartet beendet.');
  if (mainWindow) {
    mainWindow.webContents.send('discord-crashed', { autoRepair: store.get('autoRepairOnCrash') });
    if (!mainWindow.isVisible()) mainWindow.show();
  }
  if (store.get('autoRepairOnCrash')) {
    setTimeout(async () => {
      try {
        await repairDiscord();
        addToNotificationLog('Auto-Reparatur', 'Discord wurde automatisch repariert und neugestartet.');
      } catch (e) { console.error('Auto-repair failed:', e); }
    }, 2000);
  }
}

// ─── Notification Log ─────────────────────────────────────────────────────────
function addToNotificationLog(title, body) {
  const log = store.get('notificationLog') || [];
  log.unshift({ title, body, timestamp: new Date().toISOString() });
  store.set('notificationLog', log.slice(0, 100));
}

// ─── Quick Links ──────────────────────────────────────────────────────────────
const DEFAULT_QUICK_LINKS = [
  { id: 'friends',    label: 'Freunde',       url: 'discord://discord.com/channels/@me', icon: 'friends',    isDefault: true },
  { id: 'nitro',      label: 'Nitro',         url: 'discord://discord.com/store',        icon: 'nitro',      isDefault: true },
  { id: 'discovery',  label: 'Entdecken',     url: 'discord://discord.com/guild-discovery', icon: 'discovery', isDefault: true },
  { id: 'plugins',    label: 'BD Plugins',    url: 'https://betterdiscord.app/plugins',  icon: 'plugins',    isDefault: true },
];

function getQuickLinks() {
  const custom = store.get('quickLinks') || [];
  return [...DEFAULT_QUICK_LINKS, ...custom];
}

// ─── Backup System ───────────────────────────────────────────────────────────
function getBackupDir() {
  const bdPath = findBetterDiscord();
  if (!bdPath) return null;
  const backupDir = path.join(bdPath, 'data', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function findBDAsarPath() {
  const bdPath = findBetterDiscord();
  const discordPath = findDiscordInstallation();
  const candidates = [];
  if (bdPath) candidates.push(path.join(bdPath, 'data', 'betterdiscord.asar'));
  if (discordPath && process.platform === 'win32') {
    try {
      const appFolders = fs.readdirSync(discordPath)
        .filter(e => e.startsWith('app-') && fs.statSync(path.join(discordPath, e)).isDirectory()).sort();
      for (const folder of appFolders) {
        const coreDir = path.join(discordPath, folder, 'modules', 'discord_desktop_core-1', 'discord_desktop_core');
        candidates.push(path.join(coreDir, 'betterdiscord.asar'));
        candidates.push(path.join(discordPath, folder, 'betterdiscord.asar'));
        candidates.push(path.join(discordPath, folder, 'resources', 'betterdiscord.asar'));
      }
      candidates.push(path.join(discordPath, 'resources', 'betterdiscord.asar'));
    } catch (e) {}
  }
  return candidates.find(p => {
    try {
      const fd = originalFs.openSync(p, 'r');
      const buf = Buffer.allocUnsafe(4);
      const bytesRead = originalFs.readSync(fd, buf, 0, 4, 0);
      originalFs.closeSync(fd);
      return bytesRead > 0;
    } catch (e) { return false; }
  }) || null;
}

async function createBDBackup(label = 'manual') {
  const bdPath = findBetterDiscord();
  if (!bdPath) throw new Error('BetterDiscord ist nicht installiert');
  const backupDir = getBackupDir();
  const installedVersion = getBDInstalledVersion() || 'unknown';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `bd-backup_${installedVersion}_${timestamp}`;
  const backupPath = path.join(backupDir, backupName);
  fs.mkdirSync(backupPath, { recursive: true });
  const dataDir = path.join(bdPath, 'data');
  const backedUpFiles = [];

  const asarSrc = findBDAsarPath();
  if (asarSrc) {
    try {
      await new Promise((resolve, reject) => {
        const rs = originalFs.createReadStream(asarSrc);
        const ws = originalFs.createWriteStream(path.join(backupPath, 'betterdiscord.asar'));
        rs.on('error', reject); ws.on('error', reject); ws.on('finish', resolve);
        rs.pipe(ws);
      });
      const writtenSize = originalFs.statSync(path.join(backupPath, 'betterdiscord.asar')).size;
      if (writtenSize === 0) throw new Error('Copied file is empty');
      backedUpFiles.push('betterdiscord.asar');
    } catch (e) { console.warn('Backup: asar copy failed:', e.message); }
  }

  const versionSrc = path.join(dataDir, 'version.json');
  if (fs.existsSync(versionSrc)) { fs.copyFileSync(versionSrc, path.join(backupPath, 'version.json')); backedUpFiles.push('version.json'); }
  const pluginsSrc = path.join(bdPath, 'plugins');
  if (fs.existsSync(pluginsSrc)) { copyFolderSync(pluginsSrc, path.join(backupPath, 'plugins')); backedUpFiles.push('plugins'); }
  const themesSrc = path.join(bdPath, 'themes');
  if (fs.existsSync(themesSrc)) { copyFolderSync(themesSrc, path.join(backupPath, 'themes')); backedUpFiles.push('themes'); }
  const configSrc = path.join(bdPath, 'config');
  if (fs.existsSync(configSrc)) { copyFolderSync(configSrc, path.join(backupPath, 'config')); backedUpFiles.push('config'); }

  if (backedUpFiles.length === 0) { deleteFolderSync(backupPath); throw new Error('Keine BD-Dateien gefunden'); }

  const meta = { name: backupName, version: installedVersion, timestamp: new Date().toISOString(), label, path: backupPath, asarSource: asarSrc || null, files: backedUpFiles };
  fs.writeFileSync(path.join(backupPath, 'backup-meta.json'), JSON.stringify(meta, null, 2));
  pruneOldBackups(backupDir);
  addToHistory({ type: 'bd_backup', version: installedVersion, backupName, label, timestamp: new Date().toISOString() });
  return meta;
}

function copyFolderSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcEntry = path.join(src, entry);
    const destEntry = path.join(dest, entry);
    try {
      const stat = fs.statSync(srcEntry);
      if (stat.isDirectory()) copyFolderSync(srcEntry, destEntry);
      else fs.writeFileSync(destEntry, fs.readFileSync(srcEntry));
    } catch (e) { console.warn('copyFolderSync skip:', srcEntry, e.message); }
  }
}

function pruneOldBackups(backupDir) {
  try {
    const maxBackups = store ? (store.get('maxBackups') || 5) : 5;
    const entries = fs.readdirSync(backupDir)
      .map(name => { const p = path.join(backupDir, name); return { name, fullPath: p, stat: fs.statSync(p) }; })
      .filter(e => e.stat.isDirectory())
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    for (const entry of entries.slice(maxBackups)) deleteFolderSync(entry.fullPath);
  } catch (e) { console.error('Backup pruning error:', e); }
}

function deleteFolderSync(folderPath) {
  if (!originalFs.existsSync(folderPath)) return;
  for (const entry of originalFs.readdirSync(folderPath)) {
    const fullPath = path.join(folderPath, entry);
    if (originalFs.statSync(fullPath).isDirectory()) deleteFolderSync(fullPath);
    else originalFs.unlinkSync(fullPath);
  }
  originalFs.rmdirSync(folderPath);
}

function listBackups() {
  const backupDir = getBackupDir();
  if (!backupDir) return [];
  try {
    return fs.readdirSync(backupDir)
      .map(name => {
        const fullPath = path.join(backupDir, name);
        if (!fs.statSync(fullPath).isDirectory()) return null;
        const metaPath = path.join(fullPath, 'backup-meta.json');
        if (fs.existsSync(metaPath)) { try { return { ...JSON.parse(fs.readFileSync(metaPath, 'utf8')), path: fullPath }; } catch (_) {} }
        return { name, path: fullPath, timestamp: fs.statSync(fullPath).mtime.toISOString(), version: name.split('_')[1] || 'Unbekannt', label: 'unknown', files: fs.readdirSync(fullPath) };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (e) { return []; }
}

async function rollbackBD(backupName) {
  const bdPath = findBetterDiscord();
  if (!bdPath) throw new Error('BetterDiscord ist nicht installiert');
  const discordPath = findDiscordInstallation();
  if (!discordPath) throw new Error('Discord nicht gefunden');
  const backupPath = path.join(getBackupDir(), backupName);
  if (!fs.existsSync(backupPath)) throw new Error(`Backup "${backupName}" nicht gefunden`);
  const meta = fs.existsSync(path.join(backupPath, 'backup-meta.json'))
    ? JSON.parse(fs.readFileSync(path.join(backupPath, 'backup-meta.json'), 'utf8'))
    : { version: 'Unbekannt' };

  if (mainWindow) mainWindow.webContents.send('rollback-progress', { step: 'stop', message: 'Discord wird beendet...' });
  try { execSync('taskkill /F /IM Discord.exe', { stdio: 'pipe' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 1500));
  if (mainWindow) mainWindow.webContents.send('rollback-progress', { step: 'restore', message: 'Dateien werden wiederhergestellt...' });

  const dataDir = path.join(bdPath, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const asarBackupFile = path.join(backupPath, 'betterdiscord.asar');
  const asarDest = meta.asarSource || path.join(dataDir, 'betterdiscord.asar');
  if (fs.existsSync(asarBackupFile)) {
    const asarDestDir = path.dirname(asarDest);
    if (!fs.existsSync(asarDestDir)) fs.mkdirSync(asarDestDir, { recursive: true });
    if (fs.existsSync(asarDest)) fs.renameSync(asarDest, asarDest + '.before-rollback');
    fs.copyFileSync(asarBackupFile, asarDest);
  }
  const versionSrc = path.join(backupPath, 'version.json');
  if (fs.existsSync(versionSrc)) fs.copyFileSync(versionSrc, path.join(dataDir, 'version.json'));
  else fs.writeFileSync(path.join(dataDir, 'version.json'), JSON.stringify({ version: meta.version }, null, 2));
  if (fs.existsSync(path.join(backupPath, 'plugins'))) copyFolderSync(path.join(backupPath, 'plugins'), path.join(bdPath, 'plugins'));
  if (fs.existsSync(path.join(backupPath, 'themes')))  copyFolderSync(path.join(backupPath, 'themes'),  path.join(bdPath, 'themes'));
  if (fs.existsSync(path.join(backupPath, 'config')))  copyFolderSync(path.join(backupPath, 'config'),  path.join(bdPath, 'config'));

  store.set('lastBDVersion', meta.version);
  if (mainWindow) mainWindow.webContents.send('rollback-progress', { step: 'inject', message: 'BetterDiscord wird injiziert...' });

  if (process.platform === 'win32') {
    const appFolders = fs.readdirSync(discordPath).filter(e => e.startsWith('app-') && fs.statSync(path.join(discordPath, e)).isDirectory()).sort();
    for (const folder of appFolders) {
      const indexPath = path.join(discordPath, folder, 'modules', 'discord_desktop_core-1', 'discord_desktop_core', 'index.js');
      if (fs.existsSync(indexPath)) {
        let content = fs.readFileSync(indexPath, 'utf8');
        content = content.replace(/\n?\/\/ BetterDiscord\nrequire\([^)]+betterdiscord\.asar[^)]*\);?\n?/g, '');
        content = content.replace(/\n?require\([^)]+betterdiscord\.asar[^)]*\);?\n?/g, '');
        content = `\n// BetterDiscord\nrequire('${asarDest.replace(/\\/g, '\\\\')}');\n` + content;
        fs.writeFileSync(indexPath, content, 'utf8');
      }
    }
  }

  if (mainWindow) mainWindow.webContents.send('rollback-progress', { step: 'restart', message: 'Discord wird neu gestartet...' });
  await new Promise(r => setTimeout(r, 1000));
  await launchDiscord('stable');
  addToHistory({ type: 'bd_rollback', to: meta.version, backupName, timestamp: new Date().toISOString() });
  if (store.get('notifications')) showNotification('BetterDiscord Rollback', `BetterDiscord wurde auf v${meta.version} zurückgesetzt.`);
  return { success: true, version: meta.version, message: `Rollback auf v${meta.version} erfolgreich` };
}

function deleteBackup(backupName) {
  const backupDir = getBackupDir();
  if (!backupDir) throw new Error('Backup-Verzeichnis nicht gefunden');
  const backupPath = path.join(backupDir, backupName);
  if (!fs.existsSync(backupPath)) throw new Error(`Backup "${backupName}" nicht gefunden`);
  deleteFolderSync(backupPath);
  return { success: true };
}

// ─── GitHub API ──────────────────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'DiscordUpdater/1.0', 'Accept': 'application/json' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return httpsGet(res.headers.location).then(resolve).catch(reject);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch (e) { resolve({ status: res.statusCode, data }); } });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const doGet = (u) => {
      https.get(u, { headers: { 'User-Agent': 'DiscordUpdater/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) return doGet(res.headers.location);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', (e) => { fs.unlink(destPath, () => {}); reject(e); });
      }).on('error', reject);
    };
    doGet(url);
  });
}

async function getLatestBDVersion() {
  try {
    const { status, data } = await httpsGet('https://api.github.com/repos/BetterDiscord/BetterDiscord/releases/latest');
    if (status === 200 && data.tag_name) return data.tag_name.replace(/^v/, '');
  } catch (e) {}
  return null;
}

// ─── BD Update ───────────────────────────────────────────────────────────────
async function performBDUpdate() {
  const bdPath = findBetterDiscord();
  if (!bdPath) throw new Error('BetterDiscord ist nicht installiert');
  const discordPath = findDiscordInstallation();
  if (!discordPath) throw new Error('Discord nicht gefunden');

  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'fetch', message: 'Neueste BD-Version wird abgerufen...' });
  const { status, data } = await httpsGet('https://api.github.com/repos/BetterDiscord/BetterDiscord/releases/latest');
  if (status !== 200) throw new Error('GitHub API nicht erreichbar');
  const latestVersion = data.tag_name.replace(/^v/, '');
  const assetUrl = data.assets?.find(a => a.name === 'betterdiscord.asar')?.browser_download_url;
  if (!assetUrl) throw new Error('betterdiscord.asar nicht im Release gefunden');
  const installedVersion = getBDInstalledVersion();

  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'backup', message: 'Backup wird erstellt...' });
  let backupMeta = null;
  try { backupMeta = await createBDBackup('pre-update'); } catch (e) { console.error('Backup failed (non-fatal):', e); }

  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'download', message: `Lade betterdiscord.asar v${latestVersion} herunter...` });
  const dataDir = path.join(bdPath, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const asarDest = path.join(dataDir, 'betterdiscord.asar');
  await downloadFile(assetUrl, asarDest + '.tmp');

  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'stop', message: 'Discord wird beendet...' });
  try { execSync('taskkill /F /IM Discord.exe', { stdio: 'pipe' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 1500));

  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'install', message: 'Installiere neue Version...' });
  if (fs.existsSync(asarDest)) fs.renameSync(asarDest, asarDest + '.bak');
  fs.renameSync(asarDest + '.tmp', asarDest);
  fs.writeFileSync(path.join(dataDir, 'version.json'), JSON.stringify({ version: latestVersion }, null, 2));
  store.set('latestBDVersion', latestVersion);
  store.set('lastBDVersion', latestVersion);

  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'inject', message: 'BetterDiscord wird injiziert...' });
  if (process.platform === 'win32') {
    const appFolders = fs.readdirSync(discordPath).filter(e => e.startsWith('app-') && fs.statSync(path.join(discordPath, e)).isDirectory()).sort();
    for (const folder of appFolders) {
      const indexPath = path.join(discordPath, folder, 'modules', 'discord_desktop_core-1', 'discord_desktop_core', 'index.js');
      if (fs.existsSync(indexPath)) {
        let content = fs.readFileSync(indexPath, 'utf8');
        content = content.replace(/\n?\/\/ BetterDiscord\nrequire\([^)]+betterdiscord\.asar[^)]*\);?\n?/g, '');
        content = content.replace(/\n?require\([^)]+betterdiscord\.asar[^)]*\);?\n?/g, '');
        content = `\n// BetterDiscord\nrequire('${asarDest.replace(/\\/g, '\\\\')}');\n` + content;
        fs.writeFileSync(indexPath, content, 'utf8');
      }
    }
  }

  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'restart', message: 'Discord wird neu gestartet...' });
  await new Promise(r => setTimeout(r, 1000));
  await launchDiscord('stable');
  addToHistory({ type: 'bd_auto_update', from: installedVersion || '?', to: latestVersion, backupCreated: !!backupMeta, backupName: backupMeta?.name || null, timestamp: new Date().toISOString() });
  if (store.get('notifications')) showNotification('BetterDiscord aktualisiert', `BetterDiscord wurde auf v${latestVersion} aktualisiert.`);
  return { success: true, version: latestVersion, backupCreated: !!backupMeta, backupName: backupMeta?.name || null, message: `BetterDiscord v${latestVersion} erfolgreich installiert` };
}

// ─── Update Check ─────────────────────────────────────────────────────────────
async function checkForUpdates() {
  console.log('Checking for updates...');
  const result = {
    discord: { installed: false, version: null, path: null, updateAvailable: false },
    betterDiscord: { installed: false, version: null, path: null, latestVersion: null, updateAvailable: false },
    instances: findAllDiscordInstallations(),
    timestamp: new Date().toISOString(),
  };
  try {
    const discordPath = findDiscordInstallation();
    if (discordPath) { result.discord.installed = true; result.discord.path = discordPath; result.discord.version = getDiscordVersion(discordPath); }
    const bdPath = findBetterDiscord();
    if (bdPath) { result.betterDiscord.installed = true; result.betterDiscord.path = bdPath; result.betterDiscord.version = getBDInstalledVersion(); }
    try {
      const latestBD = await getLatestBDVersion();
      result.betterDiscord.latestVersion = latestBD;
      store.set('latestBDVersion', latestBD);
      if (latestBD && result.betterDiscord.version && result.betterDiscord.version !== 'Installiert') {
        result.betterDiscord.updateAvailable = result.betterDiscord.version.replace(/^v/, '') !== latestBD.replace(/^v/, '');
      }
    } catch (e) {}
    const lastVersion = store.get('lastDiscordVersion');
    if (result.discord.version && lastVersion && lastVersion !== result.discord.version) {
      addToHistory({ type: 'discord_update', from: lastVersion, to: result.discord.version, timestamp: new Date().toISOString() });
      addToNotificationLog('Discord Update erkannt', `Discord ${lastVersion} → ${result.discord.version}`);
      if (store.get('notifications')) showNotification('Discord Update erkannt', `Discord wurde auf ${result.discord.version} aktualisiert.`);
      if (store.get('autoUpdateBD') && result.betterDiscord.installed) {
        try {
          const bdResult = await performBDUpdate();
          if (mainWindow) mainWindow.webContents.send('bd-update-done', { version: bdResult.version, backupCreated: bdResult.backupCreated });
        } catch (e) {
          if (mainWindow) mainWindow.webContents.send('bd-update-error', { message: e.message });
        }
      }
    }
    // Also check for app self-update in background
    checkAppUpdate().catch(() => {});

    if (result.discord.version) store.set('lastDiscordVersion', result.discord.version);
    if (result.betterDiscord.version) store.set('lastBDVersion', result.betterDiscord.version);
    if (mainWindow) mainWindow.webContents.send('update-check-result', result);
    return result;
  } catch (e) {
    if (mainWindow) mainWindow.webContents.send('update-check-error', { message: e.message });
  }
}

function addToHistory(entry) {
  const history = store.get('updateHistory') || [];
  history.unshift(entry);
  store.set('updateHistory', history.slice(0, 50));
}

function showNotification(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

function setAutoStart(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: ['--hidden'] });
  store.set('autoStart', enabled);
}

// ─── Discord Actions ──────────────────────────────────────────────────────────
async function updateDiscord() {
  if (process.platform !== 'win32') throw new Error('Nur unter Windows verfügbar');
  const discordPath = findDiscordInstallation();
  if (!discordPath) throw new Error('Discord nicht gefunden');
  const updater = path.join(discordPath, 'Update.exe');
  if (!fs.existsSync(updater)) throw new Error('Discord Updater nicht gefunden');
  spawn(updater, ['--processStart', 'Discord.exe'], { detached: true, stdio: 'ignore' }).unref();
  addToHistory({ type: 'manual_discord_update', timestamp: new Date().toISOString() });
  return { success: true, message: 'Discord Update gestartet' };
}

async function repairDiscord() {
  if (process.platform !== 'win32') throw new Error('Nur unter Windows verfügbar');
  const discordPath = findDiscordInstallation();
  if (!discordPath) throw new Error('Discord nicht gefunden');
  const updater = path.join(discordPath, 'Update.exe');
  if (!fs.existsSync(updater)) throw new Error('Discord Updater nicht gefunden');
  try { execSync('taskkill /F /IM Discord.exe', { stdio: 'pipe' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 1000));
  spawn(updater, ['--processStart', 'Discord.exe', '--process-start-args', '--'], { detached: true, stdio: 'ignore' }).unref();
  addToHistory({ type: 'repair', timestamp: new Date().toISOString() });
  return { success: true, message: 'Discord Reparatur gestartet' };
}

async function launchDiscord(variantId = 'stable') {
  if (process.platform === 'win32') {
    const variant = DISCORD_VARIANTS.find(v => v.id === variantId) || DISCORD_VARIANTS[0];
    const discordPath = path.join(getLocalAppData(), variant.folder);
    if (!fs.existsSync(discordPath)) throw new Error(`${variant.name} nicht gefunden`);
    const appFolders = fs.readdirSync(discordPath).filter(e => e.startsWith('app-')).sort();
    const exePath = appFolders.length ? path.join(discordPath, appFolders[appFolders.length - 1], variant.exe) : path.join(discordPath, variant.exe);
    const target = fs.existsSync(exePath) ? exePath : path.join(discordPath, variant.exe);
    if (fs.existsSync(target)) spawn(target, [], { detached: true, stdio: 'ignore' }).unref();
    else throw new Error(`${variant.exe} nicht gefunden`);
  } else if (process.platform === 'darwin') {
    exec('open "/Applications/Discord.app"');
  } else {
    exec('discord');
  }
}

// ─── Self-Updater ────────────────────────────────────────────────────────────
let selfUpdateAvailable = null; // { version, downloadUrl, releaseUrl, body }

async function checkAppUpdate() {
  try {
    const { status, data } = await httpsGet('https://api.github.com/repos/LiquidFlow-design/Discord-updater/releases/latest');
    if (status !== 200 || !data.tag_name) return null;

    const latest = data.tag_name.replace(/^v/, '');
    const current = APP_VERSION;

    const isNewer = compareVersions(latest, current) > 0;
    if (!isNewer) {
      selfUpdateAvailable = null;
      return null;
    }

    // Find installer asset (.exe for win, .dmg for mac, .AppImage for linux)
    const assetExt = process.platform === 'win32' ? '.exe'
      : process.platform === 'darwin' ? '.dmg' : '.AppImage';
    const asset = data.assets?.find(a => a.name.endsWith(assetExt));

    selfUpdateAvailable = {
      version: latest,
      downloadUrl: asset?.browser_download_url || null,
      releaseUrl: data.html_url,
      body: data.body || '',
      assetName: asset?.name || null,
      assetSize: asset?.size || null,
    };

    addToNotificationLog('App-Update verfügbar', `Discord Updater v${latest} ist verfügbar.`);
    if (store.get('notifications')) {
      showNotification('Discord Updater Update', `Version ${latest} ist verfügbar!`);
    }
    if (mainWindow) mainWindow.webContents.send('app-update-available', selfUpdateAvailable);
    return selfUpdateAvailable;
  } catch (e) {
    console.error('Self-update check failed:', e);
    return null;
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function downloadAndInstallAppUpdate() {
  if (!selfUpdateAvailable?.downloadUrl) {
    // No direct download available – open release page
    shell.openExternal(selfUpdateAvailable?.releaseUrl || 'https://github.com/LiquidFlow-design/Discord-updater/releases');
    return { success: true, method: 'browser' };
  }

  const tmpDir = app.getPath('temp');
  const destPath = path.join(tmpDir, selfUpdateAvailable.assetName);

  if (mainWindow) mainWindow.webContents.send('app-update-progress', { step: 'download', message: `Lade v${selfUpdateAvailable.version} herunter...` });

  try {
    await downloadFile(selfUpdateAvailable.downloadUrl, destPath);
  } catch (e) {
    // Download failed – fall back to browser
    shell.openExternal(selfUpdateAvailable.releaseUrl);
    return { success: true, method: 'browser' };
  }

  if (mainWindow) mainWindow.webContents.send('app-update-progress', { step: 'install', message: 'Installer wird gestartet...' });

  await new Promise(r => setTimeout(r, 800));

  if (process.platform === 'win32') {
    spawn(destPath, [], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    exec(`open "${destPath}"`);
  } else {
    exec(`chmod +x "${destPath}" && "${destPath}"`);
  }

  // Quit after short delay so installer can take over
  setTimeout(() => { isQuitting = true; app.quit(); }, 1500);
  return { success: true, method: 'installer', version: selfUpdateAvailable.version };
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('get-status', async () => {
    const discordPath = findDiscordInstallation();
    const bdPath = findBetterDiscord();
    return {
      discord: { installed: !!discordPath, path: discordPath, version: discordPath ? getDiscordVersion(discordPath) : null, updateAvailable: false },
      betterDiscord: { installed: !!bdPath, path: bdPath, version: getBDInstalledVersion(), latestVersion: store.get('latestBDVersion') || null, updateAvailable: false },
      instances: findAllDiscordInstallations(),
      settings: {
        autoStart: app.getLoginItemSettings().openAtLogin,
        minimizeToTray: store.get('minimizeToTray'),
        checkInterval: store.get('checkInterval'),
        notifications: store.get('notifications'),
        autoUpdateBD: store.get('autoUpdateBD'),
        maxBackups: store.get('maxBackups'),
        theme: store.get('theme'),
        language: store.get('language'),
        crashDetection: store.get('crashDetection'),
        autoRepairOnCrash: store.get('autoRepairOnCrash'),
      },
      history: store.get('updateHistory') || [],
    };
  });

  ipcMain.handle('check-updates', async () => await checkForUpdates());
  ipcMain.handle('update-discord', async () => await updateDiscord());
  ipcMain.handle('update-betterdiscord', async () => {
    const result = await performBDUpdate();
    if (mainWindow) mainWindow.webContents.send('bd-update-done', { version: result.version, backupCreated: result.backupCreated });
    return result;
  });
  ipcMain.handle('repair-discord', async () => await repairDiscord());
  ipcMain.handle('launch-discord', async (e, variantId) => await launchDiscord(variantId || 'stable'));

  ipcMain.handle('create-backup', async (e, { label } = {}) => await createBDBackup(label || 'manual'));
  ipcMain.handle('list-backups', async () => listBackups());
  ipcMain.handle('rollback-bd', async (e, { backupName }) => await rollbackBD(backupName));
  ipcMain.handle('delete-backup', async (e, { backupName }) => deleteBackup(backupName));

  ipcMain.handle('get-quick-links', async () => getQuickLinks());
  ipcMain.handle('add-quick-link', async (e, link) => {
    const links = store.get('quickLinks') || [];
    links.push({ id: Date.now().toString(), ...link });
    store.set('quickLinks', links);
    return links;
  });
  ipcMain.handle('remove-quick-link', async (e, { id }) => {
    const links = (store.get('quickLinks') || []).filter(l => l.id !== id);
    store.set('quickLinks', links);
    return links;
  });

  ipcMain.handle('get-favorite-servers', async () => store.get('favoriteServers') || []);
  ipcMain.handle('add-favorite-server', async (e, server) => {
    const servers = store.get('favoriteServers') || [];
    servers.push({ id: Date.now().toString(), ...server });
    store.set('favoriteServers', servers);
    return servers;
  });
  ipcMain.handle('update-favorite-server', async (e, { id, updates }) => {
    const servers = store.get('favoriteServers') || [];
    const idx = servers.findIndex(s => s.id === id);
    if (idx !== -1) servers[idx] = { ...servers[idx], ...updates };
    store.set('favoriteServers', servers);
    return servers;
  });
  ipcMain.handle('remove-favorite-server', async (e, { id }) => {
    const servers = (store.get('favoriteServers') || []).filter(s => s.id !== id);
    store.set('favoriteServers', servers);
    return servers;
  });

  ipcMain.handle('get-notification-log', async () => store.get('notificationLog') || []);
  ipcMain.handle('clear-notification-log', async () => { store.set('notificationLog', []); return { success: true }; });
  ipcMain.handle('get-crash-status', async () => ({ discordRunning: isDiscordRunning() }));
  ipcMain.handle('dismiss-crash', async () => { discordRunningBefore = false; return { success: true }; });

  ipcMain.handle('set-setting', async (e, { key, value }) => {
    if (key === 'autoStart') setAutoStart(value);
    else store.set(key, value);
    if (key === 'checkInterval') scheduleUpdateCheck();
    if (key === 'theme') applyTheme();
    if (key === 'language') { if (mainWindow) mainWindow.webContents.send('language-changed', value); }
    if (key === 'crashDetection') { value ? startCrashDetection() : stopCrashDetection(); }
    return { success: true };
  });

  // App Self-Update
  ipcMain.handle('check-app-update', async () => {
    const result = await checkAppUpdate();
    return result || { version: APP_VERSION, upToDate: true };
  });
  ipcMain.handle('get-app-version', async () => APP_VERSION);
  ipcMain.handle('get-app-update-info', async () => selfUpdateAvailable);
  ipcMain.handle('install-app-update', async () => await downloadAndInstallAppUpdate());

  ipcMain.handle('get-history', async () => store.get('updateHistory') || []);
  ipcMain.handle('clear-history', async () => { store.set('updateHistory', []); return { success: true }; });
  ipcMain.handle('open-external', async (e, url) => shell.openExternal(url));
  ipcMain.handle('minimize-window', () => mainWindow?.minimize());
  ipcMain.handle('close-window', () => {
    if (mainWindow) store.get('minimizeToTray') ? mainWindow.hide() : (isQuitting = true, app.quit());
  });
  ipcMain.handle('quit-app', () => { isQuitting = true; app.quit(); });
}

// ─── Scheduler ───────────────────────────────────────────────────────────────
function scheduleUpdateCheck() {
  if (updateCheckJob) updateCheckJob.cancel();
  const interval = store.get('checkInterval') || 60;
  updateCheckJob = schedule.scheduleJob(`*/${interval} * * * *`, () => checkForUpdates());
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await initStore();
  setupIPC();
  createTray();
  if (!process.argv.includes('--hidden')) createWindow();
  setTimeout(() => { checkForUpdates(); startCrashDetection(); }, 3000);
  scheduleUpdateCheck();
});

app.on('window-all-closed', (e) => { if (!isQuitting) e.preventDefault(); });
app.on('activate', () => { if (!mainWindow) createWindow(); else mainWindow.show(); });
app.on('before-quit', () => { isQuitting = true; stopCrashDetection(); if (updateCheckJob) updateCheckJob.cancel(); });
