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
const CONTENT_SCRIPT_VERSION = '2026-06-23-proxy-state-fix-v1';
const ACTIVITY_LOG_KEY = 'activityLogEntries';
const MAX_ACTIVITY_LOG_ENTRIES = 200;

const PROVIDER_URLS = {
  gmail: 'https://mail.google.com/mail/u/0/#inbox',
  yahoo: 'https://mail.yahoo.com/n/folders/1?.src=ym&reason=myc',
  aol: 'https://mail.aol.com/d/folders/1',
  outlook: 'https://outlook.live.com/mail/0/',
  proton: 'https://mail.proton.me',
  zoho: 'https://mail.zoho.com'
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
  if (!settings.enableProxyManager) {
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

  if (settings.enableProxyManager) {
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

  if (settings.enableProxyManager && !proxyPreparedBeforeOpen) {
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

  await setAutomationState('running', { settings });
  await delay(500);

  const response = await chrome.tabs.sendMessage(tab.id, { action: 'START', settings });
  return { ok: true, tabId: tab.id, response };
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
  if (!account || !account.url) return null;

  if (account.provider === 'gmail' || account.id?.startsWith('gmail:')) {
    const match = account.id.match(/^gmail:(\d+)$/);
    if (match) {
      return `https://mail.google.com/mail/u/${match[1]}/#inbox`;
    }
  }

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

    try {
      await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    } catch (error) {
      await ensureAutomationScripts(tabId);
    }

    await delay(700);

    const storedState = await getStorage(['automationState']);
    if (storedState.automationState === 'stopped') {
      return { ok: true, stopped: true };
    }

    await chrome.tabs.sendMessage(tabId, { action: 'START', settings });

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
  const loaded = await waitForTabComplete(tabId, 45000);

  if (!loaded) {
    return { ok: false, error: 'Inbox did not finish loading after account switch' };
  }

  await delay(1500);

  try {
    await chrome.tabs.sendMessage(tabId, { action: 'PING' });
  } catch (error) {
    await ensureAutomationScripts(tabId);
  }

  await delay(700);

  const storedState = await getStorage(['automationState']);
  if (storedState.automationState === 'stopped') {
    return { ok: true, stopped: true };
  }

  await chrome.tabs.sendMessage(tabId, { action: 'START', settings });

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
    addActivityLogEntry(message.message, message.level || 'info').catch(() => {});
  }

  if (message.type === 'ERROR') {
    addActivityLogEntry(`Error: ${message.message}`, 'error').catch(() => {});
    setAutomationState('idle').catch(() => {});
    clearProxyForStop().catch(() => {});
  }

  if (message.type === 'EMAIL_OPENED') {
    const count = message.count || 0;
    addActivityLogEntry(`Opened: ${message.subject || 'Email #' + count}`, 'success').catch(() => {});
  }

  if (message.type === 'DONE') {
    setAutomationState('idle').catch(() => {});
    clearProxyForStop().catch(() => {});
    addActivityLogEntry('All unread emails processed ✓', 'success').catch(() => {});
  }

  if (message.action === 'START_AUTOMATION') {
    startAutomationFromBackground(message.settings || {})
      .then(sendResponse)
      .catch(async error => {
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

// Handle extension install
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.local.set({
      readTime: 4,
      selectedProvider: 'gmail',
      backDelay: 2,
      autoRefresh: true,
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
      selectedAccounts: [],
      discoveredAccounts: [],
      proxyConfigs: [],
      accountProxyMap: {},
      proxySettings: {
        enabled: false,
        allowFallback: false
      },
      replyTemplates: [],
      automationTemplates: [],
      selectedAutomationTemplate: '',
      emailsOpened: 0,
      automationState: 'idle'
    });

    // Open Gmail on first install
    chrome.tabs.create({ url: 'https://mail.google.com' });
  }
});

console.log('[EmailReadAutomate] Background service worker running.');
