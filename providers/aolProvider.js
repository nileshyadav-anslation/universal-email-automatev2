(function () {
  "use strict";

  function createAolProvider(deps) {
    const INBOX_URL = "https://mail.aol.com/d/folders/1";
    const SPAM_URL = "https://mail.aol.com/d/folders/6";
    const movedSpamEmailQueue = [];

    function isProvider() {
      const provider = deps.getProvider();
      return Boolean(provider && provider.host && provider.host.includes("aol"));
    }

    function getMailboxUrl(folder = "inbox") {
      return folder === "spam" ? SPAM_URL : INBOX_URL;
    }

    function isElementVisible(element) {
      if (!element) return false;

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !element.hasAttribute("hidden") &&
        element.getAttribute("aria-hidden") !== "true" &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      );
    }

    function isEnabledControl(element) {
      if (!isElementVisible(element)) return false;

      return !(
        element.disabled === true ||
        element.getAttribute("disabled") !== null ||
        element.getAttribute("aria-disabled") === "true"
      );
    }

    function controlText(element) {
      return [
        element?.getAttribute?.("aria-label") || "",
        element?.getAttribute?.("title") || "",
        element?.textContent || "",
      ].join(" ").replace(/\s+/g, " ").trim().toLowerCase();
    }

    function getBackButton() {
      return (
        document.querySelector('button[data-test-id="toolbar-back-to-list"]') ||
        document.querySelector('button[aria-label="Back"]') ||
        document.querySelector('[title="Back"]') ||
        Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Back") ||
        null
      );
    }

    function getVisibleRows() {
      const provider = deps.getProvider();
      if (!provider) return [];

      for (const selector of provider.inboxSelectors || []) {
        const rows = Array.from(document.querySelectorAll(selector)).filter(isElementVisible);
        if (rows.length > 0) return rows;
      }

      return [];
    }

    function isInMailbox(folder = "inbox") {
      const url = window.location.href.toLowerCase();
      const folderUrl = getMailboxUrl(folder).toLowerCase();
      const folderId = folder === "spam" ? "6" : "1";
      const activeFolder = document.querySelector(`[aria-current="page"][href*="/d/folders/${folderId}"], [aria-selected="true"][href*="/d/folders/${folderId}"]`);

      return url.startsWith(folderUrl) || url.includes(`/d/folders/${folderId}`) || Boolean(activeFolder);
    }

    function findFolderLink(folder = "inbox") {
      const folderId = folder === "spam" ? "6" : "1";
      const labels = folder === "spam" ? ["spam", "junk"] : ["inbox"];
      const candidates = Array.from(document.querySelectorAll([
        `a[href*="/d/folders/${folderId}"]`,
        `a[href*="/folders/${folderId}"]`,
        "a",
        "button",
        '[role="button"]',
        '[role="link"]',
      ].join(",")));

      return candidates.find((candidate) => {
        if (!isElementVisible(candidate)) return false;

        const href = candidate.getAttribute("href") || "";
        if (href.includes(`/d/folders/${folderId}`) || href.includes(`/folders/${folderId}`)) {
          return true;
        }

        const label = controlText(candidate);
        return labels.some((match) => label === match || label.startsWith(`${match} `));
      }) || null;
    }

    function clickLikeUser(element) {
      if (!element) return false;

      element.scrollIntoView({ block: "center", inline: "center" });
      const rect = element.getBoundingClientRect();
      const clientX = Math.floor(rect.left + rect.width / 2);
      const clientY = Math.floor(rect.top + rect.height / 2);

      try {
        element.focus({ preventScroll: true });
      } catch (error) {
        // AOL toolbar controls can have tabindex=-1.
      }

      for (const eventName of ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        const EventCtor = eventName.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
        element.dispatchEvent(new EventCtor(eventName, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX,
          clientY,
          screenX: clientX,
          screenY: clientY,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: eventName.includes("down") ? 1 : 0,
        }));
      }

      try {
        HTMLElement.prototype.click.call(element);
      } catch (error) {
        try {
          element.click();
        } catch (clickError) {
          // The dispatched event sequence above is still useful for AOL.
        }
      }

      return true;
    }

    async function clickBackToListIfVisible() {
      const backButton = getBackButton();
      if (!isEnabledControl(backButton)) return false;

      const clicked = clickExactButtonLikeUser(backButton);
      if (clicked) {
        deps.log("AOL Back button clicked", "info");
        await deps.sleep(900);
      }
      return clicked;
    }

    function clickExactButtonLikeUser(button) {
      if (!button) return false;

      button.scrollIntoView({ block: "center", inline: "center" });
      const rect = button.getBoundingClientRect();
      const clientX = Math.floor(rect.left + rect.width / 2);
      const clientY = Math.floor(rect.top + rect.height / 2);

      try {
        button.focus({ preventScroll: true });
      } catch (error) {
        // AOL toolbar buttons can have tabindex=-1.
      }

      for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        const EventCtor = eventName.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
        button.dispatchEvent(new EventCtor(eventName, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX,
          clientY,
          screenX: clientX,
          screenY: clientY,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: eventName.includes("down") ? 1 : 0,
        }));
      }

      try {
        HTMLElement.prototype.click.call(button);
      } catch (error) {
        try {
          button.click();
        } catch (clickError) {
          return false;
        }
      }

      return true;
    }

    async function waitForMailbox(folder = "inbox", maxWait = 20000) {
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        const backButton = getBackButton();
        if (isInMailbox(folder) && (!backButton || getVisibleRows().length > 0)) {
          return true;
        }

        if (deps.getState() === "stopped") return false;
        await deps.sleep(300);
      }

      return false;
    }

    async function navigateMailbox(folder = "inbox") {
      if (!isProvider()) return true;

      const targetUrl = getMailboxUrl(folder);
      const backButton = getBackButton();

      if (backButton && isInMailbox(folder)) {
        await clickBackToListIfVisible();
      } else {
        const folderLink = findFolderLink(folder);
        if (folderLink) {
          clickLikeUser(folderLink);
        } else if (!window.location.href.toLowerCase().startsWith(targetUrl.toLowerCase())) {
          window.location.assign(targetUrl);
        }
      }

      const ready = await waitForMailbox(folder, 22000);
      await deps.sleep(900);
      return ready;
    }

    function findControlBySelectors(selectors = []) {
      for (const selector of selectors) {
        const matches = Array.from(document.querySelectorAll(selector));
        const control = matches
          .map((element) => element.closest?.("button, [role='button'], [role='menuitem']") || element)
          .find(isEnabledControl);

        if (control) return control;
      }

      return null;
    }

    function findControlByText(matches = []) {
      const lowerMatches = matches.map((match) => match.toLowerCase());
      const controls = Array.from(document.querySelectorAll("button, [role='button'], [role='menuitem'], a[role='button'], [aria-label], [title]"));

      return controls.find((control) => {
        if (!isEnabledControl(control)) return false;
        const label = controlText(control);
        return lowerMatches.some((match) => label.includes(match));
      }) || null;
    }

    function getNotSpamButton() {
      return (
        findControlBySelectors([
          'li[name="spam"][data-test-id="spam"] button[data-test-id="toolbar-not-spam"]',
          'li[role="menuitem"][name="spam"] button[data-test-id="toolbar-not-spam"]',
          'li[role="menuitem"][name="spam"] button[aria-label="Mark as not spam"]',
          '[role="menuitem"][name="spam"] [data-test-id="toolbar-not-spam"]',
          'button[data-test-id="toolbar-not-spam"]',
          '[data-test-id="toolbar-not-spam"]',
          'button[aria-label="Mark as not spam"]',
          '[aria-label="Mark as not spam"]',
        ]) ||
        findControlByText(["mark as not spam", "not spam", "this is not spam"])
      );
    }

    function getRestoreToInboxButton() {
      return (
        findControlBySelectors([
          'button[data-test-id="toolbar-archive-restore"]',
          '[data-test-id="toolbar-archive-restore"]',
          'button[aria-label="Restore selected messages to Inbox"]',
          '[aria-label="Restore selected messages to Inbox"]',
        ]) ||
        findControlByText(["restore selected messages to inbox", "restore to inbox", "move to inbox"])
      );
    }

    function getMarkAsSpamButton() {
      return (
        findControlBySelectors([
          'button[data-test-id="toolbar-spam"]',
          '[data-test-id="toolbar-spam"]',
          'button[aria-label="Mark as spam"]',
          'button[title="Spam"]',
        ]) ||
        findControlByText(["mark as spam", "spam"])
      );
    }

    function isOpenedMessageView() {
      return /\/d\/folders\/\d+\/messages\//i.test(window.location.pathname) || Boolean(getMessageViewElement());
    }

    async function recoverAlreadyMovedMessageView() {
      if (!isOpenedMessageView()) return false;

      const backButton = getBackButton();
      const spamButton = getMarkAsSpamButton();
      if (!isEnabledControl(backButton) || !spamButton) return false;

      deps.log("AOL Not Spam unavailable; toolbar shows Spam, so message appears already moved. Returning to list.", "warn");
      await clickBackToListIfVisible();
      const returned = await waitForMailbox("spam", 8000);
      if (returned) {
        deps.log("AOL move confirmed by Spam toolbar state and Back return.", "success");
      }
      return returned;
    }

    function getMoreButton() {
      const controls = Array.from(document.querySelectorAll("button, [role='button'], [aria-label], [title], [data-test-id]"));
      const matches = controls.filter((control) => {
        if (!isEnabledControl(control)) return false;
        const label = controlText(control);
        return label === "more" || label.includes("more options") || label.includes("more actions");
      });

      return matches.find((control) => control.getBoundingClientRect().top < 180) || matches[0] || null;
    }

    async function findMoveButton() {
      let button = getNotSpamButton();
      if (button) return { button, label: "Not Spam" };

      const moreButton = getMoreButton();
      if (moreButton) {
        clickLikeUser(moreButton);
        await deps.sleep(700);
        button = getNotSpamButton();
        if (button) return { button, label: "Not Spam" };
      }

      button = getRestoreToInboxButton();
      if (button) return { button, label: "Restore to Inbox" };

      return { button: null, label: "" };
    }

    async function clickToolbarControl(control) {
      if (!control) return false;

      const isNotSpamControl = Boolean(
        control.matches?.('button[data-test-id="toolbar-not-spam"], [data-test-id="toolbar-not-spam"], button[aria-label="Mark as not spam"], [aria-label="Mark as not spam"]') ||
        control.querySelector?.('button[data-test-id="toolbar-not-spam"], [data-test-id="toolbar-not-spam"], button[aria-label="Mark as not spam"], [aria-label="Mark as not spam"]') ||
        controlText(control).includes("not spam")
      );
      const directNotSpamButton = [
        control.matches?.('button[data-test-id="toolbar-not-spam"]') ? control : null,
        control.querySelector?.('button[data-test-id="toolbar-not-spam"]'),
        control.matches?.('button[aria-label="Mark as not spam"]') ? control : null,
        control.querySelector?.('button[aria-label="Mark as not spam"]'),
        isNotSpamControl ? document.querySelector('button[data-test-id="toolbar-not-spam"]') : null,
      ].find(isEnabledControl);

      if (directNotSpamButton && clickExactButtonLikeUser(directNotSpamButton)) {
        deps.log("AOL Not Spam direct click fired", "info");
        return true;
      }

      const nestedButton = control.matches?.("button") ? control : control.querySelector?.("button");
      if (nestedButton && isEnabledControl(nestedButton) && clickExactButtonLikeUser(nestedButton)) {
        return true;
      }

      const targets = [
        control,
        control.closest?.("button"),
        control.closest?.('li[role="menuitem"]'),
        control.closest?.('[role="menuitem"]'),
      ].filter(Boolean);

      const uniqueTargets = [...new Set(targets)].filter(isEnabledControl);
      for (const target of uniqueTargets) {
        if (clickLikeUser(target)) {
          await deps.sleep(450);
          return true;
        }
      }

      return false;
    }

    async function waitForMovedFromSpam(maxWait = 15000) {
      const startUrl = window.location.href;
      const start = Date.now();
      const hadMessageView = Boolean(getMessageViewElement());

      while (Date.now() - start < maxWait) {
        const notice = getVisibleNoticeText();
        if (isMoveNoticeText(notice)) {
          return "visible toast";
        }

        if (hadMessageView && !getMessageViewElement()) {
          return "message view disappeared";
        }

        const backButtonStillVisible = isElementVisible(getBackButton());
        const returnedToList = isInMailbox("spam") && getVisibleRows().length > 0 && !backButtonStillVisible;
        const urlReturnedToSpamList =
          window.location.href !== startUrl &&
          /\/d\/folders\/6\/?$/i.test(window.location.pathname);

        if (returnedToList) {
          return "back button disappeared and spam list rows are visible";
        }

        if (urlReturnedToSpamList) {
          return "URL returned to /d/folders/6";
        }

        if (!isNotSpamButtonVisible()) {
          return "Not Spam button no longer visible";
        }

        if (deps.getState() === "stopped") return false;
        await deps.sleep(350);
      }

      return false;
    }

    function getMessageViewElement() {
      return Array.from(document.querySelectorAll('[data-test-id="message-view-body"], [data-test-id="message-view"]'))
        .find(isElementVisible) || null;
    }

    function isNotSpamButtonVisible() {
      return isElementVisible(document.querySelector('button[data-test-id="toolbar-not-spam"]'));
    }

    function isMoveNoticeText(text = "") {
      const normalized = String(text).replace(/\s+/g, " ").trim().toLowerCase();
      if (!normalized) return false;

      return (
        normalized.includes("moved to inbox") ||
        normalized.includes("moved to the inbox") ||
        (normalized.includes("moved") && normalized.includes("inbox")) ||
        (normalized.includes("restored") && normalized.includes("inbox")) ||
        normalized.includes("marked as not spam") ||
        (normalized.includes("not spam") && (normalized.includes("marked") || normalized.includes("moved") || normalized.includes("inbox")))
      );
    }

    function getVisibleNoticeText() {
      const selectors = [
        '[role="alert"]',
        '[role="status"]',
        "[aria-live]",
        '[data-test-id*="notification"]',
        '[data-test-id*="toast"]',
        '[data-test-id*="snackbar"]',
        '[class*="notification"]',
        '[class*="toast"]',
        '[class*="snackbar"]',
      ];

      for (const selector of selectors) {
        const element = Array.from(document.querySelectorAll(selector)).find(isElementVisible);
        const text = element?.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
        if (isMoveNoticeText(text)) {
          return text;
        }
      }

      const candidates = Array.from(document.querySelectorAll("div, span, section, aside"))
        .filter((element) => {
          if (!isElementVisible(element)) return false;
          if (element.closest("button, [role='button'], [role='menuitem'], nav, header")) return false;

          const text = element.textContent?.replace(/\s+/g, " ").trim() || "";
          return text.length > 8 && text.length < 240 && isMoveNoticeText(text);
        });

      if (candidates.length > 0) {
        return candidates[0].textContent.replace(/\s+/g, " ").trim().toLowerCase();
      }

      return "";
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
      movedSpamEmailQueue.push({
        rowId: rowId || "",
        subject: normalizeQueueText(subject),
      });
    }

    function forgetMovedSpamEmail(rowId, subject) {
      const normalizedSubject = normalizeQueueText(subject);
      const index = movedSpamEmailQueue.findIndex((queued) => (
        (rowId && queued.rowId === rowId) ||
        (normalizedSubject && queued.subject && normalizedSubject.includes(queued.subject))
      ));

      if (index >= 0) {
        movedSpamEmailQueue.splice(index, 1);
      } else if (movedSpamEmailQueue.length > 0) {
        movedSpamEmailQueue.shift();
      }
    } 

    function getMovedSpamRowsVisibleInInbox() {
      if (!isProvider() || movedSpamEmailQueue.length === 0) return [];

      return getVisibleRows().filter((row) => {
        const rowId = deps.getEmailRowId(row);
        const subject = normalizeQueueText(deps.getEmailSubject(row));

        return movedSpamEmailQueue.some((queued) => (
          (queued.rowId && rowId === queued.rowId) ||
          (queued.subject && subject && subject.includes(queued.subject))
        ));
      });
    }

    async function moveOpenedSpamEmailToInbox() {
      if (!isProvider()) return false;

      const { button, label } = await findMoveButton();
      if (!button) {
        if (await recoverAlreadyMovedMessageView()) {
          return true;
        }

        deps.log("AOL move button not found: Not Spam and Restore to Inbox are both unavailable.", "warn");
        await clickBackToListIfVisible();
        return false;
      }

      if (label === "Not Spam") {
        deps.log("AOL Not Spam button found", "info");
      }
      deps.log(`Moving safe AOL Spam email to Inbox using ${label}...`, "info");
      const clicked = await clickToolbarControl(button);
      if (!clicked) {
        deps.log(`AOL ${label} button was found but could not be clicked.`, "warn");
        return false;
      }

      if (label === "Not Spam") {
        await deps.sleep(2000);
      }

      deps.log("AOL waiting for move confirmation", "info");
      const moved = await waitForMovedFromSpam(16000);
      if (!moved && label !== "Restore to Inbox") {
        const restoreButton = getRestoreToInboxButton();
        if (restoreButton) {
          deps.log("AOL Not Spam did not complete. Trying Restore to Inbox...", "warn");
          await clickToolbarControl(restoreButton);
          deps.log("AOL waiting for move confirmation", "info");
          const restored = await waitForMovedFromSpam(16000);
          if (restored) {
            deps.log(`AOL move confirmed by ${restored}`, "success");
            return true;
          }
          return false;
        }
      }

      if (!moved) {
        if (isNotSpamButtonVisible()) {
          deps.log("AOL move failed: button still visible after wait", "warn");
        }
        deps.log(`Could not confirm AOL moved this Spam email to Inbox after ${label}.`, "warn");
        return false;
      }

      deps.log(`AOL move confirmed by ${moved}`, "success");
      await clickBackToListIfVisible();
      deps.log("Confirmed safe AOL Spam email moved to Inbox.", "success");
      return true;
    }

    function clearMovedSpamQueue() {
      movedSpamEmailQueue.length = 0;
    }

    function hasMovedSpamQueue() {
      return movedSpamEmailQueue.length > 0;
    }

    function getMovedSpamQueueSize() {
      return movedSpamEmailQueue.length;
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

  window.AolProvider = {
    create: createAolProvider,
  };
})();
