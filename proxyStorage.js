(function () {
  "use strict";

  const PROXY_CONFIGS_KEY = "proxyConfigs";
  const ACCOUNT_PROXY_MAP_KEY = "accountProxyMap";
  const PROXY_SETTINGS_KEY = "proxySettings";
  const DEFAULT_PROXY_SETTINGS = {
    enabled: false,
    allowFallback: false,
  };
  const PROXY_STATUSES = new Set(["Online", "Offline", "Auth Failed", "Untested"]);

  function readStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function writeStorage(values) {
    return chrome.storage.local.set(values);
  }

  function normalizeStatus(status) {
    if (status === "Active") return "Online";
    return PROXY_STATUSES.has(status) ? status : "Untested";
  }

  function makeProxyId() {
    return `proxy_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  function normalizeProxy(proxy = {}) {
    const port = parseInt(proxy.port, 10);

    return {
      id: proxy.id || makeProxyId(),
      host: String(proxy.host || "").trim(),
      port: Number.isFinite(port) ? port : "",
      username: String(proxy.username || "").trim(),
      password: String(proxy.password || ""),
      country: String(proxy.country || "").trim(),
      city: String(proxy.city || "").trim(),
      type: String(proxy.type || "http").trim() || "http",
      status: normalizeStatus(proxy.status),
      assignedTo: String(proxy.assignedTo || "").trim(),
      lastCheck: proxy.lastCheck || "",
      latency: proxy.latency || "",
      lastKnownIp: proxy.lastKnownIp || "",
      enabled: proxy.enabled !== false,
    };
  }

  async function getProxies() {
    const data = await readStorage([PROXY_CONFIGS_KEY]);
    const proxies = Array.isArray(data[PROXY_CONFIGS_KEY]) ? data[PROXY_CONFIGS_KEY] : [];
    return proxies.map(normalizeProxy);
  }

  async function saveProxies(proxies) {
    const normalized = Array.isArray(proxies) ? proxies.map(normalizeProxy) : [];
    await writeStorage({ [PROXY_CONFIGS_KEY]: normalized });
    return normalized;
  }

  async function getAccountProxyMap() {
    const data = await readStorage([ACCOUNT_PROXY_MAP_KEY]);
    return data[ACCOUNT_PROXY_MAP_KEY] && typeof data[ACCOUNT_PROXY_MAP_KEY] === "object"
      ? data[ACCOUNT_PROXY_MAP_KEY]
      : {};
  }

  async function saveAccountProxyMap(map) {
    await writeStorage({ [ACCOUNT_PROXY_MAP_KEY]: map || {} });
    return map || {};
  }

  async function upsertProxy(proxy) {
    const proxies = await getProxies();
    const normalized = normalizeProxy(proxy);
    const index = proxies.findIndex((item) => item.id === normalized.id);
    const next = index >= 0
      ? proxies.map((item) => item.id === normalized.id ? normalized : item)
      : [...proxies, normalized];

    await saveProxies(next);

    if (normalized.assignedTo) {
      await setAccountProxyAssignment(normalized.assignedTo, normalized.id);
    }

    return normalized;
  }

  async function updateProxy(proxyId, changes = {}) {
    const proxies = await getProxies();
    let updated = null;
    const next = proxies.map((proxy) => {
      if (proxy.id !== proxyId) return proxy;
      updated = normalizeProxy({ ...proxy, ...changes, id: proxy.id });
      return updated;
    });

    await saveProxies(next);
    return updated;
  }

  async function removeProxy(proxyId) {
    const proxies = await getProxies();
    const next = proxies.filter((proxy) => proxy.id !== proxyId);
    const map = await getAccountProxyMap();

    Object.keys(map).forEach((accountId) => {
      if (map[accountId] === proxyId) {
        delete map[accountId];
      }
    });

    await writeStorage({
      [PROXY_CONFIGS_KEY]: next,
      [ACCOUNT_PROXY_MAP_KEY]: map,
    });

    return next;
  }

  async function setAccountProxyAssignment(accountId, proxyId) {
    const safeAccountId = String(accountId || "").trim();
    const safeProxyId = String(proxyId || "").trim();
    const proxies = await getProxies();
    const map = await getAccountProxyMap();

    if (!safeAccountId) {
      return { proxies, map };
    }

    if (!safeProxyId) {
      delete map[safeAccountId];
    } else {
      map[safeAccountId] = safeProxyId;
    }

    const next = proxies.map((proxy) => {
      if (proxy.id === safeProxyId) {
        return { ...proxy, assignedTo: safeAccountId };
      }

      if (proxy.assignedTo === safeAccountId) {
        return { ...proxy, assignedTo: "" };
      }

      return proxy;
    });

    await writeStorage({
      [PROXY_CONFIGS_KEY]: next,
      [ACCOUNT_PROXY_MAP_KEY]: map,
    });

    return { proxies: next, map };
  }

  async function getAssignedProxy(account) {
    const accountId = typeof account === "string" ? account : account?.id;
    if (!accountId) return null;

    const [proxies, map] = await Promise.all([
      getProxies(),
      getAccountProxyMap(),
    ]);

    const mappedProxyId = map[accountId];
    return proxies.find((proxy) => proxy.id === mappedProxyId) ||
      proxies.find((proxy) => proxy.assignedTo === accountId) ||
      null;
  }

  async function getProxySettings() {
    const data = await readStorage([PROXY_SETTINGS_KEY]);
    return {
      ...DEFAULT_PROXY_SETTINGS,
      ...(data[PROXY_SETTINGS_KEY] || {}),
    };
  }

  async function saveProxySettings(settings = {}) {
    const next = {
      ...DEFAULT_PROXY_SETTINGS,
      ...settings,
    };
    await writeStorage({ [PROXY_SETTINGS_KEY]: next });
    return next;
  }

  globalThis.ProxyStorage = {
    PROXY_CONFIGS_KEY,
    ACCOUNT_PROXY_MAP_KEY,
    PROXY_SETTINGS_KEY,
    getProxies,
    saveProxies,
    upsertProxy,
    updateProxy,
    removeProxy,
    getAccountProxyMap,
    saveAccountProxyMap,
    setAccountProxyAssignment,
    getAssignedProxy,
    getProxySettings,
    saveProxySettings,
    normalizeProxy,
  };
})();
