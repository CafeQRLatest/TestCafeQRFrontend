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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

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
```

`GEMINI_MODELS` is tried from left to right for menu imports. `gemini-2.5-flash-lite` is the best first choice for this hosted image-to-menu task because it is fast and high-throughput; `gemini-2.5-flash` remains the stronger fallback. You can still set `GEMINI_MODEL=gemini-2.5-flash` if you want one preferred model, but `GEMINI_MODELS` gives better failover.

When multiple keys are configured, the route starts each warm request from a different key. If Gemini returns a quota/rate-limit error for one key, that key is skipped temporarily and the next configured key is tried automatically. If a Gemini model returns a temporary high-demand/timeout/internal service error, the route moves to the next fallback model and returns HTTP 503 with a retryable message instead of masking it as a generic 500.
