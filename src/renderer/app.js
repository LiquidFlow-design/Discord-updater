// ── Discord Updater – Renderer ────────────────────────────────────────────────

let currentStatus = null;
let currentTheme = 'dark';

// ── Navigation ────────────────────────────────────────────────────────────────
function switchPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  const nav = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (page) page.classList.add('active');
  if (nav) nav.classList.add('active');
  if (name === 'history') loadHistory();
  if (name === 'backups') loadBackups();
  if (name === 'instances') renderInstances(currentStatus?.instances || []);
  if (name === 'notifications') loadNotificationLog();
}
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchPage(btn.dataset.page)));

// ── Titlebar ──────────────────────────────────────────────────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimizeWindow());
document.getElementById('btn-close').addEventListener('click', () => window.api.closeWindow());

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyThemeUI(theme) {
  currentTheme = theme;
  document.body.classList.toggle('theme-light', theme === 'light');
  document.getElementById('theme-icon-dark').style.display = theme === 'light' ? 'block' : 'none';
  document.getElementById('theme-icon-light').style.display = theme === 'dark' ? 'block' : 'none';
  const sel = document.getElementById('setting-theme');
  if (sel) sel.value = theme;
}

document.getElementById('btn-theme-toggle').addEventListener('click', async () => {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  await window.api.setSetting('theme', newTheme);
  applyThemeUI(newTheme);
});

window.api.onThemeChanged(theme => applyThemeUI(theme));
window.api.onLanguageChanged(lang => {
  setLang(lang);
  const langSel = document.getElementById('setting-language');
  if (langSel) langSel.value = lang;
});

// ── App Self-Update ──────────────────────────────────────────────────────────
let appUpdateInfo = null;

async function initAppVersion() {
  try {
    const version = await window.api.getAppVersion();
    const el = document.getElementById('app-version-display');
    if (el) el.textContent = version;
  } catch (e) {}
}

function showAppUpdateUI(info) {
  appUpdateInfo = info;
  // Badge in Settings
  const badge = document.getElementById('app-update-badge');
  if (badge) { badge.style.display = 'inline-flex'; badge.textContent = `v${info.version} ${t('app_upd_available')}`; badge.className = 'badge update-available'; }
  // Update row in Settings
  const row = document.getElementById('app-update-row');
  if (row) row.style.display = 'flex';
  const label = document.getElementById('app-update-label');
  if (label) label.textContent = `${t('app_upd_label')} ${info.version}`;
  const desc = document.getElementById('app-update-desc');
  if (desc) desc.textContent = info.downloadUrl ? t('app_upd_desc_dl') : t('app_upd_desc_br');
  // Dot in Titlebar
  const dot = document.getElementById('app-update-dot');
  if (dot) dot.style.display = 'inline';
  showToast(t('toast_app_upd_info', info.version), 6000);
}

document.getElementById('btn-install-app-update')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-install-app-update');
  btn.disabled = true;
  btn.textContent = t('app_upd_installing');
  const bar = document.getElementById('app-update-progress-bar');
  if (bar) bar.style.display = 'flex';
  try {
    const res = await window.api.installAppUpdate();
    if (res.method === 'browser') {
      showToast(t('toast_app_upd_browser'));
      if (bar) bar.style.display = 'none';
      btn.disabled = false;
      btn.textContent = t('app_upd_install');
    }
    // If installer method: app quits automatically
  } catch (e) {
    showToast(t('modal_err', e.message));
    if (bar) bar.style.display = 'none';
    btn.disabled = false;
    btn.textContent = 'Jetzt installieren';
  }
});

window.api.onAppUpdateAvailable(info => showAppUpdateUI(info));
window.api.onAppUpdateProgress(data => {
  const text = document.getElementById('app-update-progress-text');
  if (text) text.textContent = data.message;
});

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg, duration = 3500) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), duration);
}

// ── Status Dot ────────────────────────────────────────────────────────────────
function setStatusDot(state) {
  const dot = document.getElementById('status-dot');
  dot.className = 'status-dot' + (state ? ` ${state}` : '');
}

// ── Crash Banner ──────────────────────────────────────────────────────────────
function showCrashBanner(autoRepair) {
  const banner = document.getElementById('crash-banner');
  const text = document.getElementById('crash-banner-text');
  text.textContent = autoRepair ? t('crash_repairing') : t('crash_detected');
  banner.style.display = 'flex';
}
function hideCrashBanner() {
  document.getElementById('crash-banner').style.display = 'none';
}

document.getElementById('btn-crash-repair').addEventListener('click', async () => {
  hideCrashBanner();
  try {
    await window.api.repairDiscord();
    showToast(t('toast_repair_ok'));
  } catch (e) { showToast(t('modal_err', e.message)); }
});
document.getElementById('btn-crash-dismiss').addEventListener('click', async () => {
  hideCrashBanner();
  await window.api.dismissCrash();
});

window.api.onDiscordCrashed(({ autoRepair }) => showCrashBanner(autoRepair));

// ── Render Status ─────────────────────────────────────────────────────────────
function renderStatus(status) {
  const { discord, betterDiscord } = status;
  const now = new Date().toLocaleString('de-DE');

  setText('discord-version', discord.version || '–');
  setText('discord-path', discord.path || '–');
  setAttr('discord-path', 'title', discord.path || '');
  setBadge('discord-badge', discord.installed);

  setText('bd-version', betterDiscord.version || '–');
  setText('bd-path', betterDiscord.path || '–');
  setAttr('bd-path', 'title', betterDiscord.path || '');
  setBadge('bd-badge', betterDiscord.installed);

  setText('upd-discord-ver', discord.version || 'Nicht gefunden');
  const discordBadgeEl = document.getElementById('upd-discord-badge');
  if (discord.installed) { discordBadgeEl.textContent = 'Installiert'; discordBadgeEl.className = 'badge installed'; }
  else { discordBadgeEl.textContent = 'Nicht gefunden'; discordBadgeEl.className = 'badge not-found'; }

  setText('upd-bd-ver', betterDiscord.version || 'Nicht installiert');
  const latestEl = document.getElementById('upd-bd-latest');
  if (betterDiscord.latestVersion) {
    latestEl.textContent = `v${betterDiscord.latestVersion}`;
    latestEl.className = betterDiscord.updateAvailable ? 'version-val version-new' : 'version-val version-muted';
  }
  const bdBadgeEl = document.getElementById('upd-bd-badge');
  if (!betterDiscord.installed) { bdBadgeEl.textContent = 'Nicht gefunden'; bdBadgeEl.className = 'badge not-found'; }
  else if (betterDiscord.updateAvailable) { bdBadgeEl.textContent = 'Update verfügbar'; bdBadgeEl.className = 'badge update-available'; }
  else { bdBadgeEl.textContent = 'Aktuell'; bdBadgeEl.className = 'badge installed'; }

  setText('last-check-time', now);
  const uc = document.getElementById('upd-last-check');
  if (uc) uc.textContent = now;

  if (status.instances) renderInstances(status.instances);
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setAttr(id, attr, val) { const el = document.getElementById(id); if (el) el[attr] = val; }
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
  setCheck('setting-crash-detection', settings.crashDetection);
  setCheck('setting-auto-repair', settings.autoRepairOnCrash);
  const intervalEl = document.getElementById('setting-interval');
  if (intervalEl) intervalEl.value = settings.checkInterval || 60;
  const maxBackupsEl = document.getElementById('setting-max-backups');
  if (maxBackupsEl) maxBackupsEl.value = settings.maxBackups || 5;
  if (settings.theme) applyThemeUI(settings.theme);
  if (settings.language) {
    setLang(settings.language);
    const langSel = document.getElementById('setting-language');
    if (langSel) langSel.value = settings.language;
  }
}
function setCheck(id, val) { const el = document.getElementById(id); if (el) el.checked = !!val; }

// ── Load Status ───────────────────────────────────────────────────────────────
async function loadStatus() {
  setStatusDot('checking');
  try {
    const status = await window.api.getStatus();
    currentStatus = status;
    renderStatus(status);
    renderSettings(status.settings);
    setStatusDot('');
    loadQuickLinks();
    loadFavoriteServers();
  } catch (e) { setStatusDot('error'); }
}

// ── Check Updates ─────────────────────────────────────────────────────────────
async function checkForUpdates() {
  setStatusDot('checking');
  const btns = ['btn-check-updates', 'btn-check-updates-page'].map(id => document.getElementById(id)).filter(Boolean);
  btns.forEach(b => b.disabled = true);
  showToast(t('toast_checking'));
  try {
    const result = await window.api.checkUpdates();
    if (result) { currentStatus = result; renderStatus(result); }
    showToast(t('toast_check_done'));
    setStatusDot('');
  } catch (e) { showToast(t('toast_check_err')); setStatusDot('error'); }
  finally { btns.forEach(b => b.disabled = false); }
}
document.getElementById('btn-check-updates').addEventListener('click', checkForUpdates);
document.getElementById('btn-check-updates-page')?.addEventListener('click', checkForUpdates);

// ── BD Progress ───────────────────────────────────────────────────────────────
const stepLabels = () => ({ fetch:t('step_fetch'), backup:t('step_backup'), download:t('step_download'), stop:t('step_stop'), install:t('step_install'), inject:t('step_inject'), restart:t('step_restart') });
const stepOrder = ['fetch','backup','download','stop','install','inject','restart'];
let completedSteps = [];

function showBDProgress(step, message) {
  const box = document.getElementById('bd-progress-box');
  box.style.display = 'block';
  document.getElementById('bd-progress-text').textContent = message || t('prog_bd_updating');
  if (step && !completedSteps.includes(step)) {
    stepOrder.slice(0, stepOrder.indexOf(step)).forEach(s => { if (!completedSteps.includes(s)) completedSteps.push(s); });
  }
  document.getElementById('bd-progress-steps').innerHTML = stepOrder.map(s => {
    const cls = completedSteps.includes(s) ? 'bd-step done' : s === step ? 'bd-step active' : 'bd-step';
    return `<div class="${cls}">${stepLabels()[s] || s}</div>`;
  }).join('');
}
function hideBDProgress() { document.getElementById('bd-progress-box').style.display = 'none'; completedSteps = []; }

// ── Rollback Progress ─────────────────────────────────────────────────────────
const rollbackLabels = () => ({ stop:t('step_stop'), restore:t('step_restore'), inject:t('step_inject'), restart:t('step_restart') });
const rollbackOrder = ['stop','restore','inject','restart'];
let completedRollbackSteps = [];

function showRollbackProgress(step, message) {
  const box = document.getElementById('rollback-progress-box');
  box.style.display = 'block';
  document.getElementById('rollback-progress-text').textContent = message || t('prog_rollback');
  if (step && !completedRollbackSteps.includes(step)) {
    rollbackOrder.slice(0, rollbackOrder.indexOf(step)).forEach(s => { if (!completedRollbackSteps.includes(s)) completedRollbackSteps.push(s); });
  }
  document.getElementById('rollback-progress-steps').innerHTML = rollbackOrder.map(s => {
    const cls = completedRollbackSteps.includes(s) ? 'bd-step done' : s === step ? 'bd-step active' : 'bd-step';
    return `<div class="${cls}">${rollbackLabels()[s] || s}</div>`;
  }).join('');
}
function hideRollbackProgress() { const b = document.getElementById('rollback-progress-box'); if (b) b.style.display = 'none'; completedRollbackSteps = []; }

// ── Discord Actions ───────────────────────────────────────────────────────────
document.getElementById('btn-launch-discord').addEventListener('click', async () => {
  try { await window.api.launchDiscord('stable'); showToast(t('toast_launching')); } catch (e) { showToast(t('modal_err', e.message)); }
});

async function doUpdateDiscord() {
  try { const res = await window.api.updateDiscord(); showToast(res.message || 'Discord Update gestartet ✓'); } catch (e) { showToast(t('modal_err', e.message)); }
}
async function doUpdateBD() {
  completedSteps = [];
  showBDProgress('fetch', 'Versionsinformationen werden abgerufen...');
  const btn = document.getElementById('btn-update-bd');
  if (btn) btn.disabled = true;
  try {
    const res = await window.api.updateBetterDiscord();
    hideBDProgress();
    showToast(t('toast_backup_done', res.version) + (res.backupCreated ? ' (Backup ✓)' : ''));
    const status = await window.api.getStatus();
    if (status) renderStatus(status);
    loadBackups();
  } catch (e) { hideBDProgress(); showToast(t('modal_err', e.message)); }
  finally { if (btn) btn.disabled = false; }
}

document.getElementById('btn-update-discord-dash')?.addEventListener('click', doUpdateDiscord);
document.getElementById('btn-update-discord')?.addEventListener('click', doUpdateDiscord);
document.getElementById('btn-update-bd-dash')?.addEventListener('click', doUpdateBD);
document.getElementById('btn-update-bd')?.addEventListener('click', doUpdateBD);

document.getElementById('btn-quick-backup')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-quick-backup');
  if (btn) btn.disabled = true;
  showToast(t('toast_backup_start'));
  try { const meta = await window.api.createBackup('manual'); showToast(t('toast_backup_done', meta.version)); loadBackups(); }
  catch (e) { showToast(t('toast_backup_fail', e.message)); }
  finally { if (btn) btn.disabled = false; }
});

// ── Repair ────────────────────────────────────────────────────────────────────
document.getElementById('btn-repair-discord')?.addEventListener('click', async () => {
  const statusEl = document.getElementById('repair-status');
  const statusText = document.getElementById('repair-status-text');
  statusEl.style.display = 'flex';
  statusText.textContent = 'Discord wird beendet und repariert...';
  try {
    const res = await window.api.repairDiscord();
    statusText.textContent = res.message || 'Reparatur gestartet ✓';
    showToast(t('toast_repair_ok'));
    setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
  } catch (e) { statusText.textContent = 'Fehler: ' + e.message; showToast(t('modal_err', e.message)); }
});

// ── Instances ─────────────────────────────────────────────────────────────────
function renderInstances(instances) {
  const grid = document.getElementById('instances-grid');
  if (!grid) return;
  if (!instances || instances.length === 0) {
    grid.innerHTML = `<div class="history-empty"><p>${t('inst_none')}</p></div>`;
    return;
  }
  grid.innerHTML = instances.map(inst => `
    <div class="instance-card">
      <div class="instance-header">
        <div class="card-icon discord-icon" style="width:36px;height:36px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
        </div>
        <div>
          <div class="instance-name">${escapeHtml(inst.name)}</div>
          <div class="instance-version">${inst.version ? `v${escapeHtml(inst.version)}` : t('inst_unknown')}</div>
        </div>
        <span class="badge installed" style="margin-left:auto">${t('inst_found')}</span>
      </div>
      <div class="instance-path">${escapeHtml(inst.path)}</div>
      <div class="instance-actions">
        <button class="btn btn-primary btn-sm" onclick="launchInstance('${escapeHtml(inst.id)}')">${t('inst_launch')}</button>
        <button class="btn btn-ghost btn-sm" onclick="window.api.openExternal('${escapeHtml(inst.path)}')">${t('inst_open_folder')}</button>
      </div>
    </div>
  `).join('');
}

async function launchInstance(variantId) {
  try { await window.api.launchDiscord(variantId); showToast(`Discord wird gestartet...`); }
  catch (e) { showToast(t('modal_err', e.message)); }
}

// ── Quick Links ───────────────────────────────────────────────────────────────
async function loadQuickLinks() {
  try {
    const links = await window.api.getQuickLinks();
    renderQuickLinks(links);
  } catch (e) {}
}

function renderQuickLinks(links) {
  const grid = document.getElementById('quick-links-grid');
  if (!grid) return;
  grid.innerHTML = links.map(link => `
    <button class="quick-link-btn" onclick="window.api.openExternal('${escapeHtml(link.url)}')">
      <span class="quick-link-label">${escapeHtml(link.label)}</span>
      ${!link.isDefault ? `<span class="quick-link-remove" onclick="removeQuickLink(event,'${escapeHtml(link.id)}')">×</span>` : ''}
    </button>
  `).join('');
}

async function removeQuickLink(e, id) {
  e.stopPropagation();
  const links = await window.api.removeQuickLink(id);
  renderQuickLinks(links);
}

// ── Favoriten Server ─────────────────────────────────────────────────────────
let currentServers = [];
let selectedColor = '#5865F2';
let editingServerId = null;

async function loadFavoriteServers() {
  try {
    currentServers = await window.api.getFavoriteServers();
    renderFavoriteServers(currentServers);
  } catch (e) {}
}

function renderFavoriteServers(servers) {
  const grid = document.getElementById('servers-grid');
  if (!grid) return;
  if (!servers || servers.length === 0) {
    grid.innerHTML = `<div class="server-empty">${t('dash_fav_empty')}</div>`;
    return;
  }
  grid.innerHTML = servers.map(s => {
    const initials = s.emoji || (s.name ? s.name.slice(0,2).toUpperCase() : '?');
    const url = s.serverId
      ? `discord://discord.com/channels/${s.serverId}`
      : 'discord://discord.com/channels/@me';
    return `<div class="server-card" data-id="${escapeHtml(s.id)}">
      <button class="server-icon-btn" onclick="window.api.openExternal('${url}')" title="${escapeHtml(s.name)} öffnen" style="--server-color:${escapeHtml(s.color||'#5865F2')}">
        <span class="server-initials">${escapeHtml(initials)}</span>
      </button>
      <div class="server-label">${escapeHtml(s.name)}</div>
      <div class="server-card-actions">
        <button class="server-action-btn" onclick="openEditServerModal('${escapeHtml(s.id)}')" title="Bearbeiten">✎</button>
        <button class="server-action-btn server-action-delete" onclick="deleteFavoriteServer('${escapeHtml(s.id)}')" title="Entfernen">×</button>
      </div>
    </div>`;
  }).join('');
}

// ── Modal ──────────────────────────────────────────────────────────────────
function openAddServerModal() {
  editingServerId = null;
  document.getElementById('modal-title').textContent = t('modal_add_title');
  document.getElementById('modal-server-id').value = '';
  document.getElementById('modal-server-name').value = '';
  document.getElementById('modal-server-id-val').value = '';
  document.getElementById('modal-server-emoji').value = '';
  selectedColor = '#5865F2';
  updateColorPicker('#5865F2');
  showModal();
}

function openEditServerModal(id) {
  const server = currentServers.find(s => s.id === id);
  if (!server) return;
  editingServerId = id;
  document.getElementById('modal-title').textContent = t('modal_edit_title');
  document.getElementById('modal-server-id').value = id;
  document.getElementById('modal-server-name').value = server.name || '';
  document.getElementById('modal-server-id-val').value = server.serverId || '';
  document.getElementById('modal-server-emoji').value = server.emoji || '';
  selectedColor = server.color || '#5865F2';
  updateColorPicker(selectedColor);
  showModal();
}

function showModal() {
  document.getElementById('server-modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('modal-server-name').focus(), 50);
}
function hideModal() {
  document.getElementById('server-modal-overlay').style.display = 'none';
}

function updateColorPicker(color) {
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.color === color);
  });
}

// Color swatch clicks
document.getElementById('color-picker')?.addEventListener('click', e => {
  const swatch = e.target.closest('.color-swatch');
  if (!swatch) return;
  selectedColor = swatch.dataset.color;
  updateColorPicker(selectedColor);
});

document.getElementById('btn-add-server')?.addEventListener('click', openAddServerModal);
document.getElementById('btn-modal-close')?.addEventListener('click', hideModal);
document.getElementById('btn-modal-cancel')?.addEventListener('click', hideModal);
document.getElementById('server-modal-overlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) hideModal(); });

document.getElementById('btn-modal-save')?.addEventListener('click', async () => {
  const name = document.getElementById('modal-server-name').value.trim();
  if (!name) { document.getElementById('modal-server-name').focus(); showToast(t('modal_name_req')); return; }
  const server = {
    name,
    serverId: document.getElementById('modal-server-id-val').value.trim(),
    emoji: document.getElementById('modal-server-emoji').value.trim(),
    color: selectedColor,
  };
  try {
    if (editingServerId) {
      currentServers = await window.api.updateFavoriteServer(editingServerId, server);
      showToast(t('toast_server_saved'));
    } else {
      currentServers = await window.api.addFavoriteServer(server);
      showToast(t('toast_server_added'));
    }
    renderFavoriteServers(currentServers);
    hideModal();
  } catch (e) { showToast(t('modal_err', e.message)); }
});

// Enter key in modal
document.getElementById('modal-server-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-modal-save').click(); });
document.getElementById('modal-server-id-val')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-modal-save').click(); });

async function deleteFavoriteServer(id) {
  try {
    currentServers = await window.api.removeFavoriteServer(id);
    renderFavoriteServers(currentServers);
    showToast(t('toast_server_rm'));
  } catch (e) { showToast(t('modal_err', e.message)); }
}

// ── Backups ───────────────────────────────────────────────────────────────────
async function loadBackups() {
  try { const backups = await window.api.listBackups(); renderBackups(backups); } catch (e) {}
}

function renderBackups(backups) {
  const list = document.getElementById('backup-list');
  if (!backups || backups.length === 0) {
    list.innerHTML = `<div class="history-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><p>${t('bak_empty')}</p></div>`;
    return;
  }
  const labelMap = () => ({ 'pre-update': t('bak_label_preupdate'), 'manual': t('bak_label_manual'), 'unknown': t('bak_label_unknown') });
  list.innerHTML = backups.map((b, idx) => {
    const time = b.timestamp ? new Date(b.timestamp).toLocaleString('de-DE') : '–';
    const label = labelMap()[b.label] || b.label;
    const hasPlugins = b.files?.includes('plugins');
    const hasThemes  = b.files?.includes('themes');
    const hasConfig  = b.files?.includes('config');
    return `<div class="backup-item" data-name="${escapeHtml(b.name)}">
      <div class="backup-item-left">
        <div class="backup-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
        <div class="backup-info">
          <div class="backup-title">BetterDiscord v${escapeHtml(b.version)}${idx===0?'<span class="badge installed" style="font-size:10px;padding:1px 6px;margin-left:8px">Neueste</span>':''}</div>
          <div class="backup-meta-row"><span class="backup-label-tag">${escapeHtml(label)}</span><span class="backup-time">${time}</span></div>
          <div class="backup-contents">
            <span class="backup-tag">asar</span>
            ${hasPlugins?'<span class="backup-tag">Plugins</span>':''}
            ${hasThemes?'<span class="backup-tag">Themes</span>':''}
            ${hasConfig?'<span class="backup-tag">Config</span>':''}
          </div>
        </div>
      </div>
      <div class="backup-item-actions">
        <button class="btn btn-primary btn-sm btn-rollback" data-name="${escapeHtml(b.name)}" data-version="${escapeHtml(b.version)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.9"/></svg>
          ${t('bak_rollback')}
        </button>
        <button class="btn btn-ghost btn-sm btn-delete-backup" data-name="${escapeHtml(b.name)}" title="Löschen">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.btn-rollback').forEach(btn => btn.addEventListener('click', () => doRollback(btn.dataset.name, btn.dataset.version)));
  list.querySelectorAll('.btn-delete-backup').forEach(btn => btn.addEventListener('click', () => doDeleteBackup(btn.dataset.name)));
}

document.getElementById('btn-create-backup')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-create-backup');
  btn.disabled = true;
  showToast(t('toast_backup_start'));
  try { const meta = await window.api.createBackup('manual'); showToast(t('toast_backup_done', meta.version)); loadBackups(); }
  catch (e) { showToast(t('toast_backup_fail', e.message)); }
  finally { btn.disabled = false; }
});
document.getElementById('btn-refresh-backups')?.addEventListener('click', loadBackups);

async function doRollback(backupName, version) {
  document.querySelectorAll('.btn-rollback,.btn-delete-backup').forEach(b => b.disabled = true);
  completedRollbackSteps = [];
  showRollbackProgress('stop', 'Discord wird beendet...');
  try {
    const res = await window.api.rollbackBD(backupName);
    hideRollbackProgress();
    showToast(res.message || t('toast_rollback_ok', version));
    const status = await window.api.getStatus();
    if (status) renderStatus(status);
    loadBackups();
  } catch (e) { hideRollbackProgress(); showToast(t('toast_rollback_fail', e.message)); }
  finally { document.querySelectorAll('.btn-rollback,.btn-delete-backup').forEach(b => b.disabled = false); }
}

async function doDeleteBackup(backupName) {
  try { await window.api.deleteBackup(backupName); showToast(t('toast_deleted')); loadBackups(); }
  catch (e) { showToast('Fehler beim Löschen: ' + e.message); }
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  const history = await window.api.getHistory();
  renderHistory(history);
}

function renderHistory(history) {
  const list = document.getElementById('history-list');
  if (!history || history.length === 0) {
    list.innerHTML = `<div class="history-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>${t('hist_empty')}</p></div>`;
    return;
  }
  const typeMap = {
    discord_update:        { icon:'↑', cls:'update',   title: t('hist_discord_upd'),  detail: e => `${e.from} → ${e.to}` },
    manual_discord_update: { icon:'↑', cls:'manual',   title: t('hist_manual_upd'),   detail: () => t('hist_manual_start') },
    bd_auto_update:        { icon:'B', cls:'bd',        title: t('hist_bd_autoupd'),   detail: e => `${e.from} → ${e.to}${e.backupCreated?' · Backup ✓':''}` },
    bd_backup:             { icon:'↓', cls:'backup',    title: t('hist_bd_backup'),    detail: e => `v${e.version}` },
    bd_rollback:           { icon:'⏪', cls:'rollback',  title: t('hist_bd_rollback'),  detail: e => `→ v${e.to}` },
    discord_crash:         { icon:'⚠', cls:'crash',     title: t('hist_crash'),        detail: () => '' },
    repair:                { icon:'⚙', cls:'repair',    title: t('hist_repair'),       detail: () => t('hist_repair_start') },
  };
  list.innerHTML = history.map(e => {
    const map = typeMap[e.type] || { icon:'•', cls:'manual', title:e.type, detail:()=>'' };
    const time = e.timestamp ? new Date(e.timestamp).toLocaleString('de-DE') : '–';
    return `<div class="history-item">
      <div class="history-icon ${map.cls}">${map.icon}</div>
      <div class="history-info"><div class="history-title">${map.title}</div><div class="history-detail">${map.detail(e)}</div></div>
      <div class="history-time">${time}</div>
    </div>`;
  }).join('');
}

document.getElementById('btn-clear-history')?.addEventListener('click', async () => { await window.api.clearHistory(); renderHistory([]); showToast(t('toast_hist_cleared')); });
document.getElementById('btn-refresh-history')?.addEventListener('click', loadHistory);

// ── Notification Log ──────────────────────────────────────────────────────────
async function loadNotificationLog() {
  const log = await window.api.getNotificationLog();
  renderNotificationLog(log);
}

function renderNotificationLog(log) {
  const list = document.getElementById('notif-log-list');
  if (!log || log.length === 0) {
    list.innerHTML = `<div class="history-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><p>${t('notif_empty')}</p></div>`;
    return;
  }
  list.innerHTML = log.map(n => {
    const time = n.timestamp ? new Date(n.timestamp).toLocaleString('de-DE') : '–';
    return `<div class="history-item">
      <div class="history-icon bd"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
      <div class="history-info"><div class="history-title">${escapeHtml(n.title)}</div><div class="history-detail">${escapeHtml(n.body)}</div></div>
      <div class="history-time">${time}</div>
    </div>`;
  }).join('');
}

document.getElementById('btn-clear-notif-log')?.addEventListener('click', async () => { await window.api.clearNotificationLog(); renderNotificationLog([]); showToast(t('toast_log_cleared')); });
document.getElementById('btn-refresh-notif-log')?.addEventListener('click', loadNotificationLog);

// ── Settings ──────────────────────────────────────────────────────────────────
function setupToggle(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', async () => { await window.api.setSetting(key, el.checked); showToast(t('toast_saved')); });
}
setupToggle('setting-autostart', 'autoStart');
setupToggle('setting-minimize-tray', 'minimizeToTray');
setupToggle('setting-notifications', 'notifications');
setupToggle('setting-auto-bd', 'autoUpdateBD');
setupToggle('toggle-auto-bd', 'autoUpdateBD');
setupToggle('setting-crash-detection', 'crashDetection');
setupToggle('setting-auto-repair', 'autoRepairOnCrash');

document.getElementById('setting-interval')?.addEventListener('change', async (e) => { await window.api.setSetting('checkInterval', parseInt(e.target.value)); showToast(t('toast_interval', e.target.value)); });
document.getElementById('setting-max-backups')?.addEventListener('change', async (e) => { await window.api.setSetting('maxBackups', parseInt(e.target.value)); showToast(t('toast_max_backups', e.target.value)); });
document.getElementById('setting-theme')?.addEventListener('change', async (e) => { await window.api.setSetting('theme', e.target.value); applyThemeUI(e.target.value); });
document.getElementById('setting-language')?.addEventListener('change', async (e) => {
  await window.api.setSetting('language', e.target.value);
  setLang(e.target.value);
  showToast(t('toast_saved'));
});
document.getElementById('btn-quit')?.addEventListener('click', () => window.api.quitApp());

// ── Events from Main ──────────────────────────────────────────────────────────
window.api.onUpdateCheckResult(data => { renderStatus(data); setStatusDot(''); });
window.api.onUpdateCheckError(() => setStatusDot('error'));
window.api.onBDUpdateRequired(() => { showToast(t('prog_auto_start')); completedSteps = []; showBDProgress('fetch', t('prog_auto_start')); });
window.api.onBDUpdateProgress(data => showBDProgress(data.step, data.message));
window.api.onBDUpdateDone(data => { hideBDProgress(); showToast(t('toast_backup_done', data.version) + (data.backupCreated ? ' (Backup ✓)' : '')); loadStatus(); loadBackups(); });
window.api.onBDUpdateError(data => { hideBDProgress(); showToast(t('modal_err', data.message)); });
window.api.onRollbackProgress(data => showRollbackProgress(data.step, data.message));

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
initAppVersion();
loadStatus();
