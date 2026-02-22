# Elisa OpenAI Proxy

Cloudflare Worker that proxies OpenAI API requests, keeping your API key secure while allowing workshop participants to use Elisa.

## Setup

```bash
cd proxy
npm install
```

## Configure

1. **Set your OpenAI API key as a secret:**
   ```bash
   wrangler secret put OPENAI_API_KEY
   # Paste your sk-... key when prompted
   ```

2. **Optionally change the workshop code** in `wrangler.toml`:
   ```toml
   [vars]
   WORKSHOP_CODE = "your-unique-code"
   ```

## Deploy

```bash
npm run deploy
```

You'll get a URL like: `https://elisa-openai-proxy.<your-subdomain>.workers.dev`

## Configure Elisa to use the proxy

In `backend/src/utils/openaiClient.ts`, change the base URL:

```typescript
const client = new OpenAI({
  apiKey: 'dummy-key-not-used',  // Key is on proxy
  baseURL: 'https://elisa-openai-proxy.<subdomain>.workers.dev/v1',
  defaultHeaders: {
    'X-Workshop-Code': 'your-workshop-code',
    'X-Student-Id': studentId,  // optional tracking
  },
});
```

Or set via environment variable in the Electron app.

## Local testing

```bash
npm run dev
# Worker runs at http://localhost:8787
```

## View logs

```bash
npm run tail
# See real-time logs from deployed worker
```

## Rate limiting (optional)

Add to wrangler.toml for per-student rate limiting:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "<your-kv-namespace-id>"
```

Then check/increment a counter per student ID in the worker.
