// Применяет миграции supabase/migrations/*.sql к облачному проекту через Supabase Management API.
// Учёт — supabase_migrations.schema_migrations (та же таблица, что у Supabase CLI).
// Файл и запись в журнал уходят одним запросом: несколько операторов одного запроса — одна транзакция,
// поэтому миграция применяется целиком или не применяется вовсе. Применённые файлы пропускаются.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/env.mjs';
import { createManagementSql, sqlLiteral } from './lib/supabase.mjs';

const MIGRATIONS_DIR = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
const FILE_NAME = /^(\d{14})_(.+)\.sql$/;

async function main() {
  const sql = createManagementSql(loadEnv(['SUPABASE_PROJECT_REF', 'SUPABASE_ACCESS_TOKEN']));

  await sql(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key, statements text[], name text
    );`);
  const applied = new Map(
    (await sql('select version, statements from supabase_migrations.schema_migrations'))
      .map((row) => [row.version, row.statements]),
  );

  const files = readdirSync(MIGRATIONS_DIR).filter((file) => FILE_NAME.test(file)).sort();
  let appliedNow = 0;
  for (const file of files) {
    const [, version, name] = file.match(FILE_NAME);
    const content = readFileSync(MIGRATIONS_DIR + file, 'utf8').replaceAll('\r\n', '\n');
    if (applied.has(version)) {
      const statements = applied.get(version);
      const drift = statements?.length === 1 && statements[0] !== content;
      console.log(`skip     ${file}${drift ? ' — ВНИМАНИЕ: файл изменён после применения, новую правку оформите новой миграцией' : ''}`);
      continue;
    }
    await sql(`${content}
;
insert into supabase_migrations.schema_migrations (version, name, statements)
values (${sqlLiteral(version)}, ${sqlLiteral(name)}, array[${sqlLiteral(content)}]);`);
    console.log(`applied  ${file}`);
    appliedNow += 1;
  }

  if (appliedNow > 0) await sql(`notify pgrst, 'reload schema'`);
  console.log(`Готово: применено ${appliedNow}, всего миграций ${files.length}`);
}

main().catch((error) => {
  console.error(`Ошибка миграции: ${error.message}`);
  process.exitCode = 1;
});
