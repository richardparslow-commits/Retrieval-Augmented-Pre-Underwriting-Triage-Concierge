# Retrieval-Augmented-Pre-Underwriting-Triage-Concierge

React/TypeScript chat widget for educational life-insurance guidance and optional, non-binding pre-underwriting information collection.

## Development and build

```sh
npm install
npm run dev
npm run build
```

The Vite build compiles `src/main.tsx` into `dist/widget.js`, a single IIFE JavaScript bundle with all styles injected into the JS via `vite-plugin-css-injected-by-js`. Upload that file to WordPress and add:

```html
<script src="/path-to/widget.js" defer></script>
<div id="ai-chat-root"></div>
```

The script also creates `#ai-chat-root` if the container is omitted, and will not mount twice if executed more than once. The same `ChatWidget` component can be mounted in a React/Next.js app from `src/ChatWidget.tsx`.

## Brand palette

The color palette is defined once in `tailwind.config.js` under `theme.extend.colors.brand`:

| Token | Value | Usage |
| --- | --- | --- |
| `brand.bg` | `#E2E8F0` | Backgrounds |
| `brand.accent` | `#485B61` | Borders and accents |
| `brand.alert` | `#CC0700` | Headings and alerts |
| `brand.primary` | `#414C32` | Primary buttons |

Tailwind v4 loads the config from `src/styles.css` via the `@config` directive, and the widget's stylesheet references these tokens through `theme('colors.brand.*')`.

## Service integration

Mount `handleChatRequest` from `server/chatRoute.ts` at `POST /api/chat`. It retrieves matching starter FAQ text, calls an OpenAI-compatible endpoint on the server, and returns `{ "reply": "..." }`. Configure `OPENAI_API_KEY`, and optionally `OPENAI_COMPATIBLE_URL` and `OPENAI_MODEL`, only in the server environment. Replace or extend the starter retrieval corpus with approved site content.

Mount `handleWebhookRequest` from `server/webhookRoute.ts` at `POST /api/lead`. Configure `CRM_WEBHOOK_URL` and `CRM_WEBHOOK_SECRET` only in the server environment. The route requires affirmative collection consent and valid contact information, sends a restricted JSON payload over HTTPS, and never exposes the CRM secret to the browser. The widget emits `pre_underwriting_handoff` to the browser `dataLayer` after a successful handoff.

Set `VITE_SCHEDULING_URL` at build time to the licensed professional's scheduling page. In Next.js, import `src/styles.css` from the app's global stylesheet entry and mount the component. The widget does not provide binding quotes, legal declarations, or underwriting guarantees; estate and trust questions are redirected to a human expert.
