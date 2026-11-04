// Переменные окружения скриптов: .env.local в корне репозитория (в .gitignore).
// Значения никогда не печатаются — только имена отсутствующих переменных.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV_FILE = fileURLToPath(new URL('../../.env.local', import.meta.url));

export function loadEnv(names) {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Нет переменных окружения: ${missing.join(', ')} — заполните .env.local в корне репозитория`);
  }
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}
