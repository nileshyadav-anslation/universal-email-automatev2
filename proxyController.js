(function () {
  "use strict";

  const PROXY_PROTOCOLS = new Set(["http", "https", "socks4", "socks5"]);
  // Which proxy Chrome is routing through right now, as opposed to which
  // proxies merely passed a check at some point in the past. The popup needs
  // the difference to avoid showing a green badge for a proxy that is off.
  const ACTIVE_PROXY_KEY = "activeProxyState";

  function setActiveProxyState(proxy, ip = "") {
    return chrome.storage.local
      .set({
        [ACTIVE_PROXY_KEY]: {
          proxyId: proxy?.id || "",
          host: proxy?.host || "",
          port: proxy?.port || "",
          ip,
          appliedAt: Date.now(),
        },
      })
      .catch(() => null);
  }

  function clearActiveProxyState() {
    return chrome.storage.local.remove(ACTIVE_PROXY_KEY).catch(() => null);
  }

  function chromeCallback(resolve, reject) {
    return () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    };
  }

  function getProxyScheme(type = "http") {
    const normalized = String(type || "http").trim().toLowerCase();
    return PROXY_PROTOCOLS.has(normalized) ? normalized : "http";
  }

  function buildProxyConfig(proxy) {
    const port = parseInt(proxy?.port, 10);

    if (!proxy?.host || !Number.isFinite(port)) {
      throw new Error("Proxy host and port are required");
    }

    return {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: getProxyScheme(proxy.type),
          host: proxy.host,
          port,
        },
        bypassList: ["<local>"],
      },
    };
  }

  // chrome.proxy.settings.set() resolves even when it changed nothing: Chrome
  // gives the setting to the most recently installed extension, and enterprise
  // policy outranks every extension. When that happens the callback still fires
  // without chrome.runtime.lastError, so the only way to know our proxy is live
  // is to read the setting back and check who owns it.
  function readSettings() {
    return new Promise((resolve, reject) => {
      chrome.proxy.settings.get({ incognito: false }, (details) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(details || {});
      });
    });
  }

  function describeControl(levelOfControl) {
    if (levelOfControl === "controlled_by_other_extensions") {
      return "another extension controls Chrome's proxy setting. Disable or remove it (chrome://extensions), then apply the proxy again";
    }

    if (levelOfControl === "not_controllable") {
      return "Chrome's proxy setting is locked by enterprise policy and extensions cannot change it";
    }

    return `Chrome did not hand the proxy setting to this extension (levelOfControl: ${levelOfControl || "unknown"})`;
  }

  function appliedRulesMatch(details, expected) {
    const applied = details?.value?.rules?.singleProxy;
    const wanted = expected?.rules?.singleProxy;

    if (!applied || !wanted) return false;

    return (
      details.value.mode === expected.mode &&
      applied.scheme === wanted.scheme &&
      applied.host === wanted.host &&
      Number(applied.port) === Number(wanted.port)
    );
  }

  async function getControlState() {
    const details = await readSettings().catch(() => null);
    return details?.levelOfControl || "unknown";
  }

  async function applyProxy(proxy) {
    console.log("[Proxy] Applying proxy", {
      proxyId: proxy?.id,
      host: proxy?.host,
      port: proxy?.port,
    });

    const config = buildProxyConfig(proxy);

    globalThis.ProxyAuth?.setActiveProxy(proxy);

    await new Promise((resolve, reject) => {
      chrome.proxy.settings.set({
        value: config,
        scope: "regular",
      }, chromeCallback(resolve, reject));
    });

    const details = await readSettings();

    if (details.levelOfControl !== "controlled_by_this_extension") {
      throw new Error(`Proxy not applied: ${describeControl(details.levelOfControl)}`);
    }

    // Advisory only. levelOfControl above is the authoritative check, and the
    // IP comparison in ProxyHealthChecker is the real proof, so a harmless
    // normalisation difference here must not fail an otherwise working proxy.
    if (!appliedRulesMatch(details, config)) {
      console.warn("[Proxy] Applied rules differ from the requested config", {
        requested: config.rules?.singleProxy,
        applied: details?.value?.rules?.singleProxy,
      });
    }

    console.log("[Proxy] Proxy setting confirmed", {
      proxyId: proxy?.id,
      levelOfControl: details.levelOfControl,
    });

    await setActiveProxyState(proxy);

    return details;
  }

  async function clearProxy() {
    console.log("[Proxy] Proxy cleared");
    globalThis.ProxyAuth?.clearActiveProxy();
    await clearActiveProxyState();

    return new Promise((resolve, reject) => {
      chrome.proxy.settings.clear({
        scope: "regular",
      }, chromeCallback(resolve, reject));
    });
  }

  async function getActiveProxyState() {
    const data = await chrome.storage.local.get([ACTIVE_PROXY_KEY]).catch(() => ({}));
    const state = data?.[ACTIVE_PROXY_KEY];
    if (!state?.proxyId) return null;

    // Storage can outlive the real setting (another extension takes over, the
    // browser restarts). Trust Chrome, not our own bookkeeping.
    const control = await getControlState();
    if (control !== "controlled_by_this_extension") {
      await clearActiveProxyState();
      return null;
    }

    return state;
  }

  globalThis.ProxyController = {
    applyProxy,
    clearProxy,
    buildProxyConfig,
    getControlState,
    getActiveProxyState,
    setActiveProxyState,
  };
})();
