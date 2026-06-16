// ReplyEngine - selects templates and sends one reply for an opened email.
(function () {
  "use strict";

  const DEFAULT_TEMPLATES = [
    "Thank you for your email.",
    "Appreciate the update. Thank you.",
    "Thank you for reaching out.",
    "Received with thanks.",
    "Thank you for the information.",
  ];

  const REPLY_SELECTORS = {
    gmail: {
      replyButtons: ['[aria-label^="Reply"]', '[data-tooltip^="Reply"]'],
      body: ['div[aria-label="Message Body"][contenteditable="true"]', 'div[role="textbox"][contenteditable="true"]'],
      sendButtons: ['div[aria-label^="Send"]', '[data-tooltip^="Send"]'],
    },
    yahoo: {
      replyButtons: ['button[data-test-id="reply-button"]', 'button[aria-label*="Reply"]'],
      body: ['div[role="textbox"][contenteditable="true"]', '[contenteditable="true"]'],
      sendButtons: ['button[data-test-id="compose-send-button"]', 'button[aria-label*="Send"]'],
    },
    aol: {
      replyButtons: ['button[data-test-id="reply"][data-kind="reply"]', 'button[data-test-id="reply"]', 'button[data-kind="reply"]', 'button[data-test-id="reply-button"]', '[data-test-id*="reply"]', 'button[aria-label*="Reply"]', '[aria-label*="Reply"]', '[title*="Reply"]'],
      body: ['div[role="textbox"][contenteditable="true"]', '[aria-label*="Message"][contenteditable="true"]', '[contenteditable="true"]'],
      sendButtons: ['button[data-test-id="compose-send-button"]', '[data-test-id*="send"]', 'button[aria-label*="Send"]', '[aria-label*="Send"]', '[title*="Send"]'],
    },
    outlook: {
      replyButtons: ['button[aria-label^="Reply"]', 'button[title^="Reply"]'],
      body: ['div[role="textbox"][contenteditable="true"]', '[aria-label*="Message body"]'],
      sendButtons: ['button[aria-label^="Send"]', 'button[title^="Send"]'],
    },
    proton: {
      replyButtons: ['[data-testid="message-view:reply-button"]', 'button[title^="Reply"]'],
      body: ['[data-testid="rooster-editor"]', 'div[contenteditable="true"]'],
      sendButtons: ['[data-testid="composer:send-button"]', 'button[title^="Send"]'],
    },
    zoho: {
      replyButtons: ['[aria-label^="Reply"]', '.zmReply', '.reply'],
      body: ['div[contenteditable="true"]', 'textarea'],
      sendButtons: ['[aria-label^="Send"]', '.zmSend', '.send'],
    },
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  async function getTemplates() {
    const data = await getStorage(["replyTemplates"]);
    const customTemplates = Array.isArray(data.replyTemplates)
      ? data.replyTemplates.map((template) => String(template).trim()).filter(Boolean)
      : [];

    return customTemplates.length > 0 ? customTemplates : DEFAULT_TEMPLATES;
  }

  async function getRandomReplyTemplate() {
    const templates = await getTemplates();
    return templates[randomInt(0, templates.length - 1)];
  }

  function findFirst(selectors, root = document) {
    for (const selector of selectors || []) {
      const element = root.querySelector(selector);
      if (element && element.offsetParent !== null) {
        return element;
      }
    }

    return null;
  }

  async function waitForElement(selectors, timeout = 10000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const element = findFirst(selectors);
      if (element) return element;
      await sleep(300);
    }

    return null;
  }

  async function typeText(element, text) {
    element.focus();

    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      element.value = "";
    } else {
      element.textContent = "";
    }

    for (const char of text) {
      if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
        element.value += char;
      } else {
        element.textContent += char;
      }

      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: char }));
      await sleep(randomInt(45, 140));
    }
  }

  async function sendReply(providerName, callbacks = {}) {
    const selectors = REPLY_SELECTORS[providerName];
    if (!selectors) {
      throw new Error(`Reply is not configured for provider: ${providerName}`);
    }

    const template = await getRandomReplyTemplate();
    if (typeof callbacks.onTemplateSelected === "function") {
      callbacks.onTemplateSelected(template);
    }

    const replyButton = findFirst(selectors.replyButtons);
    if (!replyButton) {
      throw new Error("Reply button not found");
    }

    replyButton.click();

    const body = await waitForElement(selectors.body, 12000);
    if (!body) {
      throw new Error("Reply editor not found");
    }

    await typeText(body, template);
    await sleep(randomInt(1200, 3500));

    const sendButton = await waitForElement(selectors.sendButtons, 8000);
    if (!sendButton) {
      throw new Error("Send button not found");
    }

    sendButton.click();
    await sleep(randomInt(900, 1800));

    return template;
  }

  window.ReplyEngine = {
    getRandomReplyTemplate,
    sendReply,
  };
})();
