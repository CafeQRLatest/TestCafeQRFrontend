This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.js`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy On Vercel

This app is deployed as the CafeQR 2.0 frontend on Vercel. The backend is the Render service from `cafeqr-backend`.

Add these Vercel environment variables before production deploy:

```env
NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com
GEMINI_API_KEY=key1
# or
GEMINI_API_KEYS=key1,key2,key3
GEMINI_MODELS=gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.0-flash
NEXT_PUBLIC_AI_PARSE_URL=https://your-vercel-domain.vercel.app/api/ai/parse-menu
```

`NEXT_PUBLIC_API_URL` must not end with `/api`; the app already calls paths such as `/api/v1/auth/authenticate`.

## AI Menu Image Import

The product-management page uses the frontend API route `pages/api/ai/parse-menu.js`, so Gemini keys must be configured in the frontend hosting environment.

For Vercel, add this to the frontend project environment variables and redeploy:

```env
GEMINI_API_KEYS=key1,key2,key3,key4,key5
```

You can also use a single key:

```env
GEMINI_API_KEY=key1
```

Optional settings:

```env
GEMINI_MODELS=gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.0-flash
GEMINI_QUOTA_COOLDOWN_MS=43200000
GEMINI_AUTH_COOLDOWN_MS=3600000
NEXT_PUBLIC_AI_PARSE_URL=https://your-vercel-domain.vercel.app/api/ai/parse-menu
```

`GEMINI_MODELS` is tried from left to right for menu imports. `gemini-2.5-flash-lite` is the best first choice for this hosted image-to-menu task because it is fast and high-throughput; `gemini-2.5-flash` remains the stronger fallback. You can still set `GEMINI_MODEL=gemini-2.5-flash` if you want one preferred model, but `GEMINI_MODELS` gives better failover.

When multiple keys are configured, the route starts each warm request from a different key. If Gemini returns a quota/rate-limit error for one key, that key is skipped temporarily and the next configured key is tried automatically. If a Gemini model returns a temporary high-demand/timeout/internal service error, the route moves to the next fallback model and returns HTTP 503 with a retryable message instead of masking it as a generic 500.

## Offline First And Native Builds

The app now has the first offline-first layer:

- PWA manifest and service worker app-shell caching for Windows/browser/iOS PWA.
- IndexedDB storage for cached API reads, entity snapshots, sync metadata, and queued offline mutations.
- Offline-aware API wrapper that serves cached GET data when offline and queues supported mutations for later sync.
- Backend sync endpoints:
  - `GET /api/v1/sync/bootstrap`
  - `GET /api/v1/sync/changes?since=...`
  - `POST /api/v1/sync/push`
- Android Capacitor shell for debug APK/AAB preparation.

Web build:

```bash
npm run build
```

Native Android shell build:

```bash
npm run build:native
npm run cap:sync:android
cd android
gradlew.bat assembleDebug
```

The debug APK is generated under:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

For Android native builds, the static app shell cannot host Next.js API routes. Keep `NEXT_PUBLIC_AI_PARSE_URL` pointing to the hosted Vercel API route so online-only AI menu parsing still works from the APK.

Fresh login, Gmail OTP, Gemini menu parsing, online payments, and cloud reports that need other devices remain online-only. POS, table orders, catalog browsing/edits, bills, local printing, and queued changes are the target offline-capable flows.

## Development Notes

### Cleaning the `.next` Cache

If the dev server produces stale errors, missing chunk files (`vendor-chunks/next.js`), or unexpected `_error` work, reset the build cache:

```bash
# Stop the running dev server first, then:
Remove-Item -Recurse -Force .next
npm run dev
```

> **Do not run `npm run build` while `npm run dev` is running.** They share the `.next` directory and will corrupt each other's state.

### Service Worker in Dev Mode

The service worker (`public/service-worker.js`) only registers in **production mode** or when `?sw=1` is added to the URL. During `npm run dev`, it is **not active** — this is intentional because Next.js HMR and service worker caching conflict.

To test offline/PWA behavior locally:

```bash
npm run build
npm run start
# Open http://localhost:3000 — SW will register and cache the app shell.
# Then toggle DevTools → Network → Offline to simulate.
```

### Chrome DevTools `.well-known` 404

Chrome may request `/.well-known/appspecific/com.chrome.devtools.json` — this is internal Chrome DevTools noise. The 404 is **harmless** and is not a CafeQR error. The service worker bypasses all `/.well-known/` paths.

### Print Station Identification

The main print station laptop is identified by either:
- `CAFEQR_PRINT_STATION_ENABLED=1` in localStorage, or
- Saved Windows printer config (`PRINT_WIN_URL`, `PRINT_WIN_PRINTER_NAME`, etc.)

Staff phones without printer setup continue through the cloud print queue and must not attempt to reach `127.0.0.1` (the localhost print hub).
