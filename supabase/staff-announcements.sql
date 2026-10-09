-- Allows organization administrators to send in-app announcements to active staff.
-- Run this once against an existing NETVYL Supabase database.

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
