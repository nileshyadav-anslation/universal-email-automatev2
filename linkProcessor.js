// LinkProcessor - extracts and validates links from an opened email.
(function () {
  "use strict";

  const BLOCKED_EXTENSIONS = [".exe", ".msi", ".bat", ".cmd", ".zip", ".rar"];
  const IGNORED_PREFIXES = ["mailto:", "tel:", "javascript:", "#"];

  function normalizeUrl(rawUrl) {
    const value = (rawUrl || "").trim();
    if (!value) return "";

    const lowerValue = value.toLowerCase();
    if (IGNORED_PREFIXES.some((prefix) => lowerValue.startsWith(prefix))) {
      return "";
    }

    try {
      return new URL(value, window.location.href).href;
    } catch (error) {
      return "";
    }
  }

  function isSafeLink(url) {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) return false;

    let parsedUrl;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch (error) {
      return false;
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return false;
    }

    const pathname = parsedUrl.pathname.toLowerCase();
    return !BLOCKED_EXTENSIONS.some((extension) => pathname.endsWith(extension));
  }

  function extractLinks(root = document, maxLinks = 1) {
    const linkLimit = Math.min(3, Math.max(1, parseInt(maxLinks, 10) || 1));
    const seen = new Set();
    const links = [];

    for (const anchor of Array.from(root.querySelectorAll("a[href]"))) {
      const normalizedUrl = normalizeUrl(anchor.getAttribute("href"));
      if (!normalizedUrl || seen.has(normalizedUrl) || !isSafeLink(normalizedUrl)) {
        continue;
      }

      seen.add(normalizedUrl);
      links.push(normalizedUrl);

      if (links.length >= linkLimit) {
        break;
      }
    }

    return links;
  }

  window.LinkProcessor = {
    extractLinks,
    isSafeLink,
  };
})();
