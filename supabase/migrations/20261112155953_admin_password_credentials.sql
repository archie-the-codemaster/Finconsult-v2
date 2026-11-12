alter table public.admin_users
  add column if not exists password_hash text;

-- The bcrypt string contains both the generated salt and work factor.
-- Keep the helpers private to the Worker service role; never expose hashes
-- or password verification through the browser-facing Data API.
revoke all on table public.admin_users from anon, authenticated, service_role;
grant select (email, role, created_at) on table public.admin_users to authenticated;
grant select (email, role, created_at, password_hash) on table public.admin_users to service_role;
grant update (password_hash) on table public.admin_users to service_role;

create or replace function public.set_admin_password(p_email text, p_password text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if p_password is null
    or char_length(p_password) < 12
    or octet_length(p_password) > 72 then
    raise exception using
      errcode = '22023',
      message = 'Password must be at least 12 characters and no more than 72 UTF-8 bytes';
  end if;

  update public.admin_users
  set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 12))
  where email = lower(trim(p_email));

  return found;
end;
$$;

create or replace function public.verify_admin_password(p_email text, p_password text)
returns table(email text, role text)
language sql
security invoker
set search_path = pg_catalog
as $$
  select admin.email, admin.role
  from public.admin_users as admin
  where admin.email = lower(trim(p_email))
    and admin.password_hash is not null
    and admin.password_hash = extensions.crypt(p_password, admin.password_hash)
$$;

revoke all on function public.set_admin_password(text, text) from public, anon, authenticated;
revoke all on function public.verify_admin_password(text, text) from public, anon, authenticated;
grant execute on function public.set_admin_password(text, text) to service_role;
grant execute on function public.verify_admin_password(text, text) to service_role;
