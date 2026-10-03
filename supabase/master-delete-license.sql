-- Permanently remove a mistaken license from Master Admin.
-- Payment requests and device activations are removed by their license_id
-- foreign keys (ON DELETE CASCADE).
create or replace function public.master_delete_license(p_license_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.licenses%rowtype;
begin
  if not public.netvyl_is_platform_super_admin() then
    raise exception 'Platform administrator authorization required';
  end if;

  select * into l
  from public.licenses
  where id = p_license_id
  for update;

  if not found then
    raise exception 'License not found';
  end if;

  delete from public.licenses where id = l.id;

  insert into public.audit_logs(
    organization_id, actor_user_id, action, entity_type, entity_id, details
  ) values (
    l.organization_id, auth.uid(), 'delete_license', 'license', l.id::text,
    jsonb_build_object('license_key', l.license_key, 'plan', l.plan, 'status', l.status)
  );
end;
$$;

revoke all on function public.master_delete_license(uuid) from public;
grant execute on function public.master_delete_license(uuid) to authenticated;
