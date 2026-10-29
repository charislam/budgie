begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000011'),
 ('00000000-0000-4000-8000-000000000012'),
 ('00000000-0000-4000-8000-000000000013');
delete from public.budgets where id in ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000013');
insert into public.budgets(id,name) values
 ('10000000-0000-4000-8000-000000000001','Shared'),
 ('10000000-0000-4000-8000-000000000002','Other');
insert into public.budget_members values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000011');
select throws_ok($$insert into public.budget_members values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011')$$,
 '23505',null,'duplicate memberships are rejected');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',true);
select is((select count(*) from public.budgets),2::bigint,'a user can belong to multiple budgets');
select throws_ok($$insert into public.envelopes(name) values ('Ambiguous')$$,'22023',null,'multiple budgets require explicit selection');
select lives_ok($$insert into public.envelopes(budget_id,name) values ('10000000-0000-4000-8000-000000000001','Food'), ('10000000-0000-4000-8000-000000000002','Food')$$,'different budgets permit identical envelope names');
select throws_ok($$insert into public.envelopes(budget_id,name) values (null,'Missing')$$,'42501',null,'envelopes without a budget are rejected');
select throws_ok($$insert into public.budget_members values ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000013')$$,'42501',null,'clients cannot grant membership');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000012',true);
select is((select count(*) from public.envelopes),1::bigint,'members see shared envelopes but not other budgets');
select lives_ok($$insert into public.envelopes(name) values ('Rent')$$,'another member can add an envelope to the shared budget');
select throws_ok($$insert into public.envelopes(name) values ('food')$$,'23505',null,'uniqueness applies across members of one budget');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000013',true);
select is_empty($$select * from public.budgets$$,'nonmembers cannot see budgets');
select is_empty($$select * from public.envelopes$$,'nonmembers cannot see envelopes');
select throws_ok($$insert into public.envelopes(budget_id,name) values ('10000000-0000-4000-8000-000000000001','Intrusion')$$,'42501',null,'nonmembers cannot write envelopes');
select lives_ok($$select public.create_budget('New')$$,'users can create a budget and its initial membership atomically');
reset role;
select * from finish();
rollback;
