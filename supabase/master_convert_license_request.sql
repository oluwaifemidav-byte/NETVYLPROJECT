create extension if not exists pgcrypto;

create or replace function public.master_convert_license_request(
  p_request_id uuid,
  p_name text,
  p_slug text default null,
  p_currency text default 'NGN',
  p_plan text default 'professional',
  p_days integer default 365,
  p_max_users integer default 5,
  p_price numeric default 0
) returns table (
  organization_id uuid,
  organization_slug text,
  license_id uuid,
  license_key text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.license_requests%rowtype;
  v_org_id uuid;
  v_slug text;
  v_license_id uuid;
  v_license_key text;
  v_expires_at timestamptz;
begin
  if not (public.is_platform_admin() or public.netvyl_is_platform_super_admin()) then
    raise exception 'Platform administrator authorization required';
  end if;

  select *
    into v_request
    from public.license_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'License request not found';
  end if;

  v_slug := lower(
    regexp_replace(
      coalesce(nullif(trim(p_slug), ''), trim(p_name)),
      '[^a-zA-Z0-9]+',
      '-',
      'g'
    )
  );

  if exists (
    select 1
      from public.organizations o
     where lower(o.name) = lower(trim(p_name))
        or o.slug = v_slug
  ) then
    raise exception 'An organization with this name or slug already exists';
  end if;

  insert into public.organizations(name, slug, currency, status)
  values (
    trim(p_name),
    v_slug,
    upper(coalesce(nullif(trim(p_currency), ''), 'NGN')),
    'trial'
  )
  returning id into v_org_id;

  v_expires_at := now() + make_interval(days => greatest(coalesce(p_days, 365), 1));
  v_license_key := 'NETVYL-' ||
    upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 4)) || '-' ||
    upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 4)) || '-' ||
    upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 4));

  insert into public.licenses(
    organization_id,
    plan,
    license_key,
    starts_at,
    expires_at,
    max_users,
    active,
    status,
    updated_at,
    price
  )
  values (
    v_org_id,
    lower(coalesce(nullif(trim(p_plan), ''), 'professional')),
    v_license_key,
    now(),
    v_expires_at,
    greatest(coalesce(p_max_users, 5), 1),
    false,
    'pending',
    now(),
    coalesce(p_price, 0)
  )
  returning id into v_license_id;

  update public.license_requests
     set status = 'converted',
         converted_organization_id = v_org_id,
         updated_at = now()
   where id = p_request_id;

  insert into public.audit_logs(
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    v_org_id,
    auth.uid(),
    'master_convert_license_request',
    'license_request',
    p_request_id::text,
    jsonb_build_object(
      'organization_id', v_org_id,
      'license_id', v_license_id,
      'request_id', p_request_id,
      'buyer_email', v_request.email,
      'license_key', v_license_key,
      'status', 'pending'
    )
  );

  return query
  select
    v_org_id,
    v_slug,
    v_license_id,
    v_license_key,
    v_expires_at;
end;
$$;

grant execute on function public.master_convert_license_request(
  uuid, text, text, text, text, integer, integer, numeric
) to authenticated;