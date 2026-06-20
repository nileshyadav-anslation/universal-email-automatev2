(function () {
  "use strict";

  function createYahooProvider(deps) {
    const movedSpamEmailQueue = new Map();

    function isProvider() {
      const provider = deps.getProvider();
      return Boolean(provider && provider.host && provider.host.includes("yahoo"));
    }

    function getMailboxUrl(folder = "inbox") {
      const yahooFolders = {
        inbox: "1",
        spam: "6",
      };
      const folderId = yahooFolders[folder] || yahooFolders.inbox;
      return `https://mail.yahoo.com/n/folders/${folderId}?.src=ym&reason=myc`;
    }

    function getFolderId(folder = "inbox") {
      const yahooFolders = {
        inbox: "1",
        spam: "6",
      };
      return yahooFolders[folder] || yahooFolders.inbox;
    }

    function getFolderLabel(folder = "inbox") {
      return folder === "spam" ? "spam" : "inbox";
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
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      );
    }

    function clickElementLikeUser(element) {
      if (!element) return false;

      element.scrollIntoView({ block: "center", inline: "center" });
      try {
        element.focus({ preventScroll: true });
      } catch (error) {
        // Some Yahoo controls are not focusable.
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

    function normalizeAccountText(value = "") {
      return String(value).replace(/\s+/g, " ").trim();
    }

    function extractEmail(value = "") {
      const match = String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return match ? match[0].toLowerCase() : null;
    }

    function makeAccount(id, label, url = null) {
      return {
        id,
        label,
        provider: "yahoo",
        switchMethod: "provider",
        url,
      };
    }

    function uniqueAccounts(accounts) {
      const seen = new Set();
      return accounts.filter((account) => {
        if (!account?.id || seen.has(account.id)) return false;
        seen.add(account.id);
        return true;
      });
    }

    function getActiveEmail() {
      const titleEmail = extractEmail(document.title);
      if (titleEmail) return titleEmail;

      const accountButton = document.querySelector("#ybarAccountMenu");
      const accountLabel = accountButton?.getAttribute("aria-label") || "";
      const loginMatch = accountLabel.match(/\(([^)@\s]+)\)/);
      if (loginMatch) return `${loginMatch[1].toLowerCase()}@yahoo.com`;

      return null;
    }

    function getEmailFromSwitchUrl(url = "") {
      try {
        const parsed = new URL(url, window.location.href);
        const login = parsed.searchParams.get("login");
        if (login && login.includes("@")) return login.toLowerCase();
        if (login) return `${login.toLowerCase()}@yahoo.com`;
      } catch (error) {
        return null;
      }

      return null;
    }

    function makeAccountFromLink(link) {
      const href = link?.href || "";
      const label = normalizeAccountText(
        link?.getAttribute("aria-label") ||
        link?.textContent ||
        ""
      );
      const email = getEmailFromSwitchUrl(href) || extractEmail(label);

      if (!email) return null;

      return makeAccount(`yahoo:${email}`, label || email, href);
    }

    function getAccountLinks() {
      return Array.from(document.querySelectorAll(
        '#ybarAccountMenuBody a[href*="login.yahoo.com/"][href*="login="]'
      ));
    }

    function getAccountsFromDom() {
      const accounts = [];
      const activeEmail = getActiveEmail();

      if (activeEmail) {
        accounts.push(makeAccount(`yahoo:${activeEmail}`, activeEmail, window.location.href));
      }

      getAccountLinks().forEach((link) => {
        const account = makeAccountFromLink(link);
        if (account) accounts.push(account);
      });

      return uniqueAccounts(accounts);
    }

    async function openAccountMenu() {
      const button = document.querySelector("#ybarAccountMenu");
      if (!button) return null;

      let body = document.querySelector("#ybarAccountMenuBody");
      if (isVisibleElement(body)) return body;

      for (const eventType of ["mouseover", "mouseenter", "mousemove", "mousedown", "mouseup", "click"]) {
        button.dispatchEvent(new MouseEvent(eventType, {
          bubbles: true,
          cancelable: true,
          view: window,
        }));
        await deps.sleep(80);
      }

      const start = Date.now();
      while (Date.now() - start < 2500) {
        body = document.querySelector("#ybarAccountMenuBody");
        if (isVisibleElement(body)) return body;
        await deps.sleep(100);
      }

      return null;
    }

    async function revealAccountSwitcher(body) {
      if (!body) return null;

      const switchButton = Array.from(body.querySelectorAll("button, a"))
        .find((element) => /add or switch accounts/i.test(
          normalizeAccountText(element.textContent || element.getAttribute("aria-label") || "")
        ));

      if (switchButton) {
        clickElementLikeUser(switchButton);
      }

      const start = Date.now();
      while (Date.now() - start < 2500) {
        const accountLinks = getAccountLinks();
        if (accountLinks.length > 1 && accountLinks.some(isVisibleElement)) {
          return document.querySelector("#ybarAccountMenuBody");
        }
        await deps.sleep(100);
      }

      return document.querySelector("#ybarAccountMenuBody");
    }

    function closeAccountMenu() {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      }));
    }

    async function ensureAccountSwitcherOpen() {
      const menuBody = await openAccountMenu();
      return revealAccountSwitcher(menuBody);
    }

    function getActiveAccount() {
      const email = getActiveEmail();
      if (!email) return makeAccount("yahoo:current", "Current Yahoo account", window.location.href);
      return makeAccount(`yahoo:${email}`, email, window.location.href);
    }

    function canAutoSwitch() {
      return getAccountLinks().length > 1;
    }

    async function discoverAccounts() {
      if (!isProvider()) return [];

      let accounts = getAccountsFromDom();
      if (accounts.length > 1) {
        closeAccountMenu();
        return accounts;
      }

      await ensureAccountSwitcherOpen();
      accounts = getAccountsFromDom();
      closeAccountMenu();

      if (accounts.length <= 1) {
        deps.log("Yahoo account switch failed: account must already be signed in and visible in account menu.", "warn");
      }

      return accounts.length ? accounts : [getActiveAccount()];
    }

    function accountMatchesLink(account, link) {
      const linkAccount = makeAccountFromLink(link);
      if (!linkAccount) return false;

      const targetId = account?.id || "";
      const targetEmail = extractEmail(`${account?.id || ""} ${account?.label || ""} ${account?.url || ""}`);

      return (
        linkAccount.id === targetId ||
        (targetEmail && linkAccount.id === `yahoo:${targetEmail}`) ||
        (account?.url && link.href === account.url)
      );
    }

    async function switchAccount(account) {
      if (!isProvider()) return { ok: false, error: "Yahoo account switching is only available in Yahoo Mail." };

      await ensureAccountSwitcherOpen();
      const target = getAccountLinks().find((link) => accountMatchesLink(account, link));

      if (!target) {
        deps.log("Yahoo account switch failed: account must already be signed in and visible in account menu.", "warn");
        closeAccountMenu();
        return {
          ok: false,
          error: "Yahoo account switch failed: account must already be signed in and visible in account menu.",
        };
      }

      window.setTimeout(() => clickElementLikeUser(target), 50);
      return { ok: true, provider: "yahoo", navigating: true };
    }

    function findFolderControl(folder = "inbox") {
      const folderId = getFolderId(folder);
      const folderLabel = getFolderLabel(folder);
      const candidates = Array.from(document.querySelectorAll([
        `a[href*="/folders/${folderId}"]`,
        `[data-test-folder-name="${folderLabel}"]`,
        `[data-test-folder-name="${folderLabel[0].toUpperCase()}${folderLabel.slice(1)}"]`,
        "a",
        "button",
        '[role="button"]',
        '[role="link"]',
      ].join(",")));

      return candidates.find((candidate) => {
        if (!isVisibleElement(candidate)) return false;

        const href = candidate.getAttribute("href") || "";
        if (href.includes(`/folders/${folderId}`)) return true;

        const label = `${candidate.getAttribute("aria-label") || ""} ${candidate.getAttribute("title") || ""} ${candidate.textContent || ""}`
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

        return label === folderLabel || label.startsWith(`${folderLabel} `);
      }) || null;
    }

    function isInMailbox(folder = "inbox") {
      const folderId = getFolderId(folder);
      const folderLabel = getFolderLabel(folder);
      const url = window.location.href.toLowerCase();

      return (
        url.includes(`/folders/${folderId}`) ||
        url.includes(`keyword=${folderLabel}`) ||
        document.querySelector(`[aria-current="page"][href*="/folders/${folderId}"]`) ||
        document.querySelector(`[aria-selected="true"][href*="/folders/${folderId}"]`)
      );
    }

    function getCurrentMailbox() {
      if (isInMailbox("spam")) return { folder: "spam", label: "Spam" };
      if (isInMailbox("inbox")) return { folder: "inbox", label: "Inbox" };

      const url = window.location.href.toLowerCase();
      if (url.includes("/folders/6") || url.includes("keyword=spam")) {
        return { folder: "spam", label: "Spam" };
      }

      return { folder: "inbox", label: "Inbox" };
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
        document.querySelector('[title="Back"]') ||
        Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Back") ||
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
      const folderControl = findFolderControl(folder);
      const backButton = getBackButton();

      if (backButton && isInMailbox(folder)) {
        clickElementLikeUser(backButton);
      } else if (folderControl) {
        clickElementLikeUser(folderControl);
      } else if (!window.location.href.startsWith(targetUrl.split("?")[0])) {
        window.location.assign(targetUrl);
      }

      const ready = await waitForMailbox(folder, 20000);
      await deps.sleep(900);
      return ready;
    }

    function isVisibleEnabledButton(button) {
      if (!button || button.offsetParent === null) return false;

      const rect = button.getBoundingClientRect();
      const disabled =
        button.getAttribute("aria-disabled") === "true" ||
        button.getAttribute("disabled") !== null ||
        button.disabled === true;

      return rect.width > 0 && rect.height > 0 && !disabled;
    }

    function findVisibleButtonByText(textMatches = []) {
      const matches = textMatches.map((text) => text.toLowerCase());
      const candidates = Array.from(document.querySelectorAll('button, a[role="button"], div[role="button"], [role="menuitem"], [aria-label], [title], [data-test-id]'));

      return candidates.find((button) => {
        if (!isVisibleEnabledButton(button)) return false;
        const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""} ${button.textContent || ""}`.toLowerCase();
        return matches.some((match) => label.includes(match));
      }) || null;
    }

    function getNotSpamButton() {
      const restoreButton = Array.from(document.querySelectorAll('button[aria-label], button[title], [role="button"][aria-label], [role="button"][title]'))
        .find((button) => {
          if (!isVisibleEnabledButton(button)) return false;

          const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""}`
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

          return label === "restore to inbox" || label === "move to inbox";
        });

      return restoreButton || findVisibleButtonByText([
        "restore to inbox",
        "move to inbox",
        "not spam",
        "not junk",
        "mark as not spam",
        "mark as not junk",
      ]);
    }

    function getMoreButton() {
      const candidates = Array.from(document.querySelectorAll('button, a[role="button"], div[role="button"], [aria-label], [title], [data-test-id]'));
      const visibleMatches = candidates.filter((button) => {
        if (!isVisibleEnabledButton(button)) return false;

        const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""} ${button.textContent || ""}`
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

        return label === "more" || label.includes("more options") || label.includes("more actions");
      });

      return visibleMatches.find((button) => button.getBoundingClientRect().top < 240) || visibleMatches[0] || null;
    }

    async function findNotSpamButtonWithMenu() {
      let notSpamButton = getNotSpamButton();
      if (notSpamButton) return notSpamButton;

      const moreButton = getMoreButton();
      if (!moreButton) return null;

      clickElementLikeUser(moreButton);
      await deps.sleep(500);
      notSpamButton = getNotSpamButton();

      return notSpamButton;
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

    async function waitForMoveConfirmation(maxWait = 10000) {
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        const noticeText = getVisibleTextFromSelectors([
          '[role="alert"]',
          "[aria-live]",
          '[data-test-id*="notification"]',
          '[data-test-id*="toast"]',
        ]).toLowerCase();

        if (
          noticeText.includes("moved to inbox") ||
          noticeText.includes("moved to the inbox") ||
          noticeText.includes("marked as not spam") ||
          noticeText.includes("marked as not junk")
        ) {
          return true;
        }

        const notSpamStillVisible = Boolean(getNotSpamButton());
        const mailboxVisible = hasVisibleMailboxRows();

        if (!notSpamStillVisible || mailboxVisible) {
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
        const usableRows = rows.filter((row) => {
          const rect = row.getBoundingClientRect();
          const style = window.getComputedStyle(row);
          return (
            rect.height > 0 &&
            rect.width > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            !row.hasAttribute("hidden") &&
            row.getAttribute("aria-hidden") !== "true"
          );
        });

        if (usableRows.length > 0) return usableRows;
      }

      return [];
    }

    function getMovedSpamRowsVisibleInInbox() {
      if (!isProvider() || movedSpamEmailQueue.size === 0) return [];

      const rows = getRowsBySelectors(deps.getProvider().inboxSelectors);
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

      const notSpamButton = await findNotSpamButtonWithMenu();
      if (!notSpamButton) {
        deps.log("Could not find Yahoo Not spam button. Spam email was processed but not moved.", "warn");
        return false;
      }

      deps.log("Moving safe Yahoo Spam email to Inbox using Not spam...", "info");
      clickElementLikeUser(notSpamButton);

      const moved = await waitForMoveConfirmation(15000);
      if (!moved) {
        deps.log("Could not confirm Yahoo moved this Spam email to Inbox after clicking Not spam.", "warn");
        return false;
      }

      deps.log("Confirmed safe Yahoo Spam email moved to Inbox.", "success");
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
      ];
    }

    return {
      isProvider,
      discoverAccounts,
      switchAccount,
      getActiveAccount,
      canAutoSwitch,
      getMailboxUrl,
      navigateMailbox,
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

  window.YahooProvider = {
    create: createYahooProvider,
  };
})();
