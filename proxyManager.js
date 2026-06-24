(function () {
  "use strict";

  function getAccountLabel(account) {
    return account?.label || account?.id || "current account";
  }

  function emit(options, message, level = "info") {
    console.log(message);
    if (typeof options?.log === "function") {
      options.log(message, level);
    }
  }

  async function updateProxyHealth(proxy, health) {
    return globalThis.ProxyStorage.updateProxy(proxy.id, {
      status: health.status,
      lastCheck: health.lastCheck,
      latency: health.latency ? `${health.latency}ms` : "",
      lastKnownIp: health.ip || proxy.lastKnownIp || "",
    });
  }

  async function getUsableAssignedProxy(account) {
    const proxy = await globalThis.ProxyStorage.getAssignedProxy(account);

    if (!proxy) {
      return {
        ok: false,
        error: `No proxy assigned to ${getAccountLabel(account)}`,
      };
    }

    if (proxy.enabled === false) {
      return {
        ok: false,
        proxy,
        error: `Assigned proxy is disabled for ${getAccountLabel(account)}`,
      };
    }

    if (!proxy.host || !proxy.port) {
      return {
        ok: false,
        proxy,
        error: `Assigned proxy is missing host or port for ${getAccountLabel(account)}`,
      };
    }

    return { ok: true, proxy };
  }

  async function failOrFallback(error, options, proxy) {
    if (proxy?.id) {
      await globalThis.ProxyStorage.updateProxy(proxy.id, {
        status: error.includes("auth") || error.includes("Auth") ? "Auth Failed" : "Offline",
        lastCheck: new Date().toISOString(),
      });
    }

    emit(options, "[Proxy] Proxy failed", "error");

    if (options?.allowFallback) {
      await globalThis.ProxyController.clearProxy().catch(() => null);
      emit(options, `[Proxy] ${error}. Fallback without proxy is enabled.`, "warn");
      return { ok: true, fallback: true, error };
    }

    await globalThis.ProxyController.clearProxy().catch(() => null);
    return {
      ok: false,
      proxyFailed: true,
      stopAutomation: true,
      error,
    };
  }

  async function applyForAccount(account, options = {}) {
    emit(options, "[Proxy] Loading assigned proxy", "info");

    const assigned = await getUsableAssignedProxy(account);
    if (!assigned.ok) {
      return failOrFallback(assigned.error, options, assigned.proxy);
    }

    const proxy = assigned.proxy;

    try {
      await globalThis.ProxyController.applyProxy(proxy);
      const health = await globalThis.ProxyHealthChecker.verifyCurrentIp(proxy);
      await updateProxyHealth(proxy, health);

      if (!health.ok) {
        return failOrFallback(health.error, options, proxy);
      }

      emit(options, `[Proxy] IP verified: ${health.ip}`, "success");
      return {
        ok: true,
        applied: true,
        proxy: {
          ...proxy,
          status: "Online",
          lastKnownIp: health.ip,
          latency: `${health.latency}ms`,
          lastCheck: health.lastCheck,
        },
      };
    } catch (error) {
      return failOrFallback(error.message || "Proxy failed", options, proxy);
    }
  }

  async function testProxy(proxyId) {
    const proxies = await globalThis.ProxyStorage.getProxies();
    const proxy = proxies.find((item) => item.id === proxyId);

    if (!proxy) {
      return { ok: false, error: "Proxy not found" };
    }

    if (proxy.enabled === false) {
      return { ok: false, error: "Proxy is disabled" };
    }

    try {
      await globalThis.ProxyController.applyProxy(proxy);
      const health = await globalThis.ProxyHealthChecker.verifyCurrentIp(proxy);
      await updateProxyHealth(proxy, health);
      await globalThis.ProxyController.clearProxy();

      if (!health.ok) {
        console.log("[Proxy] Proxy failed", health.error);
        return {
          ok: false,
          status: health.status,
          error: health.error,
        };
      }

      return {
        ok: true,
        status: "Online",
        ip: health.ip,
        latency: health.latency,
      };
    } catch (error) {
      await globalThis.ProxyController.clearProxy().catch(() => null);
      await globalThis.ProxyStorage.updateProxy(proxy.id, {
        status: "Offline",
        lastCheck: new Date().toISOString(),
      });
      console.log("[Proxy] Proxy failed", error);
      return {
        ok: false,
        status: "Offline",
        error: error.message,
      };
    }
  }

  function clearProxy() {
    return globalThis.ProxyController.clearProxy();
  }

  globalThis.ProxyManager = {
    applyForAccount,
    testProxy,
    clearProxy,
  };
})();
