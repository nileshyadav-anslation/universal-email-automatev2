// espErrors.js - one error vocabulary for every ESP adapter.
//
// Adapters never throw raw fetch errors or provider-specific payloads at the
// rest of the extension. They translate into these codes so the popup can show
// one consistent message and the automation can react without knowing which
// ESP it is talking to.
(function () {
  "use strict";

  const ESP_ERROR_CODES = {
    INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
    AUTH_EXPIRED: "AUTH_EXPIRED",
    RATE_LIMITED: "RATE_LIMITED",
    NETWORK_ERROR: "NETWORK_ERROR",
    API_ERROR: "API_ERROR",
    DOMAIN_NOT_VERIFIED: "DOMAIN_NOT_VERIFIED",
    PERMISSION_DENIED: "PERMISSION_DENIED",
    PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
    UNSUPPORTED_OPERATION: "UNSUPPORTED_OPERATION",
  };

  // Shown verbatim in the popup, so they say what to DO, not just what broke.
  const DEFAULT_MESSAGES = {
    INVALID_CREDENTIALS: "The API key was rejected. Check it was copied in full and has not been revoked.",
    AUTH_EXPIRED: "These credentials have expired. Generate a new API key and reconnect.",
    RATE_LIMITED: "The provider is rate limiting this account. Wait a minute and try again.",
    NETWORK_ERROR: "Could not reach the provider. Check your connection, and whether an active proxy is blocking it.",
    API_ERROR: "The provider returned an unexpected error.",
    DOMAIN_NOT_VERIFIED: "This sending domain is not verified with the provider.",
    PERMISSION_DENIED: "This API key does not have permission for that operation.",
    PROVIDER_UNAVAILABLE: "This provider is not implemented yet.",
    UNSUPPORTED_OPERATION: "This provider's API does not support that operation.",
  };

  function createEspError(code, provider, message, details = {}) {
    const safeCode = ESP_ERROR_CODES[code] ? code : ESP_ERROR_CODES.API_ERROR;

    return {
      code: safeCode,
      provider: provider || "",
      message: message || DEFAULT_MESSAGES[safeCode],
      // Never carries credentials - adapters pass only status codes and
      // provider-side messages, both of which are safe to surface.
      details: details || {},
    };
  }

  // Providers say far more in a 401 body than a generic message can. Brevo, for
  // instance, distinguishes "Key not found" (the key really is wrong) from
  // "authentication not found in headers" (the request never carried the key at
  // all - our bug, not the user's). Throwing that away made the two look
  // identical and sent debugging down the wrong path.
  function providerDetail(body) {
    if (!body || typeof body !== "object") return "";
    return String(body.message || body.error || body.error_description || "").trim();
  }

  // Maps an HTTP status onto the shared vocabulary.
  function espErrorFromStatus(status, provider, body = null) {
    if (status === 401) {
      const detail = providerDetail(body);
      return createEspError(
        "INVALID_CREDENTIALS",
        provider,
        detail
          ? `${DEFAULT_MESSAGES.INVALID_CREDENTIALS} Provider said: "${detail}".`
          : null,
        { status, providerMessage: detail }
      );
    }
    if (status === 403) {
      const detail = providerDetail(body);
      return createEspError(
        "PERMISSION_DENIED",
        provider,
        detail ? `${DEFAULT_MESSAGES.PERMISSION_DENIED} Provider said: "${detail}".` : null,
        { status, providerMessage: detail }
      );
    }
    if (status === 404) return createEspError("API_ERROR", provider, "The provider endpoint was not found.", { status });
    if (status === 429) return createEspError("RATE_LIMITED", provider, null, { status });
    if (status >= 500) return createEspError("API_ERROR", provider, "The provider is having problems. Try again shortly.", { status });

    const detail = providerDetail(body);
    return createEspError("API_ERROR", provider, detail ? `Provider error: ${detail}` : null, { status, providerMessage: detail });
  }

  function isEspError(value) {
    return Boolean(value && typeof value === "object" && value.code && ESP_ERROR_CODES[value.code]);
  }

  globalThis.EspErrors = {
    ESP_ERROR_CODES,
    createEspError,
    espErrorFromStatus,
    isEspError,
  };
})();
