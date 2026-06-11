(function () {
  "use strict";

  function createGmailProvider(deps) {
    const movedSpamEmailQueue = new Map();

    function isProvider() {
      const provider = deps.getProvider();
      return Boolean(provider && provider.host && provider.host.includes("google"));
    }

    function getMailboxUrl(folder = "inbox") {
      const accountIndex = deps.getGmailAccountIndex();
      const gmailHashes = {
        spam: "#spam",
        inbox: "#inbox",
        promotions: "#category/promotions",
      };
      const hash = gmailHashes[folder] || gmailHashes.inbox;
      return `https://mail.google.com/mail/u/${accountIndex}/${hash}`;
    }

    async function navigateMailbox(folder = "inbox") {
      if (!isProvider()) return true;

      const targetHash = new URL(getMailboxUrl(folder)).hash;
      if (window.location.hash !== targetHash) {
        window.location.href = getMailboxUrl(folder);
      }

      const ready = await deps.waitForInbox(15000);
      await deps.sleep(1200);
      return ready;
    }

    function getPageRangeText() {
      const rangeEl =
        document.querySelector(".Di .Dj") ||
        document.querySelector('[aria-label="Show more messages"] .Dj') ||
        document.querySelector('[role="button"][aria-label="Show more messages"]');

      return rangeEl ? rangeEl.textContent.replace(/\s+/g, " ").trim() : "";
    }

    function isVisibleEnabledButton(button) {
      if (!button || button.offsetParent === null) return false;

      const rect = button.getBoundingClientRect();
      const disabled =
        button.getAttribute("aria-disabled") === "true" ||
        button.getAttribute("disabled") !== null ||
        button.classList.contains("T-I-JO") ||
        button.classList.contains("aqJ");

      return rect.width > 0 && rect.height > 0 && !disabled;
    }

    function getEnabledOlderButton() {
      const candidates = Array.from(document.querySelectorAll(
        'div[role="button"][aria-label="Older"], div[role="button"][data-tooltip="Older"], [aria-label="Older"], [data-tooltip="Older"]'
      ));

      return candidates.find(isVisibleEnabledButton) || null;
    }

    function clickToolbarButton(button) {
      if (!button) return false;

      button.scrollIntoView({ block: "center", inline: "center" });
      try {
        button.focus();
      } catch (error) {
        // Some Gmail toolbar elements are not focusable.
      }

      ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((eventName) => {
        const EventCtor = eventName.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
        button.dispatchEvent(new EventCtor(eventName, {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: eventName.includes("down") ? 1 : 0,
        }));
      });

      try {
        button.click();
      } catch (error) {
        // The dispatched click above is still the primary path.
      }

      return true;
    }

    function findVisibleButtonByText(textMatches = []) {
      const matches = textMatches.map((text) => text.toLowerCase());
      const candidates = Array.from(document.querySelectorAll('div[role="button"], button, [aria-label], [data-tooltip]'));

      return candidates.find((button) => {
        if (!isVisibleEnabledButton(button)) return false;
        const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("data-tooltip") || ""} ${button.textContent || ""}`.toLowerCase();
        return matches.some((match) => label.includes(match));
      }) || null;
    }

    function getNotSpamButton() {
      const candidates = Array.from(document.querySelectorAll(
        'div[role="button"][aria-label="Not spam"], div[role="button"][data-tooltip="Not spam"], [aria-label="Not spam"], [data-tooltip="Not spam"]'
      ));

      return candidates.find(isVisibleEnabledButton) ||
        findVisibleButtonByText(["not spam", "report not spam"]);
    }

    function getVisibleTextFromSelectors(selectors = []) {
      for (const selector of selectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        const visible = elements.find((element) => element && element.offsetParent !== null && element.textContent.trim());
        if (visible) {
          return visible.textContent.replace(/\s+/g, " ").trim();
        }
      }

      return "";
    }

    async function waitForNotSpamMoveConfirmation(maxWait = 10000) {
      const start = Date.now();
      const provider = deps.getProvider();

      while (Date.now() - start < maxWait) {
        const noticeText = getVisibleTextFromSelectors([
          '[role="alert"]',
          "[aria-live]",
          ".vh",
          ".bAq",
          ".aT",
        ]).toLowerCase();

        if (
          noticeText.includes("moved to inbox") ||
          noticeText.includes("moved to the inbox") ||
          noticeText.includes("marked as not spam") ||
          noticeText.includes("removed from spam") ||
          noticeText.includes("unmarked as spam") ||
          (noticeText.includes("spam") && noticeText.includes("inbox"))
        ) {
          return true;
        }

        const stillInSpamMessage = window.location.hash.startsWith("#spam/") || window.location.hash.startsWith("#search/");
        const notSpamStillVisible = Boolean(getNotSpamButton());
        const mailboxVisible = provider.inboxSelectors.some((selector) => {
          const mailbox = document.querySelector(selector);
          return mailbox && mailbox.offsetParent !== null;
        });

        if (!notSpamStillVisible && (!stillInSpamMessage || mailboxVisible)) {
          return true;
        }

        if (deps.getState() === "stopped") return false;
        await deps.sleep(400);
      }

      return false;
    }

    function emailLooksSafe(root = document) {
      const anchors = Array.from((root || document).querySelectorAll("a[href]"));

      for (const anchor of anchors) {
        const rawHref = anchor.getAttribute("href") || "";
        if (!rawHref || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:") || rawHref.startsWith("#")) {
          continue;
        }

        let normalizedUrl = "";
        try {
          normalizedUrl = new URL(rawHref, window.location.href).href;
        } catch (error) {
          continue;
        }

        const protocol = new URL(normalizedUrl).protocol;
        if (["http:", "https:"].includes(protocol) && !window.LinkProcessor.isSafeLink(normalizedUrl)) {
          return false;
        }
      }

      return true;
    }

    function normalizeQueueText(value = "") {
      return String(value).replace(/\s+/g, " ").trim().toLowerCase();
    }

    function rememberMovedSpamEmail(rowId, subject) {
      if (!rowId && !subject) return;

      const key = rowId || normalizeQueueText(subject);
      movedSpamEmailQueue.set(key, {
        rowId,
        subject: normalizeQueueText(subject),
      });
    }

    function forgetMovedSpamEmail(rowId, subject) {
      const normalizedSubject = normalizeQueueText(subject);

      for (const [key, queued] of movedSpamEmailQueue.entries()) {
        if (
          (rowId && queued.rowId === rowId) ||
          (normalizedSubject && queued.subject && normalizedSubject.includes(queued.subject))
        ) {
          movedSpamEmailQueue.delete(key);
        }
      }
    }

    function getVisibleRowsBySelectors(selectors = []) {
      for (const selector of selectors) {
        const rows = Array.from(document.querySelectorAll(selector));
        const visibleRows = rows.filter((row) => {
          const rect = row.getBoundingClientRect();
          return rect.height > 0 && rect.width > 0 && row.offsetParent !== null;
        });

        if (visibleRows.length > 0) return visibleRows;
      }

      return [];
    }

    function getMovedSpamRowsVisibleInInbox() {
      const provider = deps.getProvider();
      if (!isProvider() || movedSpamEmailQueue.size === 0) return [];

      const rows = getVisibleRowsBySelectors(provider.inboxSelectors);
      return rows.filter((row) => {
        const rowId = deps.getEmailRowId(row);
        const subject = normalizeQueueText(deps.getEmailSubject(row));

        for (const queued of movedSpamEmailQueue.values()) {
          if (queued.rowId && rowId === queued.rowId) return true;
          if (queued.subject && subject.includes(queued.subject)) return true;
        }

        return false;
      });
    }

    async function moveOpenedSpamEmailToInbox() {
      if (!isProvider()) return false;

      const notSpamButton = getNotSpamButton();
      if (!notSpamButton) {
        deps.log("Could not find Gmail Not spam button. Spam email was processed but not moved.", "warn");
        return false;
      }

      deps.log("Moving safe Spam email to Inbox using Not spam...", "info");
      clickToolbarButton(notSpamButton);
      const moved = await waitForNotSpamMoveConfirmation(10000);
      if (!moved) {
        deps.log("Could not confirm Gmail moved this Spam email to Inbox after clicking Not spam.", "warn");
        return false;
      }

      deps.log("Confirmed safe Spam email moved to Inbox.", "success");
      return true;
    }

    async function waitForPageRangeChange(previousRange, maxWait = 12000) {
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        await deps.sleep(500);
        const currentRange = getPageRangeText();

        if (currentRange && currentRange !== previousRange) {
          return true;
        }

        if (deps.getState() === "stopped") return false;
      }

      return false;
    }

    async function goToNextPage() {
      if (!isProvider()) return false;

      const olderButton = getEnabledOlderButton();
      if (!olderButton) return false;

      const previousRange = getPageRangeText();
      deps.log(`Moving to next Gmail page${previousRange ? ` from ${previousRange}` : ""}...`, "info");

      clickToolbarButton(olderButton);

      const changed = await waitForPageRangeChange(previousRange, 12000);
      if (!changed) {
        deps.log("Next Gmail page click did not change the message range. Stopping pagination for this folder.", "warn");
        return false;
      }

      await deps.waitForInbox(12000);
      await deps.sleep(1200);
      deps.log(`Now on Gmail page ${getPageRangeText() || "next"}`, "success");
      return true;
    }

    function clearMovedSpamQueue() {
      movedSpamEmailQueue.clear();
    }

    function hasMovedSpamQueue() {
      return movedSpamEmailQueue.size > 0;
    }

    function getMailboxes() {
      return [
        { folder: "spam", label: "Spam" },
        { folder: "inbox", label: "Inbox" },
        { folder: "promotions", label: "Promotions" },
      ];
    }

    return {
      isProvider,
      getMailboxUrl,
      navigateMailbox,
      goToNextPage,
      emailLooksSafe,
      rememberMovedSpamEmail,
      forgetMovedSpamEmail,
      getMovedSpamRowsVisibleInInbox,
      moveOpenedSpamEmailToInbox,
      clearMovedSpamQueue,
      hasMovedSpamQueue,
      getMailboxes,
    };
  }

  window.GmailProvider = {
    create: createGmailProvider,
  };
})();
