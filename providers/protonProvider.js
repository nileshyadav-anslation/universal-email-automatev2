// ProtonProvider - Proton Mail (mail.proton.me) mailbox behaviour.
//
// Selectors here were read off a live, logged-in Proton Mail tab rather than
// guessed. Two things make Proton different from the other four providers:
//
// 1. The opened message body lives in <iframe data-testid="content-iframe">.
//    The main document's .message-content wrapper contains NO links, so link
//    extraction and the safe-link check must read the iframe's contentDocument.
//    The iframe is src="about:blank" with sandbox="allow-same-origin", so it
//    inherits the page origin and IS reachable - no all_frames manifest change.
//
// 2. Accounts are per-URL-index (/u/1/, /u/2/, ...) exactly like Gmail's
//    /mail/u/N/, so switching is a navigation, not an in-page menu. That is
//    handled in background.js (getSwitchUrl / usesProviderContentSwitch), not
//    here.
(function () {
  "use strict";

  function createProtonProvider(deps) {
    const movedSpamEmailQueue = new Map();

    const ROW_SELECTORS = [
      '[data-shortcut-target="item-container"]',
      "div.item-container--row",
      "div.item-container",
      '[data-testid^="message-item:"]',
    ];

    const LIST_READY_SELECTORS = [
      '[data-testid="message-list-loaded"]',
      "section.items-column-list",
      '[aria-label="Message list"]',
    ];

    // Proton renames these occasionally and Spam was empty when this was read
    // live, so the move-out-of-spam control is matched by a wide candidate list
    // and then by visible text, the same defensive shape aolProvider uses.
    const NOT_SPAM_SELECTORS = [
      // Read out of Proton's own WebClients source. The header button is listed
      // first deliberately: the toolbar variant renders null unless a row is
      // selected, and collapses into the More menu at narrow widths.
      '[data-testid="message-header-expanded:move-spam-to-inbox"]',
      '[data-testid="toolbar:movetonospam"]',
      '[data-testid="toolbar:nospam"]',
      '[data-testid="toolbar:movetoinbox"]',
      '[data-testid="toolbar:not-spam"]',
      '[data-testid="toolbar:moveto-inbox"]',
      'button[title="Move to inbox"]',
      'button[title="Not spam"]',
      'button[aria-label="Move to inbox"]',
      'button[aria-label="Not spam"]',
    ];

    const NOT_SPAM_TEXT = ["move to inbox", "not spam", "mark as not spam", "no spam"];

    function isProvider() {
      const provider = deps.getProvider();
      return Boolean(provider && provider.host && provider.host.includes("proton"));
    }

    // ---- URLs -----------------------------------------------------------

    function getAccountIndex() {
      const match = window.location.pathname.match(/^\/u\/(\d+)(?:\/|$)/);
      return match ? parseInt(match[1], 10) : 0;
    }

    function getMailboxUrl(folder = "inbox") {
      const index = getAccountIndex();
      const base = `https://mail.proton.me/u/${index}`;

      if (folder === "spam") return `${base}/spam`;
      if (folder === "promotions") return `${base}/inbox#category=promotions`;
      if (folder === "social") return `${base}/inbox#category=social`;
      if (folder === "newsletters") return `${base}/inbox#category=newsletters`;
      return `${base}/inbox#category=primary`;
    }

    function getCurrentFolder() {
      const path = window.location.pathname;
      if (/\/spam(?:\/|$)/.test(path)) return "spam";
      const category = (window.location.hash.match(/category=([a-z]+)/i) || [])[1];
      if (category && category.toLowerCase() !== "primary") return category.toLowerCase();
      return "inbox";
    }

    // ---- DOM helpers ----------------------------------------------------

    function isVisibleElement(element) {
      if (!element) return false;

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getAttribute("aria-hidden") !== "true"
      );
    }

    function isEnabledControl(element) {
      if (!element) return false;
      return (
        element.disabled !== true &&
        element.getAttribute("disabled") === null &&
        element.getAttribute("aria-disabled") !== "true"
      );
    }

    function clickLikeUser(element) {
      if (!element) return false;

      element.scrollIntoView({ block: "center", inline: "center" });
      try {
        element.focus();
      } catch (error) {
        // Some Proton toolbar controls are not focusable.
      }

      ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup"].forEach((eventName) => {
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

      if (typeof element.click === "function") {
        element.click();
      } else {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, button: 0 }));
      }

      return true;
    }

    function findControlBySelectors(selectors = []) {
      for (const selector of selectors) {
        const element = Array.from(document.querySelectorAll(selector))
          .find((candidate) => isVisibleElement(candidate) && isEnabledControl(candidate));
        if (element) return element;
      }

      return null;
    }

    function findControlByText(matches = []) {
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], a[href]'));

      return candidates.find((element) => {
        if (!isVisibleElement(element) || !isEnabledControl(element)) return false;
        const label = [
          element.getAttribute("aria-label") || "",
          element.getAttribute("title") || "",
          element.textContent || "",
        ].join(" ").toLowerCase();
        return matches.some((match) => label.includes(match));
      }) || null;
    }

    function getVisibleRows() {
      for (const selector of ROW_SELECTORS) {
        const rows = Array.from(document.querySelectorAll(selector)).filter(isVisibleElement);
        if (rows.length) return rows;
      }

      return [];
    }

    function hasListLoaded() {
      return LIST_READY_SELECTORS.some((selector) => {
        const element = document.querySelector(selector);
        return element && isVisibleElement(element);
      });
    }

    function getBackButton() {
      return findControlBySelectors([
        '[data-testid="toolbar:back-button"]',
        'button[aria-label="Back"]',
        'button[title="Back"]',
      ]);
    }

    // ---- The iframe body ------------------------------------------------

    // The opened message body is inside <iframe data-testid="content-iframe">.
    // Returns that iframe's <body>, which is where the real links are. Falls
    // back to the main-document wrapper so callers always get something.
    function getOpenedBodyRoot() {
      if (!isProvider()) return null;

      const frames = Array.from(document.querySelectorAll(
        'iframe[data-testid="content-iframe"], iframe[title="Email content"]'
      ));

      for (const frame of frames) {
        const rect = frame.getBoundingClientRect();
        if (rect.height <= 0 || rect.width <= 0) continue;

        let frameDocument = null;
        try {
          frameDocument = frame.contentDocument;
        } catch (error) {
          // Cross-origin. Proton's body frame is about:blank + allow-same-origin
          // so this should not happen, but never let it throw into the loop.
          frameDocument = null;
        }

        if (frameDocument && frameDocument.body) {
          return frameDocument.body;
        }
      }

      return document.querySelector('[data-testid="message-content:body"], .message-content') || null;
    }

    // ---- Navigation -----------------------------------------------------

    async function waitForMailbox(folder = "inbox", maxWait = 20000) {
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        if (hasListLoaded() && getCurrentFolder() === folder) return true;
        if (deps.getState() === "stopped") return false;
        await deps.sleep(400);
      }

      return hasListLoaded();
    }

    // Proton's own sidebar links, which route through its router in place.
    // Spam/Archive/Trash and the category links are collapsed behind a "More"
    // toggle on first load and must be revealed before they exist in the DOM.
    const NAV_LINK_TESTIDS = {
      inbox: "navigation-link:inbox",
      spam: "navigation-link:spam",
      promotions: "navigation-link:promotions",
      social: "navigation-link:social",
      newsletters: "navigation-link:newsletters",
    };

    function getMoreFoldersToggle() {
      return Array.from(document.querySelectorAll("button")).find((button) => (
        button.getAttribute("aria-expanded") !== null &&
        /^(more|less)$/i.test((button.innerText || "").trim())
      )) || null;
    }

    async function expandFolderList() {
      const toggle = getMoreFoldersToggle();
      if (!toggle || toggle.getAttribute("aria-expanded") === "true") return;

      clickLikeUser(toggle);
      await deps.sleep(700);
    }

    function getNavLink(folder) {
      const testId = NAV_LINK_TESTIDS[folder];
      if (!testId) return null;

      const element = document.querySelector(`[data-testid="${testId}"]`);
      return element && isVisibleElement(element) ? element : null;
    }

    async function navigateMailbox(folder = "inbox") {
      if (!isProvider()) return true;

      if (getCurrentFolder() === folder && hasListLoaded()) {
        await deps.sleep(600);
        return true;
      }

      // Click Proton's own link so its router handles the change in place.
      // Assigning location.href here would be a FULL PAGE LOAD, which tears
      // down this content script mid-run - that is what made the automation
      // stop dead at "Checking Proton Spam". Gmail gets away with location.href
      // only because its folders differ by #hash alone.
      let link = getNavLink(folder);

      if (!link) {
        await expandFolderList();
        link = getNavLink(folder);
      }

      if (link) {
        clickLikeUser(link);
      } else {
        const targetUrl = getMailboxUrl(folder);
        const targetPath = new URL(targetUrl).pathname;
        const targetHash = new URL(targetUrl).hash;

        if (window.location.pathname === targetPath) {
          // Same path, category-only change: a hash change routes without a load.
          window.location.hash = targetHash;
        } else {
          deps.log(
            `Could not find the Proton ${folder} link in the sidebar. Falling back to a full page load, which will end this run.`,
            "warn"
          );
          window.location.href = targetUrl;
          return false;
        }
      }

      const ready = await waitForMailbox(folder, 20000);
      await deps.sleep(1200);
      return ready;
    }

    function getMailboxes() {
      // Mirrors the Gmail shape: Spam first so anything safe is lifted into the
      // Inbox before the Inbox pass, then Promotions (where bulk senders land),
      // then Inbox.
      return [
        { folder: "spam", label: "Spam" },
        { folder: "promotions", label: "Promotions" },
        { folder: "inbox", label: "Inbox" },
      ];
    }

    // ---- Safety ---------------------------------------------------------

    function emailLooksSafe(root) {
      const scope = root || getOpenedBodyRoot() || document;
      const anchors = Array.from(scope.querySelectorAll ? scope.querySelectorAll("a[href]") : []);

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

        let protocol = "";
        try {
          protocol = new URL(normalizedUrl).protocol;
        } catch (error) {
          continue;
        }

        if (["http:", "https:"].includes(protocol) && !window.LinkProcessor.isSafeLink(normalizedUrl)) {
          return false;
        }
      }

      return true;
    }

    // ---- Moved-spam queue ------------------------------------------------

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

    function getMovedSpamRowsVisibleInInbox() {
      if (!isProvider() || movedSpamEmailQueue.size === 0) return [];

      return getVisibleRows().filter((row) => {
        const rowId = deps.getEmailRowId(row);
        const subject = normalizeQueueText(deps.getEmailSubject(row));

        for (const queued of movedSpamEmailQueue.values()) {
          if (queued.rowId && rowId === queued.rowId) return true;
          if (queued.subject && subject && subject.includes(queued.subject)) return true;
        }

        return false;
      });
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

    // ---- Spam -> Inbox ---------------------------------------------------

    function isOpenedMessageView() {
      return Boolean(
        document.querySelector('[data-shortcut-target="message-container"]') ||
        document.querySelector('[data-testid^="message-view-"]')
      );
    }

    async function waitForMovedFromSpam(maxWait = 12000) {
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        // Proton closes the reading pane and returns to the Spam list once the
        // message is moved, so the opened view disappearing is the signal.
        if (!isOpenedMessageView()) return true;

        const stillHasControl = Boolean(
          findControlBySelectors(NOT_SPAM_SELECTORS) || findControlByText(NOT_SPAM_TEXT)
        );
        if (!stillHasControl && hasListLoaded()) return true;

        if (deps.getState() === "stopped") return false;
        await deps.sleep(400);
      }

      return false;
    }

    async function moveOpenedSpamEmailToInbox() {
      if (!isProvider()) return false;

      const control =
        findControlBySelectors(NOT_SPAM_SELECTORS) ||
        findControlByText(NOT_SPAM_TEXT);

      if (!control) {
        deps.log("Could not find Proton 'Move to inbox' control. Spam email was processed but not moved.", "warn");
        return false;
      }

      deps.log("Moving safe Proton Spam email to Inbox...", "info");
      clickLikeUser(control);

      const moved = await waitForMovedFromSpam(12000);
      if (!moved) {
        deps.log("Could not confirm Proton moved this Spam email to Inbox.", "warn");
        return false;
      }

      deps.log("Confirmed safe Proton Spam email moved to Inbox.", "success");
      return true;
    }

    // ---- Accounts --------------------------------------------------------

    // Proton switches accounts by URL index, so background.js drives the switch.
    // This only reports which account the tab is currently showing, read from
    // the user dropdown's title ("name <email>") with the tab title as fallback.
    function getActiveEmail() {
      const dropdown = document.querySelector('[data-testid="heading:userdropdown"]');
      const title = dropdown?.getAttribute("title") || "";
      const fromTitle = title.match(/<([^>]+@[^>]+)>/)?.[1];
      if (fromTitle) return fromTitle.trim();

      const fromText = (dropdown?.textContent || "").match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
      if (fromText) return fromText.trim();

      return (document.title.match(/\|\s*([\w.+-]+@[\w.-]+\.\w+)\s*\|/) || [])[1] || "";
    }

    function makeAccount(index, email) {
      return {
        id: `proton:${index}`,
        label: email || `Proton account ${index}`,
        email: email || "",
        index,
        provider: "proton",
        url: `https://mail.proton.me/u/${index}/inbox`,
      };
    }

    function getActiveAccount() {
      return makeAccount(getAccountIndex(), getActiveEmail());
    }

    function getAccountMenuButton() {
      return document.querySelector('[data-testid="heading:userdropdown"]');
    }

    // Proton keeps [data-testid="sessions:other-accounts"] mounted after the
    // dropdown closes, so the panel's presence says nothing about open state -
    // only aria-expanded does. Discovery below therefore never gates on this;
    // it reads the session links first and only opens the menu if it found
    // none (the panel is genuinely absent until the menu is opened once).
    function isAccountMenuOpen() {
      return getAccountMenuButton()?.getAttribute("aria-expanded") === "true";
    }

    async function openAccountMenu() {
      if (isAccountMenuOpen()) return true;

      // Proton is a SPA, so on a freshly navigated tab the header button lands
      // after the document is already "complete". Giving up on the first miss
      // is why discovery could come back with only the current account.
      let button = getAccountMenuButton();
      for (let attempt = 0; attempt < 16 && !button; attempt += 1) {
        await deps.sleep(400);
        button = getAccountMenuButton();
      }

      if (!button) return false;

      clickLikeUser(button);

      for (let attempt = 0; attempt < 12; attempt += 1) {
        await deps.sleep(250);
        if (isAccountMenuOpen()) return true;
      }

      return isAccountMenuOpen();
    }

    function closeAccountMenu() {
      const button = getAccountMenuButton();
      if (button && button.getAttribute("aria-expanded") === "true") {
        clickLikeUser(button);
        return;
      }

      document.body.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true,
      }));
    }

    // The other signed-in sessions are bare `/u/N` links (no path after the
    // index) inside [data-testid="sessions:other-accounts"]. Every other /u/N
    // link on the page - Inbox, Drafts, the category tabs, the storage meter -
    // carries a path or points at account.proton.me, which is why the generic
    // DOM scraper picked up "Manage your folders" and the storage bar as if
    // they were accounts.
    function getSwitchableAccountsFromDom() {
      const scope = document.querySelector('[data-testid="sessions:other-accounts"]') || document;
      const accounts = [];

      Array.from(scope.querySelectorAll("a[href]")).forEach((anchor) => {
        const href = anchor.getAttribute("href") || "";
        const match = href.match(/^\/u\/(\d+)$/);
        if (!match) return;

        const text = (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim();
        const email = (text.match(/[\w.+-]+@[\w.-]+\.\w+/) || [])[0] || "";
        accounts.push(makeAccount(parseInt(match[1], 10), email));
      });

      return accounts;
    }

    function uniqueAccounts(accounts) {
      const seen = new Set();
      return accounts.filter((account) => {
        if (!account || !account.id || seen.has(account.id)) return false;
        seen.add(account.id);
        return true;
      });
    }

    async function discoverAccounts() {
      if (!isProvider()) return [];

      const active = getActiveAccount();

      // The panel survives a close, so try reading it before touching the UI.
      let others = getSwitchableAccountsFromDom();

      if (!others.length) {
        const opened = await openAccountMenu();

        if (!opened) {
          deps.log("Could not open the Proton account menu; only the current account is available.", "warn");
          return [active];
        }

        // The session list renders a beat after the panel does.
        for (let attempt = 0; attempt < 8 && !others.length; attempt += 1) {
          await deps.sleep(300);
          others = getSwitchableAccountsFromDom();
        }

        closeAccountMenu();
        await deps.sleep(300);
      }

      const all = uniqueAccounts([active, ...others]).sort((a, b) => a.index - b.index);
      deps.log(`Detected ${all.length} Proton account(s).`, all.length > 1 ? "success" : "info");
      return all;
    }

    function canAutoSwitch() {
      return true;
    }

    return {
      isProvider,
      getMailboxUrl,
      getMailboxes,
      navigateMailbox,
      emailLooksSafe,
      rememberMovedSpamEmail,
      forgetMovedSpamEmail,
      getMovedSpamRowsVisibleInInbox,
      moveOpenedSpamEmailToInbox,
      clearMovedSpamQueue,
      hasMovedSpamQueue,
      getMovedSpamQueueSize,
      // Proton-only extras consumed by content.js.
      getOpenedBodyRoot,
      getBackButton,
      getNavLink,
      expandFolderList,
      getAccountIndex,
      getActiveAccount,
      discoverAccounts,
      canAutoSwitch,
      getCurrentFolder,
    };
  }

  window.ProtonProvider = {
    create: createProtonProvider,
  };
})();
