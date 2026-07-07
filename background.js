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
const ACTIVITY_LOG_KEY = 'activityLogEntries';
const MAX_ACTIVITY_LOG_ENTRIES = 200;
const CONTINUOUS_ALARM_NAME = 'emailReadAutomate.continuousLoop';
const DEFAULT_CONTINUOUS_DELAY_MINUTES = 10;
const MIN_CONTINUOUS_DELAY_MINUTES = 1;
const MAX_CONTINUOUS_DELAY_MINUTES = 240;
const MAX_CONTINUOUS_START_FAILURES = 3;

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

async function addActivityLogEntry(message, level = 'info') {
  if (!message) return;

  const data = await getStorage([ACTIVITY_LOG_KEY]);
  const entries = Array.isArray(data[ACTIVITY_LOG_KEY]) ? data[ACTIVITY_LOG_KEY] : [];
  entries.push({
    message: String(message),
    level,
    time: Date.now()
  });

  await chrome.storage.local.set({
    [ACTIVITY_LOG_KEY]: entries.slice(-MAX_ACTIVITY_LOG_ENTRIES)
  });
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
  const providerSettings = {
    ...settings,
    selectedProvider: provider,
    selectedAccounts: getProviderSelectedAccounts(settings, provider),
    currentAccountIndex: 0,
    sessionOpened: 0
  };

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

  if (message.action === 'START_AUTOMATION') {
    const settings = getContinuousRunSettings(message.settings || {});
    const selectedProviders = getSelectedProvidersFromSettings(settings);
    const starter = selectedProviders.length > 1
      ? startMultiProviderAutomation
      : startAutomationFromBackground;

    setContinuousModeActive(settings)
      .then(() => starter(settings))
      .then(sendResponse)
      .catch(async error => {
        await stopContinuousMode().catch(() => {});
        await setAutomationState('idle').catch(() => {});
        await clearProxyForStop();
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
    if (alarm.name !== CONTINUOUS_ALARM_NAME) return;
    startContinuousAutomationCycle().catch(error => {
      logContinuousEvent(`[Continuous] Alarm failed: ${error.message}`, 'error').catch(() => {});
    });
  });
}

// Handle extension install
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.local.set({
      readTime: 4,
      selectedProvider: 'gmail',
      selectedProviders: ['gmail'],
      backDelay: 2,
      autoRefresh: true,
      enableContinuousMode: false,
      continuousDelayMinutes: DEFAULT_CONTINUOUS_DELAY_MINUTES,
      randomEmailOpening: false,
      retryEmailOpening: true,
      manualActivityPause: true,
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
  }
});

console.log('[EmailReadAutomate] Background service worker running.');
