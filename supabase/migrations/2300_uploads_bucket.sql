-- Mnemonic pictures are stored in the public `uploads` bucket and shown
-- from getPublicUrl. The bucket was created by hand on the first project;
-- this makes sure every school on a new project gets a public bucket, and
-- turns the flag on if the bucket exists but is private (the URL then 404s
-- and the card looks like it has no picture).
--
-- Writes stay on the service role (the generate-image function). Students
-- only need to read.

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update set public = true;

drop policy if exists "uploads public read" on storage.objects;
create policy "uploads public read"
  on storage.objects for select
  to public
  using (bucket_id = 'uploads');

-- ----------------------------------------------------------------------------
-- ROLLBACK:
-- drop policy if exists "uploads public read" on storage.objects;
-- (leave the bucket; pictures already point at it)
-- ----------------------------------------------------------------------------
