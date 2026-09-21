// brevoProvider.js - Brevo (formerly Sendinblue) adapter.
//
// Brevo is the only provider fully implemented so far. Every Brevo-specific
// URL, header and response shape lives in this file; nothing outside esp/
// knows Brevo exists.
//
// API: https://api.brevo.com/v3, authenticated with an `api-key` header.
// Callable straight from the extension's service worker once
// https://api.brevo.com/* is in host_permissions - no backend needed.
(function () {
  "use strict";

  const { CAPABILITIES, EspProvider, espFetch } = globalThis.EspProviderBase;
  const { createEspError, isEspError } = globalThis.EspErrors;

  const BASE_URL = "https://api.brevo.com/v3";

  class BrevoProvider extends EspProvider {
    constructor() {
      super({
        id: "brevo",
        label: "Brevo",
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
            placeholder: "xkeysib-...",
          },
        ],
        docsHint: "Brevo dashboard - SMTP & API - API Keys",
      });
    }

    headers(credentials = {}) {
      return { "api-key": String(credentials.apiKey || "").trim() };
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
      const data = await this.request("/account", credentials);
      if (!data) throw createEspError("API_ERROR", this.id, "Brevo returned an empty account response.");

      const company = data.companyName || "";
      const email = data.email || "";
      return {
        email,
        label: company ? `${company} (${email})` : email,
        plan: Array.isArray(data.plan) && data.plan.length ? data.plan[0].type || "" : "",
      };
    }

    async getSendingDomains(credentials = {}) {
      const data = await this.request("/senders/domains", credentials);
      const list = Array.isArray(data?.domains) ? data.domains : [];

      return list.map((item) => ({
        domain: String(item.domain || "").trim().toLowerCase(),
        // Brevo reports DKIM/SPF setup under `authenticated`; older responses
        // use `verified`. Treat either as good enough to match against.
        verified: Boolean(item.authenticated || item.verified),
      })).filter((item) => item.domain);
    }

    async getSenders(credentials = {}) {
      const data = await this.request("/senders", credentials);
      const list = Array.isArray(data?.senders) ? data.senders : [];

      return list.map((item) => ({
        email: String(item.email || "").trim().toLowerCase(),
        name: String(item.name || "").trim(),
        active: item.active !== false,
      })).filter((item) => item.email);
    }

    // Brevo paginates; 50 per page is its documented maximum for this endpoint.
    async getCampaigns(credentials = {}, { lookbackDays = 30, maxPages = 6 } = {}) {
      const campaigns = [];
      const limit = 50;
      const since = lookbackDays > 0
        ? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
        : null;

      for (let page = 0; page < maxPages; page += 1) {
        const offset = page * limit;
        const data = await this.request(
          `/emailCampaigns?status=sent&limit=${limit}&offset=${offset}&sort=desc`,
          credentials
        );

        const list = Array.isArray(data?.campaigns) ? data.campaigns : [];
        if (!list.length) break;

        let reachedCutoff = false;

        for (const item of list) {
          const sentAtRaw = item.sentDate || item.modifiedAt || item.createdAt || "";
          const sentAt = sentAtRaw ? new Date(sentAtRaw) : null;

          // Results are newest-first, so the first campaign older than the
          // window means every later one is too.
          if (since && sentAt && !Number.isNaN(sentAt.getTime()) && sentAt < since) {
            reachedCutoff = true;
            break;
          }

          const sender = item.sender || {};
          campaigns.push({
            provider: this.id,
            id: String(item.id || ""),
            subject: String(item.subject || item.name || "").trim(),
            senderEmail: String(sender.email || "").trim().toLowerCase(),
            senderName: String(sender.name || "").trim(),
            sentAt: sentAtRaw || "",
          });
        }

        if (reachedCutoff || list.length < limit) break;
      }

      return campaigns;
    }

    // Everything the matcher needs, fetched in one go. Domains and senders are
    // best-effort: a key scoped to campaigns only should still give a usable
    // result rather than failing the whole sync.
    async sync(credentials = {}, options = {}) {
      const account = await this.getAccountInfo(credentials);

      const [domains, senders] = await Promise.all([
        this.getSendingDomains(credentials).catch((error) => (isEspError(error) ? [] : [])),
        this.getSenders(credentials).catch((error) => (isEspError(error) ? [] : [])),
      ]);

      const campaigns = await this.getCampaigns(credentials, options);

      return { account, domains, senders, campaigns };
    }
  }

  globalThis.EspProviderRegistry = globalThis.EspProviderRegistry || {};
  globalThis.EspProviderRegistry.brevo = new BrevoProvider();
})();
