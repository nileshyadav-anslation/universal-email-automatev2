// ComposeEngine — opens a provider compose window and sends one new email.
// Mirrors replyEngine.js structure and reuses its DOM/typing helpers so that
// WarmTalk sends look identical to the human-paced replies we already send.
(function () {
  "use strict";

  const COMPOSE_SELECTORS = {
    gmail: {
      composeButtons: [
        'div[role="button"][gh="cm"]',
        'div[role="button"][aria-label="Compose"]',
        '.T-I.T-I-KE.L3',
        '[aria-label="Compose"]',
      ],
      toFields: [
        'input[aria-label="To recipients"]',
        'input[peoplekit-id="BbVjBd"]',
        'textarea[name="to"]',
        'input[name="to"]',
        'div[aria-label="To recipients"] input',
      ],
      subjectFields: [
        'input[name="subjectbox"]',
        'input[aria-label="Subject"]',
      ],
      bodyFields: [
        'div[aria-label="Message Body"][contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"][aria-label*="Message"]',
      ],
      sendButtons: [
        'div[role="button"][aria-label^="Send"]',
        'div[data-tooltip^="Send"]',
        '[data-tooltip^="Send"]',
      ],
      discardButtons: [
        'div[role="button"][aria-label="Discard draft"]',
        '[data-tooltip="Discard draft"]',
      ],
      // Recipient chips need an explicit commit key in Gmail.
      commitRecipient: true,
      // Gmail's compose button is reliable; the "c" shortcut only works if the
      // user enabled keyboard shortcuts, so keep it as a fallback.
      composeShortcut: 'c',
      preferShortcut: false,
    },
    yahoo: {
      composeButtons: [
        'a[data-test-id="compose-button"]',
        'button[data-test-id="compose-button"]',
        '[data-test-id="compose-button"]',
        'a[aria-label*="Compose"]',
      ],
      toFields: [
        'input[data-test-id="compose-to"]',
        'input#message-to-field',
        '#message-to-field',
        'input[aria-label="To"]',
        'input[placeholder="To"]',
        'input[aria-label*="To"]',
        'div[data-test-id="compose-recipient"] input',
      ],
      subjectFields: [
        'input[data-test-id="compose-subject"]',
        'input#message-subject-field',
        '#message-subject-field',
        'input[placeholder="Subject"]',
        'input[aria-label="Subject"]',
        'input[placeholder*="Subject"]',
        'input[aria-label*="Subject"]',
      ],
      bodyFields: [
        'div[data-test-id="rte"]',
        'div[data-test-id="compose-message-body"] [contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
        '[aria-label*="Message body"][contenteditable="true"]',
        '[contenteditable="true"]',
      ],
      sendButtons: [
        'button[data-test-id="compose-send-button"]',
        'button[title="Send"]',
        'button[aria-label*="Send"]',
      ],
      discardButtons: [
        'button[data-test-id="compose-close-button"]',
        'button[title="Close"]',
        'button[aria-label*="Close"]',
      ],
      commitRecipient: true,
      // Yahoo has no stable "Compose" button label; "n" opens New Message.
      composeShortcut: 'n',
      preferShortcut: true,
    },
    aol: {
      // AOL Mail runs the same platform as Yahoo Mail.
      composeButtons: [
        'a[data-test-id="compose-button"]',
        'button[data-test-id="compose-button"]',
        '[data-test-id="compose-button"]',
        'a[aria-label*="Compose"]',
      ],
      toFields: [
        'input[data-test-id="compose-to"]',
        'input#message-to-field',
        '#message-to-field',
        'input[aria-label="To"]',
        'input[placeholder="To"]',
        'input[aria-label*="To"]',
        'div[data-test-id="compose-recipient"] input',
      ],
      subjectFields: [
        'input[data-test-id="compose-subject"]',
        'input#message-subject-field',
        '#message-subject-field',
        'input[placeholder="Subject"]',
        'input[aria-label="Subject"]',
        'input[placeholder*="Subject"]',
        'input[aria-label*="Subject"]',
      ],
      bodyFields: [
        'div[data-test-id="rte"]',
        'div[data-test-id="compose-message-body"] [contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
        '[aria-label*="Message body"][contenteditable="true"]',
        '[contenteditable="true"]',
      ],
      sendButtons: [
        'button[data-test-id="compose-send-button"]',
        'button[title="Send"]',
        'button[aria-label*="Send"]',
      ],
      discardButtons: [
        'button[data-test-id="compose-close-button"]',
        'button[title="Close"]',
        'button[aria-label*="Close"]',
      ],
      commitRecipient: true,
      // AOL runs the Yahoo platform, so the same "n" shortcut opens New Message.
      composeShortcut: 'n',
      preferShortcut: true,
    },
    outlook: {
      composeButtons: [
        'button[aria-label="New mail"]',
        'button[aria-label*="New message"]',
        '[aria-label="New mail"]',
        'button[title="New mail"]',
      ],
      toFields: [
        'div[role="textbox"][aria-label*="To"]',
        'input[aria-label="To"]',
        'input[aria-label*="To"]',
        'div[aria-label="To"]',
        '[aria-label*="To"][contenteditable="true"]',
        'div[aria-label*="To"] input',
      ],
      subjectFields: [
        'input[aria-label="Add a subject"]',
        'input[placeholder="Add a subject"]',
        'input[aria-label="Subject"]',
        'input[aria-label*="Subject"]',
      ],
      bodyFields: [
        'div[role="textbox"][aria-label*="Message body"]',
        'div[contenteditable="true"][aria-label*="Message body"]',
        'div[aria-label="Message body"][contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
      ],
      sendButtons: [
        'button[aria-label="Send"]',
        'button[title="Send"]',
        'button[aria-label^="Send"]',
      ],
      discardButtons: [
        'button[aria-label="Discard"]',
        'button[title="Discard"]',
      ],
      commitRecipient: true,
      // Outlook.com: "n" opens a new message from the mail list.
      composeShortcut: 'n',
      preferShortcut: true,
    },
  };

  const utils = () => window.ReplyEngine && window.ReplyEngine.utils;

  function isSupportedProvider(providerName) {
    return Boolean(COMPOSE_SELECTORS[providerName]);
  }

  function dispatchKey(element, key, keyCode, code) {
    ["keydown", "keypress", "keyup"].forEach((type) => {
      element.dispatchEvent(
        new KeyboardEvent(type, {
          key,
          code: code || key,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true,
        })
      );
    });
  }

  // Fires a global single-letter shortcut (e.g. "n" for New Message). The key
  // must reach the app's document-level listener, so we first blur any focused
  // field — otherwise the letter is typed into that field instead.
  function pressGlobalShortcut(key) {
    const active = document.activeElement;
    const isField = active && (
      active.isContentEditable ||
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA"
    );
    if (isField && typeof active.blur === "function") {
      active.blur();
    }

    const upper = String(key).toUpperCase();
    const keyCode = upper.charCodeAt(0);
    const code = `Key${upper}`;
    const targets = [document.body, document.documentElement, document].filter(Boolean);

    targets.forEach((target) => dispatchKey(target, key, keyCode, code));
  }

  // True if a compose window is already on screen — its To/Subject field, body
  // editor, or send button is present. Used so we never fire a second strategy
  // (which would open a duplicate compose window) once one is already open.
  function isComposeWindowOpen(selectors) {
    const { findFirst } = utils();
    return Boolean(
      findFirst(selectors.toFields) ||
      findFirst(selectors.subjectFields) ||
      findFirst(selectors.sendButtons)
    );
  }

  // Opens a compose window using the most reliable path for this provider, then
  // confirms it actually opened by waiting for the To field. Providers whose
  // "Compose" button has no stable label (Yahoo/AOL/Outlook) prefer the "n"
  // keyboard shortcut; Gmail prefers its button and falls back to "c".
  async function openComposeWindow(providerName, selectors, callbacks) {
    const { sleep, findFirstMatch, waitForElementMatch, isEditableReplyBody } = utils();

    const openViaButton = () => {
      const match = findFirstMatch(selectors.composeButtons);
      if (!match) return false;
      report(callbacks, `compose via button selector=${match.selector}`);
      clickElement(match.element);
      return true;
    };

    const openViaShortcut = () => {
      if (!selectors.composeShortcut) return false;
      report(callbacks, `compose via shortcut key="${selectors.composeShortcut}"`);
      pressGlobalShortcut(selectors.composeShortcut);
      return true;
    };

    // Ordered list of strategies to try, most-reliable first for this provider.
    const strategies = selectors.preferShortcut
      ? [openViaShortcut, openViaButton]
      : [openViaButton, openViaShortcut];

    for (let i = 0; i < strategies.length; i++) {
      // If a previous strategy already opened compose, do NOT fire another one —
      // that is what caused two compose windows to open. Just wait for the To
      // field on the window that is already up.
      if (isComposeWindowOpen(selectors)) {
        report(callbacks, "compose already open; not firing another strategy");
        const existing = await waitForElementMatch(selectors.toFields, 8000, isEditableReplyBody);
        if (existing) return existing;
        break;
      }

      const opened = strategies[i]();
      if (!opened) continue;

      // Give the window a moment, then confirm via the To field. A generous
      // timeout here matters: a slow-loading compose must not be mistaken for
      // "failed to open", or the next strategy fires and duplicates it.
      await sleep(600);
      const toMatch = await waitForElementMatch(selectors.toFields, 10000, isEditableReplyBody);
      if (toMatch) return toMatch;

      // No To field yet. If a compose window is nonetheless open, keep waiting on
      // it rather than firing the next strategy (which would duplicate).
      if (isComposeWindowOpen(selectors)) {
        report(callbacks, `compose strategy ${i + 1} opened a window but no To field yet; waiting`);
        const retry = await waitForElementMatch(selectors.toFields, 6000, isEditableReplyBody);
        if (retry) return retry;
        break;
      }

      report(callbacks, `compose strategy ${i + 1} did not open anything; trying next`);
    }

    return null;
  }

  // Gmail/Yahoo/Outlook turn a typed address into a recipient chip only after an
  // explicit Enter (or Tab). Without this the address is silently dropped on send.
  async function commitRecipient(element) {
    const { sleep } = utils();

    element.focus();
    dispatchKey(element, "Enter", 13);
    await sleep(400);
    dispatchKey(element, "Tab", 9);
    await sleep(400);
  }

  function clickElement(element) {
    if (!element) return false;

    element.scrollIntoView({ block: "center", inline: "center" });
    try {
      element.focus();
    } catch (error) {
      // Some toolbar elements are not focusable.
    }

    // Dispatch the hover/press sequence for realism, but deliberately NOT a
    // synthetic "click" event — element.click() below is the single activation.
    // Doing both counts as two clicks on a button like Gmail Compose, which
    // opens two compose windows.
    ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup"].forEach((eventName) => {
      const EventCtor = eventName.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(
        new EventCtor(eventName, {
          bubbles: true,
          cancelable: true,
          view: window,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: eventName.includes("down") ? 1 : 0,
        })
      );
    });

    // Single activation. If the element has no native click(), fall back to a
    // lone synthetic click event.
    if (typeof element.click === "function") {
      element.click();
    } else {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, button: 0 }));
    }

    return true;
  }

  function report(callbacks, message) {
    if (typeof callbacks.onDiagnostic === "function") {
      callbacks.onDiagnostic(message);
    }
  }

  async function closeComposeWindow(selectors, callbacks) {
    const { findFirst, sleep } = utils();
    const discardButton = findFirst(selectors.discardButtons);

    if (discardButton) {
      clickElement(discardButton);
      await sleep(600);
      report(callbacks, "compose window discarded");
      return true;
    }

    report(callbacks, "discard button not found; compose window left open");
    return false;
  }

  /**
   * Composes and sends one new email.
   *
   * @param {string} providerName gmail | yahoo | aol | outlook
   * @param {{to: string, subject: string, body: string}} draft
   * @param {object} callbacks { waitForManualActivityQuiet, onDiagnostic, onStage }
   * @param {object} options   { dryRun: boolean }
   * @returns {Promise<{ok: true, dryRun: boolean}>}
   */
  async function sendNewEmail(providerName, draft = {}, callbacks = {}, options = {}) {
    const helpers = utils();
    if (!helpers) {
      throw new Error("ReplyEngine helpers are unavailable; cannot compose");
    }

    const selectors = COMPOSE_SELECTORS[providerName];
    if (!selectors) {
      throw new Error(`Compose is not configured for provider: ${providerName}`);
    }

    const to = String(draft.to || "").trim();
    const subject = String(draft.subject || "").trim();
    const body = String(draft.body || "").trim();

    if (!to) throw new Error("Compose aborted: recipient is empty");
    if (!subject) throw new Error("Compose aborted: subject is empty");
    if (!body) throw new Error("Compose aborted: body is empty");

    const {
      sleep,
      randomInt,
      findFirstMatch,
      waitForElementMatch,
      isEditableReplyBody,
      typeText,
      waitForTypedText,
      waitUntilManualActivityQuiet,
    } = helpers;

    const dryRun = Boolean(options.dryRun);

    await waitUntilManualActivityQuiet(callbacks);

    // Open compose (button or keyboard shortcut) and confirm the To field showed.
    const toMatch = await openComposeWindow(providerName, selectors, callbacks);
    if (!toMatch) {
      await closeComposeWindow(selectors, callbacks);
      throw new Error("Could not open a compose window (button and shortcut both failed)");
    }

    await waitUntilManualActivityQuiet(callbacks);

    report(callbacks, `to field selector=${toMatch.selector}`);
    await typeText(toMatch.element, to, callbacks);
    const toTyped = await waitForTypedText(toMatch.element, to, 4000);
    if (!toTyped) {
      await closeComposeWindow(selectors, callbacks);
      throw new Error("Recipient was empty after typing; send skipped");
    }

    if (selectors.commitRecipient) {
      await commitRecipient(toMatch.element);
    }

    await waitUntilManualActivityQuiet(callbacks);

    // Subject
    const subjectMatch = await waitForElementMatch(selectors.subjectFields, 8000, isEditableReplyBody);
    if (!subjectMatch) {
      await closeComposeWindow(selectors, callbacks);
      throw new Error("Compose Subject field not found");
    }

    report(callbacks, `subject field selector=${subjectMatch.selector}`);
    await typeText(subjectMatch.element, subject, callbacks);
    const subjectTyped = await waitForTypedText(subjectMatch.element, subject, 4000);
    if (!subjectTyped) {
      await closeComposeWindow(selectors, callbacks);
      throw new Error("Subject was empty after typing; send skipped");
    }

    await waitUntilManualActivityQuiet(callbacks);

    // Body
    const bodyMatch = await waitForElementMatch(selectors.bodyFields, 10000, isEditableReplyBody);
    if (!bodyMatch) {
      await closeComposeWindow(selectors, callbacks);
      throw new Error("Compose body editor not found");
    }

    report(callbacks, `body editor selector=${bodyMatch.selector}`);
    await typeText(bodyMatch.element, body, callbacks);
    const bodyTyped = await waitForTypedText(bodyMatch.element, body, 5000);
    if (!bodyTyped) {
      await closeComposeWindow(selectors, callbacks);
      throw new Error("Body was empty after typing; send skipped");
    }

    // Human pause before committing, same shape as replyEngine.
    await sleep(randomInt(1200, 3500));
    await waitUntilManualActivityQuiet(callbacks);

    if (dryRun) {
      report(callbacks, "dry run: send skipped, discarding draft");
      await closeComposeWindow(selectors, callbacks);
      return { ok: true, dryRun: true };
    }

    const sendMatch = await waitForElementMatch(selectors.sendButtons, 8000);
    if (!sendMatch) {
      await closeComposeWindow(selectors, callbacks);
      throw new Error("Compose Send button not found");
    }

    report(callbacks, `send button selector=${sendMatch.selector}`);
    await waitUntilManualActivityQuiet(callbacks);
    clickElement(sendMatch.element);
    await sleep(randomInt(1200, 2400));

    return { ok: true, dryRun: false };
  }

  window.ComposeEngine = {
    sendNewEmail,
    isSupportedProvider,
  };
})();
