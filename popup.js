// popup.js — Email Read Automate

const $ = id => document.getElementById(id);

// UI References
const btnStart  = $('btnStart');
const btnPause  = $('btnPause');
const btnStop   = $('btnStop');
const statusPill  = $('statusPill');
const statusLabel = $('statusLabel');
const statusDot   = $('statusDot');
const statOpened  = $('statOpened');
const statRuntime = $('statRuntime');
const statUnread  = $('statUnread');
const logScroll   = $('logScroll');
const logEmpty    = $('logEmpty');
const gmailAlert  = $('gmailAlert');
const providerSelect = $('providerSelect');
const readTimeSlider  = $('readTimeSlider');
const backDelaySlider = $('backDelaySlider');
const readTimeVal     = $('readTimeVal');
const backDelayVal    = $('backDelayVal');
const autoRefreshToggle = $('autoRefreshToggle');
const randomEmailOpeningToggle = $('randomEmailOpeningToggle');
const retryEmailOpeningToggle = $('retryEmailOpeningToggle');
const manualActivityPauseToggle = $('manualActivityPauseToggle');
const maxEmailsInput = $('maxEmailsInput');
const enableAccountSwitchingToggle = $('enableAccountSwitchingToggle');
const accountSelectionRow = $('accountSelectionRow');
const accountList = $('accountList');
const btnRefreshAccounts = $('btnRefreshAccounts');
const proxyManagerToggle = $('proxyManagerToggle');
const proxyFallbackToggle = $('proxyFallbackToggle');
const proxyHostInput = $('proxyHostInput');
const proxyPortInput = $('proxyPortInput');
const proxyUsernameInput = $('proxyUsernameInput');
const proxyPasswordInput = $('proxyPasswordInput');
const proxyCountryInput = $('proxyCountryInput');
const proxyCityInput = $('proxyCityInput');
const proxyTypeSelect = $('proxyTypeSelect');
const proxyAssignedToSelect = $('proxyAssignedToSelect');
const btnAddProxy = $('btnAddProxy');
const proxyList = $('proxyList');
const enableLinkOpeningToggle = $('enableLinkOpeningToggle');
const maxLinksPerEmailInput = $('maxLinksPerEmailInput');
const enableAutoReplyToggle = $('enableAutoReplyToggle');
const enableProcessedTrackingToggle = $('enableProcessedTrackingToggle');
const reprocessingModeSelect = $('reprocessingModeSelect');
const replyTemplatesInput = $('replyTemplatesInput');
const btnSaveTemplates = $('btnSaveTemplates');
const btnClearProcessedHistory = $('btnClearProcessedHistory');
const automationTemplateSelect = $('automationTemplateSelect');
const automationTemplateNameInput = $('automationTemplateNameInput');
const btnApplyAutomationTemplate = $('btnApplyAutomationTemplate');
const btnSaveAutomationTemplate = $('btnSaveAutomationTemplate');
const btnDeleteAutomationTemplate = $('btnDeleteAutomationTemplate');

const DEFAULT_SETTINGS = {
  selectedProvider: 'gmail',
  readTime: 4,
  backDelay: 2,
  autoRefresh: true,
  randomEmailOpening: false,
  retryEmailOpening: true,
  manualActivityPause: true,
  maxEmails: 20,
  maxLinksPerEmail: 1,
  enableLinkOpening: true,
  enableAutoReply: true,
  enableProcessedTracking: true,
  reprocessingMode: 'never',
  enableAccountSwitching: false,
  enableProxyManager: false,
  allowProxyFallback: false,
  selectedAccounts: []
};

const BUILT_IN_AUTOMATION_TEMPLATES = [
  {
    id: 'builtin-open-only',
    name: 'Open / Read Only',
    locked: true,
    settings: {
      enableLinkOpening: false,
      enableAutoReply: false,
      enableProcessedTracking: true,
      randomEmailOpening: false,
      retryEmailOpening: true,
      manualActivityPause: true,
    },
  },
  {
    id: 'builtin-open-links',
    name: 'Open + Safe Links',
    locked: true,
    settings: {
      enableLinkOpening: true,
      enableAutoReply: false,
      enableProcessedTracking: true,
      maxLinksPerEmail: 1,
      randomEmailOpening: false,
      retryEmailOpening: true,
      manualActivityPause: true,
    },
  },
  {
    id: 'builtin-open-links-reply',
    name: 'Open + Links + Reply',
    locked: true,
    settings: {
      enableLinkOpening: true,
      enableAutoReply: true,
      enableProcessedTracking: true,
      maxLinksPerEmail: 1,
      randomEmailOpening: false,
      retryEmailOpening: true,
      manualActivityPause: true,
    },
  },
];

let savedAutomationTemplates = [];
let knownAccounts = [];


let runtimeInterval = null;
let runtimeSeconds  = 0;
let currentState    = 'idle'; // idle | running | paused | stopped
const ACTIVITY_LOG_KEY = 'activityLogEntries';
const MAX_ACTIVITY_LOG_ENTRIES = 200;

//  Helpers 
function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

function formatLogTime(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
}

function renderLogEntry(msg, type = 'info', timestamp = Date.now()) {
  logEmpty.style.display = 'none';
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = formatLogTime(timestamp);
  const message = document.createElement('span');
  message.className = 'log-msg';
  message.textContent = msg;
  entry.append(time, message);
  logScroll.prepend(entry);
  while (logScroll.children.length > 61) {
    logScroll.removeChild(logScroll.lastChild);
  }
}

function persistLogEntry(msg, type = 'info') {
  chrome.storage.local.get([ACTIVITY_LOG_KEY], (data) => {
    const entries = Array.isArray(data[ACTIVITY_LOG_KEY]) ? data[ACTIVITY_LOG_KEY] : [];
    entries.push({
      message: String(msg),
      level: type,
      time: Date.now()
    });

    chrome.storage.local.set({
      [ACTIVITY_LOG_KEY]: entries.slice(-MAX_ACTIVITY_LOG_ENTRIES)
    });
  });
}

function log(msg, type = 'info', options = {}) {
  renderLogEntry(msg, type, options.time || Date.now());
  if (options.persist !== false) {
    persistLogEntry(msg, type);
  }
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      resolve(response || { ok: false, error: 'No response from background' });
    });
  });
}

function loadActivityLogs() {
  chrome.storage.local.get([ACTIVITY_LOG_KEY], (data) => {
    const entries = Array.isArray(data[ACTIVITY_LOG_KEY]) ? data[ACTIVITY_LOG_KEY] : [];
    if (!entries.length) return;

    logScroll.innerHTML = '';
    entries.slice(-60).forEach((entry) => {
      renderLogEntry(entry.message, entry.level || 'info', entry.time || Date.now());
    });
  });
}

function setStatus(state, label) {
  currentState = state;
  statusLabel.textContent = label;
  statusPill.className = 'status-pill ' + state;

  btnStart.disabled  = (state === 'running');
  btnPause.disabled  = (state === 'idle' || state === 'stopped');
  btnStop.disabled   = (state === 'idle' || state === 'stopped');

  btnStart.classList.toggle('active', state === 'running');
  btnPause.classList.toggle('active', state === 'paused');
  btnStop.classList.toggle('active',  state === 'stopped');

  if (state === 'running') {
    if (!runtimeInterval) {
      runtimeInterval = setInterval(() => {
        runtimeSeconds++;
        statRuntime.textContent = formatTime(runtimeSeconds);
      }, 1000);
    }
  } else {
    clearInterval(runtimeInterval);
    runtimeInterval = null;
  }
}

function updateStat(el, val) {
  el.classList.add('highlight');
  el.textContent = val;
  setTimeout(() => el.classList.remove('highlight'), 600);
}

function validateMaxEmails(value) {
  const parsed = parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  if (parsed > 200) {
    return 200;
  }

  return parsed;
}

function validateMaxLinksPerEmail(value) {
  const parsed = parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  if (parsed > 3) {
    return 3;
  }

  return parsed;
}

//  Settings Sliders 
readTimeSlider.addEventListener('input', () => {
  readTimeVal.textContent = readTimeSlider.value + 's';
  saveSettings();
});

backDelaySlider.addEventListener('input', () => {
  backDelayVal.textContent = backDelaySlider.value + 's';
  saveSettings();
});

providerSelect.addEventListener('change', saveSettings);
autoRefreshToggle.addEventListener('change', saveSettings);
randomEmailOpeningToggle.addEventListener('change', saveSettings);
retryEmailOpeningToggle.addEventListener('change', saveSettings);
manualActivityPauseToggle.addEventListener('change', saveSettings);
maxEmailsInput.addEventListener('input', () => {
  maxEmailsInput.value = validateMaxEmails(maxEmailsInput.value);
  saveSettings();
});
enableLinkOpeningToggle.addEventListener('change', saveSettings);
maxLinksPerEmailInput.addEventListener('input', () => {
  maxLinksPerEmailInput.value = validateMaxLinksPerEmail(maxLinksPerEmailInput.value);
  saveSettings();
});
enableAutoReplyToggle.addEventListener('change', saveSettings);
enableProcessedTrackingToggle.addEventListener('change', saveSettings);
enableAccountSwitchingToggle.addEventListener('change', async () => {
  accountSelectionRow.style.display = enableAccountSwitchingToggle.checked ? 'flex' : 'none';
  saveSettings();
  if (enableAccountSwitchingToggle.checked) {
    await refreshAccounts();
  }
});
proxyManagerToggle.addEventListener('change', async () => {
  saveSettings();

  if (!proxyManagerToggle.checked) {
    const result = await sendRuntimeMessage({ action: 'CLEAR_PROXY' });
    if (result.ok) {
      log('Proxy cleared because Proxy Manager is disabled.', 'success');
    } else {
      log(`Proxy clear failed: ${result.error || 'Unknown error'}`, 'error');
    }
  }
});
proxyFallbackToggle.addEventListener('change', saveSettings);
btnAddProxy.addEventListener('click', addProxyFromForm);
reprocessingModeSelect.addEventListener('change', () => {
  if (reprocessingModeSelect.value === 'unread') {
    log('Warning: Reprocess If Marked Unread may process the same email multiple times.', 'warn');
  }
  saveSettings();
});

btnSaveTemplates.addEventListener('click', saveReplyTemplates);
btnClearProcessedHistory.addEventListener('click', clearProcessedHistory);
btnRefreshAccounts.addEventListener('click', refreshAccounts);
btnApplyAutomationTemplate.addEventListener('click', applySelectedAutomationTemplate);
btnSaveAutomationTemplate.addEventListener('click', saveAutomationTemplate);
btnDeleteAutomationTemplate.addEventListener('click', deleteSelectedAutomationTemplate);
automationTemplateSelect.addEventListener('change', updateAutomationTemplateButtons);


function getAutomationTemplateSettingsSnapshot() {
  const settings = getCurrentSettings();
  const keysToSave = [
    'selectedProvider',
    'readTime',
    'backDelay',
    'autoRefresh',
    'randomEmailOpening',
    'retryEmailOpening',
    'manualActivityPause',
    'maxEmails',
    'maxLinksPerEmail',
    'enableLinkOpening',
    'enableAutoReply',
    'enableProcessedTracking',
    'reprocessingMode',
    'enableAccountSwitching',
    'enableProxyManager',
    'allowProxyFallback',
    'selectedAccounts'
  ];

  return keysToSave.reduce((snapshot, key) => {
    snapshot[key] = settings[key];
    return snapshot;
  }, {});
}

function renderAutomationTemplates(customTemplates = []) {
  savedAutomationTemplates = Array.isArray(customTemplates) ? customTemplates : [];
  automationTemplateSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose template';
  automationTemplateSelect.appendChild(placeholder);

  const builtInGroup = document.createElement('optgroup');
  builtInGroup.label = 'Built-in Templates';
  BUILT_IN_AUTOMATION_TEMPLATES.forEach(template => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.name;
    builtInGroup.appendChild(option);
  });
  automationTemplateSelect.appendChild(builtInGroup);

  if (savedAutomationTemplates.length) {
    const customGroup = document.createElement('optgroup');
    customGroup.label = 'Saved Templates';
    savedAutomationTemplates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name;
      customGroup.appendChild(option);
    });
    automationTemplateSelect.appendChild(customGroup);
  }

  updateAutomationTemplateButtons();
}

function getAutomationTemplateById(templateId) {
  return (
    BUILT_IN_AUTOMATION_TEMPLATES.find(template => template.id === templateId) ||
    savedAutomationTemplates.find(template => template.id === templateId) ||
    null
  );
}

function updateAutomationTemplateButtons() {
  const template = getAutomationTemplateById(automationTemplateSelect.value);
  btnApplyAutomationTemplate.disabled = !template;
  btnDeleteAutomationTemplate.disabled = !template || Boolean(template.locked);
}

function applySettingsToControls(templateSettings = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...getCurrentSettings(), ...templateSettings };

  providerSelect.value = merged.selectedProvider || DEFAULT_SETTINGS.selectedProvider;
  readTimeSlider.value = merged.readTime;
  readTimeVal.textContent = merged.readTime + 's';
  backDelaySlider.value = merged.backDelay;
  backDelayVal.textContent = merged.backDelay + 's';
  autoRefreshToggle.checked = Boolean(merged.autoRefresh);
  randomEmailOpeningToggle.checked = Boolean(merged.randomEmailOpening);
  retryEmailOpeningToggle.checked = Boolean(merged.retryEmailOpening);
  manualActivityPauseToggle.checked = Boolean(merged.manualActivityPause);
  maxEmailsInput.value = validateMaxEmails(merged.maxEmails);
  maxLinksPerEmailInput.value = validateMaxLinksPerEmail(merged.maxLinksPerEmail);
  enableLinkOpeningToggle.checked = Boolean(merged.enableLinkOpening);
  enableAutoReplyToggle.checked = Boolean(merged.enableAutoReply);
  enableProcessedTrackingToggle.checked = Boolean(merged.enableProcessedTracking);
  reprocessingModeSelect.value = merged.reprocessingMode || DEFAULT_SETTINGS.reprocessingMode;
  enableAccountSwitchingToggle.checked = Boolean(merged.enableAccountSwitching);
  proxyManagerToggle.checked = Boolean(merged.enableProxyManager);
  proxyFallbackToggle.checked = Boolean(merged.allowProxyFallback);
  accountSelectionRow.style.display = enableAccountSwitchingToggle.checked ? 'flex' : 'none';

  if (Array.isArray(merged.selectedAccounts)) {
    accountList.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.checked = merged.selectedAccounts.includes(input.value);
    });
  }
}

function applySelectedAutomationTemplate() {
  const template = getAutomationTemplateById(automationTemplateSelect.value);

  if (!template) {
    log('Select an automation template first.', 'warn');
    return;
  }

  applySettingsToControls(template.settings || {});
  saveSettings();
  chrome.storage.local.set({ selectedAutomationTemplate: template.id });
  log(`Applied template: ${template.name}`, 'success');
}

function saveAutomationTemplate() {
  const name = automationTemplateNameInput.value.trim();

  if (!name) {
    log('Enter a template name before saving.', 'warn');
    automationTemplateNameInput.focus();
    return;
  }

  const safeName = name.substring(0, 50);
  const existing = savedAutomationTemplates.find(template => template.name.toLowerCase() === safeName.toLowerCase());
  const template = {
    id: existing ? existing.id : `custom-${Date.now()}`,
    name: safeName,
    locked: false,
    settings: getAutomationTemplateSettingsSnapshot(),
  };

  const nextTemplates = existing
    ? savedAutomationTemplates.map(item => item.id === existing.id ? template : item)
    : [...savedAutomationTemplates, template];

  chrome.storage.local.set({ automationTemplates: nextTemplates, selectedAutomationTemplate: template.id }, () => {
    automationTemplateNameInput.value = '';
    renderAutomationTemplates(nextTemplates);
    automationTemplateSelect.value = template.id;
    updateAutomationTemplateButtons();
    log(existing ? `Updated template: ${safeName}` : `Saved template: ${safeName}`, 'success');
  });
}

function deleteSelectedAutomationTemplate() {
  const template = getAutomationTemplateById(automationTemplateSelect.value);

  if (!template || template.locked) {
    log('Built-in templates cannot be deleted.', 'warn');
    return;
  }

  const nextTemplates = savedAutomationTemplates.filter(item => item.id !== template.id);
  chrome.storage.local.set({ automationTemplates: nextTemplates, selectedAutomationTemplate: '' }, () => {
    renderAutomationTemplates(nextTemplates);
    log(`Deleted template: ${template.name}`, 'success');
  });
}

function getCurrentSettings() {
  const maxEmails = validateMaxEmails(maxEmailsInput.value);
  const maxLinksPerEmail = validateMaxLinksPerEmail(maxLinksPerEmailInput.value);
  maxEmailsInput.value = maxEmails;
  maxLinksPerEmailInput.value = maxLinksPerEmail;

  return {
    selectedProvider: providerSelect.value || DEFAULT_SETTINGS.selectedProvider,
    readTime: parseInt(readTimeSlider.value) || DEFAULT_SETTINGS.readTime,
    backDelay: parseInt(backDelaySlider.value) || DEFAULT_SETTINGS.backDelay,
    autoRefresh: autoRefreshToggle.checked,
    randomEmailOpening: randomEmailOpeningToggle.checked,
    retryEmailOpening: retryEmailOpeningToggle.checked,
    manualActivityPause: manualActivityPauseToggle.checked,
    maxEmails,
    maxLinksPerEmail,
    enableLinkOpening: enableLinkOpeningToggle.checked,
    enableAutoReply: enableAutoReplyToggle.checked,
    enableProcessedTracking: enableProcessedTrackingToggle.checked,
    reprocessingMode: reprocessingModeSelect.value || DEFAULT_SETTINGS.reprocessingMode,
    enableAccountSwitching: enableAccountSwitchingToggle.checked,
    enableProxyManager: proxyManagerToggle.checked,
    allowProxyFallback: proxyFallbackToggle.checked,
    selectedAccounts: getSelectedAccounts()
  };
}

function saveSettings() {
  const settings = getCurrentSettings();
  chrome.storage.local.set(settings);

  if (window.ProxyStorage) {
    window.ProxyStorage.saveProxySettings({
      enabled: settings.enableProxyManager,
      allowFallback: settings.allowProxyFallback,
    }).catch(error => log(`Proxy settings save failed: ${error.message}`, 'error'));
  }
}

function loadSettings() {
  chrome.storage.local.get([
    'selectedProvider',
    'readTime',
    'backDelay',
    'autoRefresh',
    'randomEmailOpening',
    'retryEmailOpening',
    'manualActivityPause',
    'emailsOpened',
    'state',
    'maxEmails',
    'maxLinksPerEmail',
    'enableLinkOpening',
    'enableAutoReply',
    'enableProcessedTracking',
    'reprocessingMode',
    'enableAccountSwitching',
    'enableProxyManager',
    'allowProxyFallback',
    'selectedAccounts',
    'discoveredAccounts',
    'proxySettings',
    'proxyConfigs',
    'accountProxyMap',
    'replyTemplates',
    'automationTemplates',
    'selectedAutomationTemplate'
  ], data => {
    providerSelect.value = data.selectedProvider || DEFAULT_SETTINGS.selectedProvider;

    if (data.readTime)  {
      readTimeSlider.value = data.readTime;
      readTimeVal.textContent = data.readTime + 's';
    }
    if (data.backDelay) {
      backDelaySlider.value = data.backDelay;
      backDelayVal.textContent = data.backDelay + 's';
    }
    if (data.autoRefresh !== undefined) {
      autoRefreshToggle.checked = data.autoRefresh;
    }
    randomEmailOpeningToggle.checked = data.randomEmailOpening !== undefined ? data.randomEmailOpening : DEFAULT_SETTINGS.randomEmailOpening;
    retryEmailOpeningToggle.checked = data.retryEmailOpening !== undefined ? data.retryEmailOpening : DEFAULT_SETTINGS.retryEmailOpening;
    manualActivityPauseToggle.checked = data.manualActivityPause !== undefined ? data.manualActivityPause : DEFAULT_SETTINGS.manualActivityPause;
    if (data.emailsOpened) {
      statOpened.textContent = data.emailsOpened;
    }
    if (data.maxEmails !== undefined) {
      maxEmailsInput.value = validateMaxEmails(data.maxEmails);
    }
    maxLinksPerEmailInput.value = validateMaxLinksPerEmail(
      data.maxLinksPerEmail !== undefined ? data.maxLinksPerEmail : DEFAULT_SETTINGS.maxLinksPerEmail
    );
    enableLinkOpeningToggle.checked = data.enableLinkOpening !== undefined ? data.enableLinkOpening : DEFAULT_SETTINGS.enableLinkOpening;
    enableAutoReplyToggle.checked = data.enableAutoReply !== undefined ? data.enableAutoReply : DEFAULT_SETTINGS.enableAutoReply;
    enableProcessedTrackingToggle.checked = data.enableProcessedTracking !== undefined ? data.enableProcessedTracking : DEFAULT_SETTINGS.enableProcessedTracking;
    enableAccountSwitchingToggle.checked = data.enableAccountSwitching !== undefined ? data.enableAccountSwitching : DEFAULT_SETTINGS.enableAccountSwitching;
    const proxySettings = data.proxySettings || {};
    proxyManagerToggle.checked = proxySettings.enabled !== undefined
      ? Boolean(proxySettings.enabled)
      : (data.enableProxyManager !== undefined ? Boolean(data.enableProxyManager) : DEFAULT_SETTINGS.enableProxyManager);
    proxyFallbackToggle.checked = proxySettings.allowFallback !== undefined
      ? Boolean(proxySettings.allowFallback)
      : (data.allowProxyFallback !== undefined ? Boolean(data.allowProxyFallback) : DEFAULT_SETTINGS.allowProxyFallback);
    accountSelectionRow.style.display = enableAccountSwitchingToggle.checked ? 'flex' : 'none';
    renderAccounts(Array.isArray(data.discoveredAccounts) ? data.discoveredAccounts : [], Array.isArray(data.selectedAccounts) ? data.selectedAccounts : []);
    reprocessingModeSelect.value = data.reprocessingMode || DEFAULT_SETTINGS.reprocessingMode;
    if (Array.isArray(data.replyTemplates)) {
      replyTemplatesInput.value = data.replyTemplates.join('\n');
    }

    renderAutomationTemplates(Array.isArray(data.automationTemplates) ? data.automationTemplates : []);
    if (data.selectedAutomationTemplate && getAutomationTemplateById(data.selectedAutomationTemplate)) {
      automationTemplateSelect.value = data.selectedAutomationTemplate;
      updateAutomationTemplateButtons();
    }

    if (window.ProxyStorage && !data.proxySettings) {
      window.ProxyStorage.saveProxySettings({
        enabled: proxyManagerToggle.checked,
        allowFallback: proxyFallbackToggle.checked,
      }).finally(loadProxyManagerUi);
    } else {
      loadProxyManagerUi();
    }
  });
}

function getSelectedAccounts() {
  return Array.from(accountList.querySelectorAll('input[type="checkbox"]:checked'))
    .map(input => input.value);
}

function renderAccounts(accounts, selectedAccounts = []) {
  setKnownAccounts(accounts);
  accountList.innerHTML = '';

  if (!accounts.length) {
    const empty = document.createElement('div');
    empty.className = 'account-empty';
    empty.textContent = 'No additional accounts detected yet.';
    accountList.appendChild(empty);
    return;
  }

  const selected = new Set(selectedAccounts.length ? selectedAccounts : accounts.map(account => account.id));

  accounts.forEach((account, index) => {
    const label = document.createElement('label');
    label.className = 'account-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = account.id;
    checkbox.checked = selected.has(account.id);
    checkbox.addEventListener('change', saveSettings);

    const text = document.createElement('span');
    text.textContent = account.label || `Account ${index + 1}`;

    label.append(checkbox, text);
    accountList.appendChild(label);
  });
}

function getAssignableProxyAccounts(extraAccountId = '') {
  const accountMap = new Map();

  knownAccounts.forEach((account) => {
    if (account?.id) {
      accountMap.set(account.id, {
        id: account.id,
        label: account.label || account.id,
      });
    }
  });

  if (extraAccountId && !accountMap.has(extraAccountId)) {
    accountMap.set(extraAccountId, {
      id: extraAccountId,
      label: extraAccountId,
    });
  }

  return Array.from(accountMap.values());
}

function setKnownAccounts(accounts = []) {
  knownAccounts = Array.isArray(accounts) ? accounts.filter(account => account?.id) : [];
  populateProxyAccountOptions();
}

function populateProxyAccountOptions(selectedValue = proxyAssignedToSelect.value) {
  proxyAssignedToSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Assign account';
  proxyAssignedToSelect.appendChild(placeholder);

  getAssignableProxyAccounts(selectedValue).forEach((account) => {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = account.label;
    proxyAssignedToSelect.appendChild(option);
  });

  proxyAssignedToSelect.value = selectedValue || '';
}

function getMaxAccountProxies() {
  return window.ProxyStorage?.MAX_PROXIES_PER_ACCOUNT || 3;
}

function normalizeProxyIdList(value) {
  const rawIds = Array.isArray(value) ? value : (value ? [value] : []);
  const seen = new Set();
  const ids = [];

  rawIds.forEach((item) => {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });

  return ids.slice(0, getMaxAccountProxies());
}

function getAccountProxyIds(accountProxyMap = {}, accountId = '') {
  return normalizeProxyIdList(accountProxyMap[accountId]);
}

function getAssignedAccountForProxy(proxy, accountProxyMap = {}) {
  return proxy.assignedTo ||
    Object.keys(accountProxyMap).find(accountId => getAccountProxyIds(accountProxyMap, accountId).includes(proxy.id)) ||
    '';
}

function getProxyAssignmentRank(proxy, assignedAccountId, accountProxyMap = {}) {
  if (!assignedAccountId) return -1;
  return getAccountProxyIds(accountProxyMap, assignedAccountId).indexOf(proxy.id);
}

function getProxyAssignmentLabel(rank) {
  if (rank === 0) return 'Primary proxy';
  if (rank === 1) return 'Backup proxy 1';
  if (rank === 2) return 'Backup proxy 2';
  return 'Assigned proxy';
}

function getProxyAccountLabel(accountId = '') {
  return getAssignableProxyAccounts(accountId).find(account => account.id === accountId)?.label || accountId;
}

function getProxyStatus(proxy) {
  if (proxy.enabled === false) return 'Disabled';
  return proxy.status || 'Untested';
}

function getProxyStatusClass(status) {
  return `proxy-status-${String(status || 'Untested').toLowerCase().replace(/\s+/g, '-')}`;
}

function clearProxyForm() {
  proxyHostInput.value = '';
  proxyPortInput.value = '';
  proxyUsernameInput.value = '';
  proxyPasswordInput.value = '';
  proxyCountryInput.value = '';
  proxyCityInput.value = '';
  proxyTypeSelect.value = 'http';
  proxyAssignedToSelect.value = '';
}

function getProxyFormData() {
  const host = proxyHostInput.value.trim();
  const port = parseInt(proxyPortInput.value, 10);

  if (!host || !Number.isFinite(port)) {
    log('Enter proxy host and port before saving.', 'warn');
    return null;
  }

  return {
    host,
    port,
    username: proxyUsernameInput.value.trim(),
    password: proxyPasswordInput.value,
    country: proxyCountryInput.value.trim(),
    city: proxyCityInput.value.trim(),
    type: proxyTypeSelect.value || 'http',
    status: 'Untested',
    assignedTo: proxyAssignedToSelect.value || '',
    lastCheck: '',
    latency: '',
    lastKnownIp: '',
    enabled: true,
  };
}

async function addProxyFromForm() {
  if (!window.ProxyStorage) {
    log('Proxy storage is not available.', 'error');
    return;
  }

  const proxy = getProxyFormData();
  if (!proxy) return;

  const savedProxy = await window.ProxyStorage.upsertProxy(proxy);
  clearProxyForm();
  await loadProxyManagerUi();
  saveSettings();

  if (savedProxy?.assignmentError) {
    log(`Proxy saved unassigned: ${savedProxy.assignmentError}`, 'warn');
    return;
  }

  log('Proxy saved.', 'success');
}

function createProxyAssignmentSelect(proxy, assignedAccountId, accountProxyMap) {
  const select = document.createElement('select');
  select.className = 'batch-select';

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Unassigned';
  select.appendChild(empty);

  getAssignableProxyAccounts(assignedAccountId).forEach((account) => {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = account.label;
    select.appendChild(option);
  });

  select.value = assignedAccountId || '';
  select.addEventListener('change', async () => {
    await updateProxyAssignment(proxy, select.value, getAssignedAccountForProxy(proxy, accountProxyMap));
  });

  return select;
}

function renderProxyList(proxies = [], accountProxyMap = {}) {
  proxyList.innerHTML = '';

  if (!proxies.length) {
    const empty = document.createElement('div');
    empty.className = 'account-empty';
    empty.textContent = 'No proxies added yet.';
    proxyList.appendChild(empty);
    return;
  }

  proxies.forEach((proxy) => {
    const assignedAccountId = getAssignedAccountForProxy(proxy, accountProxyMap);
    const assignmentRank = getProxyAssignmentRank(proxy, assignedAccountId, accountProxyMap);
    const status = getProxyStatus(proxy);
    const card = document.createElement('div');
    card.className = 'proxy-card';

    const head = document.createElement('div');
    head.className = 'proxy-card-head';

    const title = document.createElement('div');
    title.className = 'proxy-card-title';
    title.textContent = `${proxy.host}:${proxy.port}`;

    const badge = document.createElement('span');
    badge.className = `proxy-status ${getProxyStatusClass(status)}`;
    badge.textContent = status;
    head.append(title, badge);

    const meta = document.createElement('div');
    meta.className = 'proxy-card-meta';
    const location = [proxy.city, proxy.country].filter(Boolean).join(', ') || 'Location not set';
    const lastIp = proxy.lastKnownIp ? `IP ${proxy.lastKnownIp}` : 'IP unverified';
    const latency = proxy.latency ? `Latency ${proxy.latency}` : 'Latency unknown';
    meta.textContent = `${proxy.type || 'http'} | ${location} | ${lastIp} | ${latency}`;

    const assignment = createProxyAssignmentSelect(proxy, assignedAccountId, accountProxyMap);
    const assignmentMeta = document.createElement('div');
    assignmentMeta.className = 'proxy-card-assignment';
    assignmentMeta.textContent = assignedAccountId
      ? `${getProxyAssignmentLabel(assignmentRank)} for ${getProxyAccountLabel(assignedAccountId)}`
      : `Unassigned. Each account can use up to ${getMaxAccountProxies()} proxies.`;

    const actions = document.createElement('div');
    actions.className = 'proxy-card-actions';

    const testButton = document.createElement('button');
    testButton.className = 'btn settings-action';
    testButton.textContent = 'Test';
    testButton.addEventListener('click', () => testProxy(proxy.id, testButton));

    const toggleButton = document.createElement('button');
    toggleButton.className = 'btn settings-action';
    toggleButton.textContent = proxy.enabled === false ? 'Enable' : 'Disable';
    toggleButton.addEventListener('click', () => toggleProxyEnabled(proxy));

    const removeButton = document.createElement('button');
    removeButton.className = 'btn settings-action danger';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeProxy(proxy.id));

    actions.append(testButton, toggleButton, removeButton);
    card.append(head, meta, assignment, assignmentMeta, actions);
    proxyList.appendChild(card);
  });
}

async function updateProxyAssignment(proxy, nextAccountId, previousAccountId) {
  if (!window.ProxyStorage) return;
  let result;

  if (nextAccountId) {
    result = await window.ProxyStorage.setAccountProxyAssignment(nextAccountId, proxy.id);
  } else {
    result = typeof window.ProxyStorage.removeProxyAssignment === 'function'
      ? await window.ProxyStorage.removeProxyAssignment(proxy.id)
      : await window.ProxyStorage.setAccountProxyAssignment(previousAccountId, '');
  }

  if (result && result.ok === false) {
    await loadProxyManagerUi();
    log(result.error || 'Proxy assignment failed.', 'error');
    return;
  }

  await loadProxyManagerUi();
  log(nextAccountId ? 'Proxy assignment updated.' : 'Proxy unassigned.', 'success');
}

async function toggleProxyEnabled(proxy) {
  if (!window.ProxyStorage) return;
  const willEnable = proxy.enabled === false;

  await window.ProxyStorage.updateProxy(proxy.id, {
    enabled: willEnable,
  });

  if (!willEnable && currentState !== 'running' && currentState !== 'paused') {
    await sendRuntimeMessage({ action: 'CLEAR_PROXY' });
  }

  await loadProxyManagerUi();
  log(willEnable ? 'Proxy enabled.' : 'Proxy disabled.', 'success');
}

async function removeProxy(proxyId) {
  if (!window.ProxyStorage) return;
  await window.ProxyStorage.removeProxy(proxyId);

  if (currentState !== 'running' && currentState !== 'paused') {
    await sendRuntimeMessage({ action: 'CLEAR_PROXY' });
  }

  await loadProxyManagerUi();
  log('Proxy removed.', 'success');
}

async function testProxy(proxyId, button) {
  button.disabled = true;
  button.textContent = 'Testing';
  log('Testing proxy...', 'info');

  try {
    const result = await sendRuntimeMessage({ action: 'TEST_PROXY', proxyId });
    await loadProxyManagerUi();

    if (result.ok) {
      log(`Proxy online: ${result.ip || 'IP verified'}`, 'success');
    } else {
      log(`Proxy test failed: ${result.error || result.status || 'Unknown error'}`, 'error');
    }
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = 'Test';
    }
  }
}

async function loadProxyManagerUi() {
  if (!window.ProxyStorage) return;

  const [proxySettings, proxies, accountProxyMap] = await Promise.all([
    window.ProxyStorage.getProxySettings(),
    window.ProxyStorage.getProxies(),
    window.ProxyStorage.getAccountProxyMap(),
  ]);

  proxyManagerToggle.checked = Boolean(proxySettings.enabled);
  proxyFallbackToggle.checked = Boolean(proxySettings.allowFallback);
  populateProxyAccountOptions();
  renderProxyList(proxies, accountProxyMap);
}

async function ensureContentScript(tabId) {
  const ping = await chrome.tabs.sendMessage(tabId, { action: 'PING' }).catch(() => null);
  if (ping && ping.ok) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      'linkProcessor.js',
      'replyEngine.js',
      'processedEmailManager.js',
      'providers/gmailProvider.js',
      'providers/yahooProvider.js',
      'providers/aolProvider.js',
      'providers/outlookProvider.js',
      'content.js'
    ]
  });
}

async function refreshAccounts() {
  const tab = await checkGmailAndShowAlert();
  if (!tab) return;

  try {
    await ensureContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'DISCOVER_ACCOUNTS' });
    const accounts = response && Array.isArray(response.accounts) ? response.accounts : [];
    const selected = getSelectedAccounts();
    const selectedAccounts = selected.length ? selected : accounts.map(account => account.id);

    renderAccounts(accounts, selectedAccounts);
    chrome.storage.local.set({ discoveredAccounts: accounts, selectedAccounts });
    log(accounts.length ? `Detected ${accounts.length} account(s)` : 'No accounts detected', accounts.length ? 'success' : 'warn');
  } catch (error) {
    log(`Account detection failed: ${error.message}`, 'error');
  }
}

function saveReplyTemplates() {
  const templates = replyTemplatesInput.value
    .split('\n')
    .map(template => template.trim())
    .filter(Boolean);

  chrome.storage.local.set({ replyTemplates: templates }, () => {
    log(templates.length ? `Saved ${templates.length} reply template(s)` : 'Custom templates cleared. Defaults will be used.', 'success');
  });
}

function clearProcessedHistory() {
  chrome.runtime.sendMessage({ action: 'CLEAR_PROCESSED_HISTORY' }, response => {
    if (chrome.runtime.lastError || !response || !response.ok) {
      log(`Failed to clear processed history: ${chrome.runtime.lastError?.message || response?.error || 'Unknown error'}`, 'error');
      return;
    }

    log('Processed history cleared. Unread emails can be processed again.', 'success');
  });
}

//  Gmail / Yahoo / Aol Tab Detection 
async function getMailTab() {

  const tabs = await chrome.tabs.query({});

  return tabs.find(tab => {

    if (!tab.url) return false;

    return (
      tab.url.includes('mail.google.com') ||
      tab.url.includes('mail.yahoo.com') ||
      tab.url.includes('mail.aol.com')  ||
      tab.url.includes('outlook.live.com') ||
      tab.url.includes('mail.proton.me') ||
      tab.url.includes('mail.zoho.com')
    );
  }) || null;
}

async function checkGmailAndShowAlert() {
  const tab = await getMailTab();
  gmailAlert.style.display = tab ? 'none' : 'flex';
  return tab;
}

//  Button Handlers 
btnStart.addEventListener('click', async () => {
  runtimeSeconds = 0;
  statRuntime.textContent = '0:00';

  setStatus('running', 'Running');
  log('Opening mail tab and starting automation...', 'success');

  const settings = getCurrentSettings();
  if (settings.enableAccountSwitching && settings.selectedAccounts.length === 0) {
    await refreshAccounts();
    settings.selectedAccounts = getSelectedAccounts();
  }

  chrome.runtime.sendMessage({ action: 'START_AUTOMATION', settings }, response => {
    if (chrome.runtime.lastError || !response || !response.ok) {
      const message = chrome.runtime.lastError?.message || response?.error || 'Unknown error';
      setStatus('idle', 'Idle');
      log(`Start failed: ${message}`, 'error');
      return;
    }

    gmailAlert.style.display = 'none';
    log('Automation started', 'success');
  });
});

btnPause.addEventListener('click', async () => {
  const tab = await getMailTab();
  if (!tab) return;

  if (currentState === 'running') {
    setStatus('paused', 'Paused');
    log('Automation paused', 'warn');
    chrome.tabs.sendMessage(tab.id, { action: 'PAUSE' });
    chrome.storage.local.set({ automationState: 'paused' });
  } else if (currentState === 'paused') {
    setStatus('running', 'Running');
    log('Automation resumed', 'success');
    chrome.tabs.sendMessage(tab.id, { action: 'RESUME' });
    chrome.storage.local.set({ automationState: 'running' });
    btnPause.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Pause`;
    return;
  }

  btnPause.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Resume`;
});

btnStop.addEventListener('click', async () => {
  const tab = await getMailTab();
  setStatus('stopped', 'Stopped');
  log('Automation stopped', 'error');
  btnPause.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Pause`;
  if (tab) chrome.tabs.sendMessage(tab.id, { action: 'STOP' });
  chrome.storage.local.set({ automationState: 'stopped' });
  sendRuntimeMessage({ action: 'CLEAR_PROXY' }).catch(() => null);
  // Re-enable start after stopping
  setTimeout(() => {
    setStatus('idle', 'Idle');
  }, 2000);
});

//  Listen for messages from content.js 
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'EMAIL_OPENED') {
    const count = msg.count || 0;
    updateStat(statOpened, count);
    log(`Opened: ${msg.subject || 'Email #' + count}`, 'success', { persist: false });
    chrome.storage.local.set({ emailsOpened: count });
  }

  if (msg.type === 'UNREAD_COUNT') {
    statUnread.textContent = msg.count;
  }

  if (msg.type === 'DONE') {
    setStatus('idle', 'Idle');
    chrome.storage.local.set({ automationState: 'idle' });
    log('All unread emails processed ✓', 'success');
    btnPause.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Pause`;
  }

  if (msg.type === 'ERROR') {
    setStatus('idle', 'Idle');
    chrome.storage.local.set({ automationState: 'idle' });
    log('Error: ' + msg.message, 'error', { persist: false });
  }

  if (msg.type === 'LOG') {
    log(msg.message, msg.level || 'info', { persist: false });
  }
});

//  Init 
document.addEventListener('DOMContentLoaded', async () => {
  loadActivityLogs();
  loadSettings();
  await checkGmailAndShowAlert();
  setStatus('idle', 'Idle');
  log('Extension ready. Choose a provider and click Start.', 'info', { persist: false });
});
