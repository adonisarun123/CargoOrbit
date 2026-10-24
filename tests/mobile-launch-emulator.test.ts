import {describe,it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

// Exercise the actual shell harness against the observed Quickstep overlay and
// controlled device responses. These tests do not substitute for emulator proof.
function runHarness(mode:string){
 const dir=mkdtempSync(join(tmpdir(),'cargo-emulator-harness-'));
 const mobile=join(dir,'apps/mobile'),sdk=join(dir,'sdk'),bin=join(dir,'bin');
 for(const path of [join(mobile,'scripts'),join(sdk,'platform-tools'),join(sdk,'build-tools/37.0.0'),bin])mkdirSync(path,{recursive:true});
 copyFileSync('apps/mobile/scripts/test-android-emulator.sh',join(mobile,'scripts/check.sh'));
 const stub=`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const root=process.env.TEST_WORK_DIR,mode=process.env.TEST_MODE,name=path.basename(process.argv[1]),args=process.argv.slice(2);
fs.appendFileSync(path.join(root,'calls'),JSON.stringify([name,...args])+'\\n');
if(name==='aapt')console.log("package: name='com.cargoorbit.driver.test'");
if(name==='adb'){
 if(args.join(' ')==='shell getprop ro.kernel.qemu')console.log(mode==='physical'?'0':'1');
 if(args[0]==='logcat'&&args[1]==='-d')console.log('captured system diagnostics');
 if(args[0]==='shell'&&args[1]==='cat'){
  const counter=path.join(root,'reads');const n=fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8'))+1:1;fs.writeFileSync(counter,String(n));
  if(mode==='app-failure')console.log('<node text="NATIVE_CHECK_FAILED: native storage failed"/>');
  else if(mode==='repeated-launcher'||n===1)console.log(${JSON.stringify('<node package="android" text="Quickstep isn\'t responding"/>')});
  else console.log('<node package="com.cargoorbit.driver.test" text="NATIVE_CHECK_PHASE'+(n===2?'1':'2')+'_PASS"/>');
 }
}
`;
 for(const [folder,name] of [[bin,'keytool'],[join(sdk,'platform-tools'),'adb'],...['aapt','zipalign','apksigner'].map(name=>[join(sdk,'build-tools/37.0.0'),name])])writeFileSync(join(folder!,name!),stub,{mode:0o755});
 try{
  const result=spawnSync('bash',[join(mobile,'scripts/check.sh')],{env:{...process.env,ANDROID_HOME:sdk,PATH:`${bin}:${process.env.PATH}`,TEST_WORK_DIR:dir,TEST_MODE:mode},encoding:'utf8',timeout:15000});
  if(!existsSync(join(dir,'calls')))throw new Error(result.stdout+result.stderr);
  const calls=readFileSync(join(dir,'calls'),'utf8').trim().split('\n').map(line=>JSON.parse(line) as string[]);
  const out=join(mobile,'native-test-results');
  return {status:result.status,output:result.stdout+result.stderr,calls,launcherEvidence:existsSync(join(out,'launcher-anr.xml')),phase1:existsSync(join(out,'NATIVE_CHECK_PHASE1_PASS.xml')),phase2:existsSync(join(out,'NATIVE_CHECK_PHASE2_PASS.xml')),failureLog:existsSync(join(out,'logcat.txt'))};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
describe('Android emulator launch recovery',()=>{
 it('recovers the observed launcher overlay once, preserves it, and requires both app markers across force-stop',()=>{
  const result=runHarness('launcher-then-success');expect(result.status,result.output).toBe(0);
  expect(result.launcherEvidence).toBe(true);expect(result.phase1).toBe(true);expect(result.phase2).toBe(true);
  expect(result.calls.filter(x=>x.join(' ')==='adb shell am force-stop com.android.launcher3')).toHaveLength(1);
  expect(result.calls.filter(x=>x.join(' ')==='adb shell am force-stop com.cargoorbit.driver.test')).toHaveLength(1);
  expect(result.calls.filter(x=>x.join(' ')==='adb shell pm clear com.cargoorbit.driver.test')).toHaveLength(1);
 });
 it('fails a repeated launcher ANR and retains diagnostics',()=>{const result=runHarness('repeated-launcher');expect(result.status).toBe(1);expect(result.output).toContain('Launcher ANR repeated');expect(result.phase2).toBe(false);expect(result.failureLog).toBe(true);});
 it('does not dismiss or retry a failed application check',()=>{const result=runHarness('app-failure');expect(result.status).toBe(1);expect(result.output).toContain('native storage failed');expect(result.calls.some(x=>x.includes('force-stop'))).toBe(false);expect(result.failureLog).toBe(true);});
 it('refuses physical devices before clearing or installing any package',()=>{const result=runHarness('physical');expect(result.status).toBe(1);expect(result.output).toContain('isolated Android emulator');expect(result.calls.some(x=>x[0]==='adb'&&(x.includes('install')||x.includes('uninstall')||x.includes('clear')||x.includes('force-stop')))).toBe(false);});
});
