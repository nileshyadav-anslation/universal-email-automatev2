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
    const text = String(error).toLowerCase();
    if (text.includes("auth")) return "Auth Failed";
    if (text.includes("not applied") || text.includes("direct ip")) return "Not Applied";
    return "Offline";
  }

  // Measured before the proxy goes on, so verifyCurrentIp can tell a real proxy
  // IP from the machine's own. Never fatal: without it we simply fall back to
  // the old, weaker "did the IP check succeed" test.
  //
  // `clean` clears any active proxy first for a guaranteed-real reading. Only
  // callers that are about to apply a proxy anyway, and that are not running
  // inside a live automation session, may pass it.
  async function captureBaselineIp(options = {}) {
    const checker = globalThis.ProxyHealthChecker;

    if (options.clean && typeof checker?.measureDirectIpNow === "function") {
      return checker.measureDirectIpNow().catch(() => "");
    }

    if (typeof checker?.getDirectIp !== "function") return "";
    return checker.getDirectIp().catch(() => "");
  }

  async function verifyProxy(proxy, baselineIp) {
    const health = await globalThis.ProxyHealthChecker.verifyCurrentIp(proxy, { baselineIp });

    // Record the verified exit IP against the live proxy so the popup can show
    // what Chrome is actually routing through, not just a past test result.
    if (health.ok && health.ip) {
      await globalThis.ProxyController?.setActiveProxyState?.(proxy, health.ip);
    }

    return health;
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
    const baselineIp = await captureBaselineIp();
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
        const health = await verifyProxy(proxy, baselineIp);
        await updateProxyHealth(proxy, health);

        if (!health.ok) {
          lastError = health.error || "Proxy IP verification failed";
          console.log("[Proxy] Proxy failed", lastError);
          emit(options, `[Proxy] ${lastError}`, "error");
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

  async function applyGlobalProxy(proxyId, options = {}) {
    emit(options, "[Proxy] Loading global proxy", "info");

    const proxies = await globalThis.ProxyStorage.getProxies();
    const proxy = proxies.find((item) => item.id === proxyId);

    if (!proxy) {
      return { ok: false, error: "Global proxy is not selected" };
    }

    const validationError = validateProxy(proxy, { label: "all provider tabs" });
    if (validationError) {
      await markProxyFailed(proxy, validationError);
      return { ok: false, proxy, error: validationError };
    }

    try {
      const baselineIp = await captureBaselineIp();
      await globalThis.ProxyController.applyProxy(proxy);
      const health = await verifyProxy(proxy, baselineIp);
      await updateProxyHealth(proxy, health);

      if (!health.ok) {
        emit(options, `[Proxy] ${health.error || "Global proxy IP verification failed"}`, "error");
        await globalThis.ProxyController.clearProxy().catch(() => null);
        return {
          ok: false,
          proxy,
          status: health.status,
          error: health.error || "Global proxy IP verification failed",
        };
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
      await markProxyFailed(proxy, error.message || "Global proxy failed");
      await globalThis.ProxyController.clearProxy().catch(() => null);
      return {
        ok: false,
        proxy,
        status: "Offline",
        error: error.message || "Global proxy failed",
      };
    }
  }

  // chrome.proxy is browser-wide: only one proxy can be live at a time, so
  // testing proxy B unavoidably takes down proxy A while it runs. Whatever was
  // applied before the test has to be put back afterwards, or testing a dead
  // proxy silently drops the working one and the browser falls back to the
  // real IP.
  async function restoreProxy(previousProxy) {
    if (!previousProxy) return null;

    try {
      await globalThis.ProxyController.applyProxy(previousProxy);
      console.log("[Proxy] Restored previously active proxy", previousProxy.id);
      return previousProxy;
    } catch (error) {
      console.warn("[Proxy] Could not restore the previously active proxy", error);
      await globalThis.ProxyController.clearProxy().catch(() => null);
      return null;
    }
  }

  async function getPreviouslyActiveProxy(proxies, testedProxyId) {
    const active = await (globalThis.ProxyController?.getActiveProxyState?.() ?? null);
    if (!active?.proxyId || active.proxyId === testedProxyId) return null;
    return proxies.find((item) => item.id === active.proxyId) || null;
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

    // Snapshot before anything touches chrome.proxy.
    const previousProxy = await getPreviouslyActiveProxy(proxies, proxyId);

    try {
      // Clearing here is safe: TEST_PROXY is rejected while automation runs,
      // and previousProxy is restored below whatever the outcome.
      const baselineIp = await captureBaselineIp({ clean: true });
      await globalThis.ProxyController.applyProxy(proxy);
      const health = await verifyProxy(proxy, baselineIp);
      await updateProxyHealth(proxy, health);

      if (!health.ok) {
        console.log("[Proxy] Proxy failed", health.error);
        // Never leave a half-applied proxy behind, and never leave the user
        // unproxied because some *other* proxy failed its test.
        const restored = await restoreProxy(previousProxy);
        if (!restored) {
          await globalThis.ProxyController.clearProxy().catch(() => null);
        }

        return {
          ok: false,
          status: health.status,
          ip: health.ip || "",
          directIp: baselineIp,
          restoredProxyId: restored?.id || "",
          error: health.error,
        };
      }

      // A passing test leaves a proxy applied - but not at the cost of the one
      // that was already working. If something was active, put it back and say
      // so; only an idle browser keeps the freshly tested proxy.
      if (previousProxy) {
        const restored = await restoreProxy(previousProxy);
        return {
          ok: true,
          applied: Boolean(restored),
          keptPrevious: Boolean(restored),
          restoredProxyId: restored?.id || "",
          status: "Online",
          ip: health.ip,
          directIp: baselineIp,
          latency: health.latency,
        };
      }

      return {
        ok: true,
        applied: true,
        status: "Online",
        ip: health.ip,
        directIp: baselineIp,
        latency: health.latency,
      };
    } catch (error) {
      const status = getProxyFailureStatus(error.message);
      await globalThis.ProxyStorage.updateProxy(proxy.id, {
        status,
        lastCheck: new Date().toISOString(),
      });
      console.log("[Proxy] Proxy failed", error);

      const restored = await restoreProxy(previousProxy);
      if (!restored) {
        await globalThis.ProxyController.clearProxy().catch(() => null);
      }

      return {
        ok: false,
        status,
        restoredProxyId: restored?.id || "",
        error: error.message,
      };
    }
  }

  function clearProxy() {
    return globalThis.ProxyController.clearProxy();
  }

  globalThis.ProxyManager = {
    applyForAccount,
    applyGlobalProxy,
    testProxy,
    clearProxy,
  };
})();
