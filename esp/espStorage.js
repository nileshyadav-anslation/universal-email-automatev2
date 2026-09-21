// espStorage.js - persistence for ESP connections and the campaign index.
//
// Deliberately shaped like proxyStorage.js: a normalize function, a small
// accessor API on globalThis, and everything in chrome.storage.local. Loaded
// by both the service worker (importScripts) and the popup (<script>), so it
// must not assume either context.
(function () {
  "use strict";

  const ESP_CONNECTIONS_KEY = "espConnections";
  const ESP_SETTINGS_KEY = "espSettings";
  const ESP_CAMPAIGN_INDEX_KEY = "espCampaignIndex";

  const DEFAULT_ESP_SETTINGS = {
    // Off means the extension processes every unread email, exactly as it did
    // before ESP support existed. Nothing below runs until this is switched on.
    enabled: false,
    // How far back to pull campaigns when syncing.
    lookbackDays: 30,
    // Belt and braces: if a sync fails and the index is empty, should the run
    // process everything (false) or nothing (true)? Default false so a broken
    // ESP connection degrades to today's behaviour rather than a dead run.
    strictWhenIndexEmpty: false,
  };

  const CONNECTION_STATUSES = new Set([
    "Connected",
    "Not tested",
    "Invalid credentials",
    "Error",
    "Disabled",
  ]);

  function readStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function writeStorage(values) {
    return chrome.storage.local.set(values);
  }

  function makeConnectionId() {
    return `esp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  function normalizeStatus(status) {
    return CONNECTION_STATUSES.has(status) ? status : "Not tested";
  }

  function normalizeStringList(value) {
    const raw = Array.isArray(value) ? value : [];
    const seen = new Set();
    const out = [];

    raw.forEach((item) => {
      const text = String(item || "").trim().toLowerCase();
      if (!text || seen.has(text)) return;
      seen.add(text);
      out.push(text);
    });

    return out;
  }

  function normalizeConnection(connection = {}) {
    return {
      id: String(connection.id || "").trim() || makeConnectionId(),
      provider: String(connection.provider || "").trim().toLowerCase(),
      name: String(connection.name || "").trim(),
      enabled: connection.enabled !== false,
      // Provider-specific fields (apiKey, domain, region...). Kept as an opaque
      // bag so adding a provider never changes this file.
      credentials: connection.credentials && typeof connection.credentials === "object"
        ? { ...connection.credentials }
        : {},
      // Fetched from the provider, or entered by hand when its API has no
      // endpoint for them. Never hardcoded per provider.
      domains: normalizeStringList(connection.domains),
      senders: normalizeStringList(connection.senders),
      status: normalizeStatus(connection.status),
      lastError: String(connection.lastError || ""),
      lastSyncAt: connection.lastSyncAt || "",
      accountLabel: String(connection.accountLabel || ""),
      createdAt: connection.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Credentials are stripped before anything leaves this module for the popup
  // or the logs. The popup only ever needs to know a key EXISTS, not its value.
  function redactConnection(connection = {}) {
    const credentialKeys = Object.keys(connection.credentials || {});
    return {
      ...connection,
      credentials: undefined,
      credentialKeys,
      hasCredentials: credentialKeys.length > 0,
    };
  }

  async function getConnections() {
    const data = await readStorage([ESP_CONNECTIONS_KEY]);
    const list = Array.isArray(data[ESP_CONNECTIONS_KEY]) ? data[ESP_CONNECTIONS_KEY] : [];
    return list.map(normalizeConnection);
  }

  async function getRedactedConnections() {
    return (await getConnections()).map(redactConnection);
  }

  async function getConnection(id) {
    const list = await getConnections();
    return list.find((item) => item.id === id) || null;
  }

  async function saveConnections(connections = []) {
    const normalized = Array.isArray(connections) ? connections.map(normalizeConnection) : [];
    await writeStorage({ [ESP_CONNECTIONS_KEY]: normalized });
    return normalized;
  }

  async function upsertConnection(connection = {}) {
    const list = await getConnections();
    const next = normalizeConnection(connection);
    const index = list.findIndex((item) => item.id === next.id);

    if (index === -1) {
      list.push(next);
    } else {
      // Preserve stored credentials when the caller omits them - the popup
      // never round-trips secrets, so an edit must not wipe the key.
      const existing = list[index];
      list[index] = {
        ...next,
        credentials: Object.keys(next.credentials).length ? next.credentials : existing.credentials,
        createdAt: existing.createdAt,
      };
    }

    await writeStorage({ [ESP_CONNECTIONS_KEY]: list });
    return list;
  }

  async function updateConnection(id, patch = {}) {
    const list = await getConnections();
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return list;

    list[index] = normalizeConnection({ ...list[index], ...patch, id });
    await writeStorage({ [ESP_CONNECTIONS_KEY]: list });
    return list;
  }

  async function removeConnection(id) {
    const list = (await getConnections()).filter((item) => item.id !== id);
    await writeStorage({ [ESP_CONNECTIONS_KEY]: list });
    await removeCampaignsForConnection(id);
    return list;
  }

  async function getEspSettings() {
    const data = await readStorage([ESP_SETTINGS_KEY]);
    return { ...DEFAULT_ESP_SETTINGS, ...(data[ESP_SETTINGS_KEY] || {}) };
  }

  async function saveEspSettings(settings = {}) {
    const next = { ...DEFAULT_ESP_SETTINGS, ...settings };
    await writeStorage({ [ESP_SETTINGS_KEY]: next });
    return next;
  }

  // ── Campaign index ─────────────────────────────────────────────────────────
  // The flattened list of things an ESP says it sent: subject + sender, which
  // is all the matcher needs to recognise one in a mailbox. Kept separate from
  // the connection records so a re-sync never touches credentials.

  function normalizeCampaign(campaign = {}) {
    return {
      connectionId: String(campaign.connectionId || ""),
      provider: String(campaign.provider || "").toLowerCase(),
      id: String(campaign.id || ""),
      subject: String(campaign.subject || "").trim(),
      senderEmail: String(campaign.senderEmail || "").trim().toLowerCase(),
      senderName: String(campaign.senderName || "").trim(),
      sentAt: campaign.sentAt || "",
    };
  }

  async function getCampaignIndex() {
    const data = await readStorage([ESP_CAMPAIGN_INDEX_KEY]);
    const list = Array.isArray(data[ESP_CAMPAIGN_INDEX_KEY]) ? data[ESP_CAMPAIGN_INDEX_KEY] : [];
    return list.map(normalizeCampaign);
  }

  async function saveCampaignsForConnection(connectionId, campaigns = []) {
    const others = (await getCampaignIndex()).filter((item) => item.connectionId !== connectionId);
    const mine = campaigns.map((item) => normalizeCampaign({ ...item, connectionId }));
    const next = others.concat(mine);
    await writeStorage({ [ESP_CAMPAIGN_INDEX_KEY]: next });
    return next;
  }

  async function removeCampaignsForConnection(connectionId) {
    const next = (await getCampaignIndex()).filter((item) => item.connectionId !== connectionId);
    await writeStorage({ [ESP_CAMPAIGN_INDEX_KEY]: next });
    return next;
  }

  async function clearCampaignIndex() {
    await writeStorage({ [ESP_CAMPAIGN_INDEX_KEY]: [] });
  }

  globalThis.EspStorage = {
    ESP_CONNECTIONS_KEY,
    ESP_SETTINGS_KEY,
    ESP_CAMPAIGN_INDEX_KEY,
    DEFAULT_ESP_SETTINGS,
    makeConnectionId,
    normalizeConnection,
    redactConnection,
    getConnections,
    getRedactedConnections,
    getConnection,
    saveConnections,
    upsertConnection,
    updateConnection,
    removeConnection,
    getEspSettings,
    saveEspSettings,
    getCampaignIndex,
    saveCampaignsForConnection,
    removeCampaignsForConnection,
    clearCampaignIndex,
  };
})();
