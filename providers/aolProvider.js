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
        provider: "aol",
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

      const accountButton = getAccountButton();
      const accountLabel = accountButton?.getAttribute("aria-label") || accountButton?.getAttribute("title") || "";
      const labelEmail = extractEmail(accountLabel);
      if (labelEmail) return labelEmail;

      const loginMatch = accountLabel.match(/\(([^)@\s]+)\)/);
      if (loginMatch) return `${loginMatch[1].toLowerCase()}@aol.com`;

      return null;
    }

    function getEmailFromSwitchUrl(url = "") {
      try {
        const parsed = new URL(url, window.location.href);
        const login = parsed.searchParams.get("login");
        if (login && login.includes("@")) return login.toLowerCase();
        if (login) return `${login.toLowerCase()}@aol.com`;
      } catch (error) {
        return null;
      }

      return null;
    }

    function getAccountButton() {
      const selectors = [
        "#ybarAccountMenu",
        "#ybarAccountMenuOpener",
        "#ybarAccountProfile",
        "#ybarAccountProfile button",
        '[aria-controls="ybarAccountMenuBody"]',
        '[aria-label*="AOL accounts" i]',
        '[aria-label*="account" i]',
        '[title*="account" i]',
      ];

      for (const selector of selectors) {
        const button = Array.from(document.querySelectorAll(selector))
          .map((element) => element.closest?.("button, [role='button']") || element)
          .find(isElementVisible);
        if (button) return button;
      }

      return null;
    }

    function makeAccountFromLink(link) {
      const href = link?.href || "";
      const label = normalizeAccountText(
        link?.getAttribute("aria-label") ||
        link?.getAttribute("title") ||
        link?.textContent ||
        ""
      );
      const email = getEmailFromSwitchUrl(href) || extractEmail(label);

      if (!email) return null;

      return makeAccount(`aol:${email}`, label || email, href);
    }

    function getAccountLinks() {
      return Array.from(document.querySelectorAll([
        '#ybarAccountMenuBody a[href*="login.aol.com/"][href*="login="]',
        '#ybarAccountMenuBody a[href*="login.yahoo.com/"][href*="login="]',
        '#ybarAccountMenuBody a[data-ylk*="acct-switch"]',
        '#ybarAccountMenuBody a[aria-label*="@"]',
      ].join(","))).filter(isElementVisible);
    }

    function getAccountsFromDom() {
      const accounts = [];
      const activeEmail = getActiveEmail();

      if (activeEmail) {
        accounts.push(makeAccount(`aol:${activeEmail}`, activeEmail, window.location.href));
      }

      getAccountLinks().forEach((link) => {
        const account = makeAccountFromLink(link);
        if (account) accounts.push(account);
      });

      return uniqueAccounts(accounts);
    }

    async function openAccountMenu() {
      let body = document.querySelector("#ybarAccountMenuBody");
      if (isElementVisible(body)) return body;

      const button = getAccountButton();
      if (!button) return null;

      const clickTargets = [
        button,
        document.querySelector("#ybarAccountMenuOpener"),
        document.querySelector("#ybarAccountProfile"),
      ].filter(isElementVisible);

      for (const target of clickTargets) {
        clickLikeUser(target);
        await deps.sleep(250);
        body = document.querySelector("#ybarAccountMenuBody");
        if (isElementVisible(body)) return body;
      }

      const start = Date.now();
      while (Date.now() - start < 3000) {
        body = document.querySelector("#ybarAccountMenuBody");
        if (isElementVisible(body)) return body;
        if (getAccountLinks().length > 0) return document.body;
        await deps.sleep(150);
      }

      return null;
    }

    async function revealAccountSwitcher(body) {
      if (!body) return null;

      const switchButton = Array.from(body.querySelectorAll("button, a"))
        .find((element) => /add or switch accounts|switch accounts|manage accounts/i.test(
          normalizeAccountText(element.textContent || element.getAttribute("aria-label") || "")
        ));

      if (switchButton) {
        clickLikeUser(switchButton);
        await deps.sleep(900);
      }

      return document.querySelector("#ybarAccountMenuBody") || document.body;
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
      if (!email) return makeAccount("aol:current", "Current AOL account", window.location.href);
      return makeAccount(`aol:${email}`, email, window.location.href);
    }

    function canAutoSwitch() {
      return getAccountLinks().length > 1;
    }

    async function discoverAccounts() {
      if (!isProvider()) return [];

      await ensureAccountSwitcherOpen();
      const accounts = getAccountsFromDom();
      closeAccountMenu();

      if (accounts.length <= 1) {
        deps.log("AOL requires manual login for this account. Please sign in manually, then restart automation.", "warn");
      }

      return accounts.length ? accounts : [getActiveAccount()];
    }

    function accountMatchesLink(account, link) {
      const linkAccount = makeAccountFromLink(link);
      if (!linkAccount) return false;

      const targetEmail = extractEmail(`${account?.id || ""} ${account?.label || ""} ${account?.url || ""}`);

      return (
        linkAccount.id === account?.id ||
        (targetEmail && linkAccount.id === `aol:${targetEmail}`) ||
        (account?.url && link.href === account.url)
      );
    }

    async function switchAccount(account) {
      if (!isProvider()) return { ok: false, error: "AOL account switching is only available in AOL Mail." };

      await ensureAccountSwitcherOpen();
      const target = getAccountLinks().find((link) => accountMatchesLink(account, link));

      if (!target) {
        deps.log("AOL requires manual login for this account. Please sign in manually, then restart automation.", "warn");
        closeAccountMenu();
        return {
          ok: false,
          error: "AOL requires manual login for this account. Please sign in manually, then restart automation.",
        };
      }

      window.setTimeout(() => clickLikeUser(target), 50);
      return { ok: true, provider: "aol", navigating: true };
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
      let button = getRestoreToInboxButton();
      if (button) return { button, label: "Restore to Inbox" };

      button = getNotSpamButton();
      if (button) return { button, label: "Not Spam" };

      const moreButton = getMoreButton();
      if (moreButton) {
        clickLikeUser(moreButton);
        await deps.sleep(700);
        button = getRestoreToInboxButton();
        if (button) return { button, label: "Restore to Inbox" };

        button = getNotSpamButton();
        if (button) return { button, label: "Not Spam" };
      }

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

    function hasVisibleSpamRow(rowId = "") {
      if (!rowId) return false;

      return getVisibleRows().some((row) => deps.getEmailRowId(row) === rowId);
    }

    async function confirmMovedAfterBack(rowId = "") {
      await clickBackToListIfVisible();
      const returned = await waitForMailbox("spam", 8000);
      const onSpamList = isInMailbox("spam") && !isElementVisible(getBackButton());

      if (!onSpamList && getMessageViewElement()) return false;
      if (!rowId) return returned || onSpamList;
      return !hasVisibleSpamRow(rowId);
    }

    async function waitForMovedFromSpam(rowId = "", maxWait = 15000) {
      const startUrl = window.location.href;
      const start = Date.now();
      const hadMessageView = Boolean(getMessageViewElement());

      while (Date.now() - start < maxWait) {
        const notice = getVisibleNoticeText();
        if (isMoveNoticeText(notice)) {
          return "visible toast";
        }

        if (hadMessageView && !getMessageViewElement()) {
          if (!rowId || !hasVisibleSpamRow(rowId)) {
            return "message view disappeared and row left Spam";
          }
        }

        const backButtonStillVisible = isElementVisible(getBackButton());
        const returnedToList = isInMailbox("spam") && getVisibleRows().length > 0 && !backButtonStillVisible;
        const urlReturnedToSpamList =
          window.location.href !== startUrl &&
          /\/d\/folders\/6\/?$/i.test(window.location.pathname);

        if (returnedToList) {
          if (!rowId || !hasVisibleSpamRow(rowId)) {
            return "back button disappeared and row left Spam";
          }
        }

        if (urlReturnedToSpamList) {
          if (!rowId || !hasVisibleSpamRow(rowId)) {
            return "URL returned to /d/folders/6 and row left Spam";
          }
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

    async function moveOpenedSpamEmailToInbox(rowId = "") {
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

      deps.log(`AOL ${label} button found`, "info");
      deps.log(`Moving safe AOL Spam email to Inbox using ${label}...`, "info");
      const clicked = await clickToolbarControl(button);
      if (!clicked) {
        deps.log(`AOL ${label} button was found but could not be clicked.`, "warn");
        return false;
      }

      deps.log("AOL waiting for move confirmation", "info");
      const moved = await waitForMovedFromSpam(rowId, 18000);
      if (!moved && label !== "Not Spam") {
        const notSpamButton = getNotSpamButton();
        if (notSpamButton) {
          deps.log("AOL Restore to Inbox did not complete. Trying Not Spam...", "warn");
          await clickToolbarControl(notSpamButton);
          deps.log("AOL waiting for move confirmation", "info");
          const notSpamMoved = await waitForMovedFromSpam(rowId, 18000);
          if (notSpamMoved) {
            deps.log(`AOL move confirmed by ${notSpamMoved}`, "success");
            return confirmMovedAfterBack(rowId);
          }
          return confirmMovedAfterBack(rowId);
        }
      }

      if (!moved) {
        if (isNotSpamButtonVisible()) {
          deps.log("AOL move failed: button still visible after wait", "warn");
        }
        deps.log(`Could not confirm AOL moved this Spam email to Inbox after ${label}.`, "warn");
        return confirmMovedAfterBack(rowId);
      }

      deps.log(`AOL move confirmed by ${moved}`, "success");
      const confirmedAfterBack = await confirmMovedAfterBack(rowId);
      if (!confirmedAfterBack) {
        deps.log("AOL move looked successful, but the row is still visible in Spam.", "warn");
        return false;
      }
      deps.log("Confirmed safe AOL Spam email moved to Inbox.", "success");
      return true;
    }

    function getMarkAsReadButton() {
      const selectors = [
        'button[data-test-id="icon-btn-read"]',
        'button[title="Mark as read"]',
        'button[aria-label*="not read" i]',
      ];

      const candidates = Array.from(document.querySelectorAll(selectors.join(",")))
        .map((element) => element.closest?.("button") || element);

      return candidates.find((button) => {
        if (!isEnabledControl(button)) return false;

        const label = controlText(button);
        return (
          label.includes("mark as read") ||
          label.includes("message is not read") ||
          label.includes("not read")
        );
      }) || null;
    }

    async function waitForOpenedMessageRead(maxWait = 5000) {
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        if (!getMarkAsReadButton()) {
          return true;
        }

        if (deps.getState() === "stopped") return false;
        await deps.sleep(300);
      }

      return false;
    }

    async function markOpenedEmailRead() {
      if (!isProvider()) return false;

      const markReadButton = getMarkAsReadButton();
      if (!markReadButton) {
        deps.log("AOL email is already marked read.", "info");
        return true;
      }

      clickExactButtonLikeUser(markReadButton);

      const markedRead = await waitForOpenedMessageRead();
      if (markedRead) {
        deps.log("AOL email marked read.", "success");
      } else {
        deps.log("AOL email still appears unread after marking read.", "warn");
      }

      return markedRead;
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
      markOpenedEmailRead,
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
