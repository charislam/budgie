-- Generalize the shared ECMAScript whitespace helper for names and descriptions.
alter function public.envelope_trim(text) rename to trim_whitespace;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = public.trim_whitespace(name) and char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.budget_members (
  budget_id uuid not null references public.budgets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (budget_id, user_id)
);
create index budget_members_user on public.budget_members(user_id, budget_id);
alter table public.budgets enable row level security;
alter table public.budget_members enable row level security;
revoke all on public.budgets, public.budget_members from anon, authenticated;
grant select on public.budgets, public.budget_members to authenticated;
create policy budget_members_select_self on public.budget_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy budgets_select_member on public.budgets for select to authenticated
  using (id in (select budget_id from public.budget_members where user_id = (select auth.uid())));

-- Preserve each existing owner's envelopes together, including their IDs and dates.
insert into public.budgets(id, name) select id, 'Personal' from auth.users;
insert into public.budget_members(budget_id, user_id) select id, id from public.budgets;
alter table public.envelopes add column budget_id uuid references public.budgets(id) on delete cascade;
update public.envelopes set budget_id = user_id;
alter table public.envelopes alter column budget_id set not null;
drop policy envelopes_select_owner on public.envelopes;
drop policy envelopes_insert_owner on public.envelopes;
alter table public.envelopes drop column user_id;
alter table public.envelopes add constraint envelopes_budget_name_unique unique (budget_id, name_key);
create index envelopes_budget_name_order on public.envelopes(budget_id, name_key, id);
create index envelopes_budget_created_order on public.envelopes(budget_id, created_at, id);
grant insert (budget_id) on public.envelopes to authenticated;
create policy envelopes_select_member on public.envelopes for select to authenticated
  using (budget_id in (select budget_id from public.budget_members where user_id = (select auth.uid())));
create policy envelopes_insert_member on public.envelopes for insert to authenticated
  with check (budget_id in (select budget_id from public.budget_members where user_id = (select auth.uid())));

-- A privileged operation is needed to bootstrap a budget and its first membership
-- atomically. Membership writes remain unavailable to clients (no self-enrollment).
create function public.create_budget(name text) returns public.budgets
language plpgsql security definer set search_path = '' as $$
declare result public.budgets;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  insert into public.budgets(name) values (public.trim_whitespace(name)) returning * into result;
  insert into public.budget_members(budget_id, user_id) values (result.id, auth.uid());
  return result;
end $$;
revoke all on function public.create_budget(text) from public, anon;
grant execute on function public.create_budget(text) to authenticated;

-- Compatibility for the existing single-budget create flow. Never choose an
-- arbitrary budget when the caller belongs to more than one.
create function public.default_budget_id() returns uuid
language plpgsql security invoker set search_path = '' as $$
declare ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select array_agg(id) into ids from public.budgets;
  if cardinality(ids) > 1 then
    raise exception 'Specify a budget_id when you belong to multiple budgets' using errcode = '22023';
  end if;
  if cardinality(ids) = 1 then return ids[1]; end if;
  raise exception 'Create a budget before adding envelopes' using errcode = '22023';
end $$;
revoke all on function public.default_budget_id() from public, anon;
grant execute on function public.default_budget_id() to authenticated;
alter table public.envelopes alter column budget_id set default public.default_budget_id();

-- Provision the initial budget before any envelope insert needs to authorize it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create function private.provision_personal_budget() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.budgets(id, name) values (new.id, 'Personal');
  insert into public.budget_members(budget_id, user_id) values (new.id, new.id);
  return new;
end $$;
revoke all on function private.provision_personal_budget() from public, anon, authenticated;
create trigger provision_personal_budget after insert on auth.users
  for each row execute function private.provision_personal_budget();
