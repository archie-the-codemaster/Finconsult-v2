create table if not exists public.admin_users (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('owner', 'admin', 'analyst')),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

revoke all on table public.admin_users from anon, authenticated, service_role;
grant select on table public.admin_users to authenticated, service_role;

create policy "Admins can read their own admin role"
  on public.admin_users
  for select
  to authenticated
  using (lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));
