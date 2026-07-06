(function () {
  "use strict";

  const PROXY_CONFIGS_KEY = "proxyConfigs";
  const ACCOUNT_PROXY_MAP_KEY = "accountProxyMap";
  const PROXY_SETTINGS_KEY = "proxySettings";
  const MAX_PROXIES_PER_ACCOUNT = 3;
  const DEFAULT_PROXY_SETTINGS = {
    enabled: false,
    allowFallback: false,
    applyMode: "off",
    globalProxyId: "",
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

  function normalizeProxyIdList(value) {
    const rawIds = Array.isArray(value) ? value : (value ? [value] : []);
    const seen = new Set();
    const ids = [];

    rawIds.forEach((item) => {
      const id = String(item || "").trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });

    return ids.slice(0, MAX_PROXIES_PER_ACCOUNT);
  }

  function normalizeAccountProxyMap(map = {}) {
    if (!map || typeof map !== "object") return {};

    return Object.keys(map).reduce((normalized, accountId) => {
      const safeAccountId = String(accountId || "").trim();
      const ids = normalizeProxyIdList(map[accountId]);

      if (safeAccountId && ids.length) {
        normalized[safeAccountId] = ids;
      }

      return normalized;
    }, {});
  }

  function removeProxyIdFromMap(map = {}, proxyId = "") {
    const safeProxyId = String(proxyId || "").trim();
    if (!safeProxyId) return normalizeAccountProxyMap(map);

    const next = {};
    const normalized = normalizeAccountProxyMap(map);

    Object.keys(normalized).forEach((accountId) => {
      const ids = normalized[accountId].filter((id) => id !== safeProxyId);
      if (ids.length) {
        next[accountId] = ids;
      }
    });

    return next;
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
    return normalizeAccountProxyMap(data[ACCOUNT_PROXY_MAP_KEY]);
  }

  async function saveAccountProxyMap(map) {
    const normalized = normalizeAccountProxyMap(map);
    await writeStorage({ [ACCOUNT_PROXY_MAP_KEY]: normalized });
    return normalized;
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
      const assignment = await setAccountProxyAssignment(normalized.assignedTo, normalized.id);
      if (!assignment.ok) {
        await updateProxy(normalized.id, { assignedTo: "" });
        return {
          ...normalized,
          assignedTo: "",
          assignmentError: assignment.error,
        };
      }
    }

    const saved = await getProxies();
    return saved.find((proxy) => proxy.id === normalized.id) || normalized;
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
    const nextMap = removeProxyIdFromMap(map, proxyId);

    await writeStorage({
      [PROXY_CONFIGS_KEY]: next,
      [ACCOUNT_PROXY_MAP_KEY]: nextMap,
    });

    return next;
  }

  async function setAccountProxyAssignment(accountId, proxyId) {
    const safeAccountId = String(accountId || "").trim();
    const safeProxyId = String(proxyId || "").trim();
    const proxies = await getProxies();
    const map = await getAccountProxyMap();

    if (!safeAccountId) {
      const nextMap = removeProxyIdFromMap(map, safeProxyId);
      const next = proxies.map((proxy) => (
        proxy.id === safeProxyId ? { ...proxy, assignedTo: "" } : proxy
      ));

      await writeStorage({
        [PROXY_CONFIGS_KEY]: next,
        [ACCOUNT_PROXY_MAP_KEY]: nextMap,
      });

      return { ok: true, proxies: next, map: nextMap };
    }

    let nextMap = removeProxyIdFromMap(map, safeProxyId);

    if (!safeProxyId) {
      delete nextMap[safeAccountId];
    } else {
      const existingIds = normalizeProxyIdList(nextMap[safeAccountId]);
      if (!existingIds.includes(safeProxyId)) {
        if (existingIds.length >= MAX_PROXIES_PER_ACCOUNT) {
          return {
            ok: false,
            error: `Maximum ${MAX_PROXIES_PER_ACCOUNT} proxies can be assigned to one account`,
            proxies,
            map,
          };
        }

        existingIds.push(safeProxyId);
      }

      nextMap[safeAccountId] = existingIds;
    }

    const next = proxies.map((proxy) => {
      if (proxy.id === safeProxyId) {
        return { ...proxy, assignedTo: safeAccountId };
      }

      if (!safeProxyId && proxy.assignedTo === safeAccountId) {
        return { ...proxy, assignedTo: "" };
      }

      return proxy;
    });

    await writeStorage({
      [PROXY_CONFIGS_KEY]: next,
      [ACCOUNT_PROXY_MAP_KEY]: nextMap,
    });

    return { ok: true, proxies: next, map: nextMap };
  }

  async function removeProxyAssignment(proxyId) {
    const safeProxyId = String(proxyId || "").trim();
    const proxies = await getProxies();
    const map = await getAccountProxyMap();
    const nextMap = removeProxyIdFromMap(map, safeProxyId);
    const next = proxies.map((proxy) => (
      proxy.id === safeProxyId ? { ...proxy, assignedTo: "" } : proxy
    ));

    await writeStorage({
      [PROXY_CONFIGS_KEY]: next,
      [ACCOUNT_PROXY_MAP_KEY]: nextMap,
    });

    return { ok: true, proxies: next, map: nextMap };
  }

  async function getAssignedProxies(account) {
    const accountId = typeof account === "string" ? account : account?.id;
    if (!accountId) return [];

    const [proxies, map] = await Promise.all([
      getProxies(),
      getAccountProxyMap(),
    ]);

    const byId = new Map(proxies.map((proxy) => [proxy.id, proxy]));
    const mappedProxyIds = normalizeProxyIdList(map[accountId]);
    const assigned = [];

    mappedProxyIds.forEach((proxyId) => {
      const proxy = byId.get(proxyId);
      if (proxy) assigned.push(proxy);
    });

    proxies.forEach((proxy) => {
      if (
        proxy.assignedTo === accountId &&
        !assigned.some((item) => item.id === proxy.id) &&
        assigned.length < MAX_PROXIES_PER_ACCOUNT
      ) {
        assigned.push(proxy);
      }
    });

    return assigned.slice(0, MAX_PROXIES_PER_ACCOUNT);
  }

  async function getAssignedProxy(account) {
    const proxies = await getAssignedProxies(account);
    return proxies[0] || null;
  }

  async function getProxySettings() {
    const data = await readStorage([PROXY_SETTINGS_KEY]);
    return {
      ...DEFAULT_PROXY_SETTINGS,
      ...(data[PROXY_SETTINGS_KEY] || {}),
    };
  }

  async function saveProxySettings(settings = {}) {
    const applyMode = settings.applyMode === "global" || settings.applyMode === "perAccount"
      ? settings.applyMode
      : "off";
    const next = {
      ...DEFAULT_PROXY_SETTINGS,
      ...settings,
      enabled: applyMode !== "off" && settings.enabled !== false,
      applyMode,
      globalProxyId: String(settings.globalProxyId || "").trim(),
    };
    await writeStorage({ [PROXY_SETTINGS_KEY]: next });
    return next;
  }

  globalThis.ProxyStorage = {
    PROXY_CONFIGS_KEY,
    ACCOUNT_PROXY_MAP_KEY,
    PROXY_SETTINGS_KEY,
    MAX_PROXIES_PER_ACCOUNT,
    getProxies,
    saveProxies,
    upsertProxy,
    updateProxy,
    removeProxy,
    getAccountProxyMap,
    saveAccountProxyMap,
    setAccountProxyAssignment,
    removeProxyAssignment,
    getAssignedProxies,
    getAssignedProxy,
    getProxySettings,
    saveProxySettings,
    normalizeProxy,
  };
})();
