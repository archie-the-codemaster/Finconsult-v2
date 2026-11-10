# Supabase setup notes

No database schema or admin-role table is created by this initial scaffold.

Create separate Supabase projects for development and production. Enable the authentication providers you intend to support, then put each project's URL and publishable/anon key into the matching Cloudflare Worker environment.

Before adding user data tables:

1. Decide which records are user-owned and which are shared.
2. Enable Row Level Security (RLS) on exposed tables.
3. Add policies that bind access to `auth.uid()`.
4. Keep privileged service-role/secret keys out of the frontend and out of this initial Worker.
5. Design admin authorization separately; a frontend-only admin flag is not a security boundary.
