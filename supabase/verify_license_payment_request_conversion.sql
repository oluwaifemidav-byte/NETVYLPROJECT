-- 1) Confirm the new column exists.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'license_payment_requests'
  and column_name = 'converted_organization_id';

-- 2) Confirm the RPC exists with the expected signature.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'master_convert_license_payment_request';

-- 3) Confirm converted payment requests are linked to an organization when available.
select id, payer_email, status, converted_organization_id, updated_at
from public.license_payment_requests
where status = 'verified'
order by updated_at desc
limit 20;

-- 4) Confirm converted requests are linked to an organization when available.
select lpr.id, lpr.payer_email, lpr.converted_organization_id, o.name as organization_name
from public.license_payment_requests lpr
left join public.organizations o
  on o.id = lpr.converted_organization_id
where lpr.status = 'verified'
order by lpr.updated_at desc
limit 20;