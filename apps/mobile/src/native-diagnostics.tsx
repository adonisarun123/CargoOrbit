import React,{useEffect,useState} from 'react';
import {ScrollView,Text} from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import {toByteArray} from 'base64-js';
import {EncryptedQueue} from './storage';
import {SyncEngine} from './sync';
import type {Session,WorkSnapshot} from './types';
const KEY='cargoorbit_native_diagnostic_marker';
const session:Session={accessToken:'local-test-only',user:{id:'native-check',tenantId:'native-check',name:'Native checks',email:'test@example.invalid',role:'driver'}};
const photo='/9j/AQIDBAUGBwg=';
let retainedPhaseOneQueue:EncryptedQueue|null=null;
function ensure(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}

/** Enabled only by the separate diagnostics package/profile; never calls the API. */
export async function runNativeDiagnostics(){
 ensure(process.env.EXPO_PUBLIC_NATIVE_DIAGNOSTICS==='true','Diagnostics are disabled.');
 const marker=await SecureStore.getItemAsync(KEY);
 const queue=await EncryptedQueue.open(session);
 let retainUntilForceStop=false;
 try{
  if(!marker){
   const event=await queue.enqueue('event','c',{consignmentId:'c',attemptId:'a',type:'arrived',source:'android',occurredAt:new Date().toISOString(),notes:'native-encryption-sentinel'});
   const photoId=await queue.enqueue('photo','c',{attemptId:'a',capturedAt:new Date().toISOString()},photo);
   await queue.markUploading(event);
   const snapshot:WorkSnapshot={consignments:[{id:'c',lrNumber:'CHECK',status:'in_transit',originId:'o',destinationId:'d',lines:[{id:'l',description:'Test item',quantity:'1',unit:'box'}]}],attempts:[{id:'a',consignmentId:'c',facilityId:'d',status:'draft',lines:[{lineId:'l',quantity:'1'}]}],pods:[],fetchedAt:new Date().toISOString()};
   await queue.cacheWork(snapshot);
   await SecureStore.setItemAsync(KEY,JSON.stringify({event,photoId,snapshotAt:snapshot.fetchedAt}));
   retainedPhaseOneQueue=queue;retainUntilForceStop=true;
   return 'NATIVE_CHECK_PHASE1_PASS';
  }
  const saved=JSON.parse(marker);ensure((await queue.get(saved.event))?.state==='pending','Interrupted upload did not recover as pending.');
  ensure(await queue.mediaBase64(saved.photoId)===photo,'Photo bytes/checksum changed after process restart.');
  const snapshot=await queue.cachedWork();ensure(snapshot&&snapshot.attempts[0]?.id==='a'&&snapshot.fetchedAt===saved.snapshotAt,'Assignment cache did not persist across force-stop.');
  const old=await queue.enqueue('draft','c',{attemptId:'a',consignmentId:'c',lines:[{lineId:'l',accepted:'1',damaged:'0',rejected:'0',short:'0'}],photoOperationIds:[saved.photoId]});
  await queue.markFailed(old,'Test conflict',{retryable:false,errorCode:'STALE_DRAFT'});
  const replacement=await queue.replaceHeldDraft(old,snapshot,[{lineId:'l',accepted:'1',damaged:'0',rejected:'0',short:'0'}],'Compared against refreshed server allocation');
  ensure((await queue.get(old))?.state==='failed'&&!!(await queue.get(old))?.replacedBy,'Conflict original was not retained.');
  const calls:string[]=[];
  const engine=new SyncEngine(queue,{uploadPhoto:async()=>{calls.push('photo');return {id:'local-test-photo'}},postAction:async action=>{ensure(action!=='acceptPod','Diagnostics attempted acceptance.');calls.push(action);return {id:'local-test-'+action}}});
  const result=await engine.sync();ensure(calls[0]==='photo'&&calls.includes('saveDraft'),'Photo dependency sync order failed.');
  ensure(result.uploaded===3&&result.failed===0&&!result.authenticationRequired,'Native synchronization did not commit all acknowledgements.');
  for(const [id,serverId] of [[saved.event,'local-test-recordEvent'],[saved.photoId,'local-test-photo'],[replacement,'local-test-saveDraft']]){const operation=await queue.get(id);ensure(operation?.state==='synchronized'&&operation.serverId===serverId,'Native acknowledgement did not persist.');}
  ensure((await queue.get(old))?.state==='failed'&&(await queue.get(old))?.replacedBy===replacement,'Reviewed original was lost during synchronization.');
 }finally{if(!retainUntilForceStop)await queue.close();}
 const namespace=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,'native-check:native-check'),name=`cargoorbit-${namespace}.db`;
 const directory=SQLite.defaultDatabaseDirectory,uri=directory.startsWith('file://')?directory:`file://${directory}`;
 const raw=toByteArray(await FileSystem.readAsStringAsync(`${uri}/${name}`,{encoding:FileSystem.EncodingType.Base64}));
 ensure(raw.length>16,'Encrypted database was not written.');
 ensure(String.fromCharCode(...raw.slice(0,16))!=='SQLite format 3\0','Database has a plaintext SQLite header.');
 const wrong=await SQLite.openDatabaseAsync(name,{useNewConnection:true});let rejected=false;
 try{await wrong.execAsync(`PRAGMA key="x'${'00'.repeat(32)}'";`);await wrong.getFirstAsync('SELECT value FROM owner');}catch{rejected=true;}finally{await wrong.closeAsync();}
 ensure(rejected,'Database opened with the wrong encryption key.');
 return 'NATIVE_CHECK_PHASE2_PASS';
}
export function NativeDiagnostics(){const [result,setResult]=useState('NATIVE_CHECK_RUNNING');useEffect(()=>{void runNativeDiagnostics().then(setResult).catch(e=>setResult(`NATIVE_CHECK_FAILED: ${e instanceof Error?e.message:'unknown'}`));return()=>{void retainedPhaseOneQueue?.close();};},[]);return <ScrollView contentContainerStyle={{padding:30,paddingTop:60,gap:20}}><Text>Isolated native test build. No live API requests.</Text><Text accessibilityLabel={result} selectable>{result}</Text><Text>Checks native SQLCipher, wrong-key rejection, force-stop persistence, encrypted photos and local queue recovery. This is not field acceptance.</Text></ScrollView>;}
