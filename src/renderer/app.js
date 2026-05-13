// ── Discord Updater – Renderer ─────────────────────────────────────────

let currentStatus = null;
let currentLang = 'de';

// ── i18n ──────────────────────────────────────────────────────────────
const t = (key, ...args) => {
  const strings = window.__translations?.[currentLang] || window.__translations?.de || {};
  let str = strings[key] || key;
  args.forEach((arg, i) => { str = str.replace(`{${i}}`, arg); });
  return str;
};

function applyLanguage(lang) {
  currentLang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const attr = el.getAttribute('data-i18n-attr');
    if (attr) {
      el.setAttribute(attr, t(key));
    } else {
      el.textContent = t(key);
    }
  });
  // Update select options
  document.querySelectorAll('[data-i18n-option]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n-option'));
  });
  // Update status dot tooltip
  const dot = document.getElementById('status-dot');
  if (dot) {
    const state = dot.className.includes('checking') ? 'checking' : dot.className.includes('error') ? 'error' : '';
    setStatusDot(state);
  }
  // Update language selector to reflect current
  const sel = document.getElementById('setting-language');
  if (sel) sel.value = lang;
}

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
  const label = state === 'checking' ? t('status.checking') : state === 'error' ? t('status.error') : t('status.active');
  dot.title = label;
}

// ── Render Status ─────────────────────────────────────────────────────
function renderStatus(status) {
  const { discord, betterDiscord } = status;
  const now = new Date().toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-GB');

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
  setText('upd-discord-ver', discord.version || t('badge.notfound'));
  setText('upd-discord-latest', t('updates.managed'));

  const discordBadgeEl = document.getElementById('upd-discord-badge');
  if (discord.installed) {
    discordBadgeEl.textContent = t('badge.installed');
    discordBadgeEl.className = 'badge installed';
  } else {
    discordBadgeEl.textContent = t('badge.notfound');
    discordBadgeEl.className = 'badge not-found';
  }

  // ── Updates page – BetterDiscord
  const installedVer = betterDiscord.version || t('badge.notfound');
  const latestVer = betterDiscord.latestVersion;

  setText('upd-bd-ver', installedVer);

  const latestEl = document.getElementById('upd-bd-latest');
  if (latestVer) {
    latestEl.textContent = `v${latestVer}`;
    latestEl.className = betterDiscord.updateAvailable
      ? 'version-val version-new'
      : 'version-val version-muted';
  } else {
    latestEl.textContent = t('updates.checking');
    latestEl.className = 'version-val version-muted';
  }

  const bdBadgeEl = document.getElementById('upd-bd-badge');
  if (!betterDiscord.installed) {
    bdBadgeEl.textContent = t('badge.notfound');
    bdBadgeEl.className = 'badge not-found';
  } else if (betterDiscord.updateAvailable) {
    bdBadgeEl.textContent = t('badge.updateavailable');
    bdBadgeEl.className = 'badge update-available';
  } else {
    bdBadgeEl.textContent = t('badge.uptodate');
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
  el.textContent = installed ? t('badge.installed') : t('badge.notfound');
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
  if (settings.language) {
    currentLang = settings.language;
    applyLanguage(settings.language);
  }
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
    // Apply language from settings first
    if (status.settings?.language) {
      currentLang = status.settings.language;
      applyLanguage(currentLang);
    }
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
  showToast(t('toast.checking'));
  try {
    const result = await window.api.checkUpdates();
    if (result) { currentStatus = result; renderStatus(result); }
    showToast(t('toast.checkdone'));
    setStatusDot('');
  } catch (e) {
    showToast(t('toast.checkerror'));
    setStatusDot('error');
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

document.getElementById('btn-check-updates').addEventListener('click', checkForUpdates);
document.getElementById('btn-check-updates-page')?.addEventListener('click', checkForUpdates);

// ── BD Progress ───────────────────────────────────────────────────────
const stepOrder = ['fetch', 'download', 'stop', 'install', 'inject', 'restart'];
let completedSteps = [];

function getStepLabels() {
  return {
    fetch:    t('bd.progress.fetch'),
    download: t('bd.progress.download'),
    stop:     t('bd.progress.stop'),
    install:  t('bd.progress.install'),
    inject:   t('bd.progress.inject'),
    restart:  t('bd.progress.restart'),
  };
}

function showBDProgress(step, message) {
  const box = document.getElementById('bd-progress-box');
  const text = document.getElementById('bd-progress-text');
  const stepsEl = document.getElementById('bd-progress-steps');
  box.style.display = 'block';
  text.textContent = message || t('bd.progress.default');

  if (step && !completedSteps.includes(step)) {
    const idx = stepOrder.indexOf(step);
    stepOrder.slice(0, idx).forEach(s => {
      if (!completedSteps.includes(s)) completedSteps.push(s);
    });
  }

  const labels = getStepLabels();
  stepsEl.innerHTML = stepOrder.map(s => {
    const isDone = completedSteps.includes(s);
    const isActive = s === step;
    const cls = isDone ? 'bd-step done' : isActive ? 'bd-step active' : 'bd-step';
    return `<div class="${cls}">${labels[s] || s}</div>`;
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
    showToast(t('toast.launching'));
  } catch (e) { showToast(t('notif.repairfail', e.message)); }
});

async function doUpdateDiscord() {
  showToast(t('toast.updatestarted'));
  try {
    const res = await window.api.updateDiscord();
    showToast(res.message || t('toast.updatestarted'));
  } catch (e) { showToast(t('notif.repairfail', e.message)); }
}

async function doUpdateBD() {
  completedSteps = [];
  showBDProgress('fetch', t('bd.progress.fetching'));
  const btn = document.getElementById('btn-update-bd');
  const btnDash = document.getElementById('btn-update-bd-dash');
  if (btn) btn.disabled = true;
  if (btnDash) btnDash.disabled = true;
  try {
    const res = await window.api.updateBetterDiscord();
    hideBDProgress();
    if (res.upToDate) {
      showToast(t('toast.bd.uptodate', res.version));
    } else {
      showToast(res.message || t('notif.bdinstalled', res.version));
    }
    const status = await window.api.getStatus();
    if (status) renderStatus(status);
  } catch (e) {
    hideBDProgress();
    showToast(t('notif.repairfail', e.message));
  } finally {
    if (btn) btn.disabled = false;
    if (btnDash) btnDash.disabled = false;
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
  statusText.textContent = t('repair.status.running');
  try {
    const res = await window.api.repairDiscord();
    statusText.textContent = res.message || t('toast.repairstarted');
    showToast(t('toast.repairstarted'));
    setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
  } catch (e) {
    statusText.textContent = t('notif.repairfail', e.message);
    showToast(t('notif.repairfail', e.message));
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
      <p>${t('history.empty')}</p></div>`;
    return;
  }
  const typeMap = {
    discord_update:       { icon: '↑', cls: 'update',  titleKey: 'history.type.discord_update',         detail: e => `${e.from} → ${e.to}` },
    manual_discord_update:{ icon: '↑', cls: 'manual',  titleKey: 'history.type.manual_discord_update',  detail: () => t('history.detail.manual') },
    bd_auto_update:       { icon: 'B', cls: 'bd',      titleKey: 'history.type.bd_auto_update',         detail: e => `${e.from} → ${e.to}` },
    bd_update_opened:     { icon: 'B', cls: 'bd',      titleKey: 'history.type.bd_update_opened',       detail: () => t('history.detail.download') },
    repair:               { icon: '⚙', cls: 'repair',  titleKey: 'history.type.repair',                 detail: () => t('history.detail.repair') },
  };
  const locale = currentLang === 'de' ? 'de-DE' : 'en-GB';
  list.innerHTML = history.map(entry => {
    const map = typeMap[entry.type] || { icon: '•', cls: 'manual', titleKey: entry.type, detail: () => '' };
    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString(locale) : '–';
    return `<div class="history-item">
      <div class="history-icon ${map.cls}">${map.icon}</div>
      <div class="history-info">
        <div class="history-title">${t(map.titleKey)}</div>
        <div class="history-detail">${map.detail(entry)}</div>
      </div>
      <div class="history-time">${time}</div>
    </div>`;
  }).join('');
}

document.getElementById('btn-clear-history')?.addEventListener('click', async () => {
  await window.api.clearHistory();
  renderHistory([]);
  showToast(t('toast.historycleared'));
});
document.getElementById('btn-refresh-history')?.addEventListener('click', loadHistory);

// ── Settings ──────────────────────────────────────────────────────────
function setupToggle(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', async () => {
    await window.api.setSetting(key, el.checked);
    showToast(t('toast.settingsaved'));
  });
}
setupToggle('setting-autostart', 'autoStart');
setupToggle('setting-minimize-tray', 'minimizeToTray');
setupToggle('setting-notifications', 'notifications');
setupToggle('setting-auto-bd', 'autoUpdateBD');
setupToggle('toggle-auto-bd', 'autoUpdateBD');

document.getElementById('setting-interval')?.addEventListener('change', async (e) => {
  await window.api.setSetting('checkInterval', parseInt(e.target.value));
  showToast(t('toast.interval', e.target.value));
});

// Language switcher
document.getElementById('setting-language')?.addEventListener('change', async (e) => {
  const lang = e.target.value;
  currentLang = lang;
  applyLanguage(lang);
  await window.api.setSetting('language', lang);
  showToast(t('toast.settingsaved'));
  // Re-render dynamic content
  if (currentStatus) renderStatus(currentStatus);
  loadHistory();
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
  showToast(t('toast.autobd'));
  completedSteps = [];
  showBDProgress('fetch', t('bd.autoupdate.started'));
});
window.api.onBDUpdateProgress((data) => {
  showBDProgress(data.step, data.message);
});
window.api.onBDUpdateDone((data) => {
  hideBDProgress();
  showToast(t('notif.bdauto.done', data.version));
  loadStatus();
});
window.api.onBDUpdateError((data) => {
  hideBDProgress();
  showToast(t('notif.bdfail', data.message));
});

// ── Init ──────────────────────────────────────────────────────────────
loadStatus();
