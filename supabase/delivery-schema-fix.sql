-- Fix for existing databases where the Delivery page reports that
-- job_orders.delivery_status does not exist. Safe to run more than once.
alter table public.job_orders add column if not exists delivery_status text not null default 'not_required';
alter table public.job_orders add column if not exists delivery_address text;
alter table public.job_orders add column if not exists delivery_date date;
alter table public.job_orders add column if not exists delivered_at timestamptz;
alter table public.job_orders add column if not exists artwork_status text not null default 'not_required';
alter table public.job_orders add column if not exists approval_status text not null default 'not_required';
alter table public.job_orders add column if not exists approved_at timestamptz;
alter table public.job_orders add column if not exists approved_by uuid references auth.users(id);

create index if not exists idx_job_orders_delivery
  on public.job_orders(organization_id, delivery_status, due_at);

notify pgrst, 'reload schema';
