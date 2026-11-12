# Finconsult Admin Pages project

This directory is the separate Cloudflare Pages app for the administration interface.

## Cloudflare Pages settings

- Root directory: `admin`
- Build command: `npm run build`
- Build output directory: `dist`
- Build variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (used only for first-time password setup and recovery)
- Pages Function variable: `WORKER_API_BASE_URL`, set to the matching Finconsult Worker URL

Routine admin sign-in uses a server-issued, eight-hour HttpOnly session cookie. The Pages Function at `functions/api/[[path]].ts` proxies `/api/*` to the Worker so the cookie remains first-party. Do not place a Supabase secret/service-role key in Pages variables.

Add the admin Pages origin (scheme + hostname, no path) to the Worker `ALLOWED_ORIGINS` value. The production config has a placeholder for this domain. If using Pages preview domains, add only the specific preview origins needed; the Worker allowlist uses exact origins.

Admin passwords are stored as bcrypt hashes in `public.admin_users.password_hash`; PostgreSQL `pgcrypto` generates a distinct salt for every password and embeds it in the bcrypt string. The Data API excludes the password hash from authenticated grants. Only the Worker service role can call the password verification and update functions. Sessions use random, hashed tokens in D1 and are revoked on sign-out or after eight hours. Failed attempts are rate-limited by an email digest in D1.

For first-time setup or password recovery, choose **Set or reset admin password**, verify with the existing Supabase Auth account, then choose a new admin password. Supabase Auth is not used for routine sign-ins.

## Configure admin roles in the non-production Supabase project

The non-production project has the admin role table and the password credential migration. Apply both [`202611120001_admin_users.sql`](../supabase/migrations/202611120001_admin_users.sql) and [`20261112155953_admin_password_credentials.sql`](../supabase/migrations/20261112155953_admin_password_credentials.sql) to any separate project before using it. Grant admin roles only through a trusted database session:

```sh
INSERT INTO public.admin_users (email, role)
VALUES (lower('YOUR_ADMIN_EMAIL'), 'owner')
ON CONFLICT (email) DO UPDATE SET role = excluded.role;
```

For password setup and recovery, a matching Supabase Auth account must exist. `owner` and `admin` can review/dismiss detected source changes; `analyst` has read-only queue access. Manage roles only through a trusted database session; there is no public role-management endpoint.

The Loan Source Review section displays captured page text from local D1 and records each review action in its D1 `audit_log`. The admin role lookup uses the configured Supabase project. Marking a change reviewed or dismissed does not publish or alter loan offers.
