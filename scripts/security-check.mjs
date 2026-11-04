// Проверка безопасности: прямые HTTP-запросы к REST/RPC/Auth Supabase в обход интерфейса —
// под anon, под каждым тестовым пользователем и под пользователем без профиля.
// Каждое правило ТЗ (раздел 3) и решение владельца — отдельная строка PASS/FAIL; код выхода 1 при любом FAIL.
// Негативная проверка: предусловие через service_role → атака → повторное чтение через service_role
// (RLS отвечает на запрещённый UPDATE/DELETE кодом 2xx и пустым списком, поэтому судим по данным, а не по коду).
// Меняются только свои фикстуры (префикс [security-check]) и временный пользователь; они чистятся в начале и в конце.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/env.mjs';
import { createClient, describe } from './lib/supabase.mjs';
import { EXECUTORS, USERS } from './lib/fixtures.mjs';

const env = loadEnv(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
const sb = createClient(env);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PREFIX = '[security-check]';
const NO_PROFILE_EMAIL = 'sec-noprofile@example.com';
const TABLES = ['profiles', 'objects', 'tasks', 'task_history'];

// ---------- протокол ----------

const results = [];
const pass = (detail = '') => ({ pass: true, detail });
const fail = (detail) => ({ pass: false, detail });

async function check(name, fn) {
  let outcome;
  try {
    outcome = await fn();
  } catch (error) {
    outcome = fail(error.message);
  }
  results.push({ name, ...outcome });
  console.log(`${outcome.pass ? 'PASS' : 'FAIL'}  ${name}${outcome.detail ? ` — ${outcome.detail}` : ''}`);
}

// ---------- чтение через service_role (обходит RLS) ----------

async function svc(path) {
  const res = await sb.rest(sb.service, 'GET', path);
  if (!res.ok) throw new Error(`предусловие: service_role ${path.split('?')[0]}: ${describe(res)}`);
  return res.data;
}

const rowOf = async (table, id) => (await svc(`${table}?id=eq.${id}&select=*`))[0] ?? null;

const historyOf = (taskId) =>
  svc(`task_history?task_id=eq.${taskId}&select=id,actor_id,from_status,to_status,comment,created_at&order=id`);

async function existing(table, id) {
  const row = await rowOf(table, id);
  if (!row) throw new Error(`предусловие: нет строки ${table} ${id}`);
  return row;
}

const sameIds = (rows, expected) => {
  const a = new Set(rows.map((r) => r.id));
  const b = new Set(expected);
  return a.size === b.size && [...a].every((id) => b.has(id));
};

// ---------- контекст: пользователи seed и их сессии ----------

let contextPromise;
function context() {
  contextPromise ??= (async () => {
    const all = await sb.listUsers();
    const users = {};
    for (const u of USERS) {
      const found = all.find((a) => a.email === u.email);
      if (!found) throw new Error(`предусловие: нет пользователя ${u.email} — запустите npm run db:seed`);
      users[u.key] = { ...u, id: found.id, who: sb.user(u.key, await sb.sessionFor(u.email)) };
    }
    return users;
  })();
  return contextPromise;
}

let noProfilePromise;
function noProfileUser() {
  noProfilePromise ??= (async () => {
    await sb.createUser(NO_PROFILE_EMAIL, randomBytes(18).toString('base64url'));
    return sb.user('без профиля', await sb.sessionFor(NO_PROFILE_EMAIL));
  })();
  return noProfilePromise;
}

const fx = {};
function need(key) {
  if (!fx[key]) throw new Error(`предусловие: нет фикстуры ${key}`);
  return fx[key];
}

async function cleanup() {
  const like = encodeURIComponent(`${PREFIX}*`);
  for (const [table, column] of [['tasks', 'title'], ['objects', 'name']]) {
    const res = await sb.rest(sb.service, 'DELETE', `${table}?${column}=like.${like}`);
    if (!res.ok) console.log(`очистка ${table}: ${describe(res)}`);
  }
  const temp = await sb.findUser(NO_PROFILE_EMAIL);
  if (temp) await sb.deleteUser(temp.id);
}

// ---------- ожидания ----------

const deniedDetail = (res) => (res.ok ? `HTTP ${res.status}, 0 строк` : describe(res));

async function expectReadEmpty(who, path) {
  const res = await sb.rest(who, 'GET', path);
  if (!res.ok || (Array.isArray(res.data) && res.data.length === 0)) return pass(deniedDetail(res));
  return fail(`прочитано строк: ${Array.isArray(res.data) ? res.data.length : '?'}`);
}

async function expectPatchBlocked(who, table, id, patch) {
  const before = await existing(table, id);
  for (const [key, value] of Object.entries(patch)) {
    if (before[key] === value) throw new Error(`предусловие: ${key} уже равно ${value}`);
  }
  const res = await sb.rest(who, 'PATCH', `${table}?id=eq.${id}`, patch);
  const after = await existing(table, id);
  const changed = Object.keys(patch).filter((key) => after[key] !== before[key]);
  if (changed.length > 0) return fail(`изменилось: ${changed.join(', ')} (${describe(res)})`);
  return pass(deniedDetail(res));
}

async function expectPatchOk(who, table, id, patch) {
  const res = await sb.rest(who, 'PATCH', `${table}?id=eq.${id}`, patch);
  if (!res.ok) return fail(describe(res));
  const after = await existing(table, id);
  const wrong = Object.entries(patch).filter(([key, value]) => after[key] !== value).map(([key]) => key);
  return wrong.length > 0 ? fail(`не изменилось: ${wrong.join(', ')}`) : pass(`HTTP ${res.status}`);
}

async function expectDeleteBlocked(who, table, id) {
  await existing(table, id);
  const res = await sb.rest(who, 'DELETE', `${table}?id=eq.${id}`);
  return (await rowOf(table, id)) ? pass(deniedDetail(res)) : fail(`строка удалена (${describe(res)})`);
}

async function expectInsertBlocked(who, table, row, column) {
  const res = await sb.rest(who, 'POST', table, row);
  const created = await svc(`${table}?${column}=eq.${encodeURIComponent(row[column])}&select=id`);
  return created.length === 0 ? pass(deniedDetail(res)) : fail(`строка создана (${describe(res)})`);
}

async function expectRpcDenied(who, taskId, to, comment = null) {
  const before = await existing('tasks', taskId);
  const historyBefore = (await historyOf(taskId)).length;
  const res = await sb.rpc(who, 'change_task_status', { p_task_id: taskId, p_to: to, p_comment: comment });
  const after = await existing('tasks', taskId);
  const historyAfter = (await historyOf(taskId)).length;
  if (res.ok) return fail(`RPC выполнен: ${before.status} → ${after.status}`);
  if (after.status !== before.status) return fail(`статус изменился: ${before.status} → ${after.status}`);
  if (historyAfter !== historyBefore) return fail(`история изменилась: ${historyBefore} → ${historyAfter}`);
  if (res.status >= 500) return fail(`отказ отдан как ошибка сервера: ${describe(res)}`);
  return pass(describe(res));
}

async function expectRpcOk(actor, taskId, to, comment = null, storedComment = null) {
  const before = await existing('tasks', taskId);
  const historyBefore = (await historyOf(taskId)).length;
  const res = await sb.rpc(actor.who, 'change_task_status', { p_task_id: taskId, p_to: to, p_comment: comment });
  if (!res.ok) return fail(describe(res));
  const after = await existing('tasks', taskId);
  const history = await historyOf(taskId);
  const last = history.at(-1);
  if (after.status !== to) return fail(`статус ${after.status}, ожидался ${to}`);
  if (history.length !== historyBefore + 1) return fail(`записей истории +${history.length - historyBefore}, ожидалось +1`);
  if (last.actor_id !== actor.id || last.from_status !== before.status || last.to_status !== to) {
    return fail(`запись истории неверна: ${JSON.stringify(last)}`);
  }
  if (last.comment !== storedComment) return fail(`комментарий в истории: ${JSON.stringify(last.comment)}`);
  return pass(`${before.status} → ${to}, история +1`);
}

// ---------- проверки ----------

async function authChecks() {
  await check('Регистрация по email и паролю закрыта', async () => {
    const email = `sec-signup-${randomBytes(4).toString('hex')}@example.com`;
    const res = await sb.signup({ email, password: randomBytes(12).toString('base64url') });
    if (res.ok) {
      const created = await sb.findUser(email);
      if (created) await sb.deleteUser(created.id);
      return fail(`регистрация прошла: HTTP ${res.status}`);
    }
    return pass(describe(res));
  });

  await check('Анонимный вход закрыт', async () => {
    const res = await sb.signup({});
    if (res.ok) {
      if (res.data?.user?.id) await sb.deleteUser(res.data.user.id);
      return fail(`анонимная сессия выдана: HTTP ${res.status}`);
    }
    return pass(describe(res));
  });
}

// Файлы, которые попадут в репозиторий (отслеживаемые и неигнорируемые новые), и сборка фронта, если есть.
function repoFiles() {
  const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0').filter(Boolean).map((file) => join(ROOT, file));
  const walk = (dir) => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const dist = join(ROOT, 'web', 'dist');
  return [...listed, ...(existsSync(dist) ? walk(dist) : [])].filter((file) => existsSync(file));
}

// Роль ключа Supabase: legacy JWT — из payload, новые ключи — по префиксу.
function keyRole(key) {
  if (key.startsWith('sb_publishable_')) return 'anon';
  if (key.startsWith('sb_secret_')) return 'service_role';
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

async function secretChecks() {
  await check('Секретные ключи не лежат в файлах репозитория и сборке фронта', async () => {
    const names = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN'];
    const missing = names.filter((name) => !process.env[name]);
    if (missing.length > 0) throw new Error(`предусловие: нет ${missing.join(', ')} в окружении — нечего искать`);
    const files = repoFiles();
    if (files.length === 0) throw new Error('предусловие: не найдено ни одного файла репозитория');
    const hits = [];
    for (const file of files) {
      const content = readFileSync(file).toString('latin1');
      for (const name of names) {
        if (content.includes(process.env[name])) hits.push(`${name} в ${relative(ROOT, file)}`);
      }
    }
    return hits.length > 0 ? fail(hits.join('; ')) : pass(`${files.length} файлов, искомых ключей: ${names.length}`);
  });

  await check('Ключ для фронта — anon, не service_role', async () => {
    const names = ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'].filter((name) => process.env[name]);
    const wrong = names.filter((name) => keyRole(process.env[name]) !== 'anon');
    return wrong.length > 0 ? fail(`роль ключа не anon: ${wrong.join(', ')}`) : pass(`проверено: ${names.join(', ')}`);
  });
}

async function fixtureChecks() {
  await check('Создание задачи: статус «Новая», автор и дата задаются базой, история «— → Новая»', async () => {
    const users = await context();
    const manager = users.manager;
    const object = await sb.rest(manager.who, 'POST', 'objects', { name: `${PREFIX} объект`, address: `${PREFIX} адрес` });
    if (!object.ok) return fail(`объект: ${describe(object)}`);
    fx.object = object.data[0].id;

    const forged = await sb.rest(manager.who, 'POST', 'tasks', {
      title: `${PREFIX} задача A`, object_id: fx.object, assignee_id: users.executor1.id,
      status: 'accepted', author_id: users.executor1.id, created_at: '2000-01-01T00:00:00Z',
    });
    if (!forged.ok) return fail(`задача A: ${describe(forged)}`);
    fx.taskA = forged.data[0].id;

    const plain = await sb.rest(manager.who, 'POST', 'tasks', {
      title: `${PREFIX} задача B`, object_id: fx.object, assignee_id: users.executor2.id,
    });
    if (!plain.ok) return fail(`задача B: ${describe(plain)}`);
    fx.taskB = plain.data[0].id;

    const row = await existing('tasks', fx.taskA);
    const history = await historyOf(fx.taskA);
    const problems = [];
    if (row.status !== 'new') problems.push(`status=${row.status}`);
    if (row.author_id !== manager.id) problems.push('author_id подменён');
    if (row.created_at.startsWith('2000')) problems.push('created_at подменён');
    const first = history[0];
    if (history.length !== 1 || first.from_status !== null || first.to_status !== 'new' || first.actor_id !== manager.id) {
      problems.push(`история: ${JSON.stringify(history)}`);
    }
    return problems.length > 0 ? fail(problems.join('; ')) : pass('подделанные status/author/created_at проигнорированы');
  });
}

async function anonChecks() {
  for (const table of TABLES) {
    await check(`anon не читает ${table}`, async () => {
      if ((await svc(`${table}?select=*&limit=1`)).length === 0) throw new Error(`предусловие: в ${table} нет строк`);
      return expectReadEmpty(sb.anon, `${table}?select=*`);
    });
  }
  await check('anon не создаёт объект', () =>
    expectInsertBlocked(sb.anon, 'objects', { name: `${PREFIX} от anon`, address: 'x' }, 'name'));
  await check('anon не меняет статус через RPC', () => expectRpcDenied(sb.anon, need('taskA'), 'in_progress'));
}

async function noProfileChecks() {
  for (const table of TABLES) {
    await check(`Пользователь без профиля не читает ${table}`, async () => {
      if ((await svc(`${table}?select=*&limit=1`)).length === 0) throw new Error(`предусловие: в ${table} нет строк`);
      return expectReadEmpty(await noProfileUser(), `${table}?select=*`);
    });
  }
  await check('Пользователь без профиля не меняет статус через RPC', async () =>
    expectRpcDenied(await noProfileUser(), need('taskA'), 'in_progress'));
}

async function visibilityChecks() {
  for (const table of TABLES) {
    await check(`Постановщик видит все строки ${table}`, async () => {
      const users = await context();
      const all = await svc(`${table}?select=id`);
      const res = await sb.rest(users.manager.who, 'GET', `${table}?select=id`);
      if (!res.ok) return fail(describe(res));
      return sameIds(res.data, all.map((r) => r.id)) ? pass(`${all.length} строк`) : fail(`видно ${res.data.length} из ${all.length}`);
    });
  }

  for (const executor of EXECUTORS) {
    const ownTasks = async (me) => {
      const rows = await svc(`tasks?assignee_id=eq.${me.id}&select=id,object_id`);
      if (rows.length === 0) throw new Error('предусловие: у исполнителя нет задач');
      return rows;
    };
    const foreignTask = async (me) => {
      const [row] = await svc(`tasks?assignee_id=neq.${me.id}&select=id&limit=1`);
      if (!row) throw new Error('предусловие: нет чужой задачи');
      return row.id;
    };
    const hiddenObjects = async (me) => {
      const visible = new Set((await ownTasks(me)).map((t) => t.object_id));
      const hidden = (await svc('objects?select=id')).map((o) => o.id).filter((id) => !visible.has(id));
      if (hidden.length === 0) throw new Error('предусловие: нет объекта без задач исполнителя');
      return { visible, hidden };
    };

    await check(`${executor.key}: видит ровно свои задачи`, async () => {
      const me = (await context())[executor.key];
      const own = await ownTasks(me);
      const res = await sb.rest(me.who, 'GET', 'tasks?select=id');
      if (!res.ok) return fail(describe(res));
      return sameIds(res.data, own.map((t) => t.id)) ? pass(`${own.length} задач`) : fail(`видно ${res.data.length}, своих ${own.length}`);
    });

    await check(`${executor.key}: видит ровно объекты, где есть его задачи`, async () => {
      const me = (await context())[executor.key];
      const { visible, hidden } = await hiddenObjects(me);
      const res = await sb.rest(me.who, 'GET', 'objects?select=id');
      if (!res.ok) return fail(describe(res));
      return sameIds(res.data, [...visible])
        ? pass(`${visible.size} объектов, скрыто ${hidden.length}`)
        : fail(`видно ${res.data.length}, ожидалось ${visible.size}`);
    });

    await check(`${executor.key}: видит историю только своих задач`, async () => {
      const me = (await context())[executor.key];
      const ids = (await ownTasks(me)).map((t) => t.id);
      const expected = await svc(`task_history?task_id=in.(${ids.join(',')})&select=id`);
      const res = await sb.rest(me.who, 'GET', 'task_history?select=id');
      if (!res.ok) return fail(describe(res));
      return sameIds(res.data, expected.map((r) => r.id)) ? pass(`${expected.length} записей`) : fail(`видно ${res.data.length}, ожидалось ${expected.length}`);
    });

    await check(`${executor.key}: не читает чужую задачу по id`, async () => {
      const me = (await context())[executor.key];
      return expectReadEmpty(me.who, `tasks?id=eq.${await foreignTask(me)}&select=*`);
    });

    await check(`${executor.key}: не читает историю чужой задачи`, async () => {
      const me = (await context())[executor.key];
      return expectReadEmpty(me.who, `task_history?task_id=eq.${await foreignTask(me)}&select=*`);
    });

    await check(`${executor.key}: не читает объект без своих задач по id`, async () => {
      const me = (await context())[executor.key];
      const { hidden } = await hiddenObjects(me);
      return expectReadEmpty(me.who, `objects?id=eq.${hidden[0]}&select=*`);
    });
  }
}

async function executorWriteChecks() {
  const ownFixture = { executor1: 'taskA', executor2: 'taskB' };
  for (const executor of EXECUTORS) {
    const other = EXECUTORS.find((e) => e.key !== executor.key);
    const me = async () => (await context())[executor.key];

    await check(`${executor.key}: не правит чужую задачу`, async () =>
      expectPatchBlocked((await me()).who, 'tasks', need(ownFixture[other.key]), { title: `${PREFIX} взлом ${executor.key}` }));
    await check(`${executor.key}: не правит свою задачу`, async () =>
      expectPatchBlocked((await me()).who, 'tasks', need(ownFixture[executor.key]), { title: `${PREFIX} взлом ${executor.key}`, description: 'взлом' }));
    await check(`${executor.key}: не меняет статус чужой задачи через RPC`, async () =>
      expectRpcDenied((await me()).who, need(ownFixture[other.key]), 'in_progress'));
    await check(`${executor.key}: не удаляет задачу`, async () =>
      expectDeleteBlocked((await me()).who, 'tasks', need(ownFixture[executor.key])));
    await check(`${executor.key}: не создаёт задачу`, async () => {
      const self = await me();
      return expectInsertBlocked(self.who, 'tasks', { title: `${PREFIX} от ${executor.key}`, object_id: need('object'), assignee_id: self.id }, 'title');
    });
    await check(`${executor.key}: не создаёт объект`, async () =>
      expectInsertBlocked((await me()).who, 'objects', { name: `${PREFIX} от ${executor.key}`, address: 'x' }, 'name'));
    await check(`${executor.key}: не правит объект`, async () =>
      expectPatchBlocked((await me()).who, 'objects', need('object'), { name: `${PREFIX} взлом ${executor.key}` }));
    await check(`${executor.key}: не удаляет объект`, async () =>
      expectDeleteBlocked((await me()).who, 'objects', need('object')));
    await check(`${executor.key}: не меняет себе роль`, async () => {
      const self = await me();
      const outcome = await expectPatchBlocked(self.who, 'profiles', self.id, { role: 'manager' });
      if (!outcome.pass) await sb.rest(sb.service, 'PATCH', `profiles?id=eq.${self.id}`, { role: 'executor' });
      return outcome;
    });
  }
}

async function lifecycleChecks() {
  const ctx = async () => {
    const users = await context();
    return { m: users.manager, e1: users.executor1, e2: users.executor2, id: need('taskA') };
  };

  await check('Смена исполнителя в «Новая» разрешена', async () => {
    const { m, e1, e2, id } = await ctx();
    const there = await expectPatchOk(m.who, 'tasks', id, { assignee_id: e2.id });
    if (!there.pass) return there;
    return expectPatchOk(m.who, 'tasks', id, { assignee_id: e1.id });
  });
  await check('Постановщик не берёт задачу в работу', async () => { const { m, id } = await ctx(); return expectRpcDenied(m.who, id, 'in_progress'); });
  await check('Чужой исполнитель не берёт задачу в работу', async () => { const { e2, id } = await ctx(); return expectRpcDenied(e2.who, id, 'in_progress'); });
  await check('Переход «Новая» → «На проверке» запрещён', async () => { const { e1, id } = await ctx(); return expectRpcDenied(e1.who, id, 'review'); });
  await check('Переход «Новая» → «Принята» запрещён', async () => { const { e1, id } = await ctx(); return expectRpcDenied(e1.who, id, 'accepted'); });
  await check('Прямой UPDATE status постановщиком запрещён', async () => { const { m, id } = await ctx(); return expectPatchBlocked(m.who, 'tasks', id, { status: 'in_progress' }); });
  await check('Прямой UPDATE status исполнителем запрещён', async () => { const { e1, id } = await ctx(); return expectPatchBlocked(e1.who, 'tasks', id, { status: 'in_progress' }); });
  await check('Исполнитель берёт задачу в работу', async () => { const { e1, id } = await ctx(); return expectRpcOk(e1, id, 'in_progress'); });
  await check('Смена исполнителя в «В работе» запрещена', async () => { const { m, e2, id } = await ctx(); return expectPatchBlocked(m.who, 'tasks', id, { assignee_id: e2.id }); });
  await check('Исполнитель не принимает задачу из «В работе»', async () => { const { e1, id } = await ctx(); return expectRpcDenied(e1.who, id, 'accepted'); });
  await check('Постановщик не принимает задачу из «В работе»', async () => { const { m, id } = await ctx(); return expectRpcDenied(m.who, id, 'accepted'); });
  await check('Исполнитель отправляет на проверку', async () => { const { e1, id } = await ctx(); return expectRpcOk(e1, id, 'review'); });
  await check('Смена исполнителя в «На проверке» запрещена', async () => { const { m, e2, id } = await ctx(); return expectPatchBlocked(m.who, 'tasks', id, { assignee_id: e2.id }); });
  await check('Исполнитель не принимает свою задачу', async () => { const { e1, id } = await ctx(); return expectRpcDenied(e1.who, id, 'accepted'); });
  await check('Исполнитель не возвращает задачу на доработку', async () => { const { e1, id } = await ctx(); return expectRpcDenied(e1.who, id, 'rework', 'сам себе'); });
  await check('Возврат на доработку без комментария запрещён', async () => { const { m, id } = await ctx(); return expectRpcDenied(m.who, id, 'rework', null); });
  const blankComments = [
    ['пробелов', '   '],
    ['табуляций и переводов строк', '\t\n\r\n'],
    ['неразрывных и нулевой ширины пробелов', ' ​ '],
  ];
  for (const [label, comment] of blankComments) {
    await check(`Возврат на доработку с комментарием из ${label} запрещён`, async () => {
      const { m, id } = await ctx();
      if ((await existing('tasks', id)).status !== 'review') throw new Error('предусловие: задача не в «На проверке»');
      return expectRpcDenied(m.who, id, 'rework', comment);
    });
  }
  await check('Постановщик правит задачу до «Принята»', async () => {
    const { m, id } = await ctx();
    return expectPatchOk(m.who, 'tasks', id, { title: `${PREFIX} задача A (правка)`, description: 'уточнено' });
  });
  await check('Возврат на доработку с комментарием пишет комментарий в историю', async () => {
    const { m, id } = await ctx();
    return expectRpcOk(m, id, 'rework', '\n  Нужны фото\t ', 'Нужны фото');
  });
  await check('Смена исполнителя в «На доработке» разрешена', async () => {
    const { m, e1, e2, id } = await ctx();
    const there = await expectPatchOk(m.who, 'tasks', id, { assignee_id: e2.id });
    if (!there.pass) return there;
    return expectPatchOk(m.who, 'tasks', id, { assignee_id: e1.id });
  });
  await check('Исполнитель берёт задачу после доработки', async () => { const { e1, id } = await ctx(); return expectRpcOk(e1, id, 'in_progress'); });
  await check('Исполнитель снова отправляет на проверку', async () => { const { e1, id } = await ctx(); return expectRpcOk(e1, id, 'review'); });
  await check('Постановщик принимает задачу', async () => { const { m, id } = await ctx(); return expectRpcOk(m, id, 'accepted'); });
  await check('Принятая задача не редактируется', async () => { const { m, id } = await ctx(); return expectPatchBlocked(m.who, 'tasks', id, { title: `${PREFIX} после приёмки` }); });
  await check('Из «Принята» нельзя вернуть на доработку', async () => { const { m, id } = await ctx(); return expectRpcDenied(m.who, id, 'rework', 'поздно'); });
  await check('Из «Принята» нельзя взять в работу', async () => { const { e1, id } = await ctx(); return expectRpcDenied(e1.who, id, 'in_progress'); });
  await check('Постановщик не удаляет задачу не в «Новая»', async () => { const { m, id } = await ctx(); return expectDeleteBlocked(m.who, 'tasks', id); });

  await check('История: каждая смена статуса записана — кто, когда, из, в, комментарий', async () => {
    const { m, e1, id } = await ctx();
    const expected = [
      [null, 'new', m.id, null], ['new', 'in_progress', e1.id, null], ['in_progress', 'review', e1.id, null],
      ['review', 'rework', m.id, 'Нужны фото'], ['rework', 'in_progress', e1.id, null],
      ['in_progress', 'review', e1.id, null], ['review', 'accepted', m.id, null],
    ];
    const actual = (await historyOf(id)).map((h) => [h.from_status, h.to_status, h.actor_id, h.comment]);
    const withTime = (await historyOf(id)).every((h) => h.created_at);
    return JSON.stringify(actual) === JSON.stringify(expected) && withTime
      ? pass(`${actual.length} записей`)
      : fail(`история: ${JSON.stringify(actual)}`);
  });
}

async function historyTamperChecks() {
  for (const key of ['manager', 'executor1']) {
    const ctx = async () => ({ user: (await context())[key], id: need('taskA') });
    const snapshot = async (id) => JSON.stringify(await historyOf(id));

    await check(`${key}: не вставляет запись истории`, async () => {
      const { user, id } = await ctx();
      const before = await snapshot(id);
      const res = await sb.rest(user.who, 'POST', 'task_history', {
        task_id: id, actor_id: user.id, from_status: 'review', to_status: 'accepted', comment: 'подделка',
      });
      return (await snapshot(id)) === before ? pass(deniedDetail(res)) : fail(`запись добавлена (${describe(res)})`);
    });
    await check(`${key}: не меняет запись истории`, async () => {
      const { user, id } = await ctx();
      const before = await snapshot(id);
      const res = await sb.rest(user.who, 'PATCH', `task_history?task_id=eq.${id}`, { comment: 'подделка', to_status: 'new' });
      return (await snapshot(id)) === before ? pass(deniedDetail(res)) : fail(`история изменена (${describe(res)})`);
    });
    await check(`${key}: не удаляет запись истории`, async () => {
      const { user, id } = await ctx();
      const before = await snapshot(id);
      const res = await sb.rest(user.who, 'DELETE', `task_history?task_id=eq.${id}`);
      return (await snapshot(id)) === before ? pass(deniedDetail(res)) : fail(`история удалена (${describe(res)})`);
    });
  }
}

async function managerRuleChecks() {
  await check('Задачу нельзя назначить постановщику', async () => {
    const users = await context();
    return expectInsertBlocked(users.manager.who, 'tasks', {
      title: `${PREFIX} на постановщика`, object_id: need('object'), assignee_id: users.manager.id,
    }, 'title');
  });
  await check('Объект с задачами не удаляется', async () =>
    expectDeleteBlocked((await context()).manager.who, 'objects', need('object')));
  await check('Постановщик удаляет объект без задач', async () => {
    const { manager } = await context();
    const created = await sb.rest(manager.who, 'POST', 'objects', { name: `${PREFIX} пустой объект`, address: 'x' });
    if (!created.ok) return fail(`создание: ${describe(created)}`);
    const id = created.data[0].id;
    const res = await sb.rest(manager.who, 'DELETE', `objects?id=eq.${id}`);
    return (await rowOf('objects', id)) ? fail(`объект остался (${describe(res)})`) : pass(`HTTP ${res.status}`);
  });
  await check('Постановщик удаляет задачу в «Новая»', async () => {
    const { manager } = await context();
    const id = need('taskB');
    if ((await existing('tasks', id)).status !== 'new') throw new Error('предусловие: задача B не в «Новая»');
    const res = await sb.rest(manager.who, 'DELETE', `tasks?id=eq.${id}`);
    return (await rowOf('tasks', id)) ? fail(`задача осталась (${describe(res)})`) : pass(`HTTP ${res.status}`);
  });
}

async function main() {
  await cleanup();
  try {
    await authChecks();
    await secretChecks();
    await fixtureChecks();
    await anonChecks();
    await noProfileChecks();
    await visibilityChecks();
    await executorWriteChecks();
    await lifecycleChecks();
    await historyTamperChecks();
    await managerRuleChecks();
  } finally {
    await cleanup();
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nИтого: ${results.length - failed}/${results.length} PASS`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
});
