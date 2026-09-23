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
const providerCheckboxGroup = $('providerCheckboxGroup');
const espEnabledToggle = $('espEnabledToggle');
const espLookbackInput = $('espLookbackInput');
const espProviderSelect = $('espProviderSelect');
const espNameInput = $('espNameInput');
const espCredentialFields = $('espCredentialFields');
const espProviderNote = $('espProviderNote');
const btnEspAdd = $('btnEspAdd');
const btnEspSyncAll = $('btnEspSyncAll');
const espList = $('espList');
const espEmpty = $('espEmpty');
const btnExportLogs = $('btnExportLogs');
const btnCopyLogs = $('btnCopyLogs');
const btnClearLogs = $('btnClearLogs');
const btnLoadOlderLogs = $('btnLoadOlderLogs');
const logLevelFilter = $('logLevelFilter');
const logSearchInput = $('logSearchInput');
const logProxyOnlyToggle = $('logProxyOnlyToggle');
const logProxyOnlyField = $('logProxyOnlyField');
const logFromDate = $('logFromDate');
const logToDate = $('logToDate');
const btnClearLogFilters = $('btnClearLogFilters');
const readTimeSlider  = $('readTimeSlider');
const backDelaySlider = $('backDelaySlider');
const readTimeVal     = $('readTimeVal');
const backDelayVal    = $('backDelayVal');
const autoRefreshToggle = $('autoRefreshToggle');
const continuousModeToggle = $('continuousModeToggle');
const autoStartToggle = $('autoStartToggle');
const continuousDelayMinutesInput = $('continuousDelayMinutesInput');
const randomEmailOpeningToggle = $('randomEmailOpeningToggle');
const retryEmailOpeningToggle = $('retryEmailOpeningToggle');
const manualActivityPauseToggle = $('manualActivityPauseToggle');
const gmailPromotionsToggle = $('gmailPromotionsToggle');
const gmailPromotionsPageLimitInput = $('gmailPromotionsPageLimitInput');
const gmailInboxPageLimitInput = $('gmailInboxPageLimitInput');
const maxEmailsInput = $('maxEmailsInput');
const manualStartDelayInput = $('manualStartDelayInput');
const processFromDateInput = $('processFromDate');
const processToDateInput = $('processToDate');
const btnClearProcessDates = $('btnClearProcessDates');
const enableAccountSwitchingToggle = $('enableAccountSwitchingToggle');
const accountSelectionRow = $('accountSelectionRow');
const accountList = $('accountList');
const btnSelectAllAccounts = $('btnSelectAllAccounts');
const btnRefreshAccounts = $('btnRefreshAccounts');
const btnDeepScanGmail = $('btnDeepScanGmail');
const proxyManagerToggle = $('proxyManagerToggle');
const proxyFallbackToggle = $('proxyFallbackToggle');
const proxyApplyModeSelect = $('proxyApplyModeSelect');
const globalProxyRow = $('globalProxyRow');
const globalProxySelect = $('globalProxySelect');
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
  selectedProviders: ['gmail'],
  manualStartDelaySeconds: 30,
  // Empty means no date limit - every unread email is processed.
  processFromDate: '',
  processToDate: '',
  readTime: 6,
  backDelay: 2,
  autoRefresh: true,
  autoStartOnBrowserStartup: true,
  enableContinuousMode: false,
  continuousDelayMinutes: 10,
  randomEmailOpening: false,
  retryEmailOpening: true,
  manualActivityPause: true,
  processGmailPromotions: true,
  gmailPromotionsPageLimit: 2,
  gmailInboxPageLimit: 2,
  maxEmails: 5,
  maxLinksPerEmail: 1,
  enableLinkOpening: true,
  enableAutoReply: false,
  enableProcessedTracking: false,
  reprocessingMode: 'never',
  enableAccountSwitching: false,
  enableProxyManager: false,
  allowProxyFallback: false,
  proxyApplyMode: 'off',
  globalProxyId: '',
  selectedAccounts: []
};


const PROVIDER_OPTIONS = [
  { id: 'gmail', label: 'Gmail' },
  { id: 'yahoo', label: 'Yahoo' },
  { id: 'aol', label: 'AOL' },
  { id: 'outlook', label: 'Outlook' },
  { id: 'proton', label: 'Proton' },
];

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
let accountLabelOverrides = {};


let runtimeInterval = null;
let runtimeSeconds  = 0;
let currentState    = 'idle'; // idle | running | paused | stopped
const LOG_PAGE_SIZE = 100;
const MAX_RENDERED_LOG_ENTRIES = 400;
let logCursor = null;
let logHasMore = false;
let activeLogFilters = { level: 'all', search: '', fromTime: undefined, toTime: undefined };
let logSearchDebounce = null;

//  Helpers 
function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

function formatLogTime(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const dd = date.getDate().toString().padStart(2, '0');
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const hm = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
  // Always show the date so date-filtered entries are unambiguous.
  return `${dd}/${mm} ${hm}`;
}

function formatLogTooltip(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function buildLogEntryElement(msg, type = 'info', timestamp = Date.now()) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  // Full timestamp + message on hover (message may be clamped in the UI).
  entry.title = `${formatLogTooltip(timestamp)}\n${msg}`;
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = formatLogTime(timestamp);
  const message = document.createElement('span');
  message.className = 'log-msg';
  message.textContent = msg;
  entry.append(time, message);
  return entry;
}

function dateInputToFromTime(value) {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.getTime();
}

function dateInputToToTime(value) {
  if (!value) return undefined;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d.getTime();
}

function getLogFilters() {
  return {
    level: logLevelFilter ? logLevelFilter.value || 'all' : 'all',
    search: logSearchInput ? logSearchInput.value.trim().toLowerCase() : '',
    fromTime: dateInputToFromTime(logFromDate ? logFromDate.value : ''),
    toTime: dateInputToToTime(logToDate ? logToDate.value : ''),
    proxyOnly: Boolean(logProxyOnlyToggle && logProxyOnlyToggle.checked)
  };
}

function logFiltersAreActive(f = activeLogFilters) {
  return (f.level && f.level !== 'all') || Boolean(f.search) ||
    Number.isFinite(f.fromTime) || Number.isFinite(f.toTime) || Boolean(f.proxyOnly);
}

function liveEntryMatchesActiveFilter(type, timestamp, msg, proxy = null) {
  const f = activeLogFilters;
  if (!logFiltersAreActive(f)) return true;
  if (f.level && f.level !== 'all' && (type || 'info') !== f.level) return false;
  if (Number.isFinite(f.fromTime) && timestamp < f.fromTime) return false;
  if (Number.isFinite(f.toTime) && timestamp > f.toTime) return false;
  if (f.proxyOnly && !proxy?.id) return false;
  if (f.search && !String(msg || '').toLowerCase().includes(f.search)) return false;
  return true;
}

function renderLogEntry(msg, type = 'info', timestamp = Date.now(), proxy = null) {
  // When a filter is active, don't let non-matching live entries pollute the view.
  if (!liveEntryMatchesActiveFilter(type, timestamp, msg, proxy)) return;
  logEmpty.style.display = 'none';
  logScroll.prepend(buildLogEntryElement(msg, type, timestamp, proxy));
  while (logScroll.children.length > MAX_RENDERED_LOG_ENTRIES) {
    logScroll.removeChild(logScroll.lastChild);
  }
}

function renderLogEntryBottom(msg, type = 'info', timestamp = Date.now(), proxy = null) {
  logEmpty.style.display = 'none';
  logScroll.append(buildLogEntryElement(msg, type, timestamp, proxy));
}

function persistLogEntry(msg, type = 'info') {
  // Single writer: the background service worker owns activity-log storage.
  chrome.runtime.sendMessage({
    action: 'APPEND_ACTIVITY_LOG',
    message: String(msg),
    level: type
  }).catch(() => {});
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

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function updateLoadOlderLogsButton() {
  if (!btnLoadOlderLogs) return;
  btnLoadOlderLogs.hidden = !logHasMore;
}

function loadActivityLogs() {
  activeLogFilters = getLogFilters();
  sendRuntimeMessage({
    action: 'GET_ACTIVITY_LOG',
    limit: LOG_PAGE_SIZE,
    ...activeLogFilters
  }).then((result) => {
    const entries = result?.ok && Array.isArray(result.entries) ? result.entries : [];
    logCursor = result?.cursor ?? null;
    logHasMore = Boolean(result?.hasMore);
    updateLoadOlderLogsButton();

    logScroll.innerHTML = '';
    logScroll.append(logEmpty);
    if (!entries.length) {
      logEmpty.textContent = logFiltersAreActive()
        ? 'No logs match the current filter.'
        : 'No activity yet. Start the automation.';
      logEmpty.style.display = '';
      return;
    }

    entries.forEach((entry) => {
      renderLogEntry(entry.message, entry.level || 'info', entry.time || Date.now(), entry.proxy || null);
    });
  });
}

function applyLogFilters() {
  logCursor = null;
  logHasMore = false;
  loadActivityLogs();
}

function clearLogFilters() {
  if (logLevelFilter) logLevelFilter.value = 'all';
  if (logSearchInput) logSearchInput.value = '';
  if (logProxyOnlyToggle) logProxyOnlyToggle.checked = false;
  if (logFromDate) logFromDate.value = '';
  if (logToDate) logToDate.value = '';
  applyLogFilters();
}

async function loadOlderLogs() {
  if (!logHasMore || !Number.isFinite(logCursor)) return;

  btnLoadOlderLogs.disabled = true;
  try {
    const result = await sendRuntimeMessage({
      action: 'GET_ACTIVITY_LOG',
      cursor: logCursor,
      limit: LOG_PAGE_SIZE,
      ...activeLogFilters
    });
    if (!result?.ok || !Array.isArray(result.entries)) return;

    [...result.entries].reverse().forEach((entry) => {
      renderLogEntryBottom(entry.message, entry.level || 'info', entry.time || Date.now(), entry.proxy || null);
    });
    logCursor = result.cursor ?? logCursor;
    logHasMore = Boolean(result.hasMore);
  } finally {
    btnLoadOlderLogs.disabled = false;
    updateLoadOlderLogsButton();
  }
}

async function clearActivityLogs() {
  btnClearLogs.disabled = true;
  try {
    const result = await sendRuntimeMessage({ action: 'CLEAR_ACTIVITY_LOG' });
    if (!result?.ok) {
      log(`Clear logs failed: ${result?.error || 'Unknown error'}`, 'error', { persist: false });
      return;
    }

    logScroll.innerHTML = '';
    logScroll.append(logEmpty);
    logEmpty.textContent = 'No activity yet. Start the automation.';
    logEmpty.style.display = '';
    logCursor = null;
    logHasMore = false;
    updateLoadOlderLogsButton();
  } finally {
    btnClearLogs.disabled = false;
  }
}

async function fetchFilteredLogText() {
  const result = await sendRuntimeMessage({
    action: 'GET_ACTIVITY_LOG',
    limit: 1000000,
    ...activeLogFilters
  });
  const entries = result?.ok && Array.isArray(result.entries) ? result.entries : [];
  const lines = entries.map((entry) => {
    const stamp = new Date(entry.time || 0).toLocaleString();
    return `[${stamp}] [${String(entry.level || 'info').toUpperCase()}] ${entry.message}`;
  });
  return { count: entries.length, text: lines.join('\n') };
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    // Fall through to the legacy path below.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch (error) {
    return false;
  }
}

async function copyActivityLogs() {
  if (!btnCopyLogs) return;
  btnCopyLogs.disabled = true;
  const originalText = btnCopyLogs.textContent;
  try {
    const { count, text } = await fetchFilteredLogText();
    if (!count) {
      log('No logs to copy', 'warn', { persist: false });
      return;
    }

    const copied = await copyTextToClipboard(text);
    if (copied) {
      btnCopyLogs.textContent = 'Copied!';
      log(`Copied ${count} log entries to clipboard`, 'success', { persist: false });
      setTimeout(() => { btnCopyLogs.textContent = originalText; }, 2000);
    } else {
      log('Copy failed. Use Export instead.', 'error', { persist: false });
    }
  } finally {
    btnCopyLogs.disabled = false;
  }
}

async function exportActivityLogs() {
  btnExportLogs.disabled = true;
  try {
    const { count, text } = await fetchFilteredLogText();
    if (!count) {
      log('No logs to export', 'warn', { persist: false });
      return;
    }

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `email-automate-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    log(`Exported ${count} log entries`, 'success', { persist: false });
  } finally {
    btnExportLogs.disabled = false;
  }
}

// Reads whether a continuous cycle is armed and shows the honest state. Every
// place that used to hardcode setStatus('idle', 'Idle') after a run ends should
// call this instead, otherwise the pill claims nothing is happening while the
// loop is about to fire again.
function applyIdleStatus() {
  chrome.storage.local.get(['continuousModeActive', 'continuousNextRunAt'], (data) => {
    if (!data.continuousModeActive) {
      setStatus('idle', 'Idle');
      return;
    }

    const nextRunAt = Number(data.continuousNextRunAt) || 0;
    const minutes = nextRunAt ? Math.max(0, Math.round((nextRunAt - Date.now()) / 60000)) : 0;
    setStatus('scheduled', minutes > 0 ? `Next in ${minutes}m` : 'Scheduled');
  });
}

function setStatus(state, label) {
  currentState = state;
  statusLabel.textContent = label;
  statusPill.className = 'status-pill ' + state;

  btnStart.disabled  = (state === 'running');
  btnPause.disabled  = (state === 'idle' || state === 'stopped' || state === 'scheduled');
  // 'scheduled' means nothing is running but continuous mode will start a cycle
  // shortly. Stop has to stay reachable there — it is the only way to cancel the
  // loop, and it used to be greyed out because the pill just said "Idle".
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

const PAUSE_ICON_HTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Pause';
const RESUME_ICON_HTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Resume';

// Restore the real automation state when the popup (re)opens, so Stop/Pause
// stay usable while automation is still running in the background.
async function restoreAutomationState() {
  // Ask the background to drop state left behind by a run whose tab is gone,
  // otherwise the pill below would show "Running" for an automation that ended
  // when its mail tab was closed.
  await sendRuntimeMessage({ action: 'RECONCILE_AUTOMATION_STATE' }).catch(() => null);

  return new Promise((resolve) => {
    chrome.storage.local.get(['automationState', 'providerAutomationStates', 'automationStartedAt', 'continuousModeActive', 'continuousNextRunAt'], (data) => {
      const providerStates = data.providerAutomationStates && typeof data.providerAutomationStates === 'object'
        ? data.providerAutomationStates
        : {};
      const anyActive = Object.values(providerStates).some(s => s === 'running' || s === 'paused');

      let state = data.automationState || 'idle';
      if (anyActive && state !== 'paused') state = 'running';

      if (state !== 'running' && state !== 'paused' && data.continuousModeActive) {
        state = 'scheduled';
      }

      if (state === 'running' || state === 'paused') {
        if (Number.isFinite(data.automationStartedAt)) {
          runtimeSeconds = Math.max(0, Math.floor((Date.now() - data.automationStartedAt) / 1000));
          statRuntime.textContent = formatTime(runtimeSeconds);
        }
        setStatus(state, state === 'paused' ? 'Paused' : 'Running');
        btnPause.innerHTML = state === 'paused' ? RESUME_ICON_HTML : PAUSE_ICON_HTML;
      } else {
        applyIdleStatus();
      }

      resolve(state);
    });
  });
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

function validateGmailPromotionsPageLimit(value) {
  const parsed = parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_SETTINGS.gmailPromotionsPageLimit;
  }

  if (parsed > 10) {
    return 10;
  }

  return parsed;
}

function validateGmailInboxPageLimit(value) {
  const parsed = parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_SETTINGS.gmailInboxPageLimit;
  }

  if (parsed > 15) {
    return 15;
  }

  return parsed;
}

function validateContinuousDelayMinutes(value) {
  const parsed = parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  if (parsed > 240) {
    return 240;
  }

  return parsed;
}

function getProviderLabel(provider = '') {
  return PROVIDER_OPTIONS.find(item => item.id === provider)?.label || provider || 'Mail';
}

function getProviderCheckboxes() {
  return Array.from(providerCheckboxGroup.querySelectorAll('input[name="selectedProvider"]'));
}

function normalizeSelectedProviders(providers = []) {
  const allowed = new Set(PROVIDER_OPTIONS.map(item => item.id));
  const seen = new Set();
  const selected = [];

  (Array.isArray(providers) ? providers : [providers]).forEach((provider) => {
    const safeProvider = String(provider || '').trim();
    if (!allowed.has(safeProvider) || seen.has(safeProvider)) return;
    seen.add(safeProvider);
    selected.push(safeProvider);
  });

  return selected.length ? selected : [DEFAULT_SETTINGS.selectedProvider];
}

function getSelectedProviders() {
  const selected = getProviderCheckboxes()
    .filter(input => input.checked)
    .map(input => input.value);

  return normalizeSelectedProviders(selected.length ? selected : [providerSelect.value]);
}

function setSelectedProviders(providers = []) {
  const selected = normalizeSelectedProviders(providers);
  const selectedSet = new Set(selected);

  getProviderCheckboxes().forEach((input) => {
    input.checked = selectedSet.has(input.value);
  });

  providerSelect.value = selected[0] || DEFAULT_SETTINGS.selectedProvider;
}

function getAccountProviderId(account = {}) {
  return account.provider || String(account.id || '').split(':')[0] || '';
}

function filterAccountsByProviders(accounts = [], providers = getSelectedProviders()) {
  const selected = new Set(normalizeSelectedProviders(providers));
  return (Array.isArray(accounts) ? accounts : []).filter(account => selected.has(getAccountProviderId(account)));
}

function mergeAccountLists(accounts = []) {
  const byId = new Map();

  (Array.isArray(accounts) ? accounts : []).forEach((account) => {
    if (!account?.id) return;
    byId.set(account.id, account);
  });

  return Array.from(byId.values());
}

async function getCachedAccountsForProviders(providers = getSelectedProviders()) {
  const stored = await getStorage(['discoveredAccounts']);
  return filterAccountsByProviders(
    Array.isArray(stored.discoveredAccounts) ? stored.discoveredAccounts : [],
    providers
  );
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeAccountLabelOverrides(value = {}) {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((overrides, [accountId, label]) => {
    const safeAccountId = String(accountId || '').trim();
    const safeLabel = String(label || '').trim();

    if (safeAccountId && safeLabel) {
      overrides[safeAccountId] = safeLabel.slice(0, 100);
    }

    return overrides;
  }, {});
}

function applyAccountLabelOverrides(accounts = []) {
  return (Array.isArray(accounts) ? accounts : [])
    .filter(account => account?.id)
    .map((account) => {
      const detectedLabel = account.detectedLabel || account.label || account.id;
      const override = accountLabelOverrides[account.id];

      return {
        ...account,
        detectedLabel,
        label: override || detectedLabel,
      };
    });
}

function getFallbackAccountLabel(account, provider, index) {
  return account.label || account.detectedLabel || `${getProviderLabel(provider)} Account ${index + 1}`;
}

function persistAccountSelection(accounts = knownAccounts) {
  const selectedIds = new Set(getSelectedAccounts());
  const selectedAccounts = accounts
    .filter(account => selectedIds.has(account.id))
    .map(account => account.id);

  chrome.storage.local.set({
    discoveredAccounts: accounts,
    selectedAccounts: selectedAccounts.length ? selectedAccounts : accounts.map(account => account.id),
    accountLabelOverrides,
  });
}

function saveAccountLabelOverride(accountId, nextLabel) {
  const safeAccountId = String(accountId || '').trim();
  const safeLabel = String(nextLabel || '').trim().slice(0, 100);

  if (!safeAccountId) return;

  if (safeLabel) {
    accountLabelOverrides[safeAccountId] = safeLabel;
  } else {
    delete accountLabelOverrides[safeAccountId];
  }

  const selectedAccounts = getSelectedAccounts();
  const nextAccounts = applyAccountLabelOverrides(knownAccounts.map(account => {
    if (account.id !== safeAccountId) return account;

    const detectedLabel = account.detectedLabel || account.label || account.id;
    return {
      ...account,
      detectedLabel,
      label: safeLabel || detectedLabel,
    };
  }));

  renderAccounts(nextAccounts, selectedAccounts);
  persistAccountSelection(nextAccounts);

  if (window.ProxyStorage) {
    loadProxyManagerUi();
  }

  log(safeLabel ? 'Account label saved.' : 'Account label reset.', 'success');
}

function removeUnselectedProviderAccountsFromUi({ persist = false } = {}) {
  const filteredAccounts = applyAccountLabelOverrides(filterAccountsByProviders(knownAccounts));
  const filteredIds = new Set(filteredAccounts.map(account => account.id));
  const selectedAccounts = getSelectedAccounts().filter(accountId => filteredIds.has(accountId));
  const nextSelectedAccounts = selectedAccounts.length
    ? selectedAccounts
    : filteredAccounts.map(account => account.id);

  renderAccounts(filteredAccounts, nextSelectedAccounts);

  if (persist) {
    chrome.storage.local.set({
      discoveredAccounts: filteredAccounts,
      selectedAccounts: nextSelectedAccounts,
      accountLabelOverrides,
    });
  }
}

function getProxyApplyMode() {
  if (!proxyManagerToggle.checked) return 'off';
  const mode = proxyApplyModeSelect.value;
  return mode === 'global' || mode === 'perAccount' ? mode : 'perAccount';
}

function setProxyApplyMode(mode = 'off') {
  const safeMode = mode === 'global' || mode === 'perAccount' ? mode : 'off';
  proxyApplyModeSelect.value = safeMode;
  proxyManagerToggle.checked = safeMode !== 'off';
  globalProxyRow.style.display = safeMode === 'global' ? 'flex' : 'none';
}

function syncProxyModeFromToggle() {
  if (!proxyManagerToggle.checked) {
    setProxyApplyMode('off');
    return;
  }

  if (proxyApplyModeSelect.value === 'off') {
    setProxyApplyMode('perAccount');
    return;
  }

  setProxyApplyMode(proxyApplyModeSelect.value);
}

function prefixProviderMessage(message = '', provider = '') {
  if (!provider || /^\[[^\]]+\]/.test(message)) return message;
  return `[${getProviderLabel(provider)}] ${message}`;
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

providerSelect.addEventListener('change', () => {
  setSelectedProviders([providerSelect.value || DEFAULT_SETTINGS.selectedProvider]);
  removeUnselectedProviderAccountsFromUi({ persist: true });
  saveSettings();
});
getProviderCheckboxes().forEach((input) => {
  input.addEventListener('change', () => {
    setSelectedProviders(getSelectedProviders());
    removeUnselectedProviderAccountsFromUi({ persist: true });
    saveSettings();
  });
});
autoRefreshToggle.addEventListener('change', saveSettings);
autoStartToggle.addEventListener('change', () => {
  saveSettings();
  log(
    autoStartToggle.checked
      ? 'Auto-start on: this profile will start automation by itself 30-60s after Chrome opens it.'
      : 'Auto-start off.',
    'info'
  );
});
continuousModeToggle.addEventListener('change', async () => {
  saveSettings();

  if (!continuousModeToggle.checked) {
    await sendRuntimeMessage({ action: 'STOP_CONTINUOUS_MODE' });
    log('Continuous mode disabled.', 'info');
  }
});
continuousDelayMinutesInput.addEventListener('input', () => {
  continuousDelayMinutesInput.value = validateContinuousDelayMinutes(continuousDelayMinutesInput.value);
  saveSettings();
});
randomEmailOpeningToggle.addEventListener('change', saveSettings);
retryEmailOpeningToggle.addEventListener('change', saveSettings);
manualActivityPauseToggle.addEventListener('change', saveSettings);
gmailPromotionsToggle.addEventListener('change', saveSettings);
gmailInboxPageLimitInput.addEventListener('input', () => {
  gmailInboxPageLimitInput.value = validateGmailInboxPageLimit(gmailInboxPageLimitInput.value);
  saveSettings();
});
gmailPromotionsPageLimitInput.addEventListener('input', () => {
  gmailPromotionsPageLimitInput.value = validateGmailPromotionsPageLimit(gmailPromotionsPageLimitInput.value);
  saveSettings();
});
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
  syncProxyModeFromToggle();
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
proxyApplyModeSelect.addEventListener('change', () => {
  setProxyApplyMode(proxyApplyModeSelect.value);
  saveSettings();
});
globalProxySelect.addEventListener('change', saveSettings);
btnAddProxy.addEventListener('click', addProxyFromForm);
reprocessingModeSelect.addEventListener('change', () => {
  if (reprocessingModeSelect.value === 'unread') {
    log('Warning: Reprocess If Marked Unread may process the same email multiple times.', 'warn');
  }
  saveSettings();
});

btnSaveTemplates.addEventListener('click', saveReplyTemplates);
btnClearProcessedHistory.addEventListener('click', clearProcessedHistory);
btnExportLogs.addEventListener('click', exportActivityLogs);
if (btnCopyLogs) btnCopyLogs.addEventListener('click', copyActivityLogs);
btnClearLogs.addEventListener('click', clearActivityLogs);
btnLoadOlderLogs.addEventListener('click', loadOlderLogs);
if (logLevelFilter) logLevelFilter.addEventListener('change', applyLogFilters);
if (logProxyOnlyToggle) logProxyOnlyToggle.addEventListener('change', applyLogFilters);

// Email date range. Saved like any other setting; a running automation picks
// the new range up on its next pass.
function onProcessDateChanged() {
  const { from, to } = getProcessDateRange();
  saveSettings();

  if (!from && !to) {
    log('Date range cleared. All unread emails will be processed.', 'info');
    return;
  }

  const range = from && to
    ? (from === to ? from : `${from} to ${to}`)
    : (from ? `from ${from}` : `up to ${to}`);
  log(`Date range set: only emails ${range} will be processed.`, 'success');
}

if (manualStartDelayInput) {
  manualStartDelayInput.addEventListener('change', () => {
    manualStartDelayInput.value = validateManualStartDelay(manualStartDelayInput.value);
    saveSettings();
  });
}
if (processFromDateInput) processFromDateInput.addEventListener('change', onProcessDateChanged);
if (processToDateInput) processToDateInput.addEventListener('change', onProcessDateChanged);

if (btnClearProcessDates) {
  btnClearProcessDates.addEventListener('click', () => {
    if (processFromDateInput) processFromDateInput.value = '';
    if (processToDateInput) processToDateInput.value = '';
    onProcessDateChanged();
  });
}
if (logFromDate) logFromDate.addEventListener('change', applyLogFilters);
if (logToDate) logToDate.addEventListener('change', applyLogFilters);
if (btnClearLogFilters) btnClearLogFilters.addEventListener('click', clearLogFilters);
if (logSearchInput) {
  logSearchInput.addEventListener('input', () => {
    clearTimeout(logSearchDebounce);
    logSearchDebounce = setTimeout(applyLogFilters, 300);
  });
}
btnSelectAllAccounts.addEventListener('click', selectAllRenderedAccounts);
btnRefreshAccounts.addEventListener('click', () => refreshAccounts());
btnDeepScanGmail.addEventListener('click', async () => {
  if (!getSelectedProviders().includes('gmail')) {
    log('Select Gmail before running Deep Scan Gmail.', 'warn');
    return;
  }

  btnDeepScanGmail.disabled = true;
  btnDeepScanGmail.textContent = 'Scanning Gmail';

  try {
    await refreshAccounts({
      providers: ['gmail'],
      forceDeepScan: true,
      mergeWithStored: true,
    });
  } finally {
    if (btnDeepScanGmail.isConnected) {
      btnDeepScanGmail.disabled = false;
      btnDeepScanGmail.textContent = 'Deep Scan Gmail';
    }
  }
});
btnApplyAutomationTemplate.addEventListener('click', applySelectedAutomationTemplate);
btnSaveAutomationTemplate.addEventListener('click', saveAutomationTemplate);
btnDeleteAutomationTemplate.addEventListener('click', deleteSelectedAutomationTemplate);
automationTemplateSelect.addEventListener('change', updateAutomationTemplateButtons);


function getAutomationTemplateSettingsSnapshot() {
  const settings = getCurrentSettings();
  const keysToSave = [
    'selectedProvider',
    'selectedProviders',
    'readTime',
    'backDelay',
    'autoRefresh',
    'enableContinuousMode',
    'continuousDelayMinutes',
    'randomEmailOpening',
    'retryEmailOpening',
    'manualActivityPause',
    'processGmailPromotions',
    'gmailPromotionsPageLimit',
    'gmailInboxPageLimit',
    'maxEmails',
    'maxLinksPerEmail',
    'enableLinkOpening',
    'enableAutoReply',
    'enableProcessedTracking',
    'reprocessingMode',
    'enableAccountSwitching',
    'enableProxyManager',
    'allowProxyFallback',
    'proxyApplyMode',
    'globalProxyId',
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

  setSelectedProviders(merged.selectedProviders || [merged.selectedProvider || DEFAULT_SETTINGS.selectedProvider]);
  readTimeSlider.value = merged.readTime;
  readTimeVal.textContent = merged.readTime + 's';
  backDelaySlider.value = merged.backDelay;
  backDelayVal.textContent = merged.backDelay + 's';
  autoRefreshToggle.checked = Boolean(merged.autoRefresh);
  continuousModeToggle.checked = Boolean(merged.enableContinuousMode);
  continuousDelayMinutesInput.value = validateContinuousDelayMinutes(merged.continuousDelayMinutes);
  randomEmailOpeningToggle.checked = Boolean(merged.randomEmailOpening);
  retryEmailOpeningToggle.checked = Boolean(merged.retryEmailOpening);
  manualActivityPauseToggle.checked = Boolean(merged.manualActivityPause);
  gmailPromotionsToggle.checked = merged.processGmailPromotions !== false;
  gmailPromotionsPageLimitInput.value = validateGmailPromotionsPageLimit(merged.gmailPromotionsPageLimit);
  gmailInboxPageLimitInput.value = validateGmailInboxPageLimit(merged.gmailInboxPageLimit);
  maxEmailsInput.value = validateMaxEmails(merged.maxEmails);
  if (processFromDateInput) processFromDateInput.value = normalizeProcessDate(merged.processFromDate);
  if (processToDateInput) processToDateInput.value = normalizeProcessDate(merged.processToDate);
  maxLinksPerEmailInput.value = validateMaxLinksPerEmail(merged.maxLinksPerEmail);
  enableLinkOpeningToggle.checked = Boolean(merged.enableLinkOpening);
  enableAutoReplyToggle.checked = Boolean(merged.enableAutoReply);
  enableProcessedTrackingToggle.checked = Boolean(merged.enableProcessedTracking);
  reprocessingModeSelect.value = merged.reprocessingMode || DEFAULT_SETTINGS.reprocessingMode;
  enableAccountSwitchingToggle.checked = Boolean(merged.enableAccountSwitching);
  setProxyApplyMode(merged.proxyApplyMode || (merged.enableProxyManager ? 'perAccount' : 'off'));
  proxyFallbackToggle.checked = Boolean(merged.allowProxyFallback);
  globalProxySelect.value = merged.globalProxyId || '';
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

// "YYYY-MM-DD" or "". Anything else is treated as no limit.
function validateManualStartDelay(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 30;
  return Math.min(parsed, 300);
}

function normalizeProcessDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

// A From later than To would match nothing and look like broken automation,
// so the two are swapped rather than silently yielding an empty inbox.
function getProcessDateRange() {
  let from = normalizeProcessDate(processFromDateInput ? processFromDateInput.value : '');
  let to = normalizeProcessDate(processToDateInput ? processToDateInput.value : '');

  if (from && to && from > to) {
    [from, to] = [to, from];
    if (processFromDateInput) processFromDateInput.value = from;
    if (processToDateInput) processToDateInput.value = to;
    log('Date range was reversed, so From and To have been swapped.', 'warn');
  }

  return { from, to };
}

function getCurrentSettings() {
  const maxEmails = validateMaxEmails(maxEmailsInput.value);
  const maxLinksPerEmail = validateMaxLinksPerEmail(maxLinksPerEmailInput.value);
  const gmailPromotionsPageLimit = validateGmailPromotionsPageLimit(gmailPromotionsPageLimitInput.value);
  const gmailInboxPageLimit = validateGmailInboxPageLimit(gmailInboxPageLimitInput.value);
  const continuousDelayMinutes = validateContinuousDelayMinutes(continuousDelayMinutesInput.value);
  maxEmailsInput.value = maxEmails;
  maxLinksPerEmailInput.value = maxLinksPerEmail;
  gmailPromotionsPageLimitInput.value = gmailPromotionsPageLimit;
  gmailInboxPageLimitInput.value = gmailInboxPageLimit;
  continuousDelayMinutesInput.value = continuousDelayMinutes;

  const processDates = getProcessDateRange();
  const manualStartDelaySeconds = validateManualStartDelay(
    manualStartDelayInput ? manualStartDelayInput.value : 30
  );
  if (manualStartDelayInput) manualStartDelayInput.value = manualStartDelaySeconds;

  return {
    manualStartDelaySeconds,
    processFromDate: processDates.from,
    processToDate: processDates.to,
    selectedProvider: getSelectedProviders()[0] || DEFAULT_SETTINGS.selectedProvider,
    selectedProviders: getSelectedProviders(),
    readTime: parseInt(readTimeSlider.value) || DEFAULT_SETTINGS.readTime,
    backDelay: parseInt(backDelaySlider.value) || DEFAULT_SETTINGS.backDelay,
    autoRefresh: autoRefreshToggle.checked,
    autoStartOnBrowserStartup: autoStartToggle.checked,
    enableContinuousMode: continuousModeToggle.checked,
    continuousDelayMinutes,
    randomEmailOpening: randomEmailOpeningToggle.checked,
    retryEmailOpening: retryEmailOpeningToggle.checked,
    manualActivityPause: manualActivityPauseToggle.checked,
    processGmailPromotions: gmailPromotionsToggle.checked,
    gmailPromotionsPageLimit,
    gmailInboxPageLimit,
    maxEmails,
    maxLinksPerEmail,
    enableLinkOpening: enableLinkOpeningToggle.checked,
    enableAutoReply: enableAutoReplyToggle.checked,
    enableProcessedTracking: enableProcessedTrackingToggle.checked,
    reprocessingMode: reprocessingModeSelect.value || DEFAULT_SETTINGS.reprocessingMode,
    enableAccountSwitching: enableAccountSwitchingToggle.checked,
    enableProxyManager: getProxyApplyMode() !== 'off',
    allowProxyFallback: proxyFallbackToggle.checked,
    proxyApplyMode: getProxyApplyMode(),
    globalProxyId: globalProxySelect.value || '',
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
      applyMode: settings.proxyApplyMode,
      globalProxyId: settings.globalProxyId,
    }).catch(error => log(`Proxy settings save failed: ${error.message}`, 'error'));
  }
}

function loadSettings() {
  chrome.storage.local.get([
    'selectedProvider',
    'selectedProviders',
    'manualStartDelaySeconds',
    'processFromDate',
    'processToDate',
    'readTime',
    'backDelay',
    'autoRefresh',
    'autoStartOnBrowserStartup',
    'enableContinuousMode',
    'continuousDelayMinutes',
    'randomEmailOpening',
    'retryEmailOpening',
    'manualActivityPause',
    'processGmailPromotions',
    'gmailPromotionsPageLimit',
    'gmailInboxPageLimit',
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
    'proxyApplyMode',
    'globalProxyId',
    'selectedAccounts',
    'discoveredAccounts',
    'accountLabelOverrides',
    'proxySettings',
    'proxyConfigs',
    'accountProxyMap',
    'replyTemplates',
    'automationTemplates',
    'selectedAutomationTemplate'
  ], data => {
    setSelectedProviders(
      Array.isArray(data.selectedProviders) && data.selectedProviders.length
        ? data.selectedProviders
        : [data.selectedProvider || DEFAULT_SETTINGS.selectedProvider]
    );

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
    // Machine-level preference: deliberately not part of automation templates,
    // so applying a template can never switch it on or off.
    autoStartToggle.checked = data.autoStartOnBrowserStartup !== false;
    continuousModeToggle.checked = data.enableContinuousMode !== undefined ? data.enableContinuousMode : DEFAULT_SETTINGS.enableContinuousMode;
    continuousDelayMinutesInput.value = validateContinuousDelayMinutes(
      data.continuousDelayMinutes !== undefined ? data.continuousDelayMinutes : DEFAULT_SETTINGS.continuousDelayMinutes
    );
    randomEmailOpeningToggle.checked = data.randomEmailOpening !== undefined ? data.randomEmailOpening : DEFAULT_SETTINGS.randomEmailOpening;
    retryEmailOpeningToggle.checked = data.retryEmailOpening !== undefined ? data.retryEmailOpening : DEFAULT_SETTINGS.retryEmailOpening;
    manualActivityPauseToggle.checked = data.manualActivityPause !== undefined ? data.manualActivityPause : DEFAULT_SETTINGS.manualActivityPause;
    gmailPromotionsToggle.checked = data.processGmailPromotions !== undefined ? data.processGmailPromotions : DEFAULT_SETTINGS.processGmailPromotions;
    gmailPromotionsPageLimitInput.value = validateGmailPromotionsPageLimit(
      data.gmailPromotionsPageLimit !== undefined ? data.gmailPromotionsPageLimit : DEFAULT_SETTINGS.gmailPromotionsPageLimit
    );
    gmailInboxPageLimitInput.value = validateGmailInboxPageLimit(
      data.gmailInboxPageLimit !== undefined ? data.gmailInboxPageLimit : DEFAULT_SETTINGS.gmailInboxPageLimit
    );
    if (data.emailsOpened) {
      statOpened.textContent = data.emailsOpened;
    }
    if (data.maxEmails !== undefined) {
      maxEmailsInput.value = validateMaxEmails(data.maxEmails);
    }
    // Without this the inputs render blank on every open, and because
    // getCurrentSettings reads the inputs, the next save of ANY control writes
    // those blanks back and the saved range is gone. Requesting the keys from
    // storage is not enough on its own - they have to reach the DOM.
    if (manualStartDelayInput) {
      manualStartDelayInput.value = validateManualStartDelay(
        data.manualStartDelaySeconds === undefined ? 30 : data.manualStartDelaySeconds
      );
    }
    if (processFromDateInput) {
      processFromDateInput.value = normalizeProcessDate(data.processFromDate);
    }
    if (processToDateInput) {
      processToDateInput.value = normalizeProcessDate(data.processToDate);
    }
    maxLinksPerEmailInput.value = validateMaxLinksPerEmail(
      data.maxLinksPerEmail !== undefined ? data.maxLinksPerEmail : DEFAULT_SETTINGS.maxLinksPerEmail
    );
    enableLinkOpeningToggle.checked = data.enableLinkOpening !== undefined ? data.enableLinkOpening : DEFAULT_SETTINGS.enableLinkOpening;
    enableAutoReplyToggle.checked = data.enableAutoReply !== undefined ? data.enableAutoReply : DEFAULT_SETTINGS.enableAutoReply;
    enableProcessedTrackingToggle.checked = data.enableProcessedTracking !== undefined ? data.enableProcessedTracking : DEFAULT_SETTINGS.enableProcessedTracking;
    enableAccountSwitchingToggle.checked = data.enableAccountSwitching !== undefined ? data.enableAccountSwitching : DEFAULT_SETTINGS.enableAccountSwitching;
    const proxySettings = data.proxySettings || {};
    const savedProxyEnabled = proxySettings.enabled !== undefined
      ? Boolean(proxySettings.enabled)
      : (data.enableProxyManager !== undefined ? Boolean(data.enableProxyManager) : DEFAULT_SETTINGS.enableProxyManager);
    const rawProxyMode = proxySettings.applyMode || data.proxyApplyMode || '';
    const savedProxyMode = rawProxyMode === 'global' || rawProxyMode === 'perAccount'
      ? rawProxyMode
      : (savedProxyEnabled ? 'perAccount' : 'off');
    setProxyApplyMode(savedProxyEnabled ? savedProxyMode : 'off');
    globalProxySelect.value = proxySettings.globalProxyId || data.globalProxyId || DEFAULT_SETTINGS.globalProxyId;
    proxyFallbackToggle.checked = proxySettings.allowFallback !== undefined
      ? Boolean(proxySettings.allowFallback)
      : (data.allowProxyFallback !== undefined ? Boolean(data.allowProxyFallback) : DEFAULT_SETTINGS.allowProxyFallback);
    accountSelectionRow.style.display = enableAccountSwitchingToggle.checked ? 'flex' : 'none';
    accountLabelOverrides = sanitizeAccountLabelOverrides(data.accountLabelOverrides);
    const storedAccounts = Array.isArray(data.discoveredAccounts) ? data.discoveredAccounts : [];
    const filteredAccounts = applyAccountLabelOverrides(filterAccountsByProviders(storedAccounts));
    const filteredIds = new Set(filteredAccounts.map(account => account.id));
    const filteredSelectedAccounts = (Array.isArray(data.selectedAccounts) ? data.selectedAccounts : [])
      .filter(accountId => filteredIds.has(accountId));
    const nextSelectedAccounts = filteredSelectedAccounts.length
      ? filteredSelectedAccounts
      : filteredAccounts.map(account => account.id);
    renderAccounts(filteredAccounts, nextSelectedAccounts);
    if (filteredAccounts.length !== storedAccounts.length) {
      chrome.storage.local.set({
        discoveredAccounts: filteredAccounts,
        selectedAccounts: nextSelectedAccounts,
        accountLabelOverrides,
      });
    }
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
        applyMode: getProxyApplyMode(),
        globalProxyId: globalProxySelect.value || '',
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

function selectAllRenderedAccounts() {
  const checkboxes = Array.from(accountList.querySelectorAll('input[type="checkbox"]'));

  if (!checkboxes.length) {
    log('No detected accounts to select.', 'warn');
    return;
  }

  checkboxes.forEach(input => {
    input.checked = true;
  });
  saveSettings();
  log(`Selected all ${checkboxes.length} detected account(s).`, 'success');
}

function renderAccounts(accounts, selectedAccounts = []) {
  const displayAccounts = applyAccountLabelOverrides(accounts);
  setKnownAccounts(displayAccounts);
  accountList.innerHTML = '';

  if (!displayAccounts.length) {
    const empty = document.createElement('div');
    empty.className = 'account-empty';
    empty.textContent = 'No additional accounts detected yet.';
    accountList.appendChild(empty);
    return;
  }

  const selected = new Set(selectedAccounts.length ? selectedAccounts : displayAccounts.map(account => account.id));
  const groups = new Map();

  displayAccounts.forEach((account) => {
    const provider = account.provider || String(account.id || '').split(':')[0] || 'mail';
    if (!groups.has(provider)) {
      groups.set(provider, []);
    }
    groups.get(provider).push(account);
  });

  PROVIDER_OPTIONS
    .map(item => item.id)
    .concat(Array.from(groups.keys()).filter(provider => !PROVIDER_OPTIONS.some(item => item.id === provider)))
    .forEach((provider) => {
      const providerAccounts = groups.get(provider) || [];
      if (!providerAccounts.length) return;

      const group = document.createElement('div');
      group.className = 'account-provider-group';

      const title = document.createElement('div');
      title.className = 'account-provider-title';
      title.textContent = getProviderLabel(provider);
      group.appendChild(title);

      providerAccounts.forEach((account, index) => {
        const label = document.createElement('label');
        label.className = 'account-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = account.id;
        checkbox.checked = selected.has(account.id);
        checkbox.addEventListener('change', saveSettings);

        if (provider === 'gmail') {
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'account-label-input';
          input.value = getFallbackAccountLabel(account, provider, index);
          input.placeholder = 'Gmail email or label';
          input.title = 'Edit this label if Gmail hides the actual email address.';

          let lastCommittedLabel = input.value.trim();
          const commitLabel = () => {
            const nextLabel = input.value.trim();
            if (nextLabel === lastCommittedLabel) return;
            lastCommittedLabel = nextLabel || account.detectedLabel || getFallbackAccountLabel(account, provider, index);
            saveAccountLabelOverride(account.id, nextLabel);
          };

          input.addEventListener('click', event => event.stopPropagation());
          input.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              input.blur();
            } else if (event.key === 'Escape') {
              input.value = account.label || account.detectedLabel || getFallbackAccountLabel(account, provider, index);
              input.blur();
            }
          });
          input.addEventListener('change', commitLabel);
          input.addEventListener('blur', commitLabel);

          label.append(checkbox, input);
          group.appendChild(label);
          return;
        }

        const text = document.createElement('span');
        text.className = 'account-label-text';
        text.textContent = getFallbackAccountLabel(account, provider, index);

        label.append(checkbox, text);
        group.appendChild(label);
      });

      accountList.appendChild(group);
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

function populateGlobalProxySelect(proxies = [], selectedValue = globalProxySelect.value) {
  globalProxySelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select proxy';
  globalProxySelect.appendChild(placeholder);

  proxies.forEach((proxy) => {
    const option = document.createElement('option');
    option.value = proxy.id;
    option.textContent = `${proxy.host}:${proxy.port}${proxy.enabled === false ? ' (disabled)' : ''}`;
    globalProxySelect.appendChild(option);
  });

  globalProxySelect.value = selectedValue || '';
}

// The proxy Chrome is routing through right now, refreshed by
// loadProxyManagerUi(). Null means no proxy of ours is in force.
let activeProxyState = null;

function isProxyActive(proxy) {
  return Boolean(activeProxyState && activeProxyState.proxyId === proxy?.id);
}

function getProxyStatus(proxy) {
  if (proxy.enabled === false) return 'Disabled';
  // "Online" from a past check says nothing about now. Only the proxy Chrome is
  // actually routing through gets the live badge.
  if (isProxyActive(proxy)) return 'Active';
  if (proxy.status === 'Online') return 'Verified';
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
    const lastIp = isProxyActive(proxy)
      ? `Routing via ${activeProxyState.ip || proxy.lastKnownIp || 'proxy'}`
      : (proxy.lastKnownIp ? `Last verified IP ${proxy.lastKnownIp}` : 'IP unverified');
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

    // A passing Test leaves the proxy applied browser-wide, so there has to be
    // a visible way to switch it back off without removing the proxy config.
    const clearButton = document.createElement('button');
    clearButton.className = 'btn settings-action';
    clearButton.textContent = 'Clear';
    clearButton.title = 'Stop routing Chrome through this proxy';
    clearButton.addEventListener('click', () => clearActiveProxy(clearButton));

    const removeButton = document.createElement('button');
    removeButton.className = 'btn settings-action danger';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeProxy(proxy.id));

    actions.append(testButton, clearButton, toggleButton, removeButton);
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

// Only the proxy Chrome is actually routing through may be torn down here.
// Disabling or removing some *other* proxy used to clear the live one, which
// dropped the browser back to the real IP without saying anything.
function isLiveProxy(proxyId) {
  return Boolean(proxyId && activeProxyState && activeProxyState.proxyId === proxyId);
}

async function toggleProxyEnabled(proxy) {
  if (!window.ProxyStorage) return;
  const willEnable = proxy.enabled === false;
  const wasLive = isLiveProxy(proxy.id);

  await window.ProxyStorage.updateProxy(proxy.id, {
    enabled: willEnable,
  });

  if (!willEnable && wasLive && currentState !== 'running' && currentState !== 'paused') {
    await sendRuntimeMessage({ action: 'CLEAR_PROXY' });
  }

  await loadProxyManagerUi();

  if (!willEnable && wasLive) {
    log('Proxy disabled and cleared. Chrome is back on the direct connection.', 'success');
    return;
  }

  log(willEnable ? 'Proxy enabled.' : 'Proxy disabled. The active proxy was left untouched.', 'success');
}

async function removeProxy(proxyId) {
  if (!window.ProxyStorage) return;
  const wasLive = isLiveProxy(proxyId);

  await window.ProxyStorage.removeProxy(proxyId);

  if (wasLive && currentState !== 'running' && currentState !== 'paused') {
    await sendRuntimeMessage({ action: 'CLEAR_PROXY' });
  }

  await loadProxyManagerUi();
  log(
    wasLive
      ? 'Proxy removed and cleared. Chrome is back on the direct connection.'
      : 'Proxy removed. The active proxy was left untouched.',
    'success'
  );
}

async function clearActiveProxy(button) {
  if (currentState === 'running' || currentState === 'paused') {
    log('Stop automation before clearing the proxy.', 'error');
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'Clearing';
  }

  try {
    const result = await sendRuntimeMessage({ action: 'CLEAR_PROXY' });
    await loadProxyManagerUi();

    if (result.ok) {
      log('Proxy cleared. Chrome is back on the direct connection.', 'success');
    } else {
      log(`Proxy clear failed: ${result.error || 'Unknown error'}`, 'error');
    }
  } finally {
    if (button && button.isConnected) {
      button.disabled = false;
      button.textContent = 'Clear';
    }
  }
}

async function testProxy(proxyId, button) {
  button.disabled = true;
  button.textContent = 'Testing';
  log('Testing proxy...', 'info');

  try {
    const result = await sendRuntimeMessage({ action: 'TEST_PROXY', proxyId });
    await loadProxyManagerUi();

    const restoredNote = result.restoredProxyId
      ? ' The proxy that was already active has been put back.'
      : '';

    if (result.ok && result.keptPrevious) {
      // Verified, but another proxy was already live and keeps priority.
      log(
        `Proxy works (exit IP ${result.ip}).${restoredNote} Clear the active proxy first if you want to switch to this one.`,
        'success'
      );
    } else if (result.ok) {
      // The proxy is left applied on success, so say so plainly - the old
      // message said "online" for a proxy that had already been removed.
      const viaIp = result.ip ? `IP is now ${result.ip}` : 'IP verified';
      const realIp = result.directIp ? ` (real IP ${result.directIp})` : '';
      log(`Proxy applied and verified. ${viaIp}${realIp}. It stays on until you clear it.`, 'success');
    } else if (result.status === 'Not Applied') {
      log(`Proxy NOT applied: ${result.error || 'traffic is still using the direct IP.'}${restoredNote}`, 'error');
    } else {
      log(`Proxy test failed: ${result.error || result.status || 'Unknown error'}${restoredNote}`, 'error');
    }
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = 'Test';
    }
  }
}

function renderDiscoveredAccountsPayload(rawAccounts = [], providers = getSelectedProviders(), options = {}) {
  const accounts = applyAccountLabelOverrides(filterAccountsByProviders(rawAccounts, providers));
  const discoveredIds = new Set(accounts.map(account => account.id));
  const selected = getSelectedAccounts().filter(accountId => discoveredIds.has(accountId));
  const selectedAccounts = options.selectAll
    ? accounts.map(account => account.id)
    : (selected.length ? selected : accounts.map(account => account.id));

  renderAccounts(accounts, selectedAccounts);
  chrome.storage.local.set({ discoveredAccounts: accounts, selectedAccounts, accountLabelOverrides });
  gmailAlert.style.display = accounts.length ? 'none' : gmailAlert.style.display;

  return accounts.length;
}

async function loadProxyManagerUi() {
  if (!window.ProxyStorage) return;

  const [proxySettings, proxies, accountProxyMap, activeProxy] = await Promise.all([
    window.ProxyStorage.getProxySettings(),
    window.ProxyStorage.getProxies(),
    window.ProxyStorage.getAccountProxyMap(),
    sendRuntimeMessage({ action: 'GET_ACTIVE_PROXY' })
      .then(result => (result && result.ok ? result.active : null))
      .catch(() => null),
  ]);

  activeProxyState = activeProxy || null;

  // The proxy-only log view is meaningless with Proxy Manager off, so it only
  // appears once proxies are actually in play.
  if (logProxyOnlyField) {
    const proxyInUse = Boolean(proxySettings.enabled);
    logProxyOnlyField.hidden = !proxyInUse;

    if (!proxyInUse && logProxyOnlyToggle && logProxyOnlyToggle.checked) {
      logProxyOnlyToggle.checked = false;
      applyLogFilters();
    }
  }

  proxyManagerToggle.checked = Boolean(proxySettings.enabled);
  proxyFallbackToggle.checked = Boolean(proxySettings.allowFallback);
  const rawProxyMode = proxySettings.applyMode || '';
  const safeProxyMode = rawProxyMode === 'global' || rawProxyMode === 'perAccount' ? rawProxyMode : 'perAccount';
  setProxyApplyMode(proxySettings.enabled ? safeProxyMode : 'off');
  populateGlobalProxySelect(proxies, proxySettings.globalProxyId || globalProxySelect.value);
  populateProxyAccountOptions();
  renderProxyList(proxies, accountProxyMap);
}

// Same list as the manifest declares - read from it rather than duplicated, so
// adding a content script can never leave a re-injected tab half-equipped.
function getContentScriptFiles() {
  const declared = chrome.runtime.getManifest().content_scripts || [];
  const files = declared.length && Array.isArray(declared[0].js) ? declared[0].js.slice() : [];
  return files.length ? files : ['content.js'];
}

async function ensureContentScript(tabId) {
  const ping = await chrome.tabs.sendMessage(tabId, { action: 'PING' }).catch(() => null);

  // A reply alone is not enough: a tab can answer while missing a companion
  // script that was added to the manifest after it was injected. That is how
  // the ESP matcher went absent. Re-inject unless every reported module is
  // present. A tab whose content.js predates module reporting keeps the old
  // behaviour rather than being re-injected on every popup open.
  const healthy = Boolean(ping && ping.ok) &&
    (!ping.modules || Object.values(ping.modules).every(Boolean));
  if (healthy) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: getContentScriptFiles()
  });
}

async function refreshAccounts(options = {}) {
  const providers = normalizeSelectedProviders(options.providers || getSelectedProviders());
  const forceDeepScan = Boolean(options.forceDeepScan);
  const mergeWithStored = Boolean(options.mergeWithStored);
  const renderProviders = getSelectedProviders();
  const isGmailOnlyRefresh = providers.length === 1 && providers[0] === 'gmail';

  if (!forceDeepScan && isGmailOnlyRefresh) {
    const cachedAccounts = await getCachedAccountsForProviders(['gmail']);

    if (cachedAccounts.length) {
      const accountCount = renderDiscoveredAccountsPayload(cachedAccounts, renderProviders);
      log(`Loaded ${accountCount} cached Gmail account(s). Use Deep Scan Gmail to re-detect.`, 'success');
      return;
    }
  }

  log(
    forceDeepScan
      ? 'Deep scanning Gmail accounts...'
      : `Refreshing accounts for ${providers.map(getProviderLabel).join(', ')}...`,
    forceDeepScan ? 'warn' : 'info'
  );

  try {
    const response = await sendRuntimeMessage({
      action: 'DISCOVER_PROVIDER_ACCOUNTS',
      providers,
      forceDeepScan,
    });

    if (!response.ok) {
      throw new Error(response.error || 'Provider account discovery failed');
    }

    let rawAccounts = response && Array.isArray(response.accounts) ? response.accounts : [];

    if (mergeWithStored || forceDeepScan) {
      const stored = await getStorage(['discoveredAccounts']);
      const requestedProviderSet = new Set(providers);
      const storedAccounts = Array.isArray(stored.discoveredAccounts) ? stored.discoveredAccounts : [];
      rawAccounts = mergeAccountLists([
        ...storedAccounts.filter(account => !requestedProviderSet.has(getAccountProviderId(account))),
        ...rawAccounts
      ]);
    } else if (!rawAccounts.length) {
      const cachedAccounts = await getCachedAccountsForProviders(providers);
      rawAccounts = cachedAccounts;
    }

    const accountCount = renderDiscoveredAccountsPayload(rawAccounts, renderProviders, {
      selectAll: forceDeepScan,
    });
    log(
      accountCount
        ? `${forceDeepScan ? 'Deep scan detected' : 'Detected'} ${accountCount} account(s)`
        : 'No accounts detected',
      accountCount ? 'success' : 'warn'
    );
  } catch (error) {
    if (forceDeepScan) {
      const cachedAccounts = await getCachedAccountsForProviders(renderProviders);
      if (cachedAccounts.length) {
        renderDiscoveredAccountsPayload(cachedAccounts, renderProviders);
      }
    } else {
      renderAccounts([], []);
      chrome.storage.local.set({ discoveredAccounts: [], selectedAccounts: [] });
    }
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

  const settings = getCurrentSettings();

  if (settings.selectedProviders.length > 1 && settings.enableProxyManager && settings.proxyApplyMode === 'perAccount') {
    applyIdleStatus();
    log('Parallel multi-provider automation with per-account proxies is not supported in one Chrome profile. Use Same Proxy for All Tabs or run providers sequentially.', 'error');
    return;
  }

  log(
    settings.selectedProviders.length > 1
      ? `Opening provider tabs: ${settings.selectedProviders.map(getProviderLabel).join(', ')}`
      : `Opening ${getProviderLabel(settings.selectedProvider)} tab and starting automation...`,
    'success'
  );

  if (settings.enableAccountSwitching && settings.selectedAccounts.length === 0) {
    await refreshAccounts();
    settings.selectedAccounts = getSelectedAccounts();
  }

  chrome.runtime.sendMessage({ action: 'START_AUTOMATION', settings }, response => {
    if (chrome.runtime.lastError || !response || !response.ok) {
      const message = chrome.runtime.lastError?.message || response?.error || 'Unknown error';
      applyIdleStatus();
      log(`Start failed: ${message}`, 'error');
      return;
    }

    gmailAlert.style.display = 'none';

    // A scheduled start has not begun yet - show the countdown rather than
    // claiming success, or Stop would look broken and the operator would not
    // know whether the profile is armed.
    if (response.scheduled) {
      beginPendingStartCountdown(response.startAt);
      return;
    }

    chrome.storage.local.set({ automationStartedAt: Date.now() });
    if (response.mode === 'multi-provider') {
      const started = (response.results || []).filter(result => result.ok).map(result => getProviderLabel(result.provider));
      log(`Automation started for ${started.join(', ')}`, 'success');
    } else {
      log('Automation started', 'success');
    }
  });
});

btnPause.addEventListener('click', async () => {
  if (currentState === 'running') {
    setStatus('paused', 'Paused');
    log('Automation paused', 'warn');
    await sendRuntimeMessage({ action: 'PAUSE_AUTOMATION_ALL', providers: getSelectedProviders() });
    chrome.storage.local.set({ automationState: 'paused' });
  } else if (currentState === 'paused') {
    setStatus('running', 'Running');
    log('Automation resumed', 'success');
    await sendRuntimeMessage({ action: 'RESUME_AUTOMATION_ALL', providers: getSelectedProviders() });
    chrome.storage.local.set({ automationState: 'running' });
    btnPause.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Pause`;
    return;
  }

  btnPause.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Resume`;
});

btnStop.addEventListener('click', async () => {
  setStatus('stopped', 'Stopped');

  // Stop has to kill a countdown too, or it appears to do nothing and the run
  // begins anyway a few seconds later.
  const hadPendingStart = pendingStartTimer !== null;
  renderStartButtonIdle();
  if (hadPendingStart) {
    await sendRuntimeMessage({ action: 'CANCEL_PENDING_START', reason: 'Stopped before it began.' }).catch(() => null);
  }

  log(hadPendingStart ? 'Scheduled start cancelled' : 'Automation stopped', 'error');
  btnPause.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Pause`;
  await sendRuntimeMessage({ action: 'STOP_AUTOMATION_ALL', providers: getSelectedProviders() });
  chrome.storage.local.set({ automationState: 'stopped', automationStartedAt: null });
  sendRuntimeMessage({ action: 'CLEAR_PROXY' }).catch(() => null);
  // Re-enable start after stopping
  setTimeout(() => {
    applyIdleStatus();
  }, 2000);
});

function handleProviderTerminalMessage(msg, terminalState) {
  chrome.storage.local.get(['providerAutomationStates'], (data) => {
    const states = data.providerAutomationStates && typeof data.providerAutomationStates === 'object'
      ? { ...data.providerAutomationStates }
      : {};
    const provider = msg.provider || '';
    const isMultiProviderRun = provider && Object.keys(states).length > 1;

    if (!isMultiProviderRun) {
      applyIdleStatus();
      chrome.storage.local.set({ automationState: 'idle' });
      btnPause.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Pause`;
      return;
    }

    states[provider] = terminalState;
    const stillActive = Object.values(states).some(state => state === 'running' || state === 'paused');
    chrome.storage.local.set({
      providerAutomationStates: states,
      automationState: stillActive ? 'running' : 'idle'
    });

    if (!stillActive) {
      applyIdleStatus();
      btnPause.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Pause`;
      log('All selected provider automations finished', 'success', { persist: false });
    }
  });
}

//  Listen for messages from content.js 
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'EMAIL_OPENED') {
    const count = msg.count || 0;
    updateStat(statOpened, count);
    log(prefixProviderMessage(`Opened: ${msg.subject || 'Email #' + count}`, msg.provider), 'success', { persist: false });
    chrome.storage.local.set({ emailsOpened: count });
  }

  if (msg.type === 'UNREAD_COUNT') {
    statUnread.textContent = msg.count;
  }

  if (msg.type === 'DONE') {
    handleProviderTerminalMessage(msg, 'done');
    log(prefixProviderMessage('All unread emails processed', msg.provider), 'success');
  }

  if (msg.type === 'ERROR') {
    handleProviderTerminalMessage(msg, 'error');
    log(prefixProviderMessage('Error: ' + msg.message, msg.provider), 'error', { persist: false });
  }

  if (msg.type === 'LOG') {
    log(prefixProviderMessage(msg.message, msg.provider), msg.level || 'info', { persist: false });
  }

  if (msg.type === 'ACCOUNTS_DISCOVERED') {
    const selectedProviders = getSelectedProviders();
    const eventProviders = normalizeSelectedProviders(msg.providers || selectedProviders);
    const shouldRender = eventProviders.some(provider => selectedProviders.includes(provider));

    if (shouldRender) {
      const accountCount = renderDiscoveredAccountsPayload(
        Array.isArray(msg.accounts) ? msg.accounts : [],
        selectedProviders,
        { selectAll: Boolean(msg.forceDeepScan) }
      );

      if (accountCount && !msg.partial) {
        log(`Detected ${accountCount} account(s)`, 'success', { persist: false });
      }
    }
  }
});
//  WarmTalk
const warmTalkEnabledToggle = $('warmTalkEnabledToggle');
const warmTalkBody = $('warmTalkBody');
const warmTalkStatusEl = $('warmTalkStatus');
const warmTalkDryRunToggle = $('warmTalkDryRunToggle');
const warmTalkProviderGroup = $('warmTalkProviderGroup');
const warmTalkCrossProviderToggle = $('warmTalkCrossProviderToggle');
const warmTalkAccountList = $('warmTalkAccountList');
const warmTalkPairingSelect = $('warmTalkPairingSelect');
const warmTalkManualPairsRow = $('warmTalkManualPairsRow');
const warmTalkPairFromSelect = $('warmTalkPairFromSelect');
const warmTalkPairToSelect = $('warmTalkPairToSelect');
const warmTalkPairList = $('warmTalkPairList');
const warmTalkThreadToggle = $('warmTalkThreadToggle');
const warmTalkThreadTurnsRow = $('warmTalkThreadTurnsRow');
const warmTalkThreadTurnsInput = $('warmTalkThreadTurnsInput');
const warmTalkWeeklyCapInput = $('warmTalkWeeklyCapInput');
const warmTalkRampUpToggle = $('warmTalkRampUpToggle');
const warmTalkRampUpRow = $('warmTalkRampUpRow');
const warmTalkRampUpStartInput = $('warmTalkRampUpStartInput');
const warmTalkRampUpDaysInput = $('warmTalkRampUpDaysInput');
const warmTalkReadMinInput = $('warmTalkReadMinInput');
const warmTalkReadMaxInput = $('warmTalkReadMaxInput');
const warmTalkLinkOpeningToggle = $('warmTalkLinkOpeningToggle');
const warmTalkMaxLinksRow = $('warmTalkMaxLinksRow');
const warmTalkMaxLinksInput = $('warmTalkMaxLinksInput');
const warmTalkMarkNotSpamToggle = $('warmTalkMarkNotSpamToggle');
const warmTalkMinCycleInput = $('warmTalkMinCycleInput');
const warmTalkMaxCycleInput = $('warmTalkMaxCycleInput');
const warmTalkReplyMinInput = $('warmTalkReplyMinInput');
const warmTalkReplyMaxInput = $('warmTalkReplyMaxInput');
const warmTalkDailyCapInput = $('warmTalkDailyCapInput');
const warmTalkReplyProbabilityInput = $('warmTalkReplyProbabilityInput');
const warmTalkHoursStartInput = $('warmTalkHoursStartInput');
const warmTalkHoursEndInput = $('warmTalkHoursEndInput');
const warmTalkDayGroup = $('warmTalkDayGroup');
const warmTalkSubjectsInput = $('warmTalkSubjectsInput');
const warmTalkBodiesInput = $('warmTalkBodiesInput');
const warmTalkStatsList = $('warmTalkStatsList');

const WARM_TALK_KEYS = [
  'warmTalkEnabled',
  'warmTalkDryRun',
  'warmTalkProviders',
  'warmTalkAccounts',
  'warmTalkPairingStrategy',
  'warmTalkManualPairs',
  'warmTalkAllowCrossProvider',
  'warmTalkMinCycleMinutes',
  'warmTalkMaxCycleMinutes',
  'warmTalkReplyDelayMinSeconds',
  'warmTalkReplyDelayMaxSeconds',
  'warmTalkThreadEnabled',
  'warmTalkThreadTurns',
  'warmTalkDailyCapPerAccount',
  'warmTalkWeeklyCapPerAccount',
  'warmTalkRampUpEnabled',
  'warmTalkRampUpStartPerDay',
  'warmTalkRampUpDays',
  'warmTalkActiveHoursStart',
  'warmTalkActiveHoursEnd',
  'warmTalkActiveDays',
  'warmTalkReplyProbability',
  'warmTalkReadTimeMinSeconds',
  'warmTalkReadTimeMaxSeconds',
  'warmTalkEnableLinkOpening',
  'warmTalkMaxLinksPerEmail',
  'warmTalkMarkNotSpam',
  'warmTalkSubjectTemplates',
  'warmTalkBodyTemplates',
  'warmTalkStatus',
  'warmTalkStats',
  'warmTalkLastError'
];

// Mirrors the enrolled-account list; manual pairs are chosen from these.
let warmTalkUsableAccounts = [];
let warmTalkManualPairs = [];

function getCheckedValues(group) {
  if (!group) return [];
  return Array.from(group.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value);
}

function setCheckedValues(group, values = []) {
  if (!group) return;
  const wanted = new Set((values || []).map(String));
  Array.from(group.querySelectorAll('input[type="checkbox"]')).forEach(input => {
    input.checked = wanted.has(String(input.value));
  });
}

function getWarmTalkSelectedAccounts() {
  if (!warmTalkAccountList) return [];
  return Array.from(warmTalkAccountList.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value);
}

function extractAccountEmail(account = {}) {
  // Also consult the Settings label override, in case the user typed the email
  // there but the stored discoveredAccounts label is stale.
  const override = (account.id && accountLabelOverrides[account.id]) || '';
  const match = `${override} ${account.label || ''} ${account.detectedLabel || ''} ${account.id || ''}`
    .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function renderWarmTalkAccounts(accounts = [], selectedIds = []) {
  if (!warmTalkAccountList) return;

  const providers = new Set(getCheckedValues(warmTalkProviderGroup));
  // Every discovered account for the chosen providers, with its resolved email.
  const providerAccounts = accounts
    .filter(account => account?.id && providers.has(getAccountProviderId(account)))
    .map(account => ({ ...account, email: extractAccountEmail(account) }));

  // Only accounts with a resolvable address can actually send or receive.
  const usable = providerAccounts.filter(account => account.email);

  warmTalkUsableAccounts = usable;
  populateWarmTalkPairSelects();
  // Drop any manual pair whose accounts are no longer available.
  const usableIds = new Set(usable.map(account => account.id));
  warmTalkManualPairs = warmTalkManualPairs.filter(pair => usableIds.has(pair.from) && usableIds.has(pair.to));
  renderWarmTalkManualPairs();

  warmTalkAccountList.innerHTML = '';

  if (!providerAccounts.length) {
    const empty = document.createElement('div');
    empty.className = 'account-empty';
    empty.textContent = 'No accounts for the selected providers. Run Deep Scan in Settings.';
    warmTalkAccountList.appendChild(empty);
    return;
  }

  const selected = new Set(selectedIds);

  providerAccounts.forEach((account) => {
    const row = document.createElement('label');
    row.className = 'account-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = account.id;

    const text = document.createElement('span');
    text.className = 'account-label-text';

    if (account.email) {
      input.checked = selected.has(account.id);
      input.addEventListener('change', () => saveWarmTalkSettings({ silent: true }));
      text.textContent = `${getProviderLabel(getAccountProviderId(account))} — ${account.email}`;
    } else {
      // No email detected: keep it visible so nothing silently disappears, but
      // it can't be enrolled until an email is set in Settings.
      input.checked = false;
      input.disabled = true;
      const shown = account.label || account.detectedLabel || account.id;
      text.textContent = `${getProviderLabel(getAccountProviderId(account))} — ${shown} (set email in Settings to use)`;
      text.style.opacity = '0.6';
    }

    row.append(input, text);
    warmTalkAccountList.appendChild(row);
  });
}

function warmTalkAccountLabel(accountId) {
  const account = warmTalkUsableAccounts.find(item => item.id === accountId);
  return account ? account.email : accountId;
}

function populateWarmTalkPairSelects() {
  [warmTalkPairFromSelect, warmTalkPairToSelect].forEach((select) => {
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '';

    warmTalkUsableAccounts.forEach((account) => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.email;
      select.appendChild(option);
    });

    if (previous && warmTalkUsableAccounts.some(account => account.id === previous)) {
      select.value = previous;
    }
  });
}

function renderWarmTalkManualPairs() {
  if (!warmTalkPairList) return;
  warmTalkPairList.innerHTML = '';

  if (!warmTalkManualPairs.length) {
    const empty = document.createElement('div');
    empty.className = 'account-empty';
    empty.textContent = 'No manual pairs yet.';
    warmTalkPairList.appendChild(empty);
    return;
  }

  warmTalkManualPairs.forEach((pair, index) => {
    const row = document.createElement('div');
    row.className = 'account-option';

    const text = document.createElement('span');
    text.className = 'account-label-text';
    text.textContent = `${warmTalkAccountLabel(pair.from)} → ${warmTalkAccountLabel(pair.to)}`;

    const remove = document.createElement('button');
    remove.className = 'btn settings-action danger';
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      warmTalkManualPairs.splice(index, 1);
      renderWarmTalkManualPairs();
      saveWarmTalkSettings({ silent: true });
    });

    row.append(text, remove);
    warmTalkPairList.appendChild(row);
  });
}

function syncWarmTalkConditionalRows() {
  if (warmTalkManualPairsRow) {
    warmTalkManualPairsRow.style.display = warmTalkPairingSelect.value === 'manual' ? 'flex' : 'none';
  }
  if (warmTalkThreadTurnsRow) {
    warmTalkThreadTurnsRow.style.display = warmTalkThreadToggle.checked ? 'flex' : 'none';
  }
  if (warmTalkRampUpRow) {
    warmTalkRampUpRow.style.display = warmTalkRampUpToggle.checked ? 'flex' : 'none';
  }
  if (warmTalkMaxLinksRow) {
    warmTalkMaxLinksRow.style.display = warmTalkLinkOpeningToggle.checked ? 'flex' : 'none';
  }
}

function renderWarmTalkStats(stats = {}) {
  if (!warmTalkStatsList) return;

  const entries = Object.entries(stats || {});
  warmTalkStatsList.innerHTML = '';

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'account-empty';
    empty.textContent = 'No WarmTalk activity yet.';
    warmTalkStatsList.appendChild(empty);
    return;
  }

  entries.forEach(([accountId, stat]) => {
    const row = document.createElement('div');
    row.className = 'account-label-text';
    row.textContent = `${accountId} — sent ${stat.sent || 0}, received ${stat.received || 0}, replied ${stat.replied || 0}, spam rescued ${stat.spamRescued || 0}, failed ${stat.failed || 0}`;
    warmTalkStatsList.appendChild(row);
  });
}

function syncWarmTalkPauseButton(status = 'Stopped') {
  const button = $('btnPauseWarmTalk');
  if (!button) return;
  button.textContent = status === 'Paused' ? 'Resume' : 'Pause';
}

function setWarmTalkStatusLabel(status = 'Stopped', lastError = '') {
  if (!warmTalkStatusEl) return;
  warmTalkStatusEl.textContent = lastError ? `${status} — ${lastError}` : status;
  syncWarmTalkPauseButton(status);
}

async function loadWarmTalkUi(options = {}) {
  if (!warmTalkEnabledToggle) return;

  const data = await getStorage(WARM_TALK_KEYS.concat(['discoveredAccounts']));

  // `warmTalkEnabled` only flips to true once the user presses Start, so when
  // the user has just opened the panel we must not re-derive the toggle from
  // storage — that would collapse the card and make the feature unreachable.
  if (!options.preserveToggle) {
    warmTalkEnabledToggle.checked = data.warmTalkEnabled === true;
    warmTalkBody.style.display = warmTalkEnabledToggle.checked ? 'block' : 'none';
  }

  warmTalkDryRunToggle.checked = data.warmTalkDryRun !== false;
  warmTalkCrossProviderToggle.checked = Boolean(data.warmTalkAllowCrossProvider);
  setCheckedValues(warmTalkProviderGroup, Array.isArray(data.warmTalkProviders) && data.warmTalkProviders.length
    ? data.warmTalkProviders
    : ['gmail']);
  setCheckedValues(warmTalkDayGroup, Array.isArray(data.warmTalkActiveDays) && data.warmTalkActiveDays.length
    ? data.warmTalkActiveDays
    : [1, 2, 3, 4, 5]);

  warmTalkPairingSelect.value = data.warmTalkPairingStrategy || 'roundRobin';
  warmTalkThreadToggle.checked = Boolean(data.warmTalkThreadEnabled);
  warmTalkThreadTurnsInput.value = data.warmTalkThreadTurns ?? 2;
  warmTalkRampUpToggle.checked = Boolean(data.warmTalkRampUpEnabled);
  warmTalkRampUpStartInput.value = data.warmTalkRampUpStartPerDay ?? 2;
  warmTalkRampUpDaysInput.value = data.warmTalkRampUpDays ?? 7;
  warmTalkReadMinInput.value = data.warmTalkReadTimeMinSeconds ?? 5;
  warmTalkReadMaxInput.value = data.warmTalkReadTimeMaxSeconds ?? 20;
  warmTalkLinkOpeningToggle.checked = Boolean(data.warmTalkEnableLinkOpening);
  warmTalkMaxLinksInput.value = data.warmTalkMaxLinksPerEmail ?? 1;
  warmTalkMarkNotSpamToggle.checked = data.warmTalkMarkNotSpam !== false;
  warmTalkMinCycleInput.value = data.warmTalkMinCycleMinutes ?? 5;
  warmTalkMaxCycleInput.value = data.warmTalkMaxCycleMinutes ?? 15;
  warmTalkReplyMinInput.value = data.warmTalkReplyDelayMinSeconds ?? 45;
  warmTalkReplyMaxInput.value = data.warmTalkReplyDelayMaxSeconds ?? 180;
  warmTalkDailyCapInput.value = data.warmTalkDailyCapPerAccount ?? 10;
  warmTalkWeeklyCapInput.value = data.warmTalkWeeklyCapPerAccount ?? 40;
  warmTalkReplyProbabilityInput.value = data.warmTalkReplyProbability ?? 70;
  warmTalkHoursStartInput.value = data.warmTalkActiveHoursStart ?? 9;
  warmTalkHoursEndInput.value = data.warmTalkActiveHoursEnd ?? 18;
  warmTalkManualPairs = Array.isArray(data.warmTalkManualPairs) ? [...data.warmTalkManualPairs] : [];
  warmTalkSubjectsInput.value = Array.isArray(data.warmTalkSubjectTemplates)
    ? data.warmTalkSubjectTemplates.join('\n')
    : '';
  // Bodies are multi-line, so they are separated by a line of --- rather than by
  // newlines. This keeps each template's own paragraph breaks intact.
  warmTalkBodiesInput.value = Array.isArray(data.warmTalkBodyTemplates)
    ? data.warmTalkBodyTemplates.join('\n---\n')
    : '';

  renderWarmTalkAccounts(
    Array.isArray(data.discoveredAccounts) ? data.discoveredAccounts : [],
    Array.isArray(data.warmTalkAccounts) ? data.warmTalkAccounts : []
  );
  renderWarmTalkStats(data.warmTalkStats || {});
  setWarmTalkStatusLabel(data.warmTalkStatus || 'Stopped', data.warmTalkLastError || '');
  syncWarmTalkConditionalRows();
}

function parseNumberInput(input, fallback, min, max) {
  const value = parseInt(input?.value, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

async function saveWarmTalkSettings(options = {}) {
  const minCycle = parseNumberInput(warmTalkMinCycleInput, 5, 1, 240);
  const maxCycle = Math.max(minCycle, parseNumberInput(warmTalkMaxCycleInput, 15, 1, 240));
  const minReply = parseNumberInput(warmTalkReplyMinInput, 45, 5, 3600);
  const maxReply = Math.max(minReply, parseNumberInput(warmTalkReplyMaxInput, 180, 5, 3600));

  const subjects = warmTalkSubjectsInput.value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  // Each body template can span many lines; templates are separated by a line
  // containing only dashes (---). This is why a full multi-line body is kept as
  // one template and sent in full, instead of each line becoming its own.
  const bodies = warmTalkBodiesInput.value
    .split(/^\s*-{3,}\s*$/m)
    .map(block => block.replace(/^\n+|\n+$/g, '').trim())
    .filter(Boolean);

  const minRead = parseNumberInput(warmTalkReadMinInput, 5, 0, 600);
  const maxRead = Math.max(minRead, parseNumberInput(warmTalkReadMaxInput, 20, 0, 600));

  const payload = {
    warmTalkDryRun: warmTalkDryRunToggle.checked,
    warmTalkProviders: getCheckedValues(warmTalkProviderGroup),
    warmTalkAccounts: getWarmTalkSelectedAccounts(),
    warmTalkPairingStrategy: warmTalkPairingSelect.value,
    warmTalkManualPairs: warmTalkManualPairs,
    warmTalkAllowCrossProvider: warmTalkCrossProviderToggle.checked,
    warmTalkMinCycleMinutes: minCycle,
    warmTalkMaxCycleMinutes: maxCycle,
    warmTalkReplyDelayMinSeconds: minReply,
    warmTalkReplyDelayMaxSeconds: maxReply,
    warmTalkThreadEnabled: warmTalkThreadToggle.checked,
    warmTalkThreadTurns: parseNumberInput(warmTalkThreadTurnsInput, 2, 1, 10),
    warmTalkDailyCapPerAccount: parseNumberInput(warmTalkDailyCapInput, 10, 0, 200),
    warmTalkWeeklyCapPerAccount: parseNumberInput(warmTalkWeeklyCapInput, 40, 0, 1000),
    warmTalkRampUpEnabled: warmTalkRampUpToggle.checked,
    warmTalkRampUpStartPerDay: parseNumberInput(warmTalkRampUpStartInput, 2, 1, 100),
    warmTalkRampUpDays: parseNumberInput(warmTalkRampUpDaysInput, 7, 1, 60),
    warmTalkReplyProbability: parseNumberInput(warmTalkReplyProbabilityInput, 70, 0, 100),
    warmTalkReadTimeMinSeconds: minRead,
    warmTalkReadTimeMaxSeconds: maxRead,
    warmTalkEnableLinkOpening: warmTalkLinkOpeningToggle.checked,
    warmTalkMaxLinksPerEmail: parseNumberInput(warmTalkMaxLinksInput, 1, 1, 10),
    warmTalkMarkNotSpam: warmTalkMarkNotSpamToggle.checked,
    warmTalkActiveHoursStart: parseNumberInput(warmTalkHoursStartInput, 9, 0, 23),
    warmTalkActiveHoursEnd: parseNumberInput(warmTalkHoursEndInput, 18, 0, 23),
    warmTalkActiveDays: getCheckedValues(warmTalkDayGroup).map(Number),
    warmTalkSubjectTemplates: subjects,
    warmTalkBodyTemplates: bodies
  };

  await chrome.storage.local.set(payload);

  // Reflect the corrected min/max back so the user sees what was actually stored.
  warmTalkMinCycleInput.value = minCycle;
  warmTalkMaxCycleInput.value = maxCycle;
  warmTalkReplyMinInput.value = minReply;
  warmTalkReplyMaxInput.value = maxReply;
  warmTalkReadMinInput.value = minRead;
  warmTalkReadMaxInput.value = maxRead;

  if (!options.silent) {
    log('WarmTalk settings saved.', 'success', { persist: false });
  }

  return payload;
}

if (warmTalkEnabledToggle) {
  warmTalkEnabledToggle.addEventListener('change', async () => {
    warmTalkBody.style.display = warmTalkEnabledToggle.checked ? 'block' : 'none';

    if (!warmTalkEnabledToggle.checked) {
      await chrome.runtime.sendMessage({ action: 'STOP_WARM_TALK' }).catch(() => {});
      setWarmTalkStatusLabel('Stopped');
      log('WarmTalk disabled.', 'info', { persist: false });
      return;
    }

    await loadWarmTalkUi({ preserveToggle: true });
    log('WarmTalk panel opened. Configure accounts, then press Start.', 'info', { persist: false });
  });

  warmTalkProviderGroup.addEventListener('change', async () => {
    const data = await getStorage(['discoveredAccounts', 'warmTalkAccounts']);
    renderWarmTalkAccounts(
      Array.isArray(data.discoveredAccounts) ? data.discoveredAccounts : [],
      Array.isArray(data.warmTalkAccounts) ? data.warmTalkAccounts : []
    );
  });

  $('btnWarmTalkSelectAll').addEventListener('click', () => {
    const checkboxes = Array.from(warmTalkAccountList.querySelectorAll('input[type="checkbox"]'));
    if (!checkboxes.length) {
      log('No WarmTalk-capable accounts to select.', 'warn', { persist: false });
      return;
    }
    checkboxes.forEach(input => { input.checked = true; });
    saveWarmTalkSettings({ silent: true });
    log(`Enrolled all ${checkboxes.length} account(s) in WarmTalk.`, 'success', { persist: false });
  });

  $('btnWarmTalkRefreshAccounts').addEventListener('click', async () => {
    const data = await getStorage(['discoveredAccounts', 'warmTalkAccounts']);
    renderWarmTalkAccounts(
      Array.isArray(data.discoveredAccounts) ? data.discoveredAccounts : [],
      Array.isArray(data.warmTalkAccounts) ? data.warmTalkAccounts : []
    );
    log('WarmTalk account list refreshed.', 'info', { persist: false });
  });

  [warmTalkPairingSelect, warmTalkThreadToggle, warmTalkRampUpToggle, warmTalkLinkOpeningToggle]
    .forEach(control => control.addEventListener('change', syncWarmTalkConditionalRows));

  $('btnWarmTalkAddPair').addEventListener('click', () => {
    const from = warmTalkPairFromSelect.value;
    const to = warmTalkPairToSelect.value;

    if (!from || !to) {
      log('Enrol accounts before adding a manual pair.', 'warn', { persist: false });
      return;
    }

    if (from === to) {
      log('A manual pair needs two different accounts.', 'warn', { persist: false });
      return;
    }

    if (warmTalkManualPairs.some(pair => pair.from === from && pair.to === to)) {
      log('That pair already exists.', 'warn', { persist: false });
      return;
    }

    warmTalkManualPairs.push({ from, to });
    renderWarmTalkManualPairs();
    saveWarmTalkSettings({ silent: true });
    log(`Manual pair added: ${warmTalkAccountLabel(from)} → ${warmTalkAccountLabel(to)}`, 'success', { persist: false });
  });

  $('btnSaveWarmTalkSettings').addEventListener('click', () => {
    saveWarmTalkSettings();
  });

  $('btnStartWarmTalk').addEventListener('click', async () => {
    const payload = await saveWarmTalkSettings({ silent: true });

    if (payload.warmTalkAccounts.length < 2) {
      log('WarmTalk needs at least 2 enrolled accounts.', 'error', { persist: false });
      return;
    }

    const result = await chrome.runtime.sendMessage({ action: 'START_WARM_TALK' }).catch(error => ({
      ok: false,
      error: error.message
    }));

    if (!result || !result.ok) {
      log(`WarmTalk start failed: ${result?.error || 'Unknown error'}`, 'error', { persist: false });
      return;
    }

    log(
      `WarmTalk started with ${result.accounts} account(s)${result.dryRun ? ' in DRY RUN mode (no real emails)' : ''}.`,
      'success',
      { persist: false }
    );
  });

  // Pause doubles as Resume so a paused run is never stranded.
  $('btnPauseWarmTalk').addEventListener('click', async () => {
    const data = await getStorage(['warmTalkStatus']);
    const paused = data.warmTalkStatus === 'Paused';
    const action = paused ? 'RESUME_WARM_TALK' : 'PAUSE_WARM_TALK';

    await chrome.runtime.sendMessage({ action }).catch(() => {});
    log(paused ? 'WarmTalk resumed.' : 'WarmTalk paused.', 'info', { persist: false });
    syncWarmTalkPauseButton(paused ? 'Idle' : 'Paused');
  });

  $('btnStopWarmTalk').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'STOP_WARM_TALK' }).catch(() => {});
    warmTalkEnabledToggle.checked = false;
    warmTalkBody.style.display = 'none';
    setWarmTalkStatusLabel('Stopped');
    log('WarmTalk stopped.', 'info', { persist: false });
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  // The cycle is scheduled by the background a moment after the run reports done,
  // so without this the pill can settle on "Idle" just before the schedule lands.
  if ((changes.continuousModeActive || changes.continuousNextRunAt) &&
      (currentState === 'idle' || currentState === 'scheduled')) {
    applyIdleStatus();
  }

  if (!warmTalkStatusEl) return;

  if (changes.warmTalkStatus || changes.warmTalkLastError) {
    getStorage(['warmTalkStatus', 'warmTalkLastError']).then(data => {
      setWarmTalkStatusLabel(data.warmTalkStatus || 'Stopped', data.warmTalkLastError || '');
    });
  }

  if (changes.warmTalkStats) {
    renderWarmTalkStats(changes.warmTalkStats.newValue || {});
  }
});

function updateAccordionBadges() {
  const accountBadge = $('accountSwitchingBadge');
  if (accountBadge && enableAccountSwitchingToggle) {
    accountBadge.textContent = enableAccountSwitchingToggle.checked ? 'ON' : 'OFF';
    accountBadge.classList.toggle('on', enableAccountSwitchingToggle.checked);
  }

  const proxyBadge = $('proxyManagerBadge');
  if (proxyBadge && proxyManagerToggle) {
    proxyBadge.textContent = proxyManagerToggle.checked ? 'ON' : 'OFF';
    proxyBadge.classList.toggle('on', proxyManagerToggle.checked);
  }

  const warmTalkBadge = $('warmTalkBadge');
  if (warmTalkBadge && warmTalkEnabledToggle) {
    warmTalkBadge.textContent = warmTalkEnabledToggle.checked ? 'ON' : 'OFF';
    warmTalkBadge.classList.toggle('on', warmTalkEnabledToggle.checked);
  }
}

function initAccordions() {
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('input') || e.target.closest('select') || e.target.closest('button:not(.accordion-header)')) {
        return;
      }
      const item = header.closest('.accordion-item');
      const content = item ? item.querySelector('.accordion-content') : null;
      if (!content) return;
      const isExpanded = header.getAttribute('aria-expanded') === 'true';

      header.setAttribute('aria-expanded', !isExpanded);
      if (isExpanded) {
        item.classList.remove('open');
        content.hidden = true;
      } else {
        item.classList.add('open');
        content.hidden = false;
      }
    });
  });

  [enableAccountSwitchingToggle, proxyManagerToggle, warmTalkEnabledToggle].forEach(toggle => {
    if (toggle) {
      toggle.addEventListener('change', updateAccordionBadges);
    }
  });

  updateAccordionBadges();
}

//  Init
document.addEventListener('DOMContentLoaded', async () => {
  initAccordions();
  loadActivityLogs();
  loadSettings();
  loadWarmTalkUi();
  await checkGmailAndShowAlert();
  updateAccordionBadges();
  const restoredState = await restoreAutomationState();
  if (restoredState === 'running' || restoredState === 'paused') {
    log('Automation is still running. Use Stop to end it.', 'info', { persist: false });
  } else if (restoredState === 'scheduled') {
    log('Continuous mode is on. The next cycle is scheduled — use Stop to cancel it.', 'info', { persist: false });
  } else {
    log('Extension ready. Choose a provider and click Start.', 'info', { persist: false });
  }
});

// ── ESP Connector UI ─────────────────────────────────────────────────────────
// The popup never keeps a credential beyond the moment of submission: the
// fields are cleared as soon as the connection is created, and the service
// worker only ever hands back redacted records.

let espProviderCatalog = [];

function espSend(action, extra = {}) {
  return sendRuntimeMessage({ action, ...extra });
}

function renderEspCredentialFields() {
  if (!espCredentialFields || !espProviderSelect) return;

  const provider = espProviderCatalog.find(p => p.id === espProviderSelect.value);
  espCredentialFields.innerHTML = '';
  if (!provider) return;

  if (provider.comingSoon) {
    espProviderNote.hidden = false;
    espProviderNote.textContent = provider.note || 'Not implemented yet.';
    btnEspAdd.disabled = true;
    return;
  }

  espProviderNote.hidden = !provider.docsHint;
  espProviderNote.textContent = provider.docsHint ? 'Find this in: ' + provider.docsHint : '';
  btnEspAdd.disabled = false;

  // Only the fields this particular provider needs.
  provider.credentialFields.forEach(field => {
    const input = document.createElement('input');
    input.type = field.type || 'text';
    input.className = 'batch-select';
    input.id = 'espCred_' + field.key;
    input.placeholder = field.placeholder || field.label;
    input.setAttribute('aria-label', field.label);
    espCredentialFields.appendChild(input);
  });
}

function collectEspCredentials() {
  const provider = espProviderCatalog.find(p => p.id === espProviderSelect.value);
  if (!provider) return {};

  const credentials = {};
  provider.credentialFields.forEach(field => {
    const input = $('espCred_' + field.key);
    if (input) credentials[field.key] = input.value.trim();
  });
  return credentials;
}

function clearEspCredentialInputs() {
  espCredentialFields.querySelectorAll('input').forEach(input => { input.value = ''; });
  espNameInput.value = '';
}

function espStatusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'connected') return 'proxy-status-active';
  if (s === 'invalid credentials' || s === 'error') return 'proxy-status-not-applied';
  if (s === 'disabled') return 'proxy-status-disabled';
  return 'proxy-status-verified';
}

function renderEspConnections(connections) {
  espList.innerHTML = '';
  espEmpty.style.display = connections.length ? 'none' : 'block';

  connections.forEach(connection => {
    const provider = espProviderCatalog.find(p => p.id === connection.provider);
    const card = document.createElement('div');
    card.className = 'proxy-card';

    const head = document.createElement('div');
    head.className = 'proxy-card-head';
    const title = document.createElement('span');
    title.className = 'proxy-card-title';
    title.textContent = connection.name || (provider && provider.label) || connection.provider;
    const status = connection.enabled === false ? 'Disabled' : connection.status;
    const badge = document.createElement('span');
    badge.className = 'proxy-status ' + espStatusClass(status);
    badge.textContent = status;
    head.append(title, badge);

    const meta = document.createElement('div');
    meta.className = 'proxy-card-meta';
    const bits = [(provider && provider.label) || connection.provider];
    if (connection.accountLabel) bits.push(connection.accountLabel);
    bits.push(connection.domains.length + ' domain(s)');
    bits.push(connection.senders.length + ' sender(s)');
    if (connection.lastSyncAt) bits.push('synced ' + new Date(connection.lastSyncAt).toLocaleString());
    meta.textContent = bits.join(' | ');

    const actions = document.createElement('div');
    actions.className = 'proxy-card-actions';

    const testBtn = document.createElement('button');
    testBtn.className = 'btn settings-action';
    testBtn.textContent = 'Test';
    testBtn.addEventListener('click', () => espTest(connection.id, testBtn));

    const syncBtn = document.createElement('button');
    syncBtn.className = 'btn settings-action';
    syncBtn.textContent = 'Sync';
    syncBtn.addEventListener('click', () => espSync(connection.id, syncBtn));

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn settings-action';
    toggleBtn.textContent = connection.enabled === false ? 'Enable' : 'Disable';
    toggleBtn.addEventListener('click', async () => {
      await espSend('ESP_SET_ENABLED', { id: connection.id, enabled: connection.enabled === false });
      await loadEspUi();
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn settings-action danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      await espSend('ESP_REMOVE_CONNECTION', { id: connection.id });
      log('ESP connection removed.', 'success');
      await loadEspUi();
    });

    actions.append(testBtn, syncBtn, toggleBtn, removeBtn);

    if (connection.lastError) {
      const err = document.createElement('div');
      err.className = 'esp-error';
      err.textContent = connection.lastError;
      card.append(head, meta, err, actions);
    } else {
      card.append(head, meta, actions);
    }

    espList.appendChild(card);
  });
}

async function loadEspUi() {
  if (!espProviderSelect) return;

  if (!espProviderCatalog.length) {
    const result = await espSend('ESP_LIST_PROVIDERS');
    if (!result || !result.ok) return;
    espProviderCatalog = result.providers || [];

    espProviderSelect.innerHTML = '';
    espProviderCatalog.forEach(provider => {
      const option = document.createElement('option');
      option.value = provider.id;
      option.textContent = provider.comingSoon ? provider.label + ' (coming soon)' : provider.label;
      espProviderSelect.appendChild(option);
    });
    renderEspCredentialFields();
  }

  const state = await espSend('ESP_LIST_CONNECTIONS');
  if (!state || !state.ok) return;

  espEnabledToggle.checked = Boolean(state.settings && state.settings.enabled);
  espLookbackInput.value = (state.settings && state.settings.lookbackDays) || 30;
  renderEspConnections(state.connections || []);
}

async function espTest(id, button) {
  button.disabled = true;
  button.textContent = 'Testing';
  try {
    const result = await espSend('ESP_TEST_CONNECTION', { id });
    if (result && result.ok) {
      const label = result.account && result.account.label ? ': ' + result.account.label : '';
      log('ESP connected' + label + '.', 'success');
    } else {
      log('ESP test failed: ' + ((result && result.error && result.error.message) || 'Unknown error'), 'error');
    }
    await loadEspUi();
  } finally {
    if (button.isConnected) { button.disabled = false; button.textContent = 'Test'; }
  }
}

async function espSync(id, button) {
  button.disabled = true;
  button.textContent = 'Syncing';
  try {
    const result = await espSend('ESP_SYNC_CONNECTION', { id });
    if (result && result.ok) {
      log('ESP synced: ' + result.campaigns + ' campaign(s), ' + result.domains + ' domain(s), ' + result.senders + ' sender(s).', 'success');
    } else if (!result || !result.skipped) {
      log('ESP sync failed: ' + ((result && result.error && result.error.message) || 'Unknown error'), 'error');
    }
    await loadEspUi();
  } finally {
    if (button.isConnected) { button.disabled = false; button.textContent = 'Sync'; }
  }
}

async function saveEspSettingsFromUi() {
  await espSend('ESP_SAVE_SETTINGS', {
    settings: {
      enabled: espEnabledToggle.checked,
      lookbackDays: parseInt(espLookbackInput.value, 10) || 30,
    },
  });
}

if (espProviderSelect) espProviderSelect.addEventListener('change', renderEspCredentialFields);

if (btnEspAdd) {
  btnEspAdd.addEventListener('click', async () => {
    const credentials = collectEspCredentials();
    btnEspAdd.disabled = true;
    try {
      const result = await espSend('ESP_ADD_CONNECTION', {
        payload: {
          provider: espProviderSelect.value,
          name: espNameInput.value.trim(),
          credentials,
        },
      });

      if (!result || !result.ok) {
        log('Could not add ESP: ' + ((result && result.error && result.error.message) || 'Unknown error'), 'error');
        return;
      }

      clearEspCredentialInputs();
      log('ESP connection added. Run Test, then Sync to pull your campaigns.', 'success');
      await loadEspUi();
    } finally {
      btnEspAdd.disabled = false;
    }
  });
}

if (btnEspSyncAll) {
  btnEspSyncAll.addEventListener('click', async () => {
    btnEspSyncAll.disabled = true;
    btnEspSyncAll.textContent = 'Syncing';
    try {
      const result = await espSend('ESP_SYNC_ALL');
      const ok = ((result && result.results) || []).filter(r => r && r.ok).length;
      log('ESP sync complete for ' + ok + ' connection(s).', ok ? 'success' : 'warn');
      await loadEspUi();
    } finally {
      btnEspSyncAll.disabled = false;
      btnEspSyncAll.textContent = 'Sync All';
    }
  });
}

if (espEnabledToggle) {
  espEnabledToggle.addEventListener('change', async () => {
    await saveEspSettingsFromUi();
    log(
      espEnabledToggle.checked
        ? 'ESP filter on: only emails from your connected ESPs will be processed.'
        : 'ESP filter off: all unread emails will be processed.',
      'success'
    );
  });
}

if (espLookbackInput) espLookbackInput.addEventListener('change', saveEspSettingsFromUi);

loadEspUi().catch(() => {});

// ── Scheduled start countdown ────────────────────────────────────────────────
// A manual Start can be held for a few seconds so several Chrome profiles can
// be started one after another without the first racing ahead. While it is
// pending the Start button becomes a live countdown and Stop cancels it.

let pendingStartTimer = null;

function clearPendingStartCountdown() {
  if (pendingStartTimer) {
    clearInterval(pendingStartTimer);
    pendingStartTimer = null;
  }
}

function renderStartButtonIdle() {
  clearPendingStartCountdown();
  btnStart.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Start';
  btnStart.disabled = false;
}

function beginPendingStartCountdown(startAt) {
  clearPendingStartCountdown();
  if (!startAt) return;

  setStatus('scheduled', 'Starting soon');
  btnStart.disabled = true;
  btnStop.disabled = false;

  const tick = () => {
    const left = Math.max(0, Math.ceil((startAt - Date.now()) / 1000));
    if (left <= 0) {
      clearPendingStartCountdown();
      btnStart.disabled = true;
      setStatus('running', 'Running');
      return;
    }
    const mm = Math.floor(left / 60);
    const ss = String(left % 60).padStart(2, '0');
    btnStart.textContent = mm > 0 ? `Starting in ${mm}:${ss}` : `Starting in ${left}s`;
  };

  tick();
  pendingStartTimer = setInterval(tick, 1000);
}

// A pending start lives in the service worker, so reopening the popup has to
// pick the countdown back up rather than showing an idle Start button.
async function restorePendingStartCountdown() {
  const result = await sendRuntimeMessage({ action: 'GET_PENDING_START' }).catch(() => null);
  if (result && result.ok && result.pending && result.pending.startAt > Date.now()) {
    beginPendingStartCountdown(result.pending.startAt);
  }
}

restorePendingStartCountdown().catch(() => {});

// ── Licence gate UI ──────────────────────────────────────────────────────────
// The popup never holds the licence key: it is submitted once, the field is
// cleared, and every later read comes back redacted from the service worker.

const licenseScreen = $('licenseScreen');
const appMain = $('appMain');
const licenseEmailInput = $('licenseEmailInput');
const licenseKeyInput = $('licenseKeyInput');
const btnLicenseActivate = $('btnLicenseActivate');
const licenseMessage = $('licenseMessage');
const licenseDeviceLabel = $('licenseDeviceLabel');
const licenseStrip = $('licenseStrip');
const licenseLoading = $('licenseLoading');

function showLicenseMessage(text, tone = 'error') {
  if (!licenseMessage) return;
  if (!text) {
    licenseMessage.hidden = true;
    licenseMessage.textContent = '';
    return;
  }
  licenseMessage.hidden = false;
  licenseMessage.textContent = text;
  licenseMessage.className = `license-message ${tone}`;
}

function formatExpiry(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

function renderLicenseStrip(status) {
  if (!licenseStrip) return;
  const { state, access } = status;

  if (!access.allowed) {
    licenseStrip.hidden = true;
    return;
  }

  const bits = [];
  if (state.customerName) bits.push(state.customerName);
  if (state.plan) bits.push(state.plan);
  const until = formatExpiry(state.expiresAt);
  if (until) bits.push(`renews ${until}`);
  if (state.seatsAllowed) bits.push(`profile ${state.seatsUsed}/${state.seatsAllowed}`);

  licenseStrip.hidden = bits.length === 0;
  licenseStrip.textContent = bits.join(' · ');
  licenseStrip.title = access.message || '';
}

// Decides which of the two screens the popup is showing. Called on open and
// after every licence operation.
function applyLicenseStatus(status) {
  if (!status || !status.access) return;

  if (licenseLoading) licenseLoading.hidden = true;
  const allowed = status.access.allowed;
  if (licenseScreen) licenseScreen.hidden = allowed;
  if (appMain) appMain.hidden = !allowed;

  if (allowed) {
    renderLicenseStrip(status);
    // A grace period counting down is worth saying out loud.
    if (status.access.message) log(status.access.message, 'warn');
    return;
  }

  // Re-entering the activation screen: prefill the email so a refused user is
  // not retyping it, and say plainly what went wrong.
  if (licenseEmailInput && status.state && status.state.email) {
    licenseEmailInput.value = status.state.email;
  }

  if (!status.configured) {
    showLicenseMessage('This build has no licensing server configured yet. Activation is unavailable.', 'warn');
  } else if (status.access.status === 'not-activated') {
    showLicenseMessage('');
  } else {
    showLicenseMessage(status.access.message || 'This subscription is not active.', 'error');
  }

  if (licenseDeviceLabel) {
    licenseDeviceLabel.textContent = status.state && status.state.seatsAllowed
      ? `${status.state.seatsUsed} of ${status.state.seatsAllowed} profiles activated.`
      : 'This profile counts as one activation.';
  }
}

async function refreshLicenseStatus() {
  const status = await sendRuntimeMessage({ action: 'LICENSE_STATUS' }).catch(() => null);
  if (!status || !status.ok) {
    // The gate could not be reached at all. Show the app rather than locking
    // the user out of their own settings over a messaging failure.
    if (licenseLoading) licenseLoading.hidden = true;
    if (appMain) appMain.hidden = false;
    if (licenseScreen) licenseScreen.hidden = true;
    return null;
  }
  applyLicenseStatus(status);
  return status;
}

if (btnLicenseActivate) {
  btnLicenseActivate.addEventListener('click', async () => {
    const email = licenseEmailInput ? licenseEmailInput.value.trim() : '';
    const licenseKey = licenseKeyInput ? licenseKeyInput.value.trim() : '';

    btnLicenseActivate.disabled = true;
    btnLicenseActivate.textContent = 'Checking...';
    showLicenseMessage('');

    try {
      const result = await sendRuntimeMessage({
        action: 'LICENSE_ACTIVATE',
        payload: { email, licenseKey },
      });

      // Cleared either way - the key is never kept in the page.
      if (licenseKeyInput) licenseKeyInput.value = '';

      if (result && result.ok) {
        applyLicenseStatus(result);
        log('Extension activated for this profile.', 'success');
        return;
      }

      const text = result && (result.error || (result.access && result.access.message));
      showLicenseMessage(text || 'Activation failed.', 'error');
    } finally {
      btnLicenseActivate.disabled = false;
      btnLicenseActivate.textContent = 'Activate';
    }
  });
}

// Enter submits from either field.
[licenseEmailInput, licenseKeyInput].forEach(input => {
  if (!input) return;
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && btnLicenseActivate && !btnLicenseActivate.disabled) {
      btnLicenseActivate.click();
    }
  });
});

refreshLicenseStatus().catch(() => {});
