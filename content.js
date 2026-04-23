(() => {
  const BUTTON_ID = "pp-optimize-button";
  const BUTTON_ICON_PATH = "icons/bubble-32.png";

  const SITE_ADAPTERS = [
    {
      name: "chatgpt",
      hostPattern: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/,
      selectors: [
        "#prompt-textarea",
        "textarea#prompt-textarea",
        "div#prompt-textarea[contenteditable='true']",
        "div[contenteditable='true'][id='prompt-textarea']",
        "textarea[data-testid='prompt-textarea']"
      ]
    },
    {
      name: "claude",
      hostPattern: /(^|\.)claude\.ai$/,
      selectors: [
        "div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true'][data-testid='chat-input']",
        "textarea[placeholder*='Message']"
      ]
    },
    {
      name: "gemini",
      hostPattern: /(^|\.)gemini\.google\.com$/,
      selectors: [
        "textarea[aria-label*='Enter']",
        "textarea[placeholder*='Enter']",
        "div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true'][aria-label*='Enter']"
      ]
    },
    {
      name: "generic",
      hostPattern: /.*/,
      selectors: [
        "textarea",
        "div[contenteditable='true'][role='textbox']",
        "div[contenteditable='true']"
      ]
    }
  ];

  let bubbleButton = null;
  let activeComposer = null;
  let loadingMask = null;
  let loadingTextLayer = null;
  let loadingMaskTick = null;
  let toastTimeout = null;
  let refreshQueued = false;
  let isLoading = false;
  let measurementCanvas = null;

  function init() {
    console.log("Content script loaded");
    createBubbleButton();
    bindListeners();
    observeDom();
    queueRefresh();
  }

  function createBubbleButton() {
    if (bubbleButton) {
      return;
    }

    bubbleButton = document.createElement("button");
    bubbleButton.id = BUTTON_ID;
    bubbleButton.type = "button";
    bubbleButton.className = "pp-hidden";
    bubbleButton.title = "Optimize prompt";
    bubbleButton.setAttribute("aria-label", "Optimize prompt");
    bubbleButton.textContent = "";
    bubbleButton.style.backgroundImage = `url("${chrome.runtime.getURL(BUTTON_ICON_PATH)}")`;

    bubbleButton.addEventListener("click", () => {
      void runOptimization();
    });

    document.documentElement.appendChild(bubbleButton);
  }

  function bindListeners() {
    document.addEventListener(
      "input",
      (event) => {
        const target = event.target;
        const editable = getEditableRoot(target);
        if (editable) {
          activeComposer = editable;
        }
        queueRefresh();
      },
      true
    );

    document.addEventListener(
      "focusin",
      (event) => {
        const editable = getEditableRoot(event.target);
        if (editable) {
          activeComposer = editable;
          queueRefresh();
        }
      },
      true
    );

    window.addEventListener("scroll", queueRefresh, true);
    window.addEventListener("resize", queueRefresh, true);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "RUN_OPTIMIZE_FROM_POPUP") {
        runOptimization()
          .then(() => sendResponse({ ok: true }))
          .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (message?.type === "PING_CONTENT") {
        sendResponse({ ok: true });
      }

      return undefined;
    });
  }

  function observeDom() {
    const observer = new MutationObserver(() => {
      queueRefresh();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }

  function queueRefresh() {
    if (refreshQueued) {
      return;
    }

    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refreshUi();
    });
  }

  function refreshUi() {
    if (isLoading) {
      positionBubble(activeComposer);
      positionLoadingMask();
      return;
    }

    const composer = pickComposer();
    if (!composer) {
      activeComposer = null;
      hideBubble();
      return;
    }

    activeComposer = composer;
    const promptText = getPromptText(composer).trim();

    if (!promptText) {
      hideBubble();
      return;
    }

    showBubble(composer);
  }

  function pickComposer() {
    if (activeComposer && isUsableComposer(activeComposer)) {
      return activeComposer;
    }

    const adapter = resolveAdapter();
    const candidates = [];

    adapter.selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (isUsableComposer(element)) {
          candidates.push(element);
        }
      });
    });

    if (!candidates.length) {
      return null;
    }

    const focused = candidates.find((el) => el === document.activeElement || el.contains(document.activeElement));
    if (focused) {
      return focused;
    }

    candidates.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return bRect.bottom - aRect.bottom;
    });

    return candidates[0];
  }

  function resolveAdapter() {
    return SITE_ADAPTERS.find((adapter) => adapter.hostPattern.test(location.host)) || SITE_ADAPTERS[SITE_ADAPTERS.length - 1];
  }

  function isUsableComposer(element) {
    return Boolean(element && isEditableElement(element) && isVisible(element));
  }

  function isEditableElement(element) {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }

    if (element.tagName === "TEXTAREA") {
      return !element.disabled;
    }

    if (element.isContentEditable) {
      return true;
    }

    return element.getAttribute("contenteditable") === "true";
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    if (!rect || rect.width < 20 || rect.height < 20) {
      return false;
    }

    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  function getEditableRoot(target) {
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    if (isEditableElement(target)) {
      return target;
    }

    return target.closest("textarea, [contenteditable='true']");
  }

  function getPromptText(element) {
    if (!element) {
      return "";
    }

    if (element.tagName === "TEXTAREA") {
      return element.value || "";
    }

    return (element.innerText || element.textContent || "").trim();
  }

  function setPromptText(element, value) {
    if (!element) {
      return;
    }

    if (element.tagName === "TEXTAREA") {
      element.focus();
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      const position = value.length;
      element.setSelectionRange(position, position);
      return;
    }

    element.focus();
    element.textContent = value;

    let inputEvent;
    try {
      inputEvent = new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        data: value,
        inputType: "insertText"
      });
    } catch (_error) {
      inputEvent = new Event("input", { bubbles: true, cancelable: true });
    }

    element.dispatchEvent(inputEvent);
    placeCursorAtEnd(element);
  }

  function placeCursorAtEnd(element) {
    if (!element.isContentEditable) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function showBubble(composer) {
    if (!bubbleButton) {
      return;
    }

    positionBubble(composer);
    bubbleButton.classList.remove("pp-hidden");
  }

  function hideBubble() {
    if (!bubbleButton) {
      return;
    }

    bubbleButton.classList.add("pp-hidden");
  }

  function positionBubble(composer) {
    if (!composer || !bubbleButton) {
      return;
    }

    const composerRect = composer.getBoundingClientRect();
    let anchorRect = getCaretRect(composer);

    if (!isUsableCaretRect(anchorRect, composerRect)) {
      anchorRect = getEstimatedCaretRect(composer);
    }

    if (!isUsableCaretRect(anchorRect, composerRect)) {
      anchorRect = composerRect;
    }

    const top = clamp(anchorRect.top - 24, 8, window.innerHeight - 33);
    const left = clamp(anchorRect.right + 8, 8, window.innerWidth - 33);

    bubbleButton.style.top = `${top}px`;
    bubbleButton.style.left = `${left}px`;
  }

  function getCaretRect(composer) {
    if (composer.tagName === "TEXTAREA") {
      return getTextareaCaretRect(composer);
    }

    if (composer.isContentEditable || composer.getAttribute("contenteditable") === "true") {
      return getContentEditableCaretRect(composer);
    }

    return null;
  }

  function isUsableCaretRect(rect, composerRect) {
    if (!rect || !composerRect) {
      return false;
    }

    const values = [rect.top, rect.right, rect.bottom, rect.left];
    if (values.some((value) => !Number.isFinite(value))) {
      return false;
    }

    if (rect.top === 0 && rect.right === 0 && rect.bottom === 0 && rect.left === 0) {
      return false;
    }

    const marginX = Math.max(26, composerRect.width * 0.35);
    const marginY = Math.max(26, composerRect.height * 0.6);

    const withinX =
      rect.right >= composerRect.left - marginX && rect.left <= composerRect.right + marginX;
    const withinY =
      rect.bottom >= composerRect.top - marginY && rect.top <= composerRect.bottom + marginY;

    return withinX && withinY;
  }

  function getContentEditableCaretRect(composer) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const activeRange = selection.getRangeAt(0);
    if (!composer.contains(activeRange.startContainer)) {
      return null;
    }

    const range = activeRange.cloneRange();
    range.collapse(true);

    const candidateRect = resolveCaretRectFromRange(range);
    if (!candidateRect) {
      return null;
    }

    const composerRect = composer.getBoundingClientRect();
    const promptLength = getPromptText(composer).length;
    const appearsPinnedToRightForTinyPrompt =
      promptLength > 0 &&
      promptLength <= 3 &&
      candidateRect.right > composerRect.left + composerRect.width * 0.72;

    if (appearsPinnedToRightForTinyPrompt) {
      const estimatedRect = getEstimatedContentEditableCaretRect(composer);
      return estimatedRect || candidateRect;
    }

    return candidateRect;
  }

  function resolveCaretRectFromRange(range) {
    const rects = range.getClientRects();
    if (rects.length > 0) {
      const rect = rects[rects.length - 1];
      if (Number.isFinite(rect.top) && Number.isFinite(rect.right)) {
        return rect;
      }
    }

    const rect = range.getBoundingClientRect();
    if (!rect) {
      return null;
    }

    if (Number.isFinite(rect.top) && Number.isFinite(rect.right)) {
      return rect;
    }

    return null;
  }

  function getEstimatedCaretRect(composer) {
    if (!composer) {
      return null;
    }

    if (composer.tagName === "TEXTAREA") {
      return getTextareaCaretRect(composer);
    }

    if (composer.isContentEditable || composer.getAttribute("contenteditable") === "true") {
      return getEstimatedContentEditableCaretRect(composer);
    }

    return null;
  }

  function getEstimatedContentEditableCaretRect(composer) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const activeRange = selection.getRangeAt(0);
    if (!composer.contains(activeRange.startContainer)) {
      return null;
    }

    let textBefore = "";
    try {
      const textBeforeRange = document.createRange();
      textBeforeRange.selectNodeContents(composer);
      textBeforeRange.setEnd(activeRange.startContainer, activeRange.startOffset);
      textBefore = (textBeforeRange.toString() || "").replace(/\u200B/g, "");
    } catch (_error) {
      textBefore = getPromptText(composer);
    }

    const computed = window.getComputedStyle(composer);
    const composerRect = composer.getBoundingClientRect();

    const fontSizePx = parseFloat(computed.fontSize) || 16;
    const lineHeightParsed = parseFloat(computed.lineHeight);
    const lineHeight = Number.isFinite(lineHeightParsed) ? lineHeightParsed : fontSizePx * 1.35;
    const letterSpacingParsed = parseFloat(computed.letterSpacing);
    const letterSpacing = Number.isFinite(letterSpacingParsed) ? letterSpacingParsed : 0;

    const lines = textBefore.split(/\r?\n/);
    const lineIndex = Math.max(0, lines.length - 1);
    const lineText = lines[lineIndex] || "";

    const canvas = getMeasurementCanvas();
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    const fontStyle = computed.fontStyle || "normal";
    const fontVariant = computed.fontVariant || "normal";
    const fontWeight = computed.fontWeight || "400";
    const fontFamily = computed.fontFamily || "sans-serif";
    context.font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSizePx}px ${fontFamily}`;

    let textWidth = context.measureText(lineText).width;
    if (lineText.length > 1 && letterSpacing !== 0) {
      textWidth += letterSpacing * (lineText.length - 1);
    }

    const padLeft = parseFloat(computed.paddingLeft) || 0;
    const padTop = parseFloat(computed.paddingTop) || 0;
    const scrollLeft = Number.isFinite(composer.scrollLeft) ? composer.scrollLeft : 0;
    const scrollTop = Number.isFinite(composer.scrollTop) ? composer.scrollTop : 0;

    const x = composerRect.left + padLeft + textWidth - scrollLeft;
    const y = composerRect.top + padTop + lineIndex * lineHeight - scrollTop;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return {
      top: y,
      right: x,
      bottom: y + lineHeight,
      left: x,
      width: 0,
      height: lineHeight
    };
  }

  function getMeasurementCanvas() {

    if (!measurementCanvas) {
      measurementCanvas = document.createElement("canvas");
    }

    return measurementCanvas;
  }

  function getTextareaCaretRect(textarea) {
    const caretIndex =
      typeof textarea.selectionStart === "number" ? textarea.selectionStart : textarea.value.length;

    const mirror = document.createElement("div");
    const marker = document.createElement("span");
    const style = window.getComputedStyle(textarea);

    const copiedProperties = [
      "boxSizing",
      "width",
      "height",
      "overflowX",
      "overflowY",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderStyle",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "fontStyle",
      "fontVariant",
      "fontWeight",
      "fontStretch",
      "fontSize",
      "fontFamily",
      "lineHeight",
      "letterSpacing",
      "textTransform",
      "textAlign",
      "textIndent",
      "whiteSpace",
      "wordBreak"
    ];

    copiedProperties.forEach((property) => {
      mirror.style[property] = style[property];
    });

    mirror.style.position = "fixed";
    mirror.style.visibility = "hidden";
    mirror.style.pointerEvents = "none";
    mirror.style.top = "0";
    mirror.style.left = "0";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.overflow = "hidden";

    mirror.textContent = textarea.value.slice(0, caretIndex);

    marker.textContent = textarea.value.slice(caretIndex, caretIndex + 1) || "\u200b";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const textareaRect = textarea.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) || 16;

    mirror.remove();

    const x = textareaRect.left + (markerRect.left - mirrorRect.left) - textarea.scrollLeft;
    const y = textareaRect.top + (markerRect.top - mirrorRect.top) - textarea.scrollTop;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    if (
      x < textareaRect.left - 40 ||
      x > textareaRect.right + 40 ||
      y < textareaRect.top - 40 ||
      y > textareaRect.bottom + 40
    ) {
      return null;
    }

    return {
      top: y,
      right: x,
      bottom: y + lineHeight,
      left: x,
      width: 0,
      height: lineHeight
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  async function runOptimization() {
    if (isLoading) {
      return;
    }

    const composer = pickComposer();
    if (!composer) {
      showToast("No prompt editor found on this page.", true);
      return;
    }

    const prompt = getPromptText(composer).trim();
    if (!prompt) {
      showToast("Type a prompt first.", true);
      return;
    }

    isLoading = true;
    activeComposer = composer;
    bubbleButton?.classList.add("pp-loading");

    showLoadingMask(composer, prompt);

    try {
      const response = await sendRuntimeMessage({
        type: "OPTIMIZE_PROMPT",
        prompt,
        pageUrl: window.location.href
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Optimization failed");
      }

      const nextPrompt = (response.optimizedPrompt || "").trim();
      if (!nextPrompt) {
        throw new Error("Model returned empty output");
      }

      setPromptText(composer, nextPrompt);
      showToast("Prompt optimized", false);
    } catch (error) {
      showToast(error.message || "Optimization failed", true);
    } finally {
      isLoading = false;
      bubbleButton?.classList.remove("pp-loading");
      hideLoadingMask();
      queueRefresh();
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  function showLoadingMask(composer, text) {
    hideLoadingMask();

    const rect = composer.getBoundingClientRect();
    const computed = window.getComputedStyle(composer);

    const mask = document.createElement("div");
    mask.className = "pp-loading-mask";
    mask.style.top = `${rect.top}px`;
    mask.style.left = `${rect.left}px`;
    mask.style.width = `${rect.width}px`;
    mask.style.height = `${rect.height}px`;
    mask.style.borderRadius = computed.borderRadius || "12px";

    const textLayer = document.createElement("div");
    textLayer.className = "pp-loading-text";
    textLayer.textContent = getVisibleComposerText(composer, text);
    textLayer.style.fontFamily = computed.fontFamily;
    textLayer.style.fontSize = computed.fontSize;
    textLayer.style.fontWeight = computed.fontWeight;
    textLayer.style.lineHeight = computed.lineHeight;
    textLayer.style.letterSpacing = computed.letterSpacing;
    textLayer.style.padding = computed.padding;
    textLayer.style.textAlign = computed.textAlign;

    mask.appendChild(textLayer);
    document.documentElement.appendChild(mask);

    loadingMask = mask;
    loadingTextLayer = textLayer;
    syncLoadingMaskTextPosition(composer, textLayer);
    loadingMaskTick = window.setInterval(positionLoadingMask, 80);
  }

  function positionLoadingMask() {
    if (!loadingMask || !activeComposer || !activeComposer.isConnected) {
      return;
    }

    const rect = activeComposer.getBoundingClientRect();

    loadingMask.style.top = `${rect.top}px`;
    loadingMask.style.left = `${rect.left}px`;
    loadingMask.style.width = `${rect.width}px`;
    loadingMask.style.height = `${rect.height}px`;
    syncLoadingMaskTextPosition(activeComposer, loadingTextLayer);
  }

  function hideLoadingMask() {
    if (loadingMaskTick) {
      clearInterval(loadingMaskTick);
      loadingMaskTick = null;
    }

    if (loadingMask) {
      loadingMask.remove();
      loadingMask = null;
    }

    loadingTextLayer = null;
  }

  function getVisibleComposerText(composer, fallbackText) {
    if (!composer) {
      return (fallbackText || "").trim();
    }

    if (composer.tagName === "TEXTAREA") {
      return (composer.value || fallbackText || "").replace(/\u200B/g, "");
    }

    return (composer.innerText || composer.textContent || fallbackText || "").replace(/\u200B/g, "");
  }

  function syncLoadingMaskTextPosition(composer, textLayer) {
    if (!composer || !textLayer) {
      return;
    }

    const x = Number.isFinite(composer.scrollLeft) ? composer.scrollLeft : 0;
    const y = Number.isFinite(composer.scrollTop) ? composer.scrollTop : 0;
    textLayer.style.transform = `translate(${-x}px, ${-y}px)`;
  }

  function showToast(message, isError) {

    const existing = document.querySelector(".pp-toast");
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement("div");
    toast.className = `pp-toast${isError ? " pp-error" : ""}`;
    toast.textContent = message;

    const anchorTop = bubbleButton ? parseInt(bubbleButton.style.top || "20", 10) : 20;
    const anchorLeft = bubbleButton ? parseInt(bubbleButton.style.left || "20", 10) : 20;

    toast.style.top = `${clamp(anchorTop - 42, 8, window.innerHeight - 36)}px`;
    toast.style.left = `${clamp(anchorLeft - 188, 8, window.innerWidth - 280)}px`;

    document.documentElement.appendChild(toast);

    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }

    toastTimeout = window.setTimeout(() => {
      toast.remove();
      toastTimeout = null;
    }, isError ? 3400 : 2200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
