(function () {
  "use strict";

  const PROXY_PROTOCOLS = new Set(["http", "https", "socks4", "socks5"]);

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

  function applyProxy(proxy) {
    console.log("[Proxy] Applying proxy", {
      proxyId: proxy?.id,
      host: proxy?.host,
      port: proxy?.port,
    });

    globalThis.ProxyAuth?.setActiveProxy(proxy);

    return new Promise((resolve, reject) => {
      chrome.proxy.settings.set({
        value: buildProxyConfig(proxy),
        scope: "regular",
      }, chromeCallback(resolve, reject));
    });
  }

  function clearProxy() {
    console.log("[Proxy] Proxy cleared");
    globalThis.ProxyAuth?.clearActiveProxy();

    return new Promise((resolve, reject) => {
      chrome.proxy.settings.clear({
        scope: "regular",
      }, chromeCallback(resolve, reject));
    });
  }

  globalThis.ProxyController = {
    applyProxy,
    clearProxy,
    buildProxyConfig,
  };
})();
