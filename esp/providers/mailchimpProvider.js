// mailchimpProvider.js - Mailchimp Marketing API adapter.
//
// API: https://<dc>.api.mailchimp.com/3.0, HTTP Basic with any username and
// the API key as the password. The data-centre prefix is the suffix of the key
// itself ("...-us14" -> us14), so there is no separate region field to fill in.
//
// host_permissions needs the wildcard https://*.api.mailchimp.com/* because
// the host is account-specific.
(function () {
  "use strict";

  const { CAPABILITIES, EspProvider, espFetch } = globalThis.EspProviderBase;
  const { createEspError } = globalThis.EspErrors;

  class MailchimpProvider extends EspProvider {
    constructor() {
      super({
        id: "mailchimp",
        label: "Mailchimp",
        capabilities: [
          CAPABILITIES.accountInfo,
          CAPABILITIES.sendingDomains,
          CAPABILITIES.campaigns,
        ],
        credentialFields: [
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "abc123...-us14",
          },
        ],
        docsHint: "Mailchimp - Account - Extras - API keys",
      });
    }

    // The data centre is encoded in the key. Without it there is no host to
    // call, so this is a credential problem, not a network one.
    dataCentre(credentials = {}) {
      const key = String(credentials.apiKey || "").trim();
      const dc = key.split("-")[1];
      if (!dc) {
        throw createEspError(
          "INVALID_CREDENTIALS",
          this.id,
          "That does not look like a Mailchimp key - it should end with a data centre suffix such as -us14."
        );
      }
      return dc;
    }

    headers(credentials = {}) {
      const token = btoa(`anystring:${String(credentials.apiKey || "").trim()}`);
      return { Authorization: `Basic ${token}` };
    }

    request(path, credentials) {
      const dc = this.dataCentre(credentials);
      return espFetch(`https://${dc}.api.mailchimp.com/3.0${path}`, {
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
      const data = await this.request("/", credentials);
      return {
        email: String(data?.email || "").trim(),
        label: String(data?.account_name || data?.email || "Mailchimp account").trim(),
        plan: String(data?.pricing_plan_type || ""),
      };
    }

    async getSendingDomains(credentials = {}) {
      const data = await this.request("/verified-domains", credentials);
      const list = Array.isArray(data?.domains) ? data.domains : [];

      return list.map((item) => ({
        domain: String(item.domain || "").trim().toLowerCase(),
        verified: Boolean(item.verified),
      })).filter((item) => item.domain);
    }

    async getCampaigns(credentials = {}, { lookbackDays = 30, maxPages = 6 } = {}) {
      const campaigns = [];
      const count = 50;
      const since = lookbackDays > 0
        ? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
        : null;
      const sinceParam = since ? `&since_send_time=${encodeURIComponent(since.toISOString())}` : "";

      for (let page = 0; page < maxPages; page += 1) {
        const offset = page * count;
        const data = await this.request(
          `/campaigns?status=sent&count=${count}&offset=${offset}&sort_field=send_time&sort_dir=DESC${sinceParam}`,
          credentials
        );

        const list = Array.isArray(data?.campaigns) ? data.campaigns : [];
        if (!list.length) break;

        for (const item of list) {
          const settings = item.settings || {};
          campaigns.push({
            provider: this.id,
            id: String(item.id || ""),
            subject: String(settings.subject_line || settings.title || "").trim(),
            senderEmail: String(settings.reply_to || "").trim().toLowerCase(),
            senderName: String(settings.from_name || "").trim(),
            sentAt: item.send_time || "",
          });
        }

        if (list.length < count) break;
      }

      return campaigns;
    }

    async sync(credentials = {}, options = {}) {
      const account = await this.getAccountInfo(credentials);
      const domains = await this.getSendingDomains(credentials).catch(() => []);
      const campaigns = await this.getCampaigns(credentials, options);

      // Mailchimp has no "verified senders" list equivalent; the reply-to
      // addresses on campaigns are the closest honest substitute.
      const senders = [...new Set(campaigns.map((c) => c.senderEmail).filter(Boolean))]
        .map((email) => ({ email, name: "", active: true }));

      return { account, domains, senders, campaigns };
    }
  }

  globalThis.EspProviderRegistry = globalThis.EspProviderRegistry || {};
  globalThis.EspProviderRegistry.mailchimp = new MailchimpProvider();
})();
