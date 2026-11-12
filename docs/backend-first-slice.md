# Finconsult backend: first implementation slice

## Current responsibility split

- Cloudflare Pages: serves the frontend.
- Cloudflare Worker: API entry point and server-side request validation.
- Supabase Auth: user identity and session validation for the public app, and one-time admin password setup/recovery.
- Supabase Postgres: admin membership, bcrypt password hashes, and role lookup for the admin review API.
- D1: opaque, revocable admin sessions and login-attempt throttling.
- Supabase Postgres: database, to be introduced with explicit RLS policies.

## Implemented now

| Endpoint | Purpose | Access |
|---|---|---|
| `GET /api/health` | Check that the Worker is responding | Public |
| `GET /api/me` | Verify the Supabase bearer token and return basic identity | Authenticated |
| `POST /api/admin/auth/login` | Verify admin bcrypt credentials and create an HttpOnly session cookie | Public, rate-limited |
| `GET /api/admin/auth/session` | Return the current admin identity and role | Admin session |
| `POST /api/admin/auth/logout` | Revoke the current admin session | Admin session |
| `POST /api/admin/auth/password` | Set or reset an admin password after verifying the existing Supabase Auth account | Supabase Auth + admin role |
| `/api/admin/offer-changes` | Review monitored bank-page changes | Admin session + role |

## Intentionally deferred

- Profiles and account preferences
- Additional admin management pages
- Admin audit log improvements
- Financial dashboard data
- Bank-data comparison
- AI provider proxy and usage limits
- Premium entitlements and payments

These should be designed as separate slices rather than bundled into the first deployment.
