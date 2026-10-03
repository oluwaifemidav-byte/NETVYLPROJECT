alter table public.license_requests
  add column if not exists converted_organization_id uuid
  references public.organizations(id) on delete set null;

create index if not exists idx_license_requests_converted_org
  on public.license_requests(converted_organization_id);

update public.license_requests lr
set converted_organization_id = lic.organization_id
from public.licenses lic
where lr.converted_organization_id is null
  and lr.email is not null
  and lic.buyer_email is not null
  and lower(trim(lic.buyer_email)) = lower(trim(lr.email))
  and lr.status = 'converted';