# Finconsult backend: first implementation slice

## Current responsibility split

- Cloudflare Pages: serves the frontend.
- Cloudflare Worker: API entry point and server-side request validation.
- Supabase Auth: user identity and session validation.
- Supabase Postgres: database, to be introduced with explicit RLS policies.

## Implemented now

| Endpoint | Purpose | Access |
|---|---|---|
| `GET /api/health` | Check that the Worker is responding | Public |
| `GET /api/me` | Verify the Supabase bearer token and return basic identity | Authenticated |

## Intentionally deferred

- Profiles and account preferences
- Admin role storage and authorization
- Audit log
- Financial dashboard data
- Bank-data comparison
- AI provider proxy and usage limits
- Premium entitlements and payments

These should be designed as separate slices rather than bundled into the first deployment.
