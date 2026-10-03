alter table public.license_payment_requests
  add column if not exists converted_organization_id uuid
  references public.organizations(id) on delete set null;

create index if not exists idx_license_payment_requests_converted_org
  on public.license_payment_requests(converted_organization_id);

update public.license_payment_requests lpr
set converted_organization_id = lic.organization_id
from public.licenses lic
where lpr.converted_organization_id is null
  and lpr.payer_email is not null
  and lic.buyer_email is not null
  and lower(trim(lic.buyer_email)) = lower(trim(lpr.payer_email))
  and lpr.status = 'converted';