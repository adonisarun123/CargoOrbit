import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error('MIGRATION_DATABASE_URL is required; keep the owner credential out of the API/worker');
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('cargoorbit:migrations',0))");
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = await client.query('SELECT 1 FROM schema_migrations WHERE id=$1', ['001_initial']);
  if (!applied.rowCount) {
    const sql = await readFile(fileURLToPath(new URL('./001_initial.sql', import.meta.url)), 'utf8');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(id) VALUES($1)', ['001_initial']);
    console.log('Applied 001_initial');
  } else console.log('Database schema is current');
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
