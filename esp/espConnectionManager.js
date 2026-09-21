// espConnectionManager.js - lifecycle for configured ESP accounts.
//
// Owns add / remove / enable / test / sync, and is the only place that hands a
// stored credential to a provider adapter. Runs in the service worker, so the
// popup reaches it through messages and never holds a secret itself.
(function () {
  "use strict";

  const { EspManager, EspStorage } = globalThis;
  const { createEspError, isEspError } = globalThis.EspErrors;

  // Set by background.js so ESP activity lands in the same activity log as
  // everything else. No-op until then, and it must never be handed a secret.
  let logSink = () => {};

  function setLogger(fn) {
    if (typeof fn === "function") logSink = fn;
  }

  function log(message, level = "info") {
    logSink(`[ESP] ${message}`, level);
  }

  function toEspError(error, provider) {
    if (isEspError(error)) return error;
    return createEspError("API_ERROR", provider, error?.message || "Unexpected ESP error.");
  }

  function statusForError(error) {
    if (error.code === "INVALID_CREDENTIALS" || error.code === "AUTH_EXPIRED") return "Invalid credentials";
    return "Error";
  }

  async function addConnection({ provider, name, credentials }) {
    const adapter = EspManager.getProvider(provider);

    if (adapter.comingSoon) {
      throw createEspError("PROVIDER_UNAVAILABLE", provider, `${adapter.label} is not implemented yet.`);
    }

    const invalid = adapter.validateCredentials(credentials || {});
    if (invalid) throw invalid;

    const connection = EspStorage.normalizeConnection({
      provider: adapter.id,
      name: name || adapter.label,
      credentials,
      status: "Not tested",
    });

    await EspStorage.upsertConnection(connection);
    log(`Added ${adapter.label} connection "${connection.name}".`, "success");
    return EspStorage.redactConnection(connection);
  }

  async function removeConnection(id) {
    const connection = await EspStorage.getConnection(id);
    await EspStorage.removeConnection(id);
    log(`Removed connection "${connection?.name || id}" and its campaign index.`, "success");
  }

  async function setEnabled(id, enabled) {
    await EspStorage.updateConnection(id, {
      enabled: Boolean(enabled),
      status: enabled ? "Not tested" : "Disabled",
    });
    const connection = await EspStorage.getConnection(id);
    log(`${enabled ? "Enabled" : "Disabled"} connection "${connection?.name || id}".`);
  }

  async function testConnection(id) {
    const connection = await EspStorage.getConnection(id);
    if (!connection) throw createEspError("API_ERROR", "", "That ESP connection no longer exists.");

    const adapter = EspManager.getProvider(connection.provider);
    log(`Provider: ${adapter.label}`);

    try {
      const result = await adapter.testConnection(connection.credentials);
      await EspStorage.updateConnection(id, {
        status: "Connected",
        lastError: "",
        accountLabel: result?.account?.label || "",
      });
      log(`Connection test: SUCCESS${result?.account?.label ? ` (${result.account.label})` : ""}`, "success");
      return { ok: true, account: result?.account || null };
    } catch (rawError) {
      const error = toEspError(rawError, connection.provider);
      await EspStorage.updateConnection(id, { status: statusForError(error), lastError: error.message });
      log(`Connection test: FAILED - ${error.message}`, "error");
      return { ok: false, error };
    }
  }

  // Pulls account, domains, senders and campaigns, then stores them. The
  // campaign index is what the matcher reads; credentials never leave here.
  async function syncConnection(id) {
    const connection = await EspStorage.getConnection(id);
    if (!connection) throw createEspError("API_ERROR", "", "That ESP connection no longer exists.");

    if (connection.enabled === false) {
      return { ok: false, skipped: true };
    }

    const adapter = EspManager.getProvider(connection.provider);
    const espSettings = await EspStorage.getEspSettings();

    try {
      const result = typeof adapter.sync === "function"
        ? await adapter.sync(connection.credentials, { lookbackDays: espSettings.lookbackDays })
        : { account: null, domains: [], senders: [], campaigns: [] };

      const domains = (result.domains || []).filter((d) => d.verified !== false).map((d) => d.domain);
      const senders = (result.senders || []).map((s) => s.email);

      // Sender addresses seen on campaigns count too - a campaign proves that
      // address really sent through this ESP.
      const campaignSenders = (result.campaigns || []).map((c) => c.senderEmail).filter(Boolean);

      await EspStorage.updateConnection(id, {
        status: "Connected",
        lastError: "",
        accountLabel: result.account?.label || connection.accountLabel,
        domains,
        senders: senders.concat(campaignSenders),
        lastSyncAt: new Date().toISOString(),
      });

      await EspStorage.saveCampaignsForConnection(id, result.campaigns || []);

      log(`Provider: ${adapter.label}`);
      log(`Authenticated domains: ${domains.length}`);
      log(`Senders: ${new Set(senders.concat(campaignSenders)).size}`);
      log(`Campaigns indexed: ${(result.campaigns || []).length}`, "success");

      return {
        ok: true,
        domains: domains.length,
        senders: new Set(senders.concat(campaignSenders)).size,
        campaigns: (result.campaigns || []).length,
      };
    } catch (rawError) {
      const error = toEspError(rawError, connection.provider);
      await EspStorage.updateConnection(id, { status: statusForError(error), lastError: error.message });
      log(`Sync failed for ${adapter.label}: ${error.message}`, "error");
      return { ok: false, error };
    }
  }

  async function syncAll() {
    const connections = await EspStorage.getConnections();
    const active = connections.filter((c) => c.enabled !== false);
    const results = [];

    for (const connection of active) {
      results.push({ id: connection.id, ...(await syncConnection(connection.id)) });
    }

    return results;
  }

  // The matcher's view: one flat, credential-free rule set. Returned to the
  // content script, so it must never contain anything sensitive.
  async function getMatchRules() {
    const [settings, connections, campaigns] = await Promise.all([
      EspStorage.getEspSettings(),
      EspStorage.getConnections(),
      EspStorage.getCampaignIndex(),
    ]);

    const active = connections.filter((c) => c.enabled !== false);
    const activeIds = new Set(active.map((c) => c.id));

    const domains = new Set();
    const senders = new Set();
    active.forEach((c) => {
      c.domains.forEach((d) => domains.add(d));
      c.senders.forEach((s) => senders.add(s));
    });

    const subjects = campaigns
      .filter((c) => activeIds.has(c.connectionId))
      .map((c) => c.subject)
      .filter(Boolean);

    return {
      enabled: Boolean(settings.enabled) && active.length > 0,
      strictWhenIndexEmpty: Boolean(settings.strictWhenIndexEmpty),
      domains: Array.from(domains),
      senders: Array.from(senders),
      subjects,
      connectionCount: active.length,
    };
  }

  globalThis.EspConnectionManager = {
    setLogger,
    addConnection,
    removeConnection,
    setEnabled,
    testConnection,
    syncConnection,
    syncAll,
    getMatchRules,
  };
})();
