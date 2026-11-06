create extension if not exists pg_net with schema extensions;

create function public.qingxia_reminder_tick()
returns void language plpgsql set search_path = '' as $$
declare dispatch_key text;
begin
  update public.qingxia_reminders set state='expired', finished_at=now(), confirmation_hash=null
    where state='awaiting' and due_at <= now();
  update public.qingxia_reminders set state='uncertain', finished_at=now()
    where state='sending' and claimed_at < now() - interval '5 minutes';
  update public.qingxia_reminders set state='failed', finished_at=now()
    where state='queued' and due_at <= now() - interval '1 day';
  if exists (select 1 from public.qingxia_reminders where state='queued' and due_at <= now())
    and (select count(*) from public.qingxia_reminders where claimed_at > now()-interval '1 hour') < 6
  then
    select decrypted_secret into dispatch_key from vault.decrypted_secrets where name='qingxia_reminder_dispatch';
    if dispatch_key is not null then
      perform net.http_post(
        url := 'https://qingxia.vercel.app/api/reminders?action=dispatch',
        headers := jsonb_build_object('Authorization','Bearer ' || dispatch_key,'Content-Type','application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 23000
      );
    end if;
  end if;
end;
$$;
revoke all on function public.qingxia_reminder_tick() from public, anon, authenticated;
select cron.schedule('qingxia-reminder-dispatch','* * * * *',$$select public.qingxia_reminder_tick();$$);
select cron.schedule('qingxia-reminder-retention','23 19 * * *',
  $$delete from public.qingxia_reminders where finished_at < now() - interval '30 days';$$);
