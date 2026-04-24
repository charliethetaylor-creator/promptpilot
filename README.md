# PromptPilot Optimizer (Chrome Extension, MV3)

PromptPilot adds a floating optimize bubble beside prompt composers on ChatGPT, Claude, and Gemini. It rewrites your draft using NVIDIA Kimi 2.5.

## setup

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `PromptPilot-Optimizer`.

## Popup Controls

- The extension popup now provides a **Fast Mode** toggle (logo color scheme UI).
- Fast Mode is stored in `chrome.storage.local` and applies to all optimizations.
- developers note - the fast mode rarely works right now so there is little point in using it at the moment

## Fast Mode Behavior

When enabled, PromptPilot applies speed-focused behavior:

- Lower token cap (`max_tokens` reduced)
- Shorter rewrite instructions
- Reduced context payload (no URL metadata)
- Shorter request timeout
- Short-term exact-prompt cache for repeated rewrites

## Usage

1. Go to ChatGPT, Claude, or Gemini.
2. Type a prompt.
3. Click the floating bubble.
4. Wait for shimmer loading to finish.
5. Your prompt is replaced with the optimized version.

## Notes

- Model: `moonshotai/kimi-k2.5`
- Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`
- Built-in key mode is convenient for local use but not secure for public distribution.
- If optimization fails, the original prompt remains unchanged.
# promptpilot
