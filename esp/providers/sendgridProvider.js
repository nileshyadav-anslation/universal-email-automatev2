// sendgridProvider.js - Twilio SendGrid adapter.
//
// API: https://api.sendgrid.com/v3, Bearer token.
// Callable from the service worker with https://api.sendgrid.com/* in
// host_permissions.
//
// Note on scopes: SendGrid keys are scoped. A key limited to Mail Send can
// authenticate but cannot list single sends, which surfaces as
// PERMISSION_DENIED rather than a silent empty list.
(function () {
  "use strict";

  const { CAPABILITIES, EspProvider, espFetch } = globalThis.EspProviderBase;
  const { createEspError, isEspError } = globalThis.EspErrors;

  const BASE_URL = "https://api.sendgrid.com/v3";

  class SendGridProvider extends EspProvider {
    constructor() {
      super({
        id: "sendgrid",
        label: "SendGrid",
        capabilities: [
          CAPABILITIES.accountInfo,
          CAPABILITIES.sendingDomains,
          CAPABILITIES.senders,
          CAPABILITIES.campaigns,
        ],
        credentialFields: [
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "SG....",
          },
        ],
        docsHint: "SendGrid - Settings - API Keys (needs Marketing read access)",
      });
    }

    headers(credentials = {}) {
      return { Authorization: `Bearer ${String(credentials.apiKey || "").trim()}` };
    }

    request(path, credentials) {
      return espFetch(`${BASE_URL}${path}`, {
        provider: this.id,
        headers: this.headers(credentials),
      });
    }

    async testConnection(credentials = {}) {
      const invalid = this.validateCredentials(credentials);
      if (invalid) throw invalid;

      const account = await this.getAccountInfo(credentials);
      return { ok: true, account };
    }

    async getAccountInfo(credentials = {}) {
      // /user/profile needs a broader scope than most keys carry, so fall back
      // to the scopes endpoint, which any valid key can read. That still proves
      // the key works, which is what a connection test is for.
      try {
        const data = await this.request("/user/profile", credentials);
        const name = [data?.first_name, data?.last_name].filter(Boolean).join(" ");
        return { email: "", label: name || "SendGrid account", plan: "" };
      } catch (error) {
        if (isEspError(error) && error.code === "PERMISSION_DENIED") {
          await this.request("/scopes", credentials);
          return { email: "", label: "SendGrid account (limited-scope key)", plan: "" };
        }
        throw error;
      }
    }

    async getSendingDomains(credentials = {}) {
      const data = await this.request("/whitelabel/domains?limit=100", credentials);
      const list = Array.isArray(data) ? data : [];

      return list.map((item) => ({
        domain: String(item.domain || "").trim().toLowerCase(),
        verified: Boolean(item.valid),
      })).filter((item) => item.domain);
    }

    async getSenders(credentials = {}) {
      const data = await this.request("/verified_senders", credentials);
      const list = Array.isArray(data?.results) ? data.results : [];

      return list.map((item) => ({
        email: String(item.from_email || "").trim().toLowerCase(),
        name: String(item.from_name || item.nickname || "").trim(),
        active: item.verified !== false,
      })).filter((item) => item.email);
    }

    async getCampaigns(credentials = {}, { lookbackDays = 30, maxPages = 6 } = {}) {
      const campaigns = [];
      const pageSize = 50;
      const since = lookbackDays > 0
        ? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
        : null;

      let path = `/marketing/singlesends?page_size=${pageSize}`;

      for (let page = 0; page < maxPages && path; page += 1) {
        const data = await this.request(path, credentials);
        const list = Array.isArray(data?.result) ? data.result : [];
        if (!list.length) break;

        for (const item of list) {
          if (String(item.status || "").toLowerCase() !== "triggered") continue;

          const sentAtRaw = item.send_at || item.updated_at || item.created_at || "";
          const sentAt = sentAtRaw ? new Date(sentAtRaw) : null;
          if (since && sentAt && !Number.isNaN(sentAt.getTime()) && sentAt < since) continue;

          campaigns.push({
            provider: this.id,
            id: String(item.id || ""),
            // The subject lives on the single send's detail record, so the
            // list name is the best available fallback here.
            subject: String(item.name || "").trim(),
            senderEmail: "",
            senderName: "",
            sentAt: sentAtRaw || "",
          });
        }

        const next = data?._metadata?.next || "";
        path = next ? next.replace(BASE_URL, "") : "";
      }

      return campaigns;
    }

    async sync(credentials = {}, options = {}) {
      const account = await this.getAccountInfo(credentials);

      const [domains, senders] = await Promise.all([
        this.getSendingDomains(credentials).catch(() => []),
        this.getSenders(credentials).catch(() => []),
      ]);

      let campaigns = [];
      try {
        campaigns = await this.getCampaigns(credentials, options);
      } catch (error) {
        // A Mail-Send-only key is a normal, valid setup - domain and sender
        // matching still works without campaigns.
        if (!isEspError(error) || error.code !== "PERMISSION_DENIED") throw error;
      }

      return { account, domains, senders, campaigns };
    }
  }

  globalThis.EspProviderRegistry = globalThis.EspProviderRegistry || {};
  globalThis.EspProviderRegistry.sendgrid = new SendGridProvider();
})();
