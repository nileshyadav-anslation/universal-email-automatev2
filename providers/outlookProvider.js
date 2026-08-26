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

    function normalizeAccountText(value = "") {
      return String(value).replace(/\s+/g, " ").trim();
    }

    function extractEmail(value = "") {
      const match = String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return match ? match[0].toLowerCase() : null;
    }

    function getOutlookLoginHintUrl(email) {
      return email ? `https://outlook.live.com/mail/?login_hint=${encodeURIComponent(email)}` : "";
    }

    function extractEmailFromUrl(value = "") {
      try {
        const url = new URL(value, window.location.href);
        return extractEmail(url.searchParams.get("login_hint")) ||
          extractEmail(url.searchParams.get("username"));
      } catch (error) {
        return extractEmail(value);
      }
    }

    function extractAccountEmail(account = {}) {
      return extractEmail(`${account.id || ""} ${account.label || ""} ${account.elementHint || ""}`) ||
        extractEmailFromUrl(account.url || "");
    }

    function getSafeSwitchUrl(account = {}, email = "") {
      try {
        const url = new URL(account.url || "", window.location.href);
        if (url.hostname === "outlook.live.com" && url.pathname.startsWith("/mail")) {
          return url.href;
        }
      } catch (error) {
        // Fall through to the generated Outlook URL.
      }

      return getOutlookLoginHintUrl(email);
    }

    function makeAccount(id, label, elementHint = "", url = "") {
      return {
        id,
        label,
        provider: "outlook",
        switchMethod: "provider",
        elementHint,
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
      const currentSecondary = document.querySelector("#mectrl_currentAccount_secondary");
      const currentEmail = extractEmail(currentSecondary?.textContent || currentSecondary?.getAttribute("aria-label") || "");
      if (currentEmail && isVisibleElement(currentSecondary)) return currentEmail;

      const mailboxRoot = Array.from(document.querySelectorAll('[id^="primaryMailboxRoot_"][title]'))
        .find((element) => isVisibleElement(element) && extractEmail(element.getAttribute("title") || ""));
      const mailboxEmail = extractEmail(mailboxRoot?.getAttribute("title") || "");
      if (mailboxEmail) return mailboxEmail;

      const currentLinks = [
        document.querySelector("#mectrl_currentAccount_picture"),
        document.querySelector("#mectrl_viewAccount"),
      ];
      for (const link of currentLinks) {
        const linkEmail = extractEmailFromUrl(link?.href || link?.getAttribute?.("href") || "");
        if (linkEmail) return linkEmail;
      }

      const urlEmail = extractEmailFromUrl(window.location.href);
      if (urlEmail) return urlEmail;

      const profileButton = getProfileButton();
      const profileLabel = normalizeAccountText(
        profileButton?.getAttribute("aria-label") ||
        profileButton?.getAttribute("title") ||
        profileButton?.textContent ||
        ""
      );
      return extractEmail(profileLabel) || extractEmail(document.title);
    }

    function getProfileButton() {
      const selectors = [
        "#mectrl_main_trigger",
        "#owa-me-control-container button",
        "#owa-me-control-container [role='button']",
        "#O365_MainLink_MePhoto",
        '[data-testid="O365_MainLink_MePhoto"]',
        '[data-automationid="O365_MainLink_MePhoto"]',
        'button[aria-label*="Account manager" i]',
        '[aria-label*="Account manager" i]',
        'button[title*="Account manager" i]',
        'button[aria-label*="My account" i]',
        'button[aria-label*="Profile" i]',
        'button[aria-label*="user account" i]',
      ];

      for (const selector of selectors) {
        const button = Array.from(document.querySelectorAll(selector))
          .map((element) => element.closest?.("button, [role='button']") || element)
          .find(isVisibleElement);
        if (button) return button;
      }

      return Array.from(document.querySelectorAll("button, [role='button'], [aria-label], [title]"))
        .find((element) => {
          if (!isVisibleElement(element)) return false;
          const label = getElementLabel(element);
          return label.includes("account") && (label.includes("@") || label.includes("profile") || label.includes("manager"));
        }) || null;
    }

    function getAccountMenuRoots() {
      const meControlBody = document.querySelector("#mectrl_main_body");
      if (isVisibleElement(meControlBody)) return [meControlBody];

      const roots = Array.from(document.querySelectorAll([
        "#mectrl_main_body",
        '[id*="mectrl"][role="dialog"]',
        '[role="dialog"]',
        '[aria-modal="true"]',
        '[data-testid*="account" i]',
        '[data-automationid*="account" i]',
        '[id*="O365" i]',
        '[class*="account" i]',
      ].join(","))).filter((element) => {
        if (!isVisibleElement(element)) return false;
        const text = normalizeAccountText(element.innerText || element.textContent || "");
        return /@/.test(text) || /sign out|account|switch/i.test(text);
      });

      return roots;
    }

    function getAccountElements() {
      const roots = getAccountMenuRoots();
      const elements = [];

      roots.forEach((root) => {
        elements.push(...Array.from(root.querySelectorAll([
          'a[id^="mectrl_rememberedAccount_"][id$="_switch"]',
          'a[href*="login_hint="]',
          "button",
          "a",
          "[role='button']",
          "[role='menuitem']",
        ].join(","))));
      });

      return [...new Set(elements)].filter((element) => {
        if (!isVisibleElement(element)) return false;

        const label = normalizeAccountText(
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.textContent ||
          element.href ||
          ""
        );
        const lower = label.toLowerCase();
        const href = element.href || element.getAttribute("href") || "";
        const email = extractEmail(label) || extractEmailFromUrl(href);

        return Boolean(email) &&
          !lower.includes("current account") &&
          !lower.includes("sign out") &&
          !lower.includes("sign in with a different account") &&
          !lower.includes("remove") &&
          !lower.includes("privacy") &&
          !lower.includes("terms");
      });
    }

    function makeAccountFromElement(element) {
      const label = normalizeAccountText(
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.textContent ||
          ""
      );
      const href = element.href || element.getAttribute("href") || "";
      const email = extractEmail(label) || extractEmailFromUrl(href);
      if (!email) return null;

      return makeAccount(`outlook:${email}`, label || email, label, href || getOutlookLoginHintUrl(email));
    }

    function getAccountsFromDom() {
      const accounts = [];
      const activeEmail = getActiveEmail();

      if (activeEmail) {
        accounts.push(makeAccount(
          `outlook:${activeEmail}`,
          activeEmail,
          activeEmail,
          getOutlookLoginHintUrl(activeEmail)
        ));
      }

      getAccountElements().forEach((element) => {
        const account = makeAccountFromElement(element);
        if (account) accounts.push(account);
      });

      return uniqueAccounts(accounts);
    }

    async function waitForAccountUiReady(maxWait = 12000) {
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        if (getProfileButton() && (getActiveEmail() || document.readyState === "complete")) {
          return true;
        }

        if (deps.getState() === "stopped") return false;
        await deps.sleep(250);
      }

      return Boolean(getProfileButton());
    }

    async function waitForAccountMenuAccounts(maxWait = 7000) {
      const start = Date.now();
      let bestAccounts = [];
      let bestCount = 0;
      let stableSince = Date.now();

      while (Date.now() - start < maxWait) {
        const accounts = getAccountsFromDom();

        if (accounts.length > bestCount) {
          bestAccounts = accounts;
          bestCount = accounts.length;
          stableSince = Date.now();
        }

        if (accounts.length >= 2) {
          return accounts;
        }

        if (accounts.length > 0 && Date.now() - stableSince > 1200 && Date.now() - start > 2500) {
          return accounts;
        }

        if (deps.getState() === "stopped") break;
        await deps.sleep(200);
      }

      return bestAccounts.length ? bestAccounts : getAccountsFromDom();
    }

    async function openAccountMenu() {
      const button = getProfileButton();
      if (!button) return null;

      clickElementLikeUser(button);

      const start = Date.now();
      while (Date.now() - start < 3500) {
        const roots = getAccountMenuRoots();
        if (roots.some((root) => root !== document.body)) return roots[0];
        if (getAccountElements().length > 0) return document.body;
        await deps.sleep(150);
      }

      return null;
    }

    function closeAccountMenu() {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      }));
    }

    function getActiveAccount() {
      const email = getActiveEmail();
      if (!email) return makeAccount("outlook:current", "Current Outlook account", window.location.href);
      return makeAccount(`outlook:${email}`, email, email, getOutlookLoginHintUrl(email));
    }

    function canAutoSwitch() {
      return getAccountElements().length > 1;
    }

    async function discoverAccounts() {
      if (!isProvider()) return [];

      await waitForAccountUiReady();
      await openAccountMenu();
      const accounts = await waitForAccountMenuAccounts();
      closeAccountMenu();

      if (accounts.length <= 1) {
        deps.log("Outlook account switch failed: account must already be signed in and visible in account menu.", "warn");
      }

      return accounts.length ? accounts : [getActiveAccount()];
    }

    function accountMatchesElement(account, element) {
      const elementAccount = makeAccountFromElement(element);
      if (!elementAccount) return false;

      const targetEmail = extractAccountEmail(account);

      return (
        elementAccount.id === account?.id ||
        (targetEmail && elementAccount.id === `outlook:${targetEmail}`)
      );
    }

    async function switchAccount(account) {
      if (!isProvider()) return { ok: false, error: "Outlook account switching is only available in Outlook Mail." };

      await waitForAccountUiReady();
      await openAccountMenu();
      await waitForAccountMenuAccounts();
      const target = getAccountElements().find((element) => accountMatchesElement(account, element));

      if (target) {
        window.setTimeout(() => clickElementLikeUser(target), 50);
        return { ok: true, provider: "outlook", navigating: true };
      }

      const targetEmail = extractAccountEmail(account);
      if (targetEmail) {
        closeAccountMenu();
        window.setTimeout(() => {
          window.location.assign(getSafeSwitchUrl(account, targetEmail));
        }, 50);
        return { ok: true, provider: "outlook", navigating: true };
      }

      deps.log("Outlook account switch failed: account must already be signed in and visible in account menu.", "warn");
      closeAccountMenu();
      return {
        ok: false,
        error: "Outlook account switch failed: account must already be signed in and visible in account menu.",
      };
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
        "it is not junk",
        "this isn't junk",
        "this is not junk",
        "not junk",
        "not a junk",
        "not spam",
        "not a spam",
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

    function getReportButton() {
      const candidates = Array.from(document.querySelectorAll('button, a[role="button"], div[role="button"], [aria-label], [title]'));
      const visibleMatches = candidates.filter((button) => {
        if (!isVisibleEnabledButton(button)) return false;
        const label = getElementLabel(button);
        return label === "report" || label.includes("report junk") || label.includes("report phishing");
      });

      return visibleMatches.find((button) => button.getBoundingClientRect().top < 260) || visibleMatches[0] || null;
    }

    async function findNotJunkButtonWithMenu() {
      let notJunkButton = getNotJunkButton();
      if (notJunkButton) return notJunkButton;

      const moreButton = getMoreButton();
      if (moreButton) {
        clickElementLikeUser(moreButton);
        await deps.sleep(600);
        notJunkButton = getNotJunkButton();
        if (notJunkButton) return notJunkButton;
      }

      const reportButton = getReportButton();
      if (!reportButton) return null;

      clickElementLikeUser(reportButton);
      await deps.sleep(600);
      notJunkButton = getNotJunkButton();

      return notJunkButton;
    }

    // Outlook's confirmation dialog is a Fluent DialogSurface, and Fluent marks
    // that surface aria-hidden="true" even while it is on screen and accepting
    // clicks. isVisibleElement() rejects aria-hidden nodes, so filtering dialog
    // containers with it dropped the live "Report not junk" dialog every time:
    // the OK button was never even looked at, the modal stayed up, and every
    // later click in the tab was blocked by it. Measured live on outlook.live.com:
    // surface 600x154, display:block, visibility:visible, aria-hidden="true",
    // with an enabled OK button inside that is NOT aria-hidden.
    //
    // So judge a dialog container on whether it is actually rendered, and leave
    // the aria-hidden test to the button check below, where it still holds.
    //
    // Opacity is what separates a live dialog from a dead one: Fluent leaves
    // dismissed surfaces mounted at opacity:0 while still reporting
    // display:block, visibility:visible and a full-size box. Without an opacity
    // test this would happily click the OK button of an already-dismissed
    // dialog. checkVisibility({opacityProperty}) also covers ancestor opacity,
    // which a plain getComputedStyle on the surface alone would miss.
    function isRenderedDialogSurface(element) {
      if (!element) return false;

      const rect = element.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return false;
      if (element.hasAttribute("hidden")) return false;

      if (typeof element.checkVisibility === "function") {
        return element.checkVisibility({
          opacityProperty: true,
          visibilityProperty: true,
        });
      }

      const style = window.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    }

    function getRenderedDialogSurfaces() {
      return Array.from(document.querySelectorAll(
        '[role="dialog"], [aria-modal="true"], [role="alertdialog"]'
      )).filter(isRenderedDialogSurface);
    }

    // After "Not junk", Outlook pops a "We won't send messages from X to Junk in
    // the future" dialog with an OK button. It can appear a second or two late,
    // so poll for it instead of checking once — otherwise the message is left
    // stuck behind the modal and the move never completes.
    async function clickPossibleConfirmation(maxWait = 5000) {
      const matches = ["ok", "yes", "got it", "report", "move", "not junk", "confirm"];
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        // Keep polling rather than bailing when nothing is up yet: this is also
        // called straight after the Not junk click, before Outlook has mounted
        // the dialog at all.
        const dialogs = getRenderedDialogSurfaces();

        for (const dialog of dialogs) {
          const buttons = Array.from(dialog.querySelectorAll('button, [role="button"], input[type="button"]'));
          // Prefer an exact "OK"/"Yes" over a substring hit like "OK, got it".
          const confirmButton =
            buttons.find((button) => {
              if (!isVisibleEnabledButton(button)) return false;
              const label = getElementLabel(button).trim();
              return label === "ok" || label === "yes" || label === "confirm";
            }) ||
            buttons.find((button) => {
              if (!isVisibleEnabledButton(button)) return false;
              const label = getElementLabel(button);
              return matches.some((match) => label.includes(match));
            }) ||
            null;

          if (confirmButton) {
            clickElementLikeUser(confirmButton);
            await deps.sleep(500);
            return true;
          }
        }

        if (deps.getState() === "stopped") return false;
        await deps.sleep(300);
      }

      return false;
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
        // A confirmation dialog can surface late, after clickPossibleConfirmation
        // has already returned. If one is up, dismiss it here too — otherwise it
        // blocks the move and this wait would time out.
        //
        // This must use the rendered-surface test, not a bare querySelector.
        // Fluent leaves every dismissed dialog mounted at opacity:0 forever, so
        // a bare selector match stays true for the rest of the page's life — and
        // this branch then re-ran clickPossibleConfirmation(1500) on every single
        // 400ms iteration, rescanning every dialog and button each time. Measured
        // on outlook.live.com that redundant work is cheap (~0.7ms a pass, on an
        // 835-node DOM), so it was never the cause of the tab freezing — but it
        // is still pure waste, and it stretched every confirmation wait.
        if (getRenderedDialogSurfaces().length > 0) {
          await clickPossibleConfirmation(1500);
        }

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

    function getOpenedRowIdFromUrl() {
      const match = window.location.href.match(/\/id\/([^?#]+)/i);
      if (!match) return "";

      try {
        return decodeURIComponent(match[1]);
      } catch (error) {
        return match[1];
      }
    }

    function findOpenedMessageRow(rowId = "") {
      const openedRowId = rowId || getOpenedRowIdFromUrl();
      const rows = getVisibleMessageRows();

      if (openedRowId) {
        const exactRow = rows.find((row) => deps.getEmailRowId(row) === openedRowId);
        if (exactRow) return exactRow;
      }

      return rows.find((row) => row.getAttribute("aria-selected") === "true") || null;
    }

    function rowLooksUnread(row) {
      if (!row) return false;

      const aria = row.getAttribute("aria-label") || "";
      if (/\bunread\b/i.test(aria)) return true;

      return Boolean(getMarkAsReadButton(row));
    }

    function getMarkAsReadButton(row) {
      if (!row) return null;

      const candidates = Array.from(row.querySelectorAll('button, [role="button"], [title], [aria-label]'));
      return candidates.find((candidate) => {
        if (!isVisibleEnabledButton(candidate)) return false;
        const label = getElementLabel(candidate);
        return label.includes("mark as read");
      }) || null;
    }

    function getReadUnreadToolbarButton() {
      return Array.from(document.querySelectorAll('button, [role="button"]')).find((button) => {
        if (!isVisibleEnabledButton(button)) return false;
        const label = getElementLabel(button);
        return label.includes("read / unread");
      }) || null;
    }

    async function waitForRowRead(rowId, row, maxWait = 5000) {
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        const currentRow = row && document.contains(row)
          ? row
          : findOpenedMessageRow(rowId);

        if (currentRow && !rowLooksUnread(currentRow)) {
          return true;
        }

        if (deps.getState() === "stopped") return false;
        await deps.sleep(300);
      }

      return false;
    }

    async function markOpenedEmailRead(rowId = "") {
      if (!isProvider()) return false;

      const row = findOpenedMessageRow(rowId);
      if (!row) {
        deps.log("Outlook opened row not found for mark-as-read.", "warn");
        return false;
      }

      if (!rowLooksUnread(row)) {
        deps.log("Outlook email is already marked read.", "info");
        return true;
      }

      const markReadButton = getMarkAsReadButton(row) || getReadUnreadToolbarButton();
      if (!markReadButton) {
        deps.log("Outlook Mark as read button not found.", "warn");
        return false;
      }

      clickElementLikeUser(markReadButton);

      const markedRead = await waitForRowRead(rowId, row);
      if (markedRead) {
        deps.log("Outlook email marked read.", "success");
      } else {
        deps.log("Outlook email still appears unread after marking read.", "warn");
      }

      return markedRead;
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

  window.OutlookProvider = {
    create: createOutlookProvider,
  };
})();
