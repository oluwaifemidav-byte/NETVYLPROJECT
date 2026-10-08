-- Add all configurable company profile fields used by Administration.
-- Safe to run on existing databases and fresh installs.
alter table public.organizations
  add column if not exists job_prefix text not null default 'JOB-',
  add column if not exists order_prefix text not null default 'ORD-',
  add column if not exists quote_prefix text not null default 'QT-',
  add column if not exists receipt_prefix text not null default 'RCT-',
  add column if not exists tax_rate numeric(8,4) not null default 0,
  add column if not exists default_payment_method text not null default 'Transfer';
alter table public.organizations
  add column if not exists receipt_footer text not null default 'Thank you for your patronage.';

-- Make the new organization columns visible to PostgREST immediately.
notify pgrst, 'reload schema';
