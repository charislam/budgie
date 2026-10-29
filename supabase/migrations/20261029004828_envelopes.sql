-- Use the same ECMAScript whitespace set as String.trim().
create function public.envelope_trim(value text) returns text
language sql immutable strict set search_path = ''
as $$ select btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') $$;

-- Deterministic Unicode lowercasing without promising Unicode normalization.
create collation public.envelope_name_collation (provider = icu, locale = 'und', deterministic = true);
create table public.envelopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (name = public.envelope_trim(name) and char_length(name) between 1 and 100),
  description text check (description is null or (description = public.envelope_trim(description) and char_length(description) between 1 and 500)),
  created_at timestamptz not null default now(),
  name_key text collate public.envelope_name_collation generated always as (lower(name collate public.envelope_name_collation)) stored,
  constraint envelopes_owner_name_unique unique (user_id, name_key)
);
create index envelopes_owner_name_order on public.envelopes(user_id, name_key, id);
create index envelopes_owner_created_order on public.envelopes(user_id, created_at, id);
alter table public.envelopes enable row level security;
revoke all on public.envelopes from anon, authenticated;
grant select on public.envelopes to authenticated;
grant insert (name, description, user_id) on public.envelopes to authenticated;
create policy envelopes_select_owner on public.envelopes for select to authenticated using ((select auth.uid()) = user_id);
create policy envelopes_insert_owner on public.envelopes for insert to authenticated with check ((select auth.uid()) = user_id);

create function public.list_envelopes_page(requested_sort text, after_key text default null, after_id uuid default null)
returns setof public.envelopes language plpgsql stable security invoker set search_path = '' as $$
begin
  if requested_sort not in ('name_asc','name_desc','created_asc','created_desc') or ((after_key is null) <> (after_id is null)) then
    raise exception 'Invalid pagination parameters' using errcode = '22023';
  end if;
  if requested_sort = 'name_asc' then
    return query select e.* from public.envelopes e where after_id is null or (e.name_key,e.id) > (after_key collate public.envelope_name_collation,after_id) order by e.name_key asc,e.id asc limit 51;
  elsif requested_sort = 'name_desc' then
    return query select e.* from public.envelopes e where after_id is null or (e.name_key,e.id) < (after_key collate public.envelope_name_collation,after_id) order by e.name_key desc,e.id desc limit 51;
  elsif requested_sort = 'created_asc' then
    return query select e.* from public.envelopes e where after_id is null or (e.created_at,e.id) > (after_key::timestamptz,after_id) order by e.created_at asc,e.id asc limit 51;
  else
    return query select e.* from public.envelopes e where after_id is null or (e.created_at,e.id) < (after_key::timestamptz,after_id) order by e.created_at desc,e.id desc limit 51;
  end if;
end $$;
revoke all on function public.list_envelopes_page(text,text,uuid) from public,anon;
grant execute on function public.list_envelopes_page(text,text,uuid) to authenticated;
