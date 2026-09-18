(function () {
  "use strict";

  const IP_CHECK_ENDPOINTS = [
    "https://api.ipify.org?format=json",
    "https://api64.ipify.org?format=json",
  ];
  const DIRECT_IP_TTL_MS = 10 * 60 * 1000;
  const DIRECT_IP_KEY = "proxyDirectIpBaseline";
  // Plain HTTP on purpose. Over HTTPS the proxy's rejection happens during the
  // CONNECT tunnel, so fetch() only ever reports a generic network failure and
  // every dead proxy looks identical ("Offline"). Over HTTP the proxy answers
  // with a real status code we can read and explain.
  const DIAGNOSTIC_ENDPOINT = "http://api.ipify.org?format=json";
  const PROXY_HTTP_ERRORS = {
    402: "the proxy provider rejected it: quota or bandwidth limit reached (HTTP 402). Top up the plan or use a different proxy.",
    403: "the proxy refused this connection (HTTP 403). This machine's IP may not be whitelisted with the provider.",
    407: "proxy authentication failed (HTTP 407). Check the username and password.",
    429: "the proxy provider is rate limiting this connection (HTTP 429).",
    502: "the proxy could not reach the target site (HTTP 502).",
    503: "the proxy is temporarily unavailable (HTTP 503).",
  };

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

  // Chrome can serve this request over a keep-alive socket that was opened
  // before the proxy was applied, which returns the direct IP and makes a
  // working proxy look like a leak. A unique query string per call forces a
  // fresh request.
  function bustCache(endpoint) {
    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}_=${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
  }

  async function fetchIp(endpoint, timeoutMs) {
    return withTimeout(async (signal) => {
      const response = await fetch(bustCache(endpoint), {
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

  // Reads the current outbound IP, whatever Chrome's proxy setting happens to
  // be. On its own this proves nothing about the proxy - the caller has to
  // compare it against the direct IP.
  async function measureIp(options = {}) {
    const start = Date.now();
    const timeoutMs = options.timeoutMs || 15000;
    let lastError = null;

    for (const endpoint of IP_CHECK_ENDPOINTS) {
      try {
        const ip = await fetchIp(endpoint, timeoutMs);

        if (!ip) {
          throw new Error("IP check endpoint returned an empty IP");
        }

        return { ok: true, ip, latency: Date.now() - start };
      } catch (error) {
        lastError = error;
      }
    }

    return {
      ok: false,
      ip: "",
      latency: Date.now() - start,
      error: lastError?.message || "IP check failed",
    };
  }

  // Runs only after the normal check has already failed, to turn an opaque
  // "Offline" into the provider's actual reason.
  async function diagnoseProxyFailure(timeoutMs = 12000) {
    try {
      return await withTimeout(async (signal) => {
        const response = await fetch(bustCache(DIAGNOSTIC_ENDPOINT), {
          cache: "no-store",
          signal,
        });

        if (response.ok) {
          // The proxy works over HTTP but not HTTPS - almost always a proxy
          // that cannot do CONNECT tunnelling.
          return {
            reason: "the proxy works for plain HTTP but refused the HTTPS tunnel (CONNECT). It cannot be used for mail sites.",
            httpStatus: response.status,
          };
        }

        const body = (await response.text().catch(() => "")).trim().slice(0, 140);
        const known = PROXY_HTTP_ERRORS[response.status];

        return {
          reason: known || `the proxy returned HTTP ${response.status}.`,
          detail: body,
          httpStatus: response.status,
        };
      }, timeoutMs);
    } catch (error) {
      return {
        reason: "the proxy did not respond. Check the host and port, or whether the provider has disabled it.",
        detail: error?.message || "",
      };
    }
  }

  function buildFailureMessage(diagnosis) {
    if (!diagnosis?.reason) return "Proxy IP verification failed";

    const detail = diagnosis.detail ? ` Provider said: "${diagnosis.detail}"` : "";
    return `Proxy failed - ${diagnosis.reason}${detail}`;
  }

  // The machine's real IP, measured with the proxy cleared. Persisted because
  // the MV3 service worker is torn down constantly, and an in-memory-only
  // baseline would come back empty on every wake - silently turning the leak
  // check back off, which is the bug this whole file exists to prevent.
  let directIpCache = null;

  function readStoredDirectIp() {
    return new Promise((resolve) => {
      chrome.storage.local.get([DIRECT_IP_KEY], (data) => {
        const stored = data?.[DIRECT_IP_KEY];
        resolve(stored && stored.ip ? stored : null);
      });
    });
  }

  function storeDirectIp(ip) {
    directIpCache = { ip, at: Date.now() };
    return chrome.storage.local
      .set({ [DIRECT_IP_KEY]: directIpCache })
      .catch(() => null);
  }

  function isFresh(entry, ttlMs) {
    return Boolean(entry && entry.ip && Date.now() - entry.at < ttlMs);
  }

  async function getDirectIp(options = {}) {
    const ttlMs = options.ttlMs || DIRECT_IP_TTL_MS;

    if (!options.force && isFresh(directIpCache, ttlMs)) {
      return directIpCache.ip;
    }

    if (!directIpCache) {
      directIpCache = await readStoredDirectIp();
      if (!options.force && isFresh(directIpCache, ttlMs)) {
        return directIpCache.ip;
      }
    }

    const control = await (globalThis.ProxyController?.getControlState?.() ?? "unknown");

    // Only safe to measure when no proxy of ours is in force, otherwise we
    // would record the proxy's IP as the baseline and every later comparison
    // would be inverted. A stale stored baseline beats a wrong fresh one.
    if (control === "controlled_by_this_extension") {
      return directIpCache?.ip || "";
    }

    const result = await measureIp(options);
    if (!result.ok || !result.ip) {
      return directIpCache?.ip || "";
    }

    await storeDirectIp(result.ip);
    console.log("[Proxy] Direct IP baseline", result.ip);
    return result.ip;
  }

  // Clears any active proxy first, so the measurement is guaranteed to be the
  // real connection. Only for paths that are about to apply a proxy anyway.
  async function measureDirectIpNow() {
    await globalThis.ProxyController?.clearProxy?.().catch(() => null);
    const result = await measureIp();

    if (result.ok && result.ip) {
      await storeDirectIp(result.ip);
      return result.ip;
    }

    return directIpCache?.ip || "";
  }

  function setDirectIp(ip) {
    const value = String(ip || "").trim();
    if (!value) return;
    storeDirectIp(value);
  }

  async function verifyCurrentIp(proxy, options = {}) {
    const start = Date.now();
    const timeoutMs = options.timeoutMs || 15000;
    const baselineIp = String(options.baselineIp || "").trim();
    let last = null;

    // One retry: the first request after a proxy change can still ride a socket
    // opened before it, which reads back as the direct IP.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      last = await measureIp({ timeoutMs });

      if (last.ok && (!baselineIp || last.ip !== baselineIp)) {
        break;
      }

      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }

    const latency = Date.now() - start;

    if (!last.ok) {
      const authFailed = Boolean(globalThis.ProxyAuth?.hasRecentAuthFailure(proxy?.id));

      if (authFailed) {
        return {
          ok: false,
          status: "Auth Failed",
          error: "Proxy authentication failed. Check the username and password.",
          latency,
          lastCheck: new Date().toISOString(),
        };
      }

      // Ask the proxy why, instead of reporting a bare "Offline".
      const diagnosis = await diagnoseProxyFailure(timeoutMs);
      const status = diagnosis.httpStatus === 407 ? "Auth Failed" : "Offline";

      console.warn("[Proxy] Proxy check failed", {
        proxyId: proxy?.id,
        httpStatus: diagnosis.httpStatus,
        reason: diagnosis.reason,
      });

      return {
        ok: false,
        status,
        error: buildFailureMessage(diagnosis),
        httpStatus: diagnosis.httpStatus,
        latency,
        lastCheck: new Date().toISOString(),
      };
    }

    // The proxy is set but traffic is still going out on the real IP. Chrome
    // reported success, the IP check succeeded, and yet nothing is proxied -
    // this is the case that used to be reported as "Online".
    if (baselineIp && last.ip === baselineIp) {
      console.warn("[Proxy] Traffic is not going through the proxy", {
        proxyId: proxy?.id,
        ip: last.ip,
      });

      return {
        ok: false,
        status: "Not Applied",
        ip: last.ip,
        error: `Traffic is still using the direct IP ${last.ip}. The proxy is set but Chrome is not routing through it.`,
        latency,
        lastCheck: new Date().toISOString(),
      };
    }

    console.log("[Proxy] IP verified", {
      proxyId: proxy?.id,
      ip: last.ip,
      baselineIp,
      latency,
    });

    return {
      ok: true,
      status: "Online",
      ip: last.ip,
      latency,
      lastCheck: new Date().toISOString(),
    };
  }

  globalThis.ProxyHealthChecker = {
    verifyCurrentIp,
    measureIp,
    getDirectIp,
    measureDirectIpNow,
    setDirectIp,
  };
})();
