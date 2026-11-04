// Тонкий HTTP-клиент Supabase на fetch: REST, RPC, Auth, admin и SQL через Management API.
// Запросы сырые, без supabase-js: проверка безопасности видит ровно то, что уходит в API.
// Ключи и токены не попадают в вывод: describe() берёт из ответа только код и текст ошибки.

export function describe(res) {
  const data = res.data;
  const message = data && typeof data === 'object'
    ? data.message ?? data.msg ?? data.error_description ?? data.error ?? ''
    : '';
  const code = data && typeof data === 'object' ? data.error_code ?? data.code ?? '' : '';
  return [`HTTP ${res.status}`, code, message].filter(Boolean).join(' ');
}

export function createClient(env) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const anon = { label: 'anon', apikey: env.SUPABASE_ANON_KEY, token: env.SUPABASE_ANON_KEY };
  const service = { label: 'service_role', apikey: env.SUPABASE_SERVICE_ROLE_KEY, token: env.SUPABASE_SERVICE_ROLE_KEY };
  const user = (label, token) => ({ label, apikey: env.SUPABASE_ANON_KEY, token });

  async function call(path, { who = anon, method = 'GET', body, prefer } = {}) {
    const headers = { apikey: who.apikey, Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: res.status, ok: res.ok, data };
  }

  // PostgREST: path — «таблица?фильтры». Запись всегда с return=representation, чтобы видеть затронутые строки;
  // extraPrefer — например resolution=merge-duplicates для upsert.
  function rest(who, method, path, body, extraPrefer) {
    const prefer = method === 'GET' ? undefined : ['return=representation', extraPrefer].filter(Boolean).join(',');
    return call(`/rest/v1/${path}`, { who, method, body, prefer });
  }

  function rpc(who, fn, args) {
    return call(`/rest/v1/rpc/${fn}`, { who, method: 'POST', body: args });
  }

  async function listUsers() {
    const res = await call('/auth/v1/admin/users?page=1&per_page=1000', { who: service });
    if (!res.ok) throw new Error(`Список пользователей: ${describe(res)}`);
    return res.data.users;
  }

  async function findUser(email) {
    return (await listUsers()).find((u) => u.email === email) ?? null;
  }

  async function createUser(email, password) {
    const res = await call('/auth/v1/admin/users', {
      who: service, method: 'POST', body: { email, password, email_confirm: true },
    });
    if (!res.ok) throw new Error(`Создание ${email}: ${describe(res)}`);
    return res.data;
  }

  async function setPassword(id, password) {
    const res = await call(`/auth/v1/admin/users/${id}`, { who: service, method: 'PUT', body: { password } });
    if (!res.ok) throw new Error(`Пароль ${id}: ${describe(res)}`);
  }

  async function deleteUser(id) {
    const res = await call(`/auth/v1/admin/users/${id}`, { who: service, method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`Удаление пользователя ${id}: ${describe(res)}`);
  }

  // Сессия существующего пользователя без пароля: admin magiclink → verify. Письмо не отправляется.
  async function sessionFor(email) {
    const link = await call('/auth/v1/admin/generate_link', {
      who: service, method: 'POST', body: { type: 'magiclink', email },
    });
    if (!link.ok || !link.data?.hashed_token) throw new Error(`Ссылка входа ${email}: ${describe(link)}`);
    const verified = await call('/auth/v1/verify', {
      method: 'POST', body: { type: 'magiclink', token_hash: link.data.hashed_token },
    });
    if (!verified.ok || !verified.data?.access_token) throw new Error(`Вход ${email}: ${describe(verified)}`);
    return verified.data.access_token;
  }

  async function signInWithPassword(email, password) {
    const res = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    if (!res.ok || !res.data?.access_token) throw new Error(`Вход по паролю ${email}: ${describe(res)}`);
    return res.data.access_token;
  }

  function signup(body) {
    return call('/auth/v1/signup', { method: 'POST', body });
  }

  return {
    anon, service, user, rest, rpc,
    listUsers, findUser, createUser, setPassword, deleteUser, sessionFor, signInWithPassword, signup,
  };
}

// SQL от имени postgres через Management API. Несколько операторов одного запроса — одна транзакция.
export function createManagementSql(env) {
  const url = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`;
  return async function sql(query) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text;
      try {
        message = JSON.parse(text).message ?? text;
      } catch {
        // текст ответа как есть
      }
      throw new Error(`Management API HTTP ${res.status}: ${message}`);
    }
    return text ? JSON.parse(text) : [];
  };
}

// Строковый литерал SQL (standard_conforming_strings=on: экранируются только кавычки).
export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
