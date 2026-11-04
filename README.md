# Мини-CRM «Объекты и задачи»

Постановщик заводит объекты (стройки) и ставит по ним задачи, исполнители берут задачи в работу
и отдают на проверку, постановщик принимает или возвращает на доработку с комментарием.
У каждой задачи — история смен статуса.

Стек: React + TypeScript (Vite, Tailwind, TanStack Query), Supabase (PostgreSQL, Auth, RLS, RPC).

- Приложение: https://mini-crm.62-83-8-181.sslip.io/
- Как устроено и защищено — для руководителя: [docs/for-manager.md](docs/for-manager.md)
- Решения и допущения: [docs/decisions.md](docs/decisions.md)
- База данных, переходы, защита, скрипты: [docs/db.md](docs/db.md)

## Структура

```
supabase/migrations/   схема, триггеры, RPC change_task_status, RLS-политики
scripts/               migrate (применить миграции), seed (тестовые данные), security-check
web/                   фронтенд (Vite + React + TypeScript)
deploy/                выкладка статики на сервер
```

## Запуск

Нужен Node 20.12+ и проект Supabase (подойдёт бесплатный).

1. **База.** В Supabase → Authentication → Sign In / Providers выключить «Allow new users to sign up».
   Скопировать `.env.example` в `.env.local` и заполнить. Затем в корне:
   ```
   npm run db:migrate     # применить миграции
   npm run db:seed        # 1 постановщик, 2 исполнителя, 3 объекта, задачи во всех статусах; пароли — в конце вывода
   npm run db:check       # проверка защиты в обход интерфейса: каждое правило — PASS/FAIL
   ```
   Миграции можно применить и вручную: выполнить файлы из `supabase/migrations/` по порядку в SQL Editor.
2. **Фронтенд.** В `web/` создать `.env.local` с `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`
   (только публичный anon-ключ), затем:
   ```
   cd web
   npm ci
   npm run dev            # http://localhost:5173
   npm test -- --run      # тесты логики доступных действий
   npm run build          # сборка в web/dist
   ```

Пользователей создаёт администратор: `npm run db:seed` или Supabase → Authentication → Add user,
затем строка в `public.profiles` (`id` пользователя, `full_name`, `role` = `manager` или `executor`).

## Безопасность коротко

- Права закрыты в базе (RLS), а не только в интерфейсе: исполнитель не видит и не меняет чужие задачи.
- Статус меняется только функцией базы `change_task_status` по таблице разрешённых переходов;
  прямой UPDATE статуса запрещён триггером.
- Историю пишет только база; у клиентов нет прав на запись в неё.
- Регистрация закрыта. Во фронтенде и в репозитории — только URL проекта и anon-ключ.
