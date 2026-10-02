-- Shared platform app configuration table
-- This keeps master-admin-controlled UI and feature settings separate from customer business records.

create table if not exists public.platform_app_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

alter table public.platform_app_settings enable row level security;

drop policy if exists platform_app_settings_read_all on public.platform_app_settings;
create policy platform_app_settings_read_all
on public.platform_app_settings
for select
using (true);

drop policy if exists platform_app_settings_write_master_admin on public.platform_app_settings;
create policy platform_app_settings_write_master_admin
on public.platform_app_settings
for insert
with check (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.active = true
      and lower(om.role) = 'super_admin'
  )
);

drop policy if exists platform_app_settings_update_master_admin on public.platform_app_settings;
create policy platform_app_settings_update_master_admin
on public.platform_app_settings
for update
using (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.active = true
      and lower(om.role) = 'super_admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.active = true
      and lower(om.role) = 'super_admin'
  )
);

drop policy if exists platform_app_settings_delete_master_admin on public.platform_app_settings;
create policy platform_app_settings_delete_master_admin
on public.platform_app_settings
for delete
using (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.active = true
      and lower(om.role) = 'super_admin'
  )
);

create or replace function public.netvyl_get_platform_app_settings()
returns table(setting_key text, setting_value jsonb)
language sql
security definer
set search_path = public
as $$
  select setting_key, setting_value
  from public.platform_app_settings
  order by setting_key asc;
$$;

create or replace function public.netvyl_set_platform_app_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    exists (
      select 1
      from public.organization_members om
      where om.user_id = auth.uid()
        and om.active = true
        and lower(om.role) = 'super_admin'
    )
  ) then
    raise exception 'Platform Master Admin access required';
  end if;

  insert into public.platform_app_settings (setting_key, setting_value, updated_by)
  values (p_key, p_value, auth.uid())
  on conflict (setting_key)
  do update set
    setting_value = excluded.setting_value,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

-- Seed defaults so the app has a working baseline even before a Master Admin saves anything.
insert into public.platform_app_settings (setting_key, setting_value)
values
  ('app_name', '"NETVYL"'::jsonb),
  ('app_tagline', '"BUSINESS MANAGEMENT PLATFORM"'::jsonb),
  ('accent_color', '"#4f46e5"'::jsonb),
  ('theme_mode', '"dark"'::jsonb),
  ('enable_new_dashboard', 'true'::jsonb),
  ('enable_dtf_calculator', 'true'::jsonb),
  ('enable_inventory_labels', 'true'::jsonb),
  ('enable_global_branding', 'true'::jsonb),
  ('login_banner', '"Shared platform configuration is managed by the Master Admin."'::jsonb)
on conflict (setting_key) do nothing;

create or replace function public.netvyl_get_platform_app_release()
returns table(
  release_version text,
  minimum_supported_version text,
  is_force_update boolean,
  release_notes text,
  active boolean,
  published_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select release_version, minimum_supported_version, is_force_update, release_notes, active, published_at
  from public.platform_app_release
  where active = true
  order by published_at desc
  limit 1;
$$;

create or replace function public.netvyl_set_platform_app_release(
  p_release_version text,
  p_minimum_supported_version text,
  p_is_force_update boolean,
  p_release_notes text,
  p_active boolean
)
returns public.platform_app_release
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_app_release;
begin
  if not (
    exists (
      select 1
      from public.organization_members om
      where om.user_id = auth.uid()
        and om.active = true
        and lower(om.role) = 'super_admin'
    )
  ) then
    raise exception 'Platform Master Admin access required';
  end if;

  insert into public.platform_app_release (
    release_version,
    minimum_supported_version,
    is_force_update,
    release_notes,
    active,
    published_at
  )
  values (
    coalesce(p_release_version, '1.0.0-v36'),
    coalesce(p_minimum_supported_version, '1.0.0-v36'),
    coalesce(p_is_force_update, false),
    coalesce(p_release_notes, ''),
    coalesce(p_active, true),
    now()
  )
  on conflict (release_version)
  do update set
    minimum_supported_version = excluded.minimum_supported_version,
    is_force_update = excluded.is_force_update,
    release_notes = excluded.release_notes,
    active = excluded.active,
    published_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- Shared platform release / update state
create table if not exists public.platform_app_release (
  id uuid primary key default gen_random_uuid(),
  release_version text not null unique,
  minimum_supported_version text not null default '1.0.0-v36',
  is_force_update boolean not null default false,
  release_notes text not null default '',
  active boolean not null default true,
  published_at timestamptz not null default now()
);

alter table public.platform_app_release enable row level security;

drop policy if exists platform_app_release_read_all on public.platform_app_release;
create policy platform_app_release_read_all
on public.platform_app_release
for select
using (true);

drop policy if exists platform_app_release_insert_master_admin on public.platform_app_release;
create policy platform_app_release_insert_master_admin
on public.platform_app_release
for insert
with check (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.active = true
      and lower(om.role) = 'super_admin'
  )
);

drop policy if exists platform_app_release_update_master_admin on public.platform_app_release;
create policy platform_app_release_update_master_admin
on public.platform_app_release
for update
using (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.active = true
      and lower(om.role) = 'super_admin'
  )
)
with check (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.active = true
      and lower(om.role) = 'super_admin'
  )
);

drop policy if exists platform_app_release_delete_master_admin on public.platform_app_release;
create policy platform_app_release_delete_master_admin
on public.platform_app_release
for delete
using (
  exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.active = true
      and lower(om.role) = 'super_admin'
  )
);

insert into public.platform_app_release (release_version, minimum_supported_version, is_force_update, release_notes, active)
values ('1.0.0-v36', '1.0.0-v36', false, 'Current platform release is ready for use.', true)
on conflict (release_version) do nothing;
