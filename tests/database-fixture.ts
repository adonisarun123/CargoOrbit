import {readFile,readdir} from 'node:fs/promises';
import type {PGlite} from '@electric-sql/pglite';
export async function applyFixtureMigrations(database:PGlite){const root=new URL('../packages/database/src/',import.meta.url);for(const file of (await readdir(root)).filter(name=>/^\d{3}_[a-zA-Z0-9_-]+\.sql$/.test(name)).sort())await database.exec(await readFile(new URL(file,root),'utf8'));}
