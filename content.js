// content.js — Email Read Automate (Gmail Automation)

(function () {
  "use strict";

  const CONTENT_SCRIPT_VERSION = "2026-06-18-no-reply-all-v1";

  if (window.__emailReadAutomateContentLoaded) {
    console.warn("[EmailReadAutomate] Duplicate content script ignored");
    return;
  }
  window.__emailReadAutomateContentLoaded = true;

  const PROVIDERS = {
    gmail: {
      host: "mail.google.com",

      unreadSelectors: ["tr.zA.zE", "tr.zE", "[data-thread-id].zE"],

      subjectSelectors: [".y6 span", ".bog"],

      refreshSelectors: [
        '[data-tooltip="Refresh"]',
        'div[aria-label="Refresh"]',
      ],

      emailOpenSelectors: [".a3s", ".ii.gt", '[role="main"] .ii'],

      inboxSelectors: ["tr.zA"],
    },
    outlook: {
  host: "outlook.live.com",

  unreadSelectors: [
    '[role="option"][data-convid][aria-label*="Unread"]',
    '[role="option"][data-convid]',
    '[data-convid][role="option"]'
  ],

  subjectSelectors: [
    '[id^="CONV_"][id$="_SUBJECT"]',
    '[data-test-id="message-subject"]',
    '[data-testid*="subject"]',
    '.TtcXM',
    '[role="heading"]'
  ], 

  refreshSelectors: [
    'button[title="Refresh"]',
    'button[aria-label="Refresh"]'
  ],

  emailOpenSelectors: [
    '[role="document"][aria-label="Message body"]',
    '[aria-label="Message body"][role="document"]',
    '[id^="UniqueMessageBody_"]',
    '[aria-label="Email message"] [role="document"]'
  ],

  bodySelectors: [
    '[role="document"][aria-label="Message body"]',
    '[aria-label="Message body"][role="document"]',
    '[id^="UniqueMessageBody_"]',
    '[aria-label="Email message"] [role="document"]'
  ],

  inboxSelectors: [
    '[role="option"][data-convid]',
    '[data-convid][role="option"]',
    '[role="listbox"]',
    '[aria-label="Message list"]',
    '[aria-label*="Message list"]'
  ],

  isUnreadRow(row) {

    const label =
      row.getAttribute("aria-label") || "";

    return label.toLowerCase().includes("unread");
  }
},

proton: {
  host: "mail.proton.me",

  unreadSelectors: [
    '[data-testid="message-row"]',
    '.conversation',
    '[aria-label*="Unread"]'
  ],

  subjectSelectors: [
    '.conversation-title',
    '[data-testid="message-column:subject"]',
    '.item-subject'
  ],

  refreshSelectors: [
    '[data-testid="refresh-button"]',
    'button[title="Refresh"]'
  ],

  emailOpenSelectors: [
    '.message-container',
    '.message-body',
    '[data-testid="message-view"]'
  ],

  inboxSelectors: [
    '.items-column-list',
    '[data-testid="messages-list"]'
  ],

  isUnreadRow(row) {

    return (
      row.classList.contains("is-unread") ||

      row.innerHTML.toLowerCase().includes("unread")
    );
  }
},
zoho: {
  host: "mail.zoho.com",

  unreadSelectors: [
    '.zmMLContainer tr',
    '.zmMailRow',
    '[aria-label*="Unread"]'
  ],

  subjectSelectors: [
    '.zmMsgSubject',
    '.subject',
    '.zmListSubject'
  ],

  refreshSelectors: [
    '.zmRfresh',
    '[aria-label="Refresh"]'
  ],

  emailOpenSelectors: [
    '.zmMailContent',
    '.mailContent',
    '.zmMsgView'
  ],

  inboxSelectors: [
    '.zmMailListContainer',
    '.zmMailList'
  ],

  isUnreadRow(row) {

    return (
      row.classList.contains("unread") ||

      row.classList.contains("newmail") ||

      row.innerHTML.toLowerCase().includes("unread")
    );
  }
},

    yahoo: {
      host: "mail.yahoo.com",

      // ✅ Target the unread dot/indicator inside list items, not the row itself
      // unreadSelectors: [
      //   '[data-test-id="message-list-item"][data-test-read="false"]',
      // ],

      unreadSelectors: [
        'a[data-test-id="message-list-item"][data-test-read="false"]',
        '[data-test-id="message-list-item"][data-test-read="false"]',
        'a[data-test-id="message-list-item"][aria-label*="Unread"]',
        '[data-test-id="message-list-item"][aria-labelledby*="unread-message-status"]',
        '[data-test-id="message-list-item"][aria-label*="Unread"]',
        '[data-test-id="message-list-item"][title*="Unread"]',
        '[data-test-id="message-list-item"]:has([data-test-id="unread-indicator"])',
        '[data-test-id="unread-indicator"]',
        'a[data-test-id="message-item-main-content"][aria-label*="Unread"]',
        'a[data-test-id="message-item-main-content"][title*="Unread"]',
        '[data-test-id="message-list-item"] [aria-label*="Unread"]',
        '[data-test-id="message-list-item"] [title*="Unread"]',
      ],

      subjectSelectors: [
        '[data-test-id="message-subject"]',
        '[role="gridcell"][data-test-id="message-subject"]',
        '[id^="email-subject-"]',
        '[id^="email-subject-snippet-"]',
        '[data-test-id="message-list-item-subject"] span',
        '[data-test-id="message-list-item-subject"]',
        "span.subject",
      ],

      refreshSelectors: [
        '[data-test-id="toolbar-refresh-button"]',
        'button[aria-label="Refresh"]',
      ],

      emailOpenSelectors: [
        '[data-test-id="message-view-body"]',
        '[data-test-id="message-view"]',
        'div[data-test-id="rp"]',
      ],

      inboxSelectors: [
        'a[data-test-id="message-list-item"]',
        '[role="article"][data-test-id="message-list-item"]',
        '[data-test-id="message-list-item"]',
        '[role="link"][data-test-id="message-list-item"]',
        'ul[data-test-id="message-list"] [data-test-id="message-list-item"]',
      ],

      // ✅ NEW: how to tell if a row is actually unread
      // isUnreadRow(row) {
      //   return row.getAttribute("data-test-read") === "false";
      // },
      isUnreadRow(row) {
        const normalizedRow = normalizeEmailRow(row);
        const readState = normalizedRow.getAttribute("data-test-read");
        if (readState === "false") return true;
        if (readState === "true") return false;

        const labelledBy = normalizedRow.getAttribute("aria-labelledby") || "";
        const hasUnreadStatusLabel = labelledBy
          .split(/\s+/)
          .some((id) => {
            if (!id || !id.startsWith("unread-message-status")) return false;

            const label = document.getElementById(id);
            return label?.textContent?.trim().toLowerCase() === "unread message";
          });
        if (hasUnreadStatusLabel) return true;

        const unreadIndicator = normalizedRow.querySelector('[data-test-id="unread-indicator"]');
        if (unreadIndicator) {
          const visibleDot = Array.from(unreadIndicator.querySelectorAll("span, div")).some((dot) => {
            const dotStyle = window.getComputedStyle(dot);
            const dotRect = dot.getBoundingClientRect();

            return (
              dotStyle.display !== "none" &&
              dotStyle.visibility !== "hidden" &&
              !dot.hasAttribute("hidden") &&
              dot.getAttribute("aria-hidden") !== "true" &&
              dotRect.width > 0 &&
              dotRect.height > 0
            );
          });

          if (visibleDot) return true;
        }

        const markerText = [
          normalizedRow.getAttribute("aria-label") || "",
          normalizedRow.getAttribute("title") || "",
          normalizedRow.textContent || "",
        ].join(" ").toLowerCase();

        return markerText.includes("unread message");
      },
    },

    aol: {
      host: "mail.aol.com",

      // AOL uses same codebase as Yahoo
      // unreadSelectors: [
      //   '[data-test-id="message-list-item"][data-test-read="false"]',
      // ],

      unreadSelectors: [
        '[data-test-id="message-list-item"][data-test-read="false"]',
        '[data-test-id="message-list-item"][aria-labelledby*="unread-message-status"]',
        '[data-test-id="message-list-item"][aria-label*="Unread"]',
        '[data-test-id="message-list-item"][title*="Unread"]',
        '[data-test-id="message-list-item"]:has([data-test-id="unread-indicator"])',
        '[data-test-id="unread-indicator"]',
        'a[data-test-id="message-item-main-content"][aria-label*="Unread"]',
        'a[data-test-id="message-item-main-content"][title*="Unread"]',
        '[data-test-id="message-list-item"] [aria-label*="Unread"]',
        '[data-test-id="message-list-item"] [title*="Unread"]',
      ],

      subjectSelectors: [
        '[id^="email-subject-"]',
        '[id^="email-subject-snippet-"]',
        '[data-test-id="message-list-item-subject"] span',
        '[data-test-id="message-list-item-subject"]',
      ],

      refreshSelectors: ['button[aria-label="Refresh"]'],

      emailOpenSelectors: [
        '[data-test-id="message-view-body"]',
        '[data-test-id="message-view"]',
        'div[data-test-id="rp"]',
        'button[data-test-id="toolbar-not-spam"]',
        '[data-test-id="toolbar-not-spam"]',
        'button[data-test-id="toolbar-archive-restore"]',
        '[data-test-id="toolbar-archive-restore"]',
        'button[aria-label="Mark as not spam"]',
        'button[aria-label="Restore selected messages to Inbox"]',
      ],

      bodySelectors: [
        '[data-test-id="message-view-body"]',
        '[data-test-id="message-view"]',
        'div[data-test-id="rp"]',
      ],

      inboxSelectors: [
        '[data-test-id="message-list-item"]',
        '[role="link"][data-test-id="message-list-item"]',
        'ul[data-test-id="message-list"]',
        '[data-test-id="virtual-list"]',
      ],

      isUnreadRow(row) {
        return PROVIDERS.yahoo.isUnreadRow(row);
      },
    },
  };

  // to get provier
  function getProvider() {
    const host = window.location.hostname;

    if (host.includes("mail.google.com")) {
      return PROVIDERS.gmail;
    }
    if (host.includes("outlook.live.com")) {
      return PROVIDERS.outlook;
   }

   if (host.includes("mail.proton.me")) {
      return PROVIDERS.proton;
   }

   if (host.includes("mail.zoho.com")) {
    return PROVIDERS.zoho;
    }
    if (host.includes("mail.yahoo.com")) {
      return PROVIDERS.yahoo;
    }

    if (host.includes("mail.aol.com")) {
      return PROVIDERS.aol;
    }

    return null;
  }

  const provider = getProvider();
  const providerName = provider
    ? Object.keys(PROVIDERS).find((key) => PROVIDERS[key] === provider) || "unknown"
    : "unknown";

  let state = "idle"; // idle | running | paused | stopped
  let emailsOpened = 0;
  let settings = {
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
    reprocessingMode: "never",
    enableAccountSwitching: false,
    selectedAccounts: [],
    currentAccountIndex: 0,
    sessionOpened: 0,
  };
  let automationTimeout = null;
  let processedHrefs = new Set();
  let gmailProvider = null;
  let yahooProvider = null;
  let aolProvider = null;
  let outlookProvider = null;
  let activeAccount = null;
  let manualPauseUntil = 0;
  let manualPauseLogged = false;
  const MANUAL_ACTIVITY_RESUME_DELAY_MIN_MS = 2000;
  const MANUAL_ACTIVITY_RESUME_DELAY_MAX_MS = 4000;
  let movedSpamInboxPassActive = false;
  let aolMovedSpamInboxOnlyMode = false;

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffleArray(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomInt(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function noteManualActivity(event) {
    if (!event || !event.isTrusted || state !== "running" || !settings.manualActivityPause) {
      return;
    }

    const now = Date.now();
    const wasQuiet = now >= manualPauseUntil;

    // Ignore harmless pointer movement; pause only for user actions that can affect the page.
    manualPauseUntil = now + randomInt(
      MANUAL_ACTIVITY_RESUME_DELAY_MIN_MS,
      MANUAL_ACTIVITY_RESUME_DELAY_MAX_MS
    );
    if (wasQuiet) {
      manualPauseLogged = false;
    }
  }

  ["click", "mousedown", "pointerdown", "touchstart", "keydown", "input", "paste", "wheel"].forEach((eventName) => {
    window.addEventListener(eventName, noteManualActivity, true);
  });

  async function waitForManualActivityQuiet() {
    if (!settings.manualActivityPause) return true;

    let pausedForManualActivity = false;

    while (state === "running" && Date.now() < manualPauseUntil) {
      if (!manualPauseLogged) {
        log("Manual activity detected. Pausing automation...", "warn");
        manualPauseLogged = true;
      }
      pausedForManualActivity = true;
      await sleep(Math.min(500, Math.max(100, manualPauseUntil - Date.now())));
    }

    manualPauseLogged = false;
    if (pausedForManualActivity && state === "running") {
      log("Manual activity quiet. Resuming automation...", "info");
    }

    return state !== "stopped";
  }

  //  Utility
  function sleep(ms) {
    return new Promise((resolve) => {
      automationTimeout = setTimeout(resolve, ms);
    });
  }

  function sendMsg(type, data = {}) {
    try {
      chrome.runtime.sendMessage({ type, ...data });
    } catch (e) {
      // Extension context may be invalidated
    }
  }

  function log(message, level = "info") {
    sendMsg("LOG", { message, level });
    console.log(`[EmailReadAutomate] ${message}`);
  }

  function isAolDebugProvider() {
    return Boolean(provider && provider.host && provider.host.includes("aol"));
  }

  function describeDebugElement(element) {
    if (!element) return "none";

    const parts = [element.tagName?.toLowerCase() || "node"];
    const testId = element.getAttribute?.("data-test-id");
    const role = element.getAttribute?.("role");
    const aria = element.getAttribute?.("aria-label");
    const title = element.getAttribute?.("title");

    if (testId) parts.push(`[data-test-id="${testId}"]`);
    if (role) parts.push(`[role="${role}"]`);
    if (aria) parts.push(`[aria="${aria.slice(0, 60)}"]`);
    if (title) parts.push(`[title="${title.slice(0, 60)}"]`);

    return parts.join("");
  }

  function getDebugHref(element) {
    return (
      element?.getAttribute?.("href") ||
      element?.querySelector?.("a[href]")?.getAttribute("href") ||
      ""
    );
  }

  function logAolDebug(message) {
    if (isAolDebugProvider()) {
      log(`AOL debug: ${message}`, "info");
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }

          resolve(response || { ok: true });
        });
      } catch (error) {
        resolve({ ok: false, error: error.message });
      }
    });
  }

  function getEmailBodyRoot() {
    if (!provider) return document;

    const selectors = provider.bodySelectors || provider.emailOpenSelectors;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (isVisibleOpenElement(el)) {
        return el;
      }
    }

    if (provider.host.includes("outlook")) {
      return null;
    }

    return document;
  }

  function isVisibleOpenElement(element) {
    if (!element) return false;

    if (provider && provider.host.includes("aol")) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !element.hasAttribute("hidden") &&
        element.getAttribute("aria-hidden") !== "true"
      );
    }

    return element.offsetParent !== null;
  }

  function hasAolSpamMoveToolbar() {
    if (!provider || !provider.host.includes("aol")) return false;

    return Boolean([
      'li[name="spam"][data-test-id="spam"] button[data-test-id="toolbar-not-spam"]',
      'li[role="menuitem"][name="spam"] button[data-test-id="toolbar-not-spam"]',
      'li[role="menuitem"][name="spam"] button[aria-label="Mark as not spam"]',
      'button[data-test-id="toolbar-not-spam"]',
      '[data-test-id="toolbar-not-spam"]',
      'button[data-test-id="toolbar-archive-restore"]',
      '[data-test-id="toolbar-archive-restore"]',
      'button[aria-label="Mark as not spam"]',
      'button[aria-label="Restore selected messages to Inbox"]',
    ].some((selector) => isVisibleOpenElement(document.querySelector(selector))));
  }

  function isAolMessageUrl() {
    if (!provider || !provider.host.includes("aol")) return false;
    return /\/d\/folders\/\d+\/messages\//i.test(window.location.pathname);
  }

  async function waitForEmailContentLoaded(maxWait = 12000) {
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const root = getEmailBodyRoot();
      const text = root?.textContent || "";
      const isVisibleRoot = root === document || isVisibleOpenElement(root);
      const hasContent =
        root &&
        isVisibleRoot &&
        (text.trim().length > 20 || root.querySelector?.("a[href]"));

      if (hasContent) {
        logAolDebug(`content root=${describeDebugElement(root)} textLen=${text.trim().length} links=${root.querySelectorAll?.("a[href]")?.length || 0}`);
        return root;
      }

      await sleep(300);
      if (state === "stopped") return null;
    }

    const fallbackRoot = getEmailBodyRoot();
    logAolDebug(`content wait timeout root=${describeDebugElement(fallbackRoot)} textLen=${(fallbackRoot?.textContent || "").trim().length}`);
    return fallbackRoot;
  }

  async function openSafeLinks(links) {
    let openedCount = 0;

    for (const url of links) {
      if (state === "stopped") break;
      if (!(await waitIfPaused())) break;
      if (!(await waitForManualActivityQuiet())) break;

      if (!window.LinkProcessor.isSafeLink(url)) {
        log(`Skipped unsafe link: ${url}`, "warn");
        continue;
      }

      log(`Link opened: ${url}`);
      const result = await sendRuntimeMessage({ action: "OPEN_SAFE_LINK", url });

      if (result.ok) {
        openedCount++;
        log(`Link closed: ${url}`, "success");
      } else {
        log(`Link opening failed: ${result.error || url}`, "error");
      }

      if (!(await waitForManualActivityQuiet())) break;
    }

    return openedCount;
  }

  function canReprocessUnread() {
    return settings.reprocessingMode === "unread";
  }

  function getCurrentAccount() {
    if (activeAccount) return activeAccount;
    return getActiveAccount();
  }

  function getTrackingProviderName() {
    if (!settings.enableAccountSwitching) {
      return providerName;
    }

    const account = getCurrentAccount();
    return `${providerName}:${account.id || "current"}`;
  }

  function getProcessedCacheKey(emailId) {
    if (!settings.enableAccountSwitching) {
      return emailId;
    }

    const account = getCurrentAccount();
    return `${account.id || "current"}:${emailId}`;
  }

  function getEmailIdentity(row) {
    const rowId = getEmailRowId(row);
    if (rowId) return rowId;

    const link = getEmailLink(row);
    const href = getDebugHref(link);
    if (href) return href;

    const label = [
      row?.getAttribute?.("aria-label") || "",
      row?.getAttribute?.("title") || "",
      getEmailSubject(row),
      row?.textContent || "",
    ].join(" ").replace(/\s+/g, " ").trim();

    return label ? `${providerName}:${label.substring(0, 240)}` : "";
  }

  function isProcessedInCurrentSession(emailId) {
    return Boolean(emailId && processedHrefs.has(getProcessedCacheKey(emailId)));
  }

  async function processOpenedEmail(emailId) {
    let linksOpened = 0;
    let replied = false;
    let template = "";
    let existingRecord = null;
    const trackingProviderName = getTrackingProviderName();

    if (!(await waitForManualActivityQuiet())) {
      return { linksOpened, replied, template };
    }

    if (settings.enableLinkOpening) {
      try {
        if (!(await waitForManualActivityQuiet())) {
          return { linksOpened, replied, template };
        }
        const root = await waitForEmailContentLoaded();
        const links = window.LinkProcessor.extractLinks(root, settings.maxLinksPerEmail);
        if (providerName === "aol") {
          log(`AOL debug: extracted links=${links.length}${links.length ? ` first=${links[0]}` : ""}`, "info");
        }
        log(`Links found: ${links.length}`);
        linksOpened = await openSafeLinks(links);
      } catch (error) {
        log(`Link extraction failed: ${error.message}`, "error");
      }
    } else {
      log("Link processing skipped by settings", "warn");
    }

    if (settings.enableProcessedTracking) {
      try {
        existingRecord = await window.ProcessedEmailManager.get(trackingProviderName, emailId);
      } catch (error) {
        log(`Processed lookup failed: ${error.message}`, "error");
      }
    }

    if (settings.enableAutoReply) {
      try {
        if (!(await waitForManualActivityQuiet())) {
          return { linksOpened, replied, template };
        }
        if (existingRecord && existingRecord.replied) {
          replied = true;
          log("Reply skipped: email already replied", "warn");
        } else {
          template = await window.ReplyEngine.sendReply(providerName, {
            onTemplateSelected(selectedTemplate) {
              log(`Reply selected: "${selectedTemplate}"`);
            },
            waitForManualActivityQuiet,
            onDiagnostic(message) {
              if (providerName === "aol") {
                log(`AOL reply debug: ${message}`, "info");
              }
            },
          });
          replied = true;
          log("Reply sent", "success");
        }
      } catch (error) {
        const message = error.message || "Unknown reply error";
        if (message.toLowerCase().startsWith("auto reply skipped")) {
          log(message, "warn");
        } else {
          log(`Reply failed: ${message}`, "error");
        }
      }
    } else {
      replied = Boolean(existingRecord && existingRecord.replied);
      log("Auto reply skipped by settings", "warn");
    }

    if (settings.enableProcessedTracking) {
      try {
        if (!(await waitForManualActivityQuiet())) {
          return { linksOpened, replied, template };
        }
        await window.ProcessedEmailManager.markProcessed(trackingProviderName, emailId, {
          replied,
          linksOpened,
        });
        log("Email marked processed", "success");
      } catch (error) {
        log(`Processed tracking failed: ${error.message}`, "error");
      }
    } else {
      log("Processed tracking skipped by settings", "warn");
    }

    return { linksOpened, replied, template };
  }

  //   Mail Provider DOM Helpers

  /**
   * Get all unread email rows.
   * Gmail marks unread rows with class "zE" or "zA zE"
   */
  function normalizeEmailRow(row) {
    if (!row || !provider) return row;

    if (provider.host.includes("yahoo") || provider.host.includes("aol") || provider.host.includes("outlook")) {
      return row.closest('[data-test-id="message-list-item"]') || row;
    }

    return row;
  }

  function isVisibleMailElement(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const hasSize = rect.height > 0 && rect.width > 0;
    if (!hasSize) return false;

    if (provider && (provider.host.includes("yahoo") || provider.host.includes("aol"))) {
      const style = window.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !element.hasAttribute("hidden") &&
        element.getAttribute("aria-hidden") !== "true"
      );
    }

    return element.offsetParent !== null;
  }

  function getUnreadRows() {
    if (!provider) return [];

    for (const sel of provider.unreadSelectors) {
      const rows = Array.from(document.querySelectorAll(sel));
      const normalizedRows = [];
      const seenRows = new Set();

      for (const row of rows) {
        const normalizedRow = normalizeEmailRow(row);
        if (normalizedRow && !seenRows.has(normalizedRow)) {
          normalizedRows.push(normalizedRow);
          seenRows.add(normalizedRow);
        }
      }

      const visibleRows = normalizedRows.filter(isVisibleMailElement);

      if (visibleRows.length > 0) {
        // ✅ For Yahoo/AOL: apply the isUnreadRow() check if it exists
        if (provider.isUnreadRow) {
          const unread = visibleRows.filter((row) => provider.isUnreadRow(row));
          // Only return filtered list if we actually found unread ones;
          // otherwise fall through to next selector
          if (unread.length > 0) return unread;
        } else {
          return visibleRows;
        }
      }
    }

    return [];
  }

  function isYahooLikeProvider() {
    return Boolean(provider && (provider.host.includes("yahoo") || provider.host.includes("aol")));
  }

  function isScrollableMailboxProvider() {
    return Boolean(provider && (
      provider.host.includes("yahoo") ||
      provider.host.includes("aol") ||
      provider.host.includes("outlook")
    ));
  }

  function getProviderDisplayLabel() {
    if (!provider) return "mailbox";
    if (provider.host.includes("yahoo")) return "Yahoo";
    if (provider.host.includes("aol")) return "AOL";
    if (provider.host.includes("outlook")) return "Outlook";
    if (provider.host.includes("google")) return "Gmail";
    return providerName;
  }

  function getScrollableAncestor(element) {
    let current = element;

    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY || "";
      const canScroll =
        current.scrollHeight > current.clientHeight + 8 &&
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay");

      if (canScroll) return current;
      current = current.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function getYahooMailboxScrollElement() {
    if (!isScrollableMailboxProvider()) return null;

    const anchor =
      document.querySelector('[data-test-id="virtual-list"]') ||
      document.querySelector('ul[data-test-id="message-list"]') ||
      document.querySelector('[data-test-id="message-list-item"]') ||
      provider.inboxSelectors
        .map((selector) => document.querySelector(selector))
        .find(Boolean);

    if (anchor) return getScrollableAncestor(anchor);
    return document.scrollingElement || document.documentElement;
  }

  async function resetYahooMailboxScrollPosition() {
    const scrollElement = getYahooMailboxScrollElement();
    if (!scrollElement) return;

    scrollElement.scrollTo({ top: 0, behavior: "auto" });
    await sleep(500);
  }

  function getQueuedMovedRowsInCurrentMailbox(mailboxLabel = "") {
    const mailboxProvider = getMailboxProvider();
    if (!mailboxProvider || mailboxLabel !== "Inbox" || !mailboxProvider.hasMovedSpamQueue()) {
      return [];
    }

    return mailboxProvider.getMovedSpamRowsVisibleInInbox();
  }

  function isMovedSpamInboxPass(mailboxLabel = "") {
    const mailboxProvider = getMailboxProvider();
    return Boolean(mailboxProvider && mailboxLabel === "Inbox" && movedSpamInboxPassActive);
  }

  function filterCachedProcessableRows(rows = []) {
    return rows.filter((row) => {
      const id = getEmailIdentity(row);
      return !isProcessedInCurrentSession(id);
    });
  }

  function hasProcessableRowsInCurrentMailbox(mailboxLabel = "") {
    const mailboxProvider = getMailboxProvider();
    if (isAolProvider() && mailboxProvider && mailboxLabel === "Inbox" && aolMovedSpamInboxOnlyMode) {
      return filterCachedProcessableRows(mailboxProvider.getMovedSpamRowsVisibleInInbox()).length > 0;
    }

    const rows = getUnreadRows();
    const seenRows = new Set(rows);

    for (const queuedRow of getQueuedMovedRowsInCurrentMailbox(mailboxLabel)) {
      if (!seenRows.has(queuedRow)) {
        rows.push(queuedRow);
        seenRows.add(queuedRow);
      }
    }

    return filterCachedProcessableRows(rows).length > 0;
  }

  async function scrollYahooMailboxUntilProcessableRows(mailboxLabel = "") {
    if (!isScrollableMailboxProvider()) return false;

    const scrollElement = getYahooMailboxScrollElement();
    if (!scrollElement) return false;

    const maxScrolls = 14;
    let lastTop = scrollElement.scrollTop;

    for (let i = 0; i < maxScrolls; i++) {
      if (state === "stopped") return false;
      if (hasProcessableRowsInCurrentMailbox(mailboxLabel)) return true;

      const distance = Math.max(300, Math.floor((scrollElement.clientHeight || window.innerHeight) * 0.85));
      scrollElement.scrollBy({ top: distance, behavior: "auto" });
      await sleep(700);

      const currentTop = scrollElement.scrollTop;
      const nearBottom = currentTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 8;

      if (hasProcessableRowsInCurrentMailbox(mailboxLabel)) return true;
      if (nearBottom || currentTop === lastTop) return false;

      lastTop = currentTop;
    }

    return hasProcessableRowsInCurrentMailbox(mailboxLabel);
  }

  /**
   * Get the clickable link/element for a row.
   */
  // function getEmailLink(row) {
  //   // Try to find a link inside the row
  //   const link =
  //     row.querySelector('a[href*="#"]') ||
  //     row.querySelector(".y6") ||
  //     row.querySelector("td.yX") ||
  //     row;
  //   return link;
  // }

  function getEmailLink(row) {

  // Gmail
  if (provider.host.includes("google")) {

    return (
      row.querySelector('a[href*="#"]') ||
      row.querySelector(".y6") ||
      row.querySelector("td.yX") ||
      row
    );
  }

  // Yahoo + AOL
  if (
    provider.host.includes("yahoo") ||
    provider.host.includes("aol")
  ) {
    const normalizedRow = normalizeEmailRow(row);

    return (
      normalizedRow.querySelector(
        'a[data-test-id="message-item-main-content"]'
      ) ||
      (normalizedRow.matches('[data-test-id="message-list-item"][role="link"]') ? normalizedRow : null) ||
      normalizedRow.querySelector('[role="link"]') ||
      normalizedRow
    );
  }

  // Outlook
  if (provider.host.includes("outlook")) {

    return (
      row.querySelector('[data-convid]') ||
      row
    );
  }

  // Proton
  if (provider.host.includes("proton")) {

    return (
      row.querySelector('[data-testid="message-row"]') ||
      row
    );
  }

  // Zoho
  if (provider.host.includes("zoho")) {

    return (
      row.querySelector('.zmMailRow') ||
      row
    );
  }

  return row;
}
  /**
   * Get email subject text from a row.
   */
  function getEmailSubject(row) {
    if (!provider) return "Unknown Subject";

    for (const sel of provider.subjectSelectors) {
      const el = row.querySelector(sel);

      if (el && el.textContent.trim()) {
        return el.textContent.trim().substring(0, 80);
      }
    }

    if (provider.host.includes("yahoo") || provider.host.includes("aol") || provider.host.includes("outlook")) {
      const labelText = [
        row.getAttribute("aria-label") || "",
        row.getAttribute("title") || "",
      ].join(" ").replace(/\s+/g, " ").trim();

      if (labelText) {
        const withoutUnread = labelText
          .replace(/\bunread message\b/ig, "")
          .replace(/\bunread\b/ig, "")
          .trim();
        if (withoutUnread) return withoutUnread.substring(0, 80);
      }

      const rowText = (row.textContent || "").replace(/\s+/g, " ").trim();
      if (rowText) return rowText.substring(0, 80);
    }

    return "Unknown Subject";
  }

  /**
   * Check if we're currently viewing the inbox (not inside an email).
   */
  function isInbox() {
    const hash = window.location.hash;
    return (
      hash === "#inbox" ||
      hash === "#all" ||
      hash === "" ||
      hash.startsWith("#search/") ||
      hash.startsWith("#label/")
    );
  }

  /**
   * Navigate back to the inbox.
   */
  // function goToInbox() {
  //   if (provider.host.includes("google")) {
  //     const backBtn =
  //       document.querySelector('[aria-label="Back to Inbox"]') ||
  //       document.querySelector('[data-tooltip="Back to Inbox"]');

  //     if (backBtn) {
  //       backBtn.click();
  //       return;
  //     }

  //     window.history.back();
  //     return;
  //   }

  //   // Yahoo + AOL

  //   const inboxBtn =
  //     document.querySelector('a[href*="/folders/1"]') ||
  //     document.querySelector('[data-test-folder-name="Inbox"]') ||
  //     document.querySelector('[aria-label="Inbox"]') ||
  //       document.querySelector('a[data-test-folder-name="Inbox"]') ; // added new 

  //   if (inboxBtn) {
  //     inboxBtn.click();
  //     return;
  //   }

  //   window.history.back();
  // }



  function goToInbox() {

  // Gmail: return to the currently active mailbox list. This keeps Spam processing
  // inside Spam instead of jumping back to Inbox after opening a spam message.
  if (provider.host.includes("google")) {

    const backBtn =
      document.querySelector('[aria-label^="Back to"]') ||
      document.querySelector('[data-tooltip^="Back to"]') ||
      document.querySelector('[aria-label="Back to Inbox"]') ||
      document.querySelector('[data-tooltip="Back to Inbox"]');

    if (backBtn) {
      backBtn.click();
      return;
    }

    window.history.back();
    return;
  }

  // Yahoo
  if (provider.host.includes("yahoo")) {
    const backBtn =
      document.querySelector('button[aria-label="Back"]') ||
      document.querySelector('[title="Back"]') ||
      Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Back");

    if (backBtn) {
      clickElementLikeUser(backBtn);
      return;
    }

    const inboxBtn =
      document.querySelector('a[href*="/folders/1"]') ||
      document.querySelector('[data-test-folder-name="Inbox"]') ||
      document.querySelector('[aria-label="Inbox"]') ||
      document.querySelector('a[data-test-folder-name="Inbox"]');

    if (inboxBtn) {
      inboxBtn.click();
      return;
    }

    window.location.href =
      "https://mail.yahoo.com/n/folders/1?.src=ym&reason=myc";

    return;
  }

  // AOL
  if (provider.host.includes("aol")) {
    const backBtn =
      document.querySelector('button[data-test-id="toolbar-back-to-list"]') ||
      document.querySelector('button[aria-label="Back"]') ||
      document.querySelector('[title="Back"]') ||
      Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Back");

    if (backBtn) {
      clickElementLikeUser(backBtn);
      return;
    }

    const inboxBtn =
      document.querySelector('a[data-test-id="folder-list-item"][href*="/d/folders/1"]') ||
      document.querySelector('a[href*="/d/folders/1"]') ||
      document.querySelector('a[href*="/folders/1"]') ||
      document.querySelector('[data-test-folder-name="Inbox"]') ||
      document.querySelector('[aria-label="Inbox"]');

    if (inboxBtn) {
      inboxBtn.click();
      return;
    }

    window.location.href =
      "https://mail.aol.com/d/folders/1";

    return;
  }

  // Outlook
  if (provider.host.includes("outlook")) {
    const visibleRows = Array.from(document.querySelectorAll([
      '[role="option"][data-convid]',
      '[data-convid][role="option"]',
    ].join(","))).some(isVisibleMailElement);

    if (visibleRows) {
      return;
    }

    const backBtn =
      document.querySelector('button[aria-label="Back"]') ||
      document.querySelector('button[title="Back"]') ||
      document.querySelector('[data-icon-name="Back"]')?.closest("button");

    if (backBtn) {
      clickElementLikeUser(backBtn);
      return;
    }

    const inboxBtn =
      document.querySelector('[title="Inbox"]') ||
      document.querySelector('[aria-label="Inbox"]');

    if (inboxBtn) {
      inboxBtn.click();
      return;
    }

    window.history.back();
    return;
  }

  // Proton
  if (provider.host.includes("proton")) {

    const inboxBtn =
      document.querySelector('[data-testid="navigation-link:inbox"]') ||
      document.querySelector('[title="Inbox"]');

    if (inboxBtn) {
      inboxBtn.click();
      return;
    }

    window.location.href =
      "https://mail.proton.me/u/0/inbox";

    return;
  }

  // Zoho
  if (provider.host.includes("zoho")) {

    const inboxBtn =
      document.querySelector('[aria-label="Inbox"]') ||
      document.querySelector('.zmTreeInbox');

    if (inboxBtn) {
      inboxBtn.click();
      return;
    }

    window.location.href =
      "https://mail.zoho.com/zm/";

    return;
  }

  // Fallback
  window.history.back();
}

  /**
   * Wait until the DOM has unread rows visible (or we're back in inbox).
   */
  async function waitForInbox(maxWait = 8000) {
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      if (provider) {
        for (const sel of provider.inboxSelectors) {
          if (document.querySelector(sel)) {
            return true;
          }
        }
      }

      await sleep(400);

      if (state === "stopped") {
        return false;
      }
    }
    return false;
  }

  function uniqueAccounts(accounts) {
    const seen = new Set();
    return accounts.filter((account) => {
      if (!account || !account.id || seen.has(account.id)) return false;
      seen.add(account.id);
      return true;
    });
  }

  function getGmailAccountIndex() {
    const match = window.location.pathname.match(/\/mail\/u\/(\d+)\//);
    return match ? parseInt(match[1], 10) : 0;
  }

  function makeAccount(id, label, url = null) {
    return {
      id,
      label,
      provider: providerName,
      url,
    };
  }

  function discoverGmailAccounts() {
    const accounts = [];
    const currentIndex = getGmailAccountIndex();

    accounts.push(makeAccount(`gmail:${currentIndex}`, `Account ${currentIndex + 1}`, `https://mail.google.com/mail/u/${currentIndex}/#inbox`));

    for (const link of Array.from(document.querySelectorAll('a[href*="/mail/u/"]'))) {
      const href = link.href || "";
      const match = href.match(/\/mail\/u\/(\d+)\//);
      if (!match) continue;

      const index = parseInt(match[1], 10);
      accounts.push(makeAccount(`gmail:${index}`, `Account ${index + 1}`, `https://mail.google.com/mail/u/${index}/#inbox`));
    }

    for (let index = 0; index < 3; index++) {
      accounts.push(makeAccount(`gmail:${index}`, `Account ${index + 1}`, `https://mail.google.com/mail/u/${index}/#inbox`));
    }

    return uniqueAccounts(accounts).sort((a, b) => {
      const aIndex = parseInt(a.id.split(":")[1], 10);
      const bIndex = parseInt(b.id.split(":")[1], 10);
      return aIndex - bIndex;
    });
  }

  function discoverDomAccounts() {
    const accounts = [];
    const current = getActiveAccount();
    accounts.push(current);

    const accountLinks = Array.from(document.querySelectorAll(
      'a[href*="account"], a[href*="user"], button[aria-label*="account"], button[aria-label*="Account"], [data-testid*="account"]'
    ));

    accountLinks.forEach((element, index) => {
      const label =
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.textContent.trim() ||
        `Account ${index + 1}`;
      const href = element.href || null;

      accounts.push(makeAccount(`${providerName}:dom:${index}`, label.substring(0, 80), href));
    });

    return uniqueAccounts(accounts);
  }

  function getAccountSwitchProvider() {
    if (provider?.host?.includes("yahoo")) return getYahooProvider();
    if (provider?.host?.includes("outlook")) return getOutlookProvider();
    if (provider?.host?.includes("aol")) return getAolProvider();
    return null;
  }

  async function discoverAccounts() {
    if (!provider) return [];

    if (provider.host.includes("google")) {
      return discoverGmailAccounts();
    }

    const switchProvider = getAccountSwitchProvider();
    if (switchProvider?.discoverAccounts) {
      const accounts = await switchProvider.discoverAccounts();
      if (accounts?.length) return accounts;
    }

    return discoverDomAccounts();
  }

  function getActiveAccount() {
    if (!provider) return makeAccount("unknown:current", "Current Account");

    if (provider.host.includes("google")) {
      const index = getGmailAccountIndex();
      return makeAccount(`gmail:${index}`, `Account ${index + 1}`, `https://mail.google.com/mail/u/${index}/#inbox`);
    }

    const switchProvider = getAccountSwitchProvider();
    if (switchProvider?.getActiveAccount) {
      const active = switchProvider.getActiveAccount();
      if (active?.id) return active;
    }

    return makeAccount(`${providerName}:current`, "Current Account", window.location.href);
  }

  async function getSelectedAccountObjects() {
    const discovered = await discoverAccounts();
    const selectedIds = Array.isArray(settings.selectedAccounts) ? settings.selectedAccounts : [];
    const currentAccount = getActiveAccount();

    if (!settings.enableAccountSwitching || selectedIds.length === 0) {
      return [currentAccount];
    }

    const discoveredById = new Map(discovered.map((account) => [account.id, account]));
    const providerSelectedIds = selectedIds.filter((id) => id === currentAccount.id || id.startsWith(`${providerName}:`));

    if (providerSelectedIds.length === 0) {
      return [currentAccount];
    }

    return providerSelectedIds
      .map((id) => discoveredById.get(id) || makeAccount(id, id))
      .filter((account) => account && account.id);
  }

  async function waitForDomReady(maxWait = 15000) {
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      if (document.readyState === "interactive" || document.readyState === "complete") {
        return true;
      }

      await sleep(250);
      if (state === "stopped") return false;
    }

    return false;
  }

  async function waitForInboxReadyAfterSwitch(expectedAccount, maxWait = 25000) {
    await waitForDomReady(maxWait);
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const current = getActiveAccount();
      const providerMatches = Boolean(provider);
      const canCompareAccounts = Boolean(
        expectedAccount?.id &&
        current?.id &&
        !expectedAccount.id.endsWith(":current") &&
        !current.id.endsWith(":current")
      );
      const accountMatches = !canCompareAccounts || current.id === expectedAccount.id;
      const inboxReady = await waitForInbox(2500);
      const unreadRows = getUnreadRows();

      if (providerMatches && accountMatches && inboxReady && (unreadRows.length > 0 || document.readyState === "complete")) {
        return true;
      }

      await sleep(500);
      if (state === "stopped") return false;
    }

    return false;
  }

  async function requestAccountSwitch(nextAccount, nextIndex) {
    log(`Switching to ${nextAccount.label || nextAccount.id}...`);

    const result = await sendRuntimeMessage({
      action: "SWITCH_MAIL_ACCOUNT",
      account: nextAccount,
      settings: {
        ...settings,
        currentAccountIndex: nextIndex,
        sessionOpened: emailsOpened,
      },
    });

    if (!result || !result.ok) {
      log(`Account switching failed: ${result?.error || "Unknown error"}`, "error");
      return false;
    }

    state = "stopped";
    return true;
  }

  function getEmailClickTarget(row) {
    if (!row || !provider) return row;

    if (provider.host.includes("google")) {
      return (
        row.querySelector("td.yX") ||
        row.querySelector(".bog") ||
        row.querySelector("td:nth-child(4)") ||
        row
      );
    }

    if (provider.host.includes("yahoo") || provider.host.includes("aol")) {
      const normalizedRow = normalizeEmailRow(row);

      if (provider.host.includes("aol")) {
        return (
          normalizedRow.querySelector('a[data-test-id="message-item-main-content"]') ||
          (normalizedRow.matches('a[data-test-id="message-list-item"]') ? normalizedRow : null) ||
          (normalizedRow.matches('[data-test-id="message-list-item"][role="article"]') ? normalizedRow : null) ||
          normalizedRow.querySelector('a[data-test-id="message-list-item"]') ||
          normalizedRow.querySelector('[role="link"]') ||
          normalizedRow
        );
      }

      return (
        normalizedRow.querySelector('a[data-test-id="message-item-main-content"]') ||
        (normalizedRow.matches('[data-test-id="message-list-item"][role="link"]') ? normalizedRow : null) ||
        normalizedRow.querySelector('[role="link"]') ||
        normalizedRow
      );
    }

    if (provider.host.includes("outlook")) {
      return row.querySelector('[role="option"]') || row.querySelector("[data-convid]") || row;
    }

    if (provider.host.includes("proton")) {
      return row.querySelector('[data-testid="message-row"]') || row.querySelector(".conversation") || row;
    }

    if (provider.host.includes("zoho")) {
      return row.querySelector(".zmMailRow") || row.querySelector("tr") || row;
    }

    return row;
  }

  function clickElementLikeUser(element) {
    if (!element) return false;

    element.scrollIntoView({ block: "center", inline: "nearest" });
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      // Some Yahoo list rows are programmatically clickable but not focusable.
    }

    ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((eventName) => {
      const EventCtor = eventName.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(new EventCtor(eventName, {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: eventName.includes("down") ? 1 : 0,
      }));
    });

    if (shouldSkipNativeClick(element)) {
      logAolDebug(`native click skipped for ${describeDebugElement(element)}`);
      return true;
    }

    try {
      element.click();
    } catch (error) {
      // The dispatched click above is still the primary path.
    }

    return true;
  }

  function shouldSkipNativeClick(element) {
    if (!isAolDebugProvider()) return false;

    const messageLink = element.closest?.('a[data-test-id="message-list-item"][href*="/messages/"], a[href*="/messages/"]');
    return Boolean(messageLink);
  }

  function getEmailRowId(row) {
    if (!row) return "";

    const innerItem = row.querySelector('[data-test-id="message-list-item"]');
    if (provider && (provider.host.includes("yahoo") || provider.host.includes("aol"))) {
      if (provider.host.includes("aol")) {
        const messageLink =
          (row.matches('a[href*="/messages/"]') ? row : null) ||
          row.querySelector('a[href*="/messages/"]') ||
          (row.matches('a[data-test-id="message-list-item"][href]') ? row : null) ||
          row.querySelector('a[data-test-id="message-list-item"][href], a[data-test-id="message-item-main-content"][href]');
        const href = messageLink?.getAttribute("href") || "";
        const messageId = href.match(/\/messages\/([^/?#]+)/i)?.[1];
        if (messageId) {
          try {
            return decodeURIComponent(messageId);
          } catch (error) {
            return messageId;
          }
        }
        if (href) return href;
      }

      const sender =
        row.querySelector('[id^="email-sender-"]')?.textContent?.trim() ||
        row.querySelector('[id^="email-sender-"]')?.getAttribute("title") ||
        "";
      const subject = getEmailSubject(row);
      const date = row.querySelector('[id^="email-date-"]')?.textContent?.trim() || "";
      return [sender, subject, date].filter(Boolean).join("|") || "";
    }

    return (
      row.getAttribute("data-thread-id") ||
      row.getAttribute("data-convid") ||
      row.getAttribute("data-testid") ||
      row.getAttribute("id") ||
      (innerItem && innerItem.getAttribute("data-test-id-msg-id")) ||
      (innerItem && innerItem.getAttribute("id")) ||
      getEmailSubject(row) ||
      ""
    );
  }

  function findUnreadRowById(rowId) {
    if (!rowId) return null;
    return getUnreadRows().find((candidate) => getEmailIdentity(candidate) === rowId) || null;
  }

  async function openEmailWithRetry(row, subject, rowId = "", mailboxLabel = "") {
    const maxAttempts = settings.retryEmailOpening ? 3 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (state === "stopped") return false;
      if (!(await waitIfPaused())) return false;
      if (!(await waitForManualActivityQuiet())) return false;

      if (!row || !document.contains(row)) {
        row = findUnreadRowById(rowId) || row;
      }

      const clickTarget = getEmailClickTarget(row);
      if (!clickTarget) {
        log("No clickable target found", "warn");
        return false;
      }

      logAolDebug(`open attempt ${attempt}: rowId=${String(rowId).slice(0, 80)} rowHref=${getDebugHref(row)} target=${describeDebugElement(clickTarget)} path=${window.location.pathname}`);

      if (attempt > 1) {
        log(`Retrying open (${attempt}/${maxAttempts}): "${subject}"…`, "warn");
      }

      clickElementLikeUser(clickTarget);
      await sleep(1200);

      logAolDebug(`after click path=${window.location.pathname} url=${window.location.href}`);

      if (mailboxLabel === "Spam" && isAolMessageUrl()) {
        log("AOL Spam message page detected after opening row.", "success");
        return true;
      }

      const opened = await waitForEmailOpen(attempt === 1 ? 8000 : 10000);
      if (opened) {
        return true;
      }

      if (mailboxLabel === "Spam" && isAolMessageUrl()) {
        log("AOL Spam message page detected after open wait.", "success");
        return true;
      }

      if (attempt < maxAttempts) {
        log(`Open failed. Preparing retry ${attempt + 1}/${maxAttempts}…`, "warn");
        const mailboxProvider = getMailboxProvider();
        if (
          mailboxLabel === "Spam" &&
          mailboxProvider &&
          mailboxProvider.navigateMailbox &&
          isScrollableMailboxProvider()
        ) {
          await mailboxProvider.navigateMailbox("spam");
        } else {
          goToInbox();
        }
        await waitForInbox(7000);
        await sleep(800);
      }
    }

    return false;
  }

  /**
   * Wait for page to navigate to an email view.
   */
  async function waitForEmailOpen(maxWait = 8000) {
    const start = Date.now();

    // ✅ Small initial delay so the click can register before we start checking
    await sleep(400);

    while (Date.now() - start < maxWait) {
      if (isAolMessageUrl()) {
        log("AOL message URL detected. Email is open.", "success");
        return true;
      }

      if (hasAolSpamMoveToolbar()) {
        log("AOL Spam toolbar detected. Email is open.", "success");
        return true;
      }

      if (provider) {
        for (const sel of provider.emailOpenSelectors) {
          const el = document.querySelector(sel);
          // ✅ For Yahoo/AOL also confirm it has visible text content
          // if (el && el.textContent.trim().length > 20)
          if (isVisibleOpenElement(el))
             {
            return true;
          }
        }
      }

      await sleep(300);

      if (state === "stopped") return false;
    }

    return false;
  }

  // Pause handling
  async function waitIfPaused() {
    while (state === "paused") {
      await sleep(500);
    }
    return state !== "stopped";
  }

  function getGmailProvider() {
    if (!gmailProvider && window.GmailProvider) {
      gmailProvider = window.GmailProvider.create({
        getProvider: () => provider,
        getState: () => state,
        sleep,
        log,
        waitForInbox,
        getGmailAccountIndex,
        getEmailRowId,
        getEmailSubject,
      });
    }

    return gmailProvider;
  }

  function getYahooProvider() {
    if (!yahooProvider && window.YahooProvider) {
      yahooProvider = window.YahooProvider.create({
        getProvider: () => provider,
        getState: () => state,
        sleep,
        log,
        waitForInbox,
        getEmailRowId,
        getEmailSubject,
      });
    }

    return yahooProvider;
  }

  function getAolProvider() {
    if (!aolProvider && window.AolProvider) {
      aolProvider = window.AolProvider.create({
        getProvider: () => provider,
        getState: () => state,
        sleep,
        log,
        waitForInbox,
        getEmailRowId,
        getEmailSubject,
      });
    }

    return aolProvider;
  }

  function getOutlookProvider() {
    if (!outlookProvider && window.OutlookProvider) {
      outlookProvider = window.OutlookProvider.create({
        getProvider: () => provider,
        getState: () => state,
        sleep,
        log,
        waitForInbox,
        getEmailRowId,
        getEmailSubject,
      });
    }

    return outlookProvider;
  }

  //  Main Automation Loop

  function isGmailProvider() {
    const gmail = getGmailProvider();
    return Boolean(gmail && gmail.isProvider());
  }

  function isYahooProvider() {
    const yahoo = getYahooProvider();
    return Boolean(yahoo && yahoo.isProvider());
  }

  function isAolProvider() {
    const aol = getAolProvider();
    return Boolean(aol && aol.isProvider());
  }

  function isOutlookProvider() {
    const outlook = getOutlookProvider();
    return Boolean(outlook && outlook.isProvider());
  }

  function getMailboxProvider() {
    if (isGmailProvider()) return getGmailProvider();
    if (isYahooProvider()) return getYahooProvider();
    if (isAolProvider()) return getAolProvider();
    if (isOutlookProvider()) return getOutlookProvider();
    return null;
  }

  function getSpamMoveProvider(mailboxLabel) {
    if (mailboxLabel !== "Spam") return null;
    const mailboxProvider = getMailboxProvider();
    return mailboxProvider && mailboxProvider.moveOpenedSpamEmailToInbox ? mailboxProvider : null;
  }

  async function markOpenedMailboxEmailRead(rowId) {
    const mailboxProvider = getMailboxProvider();
    if (!mailboxProvider || !mailboxProvider.markOpenedEmailRead) return;

    try {
      await mailboxProvider.markOpenedEmailRead(rowId);
    } catch (error) {
      log(`${getProviderDisplayLabel()} mark-as-read failed: ${error.message}`, "warn");
    }
  }

  function getGmailMailboxUrl(folder = "inbox") {
    return getGmailProvider().getMailboxUrl(folder);
  }

  async function navigateToGmailMailbox(folder = "inbox") {
    return getGmailProvider().navigateMailbox(folder);
  }

  function getGmailPageRangeText() {
    const rangeEl =
      document.querySelector('.Di .Dj') ||
      document.querySelector('[aria-label="Show more messages"] .Dj') ||
      document.querySelector('[role="button"][aria-label="Show more messages"]');

    return rangeEl ? rangeEl.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function getEnabledGmailOlderButton() {
    const candidates = Array.from(document.querySelectorAll(
      'div[role="button"][aria-label="Older"], div[role="button"][data-tooltip="Older"], [aria-label="Older"], [data-tooltip="Older"]'
    ));

    return candidates.find((button) => {
      if (!button || button.offsetParent === null) return false;
      const disabled =
        button.getAttribute("aria-disabled") === "true" ||
        button.getAttribute("disabled") !== null ||
        button.classList.contains("T-I-JO") ||
        button.classList.contains("aqJ");
      return !disabled;
    }) || null;
  }

  function clickGmailToolbarButton(button) {
    if (!button) return false;

    button.scrollIntoView({ block: "center", inline: "center" });
    try {
      button.focus();
    } catch (error) {
      // Some Gmail toolbar elements are not focusable.
    }

    ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((eventName) => {
      const EventCtor = eventName.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
      button.dispatchEvent(new EventCtor(eventName, {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: eventName.includes("down") ? 1 : 0,
      }));
    });

    try {
      button.click();
    } catch (error) {
      // The dispatched click above is still the primary path.
    }

    return true;
  }

  function findVisibleGmailButtonByText(textMatches = []) {
    const matches = textMatches.map((text) => text.toLowerCase());
    const candidates = Array.from(document.querySelectorAll('div[role="button"], button, [aria-label], [data-tooltip]'));

    return candidates.find((button) => {
      if (!button || button.offsetParent === null) return false;
      const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("data-tooltip") || ""} ${button.textContent || ""}`.toLowerCase();
      const disabled =
        button.getAttribute("aria-disabled") === "true" ||
        button.getAttribute("disabled") !== null ||
        button.classList.contains("T-I-JO") ||
        button.classList.contains("aqJ");

      return !disabled && matches.some((match) => label.includes(match));
    }) || null;
  }

  function isVisibleEnabledGmailButton(button) {
    if (!button || button.offsetParent === null) return false;

    const rect = button.getBoundingClientRect();
    const disabled =
      button.getAttribute("aria-disabled") === "true" ||
      button.getAttribute("disabled") !== null ||
      button.classList.contains("T-I-JO") ||
      button.classList.contains("aqJ");

    return rect.width > 0 && rect.height > 0 && !disabled;
  }

  function getGmailNotSpamButton() {
    const candidates = Array.from(document.querySelectorAll(
      'div[role="button"][aria-label="Not spam"], div[role="button"][data-tooltip="Not spam"], [aria-label="Not spam"], [data-tooltip="Not spam"]'
    ));

    return candidates.find(isVisibleEnabledGmailButton) ||
      findVisibleGmailButtonByText(["not spam", "report not spam"]);
  }

  function getVisibleTextFromSelectors(selectors = []) {
    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      const visible = elements.find((element) => element && element.offsetParent !== null && element.textContent.trim());
      if (visible) {
        return visible.textContent.replace(/\s+/g, " ").trim();
      }
    }

    return "";
  }

  async function waitForGmailNotSpamMoveConfirmation(maxWait = 10000) {
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const noticeText = getVisibleTextFromSelectors([
        '[role="alert"]',
        '[aria-live]',
        '.vh',
        '.bAq',
        '.aT',
      ]).toLowerCase();

      if (
        noticeText.includes("moved to inbox") ||
        noticeText.includes("moved to the inbox") ||
        noticeText.includes("marked as not spam") ||
        noticeText.includes("removed from spam") ||
        noticeText.includes("unmarked as spam") ||
        (noticeText.includes("spam") && noticeText.includes("inbox"))
      ) {
        return true;
      }

      const stillInSpamMessage = window.location.hash.startsWith("#spam/") || window.location.hash.startsWith("#search/");
      const notSpamStillVisible = Boolean(getGmailNotSpamButton());
      const mailboxVisible = provider.inboxSelectors.some((selector) => {
        const mailbox = document.querySelector(selector);
        return mailbox && mailbox.offsetParent !== null;
      });

      if (!notSpamStillVisible && (!stillInSpamMessage || mailboxVisible)) {
        return true;
      }

      if (state === "stopped") return false;
      await sleep(400);
    }

    return false;
  }

  function gmailSpamEmailLooksSafe(root = document) {
    return getGmailProvider().emailLooksSafe(root);
  }

  function normalizeGmailQueueText(value = "") {
    return String(value).replace(/\s+/g, " ").trim().toLowerCase();
  }

  function rememberMovedGmailSpamEmail(rowId, subject) {
    getGmailProvider().rememberMovedSpamEmail(rowId, subject);
  }

  function forgetMovedGmailSpamEmail(rowId, subject) {
    getGmailProvider().forgetMovedSpamEmail(rowId, subject);
  }

  function getVisibleRowsBySelectors(selectors = []) {
    for (const selector of selectors) {
      const rows = Array.from(document.querySelectorAll(selector));
      const visibleRows = rows.filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.height > 0 && rect.width > 0 && row.offsetParent !== null;
      });

      if (visibleRows.length > 0) return visibleRows;
    }

    return [];
  }

  function getMovedGmailSpamRowsVisibleInInbox() {
    return getGmailProvider().getMovedSpamRowsVisibleInInbox();
  }

  async function moveOpenedGmailSpamEmailToInbox() {
    if (!isGmailProvider()) return false;

    const notSpamButton = getGmailNotSpamButton();
    if (!notSpamButton) {
      log('Could not find Gmail Not spam button. Spam email was processed but not moved.', 'warn');
      return false;
    }

    log('Moving safe Spam email to Inbox using Not spam…', 'info');
    clickGmailToolbarButton(notSpamButton);
    const moved = await waitForGmailNotSpamMoveConfirmation(10000);
    if (!moved) {
      log('Could not confirm Gmail moved this Spam email to Inbox after clicking Not spam.', 'warn');
      return false;
    }

    log('Confirmed safe Spam email moved to Inbox.', 'success');
    return true;
  }

  async function waitForGmailPageRangeChange(previousRange, maxWait = 12000) {
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      await sleep(500);
      const currentRange = getGmailPageRangeText();

      if (currentRange && currentRange !== previousRange) {
        return true;
      }

      if (state === "stopped") return false;
    }

    return false;
  }

  async function goToNextGmailPage() {
    if (!isGmailProvider()) return false;

    const olderButton = getEnabledGmailOlderButton();
    if (!olderButton) return false;

    const previousRange = getGmailPageRangeText();
    log(`Moving to next Gmail page${previousRange ? ` from ${previousRange}` : ""}…`, "info");

    clickGmailToolbarButton(olderButton);

    const changed = await waitForGmailPageRangeChange(previousRange, 12000);
    if (!changed) {
      log("Next Gmail page click did not change the message range. Stopping pagination for this folder.", "warn");
      return false;
    }

    await waitForInbox(12000);
    await sleep(1200);
    log(`Now on Gmail page ${getGmailPageRangeText() || "next"}`, "success");
    return true;
  }

  async function refreshCurrentMailbox(mailboxLabel = "") {
    let refreshBtn = null;

    if (provider) {
      for (const sel of provider.refreshSelectors) {
        refreshBtn = document.querySelector(sel);
        if (refreshBtn) break;
      }
    }

    if (refreshBtn) {
      refreshBtn.click();
    } else if (isYahooProvider() || isOutlookProvider() || isAolProvider()) {
      const mailboxProvider = getMailboxProvider();
      if (mailboxProvider && mailboxProvider.navigateMailbox) {
        await mailboxProvider.navigateMailbox(mailboxLabel === "Spam" ? "spam" : "inbox");
      } else {
        log(`${getProviderDisplayLabel()} refresh control not found; continuing without full page reload.`, "warn");
      }
    } else {
      window.location.reload();
    }
  }

  function getFilteredUnreadRows(mailboxLabel = "") {
    let unreadRows = getUnreadRows();

    const mailboxProvider = getMailboxProvider();
    if (
      isOutlookProvider() &&
      mailboxProvider &&
      mailboxLabel === "Inbox" &&
      movedSpamInboxPassActive &&
      !mailboxProvider.hasMovedSpamQueue()
    ) {
      return [];
    }

    if (isAolProvider() && mailboxProvider && mailboxLabel === "Inbox" && aolMovedSpamInboxOnlyMode && !mailboxProvider.hasMovedSpamQueue()) {
      return [];
    }

    if (isAolProvider() && mailboxProvider && mailboxLabel === "Inbox" && mailboxProvider.hasMovedSpamQueue()) {
      const movedSpamRows = mailboxProvider.getMovedSpamRowsVisibleInInbox();
      let movedRows = filterCachedProcessableRows(movedSpamRows);
      const movedRowSet = new Set(movedSpamRows);

      unreadRows = filterCachedProcessableRows(unreadRows.filter((row) => !movedRowSet.has(row)));

      if (settings.randomEmailOpening) {
        if (movedRows.length > 1) {
          movedRows = shuffleArray(movedRows);
        }
        if (unreadRows.length > 1) {
          unreadRows = shuffleArray(unreadRows);
        }
      }

      if (movedSpamRows.length > 0) {
        log(`Queued Spam-to-Inbox emails ready for processing: ${movedSpamRows.length}`, "info");
      }

      if (aolMovedSpamInboxOnlyMode) {
        return movedRows;
      }

      return [...movedRows, ...unreadRows];
    }

    if (isOutlookProvider() && mailboxProvider && mailboxLabel === "Inbox" && mailboxProvider.hasMovedSpamQueue()) {
      const movedSpamRows = mailboxProvider.getMovedSpamRowsVisibleInInbox();
      let movedRows = filterCachedProcessableRows(movedSpamRows);
      const movedRowSet = new Set(movedSpamRows);

      unreadRows = filterCachedProcessableRows(unreadRows.filter((row) => !movedRowSet.has(row)));

      if (settings.randomEmailOpening) {
        if (movedRows.length > 1) {
          movedRows = shuffleArray(movedRows);
        }
        if (unreadRows.length > 1) {
          unreadRows = shuffleArray(unreadRows);
        }
      }

      if (movedSpamRows.length > 0) {
        log(`Queued Junk-to-Inbox emails ready for processing: ${movedSpamRows.length}`, "info");
      }

      return [...movedRows, ...unreadRows];
    }

    if (mailboxProvider && mailboxLabel === "Inbox" && mailboxProvider.hasMovedSpamQueue()) {
      const movedSpamRows = mailboxProvider.getMovedSpamRowsVisibleInInbox();
      const seenRows = new Set(unreadRows);

      for (const movedRow of movedSpamRows) {
        if (!seenRows.has(movedRow)) {
          unreadRows.push(movedRow);
          seenRows.add(movedRow);
        }
      }

      if (movedSpamRows.length > 0) {
        log(`Queued Spam-to-Inbox emails ready for processing: ${movedSpamRows.length}`, "info");
      }
    }

    unreadRows = filterCachedProcessableRows(unreadRows);

    if (settings.randomEmailOpening && unreadRows.length > 1) {
      unreadRows = shuffleArray(unreadRows);
      log("Random email opening enabled. Shuffled unread emails.", "info");
    }

    return unreadRows;
  }

  async function runAutomation() {
    activeAccount = getActiveAccount();
    let accountEmailsOpened = 0;
    let accountLimitReached = false;
    let aolSpamEmailsOpened = 0;

    if (settings.enableAccountSwitching) {
      const accounts = await getSelectedAccountObjects();
      activeAccount = accounts[settings.currentAccountIndex] || activeAccount;

      const currentAccount = getActiveAccount();
      const shouldSwitchBeforeScan = Boolean(
        activeAccount?.id &&
        currentAccount?.id &&
        activeAccount.id !== currentAccount.id &&
        !activeAccount.id.endsWith(":current") &&
        !currentAccount.id.endsWith(":current")
      );

      if (shouldSwitchBeforeScan) {
        const switched = await requestAccountSwitch(activeAccount, settings.currentAccountIndex || 0);
        if (switched) return;
        log("Continuing on current account after initial switch failure", "warn");
      }

      log(`Scanning ${activeAccount.label || activeAccount.id} for unread emails...`);
      await waitForInboxReadyAfterSwitch(activeAccount, 25000);
    } else {
      log(isGmailProvider() ? "Scanning Gmail Spam first, then Inbox…" : "Scanning for unread emails...");
    }

    async function processCurrentMailbox(mailboxLabel) {
      let cycle = 0;
      const MAX_CYCLES = 5;

      while (state === "running" && cycle < MAX_CYCLES) {
        cycle++;

        let unreadRows = getFilteredUnreadRows(mailboxLabel);
        sendMsg("UNREAD_COUNT", { count: unreadRows.length });

        if (unreadRows.length === 0) {
          if (isScrollableMailboxProvider()) {
            const foundAfterScroll = await scrollYahooMailboxUntilProcessableRows(mailboxLabel);
            if (foundAfterScroll) {
              log(`Found more ${getProviderDisplayLabel()} ${mailboxLabel} emails after scrolling.`, "info");
              cycle = 0;
              continue;
            }
          }

          if ((isYahooProvider() || isAolProvider() || isOutlookProvider()) && mailboxLabel === "Spam") {
            log(`Finished ${mailboxLabel}.`, "success");
            break;
          }

          if (isGmailProvider()) {
            const hasNextPage = await goToNextGmailPage();
            if (hasNextPage) {
              cycle = 0;
              continue;
            }
          }

          if (isMovedSpamInboxPass(mailboxLabel)) {
            log(`No queued ${getProviderDisplayLabel()} Spam/Junk emails visible in Inbox. Continuing without refresh.`, "info");
            break;
          }

          if (settings.autoRefresh && cycle < MAX_CYCLES) {
            log(`No unread emails visible in ${mailboxLabel}. Refreshing…`);
            await sleep(1500);
            await refreshCurrentMailbox(mailboxLabel);
            await sleep(3000);
            if (isScrollableMailboxProvider()) {
              await resetYahooMailboxScrollPosition();
            }

            unreadRows = getFilteredUnreadRows(mailboxLabel);
            if (unreadRows.length === 0) {
              if (isScrollableMailboxProvider()) {
                const foundAfterRefreshScroll = await scrollYahooMailboxUntilProcessableRows(mailboxLabel);
                if (foundAfterRefreshScroll) {
                  log(`Found more ${getProviderDisplayLabel()} ${mailboxLabel} emails after refresh and scroll.`, "info");
                  cycle = 0;
                  continue;
                }
              }

              if (isGmailProvider()) {
                const hasNextAfterRefresh = await goToNextGmailPage();
                if (hasNextAfterRefresh) {
                  cycle = 0;
                  continue;
                }
              }
              log(`Finished ${mailboxLabel}.`, "success");
              break;
            }

          } else {
            log(`Finished ${mailboxLabel}.`, "success");
            break;
          }
        }

        for (const row of unreadRows) {
          const spamMoveProvider = getSpamMoveProvider(mailboxLabel);
          const openedCount = settings.enableAccountSwitching ? accountEmailsOpened : emailsOpened;

          if (spamMoveProvider && isAolProvider() && aolSpamEmailsOpened >= Math.max(0, settings.maxEmails - openedCount)) {
            log(`Prepared the maximum AOL Spam emails allowed by this run (${settings.maxEmails}). Switching to Inbox.`, "success");
            return;
          }

          const hasReachedLimit = settings.enableAccountSwitching
            ? accountEmailsOpened >= settings.maxEmails
            : emailsOpened >= settings.maxEmails;

          if (hasReachedLimit) {
            log(
              settings.enableAccountSwitching
                ? `Reached account email limit (${settings.maxEmails})`
                : `Reached email limit (${settings.maxEmails})`,
              "success",
            );

            accountLimitReached = true;

            if (!settings.enableAccountSwitching) {
              state = "stopped";
              sendMsg("DONE");
            }

            break;
          }

          if (state === "stopped") break;
          if (!(await waitIfPaused())) break;

          const rowId = getEmailIdentity(row);
          if (!rowId) {
            log("Skipping email because no stable email id could be detected", "warn");
            continue;
          }

          const processedCacheKey = getProcessedCacheKey(rowId);

          if (processedHrefs.has(processedCacheKey)) continue;

          if (settings.enableProcessedTracking) {
            try {
              const wasProcessed = await window.ProcessedEmailManager.isProcessed(getTrackingProviderName(), rowId);
              if (wasProcessed && !canReprocessUnread()) {
                processedHrefs.add(processedCacheKey);
                log(`Skipping already processed email: ${rowId}`, "warn");
                continue;
              }

              if (wasProcessed && canReprocessUnread()) {
                log(`Reprocessing unread email with processed record: ${rowId}`, "warn");
              }
            } catch (error) {
              log(`Processed lookup failed: ${error.message}`, "error");
            }
          }

          const subject = getEmailSubject(row);
          log(`Opening from ${mailboxLabel}: "${subject}"…`);

          const opened = await openEmailWithRetry(row, subject, rowId, mailboxLabel);
          if (!opened) {
            processedHrefs.add(processedCacheKey);
            log(`Failed to open email after retry limit, skipping`, "warn");
            log(`Email skipped for this automation run to avoid retry loop.`, "warn");
            goToInbox();
            await waitForInbox(7000);
            await sleep(1200);
            continue;
          }

          if (spamMoveProvider && isAolProvider()) {
            aolSpamEmailsOpened++;
          }

          log("Email opened", "success");

          if (!(await waitForManualActivityQuiet())) break;

          if (spamMoveProvider && (isAolProvider() || isOutlookProvider())) {
            const moveProviderLabel = getProviderDisplayLabel();
            const openedRoot = await waitForEmailContentLoaded();

            if (!openedRoot || !spamMoveProvider.emailLooksSafe(openedRoot)) {
              log(`${moveProviderLabel} Junk/Spam email skipped: unsafe link detected. It was not moved to Inbox or processed.`, 'warn');
              processedHrefs.add(processedCacheKey);
              log(`${moveProviderLabel} Junk/Spam email skipped for this automation run.`, 'warn');
              log(`Returning to ${mailboxLabel}...`);
              await spamMoveProvider.navigateMailbox("spam");
              await sleep(settings.backDelay * 1000);
              if (isScrollableMailboxProvider()) {
                cycle = 0;
                break;
              }
              continue;
            }

            log(`${moveProviderLabel} Junk/Spam email opened; safe link check passed. Moving it to Inbox before processing links.`, 'info');
            const movedToInbox = await spamMoveProvider.moveOpenedSpamEmailToInbox(rowId);
            if (movedToInbox) {
              spamMoveProvider.rememberMovedSpamEmail(rowId, subject);
              log(`${moveProviderLabel} Junk/Spam email moved to Inbox. It will be processed during the Inbox scan.`, 'success');
            } else {
              processedHrefs.add(processedCacheKey);
              log(`${moveProviderLabel} Junk/Spam email could not be moved, so it was not processed yet.`, 'warn');
              log(`${moveProviderLabel} Junk/Spam email skipped for this automation run to avoid retry loop.`, 'warn');
            }

            if (state === "stopped") break;
            if (!(await waitIfPaused())) break;

            await spamMoveProvider.navigateMailbox("spam");
            await sleep(settings.backDelay * 1000);
            if (isScrollableMailboxProvider()) {
              cycle = 0;
              break;
            }
            continue;
          }

          const openedRoot = await waitForEmailContentLoaded();

          if (spamMoveProvider) {
            if (!spamMoveProvider.emailLooksSafe(openedRoot)) {
              log('Spam email skipped: unsafe link detected. It was not moved to Inbox or processed.', 'warn');
              processedHrefs.add(processedCacheKey);
              log('Spam email skipped for this automation run.', 'warn');
              log(`Returning to ${mailboxLabel}…`);
              await spamMoveProvider.navigateMailbox("spam");
              await sleep(settings.backDelay * 1000);
              if (isScrollableMailboxProvider()) {
                cycle = 0;
                break;
              }
              continue;
            }

            const movedToInbox = await spamMoveProvider.moveOpenedSpamEmailToInbox(rowId);
            if (movedToInbox) {
              spamMoveProvider.rememberMovedSpamEmail(rowId, subject);
              log('Safe Spam email moved to Inbox. It will be processed during the Inbox scan.', 'success');
            } else {
              processedHrefs.add(processedCacheKey);
              log('Safe Spam email could not be moved, so it was not processed yet.', 'warn');
              log('Spam email skipped for this automation run to avoid retry loop.', 'warn');
            }

            if (state === "stopped") break;
            if (!(await waitIfPaused())) break;

            await spamMoveProvider.navigateMailbox("spam");
            await sleep(settings.backDelay * 1000);
            if (isScrollableMailboxProvider()) {
              cycle = 0;
              break;
            }
            continue;
          }

          processedHrefs.add(processedCacheKey);
          emailsOpened++;
          accountEmailsOpened++;
          sendMsg("EMAIL_OPENED", { count: emailsOpened, subject });

          await processOpenedEmail(rowId);
          await markOpenedMailboxEmailRead(rowId);
          getMailboxProvider()?.forgetMovedSpamEmail?.(rowId, subject);

          log(`Reading for ${settings.readTime}s…`);
          await sleep(settings.readTime * 1000);
          await waitForManualActivityQuiet();

          if (state === "stopped") break;
          if (!(await waitIfPaused())) break;

          log(`Returning to ${mailboxLabel}…`);
          goToInbox();
          await waitForInbox(10000);
          await sleep(settings.backDelay * 1000);

          if (state === "stopped") break;
          if (!(await waitIfPaused())) break;
          if (isScrollableMailboxProvider()) {
            cycle = 0;
            break;
          }
        }

        if (state !== "running") break;
        if (accountLimitReached) break;
        await sleep(1000);
      }
    }

    if (isGmailProvider()) {
      const gmailMailboxes = getGmailProvider().getMailboxes();

      for (const mailbox of gmailMailboxes) {
        if (state !== "running" || accountLimitReached) break;
        log(`Checking Gmail ${mailbox.label}…`, "info");
        await navigateToGmailMailbox(mailbox.folder);
        await processCurrentMailbox(mailbox.label);
      }
    } else if (getMailboxProvider()) {
      const mailboxProvider = getMailboxProvider();
      const providerLabel = getProviderDisplayLabel();
      const mailboxes = mailboxProvider.getMailboxes();

      for (const mailbox of mailboxes) {
        if (state !== "running" || accountLimitReached) break;
        log(`Checking ${providerLabel} ${mailbox.label}...`, "info");
        await mailboxProvider.navigateMailbox(mailbox.folder);
        if (isScrollableMailboxProvider()) {
          await resetYahooMailboxScrollPosition();
        }
        await processCurrentMailbox(mailbox.label);

        if (
          state === "running" &&
          mailbox.folder === "spam" &&
          mailboxProvider.hasMovedSpamQueue()
        ) {
          log(`Checking ${providerLabel} Inbox for emails moved from ${mailbox.label}...`, "info");
          await mailboxProvider.navigateMailbox("inbox");
          if (isScrollableMailboxProvider()) {
            await resetYahooMailboxScrollPosition();
          }
          movedSpamInboxPassActive = isAolProvider() || isOutlookProvider();
          aolMovedSpamInboxOnlyMode = isAolProvider();
          try {
            await processCurrentMailbox("Inbox");
          } finally {
            movedSpamInboxPassActive = false;
            aolMovedSpamInboxOnlyMode = false;
          }
        }
      }
    } else {
      await processCurrentMailbox("Inbox");
    }

    if (state === "running") {
      if (settings.enableAccountSwitching) {
        const accounts = await getSelectedAccountObjects();
        const nextIndex = (settings.currentAccountIndex || 0) + 1;

        if (nextIndex < accounts.length) {
          const nextAccount = accounts[nextIndex];
          const switched = await requestAccountSwitch(nextAccount, nextIndex);

          if (switched) {
            return;
          }

          log("Continuing on current account after switch failure", "warn");
        }
      }

      state = "idle";
      sendMsg("DONE");
      log("Automation complete.", "success");
    }
  }

  //  Message Listener
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "START") {
      if (state === "running") return;
      state = "running";
      emailsOpened = Number.isFinite(msg.settings?.sessionOpened) ? msg.settings.sessionOpened : 0;
      processedHrefs.clear();
      getGmailProvider()?.clearMovedSpamQueue();
      getYahooProvider()?.clearMovedSpamQueue();
      getAolProvider()?.clearMovedSpamQueue();
      getOutlookProvider()?.clearMovedSpamQueue();
      manualPauseUntil = 0;
      manualPauseLogged = false;
      settings = {
        ...settings,
        ...msg.settings,
        currentAccountIndex: msg.settings?.currentAccountIndex || 0,
        sessionOpened: msg.settings?.sessionOpened || 0,
      };
      runAutomation().catch((err) => {
        console.error("[EmailReadAutomate] Error:", err);
        sendMsg("ERROR", { message: err.message });
      });
      sendResponse({ ok: true });
    }

    if (msg.action === "PAUSE") {
      state = "paused";
    }

    if (msg.action === "RESUME") {
      state = "running";
    }

    if (msg.action === "STOP") {
      state = "stopped";
    }

    if (msg.action === "CLEAR_PROCESSED_CACHE") {
      processedHrefs.clear();
      log("In-memory processed cache cleared", "success");
      sendResponse({ ok: true });
    }

    if (msg.action === "DISCOVER_ACCOUNTS") {
      discoverAccounts()
        .then((accounts) => {
          sendResponse({ ok: true, accounts, currentAccount: getActiveAccount() });
        })
        .catch((error) => {
          sendResponse({ ok: false, error: error.message, accounts: [], currentAccount: getActiveAccount() });
        });
      return true;
    }

    if (msg.action === "GET_ACTIVE_ACCOUNT") {
      sendResponse({ ok: true, currentAccount: getActiveAccount() });
      return false;
    }

    if (msg.action === "SWITCH_PROVIDER_ACCOUNT") {
      const switchProvider = getAccountSwitchProvider();
      if (!switchProvider?.switchAccount) {
        sendResponse({ ok: false, error: "Provider does not support in-page account switching" });
        return false;
      }

      switchProvider.switchAccount(msg.account)
        .then((result) => sendResponse(result || { ok: false, error: "Account switch did not return a result" }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (msg.action === "PING") {
      sendResponse({ ok: true, version: CONTENT_SCRIPT_VERSION });
    }
  });

  console.log(
    "[EmailReadAutomate] Content script loaded on",
    window.location.href,
  );
})();
