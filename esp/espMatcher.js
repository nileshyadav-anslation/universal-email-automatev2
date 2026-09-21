// espMatcher.js - decides whether a mailbox row is one of the emails an ESP
// says it sent.
//
// Pure logic: no storage, no network, no DOM queries of its own. It is handed
// a rule set (built in the service worker by EspConnectionManager.getMatchRules)
// and the fields already extracted from a row, so it loads in the content
// script and can be tested directly.
//
// Matching is deliberately conservative in one direction only: when ESP
// filtering is off, or the rule set is empty, EVERY row passes. Turning the
// feature off must leave the automation behaving exactly as it did before.
(function () {
  "use strict";

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function extractEmail(value) {
    const text = String(value || "");
    const match = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return match ? match[0].toLowerCase() : "";
  }

  function domainOf(email) {
    const at = String(email || "").lastIndexOf("@");
    return at === -1 ? "" : email.slice(at + 1).toLowerCase();
  }

  // "mail.acme.com" matches a configured "acme.com", but "notacme.com" does not.
  function domainMatches(candidate, configured) {
    if (!candidate || !configured) return false;
    return candidate === configured || candidate.endsWith(`.${configured}`);
  }

  function hasRules(rules) {
    if (!rules || !rules.enabled) return false;
    return Boolean(
      (rules.domains && rules.domains.length) ||
      (rules.senders && rules.senders.length) ||
      (rules.subjects && rules.subjects.length)
    );
  }

  // Subjects get compared after normalising, and either side may be truncated
  // by the mail UI, so containment in either direction counts. Very short
  // subjects are required to match exactly, or "Hi" would match everything.
  function subjectMatches(rowSubject, campaignSubject) {
    const a = normalize(rowSubject);
    const b = normalize(campaignSubject);
    if (!a || !b) return false;
    if (b.length < 12) return a === b;
    return a.includes(b) || b.includes(a);
  }

  /**
   * @param {{sender?: string, subject?: string}} row  fields pulled from the mailbox row
   * @param {object} rules  from EspConnectionManager.getMatchRules()
   * @returns {{matched: boolean, reason: string, evidence: string[], matchedSender?: string}}
   */
  function matchRow(row = {}, rules = {}) {
    // Feature off, or nothing configured: everything is processable, which is
    // the pre-ESP behaviour.
    if (!hasRules(rules)) {
      return { matched: true, reason: "esp-filter-inactive", evidence: [] };
    }

    const senderEmail = extractEmail(row.sender);
    const senderDomain = domainOf(senderEmail);
    const evidence = [];
    let matchedSender = "";

    if (senderEmail && (rules.senders || []).includes(senderEmail)) {
      evidence.push("sender-address");
      matchedSender = senderEmail;
    }

    if (senderDomain && (rules.domains || []).some((d) => domainMatches(senderDomain, d))) {
      evidence.push("sender-domain");
      matchedSender = matchedSender || senderEmail;
    }

    if ((rules.subjects || []).some((s) => subjectMatches(row.subject, s))) {
      evidence.push("campaign-subject");
    }

    if (evidence.length) {
      return { matched: true, reason: "esp-match", evidence, matchedSender };
    }

    // No evidence. If the sender could not be read at all we cannot judge the
    // row, so fail open rather than silently skipping mail - unless the user
    // has explicitly asked for strict mode.
    if (!senderEmail && !rules.strictWhenIndexEmpty) {
      return { matched: true, reason: "sender-unreadable", evidence: [] };
    }

    return { matched: false, reason: "no-esp-match", evidence: [] };
  }

  globalThis.EspMatcher = {
    matchRow,
    hasRules,
    normalize,
    extractEmail,
    domainOf,
    domainMatches,
    subjectMatches,
  };
})();
