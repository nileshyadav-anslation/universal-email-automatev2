// licenseStorage.js - the activation record and this profile's device identity.
//
// Loaded by both the service worker (importScripts) and the popup (<script>),
// so it must not assume either context.
//
// One Chrome profile == one device. Each profile has its own extension storage,
// so a device id generated here is naturally unique per profile and stable for
// its lifetime - which is exactly the unit the seat limit counts.
(function () {
  "use strict";

  const LICENSE_KEY = "licenseState";
  const DEVICE_ID_KEY = "licenseDeviceId";

  // How long the extension keeps working after the last successful check when
  // the backend cannot be reached. Long enough to survive a server outage or a
  // bad proxy without stopping a fleet mid-run.
  const GRACE_PERIOD_DAYS = 7;

  // How often to re-check while everything is healthy. The popup opens often;
  // there is no reason to hit the backend every time.
  const RECHECK_INTERVAL_HOURS = 12;

  function readStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function writeStorage(values) {
    return chrome.storage.local.set(values);
  }

  function emptyState() {
    return {
      email: "",
      licenseKey: "",
      active: false,
      plan: "",
      expiresAt: "",
      customerName: "",
      seatsUsed: 0,
      seatsAllowed: 0,
      // When the backend last gave a definite answer, successful or not. The
      // grace period is measured from here.
      lastVerifiedAt: "",
      // Why the last check failed, if it did. Shown to the user verbatim.
      lastReason: "",
      lastError: "",
    };
  }

  function normalizeState(state = {}) {
    const base = emptyState();
    return {
      ...base,
      ...state,
      email: String(state.email || "").trim().toLowerCase(),
      licenseKey: String(state.licenseKey || "").trim(),
      active: Boolean(state.active),
      seatsUsed: Number(state.seatsUsed) || 0,
      seatsAllowed: Number(state.seatsAllowed) || 0,
    };
  }

  // Never leaves the service worker with the key attached. The popup needs to
  // know an activation EXISTS and who it belongs to, never the key itself.
  function redactState(state = {}) {
    return {
      ...state,
      licenseKey: undefined,
      hasLicenseKey: Boolean(state.licenseKey),
    };
  }

  async function getLicenseState() {
    const data = await readStorage([LICENSE_KEY]);
    return normalizeState(data[LICENSE_KEY] || {});
  }

  async function saveLicenseState(patch = {}) {
    const next = normalizeState({ ...(await getLicenseState()), ...patch });
    await writeStorage({ [LICENSE_KEY]: next });
    return next;
  }

  async function clearLicenseState() {
    await chrome.storage.local.remove(LICENSE_KEY);
    return emptyState();
  }

  // Generated once and never regenerated, because regenerating would consume a
  // fresh seat every time. crypto.randomUUID is available in both the service
  // worker and the popup.
  async function getDeviceId() {
    const data = await readStorage([DEVICE_ID_KEY]);
    const existing = String(data[DEVICE_ID_KEY] || "").trim();
    if (existing) return existing;

    const id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

    await writeStorage({ [DEVICE_ID_KEY]: id });
    return id;
  }

  globalThis.LicenseStorage = {
    LICENSE_KEY,
    DEVICE_ID_KEY,
    GRACE_PERIOD_DAYS,
    RECHECK_INTERVAL_HOURS,
    emptyState,
    normalizeState,
    redactState,
    getLicenseState,
    saveLicenseState,
    clearLicenseState,
    getDeviceId,
  };
})();
