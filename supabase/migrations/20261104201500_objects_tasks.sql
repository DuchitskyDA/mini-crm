-- Мини-CRM «Объекты и задачи»: схема, переходы статусов, история, права доступа (RLS).
-- Контракт — связка эпика (волна 1). Применяется scripts/migrate.mjs одной транзакцией, без BEGIN/COMMIT в файле.
--
-- Защита держится на базе, а не на интерфейсе:
--   * RLS на всех таблицах: исполнитель видит только свои задачи, их историю и объекты, где они есть;
--   * статус меняет только RPC change_task_status (таблица переходов + роль + исполнитель задачи);
--   * история пишется только триггером и RPC, у клиентов нет прав на insert/update/delete;
--   * триггер tasks_guard держит правила правки: принятая задача заморожена, исполнитель меняется
--     только в «Новая» и «На доработке», автор и дата создания неизменны.

-- 1. Типы и таблицы ------------------------------------------------------------------------------

create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');

create table public.profiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (btrim(full_name) <> ''),
  role      text not null check (role in ('manager', 'executor'))
);

create table public.objects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  address    text not null check (btrim(address) <> ''),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (btrim(title) <> ''),
  description text not null default '',
  object_id   uuid not null references public.objects (id) on delete restrict,
  assignee_id uuid not null references public.profiles (id),
  status      public.task_status not null default 'new',
  author_id   uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_object_id_idx on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);

create table public.task_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  actor_id    uuid references public.profiles (id),
  from_status public.task_status,
  to_status   public.task_status not null,
  comment     text,
  created_at  timestamptz not null default now()
);

create index task_history_task_id_idx on public.task_history (task_id);

-- 2. Роль текущего пользователя ------------------------------------------------------------------
-- security definer: читает profiles в обход RLS, иначе политика profiles зациклится на себе.

create function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

-- 3. Правила записи задачи -----------------------------------------------------------------------
-- security invoker (по умолчанию): current_user — роль запроса. Клиент PostgREST — authenticated/anon,
-- RPC change_task_status — владелец функции (postgres), поэтому статус меняется только через RPC.

create function public.tasks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client           boolean := current_user in ('authenticated', 'anon');
  v_assignee_changed boolean;
begin
  if tg_op = 'INSERT' then
    new.status := 'new';
    new.created_at := now();
    if v_client then
      new.author_id := auth.uid();
    end if;
    v_assignee_changed := true;
  else
    if old.status = 'accepted' then
      raise exception 'Принятую задачу изменить нельзя';
    end if;
    if v_client and new.status is distinct from old.status then
      raise exception 'Статус задачи меняется только действием (change_task_status)' using errcode = '42501';
    end if;
    if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
      raise exception 'Автора и дату создания задачи изменить нельзя';
    end if;
    v_assignee_changed := new.assignee_id is distinct from old.assignee_id;
    if v_assignee_changed and old.status not in ('new', 'rework') then
      raise exception 'Исполнителя можно сменить только в статусах «Новая» и «На доработке»';
    end if;
  end if;

  if v_assignee_changed and not exists (
    select 1 from public.profiles p where p.id = new.assignee_id and p.role = 'executor'
  ) then
    raise exception 'Исполнителем можно назначить только пользователя с ролью «Исполнитель»';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_guard
  before insert or update on public.tasks
  for each row execute function public.tasks_guard();

-- Запись «— → Новая» при создании. security definer: у клиентов нет права insert в task_history.
create function public.tasks_history_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_history (task_id, actor_id, from_status, to_status)
  values (new.id, new.author_id, null, new.status);
  return null;
end;
$$;

create trigger tasks_history_on_insert
  after insert on public.tasks
  for each row execute function public.tasks_history_on_insert();

-- 4. Смена статуса -------------------------------------------------------------------------------

create function public.change_task_status(
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
  v_comment text := nullif(btrim(p_comment), '');
  v_task    public.tasks;
  v_from    public.task_status;
begin
  if v_role is null then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  -- for update: параллельный повтор ждёт и видит уже новый статус — двух записей истории не будет.
  select * into v_task from public.tasks t where t.id = p_task_id for update;
  if not found or (v_role = 'executor' and v_task.assignee_id <> v_uid) then
    raise exception 'Задача не найдена' using errcode = 'P0002';
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

-- 5. Права ---------------------------------------------------------------------------------------
-- Default ACL проекта выдаёт anon и authenticated все права на новые таблицы и функции — отзываем явно.

revoke all on public.profiles, public.objects, public.tasks, public.task_history from anon;
revoke insert, update, delete on public.profiles, public.task_history from authenticated;
revoke truncate, references, trigger on public.profiles, public.objects, public.tasks, public.task_history from authenticated;

revoke execute on function public.current_role_name() from public, anon;
revoke execute on function public.change_task_status(uuid, public.task_status, text) from public, anon;
revoke execute on function public.tasks_guard(), public.tasks_history_on_insert() from public, anon, authenticated;
grant execute on function public.current_role_name() to authenticated;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;

-- 6. RLS -----------------------------------------------------------------------------------------
-- (select …) — значение считается один раз на запрос, а не на каждую строку.

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

-- Профили видит любой пользователь с профилем; без профиля — ничего. Записи нет ни у кого из клиентов.
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select public.current_role_name()) is not null);

create policy objects_select on public.objects
  for select to authenticated
  using (
    (select public.current_role_name()) = 'manager'
    or exists (
      select 1 from public.tasks t
      where t.object_id = objects.id and t.assignee_id = (select auth.uid())
    )
  );

create policy objects_insert on public.objects
  for insert to authenticated
  with check ((select public.current_role_name()) = 'manager');

create policy objects_update on public.objects
  for update to authenticated
  using ((select public.current_role_name()) = 'manager')
  with check ((select public.current_role_name()) = 'manager');

-- Объект с задачами не удалится: tasks.object_id on delete restrict.
create policy objects_delete on public.objects
  for delete to authenticated
  using ((select public.current_role_name()) = 'manager');

create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (select public.current_role_name()) = 'manager'
    or assignee_id = (select auth.uid())
  );

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check ((select public.current_role_name()) = 'manager');

create policy tasks_update on public.tasks
  for update to authenticated
  using ((select public.current_role_name()) = 'manager')
  with check ((select public.current_role_name()) = 'manager');

create policy tasks_delete on public.tasks
  for delete to authenticated
  using ((select public.current_role_name()) = 'manager' and status = 'new');

create policy task_history_select on public.task_history
  for select to authenticated
  using (
    (select public.current_role_name()) = 'manager'
    or exists (
      select 1 from public.tasks t
      where t.id = task_history.task_id and t.assignee_id = (select auth.uid())
    )
  );
