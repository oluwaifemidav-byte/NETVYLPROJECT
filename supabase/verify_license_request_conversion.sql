-- 1) Confirm the new column exists.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'license_requests'
  and column_name = 'converted_organization_id';

-- 2) Confirm the RPC exists with the expected signature.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'master_convert_license_request';

-- 3) Confirm the request table can still be updated to converted.
-- Replace the ID with a real request row only if you want to test the write path.
-- This query is read-only and just checks the current state of converted rows.
select id, email, status, converted_organization_id, updated_at
from public.license_requests
where status = 'converted'
order by updated_at desc
limit 20;

-- 4) Confirm converted requests are linked to an organization when available.
select lr.id, lr.email, lr.converted_organization_id, o.name as organization_name
from public.license_requests lr
left join public.organizations o
  on o.id = lr.converted_organization_id
where lr.status = 'converted'
order by lr.updated_at desc
limit 20;