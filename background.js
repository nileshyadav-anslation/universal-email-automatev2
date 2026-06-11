// background.js — Email Read Automate (Service Worker)

// Keep track of active Gmail tabs
let gmailTabs = new Set();

const PROVIDER_URLS = {
  gmail: 'https://mail.google.com/mail/u/0/#inbox',
  yahoo: 'https://mail.yahoo.com',
  aol: 'https://mail.aol.com',
  outlook: 'https://outlook.live.com/mail',
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

async function getMailTab(provider = 'gmail') {
  const tabs = await chrome.tabs.query({});
  return tabs.find(tab => tab.id && tab.url && isProviderUrl(tab.url, provider)) || null;
}

async function getOrCreateMailTab(provider = 'gmail') {
  const defaultUrl = getProviderStartUrl(provider);
  let tab = await getMailTab(provider);

  if (tab) {
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
  const tab = await getOrCreateMailTab(selectedProvider);

  await ensureAutomationScripts(tab.id).catch(async () => {
    await delay(1000);
    await ensureAutomationScripts(tab.id);
  });

  await chrome.storage.local.set({ automationState: 'running', settings });
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
      'content.js'
    ]
  });
}

async function ensureAutomationScripts(tabId) {
  const ping = await chrome.tabs.sendMessage(tabId, { action: 'PING' }).catch(() => null);
  if (ping && ping.ok) return;
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

async function switchMailAccount(tabId, account, settings) {
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

  return { ok: true };
}

// Relay messages from content scripts to popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_AUTOMATION') {
    startAutomationFromBackground(message.settings || {})
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, error: error.message }));

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

  // If message is from a content script (has sender.tab), relay to popup
  if (sender.tab) {
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
      selectedAccounts: [],
      discoveredAccounts: [],
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
