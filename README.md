# PromptPilot Optimizer (Chrome Extension, MV3)

PromptPilot adds a floating optimize bubble beside prompt composers on ChatGPT, Claude, and Gemini. It rewrites your draft through a Vercel proxy that forwards to NVIDIA Kimi 2.5.

## Folder

`/Users/charlietaylor/Documents/PromptPilot-Optimizer`

## Deploy Proxy (Vercel)

1. Push this repo to GitHub.
2. Create/import the project in Vercel.
3. Ensure the serverless function exists at `api/proxy.js`.
4. In Vercel project environment variables, set:
   - `API_KEY` = your NVIDIA API key
   - `EXTENSION_SECRET` = your private shared secret
5. Deploy and copy your Vercel URL, for example: `https://your-vercel-project.vercel.app`.

## Extension Setup

1. Open [background.js](/Users/charlietaylor/Documents/PromptPilot-Optimizer/background.js).
2. Set:
   - `VERCEL_PROXY_URL` to `https://your-vercel-project.vercel.app/api/proxy`
   - `BUILT_IN_EXTENSION_SECRET` to the same value as Vercel `EXTENSION_SECRET`
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select `PromptPilot-Optimizer`.
6. Reload the extension after changes.

## Popup Controls

- The extension popup provides a **Fast Mode** toggle.
- Fast Mode is stored in `chrome.storage.local` and applies to all optimizations.

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

## Environment Example

See `.env.example` for required proxy variables:

- `API_KEY`
- `EXTENSION_SECRET`

## Notes

- Model: `moonshotai/kimi-k2.5`
- Proxy endpoint path: `/api/proxy`
- If optimization fails, the original prompt remains unchanged.
- Do not commit real secrets to GitHub.
