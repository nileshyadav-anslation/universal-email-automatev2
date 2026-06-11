// ProcessedEmailManager - tracks processed email state in chrome.storage.local.
(function () {
  "use strict";

  const STORAGE_KEY = "processedEmails";

  function makeKey(provider, emailId) {
    return `${provider || "unknown"}:${emailId || "unknown"}`;
  }

  function getStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function setStorage(values) {
    return new Promise((resolve) => chrome.storage.local.set(values, resolve));
  }

  async function getAll() {
    const data = await getStorage([STORAGE_KEY]);
    return data[STORAGE_KEY] || {};
  }

  async function get(provider, emailId) {
    const records = await getAll();
    return records[makeKey(provider, emailId)] || null;
  }

  async function isProcessed(provider, emailId) {
    const record = await get(provider, emailId);
    return Boolean(record && record.processed);
  }

  async function upsert(provider, emailId, values) {
    const records = await getAll();
    const key = makeKey(provider, emailId);

    records[key] = {
      emailId,
      provider,
      processed: false,
      replied: false,
      linksOpened: 0,
      processedAt: null,
      ...(records[key] || {}),
      ...values,
    };

    await setStorage({ [STORAGE_KEY]: records });
    return records[key];
  }

  async function markProcessed(provider, emailId, values = {}) {
    return upsert(provider, emailId, {
      processed: true,
      processedAt: new Date().toISOString(),
      ...values,
    });
  }

  window.ProcessedEmailManager = {
    get,
    isProcessed,
    markProcessed,
    upsert,
  };
})();
