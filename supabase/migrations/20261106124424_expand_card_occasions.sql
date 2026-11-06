-- Keep the original three identifiers so already scheduled cards remain valid.
alter table public.qingxia_reminders
  drop constraint qingxia_reminders_template_check,
  add constraint qingxia_reminders_template_check
    check (template in ('birthday', 'anniversary', 'letter', 'thanks', 'congrats', 'festival'));
