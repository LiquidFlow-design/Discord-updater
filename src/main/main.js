const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, Notification } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const { execSync, exec, spawn } = require('child_process');
const schedule = require('node-schedule');

let store;
app.setAppUserModelId('com.discordupdater.app');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let updateCheckJob = null;

// ─── Store ──────────────────────────────────────────────────────────────────
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
      notifications: true,
      autoUpdateBD: true,
    }
  });
}

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900, height: 640, minWidth: 800, minHeight: 580,
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
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => {
    if (!isQuitting && store.get('minimizeToTray')) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
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
    { label: 'Auf Updates prüfen', click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: 'Beenden', click: () => { isQuitting = true; app.quit(); } }
  ]));
}

// ─── Discord Detection ───────────────────────────────────────────────────────
function findDiscordInstallation() {
  const platform = process.platform;
  const paths = platform === 'win32'
    ? [
        path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Discord'),
        path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'DiscordCanary'),
        path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'DiscordPTB'),
      ]
    : platform === 'darwin'
      ? ['/Applications/Discord.app', path.join(os.homedir(), 'Applications', 'Discord.app')]
      : ['/usr/bin/discord', '/usr/share/discord', path.join(os.homedir(), '.local/share/discord'), '/opt/discord'];

  return paths.find(p => fs.existsSync(p)) || null;
}

function getDiscordVersion(discordPath) {
  try {
    if (!discordPath) return null;
    if (process.platform === 'win32') {
      const appFolders = fs.readdirSync(discordPath)
        .filter(e => e.startsWith('app-') && fs.statSync(path.join(discordPath, e)).isDirectory())
        .sort();
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
  } catch (e) { console.error('Discord version error:', e); }
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

    // Check version.json first
    const versionFile = path.join(bdPath, 'data', 'version.json');
    if (fs.existsSync(versionFile)) {
      const meta = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      if (meta.version) return meta.version;
    }

    // Check asar existence as fallback
    const asarFile = path.join(bdPath, 'data', 'betterdiscord.asar');
    if (fs.existsSync(asarFile)) return 'Installiert';

    // Check injection in Discord index.js
    const discordPath = findDiscordInstallation();
    if (discordPath && process.platform === 'win32') {
      const appFolders = fs.readdirSync(discordPath).filter(e => e.startsWith('app-')).sort();
      if (appFolders.length) {
        const indexJs = path.join(discordPath, appFolders[appFolders.length - 1],
          'modules', 'discord_desktop_core-1', 'discord_desktop_core', 'index.js');
        if (fs.existsSync(indexJs)) {
          const content = fs.readFileSync(indexJs, 'utf8');
          if (content.includes('BetterDiscord') || content.includes('betterdiscord')) return 'Installiert';
        }
      }
    }
  } catch (e) { console.error('BD version error:', e); }
  return null;
}

// ─── GitHub API ──────────────────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'DiscordUpdater/1.0', 'Accept': 'application/json' }
    };
    const req = https.get(url, options, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'DiscordUpdater/1.0' } };
    const doGet = (u) => {
      https.get(u, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doGet(res.headers.location);
        }
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
    if (status === 200 && data.tag_name) {
      return data.tag_name.replace(/^v/, '');
    }
  } catch (e) { console.error('BD latest version error:', e); }
  return null;
}

async function getLatestDiscordVersion() {
  // Discord doesn't have a public API, but we can check the installed version
  // and compare to what we know. Return installed version for now.
  return getDiscordVersion(findDiscordInstallation());
}

// ─── BetterDiscord Auto-Update ───────────────────────────────────────────────
async function performBDUpdate() {
  const bdPath = findBetterDiscord();
  if (!bdPath) throw new Error('BetterDiscord ist nicht installiert');

  const discordPath = findDiscordInstallation();
  if (!discordPath) throw new Error('Discord nicht gefunden');

  // 1. Get latest release info from GitHub
  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'fetch', message: 'Neueste BD-Version wird abgerufen...' });

  const { status, data } = await httpsGet('https://api.github.com/repos/BetterDiscord/BetterDiscord/releases/latest');
  if (status !== 200) throw new Error('GitHub API nicht erreichbar');

  const latestVersion = data.tag_name.replace(/^v/, '');
  const assetUrl = data.assets?.find(a => a.name === 'betterdiscord.asar')?.browser_download_url;
  if (!assetUrl) throw new Error('betterdiscord.asar nicht im Release gefunden');

  const installedVersion = getBDInstalledVersion();

  // 2. Download new asar
  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'download', message: `Lade betterdiscord.asar v${latestVersion} herunter...` });

  const dataDir = path.join(bdPath, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const asarDest = path.join(dataDir, 'betterdiscord.asar');
  const asarTemp = asarDest + '.tmp';

  await downloadFile(assetUrl, asarTemp);

  // 3. Kill Discord
  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'stop', message: 'Discord wird beendet...' });
  try { execSync('taskkill /F /IM Discord.exe', { stdio: 'pipe' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 1500));

  // 4. Replace asar
  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'install', message: 'Installiere neue Version...' });
  if (fs.existsSync(asarDest)) fs.renameSync(asarDest, asarDest + '.bak');
  fs.renameSync(asarTemp, asarDest);

  // 5. Save version info
  fs.writeFileSync(path.join(dataDir, 'version.json'), JSON.stringify({ version: latestVersion }, null, 2));
  store.set('latestBDVersion', latestVersion);
  store.set('lastBDVersion', latestVersion);

  // 6. Re-inject into Discord index.js (find latest app- folder)
  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'inject', message: 'BetterDiscord wird injiziert...' });

  if (process.platform === 'win32') {
    const appFolders = fs.readdirSync(discordPath)
      .filter(e => e.startsWith('app-') && fs.statSync(path.join(discordPath, e)).isDirectory())
      .sort();

    for (const folder of appFolders) {
      const indexPath = path.join(discordPath, folder, 'modules', 'discord_desktop_core-1', 'discord_desktop_core', 'index.js');
      if (fs.existsSync(indexPath)) {
        let content = fs.readFileSync(indexPath, 'utf8');
        // Remove old BD injection if present
        content = content.replace(/\n?\/\/ BetterDiscord\nrequire\([^)]+betterdiscord\.asar[^)]*\);?\n?/g, '');
        content = content.replace(/\n?require\([^)]+betterdiscord\.asar[^)]*\);?\n?/g, '');
        // Inject new
        const injection = `\n// BetterDiscord\nrequire('${asarDest.replace(/\\/g, '\\\\')}');\n`;
        content = injection + content;
        fs.writeFileSync(indexPath, content, 'utf8');
      }
    }
  }

  // 7. Restart Discord
  if (mainWindow) mainWindow.webContents.send('bd-update-progress', { step: 'restart', message: 'Discord wird neu gestartet...' });
  await new Promise(r => setTimeout(r, 1000));
  await launchDiscord();

  addToHistory({
    type: 'bd_auto_update',
    from: installedVersion || '?',
    to: latestVersion,
    timestamp: new Date().toISOString(),
  });

  if (store.get('notifications')) {
    showNotification('BetterDiscord aktualisiert', `BetterDiscord wurde auf v${latestVersion} aktualisiert.`);
  }

  return { success: true, version: latestVersion, message: `BetterDiscord v${latestVersion} erfolgreich installiert` };
}

// ─── Update Logic ────────────────────────────────────────────────────────────
async function checkForUpdates(fromTray = false) {
  console.log('Checking for updates...');
  const result = {
    discord: { installed: false, version: null, path: null, latestVersion: null, updateAvailable: false },
    betterDiscord: { installed: false, version: null, path: null, latestVersion: null, updateAvailable: false },
    timestamp: new Date().toISOString(),
  };

  try {
    // Local state
    const discordPath = findDiscordInstallation();
    if (discordPath) {
      result.discord.installed = true;
      result.discord.path = discordPath;
      result.discord.version = getDiscordVersion(discordPath);
    }

    const bdPath = findBetterDiscord();
    if (bdPath) {
      result.betterDiscord.installed = true;
      result.betterDiscord.path = bdPath;
      result.betterDiscord.version = getBDInstalledVersion();
    }

    // Fetch latest BD version from GitHub
    try {
      const latestBD = await getLatestBDVersion();
      result.betterDiscord.latestVersion = latestBD;
      store.set('latestBDVersion', latestBD);

      if (latestBD && result.betterDiscord.version && result.betterDiscord.version !== 'Installiert') {
        // Compare semver loosely
        const installed = result.betterDiscord.version.replace(/^v/, '');
        const latest = latestBD.replace(/^v/, '');
        result.betterDiscord.updateAvailable = installed !== latest;
      } else if (latestBD && result.betterDiscord.version === 'Installiert') {
        result.betterDiscord.updateAvailable = false; // can't tell
      }
    } catch (e) { console.error('GitHub BD check failed:', e); }

    // Discord version change detection
    const lastVersion = store.get('lastDiscordVersion');
    if (result.discord.version && lastVersion && lastVersion !== result.discord.version) {
      addToHistory({
        type: 'discord_update',
        from: lastVersion,
        to: result.discord.version,
        timestamp: new Date().toISOString(),
      });

      if (store.get('notifications')) {
        showNotification('Discord Update erkannt', `Discord wurde von ${lastVersion} auf ${result.discord.version} aktualisiert.`);
      }

      // Auto-update BD
      if (store.get('autoUpdateBD') && result.betterDiscord.installed) {
        try {
          const bdResult = await performBDUpdate();
          if (mainWindow) mainWindow.webContents.send('bd-update-done', { version: bdResult.version });
        } catch (e) {
          console.error('Auto BD update failed:', e);
          if (mainWindow) mainWindow.webContents.send('bd-update-error', { message: e.message });
        }
      }
    }

    if (result.discord.version) store.set('lastDiscordVersion', result.discord.version);
    if (result.betterDiscord.version) store.set('lastBDVersion', result.betterDiscord.version);

    if (mainWindow) mainWindow.webContents.send('update-check-result', result);
    return result;
  } catch (e) {
    console.error('Update check error:', e);
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

// ─── Autostart ───────────────────────────────────────────────────────────────
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

async function launchDiscord() {
  const discordPath = findDiscordInstallation();
  if (!discordPath) throw new Error('Discord nicht gefunden');
  if (process.platform === 'win32') {
    const appFolders = fs.readdirSync(discordPath).filter(e => e.startsWith('app-')).sort();
    const exePath = appFolders.length
      ? path.join(discordPath, appFolders[appFolders.length - 1], 'Discord.exe')
      : path.join(discordPath, 'Discord.exe');
    if (fs.existsSync(exePath)) spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    exec(`open "${discordPath}"`);
  } else {
    exec('discord');
  }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('get-status', async () => {
    const discordPath = findDiscordInstallation();
    const bdPath = findBetterDiscord();
    return {
      discord: {
        installed: !!discordPath,
        path: discordPath,
        version: discordPath ? getDiscordVersion(discordPath) : null,
        latestVersion: null,
        updateAvailable: false,
      },
      betterDiscord: {
        installed: !!bdPath,
        path: bdPath,
        version: getBDInstalledVersion(),
        latestVersion: store.get('latestBDVersion') || null,
        updateAvailable: false,
      },
      settings: {
        autoStart: app.getLoginItemSettings().openAtLogin,
        minimizeToTray: store.get('minimizeToTray'),
        checkInterval: store.get('checkInterval'),
        notifications: store.get('notifications'),
        autoUpdateBD: store.get('autoUpdateBD'),
      },
      history: store.get('updateHistory') || [],
    };
  });

  ipcMain.handle('check-updates', async () => await checkForUpdates());
  ipcMain.handle('update-discord', async () => await updateDiscord());
  ipcMain.handle('update-betterdiscord', async () => {
    const result = await performBDUpdate();
    if (mainWindow) mainWindow.webContents.send('bd-update-done', { version: result.version });
    return result;
  });
  ipcMain.handle('repair-discord', async () => await repairDiscord());
  ipcMain.handle('launch-discord', async () => await launchDiscord());

  ipcMain.handle('set-setting', async (event, { key, value }) => {
    if (key === 'autoStart') setAutoStart(value);
    else store.set(key, value);
    if (key === 'checkInterval') scheduleUpdateCheck();
    return { success: true };
  });

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
  setTimeout(() => checkForUpdates(), 3000);
  scheduleUpdateCheck();
});

app.on('window-all-closed', (e) => { if (!isQuitting) e.preventDefault(); });
app.on('activate', () => { if (!mainWindow) createWindow(); else mainWindow.show(); });
app.on('before-quit', () => { isQuitting = true; if (updateCheckJob) updateCheckJob.cancel(); });
