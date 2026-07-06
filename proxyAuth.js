(function () {
  "use strict";

  const AUTH_URLS = ["<all_urls>"];
  const MAX_AUTH_ATTEMPTS = 2;

  let activeProxy = null;
  let authAttempts = new Map();
  let lastAuthFailure = null;
  let registered = false;

  function hasCredentials(proxy) {
    return Boolean(proxy && proxy.username && proxy.password);
  }

  function makeEmptyResponse() {
    return {};
  }

  function finishAuth(response, callback) {
    if (typeof callback === "function") {
      callback(response);
      return undefined;
    }

    return response;
  }

  function handleAuthRequired(details, callback) {
    if (!details || !details.isProxy || !activeProxy) {
      return finishAuth(makeEmptyResponse(), callback);
    }

    console.log("[Proxy] Auth requested", {
      proxyId: activeProxy.id,
      url: details.url,
    });

    if (!hasCredentials(activeProxy)) {
      lastAuthFailure = {
        proxyId: activeProxy.id,
        at: Date.now(),
      };

      return finishAuth({ cancel: true }, callback);
    }

    const requestId = details.requestId || `${Date.now()}`;
    const attempts = (authAttempts.get(requestId) || 0) + 1;
    authAttempts.set(requestId, attempts);

    if (attempts > MAX_AUTH_ATTEMPTS) {
      lastAuthFailure = {
        proxyId: activeProxy.id,
        at: Date.now(),
      };

      return finishAuth({ cancel: true }, callback);
    }

    return finishAuth({
      authCredentials: {
        username: activeProxy.username,
        password: activeProxy.password,
      },
    }, callback);
  }

  function registerAuthListener() {
    if (registered || !chrome.webRequest?.onAuthRequired) return;

    const listenerOptions = [
      ["asyncBlocking"],
      ["blocking"],
    ];

    for (const extraInfoSpec of listenerOptions) {
      try {
        chrome.webRequest.onAuthRequired.addListener(
          handleAuthRequired,
          { urls: AUTH_URLS },
          extraInfoSpec,
        );
        registered = true;
        return;
      } catch (error) {
        console.warn("[Proxy] Auth listener registration failed", {
          mode: extraInfoSpec.join(",") || "default",
          error: error.message,
        });
      }
    }

    console.warn("[Proxy] Proxy auth listener could not be registered");
  }

  function setActiveProxy(proxy) {
    activeProxy = proxy || null;
    authAttempts = new Map();
    lastAuthFailure = null;
    registerAuthListener();
  }

  function clearActiveProxy() {
    activeProxy = null;
    authAttempts = new Map();
  }

  function hasRecentAuthFailure(proxyId, windowMs = 30000) {
    return Boolean(
      lastAuthFailure &&
      lastAuthFailure.proxyId === proxyId &&
      Date.now() - lastAuthFailure.at < windowMs
    );
  }

  registerAuthListener();

  globalThis.ProxyAuth = {
    setActiveProxy,
    clearActiveProxy,
    hasRecentAuthFailure,
  };
})();
