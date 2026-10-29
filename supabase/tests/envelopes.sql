begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$insert into public.envelopes(name) values ('Food')$$,
  'authenticated users can create their own envelopes'
);
select throws_ok(
  $$insert into public.envelopes(name) values ('food')$$,
  '23505', null, 'envelope names are unique per user regardless of case'
);
select throws_ok(
  $$insert into public.envelopes(name,user_id) values ('Other','00000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'users cannot create envelopes for another user'
);
select throws_ok(
  $$insert into public.envelopes(name) values ('  ')$$,
  '23514', null, 'blank envelope names are rejected'
);
select throws_ok(
  $$update public.envelopes set name='Changed'$$,
  '42501', null, 'authenticated users cannot update envelopes'
);

insert into public.envelopes(name) select 'Envelope ' || lpad(n::text,3,'0') from generate_series(1,60) n;
select is(
  (select count(*) from public.list_envelopes_page('name_asc')),
  51::bigint, 'name pagination returns at most 51 envelopes'
);
select is(
  (select count(*) from public.list_envelopes_page('created_desc')),
  51::bigint, 'date pagination returns at most 51 envelopes'
);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select is_empty(
  $$select 1 from public.envelopes$$,
  'users cannot read another user''s envelopes'
);
select lives_ok(
  $$insert into public.envelopes(name) values ('Food')$$,
  'different users can use the same envelope name'
);

set local role anon;
select throws_ok(
  $$select 1 from public.envelopes$$,
  '42501', null, 'anonymous users cannot read envelopes'
);

reset role;
select * from finish();
rollback;
