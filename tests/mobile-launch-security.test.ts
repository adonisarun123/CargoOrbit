import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {patchPackage,manifest}=require('../apps/mobile/security/forge-mitigation.cjs');
describe('Pinned upstream node-forge mitigation (raw advisory remains visible)',()=>{
 it('reproduces the advisory on reviewed original source and rejects it after the exact guard, preserving normal crypto operations',()=>{const temp=mkdtempSync(join(tmpdir(),'cargoorbit-forge-'));try{const dir=join(temp,'node-forge');cpSync(dirname(require.resolve('node-forge/package.json')),dir,{recursive:true});const rsa=join(dir,'lib/rsa.js');let source=readFileSync(rsa,'utf8');if(source.includes(manifest.after))source=source.replace(manifest.after,manifest.before);writeFileSync(rsa,source);expect(()=>patchPackage(dir,false)).toThrow('has not been applied');const baseline=JSON.parse(execFileSync(process.execPath,['apps/mobile/security/verify-forge.cjs',dir,'--expect-vulnerable'],{encoding:'utf8'}));expect(baseline.advisoryMitigated).toBe(false);expect(patchPackage(dir,true).sha256).toBe(manifest.afterSha256);expect(patchPackage(dir,true).status).toBe('verified-mitigation');const fixed=JSON.parse(execFileSync(process.execPath,['apps/mobile/security/verify-forge.cjs',dir],{encoding:'utf8'}));expect(fixed.checks).toHaveLength(14);expect(fixed.upstreamPatched).toBe(false);writeFileSync(rsa,readFileSync(rsa,'utf8')+'\n');expect(()=>patchPackage(dir,true)).toThrow('source hash differs');}finally{rmSync(temp,{recursive:true,force:true})}});
 it('refuses a changed package version or entry point instead of pretending the advisory is absent',()=>{const temp=mkdtempSync(join(tmpdir(),'cargoorbit-forge-'));try{writeFileSync(join(temp,'package.json'),JSON.stringify({name:'node-forge',version:'1.4.1',main:'lib/index.js'}));expect(()=>patchPackage(temp,true)).toThrow('version or entry');writeFileSync(join(temp,'package.json'),JSON.stringify({name:'node-forge',version:'1.4.0',main:'dist/forge.min.js'}));expect(()=>patchPackage(temp,true)).toThrow('version or entry')}finally{rmSync(temp,{recursive:true,force:true})}});
});
