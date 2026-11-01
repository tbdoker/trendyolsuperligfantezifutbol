-- Shared by every *.test.sql file. Loaded into the same session before each test.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

-- Supabase grants table access to these roles; row level security then decides what is visible.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- Runs stmt and expects it to fail. With a code, the error message must start with "code:".
create function pg_temp.expect_error(stmt text, code text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if code is not null and sqlerrm not like code || ':%' then
      raise exception 'FAIL  % (wrong error: %)', label, sqlerrm;
    end if;
    raise notice 'ok  refused: %', label;
    return;
  end;
  raise exception 'FAIL  should have been refused: %', label;
end $$;

create function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL  %', label; end if;
  raise notice 'ok  %', label;
end $$;

-- Act as a signed-in user (reset role to go back to the admin connection)
create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;
