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
        '#message-to-field',
        'input[aria-label*="To"]',
      ],
      subjectFields: [
        'input[data-test-id="compose-subject"]',
        'input[placeholder*="Subject"]',
        'input[aria-label*="Subject"]',
      ],
      bodyFields: [
        'div[data-test-id="rte"]',
        'div[role="textbox"][contenteditable="true"]',
        '[contenteditable="true"]',
      ],
      sendButtons: [
        'button[data-test-id="compose-send-button"]',
        'button[aria-label*="Send"]',
      ],
      discardButtons: [
        'button[data-test-id="compose-close-button"]',
        'button[aria-label*="Close"]',
      ],
      commitRecipient: true,
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
        '#message-to-field',
        'input[aria-label*="To"]',
      ],
      subjectFields: [
        'input[data-test-id="compose-subject"]',
        'input[placeholder*="Subject"]',
        'input[aria-label*="Subject"]',
      ],
      bodyFields: [
        'div[data-test-id="rte"]',
        'div[role="textbox"][contenteditable="true"]',
        '[contenteditable="true"]',
      ],
      sendButtons: [
        'button[data-test-id="compose-send-button"]',
        'button[aria-label*="Send"]',
      ],
      discardButtons: [
        'button[data-test-id="compose-close-button"]',
        'button[aria-label*="Close"]',
      ],
      commitRecipient: true,
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
        'div[aria-label="To"]',
        '[aria-label*="To"][contenteditable="true"]',
      ],
      subjectFields: [
        'input[aria-label="Add a subject"]',
        'input[placeholder="Add a subject"]',
        'input[aria-label*="Subject"]',
      ],
      bodyFields: [
        'div[role="textbox"][aria-label*="Message body"]',
        'div[contenteditable="true"][aria-label*="Message body"]',
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
    },
  };

  const utils = () => window.ReplyEngine && window.ReplyEngine.utils;

  function isSupportedProvider(providerName) {
    return Boolean(COMPOSE_SELECTORS[providerName]);
  }

  function dispatchKey(element, key, keyCode) {
    ["keydown", "keypress", "keyup"].forEach((type) => {
      element.dispatchEvent(
        new KeyboardEvent(type, {
          key,
          code: key,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true,
        })
      );
    });
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

    ["pointerover", "mouseover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((eventName) => {
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

    try {
      element.click();
    } catch (error) {
      // The dispatched click above is still the primary path.
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

    const composeMatch = findFirstMatch(selectors.composeButtons);
    if (!composeMatch) {
      throw new Error("Compose button not found");
    }

    report(callbacks, `compose button selector=${composeMatch.selector}`);
    clickElement(composeMatch.element);
    await sleep(randomInt(1200, 2200));

    await waitUntilManualActivityQuiet(callbacks);

    // Recipient
    const toMatch = await waitForElementMatch(selectors.toFields, 12000, isEditableReplyBody);
    if (!toMatch) {
      await closeComposeWindow(selectors, callbacks);
      throw new Error("Compose To field not found");
    }

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
