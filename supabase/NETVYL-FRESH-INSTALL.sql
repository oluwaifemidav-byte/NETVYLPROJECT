create extension if not exists pgcrypto;
create table if not exists public.organizations(id uuid primary key default gen_random_uuid(),name text not null,slug text not null unique,logo_url text,address text,phone text,email text,website text,currency text not null default 'NGN',tax_enabled boolean not null default false,tax_rate numeric(8,2) not null default 0,primary_color text not null default '#111111',secondary_color text not null default '#7a1f3d',status text not null default 'active' check(status in ('active','suspended','trial','expired')),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.organization_members(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,full_name text not null default '',role text not null default 'staff' check(role in ('super_admin','administrator','manager','staff','cashier','production')),active boolean not null default true,force_logout_at timestamptz,created_at timestamptz not null default now(),unique(organization_id,user_id));
create table if not exists public.materials(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,name text not null,base_name text not null,price_per_sqft numeric(12,2) not null default 0,roll_width_ft numeric(10,3) not null,initial_length_ft numeric(12,3) not null default 0,current_length_ft numeric(12,3) not null default 0,active boolean not null default true,unique(organization_id,name));
create table if not exists public.customers(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,legacy_customer_id text,name text not null,phone text,email text,address text,notes text,created_at timestamptz not null default now(),unique(organization_id,legacy_customer_id));
create table if not exists public.jobs(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,job_no text not null,legacy_job_id text,customer_id uuid references public.customers(id),customer_name_snapshot text not null,job_date date not null,material_id uuid references public.materials(id),material_name_snapshot text not null,print_cut boolean not null default false,width numeric(12,5) not null default 0,height numeric(12,5) not null default 0,qty numeric(12,3) not null default 0,unit text not null default 'ft',billed_sqft numeric(14,6) not null default 0,linear_length_ft numeric(14,6) not null default 0,production_total numeric(14,2) not null default 0,design_charge numeric(14,2) not null default 0,grand_total numeric(14,2) not null default 0,amount_paid numeric(14,2) not null default 0,receipt_no text,status text not null default 'pending' check(status in ('pending','printing','completed','cancelled')),deleted_at timestamptz,deleted_by uuid references auth.users(id),created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,job_no),unique(organization_id,legacy_job_id));
create table if not exists public.payments(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,job_id uuid references public.jobs(id) on delete set null,legacy_job_id text,receipt_no text,customer_id uuid references public.customers(id),customer_name_snapshot text not null,payment_date date not null default current_date,amount numeric(14,2) not null,method text not null default '—',reference text,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now());
create table if not exists public.inventory_transactions(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,material_id uuid not null references public.materials(id) on delete cascade,job_id uuid references public.jobs(id) on delete cascade,transaction_type text not null check(transaction_type in ('opening','job_use','job_restore','restock','adjustment')),quantity_ft numeric(14,6) not null,previous_balance_ft numeric(14,6) not null,new_balance_ft numeric(14,6) not null,reason text,created_by uuid references auth.users(id),created_at timestamptz not null default now());
create table if not exists public.print_queue(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,job_id uuid not null references public.jobs(id) on delete cascade,status text not null default 'pending' check(status in ('pending','printing','completed','cancelled')),started_at timestamptz,completed_at timestamptz,assigned_to uuid references auth.users(id),created_at timestamptz not null default now());
create table if not exists public.audit_logs(id uuid primary key default gen_random_uuid(),organization_id uuid references public.organizations(id) on delete cascade,actor_user_id uuid references auth.users(id),action text not null,entity_type text,entity_id text,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create table if not exists public.licenses(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,plan text not null default 'trial',license_key text not null unique,starts_at timestamptz not null default now(),expires_at timestamptz,max_users integer,active boolean not null default true,created_at timestamptz not null default now());
create or replace function public.user_org_ids() returns setof uuid language sql stable security definer set search_path=public as $$ select organization_id from public.organization_members where user_id=auth.uid() and active=true; $$;
create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.active = true
      and lower(trim(om.role)) = 'super_admin'
  ); $$;
alter table public.organizations enable row level security; alter table public.organization_members enable row level security; alter table public.materials enable row level security; alter table public.customers enable row level security; alter table public.jobs enable row level security; alter table public.payments enable row level security; alter table public.inventory_transactions enable row level security; alter table public.print_queue enable row level security; alter table public.audit_logs enable row level security; alter table public.licenses enable row level security;
create policy "org read" on public.organizations for select to authenticated using(id in(select public.user_org_ids()) or public.is_platform_admin());
create policy "members read" on public.organization_members for select to authenticated using(user_id=auth.uid() or public.is_platform_admin());
create policy "platform members" on public.organization_members for all to authenticated using(public.is_platform_admin() or organization_id in(select public.user_org_ids())) with check(public.is_platform_admin() or organization_id in(select public.user_org_ids()));
create policy "materials" on public.materials for all to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin()) with check(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
create policy "customers" on public.customers for all to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin()) with check(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
create policy "jobs" on public.jobs for all to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin()) with check(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
create policy "payments" on public.payments for all to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin()) with check(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
create policy "inventory" on public.inventory_transactions for all to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin()) with check(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
create policy "queue" on public.print_queue for all to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin()) with check(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
create policy "audit read" on public.audit_logs for select to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
create policy "licenses" on public.licenses for all to authenticated using(organization_id in(select public.user_org_ids()) or public.is_platform_admin()) with check(organization_id in(select public.user_org_ids()) or public.is_platform_admin());
create or replace function public.delete_job_and_restore(p_job_id uuid) returns void language plpgsql security invoker set search_path=public as $$ declare j public.jobs%rowtype; m public.materials%rowtype; prev numeric; begin select * into j from public.jobs where id=p_job_id and deleted_at is null for update; if not found then raise exception 'Job not found or already deleted'; end if; select * into m from public.materials where id=j.material_id for update; if not found then raise exception 'Material not found'; end if; prev:=m.current_length_ft; update public.materials set current_length_ft=current_length_ft+j.linear_length_ft where id=m.id; insert into public.inventory_transactions(organization_id,material_id,job_id,transaction_type,quantity_ft,previous_balance_ft,new_balance_ft,reason,created_by) values(j.organization_id,m.id,j.id,'job_restore',j.linear_length_ft,prev,prev+j.linear_length_ft,'Inventory restored because job was deleted',auth.uid()); update public.jobs set deleted_at=now(),deleted_by=auth.uid(),status='cancelled',updated_at=now() where id=j.id; insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) values(j.organization_id,auth.uid(),'delete_job_restore_inventory','job',j.id,jsonb_build_object('job_no',j.job_no,'restored_ft',j.linear_length_ft,'material',j.material_name_snapshot)); end; $$;
-- NETVYL v25 SECURITY HARDENING
-- Run after the existing v18/master-admin migrations.
-- Purpose: close privilege-escalation paths in organization_members and licenses.
BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Organization roles: only the platform super_admin may create/assign the
--    super_admin role. Organization administrators/managers may manage normal
--    staff roles only.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "members insert by admin" ON public.organization_members;
DROP POLICY IF EXISTS "members update by admin" ON public.organization_members;

CREATE POLICY "members insert by admin" ON public.organization_members
FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_org_admin(organization_id)
    AND role IN ('administrator','manager','staff','cashier','production')
  )
);

CREATE POLICY "members update by admin" ON public.organization_members
FOR UPDATE TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR public.is_platform_admin()
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.is_org_admin(organization_id)
    AND role IN ('administrator','manager','staff','cashier','production')
  )
);

-- -----------------------------------------------------------------------------
-- 2. Licenses: customer organizations may read their license information, but
--    only Master Admin may create/change/delete licenses. The master_* RPCs are
--    SECURITY DEFINER and therefore continue to work.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "licenses" ON public.licenses;
DROP POLICY IF EXISTS "licenses read" ON public.licenses;
DROP POLICY IF EXISTS "licenses platform control" ON public.licenses;

CREATE POLICY "licenses read" ON public.licenses
FOR SELECT TO authenticated
USING (
  organization_id IN (SELECT public.user_org_ids())
  OR public.is_platform_admin()
);

CREATE POLICY "licenses platform control" ON public.licenses
FOR ALL TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 3. Useful verification queries. These do not modify data.
-- -----------------------------------------------------------------------------
COMMIT;

-- Verify the two sensitive tables are protected by RLS.
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname='public'
  AND tablename IN ('organization_members','licenses')
ORDER BY tablename;

-- Review active policies on the sensitive tables.
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('organization_members','licenses')
ORDER BY tablename, policyname;
-- NETVYL v18: fix organization_members RLS recursion + Master Admin RPC ambiguity
-- Run once in Supabase SQL Editor after v17.
BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Safe helper: determine whether the current user administers an organization.
-- SECURITY DEFINER prevents this helper from recursively evaluating the
-- organization_members RLS policies that it is used to authorize.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_admin(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.active = true
      AND om.role IN ('super_admin','administrator','manager')
  );
$$;

-- Keep platform-admin helper explicitly qualified and server-side.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.active = true
      AND om.role = 'super_admin'
  );
$$;

-- User organization IDs are also evaluated server-side so normal table policies
-- never have to recursively inspect organization_members.
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
    AND om.active = true;
$$;

-- -----------------------------------------------------------------------------
-- 2. Replace every organization_members policy that directly queries the same
-- table. The old "members update by admin" policy caused infinite recursion.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "members read" ON public.organization_members;
DROP POLICY IF EXISTS "platform members" ON public.organization_members;
DROP POLICY IF EXISTS "members update by admin" ON public.organization_members;

CREATE POLICY "members read" ON public.organization_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_org_admin(organization_id)
  OR public.is_platform_admin()
);

CREATE POLICY "members insert by admin" ON public.organization_members
FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_admin(organization_id)
  OR public.is_platform_admin()
);

CREATE POLICY "members update by admin" ON public.organization_members
FOR UPDATE TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR public.is_platform_admin()
)
WITH CHECK (
  public.is_org_admin(organization_id)
  OR public.is_platform_admin()
);

CREATE POLICY "members delete by admin" ON public.organization_members
FOR DELETE TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR public.is_platform_admin()
);

-- -----------------------------------------------------------------------------
-- 3. Recreate Master Admin RPCs with fully-qualified column references and
-- unambiguous return names. This fixes the "column reference id is ambiguous"
-- error seen while generating a license.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_create_organization(
  p_name text,
  p_slug text,
  p_currency text DEFAULT 'NGN'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_slug text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator authorization required';
  END IF;

  IF trim(coalesce(p_name,'')) = '' OR trim(coalesce(p_slug,'')) = '' THEN
    RAISE EXCEPTION 'Organization name and slug are required';
  END IF;

  v_slug := lower(regexp_replace(trim(p_slug),'[^a-zA-Z0-9]+','-','g'));

  INSERT INTO public.organizations(name,slug,currency,status)
  VALUES (
    trim(p_name),
    v_slug,
    upper(coalesce(nullif(trim(p_currency),''),'NGN')),
    'trial'
  )
  RETURNING public.organizations.id INTO v_org_id;

  INSERT INTO public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,details
  )
  VALUES (
    v_org_id,auth.uid(),'create_organization','organization',v_org_id::text,
    jsonb_build_object('name',p_name,'slug',v_slug)
  );

  RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_generate_license(
  p_organization_id uuid,
  p_plan text DEFAULT 'professional',
  p_days integer DEFAULT 365,
  p_max_users integer DEFAULT 5
) RETURNS TABLE(
  license_id uuid,
  license_key text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_license_id uuid;
  v_license_key text;
  v_expires_at timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator authorization required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  v_license_key := 'NETVYL-' ||
    upper(substr(encode(gen_random_bytes(12),'hex'),1,4)) || '-' ||
    upper(substr(encode(gen_random_bytes(12),'hex'),1,4)) || '-' ||
    upper(substr(encode(gen_random_bytes(12),'hex'),1,4));

  v_expires_at := now() + make_interval(days => greatest(coalesce(p_days,365),1));

  INSERT INTO public.licenses(
    organization_id,plan,license_key,starts_at,expires_at,max_users,
    active,status,updated_at
  )
  VALUES (
    p_organization_id,
    lower(coalesce(nullif(trim(p_plan),''),'professional')),
    v_license_key,
    now(),
    v_expires_at,
    greatest(coalesce(p_max_users,5),1),
    true,
    'active',
    now()
  )
  RETURNING public.licenses.id INTO v_license_id;

  INSERT INTO public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,details
  )
  VALUES (
    p_organization_id,auth.uid(),'generate_license','license',v_license_id::text,
    jsonb_build_object(
      'plan',p_plan,
      'max_users',p_max_users,
      'expires_at',v_expires_at
    )
  );

  RETURN QUERY
  SELECT
    v_license_id AS license_id,
    v_license_key AS license_key,
    v_expires_at AS expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_set_organization_status(
  p_organization_id uuid,
  p_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator authorization required';
  END IF;

  IF p_status NOT IN ('active','suspended','trial','expired') THEN
    RAISE EXCEPTION 'Invalid organization status';
  END IF;

  UPDATE public.organizations AS o
  SET status = p_status,
      updated_at = now()
  WHERE o.id = p_organization_id;

  INSERT INTO public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,details
  )
  VALUES (
    p_organization_id,auth.uid(),'set_organization_status',
    'organization',p_organization_id::text,
    jsonb_build_object('status',p_status)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.master_set_license_status(
  p_license_id uuid,
  p_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator authorization required';
  END IF;

  IF p_status NOT IN ('active','suspended','expired','revoked','pending') THEN
    RAISE EXCEPTION 'Invalid license status';
  END IF;

  SELECT l.organization_id
  INTO v_org_id
  FROM public.licenses AS l
  WHERE l.id = p_license_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'License not found';
  END IF;

  UPDATE public.licenses AS l
  SET status = p_status,
      active = (p_status = 'active'),
      updated_at = now()
  WHERE l.id = p_license_id;

  INSERT INTO public.audit_logs(
    organization_id,actor_user_id,action,entity_type,entity_id,details
  )
  VALUES (
    v_org_id,auth.uid(),'set_license_status','license',p_license_id::text,
    jsonb_build_object('status',p_status)
  );
END;
$$;

COMMIT;
-- NETVYL Administration v13
-- Enables company-profile updates and safe staff onboarding/management.
BEGIN;

DROP POLICY IF EXISTS "organizations update by admin" ON public.organizations;
CREATE POLICY "organizations update by admin" ON public.organizations
FOR UPDATE TO authenticated
USING (
  id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id=auth.uid() AND active=true
      AND role IN ('super_admin','administrator','manager')
  ) OR public.is_platform_admin()
)
WITH CHECK (
  id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id=auth.uid() AND active=true
      AND role IN ('super_admin','administrator','manager')
  ) OR public.is_platform_admin()
);

CREATE OR REPLACE FUNCTION public.add_organization_member(
  p_organization_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_role text DEFAULT 'staff'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id=p_organization_id AND user_id=auth.uid() AND active=true
      AND role IN ('super_admin','administrator','manager')
  ) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Administrator authorization required';
  END IF;
  IF p_role NOT IN ('administrator','manager','staff','cashier','production') THEN
    RAISE EXCEPTION 'Invalid staff role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id) THEN
    RAISE EXCEPTION 'Auth user not found. The staff member must create an account first.';
  END IF;
  INSERT INTO public.organization_members(organization_id,user_id,full_name,role,active)
  VALUES(p_organization_id,p_user_id,p_full_name,p_role,true)
  ON CONFLICT (organization_id,user_id) DO UPDATE
    SET full_name=excluded.full_name, role=excluded.role, active=true
  RETURNING id INTO v_id;
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_organization_id,auth.uid(),'add_staff','organization_member',v_id::text,
    jsonb_build_object('user_id',p_user_id,'role',p_role));
  RETURN v_id;
END; $$;

-- Permit authenticated users to read their organization's members (existing policy may already cover this).
DROP POLICY IF EXISTS "members update by admin" ON public.organization_members;
CREATE POLICY "members update by admin" ON public.organization_members
FOR UPDATE TO authenticated
USING (
  (organization_id IN (SELECT public.user_org_ids()) AND EXISTS (
    SELECT 1 FROM public.organization_members me
    WHERE me.organization_id=organization_members.organization_id
      AND me.user_id=auth.uid() AND me.active=true
      AND me.role IN ('super_admin','administrator','manager')
  )) OR public.is_platform_admin()
)
WITH CHECK (
  organization_id IN (SELECT public.user_org_ids()) OR public.is_platform_admin()
);

-- Audit insert is restricted to members; server-side functions can also write audit records.
DROP POLICY IF EXISTS "audit insert by member" ON public.audit_logs;
CREATE POLICY "audit insert by member" ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (organization_id IN (SELECT public.user_org_ids()) OR public.is_platform_admin());

COMMIT;
-- NETVYL Master Admin v14
-- Platform-level organization and license controls. Run after all prior migrations.
BEGIN;

-- Keep license status explicit while preserving the existing active column.
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','suspended','expired','revoked','pending'));
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE public.licenses SET status = CASE WHEN active THEN 'active' ELSE 'suspended' END WHERE status IS NULL OR status='';

CREATE OR REPLACE FUNCTION public.master_create_organization(
  p_name text,
  p_slug text,
  p_currency text DEFAULT 'NGN'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator authorization required'; END IF;
  IF trim(p_name)='' OR trim(p_slug)='' THEN RAISE EXCEPTION 'Organization name and slug are required'; END IF;
  INSERT INTO public.organizations(name,slug,currency,status)
  VALUES(trim(p_name), lower(regexp_replace(trim(p_slug),'[^a-zA-Z0-9]+','-','g')), upper(coalesce(nullif(trim(p_currency),''),'NGN')), 'trial')
  RETURNING id INTO v_id;
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(v_id,auth.uid(),'create_organization','organization',v_id::text,jsonb_build_object('name',p_name,'slug',p_slug));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.master_generate_license(
  p_organization_id uuid,
  p_plan text DEFAULT 'professional',
  p_days integer DEFAULT 365,
  p_max_users integer DEFAULT 5
) RETURNS TABLE(id uuid, license_key text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_key text; v_id uuid; v_exp timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator authorization required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id=p_organization_id) THEN RAISE EXCEPTION 'Organization not found'; END IF;
  v_key := 'NETVYL-' || upper(substr(encode(gen_random_bytes(12),'hex'),1,4)) || '-' || upper(substr(encode(gen_random_bytes(12),'hex'),1,4)) || '-' || upper(substr(encode(gen_random_bytes(12),'hex'),1,4));
  v_exp := now() + make_interval(days => greatest(p_days,1));
  INSERT INTO public.licenses(organization_id,plan,license_key,starts_at,expires_at,max_users,active,status,updated_at)
  VALUES(p_organization_id,lower(p_plan),v_key,now(),v_exp,greatest(p_max_users,1),true,'active',now())
  RETURNING public.licenses.id INTO v_id;
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_organization_id,auth.uid(),'generate_license','license',v_id::text,jsonb_build_object('plan',p_plan,'max_users',p_max_users,'expires_at',v_exp));
  RETURN QUERY SELECT v_id,v_key,v_exp;
END; $$;

CREATE OR REPLACE FUNCTION public.master_set_organization_status(p_organization_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator authorization required'; END IF;
  IF p_status NOT IN ('active','suspended','trial','expired') THEN RAISE EXCEPTION 'Invalid organization status'; END IF;
  UPDATE public.organizations SET status=p_status,updated_at=now() WHERE id=p_organization_id;
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_organization_id,auth.uid(),'set_organization_status','organization',p_organization_id::text,jsonb_build_object('status',p_status));
END; $$;

CREATE OR REPLACE FUNCTION public.master_set_license_status(p_license_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator authorization required'; END IF;
  IF p_status NOT IN ('active','suspended','expired','revoked','pending') THEN RAISE EXCEPTION 'Invalid license status'; END IF;
  SELECT organization_id INTO v_org FROM public.licenses WHERE id=p_license_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'License not found'; END IF;
  UPDATE public.licenses SET status=p_status,active=(p_status='active'),updated_at=now() WHERE id=p_license_id;
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(v_org,auth.uid(),'set_license_status','license',p_license_id::text,jsonb_build_object('status',p_status));
END; $$;

COMMIT;
-- NETVYL Business Management Platform
-- Material onboarding, editing and restocking (v12)
-- Run after the existing production/sequence/receipt migrations.

create or replace function public.is_org_inventory_admin(p_org uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id=p_org
      and user_id=auth.uid()
      and active=true
      and role in ('super_admin','administrator','manager')
  );
$$;

create or replace function public.create_material(
  p_org uuid,
  p_name text,
  p_base_name text,
  p_price_per_sqft numeric,
  p_roll_width_ft numeric,
  p_opening_length_ft numeric,
  p_low_stock_ft numeric default 10,
  p_active boolean default true
) returns public.materials
language plpgsql security invoker set search_path=public
as $$
declare m public.materials%rowtype;
begin
  if not public.is_org_inventory_admin(p_org) then raise exception 'You do not have permission to add materials'; end if;
  if trim(coalesce(p_name,''))='' then raise exception 'Material name is required'; end if;
  if p_roll_width_ft <= 0 then raise exception 'Roll width must be greater than zero'; end if;
  if p_price_per_sqft < 0 or p_opening_length_ft < 0 or p_low_stock_ft < 0 then raise exception 'Material values cannot be negative'; end if;
  insert into public.materials(organization_id,name,base_name,price_per_sqft,roll_width_ft,initial_length_ft,current_length_ft,active)
  values(p_org,trim(p_name),trim(coalesce(p_base_name,p_name)),p_price_per_sqft,p_roll_width_ft,p_opening_length_ft,p_opening_length_ft,p_active)
  returning * into m;
  insert into public.inventory_transactions(organization_id,material_id,transaction_type,quantity_ft,previous_balance_ft,new_balance_ft,reason,created_by)
  values(p_org,m.id,'opening',p_opening_length_ft,0,p_opening_length_ft,'Material created with opening stock',auth.uid());
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_org,auth.uid(),'create_material','material',m.id,jsonb_build_object('name',m.name,'opening_ft',p_opening_length_ft,'low_stock_ft',p_low_stock_ft));
  return m;
exception when unique_violation then
  raise exception 'A material with this name already exists in this organization';
end; $$;

create or replace function public.update_material(
  p_material_id uuid,
  p_name text,
  p_base_name text,
  p_price_per_sqft numeric,
  p_roll_width_ft numeric,
  p_active boolean
) returns public.materials
language plpgsql security invoker set search_path=public
as $$
declare m public.materials%rowtype;
begin
  select * into m from public.materials where id=p_material_id for update;
  if not found then raise exception 'Material not found'; end if;
  if not public.is_org_inventory_admin(m.organization_id) then raise exception 'You do not have permission to edit materials'; end if;
  if trim(coalesce(p_name,''))='' or p_roll_width_ft <= 0 or p_price_per_sqft < 0 then raise exception 'Invalid material details'; end if;
  update public.materials set name=trim(p_name),base_name=trim(coalesce(p_base_name,p_name)),price_per_sqft=p_price_per_sqft,roll_width_ft=p_roll_width_ft,active=p_active where id=p_material_id returning * into m;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  values(m.organization_id,auth.uid(),'update_material','material',m.id,jsonb_build_object('name',m.name,'price_per_sqft',m.price_per_sqft,'roll_width_ft',m.roll_width_ft,'active',m.active));
  return m;
end; $$;

create or replace function public.restock_material(
  p_material_id uuid,
  p_quantity_ft numeric,
  p_reason text default 'Stock restock'
) returns public.materials
language plpgsql security invoker set search_path=public
as $$
declare m public.materials%rowtype; prev numeric;
begin
  if p_quantity_ft <= 0 then raise exception 'Restock quantity must be greater than zero'; end if;
  select * into m from public.materials where id=p_material_id for update;
  if not found then raise exception 'Material not found'; end if;
  if not public.is_org_inventory_admin(m.organization_id) then raise exception 'You do not have permission to restock materials'; end if;
  prev:=m.current_length_ft;
  update public.materials set current_length_ft=current_length_ft+p_quantity_ft where id=m.id returning * into m;
  insert into public.inventory_transactions(organization_id,material_id,transaction_type,quantity_ft,previous_balance_ft,new_balance_ft,reason,created_by)
  values(m.organization_id,m.id,'restock',p_quantity_ft,prev,m.current_length_ft,coalesce(nullif(trim(p_reason),''),'Stock restock'),auth.uid());
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  values(m.organization_id,auth.uid(),'restock_material','material',m.id,jsonb_build_object('quantity_ft',p_quantity_ft,'previous_balance_ft',prev,'new_balance_ft',m.current_length_ft));
  return m;
end; $$;

-- Store per-material low-stock threshold without changing existing stock data.
alter table public.materials add column if not exists low_stock_ft numeric(12,3) not null default 10;

update public.materials set low_stock_ft=10 where low_stock_ft is null;
-- NETVYL v11: repair and harden job numbering so new jobs always continue
-- from the highest existing JOB number, including imported historical jobs.
-- Run AFTER customer-job-sequences.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_organization_job_sequence(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_max_job integer;
  v_current integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('netvyl-job-' || p_organization_id::text));

  SELECT COALESCE(MAX(NULLIF(regexp_replace(job_no, '\\D', '', 'g'), '')::integer),0)
    INTO v_max_job
  FROM public.jobs
  WHERE organization_id=p_organization_id;

  INSERT INTO public.organization_sequences(organization_id,next_job_no,next_receipt_no)
  VALUES(p_organization_id,v_max_job+1,1)
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT next_job_no INTO v_current
  FROM public.organization_sequences
  WHERE organization_id=p_organization_id
  FOR UPDATE;

  IF v_current <= v_max_job THEN
    UPDATE public.organization_sequences
      SET next_job_no=v_max_job+1, updated_at=now()
      WHERE organization_id=p_organization_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_job_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_next integer;
  v_max_job integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('netvyl-job-' || p_organization_id::text));

  SELECT COALESCE(MAX(NULLIF(regexp_replace(job_no, '\\D', '', 'g'), '')::integer),0)
    INTO v_max_job
  FROM public.jobs
  WHERE organization_id=p_organization_id;

  INSERT INTO public.organization_sequences(organization_id,next_job_no,next_receipt_no)
  VALUES(p_organization_id,v_max_job+1,1)
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT next_job_no INTO v_next
  FROM public.organization_sequences
  WHERE organization_id=p_organization_id
  FOR UPDATE;

  IF v_next <= v_max_job THEN
    v_next := v_max_job + 1;
  END IF;

  UPDATE public.organization_sequences
    SET next_job_no=v_next+1, updated_at=now()
    WHERE organization_id=p_organization_id;

  RETURN 'JOB-' || lpad(v_next::text,3,'0');
END;
$$;

-- Repair every existing organization so each tenant sequence continues
-- after the highest imported/existing job number.
SELECT public.sync_organization_job_sequence(id)
FROM public.organizations
;

COMMIT;
-- NETVYL: Consolidated customer/day receipts
-- Run AFTER production-migration.sql and customer-job-sequences.sql.
-- A customer can have multiple jobs on the same job date; paid jobs on that date share one receipt.
BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_day_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  receipt_date date NOT NULL,
  receipt_no text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, customer_id, receipt_date),
  UNIQUE (organization_id, receipt_no)
);
ALTER TABLE public.customer_day_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer day receipts" ON public.customer_day_receipts;
CREATE POLICY "customer day receipts" ON public.customer_day_receipts FOR ALL TO authenticated
USING (organization_id IN (SELECT public.user_org_ids()) OR public.is_platform_admin())
WITH CHECK (organization_id IN (SELECT public.user_org_ids()) OR public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.get_customer_day_receipt(p_organization_id uuid,p_customer_id uuid,p_date date)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_receipt text; v_customer text;
BEGIN
  IF p_customer_id IS NULL THEN RETURN NULL; END IF;
  SELECT receipt_no INTO v_receipt FROM public.customer_day_receipts
  WHERE organization_id=p_organization_id AND customer_id=p_customer_id AND receipt_date=p_date;
  IF v_receipt IS NOT NULL THEN RETURN v_receipt; END IF;
  SELECT name INTO v_customer FROM public.customers WHERE id=p_customer_id AND organization_id=p_organization_id;
  v_receipt := public.next_receipt_number(p_organization_id,p_date);
  INSERT INTO public.customer_day_receipts(organization_id,customer_id,receipt_date,receipt_no)
  VALUES(p_organization_id,p_customer_id,p_date,v_receipt)
  ON CONFLICT (organization_id,customer_id,receipt_date) DO NOTHING;
  SELECT receipt_no INTO v_receipt FROM public.customer_day_receipts
  WHERE organization_id=p_organization_id AND customer_id=p_customer_id AND receipt_date=p_date;
  RETURN v_receipt;
END; $$;

-- Replace the job/payment functions so a paid customer/day uses one shared receipt.
CREATE OR REPLACE FUNCTION public.create_job_with_inventory(
  p_organization_id uuid,p_job_no text,p_customer_id uuid,p_customer_name text,p_job_date date,
  p_material_id uuid,p_print_cut boolean,p_width numeric,p_height numeric,p_qty numeric,p_unit text,
  p_billed_sqft numeric,p_linear_length_ft numeric,p_production_total numeric,p_design_charge numeric,
  p_grand_total numeric,p_amount_paid numeric DEFAULT 0,p_payment_method text DEFAULT '—',p_receipt_no text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_job_id uuid; v_prev numeric; v_new numeric; v_job_no text; v_receipt text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_organization_id AND user_id=auth.uid() AND active=true) AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not authorized for this organization'; END IF;
 IF p_amount_paid<0 OR p_amount_paid>p_grand_total THEN RAISE EXCEPTION 'Payment amount must be between zero and the job total'; END IF;
 v_job_no:=COALESCE(NULLIF(trim(p_job_no),''),public.next_job_number(p_organization_id));
 SELECT current_length_ft INTO v_prev FROM public.materials WHERE id=p_material_id AND organization_id=p_organization_id AND active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
 IF v_prev<p_linear_length_ft THEN RAISE EXCEPTION 'Insufficient inventory. Available: % ft, required: % ft',v_prev,p_linear_length_ft; END IF;
 v_new:=round((v_prev-p_linear_length_ft)::numeric,6);
 v_receipt := COALESCE(NULLIF(trim(p_receipt_no),''),public.get_customer_day_receipt(p_organization_id,p_customer_id,p_job_date));
 INSERT INTO public.jobs(organization_id,job_no,customer_id,customer_name_snapshot,job_date,material_id,material_name_snapshot,print_cut,width,height,qty,unit,billed_sqft,linear_length_ft,production_total,design_charge,grand_total,amount_paid,receipt_no,status,created_by,updated_at)
 SELECT p_organization_id,v_job_no,p_customer_id,p_customer_name,p_job_date,m.id,m.name,p_print_cut,p_width,p_height,p_qty,p_unit,p_billed_sqft,p_linear_length_ft,p_production_total,p_design_charge,p_grand_total,p_amount_paid,v_receipt,'pending',auth.uid(),now()
 FROM public.materials m WHERE m.id=p_material_id;
 SELECT id INTO v_job_id FROM public.jobs WHERE organization_id=p_organization_id AND job_no=v_job_no;
 UPDATE public.materials SET current_length_ft=v_new,updated_at=now() WHERE id=p_material_id;
 INSERT INTO public.inventory_transactions(organization_id,material_id,job_id,transaction_type,quantity_ft,previous_balance_ft,new_balance_ft,reason,created_by) VALUES(p_organization_id,p_material_id,v_job_id,'job_use',p_linear_length_ft,v_prev,v_new,'Material consumed by new job',auth.uid());
 INSERT INTO public.print_queue(organization_id,job_id,status) VALUES(p_organization_id,v_job_id,'pending');
 IF v_receipt IS NOT NULL THEN
   UPDATE public.jobs SET receipt_no=v_receipt WHERE organization_id=p_organization_id AND customer_id=p_customer_id AND job_date=p_job_date AND deleted_at IS NULL AND receipt_no IS NULL;
 END IF;
 IF p_amount_paid>0 THEN
   INSERT INTO public.payments(organization_id,job_id,receipt_no,customer_id,customer_name_snapshot,payment_date,amount,method,created_by) VALUES(p_organization_id,v_job_id,v_receipt,p_customer_id,p_customer_name,p_job_date,p_amount_paid,p_payment_method,auth.uid());
 END IF;
 INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES(p_organization_id,auth.uid(),'create_job','job',v_job_id::text,jsonb_build_object('job_no',v_job_no,'receipt_no',v_receipt,'customer_id',p_customer_id,'job_date',p_job_date));
 RETURN v_job_id;
END; $$;

CREATE OR REPLACE FUNCTION public.record_job_payment(p_job_id uuid,p_amount numeric,p_method text DEFAULT '—',p_reference text DEFAULT NULL,p_notes text DEFAULT NULL,p_payment_date date DEFAULT current_date)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j public.jobs%rowtype; v_payment_id uuid; v_total_paid numeric; v_receipt text;
BEGIN
 IF p_amount<=0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
 SELECT * INTO j FROM public.jobs WHERE id=p_job_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
 IF p_amount>(j.grand_total-j.amount_paid) THEN RAISE EXCEPTION 'Payment exceeds outstanding balance'; END IF;
 v_receipt:=public.get_customer_day_receipt(j.organization_id,j.customer_id,j.job_date);
 INSERT INTO public.payments(organization_id,job_id,legacy_job_id,receipt_no,customer_id,customer_name_snapshot,payment_date,amount,method,reference,notes,created_by)
 VALUES(j.organization_id,j.id,j.legacy_job_id,v_receipt,j.customer_id,j.customer_name_snapshot,p_payment_date,p_amount,p_method,p_reference,p_notes,auth.uid()) RETURNING id INTO v_payment_id;
 SELECT COALESCE(SUM(amount),0) INTO v_total_paid FROM public.payments WHERE job_id=j.id;
 UPDATE public.jobs SET amount_paid=v_total_paid,receipt_no=v_receipt,status=CASE WHEN v_total_paid>=grand_total THEN 'completed' ELSE status END,updated_at=now() WHERE id=j.id;
 UPDATE public.jobs SET receipt_no=v_receipt WHERE organization_id=j.organization_id AND customer_id=j.customer_id AND job_date=j.job_date AND deleted_at IS NULL AND receipt_no IS NULL;
 INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES(j.organization_id,auth.uid(),'record_payment','job',j.id::text,jsonb_build_object('amount',p_amount,'method',p_method,'receipt_no',v_receipt));
 RETURN v_payment_id;
END; $$;

COMMIT;
-- NETVYL: Customer/job/receipt numbering + payment improvements
-- Run AFTER supabase/production-migration.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_sequences (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  next_job_no integer NOT NULL DEFAULT 1,
  next_receipt_no integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "organization sequences" ON public.organization_sequences;
CREATE POLICY "organization sequences" ON public.organization_sequences
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.user_org_ids()) OR public.is_platform_admin())
  WITH CHECK (organization_id IN (SELECT public.user_org_ids()) OR public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.next_job_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_max_job integer;
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('netvyl-job-' || p_organization_id::text));

  INSERT INTO public.organization_sequences(organization_id, next_job_no, next_receipt_no)
  VALUES (
    p_organization_id,
    COALESCE((SELECT MAX(CAST(regexp_replace(job_no, '\\D', '', 'g') AS integer))
      FROM public.jobs
      WHERE organization_id = p_organization_id
        AND job_no ~ '^[A-Za-z-]*[0-9]+$'), 0) + 1,
    COALESCE((SELECT MAX(CAST(regexp_replace(receipt_no, '\\D', '', 'g') AS integer))
      FROM public.payments
      WHERE organization_id = p_organization_id
        AND receipt_no ~ '^[A-Za-z-]*[0-9]+$'), 0) + 1
  ) ON CONFLICT (organization_id) DO NOTHING;

  SELECT COALESCE(MAX(CAST(regexp_replace(job_no, '\\D', '', 'g') AS integer)), 0)
    INTO v_max_job
  FROM public.jobs
  WHERE organization_id = p_organization_id
    AND job_no ~ '^[A-Za-z-]*[0-9]+$';

  SELECT next_job_no INTO v_next
  FROM public.organization_sequences
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF v_next <= v_max_job THEN
    v_next := v_max_job + 1;
  END IF;

  UPDATE public.organization_sequences
  SET next_job_no = v_next + 1,
      updated_at = now()
  WHERE organization_id = p_organization_id;

  RETURN 'JOB-' || lpad(v_next::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_receipt_number(p_organization_id uuid, p_date date DEFAULT current_date)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_max_receipt integer;
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('netvyl-receipt-' || p_organization_id::text));

  INSERT INTO public.organization_sequences(organization_id, next_job_no, next_receipt_no)
  VALUES (
    p_organization_id,
    COALESCE((SELECT MAX(CAST(regexp_replace(job_no, '\\D', '', 'g') AS integer))
      FROM public.jobs
      WHERE organization_id = p_organization_id
        AND job_no ~ '^[A-Za-z-]*[0-9]+$'), 0) + 1,
    COALESCE((SELECT MAX(CAST(regexp_replace(receipt_no, '\\D', '', 'g') AS integer))
      FROM public.payments
      WHERE organization_id = p_organization_id
        AND receipt_no ~ '^[A-Za-z-]*[0-9]+$'), 0) + 1
  ) ON CONFLICT (organization_id) DO NOTHING;

  SELECT COALESCE(MAX(CAST(regexp_replace(receipt_no, '\\D', '', 'g') AS integer)), 0)
    INTO v_max_receipt
  FROM public.payments
  WHERE organization_id = p_organization_id
    AND receipt_no ~ '^[A-Za-z-]*[0-9]+$';

  SELECT next_receipt_no INTO v_next
  FROM public.organization_sequences
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF v_next <= v_max_receipt THEN
    v_next := v_max_receipt + 1;
  END IF;

  UPDATE public.organization_sequences
  SET next_receipt_no = v_next + 1,
      updated_at = now()
  WHERE organization_id = p_organization_id;

  RETURN 'REC-' || to_char(p_date, 'YYYYMMDD') || '-' || lpad(v_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_job_with_inventory(
  p_organization_id uuid,
  p_job_no text,
  p_customer_id uuid,
  p_customer_name text,
  p_job_date date,
  p_material_id uuid,
  p_print_cut boolean,
  p_width numeric,
  p_height numeric,
  p_qty numeric,
  p_unit text,
  p_billed_sqft numeric,
  p_linear_length_ft numeric,
  p_production_total numeric,
  p_design_charge numeric,
  p_grand_total numeric,
  p_amount_paid numeric DEFAULT 0,
  p_payment_method text DEFAULT '—',
  p_receipt_no text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_prev numeric;
  v_new numeric;
  v_job_no text;
  v_receipt text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
      AND active = true
  ) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;

  IF p_amount_paid < 0 OR p_amount_paid > p_grand_total THEN
    RAISE EXCEPTION 'Payment amount must be between zero and the job total';
  END IF;

  IF p_linear_length_ft < 0 OR p_billed_sqft < 0 THEN
    RAISE EXCEPTION 'Invalid print dimensions';
  END IF;

  v_job_no := COALESCE(NULLIF(trim(p_job_no), ''), public.next_job_number(p_organization_id));

  SELECT current_length_ft INTO v_prev
  FROM public.materials
  WHERE id = p_material_id
    AND organization_id = p_organization_id
    AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material not found';
  END IF;

  IF v_prev < p_linear_length_ft THEN
    RAISE EXCEPTION 'Insufficient inventory. Available: % ft, required: % ft', v_prev, p_linear_length_ft;
  END IF;

  v_new := round((v_prev - p_linear_length_ft)::numeric, 6);

  IF p_amount_paid > 0 THEN
    v_receipt := COALESCE(NULLIF(trim(p_receipt_no), ''), public.next_receipt_number(p_organization_id, p_job_date));
  ELSE
    v_receipt := NULL;
  END IF;

  INSERT INTO public.jobs(
    organization_id,
    job_no,
    customer_id,
    customer_name_snapshot,
    job_date,
    material_id,
    material_name_snapshot,
    print_cut,
    width,
    height,
    qty,
    unit,
    billed_sqft,
    linear_length_ft,
    production_total,
    design_charge,
    grand_total,
    amount_paid,
    receipt_no,
    status,
    created_by,
    updated_at
  )
  SELECT
    p_organization_id,
    v_job_no,
    p_customer_id,
    p_customer_name,
    p_job_date,
    m.id,
    m.name,
    p_print_cut,
    p_width,
    p_height,
    p_qty,
    p_unit,
    p_billed_sqft,
    p_linear_length_ft,
    p_production_total,
    p_design_charge,
    p_grand_total,
    p_amount_paid,
    v_receipt,
    'pending',
    auth.uid(),
    now()
  FROM public.materials m
  WHERE m.id = p_material_id
  RETURNING id INTO v_job_id;

  UPDATE public.materials
  SET current_length_ft = v_new,
      updated_at = now()
  WHERE id = p_material_id;

  INSERT INTO public.inventory_transactions(
    organization_id,
    material_id,
    job_id,
    transaction_type,
    quantity_ft,
    previous_balance_ft,
    new_balance_ft,
    reason,
    created_by
  )
  VALUES (
    p_organization_id,
    p_material_id,
    v_job_id,
    'job_use',
    p_linear_length_ft,
    v_prev,
    v_new,
    'Material consumed by new job',
    auth.uid()
  );

  INSERT INTO public.print_queue(organization_id, job_id, status)
  VALUES (p_organization_id, v_job_id, 'pending');

  IF p_amount_paid > 0 THEN
    INSERT INTO public.payments(
      organization_id,
      job_id,
      receipt_no,
      customer_id,
      customer_name_snapshot,
      payment_date,
      amount,
      method,
      created_by
    )
    VALUES (
      p_organization_id,
      v_job_id,
      v_receipt,
      p_customer_id,
      p_customer_name,
      p_job_date,
      p_amount_paid,
      p_payment_method,
      auth.uid()
    );
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    p_organization_id,
    auth.uid(),
    'create_job',
    'job',
    v_job_id::text,
    jsonb_build_object(
      'job_no', v_job_no,
      'receipt_no', v_receipt,
      'customer_id', p_customer_id,
      'material_id', p_material_id,
      'material_name_snapshot', (SELECT name FROM public.materials WHERE id = p_material_id),
      'linear_length_ft', p_linear_length_ft
    )
  );

  RETURN v_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_job_payment(
  p_job_id uuid,
  p_amount numeric,
  p_method text DEFAULT '—',
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_date date DEFAULT current_date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  j public.jobs%rowtype;
  v_payment_id uuid;
  v_total_paid numeric;
  v_receipt text;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  SELECT * INTO j
  FROM public.jobs
  WHERE id = p_job_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF p_amount > (j.grand_total - j.amount_paid) THEN
    RAISE EXCEPTION 'Payment exceeds outstanding balance';
  END IF;

  v_receipt := public.next_receipt_number(j.organization_id, p_payment_date);

  INSERT INTO public.payments(
    organization_id,
    job_id,
    legacy_job_id,
    receipt_no,
    customer_id,
    customer_name_snapshot,
    payment_date,
    amount,
    method,
    reference,
    notes,
    created_by
  )
  VALUES (
    j.organization_id,
    j.id,
    j.legacy_job_id,
    v_receipt,
    j.customer_id,
    j.customer_name_snapshot,
    p_payment_date,
    p_amount,
    p_method,
    p_reference,
    p_notes,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM public.payments
  WHERE job_id = j.id;

  UPDATE public.jobs
  SET amount_paid = v_total_paid,
      receipt_no = COALESCE(receipt_no, v_receipt),
      status = CASE WHEN v_total_paid >= grand_total THEN 'completed' ELSE status END,
      updated_at = now()
  WHERE id = j.id;

  INSERT INTO public.audit_logs(
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    j.organization_id,
    auth.uid(),
    'record_payment',
    'job',
    j.id::text,
    jsonb_build_object(
      'amount', p_amount,
      'method', p_method,
      'receipt_no', v_receipt
    )
  );

  RETURN v_payment_id;
END;
$$;

COMMIT;
-- NETVYL v17: multi-line customer orders + safe organization reset
BEGIN;

-- Create a customer order from multiple calculator lines atomically.
-- Each calculator line remains a separate JOB record, matching the legacy
-- Shalom workflow, while sharing the same customer/date receipt when money
-- is collected for the order.
CREATE OR REPLACE FUNCTION public.create_customer_order_with_inventory(
  p_organization_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_job_date date,
  p_lines jsonb,
  p_payment_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT '—'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line jsonb;
  v_job_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_total numeric := 0;
  v_remaining numeric := GREATEST(COALESCE(p_payment_amount,0),0);
  v_paid numeric;
  v_receipt text := NULL;
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id=p_organization_id
      AND user_id=auth.uid()
      AND active=true
  ) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;

  IF p_customer_id IS NULL OR NULLIF(trim(p_customer_name),'') IS NULL THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;

  IF p_job_date IS NULL THEN
    RAISE EXCEPTION 'Job date is required';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Add at least one line to the order';
  END IF;

  SELECT COALESCE(SUM(COALESCE((x->>'grand_total')::numeric,0)),0)
    INTO v_total
  FROM jsonb_array_elements(p_lines) x;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Order total must be greater than zero';
  END IF;

  IF COALESCE(p_payment_amount,0) < 0 OR COALESCE(p_payment_amount,0) > v_total THEN
    RAISE EXCEPTION 'Payment amount must be between zero and the order total';
  END IF;

  v_receipt := public.get_customer_day_receipt(
    p_organization_id,
    p_customer_id,
    p_job_date
  );

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_paid := LEAST(v_remaining, COALESCE((v_line->>'grand_total')::numeric,0));

    v_job_id := public.create_job_with_inventory(
      p_organization_id,
      NULL,
      p_customer_id,
      p_customer_name,
      p_job_date,
      (v_line->>'material_id')::uuid,
      COALESCE((v_line->>'print_cut')::boolean,false),
      COALESCE((v_line->>'width')::numeric,0),
      COALESCE((v_line->>'height')::numeric,0),
      COALESCE((v_line->>'qty')::numeric,0),
      COALESCE(v_line->>'unit','ft'),
      COALESCE((v_line->>'billed_sqft')::numeric,0),
      COALESCE((v_line->>'linear_length_ft')::numeric,0),
      COALESCE((v_line->>'production_total')::numeric,0),
      COALESCE((v_line->>'design_charge')::numeric,0),
      COALESCE((v_line->>'grand_total')::numeric,0),
      v_paid,
      CASE WHEN v_paid > 0 THEN COALESCE(NULLIF(trim(p_payment_method),''),'—') ELSE '—' END,
      CASE WHEN v_paid > 0 THEN v_receipt ELSE NULL END
    );

    v_ids := array_append(v_ids,v_job_id);
    v_remaining := ROUND((v_remaining-v_paid)::numeric,2);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'job_ids', to_jsonb(v_ids),
    'job_count', v_count,
    'order_total', ROUND(v_total,2),
    'amount_paid', ROUND(COALESCE(p_payment_amount,0),2),
    'balance', ROUND((v_total-COALESCE(p_payment_amount,0))::numeric,2),
    'receipt_no', v_receipt
  );
END;
$$;

-- Safe Fresh Start: clear operational business data for one organization,
-- preserve the organization, staff, roles, configuration and material list,
-- and restore each material to its configured opening stock.
CREATE OR REPLACE FUNCTION public.reset_organization_operational_data(
  p_organization_id uuid,
  p_confirmation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
BEGIN
  IF p_confirmation <> 'RESET' THEN
    RAISE EXCEPTION 'Confirmation text must be RESET';
  END IF;

  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE organization_id=p_organization_id
    AND user_id=auth.uid()
    AND active=true
  LIMIT 1;

  IF NOT (
    v_actor_role IN ('super_admin','administrator')
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Administrator authorization required';
  END IF;

  -- Remove operational records first to satisfy foreign keys.
  DELETE FROM public.payments
  WHERE organization_id=p_organization_id;

  DELETE FROM public.print_queue
  WHERE organization_id=p_organization_id;

  DELETE FROM public.inventory_transactions
  WHERE organization_id=p_organization_id;

  DELETE FROM public.jobs
  WHERE organization_id=p_organization_id;

  DELETE FROM public.customer_day_receipts
  WHERE organization_id=p_organization_id;

  DELETE FROM public.customers
  WHERE organization_id=p_organization_id;

  -- Clear prior operational audit history, then write one reset record below.
  DELETE FROM public.audit_logs
  WHERE organization_id=p_organization_id;

  -- Reset materials to their configured opening balances.
  UPDATE public.materials
  SET current_length_ft=initial_length_ft,
      updated_at=now()
  WHERE organization_id=p_organization_id;

  -- Reset numbering sequences so the next job/receipt starts at 001.
  DELETE FROM public.organization_sequences
  WHERE organization_id=p_organization_id;

  -- Keep an audit record showing that the reset occurred.
  INSERT INTO public.audit_logs(
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    p_organization_id,
    auth.uid(),
    'reset_organization_operational_data',
    'organization',
    p_organization_id::text,
    jsonb_build_object(
      'reset_at', now(),
      'materials_restored_to_initial_stock', true
    )
  );
END;
$$;

COMMIT;
-- NETVYL v9 receipt integrity and customer/day receipt backfill
-- Run AFTER production-migration.sql, customer-job-sequences.sql and customer-day-receipts.sql.
BEGIN;

-- Use only NETVYL-generated receipt suffixes when initializing the sequence.
-- This prevents legacy receipt numbers such as REC-CUST-117-20250922 from being
-- interpreted as a giant numeric sequence.
CREATE OR REPLACE FUNCTION public.next_receipt_number(p_organization_id uuid, p_date date DEFAULT current_date)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('netvyl-receipt-' || p_organization_id::text));
  INSERT INTO public.organization_sequences(organization_id,next_job_no,next_receipt_no)
  VALUES(
    p_organization_id,
    COALESCE((SELECT MAX(NULLIF(regexp_replace(job_no,'\\D','','g'),'')::integer) FROM public.jobs WHERE organization_id=p_organization_id),0)+1,
    COALESCE((SELECT MAX((regexp_match(receipt_no,'^REC-[0-9]{8}-([0-9]+)$'))[1]::integer) FROM public.payments WHERE organization_id=p_organization_id),0)+1
  ) ON CONFLICT (organization_id) DO NOTHING;
  SELECT next_receipt_no INTO v_next FROM public.organization_sequences WHERE organization_id=p_organization_id FOR UPDATE;
  UPDATE public.organization_sequences SET next_receipt_no=v_next+1,updated_at=now() WHERE organization_id=p_organization_id;
  RETURN 'REC-' || to_char(p_date,'YYYYMMDD') || '-' || lpad(v_next::text,4,'0');
END; $$;

-- Backfill a single shared customer/day receipt for every paid job that does not
-- already have one. Existing legacy receipt numbers are preserved.
DO $$
DECLARE r record; v_receipt text;
BEGIN
  FOR r IN
    SELECT DISTINCT organization_id,customer_id,job_date
    FROM public.jobs
    WHERE deleted_at IS NULL AND customer_id IS NOT NULL AND amount_paid > 0 AND receipt_no IS NULL
  LOOP
    v_receipt := public.get_customer_day_receipt(r.organization_id,r.customer_id,r.job_date);
    UPDATE public.jobs
      SET receipt_no=v_receipt,updated_at=now()
      WHERE organization_id=r.organization_id AND customer_id=r.customer_id AND job_date=r.job_date
        AND deleted_at IS NULL AND amount_paid > 0 AND receipt_no IS NULL;
  END LOOP;
END $$;

-- Ensure customer/day receipts contain one row for already-numbered jobs as well.
INSERT INTO public.customer_day_receipts(organization_id,customer_id,receipt_date,receipt_no)
SELECT DISTINCT organization_id,customer_id,job_date,receipt_no
FROM public.jobs
WHERE deleted_at IS NULL AND customer_id IS NOT NULL AND receipt_no IS NOT NULL
  AND receipt_no ~ '^REC-[0-9]{8}-[0-9]+$'
ON CONFLICT (organization_id,customer_id,receipt_date) DO NOTHING;

-- Replace payment recording so every payment on a customer/date uses the same receipt.
CREATE OR REPLACE FUNCTION public.record_job_payment(
  p_job_id uuid,p_amount numeric,p_method text DEFAULT '—',p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,p_payment_date date DEFAULT current_date)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE j public.jobs%rowtype; v_payment_id uuid; v_total_paid numeric; v_receipt text;
BEGIN
  IF p_amount<=0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  SELECT * INTO j FROM public.jobs WHERE id=p_job_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF p_amount>(j.grand_total-j.amount_paid) THEN RAISE EXCEPTION 'Payment exceeds outstanding balance'; END IF;
  v_receipt:=COALESCE(j.receipt_no,public.get_customer_day_receipt(j.organization_id,j.customer_id,j.job_date));
  INSERT INTO public.payments(organization_id,job_id,legacy_job_id,receipt_no,customer_id,customer_name_snapshot,payment_date,amount,method,reference,notes,created_by)
  VALUES(j.organization_id,j.id,j.legacy_job_id,v_receipt,j.customer_id,j.customer_name_snapshot,p_payment_date,p_amount,p_method,p_reference,p_notes,auth.uid())
  RETURNING id INTO v_payment_id;
  SELECT COALESCE(SUM(amount),0) INTO v_total_paid FROM public.payments WHERE job_id=j.id;
  UPDATE public.jobs SET amount_paid=v_total_paid,receipt_no=v_receipt,status=CASE WHEN v_total_paid>=grand_total THEN 'completed' ELSE status END,updated_at=now() WHERE id=j.id;
  UPDATE public.jobs SET receipt_no=v_receipt WHERE organization_id=j.organization_id AND customer_id=j.customer_id AND job_date=j.job_date AND deleted_at IS NULL AND receipt_no IS NULL;
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(j.organization_id,auth.uid(),'record_payment','job',j.id::text,jsonb_build_object('amount',p_amount,'method',p_method,'receipt_no',v_receipt));
  RETURN v_payment_id;
END; $$;

COMMIT;
-- NETVYL Business Management Platform
-- ROLE + MULTI-TENANT SECURITY HARDENING
-- Run in Supabase SQL Editor.
--
-- Approved access model:
-- super_admin   = platform-wide + Master Admin
-- administrator = organization administration, no Master Admin
-- manager       = organization administration/operations, no Master Admin
-- staff         = dashboard, customers, new job, job records, print station
-- cashier       = dashboard, customers, payments, receipts
-- production    = dashboard, job records, print station
--
-- IMPORTANT:
-- This migration deliberately uses SECURITY DEFINER helper functions to
-- prevent organization_members RLS recursion.

begin;

-- ------------------------------------------------------------
-- 1. ROLE NORMALIZATION
-- ------------------------------------------------------------

update public.organization_members
set role = lower(trim(role))
where role is not null;

-- Keep the role vocabulary used by the NETVYL application.
-- Existing unexpected roles are not silently reassigned.

-- ------------------------------------------------------------
-- 2. SECURITY-DEFINER HELPERS
-- ------------------------------------------------------------

create or replace function public.netvyl_is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.active = true
      and lower(om.role) = 'super_admin'
  );
$$;

create or replace function public.netvyl_has_org_role(
  p_org_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.netvyl_is_platform_super_admin()
    or exists (
      select 1
      from public.organization_members om
      where om.user_id = auth.uid()
        and om.organization_id = p_org_id
        and om.active = true
        and lower(om.role) = any(p_roles)
    );
$$;

create or replace function public.netvyl_is_org_member(
  p_org_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.netvyl_is_platform_super_admin()
    or exists (
      select 1
      from public.organization_members om
      where om.user_id = auth.uid()
        and om.organization_id = p_org_id
        and om.active = true
    );
$$;

create or replace function public.netvyl_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.organization_id
  from public.organization_members om
  where om.user_id = auth.uid()
    and om.active = true;
$$;

revoke all on function public.netvyl_is_platform_super_admin() from public;
revoke all on function public.netvyl_has_org_role(uuid,text[]) from public;
revoke all on function public.netvyl_is_org_member(uuid) from public;
revoke all on function public.netvyl_org_ids() from public;

grant execute on function public.netvyl_is_platform_super_admin() to authenticated;
grant execute on function public.netvyl_has_org_role(uuid,text[]) to authenticated;
grant execute on function public.netvyl_is_org_member(uuid) to authenticated;
grant execute on function public.netvyl_org_ids() to authenticated;

-- ------------------------------------------------------------
-- 3. ORGANIZATION MEMBERSHIP SECURITY
-- ------------------------------------------------------------

alter table public.organization_members enable row level security;

drop policy if exists organization_members_select on public.organization_members;
drop policy if exists organization_members_insert on public.organization_members;
drop policy if exists organization_members_update on public.organization_members;
drop policy if exists organization_members_delete on public.organization_members;

create policy organization_members_select
on public.organization_members
for select to authenticated
using (
  user_id = auth.uid()
  or public.netvyl_has_org_role(
       organization_id,
       array['super_admin','administrator','manager']
     )
);

create policy organization_members_insert
on public.organization_members
for insert to authenticated
with check (
  public.netvyl_is_platform_super_admin()
  or public.netvyl_has_org_role(
       organization_id,
       array['administrator','manager']
     )
);

create policy organization_members_update
on public.organization_members
for update to authenticated
using (
  public.netvyl_is_platform_super_admin()
  or public.netvyl_has_org_role(
       organization_id,
       array['administrator','manager']
     )
)
with check (
  public.netvyl_is_platform_super_admin()
  or public.netvyl_has_org_role(
       organization_id,
       array['administrator','manager']
     )
);

create policy organization_members_delete
on public.organization_members
for delete to authenticated
using (
  public.netvyl_is_platform_super_admin()
  or public.netvyl_has_org_role(
       organization_id,
       array['administrator']
     )
);

-- ------------------------------------------------------------
-- 4. GENERIC TENANT TABLE POLICIES
--
-- Every business table is filtered by organization_id.
-- Platform super_admin can cross organizations.
-- All other users can only access their own active organization.
-- ------------------------------------------------------------

-- CUSTOMERS
alter table public.customers enable row level security;

drop policy if exists customers_select_tenant on public.customers;
drop policy if exists customers_insert_tenant on public.customers;
drop policy if exists customers_update_tenant on public.customers;
drop policy if exists customers_delete_tenant on public.customers;

create policy customers_select_tenant on public.customers
for select to authenticated
using (public.netvyl_is_org_member(organization_id));

create policy customers_insert_tenant on public.customers
for insert to authenticated
with check (public.netvyl_is_org_member(organization_id));

create policy customers_update_tenant on public.customers
for update to authenticated
using (public.netvyl_is_org_member(organization_id))
with check (public.netvyl_is_org_member(organization_id));

create policy customers_delete_tenant on public.customers
for delete to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager']
  )
);

-- MATERIALS / INVENTORY SETTINGS
alter table public.materials enable row level security;

drop policy if exists materials_select_tenant on public.materials;
drop policy if exists materials_insert_tenant on public.materials;
drop policy if exists materials_update_tenant on public.materials;
drop policy if exists materials_delete_tenant on public.materials;

create policy materials_select_tenant on public.materials
for select to authenticated
using (public.netvyl_is_org_member(organization_id));

create policy materials_insert_tenant on public.materials
for insert to authenticated
with check (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager']
  )
);

create policy materials_update_tenant on public.materials
for update to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager']
  )
)
with check (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager']
  )
);

create policy materials_delete_tenant on public.materials
for delete to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator']
  )
);

-- JOBS
alter table public.jobs enable row level security;

drop policy if exists jobs_select_tenant on public.jobs;
drop policy if exists jobs_insert_tenant on public.jobs;
drop policy if exists jobs_update_tenant on public.jobs;
drop policy if exists jobs_delete_tenant on public.jobs;

create policy jobs_select_tenant on public.jobs
for select to authenticated
using (public.netvyl_is_org_member(organization_id));

create policy jobs_insert_tenant on public.jobs
for insert to authenticated
with check (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager','staff']
  )
);

create policy jobs_update_tenant on public.jobs
for update to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager','staff','production']
  )
)
with check (
  public.netvyl_is_org_member(organization_id)
);

create policy jobs_delete_tenant on public.jobs
for delete to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager']
  )
);

-- PAYMENTS
alter table public.payments enable row level security;

drop policy if exists payments_select_tenant on public.payments;
drop policy if exists payments_insert_tenant on public.payments;
drop policy if exists payments_update_tenant on public.payments;
drop policy if exists payments_delete_tenant on public.payments;

create policy payments_select_tenant on public.payments
for select to authenticated
using (public.netvyl_is_org_member(organization_id));

create policy payments_insert_tenant on public.payments
for insert to authenticated
with check (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager','cashier']
  )
);

create policy payments_update_tenant on public.payments
for update to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager','cashier']
  )
)
with check (public.netvyl_is_org_member(organization_id));

create policy payments_delete_tenant on public.payments
for delete to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager']
  )
);

-- INVENTORY TRANSACTIONS
alter table public.inventory_transactions enable row level security;

drop policy if exists inventory_transactions_select_tenant on public.inventory_transactions;
drop policy if exists inventory_transactions_insert_tenant on public.inventory_transactions;
drop policy if exists inventory_transactions_update_tenant on public.inventory_transactions;
drop policy if exists inventory_transactions_delete_tenant on public.inventory_transactions;

create policy inventory_transactions_select_tenant
on public.inventory_transactions
for select to authenticated
using (public.netvyl_is_org_member(organization_id));

create policy inventory_transactions_insert_tenant
on public.inventory_transactions
for insert to authenticated
with check (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager']
  )
);

create policy inventory_transactions_update_tenant
on public.inventory_transactions
for update to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager']
  )
)
with check (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager']
  )
);

create policy inventory_transactions_delete_tenant
on public.inventory_transactions
for delete to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator']
  )
);

-- PRINT QUEUE
alter table public.print_queue enable row level security;

drop policy if exists print_queue_select_tenant on public.print_queue;
drop policy if exists print_queue_insert_tenant on public.print_queue;
drop policy if exists print_queue_update_tenant on public.print_queue;
drop policy if exists print_queue_delete_tenant on public.print_queue;

create policy print_queue_select_tenant
on public.print_queue
for select to authenticated
using (public.netvyl_is_org_member(organization_id));

create policy print_queue_insert_tenant
on public.print_queue
for insert to authenticated
with check (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager','staff','production']
  )
);

create policy print_queue_update_tenant
on public.print_queue
for update to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager','staff','production']
  )
)
with check (public.netvyl_is_org_member(organization_id));

create policy print_queue_delete_tenant
on public.print_queue
for delete to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager']
  )
);

-- AUDIT LOGS
alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_tenant on public.audit_logs;
drop policy if exists audit_logs_insert_tenant on public.audit_logs;

create policy audit_logs_select_tenant
on public.audit_logs
for select to authenticated
using (
  public.netvyl_has_org_role(
    organization_id,
    array['super_admin','administrator','manager']
  )
);

create policy audit_logs_insert_tenant
on public.audit_logs
for insert to authenticated
with check (public.netvyl_is_org_member(organization_id));

-- LICENSES ARE PLATFORM-ADMIN ONLY
alter table public.licenses enable row level security;

drop policy if exists licenses_platform_select on public.licenses;
drop policy if exists licenses_platform_insert on public.licenses;
drop policy if exists licenses_platform_update on public.licenses;
drop policy if exists licenses_platform_delete on public.licenses;

create policy licenses_platform_select
on public.licenses
for select to authenticated
using (public.netvyl_is_platform_super_admin());

create policy licenses_platform_insert
on public.licenses
for insert to authenticated
with check (public.netvyl_is_platform_super_admin());

create policy licenses_platform_update
on public.licenses
for update to authenticated
using (public.netvyl_is_platform_super_admin())
with check (public.netvyl_is_platform_super_admin());

create policy licenses_platform_delete
on public.licenses
for delete to authenticated
using (public.netvyl_is_platform_super_admin());

-- ------------------------------------------------------------
-- 5. ORGANIZATION TABLE
-- Super Admin can manage all organizations.
-- Organization administrators/managers may read their organization.
-- ------------------------------------------------------------

alter table public.organizations enable row level security;

drop policy if exists organizations_select_tenant on public.organizations;
drop policy if exists organizations_update_admin on public.organizations;
drop policy if exists organizations_insert_platform on public.organizations;
drop policy if exists organizations_delete_platform on public.organizations;

create policy organizations_select_tenant
on public.organizations
for select to authenticated
using (
  public.netvyl_is_platform_super_admin()
  or public.netvyl_is_org_member(id)
);

create policy organizations_update_admin
on public.organizations
for update to authenticated
using (
  public.netvyl_has_org_role(
    id,
    array['super_admin','administrator','manager']
  )
)
with check (
  public.netvyl_has_org_role(
    id,
    array['super_admin','administrator','manager']
  )
);

create policy organizations_insert_platform
on public.organizations
for insert to authenticated
with check (public.netvyl_is_platform_super_admin());

create policy organizations_delete_platform
on public.organizations
for delete to authenticated
using (public.netvyl_is_platform_super_admin());

commit;

-- ------------------------------------------------------------
-- VERIFICATION QUERIES
-- Run these after the migration.
-- ------------------------------------------------------------

select
  id,
  email
from auth.users
where id = auth.uid();

select
  organization_id,
  role,
  active
from public.organization_members
where user_id = auth.uid();

select public.netvyl_is_platform_super_admin() as is_platform_super_admin;

select public.netvyl_org_ids() as visible_organization_id;
-- NETVYL V30 — TRUE TENANT ISOLATION
--
-- Critical correction to V29:
-- A platform Super Admin may manage organizations/licenses in Master Admin,
-- but MUST NOT automatically inherit access to every tenant's operational data.
-- Business records are always scoped to an active organization membership.
--
-- Result:
--   Shalom Digitax jobs stay in Shalom Digitax.
--   Another customer organization's jobs stay in that organization.
--   Master Admin does not reset or expose tenant job history.
--   Reset affects ONLY the organization explicitly supplied and only when
--   the authenticated user is an active member of that organization.
--
-- Run AFTER the existing V29 migrations.

BEGIN;

-- ============================================================
-- 1. SECURITY DEFINER HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.netvyl_is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.active = true
      AND lower(om.role) = 'super_admin'
  );
$$;

-- IMPORTANT: this function means TENANT MEMBERSHIP only.
-- It deliberately does NOT include platform-super-admin bypass.
CREATE OR REPLACE FUNCTION public.netvyl_is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = p_org_id
      AND om.active = true
  );
$$;

-- Organization role check is also tenant-scoped.
CREATE OR REPLACE FUNCTION public.netvyl_has_org_role(
  p_org_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = p_org_id
      AND om.active = true
      AND lower(om.role) = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.netvyl_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
    AND om.active = true;
$$;

REVOKE ALL ON FUNCTION public.netvyl_is_platform_super_admin() FROM public;
REVOKE ALL ON FUNCTION public.netvyl_is_org_member(uuid) FROM public;
REVOKE ALL ON FUNCTION public.netvyl_has_org_role(uuid,text[]) FROM public;
REVOKE ALL ON FUNCTION public.netvyl_org_ids() FROM public;

GRANT EXECUTE ON FUNCTION public.netvyl_is_platform_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.netvyl_is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.netvyl_has_org_role(uuid,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.netvyl_org_ids() TO authenticated;

-- ============================================================
-- 2. ORGANIZATION MEMBERS
-- Platform Super Admin can manage membership records.
-- Tenant admins/managers can manage their own organization's members.
-- ============================================================

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_members_select ON public.organization_members;
DROP POLICY IF EXISTS organization_members_insert ON public.organization_members;
DROP POLICY IF EXISTS organization_members_update ON public.organization_members;
DROP POLICY IF EXISTS organization_members_delete ON public.organization_members;
DROP POLICY IF EXISTS "members read" ON public.organization_members;
DROP POLICY IF EXISTS "platform members" ON public.organization_members;

CREATE POLICY organization_members_select
ON public.organization_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.netvyl_is_platform_super_admin()
  OR public.netvyl_has_org_role(organization_id, ARRAY['administrator','manager'])
);

CREATE POLICY organization_members_insert
ON public.organization_members FOR INSERT TO authenticated
WITH CHECK (
  public.netvyl_is_platform_super_admin()
  OR public.netvyl_has_org_role(organization_id, ARRAY['administrator','manager'])
);

CREATE POLICY organization_members_update
ON public.organization_members FOR UPDATE TO authenticated
USING (
  public.netvyl_is_platform_super_admin()
  OR public.netvyl_has_org_role(organization_id, ARRAY['administrator','manager'])
)
WITH CHECK (
  public.netvyl_is_platform_super_admin()
  OR public.netvyl_has_org_role(organization_id, ARRAY['administrator','manager'])
);

CREATE POLICY organization_members_delete
ON public.organization_members FOR DELETE TO authenticated
USING (
  public.netvyl_is_platform_super_admin()
  OR public.netvyl_has_org_role(organization_id, ARRAY['administrator'])
);

-- ============================================================
-- 3. BUSINESS DATA — TENANT ONLY
-- ============================================================

-- Customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_select_tenant ON public.customers;
DROP POLICY IF EXISTS customers_insert_tenant ON public.customers;
DROP POLICY IF EXISTS customers_update_tenant ON public.customers;
DROP POLICY IF EXISTS customers_delete_tenant ON public.customers;
DROP POLICY IF EXISTS "customers" ON public.customers;

CREATE POLICY customers_select_tenant ON public.customers
FOR SELECT TO authenticated
USING (public.netvyl_is_org_member(organization_id));

CREATE POLICY customers_insert_tenant ON public.customers
FOR INSERT TO authenticated
WITH CHECK (public.netvyl_is_org_member(organization_id));

CREATE POLICY customers_update_tenant ON public.customers
FOR UPDATE TO authenticated
USING (public.netvyl_is_org_member(organization_id))
WITH CHECK (public.netvyl_is_org_member(organization_id));

CREATE POLICY customers_delete_tenant ON public.customers
FOR DELETE TO authenticated
USING (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager']));

-- Materials
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS materials_select_tenant ON public.materials;
DROP POLICY IF EXISTS materials_insert_tenant ON public.materials;
DROP POLICY IF EXISTS materials_update_tenant ON public.materials;
DROP POLICY IF EXISTS materials_delete_tenant ON public.materials;
DROP POLICY IF EXISTS "materials" ON public.materials;

CREATE POLICY materials_select_tenant ON public.materials
FOR SELECT TO authenticated
USING (public.netvyl_is_org_member(organization_id));

CREATE POLICY materials_insert_tenant ON public.materials
FOR INSERT TO authenticated
WITH CHECK (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager']));

CREATE POLICY materials_update_tenant ON public.materials
FOR UPDATE TO authenticated
USING (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager']))
WITH CHECK (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager']));

CREATE POLICY materials_delete_tenant ON public.materials
FOR DELETE TO authenticated
USING (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator']));

-- Jobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jobs_select_tenant ON public.jobs;
DROP POLICY IF EXISTS jobs_insert_tenant ON public.jobs;
DROP POLICY IF EXISTS jobs_update_tenant ON public.jobs;
DROP POLICY IF EXISTS jobs_delete_tenant ON public.jobs;
DROP POLICY IF EXISTS "jobs" ON public.jobs;

CREATE POLICY jobs_select_tenant ON public.jobs
FOR SELECT TO authenticated
USING (public.netvyl_is_org_member(organization_id));

CREATE POLICY jobs_insert_tenant ON public.jobs
FOR INSERT TO authenticated
WITH CHECK (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager','staff']));

CREATE POLICY jobs_update_tenant ON public.jobs
FOR UPDATE TO authenticated
USING (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager','staff','production']))
WITH CHECK (public.netvyl_is_org_member(organization_id));

CREATE POLICY jobs_delete_tenant ON public.jobs
FOR DELETE TO authenticated
USING (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager']));

-- Payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_select_tenant ON public.payments;
DROP POLICY IF EXISTS payments_insert_tenant ON public.payments;
DROP POLICY IF EXISTS payments_update_tenant ON public.payments;
DROP POLICY IF EXISTS payments_delete_tenant ON public.payments;
DROP POLICY IF EXISTS "payments" ON public.payments;

CREATE POLICY payments_select_tenant ON public.payments
FOR SELECT TO authenticated
USING (public.netvyl_is_org_member(organization_id));

CREATE POLICY payments_insert_tenant ON public.payments
FOR INSERT TO authenticated
WITH CHECK (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager','cashier']));

CREATE POLICY payments_update_tenant ON public.payments
FOR UPDATE TO authenticated
USING (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager','cashier']))
WITH CHECK (public.netvyl_is_org_member(organization_id));

CREATE POLICY payments_delete_tenant ON public.payments
FOR DELETE TO authenticated
USING (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager']));

-- Inventory ledger
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_transactions_select_tenant ON public.inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_insert_tenant ON public.inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_update_tenant ON public.inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_delete_tenant ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory" ON public.inventory_transactions;

CREATE POLICY inventory_transactions_select_tenant ON public.inventory_transactions
FOR SELECT TO authenticated
USING (public.netvyl_is_org_member(organization_id));

CREATE POLICY inventory_transactions_insert_tenant ON public.inventory_transactions
FOR INSERT TO authenticated
WITH CHECK (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager']));

CREATE POLICY inventory_transactions_update_tenant ON public.inventory_transactions
FOR UPDATE TO authenticated
USING (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager']))
WITH CHECK (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager']));

CREATE POLICY inventory_transactions_delete_tenant ON public.inventory_transactions
FOR DELETE TO authenticated
USING (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator']));

-- Print station
ALTER TABLE public.print_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS print_queue_select_tenant ON public.print_queue;
DROP POLICY IF EXISTS print_queue_insert_tenant ON public.print_queue;
DROP POLICY IF EXISTS print_queue_update_tenant ON public.print_queue;
DROP POLICY IF EXISTS print_queue_delete_tenant ON public.print_queue;
DROP POLICY IF EXISTS "queue" ON public.print_queue;

CREATE POLICY print_queue_select_tenant ON public.print_queue
FOR SELECT TO authenticated
USING (public.netvyl_is_org_member(organization_id));

CREATE POLICY print_queue_insert_tenant ON public.print_queue
FOR INSERT TO authenticated
WITH CHECK (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager','staff','production']));

CREATE POLICY print_queue_update_tenant ON public.print_queue
FOR UPDATE TO authenticated
USING (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager','staff','production']))
WITH CHECK (public.netvyl_is_org_member(organization_id));

CREATE POLICY print_queue_delete_tenant ON public.print_queue
FOR DELETE TO authenticated
USING (public.netvyl_has_org_role(organization_id, ARRAY['super_admin','administrator','manager']));

-- Customer/day receipts
ALTER TABLE public.customer_day_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer day receipts" ON public.customer_day_receipts;
CREATE POLICY "customer day receipts tenant"
ON public.customer_day_receipts FOR ALL TO authenticated
USING (public.netvyl_is_org_member(organization_id))
WITH CHECK (public.netvyl_is_org_member(organization_id));

-- Numbering sequences
ALTER TABLE public.organization_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "organization sequences" ON public.organization_sequences;
CREATE POLICY "organization sequences tenant"
ON public.organization_sequences FOR ALL TO authenticated
USING (public.netvyl_is_org_member(organization_id))
WITH CHECK (public.netvyl_is_org_member(organization_id));

-- Audit logs: tenant users see only their organization's history.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_select_tenant ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_tenant ON public.audit_logs;
DROP POLICY IF EXISTS "audit read" ON public.audit_logs;

CREATE POLICY audit_logs_select_tenant ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.netvyl_is_org_member(organization_id)
  OR public.netvyl_is_platform_super_admin()
);

CREATE POLICY audit_logs_insert_tenant ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (public.netvyl_is_org_member(organization_id));

-- ============================================================
-- 4. PLATFORM TABLES
-- Master Admin can manage organizations and licenses without receiving
-- automatic access to tenant jobs/customers/payments/inventory.
-- ============================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_select_tenant ON public.organizations;
DROP POLICY IF EXISTS organizations_update_admin ON public.organizations;
DROP POLICY IF EXISTS organizations_insert_platform ON public.organizations;
DROP POLICY IF EXISTS organizations_delete_platform ON public.organizations;
DROP POLICY IF EXISTS "org read" ON public.organizations;

CREATE POLICY organizations_select_tenant ON public.organizations
FOR SELECT TO authenticated
USING (public.netvyl_is_platform_super_admin() OR public.netvyl_is_org_member(id));

CREATE POLICY organizations_update_admin ON public.organizations
FOR UPDATE TO authenticated
USING (public.netvyl_is_platform_super_admin() OR public.netvyl_has_org_role(id, ARRAY['administrator','manager','super_admin']))
WITH CHECK (public.netvyl_is_platform_super_admin() OR public.netvyl_has_org_role(id, ARRAY['administrator','manager','super_admin']));

CREATE POLICY organizations_insert_platform ON public.organizations
FOR INSERT TO authenticated
WITH CHECK (public.netvyl_is_platform_super_admin());

CREATE POLICY organizations_delete_platform ON public.organizations
FOR DELETE TO authenticated
USING (public.netvyl_is_platform_super_admin());

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS licenses_platform_select ON public.licenses;
DROP POLICY IF EXISTS licenses_platform_insert ON public.licenses;
DROP POLICY IF EXISTS licenses_platform_update ON public.licenses;
DROP POLICY IF EXISTS licenses_platform_delete ON public.licenses;
DROP POLICY IF EXISTS "licenses" ON public.licenses;

CREATE POLICY licenses_platform_select ON public.licenses
FOR SELECT TO authenticated USING (public.netvyl_is_platform_super_admin());
CREATE POLICY licenses_platform_insert ON public.licenses
FOR INSERT TO authenticated WITH CHECK (public.netvyl_is_platform_super_admin());
CREATE POLICY licenses_platform_update ON public.licenses
FOR UPDATE TO authenticated USING (public.netvyl_is_platform_super_admin()) WITH CHECK (public.netvyl_is_platform_super_admin());
CREATE POLICY licenses_platform_delete ON public.licenses
FOR DELETE TO authenticated USING (public.netvyl_is_platform_super_admin());

-- ============================================================
-- 5. FINAL TENANT-SAFE JOB CREATION RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_job_with_inventory(
  p_organization_id uuid,p_job_no text,p_customer_id uuid,p_customer_name text,p_job_date date,
  p_material_id uuid,p_print_cut boolean,p_width numeric,p_height numeric,p_qty numeric,p_unit text,
  p_billed_sqft numeric,p_linear_length_ft numeric,p_production_total numeric,p_design_charge numeric,
  p_grand_total numeric,p_amount_paid numeric DEFAULT 0,p_payment_method text DEFAULT '—',p_receipt_no text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_job_id uuid; v_prev numeric; v_new numeric; v_job_no text; v_receipt text;
BEGIN
  IF NOT public.netvyl_is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;
  IF p_amount_paid < 0 OR p_amount_paid > p_grand_total THEN RAISE EXCEPTION 'Payment amount must be between zero and the job total'; END IF;
  IF p_linear_length_ft < 0 OR p_billed_sqft < 0 THEN RAISE EXCEPTION 'Invalid print dimensions'; END IF;
  v_job_no:=COALESCE(NULLIF(trim(p_job_no),''),public.next_job_number(p_organization_id));
  SELECT current_length_ft INTO v_prev FROM public.materials WHERE id=p_material_id AND organization_id=p_organization_id AND active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
  IF v_prev < p_linear_length_ft THEN RAISE EXCEPTION 'Insufficient inventory. Available: % ft, required: % ft',v_prev,p_linear_length_ft; END IF;
  v_new:=round((v_prev-p_linear_length_ft)::numeric,6);
  v_receipt:=COALESCE(NULLIF(trim(p_receipt_no),''),public.get_customer_day_receipt(p_organization_id,p_customer_id,p_job_date));
  INSERT INTO public.jobs(organization_id,job_no,customer_id,customer_name_snapshot,job_date,material_id,material_name_snapshot,print_cut,width,height,qty,unit,billed_sqft,linear_length_ft,production_total,design_charge,grand_total,amount_paid,receipt_no,status,created_by,updated_at)
  SELECT p_organization_id,v_job_no,p_customer_id,p_customer_name,p_job_date,m.id,m.name,p_print_cut,p_width,p_height,p_qty,p_unit,p_billed_sqft,p_linear_length_ft,p_production_total,p_design_charge,p_grand_total,p_amount_paid,v_receipt,'pending',auth.uid(),now()
  FROM public.materials m WHERE m.id=p_material_id;
  SELECT id INTO v_job_id FROM public.jobs WHERE organization_id=p_organization_id AND job_no=v_job_no;
  UPDATE public.materials SET current_length_ft=v_new,updated_at=now() WHERE id=p_material_id;
  INSERT INTO public.inventory_transactions(organization_id,material_id,job_id,transaction_type,quantity_ft,previous_balance_ft,new_balance_ft,reason,created_by)
  VALUES(p_organization_id,p_material_id,v_job_id,'job_use',p_linear_length_ft,v_prev,v_new,'Material consumed by new job',auth.uid());
  INSERT INTO public.print_queue(organization_id,job_id,status) VALUES(p_organization_id,v_job_id,'pending');
  IF v_receipt IS NOT NULL THEN
    UPDATE public.jobs SET receipt_no=v_receipt WHERE organization_id=p_organization_id AND customer_id=p_customer_id AND job_date=p_job_date AND deleted_at IS NULL AND receipt_no IS NULL;
  END IF;
  IF p_amount_paid>0 THEN
    INSERT INTO public.payments(organization_id,job_id,receipt_no,customer_id,customer_name_snapshot,payment_date,amount,method,created_by)
    VALUES(p_organization_id,v_job_id,v_receipt,p_customer_id,p_customer_name,p_job_date,p_amount_paid,p_payment_method,auth.uid());
  END IF;
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_organization_id,auth.uid(),'create_job','job',v_job_id::text,jsonb_build_object('job_no',v_job_no,'receipt_no',v_receipt,'customer_id',p_customer_id));
  RETURN v_job_id;
END; $$;

-- ============================================================
-- 6. FINAL TENANT-SAFE MULTI-LINE ORDER RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_customer_order_with_inventory(
  p_organization_id uuid,p_customer_id uuid,p_customer_name text,p_job_date date,p_lines jsonb,
  p_payment_amount numeric DEFAULT 0,p_payment_method text DEFAULT '—')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_line jsonb; v_job_id uuid; v_ids uuid[]:=ARRAY[]::uuid[]; v_total numeric:=0; v_remaining numeric:=GREATEST(COALESCE(p_payment_amount,0),0); v_paid numeric; v_receipt text:=NULL; v_count integer:=0;
BEGIN
  IF NOT public.netvyl_is_org_member(p_organization_id) THEN RAISE EXCEPTION 'Not authorized for this organization'; END IF;
  IF p_customer_id IS NULL OR NULLIF(trim(p_customer_name),'') IS NULL THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF p_job_date IS NULL THEN RAISE EXCEPTION 'Job date is required'; END IF;
  IF jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'Add at least one line to the order'; END IF;
  SELECT COALESCE(SUM(COALESCE((x->>'grand_total')::numeric,0)),0) INTO v_total FROM jsonb_array_elements(p_lines) x;
  IF v_total<=0 THEN RAISE EXCEPTION 'Order total must be greater than zero'; END IF;
  IF COALESCE(p_payment_amount,0)<0 OR COALESCE(p_payment_amount,0)>v_total THEN RAISE EXCEPTION 'Payment amount must be between zero and the order total'; END IF;
  v_receipt:=public.get_customer_day_receipt(p_organization_id,p_customer_id,p_job_date);
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_paid:=LEAST(v_remaining,COALESCE((v_line->>'grand_total')::numeric,0));
    v_job_id:=public.create_job_with_inventory(p_organization_id,NULL,p_customer_id,p_customer_name,p_job_date,(v_line->>'material_id')::uuid,COALESCE((v_line->>'print_cut')::boolean,false),COALESCE((v_line->>'width')::numeric,0),COALESCE((v_line->>'height')::numeric,0),COALESCE((v_line->>'qty')::numeric,0),COALESCE(v_line->>'unit','ft'),COALESCE((v_line->>'billed_sqft')::numeric,0),COALESCE((v_line->>'linear_length_ft')::numeric,0),COALESCE((v_line->>'production_total')::numeric,0),COALESCE((v_line->>'design_charge')::numeric,0),COALESCE((v_line->>'grand_total')::numeric,0),v_paid,CASE WHEN v_paid>0 THEN COALESCE(NULLIF(trim(p_payment_method),''),'—') ELSE '—' END,CASE WHEN v_paid>0 THEN v_receipt ELSE NULL END);
    v_ids:=array_append(v_ids,v_job_id); v_remaining:=round((v_remaining-v_paid)::numeric,2); v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('job_ids',to_jsonb(v_ids),'job_count',v_count,'order_total',round(v_total,2),'amount_paid',round(COALESCE(p_payment_amount,0),2),'balance',round((v_total-COALESCE(p_payment_amount,0))::numeric,2),'receipt_no',v_receipt);
END; $$;

-- ============================================================
-- 7. RESET IS TENANT-SCOPED
-- ============================================================

CREATE OR REPLACE FUNCTION public.reset_organization_operational_data(p_organization_id uuid,p_confirmation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor_role text;
BEGIN
  IF p_confirmation<>'RESET' THEN RAISE EXCEPTION 'Confirmation text must be RESET'; END IF;
  SELECT lower(role) INTO v_actor_role FROM public.organization_members WHERE organization_id=p_organization_id AND user_id=auth.uid() AND active=true LIMIT 1;
  IF v_actor_role NOT IN ('super_admin','administrator') THEN RAISE EXCEPTION 'Administrator authorization required for this organization'; END IF;
  DELETE FROM public.payments WHERE organization_id=p_organization_id;
  DELETE FROM public.print_queue WHERE organization_id=p_organization_id;
  DELETE FROM public.inventory_transactions WHERE organization_id=p_organization_id;
  DELETE FROM public.jobs WHERE organization_id=p_organization_id;
  DELETE FROM public.customer_day_receipts WHERE organization_id=p_organization_id;
  DELETE FROM public.customers WHERE organization_id=p_organization_id;
  DELETE FROM public.audit_logs WHERE organization_id=p_organization_id;
  UPDATE public.materials SET current_length_ft=initial_length_ft,updated_at=now() WHERE organization_id=p_organization_id;
  DELETE FROM public.organization_sequences WHERE organization_id=p_organization_id;
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_organization_id,auth.uid(),'reset_organization_operational_data','organization',p_organization_id::text,jsonb_build_object('reset_at',now(),'materials_restored_to_initial_stock',true));
END; $$;

COMMIT;

-- ============================================================
-- 8. VERIFICATION QUERIES
-- ============================================================
-- The SQL editor has no browser auth.uid() session, so verify membership
-- directly when testing from Supabase SQL Editor.
--
-- SELECT organization_id, role, active
-- FROM public.organization_members
-- WHERE user_id='YOUR_AUTH_USER_UUID';
--
-- SELECT organization_id, COUNT(*) AS jobs
-- FROM public.jobs
-- GROUP BY organization_id
-- ORDER BY organization_id;
--
-- For an authenticated application session, business queries must return
-- only the active tenant's rows.
-- NETVYL Business Management Platform V32
-- Commercial subscription / licensing foundation.
-- Run AFTER V30 tenant isolation and V14 master-admin migrations.
-- Safe for existing organizations, jobs, customers, payments and inventory.

BEGIN;

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  monthly_price numeric(14,2) NOT NULL DEFAULT 0,
  yearly_price numeric(14,2) NOT NULL DEFAULT 0,
  max_users integer,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.subscription_plans
(code,name,description,monthly_price,yearly_price,max_users,features)
VALUES
('trial','Trial','Evaluate NETVYL Business Management Platform',0,0,3,
 '{"dashboard":true,"customers":true,"new_job":true,"jobs":true,"payments":true,"receipts":true,"print_station":true,"inventory":true,"reports":true,"administration":true}'::jsonb),
('professional','Professional','Full print-shop operations for growing businesses',15000,150000,10,
 '{"dashboard":true,"customers":true,"new_job":true,"jobs":true,"payments":true,"receipts":true,"print_station":true,"inventory":true,"reports":true,"administration":true,"advanced_reports":true,"multi_user":true}'::jsonb),
('enterprise','Enterprise','Expanded commercial workspace with higher limits',50000,500000,50,
 '{"dashboard":true,"customers":true,"new_job":true,"jobs":true,"payments":true,"receipts":true,"print_station":true,"inventory":true,"reports":true,"administration":true,"advanced_reports":true,"multi_user":true,"priority_support":true,"custom_features":true}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,
  description=excluded.description,
  monthly_price=excluded.monthly_price,
  yearly_price=excluded.yearly_price,
  max_users=excluded.max_users,
  features=excluded.features,
  updated_at=now();

ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.subscription_plans(id);
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS price numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'manual'
  CHECK (billing_cycle IN ('manual','monthly','yearly'));
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','suspended','expired','revoked','pending'));

UPDATE public.licenses l
SET plan_id = p.id,
    features = CASE WHEN l.features = '{}'::jsonb THEN p.features ELSE l.features END,
    max_users = COALESCE(l.max_users,p.max_users),
    price = CASE WHEN l.price=0 THEN p.monthly_price ELSE l.price END,
    status = CASE WHEN l.active THEN 'active' ELSE 'suspended' END,
    updated_at=now()
FROM public.subscription_plans p
WHERE p.code=lower(l.plan)
  AND (l.plan_id IS NULL OR l.features='{}'::jsonb OR l.max_users IS NULL);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON public.subscription_plans(active);
CREATE INDEX IF NOT EXISTS idx_licenses_org_status ON public.licenses(organization_id,status,expires_at DESC);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_plans_select ON public.subscription_plans;
DROP POLICY IF EXISTS subscription_plans_platform_write ON public.subscription_plans;
CREATE POLICY subscription_plans_select ON public.subscription_plans
FOR SELECT TO authenticated USING (active=true OR public.netvyl_is_platform_super_admin());
CREATE POLICY subscription_plans_platform_write ON public.subscription_plans
FOR ALL TO authenticated
USING (public.netvyl_is_platform_super_admin())
WITH CHECK (public.netvyl_is_platform_super_admin());

-- Customer organizations can read their own license summary, but only Master Admin
-- can create/change/revoke licenses.
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS licenses_platform_select ON public.licenses;
DROP POLICY IF EXISTS licenses_platform_insert ON public.licenses;
DROP POLICY IF EXISTS licenses_platform_update ON public.licenses;
DROP POLICY IF EXISTS licenses_platform_delete ON public.licenses;
DROP POLICY IF EXISTS licenses_tenant_read_v32 ON public.licenses;
CREATE POLICY licenses_tenant_read_v32 ON public.licenses
FOR SELECT TO authenticated
USING (public.netvyl_is_org_member(organization_id));
CREATE POLICY licenses_platform_select ON public.licenses
FOR SELECT TO authenticated USING (public.netvyl_is_platform_super_admin());
CREATE POLICY licenses_platform_insert ON public.licenses
FOR INSERT TO authenticated WITH CHECK (public.netvyl_is_platform_super_admin());
CREATE POLICY licenses_platform_update ON public.licenses
FOR UPDATE TO authenticated
USING (public.netvyl_is_platform_super_admin())
WITH CHECK (public.netvyl_is_platform_super_admin());
CREATE POLICY licenses_platform_delete ON public.licenses
FOR DELETE TO authenticated USING (public.netvyl_is_platform_super_admin());

CREATE OR REPLACE FUNCTION public.netvyl_get_org_subscription(p_org_id uuid)
RETURNS TABLE(
  organization_id uuid,
  license_id uuid,
  plan_code text,
  plan_name text,
  license_status text,
  access_status text,
  starts_at timestamptz,
  expires_at timestamptz,
  days_remaining integer,
  max_users integer,
  active_users integer,
  features jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
  SELECT
    p_org_id,
    l.id,
    COALESCE(l.plan,sp.code,'trial'),
    COALESCE(sp.name,initcap(COALESCE(l.plan,'trial'))),
    COALESCE(l.status,CASE WHEN l.active THEN 'active' ELSE 'suspended' END),
    CASE
      WHEN o.status='suspended' THEN 'organization_suspended'
      WHEN o.status='expired' THEN 'organization_expired'
      WHEN l.id IS NULL THEN 'no_license'
      WHEN COALESCE(l.status,CASE WHEN l.active THEN 'active' ELSE 'suspended' END) <> 'active' THEN 'license_inactive'
      WHEN l.expires_at IS NOT NULL AND l.expires_at < now() THEN 'expired'
      ELSE 'active'
    END,
    l.starts_at,
    l.expires_at,
    CASE WHEN l.expires_at IS NULL THEN NULL ELSE GREATEST(0,CEIL(EXTRACT(EPOCH FROM (l.expires_at-now()))/86400)::integer) END,
    COALESCE(l.max_users,sp.max_users),
    (SELECT count(*)::integer FROM public.organization_members om WHERE om.organization_id=p_org_id AND om.active=true),
    COALESCE(NULLIF(l.features,'{}'::jsonb),sp.features,'{}'::jsonb)
  FROM public.organizations o
  LEFT JOIN LATERAL (
    SELECT * FROM public.licenses lx
    WHERE lx.organization_id=p_org_id
    ORDER BY CASE WHEN lx.status='active' THEN 0 ELSE 1 END, lx.expires_at DESC NULLS LAST, lx.created_at DESC
    LIMIT 1
  ) l ON true
  LEFT JOIN public.subscription_plans sp ON sp.id=l.plan_id OR (l.plan_id IS NULL AND sp.code=lower(COALESCE(l.plan,'trial')))
  WHERE o.id=p_org_id
    AND (public.netvyl_is_platform_super_admin() OR public.netvyl_is_org_member(p_org_id));
$$;

CREATE OR REPLACE FUNCTION public.netvyl_can_use_feature(p_org_id uuid,p_feature text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  SELECT COALESCE((s.features ->> p_feature)::boolean,false)
  FROM public.netvyl_get_org_subscription(p_org_id) s
  WHERE s.access_status='active';
$$;

CREATE OR REPLACE FUNCTION public.netvyl_can_add_user(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.netvyl_get_org_subscription(p_org_id) s
    WHERE s.access_status='active'
      AND (s.max_users IS NULL OR s.active_users < s.max_users)
  );
$$;

CREATE OR REPLACE FUNCTION public.master_generate_license(
  p_organization_id uuid,
  p_plan text DEFAULT 'professional',
  p_days integer DEFAULT 365,
  p_max_users integer DEFAULT NULL
) RETURNS TABLE(id uuid, license_key text, expires_at timestamptz, plan text, max_users integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_key text;
  v_id uuid;
  v_exp timestamptz;
  v_plan public.subscription_plans%rowtype;
  v_max integer;
BEGIN
  IF NOT public.netvyl_is_platform_super_admin() THEN RAISE EXCEPTION 'Platform administrator authorization required'; END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE code=lower(p_plan) AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive subscription plan: %',p_plan; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id=p_organization_id) THEN RAISE EXCEPTION 'Organization not found'; END IF;
  v_max := COALESCE(p_max_users,v_plan.max_users);
  v_key := 'NETVYL-' || upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,4)) || '-' || upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,4));
  v_exp := now() + make_interval(days=>greatest(p_days,1));

  UPDATE public.licenses
  SET status='revoked',active=false,updated_at=now()
  WHERE organization_id=p_organization_id AND status='active';

  INSERT INTO public.licenses(organization_id,plan,plan_id,license_key,starts_at,expires_at,max_users,active,status,features,price,billing_cycle,updated_at)
  VALUES(p_organization_id,lower(p_plan),v_plan.id,v_key,now(),v_exp,v_max,true,'active',v_plan.features,v_plan.monthly_price,'manual',now())
  RETURNING public.licenses.id INTO v_id;

  UPDATE public.organizations SET status='active',updated_at=now() WHERE id=p_organization_id;
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_organization_id,auth.uid(),'generate_license','license',v_id::text,jsonb_build_object('plan',p_plan,'max_users',v_max,'expires_at',v_exp));
  RETURN QUERY SELECT v_id,v_key,v_exp,lower(p_plan),v_max;
END; $$;

CREATE OR REPLACE FUNCTION public.master_set_license_status(p_license_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid;
BEGIN
  IF NOT public.netvyl_is_platform_super_admin() THEN RAISE EXCEPTION 'Platform administrator authorization required'; END IF;
  IF p_status NOT IN ('active','suspended','expired','revoked','pending') THEN RAISE EXCEPTION 'Invalid license status'; END IF;
  SELECT organization_id INTO v_org FROM public.licenses WHERE id=p_license_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'License not found'; END IF;
  UPDATE public.licenses SET status=p_status,active=(p_status='active'),updated_at=now() WHERE id=p_license_id;
  INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(v_org,auth.uid(),'set_license_status','license',p_license_id::text,jsonb_build_object('status',p_status));
END; $$;

GRANT EXECUTE ON FUNCTION public.netvyl_get_org_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.netvyl_can_use_feature(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.netvyl_can_add_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_generate_license(uuid,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_set_license_status(uuid,text) TO authenticated;

COMMIT;

-- Verification examples:
-- select * from public.netvyl_get_org_subscription('YOUR-ORG-UUID');
-- select public.netvyl_can_add_user('YOUR-ORG-UUID');
-- NETVYL Business Management Platform V34
-- Commercial licensing, payment verification, activation, device limits,
-- tenant-safe support mode, expired-license read-only access, and report support.

begin;

-- ------------------------------------------------------------
-- 1. Licensing fields
-- ------------------------------------------------------------
alter table public.licenses add column if not exists buyer_email text;
alter table public.licenses add column if not exists max_devices integer not null default 1;
alter table public.licenses add column if not exists price numeric(14,2) not null default 0;
alter table public.licenses add column if not exists billing_cycle text not null default 'manual';
alter table public.licenses add column if not exists payment_status text not null default 'not_required';
alter table public.licenses add column if not exists payment_reference text;
alter table public.licenses add column if not exists updated_at timestamptz not null default now();
alter table public.licenses drop constraint if exists licenses_billing_cycle_check;
alter table public.licenses add constraint licenses_billing_cycle_check check (billing_cycle in ('manual','monthly','yearly'));
alter table public.licenses drop constraint if exists licenses_payment_status_check;
alter table public.licenses add constraint licenses_payment_status_check check (payment_status in ('not_required','pending','submitted','verified','rejected'));
alter table public.licenses drop constraint if exists licenses_max_devices_check;
alter table public.licenses add constraint licenses_max_devices_check check (max_devices > 0);

-- ------------------------------------------------------------
-- 2. Platform payment account
-- ------------------------------------------------------------
create table if not exists public.platform_payment_accounts(
  id uuid primary key default gen_random_uuid(),
  bank_name text not null default '',
  account_name text not null default '',
  account_number text not null default '',
  transfer_instructions text,
  payment_phone text,
  payment_email text,
  qr_code_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_payment_accounts enable row level security;
drop policy if exists platform_payment_accounts_master on public.platform_payment_accounts;
create policy platform_payment_accounts_master on public.platform_payment_accounts
for all to authenticated
using (public.netvyl_is_platform_super_admin())
with check (public.netvyl_is_platform_super_admin());

-- Public/anonymous read is intentionally restricted to the payment display fields via RPC.

-- ------------------------------------------------------------
-- 3. License payment requests
-- ------------------------------------------------------------
create table if not exists public.license_payment_requests(
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payer_name text not null default '',
  payer_email text not null default '',
  amount numeric(14,2) not null default 0,
  payment_reference text,
  payment_date date,
  proof_url text,
  status text not null default 'submitted' check(status in ('submitted','verified','rejected')),
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_license_payment_requests_status on public.license_payment_requests(status,created_at desc);

alter table public.license_payment_requests enable row level security;
drop policy if exists license_payment_requests_master on public.license_payment_requests;
drop policy if exists license_payment_requests_tenant_read on public.license_payment_requests;
create policy license_payment_requests_master on public.license_payment_requests
for all to authenticated
using (public.netvyl_is_platform_super_admin())
with check (public.netvyl_is_platform_super_admin());
create policy license_payment_requests_tenant_read on public.license_payment_requests
for select to authenticated
using (public.netvyl_is_org_member(organization_id));

-- ------------------------------------------------------------
-- 4. Device activations
-- ------------------------------------------------------------
create table if not exists public.license_devices(
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_hash text not null,
  device_name text not null default 'NETVYL Device',
  platform text not null default 'web',
  app_version text,
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  deactivated_at timestamptz,
  unique(license_id,device_hash)
);
create index if not exists idx_license_devices_license on public.license_devices(license_id,active);

alter table public.license_devices enable row level security;
drop policy if exists license_devices_master on public.license_devices;
drop policy if exists license_devices_tenant_read on public.license_devices;
create policy license_devices_master on public.license_devices
for all to authenticated
using (public.netvyl_is_platform_super_admin())
with check (public.netvyl_is_platform_super_admin());
create policy license_devices_tenant_read on public.license_devices
for select to authenticated
using (public.netvyl_is_org_member(organization_id));

-- ------------------------------------------------------------
-- 5. Master Admin support sessions
-- ------------------------------------------------------------
create table if not exists public.platform_support_sessions(
  id uuid primary key default gen_random_uuid(),
  master_user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active boolean not null default true
);
create index if not exists idx_platform_support_sessions_user_active on public.platform_support_sessions(master_user_id,active);

alter table public.platform_support_sessions enable row level security;
drop policy if exists platform_support_sessions_master on public.platform_support_sessions;
create policy platform_support_sessions_master on public.platform_support_sessions
for all to authenticated
using (master_user_id=auth.uid() and public.netvyl_is_platform_super_admin())
with check (master_user_id=auth.uid() and public.netvyl_is_platform_super_admin());

create or replace function public.netvyl_has_support_access(p_org_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.platform_support_sessions s
    where s.master_user_id=auth.uid()
      and s.organization_id=p_org_id
      and s.active=true
      and s.ended_at is null
  );
$$;
grant execute on function public.netvyl_has_support_access(uuid) to authenticated;

-- Re-define membership helpers: platform admin does NOT automatically become a member of every tenant.
create or replace function public.netvyl_is_org_member(p_org_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.organization_members om
    where om.user_id=auth.uid()
      and om.organization_id=p_org_id
      and om.active=true
  );
$$;

grant execute on function public.netvyl_is_org_member(uuid) to authenticated;

create or replace function public.netvyl_has_org_role(p_org_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.organization_members om
    where om.user_id=auth.uid() and om.organization_id=p_org_id and om.active=true
      and lower(om.role)=any(p_roles)
  );
$$;
grant execute on function public.netvyl_has_org_role(uuid,text[]) to authenticated;

create or replace function public.netvyl_org_ids()
returns setof uuid language sql stable security definer set search_path=public as $$
  select om.organization_id from public.organization_members om
  where om.user_id=auth.uid() and om.active=true;
$$;

-- ------------------------------------------------------------
-- 6. Subscription helper: expired = authenticated read-only
-- ------------------------------------------------------------
create or replace function public.netvyl_get_org_subscription(p_org_id uuid)
returns table(
  organization_id uuid, license_id uuid, plan_code text, plan_name text,
  license_status text, access_status text, starts_at timestamptz, expires_at timestamptz,
  days_remaining integer, max_users integer, active_users integer, max_devices integer,
  active_devices integer, features jsonb, payment_status text
)
language sql stable security definer set search_path=public as $$
  select p_org_id,l.id,coalesce(l.plan,sp.code,'trial'),coalesce(sp.name,initcap(coalesce(l.plan,'trial'))),
    coalesce(l.status,case when l.active then 'active' else 'suspended' end),
    case
      when o.status='suspended' then 'organization_suspended'
      when l.id is null then 'no_license'
      when coalesce(l.status,case when l.active then 'active' else 'suspended' end) in ('suspended','revoked') then 'license_inactive'
      when l.expires_at is not null and l.expires_at < now() then 'expired'
      else 'active'
    end,
    l.starts_at,l.expires_at,
    case when l.expires_at is null then null else greatest(0,ceil(extract(epoch from(l.expires_at-now()))/86400)::integer) end,
    coalesce(l.max_users,sp.max_users),
    (select count(*)::integer from public.organization_members om where om.organization_id=p_org_id and om.active=true),
    coalesce(l.max_devices,1),
    (select count(*)::integer from public.license_devices ld where ld.license_id=l.id and ld.active=true),
    coalesce(nullif(l.features,'{}'::jsonb),sp.features,'{}'::jsonb),
    coalesce(l.payment_status,'not_required')
  from public.organizations o
  left join lateral(
    select * from public.licenses lx where lx.organization_id=p_org_id
    order by case when lx.status='active' then 0 else 1 end,lx.expires_at desc nulls last,lx.created_at desc limit 1
  ) l on true
  left join public.subscription_plans sp on sp.id=l.plan_id or(l.plan_id is null and sp.code=lower(coalesce(l.plan,'trial')))
  where o.id=p_org_id and (public.netvyl_is_org_member(p_org_id) or public.netvyl_has_support_access(p_org_id) or public.netvyl_is_platform_super_admin());
$$;
grant execute on function public.netvyl_get_org_subscription(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. License activation RPC: callable before login
-- ------------------------------------------------------------
create or replace function public.activate_netvyl_license(
  p_license_key text,
  p_buyer_email text,
  p_device_id text,
  p_device_name text default 'NETVYL Device',
  p_platform text default 'web',
  p_app_version text default null
)
returns table(success boolean,message text,organization_id uuid,organization_name text,license_id uuid,expires_at timestamptz,plan text,device_count integer,max_devices integer)
language plpgsql security definer set search_path=public as $$
declare
  l public.licenses%rowtype;
  o public.organizations%rowtype;
  v_hash text;
  v_count integer;
  v_max integer;
  v_device_id uuid;
begin
  if nullif(trim(p_license_key),'') is null then raise exception 'License key is required'; end if;
  select * into l from public.licenses where upper(license_key)=upper(trim(p_license_key)) limit 1;
  if not found then return query select false,'Invalid license key',null::uuid,null::text,null::uuid,null::timestamptz,null::text,0,0; return; end if;
  select * into o from public.organizations where id=l.organization_id;
  if not found then return query select false,'Organization not found',null::uuid,null::text,null::uuid,null::timestamptz,null::text,0,0; return; end if;
  if l.buyer_email is not null and lower(trim(l.buyer_email)) <> lower(trim(coalesce(p_buyer_email,''))) then
    return query select false,'Buyer email does not match this license',o.id,o.name,l.id,l.expires_at,l.plan,0,coalesce(l.max_devices,1); return;
  end if;
  if l.status <> 'active' or not l.active then return query select false,'This license is not active',o.id,o.name,l.id,l.expires_at,l.plan,0,coalesce(l.max_devices,1); return; end if;
  if l.expires_at is not null and l.expires_at < now() then return query select false,'This license has expired. Please renew it.',o.id,o.name,l.id,l.expires_at,l.plan,0,coalesce(l.max_devices,1); return; end if;
  v_hash:=encode(digest(trim(p_device_id),'sha256'),'hex');
  select id into v_device_id from public.license_devices where license_id=l.id and device_hash=v_hash and active=true limit 1;
  if v_device_id is not null then
    update public.license_devices set last_seen_at=now(),device_name=coalesce(nullif(p_device_name,''),device_name),platform=coalesce(nullif(p_platform,''),platform),app_version=coalesce(p_app_version,app_version) where id=v_device_id;
  else
    select count(*) into v_count from public.license_devices where license_id=l.id and active=true;
    v_max:=greatest(1,coalesce(l.max_devices,1));
    if v_count >= v_max then return query select false,format('Device activation limit reached (%s of %s). Deactivate a device or contact NETVYL support.',v_count,v_max),o.id,o.name,l.id,l.expires_at,l.plan,v_count,v_max; return; end if;
    insert into public.license_devices(license_id,organization_id,device_hash,device_name,platform,app_version) values(l.id,l.organization_id,v_hash,coalesce(nullif(p_device_name,''),'NETVYL Device'),coalesce(nullif(p_platform,''),'web'),p_app_version);
  end if;
  select count(*) into v_count from public.license_devices where license_id=l.id and active=true;
  return query select true,'License activated successfully',o.id,o.name,l.id,l.expires_at,l.plan,v_count,greatest(1,coalesce(l.max_devices,1));
end; $$;
grant execute on function public.activate_netvyl_license(text,text,text,text,text,text) to anon,authenticated;

-- ------------------------------------------------------------
-- 8. Support session RPCs
-- ------------------------------------------------------------
create or replace function public.master_start_support(p_org_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.netvyl_is_platform_super_admin() then raise exception 'Platform administrator authorization required'; end if;
  if not exists(select 1 from public.organizations where id=p_org_id) then raise exception 'Organization not found'; end if;
  update public.platform_support_sessions set active=false,ended_at=now() where master_user_id=auth.uid() and active=true;
  insert into public.platform_support_sessions(master_user_id,organization_id) values(auth.uid(),p_org_id) returning id into v_id;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) values(p_org_id,auth.uid(),'support_session_started','organization',p_org_id::text,jsonb_build_object('support',true));
  return v_id;
end; $$;

create or replace function public.master_end_support()
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.netvyl_is_platform_super_admin() then raise exception 'Platform administrator authorization required'; end if;
  update public.platform_support_sessions set active=false,ended_at=now() where master_user_id=auth.uid() and active=true;
end; $$;
grant execute on function public.master_start_support(uuid) to authenticated;
grant execute on function public.master_end_support() to authenticated;

-- ------------------------------------------------------------
-- 9. Company-admin / active-license mutation enforcement
-- ------------------------------------------------------------
create or replace function public.netvyl_can_operate_org(p_org_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.netvyl_has_support_access(p_org_id)
  or exists(
    select 1 from public.organization_members om
    where om.organization_id=p_org_id and om.user_id=auth.uid() and om.active=true
      and exists(select 1 from public.licenses l where l.organization_id=p_org_id and l.status='active' and l.active=true and (l.expires_at is null or l.expires_at>=now()))
  );
$$;

grant execute on function public.netvyl_can_operate_org(uuid) to authenticated;

-- Replace operational table policies so SELECT remains available to the tenant after expiry,
-- while INSERT/UPDATE/DELETE require an active license. Support mode can operate explicitly.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','materials','jobs','payments','inventory_transactions','print_queue'] LOOP
    EXECUTE format('alter table public.%I enable row level security',t);
    EXECUTE format('drop policy if exists netvyl_v34_select on public.%I',t);
    EXECUTE format('drop policy if exists netvyl_v34_insert on public.%I',t);
    EXECUTE format('drop policy if exists netvyl_v34_update on public.%I',t);
    EXECUTE format('drop policy if exists netvyl_v34_delete on public.%I',t);
    EXECUTE format('create policy netvyl_v34_select on public.%I for select to authenticated using (public.netvyl_is_org_member(organization_id) or public.netvyl_has_support_access(organization_id))',t);
    EXECUTE format('create policy netvyl_v34_insert on public.%I for insert to authenticated with check (public.netvyl_can_operate_org(organization_id) and (public.netvyl_has_support_access(organization_id) or public.netvyl_has_org_role(organization_id,array[''super_admin'',''administrator'',''manager'',''staff'',''cashier'',''production''])))',t);
    EXECUTE format('create policy netvyl_v34_update on public.%I for update to authenticated using (public.netvyl_can_operate_org(organization_id)) with check (public.netvyl_can_operate_org(organization_id))',t);
    EXECUTE format('create policy netvyl_v34_delete on public.%I for delete to authenticated using (public.netvyl_can_operate_org(organization_id))',t);
  END LOOP;
END $$;

-- Restrict materials destructive mutations and job deletion to company administrator/support.
DROP POLICY IF EXISTS netvyl_v34_insert ON public.materials;
DROP POLICY IF EXISTS netvyl_v34_update ON public.materials;
DROP POLICY IF EXISTS netvyl_v34_delete ON public.materials;
CREATE POLICY netvyl_v34_insert ON public.materials FOR INSERT TO authenticated
WITH CHECK (public.netvyl_can_operate_org(organization_id) AND (public.netvyl_has_support_access(organization_id) OR public.netvyl_has_org_role(organization_id,array['administrator'])));
CREATE POLICY netvyl_v34_update ON public.materials FOR UPDATE TO authenticated
USING (public.netvyl_has_support_access(organization_id) OR public.netvyl_has_org_role(organization_id,array['administrator']))
WITH CHECK (public.netvyl_can_operate_org(organization_id));
CREATE POLICY netvyl_v34_delete ON public.materials FOR DELETE TO authenticated
USING (public.netvyl_has_support_access(organization_id) OR public.netvyl_has_org_role(organization_id,array['administrator']));

DROP POLICY IF EXISTS netvyl_v34_delete ON public.jobs;
CREATE POLICY netvyl_v34_delete ON public.jobs FOR DELETE TO authenticated
USING (public.netvyl_has_support_access(organization_id) OR public.netvyl_has_org_role(organization_id,array['administrator']));

-- Organization settings and members: only company administrator, or explicit support mode.
DROP POLICY IF EXISTS netvyl_v34_org_update ON public.organizations;
CREATE POLICY netvyl_v34_org_update ON public.organizations FOR UPDATE TO authenticated
USING (public.netvyl_has_support_access(id) OR public.netvyl_has_org_role(id,array['administrator']))
WITH CHECK (public.netvyl_has_support_access(id) OR public.netvyl_has_org_role(id,array['administrator']));

DROP POLICY IF EXISTS netvyl_v34_members_select ON public.organization_members;
DROP POLICY IF EXISTS netvyl_v34_members_insert ON public.organization_members;
DROP POLICY IF EXISTS netvyl_v34_members_update ON public.organization_members;
DROP POLICY IF EXISTS netvyl_v34_members_delete ON public.organization_members;
CREATE POLICY netvyl_v34_members_select ON public.organization_members FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.netvyl_has_support_access(organization_id) OR public.netvyl_has_org_role(organization_id,array['administrator']));
CREATE POLICY netvyl_v34_members_insert ON public.organization_members FOR INSERT TO authenticated
WITH CHECK (public.netvyl_has_support_access(organization_id) OR public.netvyl_has_org_role(organization_id,array['administrator']));
CREATE POLICY netvyl_v34_members_update ON public.organization_members FOR UPDATE TO authenticated
USING (public.netvyl_has_support_access(organization_id) OR public.netvyl_has_org_role(organization_id,array['administrator']))
WITH CHECK (public.netvyl_has_support_access(organization_id) OR public.netvyl_has_org_role(organization_id,array['administrator']));
CREATE POLICY netvyl_v34_members_delete ON public.organization_members FOR DELETE TO authenticated
USING (public.netvyl_has_support_access(organization_id) OR public.netvyl_has_org_role(organization_id,array['administrator']));

-- ------------------------------------------------------------
-- 10. Master license generation with payment/device fields
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.master_generate_license(
  p_organization_id uuid,
  p_plan text DEFAULT 'professional',
  p_days integer DEFAULT 365,
  p_max_users integer DEFAULT NULL,
  p_max_devices integer DEFAULT 1,
  p_price numeric DEFAULT 0,
  p_buyer_email text DEFAULT NULL
) RETURNS TABLE(id uuid,license_key text,expires_at timestamptz,plan text,max_users integer,max_devices integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_key text; v_id uuid; v_exp timestamptz; v_plan public.subscription_plans%rowtype; v_max integer; v_devices integer;
BEGIN
 IF NOT public.netvyl_is_platform_super_admin() THEN RAISE EXCEPTION 'Platform administrator authorization required'; END IF;
 SELECT * INTO v_plan FROM public.subscription_plans WHERE code=lower(p_plan) AND active=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive subscription plan: %',p_plan; END IF;
 IF NOT EXISTS(select 1 from public.organizations where id=p_organization_id) THEN RAISE EXCEPTION 'Organization not found'; END IF;
 v_max:=coalesce(p_max_users,v_plan.max_users); v_devices:=greatest(1,coalesce(p_max_devices,1));
 v_key:='NETVYL-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,4))||'-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,4))||'-'||upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,4));
 v_exp:=now()+make_interval(days=>greatest(p_days,1));
 UPDATE public.licenses SET status='revoked',active=false,updated_at=now() WHERE organization_id=p_organization_id AND status in('active','pending');
 INSERT INTO public.licenses(organization_id,plan,license_key,starts_at,expires_at,max_users,max_devices,active,status,features,price,billing_cycle,payment_status,buyer_email,updated_at)
 VALUES(p_organization_id,lower(p_plan),v_key,now(),v_exp,v_max,v_devices,false,'pending',v_plan.features,coalesce(p_price,v_plan.monthly_price),'manual',case when coalesce(p_price,v_plan.monthly_price)>0 then 'pending' else 'verified' end,p_buyer_email,now())
 RETURNING public.licenses.id into v_id;
 INSERT INTO public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) values(p_organization_id,auth.uid(),'generate_license','license',v_id::text,jsonb_build_object('plan',p_plan,'max_users',v_max,'max_devices',v_devices,'price',p_price,'buyer_email',p_buyer_email));
 RETURN QUERY select v_id,v_key,v_exp,lower(p_plan),v_max,v_devices;
END; $$;
grant execute on function public.master_generate_license(uuid,text,integer,integer,integer,numeric,text) to authenticated;

-- Verify/reject a buyer payment and activate the license.
create or replace function public.master_verify_license_payment(p_request_id uuid,p_approve boolean,p_notes text default null)
returns table(success boolean,license_id uuid,license_key text,organization_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare r public.license_payment_requests%rowtype; l public.licenses%rowtype;
begin
 if not public.netvyl_is_platform_super_admin() then raise exception 'Platform administrator authorization required'; end if;
 select * into r from public.license_payment_requests where id=p_request_id for update;
 if not found then raise exception 'Payment request not found'; end if;
 select * into l from public.licenses where id=r.license_id for update;
 if p_approve then
   update public.license_payment_requests set status='verified',verified_at=now(),verified_by=auth.uid(),notes=p_notes where id=r.id;
   update public.licenses set status='active',active=true,payment_status='verified',payment_reference=coalesce(r.payment_reference,payment_reference),updated_at=now() where id=l.id;
   update public.organizations set status='active',updated_at=now() where id=l.organization_id;
   insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) values(l.organization_id,auth.uid(),'license_payment_verified','license',l.id::text,jsonb_build_object('payment_request_id',r.id,'amount',r.amount));
 else
   update public.license_payment_requests set status='rejected',verified_at=now(),verified_by=auth.uid(),notes=p_notes where id=r.id;
   update public.licenses set payment_status='rejected',updated_at=now() where id=l.id;
 end if;
 return query select true,l.id,l.license_key,l.organization_id,l.expires_at;
end; $$;
grant execute on function public.master_verify_license_payment(uuid,boolean,text) to authenticated;

-- Anonymous buyer can submit a payment request using the license key. It cannot activate the license.
create or replace function public.submit_license_payment(p_license_key text,payer_name text,payer_email text,amount numeric,payment_reference text,payment_date date default current_date,proof_url text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare l public.licenses%rowtype; v_id uuid;
begin
 select * into l from public.licenses where upper(license_key)=upper(trim(p_license_key)) limit 1;
 if not found then raise exception 'Invalid license key'; end if;
 insert into public.license_payment_requests(license_id,organization_id,payer_name,payer_email,amount,payment_reference,payment_date,proof_url) values(l.id,l.organization_id,payer_name,payer_email,amount,payment_reference,payment_date,proof_url) returning id into v_id;
 update public.licenses set payment_status='submitted',updated_at=now() where id=l.id;
 return v_id;
end; $$;
grant execute on function public.submit_license_payment(text,text,text,numeric,text,date,text) to anon,authenticated;

-- Public payment account summary for payment/activation page.
create or replace function public.get_netvyl_payment_account()
returns table(bank_name text,account_name text,account_number text,transfer_instructions text,payment_phone text,payment_email text,qr_code_url text)
language sql stable security definer set search_path=public as $$
 select bank_name,account_name,account_number,transfer_instructions,payment_phone,payment_email,qr_code_url
 from public.platform_payment_accounts where active=true order by created_at desc limit 1;
$$;
grant execute on function public.get_netvyl_payment_account() to anon,authenticated;

-- ------------------------------------------------------------
-- 11. Device deactivation
-- ------------------------------------------------------------
create or replace function public.master_deactivate_license_device(p_device_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare l_id uuid;
begin
 if not public.netvyl_is_platform_super_admin() then raise exception 'Platform administrator authorization required'; end if;
 select license_id into l_id from public.license_devices where id=p_device_id;
 if l_id is null then raise exception 'Device not found'; end if;
 update public.license_devices set active=false,deactivated_at=now(),last_seen_at=now() where id=p_device_id;
end; $$;
grant execute on function public.master_deactivate_license_device(uuid) to authenticated;

-- ------------------------------------------------------------
-- 12. Platform release/update registry
-- ------------------------------------------------------------
create table if not exists public.platform_releases(
 id uuid primary key default gen_random_uuid(),
 version text not null unique,
 title text not null,
 notes text,
 mandatory boolean not null default false,
 min_supported_version text,
 web_url text,
 windows_url text,
 android_url text,
 ios_url text,
 released_at timestamptz not null default now(),
 active boolean not null default true
);
alter table public.platform_releases enable row level security;
drop policy if exists platform_releases_read on public.platform_releases;
drop policy if exists platform_releases_write on public.platform_releases;
create policy platform_releases_read on public.platform_releases for select to anon,authenticated using(active=true);
create policy platform_releases_write on public.platform_releases for all to authenticated using(public.netvyl_is_platform_super_admin()) with check(public.netvyl_is_platform_super_admin());

-- ------------------------------------------------------------
-- 13. Tighten organization reset after all prior migrations
-- ------------------------------------------------------------
create or replace function public.reset_organization_operational_data(p_organization_id uuid,p_confirmation text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_confirmation <> 'RESET' then raise exception 'Confirmation text must be RESET'; end if;
  if not public.netvyl_has_support_access(p_organization_id) and not public.netvyl_has_org_role(p_organization_id,array['administrator']) then
    raise exception 'Only the company administrator or explicit Master Admin Support Mode can reset this organization';
  end if;
  if not public.netvyl_has_support_access(p_organization_id) and not public.netvyl_can_operate_org(p_organization_id) then
    raise exception 'An active license is required to reset operational data';
  end if;
  delete from public.payments where organization_id=p_organization_id;
  delete from public.print_queue where organization_id=p_organization_id;
  delete from public.inventory_transactions where organization_id=p_organization_id;
  delete from public.jobs where organization_id=p_organization_id;
  delete from public.customer_day_receipts where organization_id=p_organization_id;
  delete from public.customers where organization_id=p_organization_id;
  delete from public.audit_logs where organization_id=p_organization_id;
  update public.materials set current_length_ft=initial_length_ft,updated_at=now() where organization_id=p_organization_id;
  delete from public.organization_sequences where organization_id=p_organization_id;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_organization_id,auth.uid(),'reset_organization_operational_data','organization',p_organization_id::text,jsonb_build_object('reset_at',now(),'materials_restored_to_initial_stock',true,'support_mode',public.netvyl_has_support_access(p_organization_id)));
end; $$;
revoke all on function public.reset_organization_operational_data(uuid,text) from public;
grant execute on function public.reset_organization_operational_data(uuid,text) to authenticated;

commit;
-- NETVYL V33 — COMPANY ADMIN-ONLY CONTROL HARDENING
-- Only the administrator of the purchasing organization may:
--   1. onboard/create new materials
--   2. delete jobs (including inventory restoration)
--   3. add/invite staff
--   4. delete staff memberships
--   5. reset organization operational data
-- Managers, Staff, Cashiers and Production cannot perform these actions.
-- Platform super_admin is intentionally NOT treated as the company's administrator.

begin;

-- ------------------------------------------------------------
-- Helper: exact company administrator
-- ------------------------------------------------------------
create or replace function public.netvyl_is_company_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.organization_id = p_org_id
      and om.active = true
      and lower(om.role) = 'administrator'
  );
$$;

revoke all on function public.netvyl_is_company_admin(uuid) from public;
grant execute on function public.netvyl_is_company_admin(uuid) to authenticated;

-- ------------------------------------------------------------
-- Staff membership writes: administrator ONLY
-- ------------------------------------------------------------
alter table public.organization_members enable row level security;

drop policy if exists organization_members_insert on public.organization_members;
drop policy if exists organization_members_delete on public.organization_members;

drop policy if exists organization_members_update on public.organization_members;

create policy organization_members_insert
on public.organization_members
for insert to authenticated
with check (
  public.netvyl_is_company_admin(organization_id)
);

create policy organization_members_update
on public.organization_members
for update to authenticated
using (
  public.netvyl_is_company_admin(organization_id)
)
with check (
  public.netvyl_is_company_admin(organization_id)
);

create policy organization_members_delete
on public.organization_members
for delete to authenticated
using (
  public.netvyl_is_company_admin(organization_id)
  and lower(role) <> 'super_admin'
);

-- ------------------------------------------------------------
-- Materials: onboarding/deletion administration only.
-- Existing material viewing remains available to organization members.
-- ------------------------------------------------------------
alter table public.materials enable row level security;

drop policy if exists materials_insert_tenant on public.materials;
drop policy if exists materials_update_tenant on public.materials;
drop policy if exists materials_delete_tenant on public.materials;

create policy materials_insert_tenant
on public.materials
for insert to authenticated
with check (
  public.netvyl_is_company_admin(organization_id)
);

create policy materials_update_tenant
on public.materials
for update to authenticated
using (
  public.netvyl_is_company_admin(organization_id)
)
with check (
  public.netvyl_is_company_admin(organization_id)
);

create policy materials_delete_tenant
on public.materials
for delete to authenticated
using (
  public.netvyl_is_company_admin(organization_id)
);

-- ------------------------------------------------------------
-- Job deletion: administrator ONLY.
-- The existing RPC is tightened separately below.
-- ------------------------------------------------------------

-- Direct DELETE protection, even if a client attempts REST directly.
alter table public.jobs enable row level security;

drop policy if exists jobs_delete_tenant on public.jobs;

create policy jobs_delete_tenant
on public.jobs
for delete to authenticated
using (
  public.netvyl_is_company_admin(organization_id)
);

-- Tighten the existing inventory-restoring deletion RPC.
create or replace function public.delete_job_and_restore(p_job_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  j public.jobs%rowtype;
  m public.materials%rowtype;
  prev numeric;
begin
  select * into j
  from public.jobs
  where id = p_job_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Job not found or already deleted';
  end if;

  if not public.netvyl_is_company_admin(j.organization_id) then
    raise exception 'Only the company administrator can delete jobs';
  end if;

  select * into m
  from public.materials
  where id = j.material_id
  for update;

  if not found then
    raise exception 'Material not found';
  end if;

  prev := m.current_length_ft;

  update public.materials
  set current_length_ft = current_length_ft + j.linear_length_ft
  where id = m.id;

  insert into public.inventory_transactions(
    organization_id, material_id, job_id, transaction_type,
    quantity_ft, previous_balance_ft, new_balance_ft, reason, created_by
  )
  values(
    j.organization_id, m.id, j.id, 'job_restore',
    j.linear_length_ft, prev, prev + j.linear_length_ft,
    'Inventory restored because job was deleted', auth.uid()
  );

  update public.jobs
  set deleted_at = now(),
      deleted_by = auth.uid(),
      status = 'cancelled',
      updated_at = now()
  where id = j.id;

  insert into public.audit_logs(
    organization_id, actor_user_id, action,
    entity_type, entity_id, details
  )
  values(
    j.organization_id, auth.uid(),
    'delete_job_restore_inventory', 'job', j.id,
    jsonb_build_object(
      'job_no', j.job_no,
      'restored_ft', j.linear_length_ft,
      'material', j.material_name_snapshot
    )
  );
end;
$$;

revoke all on function public.delete_job_and_restore(uuid) from public;
grant execute on function public.delete_job_and_restore(uuid) to authenticated;

-- ------------------------------------------------------------
-- Organization reset: administrator ONLY.
-- Existing reset RPC is expected to exist from V17.
-- This wrapper name is used by the V33 UI and explicitly checks role.
-- ------------------------------------------------------------
create or replace function public.netvyl_admin_reset_business(p_org_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.netvyl_is_company_admin(p_org_id) then
    raise exception 'Only the company administrator can reset business data';
  end if;

  -- Keep reset implementation centralized in the existing system function.
  -- (Corrected: the actual reset function is `reset_organization_operational_data`,
  -- which also requires an explicit confirmation argument. The old name/arity
  -- referenced here, `reset_organization_data(uuid)`, does not exist and would
  -- fail at call time; this wrapper already gates on company-admin above.)
  perform public.reset_organization_operational_data(p_org_id, 'RESET');
end;
$$;

revoke all on function public.netvyl_admin_reset_business(uuid) from public;
grant execute on function public.netvyl_admin_reset_business(uuid) to authenticated;

commit;
-- NETVYL Business Management Platform V35
-- Material administration ownership fix.
-- Company administrator (or explicit Master Admin Support Mode) controls
-- material onboarding, editing and deletion. This keeps managers, staff,
-- cashiers and production users from changing material definitions.

begin;

-- Keep the legacy function name for compatibility, but tighten its authority.
create or replace function public.is_org_inventory_admin(p_org uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id=p_org
      and user_id=auth.uid()
      and active=true
      and role='administrator'
  ) or public.netvyl_has_support_access(p_org);
$$;

grant execute on function public.is_org_inventory_admin(uuid) to authenticated;

-- Explicit material-admin helper.
create or replace function public.is_org_material_admin(p_org uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select public.is_org_inventory_admin(p_org);
$$;

grant execute on function public.is_org_material_admin(uuid) to authenticated;

-- Safe material deletion. A material that has ever been used by a job is
-- deliberately protected so historical jobs and inventory cannot be broken.
create or replace function public.delete_material(p_material_id uuid)
returns void
language plpgsql security invoker set search_path=public
as $$
declare
  m public.materials%rowtype;
  v_jobs integer;
begin
  select * into m
  from public.materials
  where id=p_material_id
  for update;

  if not found then raise exception 'Material not found'; end if;
  if not public.is_org_material_admin(m.organization_id) then
    raise exception 'Only the company administrator can delete materials';
  end if;

  select count(*)::integer into v_jobs
  from public.jobs
  where material_id=m.id;

  if v_jobs > 0 then
    raise exception 'Material cannot be deleted because it is referenced by % job record(s). Deactivate it instead.', v_jobs;
  end if;

  delete from public.materials where id=m.id;

  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
  values(
    m.organization_id,
    auth.uid(),
    'delete_material',
    'material',
    m.id::text,
    jsonb_build_object('name',m.name,'base_name',m.base_name,'opening_length_ft',m.initial_length_ft,'current_length_ft',m.current_length_ft)
  );
end;
$$;

grant execute on function public.delete_material(uuid) to authenticated;

-- Tighten direct table mutations as a second line of defence.
drop policy if exists netvyl_v35_material_insert on public.materials;
drop policy if exists netvyl_v35_material_update on public.materials;
drop policy if exists netvyl_v35_material_delete on public.materials;

create policy netvyl_v35_material_insert on public.materials
for insert to authenticated
with check (
  public.netvyl_can_operate_org(organization_id)
  and (public.netvyl_has_support_access(organization_id) or public.netvyl_has_org_role(organization_id,array['administrator']))
);

create policy netvyl_v35_material_update on public.materials
for update to authenticated
using (
  public.netvyl_has_support_access(organization_id) or public.netvyl_has_org_role(organization_id,array['administrator'])
)
with check (public.netvyl_can_operate_org(organization_id));

create policy netvyl_v35_material_delete on public.materials
for delete to authenticated
using (
  public.netvyl_has_support_access(organization_id) or public.netvyl_has_org_role(organization_id,array['administrator'])
);

commit;
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

-- Sync stock movement from the new inventory layer back to the legacy materials table and
-- the legacy inventory ledger. This keeps every job tied to its material and guarantees the
-- required transaction_type is always populated.
create or replace function public.netvyl_consume_inventory_for_order(
  p_organization_id uuid,
  p_order_id uuid,
  p_consumption jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_inventory_item public.inventory_items%rowtype;
  v_material_id uuid;
  v_qty numeric;
  v_prev numeric;
  v_job_id uuid;
  v_material public.materials%rowtype;
begin
  if p_order_id is null then
    raise exception 'Order/job id is required';
  end if;

  if jsonb_typeof(coalesce(p_consumption,'[]'::jsonb)) <> 'array' then
    raise exception 'Consumption payload must be a JSON array';
  end if;

  select id into v_job_id from public.jobs where id = p_order_id and organization_id = p_organization_id and deleted_at is null;
  if v_job_id is null then
    raise exception 'Job not found for this organization';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_consumption,'[]'::jsonb)) loop
    if nullif(v_item->>'inventory_item_id','') is null then
      continue;
    end if;

    select * into v_inventory_item
    from public.inventory_items
    where id = (v_item->>'inventory_item_id')::uuid
      and organization_id = p_organization_id
      and active = true
    for update;

    if not found then
      raise exception 'Inventory item not found in this organization';
    end if;

    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    if v_qty <= 0 then
      continue;
    end if;

    if v_inventory_item.current_stock - v_qty < 0 then
      raise exception 'Insufficient stock for % (available %, requested %)', v_inventory_item.name, v_inventory_item.current_stock, v_qty;
    end if;

    v_prev := v_inventory_item.current_stock;
    v_material_id := nullif((v_inventory_item.metadata->>'legacy_material_id')::uuid, null);

    if v_material_id is null then
      raise exception 'Inventory item % is not linked to a legacy material record', v_inventory_item.name;
    end if;

    select * into v_material
    from public.materials
    where id = v_material_id
      and organization_id = p_organization_id
      and active = true
    for update;

    if not found then
      raise exception 'Linked material % no longer exists', v_inventory_item.name;
    end if;

    if v_material.current_length_ft - v_qty < 0 then
      raise exception 'Insufficient material stock for % (available %, requested %)', v_material.name, v_material.current_length_ft, v_qty;
    end if;

    update public.inventory_items
    set current_stock = current_stock - v_qty,
        updated_at = now()
    where id = v_inventory_item.id;

    update public.materials
    set current_length_ft = current_length_ft - v_qty,
        updated_at = now()
    where id = v_material.id;

    insert into public.inventory_transactions(
      organization_id,
      material_id,
      job_id,
      transaction_type,
      quantity_ft,
      previous_balance_ft,
      new_balance_ft,
      reason,
      created_by
    )
    values(
      p_organization_id,
      v_material.id,
      v_job_id,
      'job_use',
      v_qty,
      v_material.current_length_ft,
      v_material.current_length_ft - v_qty,
      'Material consumed by job ' || coalesce((select job_no from public.jobs where id = v_job_id), 'unknown'),
      auth.uid()
    );
  end loop;

  return jsonb_build_object('job_id', v_job_id, 'organization_id', p_organization_id, 'consumed_items', jsonb_array_length(coalesce(p_consumption,'[]'::jsonb)));
end;
$$;

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
declare v_order public.job_orders%rowtype; v_line jsonb; v_line_id uuid; v_no text; v_subtotal numeric:=0; v_cost numeric:=0; v_tax_rate numeric:=0; v_tax numeric:=0; v_consumption jsonb; v_item public.inventory_items%rowtype; v_qty numeric; v_prev numeric;
begin
 if not public.netvyl_can_operate_org_v36(p_organization_id) then raise exception 'You do not have access to this organization'; end if;
 if not exists(select 1 from public.customers where id=p_customer_id and organization_id=p_organization_id) then raise exception 'Customer does not belong to this organization'; end if;
 if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'At least one order line is required'; end if;
 v_no:=public.netvyl_next_order_no(p_organization_id);
 select coalesce(tax_rate,0) into v_tax_rate from public.organizations where id=p_organization_id;
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
 v_tax:=round(v_subtotal*v_tax_rate/100,2);
 update public.job_orders set subtotal=v_subtotal,tax=v_tax,grand_total=v_subtotal+v_tax,estimated_cost=v_cost,estimated_profit=(v_subtotal+v_tax)-v_cost,updated_at=now() where id=v_order.id;
 return jsonb_build_object('order_id',v_order.id,'order_no',v_no,'grand_total',v_subtotal+v_tax,'estimated_cost',v_cost,'estimated_profit',v_subtotal-v_cost);
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
declare v_order public.job_orders%rowtype; v_line jsonb; v_line_id uuid; v_no text; v_subtotal numeric:=0; v_cost numeric:=0; v_tax_rate numeric:=0; v_tax numeric:=0; v_consumption jsonb; v_item public.inventory_items%rowtype; v_variant public.inventory_variants%rowtype; v_qty numeric; v_prev numeric;
begin
 if not public.netvyl_can_operate_org_v36(p_organization_id) then raise exception 'You do not have access to this organization'; end if;
 if not exists(select 1 from public.customers where id=p_customer_id and organization_id=p_organization_id) then raise exception 'Customer does not belong to this organization'; end if;
 if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'At least one order line is required'; end if;
 v_no:=public.netvyl_next_order_no(p_organization_id);
 select coalesce(tax_rate,0) into v_tax_rate from public.organizations where id=p_organization_id;
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
 v_tax:=round(v_subtotal*v_tax_rate/100,2);
 update public.job_orders set subtotal=v_subtotal,tax=v_tax,grand_total=v_subtotal+v_tax,estimated_cost=v_cost,estimated_profit=(v_subtotal+v_tax)-v_cost,updated_at=now() where id=v_order.id;
 return jsonb_build_object('order_id',v_order.id,'order_no',v_no,'grand_total',v_subtotal+v_tax,'estimated_cost',v_cost,'estimated_profit',v_subtotal-v_cost);
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
