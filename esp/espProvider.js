// espProvider.js - the contract every ESP adapter implements, plus the shared
// HTTP helper they all use.
//
// A provider declares which capabilities it actually has. Anything it does not
// declare returns UNSUPPORTED_OPERATION rather than a faked empty result, so
// the UI can say "this provider's API cannot do that" instead of showing a
// misleading zero.
(function () {
  "use strict";

  const { createEspError, espErrorFromStatus } = globalThis.EspErrors;

  const CAPABILITIES = {
    accountInfo: "accountInfo",
    sendingDomains: "sendingDomains",
    senders: "senders",
    campaigns: "campaigns",
  };

  // Every adapter goes through this, so timeout handling, JSON parsing and
  // error translation are identical across providers - and so no adapter can
  // accidentally leak a key into a thrown message.
  async function espFetch(url, { provider, headers = {}, method = "GET", timeoutMs = 20000, body = null } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method,
        headers: { Accept: "application/json", ...headers },
        body,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      const aborted = error && error.name === "AbortError";
      throw createEspError(
        "NETWORK_ERROR",
        provider,
        aborted ? "The provider did not respond in time." : null,
        {}
      );
    }
    clearTimeout(timer);

    const text = await response.text().catch(() => "");
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (error) {
      parsed = null;
    }

    if (!response.ok) {
      throw espErrorFromStatus(response.status, provider, parsed);
    }

    return parsed;
  }

  // Base class. Adapters override only what their API supports and list those
  // methods in `capabilities`.
  class EspProvider {
    constructor({ id, label, capabilities = [], credentialFields = [], docsHint = "" }) {
      this.id = id;
      this.label = label;
      this.capabilities = new Set(capabilities);
      // Drives the config form. Each: {key, label, type, required, placeholder}
      this.credentialFields = credentialFields;
      this.docsHint = docsHint;
    }

    supports(capability) {
      return this.capabilities.has(capability);
    }

    unsupported(capability) {
      return createEspError(
        "UNSUPPORTED_OPERATION",
        this.id,
        `${this.label} does not expose ${capability} through its API.`
      );
    }

    // Cheap validation before any network call, so an obviously incomplete
    // form fails instantly with a clear message.
    validateCredentials(credentials = {}) {
      const missing = this.credentialFields
        .filter((field) => field.required)
        .filter((field) => !String(credentials[field.key] || "").trim())
        .map((field) => field.label);

      if (missing.length) {
        return createEspError(
          "INVALID_CREDENTIALS",
          this.id,
          `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`
        );
      }

      return null;
    }

    // A rejected key is almost always truncated, padded with whitespace, or the
    // wrong kind of key entirely. This describes the SHAPE of what was stored
    // so that is visible in the log without the value ever being exposed:
    // length, first few characters, and whether it needed trimming.
    describeCredentialShape(credentials = {}) {
      return this.credentialFields.map((field) => {
        const raw = credentials[field.key];
        if (raw === undefined || raw === null || raw === "") {
          return `${field.label}: EMPTY`;
        }

        const text = String(raw);
        const trimmed = text.trim();
        const notes = [`${trimmed.length} chars`];

        if (trimmed.length !== text.length) notes.push("had surrounding whitespace");
        if (/\s/.test(trimmed)) notes.push("CONTAINS A SPACE OR LINE BREAK - likely copied incompletely");
        // Enough to tell one key type from another, far too little to use.
        notes.push(`starts "${trimmed.slice(0, 8)}"`);

        return `${field.label}: ${notes.join(", ")}`;
      }).join(" | ");
    }

    async testConnection() { throw this.unsupported("connection testing"); }
    async getAccountInfo() { throw this.unsupported("account information"); }
    async getSendingDomains() { throw this.unsupported("sending domains"); }
    async getSenders() { throw this.unsupported("senders"); }
    async getCampaigns() { throw this.unsupported("campaigns"); }
  }

  // A provider we have not written an adapter for yet. Registered so it can be
  // listed in the UI as "Coming soon" without pretending to work.
  class ComingSoonProvider extends EspProvider {
    constructor({ id, label, note = "" }) {
      super({ id, label, capabilities: [], credentialFields: [] });
      this.comingSoon = true;
      this.note = note;
    }

    async testConnection() {
      throw createEspError(
        "PROVIDER_UNAVAILABLE",
        this.id,
        `${this.label} support is not implemented yet.${this.note ? ` ${this.note}` : ""}`
      );
    }
  }

  globalThis.EspProviderBase = {
    CAPABILITIES,
    EspProvider,
    ComingSoonProvider,
    espFetch,
  };
})();
