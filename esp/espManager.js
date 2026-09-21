// espManager.js - the only thing the rest of the extension talks to when it
// wants a provider. Nothing outside esp/ should reference a provider by name.
(function () {
  "use strict";

  const { createEspError } = globalThis.EspErrors;

  // Order here is the order shown in the picker: implemented first.
  const PROVIDER_ORDER = ["brevo", "sendgrid", "mailchimp", "mailgun", "ses"];

  function registry() {
    return globalThis.EspProviderRegistry || {};
  }

  function getProvider(id) {
    const provider = registry()[String(id || "").toLowerCase()];
    if (!provider) {
      throw createEspError("PROVIDER_UNAVAILABLE", id, `Unknown ESP provider "${id}".`);
    }
    return provider;
  }

  function hasProvider(id) {
    return Boolean(registry()[String(id || "").toLowerCase()]);
  }

  // Everything the config UI needs to render itself, with no provider-specific
  // knowledge baked into the popup.
  function listProviders() {
    const all = registry();
    const ids = PROVIDER_ORDER.filter((id) => all[id])
      .concat(Object.keys(all).filter((id) => !PROVIDER_ORDER.includes(id)));

    return ids.map((id) => {
      const provider = all[id];
      return {
        id: provider.id,
        label: provider.label,
        comingSoon: Boolean(provider.comingSoon),
        note: provider.note || "",
        docsHint: provider.docsHint || "",
        credentialFields: provider.credentialFields || [],
        capabilities: Array.from(provider.capabilities || []),
      };
    });
  }

  globalThis.EspManager = {
    getProvider,
    hasProvider,
    listProviders,
  };
})();
