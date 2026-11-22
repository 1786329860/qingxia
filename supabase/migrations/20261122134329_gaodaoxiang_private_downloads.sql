insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('desktop-installers', 'desktop-installers', false, 35000000, array['application/octet-stream']);

create policy "Members can download desktop installers"
on storage.objects for select to authenticated
using (
  bucket_id = 'desktop-installers'
  and storage.allow_only_operation('object.get_authenticated')
  and (select auth.uid()) is not null
  and (select auth.jwt()->>'is_anonymous') = 'false'
  and (select auth.jwt()->>'email') <> ''
);
