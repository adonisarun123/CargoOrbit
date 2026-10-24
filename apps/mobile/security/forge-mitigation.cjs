'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const manifest=require('./forge-mitigation.json');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Exact backport of the executable nested-length guard in upstream PR #1152.
 * No package rename/version change and no advisory filtering. Unknown sources fail closed.
 * This applies to the Node lib entry point used by Expo tooling, not browser dist bundles.
 */
function patchPackage(packageDirectory,apply=false){
 const info=JSON.parse(fs.readFileSync(path.join(packageDirectory,'package.json'),'utf8'));
 if(info.name!==manifest.package||info.version!==manifest.version||info.main!=='lib/index.js')throw new Error('Unexpected node-forge version or entry point; re-review the mitigation.');
 const target=path.join(packageDirectory,manifest.file),original=fs.readFileSync(target),hash=digest(original);
 if(hash===manifest.afterSha256)return {packageDirectory,sha256:hash,status:'verified-mitigation',upstreamPatched:false};
 if(hash!==manifest.beforeSha256)throw new Error('node-forge source hash differs from the reviewed release; refusing to modify or accept it.');
 if(!apply)throw new Error('node-forge 1.4.0 is vulnerable: reviewed mitigation has not been applied.');
 const text=original.toString('utf8');if(text.split(manifest.before).length!==2)throw new Error('Expected one exact patch site.');
 const patched=Buffer.from(text.replace(manifest.before,manifest.after));if(digest(patched)!==manifest.afterSha256)throw new Error('Patched source hash mismatch.');
 const temporary=target+'.cargoorbit-patch.tmp';fs.writeFileSync(temporary,patched,{mode:fs.statSync(target).mode});fs.renameSync(temporary,target);
 return {packageDirectory,sha256:digest(fs.readFileSync(target)),status:'applied-mitigation',upstreamPatched:false};
}
function installedPackages(root){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
 const paths=Object.keys(lock.packages||{}).filter(p=>/(^|\/)node_modules\/node-forge$/.test(p));
 if(!paths.length)throw new Error('No locked node-forge installation found; explicitly review dependency removal before retiring this gate.');
 const realRoot=fs.realpathSync(root)+path.sep;
 return paths.map(p=>{const real=fs.realpathSync(path.join(root,p));if(!real.startsWith(realRoot))throw new Error('Dependency resolves outside the repository.');return real;});
}
module.exports={patchPackage,installedPackages,manifest};
if(require.main===module){try{const mode=process.argv[2];if(!['--apply','--verify'].includes(mode))throw new Error('Use --apply or --verify.');const root=path.resolve(__dirname,'../../..');const results=installedPackages(root).map(p=>patchPackage(p,mode==='--apply'));console.log(JSON.stringify({advisory:manifest.advisory,rawAuditStillRequired:true,scope:'Node lib entry point only',results},null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
