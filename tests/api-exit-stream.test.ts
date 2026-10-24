import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {PassThrough} from 'node:stream';
const mocks=vi.hoisted(()=>{process.env.NODE_ENV='test';process.env.JWT_SECRET='z'.repeat(40);process.env.OTP_SECRET='o'.repeat(40);return {limit:vi.fn(),transaction:vi.fn(),archive:vi.fn(),openObject:vi.fn()}});
vi.mock('../apps/api/src/runtime',()=>({auth:{limit:mocks.limit},database:{transaction:mocks.transaction}}));
vi.mock('../apps/api/src/export',()=>({tenantArchive:mocks.archive}));
vi.mock('../apps/api/src/storage',()=>({openObject:mocks.openObject}));
import {ExitController,exitAccess} from '../apps/api/src/exit';
let source:PassThrough;
const request=()=>({aborted:false,headers:{authorization:'Bearer exit'},exit:{user:{id:'owner'},actor:{tenantId:'t',userId:'owner',role:'owner'},receiptId:'approved',expiresAt:new Date(Date.now()+300000).toISOString(),exitExportUntil:new Date(Date.now()+3600000).toISOString()}} as any);
function response(){const res=new PassThrough() as PassThrough&{set:ReturnType<typeof vi.fn>};res.set=vi.fn();return res as any}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();source=new PassThrough();mocks.limit.mockResolvedValue(undefined);mocks.transaction.mockResolvedValue(undefined);mocks.archive.mockReturnValue(source);mocks.openObject.mockResolvedValue(source);vi.spyOn(exitAccess,'archive').mockResolvedValue({objectKey:'t/exports/approved',objectVersion:'v1',sha256:'a'.repeat(64),bytes:123});vi.spyOn(exitAccess,'authenticate').mockImplementation(async()=>request().exit)});
afterEach(()=>{source.destroy();vi.restoreAllMocks();vi.useRealTimers()});
describe('Exit download cancellation',()=>{
 it('does not start a current archive when the response closes while authorization is awaited',async()=>{const req=request(),res=response();mocks.transaction.mockImplementationOnce(async()=>{res.destroy()});await new ExitController().archive(req,res);expect(mocks.archive).not.toHaveBeenCalled();expect(res.destroyed).toBe(true)});
 it('does not open a stored object for a request already aborted',async()=>{const req=request(),res=response();req.aborted=true;await new ExitController().download('approved',req,res);expect(mocks.openObject).not.toHaveBeenCalled();expect(res.destroyed).toBe(true)});
 it('destroys archive and response when exit session reaches its earlier deadline',async()=>{const req=request(),res=response();req.exit.expiresAt=new Date(Date.now()+1000).toISOString();await new ExitController().archive(req,res);expect(mocks.archive).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1000);expect(res.destroyed).toBe(true);expect(source.destroyed).toBe(true)});
 it('interrupts ongoing downloads after the periodic live-authority check detects revocation',async()=>{const req=request(),res=response();vi.mocked(exitAccess.authenticate).mockRejectedValueOnce(new Error('revoked'));await new ExitController().download('approved',req,res);await vi.advanceTimersByTimeAsync(5000);expect(exitAccess.authenticate).toHaveBeenCalledWith('Bearer exit');expect(res.destroyed).toBe(true);expect(source.destroyed).toBe(true)});
 it('passes approved object checksums to the client and cancels after disconnect',async()=>{const req=request(),res=response();await new ExitController().download('approved',req,res);expect(res.set).toHaveBeenCalledWith(expect.objectContaining({'X-Archive-SHA256':'a'.repeat(64),'X-Archive-Bytes':'123'}));res.destroy();await vi.advanceTimersByTimeAsync(0);expect(source.destroyed).toBe(true);expect(vi.getTimerCount()).toBe(0)});
});
