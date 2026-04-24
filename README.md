# PromptPilot Optimizer (Chrome Extension, MV3)

an ai made for ai. it takes your prompt used in chatbots on the web and optimises it to give the best result.

## what it can do 



<img width="601" height="124" alt="Screenshot 2026-04-24 at 06 57 37" src="https://github.com/user-attachments/assets/cef86809-a847-4cd1-afa3-97ba6838c814" />


<img width="195" height="262" alt="Screenshot 2026-04-24 at 07 02 01" src="https://github.com/user-attachments/assets/8b4bb877-d266-43a5-91b1-0d5acd54bcc8" />


<img width="604" height="160" alt="Screenshot 2026-04-24 at 07 00 01" src="https://github.com/user-attachments/assets/1e91b40a-2639-42d9-9370-27bf773a28b5" />




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
