import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {describe,it,expect} from 'vitest';
const require=createRequire(import.meta.url),tsx=require.resolve('tsx');

describe('operator command entrypoints',()=>{
 it.each([
  ['provision-runtime.ts','Set MIGRATION_DATABASE_URL and a RUNTIME_DATABASE_PASSWORD'],
  ['provision-account.ts','Set ACCOUNT_EMAIL, ACCOUNT_NAME, ACCOUNT_PASSWORD'],
  ['seed.ts','Set SEED_PASSWORD to at least 12 characters'],
 ])('%s reaches configuration validation without credentials', (file,expected)=>{
  const cwd=mkdtempSync(join(tmpdir(),'cargoorbit-operator-smoke-'));
  try{
   // An isolated working directory and explicit environment prevent dotenv or inherited credentials
   // from turning this parser/entrypoint regression test into a database provisioning operation.
   const result=spawnSync(process.execPath,['--import',tsx,fileURLToPath(new URL(`../scripts/${file}`,import.meta.url))],{
    cwd,env:{PATH:process.env.PATH,NODE_ENV:'test',DOTENV_CONFIG_PATH:join(cwd,'absent.env')},encoding:'utf8',timeout:10000,maxBuffer:256*1024,
   });
   expect(result.error).toBeUndefined();
   expect(result.status).toBe(1);
   expect(result.stderr).toContain(expected);
   expect(result.stderr).not.toMatch(/Top-level await|TransformError|ERR_MODULE_NOT_FOUND|Cannot find module/);
  }finally{rmSync(cwd,{recursive:true,force:true});}
 });
});
