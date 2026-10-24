import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error('MIGRATION_DATABASE_URL is required; keep the owner credential out of the API/worker');
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15000 });
const client = await pool.connect();
const directory = new URL('./', import.meta.url);
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='30s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('cargoorbit:migrations',0))");
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(id text PRIMARY KEY, checksum text, applied_at timestamptz NOT NULL DEFAULT now())');
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
  const files = (await readdir(fileURLToPath(directory))).filter(name=>/^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!files.length) throw new Error('No bundled SQL migrations were found');
  let changed = 0;
  for (const filename of files) {
    const id = filename.slice(0,-4), sql = await readFile(new URL(filename,directory),'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const applied = await client.query<{checksum:string|null}>('SELECT checksum FROM schema_migrations WHERE id=$1',[id]);
    if (applied.rowCount) {
      if (applied.rows[0]!.checksum && applied.rows[0]!.checksum !== checksum) throw new Error(`Migration ${id} differs from its recorded checksum; restore the original migration and add a new one`);
      // Upgrade the checksum-less baseline only. Never rerun its SQL silently.
      if (!applied.rows[0]!.checksum) await client.query('UPDATE schema_migrations SET checksum=$2 WHERE id=$1',[id,checksum]);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(id,checksum) VALUES($1,$2)',[id,checksum]);
    changed++;
    console.log(`Applied ${id}`);
  }
  await client.query('COMMIT');
  console.log(changed ? `Applied ${changed} migration(s)` : 'Database schema and migration checksums are current');
} catch(error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
