-- 先在 Supabase 启用 Cron/pg_cron；由 SQL Editor 的 postgres 角色执行。
-- cron 使用 UTC；19:17 UTC = 次日北京时间 03:17。
-- 相同名称会更新现有任务，不创建重复任务。
do $$ begin
  if not exists(select 1 from pg_extension where extname='pg_cron') then
    raise exception '请先在 Supabase 启用 Cron (pg_cron)，再执行本迁移。';
  end if;
end $$;
select cron.schedule('qingxia-retention-cleanup','17 19 * * *',$$select public.qingxia_cleanup();$$);
select jobid,jobname,schedule,active from cron.job where jobname='qingxia-retention-cleanup';
