// klaviyoProvider.js - Klaviyo adapter.
//
// API: https://a.klaviyo.com/api
// Auth: Authorization: Klaviyo-API-Key pk_xxx   (probed live - this is the
// scheme Klaviyo accepts; a plain Bearer is rejected the same way a bad key is,
// so the prefix matters).
//
// Klaviyo versions its API by date through a required `revision` header. Every
// request here pins one known-good revision rather than tracking "latest", so
// a Klaviyo release cannot silently change the response shape underneath us.
//
// Errors come back JSON:API shaped - {"errors":[{"detail":"..."}]} - which
// EspErrors.providerDetail understands.
(function () {
  "use strict";

  const { CAPABILITIES, EspProvider, espFetch } = globalThis.EspProviderBase;
  const { createEspError } = globalThis.EspErrors;

  const BASE_URL = "https://a.klaviyo.com/api";
  const REVISION = "2024-10-15";

  class KlaviyoProvider extends EspProvider {
    constructor() {
      super({
        id: "klaviyo",
        label: "Klaviyo",
        capabilities: [
          CAPABILITIES.accountInfo,
          CAPABILITIES.senders,
          CAPABILITIES.campaigns,
        ],
        credentialFields: [
          {
            key: "apiKey",
            label: "Private API Key",
            type: "password",
            required: true,
            placeholder: "pk_...",
          },
        ],
        docsHint: "Klaviyo - Settings - API keys - Create private API key (needs Campaigns read)",
      });
    }

    headers(credentials = {}) {
      return {
        Authorization: `Klaviyo-API-Key ${String(credentials.apiKey || "").trim()}`,
        revision: REVISION,
      };
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
      const data = await this.request("/accounts", credentials);
      const first = Array.isArray(data?.data) && data.data.length ? data.data[0] : null;
      const contact = first?.attributes?.contact_information || {};
      const organisation = String(contact.organization_name || "").trim();

      return {
        email: String(contact.default_sender_email || "").trim(),
        label: organisation || "Klaviyo account",
        plan: "",
      };
    }

    // Klaviyo requires a filter on this endpoint - an unfiltered call is
    // rejected - so the channel filter is not optional tidiness.
    async getCampaigns(credentials = {}, { lookbackDays = 30, maxPages = 6 } = {}) {
      const campaigns = [];
      const since = lookbackDays > 0
        ? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
        : null;

      const filter = encodeURIComponent("equals(messages.channel,'email')");
      let path = `/campaigns?filter=${filter}&sort=-created_at`;

      for (let page = 0; page < maxPages && path; page += 1) {
        const data = await this.request(path, credentials);
        const list = Array.isArray(data?.data) ? data.data : [];
        if (!list.length) break;

        let reachedCutoff = false;

        for (const item of list) {
          const attrs = item.attributes || {};
          const sentAtRaw = attrs.send_time || attrs.updated_at || attrs.created_at || "";
          const sentAt = sentAtRaw ? new Date(sentAtRaw) : null;

          // Sorted newest-first, so the first one past the window ends it.
          if (since && sentAt && !Number.isNaN(sentAt.getTime()) && sentAt < since) {
            reachedCutoff = true;
            break;
          }

          campaigns.push({
            provider: this.id,
            id: String(item.id || ""),
            // The subject lives on the campaign-message sub-resource; the
            // campaign name is what a single request can see, and in practice
            // Klaviyo users name campaigns after the subject.
            subject: String(attrs.name || "").trim(),
            senderEmail: "",
            senderName: "",
            sentAt: sentAtRaw || "",
          });
        }

        if (reachedCutoff) break;

        const next = data?.links?.next || "";
        path = next ? next.replace(BASE_URL, "") : "";
      }

      return campaigns;
    }

    async getSenders(credentials = {}) {
      const data = await this.request("/accounts", credentials);
      const first = Array.isArray(data?.data) && data.data.length ? data.data[0] : null;
      const email = String(first?.attributes?.contact_information?.default_sender_email || "").trim().toLowerCase();

      return email
        ? [{ email, name: String(first?.attributes?.contact_information?.default_sender_name || "").trim(), active: true }]
        : [];
    }

    async sync(credentials = {}, options = {}) {
      const account = await this.getAccountInfo(credentials);
      const senders = await this.getSenders(credentials).catch(() => []);
      const campaigns = await this.getCampaigns(credentials, options);

      return { account, domains: [], senders, campaigns };
    }
  }

  globalThis.EspProviderRegistry = globalThis.EspProviderRegistry || {};
  globalThis.EspProviderRegistry.klaviyo = new KlaviyoProvider();
})();
