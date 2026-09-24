// licenseClient.js - the only place that talks to the licensing backend.
//
// ── BACKEND CONTRACT ────────────────────────────────────────────────────────
// POST  {BASE_URL}/api/license/verify
//   request  { email, licenseKey, deviceId, extensionVersion }
//   response { active: true,  plan, expiresAt, customerName, seatsUsed, seatsAllowed }
//            { active: false, reason: "expired"|"not_found"|"cancelled"|"seat_limit" }
//
// POST  {BASE_URL}/api/license/release
//   request  { email, licenseKey, deviceId }
//   response { released: true }
//
// A definite "no" is HTTP 200 with active:false. Anything else - 5xx, a
// timeout, DNS failure - is "could not reach", which is a different thing
// entirely: it starts the grace period rather than locking the user out.
// Conflating the two would turn one server outage into a fleet-wide stoppage.
(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────────
  // TODO: replace with the real licensing backend once it exists. Until then
  // every request fails to connect, which puts the extension in grace mode
  // rather than breaking it. <all_urls> is already granted, so changing this
  // needs no manifest change.
  const BASE_URL = "https://REPLACE-WITH-LICENSE-BACKEND.example.com";
  // ─────────────────────────────────────────────────────────────────────────

  const REQUEST_TIMEOUT_MS = 15000;

  // Only while BASE_URL is still the placeholder can a stored override point
  // this somewhere else. Once a real URL is baked into the build the override
  // is ignored entirely - otherwise anyone could redirect the licence check at
  // a server of their own and answer active:true.
  const OVERRIDE_KEY = "licenseBackendUrlOverride";

  let overrideUrl = "";
  let overrideLoaded = false;

  function placeholderStillInPlace() {
    return BASE_URL.includes("REPLACE-WITH-LICENSE-BACKEND");
  }

  async function setBackendUrlOverride(url) {
    if (!placeholderStillInPlace()) return false;

    overrideUrl = String(url || "").trim().replace(/\/$/, "");
    overrideLoaded = true;

    // Persisted, because the service worker is torn down constantly and an
    // in-memory override would be gone before the next check - which made it
    // useless for actually testing against a local mock server.
    if (overrideUrl) {
      await chrome.storage.local.set({ [OVERRIDE_KEY]: overrideUrl });
    } else {
      await chrome.storage.local.remove(OVERRIDE_KEY);
    }
    return true;
  }

  // Read once per service-worker lifetime, before the first backend call.
  async function loadBackendUrlOverride() {
    if (overrideLoaded || !placeholderStillInPlace()) {
      overrideLoaded = true;
      return overrideUrl;
    }

    const data = await new Promise((resolve) =>
      chrome.storage.local.get([OVERRIDE_KEY], resolve)
    ).catch(() => ({}));

    overrideUrl = String((data && data[OVERRIDE_KEY]) || "").trim();
    overrideLoaded = true;
    return overrideUrl;
  }

  function baseUrl() {
    return overrideUrl || BASE_URL;
  }

  const REASON_MESSAGES = {
    not_found: "No subscription found for this email and licence key. Check both, or contact support.",
    expired: "This subscription has expired. Renew it to keep using the extension.",
    cancelled: "This subscription has been cancelled.",
    seat_limit: "All profile slots for this subscription are in use. Free one from another profile, or ask support to raise the limit.",
    invalid_key: "That licence key is not valid for this email.",
  };

  function messageForReason(reason) {
    return REASON_MESSAGES[reason] || "This subscription is not active.";
  }

  function isConfigured() {
    return Boolean(overrideUrl) || !BASE_URL.includes("REPLACE-WITH-LICENSE-BACKEND");
  }

  async function post(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(`${baseUrl()}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);

      // Unreachable, not refused - but say WHICH unreachable. Collapsing
      // connection-refused, DNS failure, a scheme typo, a proxy refusal and a
      // timeout into one identical red line cost a whole afternoon of
      // guessing, because "the server is off" and "Chrome is blocking this"
      // looked exactly the same from the popup.
      const name = (error && error.name) || "Error";
      const detail = `${name}: ${(error && error.message) || "unknown"}`;
      console.warn("[License] fetch failed", { url: `${baseUrl()}${path}`, name, message: error && error.message });

      if (name === "AbortError") {
        return {
          reachable: false,
          error: `The licensing server did not answer within ${REQUEST_TIMEOUT_MS / 1000}s.`,
          detail,
        };
      }

      return { reachable: false, error: "Could not reach the licensing server.", detail };
    }
    clearTimeout(timer);

    const text = await response.text().catch(() => "");
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (error) {
      parsed = null;
    }

    // A server that is up but broken is still "cannot get a definite answer",
    // so it must not lock anyone out.
    if (response.status >= 500) {
      return { reachable: false, error: "The licensing server is having problems.", detail: `HTTP ${response.status}` };
    }

    if (response.status === 429) {
      return { reachable: false, error: "The licensing server is rate limiting this request.", detail: "HTTP 429" };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        reachable: true,
        active: false,
        reason: "invalid_key",
        message: messageForReason("invalid_key"),
      };
    }

    if (!response.ok || !parsed) {
      return {
        reachable: false,
        error: `Unexpected response from the licensing server (HTTP ${response.status}).`,
        detail: `HTTP ${response.status} at ${baseUrl()}${path}`,
      };
    }

    if (parsed.active === true) {
      return {
        reachable: true,
        active: true,
        plan: String(parsed.plan || ""),
        expiresAt: String(parsed.expiresAt || ""),
        customerName: String(parsed.customerName || ""),
        seatsUsed: Number(parsed.seatsUsed) || 0,
        seatsAllowed: Number(parsed.seatsAllowed) || 0,
      };
    }

    const reason = String(parsed.reason || "not_found");
    return {
      reachable: true,
      active: false,
      reason,
      message: messageForReason(reason),
      seatsUsed: Number(parsed.seatsUsed) || 0,
      seatsAllowed: Number(parsed.seatsAllowed) || 0,
    };
  }

  async function verify({ email, licenseKey, deviceId, extensionVersion }) {
    await loadBackendUrlOverride();
    if (!isConfigured()) {
      return { reachable: false, error: "The licensing server is not configured in this build yet." };
    }

    return post("/api/license/verify", { email, licenseKey, deviceId, extensionVersion });
  }

  // Frees this profile's seat so another profile can take it.
  async function release({ email, licenseKey, deviceId }) {
    await loadBackendUrlOverride();
    if (!isConfigured()) {
      return { reachable: false, error: "The licensing server is not configured in this build yet." };
    }

    return post("/api/license/release", { email, licenseKey, deviceId });
  }

  globalThis.LicenseClient = {
    BASE_URL,
    setBackendUrlOverride,
    loadBackendUrlOverride,
    isConfigured,
    messageForReason,
    verify,
    release,
  };
})();
