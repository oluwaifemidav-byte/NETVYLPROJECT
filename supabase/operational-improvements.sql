-- Activity history for delivery, artwork and approval changes.
-- Apply to existing NETVYL V36 databases after the core V36 schema.

create or replace function public.netvyl_update_order_lifecycle(
  p_order_id uuid,
  p_delivery_status text default null,
  p_artwork_status text default null,
  p_approval_status text default null,
  p_delivery_address text default null,
  p_delivery_date date default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  old_order public.job_orders%rowtype;
  new_order public.job_orders%rowtype;
  changes jsonb := '{}'::jsonb;
begin
  select * into old_order from public.job_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.netvyl_can_operate_org_v36(old_order.organization_id) then raise exception 'Access denied'; end if;

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
  where id=old_order.id
  returning * into new_order;

  if old_order.delivery_status is distinct from new_order.delivery_status then changes:=changes||jsonb_build_object('delivery_status',jsonb_build_object('from',old_order.delivery_status,'to',new_order.delivery_status)); end if;
  if old_order.artwork_status is distinct from new_order.artwork_status then changes:=changes||jsonb_build_object('artwork_status',jsonb_build_object('from',old_order.artwork_status,'to',new_order.artwork_status)); end if;
  if old_order.approval_status is distinct from new_order.approval_status then changes:=changes||jsonb_build_object('approval_status',jsonb_build_object('from',old_order.approval_status,'to',new_order.approval_status)); end if;
  if old_order.delivery_address is distinct from new_order.delivery_address then changes:=changes||jsonb_build_object('delivery_address',jsonb_build_object('from',old_order.delivery_address,'to',new_order.delivery_address)); end if;
  if old_order.delivery_date is distinct from new_order.delivery_date then changes:=changes||jsonb_build_object('delivery_date',jsonb_build_object('from',old_order.delivery_date,'to',new_order.delivery_date)); end if;

  if changes <> '{}'::jsonb then
    insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
    values(new_order.organization_id,auth.uid(),'update_order_lifecycle','job_order',new_order.id::text,jsonb_build_object('order_no',new_order.order_no,'changes',changes));
  end if;
  return jsonb_build_object('order_id',new_order.id,'delivery_status',new_order.delivery_status,'artwork_status',new_order.artwork_status,'approval_status',new_order.approval_status);
end;
$$;

create or replace function public.netvyl_audit_job_update()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare changes jsonb := '{}'::jsonb;
begin
  if old.status is distinct from new.status then changes:=changes||jsonb_build_object('status',jsonb_build_object('from',old.status,'to',new.status)); end if;
  if old.amount_paid is distinct from new.amount_paid then changes:=changes||jsonb_build_object('amount_paid',jsonb_build_object('from',old.amount_paid,'to',new.amount_paid)); end if;
  if old.grand_total is distinct from new.grand_total then changes:=changes||jsonb_build_object('grand_total',jsonb_build_object('from',old.grand_total,'to',new.grand_total)); end if;
  if changes <> '{}'::jsonb then
    insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details)
    values(new.organization_id,auth.uid(),'update_job','job',new.id::text,jsonb_build_object('job_no',new.job_no,'changes',changes));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_netvyl_audit_job_update on public.jobs;
create trigger trg_netvyl_audit_job_update after update on public.jobs
for each row execute function public.netvyl_audit_job_update();
