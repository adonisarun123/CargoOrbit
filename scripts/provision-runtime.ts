import 'dotenv/config';
import { Pool } from 'pg';
const url=process.env.MIGRATION_DATABASE_URL;
const password=process.env.RUNTIME_DATABASE_PASSWORD;
if(!url || !password || password.length<16) throw new Error('Set MIGRATION_DATABASE_URL and a RUNTIME_DATABASE_PASSWORD of at least 16 characters');
const pool=new Pool({connectionString:url});
try {
  // The role name is deliberately fixed. PostgreSQL role passwords do not accept bind parameters.
  // Server-side format(%L) quotes the secret; the SQL result is never printed.
  const {rows}=await pool.query('SELECT format(\'CREATE ROLE cargoorbit_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS\',$1)',[password]);
  const exists=await pool.query("SELECT 1 FROM pg_roles WHERE rolname='cargoorbit_runtime'");
  if(exists.rowCount) throw new Error('cargoorbit_runtime already exists; rotate its credential through your database operator');
  await pool.query(rows[0].format);
  await pool.query('GRANT cargoorbit_app TO cargoorbit_runtime');
  console.log('Created restricted runtime login. Configure DATABASE_URL with this login.');
} finally { await pool.end(); }
