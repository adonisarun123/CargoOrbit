import {afterEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({lookup:vi.fn(),request:vi.fn()}));
vi.mock('node:dns/promises',()=>({lookup:mocks.lookup}));
vi.mock('node:https',()=>({default:{request:mocks.request}}));
import {ApprovedGatewayAdapter,type ProviderRequest} from '../apps/api/src/integrations';
const request:ProviderRequest={operationId:'operation',operation:'ulip.read',purpose:'approved validation',identifierType:'vehicle',identifier:'TEST123',datasetId:'approved',parameters:{}};
const make=(token=async()=>'test-token')=>new ApprovedGatewayAdapter({baseUrl:'https://gateway.example',allowedHosts:['gateway.example'],requestPath:'/exchange',lookupPath:'/lookup',timeoutMs:1000,token});
afterEach(()=>{vi.useRealTimers();vi.resetAllMocks();});
describe('Provider transport boundaries',()=>{
 it('rejects a mixed public/private DNS answer before credentials or network',async()=>{const token=vi.fn(async()=>'secret');mocks.lookup.mockResolvedValue([{address:'8.8.8.8',family:4},{address:'169.254.169.254',family:4}]);await expect(make(token).execute(request)).rejects.toMatchObject({code:'PROVIDER_DNS_REJECTED'});expect(token).not.toHaveBeenCalled();expect(mocks.request).not.toHaveBeenCalled();});
 it('bounds DNS resolution and prevents a late result from starting a request',async()=>{vi.useFakeTimers();let resolveDns!:(v:unknown)=>void;mocks.lookup.mockImplementation(()=>new Promise(resolve=>{resolveDns=resolve}));const result=make().execute(request);const rejected=expect(result).rejects.toMatchObject({code:'PROVIDER_TIMEOUT'});await vi.advanceTimersByTimeAsync(1001);await rejected;resolveDns([{address:'8.8.8.8',family:4}]);await Promise.resolve();expect(mocks.request).not.toHaveBeenCalled();});
 it('bounds secret lookup and prevents a late credential from starting a request',async()=>{vi.useFakeTimers();mocks.lookup.mockResolvedValue([{address:'8.8.8.8',family:4}]);let resolveToken!:(v:string)=>void;const token=()=>new Promise<string>(resolve=>{resolveToken=resolve});const result=make(token).execute(request);const rejected=expect(result).rejects.toMatchObject({code:'PROVIDER_TIMEOUT'});await vi.advanceTimersByTimeAsync(1001);await rejected;resolveToken('late-secret');await Promise.resolve();expect(mocks.request).not.toHaveBeenCalled();});
});
