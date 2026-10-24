import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import {toByteArray,fromByteArray} from 'base64-js';
import type {Operation,OperationKind,QueueStats,Session,WorkSnapshot} from './types';
import {assertCapacity,hasCapacityWarning,MAX_PHOTO_BYTES} from './policy';
const SESSION_KEY='cargoorbit_active_session';
export async function readSession():Promise<Session|null>{const value=await SecureStore.getItemAsync(SESSION_KEY);if(!value)return null;try{const parsed=JSON.parse(value);if(!parsed.accessToken||!parsed.user?.id||!parsed.user?.tenantId||parsed.user.role!=='driver')throw new Error();return parsed as Session;}catch{await SecureStore.deleteItemAsync(SESSION_KEY);return null;}}
export async function saveSession(session:Session):Promise<void>{await SecureStore.setItemAsync(SESSION_KEY,JSON.stringify(session),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}
export async function clearSession():Promise<void>{await SecureStore.deleteItemAsync(SESSION_KEY);}
const hex=(bytes:Uint8Array)=>Array.from(bytes).map(byte=>byte.toString(16).padStart(2,'0')).join('');
export async function hashBytes(bytes:Uint8Array):Promise<string>{return hex(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new Uint8Array(bytes).buffer)));}
interface Row {id:string;kind:OperationKind;consignment_id:string;payload:string;sha256:string|null;byte_count:number;state:Operation['state'];attempts:number;error:string|null;server_id:string|null;created_at:string;retryable:number;next_attempt_at:string|null;}
const fromRow=(r:Row):Operation=>({id:r.id,kind:r.kind,consignmentId:r.consignment_id,payload:JSON.parse(r.payload),sha256:r.sha256,bytes:r.byte_count,state:r.state,attempts:r.attempts,error:r.error,serverId:r.server_id,createdAt:r.created_at,retryable:r.retryable!==0,nextAttemptAt:r.next_attempt_at});
/** SQLCipher database and SecureStore key are private to a named user and tenant. */
export class EncryptedQueue {
 private closing=false;
 private closed:Promise<void>|null=null;
 private inflight=new Set<Promise<unknown>>();
 private constructor(private db:SQLite.SQLiteDatabase,readonly owner:string){}
 private run<T>(fn:()=>Promise<T>):Promise<T>{if(this.closing)return Promise.reject(new Error('This account storage is closing. Reopen the account before capture.'));const work=fn();this.inflight.add(work);void work.finally(()=>this.inflight.delete(work)).catch(()=>undefined);return work;}
 static async open(session:Session):Promise<EncryptedQueue>{
 const owner=`${session.user.tenantId}:${session.user.id}`;
 const namespace=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,owner),keyName=`cargoorbit_cipher_${namespace}`;
 let key=await SecureStore.getItemAsync(keyName);if(!key){key=hex(await Crypto.getRandomBytesAsync(32));await SecureStore.setItemAsync(keyName,key,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}
 if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Device encryption key is invalid. Contact operations; do not clear app data.');
 const db=await SQLite.openDatabaseAsync(`cargoorbit-${namespace}.db`);
 try{
 await db.execAsync(`PRAGMA key = "x'${key}'";`);
 const cipher=await db.getFirstAsync<Record<string,string>>('PRAGMA cipher_version;');if(!cipher||!Object.values(cipher).some(Boolean))throw new Error('Encrypted storage unavailable. Install a CargoOrbit native build with SQLCipher; Expo Go is unsupported.');
 await db.execAsync(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA cipher_memory_security=ON;PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS cached_resources(id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('event','draft','photo')),consignment_id TEXT NOT NULL,payload TEXT NOT NULL,media BLOB,sha256 TEXT,byte_count INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL CHECK(state IN('pending','uploading','failed','synchronized')),attempts INTEGER NOT NULL DEFAULT 0,error TEXT,server_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,retryable INTEGER NOT NULL DEFAULT 1,next_attempt_at TEXT);
 CREATE INDEX IF NOT EXISTS queue_state ON operations(state,created_at);`);
 // Existing installations keep their encrypted drafts during schema upgrade.
 const columns=await db.getAllAsync<{name:string}>('PRAGMA table_info(operations)');
 if(!columns.some(c=>c.name==='retryable'))await db.execAsync('ALTER TABLE operations ADD COLUMN retryable INTEGER NOT NULL DEFAULT 1;');
 if(!columns.some(c=>c.name==='next_attempt_at'))await db.execAsync('ALTER TABLE operations ADD COLUMN next_attempt_at TEXT;');
 await db.runAsync('INSERT OR IGNORE INTO owner(id,value) VALUES(1,?)',owner);
 if((await db.getFirstAsync<{value:string}>('SELECT value FROM owner WHERE id=1'))?.value!==owner)throw new Error('Encrypted storage account mismatch. Contact operations.');
 await db.runAsync("UPDATE operations SET state='pending',retryable=1,next_attempt_at=NULL,error='Upload interrupted; retrying original operation ID.' WHERE state='uploading'");
 // Keep synchronized photo identities while an outstanding draft refers to them.
 await db.runAsync("DELETE FROM operations AS old WHERE state='synchronized' AND updated_at < ? AND NOT EXISTS (SELECT 1 FROM operations pending,json_each(pending.payload,'$.photoOperationIds') photo WHERE pending.state!='synchronized' AND photo.value=old.id)",new Date(Date.now()-7*86400000).toISOString());
 return new EncryptedQueue(db,owner);
 }catch(error){await db.closeAsync();throw error;}
 }
 close():Promise<void>{if(!this.closed){this.closing=true;this.closed=Promise.allSettled([...this.inflight]).then(()=>this.db.closeAsync());}return this.closed;}
 list():Promise<Operation[]>{return this.run(async()=>{const rows=await this.db.getAllAsync<Row>('SELECT id,kind,consignment_id,payload,sha256,byte_count,state,attempts,error,server_id,created_at,retryable,next_attempt_at FROM operations ORDER BY created_at DESC');return rows.map(fromRow);});}
 stats():Promise<QueueStats>{return this.run(async()=>{const row=await this.db.getFirstAsync<{pending:number;failed:number;synchronized:number;bytes:number;count:number}>("SELECT COALESCE(SUM(CASE WHEN state IN ('pending','uploading') THEN 1 ELSE 0 END),0) pending,COALESCE(SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END),0) failed,COALESCE(SUM(CASE WHEN state='synchronized' THEN 1 ELSE 0 END),0) synchronized,COALESCE(SUM(byte_count),0) bytes,COALESCE(SUM(CASE WHEN state!='synchronized' AND kind!='photo' THEN 1 ELSE 0 END),0) count FROM operations");const stats=row||{pending:0,failed:0,synchronized:0,bytes:0,count:0};return {...stats,warning:hasCapacityWarning(stats.count,stats.bytes)};});}
 cacheWork(snapshot:WorkSnapshot):Promise<void>{return this.run(async()=>{await this.db.runAsync("INSERT INTO cached_resources(id,data) VALUES('work',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",JSON.stringify(snapshot));});}
 cachedWork():Promise<WorkSnapshot|null>{return this.run(async()=>{const row=await this.db.getFirstAsync<{data:string}>("SELECT data FROM cached_resources WHERE id='work'");return row?JSON.parse(row.data) as WorkSnapshot:null;});}
 enqueue(kind:OperationKind,consignmentId:string,payload:Record<string,unknown>,base64?:string):Promise<string>{return this.run(async()=>{
 if(kind==='photo'&&(!base64||base64.length>Math.ceil(MAX_PHOTO_BYTES/3)*4+4))throw new Error('Photo exceeds the 8 MB capture limit or has no bytes.');
 const media=base64?toByteArray(base64):null,id=Crypto.randomUUID(),now=new Date().toISOString();
 if(media&&await FileSystem.getFreeDiskStorageAsync()<media.length*3+10*1024*1024)throw new Error('Device storage is too low to durably capture evidence. Free space and try again.');
 const sha256=media?await hashBytes(media):null;
 await this.db.withExclusiveTransactionAsync(async tx=>{
 const count=await tx.getFirstAsync<{count:number;bytes:number}>("SELECT COALESCE(SUM(CASE WHEN state!='synchronized' AND kind!='photo' THEN 1 ELSE 0 END),0) count,COALESCE(SUM(byte_count),0) bytes FROM operations");assertCapacity(count?.count||0,count?.bytes||0,media?.length||0,kind==='photo');
 if(kind==='draft'){const attemptId=payload.attemptId;if(typeof attemptId!=='string'||!attemptId)throw new Error('Choose an assigned delivery attempt before saving quantities.');const pending=await tx.getFirstAsync<{id:string}>("SELECT id FROM operations WHERE kind='draft' AND state!='synchronized' AND json_extract(payload,'$.attemptId')=?",attemptId);if(pending)throw new Error('A local draft for this delivery attempt is already queued. Synchronize or ask operations to review it before capturing another.');}
 const input={...payload,clientEventId:id};await tx.runAsync("INSERT INTO operations(id,kind,consignment_id,payload,media,sha256,byte_count,state,created_at,updated_at,retryable) VALUES(?,?,?,?,?,?,?,'pending',?,?,1)",id,kind,consignmentId,JSON.stringify(input),media,sha256,media?.length||0,now,now);
 });return id;
 });}
 mediaBase64(id:string):Promise<string>{return this.run(async()=>{const r=await this.db.getFirstAsync<{media:Uint8Array|null;sha256:string}>('SELECT media,sha256 FROM operations WHERE id=?',id);if(!r?.media)throw new Error('Encrypted photo is missing. Contact operations.');if(await hashBytes(r.media)!==r.sha256)throw new Error('Encrypted photo failed checksum verification. Contact operations.');return fromByteArray(r.media);});}
 get(id:string):Promise<Operation|undefined>{return this.run(async()=>{const row=await this.db.getFirstAsync<Row>('SELECT * FROM operations WHERE id=?',id);return row?fromRow(row):undefined;});}
 markUploading(id:string):Promise<void>{return this.run(async()=>{await this.db.runAsync("UPDATE operations SET state='uploading',attempts=attempts+1,error=NULL,updated_at=? WHERE id=? AND state!='synchronized' AND retryable=1",new Date().toISOString(),id);});}
 markFailed(id:string,error:string,options:{retryable?:boolean;nextAttemptAt?:string|null}={}):Promise<void>{return this.run(async()=>{await this.db.runAsync("UPDATE operations SET state='failed',error=?,retryable=?,next_attempt_at=?,updated_at=? WHERE id=? AND state!='synchronized'",error.slice(0,500),options.retryable===false?0:1,options.nextAttemptAt||null,new Date().toISOString(),id);});}
 markSynced(id:string,serverId:string):Promise<void>{return this.run(async()=>{await this.db.runAsync("UPDATE operations SET state='synchronized',server_id=?,media=NULL,byte_count=0,error=NULL,next_attempt_at=NULL,updated_at=? WHERE id=?",serverId,new Date().toISOString(),id);});}
}
