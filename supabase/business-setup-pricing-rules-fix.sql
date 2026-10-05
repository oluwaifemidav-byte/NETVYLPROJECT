-- Restore the V36 pricing configuration table when an existing database has
-- the other Business Setup tables but missed pricing_rules.
create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid references public.business_services(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  name text not null,
  pricing_basis text not null default 'fixed',
  rate numeric(14,4) not null default 0,
  minimum_charge numeric(14,2) not null default 0,
  formula jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pricing_rules_org
  on public.pricing_rules(organization_id, active);

alter table public.pricing_rules enable row level security;
drop policy if exists "v36 org read" on public.pricing_rules;
drop policy if exists "v36 org write" on public.pricing_rules;
drop policy if exists "v36 admin write" on public.pricing_rules;
create policy "v36 org read" on public.pricing_rules
  for select to authenticated
  using (organization_id in (select public.user_org_ids()) or public.is_platform_admin());
create policy "v36 admin write" on public.pricing_rules
  for all to authenticated
  using (public.netvyl_is_org_admin(organization_id))
  with check (public.netvyl_is_org_admin(organization_id));

grant select, insert, update, delete on public.pricing_rules to authenticated;
notify pgrst, 'reload schema';
