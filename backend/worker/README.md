# Finconsult API Worker

This is the first backend slice for Finconsult. It deliberately contains only:

- `GET /api/health` — public health check.
- `GET /api/me` — validates a Supabase access token and returns the authenticated user's ID and email.
- CORS allowlisting for the configured frontend origins.

It does **not** yet implement database tables, admin permissions, payments, AI-provider calls, or financial-data storage.

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

The publishable/anon key is designed for client use; it is **not** a service-role key. Do not put a Supabase `service_role` or secret key in this project.

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

Before deploying, edit `wrangler.jsonc` and replace `https://YOUR-PRODUCTION-DOMAIN` with the exact production frontend origin (scheme + hostname, no trailing slash or path).

Set each environment's Supabase values as Worker secrets. From this directory:

```sh
npx wrangler secret put SUPABASE_URL --env dev
npx wrangler secret put SUPABASE_ANON_KEY --env dev

npx wrangler secret put SUPABASE_URL --env production
npx wrangler secret put SUPABASE_ANON_KEY --env production
```

Use the matching Supabase project for each environment. Ideally, create separate Supabase projects for development and production so test data and credentials cannot affect production.

Deploy the development Worker:

```sh
npm run deploy:dev
```

Deploy production only when the production frontend origin and production Supabase project are configured:

```sh
npm run deploy:production
```

## 5. Frontend integration

The frontend should send the current Supabase access token as a bearer token:

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
- Never expose provider API keys, Supabase service-role keys, or other privileged credentials in browser code.
- CORS is a browser access control, not authentication. Every protected endpoint must still authenticate and authorize each request.
- `/api/me` validates identity only. It does not grant admin access.
- Do not trust a role or `isAdmin` value sent by the browser. Admin authorization must be checked by the Worker against trusted server-side data before adding admin endpoints.
- Add Row Level Security (RLS) policies before exposing user-owned database tables to the frontend.
