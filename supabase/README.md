# Supabase setup notes

The initial scaffold did not create application tables.

The migrations create the admin membership/role table and bcrypt password credentials. The per-password salt is embedded in the bcrypt hash. The Data API cannot read the hash or call verification functions; only the Cloudflare Worker service role can. Routine admin login uses an HttpOnly Worker session cookie. The existing Supabase Auth account is used only to set or reset the admin password.

Create separate Supabase projects for development and production. Enable the authentication providers you intend to support, then put each project's URL and publishable/anon key into the matching Cloudflare Worker environment.

Before adding user data tables:

1. Decide which records are user-owned and which are shared.
2. Enable Row Level Security (RLS) on exposed tables.
3. Add policies that bind access to the authenticated user's email or `auth.uid()` as appropriate.
4. Keep privileged secret keys out of the frontend; the admin Worker uses its server-side `sb_secret_...` key only for password verification, password updates, and role lookup.
5. Design admin authorization separately; a frontend-only admin flag is not a security boundary.
