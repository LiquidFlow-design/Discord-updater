// ── Discord Updater – Renderer ─────────────────────────────────────────

let currentStatus = null;

// ── Navigation ────────────────────────────────────────────────────────
function switchPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  const nav = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (page) page.classList.add('active');
  if (nav) nav.classList.add('active');
  if (name === 'history') loadHistory();
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

// ── Titlebar ──────────────────────────────────────────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimizeWindow());
document.getElementById('btn-close').addEventListener('click', () => window.api.closeWindow());

// ── Toast ─────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg, duration = 3500) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), duration);
}

// ── Status Dot ────────────────────────────────────────────────────────
function setStatusDot(state) {
  const dot = document.getElementById('status-dot');
  dot.className = 'status-dot' + (state ? ` ${state}` : '');
  dot.title = state === 'checking' ? 'Prüfe auf Updates...' : state === 'error' ? 'Fehler' : 'Aktiv';
}

// ── Render Status ─────────────────────────────────────────────────────
function renderStatus(status) {
  const { discord, betterDiscord } = status;
  const now = new Date().toLocaleString('de-DE');

  // ── Dashboard cards
  setText('discord-version', discord.version || '–');
  setText('discord-path', discord.path || '–');
  setAttr('discord-path', 'title', discord.path || '');
  setBadge('discord-badge', discord.installed);

  setText('bd-version', betterDiscord.version || '–');
  setText('bd-path', betterDiscord.path || '–');
  setAttr('bd-path', 'title', betterDiscord.path || '');
  setBadge('bd-badge', betterDiscord.installed);

  // ── Updates page – Discord
  setText('upd-discord-ver', discord.version || 'Nicht gefunden');
  setText('upd-discord-latest', 'Wird von Discord verwaltet');

  const discordBadgeEl = document.getElementById('upd-discord-badge');
  if (discord.installed) {
    discordBadgeEl.textContent = 'Installiert';
    discordBadgeEl.className = 'badge installed';
  } else {
    discordBadgeEl.textContent = 'Nicht gefunden';
    discordBadgeEl.className = 'badge not-found';
  }

  // ── Updates page – BetterDiscord
  const installedVer = betterDiscord.version || 'Nicht installiert';
  const latestVer = betterDiscord.latestVersion;

  setText('upd-bd-ver', installedVer);

  const latestEl = document.getElementById('upd-bd-latest');
  if (latestVer) {
    latestEl.textContent = `v${latestVer}`;
    if (betterDiscord.updateAvailable) {
      latestEl.className = 'version-val version-new';
    } else {
      latestEl.className = 'version-val version-muted';
    }
  } else {
    latestEl.textContent = 'Wird geprüft...';
    latestEl.className = 'version-val version-muted';
  }

  const bdBadgeEl = document.getElementById('upd-bd-badge');
  if (!betterDiscord.installed) {
    bdBadgeEl.textContent = 'Nicht gefunden';
    bdBadgeEl.className = 'badge not-found';
  } else if (betterDiscord.updateAvailable) {
    bdBadgeEl.textContent = 'Update verfügbar';
    bdBadgeEl.className = 'badge update-available';
  } else {
    bdBadgeEl.textContent = 'Aktuell';
    bdBadgeEl.className = 'badge installed';
  }

  // Last check time
  setText('last-check-time', now);
  const updCheck = document.getElementById('upd-last-check');
  if (updCheck) updCheck.textContent = now;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setAttr(id, attr, val) {
  const el = document.getElementById(id);
  if (el) el[attr] = val;
}
function setBadge(id, installed) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = installed ? 'Installiert' : 'Nicht gefunden';
  el.className = 'badge ' + (installed ? 'installed' : 'not-found');
}

function renderSettings(settings) {
  if (!settings) return;
  setCheck('setting-autostart', settings.autoStart);
  setCheck('setting-minimize-tray', settings.minimizeToTray);
  setCheck('setting-notifications', settings.notifications);
  setCheck('setting-auto-bd', settings.autoUpdateBD);
  setCheck('toggle-auto-bd', settings.autoUpdateBD);
  const intervalEl = document.getElementById('setting-interval');
  if (intervalEl) intervalEl.value = settings.checkInterval || 60;
}
function setCheck(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}

// ── Load Status ───────────────────────────────────────────────────────
async function loadStatus() {
  setStatusDot('checking');
  try {
    const status = await window.api.getStatus();
    currentStatus = status;
    renderStatus(status);
    renderSettings(status.settings);
    setStatusDot('');
  } catch (e) {
    console.error('Failed to load status:', e);
    setStatusDot('error');
  }
}

// ── Check Updates ─────────────────────────────────────────────────────
async function checkForUpdates() {
  setStatusDot('checking');
  const btns = ['btn-check-updates', 'btn-check-updates-page'].map(id => document.getElementById(id)).filter(Boolean);
  btns.forEach(b => b.disabled = true);
  showToast('Prüfe auf Updates...');
  try {
    const result = await window.api.checkUpdates();
    if (result) { currentStatus = result; renderStatus(result); }
    showToast('Update-Prüfung abgeschlossen ✓');
    setStatusDot('');
  } catch (e) {
    showToast('Fehler bei der Update-Prüfung');
    setStatusDot('error');
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

document.getElementById('btn-check-updates').addEventListener('click', checkForUpdates);
document.getElementById('btn-check-updates-page')?.addEventListener('click', checkForUpdates);

// ── BD Progress ───────────────────────────────────────────────────────
const stepLabels = {
  fetch:    'Versionsinformationen abrufen',
  download: 'betterdiscord.asar herunterladen',
  stop:     'Discord beenden',
  install:  'Neue Version installieren',
  inject:   'In Discord injizieren',
  restart:  'Discord neu starten',
};
const stepOrder = ['fetch', 'download', 'stop', 'install', 'inject', 'restart'];
let completedSteps = [];

function showBDProgress(step, message) {
  const box = document.getElementById('bd-progress-box');
  const text = document.getElementById('bd-progress-text');
  const stepsEl = document.getElementById('bd-progress-steps');
  box.style.display = 'block';
  text.textContent = message || 'BetterDiscord wird aktualisiert...';

  if (step && !completedSteps.includes(step)) {
    // Mark previous steps as done
    const idx = stepOrder.indexOf(step);
    stepOrder.slice(0, idx).forEach(s => {
      if (!completedSteps.includes(s)) completedSteps.push(s);
    });
  }

  stepsEl.innerHTML = stepOrder.map(s => {
    const isDone = completedSteps.includes(s);
    const isActive = s === step;
    const cls = isDone ? 'bd-step done' : isActive ? 'bd-step active' : 'bd-step';
    return `<div class="${cls}">${stepLabels[s] || s}</div>`;
  }).join('');
}

function hideBDProgress() {
  const box = document.getElementById('bd-progress-box');
  box.style.display = 'none';
  completedSteps = [];
}

// ── Discord Actions ───────────────────────────────────────────────────
document.getElementById('btn-launch-discord').addEventListener('click', async () => {
  try {
    await window.api.launchDiscord();
    showToast('Discord wird gestartet...');
  } catch (e) { showToast('Fehler: ' + e.message); }
});

async function doUpdateDiscord() {
  showToast('Discord Update wird gestartet...');
  try {
    const res = await window.api.updateDiscord();
    showToast(res.message || 'Discord Update gestartet ✓');
  } catch (e) { showToast('Fehler: ' + e.message); }
}

async function doUpdateBD() {
  completedSteps = [];
  showBDProgress('fetch', 'Versionsinformationen werden abgerufen...');
  const btn = document.getElementById('btn-update-bd');
  if (btn) btn.disabled = true;
  try {
    const res = await window.api.updateBetterDiscord();
    hideBDProgress();
    showToast(res.message || `BetterDiscord ${res.version} installiert ✓`);
    // Refresh status
    const status = await window.api.getStatus();
    if (status) renderStatus(status);
  } catch (e) {
    hideBDProgress();
    showToast('Fehler: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.getElementById('btn-update-discord-dash')?.addEventListener('click', doUpdateDiscord);
document.getElementById('btn-update-discord')?.addEventListener('click', doUpdateDiscord);
document.getElementById('btn-update-bd-dash')?.addEventListener('click', doUpdateBD);
document.getElementById('btn-update-bd')?.addEventListener('click', doUpdateBD);

// ── Repair ────────────────────────────────────────────────────────────
document.getElementById('btn-repair-discord')?.addEventListener('click', async () => {
  const statusEl = document.getElementById('repair-status');
  const statusText = document.getElementById('repair-status-text');
  statusEl.style.display = 'flex';
  statusText.textContent = 'Discord wird beendet und repariert...';
  try {
    const res = await window.api.repairDiscord();
    statusText.textContent = res.message || 'Reparatur gestartet ✓';
    showToast('Reparatur gestartet ✓');
    setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
  } catch (e) {
    statusText.textContent = 'Fehler: ' + e.message;
    showToast('Fehler: ' + e.message);
  }
});

// ── History ───────────────────────────────────────────────────────────
async function loadHistory() {
  const history = await window.api.getHistory();
  renderHistory(history);
}

function renderHistory(history) {
  const list = document.getElementById('history-list');
  if (!history || history.length === 0) {
    list.innerHTML = `<div class="history-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <p>Kein Verlauf vorhanden</p></div>`;
    return;
  }
  const typeMap = {
    discord_update:       { icon: '↑', cls: 'update',  title: 'Discord Update erkannt',         detail: e => `${e.from} → ${e.to}` },
    manual_discord_update:{ icon: '↑', cls: 'manual',  title: 'Manuelles Discord Update',       detail: () => 'Manuell gestartet' },
    bd_auto_update:       { icon: 'B', cls: 'bd',      title: 'BetterDiscord Auto-Update',      detail: e => `${e.from} → ${e.to}` },
    bd_update_opened:     { icon: 'B', cls: 'bd',      title: 'BetterDiscord Update',           detail: () => 'Download-Seite geöffnet' },
    repair:               { icon: '⚙', cls: 'repair',  title: 'Discord Reparatur',              detail: () => 'Reparatur gestartet' },
  };
  list.innerHTML = history.map(entry => {
    const map = typeMap[entry.type] || { icon: '•', cls: 'manual', title: entry.type, detail: () => '' };
    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString('de-DE') : '–';
    return `<div class="history-item">
      <div class="history-icon ${map.cls}">${map.icon}</div>
      <div class="history-info">
        <div class="history-title">${map.title}</div>
        <div class="history-detail">${map.detail(entry)}</div>
      </div>
      <div class="history-time">${time}</div>
    </div>`;
  }).join('');
}

document.getElementById('btn-clear-history')?.addEventListener('click', async () => {
  await window.api.clearHistory();
  renderHistory([]);
  showToast('Verlauf gelöscht');
});
document.getElementById('btn-refresh-history')?.addEventListener('click', loadHistory);

// ── Settings ──────────────────────────────────────────────────────────
function setupToggle(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', async () => {
    await window.api.setSetting(key, el.checked);
    showToast('Einstellung gespeichert');
  });
}
setupToggle('setting-autostart', 'autoStart');
setupToggle('setting-minimize-tray', 'minimizeToTray');
setupToggle('setting-notifications', 'notifications');
setupToggle('setting-auto-bd', 'autoUpdateBD');
setupToggle('toggle-auto-bd', 'autoUpdateBD');

document.getElementById('setting-interval')?.addEventListener('change', async (e) => {
  await window.api.setSetting('checkInterval', parseInt(e.target.value));
  showToast(`Intervall: alle ${e.target.value} Minuten`);
});
document.getElementById('btn-quit')?.addEventListener('click', () => window.api.quitApp());

// ── Events from Main ──────────────────────────────────────────────────
window.api.onUpdateCheckResult((data) => {
  renderStatus(data);
  setStatusDot('');
});
window.api.onUpdateCheckError((data) => {
  console.error('Update check error:', data.message);
  setStatusDot('error');
});
window.api.onBDUpdateRequired((data) => {
  showToast('Discord Update erkannt – BetterDiscord wird automatisch aktualisiert...');
  completedSteps = [];
  showBDProgress('fetch', 'Automatisches BD-Update gestartet...');
});
window.api.onBDUpdateProgress((data) => {
  showBDProgress(data.step, data.message);
});
window.api.onBDUpdateDone((data) => {
  hideBDProgress();
  showToast(`BetterDiscord v${data.version} automatisch aktualisiert ✓`);
  loadStatus();
});
window.api.onBDUpdateError((data) => {
  hideBDProgress();
  showToast('BD Auto-Update fehlgeschlagen: ' + data.message);
});

// ── Init ──────────────────────────────────────────────────────────────
loadStatus();
