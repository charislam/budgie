begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into public.envelopes(name) values ('Food');
do $$ begin
  begin insert into public.envelopes(name) values ('food'); raise exception 'duplicate accepted'; exception when unique_violation then null; end;
  begin insert into public.envelopes(name,user_id) values ('Other','00000000-0000-4000-8000-000000000002'); raise exception 'cross-user insert accepted'; exception when insufficient_privilege then null; end;
  begin insert into public.envelopes(name) values ('  '); raise exception 'blank accepted'; exception when check_violation then null; end;
  begin update public.envelopes set name='Changed'; raise exception 'update accepted'; exception when insufficient_privilege then null; end;
end $$;
insert into public.envelopes(name) select 'Envelope ' || lpad(n::text,3,'0') from generate_series(1,60) n;
do $$ declare count_rows int; begin
  select count(*) into count_rows from public.list_envelopes_page('name_asc');
  if count_rows <> 51 then raise exception 'page size incorrect'; end if;
  select count(*) into count_rows from public.list_envelopes_page('created_desc');
  if count_rows <> 51 then raise exception 'date page size incorrect'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin if exists(select 1 from public.envelopes) then raise exception 'cross-user read'; end if; end $$;
insert into public.envelopes(name) values ('Food');
set local role anon;
do $$ begin
  begin perform 1 from public.envelopes; raise exception 'anonymous read'; exception when insufficient_privilege then null; end;
end $$;
rollback;
