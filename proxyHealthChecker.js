(function () {
  "use strict";

  const IP_CHECK_ENDPOINTS = [
    "https://api.ipify.org?format=json",
    "https://api64.ipify.org?format=json",
  ];

  function withTimeout(promise, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    return Promise.resolve()
      .then(() => promise(controller.signal))
      .finally(() => clearTimeout(timer));
  }

  function normalizeIpResponse(body) {
    if (!body) return "";
    if (typeof body === "string") return body.trim();
    return String(body.ip || body.query || "").trim();
  }

  async function fetchIp(endpoint, timeoutMs) {
    return withTimeout(async (signal) => {
      const response = await fetch(endpoint, {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        throw new Error(`IP check failed with HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return normalizeIpResponse(await response.json());
      }

      return normalizeIpResponse(await response.text());
    }, timeoutMs);
  }

  async function verifyCurrentIp(proxy, options = {}) {
    const start = Date.now();
    const timeoutMs = options.timeoutMs || 15000;
    let lastError = null;

    for (const endpoint of IP_CHECK_ENDPOINTS) {
      try {
        const ip = await fetchIp(endpoint, timeoutMs);
        const latency = Date.now() - start;

        if (!ip) {
          throw new Error("IP check endpoint returned an empty IP");
        }

        console.log("[Proxy] IP verified", {
          proxyId: proxy?.id,
          ip,
          latency,
        });

        return {
          ok: true,
          status: "Online",
          ip,
          latency,
          lastCheck: new Date().toISOString(),
        };
      } catch (error) {
        lastError = error;
      }
    }

    const authFailed = Boolean(globalThis.ProxyAuth?.hasRecentAuthFailure(proxy?.id));
    return {
      ok: false,
      status: authFailed ? "Auth Failed" : "Offline",
      error: authFailed ? "Proxy authentication failed" : (lastError?.message || "Proxy IP verification failed"),
      latency: Date.now() - start,
      lastCheck: new Date().toISOString(),
    };
  }

  globalThis.ProxyHealthChecker = {
    verifyCurrentIp,
  };
})();
