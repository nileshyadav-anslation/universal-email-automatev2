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

  function getProxyFailureStatus(error = "") {
    return String(error).toLowerCase().includes("auth") ? "Auth Failed" : "Offline";
  }

  function validateProxy(proxy, account) {
    if (proxy.enabled === false) {
      return `Assigned proxy is disabled for ${getAccountLabel(account)}`;
    }

    if (!proxy.host || !proxy.port) {
      return `Assigned proxy is missing host or port for ${getAccountLabel(account)}`;
    }

    return "";
  }

  async function markProxyFailed(proxy, error) {
    if (!proxy?.id) return;

    await globalThis.ProxyStorage.updateProxy(proxy.id, {
      status: getProxyFailureStatus(error),
      lastCheck: new Date().toISOString(),
    });
  }

  async function getUsableAssignedProxies(account) {
    const assignedProxies = typeof globalThis.ProxyStorage.getAssignedProxies === "function"
      ? await globalThis.ProxyStorage.getAssignedProxies(account)
      : [await globalThis.ProxyStorage.getAssignedProxy(account)].filter(Boolean);

    if (!assignedProxies.length) {
      return {
        ok: false,
        error: `No proxy assigned to ${getAccountLabel(account)}`,
      };
    }

    return { ok: true, proxies: assignedProxies.slice(0, globalThis.ProxyStorage.MAX_PROXIES_PER_ACCOUNT || 3) };
  }

  async function failOrFallback(error, options, proxy) {
    if (proxy?.id) {
      await markProxyFailed(proxy, error);
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

    const assigned = await getUsableAssignedProxies(account);
    if (!assigned.ok) {
      return failOrFallback(assigned.error, options);
    }

    const proxies = assigned.proxies;
    let lastError = "";

    for (let index = 0; index < proxies.length; index += 1) {
      const proxy = proxies[index];
      const validationError = validateProxy(proxy, account);

      if (validationError) {
        lastError = validationError;
        emit(options, `[Proxy] Proxy ${index + 1}/${proxies.length} skipped: ${validationError}`, "warn");
        if (index < proxies.length - 1) {
          emit(options, "[Proxy] Trying next assigned proxy", "warn");
        }
        continue;
      }

      try {
        emit(options, `[Proxy] Applying proxy ${index + 1}/${proxies.length}`, "info");
        await globalThis.ProxyController.applyProxy(proxy);
        const health = await globalThis.ProxyHealthChecker.verifyCurrentIp(proxy);
        await updateProxyHealth(proxy, health);

        if (!health.ok) {
          lastError = health.error || "Proxy IP verification failed";
          console.log("[Proxy] Proxy failed", lastError);
          await globalThis.ProxyController.clearProxy().catch(() => null);

          if (index < proxies.length - 1) {
            emit(options, "[Proxy] Trying next assigned proxy", "warn");
          }

          continue;
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
        lastError = error.message || "Proxy failed";
        await markProxyFailed(proxy, lastError);
        await globalThis.ProxyController.clearProxy().catch(() => null);
        console.log("[Proxy] Proxy failed", error);

        if (index < proxies.length - 1) {
          emit(options, "[Proxy] Trying next assigned proxy", "warn");
        }
      }
    }

    const finalError = `All assigned proxies failed for ${getAccountLabel(account)}${lastError ? `. Last error: ${lastError}` : ""}`;
    return failOrFallback(finalError, options);
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
