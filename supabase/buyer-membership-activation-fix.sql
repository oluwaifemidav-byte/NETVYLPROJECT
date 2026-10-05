-- Ensure the purchaser account gets an organization administrator membership
-- when Master Admin activates the organization or approves its license payment.
-- Also backfill organizations already marked active.

create or replace function public.netvyl_assign_license_buyers(p_org_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_count integer := 0;
begin
  insert into public.organization_members(
    organization_id,
    user_id,
    full_name,
    role,
    active
  )
  select
    l.organization_id,
    u.id,
    coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), 'Organization Administrator'),
    'administrator',
    true
  from public.licenses l
  join auth.users u on lower(trim(u.email)) = lower(trim(l.buyer_email))
  where l.organization_id = p_org_id
    and l.buyer_email is not null
    and trim(l.buyer_email) <> ''
    and l.status = 'active'
    and l.active = true
  on conflict (organization_id, user_id) do update
    set full_name = excluded.full_name,
        role = 'administrator',
        active = true;

  get diagnostics assigned_count = row_count;
  return assigned_count;
end;
$$;

revoke all on function public.netvyl_assign_license_buyers(uuid) from public, anon, authenticated;

-- Let a verified purchaser recover access by signing in with the license buyer
-- email. The caller cannot choose an organization or grant themselves access
-- unless an active license for their authenticated email exists.
create or replace function public.netvyl_claim_buyer_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;

  select l.organization_id,
         coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), 'Organization Administrator')
  into v_org_id, v_name
  from public.licenses l
  join public.organizations o on o.id = l.organization_id and o.status = 'active'
  join auth.users u on u.id = auth.uid()
  where l.status = 'active'
    and l.active = true
    and (l.expires_at is null or l.expires_at > now())
    and lower(trim(l.buyer_email)) = lower(trim(u.email))
  order by l.created_at desc
  limit 1;

  if v_org_id is null then
    raise exception 'No active organization license is assigned to this login email';
  end if;

  insert into public.organization_members(organization_id, user_id, full_name, role, active)
  values(v_org_id, auth.uid(), v_name, 'administrator', true)
  on conflict (organization_id, user_id) do update
    set full_name = excluded.full_name, role = 'administrator', active = true;

  return v_org_id;
end;
$$;

revoke all on function public.netvyl_claim_buyer_membership() from public, anon;
grant execute on function public.netvyl_claim_buyer_membership() to authenticated;

create or replace function public.master_set_organization_status(p_org_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_count integer := 0;
begin
  if not (public.is_platform_admin() or public.netvyl_is_platform_super_admin()) then
    raise exception 'Platform Master Admin access required';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'Invalid organization status';
  end if;

  update public.organizations
  set status = p_status, updated_at = now()
  where id = p_org_id;
  if not found then raise exception 'Organization not found'; end if;

  if p_status = 'active' then
    assigned_count := public.netvyl_assign_license_buyers(p_org_id);
  end if;

  return jsonb_build_object(
    'organization_id', p_org_id,
    'status', p_status,
    'buyer_memberships_assigned', assigned_count
  );
end;
$$;

create or replace function public.master_verify_license_payment(
  p_request_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns table(success boolean, license_id uuid, license_key text, organization_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.license_payment_requests%rowtype;
  l public.licenses%rowtype;
begin
  if not public.netvyl_is_platform_super_admin() then
    raise exception 'Platform administrator authorization required';
  end if;

  select * into r from public.license_payment_requests where id = p_request_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  select * into l from public.licenses where id = r.license_id for update;
  if not found then raise exception 'License not found'; end if;

  if p_approve then
    update public.license_payment_requests
    set status = 'verified', verified_at = now(), verified_by = auth.uid(), notes = p_notes
    where id = r.id;
    update public.licenses
    set status = 'active', active = true, payment_status = 'verified',
        payment_reference = coalesce(r.payment_reference, payment_reference), updated_at = now()
    where id = l.id;
    update public.organizations set status = 'active', updated_at = now() where id = l.organization_id;
    perform public.netvyl_assign_license_buyers(l.organization_id);
    insert into public.audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, details)
    values(l.organization_id, auth.uid(), 'license_payment_verified', 'license', l.id::text,
      jsonb_build_object('payment_request_id', r.id, 'amount', r.amount));
  else
    update public.license_payment_requests
    set status = 'rejected', verified_at = now(), verified_by = auth.uid(), notes = p_notes
    where id = r.id;
    update public.licenses set payment_status = 'rejected', updated_at = now() where id = l.id;
  end if;

  return query select true, l.id, l.license_key, l.organization_id, l.expires_at;
end;
$$;

grant execute on function public.master_verify_license_payment(uuid, boolean, text) to authenticated;

-- Backfill active paid licenses for purchaser accounts that already exist.
do $$
declare org_row record;
begin
  for org_row in
    select distinct o.id
    from public.organizations o
    join public.licenses l on l.organization_id = o.id
    where o.status = 'active' and l.status = 'active' and l.active = true
  loop
    perform public.netvyl_assign_license_buyers(org_row.id);
  end loop;
end;
$$;
