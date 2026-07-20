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
      body: [
        'div[role="textbox"][contenteditable="true"]',
        '[contenteditable="true"][aria-label*="Message body"]',
        '[contenteditable="true"][aria-label*="Email body"]',
        '[contenteditable="true"]',
      ],
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

  function isVisibleEnabled(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const disabled =
      element.disabled === true ||
      element.getAttribute("disabled") !== null ||
      element.getAttribute("aria-disabled") === "true";

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getAttribute("aria-hidden") !== "true" &&
      !disabled
    );
  }

  function isEditableReplyBody(element) {
    if (!isVisibleEnabled(element)) return false;

    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      return !element.readOnly;
    }

    return element.isContentEditable || element.getAttribute("contenteditable") === "true";
  }

  function findFirstMatch(selectors, root = document, predicate = isVisibleEnabled) {
    for (const selector of selectors || []) {
      const element = Array.from(root.querySelectorAll(selector)).find(predicate);
      if (element) {
        return { element, selector };
      }
    }

    return null;
  }

  function findFirst(selectors, root = document, predicate = isVisibleEnabled) {
    return findFirstMatch(selectors, root, predicate)?.element || null;
  }

  async function waitForElement(selectors, timeout = 10000, predicate = isVisibleEnabled) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const element = findFirst(selectors, document, predicate);
      if (element) return element;
      await sleep(300);
    }

    return null;
  }

  async function waitForElementMatch(selectors, timeout = 10000, predicate = isVisibleEnabled) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const match = findFirstMatch(selectors, document, predicate);
      if (match) return match;
      await sleep(300);
    }

    return null;
  }

  function getElementText(element) {
    if (!element) return "";
    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      return element.value || "";
    }

    return element.innerText || element.textContent || "";
  }

  function normalizeText(text = "") {
    return String(text).replace(/\s+/g, " ").trim();
  }

  function setCaretToEnd(element) {
    if (!element || !element.isContentEditable) return;

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function waitUntilManualActivityQuiet(callbacks = {}) {
    if (typeof callbacks.waitForManualActivityQuiet !== "function") return;

    const ok = await callbacks.waitForManualActivityQuiet();
    if (!ok) {
      throw new Error("Reply stopped before action");
    }
  }

  function getTypingChunks(text) {
    const words = String(text || "").match(/\S+\s*/g) || [];
    const chunks = [];
    let current = "";

    for (const word of words) {
      current += word;
      if (current.trim().length >= 10) {
        chunks.push(current);
        current = "";
      }
    }

    if (current) {
      if (chunks.length && current.trim().length < 10) {
        chunks[chunks.length - 1] += current;
      } else {
        chunks.push(current);
      }
    }

    return chunks.length ? chunks : [String(text || "")];
  }

  async function typeText(element, text, callbacks = {}) {
    element.focus();

    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      element.value = "";
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContent" }));
    } else {
      element.innerHTML = "";
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContent" }));
    }

    const chunks = getTypingChunks(text);
    for (const chunk of chunks) {
      await waitUntilManualActivityQuiet(callbacks);

      if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
        // Plain fields keep newlines natively.
        element.value += chunk;
      } else {
        setCaretToEnd(element);
        // In a rich contenteditable, a literal "\n" collapses to a space, so
        // real line breaks must be inserted as line breaks. Split the chunk and
        // emit a line break between segments. (Single-line replies contain no
        // newlines, so their behaviour is unchanged.)
        const segments = chunk.split("\n");
        for (let s = 0; s < segments.length; s++) {
          if (s > 0) {
            let broke = false;
            try {
              broke = document.execCommand("insertLineBreak");
            } catch (error) {
              broke = false;
            }
            if (!broke) {
              try {
                broke = document.execCommand("insertHTML", false, "<br>");
              } catch (error) {
                broke = false;
              }
            }
            if (!broke) {
              element.appendChild(document.createElement("br"));
            }
          }

          const segment = segments[s];
          if (!segment) continue;

          let inserted = false;
          try {
            inserted = document.execCommand("insertText", false, segment);
          } catch (error) {
            inserted = false;
          }
          if (!inserted) {
            element.textContent += segment;
          }
        }
      }

      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: chunk }));
      await sleep(randomInt(80, 180));
    }
  }

  async function waitForTypedText(element, text, timeout = 4000) {
    const expected = normalizeText(text);
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (normalizeText(getElementText(element)).includes(expected)) {
        return true;
      }

      await sleep(250);
    }

    return false;
  }

  const NO_REPLY_TEXT_MATCHES = [
    "no-reply",
    "no reply",
    "no_reply",
    "no.reply",
    "noreply",
    "do-not-reply",
    "do.not.reply",
    "donotreply",
    "do not reply",
    "do_not_reply",
    "do-not-respond",
    "do.not.respond",
    "donotrespond",
    "do not respond",
    "do_not_respond",
    "postmaster",
    "mailer-daemon",
    "mail delivery subsystem",
    "accountprotection.microsoft.com",
    "account-security-noreply",
    "microsoft account team",
  ];

  function getOpenedMessageText(providerName) {
    const commonRoots = [
      '[role="main"]',
      '[role="document"]',
      '[aria-label*="Message"]',
      '[aria-label*="message"]',
    ];
    const providerRoots = {
      gmail: [".adn", ".gs", ".a3s", ".ii.gt", '[role="main"] .ii'],
      yahoo: ['[data-test-id="message-view"]', '[data-test-id="message-view-body"]', 'div[data-test-id="rp"]'],
      aol: ['[data-test-id="message-view"]', '[data-test-id="message-view-body"]', 'div[data-test-id="rp"]'],
      outlook: [
        '[aria-label="Email message"]',
        '[role="main"][aria-label="Reading Pane"] [aria-label="Email message"]',
        '[role="document"][aria-label="Message body"]',
        '[aria-label="Message body"][role="document"]',
        '[id^="UniqueMessageBody_"]',
      ],
      proton: ['[data-testid="message-view"]', '[data-testid="message-content"]', ".message-container", ".message-body"],
      zoho: [".zmMailContent", ".zmReadMail", ".mailContent", ".zmMsgView"],
    };

    const roots = providerRoots[providerName] || commonRoots;

    for (const selector of roots) {
      const element = Array.from(document.querySelectorAll(selector)).find((candidate) => {
        if (!isVisibleEnabled(candidate)) return false;
        const text = candidate.textContent || "";
        return text.trim().length > 20 || candidate.querySelector?.('[href^="mailto:"], [title*="@"], [aria-label*="@"]');
      });

      if (element) {
        return getNoReplyCandidateText(element, providerName);
      }
    }

    return "";
  }

  function getNoReplyCandidateText(element, providerName) {
    const textParts = [
      element.textContent || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
    ];

    const identityElements = Array.from(element.querySelectorAll('[email], [href^="mailto:"], [title*="@"], [aria-label*="@"]')).slice(0, 12);
    for (const identityElement of identityElements) {
      textParts.push(identityElement.getAttribute("email") || "");
      textParts.push(identityElement.getAttribute("href") || "");
      textParts.push(identityElement.getAttribute("aria-label") || "");
      textParts.push(identityElement.getAttribute("title") || "");
      textParts.push(identityElement.textContent || "");
    }

    const normalized = textParts.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
    if (providerName === "outlook") {
      return normalized.slice(0, 1500);
    }

    return normalized.slice(0, 2500);
  }

  function shouldSkipAutoReply(providerName) {
    const text = getOpenedMessageText(providerName);
    return NO_REPLY_TEXT_MATCHES.some((blockedText) => text.includes(blockedText));
  }

  function diagnose(providerName, callbacks, message) {
    if (providerName === "aol" && typeof callbacks.onDiagnostic === "function") {
      callbacks.onDiagnostic(message);
    }
  }

  async function sendReply(providerName, callbacks = {}) {
    const selectors = REPLY_SELECTORS[providerName];
    if (!selectors) {
      throw new Error(`Reply is not configured for provider: ${providerName}`);
    }

    if (shouldSkipAutoReply(providerName)) {
      throw new Error("Auto reply skipped: sender appears to be no-reply/security mail");
    }

    await waitUntilManualActivityQuiet(callbacks);

    const template = await getRandomReplyTemplate();
    if (typeof callbacks.onTemplateSelected === "function") {
      callbacks.onTemplateSelected(template);
    }

    await waitUntilManualActivityQuiet(callbacks);

    const replyButtonMatch = findFirstMatch(selectors.replyButtons);
    if (!replyButtonMatch) {
      throw new Error("Reply button not found");
    }

    diagnose(providerName, callbacks, `reply button selector=${replyButtonMatch.selector}`);
    replyButtonMatch.element.click();

    await waitUntilManualActivityQuiet(callbacks);

    const bodyMatch = await waitForElementMatch(selectors.body, 12000, isEditableReplyBody);
    if (!bodyMatch) {
      throw new Error("Reply editor not found");
    }

    diagnose(providerName, callbacks, `reply editor selector=${bodyMatch.selector}`);
    const body = bodyMatch.element;
    await typeText(body, template, callbacks);
    const textWasInserted = await waitForTypedText(body, template);
    if (!textWasInserted) {
      throw new Error("Reply body was empty after typing; send skipped");
    }

    await sleep(randomInt(1200, 3500));
    await waitUntilManualActivityQuiet(callbacks);

    const sendButtonMatch = await waitForElementMatch(selectors.sendButtons, 8000);
    if (!sendButtonMatch) {
      throw new Error("Send button not found");
    }

    diagnose(providerName, callbacks, `send button selector=${sendButtonMatch.selector}`);
    await waitUntilManualActivityQuiet(callbacks);
    sendButtonMatch.element.click();
    await sleep(randomInt(900, 1800));

    return template;
  }

  window.ReplyEngine = {
    getRandomReplyTemplate,
    sendReply,
    // Shared DOM/typing helpers reused by ComposeEngine. Exported only; reply
    // behaviour above is unchanged.
    utils: {
      sleep,
      randomInt,
      isVisibleEnabled,
      isEditableReplyBody,
      findFirstMatch,
      findFirst,
      waitForElement,
      waitForElementMatch,
      getElementText,
      normalizeText,
      typeText,
      waitForTypedText,
      waitUntilManualActivityQuiet,
    },
  };
})();
