// Тестовые данные: 1 постановщик, 2 исполнителя, 3 объекта, задачи во всех статусах с настоящей историей.
// Пользователи и профили — через service_role. Объекты и задачи создаёт постановщик через REST,
// статусы проводятся через RPC change_task_status под токенами тех, кому переход разрешён.
// Идемпотентно: существующие пользователи, объекты (по названию) и задачи (по объекту и названию) не дублируются.
// Пароли: новому пользователю — сгенерированный; существующему не меняется; --reset-passwords — новые всем.
// Пароли печатаются только в конце, одной таблицей, и больше нигде не сохраняются.
import { randomBytes } from 'node:crypto';
import { loadEnv } from './lib/env.mjs';
import { createClient, describe } from './lib/supabase.mjs';
import { OBJECTS, TASKS, USERS, targetStatus } from './lib/fixtures.mjs';

const env = loadEnv(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
const sb = createClient(env);
const resetPasswords = process.argv.includes('--reset-passwords');
const ROLE_LABEL = { manager: 'постановщик', executor: 'исполнитель' };

function must(res, what) {
  if (!res.ok) throw new Error(`${what}: ${describe(res)}`);
  return res.data;
}

async function seedUsers(access) {
  const existing = await sb.listUsers();
  const users = {};
  for (const u of USERS) {
    let found = existing.find((e) => e.email === u.email);
    let password = null;
    if (!found) {
      password = randomBytes(12).toString('base64url');
      found = await sb.createUser(u.email, password);
    } else if (resetPasswords) {
      password = randomBytes(12).toString('base64url');
      await sb.setPassword(found.id, password);
    }
    access.push({ ...u, password });
    users[u.key] = { ...u, id: found.id, password };
  }

  must(await sb.rest(sb.service, 'POST', 'profiles?on_conflict=id',
    USERS.map((u) => ({ id: users[u.key].id, full_name: u.fullName, role: u.role })),
    'resolution=merge-duplicates'), 'Профили');

  // Новый пароль проверяется настоящим входом; без нового пароля — сессия через admin magiclink.
  for (const u of Object.values(users)) {
    const token = u.password ? await sb.signInWithPassword(u.email, u.password) : await sb.sessionFor(u.email);
    u.who = sb.user(u.key, token);
  }
  return users;
}

async function seedObjects(manager) {
  const existing = must(await sb.rest(sb.service, 'GET', 'objects?select=id,name'), 'Объекты');
  const ids = {};
  let created = 0;
  for (const o of OBJECTS) {
    let row = existing.find((e) => e.name === o.name);
    if (!row) {
      [row] = must(await sb.rest(manager.who, 'POST', 'objects', { name: o.name, address: o.address }), `Объект «${o.name}»`);
      created += 1;
    }
    ids[o.key] = row.id;
  }
  return { ids, created };
}

async function seedTasks(users, objectIds) {
  const existing = must(await sb.rest(sb.service, 'GET', 'tasks?select=id,title,object_id,status'), 'Задачи');
  let created = 0;
  for (const t of TASKS) {
    const objectId = objectIds[t.object];
    const target = targetStatus(t);
    const row = existing.find((e) => e.object_id === objectId && e.title === t.title);
    if (row) {
      if (row.status !== target) {
        console.log(`ВНИМАНИЕ: «${t.title}» в статусе ${row.status}, по сиду ${target} — не трогаю`);
      }
      continue;
    }
    const [task] = must(await sb.rest(users.manager.who, 'POST', 'tasks', {
      title: t.title, description: t.description, object_id: objectId, assignee_id: users[t.assignee].id,
    }), `Задача «${t.title}»`);
    for (const [to, actor, comment] of t.path) {
      must(await sb.rpc(users[actor].who, 'change_task_status', {
        p_task_id: task.id, p_to: to, p_comment: comment ?? null,
      }), `«${t.title}» → ${to}`);
    }
    created += 1;
  }
  return created;
}

function printAccess(access) {
  const rows = access.map((a) => [a.email, ROLE_LABEL[a.role], a.fullName, a.password ?? '(не менялся; --reset-passwords выдаст новый)']);
  const head = ['email', 'роль', 'имя', 'пароль'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  console.log('\nТестовые доступы:');
  console.log(line(head));
  for (const r of rows) console.log(line(r));
}

async function main() {
  const access = [];
  try {
    const users = await seedUsers(access);
    const objects = await seedObjects(users.manager);
    const tasksCreated = await seedTasks(users, objects.ids);
    const statuses = must(await sb.rest(sb.service, 'GET', 'tasks?select=status'), 'Итог');
    const byStatus = {};
    for (const { status } of statuses) byStatus[status] = (byStatus[status] ?? 0) + 1;
    console.log(`Объекты: создано ${objects.created}, всего по сиду ${OBJECTS.length}`);
    console.log(`Задачи: создано ${tasksCreated}, всего по сиду ${TASKS.length}`);
    console.log(`Задачи в базе по статусам: ${Object.entries(byStatus).map(([s, n]) => `${s}=${n}`).join(', ')}`);
  } finally {
    if (access.length > 0) printAccess(access);
  }
}

main().catch((error) => {
  console.error(`Ошибка seed: ${error.message}`);
  process.exitCode = 1;
});
