create table if not exists public.license_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  business_name text not null default '',
  email text not null default '',
  seats integer not null default 1,
  package_code text not null default '',
  package_name text not null default '',
  source text not null default 'register_page',
  status text not null default 'new' check (status in ('new','reviewing','converted','rejected')),
  converted_organization_id uuid references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_license_requests_status
  on public.license_requests(status, created_at desc);

create index if not exists idx_license_requests_email
  on public.license_requests(email, created_at desc);

alter table public.license_requests enable row level security;

drop policy if exists license_requests_master on public.license_requests;
create policy license_requests_master
  on public.license_requests
  for all
  to authenticated
  using (public.netvyl_is_platform_super_admin())
  with check (public.netvyl_is_platform_super_admin());

drop policy if exists license_requests_public_insert on public.license_requests;
create policy license_requests_public_insert
  on public.license_requests
  for insert
  to anon
  with check (true);

create or replace function public.touch_license_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_license_requests_updated_at on public.license_requests;
create trigger trg_license_requests_updated_at
before update on public.license_requests
for each row
execute function public.touch_license_request_updated_at();
