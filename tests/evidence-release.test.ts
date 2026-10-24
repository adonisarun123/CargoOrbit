import {describe,it,expect,vi} from 'vitest';
import {renderReceipt} from '../apps/api/src/packet-renderer';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const fixture=vi.hoisted(()=>({config:{region:'ap-south-1',storage:'local',bucket:'',evidenceRoot:'',scanner:'clamav',scannerHost:'127.0.0.1',scannerPort:0}}));
vi.mock('../apps/api/src/config.js',()=>({config:fixture.config,production:false}));
import {storeObject,readObject,scanBytes,sha256,sniffMime} from '../apps/api/src/storage';
describe('Evidence storage and packet release',()=>{
 it('stores exact bytes and rejects a corrupted checksum or traversal',async()=>{const root=await mkdtemp(join(tmpdir(),'cargo-evidence-'));fixture.config.evidenceRoot=root;try{const bytes=Buffer.from('%PDF-1.7\nOriginal');const stored=await storeObject('tenant/original/id',bytes,'application/pdf');expect(await readObject(stored.objectKey,stored.objectVersion,stored.sha256)).toEqual(bytes);await expect(readObject(stored.objectKey,stored.objectVersion,'0'.repeat(64))).rejects.toThrow(/integrity/);await expect(storeObject('../bad',bytes,'application/pdf')).rejects.toThrow(/key/);expect(sniffMime(Buffer.from('<script>bad</script>'))).toBeNull()}finally{await rm(root,{recursive:true,force:true})}});
 it('accepts only the exact clean scanner response and quarantines FOUND',async()=>{for(const [response,status]of [['stream: OK\0','clean'],['stream: Eicar-Test-Signature FOUND\0','quarantined'],['stream: NOT OK\0','failed']]){const server=createServer(s=>s.on('data',()=>s.end(response)));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));fixture.config.scannerPort=(server.address() as any).port;try{expect((await scanBytes(Buffer.from('test'))).status).toBe(status)}finally{await new Promise<void>(r=>server.close(()=>r()))}}});
 it('builds a multipage PDF from the exact sealed quantities',async()=>{const p={id:'pod1',version:2,status:'accepted_with_exceptions',acceptedAt:'2026-10-24T10:00:00Z',payloadHash:'a'.repeat(64),acceptedPayload:{lrNumber:'LR-001',attemptId:'a1',facilityId:'site1',consignorId:'sender',consigneeId:'receiver',payerId:'payer',lines:Array.from({length:80},(_,n)=>({lineId:`line${n}`,item:{description:`Component ${n}`,unit:'pcs'},accepted:'9',damaged:'1',rejected:'0',short:'0'})),exceptions:[{reason:'Damaged packaging'}],grantSnapshot:{id:'grant1',receiverName:'Authorized Receiver'},declaration:'Subject to reservations',policyId:'p1',policyVersion:1,evidence:[]}};const pdf=await renderReceipt(p);expect(pdf.subarray(0,5).toString()).toBe('%PDF-');expect(pdf.length).toBeGreaterThan(5000);expect(sha256(pdf)).toHaveLength(64)});
});
