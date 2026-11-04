-- change_task_status: комментарий из одних пробельных символов (табуляция, перевод строки,
-- неразрывный и нулевой ширины пробел) считается пустым; btrim() срезал только обычный пробел.
-- «Задача не найдена» — обычная ошибка (HTTP 400), а не P0002, который PostgREST отдаёт как HTTP 500.
-- Остальная логика без изменений, права функции сохраняются при create or replace.

create or replace function public.change_task_status(
  p_task_id uuid,
  p_to      public.task_status,
  p_comment text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    text := public.current_role_name();
  v_comment text := nullif(
    regexp_replace(p_comment, '^[\s ​﻿]+|[\s ​﻿]+$', '', 'g'), '');
  v_task    public.tasks;
  v_from    public.task_status;
begin
  if v_role is null then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  -- for update: параллельный повтор ждёт и видит уже новый статус — двух записей истории не будет.
  -- Чужая задача исполнителя неотличима от несуществующей.
  select * into v_task from public.tasks t where t.id = p_task_id for update;
  if not found or (v_role = 'executor' and v_task.assignee_id <> v_uid) then
    raise exception 'Задача не найдена';
  end if;
  v_from := v_task.status;

  if not exists (
    select 1
    from (values
      ('new'::public.task_status, 'in_progress'::public.task_status, 'executor'),
      ('in_progress',             'review',                          'executor'),
      ('review',                  'accepted',                        'manager'),
      ('review',                  'rework',                          'manager'),
      ('rework',                  'in_progress',                     'executor')
    ) as allowed (from_status, to_status, actor_role)
    where allowed.from_status = v_from and allowed.to_status = p_to and allowed.actor_role = v_role
  ) then
    raise exception 'Этот переход статуса недоступен'
      using detail = format('%s → %s, роль %s', v_from, p_to, v_role);
  end if;

  if p_to = 'rework' and v_comment is null then
    raise exception 'Для возврата на доработку нужен комментарий';
  end if;

  update public.tasks t set status = p_to where t.id = p_task_id returning * into v_task;

  insert into public.task_history (task_id, actor_id, from_status, to_status, comment)
  values (p_task_id, v_uid, v_from, p_to, v_comment);

  return v_task;
end;
$$;
