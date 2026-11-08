create or replace function public.purge_old_logs(
  batch integer default 5000,
  default_retention_days integer default 14,
  max_logs_per_user integer default 100000,
  max_demo_logs_per_user integer default 20000
) returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  total bigint := 0;
  deleted_rows bigint;
begin
  if batch < 1 or batch > 5000 then
    raise exception 'batch must be between 1 and 5000';
  end if;
  if default_retention_days < 1 or default_retention_days > 90 then
    raise exception 'default_retention_days must be between 1 and 90';
  end if;
  if max_logs_per_user < 1 or max_demo_logs_per_user < 1 then
    raise exception 'row caps must be positive';
  end if;

  loop
    with doomed as (
      select l.id
      from public.request_logs as l
      left join public.user_settings as s on s.user_id = l.user_id
      where l.occurred_at < now() - make_interval(
        days => coalesce(s.retention_days, default_retention_days)
      )
      order by l.occurred_at, l.id
      limit batch
    )
    delete from public.request_logs as l
    using doomed
    where l.id = doomed.id;

    get diagnostics deleted_rows = row_count;
    total := total + deleted_rows;
    exit when deleted_rows = 0;
  end loop;

  loop
    with ranked as (
      select l.id,
             row_number() over (
               partition by l.user_id
               order by l.occurred_at desc, l.id desc
             ) as row_num
      from public.request_logs as l
    ),
    doomed as (
      select id
      from ranked
      where row_num > max_logs_per_user
      order by id
      limit batch
    )
    delete from public.request_logs as l
    using doomed
    where l.id = doomed.id;

    get diagnostics deleted_rows = row_count;
    total := total + deleted_rows;
    exit when deleted_rows = 0;
  end loop;

  loop
    with ranked as (
      select l.id,
             row_number() over (
               partition by l.user_id
               order by l.occurred_at desc, l.id desc
             ) as row_num
      from public.request_logs as l
      where l.source = 'demo'
    ),
    doomed as (
      select id
      from ranked
      where row_num > max_demo_logs_per_user
      order by id
      limit batch
    )
    delete from public.request_logs as l
    using doomed
    where l.id = doomed.id;

    get diagnostics deleted_rows = row_count;
    total := total + deleted_rows;
    exit when deleted_rows = 0;
  end loop;

  return total;
end
$function$;

revoke execute on function public.purge_old_logs(integer, integer, integer, integer)
  from public, anon, authenticated;

do $schedule$
begin
  if exists (
    select 1
    from pg_catalog.pg_available_extensions
    where name = 'pg_cron'
  ) then
    begin
      execute 'create extension if not exists pg_cron';
      execute 'select cron.unschedule(jobid) from cron.job where jobname = $1'
        using 'overcall-purge';
      execute 'select cron.schedule($1, $2, $3)'
        using 'overcall-purge', '17 3 * * *', 'select public.purge_old_logs()';
    exception
      when insufficient_privilege or object_not_in_prerequisite_state
        or undefined_file or undefined_function or undefined_table then
        raise notice 'pg_cron is unavailable; schedule public.purge_old_logs() externally';
    end;
  end if;
end
$schedule$;
