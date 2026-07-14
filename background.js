// background.js — Email Read Automate (Service Worker)

try {
  importScripts(
    'proxyStorage.js',
    'proxyAuth.js',
    'proxyHealthChecker.js',
    'proxyController.js',
    'proxyManager.js'
  );
} catch (error) {
  console.error('[Proxy] Failed to load proxy modules', error);
}

// Keep track of active Gmail tabs
let gmailTabs = new Set();
const CONTENT_SCRIPT_VERSION = '2026-07-07-yahoo-cold-start-v1';
const ACTIVITY_LOG_KEY = 'activityLogEntries'; // legacy single-array key, migrated into chunks
const ACTIVITY_LOG_META_KEY = 'activityLogMeta';
const ACTIVITY_LOG_CHUNK_PREFIX = 'activityLogChunk:';
const ACTIVITY_LOG_CHUNK_SIZE = 200;
// Retention is the primary limit (unlimitedStorage permission removes the 10MB cap).
// The chunk count is only a safety backstop far above a normal month of logs.
const ACTIVITY_LOG_MAX_CHUNKS = 5000;
const ACTIVITY_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CONTINUOUS_ALARM_NAME = 'emailReadAutomate.continuousLoop';
const DEFAULT_CONTINUOUS_DELAY_MINUTES = 10;
const MIN_CONTINUOUS_DELAY_MINUTES = 1;
const MAX_CONTINUOUS_DELAY_MINUTES = 240;
const MAX_CONTINUOUS_START_FAILURES = 3;
const DEFAULT_BACKEND_BASE_URL = 'http://10.5.56.133:3000/api/anslation/product-api/knproducts/kncampaignastra/knemailastra/inbox-lab';
const DEFAULT_BACKEND_CONNECTOR_ID = 'inbox-connector-mrdbbh2d-0pnehvxo';
const DEFAULT_BACKEND_TOKEN = 'inboxlab_5tsdxevkmrdbbh2ekjemcy';
const DEFAULT_BACKEND_ACCOUNT = 'barjrajkumar451@gmail.com';
const BACKEND_WORKER_POLL_INTERVAL_MS = 5000;
const BACKEND_WORKER_ALARM_NAME = 'emailReadAutomate.backendWorkerWatchdog';
// chrome.alarms minimum period; wakes the service worker if Chrome killed the poll interval.
const BACKEND_WORKER_ALARM_PERIOD_MINUTES = 0.5;
const PENDING_INBOXLAB_RESULT_LIMIT = 20;
const PENDING_INBOXLAB_RESULT_MAX_ATTEMPTS = 5;
const BACKEND_WORKER_STATUSES = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  idle: 'Idle',
  running: 'Running',
  paused: 'Paused',
  stopped: 'Stopped'
};
const DEFAULT_AUTOMATION_SETTINGS = {
  selectedProvider: 'gmail',
  selectedProviders: ['gmail'],
  backendBaseUrl: DEFAULT_BACKEND_BASE_URL,
  backendConnectorId: DEFAULT_BACKEND_CONNECTOR_ID,
  backendToken: DEFAULT_BACKEND_TOKEN,
  backendAccount: DEFAULT_BACKEND_ACCOUNT,
  readTime: 4,
  backDelay: 2,
  autoRefresh: true,
  enableContinuousMode: false,
  continuousDelayMinutes: DEFAULT_CONTINUOUS_DELAY_MINUTES,
  randomEmailOpening: false,
  retryEmailOpening: true,
  manualActivityPause: true,
  processGmailPromotions: true,
  gmailPromotionsPageLimit: 1,
  gmailInboxPageLimit: 3,
  maxEmails: 10,
  maxLinksPerEmail: 1,
  enableLinkOpening: true,
  enableAutoReply: true,
  enableProcessedTracking: true,
  reprocessingMode: 'never',
  enableAccountSwitching: false,
  enableProxyManager: false,
  allowProxyFallback: false,
  proxyApplyMode: 'off',
  globalProxyId: '',
  selectedAccounts: []
};
const AUTOMATION_SETTING_STORAGE_KEYS = [
  'selectedProvider',
  'selectedProviders',
  'backendBaseUrl',
  'backendConnectorId',
  'backendToken',
  'backendAccount',
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
  'selectedAccounts',
  'proxySettings'
];
const LEGACY_BACKEND_BASE_URLS = [
  'http://10.5.56.133:8000/api/knproducts/kncampaignastra/knemailastra/inbox-lab'
];
const LEGACY_BACKEND_CONNECTOR_IDS = ['extension-system-1'];
const LEGACY_BACKEND_TOKENS = ['inboxlab_5tsdxevkmrddbbh2ekjemcy'];

const PROVIDER_URLS = {
  gmail: 'https://mail.google.com/mail/u/0/#inbox',
  yahoo: 'https://mail.yahoo.com/n/folders/1?.src=ym&reason=myc',
  aol: 'https://mail.aol.com/d/folders/1',
  outlook: 'https://outlook.live.com/mail/0/',
  proton: 'https://mail.proton.me',
  zoho: 'https://mail.zoho.com'
};
const GOOGLE_LIST_ACCOUNTS_URL = 'https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&json=standard';
const GMAIL_PROBE_MAX_INDEX = 99;
const GMAIL_PROBE_URL_TIMEOUT = 3500;
const GMAIL_PROBE_CONTENT_TIMEOUT = 2000;
const GMAIL_PROBE_CONSECUTIVE_MISS_LIMIT = 3;

const MULTI_PROVIDER_IDS = ['gmail', 'yahoo', 'aol', 'outlook'];
const PROVIDER_LABELS = {
  gmail: 'Gmail',
  yahoo: 'Yahoo',
  aol: 'AOL',
  outlook: 'Outlook',
  proton: 'Proton',
  zoho: 'Zoho'
};
let backendWorkerTimer = null;
let backendWorkerPollInFlight = false;

function getProviderStartUrl(provider = 'gmail') {
  return PROVIDER_URLS[provider] || PROVIDER_URLS.gmail;
}

function isMailUrl(url = '') {
  return (
    url.includes('mail.google.com') ||
    url.includes('mail.yahoo.com') ||
    url.includes('mail.aol.com') ||
    url.includes('outlook.live.com') ||
    url.includes('mail.proton.me') ||
    url.includes('mail.zoho.com')
  );
}

function isProviderUrl(url = '', provider = 'gmail') {
  if (!url) return false;

  const providerHosts = {
    gmail: 'mail.google.com',
    yahoo: 'mail.yahoo.com',
    aol: 'mail.aol.com',
    outlook: 'outlook.live.com',
    proton: 'mail.proton.me',
    zoho: 'mail.zoho.com'
  };

  return url.includes(providerHosts[provider] || providerHosts.gmail);
}

function getProviderFromUrl(url = '') {
  return Object.keys(PROVIDER_URLS).find(provider => isProviderUrl(url, provider)) || '';
}

function getProviderLabel(provider = '') {
  return PROVIDER_LABELS[provider] || provider || 'Mail';
}

function normalizeProviders(providers = []) {
  const rawProviders = Array.isArray(providers) ? providers : [providers];
  const seen = new Set();
  const selected = [];

  rawProviders.forEach((provider) => {
    const safeProvider = String(provider || '').trim();
    if (!MULTI_PROVIDER_IDS.includes(safeProvider) || seen.has(safeProvider)) return;
    seen.add(safeProvider);
    selected.push(safeProvider);
  });

  return selected.length ? selected : ['gmail'];
}

function getSelectedProvidersFromSettings(settings = {}) {
  return normalizeProviders(
    Array.isArray(settings.selectedProviders) && settings.selectedProviders.length
      ? settings.selectedProviders
      : [settings.selectedProvider || 'gmail']
  );
}

function accountIdBelongsToProvider(accountId = '', provider = '') {
  return String(accountId || '').startsWith(`${provider}:`);
}

function getProviderSelectedAccounts(settings = {}, provider = '') {
  return (Array.isArray(settings.selectedAccounts) ? settings.selectedAccounts : [])
    .filter(accountId => accountIdBelongsToProvider(accountId, provider));
}

function getProxyApplyMode(settings = {}) {
  if (!settings.enableProxyManager) return 'off';
  return settings.proxyApplyMode === 'global' || settings.proxyApplyMode === 'perAccount'
    ? settings.proxyApplyMode
    : 'perAccount';
}

function prefixProviderMessage(message = '', provider = '') {
  if (!provider || /^\[[^\]]+\]/.test(message)) return message;
  return `[${getProviderLabel(provider)}] ${message}`;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && isMailUrl(tab.url)) {
    gmailTabs.add(tabId);
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  gmailTabs.delete(tabId);
});

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function waitForTabComplete(tabId, timeout = 30000) {
  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => finish(false), timeout);

    function finish(result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(result);
    }

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        finish(true);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        finish(true);
      }
    }).catch(() => finish(false));
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

async function setAutomationState(automationState, values = {}) {
  await chrome.storage.local.set({ ...values, automationState });
}

let activityLogWriteChain = Promise.resolve();

function getEmptyActivityLogMeta() {
  return { seq: 0, chunks: [] };
}

async function readActivityLogMeta() {
  const data = await getStorage([ACTIVITY_LOG_META_KEY]);
  const meta = data[ACTIVITY_LOG_META_KEY];
  return meta && Array.isArray(meta.chunks) ? meta : getEmptyActivityLogMeta();
}

async function appendActivityLogEntries(newEntries = []) {
  if (!newEntries.length) return;

  const meta = await readActivityLogMeta();
  let chunk = meta.chunks[meta.chunks.length - 1];
  let entries = [];

  if (chunk && chunk.count < ACTIVITY_LOG_CHUNK_SIZE) {
    const data = await getStorage([chunk.key]);
    entries = Array.isArray(data[chunk.key]) ? data[chunk.key] : [];
  } else {
    meta.seq += 1;
    chunk = {
      key: `${ACTIVITY_LOG_CHUNK_PREFIX}${meta.seq}`,
      seq: meta.seq,
      count: 0,
      firstTime: newEntries[0].time || Date.now(),
      lastTime: 0
    };
    meta.chunks.push(chunk);
  }

  entries.push(...newEntries);
  chunk.count = entries.length;
  chunk.lastTime = entries[entries.length - 1].time || Date.now();

  const removedKeys = [];
  while (
    meta.chunks.length > ACTIVITY_LOG_MAX_CHUNKS ||
    (meta.chunks.length > 1 && meta.chunks[0].lastTime && Date.now() - meta.chunks[0].lastTime > ACTIVITY_LOG_RETENTION_MS)
  ) {
    removedKeys.push(meta.chunks.shift().key);
  }

  await chrome.storage.local.set({
    [chunk.key]: entries,
    [ACTIVITY_LOG_META_KEY]: meta
  });

  if (removedKeys.length) {
    await chrome.storage.local.remove(removedKeys);
  }
}

async function migrateLegacyActivityLog() {
  const data = await getStorage([ACTIVITY_LOG_KEY]);
  const legacy = Array.isArray(data[ACTIVITY_LOG_KEY]) ? data[ACTIVITY_LOG_KEY] : [];
  if (!legacy.length) return;

  await chrome.storage.local.remove(ACTIVITY_LOG_KEY);
  await appendActivityLogEntries(
    legacy
      .map(entry => ({
        message: String(entry?.message || ''),
        level: entry?.level || 'info',
        time: entry?.time || Date.now()
      }))
      .filter(entry => entry.message)
  );
}

function queueActivityLogWrite(task) {
  activityLogWriteChain = activityLogWriteChain
    .then(task)
    .catch(error => console.warn('[Log] Activity log write failed', error));
  return activityLogWriteChain;
}

async function addActivityLogEntry(message, level = 'info') {
  if (!message) return;

  const entry = { message: String(message), level, time: Date.now() };
  await queueActivityLogWrite(() => appendActivityLogEntries([entry]));
}

function activityLogEntryMatches(entry, filters = {}) {
  const time = entry.time || 0;
  if (Number.isFinite(filters.fromTime) && time < filters.fromTime) return false;
  if (Number.isFinite(filters.toTime) && time > filters.toTime) return false;
  if (filters.level && filters.level !== 'all' && (entry.level || 'info') !== filters.level) return false;
  if (filters.search) {
    if (!String(entry.message || '').toLowerCase().includes(filters.search)) return false;
  }
  return true;
}

function activityLogChunkInWindow(chunk, fromTime, toTime) {
  if (Number.isFinite(fromTime) && chunk.lastTime && chunk.lastTime < fromTime) return false;
  if (Number.isFinite(toTime) && chunk.firstTime && chunk.firstTime > toTime) return false;
  return true;
}

async function readActivityLog({ cursor = null, limit = 100, fromTime, toTime, level, search } = {}) {
  await activityLogWriteChain.catch(() => {});

  const filters = {
    fromTime: Number.isFinite(fromTime) ? fromTime : undefined,
    toTime: Number.isFinite(toTime) ? toTime : undefined,
    level: level || 'all',
    search: search ? String(search).toLowerCase().trim() : ''
  };

  const meta = await readActivityLogMeta();
  const maxSeq = Number.isFinite(cursor) ? cursor : Infinity;
  const chunks = meta.chunks.filter(chunk =>
    chunk.seq < maxSeq && activityLogChunkInWindow(chunk, filters.fromTime, filters.toTime)
  );
  const entries = [];
  let nextCursor = null;
  let index = chunks.length - 1;

  while (index >= 0 && entries.length < limit) {
    const chunk = chunks[index];
    const data = await getStorage([chunk.key]);
    const chunkEntries = Array.isArray(data[chunk.key]) ? data[chunk.key] : [];
    const matching = chunkEntries.filter(entry => activityLogEntryMatches(entry, filters));
    entries.unshift(...matching);
    nextCursor = chunk.seq;
    index -= 1;
  }

  return {
    ok: true,
    entries,
    cursor: nextCursor,
    hasMore: index >= 0
  };
}

async function clearActivityLog() {
  await queueActivityLogWrite(async () => {
    const meta = await readActivityLogMeta();
    const keys = meta.chunks.map(chunk => chunk.key);
    keys.push(ACTIVITY_LOG_META_KEY, ACTIVITY_LOG_KEY);
    await chrome.storage.local.remove(keys);
  });
}

// Migrate the legacy log array before any new entries are appended.
queueActivityLogWrite(migrateLegacyActivityLog);

async function logInboxLabEvent(message, level = 'info') {
  if (!message) return;
  console.log(message);
  chrome.runtime.sendMessage({
    type: 'LOG',
    message,
    level
  }).catch(() => {});
  await addActivityLogEntry(message, level).catch(() => {});
}

async function setBackendWorkerStatus(status = BACKEND_WORKER_STATUSES.disconnected, extra = {}) {
  const safeStatus = Object.values(BACKEND_WORKER_STATUSES).includes(status)
    ? status
    : BACKEND_WORKER_STATUSES.disconnected;

  await chrome.storage.local.set({
    backendWorkerStatus: safeStatus,
    backendWorkerLastUpdate: new Date().toISOString(),
    ...extra
  });
  chrome.runtime.sendMessage({
    type: 'WORKER_STATUS',
    status: safeStatus,
    ...extra
  }).catch(() => {});
}

function isAutomationBusyFromStorage(data = {}) {
  if (data.automationState === 'running' || data.automationState === 'paused') {
    return true;
  }

  const states = data.providerAutomationStates && typeof data.providerAutomationStates === 'object'
    ? data.providerAutomationStates
    : {};
  return hasActiveProviderState(states);
}

function inferProviderFromInboxLabJob(job = {}) {
  const explicitProvider = String(job.provider || '').trim().toLowerCase();
  if (MULTI_PROVIDER_IDS.includes(explicitProvider)) {
    return explicitProvider;
  }

  const email = extractEmail(job.account_email || job.accountEmail || job.account || '');
  if (/@(?:gmail|googlemail)\.com$/i.test(email)) return 'gmail';
  if (/@(?:yahoo|ymail|rocketmail)\.com$/i.test(email)) return 'yahoo';
  if (/@aol\.com$/i.test(email)) return 'aol';
  if (/@(?:outlook|hotmail|live|msn)\.com$/i.test(email)) return 'outlook';

  return '';
}

async function getStoredAutomationSettings() {
  const data = await getStorage(AUTOMATION_SETTING_STORAGE_KEYS);
  const proxySettings = data.proxySettings && typeof data.proxySettings === 'object'
    ? data.proxySettings
    : {};
  const settings = {
    ...DEFAULT_AUTOMATION_SETTINGS,
    ...data
  };

  if (data.enableProxyManager === undefined && proxySettings.enabled !== undefined) {
    settings.enableProxyManager = Boolean(proxySettings.enabled);
  }
  if (data.allowProxyFallback === undefined && proxySettings.allowFallback !== undefined) {
    settings.allowProxyFallback = Boolean(proxySettings.allowFallback);
  }
  if (!data.proxyApplyMode && proxySettings.applyMode) {
    settings.proxyApplyMode = proxySettings.applyMode;
  }
  if (!data.globalProxyId && proxySettings.globalProxyId) {
    settings.globalProxyId = proxySettings.globalProxyId;
  }

  delete settings.proxySettings;
  return settings;
}

async function getWorkerAutomationSettings(job = {}) {
  const storedSettings = await getStoredAutomationSettings();
  const selectedProviders = getSelectedProvidersFromSettings(storedSettings);
  const provider = inferProviderFromInboxLabJob(job)
    || storedSettings.selectedProvider
    || selectedProviders[0]
    || 'gmail';

  return getContinuousRunSettings({
    ...storedSettings,
    selectedProvider: provider,
    selectedProviders: [provider],
    inboxLabJob: {
      ...job,
      provider
    }
  });
}

async function handleAutomationStartFailure(error, selectedProviders = []) {
  if (selectedProviders.length === 1) {
    await postActiveInboxLabJobFailure(error, selectedProviders[0]);
  }
  await stopContinuousMode().catch(() => {});
  await setAutomationState('idle').catch(() => {});
  await clearProxyForStop();
}

async function startAutomationEntryPoint(settings = {}) {
  const runSettings = getContinuousRunSettings(settings || {});
  const selectedProviders = getSelectedProvidersFromSettings(runSettings);
  const starter = selectedProviders.length > 1
    ? startMultiProviderAutomation
    : startAutomationFromBackground;
  const continuousSettings = { ...runSettings };
  delete continuousSettings.inboxLabJob;

  await setContinuousModeActive(continuousSettings);
  return starter(runSettings);
}

async function ensureBackendWorkerAlarm() {
  if (!chrome.alarms) return;

  const existing = await chrome.alarms.get(BACKEND_WORKER_ALARM_NAME).catch(() => null);
  if (!existing) {
    await chrome.alarms.create(BACKEND_WORKER_ALARM_NAME, {
      periodInMinutes: BACKEND_WORKER_ALARM_PERIOD_MINUTES
    });
  }
}

async function clearBackendWorkerAlarm() {
  if (!chrome.alarms) return;
  await chrome.alarms.clear(BACKEND_WORKER_ALARM_NAME);
}

async function stopBackendWorker(status = BACKEND_WORKER_STATUSES.stopped, extra = {}) {
  if (backendWorkerTimer) {
    clearInterval(backendWorkerTimer);
    backendWorkerTimer = null;
  }
  backendWorkerPollInFlight = false;
  await clearBackendWorkerAlarm().catch(() => {});
  await setBackendWorkerStatus(status, extra);
}

async function startBackendWorker() {
  const data = await getStorage([
    'backendConnectionStatus',
    'backendWorkerEnabled',
    'backendWorkerStatus'
  ]);

  if (data.backendConnectionStatus !== 'Online') {
    await stopBackendWorker(BACKEND_WORKER_STATUSES.disconnected);
    return;
  }

  if (data.backendWorkerEnabled === false) {
    await stopBackendWorker(BACKEND_WORKER_STATUSES.stopped);
    return;
  }

  if (!backendWorkerTimer) {
    backendWorkerTimer = setInterval(() => {
      pollBackendWorker().catch(error => {
        console.warn('[Worker] Poll failed', error);
      });
    }, BACKEND_WORKER_POLL_INTERVAL_MS);
  }

  await ensureBackendWorkerAlarm().catch(error => {
    console.warn('[Worker] Alarm setup failed', error);
  });

  if (data.backendWorkerStatus !== BACKEND_WORKER_STATUSES.running && data.backendWorkerStatus !== BACKEND_WORKER_STATUSES.paused) {
    await setBackendWorkerStatus(BACKEND_WORKER_STATUSES.idle);
  }

  pollBackendWorker().catch(error => {
    console.warn('[Worker] Immediate poll failed', error);
  });
}

async function syncBackendWorkerLifecycle() {
  const data = await getStorage(['backendConnectionStatus', 'backendWorkerEnabled']);

  if (data.backendConnectionStatus === 'Online' && data.backendWorkerEnabled !== false) {
    await startBackendWorker();
  } else if (data.backendConnectionStatus !== 'Online') {
    await stopBackendWorker(BACKEND_WORKER_STATUSES.disconnected);
  } else {
    await stopBackendWorker(BACKEND_WORKER_STATUSES.stopped);
  }
}

async function pollBackendWorker() {
  if (backendWorkerPollInFlight) return;
  backendWorkerPollInFlight = true;

  try {
    const gate = await getStorage([
      'backendConnectionStatus',
      'backendWorkerEnabled',
      'backendWorkerStatus',
      'automationState',
      'providerAutomationStates'
    ]);

    if (gate.backendConnectionStatus !== 'Online') {
      await stopBackendWorker(BACKEND_WORKER_STATUSES.disconnected);
      return;
    }

    if (gate.backendWorkerEnabled === false) {
      await stopBackendWorker(BACKEND_WORKER_STATUSES.stopped);
      return;
    }

    await flushPendingInboxLabResults();

    if (isAutomationBusyFromStorage(gate) || await isAutomationSessionActive()) {
      return;
    }

    const job = await claimInboxLabJob(gate, { silent: true });
    if (!job) {
      if (gate.backendWorkerStatus !== BACKEND_WORKER_STATUSES.idle) {
        await setBackendWorkerStatus(BACKEND_WORKER_STATUSES.idle);
      }
      return;
    }

    await handleIncomingBackendWorkerJob(job);
  } catch (error) {
    console.warn('[Worker] Backend poll failed', error);
    await chrome.storage.local.set({
      backendWorkerLastError: sanitizeBackendError(error.message || error),
      backendWorkerLastUpdate: new Date().toISOString()
    }).catch(() => {});
  } finally {
    backendWorkerPollInFlight = false;
  }
}

async function handleIncomingBackendWorkerJob(job = {}) {
  const settings = await getWorkerAutomationSettings(job);
  const selectedProviders = getSelectedProvidersFromSettings(settings);

  await chrome.storage.local.set({
    backendWorkerActiveJob: job,
    backendWorkerLastJobId: job.id || '',
    backendWorkerLastError: ''
  });
  await setBackendWorkerStatus(BACKEND_WORKER_STATUSES.running);

  try {
    await startAutomationEntryPoint(settings);
  } catch (error) {
    await handleAutomationStartFailure(error, selectedProviders);
    await chrome.storage.local.set({ backendWorkerActiveJob: null }).catch(() => {});
    await setBackendWorkerStatus(BACKEND_WORKER_STATUSES.idle, {
      backendWorkerLastError: sanitizeBackendError(error.message || error)
    });
    throw error;
  }
}

async function maybeSetBackendWorkerIdleAfterTerminal() {
  const data = await getStorage([
    'backendConnectionStatus',
    'backendWorkerEnabled',
    'backendWorkerStatus',
    'backendWorkerActiveJob'
  ]);

  if (data.backendWorkerStatus !== BACKEND_WORKER_STATUSES.running && data.backendWorkerStatus !== BACKEND_WORKER_STATUSES.paused) {
    return;
  }

  await chrome.storage.local.set({ backendWorkerActiveJob: null }).catch(() => {});
  if (data.backendConnectionStatus === 'Online' && data.backendWorkerEnabled !== false) {
    await setBackendWorkerStatus(BACKEND_WORKER_STATUSES.idle);
  } else {
    await stopBackendWorker(BACKEND_WORKER_STATUSES.disconnected);
  }
}

async function updateBackendWorkerForControl(action = '') {
  const data = await getStorage([
    'backendConnectionStatus',
    'backendWorkerEnabled',
    'backendWorkerStatus',
    'backendWorkerActiveJob'
  ]);
  const hasWorkerRun = Boolean(data.backendWorkerActiveJob)
    || data.backendWorkerStatus === BACKEND_WORKER_STATUSES.running
    || data.backendWorkerStatus === BACKEND_WORKER_STATUSES.paused;

  if (!hasWorkerRun) return;

  if (action === 'PAUSE') {
    await setBackendWorkerStatus(BACKEND_WORKER_STATUSES.paused);
  } else if (action === 'RESUME') {
    await setBackendWorkerStatus(BACKEND_WORKER_STATUSES.running);
  } else if (action === 'STOP') {
    await chrome.storage.local.set({ backendWorkerActiveJob: null }).catch(() => {});
    if (data.backendConnectionStatus === 'Online' && data.backendWorkerEnabled !== false) {
      await setBackendWorkerStatus(BACKEND_WORKER_STATUSES.idle);
    } else {
      await stopBackendWorker(BACKEND_WORKER_STATUSES.stopped);
    }
  }
}

function normalizeBackendValue(value, fallback, legacyValues = []) {
  const normalized = String(value || '').trim();
  return !normalized || legacyValues.includes(normalized) ? fallback : normalized;
}

function normalizeBackendConnectorConfig(config = {}) {
  return {
    baseUrl: normalizeBackendValue(config.baseUrl || config.backendBaseUrl, DEFAULT_BACKEND_BASE_URL, LEGACY_BACKEND_BASE_URLS),
    connectorId: normalizeBackendValue(config.connectorId || config.backendConnectorId, DEFAULT_BACKEND_CONNECTOR_ID, LEGACY_BACKEND_CONNECTOR_IDS),
    token: normalizeBackendValue(config.token || config.backendToken, DEFAULT_BACKEND_TOKEN, LEGACY_BACKEND_TOKENS),
    account: normalizeBackendValue(config.account || config.backendAccount, DEFAULT_BACKEND_ACCOUNT),
  };
}

async function migrateStoredBackendConnectorDefaults() {
  const data = await getStorage([
    'backendBaseUrl',
    'backendConnectorId',
    'backendToken',
    'backendAccount'
  ]);
  const next = normalizeBackendConnectorConfig(data);
  const current = {
    backendBaseUrl: String(data.backendBaseUrl || '').trim(),
    backendConnectorId: String(data.backendConnectorId || '').trim(),
    backendToken: String(data.backendToken || '').trim(),
    backendAccount: String(data.backendAccount || '').trim(),
  };

  if (
    current.backendBaseUrl === next.baseUrl &&
    current.backendConnectorId === next.connectorId &&
    current.backendToken === next.token &&
    current.backendAccount === next.account
  ) {
    return;
  }

  await chrome.storage.local.set({
    backendBaseUrl: next.baseUrl,
    backendConnectorId: next.connectorId,
    backendToken: next.token,
    backendAccount: next.account,
    backendConnectionStatus: 'Not tested',
    backendLastError: '',
  });
}

function sanitizeBackendError(error = '') {
  const message = String(error || 'Connection failed');
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

async function readBackendResponseSnippet(response) {
  try {
    const text = await response.text();
    return sanitizeBackendError(text.replace(/\s+/g, ' ').trim());
  } catch (error) {
    return '';
  }
}

async function fetchBackendWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function testBackendConnector(config = {}) {
  const backend = normalizeBackendConnectorConfig(config);

  if (!backend.baseUrl || !backend.connectorId || !backend.token || !backend.account) {
    return { ok: false, error: 'Backend URL, Connector ID, Token, and Account are required' };
  }

  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${backend.token}`,
    'X-Connector-ID': backend.connectorId,
    'X-InboxLab-Token': backend.token,
    'X-InboxLab-Account': backend.account,
    'X-Account-Email': backend.account,
  };
  const payload = {
    connectorId: backend.connectorId,
    token: backend.token,
    account: backend.account,
    accountEmail: backend.account,
    source: 'chrome-extension',
    event: 'connect_test',
    timestamp: new Date().toISOString(),
  };
  const attempts = [
    {
      method: 'POST',
      options: {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      },
    },
    {
      method: 'GET',
      options: {
        method: 'GET',
        headers,
      },
    },
  ];
  let lastFailure = 'Connection failed';

  for (const attempt of attempts) {
    try {
      const response = await fetchBackendWithTimeout(backend.baseUrl, attempt.options);
      const responseSnippet = await readBackendResponseSnippet(response);

      if (response.ok) {
        await chrome.storage.local.set({
          backendBaseUrl: backend.baseUrl,
          backendConnectorId: backend.connectorId,
          backendToken: backend.token,
          backendAccount: backend.account,
          backendConnectionStatus: 'Online',
          backendLastCheck: new Date().toISOString(),
          backendLastError: '',
        });
        return {
          ok: true,
          status: response.status,
          method: attempt.method,
        };
      }

      lastFailure = `HTTP ${response.status}${responseSnippet ? `: ${responseSnippet}` : ''}`;
    } catch (error) {
      lastFailure = error.name === 'AbortError'
        ? 'Connection timed out'
        : (error.message || 'Connection failed');
    }
  }

  const safeError = sanitizeBackendError(lastFailure);
  await chrome.storage.local.set({
    backendConnectionStatus: 'Offline',
    backendLastCheck: new Date().toISOString(),
    backendLastError: safeError,
  });
  return { ok: false, error: safeError };
}

function buildInboxLabUrl(baseUrl = '', path = '') {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const suffix = String(path || '').trim();
  return `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

function buildInboxLabHeaders(backend = {}) {
  return {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${backend.token}`,
    'X-Connector-ID': backend.connectorId,
    'X-InboxLab-Token': backend.token,
    'X-InboxLab-Account': backend.account,
    'X-Account-Email': backend.account,
  };
}

async function getBackendConnectorConfig(overrides = {}) {
  const stored = await getStorage([
    'backendBaseUrl',
    'backendConnectorId',
    'backendToken',
    'backendAccount'
  ]);

  return normalizeBackendConnectorConfig({
    ...stored,
    ...overrides
  });
}

async function readBackendJson(response) {
  const text = await response.text().catch(() => '');
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: text };
  }
}

function normalizeInboxLabJob(rawJob = {}) {
  const source = rawJob?.job || rawJob?.data?.job || rawJob?.data || rawJob;
  if (!source || typeof source !== 'object') return null;

  const id = source.id || source.job_id || source.jobId;
  if (!id) return null;

  return {
    id: String(id),
    provider: String(source.provider || '').trim(),
    account_email: extractEmail(source.account_email || source.accountEmail || source.account || ''),
    subject: String(source.subject || '').trim(),
    sender: String(source.sender || source.from || '').trim(),
    instructions: String(source.instructions || source.instruction || source.action || '').trim(),
    folder: String(source.folder || source.mailbox || '').trim(),
    raw: source
  };
}

async function claimInboxLabJob(config = {}, options = {}) {
  const silent = Boolean(options.silent);
  const backend = await getBackendConnectorConfig(config);

  if (!backend.baseUrl || !backend.connectorId || !backend.token) {
    throw new Error('Inbox Lab connector settings are missing');
  }

  const url = buildInboxLabUrl(
    backend.baseUrl,
    `/jobs/claim?connector_id=${encodeURIComponent(backend.connectorId)}&token=${encodeURIComponent(backend.token)}`
  );

  if (!silent) {
    await logInboxLabEvent('[InboxLab] Claiming job', 'info');
  }

  const response = await fetchBackendWithTimeout(url, {
    method: 'GET',
    headers: buildInboxLabHeaders(backend),
  });

  if (response.status === 204) {
    await chrome.storage.local.set({ activeInboxLabJob: null });
    if (!silent) {
      await logInboxLabEvent('[InboxLab] No job available', 'warn');
    }
    return null;
  }

  const body = await readBackendJson(response);

  if (!response.ok) {
    const message = sanitizeBackendError(body.detail || body.error || body.message || body.raw || `HTTP ${response.status}`);
    throw new Error(`Inbox Lab claim failed: ${message}`);
  }

  const job = normalizeInboxLabJob(body);
  if (!job) {
    await chrome.storage.local.set({ activeInboxLabJob: null });
    if (!silent) {
      await logInboxLabEvent('[InboxLab] No job available', 'warn');
    }
    return null;
  }

  await chrome.storage.local.set({
    activeInboxLabJob: job,
    backendConnectionStatus: 'Online',
    backendLastCheck: new Date().toISOString(),
    backendLastError: '',
  });
  await logInboxLabEvent(`[InboxLab] Claimed job ${job.id}${job.subject ? `: ${job.subject}` : ''}`, 'success');

  return job;
}

function isRetryableBackendStatus(status) {
  return status >= 500 || status === 408 || status === 429;
}

async function queuePendingInboxLabResult(job = {}, result = {}, attempts = 1) {
  if (!job?.id) return;

  if (attempts > PENDING_INBOXLAB_RESULT_MAX_ATTEMPTS) {
    await logInboxLabEvent(
      `[InboxLab] Dropping result for job ${job.id} after ${PENDING_INBOXLAB_RESULT_MAX_ATTEMPTS} failed attempts`,
      'error'
    );
    return;
  }

  const data = await getStorage(['pendingInboxLabResults']);
  const queue = Array.isArray(data.pendingInboxLabResults) ? data.pendingInboxLabResults : [];
  const next = queue.filter(item => item?.job?.id !== job.id);
  next.push({ job, result, attempts, queuedAt: new Date().toISOString() });

  await chrome.storage.local.set({
    pendingInboxLabResults: next.slice(-PENDING_INBOXLAB_RESULT_LIMIT)
  });
  await logInboxLabEvent(`[InboxLab] Result for job ${job.id} queued for retry (attempt ${attempts})`, 'warn');
}

async function flushPendingInboxLabResults() {
  const data = await getStorage(['pendingInboxLabResults']);
  const queue = Array.isArray(data.pendingInboxLabResults) ? data.pendingInboxLabResults : [];
  if (!queue.length) return;

  await chrome.storage.local.set({ pendingInboxLabResults: [] });
  for (const item of queue) {
    await postInboxLabJobResult(item.job, item.result, {}, { attempt: item.attempts }).catch(() => {});
  }
}

async function postInboxLabJobResult(job = {}, result = {}, config = {}, options = {}) {
  const attempt = Number.isFinite(options.attempt) ? options.attempt : 0;
  const normalizedJob = normalizeInboxLabJob(job);
  if (!normalizedJob?.id) {
    return { ok: false, error: 'Inbox Lab job id is missing' };
  }

  const backend = await getBackendConnectorConfig(config);
  const url = buildInboxLabUrl(backend.baseUrl, `/jobs/${encodeURIComponent(normalizedJob.id)}/result`);
  const payload = {
    connector_id: backend.connectorId,
    token: backend.token,
    status: result.status || 'completed',
    folder: result.folder || normalizedJob.folder || '',
    summary: result.summary || '',
    provider: result.provider || normalizedJob.provider || '',
    account_email: result.account_email || normalizedJob.account_email || backend.account,
    subject: result.subject || normalizedJob.subject || '',
    links_opened: Number.isFinite(result.linksOpened) ? result.linksOpened : undefined,
    replied: typeof result.replied === 'boolean' ? result.replied : undefined,
    error: result.error || undefined,
  };

  let response;
  try {
    response = await fetchBackendWithTimeout(url, {
      method: 'POST',
      headers: buildInboxLabHeaders(backend),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = sanitizeBackendError(error.message || error);
    await queuePendingInboxLabResult(normalizedJob, result, attempt + 1);
    await chrome.storage.local.set({ activeInboxLabJob: null }).catch(() => {});
    await logInboxLabEvent(`[InboxLab] Result post failed: ${message}. Will retry.`, 'warn');
    return { ok: false, queued: true, error: message };
  }
  const body = await readBackendJson(response);

  if (!response.ok) {
    const message = sanitizeBackendError(body.detail || body.error || body.message || body.raw || `HTTP ${response.status}`);

    if (isRetryableBackendStatus(response.status)) {
      await queuePendingInboxLabResult(normalizedJob, result, attempt + 1);
      await chrome.storage.local.set({ activeInboxLabJob: null }).catch(() => {});
      await logInboxLabEvent(`[InboxLab] Result post failed: ${message}. Will retry.`, 'warn');
      return { ok: false, queued: true, error: message, status: response.status };
    }

    await logInboxLabEvent(`[InboxLab] Result post failed: ${message}`, 'error');
    return { ok: false, error: message, status: response.status };
  }

  await chrome.storage.local.set({
    activeInboxLabJob: null,
    backendConnectionStatus: 'Online',
    backendLastCheck: new Date().toISOString(),
    backendLastError: '',
  });
  await logInboxLabEvent(`[InboxLab] Result posted for job ${normalizedJob.id}`, 'success');
  return { ok: true, status: response.status, body };
}

async function postActiveInboxLabJobFailure(error, provider = '') {
  const data = await getStorage(['activeInboxLabJob']);
  const job = normalizeInboxLabJob(data.activeInboxLabJob || {});
  if (!job?.id) return;
  if (provider && job.provider && job.provider !== provider) return;

  await postInboxLabJobResult(job, {
    status: 'failed',
    provider: job.provider || provider || '',
    folder: job.folder || '',
    subject: job.subject || '',
    account_email: job.account_email || '',
    summary: `Inbox Lab job failed before automation completed: ${error.message || error}`,
    error: error.message || String(error || 'automation_start_failed'),
  }).catch(resultError => {
    console.warn('[InboxLab] Failed to post start failure result', resultError);
  });
}

async function attachInboxLabJobToSettings(provider = '', settings = {}, claimedJob = {}) {
  const job = {
    ...claimedJob,
    provider: claimedJob.provider || provider
  };
  const nextSettings = {
    ...settings,
    selectedProvider: provider,
    inboxLabJob: job,
  };

  if (job.account_email) {
    const data = await getStorage(['discoveredAccounts']);
    const discoveredAccounts = Array.isArray(data.discoveredAccounts) ? data.discoveredAccounts : [];
    const targetAccount = discoveredAccounts.find(account => {
      if (!account || !String(account.id || '').startsWith(`${provider}:`)) return false;
      return extractEmail(`${account.label || ''} ${account.detectedLabel || ''} ${account.id || ''}`) === job.account_email;
    });

    if (targetAccount?.id) {
      nextSettings.enableAccountSwitching = true;
      nextSettings.selectedAccounts = [targetAccount.id];
      nextSettings.currentAccountIndex = 0;
      await logInboxLabEvent(`[InboxLab] Target ${getProviderLabel(provider)} account: ${job.account_email}`, 'info');
    } else {
      await logInboxLabEvent(`[InboxLab] Target ${getProviderLabel(provider)} account not found in discovered accounts: ${job.account_email}`, 'warn');
    }
  }

  return nextSettings;
}

async function prepareInboxLabJobSettings(provider = '', settings = {}) {
  if (!MULTI_PROVIDER_IDS.includes(provider)) return settings;

  if (settings.inboxLabJob?.id) {
    const nextSettings = await attachInboxLabJobToSettings(provider, settings, settings.inboxLabJob);
    await chrome.storage.local.set({ activeInboxLabJob: nextSettings.inboxLabJob }).catch(() => {});
    return nextSettings;
  }

  let job = null;

  try {
    job = await claimInboxLabJob(settings);
  } catch (error) {
    await chrome.storage.local.set({
      activeInboxLabJob: null,
      backendLastError: sanitizeBackendError(error.message || error),
    }).catch(() => {});
    await logInboxLabEvent(`[InboxLab] Job claim failed. Running normal ${getProviderLabel(provider)} automation. ${error.message || error}`, 'warn');
    return {
      ...settings,
      inboxLabJob: null,
    };
  }

  if (!job) {
    await logInboxLabEvent(`[InboxLab] No job claimed. Running normal ${getProviderLabel(provider)} automation.`, 'info');
    return {
      ...settings,
      inboxLabJob: null,
    };
  }

  const nextSettings = await attachInboxLabJobToSettings(provider, settings, job);
  await chrome.storage.local.set({ activeInboxLabJob: nextSettings.inboxLabJob }).catch(() => {});
  return nextSettings;
}

async function logProxyEvent(message, level = 'info') {
  if (!message) return;
  console.log(message);
  chrome.runtime.sendMessage({
    type: 'LOG',
    message,
    level
  }).catch(() => {});
  await addActivityLogEntry(message, level).catch(() => {});
}

function getContinuousDelayMinutes(settings = {}) {
  const parsed = parseInt(settings.continuousDelayMinutes, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_CONTINUOUS_DELAY_MINUTES;
  }

  if (parsed < MIN_CONTINUOUS_DELAY_MINUTES) {
    return MIN_CONTINUOUS_DELAY_MINUTES;
  }

  if (parsed > MAX_CONTINUOUS_DELAY_MINUTES) {
    return MAX_CONTINUOUS_DELAY_MINUTES;
  }

  return parsed;
}

function isContinuousModeEnabled(settings = {}) {
  return Boolean(settings.enableContinuousMode);
}

function getContinuousRunSettings(settings = {}) {
  const selectedProviders = getSelectedProvidersFromSettings(settings);

  return {
    ...settings,
    selectedProvider: selectedProviders[0] || settings.selectedProvider || 'gmail',
    selectedProviders,
    currentAccountIndex: 0,
    sessionOpened: 0
  };
}

function getStoredContinuousRunSettings(data = {}) {
  const storedSettings = data.settings && typeof data.settings === 'object'
    ? data.settings
    : {};
  const hasTopLevelMode = typeof data.enableContinuousMode === 'boolean';
  const enableContinuousMode = hasTopLevelMode
    ? data.enableContinuousMode
    : Boolean(data.continuousModeActive || storedSettings.enableContinuousMode);
  const continuousDelayMinutes = data.continuousDelayMinutes !== undefined
    ? data.continuousDelayMinutes
    : storedSettings.continuousDelayMinutes;

  return getContinuousRunSettings({
    ...storedSettings,
    enableContinuousMode,
    continuousDelayMinutes
  });
}

async function logContinuousEvent(message, level = 'info') {
  if (!message) return;
  console.log(message);
  chrome.runtime.sendMessage({ type: 'LOG', message, level }).catch(() => {});
  await addActivityLogEntry(message, level).catch(() => {});
}

async function clearContinuousAlarm() {
  if (!chrome.alarms?.clear) return;

  try {
    const result = chrome.alarms.clear(CONTINUOUS_ALARM_NAME);
    if (result && typeof result.then === 'function') {
      await result;
    }
  } catch (error) {
    console.warn('[Continuous] Failed to clear alarm', error);
  }
}

async function createContinuousAlarm(delayMinutes) {
  if (!chrome.alarms?.create) {
    throw new Error('Chrome alarms API is not available. Reload the extension after updating manifest permissions.');
  }

  const result = chrome.alarms.create(CONTINUOUS_ALARM_NAME, {
    delayInMinutes: delayMinutes
  });

  if (result && typeof result.then === 'function') {
    await result;
  }
}

async function setContinuousModeActive(settings = {}) {
  if (!isContinuousModeEnabled(settings)) {
    await clearContinuousAlarm();
    await chrome.storage.local.set({
      enableContinuousMode: false,
      continuousModeActive: false,
      continuousNextRunAt: null
    });
    return;
  }

  const runSettings = getContinuousRunSettings(settings);
  const delayMinutes = getContinuousDelayMinutes(runSettings);

  await clearContinuousAlarm();
  await chrome.storage.local.set({
    enableContinuousMode: true,
    continuousDelayMinutes: delayMinutes,
    continuousModeActive: true,
    continuousNextRunAt: null,
    continuousFailureCount: 0,
    settings: {
      ...runSettings,
      continuousDelayMinutes: delayMinutes
    }
  });

  await logContinuousEvent('[Continuous] Enabled. Next cycle will be scheduled after this run finishes.', 'info');
}

async function stopContinuousMode() {
  await clearContinuousAlarm();
  await chrome.storage.local.set({
    continuousModeActive: false,
    continuousNextRunAt: null
  });
}

async function scheduleContinuousAutomation(settings = {}, reason = 'cycle completed') {
  if (!isContinuousModeEnabled(settings)) {
    await stopContinuousMode();
    return;
  }

  const runSettings = getContinuousRunSettings(settings);
  const delayMinutes = getContinuousDelayMinutes(runSettings);
  const nextRunAt = Date.now() + delayMinutes * 60 * 1000;

  try {
    await createContinuousAlarm(delayMinutes);
  } catch (error) {
    await logContinuousEvent(`[Continuous] Schedule failed: ${error.message}`, 'error');
    throw error;
  }

  await chrome.storage.local.set({
    enableContinuousMode: true,
    continuousDelayMinutes: delayMinutes,
    continuousModeActive: true,
    continuousNextRunAt: nextRunAt,
    continuousLastReason: reason,
    settings: {
      ...runSettings,
      continuousDelayMinutes: delayMinutes
    }
  });

  await logContinuousEvent(`[Continuous] Next cycle scheduled in ${delayMinutes} minute(s).`, 'info');
}

function shouldScheduleContinuousFromUpdate(stateResult = {}) {
  if (!stateResult || stateResult.multi === false) return true;
  return stateResult.automationState === 'idle';
}

async function maybeScheduleContinuousAfterTerminal(stateResult, terminalState = 'done') {
  if (!shouldScheduleContinuousFromUpdate(stateResult)) return;

  const data = await getStorage([
    'settings',
    'automationState',
    'continuousModeActive',
    'enableContinuousMode',
    'continuousDelayMinutes'
  ]);
  const settings = getStoredContinuousRunSettings(data);

  if (data.automationState === 'stopped') return;
  if (!isContinuousModeEnabled(settings)) return;

  await chrome.storage.local.set({ continuousFailureCount: 0 });
  await scheduleContinuousAutomation(
    settings,
    terminalState === 'error' ? 'cycle ended with error' : 'cycle completed'
  );
}

async function handleTerminalAutomationMessage(message = {}, sender = {}, terminalState = 'done') {
  const provider = message.provider || getProviderFromUrl(sender.tab?.url || '');
  const logMessage = terminalState === 'error'
    ? `Error: ${message.message || 'Automation failed'}`
    : 'All unread emails processed';

  const stateResult = await updateProviderAutomationState(provider, terminalState);
  await addActivityLogEntry(prefixProviderMessage(logMessage, provider), terminalState === 'error' ? 'error' : 'success');
  await maybeScheduleContinuousAfterTerminal(stateResult, terminalState);
  if (shouldScheduleContinuousFromUpdate(stateResult)) {
    await maybeSetBackendWorkerIdleAfterTerminal();
  }

  return {
    ok: true,
    received: true,
    continuousChecked: true,
    scheduled: shouldScheduleContinuousFromUpdate(stateResult)
  };
}

function isProxyManagerAvailable() {
  return Boolean(globalThis.ProxyManager && globalThis.ProxyStorage);
}

async function getInitialProxyAccount(settings = {}) {
  const selectedAccounts = Array.isArray(settings.selectedAccounts) ? settings.selectedAccounts : [];
  const currentIndex = Number.isFinite(settings.currentAccountIndex) ? settings.currentAccountIndex : 0;
  const accountId = selectedAccounts[currentIndex] || selectedAccounts[0] || '';

  if (!accountId) return null;

  const data = await getStorage(['discoveredAccounts']);
  const discoveredAccounts = Array.isArray(data.discoveredAccounts) ? data.discoveredAccounts : [];
  return discoveredAccounts.find(account => account.id === accountId) || {
    id: accountId,
    label: accountId,
    provider: settings.selectedProvider || ''
  };
}

async function getActiveAccountFromTab(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, {
    action: 'GET_ACTIVE_ACCOUNT'
  }).catch(() => null);

  return response?.currentAccount || null;
}

async function prepareProxyForAccount(account, settings = {}) {
  if (getProxyApplyMode(settings) !== 'perAccount') {
    return { ok: true, skipped: true };
  }

  if (!isProxyManagerAvailable()) {
    return {
      ok: false,
      proxyFailed: true,
      stopAutomation: true,
      error: 'Proxy Manager is not available'
    };
  }

  if (!account?.id) {
    const error = 'Proxy Manager could not detect the account before automation';
    if (settings.allowProxyFallback) {
      await logProxyEvent(`[Proxy] ${error}. Fallback without proxy is enabled.`, 'warn');
      return { ok: true, fallback: true };
    }

    await logProxyEvent('[Proxy] Proxy failed', 'error');
    return {
      ok: false,
      proxyFailed: true,
      stopAutomation: true,
      error
    };
  }

  return globalThis.ProxyManager.applyForAccount(account, {
    allowFallback: Boolean(settings.allowProxyFallback),
    log: logProxyEvent
  });
}

async function prepareGlobalProxy(settings = {}) {
  if (getProxyApplyMode(settings) !== 'global') {
    return { ok: true, skipped: true };
  }

  if (!isProxyManagerAvailable() || typeof globalThis.ProxyManager.applyGlobalProxy !== 'function') {
    return {
      ok: false,
      proxyFailed: true,
      stopAutomation: true,
      error: 'Proxy Manager global proxy mode is not available'
    };
  }

  const result = await globalThis.ProxyManager.applyGlobalProxy(settings.globalProxyId, {
    log: logProxyEvent
  });

  if (result.ok) return result;

  await logProxyEvent('[Proxy] Proxy failed', 'error');
  if (settings.allowProxyFallback) {
    await clearProxyForStop();
    await logProxyEvent(`[Proxy] ${result.error}. Fallback without proxy is enabled.`, 'warn');
    return { ok: true, fallback: true, error: result.error };
  }

  return {
    ok: false,
    proxyFailed: true,
    stopAutomation: true,
    error: result.error || 'Global proxy failed'
  };
}

async function clearProxyForStop() {
  if (!isProxyManagerAvailable()) return;

  await globalThis.ProxyManager.clearProxy().catch(error => {
    console.warn('[Proxy] Proxy clear failed', error);
  });
}

async function getLiveAutomationStates() {
  const tabs = await chrome.tabs.query({});
  const mailTabs = tabs.filter(tab => tab.id && tab.url && isMailUrl(tab.url));

  const states = await Promise.all(mailTabs.map(async tab => {
    const response = await chrome.tabs
      .sendMessage(tab.id, { action: 'GET_AUTOMATION_STATE' })
      .catch(() => null);

    if (!response || !response.ok) return null;
    return { tabId: tab.id, state: response.state || 'idle' };
  }));

  return states.filter(Boolean);
}

async function isAutomationSessionActive() {
  const data = await getStorage(['automationState']);
  const liveStates = await getLiveAutomationStates();
  const activeState = liveStates.find(item => item.state === 'running' || item.state === 'paused')?.state;

  if (activeState) {
    if (data.automationState !== activeState) {
      await setAutomationState(activeState);
    }

    return true;
  }

  if (data.automationState === 'running' || data.automationState === 'paused') {
    await setAutomationState('idle');
  }

  return false;
}

async function getMailTab(provider = 'gmail') {
  const tabs = await chrome.tabs.query({});
  return tabs.find(tab => tab.id && tab.url && isProviderUrl(tab.url, provider)) || null;
}

async function getOrCreateMailTab(provider = 'gmail') {
  const defaultUrl = getProviderStartUrl(provider);
  let tab = await getMailTab(provider);

  if (tab) {
    if (provider === 'aol' && !tab.url?.includes('/d/folders/1')) {
      tab = await chrome.tabs.update(tab.id, { url: defaultUrl, active: true });
      await waitForTabComplete(tab.id, 60000);
      await delay(2500);
      return chrome.tabs.get(tab.id);
    }

    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => null);
    }
    return tab;
  }

  tab = await chrome.tabs.create({ url: defaultUrl, active: true });
  await waitForTabComplete(tab.id, 60000);
  await delay(2500);
  return chrome.tabs.get(tab.id);
}

async function startAutomationFromBackground(settings = {}) {
  const selectedProvider = settings.selectedProvider || 'gmail';
  settings = await prepareInboxLabJobSettings(selectedProvider, settings);
  let proxyPreparedBeforeOpen = false;
  const proxyMode = getProxyApplyMode(settings);

  if (proxyMode === 'global') {
    const proxyResult = await prepareGlobalProxy(settings);
    if (!proxyResult.ok) {
      throw new Error(proxyResult.error || 'Proxy failed');
    }
    proxyPreparedBeforeOpen = Boolean(proxyResult.applied);
  } else if (proxyMode === 'perAccount') {
    const initialProxyAccount = await getInitialProxyAccount(settings);
    if (initialProxyAccount?.id) {
      const proxyResult = await prepareProxyForAccount(initialProxyAccount, settings);
      if (!proxyResult.ok) {
        throw new Error(proxyResult.error || 'Proxy failed');
      }
      proxyPreparedBeforeOpen = Boolean(proxyResult.applied);
    }
  }

  const tab = await getOrCreateMailTab(selectedProvider);

  if (proxyPreparedBeforeOpen) {
    await chrome.tabs.reload(tab.id);
    await waitForTabComplete(tab.id, 60000);
    await delay(2500);
  }

  await ensureAutomationScripts(tab.id).catch(async () => {
    await delay(1000);
    await ensureAutomationScripts(tab.id);
  });

  if (proxyMode === 'perAccount' && !proxyPreparedBeforeOpen) {
    const activeAccount = await getActiveAccountFromTab(tab.id);
    const proxyResult = await prepareProxyForAccount(activeAccount, settings);
    if (!proxyResult.ok) {
      throw new Error(proxyResult.error || 'Proxy failed');
    }

    if (proxyResult.applied) {
      await chrome.tabs.reload(tab.id);
      await waitForTabComplete(tab.id, 60000);
      await delay(2500);
      await ensureAutomationScripts(tab.id);
    }
  }

  await setAutomationState('running', {
    settings,
    providerAutomationStates: {
      [selectedProvider]: 'running'
    },
    activeProviderTabs: {
      [selectedProvider]: tab.id
    }
  });
  await delay(500);

  const response = await chrome.tabs.sendMessage(tab.id, { action: 'START', settings });
  return { ok: true, tabId: tab.id, response };
}

function getGmailAccountIndexFromUrl(url = '') {
  const match = String(url || '').match(/mail\.google\.com\/mail\/u\/(\d+)(?:\/|#|\?|$)/);
  return match ? parseInt(match[1], 10) : null;
}

function getGmailAccountUrl(index = 0) {
  return `https://mail.google.com/mail/u/${index}/#inbox`;
}

function extractEmail(value = '') {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function extractEmails(value = '') {
  const matches = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
  const seen = new Set();
  const emails = [];

  matches.forEach((email) => {
    const normalized = email.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    emails.push(normalized);
  });

  return emails;
}

function makeGmailAccount(index, email = '') {
  const label = email || `Gmail account ${index + 1}`;
  return {
    id: `gmail:${index}`,
    label,
    detectedLabel: label,
    provider: 'gmail',
    url: getGmailAccountUrl(index)
  };
}

function getAccountProviderId(account = {}) {
  return account.provider || String(account.id || '').split(':')[0] || '';
}

function uniqueAccountsById(accounts = []) {
  const byId = new Map();

  (Array.isArray(accounts) ? accounts : []).forEach((account) => {
    if (!account?.id) return;
    byId.set(account.id, account);
  });

  return Array.from(byId.values());
}

async function getCachedAccountsForProviders(providers = []) {
  const selected = new Set(normalizeProviders(providers));
  const data = await getStorage(['discoveredAccounts']);
  return (Array.isArray(data.discoveredAccounts) ? data.discoveredAccounts : [])
    .filter(account => selected.has(getAccountProviderId(account)));
}

async function saveDiscoveredAccountsForProviders(providers = [], discoveredAccounts = [], options = {}) {
  const selectedProviders = normalizeProviders(providers);
  const selected = new Set(selectedProviders);
  const data = await getStorage(['discoveredAccounts', 'selectedAccounts']);
  const existingAccounts = Array.isArray(data.discoveredAccounts) ? data.discoveredAccounts : [];
  const mergedAccounts = uniqueAccountsById([
    ...existingAccounts.filter(account => !selected.has(getAccountProviderId(account))),
    ...discoveredAccounts
  ]);
  const validIds = new Set(mergedAccounts.map(account => account.id));
  const existingSelected = Array.isArray(data.selectedAccounts) ? data.selectedAccounts : [];
  const selectedAccounts = options.selectDiscoveredAccounts
    ? uniqueAccountsById([
      ...mergedAccounts
        .filter(account => !selected.has(getAccountProviderId(account)) && existingSelected.includes(account.id))
        .map(account => ({ id: account.id })),
      ...discoveredAccounts
        .filter(account => account?.id)
        .map(account => ({ id: account.id }))
    ]).map(account => account.id)
    : existingSelected.filter(accountId => validIds.has(accountId));

  await chrome.storage.local.set({
    discoveredAccounts: mergedAccounts,
    selectedAccounts: selectedAccounts.length ? selectedAccounts : mergedAccounts.map(account => account.id),
    lastAccountDiscovery: {
      providers: selectedProviders,
      accountCount: discoveredAccounts.length,
      totalCachedAccounts: mergedAccounts.length,
      time: Date.now()
    }
  }).catch(() => {});

  return mergedAccounts;
}

async function publishDiscoveredAccountsForProviders(providers = [], discoveredAccounts = [], options = {}) {
  const selectedProviders = normalizeProviders(providers);
  const mergedAccounts = await saveDiscoveredAccountsForProviders(selectedProviders, discoveredAccounts, {
    selectDiscoveredAccounts: Boolean(options.forceDeepScan)
  });

  chrome.runtime.sendMessage({
    type: 'ACCOUNTS_DISCOVERED',
    providers: selectedProviders,
    accounts: mergedAccounts,
    results: options.results || [],
    forceDeepScan: Boolean(options.forceDeepScan),
    partial: Boolean(options.partial)
  }).catch(() => {});

  return mergedAccounts;
}

async function fetchGoogleSignedInAccounts() {
  try {
    const response = await fetch(`${GOOGLE_LIST_ACCOUNTS_URL}&ts=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Google account list failed with HTTP ${response.status}`);
    }

    const text = await response.text();
    const emails = extractEmails(text);

    return emails.map((email, index) => makeGmailAccount(index, email));
  } catch (error) {
    console.warn('[Gmail] Google account list fetch failed', error);
    return [];
  }
}

function mergeGmailDiscoveredAccounts(accounts = []) {
  const byId = new Map();

  accounts.forEach((account) => {
    if (!account?.id) return;

    const existing = byId.get(account.id);
    const hasEmail = Boolean(extractEmail(account.label || ''));
    const existingHasEmail = Boolean(extractEmail(existing?.label || ''));

    if (!existing || (hasEmail && !existingHasEmail)) {
      byId.set(account.id, account);
    }
  });

  function getSortIndex(account) {
    const urlIndex = getGmailAccountIndexFromUrl(account?.url || '');
    if (Number.isFinite(urlIndex)) return urlIndex;

    const idIndex = parseInt(String(account?.id || '').split(':')[1], 10);
    return Number.isFinite(idIndex) ? idIndex : Number.MAX_SAFE_INTEGER;
  }

  return Array.from(byId.values()).sort((a, b) => getSortIndex(a) - getSortIndex(b));
}

async function readGmailAccountFromTab(tabId, index) {
  let currentTab = null;
  const start = Date.now();

  while (Date.now() - start < GMAIL_PROBE_URL_TIMEOUT) {
    currentTab = await chrome.tabs.get(tabId).catch(() => null);
    const actualIndex = getGmailAccountIndexFromUrl(currentTab?.url || '');

    if (actualIndex === index) {
      break;
    }

    if (Number.isFinite(actualIndex) && actualIndex !== index && currentTab?.status === 'complete') {
      return null;
    }

    if (
      currentTab?.url &&
      !currentTab.url.includes('mail.google.com') &&
      !currentTab.url.startsWith('about:')
    ) {
      return null;
    }

    await delay(500);
  }

  const actualIndex = getGmailAccountIndexFromUrl(currentTab?.url || '');

  if (actualIndex !== index) {
    return null;
  }

  const fallbackAccount = makeGmailAccount(index);
  const scriptReady = await Promise.race([
    ensureAutomationScripts(tabId).then(() => true),
    delay(GMAIL_PROBE_CONTENT_TIMEOUT).then(() => false)
  ]).catch(() => false);

  if (!scriptReady) {
    return fallbackAccount;
  }

  const discoveryResponse = await Promise.race([
    chrome.tabs.sendMessage(tabId, { action: 'DISCOVER_ACCOUNTS' }),
    delay(GMAIL_PROBE_CONTENT_TIMEOUT).then(() => null)
  ]).catch(() => null);
  const discovered = Array.isArray(discoveryResponse?.accounts)
    ? discoveryResponse.accounts
    : [];
  const discoveredAccount = discovered.find(account => account.id === `gmail:${index}`);

  if (discoveredAccount?.id) {
    return {
      ...discoveredAccount,
      id: `gmail:${index}`,
      detectedLabel: discoveredAccount.detectedLabel || discoveredAccount.label || fallbackAccount.label,
      provider: 'gmail',
      url: getGmailAccountUrl(index)
    };
  }

  const activeResponse = await Promise.race([
    chrome.tabs.sendMessage(tabId, { action: 'GET_ACTIVE_ACCOUNT' }),
    delay(GMAIL_PROBE_CONTENT_TIMEOUT).then(() => null)
  ]).catch(() => null);

  const account = activeResponse?.currentAccount || {};
  const labelEmail = extractEmail(`${account.label || ''} ${account.id || ''} ${account.url || ''}`);
  const label = labelEmail || account.label || fallbackAccount.label;

  return {
    id: `gmail:${index}`,
    label,
    detectedLabel: label,
    provider: 'gmail',
    url: getGmailAccountUrl(index)
  };
}

async function discoverGmailAccountsByIndexProbe(existingTab, seedAccounts = []) {
  const accounts = Array.isArray(seedAccounts) ? [...seedAccounts] : [];
  const existingIndex = getGmailAccountIndexFromUrl(existingTab?.url || '');
  let consecutiveMisses = 0;
  const probeStartMessage = '[Gmail] Checking signed-in Gmail account slots';
  chrome.runtime.sendMessage({ type: 'LOG', message: probeStartMessage, level: 'info', provider: 'gmail' }).catch(() => {});
  addActivityLogEntry(probeStartMessage, 'info').catch(() => {});

  for (let index = 0; index <= GMAIL_PROBE_MAX_INDEX; index++) {
    let tab = null;
    let shouldClose = false;

    try {
      if (existingTab?.id && existingIndex === index) {
        tab = existingTab;
      } else {
        tab = await chrome.tabs.create({
          url: getGmailAccountUrl(index),
          active: false
        });
        shouldClose = true;
        await waitForTabComplete(tab.id, GMAIL_PROBE_URL_TIMEOUT).catch(() => false);
        await delay(500);
      }

      const account = await readGmailAccountFromTab(tab.id, index);

      if (account) {
        accounts.push(account);
        consecutiveMisses = 0;
        await publishDiscoveredAccountsForProviders(
          ['gmail'],
          mergeGmailDiscoveredAccounts(accounts),
          { forceDeepScan: true, partial: true }
        );
      } else {
        consecutiveMisses += 1;
      }
    } catch (error) {
      consecutiveMisses += 1;
      console.warn(`[Gmail] Account probe failed for /mail/u/${index}`, error);
    } finally {
      if (shouldClose && tab?.id) {
        await chrome.tabs.remove(tab.id).catch(() => null);
      }
    }

    if (consecutiveMisses >= GMAIL_PROBE_CONSECUTIVE_MISS_LIMIT) {
      const stopMessage = `[Gmail] Deep scan stopped after ${consecutiveMisses} empty slot(s)`;
      chrome.runtime.sendMessage({ type: 'LOG', message: stopMessage, level: 'info', provider: 'gmail' }).catch(() => {});
      addActivityLogEntry(stopMessage, 'info').catch(() => {});
      break;
    }
  }

  const mergedAccounts = mergeGmailDiscoveredAccounts(accounts);
  const exactEmailCount = mergedAccounts.filter(account => extractEmail(account.label || '')).length;
  const summaryLevel = mergedAccounts.length ? 'success' : 'warn';
  const summaryMessage = mergedAccounts.length
    ? `[Gmail] Found ${mergedAccounts.length} Gmail account slot(s)`
    : '[Gmail] No signed-in Gmail account slots found';
  chrome.runtime.sendMessage({ type: 'LOG', message: summaryMessage, level: summaryLevel, provider: 'gmail' }).catch(() => {});
  addActivityLogEntry(summaryMessage, summaryLevel).catch(() => {});

  if (mergedAccounts.length && exactEmailCount < mergedAccounts.length) {
    const labelMessage = '[Gmail] Some Gmail email labels were hidden by Google; edit those account labels in the popup if needed.';
    chrome.runtime.sendMessage({ type: 'LOG', message: labelMessage, level: 'info', provider: 'gmail' }).catch(() => {});
    addActivityLogEntry(labelMessage, 'info').catch(() => {});
  }

  return mergedAccounts;
}

async function discoverAccountsForProvider(provider, options = {}) {
  const result = {
    provider,
    ok: false,
    accounts: [],
    warning: ''
  };
  let gmailSeedAccounts = [];

  try {
    if (provider === 'gmail') {
      const cachedGmailAccounts = options.forceDeepScan
        ? []
        : await getCachedAccountsForProviders(['gmail']);

      if (cachedGmailAccounts.length) {
        result.ok = true;
        result.accounts = cachedGmailAccounts.map(account => ({
          ...account,
          provider: 'gmail'
        }));
        result.fromCache = true;
        const message = `[Gmail] Loaded ${cachedGmailAccounts.length} cached account(s). Use Deep Scan Gmail to re-detect.`;
        chrome.runtime.sendMessage({ type: 'LOG', message, level: 'success', provider }).catch(() => {});
        addActivityLogEntry(message, 'success').catch(() => {});
        return result;
      }

      if (!options.forceDeepScan) {
        result.ok = true;
        result.warning = 'No cached Gmail accounts yet. Run Deep Scan Gmail once to detect signed-in Gmail accounts.';
        return result;
      }

      gmailSeedAccounts = await fetchGoogleSignedInAccounts();

      if (gmailSeedAccounts.length) {
        const message = `[Gmail] Detected ${gmailSeedAccounts.length} signed-in Google account email(s)`;
        chrome.runtime.sendMessage({ type: 'LOG', message, level: 'success', provider }).catch(() => {});
        addActivityLogEntry(message, 'success').catch(() => {});
      }
    }

    const tab = await getOrCreateMailTab(provider);

    if (tab?.url && isProviderLoginUrl(tab.url, provider)) {
      result.warning = getProviderLoginFailure(provider);
      return result;
    }

    if (tab?.url && !isProviderUrl(tab.url, provider)) {
      result.warning = `${getProviderLabel(provider)} requires manual login. Please sign in manually, then refresh accounts.`;
      return result;
    }

    await ensureAutomationScripts(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'DISCOVER_ACCOUNTS' });
    let accounts = Array.isArray(response?.accounts) ? response.accounts : [];

    if (provider === 'gmail') {
      accounts = await discoverGmailAccountsByIndexProbe(
        tab,
        mergeGmailDiscoveredAccounts([...gmailSeedAccounts, ...accounts])
      );
    }

    result.ok = true;
    result.accounts = accounts.map(account => ({
      ...account,
      provider: account.provider || provider
    }));
    return result;
  } catch (error) {
    result.warning = provider === 'aol'
      ? 'AOL requires manual login. Please sign in manually, then restart AOL automation.'
      : `${getProviderLabel(provider)} account detection failed: ${error.message}`;
    return result;
  }
}

async function discoverAccountsForProviders(providers = [], options = {}) {
  const selectedProviders = normalizeProviders(providers);
  const results = [];
  const accounts = [];

  for (const provider of selectedProviders) {
    const result = await discoverAccountsForProvider(provider, options);
    results.push(result);
    accounts.push(...result.accounts);

    if (result.warning) {
      const level = provider === 'aol' ? 'warn' : (result.ok ? 'info' : 'warn');
      const message = prefixProviderMessage(result.warning, provider);
      chrome.runtime.sendMessage({ type: 'LOG', message, level, provider }).catch(() => {});
      addActivityLogEntry(message, level).catch(() => {});
    }
  }

  const mergedAccounts = await saveDiscoveredAccountsForProviders(selectedProviders, accounts, {
    selectDiscoveredAccounts: Boolean(options.forceDeepScan)
  });
  chrome.runtime.sendMessage({
    type: 'ACCOUNTS_DISCOVERED',
    providers: selectedProviders,
    accounts: mergedAccounts,
    results,
    forceDeepScan: Boolean(options.forceDeepScan)
  }).catch(() => {});

  return { ok: true, accounts: mergedAccounts, results };
}

async function startProviderAutomationTab(provider, settings = {}, options = {}) {
  let providerSettings = {
    ...settings,
    selectedProvider: provider,
    selectedAccounts: getProviderSelectedAccounts(settings, provider),
    currentAccountIndex: 0,
    sessionOpened: 0
  };
  providerSettings = await prepareInboxLabJobSettings(provider, providerSettings);

  const tab = await getOrCreateMailTab(provider);

  if (options.reloadAfterProxy) {
    await chrome.tabs.reload(tab.id);
    await waitForTabComplete(tab.id, 60000);
    await delay(2500);
  }

  const currentTab = await chrome.tabs.get(tab.id).catch(() => tab);

  if (currentTab?.url && isProviderLoginUrl(currentTab.url, provider)) {
    throw new Error(getProviderLoginFailure(provider));
  }

  if (currentTab?.url && !isProviderUrl(currentTab.url, provider)) {
    throw new Error(`${getProviderLabel(provider)} requires manual login. Please sign in manually, then restart automation.`);
  }

  await ensureAutomationScripts(tab.id).catch(async () => {
    await delay(1000);
    await ensureAutomationScripts(tab.id);
  });

  await delay(300);
  const response = await chrome.tabs.sendMessage(tab.id, { action: 'START', settings: providerSettings });
  return { ok: true, provider, tabId: tab.id, response };
}

async function startMultiProviderAutomation(settings = {}) {
  const selectedProviders = getSelectedProvidersFromSettings(settings);
  const proxyMode = getProxyApplyMode(settings);

  if (selectedProviders.length <= 1) {
    return startAutomationFromBackground({
      ...settings,
      selectedProvider: selectedProviders[0]
    });
  }

  if (proxyMode === 'perAccount') {
    throw new Error('Parallel multi-provider automation with per-account proxies is not supported in one Chrome profile. Use Same Proxy for All Tabs or run providers sequentially.');
  }

  let reloadAfterProxy = false;
  if (proxyMode === 'global') {
    const proxyResult = await prepareGlobalProxy(settings);
    if (!proxyResult.ok) {
      throw new Error(proxyResult.error || 'Global proxy failed');
    }
    reloadAfterProxy = Boolean(proxyResult.applied);
  }

  const providerAutomationStates = {};
  const activeProviderTabs = {};
  const results = [];

  selectedProviders.forEach((provider) => {
    providerAutomationStates[provider] = 'running';
  });

  await setAutomationState('running', {
    settings: {
      ...settings,
      selectedProviders
    },
    providerAutomationStates,
    activeProviderTabs
  });

  for (const provider of selectedProviders) {
    try {
      const result = await startProviderAutomationTab(provider, settings, { reloadAfterProxy });
      providerAutomationStates[provider] = 'running';
      activeProviderTabs[provider] = result.tabId;
      results.push(result);
      const message = prefixProviderMessage('Automation started', provider);
      chrome.runtime.sendMessage({ type: 'LOG', message, level: 'success', provider }).catch(() => {});
      addActivityLogEntry(message, 'success').catch(() => {});
    } catch (error) {
      await postActiveInboxLabJobFailure(error, provider);
      providerAutomationStates[provider] = 'error';
      const warning = provider === 'aol'
        ? 'AOL requires manual login. Please sign in manually, then restart AOL automation.'
        : error.message;
      const message = prefixProviderMessage(warning, provider);
      results.push({ ok: false, provider, error: warning });
      chrome.runtime.sendMessage({ type: 'LOG', message, level: 'warn', provider }).catch(() => {});
      addActivityLogEntry(message, 'warn').catch(() => {});
    }

    await saveProviderRunSnapshot(providerAutomationStates, activeProviderTabs);
  }

  const started = results.filter(result => result.ok);
  if (!started.length) {
    await setAutomationState('idle', {
      providerAutomationStates,
      activeProviderTabs
    });
    if (proxyMode === 'global') {
      await clearProxyForStop();
    }
    throw new Error('No selected provider automation could be started.');
  }

  return {
    ok: true,
    mode: 'multi-provider',
    tabIds: started.map(result => result.tabId),
    results,
    providerAutomationStates
  };
}

function hasActiveProviderState(states = {}) {
  return Object.values(states).some(state => state === 'running' || state === 'paused');
}

function isTerminalProviderState(state = '') {
  return state === 'done' || state === 'error' || state === 'stopped';
}

async function saveProviderRunSnapshot(providerAutomationStates = {}, activeProviderTabs = {}) {
  const data = await getStorage(['providerAutomationStates', 'activeProviderTabs']);
  const storedStates = data.providerAutomationStates && typeof data.providerAutomationStates === 'object'
    ? { ...data.providerAutomationStates }
    : {};
  const storedTabs = data.activeProviderTabs && typeof data.activeProviderTabs === 'object'
    ? { ...data.activeProviderTabs }
    : {};
  const nextStates = { ...storedStates };

  Object.entries(providerAutomationStates).forEach(([provider, state]) => {
    if (state === 'running' && isTerminalProviderState(nextStates[provider])) return;
    nextStates[provider] = state;
  });

  const nextTabs = { ...storedTabs, ...activeProviderTabs };
  await chrome.storage.local.set({
    providerAutomationStates: nextStates,
    activeProviderTabs: nextTabs
  });

  Object.keys(providerAutomationStates).forEach(key => delete providerAutomationStates[key]);
  Object.assign(providerAutomationStates, nextStates);
  Object.keys(activeProviderTabs).forEach(key => delete activeProviderTabs[key]);
  Object.assign(activeProviderTabs, nextTabs);
}

async function updateProviderAutomationState(provider, state) {
  const data = await getStorage(['providerAutomationStates', 'activeProviderTabs']);
  const states = data.providerAutomationStates && typeof data.providerAutomationStates === 'object'
    ? { ...data.providerAutomationStates }
    : {};
  const providerKeys = Object.keys(states);
  const resolvedProvider = provider || (providerKeys.length === 1 ? providerKeys[0] : '');

  if (!resolvedProvider || !Object.prototype.hasOwnProperty.call(states, resolvedProvider)) {
    await setAutomationState(state === 'done' || state === 'error' ? 'idle' : state);
    await clearProxyForStop();
    return { multi: false, states };
  }

  states[resolvedProvider] = state;
  const nextAutomationState = hasActiveProviderState(states) ? 'running' : 'idle';
  await chrome.storage.local.set({
    providerAutomationStates: states,
    automationState: nextAutomationState
  });

  if (nextAutomationState === 'idle') {
    await clearProxyForStop();
  }

  return { multi: true, states, automationState: nextAutomationState };
}

async function getProviderControlTabs(providers = []) {
  const data = await getStorage(['activeProviderTabs']);
  const activeProviderTabs = data.activeProviderTabs && typeof data.activeProviderTabs === 'object'
    ? data.activeProviderTabs
    : {};
  const selectedProviders = normalizeProviders(providers.length ? providers : Object.keys(activeProviderTabs));
  const tabs = [];

  for (const provider of selectedProviders) {
    const tabId = activeProviderTabs[provider];
    let tab = tabId ? await chrome.tabs.get(tabId).catch(() => null) : null;

    if (!tab || !tab.id || !tab.url || !isProviderUrl(tab.url, provider)) {
      tab = await getMailTab(provider);
    }

    if (tab?.id) {
      tabs.push({ provider, tab });
    }
  }

  return tabs;
}

async function controlProviderAutomations(action, providers = []) {
  const tabs = await getProviderControlTabs(providers);
  const nextState = action === 'PAUSE' ? 'paused' : (action === 'RESUME' ? 'running' : 'stopped');
  const providerAutomationStates = {};

  await Promise.all(tabs.map(({ provider, tab }) => {
    providerAutomationStates[provider] = nextState;
    return chrome.tabs.sendMessage(tab.id, { action }).catch(() => null);
  }));

  if (action === 'STOP') {
    await stopContinuousMode();
    await setAutomationState('stopped', { providerAutomationStates });
    await clearProxyForStop();
  } else {
    await chrome.storage.local.set({
      automationState: nextState,
      providerAutomationStates
    });
  }
  await updateBackendWorkerForControl(action);

  return {
    ok: true,
    action,
    tabsNotified: tabs.length,
    providerAutomationStates
  };
}

async function startContinuousAutomationCycle() {
  const data = await getStorage([
    'settings',
    'automationState',
    'continuousModeActive',
    'enableContinuousMode',
    'continuousDelayMinutes',
    'continuousFailureCount'
  ]);
  const settings = getStoredContinuousRunSettings(data);

  if (!isContinuousModeEnabled(settings)) {
    await stopContinuousMode();
    return;
  }

  const liveSessionActive = await isAutomationSessionActive();
  const stateData = await getStorage(['automationState']);
  if (liveSessionActive || stateData.automationState === 'running' || stateData.automationState === 'paused') {
    await logContinuousEvent('[Continuous] Previous cycle is still active. Delaying next cycle.', 'warn');
    await scheduleContinuousAutomation(settings, 'previous cycle still active');
    return;
  }

  const selectedProviders = getSelectedProvidersFromSettings(settings);
  const starter = selectedProviders.length > 1
    ? startMultiProviderAutomation
    : startAutomationFromBackground;

  await chrome.storage.local.set({
    continuousNextRunAt: null,
    continuousLastRunAt: Date.now(),
    settings
  });

  await logContinuousEvent('[Continuous] Starting next cycle.', 'success');

  try {
    await starter(settings);
    await chrome.storage.local.set({ continuousFailureCount: 0 });
  } catch (error) {
    const failureCount = (parseInt(data.continuousFailureCount, 10) || 0) + 1;
    await setAutomationState('idle').catch(() => {});
    await clearProxyForStop();

    if (failureCount >= MAX_CONTINUOUS_START_FAILURES) {
      await chrome.storage.local.set({ continuousFailureCount: failureCount });
      await stopContinuousMode();
      await logContinuousEvent(
        `[Continuous] Start failed ${failureCount} time(s): ${error.message}. Continuous mode paused.`,
        'error'
      );
      return;
    }

    await chrome.storage.local.set({ continuousFailureCount: failureCount });
    await logContinuousEvent(
      `[Continuous] Start failed ${failureCount} time(s): ${error.message}. Retrying after delay.`,
      'error'
    );
    await scheduleContinuousAutomation(settings, 'start failed');
  }
}

async function openSafeLinkWorkflow(url, originalTabId, windowId) {
  let linkTab = null;

  try {
    linkTab = await chrome.tabs.create({
      url,
      active: true,
      openerTabId: originalTabId,
      windowId
    });

    await waitForTabComplete(linkTab.id);
    await delay(randomInt(8000, 20000));

    await chrome.tabs.remove(linkTab.id);
    linkTab = null;
    await chrome.tabs.update(originalTabId, { active: true });

    return { ok: true };
  } catch (error) {
    if (linkTab && linkTab.id) {
      try {
        await chrome.tabs.remove(linkTab.id);
      } catch (closeError) {
        // The tab may already be gone.
      }
    }

    try {
      await chrome.tabs.update(originalTabId, { active: true });
    } catch (focusError) {
      // The original mail tab may have been closed.
    }

    return { ok: false, error: error.message };
  }
}

async function clearProcessedHistory() {
  await chrome.storage.local.remove('processedEmails');
  const tabs = await chrome.tabs.query({});
  const mailTabs = tabs.filter(tab => tab.id && tab.url && isMailUrl(tab.url));

  await Promise.all(mailTabs.map(tab =>
    chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_PROCESSED_CACHE' }).catch(() => null)
  ));

  return { ok: true, tabsNotified: mailTabs.length };
}

async function injectAutomationScripts(tabId) {
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

async function ensureAutomationScripts(tabId) {
  const ping = await chrome.tabs.sendMessage(tabId, { action: 'PING' }).catch(() => null);
  if (ping && ping.ok && ping.version === CONTENT_SCRIPT_VERSION) return;

  if (ping && ping.ok && ping.version !== CONTENT_SCRIPT_VERSION) {
    await chrome.tabs.reload(tabId);
    await waitForTabComplete(tabId, 60000);
    await delay(2500);

    const freshPing = await chrome.tabs.sendMessage(tabId, { action: 'PING' }).catch(() => null);
    if (freshPing && freshPing.ok && freshPing.version === CONTENT_SCRIPT_VERSION) return;
  }

  await injectAutomationScripts(tabId);
}

function getSwitchUrl(account) {
  if (!account) return null;

  if (account.provider === 'gmail' || account.id?.startsWith('gmail:')) {
    const match = account.id.match(/^gmail:(\d+)$/);
    if (match) {
      return `https://mail.google.com/mail/u/${match[1]}/#inbox`;
    }
  }

  if (!account.url) return null;

  try {
    const parsed = new URL(account.url);
    return isMailUrl(parsed.href) ? parsed.href : null;
  } catch (error) {
    return null;
  }
}

function getAccountProvider(account) {
  if (account?.provider) return account.provider;
  const id = account?.id || '';
  const match = id.match(/^([^:]+):/);
  return match ? match[1] : '';
}

function usesProviderContentSwitch(account) {
  const provider = getAccountProvider(account);
  return account?.switchMethod === 'provider' || ['yahoo', 'outlook', 'aol'].includes(provider);
}

function getProviderLoginFailure(provider) {
  if (provider === 'gmail') {
    return 'Gmail requires manual login. Please sign in manually, then refresh accounts or restart automation.';
  }
  if (provider === 'yahoo') {
    return 'Yahoo account switch failed: account must already be signed in and visible in account menu.';
  }
  if (provider === 'outlook') {
    return 'Outlook account switch failed: account must already be signed in and visible in account menu.';
  }
  if (provider === 'aol') {
    return 'AOL requires manual login for this account. Please sign in manually, then restart automation.';
  }
  return 'Inbox did not finish loading after account switch';
}

function isProviderLoginUrl(url = '', provider = '') {
  if (provider === 'gmail') return url.includes('accounts.google.com');
  if (provider === 'yahoo') return url.includes('login.yahoo.com');
  if (provider === 'outlook') return url.includes('login.live.com') || url.includes('login.microsoftonline.com');
  if (provider === 'aol') return url.includes('login.aol.com') || url.includes('login.yahoo.com');
  return false;
}

function logAccountSwitchFailure(message) {
  chrome.runtime.sendMessage({
    type: 'LOG',
    message,
    level: 'warn'
  }).catch(() => {});
  addActivityLogEntry(message, 'warn').catch(() => {});
}

async function waitForProviderSwitchResult(tabId, provider, expectedAccount, timeout = 60000) {
  const start = Date.now();
  const initialTab = await chrome.tabs.get(tabId).catch(() => null);
  const initialUrl = initialTab?.url || '';
  const initialTitle = initialTab?.title || '';
  let sawTransition = false;

  while (Date.now() - start < timeout) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const changedPage =
      tab?.url !== initialUrl ||
      tab?.title !== initialTitle ||
      tab?.status === 'loading';

    if (changedPage) {
      sawTransition = true;
    }

    if (tab?.url && isProviderUrl(tab.url, provider) && tab.status === 'complete' && sawTransition) {
      if (expectedAccount?.id) {
        const verification = await chrome.tabs.sendMessage(tabId, {
          action: 'GET_ACTIVE_ACCOUNT'
        }).catch(() => null);

        if (!verification?.currentAccount?.id || verification.currentAccount.id === expectedAccount.id) {
          return { ok: true };
        }
      } else {
        return { ok: true };
      }
    }

    if (tab?.url && isProviderLoginUrl(tab.url, provider) && Date.now() - start > 8000) {
      return { ok: false, error: getProviderLoginFailure(provider) };
    }

    await delay(500);
  }

  return { ok: false, error: getProviderLoginFailure(provider) };
}

async function waitForGmailSwitchResult(tabId, expectedAccount, timeout = 45000) {
  const expectedIndexMatch = String(expectedAccount?.id || '').match(/^gmail:(\d+)$/);
  const expectedIndex = expectedIndexMatch ? parseInt(expectedIndexMatch[1], 10) : null;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const url = tab?.url || '';

    if (url && isProviderLoginUrl(url, 'gmail') && Date.now() - start > 5000) {
      return { ok: false, error: getProviderLoginFailure('gmail') };
    }

    if (url && isProviderUrl(url, 'gmail') && tab.status === 'complete') {
      const currentIndex = getGmailAccountIndexFromUrl(url);
      if (!Number.isFinite(expectedIndex) || currentIndex === expectedIndex) {
        return { ok: true };
      }

      if (Number.isFinite(currentIndex) && currentIndex !== expectedIndex && Date.now() - start > 5000) {
        return {
          ok: false,
          error: `Gmail switched to account ${currentIndex + 1}, not ${expectedIndex + 1}. Make sure that Gmail account is signed in.`
        };
      }
    }

    await delay(500);
  }

  return { ok: false, error: getProviderLoginFailure('gmail') };
}

async function restartAutomationInTab(tabId, settings = {}) {
  await ensureAutomationScripts(tabId).catch(async () => {
    await delay(1000);
    await ensureAutomationScripts(tabId);
  });

  await delay(500);

  const response = await chrome.tabs.sendMessage(tabId, {
    action: 'START',
    settings
  }).catch(async () => {
    await ensureAutomationScripts(tabId);
    await delay(500);
    return chrome.tabs.sendMessage(tabId, { action: 'START', settings });
  });

  return response || { ok: true };
}

async function switchMailAccount(tabId, account, settings) {
  const provider = getAccountProvider(account);
  const proxyResult = await prepareProxyForAccount(account, settings || {});

  if (!proxyResult.ok) {
    return proxyResult;
  }

  if (usesProviderContentSwitch(account)) {
    await ensureAutomationScripts(tabId);

    const result = await chrome.tabs.sendMessage(tabId, {
      action: 'SWITCH_PROVIDER_ACCOUNT',
      account
    }).catch(error => ({ ok: false, error: error.message }));

    if (!result || !result.ok) {
      return { ok: false, error: result?.error || 'Provider account switch failed' };
    }

    await delay(1200);
    const loaded = await waitForProviderSwitchResult(tabId, provider, account, 60000);

    if (!loaded.ok) {
      logAccountSwitchFailure(loaded.error);
      return { ok: false, error: loaded.error };
    }

    await delay(1500);

    const storedState = await getStorage(['automationState']);
    if (storedState.automationState === 'stopped') {
      return { ok: true, stopped: true };
    }

    await restartAutomationInTab(tabId, settings);

    chrome.runtime.sendMessage({
      type: 'LOG',
      message: `Switched to ${account.label || account.id}`,
      level: 'success'
    }).catch(() => {});
    addActivityLogEntry(`Switched to ${account.label || account.id}`, 'success').catch(() => {});

    return { ok: true };
  }

  const url = getSwitchUrl(account);

  if (!url) {
    return { ok: false, error: 'No safe account switch URL available' };
  }

  await chrome.tabs.update(tabId, { url, active: true });
  const loaded = provider === 'gmail'
    ? await waitForGmailSwitchResult(tabId, account, 45000)
    : { ok: await waitForTabComplete(tabId, 45000) };

  if (!loaded.ok) {
    return { ok: false, error: loaded.error || 'Inbox did not finish loading after account switch' };
  }

  await delay(1500);

  const storedState = await getStorage(['automationState']);
  if (storedState.automationState === 'stopped') {
    return { ok: true, stopped: true };
  }

  await restartAutomationInTab(tabId, settings);

  chrome.runtime.sendMessage({
    type: 'LOG',
    message: `Switched to ${account.label || account.id}`,
    level: 'success'
  }).catch(() => {});
  addActivityLogEntry(`Switched to ${account.label || account.id}`, 'success').catch(() => {});

  return { ok: true };
}

// Relay messages from content scripts to popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LOG') {
    addActivityLogEntry(prefixProviderMessage(message.message, message.provider), message.level || 'info').catch(() => {});
  }

  if (message.type === 'ERROR') {
    handleTerminalAutomationMessage(message, sender, 'error')
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.type === 'EMAIL_OPENED') {
    const count = message.count || 0;
    const provider = message.provider || getProviderFromUrl(sender.tab?.url || '');
    addActivityLogEntry(prefixProviderMessage(`Opened: ${message.subject || 'Email #' + count}`, provider), 'success').catch(() => {});
  }

  if (message.type === 'DONE') {
    handleTerminalAutomationMessage(message, sender, 'done')
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.action === 'APPEND_ACTIVITY_LOG') {
    addActivityLogEntry(String(message.message || ''), message.level || 'info')
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.action === 'GET_ACTIVITY_LOG') {
    readActivityLog({
      cursor: message.cursor,
      limit: message.limit,
      fromTime: message.fromTime,
      toTime: message.toTime,
      level: message.level,
      search: message.search
    })
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message, entries: [], hasMore: false }));

    return true;
  }

  if (message.action === 'CLEAR_ACTIVITY_LOG') {
    clearActivityLog()
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.action === 'START_AUTOMATION') {
    const settings = getContinuousRunSettings(message.settings || {});
    const selectedProviders = getSelectedProvidersFromSettings(settings);

    startAutomationEntryPoint(settings)
      .then(sendResponse)
      .catch(async error => {
        await handleAutomationStartFailure(error, selectedProviders);
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  }

  if (message.action === 'OPEN_SAFE_LINK') {
    const originalTabId = sender.tab && sender.tab.id;
    const windowId = sender.tab && sender.tab.windowId;

    if (!originalTabId) {
      sendResponse({ ok: false, error: 'Original email tab not found' });
      return true;
    }

    openSafeLinkWorkflow(message.url, originalTabId, windowId)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.action === 'SWITCH_MAIL_ACCOUNT') {
    const tabId = sender.tab && sender.tab.id;

    if (!tabId) {
      sendResponse({ ok: false, error: 'Original email tab not found' });
      return true;
    }

    switchMailAccount(tabId, message.account, message.settings)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.action === 'CLEAR_PROCESSED_HISTORY') {
    clearProcessedHistory()
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.action === 'TEST_BACKEND_CONNECTOR') {
    setBackendWorkerStatus(BACKEND_WORKER_STATUSES.connecting).catch(() => {});
    testBackendConnector(message.backend || {})
      .then(async result => {
        if (result.ok) {
          await chrome.storage.local.set({ backendWorkerEnabled: true });
          await startBackendWorker();
        } else {
          await stopBackendWorker(BACKEND_WORKER_STATUSES.disconnected, {
            backendWorkerLastError: result.error || 'Connection failed'
          });
        }
        return result;
      })
      .then(sendResponse)
      .catch(async error => {
        await stopBackendWorker(BACKEND_WORKER_STATUSES.disconnected, {
          backendWorkerLastError: sanitizeBackendError(error.message || error)
        }).catch(() => {});
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  }

  if (message.action === 'INBOX_LAB_JOB_RESULT') {
    postInboxLabJobResult(message.job || {}, message.result || {}, message.backend || {})
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.action === 'DISCOVER_PROVIDER_ACCOUNTS') {
    discoverAccountsForProviders(message.providers || [], {
      forceDeepScan: Boolean(message.forceDeepScan)
    })
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message, accounts: [], results: [] }));

    return true;
  }

  if (message.action === 'PAUSE_AUTOMATION_ALL' || message.action === 'RESUME_AUTOMATION_ALL' || message.action === 'STOP_AUTOMATION_ALL') {
    const action = message.action === 'PAUSE_AUTOMATION_ALL'
      ? 'PAUSE'
      : (message.action === 'RESUME_AUTOMATION_ALL' ? 'RESUME' : 'STOP');

    controlProviderAutomations(action, message.providers || [])
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.action === 'STOP_CONTINUOUS_MODE') {
    stopContinuousMode()
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.action === 'TEST_PROXY') {
    isAutomationSessionActive()
      .then(active => {
        if (active) {
          return { ok: false, error: 'Stop automation before testing proxies.' };
        }

        if (!isProxyManagerAvailable()) {
          return { ok: false, error: 'Proxy Manager is not available' };
        }

        return globalThis.ProxyManager.testProxy(message.proxyId);
      })
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.action === 'CLEAR_PROXY') {
    clearProxyForStop()
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  // If message is from a content script (has sender.tab), relay only command-style
  // messages. Status/log messages with a `type` already go directly to the popup.
  if (sender.tab && !message.type) {
    // Forward to popup
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup may be closed — ignore
    });
  }

  sendResponse({ received: true });
  return true;
});

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CONTINUOUS_ALARM_NAME) {
      startContinuousAutomationCycle().catch(error => {
        logContinuousEvent(`[Continuous] Alarm failed: ${error.message}`, 'error').catch(() => {});
      });
      return;
    }

    if (alarm.name === BACKEND_WORKER_ALARM_NAME) {
      // Watchdog: if Chrome killed the service worker (and with it the 5s poll
      // interval), this alarm wakes it and syncBackendWorkerLifecycle recreates
      // the interval and polls immediately.
      syncBackendWorkerLifecycle().catch(error => {
        console.warn('[Worker] Watchdog sync failed', error);
      });
    }
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!changes.backendConnectionStatus && !changes.backendWorkerEnabled) return;

  syncBackendWorkerLifecycle().catch(error => {
    console.warn('[Worker] Lifecycle sync failed', error);
  });
});

// Handle extension install
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.local.set({
      readTime: 4,
      selectedProvider: 'gmail',
      selectedProviders: ['gmail'],
      backendBaseUrl: DEFAULT_BACKEND_BASE_URL,
      backendConnectorId: DEFAULT_BACKEND_CONNECTOR_ID,
      backendToken: DEFAULT_BACKEND_TOKEN,
      backendAccount: DEFAULT_BACKEND_ACCOUNT,
      backendConnectionStatus: 'Not tested',
      backendWorkerEnabled: true,
      backendWorkerStatus: BACKEND_WORKER_STATUSES.disconnected,
      backDelay: 2,
      autoRefresh: true,
      enableContinuousMode: false,
      continuousDelayMinutes: DEFAULT_CONTINUOUS_DELAY_MINUTES,
      randomEmailOpening: false,
      retryEmailOpening: true,
      manualActivityPause: true,
      processGmailPromotions: true,
      gmailPromotionsPageLimit: 1,
      gmailInboxPageLimit: 3,
      maxEmails: 10,
      maxLinksPerEmail: 1,
      enableLinkOpening: true,
      enableAutoReply: true,
      enableProcessedTracking: true,
      reprocessingMode: 'never',
      enableAccountSwitching: false,
      enableProxyManager: false,
      allowProxyFallback: false,
      proxyApplyMode: 'off',
      globalProxyId: '',
      selectedAccounts: [],
      discoveredAccounts: [],
      proxyConfigs: [],
      accountProxyMap: {},
      proxySettings: {
        enabled: false,
        allowFallback: false,
        applyMode: 'off',
        globalProxyId: ''
      },
      replyTemplates: [],
      automationTemplates: [],
      selectedAutomationTemplate: '',
      emailsOpened: 0,
      automationState: 'idle',
      continuousModeActive: false,
      continuousNextRunAt: null,
      continuousFailureCount: 0,
      providerAutomationStates: {},
      activeProviderTabs: {}
    });

    // Open Gmail on first install
    chrome.tabs.create({ url: 'https://mail.google.com' });
  } else {
    migrateStoredBackendConnectorDefaults().catch(error => {
      console.warn('[Backend] Connector default migration failed', error);
    });
    syncBackendWorkerLifecycle().catch(error => {
      console.warn('[Worker] Lifecycle sync failed', error);
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  migrateStoredBackendConnectorDefaults().catch(error => {
    console.warn('[Backend] Connector default migration failed', error);
  });
  syncBackendWorkerLifecycle().catch(error => {
    console.warn('[Worker] Lifecycle sync failed', error);
  });
});

syncBackendWorkerLifecycle().catch(error => {
  console.warn('[Worker] Initial lifecycle sync failed', error);
});

console.log('[EmailReadAutomate] Background service worker running.');
