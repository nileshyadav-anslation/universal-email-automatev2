// licenseGate.js - the single question "may this profile run?", and the
// activate / re-check / deactivate operations behind it.
//
// Everything else in the extension asks evaluateAccess() and does nothing
// clever of its own, so there is exactly one place where access is decided.
(function () {
  "use strict";

  const { LicenseStorage, LicenseClient } = globalThis;
  const { GRACE_PERIOD_DAYS, RECHECK_INTERVAL_HOURS } = LicenseStorage;

  const DAY_MS = 24 * 60 * 60 * 1000;

  // Set by background.js so licence events land in the activity log.
  let logSink = () => {};
  function setLogger(fn) { if (typeof fn === "function") logSink = fn; }
  function log(message, level = "info") { logSink(`[License] ${message}`, level); }

  function extensionVersion() {
    try {
      return chrome.runtime.getManifest().version || "";
    } catch (error) {
      return "";
    }
  }

  function daysSince(iso) {
    if (!iso) return Infinity;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return Infinity;
    return (Date.now() - then) / DAY_MS;
  }

  /**
   * The only access decision in the extension.
   *
   *  - never activated            -> blocked, show the activation screen
   *  - backend said no            -> blocked, show why
   *  - backend said yes, recently -> allowed
   *  - backend unreachable        -> allowed until the grace period runs out,
   *                                  because a server outage must not stop a
   *                                  paying customer's fleet mid-run
   */
  function evaluateAccess(state = {}) {
    if (!state.email || !state.hasActivated) {
      return { allowed: false, status: "not-activated", message: "Activate the extension to continue." };
    }

    if (!state.active) {
      return {
        allowed: false,
        status: "refused",
        reason: state.lastReason || "",
        message: state.lastError || "This subscription is not active.",
      };
    }

    const age = daysSince(state.lastVerifiedAt);
    if (age <= GRACE_PERIOD_DAYS) {
      const stale = age * 24 >= RECHECK_INTERVAL_HOURS;
      const graceDaysLeft = Math.max(0, Math.ceil(GRACE_PERIOD_DAYS - age));
      return {
        allowed: true,
        status: stale ? "stale" : "active",
        graceDaysLeft,
        // Only worth surfacing once the last check is genuinely old.
        message: age >= 1
          ? `Offline - subscription re-check pending. ${graceDaysLeft} day(s) of offline use left.`
          : "",
      };
    }

    return {
      allowed: false,
      status: "grace-expired",
      message: `The subscription could not be re-checked for ${GRACE_PERIOD_DAYS} days. Reconnect to continue.`,
    };
  }

  function needsRecheck(state = {}) {
    if (!state.hasActivated) return false;
    return daysSince(state.lastVerifiedAt) * 24 >= RECHECK_INTERVAL_HOURS;
  }

  // Shared by activate() and recheck(): one round trip, then persist whatever
  // it told us. A refusal is recorded; an unreachable server is NOT, so the
  // previous good answer keeps holding the grace period open.
  async function callBackend({ email, licenseKey }) {
    const deviceId = await LicenseStorage.getDeviceId();
    const result = await LicenseClient.verify({
      email,
      licenseKey,
      deviceId,
      extensionVersion: extensionVersion(),
    });

    if (!result.reachable) {
      await LicenseStorage.saveLicenseState({ lastError: result.error || "" });
      return { ok: false, unreachable: true, error: result.error || "" };
    }

    if (!result.active) {
      await LicenseStorage.saveLicenseState({
        email,
        licenseKey,
        hasActivated: true,
        active: false,
        lastVerifiedAt: new Date().toISOString(),
        lastReason: result.reason || "",
        lastError: result.message || "",
        seatsUsed: result.seatsUsed || 0,
        seatsAllowed: result.seatsAllowed || 0,
      });
      return { ok: false, reason: result.reason, error: result.message };
    }

    const saved = await LicenseStorage.saveLicenseState({
      email,
      licenseKey,
      hasActivated: true,
      active: true,
      plan: result.plan,
      expiresAt: result.expiresAt,
      customerName: result.customerName,
      seatsUsed: result.seatsUsed,
      seatsAllowed: result.seatsAllowed,
      lastVerifiedAt: new Date().toISOString(),
      lastReason: "",
      lastError: "",
    });

    return { ok: true, state: saved };
  }

  async function activate({ email, licenseKey }) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanKey = String(licenseKey || "").trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return { ok: false, error: "Enter the email address the subscription was bought with." };
    }
    if (!cleanKey) {
      return { ok: false, error: "Enter your licence key." };
    }

    log(`Activating for ${cleanEmail}...`);
    const result = await callBackend({ email: cleanEmail, licenseKey: cleanKey });

    if (result.ok) {
      const seats = result.state.seatsAllowed
        ? ` Profile ${result.state.seatsUsed} of ${result.state.seatsAllowed}.`
        : "";
      log(`Activated for ${cleanEmail}.${seats}`, "success");
    } else if (result.unreachable) {
      log(`Could not reach the licensing server. ${result.error}`, "error");
    } else {
      log(`Activation refused: ${result.error}`, "error");
    }

    return result;
  }

  // Throttled: only actually calls the backend when the cached answer is old,
  // unless forced.
  async function recheck({ force = false } = {}) {
    const state = await LicenseStorage.getLicenseState();
    if (!state.hasActivated) return { ok: false, skipped: true };
    if (!force && !needsRecheck(state)) return { ok: true, skipped: true };

    return callBackend({ email: state.email, licenseKey: state.licenseKey });
  }

  // Frees this profile's seat, then forgets the activation locally. Best effort
  // on the server call: if it cannot be reached the local state is still
  // cleared, and the seat is reclaimed by the backend's inactivity sweep.
  async function deactivate() {
    const state = await LicenseStorage.getLicenseState();

    if (state.hasActivated && state.email) {
      const deviceId = await LicenseStorage.getDeviceId();
      await LicenseClient.release({
        email: state.email,
        licenseKey: state.licenseKey,
        deviceId,
      }).catch(() => null);
    }

    await LicenseStorage.clearLicenseState();
    log("This profile has been deactivated and its seat released.", "success");
    return { ok: true };
  }

  // What the popup renders from - never carries the licence key.
  async function getStatus() {
    // So the popup reports "configured" correctly on a fresh service worker.
    await LicenseClient.loadBackendUrlOverride().catch(() => "");
    const state = await LicenseStorage.getLicenseState();
    const access = evaluateAccess(state);
    return {
      access,
      state: LicenseStorage.redactState(state),
      deviceId: await LicenseStorage.getDeviceId(),
      configured: LicenseClient.isConfigured(),
    };
  }

  // The gate the automation itself asks. Kept separate from getStatus so a
  // run never accidentally depends on popup-shaped data.
  async function canRun() {
    const state = await LicenseStorage.getLicenseState();
    return evaluateAccess(state);
  }

  globalThis.LicenseGate = {
    setLogger,
    evaluateAccess,
    needsRecheck,
    activate,
    recheck,
    deactivate,
    getStatus,
    canRun,
  };
})();
