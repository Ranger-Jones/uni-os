/** Run once in the SQL editor of the user's Supabase project. Idempotent. */
export const SUPABASE_SETUP_SQL = `-- UniOS sync: one table of encrypted rows and a private file bucket, both visible only to your own login.
create table if not exists public.unios_sync (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entity text not null,
  id text not null,
  payload text,
  deleted boolean not null default false,
  updated_at text not null,
  device_id text not null,
  seq bigint not null default 0,
  primary key (user_id, entity, id)
);

-- Every insert/update gets a new change number; devices pull "everything after n".
create sequence if not exists public.unios_sync_seq;
create or replace function public.unios_sync_bump() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.seq := nextval('public.unios_sync_seq');
  return new;
end $$;
drop trigger if exists unios_sync_bump on public.unios_sync;
create trigger unios_sync_bump before insert or update on public.unios_sync
  for each row execute function public.unios_sync_bump();
create index if not exists unios_sync_user_seq on public.unios_sync (user_id, seq);

alter table public.unios_sync enable row level security;
drop policy if exists "unios: own rows" on public.unios_sync;
create policy "unios: own rows" on public.unios_sync for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('unios-files', 'unios-files', false)
  on conflict (id) do nothing;
drop policy if exists "unios: own files" on storage.objects;
create policy "unios: own files" on storage.objects for all to authenticated
  using (bucket_id = 'unios-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'unios-files' and (storage.foldername(name))[1] = auth.uid()::text);
`
