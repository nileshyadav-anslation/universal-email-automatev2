// mailerliteProvider.js - MailerLite adapter (the newer "connect" API).
//
// API: https://connect.mailerlite.com/api, Bearer token.
// Probed against the live API: /api/campaigns and /api/subscribers authenticate
// with a Bearer token and return {"message":"Unauthenticated."} on a bad key.
//
// MailerLite exposes no GET for sending domains - /api/domains answers 405,
// POST only - so sendingDomains is deliberately NOT declared as a capability
// and returns UNSUPPORTED_OPERATION rather than a misleading empty list.
// Matching for MailerLite therefore runs on campaign subjects and the from
// addresses those campaigns carry.
(function () {
  "use strict";

  const { CAPABILITIES, EspProvider, espFetch } = globalThis.EspProviderBase;
  const { createEspError } = globalThis.EspErrors;

  const BASE_URL = "https://connect.mailerlite.com/api";

  class MailerLiteProvider extends EspProvider {
    constructor() {
      super({
        id: "mailerlite",
        label: "MailerLite",
        capabilities: [
          CAPABILITIES.accountInfo,
          CAPABILITIES.senders,
          CAPABILITIES.campaigns,
        ],
        credentialFields: [
          {
            key: "apiKey",
            label: "API Token",
            type: "password",
            required: true,
            placeholder: "eyJ0eXAi...",
          },
        ],
        docsHint: "MailerLite - Integrations - MailerLite API - Generate new token",
      });
    }

    headers(credentials = {}) {
      return {
        Authorization: `Bearer ${String(credentials.apiKey || "").trim()}`,
        "Content-Type": "application/json",
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

    // MailerLite has no dedicated "who am I" endpoint on this API, so a cheap
    // authenticated read doubles as the identity check. It proves the token
    // works, which is what a connection test is for.
    async getAccountInfo(credentials = {}) {
      await this.request("/subscribers?limit=1", credentials);
      return { email: "", label: "MailerLite account", plan: "" };
    }

    async getCampaigns(credentials = {}, { lookbackDays = 30, maxPages = 6 } = {}) {
      const campaigns = [];
      const limit = 50;
      const since = lookbackDays > 0
        ? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
        : null;

      for (let page = 1; page <= maxPages; page += 1) {
        const data = await this.request(
          `/campaigns?filter[status]=sent&limit=${limit}&page=${page}`,
          credentials
        );

        const list = Array.isArray(data?.data) ? data.data : [];
        if (!list.length) break;

        for (const item of list) {
          const sentAtRaw = item.finished_at || item.delivered_at || item.scheduled_for || item.created_at || "";
          const sentAt = sentAtRaw ? new Date(sentAtRaw) : null;
          if (since && sentAt && !Number.isNaN(sentAt.getTime()) && sentAt < since) continue;

          // The subject and from address live on the campaign's first email.
          const email = Array.isArray(item.emails) && item.emails.length ? item.emails[0] : {};

          campaigns.push({
            provider: this.id,
            id: String(item.id || ""),
            subject: String(email.subject || item.name || "").trim(),
            senderEmail: String(email.from || "").trim().toLowerCase(),
            senderName: String(email.from_name || "").trim(),
            sentAt: sentAtRaw || "",
          });
        }

        if (list.length < limit) break;
      }

      return campaigns;
    }

    // Derived from campaigns, because MailerLite has no senders endpoint. Only
    // addresses that genuinely sent something end up here.
    async getSenders(credentials = {}, options = {}) {
      const campaigns = await this.getCampaigns(credentials, options);
      const seen = new Map();

      campaigns.forEach((campaign) => {
        if (campaign.senderEmail && !seen.has(campaign.senderEmail)) {
          seen.set(campaign.senderEmail, { email: campaign.senderEmail, name: campaign.senderName, active: true });
        }
      });

      return Array.from(seen.values());
    }

    async sync(credentials = {}, options = {}) {
      const account = await this.getAccountInfo(credentials);
      const campaigns = await this.getCampaigns(credentials, options);

      const seen = new Map();
      campaigns.forEach((campaign) => {
        if (campaign.senderEmail && !seen.has(campaign.senderEmail)) {
          seen.set(campaign.senderEmail, { email: campaign.senderEmail, name: campaign.senderName, active: true });
        }
      });

      return { account, domains: [], senders: Array.from(seen.values()), campaigns };
    }
  }

  globalThis.EspProviderRegistry = globalThis.EspProviderRegistry || {};
  globalThis.EspProviderRegistry.mailerlite = new MailerLiteProvider();
})();
