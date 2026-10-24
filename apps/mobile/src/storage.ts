import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { toByteArray, fromByteArray } from 'base64-js';
import type { Consignment, Operation, OperationKind, QueueStats, Session } from './types';
import { assertCapacity, hasCapacityWarning } from './policy';

const SESSION_KEY='cargoorbit_active_session';
export async function readSession():Promise<Session|null> {const value=await SecureStore.getItemAsync(SESSION_KEY);return value ? JSON.parse(value) as Session : null;}
export async function saveSession(session:Session):Promise<void> {await SecureStore.setItemAsync(SESSION_KEY,JSON.stringify(session),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}
export async function clearSession():Promise<void> {await SecureStore.deleteItemAsync(SESSION_KEY);}
const hex=(bytes:Uint8Array)=>Array.from(bytes).map(byte=>byte.toString(16).padStart(2,'0')).join('');
export async function hashBytes(bytes:Uint8Array):Promise<string> {return hex(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new Uint8Array(bytes).buffer)));}
interface Row { id:string; kind:OperationKind; consignment_id:string; payload:string; sha256:string|null; byte_count:number; state:Operation['state']; attempts:number; error:string|null; server_id:string|null; created_at:string; }
function fromRow(row:Row):Operation {return {id:row.id,kind:row.kind,consignmentId:row.consignment_id,payload:JSON.parse(row.payload),sha256:row.sha256,bytes:row.byte_count,state:row.state,attempts:row.attempts,error:row.error,serverId:row.server_id,createdAt:row.created_at};}

/** One SQLCipher file and random KeyStore-backed key per tenant and named user. */
export class EncryptedQueue {
  private constructor(private readonly db:SQLite.SQLiteDatabase,readonly owner:string) {}
  static async open(session:Session):Promise<EncryptedQueue> {
    const owner=`${session.user.tenantId}:${session.user.id}`;
    const namespace=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,owner);
    const keyName=`cargoorbit_cipher_${namespace}`;
    let key=await SecureStore.getItemAsync(keyName);
    if (!key) {key=hex(await Crypto.getRandomBytesAsync(32));await SecureStore.setItemAsync(keyName,key,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Device encryption key is invalid. Contact operations; do not clear app data.');
    const db=await SQLite.openDatabaseAsync(`cargoorbit-${namespace}.db`);
    try {
      // A fixed hex key generated above is the only value interpolated in this pragma.
      await db.execAsync(`PRAGMA key = "x'${key}'";`);
      const cipher=await db.getFirstAsync<Record<string,string>>('PRAGMA cipher_version;');
      if (!cipher || !Object.values(cipher).some(Boolean)) throw new Error('Encrypted storage unavailable. Install the CargoOrbit native build with SQLCipher; Expo Go is unsupported.');
      await db.execAsync(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA cipher_memory_security=ON;
        CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS cached_work (id TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS operations (
          id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('event','draft','photo')), consignment_id TEXT NOT NULL,
          payload TEXT NOT NULL, media BLOB, sha256 TEXT, byte_count INTEGER NOT NULL DEFAULT 0,
          state TEXT NOT NULL CHECK(state IN ('pending','uploading','failed','synchronized')), attempts INTEGER NOT NULL DEFAULT 0,
          error TEXT, server_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        ); CREATE INDEX IF NOT EXISTS queue_state ON operations(state,created_at);`);
      await db.runAsync('INSERT OR IGNORE INTO owner (id,value) VALUES (1,?)',owner);
      const stored=await db.getFirstAsync<{value:string}>('SELECT value FROM owner WHERE id=1');
      if (stored?.value!==owner) throw new Error('Encrypted storage account mismatch. Sign out and contact operations.');
      // A process stopped mid-upload cannot know that the server did not commit. Stable IDs make retry safe.
      await db.runAsync("UPDATE operations SET state='pending', error='Upload interrupted; retrying with the original operation ID.' WHERE state='uploading'");
      // Only confirmed, media-free history can expire. Never purge a pending draft.
      await db.runAsync("DELETE FROM operations WHERE state='synchronized' AND updated_at < ?",new Date(Date.now()-7*86400000).toISOString());
      return new EncryptedQueue(db,owner);
    } catch(error) {await db.closeAsync();throw error;}
  }
  async close():Promise<void> {await this.db.closeAsync();}
  async list():Promise<Operation[]> {return (await this.db.getAllAsync<Row>('SELECT id,kind,consignment_id,payload,sha256,byte_count,state,attempts,error,server_id,created_at FROM operations ORDER BY created_at DESC')).map(fromRow);}
  async stats():Promise<QueueStats> {
    const row=await this.db.getFirstAsync<{pending:number;failed:number;synchronized:number;bytes:number;count:number}>(`SELECT COALESCE(SUM(CASE WHEN state IN ('pending','uploading') THEN 1 ELSE 0 END),0) pending, COALESCE(SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END),0) failed, COALESCE(SUM(CASE WHEN state='synchronized' THEN 1 ELSE 0 END),0) synchronized, COALESCE(SUM(byte_count),0) bytes, COALESCE(SUM(CASE WHEN state!='synchronized' THEN 1 ELSE 0 END),0) count FROM operations`);
    const stats=row||{pending:0,failed:0,synchronized:0,bytes:0,count:0};return {...stats,warning:hasCapacityWarning(stats.count,stats.bytes)};
  }
  async cacheWork(work:Consignment[]):Promise<void> {
    await this.db.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('DELETE FROM cached_work');for (const item of work) await tx.runAsync('INSERT INTO cached_work(id,data,fetched_at) VALUES(?,?,?)',item.id,JSON.stringify(item),new Date().toISOString());});
  }
  async cachedWork():Promise<{work:Consignment[];fetchedAt:string|null}> {
    const rows=await this.db.getAllAsync<{data:string;fetched_at:string}>('SELECT data,fetched_at FROM cached_work');return {work:rows.map(row=>JSON.parse(row.data) as Consignment),fetchedAt:rows[0]?.fetched_at||null};
  }
  async enqueue(kind:OperationKind,consignmentId:string,payload:Record<string,unknown>,base64?:string):Promise<string> {
    const id=Crypto.randomUUID();const now=new Date().toISOString();const media=base64?toByteArray(base64):null;
    const sha256=media?await hashBytes(media):null;
    await this.db.withExclusiveTransactionAsync(async tx=>{
      const row=await tx.getFirstAsync<{count:number;bytes:number}>("SELECT COALESCE(SUM(CASE WHEN state!='synchronized' THEN 1 ELSE 0 END),0) count,COALESCE(SUM(byte_count),0) bytes FROM operations");
      assertCapacity(row?.count||0,row?.bytes||0,media?.length||0);
      // Stable event IDs are generated and durably stored before a request is attempted.
      const input={...payload,clientEventId:id};
      await tx.runAsync('INSERT INTO operations (id,kind,consignment_id,payload,media,sha256,byte_count,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,\'pending\',?,?)',id,kind,consignmentId,JSON.stringify(input),media,sha256,media?.length||0,now,now);
    });
    return id;
  }
  async mediaBase64(id:string):Promise<string> {const row=await this.db.getFirstAsync<{media:Uint8Array|null}>('SELECT media FROM operations WHERE id=?',id);if (!row?.media) throw new Error('Encrypted photo is missing. Contact operations; capture was not uploaded.');return fromByteArray(row.media);}
  async get(id:string):Promise<Operation|undefined> {const row=await this.db.getFirstAsync<Row>('SELECT * FROM operations WHERE id=?',id);return row?fromRow(row):undefined;}
  async markUploading(id:string):Promise<void> {await this.db.runAsync("UPDATE operations SET state='uploading',attempts=attempts+1,error=NULL,updated_at=? WHERE id=? AND state!='synchronized'",new Date().toISOString(),id);}
  async markFailed(id:string,error:string):Promise<void> {await this.db.runAsync("UPDATE operations SET state='failed',error=?,updated_at=? WHERE id=?",error.slice(0,500),new Date().toISOString(),id);}
  async markSynced(id:string,serverId?:string):Promise<void> {await this.db.runAsync("UPDATE operations SET state='synchronized',server_id=?,media=NULL,byte_count=0,error=NULL,updated_at=? WHERE id=?",serverId||null,new Date().toISOString(),id);}
}
