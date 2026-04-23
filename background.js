const MODEL = "moonshotai/kimi-k2.5";
const API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// Built-in key mode: paste your NVIDIA key here.
const BUILT_IN_NVIDIA_API_KEY = "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";
const STORAGE_FAST_MODE_KEY = "fastModeEnabled";

const NORMAL_MODE_CONFIG = {
  temperature: 0.2,
  topP: 0.8,
  maxTokens: 900,
  timeoutMs: 25000
};

const FAST_MODE_CONFIG = {
  temperature: 0.1,
  topP: 0.7,
  maxTokens: 320,
  timeoutMs: 12000
};

const NORMAL_SYSTEM_PROMPT = [
  "You are a prompt rewriting engine.",
  "Your ONLY job is to rewrite the user's prompt to be clearer and more effective.",
  "You MUST preserve the user's intent.",
  "You MUST NOT answer the prompt.",
  "You MUST NOT introduce unrelated topics.",
  "Ignore page title or any assumed prior chat context unless it appears in ORIGINAL_PROMPT.",
  "Return only the rewritten prompt text. No labels, no commentary, no quotes around the whole output."
].join(" ");

const FAST_SYSTEM_PROMPT = [
  "Rewrite prompt only.",
  "Preserve intent and language.",
  "Do not answer.",
  "No extra text.",
  "Return rewritten prompt only."
].join(" ");

const FAST_CACHE_TTL_MS = 3 * 60 * 1000;
const FAST_CACHE_MAX_ENTRIES = 120;
const fastModeCache = new Map();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    console.log("Extension installed");
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OPTIMIZE_PROMPT") {
    optimizePrompt(message.prompt, {
      pageUrl: message.pageUrl
    })
      .then((optimizedPrompt) => {
        sendResponse({ ok: true, optimizedPrompt });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Optimization failed" });
      });
    return true;
  }

  if (message?.type === "PING") {
    sendResponse({ ok: true, message: "Service worker alive" });
    return undefined;
  }

  if (message?.type === "GET_FAST_MODE") {
    getFastModeEnabled()
      .then((enabled) => sendResponse({ ok: true, enabled }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Failed to read fast mode" }));
    return true;
  }

  return undefined;
});

function getBuiltInApiKey() {
  const raw = (BUILT_IN_NVIDIA_API_KEY || "").trim();

  if (!raw || raw === "PASTE_YOUR_NVIDIA_API_KEY_HERE") {
    return "";
  }

  // Accept accidental wrapper text and extract the real token.
  const extracted = raw.match(/nvapi-[A-Za-z0-9_-]+/);
  return extracted ? extracted[0] : raw;
}

function isLikelyNvidiaKey(value) {
  return /^nvapi-[A-Za-z0-9_-]{20,}$/.test(value || "");
}

async function getFastModeEnabled() {
  try {
    const result = await chrome.storage.local.get([STORAGE_FAST_MODE_KEY]);
    return Boolean(result?.[STORAGE_FAST_MODE_KEY]);
  } catch (_error) {
    return false;
  }
}

async function optimizePrompt(inputPrompt, context = {}) {
  const prompt = (inputPrompt || "").trim();
  if (!prompt) {
    throw new Error("Prompt is empty");
  }

  const apiKey = getBuiltInApiKey();
  if (!apiKey) {
    throw new Error("Missing built-in NVIDIA API key. Set BUILT_IN_NVIDIA_API_KEY in background.js.");
  }

  if (!isLikelyNvidiaKey(apiKey)) {
    throw new Error("Invalid built-in NVIDIA API key format. Use only the raw nvapi-... token in background.js.");
  }

  const fastModeEnabled = await getFastModeEnabled();
  const modeConfig = fastModeEnabled ? FAST_MODE_CONFIG : NORMAL_MODE_CONFIG;

  if (fastModeEnabled) {
    const cached = getFastModeCache(prompt);
    if (cached) {
      return cached;
    }
  }

  const requestBody = {
    model: MODEL,
    temperature: modeConfig.temperature,
    top_p: modeConfig.topP,
    max_tokens: modeConfig.maxTokens,
    chat_template_kwargs: {
      thinking: false
    },
    messages: [
      {
        role: "system",
        content: fastModeEnabled ? FAST_SYSTEM_PROMPT : NORMAL_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: buildOptimizationInstruction(prompt, context, fastModeEnabled)
      }
    ]
  };

  const payload = await requestNvidiaRewrite(apiKey, requestBody, modeConfig.timeoutMs);

  const text = payload?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("No optimized prompt returned by model");
  }

  const optimized = postProcessOptimizedPrompt(prompt, text);

  if (fastModeEnabled) {
    setFastModeCache(prompt, optimized);
  }

  return optimized;
}

async function requestNvidiaRewrite(apiKey, requestBody, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Optimization request timed out. Try turning Fast Mode off for large prompts.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.detail ||
      `NVIDIA API request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

function buildOptimizationInstruction(prompt, context, fastModeEnabled) {
  if (fastModeEnabled) {
    return [
      "Rewrite this prompt to be clearer and more effective.",
      "Keep intent and language.",
      "Return rewritten prompt only.",
      "",
      "PROMPT:",
      '"""',
      prompt,
      '"""'
    ].join("\n");
  }

  const url = normalizeUrl(context?.pageUrl);

  const lines = [
    "Please optimize this prompt for me for this AI chatbot:",
    url || "Unknown URL",
    "",
    "The prompt is:",
    '"""',
    prompt,
    '"""',
    "",
    "Guidelines:",
    "1) Rewrite the prompt only. Do not answer it.",
    "2) Preserve the original intent and concrete details.",
    "3) Improve clarity, specificity, and desired output format.",
    "4) Do not pull topic/context from page title or previous conversation unless explicitly in the prompt.",
    "5) Return only the rewritten prompt text."
  ];

  return lines.join("\n");
}

function normalizeUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch (_error) {
    return raw;
  }
}

function getFastModeCache(prompt) {
  const key = prompt.trim();
  const entry = fastModeCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    fastModeCache.delete(key);
    return null;
  }

  // Refresh insertion order for active entries.
  fastModeCache.delete(key);
  fastModeCache.set(key, entry);
  return entry.value;
}

function setFastModeCache(prompt, optimizedPrompt) {
  const key = prompt.trim();
  if (!key || !optimizedPrompt) {
    return;
  }

  purgeExpiredFastModeCache();

  if (fastModeCache.size >= FAST_CACHE_MAX_ENTRIES) {
    const oldestKey = fastModeCache.keys().next().value;
    if (oldestKey) {
      fastModeCache.delete(oldestKey);
    }
  }

  fastModeCache.set(key, {
    value: optimizedPrompt,
    expiresAt: Date.now() + FAST_CACHE_TTL_MS
  });
}

function purgeExpiredFastModeCache() {
  const now = Date.now();
  for (const [key, entry] of fastModeCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      fastModeCache.delete(key);
    }
  }
}

function postProcessOptimizedPrompt(originalPrompt, modelText) {
  let cleaned = sanitizeModelText(modelText);

  if (!cleaned) {
    return buildSafeFallback(originalPrompt);
  }

  if (looksLikeDirectAnswer(cleaned)) {
    return buildSafeFallback(originalPrompt);
  }

  return cleaned;
}

function sanitizeModelText(text) {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }

  cleaned = cleaned.replace(/^<optimized_prompt>\s*/i, "").replace(/\s*<\/optimized_prompt>$/i, "").trim();

  cleaned = cleaned
    .replace(/^(optimized|rewritten|improved)\s+prompt\s*:\s*/i, "")
    .replace(/^based on .*?(optimized|rewritten|improved)\s+prompt\s*:\s*/i, "")
    .replace(/^here(?:'|’)s\s+(?:an\s+)?(?:optimized|rewritten|improved)\s+prompt\s*:\s*/i, "")
    .trim();

  const quotedTailMatch = cleaned.match(/^[\s\S]*?["“]([\s\S]+)["”]\s*$/);
  if (quotedTailMatch && /^[\s\S]*?(optimized|rewritten|improved|context)/i.test(cleaned)) {
    cleaned = quotedTailMatch[1].trim();
  }

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned;
}

function looksLikeDirectAnswer(text) {
  const lower = text.toLowerCase();
  return (
    lower.startsWith("i'm an ai") ||
    lower.startsWith("i am an ai") ||
    lower.includes("here are some of my main capabilities") ||
    lower.includes("what would you like help with")
  );
}

function buildSafeFallback(originalPrompt) {
  return [
    "Please answer the following user request clearly and directly.",
    "If useful, provide a concise bullet-point response.",
    "",
    originalPrompt
  ].join("\n");
}
