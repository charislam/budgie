create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.oauth_client_audiences (
 client_id text primary key,
 audience text not null check (audience ~ '^https?://')
);
alter table private.oauth_client_audiences enable row level security;
grant usage on schema private to supabase_auth_admin;
grant select on private.oauth_client_audiences to supabase_auth_admin;
create policy auth_reads_audiences on private.oauth_client_audiences for select to supabase_auth_admin using (true);
create function private.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare target text; claims jsonb := event->'claims';
begin
 select audience into target from private.oauth_client_audiences where client_id = claims->>'client_id';
 if target is not null then claims := jsonb_set(claims, '{aud}', to_jsonb(target)); end if;
 return jsonb_build_object('claims', claims);
end $$;
revoke all on function private.custom_access_token_hook(jsonb) from public,anon,authenticated;
grant execute on function private.custom_access_token_hook(jsonb) to supabase_auth_admin;
