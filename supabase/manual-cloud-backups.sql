-- One-time setup for the admin page's "Back up now to cloud" button.
-- No cron job, Edge Function deployment, or Vault secret is needed.

insert into storage.buckets (id, name, public)
values ('netvyl-org-backups', 'netvyl-org-backups', false)
on conflict (id) do update set public = false;

drop policy if exists "Organization admins read cloud backups" on storage.objects;
create policy "Organization admins read cloud backups"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'netvyl-org-backups'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.netvyl_has_org_role(((storage.foldername(name))[1])::uuid, array['administrator'])
      else false
    end
  );

drop policy if exists "Organization admins upload cloud backups" on storage.objects;
create policy "Organization admins upload cloud backups"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'netvyl-org-backups'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.netvyl_has_org_role(((storage.foldername(name))[1])::uuid, array['administrator'])
      else false
    end
  );
