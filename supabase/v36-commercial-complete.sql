-- NETVYL V36 UNIFIED PLATFORM
-- Additive migration: keeps existing jobs/materials/payments intact while introducing
-- configurable services, universal inventory, job orders, recipes, workflows, quotes,
-- expenses, suppliers, purchasing, waste tracking and profitability foundations.

create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.netvyl_is_org_admin(p_org_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id=p_org_id and om.user_id=auth.uid()
      and om.active=true and om.role='administrator'
  ) or public.netvyl_has_support_access(p_org_id);
$$;

create or replace function public.netvyl_can_operate_org_v36(p_org_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.netvyl_has_support_access(p_org_id)
      or exists (
        select 1 from public.organization_members om
        where om.organization_id=p_org_id and om.user_id=auth.uid() and om.active=true
          and om.role in ('administrator','manager','staff','cashier','production','super_admin')
      );
$$;

-- ---------- configurable services ----------
create table if not exists public.business_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  category text not null default 'custom',
  description text,
  calculator_type text not null default 'generic',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, code)
);

create table if not exists public.service_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null references public.business_services(id) on delete cascade,
  name text not null,
  attributes jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(service_id,name)
);

-- ---------- universal inventory ----------
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text,
  category text not null default 'material',
  item_kind text not null default 'material' check(item_kind in ('material','product','consumable','service_component')),
  base_unit text not null default 'piece',
  cost_per_unit numeric(14,4) not null default 0,
  sell_price numeric(14,4) not null default 0,
  opening_stock numeric(18,6) not null default 0,
  current_stock numeric(18,6) not null default 0,
  reserved_stock numeric(18,6) not null default 0,
  reorder_level numeric(18,6) not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,name)
);

create table if not exists public.inventory_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  name text not null,
  sku text,
  attributes jsonb not null default '{}'::jsonb,
  stock numeric(18,6) not null default 0,
  cost_per_unit numeric(14,4) not null default 0,
  sell_price numeric(14,4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(inventory_item_id,name)
);

create table if not exists public.inventory_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  from_unit text not null,
  to_unit text not null,
  multiplier numeric(18,8) not null,
  created_at timestamptz not null default now(),
  unique(inventory_item_id,from_unit,to_unit)
);

-- ---------- pricing and recipes ----------
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

create table if not exists public.production_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  service_id uuid references public.business_services(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id,name)
);

create table if not exists public.production_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.production_workflows(id) on delete cascade,
  name text not null,
  step_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workflow_id,step_order)
);

create table if not exists public.service_recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null references public.business_services(id) on delete cascade,
  name text not null,
  workflow_id uuid references public.production_workflows(id) on delete set null,
  rules jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(service_id,name)
);

create table if not exists public.service_recipe_components (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.service_recipes(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  component_name text not null,
  quantity_formula jsonb not null default '{}'::jsonb,
  cost_behavior text not null default 'actual',
  created_at timestamptz not null default now()
);

-- ---------- generalized orders/jobs ----------
create table if not exists public.job_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_no text not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name_snapshot text not null default '',
  status text not null default 'draft',
  priority text not null default 'normal',
  due_at timestamptz,
  notes text,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  estimated_cost numeric(14,2) not null default 0,
  actual_cost numeric(14,2) not null default 0,
  estimated_profit numeric(14,2) not null default 0,
  actual_profit numeric(14,2) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,order_no)
);

create table if not exists public.job_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.job_orders(id) on delete cascade,
  legacy_job_id uuid references public.jobs(id) on delete set null,
  service_id uuid references public.business_services(id) on delete set null,
  recipe_id uuid references public.service_recipes(id) on delete set null,
  description text not null default '',
  specifications jsonb not null default '{}'::jsonb,
  quantity numeric(18,6) not null default 1,
  unit text not null default 'piece',
  unit_price numeric(14,4) not null default 0,
  line_total numeric(14,2) not null default 0,
  estimated_cost numeric(14,2) not null default 0,
  actual_cost numeric(14,2) not null default 0,
  waste_cost numeric(14,2) not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_line_costs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_line_id uuid not null references public.job_lines(id) on delete cascade,
  cost_type text not null,
  description text,
  estimated_amount numeric(14,2) not null default 0,
  actual_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.job_waste (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid references public.job_orders(id) on delete cascade,
  job_line_id uuid references public.job_lines(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  quantity numeric(18,6) not null default 0,
  unit text not null default 'piece',
  reason text not null default 'other',
  cost numeric(14,2) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- quotes ----------
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_no text not null,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'draft',
  valid_until date,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,quote_no)
);

create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  service_id uuid references public.business_services(id) on delete set null,
  description text not null,
  quantity numeric(18,6) not null default 1,
  unit text not null default 'piece',
  unit_price numeric(14,4) not null default 0,
  line_total numeric(14,2) not null default 0,
  specifications jsonb not null default '{}'::jsonb
);

-- ---------- suppliers/purchases/expenses ----------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id,name)
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  po_no text not null,
  status text not null default 'draft',
  total numeric(14,2) not null default 0,
  ordered_at date,
  received_at date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(organization_id,po_no)
);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  quantity numeric(18,6) not null default 0,
  unit text not null default 'piece',
  unit_cost numeric(14,4) not null default 0,
  line_total numeric(14,2) not null default 0
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null,
  description text not null,
  amount numeric(14,2) not null,
  expense_date date not null default current_date,
  payment_method text,
  reference text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- indexes ----------
create index if not exists idx_services_org on public.business_services(organization_id,active);
create index if not exists idx_inventory_items_org on public.inventory_items(organization_id,active);
create index if not exists idx_job_orders_org_date on public.job_orders(organization_id,created_at desc);
create index if not exists idx_job_lines_order on public.job_lines(order_id);
create index if not exists idx_quotes_org_date on public.quotes(organization_id,created_at desc);
create index if not exists idx_expenses_org_date on public.expenses(organization_id,expense_date desc);
create index if not exists idx_waste_org_date on public.job_waste(organization_id,created_at desc);

-- ---------- RLS ----------

do $$ declare t text; begin
  foreach t in array array['business_services','service_variants','inventory_items','inventory_variants','inventory_unit_conversions','pricing_rules','production_workflows','production_workflow_steps','service_recipes','service_recipe_components','job_orders','job_lines','job_line_costs','job_waste','quotes','quote_lines','suppliers','purchase_orders','purchase_order_lines','expenses'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists "v36 org read" on public.%I',t);
    execute format('drop policy if exists "v36 org write" on public.%I',t);
    execute format('create policy "v36 org read" on public.%I for select to authenticated using (organization_id in (select public.user_org_ids()) or public.is_platform_admin())',t);
    execute format('create policy "v36 org write" on public.%I for all to authenticated using (public.netvyl_can_operate_org_v36(organization_id)) with check (public.netvyl_can_operate_org_v36(organization_id))',t);
  end loop;
end $$;

-- Company administrators/support only for configuration/destructive domains.
do $$ declare t text; begin
  foreach t in array array['business_services','service_variants','inventory_items','inventory_variants','inventory_unit_conversions','pricing_rules','production_workflows','production_workflow_steps','service_recipes','service_recipe_components','suppliers','purchase_orders','purchase_order_lines','expenses'] loop
    execute format('drop policy if exists "v36 org write" on public.%I',t);
    execute format('create policy "v36 admin write" on public.%I for all to authenticated using (public.netvyl_is_org_admin(organization_id)) with check (public.netvyl_is_org_admin(organization_id))',t);
  end loop;
end $$;

-- Existing materials are mirrored into the generalized inventory layer. This is intentionally
-- insert-only and does not alter current_length_ft; existing production remains authoritative.
insert into public.inventory_items(organization_id,name,category,item_kind,base_unit,cost_per_unit,sell_price,opening_stock,current_stock,reorder_level,metadata)
select m.organization_id,m.name,'large_format','material','ft',0,m.price_per_sqft,m.initial_length_ft,m.current_length_ft,0,jsonb_build_object('legacy_material_id',m.id,'roll_width_ft',m.roll_width_ft)
from public.materials m
where not exists(select 1 from public.inventory_items i where i.organization_id=m.organization_id and i.name=m.name);

-- Default services for existing organizations, without overwriting customer configuration.
insert into public.business_services(organization_id,name,code,category,calculator_type,sort_order)
select o.id,v.name,v.code,v.category,v.calc,v.sort_order
from public.organizations o
cross join (values
 ('Large Format','large_format','printing','large_format',10),
 ('DTF Printing','dtf','apparel','dtf',20),
 ('Direct Image','direct_image','printing','direct_image',30)
) v(name,code,category,calc,sort_order)
where not exists(select 1 from public.business_services s where s.organization_id=o.id and s.code=v.code);

-- Default legacy-compatible Print & Cut rule is data, not application code.
insert into public.pricing_rules(organization_id,name,pricing_basis,rate,minimum_charge)
select o.id,'Print & Cut','per_sqft',180,0 from public.organizations o
where not exists(select 1 from public.pricing_rules p where p.organization_id=o.id and lower(p.name)=lower('Print & Cut'));

-- Default workflow templates for the three core services.
do $$ declare o record; s uuid; w uuid; step text; n int; begin
  for o in select id from public.organizations loop
    for s in select id from public.business_services where organization_id=o.id and code in ('large_format','dtf','direct_image') loop
      if not exists(select 1 from public.production_workflows where organization_id=o.id and service_id=s.id) then
        insert into public.production_workflows(organization_id,name,service_id) values(o.id,
          case (select code from public.business_services where id=s.id) when 'large_format' then 'Large Format Standard' when 'dtf' then 'DTF Standard' else 'Direct Image Standard' end,s.id) returning id into w;
        n:=0;
        for step in select * from unnest(case (select code from public.business_services where id=s.id)
          when 'large_format' then array['Artwork','Preflight','Printing','Cutting','Finishing','Quality Control','Ready']
          when 'dtf' then array['Artwork','Gang Sheet','Film Printing','Powder','Curing','Heat Press','Quality Control','Packaging','Ready']
          else array['Artwork','Preflight','Printing','Cutting','Lamination','Binding/Finishing','Quality Control','Ready'] end) loop
          n:=n+1; insert into public.production_workflow_steps(workflow_id,name,step_order) values(w,step,n);
        end loop;
      end if;
    end loop;
  end loop;
end $$;

-- Profit helper: revenue minus actual direct cost and recorded waste.
create or replace function public.netvyl_recalculate_order_profit(p_order_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare o public.job_orders%rowtype; c numeric; w numeric; begin
 select * into o from public.job_orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 select coalesce(sum(actual_cost),0) into c from public.job_lines where order_id=p_order_id;
 select coalesce(sum(cost),0) into w from public.job_waste where order_id=p_order_id;
 update public.job_orders set actual_cost=c+w, actual_profit=grand_total-(c+w), updated_at=now() where id=p_order_id;
end $$;

-- Organization-scoped reset wrapper for the new data domains.
create or replace function public.netvyl_reset_v36_operational_data(p_org_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if not public.netvyl_is_org_admin(p_org_id) then raise exception 'Company administrator access required'; end if;
  delete from public.job_waste where organization_id=p_org_id;
  delete from public.job_line_costs where organization_id=p_org_id;
  delete from public.job_lines where organization_id=p_org_id;
  delete from public.job_orders where organization_id=p_org_id;
  delete from public.quote_lines where organization_id=p_org_id;
  delete from public.quotes where organization_id=p_org_id;
  delete from public.expenses where organization_id=p_org_id;
  delete from public.purchase_order_lines where organization_id=p_org_id;
  delete from public.purchase_orders where organization_id=p_org_id;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,details)
  values(p_org_id,auth.uid(),'v36_operational_reset','organization',jsonb_build_object('scope','v36_domains'));
end $$;

-- Keep migration source generic: no organization UUIDs are embedded here.

-- ---------- V36 customer-facing service order engine ----------
create or replace function public.create_unified_order_v36(
  p_organization_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_job_date date,
  p_due_at timestamptz default null,
  p_notes text default null,
  p_lines jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  v_order public.job_orders%rowtype;
  v_line jsonb;
  v_line_id uuid;
  v_no text;
  v_subtotal numeric:=0;
  v_cost numeric:=0;
  v_order_cost numeric:=0;
  v_consumption jsonb;
  v_item public.inventory_items%rowtype;
  v_qty numeric;
  v_unit text;
  v_line_total numeric;
  v_line_cost numeric;
  v_is_admin boolean;
begin
  if not public.netvyl_can_operate_org_v36(p_organization_id) then raise exception 'You do not have access to this organization'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id and organization_id=p_organization_id) then raise exception 'Customer does not belong to this organization'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'At least one order line is required'; end if;
  v_no := 'ORD-'||lpad((coalesce((select max(nullif(regexp_replace(order_no,'[^0-9]','','g'),'')::bigint) from public.job_orders where organization_id=p_organization_id),0)+1)::text,6,'0');
  insert into public.job_orders(organization_id,order_no,customer_id,customer_name_snapshot,status,priority,due_at,notes,created_by)
  values(p_organization_id,v_no,p_customer_id,p_customer_name,'pending','normal',p_due_at,p_notes,auth.uid()) returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_total:=coalesce((v_line->>'line_total')::numeric,0);
    v_line_cost:=coalesce((v_line->>'estimated_cost')::numeric,0);
    if v_line_total<=0 then raise exception 'Each line must have a positive selling price'; end if;
    insert into public.job_lines(organization_id,order_id,service_id,description,specifications,quantity,unit,unit_price,line_total,estimated_cost,actual_cost,status)
    values(p_organization_id,v_order.id,(v_line->>'service_id')::uuid,coalesce(v_line->>'description',''),coalesce(v_line->'specifications','{}'::jsonb),coalesce((v_line->>'quantity')::numeric,1),coalesce(v_line->>'unit','piece'),coalesce((v_line->>'unit_price')::numeric,0),v_line_total,v_line_cost,v_line_cost,'pending') returning id into v_line_id;
    v_subtotal:=v_subtotal+v_line_total; v_cost:=v_cost+v_line_cost;
    for v_consumption in select * from jsonb_array_elements(coalesce(v_line->'consumption','[]'::jsonb)) loop
      if nullif(v_consumption->>'inventory_item_id','') is null then continue; end if;
      select * into v_item from public.inventory_items where id=(v_consumption->>'inventory_item_id')::uuid and organization_id=p_organization_id for update;
      if not found then raise exception 'Inventory item not found in this organization'; end if;
      v_qty:=coalesce((v_consumption->>'quantity')::numeric,0); v_unit:=coalesce(v_consumption->>'unit',v_item.base_unit);
      if v_qty<=0 then continue; end if;
      if v_item.current_stock-v_qty < 0 then raise exception 'Insufficient stock for % (available %, requested %)',v_item.name,v_item.current_stock,v_qty; end if;
      update public.inventory_items set current_stock=current_stock-v_qty,updated_at=now() where id=v_item.id;
      insert into public.job_line_costs(organization_id,job_line_id,cost_type,description,estimated_amount,actual_amount) values(p_organization_id,v_line_id,'inventory',v_item.name,(coalesce(v_consumption->>'cost','0'))::numeric,(coalesce(v_consumption->>'cost','0'))::numeric);
    end loop;
  end loop;
  update public.job_orders set subtotal=v_subtotal,grand_total=v_subtotal,estimated_cost=v_cost,estimated_profit=v_subtotal-v_cost,updated_at=now() where id=v_order.id;
  return jsonb_build_object('order_id',v_order.id,'order_no',v_no,'grand_total',v_subtotal,'estimated_cost',v_cost,'estimated_profit',v_subtotal-v_cost);
exception when others then
  raise;
end $$;

-- Safe payment against a V36 order; cashier/operational roles can record, company admin can manage.
create or replace function public.record_unified_order_payment_v36(p_order_id uuid,p_amount numeric,p_method text,p_reference text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.job_orders%rowtype; newpaid numeric;
begin
 select * into o from public.job_orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if not public.netvyl_can_operate_org_v36(o.organization_id) then raise exception 'Access denied'; end if;
 if p_amount<=0 then raise exception 'Payment amount must be greater than zero'; end if;
 newpaid:=o.amount_paid+p_amount;
 if newpaid>o.grand_total then raise exception 'Payment exceeds order balance'; end if;
 update public.job_orders set amount_paid=newpaid,updated_at=now() where id=o.id;
 insert into public.payments(organization_id,job_id,amount,payment_method,reference,payment_date)
 select o.organization_id,j.id,p_amount,p_method,p_reference,current_date from public.jobs j where j.organization_id=o.organization_id and false;
 return jsonb_build_object('order_id',o.id,'amount_paid',newpaid,'balance',o.grand_total-newpaid);
end $$;

-- ---------- V36 workflow seed defaults ----------

-- Generalized inventory ledger and generalized order payments.
create table if not exists public.v36_inventory_transactions(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
 order_id uuid references public.job_orders(id) on delete set null,
 transaction_type text not null check(transaction_type in ('opening','order_use','restore','restock','adjustment','waste')),
 quantity numeric(18,6) not null,
 unit text not null,
 previous_stock numeric(18,6) not null,
 new_stock numeric(18,6) not null,
 reason text,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists idx_v36_inventory_tx_org on public.v36_inventory_transactions(organization_id,created_at desc);
alter table public.v36_inventory_transactions enable row level security;
drop policy if exists "v36 inventory ledger read" on public.v36_inventory_transactions;
create policy "v36 inventory ledger read" on public.v36_inventory_transactions for select to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
drop policy if exists "v36 inventory ledger write" on public.v36_inventory_transactions;
create policy "v36 inventory ledger write" on public.v36_inventory_transactions for all to authenticated using(public.netvyl_is_org_admin(organization_id) or public.netvyl_has_support_access(organization_id)) with check(public.netvyl_is_org_admin(organization_id) or public.netvyl_has_support_access(organization_id));

alter table public.payments add column if not exists v36_order_id uuid references public.job_orders(id) on delete set null;
create index if not exists idx_payments_v36_order on public.payments(v36_order_id);

create or replace function public.create_unified_order_v36(
  p_organization_id uuid,p_customer_id uuid,p_customer_name text,p_job_date date,p_due_at timestamptz default null,p_notes text default null,p_lines jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_order public.job_orders%rowtype; v_line jsonb; v_line_id uuid; v_no text; v_subtotal numeric:=0; v_cost numeric:=0; v_consumption jsonb; v_item public.inventory_items%rowtype; v_qty numeric; v_prev numeric;
begin
 if not public.netvyl_can_operate_org_v36(p_organization_id) then raise exception 'You do not have access to this organization'; end if;
 if not exists(select 1 from public.customers where id=p_customer_id and organization_id=p_organization_id) then raise exception 'Customer does not belong to this organization'; end if;
 if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'At least one order line is required'; end if;
 v_no:=public.netvyl_next_order_no(p_organization_id);
 insert into public.job_orders(organization_id,order_no,customer_id,customer_name_snapshot,status,priority,due_at,notes,created_by) values(p_organization_id,v_no,p_customer_id,p_customer_name,'pending','normal',p_due_at,p_notes,auth.uid()) returning * into v_order;
 for v_line in select * from jsonb_array_elements(p_lines) loop
  if coalesce((v_line->>'line_total')::numeric,0)<=0 then raise exception 'Each line must have a positive selling price'; end if;
  insert into public.job_lines(organization_id,order_id,service_id,description,specifications,quantity,unit,unit_price,line_total,estimated_cost,actual_cost,status) values(p_organization_id,v_order.id,(v_line->>'service_id')::uuid,coalesce(v_line->>'description',''),coalesce(v_line->'specifications','{}'::jsonb),coalesce((v_line->>'quantity')::numeric,1),coalesce(v_line->>'unit','piece'),coalesce((v_line->>'unit_price')::numeric,0),(v_line->>'line_total')::numeric,coalesce((v_line->>'estimated_cost')::numeric,0),coalesce((v_line->>'estimated_cost')::numeric,0),'pending') returning id into v_line_id;
  v_subtotal:=v_subtotal+(v_line->>'line_total')::numeric; v_cost:=v_cost+coalesce((v_line->>'estimated_cost')::numeric,0);
  for v_consumption in select * from jsonb_array_elements(coalesce(v_line->'consumption','[]'::jsonb)) loop
   if nullif(v_consumption->>'inventory_item_id','') is null then continue; end if;
   select * into v_item from public.inventory_items where id=(v_consumption->>'inventory_item_id')::uuid and organization_id=p_organization_id for update;
   if not found then raise exception 'Inventory item not found in this organization'; end if;
   v_qty:=coalesce((v_consumption->>'quantity')::numeric,0); if v_qty<=0 then continue; end if;
   if v_item.current_stock-v_qty<0 then raise exception 'Insufficient stock for % (available %, requested %)',v_item.name,v_item.current_stock,v_qty; end if;
   v_prev:=v_item.current_stock;
   update public.inventory_items set current_stock=current_stock-v_qty,updated_at=now() where id=v_item.id;
   insert into public.v36_inventory_transactions(organization_id,inventory_item_id,order_id,transaction_type,quantity,unit,previous_stock,new_stock,reason,created_by) values(p_organization_id,v_item.id,v_order.id,'order_use',v_qty,coalesce(v_consumption->>'unit',v_item.base_unit),v_prev,v_prev-v_qty,'Consumed by '||v_no,auth.uid());
   insert into public.job_line_costs(organization_id,job_line_id,cost_type,description,estimated_amount,actual_amount) values(p_organization_id,v_line_id,'inventory',v_item.name,coalesce((v_consumption->>'cost')::numeric,0),coalesce((v_consumption->>'cost')::numeric,0));
  end loop;
 end loop;
 update public.job_orders set subtotal=v_subtotal,grand_total=v_subtotal,estimated_cost=v_cost,estimated_profit=v_subtotal-v_cost,updated_at=now() where id=v_order.id;
 return jsonb_build_object('order_id',v_order.id,'order_no',v_no,'grand_total',v_subtotal,'estimated_cost',v_cost,'estimated_profit',v_subtotal-v_cost);
end $$;

create or replace function public.record_unified_order_payment_v36(p_order_id uuid,p_amount numeric,p_method text,p_reference text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.job_orders%rowtype; newpaid numeric; v_payment_id uuid;
begin
 select * into o from public.job_orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if not public.netvyl_can_operate_org_v36(o.organization_id) then raise exception 'Access denied'; end if;
 if p_amount<=0 then raise exception 'Payment amount must be greater than zero'; end if;
 newpaid:=o.amount_paid+p_amount; if newpaid>o.grand_total then raise exception 'Payment exceeds order balance'; end if;
 update public.job_orders set amount_paid=newpaid,updated_at=now() where id=o.id;
 insert into public.payments(organization_id,customer_id,customer_name_snapshot,payment_date,amount,method,reference,created_by,v36_order_id) values(o.organization_id,o.customer_id,o.customer_name_snapshot,current_date,p_amount,p_method,p_reference,auth.uid(),o.id) returning id into v_payment_id;
 return jsonb_build_object('order_id',o.id,'payment_id',v_payment_id,'amount_paid',newpaid,'balance',o.grand_total-newpaid);
end $$;

-- Service-aware production progress for unified orders.
create table if not exists public.v36_job_line_progress(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 job_line_id uuid not null references public.job_lines(id) on delete cascade, workflow_id uuid references public.production_workflows(id) on delete set null,
 current_step_id uuid references public.production_workflow_steps(id) on delete set null, started_at timestamptz, completed_at timestamptz,
 assigned_to uuid references auth.users(id), updated_at timestamptz not null default now(), unique(job_line_id));
alter table public.v36_job_line_progress enable row level security;
drop policy if exists "v36 progress read" on public.v36_job_line_progress;
create policy "v36 progress read" on public.v36_job_line_progress for select to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
drop policy if exists "v36 progress write" on public.v36_job_line_progress;
create policy "v36 progress write" on public.v36_job_line_progress for all to authenticated using(public.netvyl_can_operate_org_v36(organization_id)) with check(public.netvyl_can_operate_org_v36(organization_id));
create or replace function public.advance_v36_job_line(p_job_line_id uuid,p_step_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare l public.job_lines%rowtype; st public.production_workflow_steps%rowtype; vstatus text;
begin
 select * into l from public.job_lines where id=p_job_line_id for update; if not found then raise exception 'Job line not found'; end if;
 if not public.netvyl_can_operate_org_v36(l.organization_id) then raise exception 'Access denied'; end if;
 select * into st from public.production_workflow_steps where id=p_step_id; if not found then raise exception 'Workflow step not found'; end if;
 if not exists(select 1 from public.production_workflows w where w.id=st.workflow_id and w.organization_id=l.organization_id) then raise exception 'Workflow does not belong to this organization'; end if;
 vstatus:=case when lower(st.name)='ready' then 'completed' else lower(regexp_replace(st.name,'[^a-zA-Z0-9]+','_','g')) end;
 insert into public.v36_job_line_progress(organization_id,job_line_id,workflow_id,current_step_id,started_at,assigned_to,completed_at) values(l.organization_id,l.id,st.workflow_id,st.id,now(),auth.uid(),case when vstatus='completed' then now() else null end)
 on conflict(job_line_id) do update set current_step_id=excluded.current_step_id,workflow_id=excluded.workflow_id,assigned_to=auth.uid(),updated_at=now(),completed_at=excluded.completed_at;
 update public.job_lines set status=vstatus,updated_at=now() where id=l.id;
 return jsonb_build_object('job_line_id',l.id,'step_id',st.id,'step',st.name,'status',vstatus);
end $$;

-- Generalized order/job records: operational users can create/update, but only company admin/support can delete.
do $$ begin
 drop policy if exists "v36 org write" on public.job_orders;
 drop policy if exists "v36 order select" on public.job_orders;
 drop policy if exists "v36 order insert" on public.job_orders;
 drop policy if exists "v36 order update" on public.job_orders;
 drop policy if exists "v36 order delete" on public.job_orders;
 create policy "v36 order select" on public.job_orders for select to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
 create policy "v36 order insert" on public.job_orders for insert to authenticated with check(public.netvyl_can_operate_org_v36(organization_id));
 create policy "v36 order update" on public.job_orders for update to authenticated using(public.netvyl_can_operate_org_v36(organization_id)) with check(public.netvyl_can_operate_org_v36(organization_id));
 create policy "v36 order delete" on public.job_orders for delete to authenticated using(public.netvyl_is_org_admin(organization_id) or public.netvyl_has_support_access(organization_id));
 drop policy if exists "v36 org write" on public.job_lines;
 drop policy if exists "v36 line select" on public.job_lines;
 drop policy if exists "v36 line insert" on public.job_lines;
 drop policy if exists "v36 line update" on public.job_lines;
 drop policy if exists "v36 line delete" on public.job_lines;
 create policy "v36 line select" on public.job_lines for select to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
 create policy "v36 line insert" on public.job_lines for insert to authenticated with check(public.netvyl_can_operate_org_v36(organization_id));
 create policy "v36 line update" on public.job_lines for update to authenticated using(public.netvyl_can_operate_org_v36(organization_id)) with check(public.netvyl_can_operate_org_v36(organization_id));
 create policy "v36 line delete" on public.job_lines for delete to authenticated using(public.netvyl_is_org_admin(organization_id) or public.netvyl_has_support_access(organization_id));
end $$;
-- NETVYL V36 FINAL COMPLETION / HARDENING
-- Apply after v36-unified-platform.sql and prior baseline migrations.
-- This migration closes the remaining customer-facing and commercial workflow gaps.

create extension if not exists pgcrypto;

-- ---------- order lifecycle / delivery / approval ----------
alter table public.job_orders add column if not exists client_reference text;
alter table public.job_orders add column if not exists artwork_status text not null default 'not_required';
alter table public.job_orders add column if not exists approval_status text not null default 'not_required';
alter table public.job_orders add column if not exists delivery_status text not null default 'not_required';
alter table public.job_orders add column if not exists delivery_address text;
alter table public.job_orders add column if not exists delivery_date date;
alter table public.job_orders add column if not exists delivered_at timestamptz;
alter table public.job_orders add column if not exists approved_at timestamptz;
alter table public.job_orders add column if not exists approved_by uuid references auth.users(id);
create unique index if not exists uq_job_orders_client_reference on public.job_orders(organization_id,client_reference) where client_reference is not null;
create index if not exists idx_job_orders_delivery on public.job_orders(organization_id,delivery_status,due_at);

-- ---------- files / artwork ----------
create table if not exists public.job_attachments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 order_id uuid references public.job_orders(id) on delete cascade,
 job_line_id uuid references public.job_lines(id) on delete cascade,
 file_name text not null,
 storage_path text not null,
 mime_type text,
 file_size bigint,
 attachment_type text not null default 'artwork',
 approval_status text not null default 'pending',
 uploaded_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.job_attachments enable row level security;
drop policy if exists "v36 attachments read" on public.job_attachments;
drop policy if exists "v36 attachments write" on public.job_attachments;
create policy "v36 attachments read" on public.job_attachments for select to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
create policy "v36 attachments write" on public.job_attachments for all to authenticated using(public.netvyl_can_operate_org_v36(organization_id)) with check(public.netvyl_can_operate_org_v36(organization_id));

-- ---------- notifications ----------
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade,
 kind text not null,
 title text not null,
 body text not null,
 entity_type text,
 entity_id uuid,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(organization_id,user_id,created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "v36 notifications read" on public.notifications;
drop policy if exists "v36 notifications write" on public.notifications;
create policy "v36 notifications read" on public.notifications for select to authenticated using((user_id=auth.uid()) or (user_id is null and organization_id in(select public.user_org_ids())) or public.is_platform_admin());
create policy "v36 notifications write" on public.notifications for all to authenticated using(public.netvyl_can_operate_org_v36(organization_id)) with check(public.netvyl_can_operate_org_v36(organization_id));

-- ---------- administrator announcements to organization staff ----------
create or replace function public.netvyl_send_staff_announcement(
  p_org_id uuid,
  p_title text,
  p_body text
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare sent_count integer;
begin
  if auth.uid() is null or not public.netvyl_is_org_admin(p_org_id)
     or public.netvyl_has_support_access(p_org_id) then
    raise exception 'Company administrator access required';
  end if;
  if nullif(trim(p_title), '') is null or length(trim(p_title)) > 120 then
    raise exception 'Title is required and must be 120 characters or fewer';
  end if;
  if nullif(trim(p_body), '') is null or length(trim(p_body)) > 2000 then
    raise exception 'Message is required and must be 2000 characters or fewer';
  end if;

  insert into public.notifications(organization_id,user_id,kind,title,body,entity_type)
  select p_org_id,om.user_id,'announcement',trim(p_title),trim(p_body),'announcement'
  from public.organization_members om
  where om.organization_id=p_org_id
    and om.active=true
    and om.role in ('manager','staff','cashier','production');
  get diagnostics sent_count = row_count;
  return sent_count;
end;
$$;
revoke all on function public.netvyl_send_staff_announcement(uuid,text,text) from public;
grant execute on function public.netvyl_send_staff_announcement(uuid,text,text) to authenticated;

-- ---------- delivery / approval / artwork ----------
create or replace function public.netvyl_update_order_lifecycle(
 p_order_id uuid,
 p_delivery_status text default null,
 p_artwork_status text default null,
 p_approval_status text default null,
 p_delivery_address text default null,
 p_delivery_date date default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.job_orders%rowtype;
begin
 select * into o from public.job_orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if not public.netvyl_can_operate_org_v36(o.organization_id) then raise exception 'Access denied'; end if;
 update public.job_orders set
  delivery_status=coalesce(p_delivery_status,delivery_status),
  artwork_status=coalesce(p_artwork_status,artwork_status),
  approval_status=coalesce(p_approval_status,approval_status),
  delivery_address=coalesce(p_delivery_address,delivery_address),
  delivery_date=coalesce(p_delivery_date,delivery_date),
  delivered_at=case when p_delivery_status='delivered' then now() else delivered_at end,
  approved_at=case when p_approval_status='approved' then now() else approved_at end,
  approved_by=case when p_approval_status='approved' then auth.uid() else approved_by end,
  updated_at=now()
 where id=o.id;
 return jsonb_build_object('order_id',o.id,'delivery_status',coalesce(p_delivery_status,o.delivery_status),'artwork_status',coalesce(p_artwork_status,o.artwork_status),'approval_status',coalesce(p_approval_status,o.approval_status));
end $$;

-- ---------- idempotent order creation for offline/retry safety ----------
create or replace function public.create_unified_order_v36_idempotent(
 p_organization_id uuid,
 p_customer_id uuid,
 p_customer_name text,
 p_job_date date,
 p_due_at timestamptz,
 p_notes text,
 p_lines jsonb,
 p_client_reference text,
 p_priority text default 'normal'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare existing public.job_orders%rowtype;
result jsonb;
begin
 if not public.netvyl_can_operate_org_v36(p_organization_id) then raise exception 'You do not have access to this organization'; end if;
 select * into existing from public.job_orders where organization_id=p_organization_id and client_reference=p_client_reference limit 1;
 if found then return jsonb_build_object('order_id',existing.id,'order_no',existing.order_no,'grand_total',existing.grand_total,'estimated_cost',existing.estimated_cost,'estimated_profit',existing.estimated_profit,'replayed',true); end if;
 result:=public.create_unified_order_v36(p_organization_id,p_customer_id,p_customer_name,p_job_date,p_due_at,p_notes,p_lines);
 update public.job_orders set client_reference=p_client_reference,priority=coalesce(nullif(p_priority,''),'normal') where id=(result->>'order_id')::uuid;
 return result || jsonb_build_object('replayed',false);
end $$;

-- ---------- quote workflow ----------
alter table public.quotes add column if not exists approved_at timestamptz;
alter table public.quotes add column if not exists approved_by uuid references auth.users(id);
alter table public.quotes add column if not exists converted_order_id uuid references public.job_orders(id) on delete set null;
create index if not exists idx_quotes_converted_order on public.quotes(converted_order_id);

create or replace function public.netvyl_convert_quote_to_order(p_quote_id uuid,p_client_reference text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare q public.quotes%rowtype; l record; v_customer public.customers%rowtype; payload jsonb:='[]'::jsonb; result jsonb; cref text;
begin
 select * into q from public.quotes where id=p_quote_id for update;
 if not found then raise exception 'Quote not found'; end if;
 if not public.netvyl_can_operate_org_v36(q.organization_id) then raise exception 'Access denied'; end if;
 if q.converted_order_id is not null then return jsonb_build_object('order_id',q.converted_order_id,'replayed',true); end if;
 select * into v_customer from public.customers where id=q.customer_id and organization_id=q.organization_id;
 if not found then raise exception 'Quote customer not found'; end if;
 for l in select * from public.quote_lines where quote_id=q.id order by created_at loop
  payload:=payload||jsonb_build_array(jsonb_build_object('service_id',l.service_id,'description',l.description,'quantity',l.quantity,'unit',l.unit,'unit_price',l.unit_price,'line_total',l.line_total,'estimated_cost',coalesce(l.line_total,0),'specifications',coalesce(l.specifications,'{}'::jsonb),'consumption','[]'::jsonb));
 end loop;
 if jsonb_array_length(payload)=0 then raise exception 'Quote has no lines'; end if;
 cref:=coalesce(p_client_reference,'quote-'||q.id::text);
 result:=public.create_unified_order_v36_idempotent(q.organization_id,q.customer_id,v_customer.name,current_date,null,'Converted from quote '||q.quote_no,payload,cref);
 update public.quotes set status='converted',converted_order_id=(result->>'order_id')::uuid,approved_at=coalesce(approved_at,now()),approved_by=coalesce(approved_by,auth.uid()) where id=q.id;
 return result||jsonb_build_object('quote_id',q.id,'quote_no',q.quote_no);
end $$;

-- ---------- purchase receiving with inventory ledger ----------
create or replace function public.netvyl_receive_purchase(
 p_purchase_order_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare po public.purchase_orders%rowtype; l record; i public.inventory_items%rowtype; prev numeric; total numeric:=0;
begin
 select * into po from public.purchase_orders where id=p_purchase_order_id for update;
 if not found then raise exception 'Purchase order not found'; end if;
 if not public.netvyl_is_org_admin(po.organization_id) then raise exception 'Company administrator access required'; end if;
 if po.status='received' then return jsonb_build_object('purchase_order_id',po.id,'replayed',true); end if;
 for l in select * from public.purchase_order_lines where purchase_order_id=po.id loop
  select * into i from public.inventory_items where id=l.inventory_item_id and organization_id=po.organization_id for update;
  if not found then raise exception 'Inventory item not found'; end if;
  prev:=i.current_stock;
  update public.inventory_items set current_stock=current_stock+l.quantity,cost_per_unit=l.unit_cost,updated_at=now() where id=i.id;
  insert into public.v36_inventory_transactions(organization_id,inventory_item_id,transaction_type,quantity,unit,previous_stock,new_stock,reason,created_by) values(po.organization_id,i.id,'purchase_receive',l.quantity,l.unit,prev,prev+l.quantity,'Received '||po.po_no,auth.uid());
  total:=total+l.line_total;
 end loop;
 update public.purchase_orders set status='received',received_at=current_date,total=total where id=po.id;
 return jsonb_build_object('purchase_order_id',po.id,'total',total,'replayed',false);
end $$;

-- ---------- waste / profit ----------
create or replace function public.netvyl_record_waste(
 p_job_line_id uuid,
 p_inventory_item_id uuid,
 p_quantity numeric,
 p_unit text,
 p_reason text,
 p_cost numeric
) returns uuid language plpgsql security definer set search_path=public as $$
declare l public.job_lines%rowtype; wid uuid;
begin
 select * into l from public.job_lines where id=p_job_line_id;
 if not found then raise exception 'Job line not found'; end if;
 if not public.netvyl_is_org_admin(l.organization_id) and not public.netvyl_has_support_access(l.organization_id) then raise exception 'Company administrator access required'; end if;
 insert into public.job_waste(organization_id,order_id,job_line_id,inventory_item_id,quantity,unit,reason,cost,created_by) values(l.organization_id,l.order_id,l.id,p_inventory_item_id,p_quantity,p_unit,p_reason,p_cost,auth.uid()) returning id into wid;
 update public.job_lines set waste_cost=coalesce(waste_cost,0)+coalesce(p_cost,0),actual_cost=coalesce(actual_cost,0)+coalesce(p_cost,0),updated_at=now() where id=l.id;
 perform public.netvyl_recalculate_order_profit(l.order_id);
 return wid;
end $$;

-- ---------- notifications for operational events ----------
create or replace function public.netvyl_notify_org(p_org_id uuid,p_kind text,p_title text,p_body text,p_entity_type text default null,p_entity_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 insert into public.notifications(organization_id,user_id,kind,title,body,entity_type,entity_id)
 select p_org_id,om.user_id,p_kind,p_title,p_body,p_entity_type,p_entity_id from public.organization_members om where om.organization_id=p_org_id and om.active=true;
end $$;

-- ---------- indexes for responsive reads ----------
create index if not exists idx_job_lines_org_status on public.job_lines(organization_id,status,created_at desc);
create index if not exists idx_job_orders_org_customer on public.job_orders(organization_id,customer_id,created_at desc);
create index if not exists idx_inventory_tx_org_item on public.v36_inventory_transactions(organization_id,inventory_item_id,created_at desc);
create index if not exists idx_job_attachments_order on public.job_attachments(organization_id,order_id,created_at desc);

-- ---------- permissions: destructive/configuration actions stay administrator-only ----------
drop policy if exists "v36 org write" on public.quotes;
drop policy if exists "v36 quote write" on public.quotes;
create policy "v36 quote write" on public.quotes for all to authenticated using(public.netvyl_can_operate_org_v36(organization_id)) with check(public.netvyl_can_operate_org_v36(organization_id));
drop policy if exists "v36 org write" on public.quote_lines;
drop policy if exists "v36 quote line write" on public.quote_lines;
create policy "v36 quote line write" on public.quote_lines for all to authenticated using(public.netvyl_can_operate_org_v36(organization_id)) with check(public.netvyl_can_operate_org_v36(organization_id));

-- Expenses are operational records: manager can record, administrator can manage.
drop policy if exists "v36 org write" on public.expenses;
drop policy if exists "v36 expense write" on public.expenses;
create policy "v36 expense write" on public.expenses for insert to authenticated with check(public.netvyl_can_operate_org_v36(organization_id));
create policy "v36 expense update" on public.expenses for update to authenticated using(public.netvyl_is_org_admin(organization_id)) with check(public.netvyl_is_org_admin(organization_id));
create policy "v36 expense delete" on public.expenses for delete to authenticated using(public.netvyl_is_org_admin(organization_id));

-- Company Administrator is the only normal role allowed to manage suppliers/purchasing.
drop policy if exists "v36 org write" on public.suppliers;
drop policy if exists "v36 supplier write" on public.suppliers;
create policy "v36 supplier write" on public.suppliers for all to authenticated using(public.netvyl_is_org_admin(organization_id)) with check(public.netvyl_is_org_admin(organization_id));
drop policy if exists "v36 org write" on public.purchase_orders;
drop policy if exists "v36 purchase write" on public.purchase_orders;
create policy "v36 purchase write" on public.purchase_orders for all to authenticated using(public.netvyl_is_org_admin(organization_id)) with check(public.netvyl_is_org_admin(organization_id));
drop policy if exists "v36 org write" on public.purchase_order_lines;
drop policy if exists "v36 purchase line write" on public.purchase_order_lines;
create policy "v36 purchase line write" on public.purchase_order_lines for all to authenticated using(public.netvyl_is_org_admin(organization_id)) with check(public.netvyl_is_org_admin(organization_id));


-- ---------- private storage bucket for artwork/attachments ----------
insert into storage.buckets(id,name,public)
values('netvyl-files','netvyl-files',false)
on conflict (id) do nothing;
drop policy if exists "netvyl files read" on storage.objects;
drop policy if exists "netvyl files write" on storage.objects;
create policy "netvyl files read" on storage.objects for select to authenticated
using(bucket_id='netvyl-files' and (split_part(name,'/',1)::uuid in(select public.user_org_ids()) or public.is_platform_admin()));
create policy "netvyl files write" on storage.objects for insert to authenticated
with check(bucket_id='netvyl-files' and split_part(name,'/',1)::uuid in(select public.user_org_ids()));

-- ---------- administrator-only unified order deletion with exact inventory restoration ----------
create or replace function public.delete_unified_order_v36_restore(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.job_orders%rowtype; t record; restored numeric:=0;
begin
 select * into o from public.job_orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if not public.netvyl_is_org_admin(o.organization_id) then raise exception 'Company administrator access required'; end if;
 for t in select * from public.v36_inventory_transactions where organization_id=o.organization_id and order_id=o.id and transaction_type='order_use' order by created_at desc for update loop
   update public.inventory_items set current_stock=current_stock+t.quantity,updated_at=now() where id=t.inventory_item_id and organization_id=o.organization_id;
   restored:=restored+t.quantity;
 end loop;
 delete from public.payments where organization_id=o.organization_id and v36_order_id=o.id;
 delete from public.v36_inventory_transactions where organization_id=o.organization_id and order_id=o.id;
 delete from public.job_waste where organization_id=o.organization_id and order_id=o.id;
 delete from public.job_orders where id=o.id;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) values(o.organization_id,auth.uid(),'delete_unified_order_restore','job_order',o.id,jsonb_build_object('order_no',o.order_no,'restored_inventory',restored));
 return jsonb_build_object('order_id',o.id,'order_no',o.order_no,'restored_inventory',restored);
end $$;

-- ---------- administrator-only universal inventory deletion ----------
create or replace function public.delete_inventory_item_v36(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare i public.inventory_items%rowtype;
begin
 select * into i from public.inventory_items where id=p_item_id for update;
 if not found then raise exception 'Inventory item not found'; end if;
 if not public.netvyl_is_org_admin(i.organization_id) then raise exception 'Company administrator access required'; end if;
 if exists(select 1 from public.job_line_costs c where c.organization_id=i.organization_id and c.description=i.name) then raise exception 'Cannot delete an item referenced by completed cost records; disable it instead'; end if;
 if exists(select 1 from public.job_waste w where w.inventory_item_id=i.id) then raise exception 'Cannot delete an item referenced by waste records; disable it instead'; end if;
 if exists(select 1 from public.purchase_order_lines p where p.inventory_item_id=i.id) then raise exception 'Cannot delete an item referenced by purchase records; disable it instead'; end if;
 if i.current_stock<>i.opening_stock then raise exception 'Cannot delete an item with stock movement; disable it instead'; end if;
 delete from public.inventory_items where id=i.id;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) values(i.organization_id,auth.uid(),'delete_inventory_item','inventory_item',i.id,jsonb_build_object('name',i.name));
 return jsonb_build_object('deleted',true,'item_id',i.id,'name',i.name);
end $$;

-- ---------- master organization lifecycle ----------
create or replace function public.master_set_organization_status(p_org_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not (public.is_platform_admin() or public.netvyl_is_platform_super_admin()) then raise exception 'Platform Master Admin access required'; end if;
 if p_status not in ('active','suspended') then raise exception 'Invalid organization status'; end if;
 update public.organizations set status=p_status,updated_at=now() where id=p_org_id;
 if not found then raise exception 'Organization not found'; end if;
 return jsonb_build_object('organization_id',p_org_id,'status',p_status);
end $$;

create or replace function public.master_delete_organization(p_org_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare n text;
begin
 if not (public.is_platform_admin() or public.netvyl_is_platform_super_admin()) then raise exception 'Platform Master Admin access required'; end if;
 select name into n from public.organizations where id=p_org_id;
 if n is null then raise exception 'Organization not found'; end if;
 delete from public.organizations where id=p_org_id;
 return jsonb_build_object('deleted',true,'organization_id',p_org_id,'name',n);
end $$;

-- ---------- final license/role enforcement ----------
create or replace function public.netvyl_can_operate_org_v36(p_org_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.netvyl_has_support_access(p_org_id)
 or exists(
   select 1 from public.organization_members om
   where om.organization_id=p_org_id and om.user_id=auth.uid() and om.active=true
     and om.role in ('administrator','manager','staff','cashier','production','super_admin')
     and exists(select 1 from public.licenses l where l.organization_id=p_org_id and l.status='active' and coalesce(l.expires_at,now()+interval '100 years')>now())
 );
$$;
create or replace function public.netvyl_is_org_admin(p_org_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.netvyl_has_support_access(p_org_id)
 or exists(
   select 1 from public.organization_members om
   where om.organization_id=p_org_id and om.user_id=auth.uid() and om.active=true and om.role='administrator'
     and exists(select 1 from public.licenses l where l.organization_id=p_org_id and l.status='active' and coalesce(l.expires_at,now()+interval '100 years')>now())
 );
$$;


-- Corrected V36 reset: restore generalized inventory to opening stock before clearing order history.
create or replace function public.netvyl_reset_v36_operational_data(p_org_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.netvyl_is_org_admin(p_org_id) then raise exception 'Company administrator access required'; end if;
 update public.inventory_items set current_stock=opening_stock,reserved_stock=0,updated_at=now() where organization_id=p_org_id;
 delete from public.notifications where organization_id=p_org_id;
 delete from public.job_attachments where organization_id=p_org_id;
 delete from public.job_waste where organization_id=p_org_id;
 delete from public.v36_inventory_transactions where organization_id=p_org_id;
 delete from public.job_line_costs where organization_id=p_org_id;
 delete from public.job_lines where organization_id=p_org_id;
 delete from public.job_orders where organization_id=p_org_id;
 delete from public.quote_lines where organization_id=p_org_id;
 delete from public.quotes where organization_id=p_org_id;
 delete from public.expenses where organization_id=p_org_id;
 delete from public.purchase_order_lines where organization_id=p_org_id;
 delete from public.purchase_orders where organization_id=p_org_id;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,details) values(p_org_id,auth.uid(),'v36_operational_reset','organization',jsonb_build_object('scope','v36_domains','inventory_restored_to_opening',true));
end $$;

-- Keep order status synchronized with service-line progress.
create or replace function public.advance_v36_job_line(p_job_line_id uuid,p_step_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare l public.job_lines%rowtype; st public.production_workflow_steps%rowtype; vstatus text; remaining integer;
begin
 select * into l from public.job_lines where id=p_job_line_id for update; if not found then raise exception 'Job line not found'; end if;
 if not public.netvyl_can_operate_org_v36(l.organization_id) then raise exception 'Access denied'; end if;
 select * into st from public.production_workflow_steps where id=p_step_id; if not found then raise exception 'Workflow step not found'; end if;
 if not exists(select 1 from public.production_workflows w where w.id=st.workflow_id and w.organization_id=l.organization_id) then raise exception 'Workflow does not belong to this organization'; end if;
 vstatus:=case when lower(st.name)='ready' then 'completed' else lower(regexp_replace(st.name,'[^a-zA-Z0-9]+','_','g')) end;
 insert into public.v36_job_line_progress(organization_id,job_line_id,workflow_id,current_step_id,started_at,assigned_to,completed_at) values(l.organization_id,l.id,st.workflow_id,st.id,now(),auth.uid(),case when vstatus='completed' then now() else null end)
 on conflict(job_line_id) do update set current_step_id=excluded.current_step_id,workflow_id=excluded.workflow_id,assigned_to=auth.uid(),updated_at=now(),completed_at=excluded.completed_at;
 update public.job_lines set status=vstatus,updated_at=now() where id=l.id;
 select count(*) into remaining from public.job_lines where order_id=l.order_id and status<>'completed';
 update public.job_orders set status=case when remaining=0 then 'completed' else 'in_production' end,updated_at=now() where id=l.order_id;
 return jsonb_build_object('job_line_id',l.id,'step_id',st.id,'step',st.name,'status',vstatus,'order_status',case when remaining=0 then 'completed' else 'in_production' end);
end $$;

-- ---------- automatic operational notifications ----------
create or replace function public.netvyl_order_notification_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
   perform public.netvyl_notify_org(new.organization_id,'new_order','New order '||new.order_no,new.customer_name_snapshot||' created for ₦'||to_char(new.grand_total,'FM999,999,999,990.00'),'job_order',new.id);
 elsif tg_op='UPDATE' and old.status is distinct from new.status then
   perform public.netvyl_notify_org(new.organization_id,'order_status','Order '||new.order_no||' updated','Status changed to '||new.status,'job_order',new.id);
 elsif tg_op='UPDATE' and old.amount_paid is distinct from new.amount_paid then
   perform public.netvyl_notify_org(new.organization_id,'payment','Payment received for '||new.order_no,'Paid total is now ₦'||to_char(new.amount_paid,'FM999,999,999,990.00'),'job_order',new.id);
 end if;
 return new;
end $$;
drop trigger if exists trg_netvyl_order_notifications on public.job_orders;
create trigger trg_netvyl_order_notifications after insert or update on public.job_orders for each row execute function public.netvyl_order_notification_trigger();

-- ---------- V36 FINAL HARDENING ----------
-- Inventory adjustments and purchase receiving must share one valid ledger.
do $$ begin
  alter table public.v36_inventory_transactions drop constraint if exists v36_inventory_transactions_transaction_type_check;
exception when undefined_object then null; end $$;
alter table public.v36_inventory_transactions add constraint v36_inventory_transactions_transaction_type_check
  check(transaction_type in ('opening','order_use','restore','restock','adjustment','waste','purchase_receive'));

create or replace function public.netvyl_adjust_inventory_v36(p_item_id uuid,p_quantity numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare i public.inventory_items%rowtype; prev numeric; nxt numeric;
begin
 select * into i from public.inventory_items where id=p_item_id for update;
 if not found then raise exception 'Inventory item not found'; end if;
 if not public.netvyl_is_org_admin(i.organization_id) then raise exception 'Company administrator access required'; end if;
 if coalesce(p_quantity,0)=0 then raise exception 'Adjustment cannot be zero'; end if;
 prev:=i.current_stock; nxt:=prev+p_quantity;
 if nxt<0 then raise exception 'Adjustment would make % stock negative',i.name; end if;
 update public.inventory_items set current_stock=nxt,updated_at=now() where id=i.id;
 insert into public.v36_inventory_transactions(organization_id,inventory_item_id,transaction_type,quantity,unit,previous_stock,new_stock,reason,created_by)
 values(i.organization_id,i.id,'adjustment',p_quantity,i.base_unit,prev,nxt,coalesce(nullif(p_reason,''),'Manual adjustment'),auth.uid());
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
 values(i.organization_id,auth.uid(),'inventory_adjustment','inventory_item',i.id,jsonb_build_object('quantity',p_quantity,'previous_stock',prev,'new_stock',nxt,'reason',p_reason));
 return jsonb_build_object('item_id',i.id,'previous_stock',prev,'new_stock',nxt);
end $$;

create or replace function public.netvyl_receive_purchase(p_purchase_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare po public.purchase_orders%rowtype; l record; i public.inventory_items%rowtype; prev numeric; v_total numeric:=0;
begin
 select * into po from public.purchase_orders where id=p_purchase_order_id for update;
 if not found then raise exception 'Purchase order not found'; end if;
 if not public.netvyl_is_org_admin(po.organization_id) then raise exception 'Company administrator access required'; end if;
 if po.status='received' then return jsonb_build_object('purchase_order_id',po.id,'replayed',true); end if;
 for l in select * from public.purchase_order_lines where purchase_order_id=po.id loop
  select * into i from public.inventory_items where id=l.inventory_item_id and organization_id=po.organization_id for update;
  if not found then raise exception 'Inventory item not found'; end if;
  prev:=i.current_stock;
  update public.inventory_items set current_stock=current_stock+l.quantity,cost_per_unit=l.unit_cost,updated_at=now() where id=i.id;
  insert into public.v36_inventory_transactions(organization_id,inventory_item_id,transaction_type,quantity,unit,previous_stock,new_stock,reason,created_by)
  values(po.organization_id,i.id,'purchase_receive',l.quantity,l.unit,prev,prev+l.quantity,'Received '||po.po_no,auth.uid());
  v_total:=v_total+l.line_total;
 end loop;
 update public.purchase_orders set status='received',received_at=current_date,total=v_total where id=po.id;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
 values(po.organization_id,auth.uid(),'purchase_received','purchase_order',po.id,jsonb_build_object('po_no',po.po_no,'total',v_total));
 return jsonb_build_object('purchase_order_id',po.id,'total',v_total,'replayed',false);
end $$;

-- Ensure company-admin configuration cannot be bypassed through generic write policies.
do $$ declare t text; begin
 foreach t in array array['business_services','service_variants','inventory_items','inventory_variants','inventory_unit_conversions','pricing_rules','production_workflows','production_workflow_steps','service_recipes','service_recipe_components','suppliers','purchase_orders','purchase_order_lines'] loop
   execute format('drop policy if exists "v36 org write" on public.%I',t);
   execute format('drop policy if exists "v36 admin write" on public.%I',t);
   execute format('create policy "v36 admin write" on public.%I for all to authenticated using(public.netvyl_is_org_admin(organization_id)) with check(public.netvyl_is_org_admin(organization_id))',t);
 end loop;
end $$;

-- Unified order payments are visible through the normal payments table and remain tenant scoped.
create index if not exists idx_payments_v36_org_created on public.payments(organization_id,created_at desc);
create index if not exists idx_job_orders_v36_due on public.job_orders(organization_id,due_at,status);

-- ---------- V36 FINAL VARIANT STOCK SUPPORT ----------
alter table public.v36_inventory_transactions alter column inventory_item_id drop not null;
alter table public.v36_inventory_transactions add column if not exists inventory_variant_id uuid references public.inventory_variants(id) on delete set null;
create index if not exists idx_v36_inventory_tx_variant on public.v36_inventory_transactions(organization_id,inventory_variant_id,created_at desc);

create or replace function public.create_unified_order_v36(
  p_organization_id uuid,p_customer_id uuid,p_customer_name text,p_job_date date,p_due_at timestamptz default null,p_notes text default null,p_lines jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_order public.job_orders%rowtype; v_line jsonb; v_line_id uuid; v_no text; v_subtotal numeric:=0; v_cost numeric:=0; v_consumption jsonb; v_item public.inventory_items%rowtype; v_variant public.inventory_variants%rowtype; v_qty numeric; v_prev numeric;
begin
 if not public.netvyl_can_operate_org_v36(p_organization_id) then raise exception 'You do not have access to this organization'; end if;
 if not exists(select 1 from public.customers where id=p_customer_id and organization_id=p_organization_id) then raise exception 'Customer does not belong to this organization'; end if;
 if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'At least one order line is required'; end if;
 v_no:=public.netvyl_next_order_no(p_organization_id);
 insert into public.job_orders(organization_id,order_no,customer_id,customer_name_snapshot,status,priority,due_at,notes,created_by) values(p_organization_id,v_no,p_customer_id,p_customer_name,'pending','normal',p_due_at,p_notes,auth.uid()) returning * into v_order;
 for v_line in select * from jsonb_array_elements(p_lines) loop
  if coalesce((v_line->>'line_total')::numeric,0)<=0 then raise exception 'Each line must have a positive selling price'; end if;
  insert into public.job_lines(organization_id,order_id,service_id,description,specifications,quantity,unit,unit_price,line_total,estimated_cost,actual_cost,status) values(p_organization_id,v_order.id,(v_line->>'service_id')::uuid,coalesce(v_line->>'description',''),coalesce(v_line->'specifications','{}'::jsonb),coalesce((v_line->>'quantity')::numeric,1),coalesce(v_line->>'unit','piece'),coalesce((v_line->>'unit_price')::numeric,0),(v_line->>'line_total')::numeric,coalesce((v_line->>'estimated_cost')::numeric,0),coalesce((v_line->>'estimated_cost')::numeric,0),'pending') returning id into v_line_id;
  v_subtotal:=v_subtotal+(v_line->>'line_total')::numeric; v_cost:=v_cost+coalesce((v_line->>'estimated_cost')::numeric,0);
  for v_consumption in select * from jsonb_array_elements(coalesce(v_line->'consumption','[]'::jsonb)) loop
   v_qty:=coalesce((v_consumption->>'quantity')::numeric,0); if v_qty<=0 then continue; end if;
   if nullif(v_consumption->>'inventory_variant_id','') is not null then
     select * into v_variant from public.inventory_variants where id=(v_consumption->>'inventory_variant_id')::uuid and organization_id=p_organization_id for update;
     if not found then raise exception 'Inventory variant not found in this organization'; end if;
     if v_variant.stock-v_qty<0 then raise exception 'Insufficient stock for variant % (available %, requested %)',v_variant.name,v_variant.stock,v_qty; end if;
     v_prev:=v_variant.stock; update public.inventory_variants set stock=stock-v_qty where id=v_variant.id;
     insert into public.v36_inventory_transactions(organization_id,inventory_item_id,inventory_variant_id,order_id,transaction_type,quantity,unit,previous_stock,new_stock,reason,created_by) values(p_organization_id,v_variant.inventory_item_id,v_variant.id,v_order.id,'order_use',v_qty,coalesce(v_consumption->>'unit','piece'),v_prev,v_prev-v_qty,'Consumed by '||v_no||' / '||v_variant.name,auth.uid());
     insert into public.job_line_costs(organization_id,job_line_id,cost_type,description,estimated_amount,actual_amount) values(p_organization_id,v_line_id,'inventory_variant',v_variant.name,coalesce((v_consumption->>'cost')::numeric,v_qty*v_variant.cost_per_unit),coalesce((v_consumption->>'cost')::numeric,v_qty*v_variant.cost_per_unit));
   else
     if nullif(v_consumption->>'inventory_item_id','') is null then continue; end if;
     select * into v_item from public.inventory_items where id=(v_consumption->>'inventory_item_id')::uuid and organization_id=p_organization_id for update;
     if not found then raise exception 'Inventory item not found in this organization'; end if;
     if v_item.current_stock-v_qty<0 then raise exception 'Insufficient stock for % (available %, requested %)',v_item.name,v_item.current_stock,v_qty; end if;
     v_prev:=v_item.current_stock; update public.inventory_items set current_stock=current_stock-v_qty,updated_at=now() where id=v_item.id;
     insert into public.v36_inventory_transactions(organization_id,inventory_item_id,order_id,transaction_type,quantity,unit,previous_stock,new_stock,reason,created_by) values(p_organization_id,v_item.id,v_order.id,'order_use',v_qty,coalesce(v_consumption->>'unit',v_item.base_unit),v_prev,v_prev-v_qty,'Consumed by '||v_no,auth.uid());
     insert into public.job_line_costs(organization_id,job_line_id,cost_type,description,estimated_amount,actual_amount) values(p_organization_id,v_line_id,'inventory',v_item.name,coalesce((v_consumption->>'cost')::numeric,0),coalesce((v_consumption->>'cost')::numeric,0));
   end if;
  end loop;
 end loop;
 update public.job_orders set subtotal=v_subtotal,grand_total=v_subtotal,estimated_cost=v_cost,estimated_profit=v_subtotal-v_cost,updated_at=now() where id=v_order.id;
 return jsonb_build_object('order_id',v_order.id,'order_no',v_no,'grand_total',v_subtotal,'estimated_cost',v_cost,'estimated_profit',v_subtotal-v_cost);
end $$;

create or replace function public.delete_unified_order_v36_restore(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.job_orders%rowtype; t record; restored numeric:=0; restored_variants numeric:=0;
begin
 select * into o from public.job_orders where id=p_order_id for update; if not found then raise exception 'Order not found'; end if;
 if not public.netvyl_is_org_admin(o.organization_id) then raise exception 'Company administrator access required'; end if;
 for t in select * from public.v36_inventory_transactions where organization_id=o.organization_id and order_id=o.id and transaction_type='order_use' order by created_at desc for update loop
   if t.inventory_variant_id is not null then update public.inventory_variants set stock=stock+t.quantity where id=t.inventory_variant_id and organization_id=o.organization_id; restored_variants:=restored_variants+t.quantity;
   elsif t.inventory_item_id is not null then update public.inventory_items set current_stock=current_stock+t.quantity,updated_at=now() where id=t.inventory_item_id and organization_id=o.organization_id; restored:=restored+t.quantity; end if;
 end loop;
 delete from public.payments where organization_id=o.organization_id and v36_order_id=o.id;
 delete from public.v36_inventory_transactions where organization_id=o.organization_id and order_id=o.id;
 delete from public.job_waste where organization_id=o.organization_id and order_id=o.id;
 delete from public.job_orders where id=o.id;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) values(o.organization_id,auth.uid(),'delete_unified_order_restore','job_order',o.id,jsonb_build_object('order_no',o.order_no,'restored_inventory',restored,'restored_variants',restored_variants));
 return jsonb_build_object('order_id',o.id,'order_no',o.order_no,'restored_inventory',restored,'restored_variants',restored_variants);
end $$;

-- ---------- Company configurable numbering / tax / receipt settings ----------
alter table public.organizations add column if not exists order_prefix text not null default 'ORD-';
alter table public.organizations add column if not exists quote_prefix text not null default 'QT-';
alter table public.organizations add column if not exists receipt_prefix text not null default 'RCT-';
alter table public.organizations add column if not exists job_prefix text not null default 'JOB-';
alter table public.organizations add column if not exists tax_rate numeric(8,4) not null default 0;
alter table public.organizations add column if not exists default_payment_method text not null default 'Transfer';
alter table public.organizations add column if not exists receipt_footer text not null default 'Thank you for your patronage.';

create or replace function public.netvyl_next_order_no(p_org_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare p text; n bigint;
begin select order_prefix into p from public.organizations where id=p_org_id; select coalesce(max(nullif(regexp_replace(order_no,'[^0-9]','','g'),'')::bigint),0)+1 into n from public.job_orders where organization_id=p_org_id; return coalesce(p,'ORD-')||lpad(n::text,6,'0'); end $$;

-- ---------- Remote session revocation ----------
alter table public.organization_members add column if not exists session_revoked_at timestamptz;
create or replace function public.netvyl_revoke_member_sessions(p_membership_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.organization_members%rowtype;
begin
 select * into m from public.organization_members where id=p_membership_id for update;
 if not found then raise exception 'Membership not found'; end if;
 if not public.netvyl_is_org_admin(m.organization_id) then raise exception 'Company administrator access required'; end if;
 update public.organization_members set session_revoked_at=now() where id=m.id;
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) values(m.organization_id,auth.uid(),'force_logout','organization_member',m.id,jsonb_build_object('user_id',m.user_id));
 return jsonb_build_object('membership_id',m.id,'revoked_at',now());
end $$;
