(function () {
  "use strict";

  function createOutlookProvider(deps) {
    const movedSpamEmailQueue = new Map();

    function isProvider() {
      const provider = deps.getProvider();
      return Boolean(provider && provider.host && provider.host.includes("outlook"));
    }

    function getMailboxUrl(folder = "inbox") {
      return folder === "spam"
        ? "https://outlook.live.com/mail/0/junkemail"
        : "https://outlook.live.com/mail/0/";
    }

    function getFolderLabels(folder = "inbox") {
      return folder === "spam"
        ? ["junk email", "junk mail", "junk", "spam"]
        : ["inbox"];
    }

    function isVisibleElement(element) {
      if (!element) return false;

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !element.hasAttribute("hidden") &&
        element.getAttribute("aria-hidden") !== "true"
      );
    }

    function clickElementLikeUser(element) {
      if (!element) return false;

      element.scrollIntoView({ block: "center", inline: "center" });
      try {
        element.focus({ preventScroll: true });
      } catch (error) {
        // Some Outlook controls are not focusable.
      }

      ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((eventName) => {
        const EventCtor = eventName.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
        element.dispatchEvent(new EventCtor(eventName, {
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
        element.click();
      } catch (error) {
        // The dispatched click above is still the primary path.
      }

      return true;
    }

    function getElementLabel(element) {
      return `${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.textContent || ""}`
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    }

    function findFolderControl(folder = "inbox") {
      const folderLabels = getFolderLabels(folder);
      const hrefMatches = folder === "spam"
        ? ["/junkemail", "junkemail", "junk"]
        : ["/inbox", "inbox"];
      const candidates = Array.from(document.querySelectorAll([
        "a[href]",
        "button",
        '[role="button"]',
        '[role="link"]',
        '[role="treeitem"]',
        "[aria-label]",
        "[title]",
      ].join(",")));

      return candidates.find((candidate) => {
        if (!isVisibleElement(candidate)) return false;

        const href = (candidate.getAttribute("href") || "").toLowerCase();
        if (hrefMatches.some((match) => href.includes(match))) return true;

        const label = getElementLabel(candidate);
        return folderLabels.some((folderLabel) => label === folderLabel || label.startsWith(`${folderLabel} `));
      }) || null;
    }

    function isInMailbox(folder = "inbox") {
      const url = window.location.href.toLowerCase();
      const folderLabels = getFolderLabels(folder);

      if (folder === "spam" && (url.includes("/junkemail") || url.includes("junkemail"))) return true;
      if (folder === "inbox" && (/\/mail\/0\/?($|[?#])/i.test(url) || url.includes("/inbox"))) return true;

      return Boolean(
        document.querySelector(`[aria-current="page"][href*="${folder === "spam" ? "junk" : "inbox"}"]`) ||
        Array.from(document.querySelectorAll('[aria-selected="true"], [aria-current="page"]'))
          .some((element) => folderLabels.some((label) => getElementLabel(element).includes(label)))
      );
    }

    function hasVisibleMailboxRows() {
      const provider = deps.getProvider();
      if (!provider) return false;

      return provider.inboxSelectors.some((selector) => {
        const elements = Array.from(document.querySelectorAll(selector));
        return elements.some(isVisibleElement);
      });
    }

    function getBackButton() {
      return (
        document.querySelector('button[aria-label="Back"]') ||
        document.querySelector('button[title="Back"]') ||
        document.querySelector('[data-icon-name="Back"]')?.closest("button") ||
        Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim().toLowerCase() === "back") ||
        null
      );
    }

    async function waitForMailbox(folder = "inbox", maxWait = 20000) {
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        if (isInMailbox(folder) && (!getBackButton() || hasVisibleMailboxRows())) {
          return true;
        }

        if (deps.getState() === "stopped") return false;
        await deps.sleep(350);
      }

      return false;
    }

    async function navigateMailbox(folder = "inbox") {
      if (!isProvider()) return true;

      const targetUrl = getMailboxUrl(folder);
      const backButton = getBackButton();
      const folderControl = findFolderControl(folder);

      if (backButton && isInMailbox(folder)) {
        clickElementLikeUser(backButton);
      } else if (folderControl) {
        clickElementLikeUser(folderControl);
      } else if (!isInMailbox(folder)) {
        window.location.assign(targetUrl);
      }

      const ready = await waitForMailbox(folder, 20000);
      await deps.sleep(900);
      return ready;
    }

    function isVisibleEnabledButton(button) {
      if (!button || !isVisibleElement(button)) return false;

      const disabled =
        button.getAttribute("aria-disabled") === "true" ||
        button.getAttribute("disabled") !== null ||
        button.disabled === true;

      return !disabled;
    }

    function findVisibleButtonByText(textMatches = [], root = document) {
      const matches = textMatches.map((text) => text.toLowerCase());
      const candidates = Array.from(root.querySelectorAll('button, a[role="button"], div[role="button"], [role="menuitem"]'));

      return candidates.find((button) => {
        if (!isVisibleEnabledButton(button)) return false;
        const label = getElementLabel(button);
        return matches.some((match) => label.includes(match));
      }) || null;
    }

    function getNotJunkButton() {
      const exactButton = Array.from(document.querySelectorAll('button, a[role="button"], div[role="button"], [role="menuitem"]'))
        .find((button) => {
          if (!isVisibleEnabledButton(button)) return false;
          const label = getElementLabel(button);
          return label === "it's not junk" || label === "not junk" || label === "mark as not junk";
        });

      if (exactButton) return exactButton;

      return findVisibleButtonByText([
        "it's not junk",
        "not junk",
        "not spam",
        "not phishing",
        "mark as not junk",
        "mark as not spam",
        "move to inbox",
        "restore to inbox",
      ]);
    }

    function getMoreButton() {
      const candidates = Array.from(document.querySelectorAll('button, a[role="button"], div[role="button"], [aria-label], [title]'));
      const visibleMatches = candidates.filter((button) => {
        if (!isVisibleEnabledButton(button)) return false;
        const label = getElementLabel(button);
        return label === "more" || label.includes("more options") || label.includes("more actions");
      });

      return visibleMatches.find((button) => button.getBoundingClientRect().top < 260) || visibleMatches[0] || null;
    }

    async function findNotJunkButtonWithMenu() {
      let notJunkButton = getNotJunkButton();
      if (notJunkButton) return notJunkButton;

      const moreButton = getMoreButton();
      if (!moreButton) return null;

      clickElementLikeUser(moreButton);
      await deps.sleep(600);
      notJunkButton = getNotJunkButton();

      return notJunkButton;
    }

    async function clickPossibleConfirmation() {
      await deps.sleep(700);
      const dialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
      if (!dialog) return false;

      const matches = ["ok", "yes", "report", "move", "not junk"];
      const confirmButton = Array.from(dialog.querySelectorAll('button, [role="button"]')).find((button) => {
        if (!isVisibleEnabledButton(button)) return false;
        const label = getElementLabel(button);
        return matches.some((match) => label.includes(match));
      }) || null;
      if (!confirmButton) return false;

      clickElementLikeUser(confirmButton);
      return true;
    }

    function getVisibleTextFromSelectors(selectors = []) {
      for (const selector of selectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        const visible = elements.find((element) => element && isVisibleElement(element) && element.textContent.trim());
        if (visible) {
          return visible.textContent.replace(/\s+/g, " ").trim();
        }
      }

      return "";
    }

    function getMessageBodyElement() {
      return Array.from(document.querySelectorAll([
        '[role="document"][aria-label="Message body"]',
        '[aria-label="Message body"]',
        '[id^="UniqueMessageBody_"]',
        '[data-app-section="MailReadCompose"]',
      ].join(","))).find(isVisibleElement) || null;
    }

    async function waitForMoveConfirmation(maxWait = 12000) {
      const startUrl = window.location.href;
      const start = Date.now();
      const hadMessageBody = Boolean(getMessageBodyElement());

      while (Date.now() - start < maxWait) {
        const noticeText = getVisibleTextFromSelectors([
          '[role="alert"]',
          "[aria-live]",
          '[data-automationid*="notification"]',
          '[data-testid*="toast"]',
        ]).toLowerCase();

        if (
          noticeText.includes("moved to inbox") ||
          noticeText.includes("moved to the inbox") ||
          noticeText.includes("marked as not junk") ||
          noticeText.includes("marked as not spam") ||
          (noticeText.includes("junk") && noticeText.includes("inbox"))
        ) {
          return true;
        }

        const notJunkStillVisible = Boolean(getNotJunkButton());
        const urlReturnedToJunkList =
          window.location.href !== startUrl &&
          /\/mail\/0\/junkemail\/?($|[?#])/i.test(window.location.href);
        const urlReturnedToInbox =
          window.location.href !== startUrl &&
          /\/mail\/0\/?($|[?#])/i.test(window.location.href);

        if (!notJunkStillVisible) {
          return true;
        }

        if (hadMessageBody && !getMessageBodyElement()) {
          return true;
        }

        if ((urlReturnedToJunkList || urlReturnedToInbox) && hasVisibleMailboxRows()) {
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

    function getRowsBySelectors(selectors = []) {
      for (const selector of selectors) {
        const rows = Array.from(document.querySelectorAll(selector));
        const usableRows = rows.filter(isVisibleElement);

        if (usableRows.length > 0) return usableRows;
      }

      return [];
    }

    function getVisibleMessageRows() {
      return getRowsBySelectors([
        '[role="option"][data-convid]',
        '[data-convid][role="option"]',
      ]);
    }

    function getMovedSpamRowsVisibleInInbox() {
      if (!isProvider() || movedSpamEmailQueue.size === 0) return [];

      const rows = getVisibleMessageRows();
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

      const notJunkButton = await findNotJunkButtonWithMenu();
      if (!notJunkButton) {
        deps.log("Could not find Outlook Not junk button. Junk email was processed but not moved.", "warn");
        return false;
      }

      deps.log("Moving safe Outlook Junk email to Inbox using Not junk...", "info");
      clickElementLikeUser(notJunkButton);
      await clickPossibleConfirmation();

      const moved = await waitForMoveConfirmation(15000);
      if (!moved) {
        deps.log("Could not confirm Outlook moved this Junk email to Inbox after clicking Not junk.", "warn");
        return false;
      }

      deps.log("Confirmed safe Outlook Junk email moved to Inbox.", "success");
      return true;
    }

    function clearMovedSpamQueue() {
      movedSpamEmailQueue.clear();
    }

    function hasMovedSpamQueue() {
      return movedSpamEmailQueue.size > 0;
    }

    function getMovedSpamQueueSize() {
      return movedSpamEmailQueue.size;
    }

    function getMailboxes() {
      return [
        { folder: "spam", label: "Spam" },
        { folder: "inbox", label: "Inbox" },
      ];
    }

    return {
      isProvider,
      getMailboxUrl,
      navigateMailbox,
      emailLooksSafe,
      rememberMovedSpamEmail,
      forgetMovedSpamEmail,
      getMovedSpamRowsVisibleInInbox,
      moveOpenedSpamEmailToInbox,
      clearMovedSpamQueue,
      hasMovedSpamQueue,
      getMovedSpamQueueSize,
      getMailboxes,
    };
  }

  window.OutlookProvider = {
    create: createOutlookProvider,
  };
})();
