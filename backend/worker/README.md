# Finconsult API Worker

This is the first backend slice for Finconsult. It deliberately contains only:

- `GET /api/health` — public health check.
- `GET /api/me` — validates a Supabase access token and returns the authenticated user's ID and email.
- Admin password setup and login, with server-side bcrypt verification, revocable HttpOnly sessions, and role checks.
- Admin offer-change review endpoints, protected by the current admin session and role.
- CORS allowlisting for the configured frontend origins.
- A scheduled loan-source monitor that checks a small starter set of official bank product pages every 12 hours, fingerprints their readable text, and stores changes for review in D1.

The monitor detects page changes; it does not yet extract/approve loan terms or publish offers. Payments, AI-provider calls, and user financial-data storage are not implemented.

## 1. Requirements

- Node.js (current LTS recommended)
- npm
- A Cloudflare account with Workers access
- A Supabase project for the development environment

## 2. Install locally

From this directory:

```sh
npm install
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and fill in:

- `SUPABASE_URL`: your Supabase project URL.
- `SUPABASE_ANON_KEY`: your Supabase publishable key (`sb_publishable_...`) or legacy anon key.
- `SUPABASE_SECRET_KEY`: your Supabase secret key (`sb_secret_...`). This is required only by the Worker for admin credential verification and role lookup. The binding name `key_main` and legacy `SUPABASE_SERVICE_ROLE_KEY` are also accepted.

The publishable/anon key is designed for client use; it is **not** a server key. Keep `SUPABASE_SECRET_KEY` in `.dev.vars` or a Wrangler Worker secret. Never put it in Pages variables or browser code.

## 3. Run the Worker locally

```sh
npm run dev
```

Wrangler starts the local Worker using the `dev` environment. The example frontend origin is Vite's `http://localhost:5173`.

In another terminal, test:

```sh
curl -i http://localhost:8787/api/health
```

Expected response includes `{"ok":true,"service":"finconsult-api"}`.

To test the authenticated endpoint, sign in through the frontend/Supabase Auth and send the resulting access token:

```sh
curl -i \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  http://localhost:8787/api/me
```

A missing or invalid token should return HTTP 401.

## 4. Configure Cloudflare environments

The Worker has two named environments:

- `dev` → Worker name `finconsult-api-dev`
- `production` → Worker name `finconsult-api`

The Worker allowlist must contain the exact admin Pages origin (scheme + hostname, no trailing slash or path).

Set each environment's Supabase values as Worker secrets. From this directory:

```sh
npx wrangler secret put SUPABASE_URL --env dev
npx wrangler secret put SUPABASE_ANON_KEY --env dev
npx wrangler secret put SUPABASE_SECRET_KEY --env dev

npx wrangler secret put SUPABASE_URL --env production
npx wrangler secret put SUPABASE_ANON_KEY --env production
npx wrangler secret put SUPABASE_SECRET_KEY --env production
```

Use the matching Supabase project for each environment. Ideally, create separate Supabase projects for development and production so test data and credentials cannot affect production.
The secret key is used only by Worker code to verify/set bcrypt password hashes and look up admin roles. Never expose it in either Pages project.

Deploy the development Worker:

```sh
npm run deploy:dev
```

Deploy production only when the production frontend origin and production Supabase project are configured:

```sh
npm run deploy:production
```

## 5. Loan offer source monitoring

`src/offer-monitor.ts` contains the initial list of official product pages. Add or adjust entries there as bank sources are verified. The scheduled handler fetches them sequentially every 12 hours, sends conditional requests where supported, stores the latest check status in `monitored_sources`, and creates a `pending` row in `offer_source_changes` when the normalized page text changes. A bounded text excerpt is retained as evidence; no offer data is automatically published.

Apply the D1 migrations before running the scheduled monitor:

```sh
npx wrangler d1 migrations apply finconsult-admin --local
npx wrangler d1 migrations apply finconsult-admin --remote --env production
```

Inspect the review queue with Wrangler:

```sh
npx wrangler d1 execute finconsult-admin --remote --env production --command "SELECT c.id, s.bank, s.label, s.url, c.detected_at, c.review_status FROM offer_source_changes c JOIN monitored_sources s ON s.id = c.source_id ORDER BY c.detected_at DESC"
```

The dev Worker uses the separate `finconsult-admin-dev` D1 database; production uses `finconsult-admin`.

The starter monitor currently supports readable HTML pages only. PDF and spreadsheet source ingestion, structured field extraction, review UI, and bank-provided data feeds remain follow-up work. Check source terms and get permission/legal review before increasing collection frequency or relying on extracted terms commercially.

## 6. Frontend integration

The public user-facing frontend can send the current Supabase access token as a bearer token:

```ts
const { data } = await supabase.auth.getSession();
const accessToken = data.session?.access_token;

const response = await fetch(`${API_BASE_URL}/api/me`, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
```

Keep `API_BASE_URL` environment-specific in the frontend. Do not hardcode a development Worker URL into production builds.

## Security notes

- Never commit `.dev.vars`; it is ignored by Git.
- Never expose provider API keys, Supabase secret/service-role keys, or other privileged credentials in browser code.
- CORS is a browser access control, not authentication. Every protected endpoint must still authenticate and authorize each request.
- `/api/me` validates identity only. It does not grant admin access.
- Do not trust a role or `isAdmin` value sent by the browser. Admin authorization must be checked by the Worker against trusted server-side data before adding admin endpoints.
- Add Row Level Security (RLS) policies before exposing user-owned database tables to the frontend.
