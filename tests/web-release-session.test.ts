import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

type Api=typeof import('../apps/web/lib/api');
let api:Api;
let storage:Map<string,string>;
let fetchMock:ReturnType<typeof vi.fn>;
const session=(accessToken='old',membershipId='membership-a')=>({accessToken,refreshToken:`refresh-${accessToken}`,user:{id:'user-a',name:'A User',email:'a@example.test',role:'operations',tenantId:'tenant-a',membershipId}});
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {resolve,promise}};
const token=(init?:RequestInit)=>new Headers(init?.headers).get('Authorization');
beforeEach(async()=>{
 vi.resetModules();storage=new Map();vi.stubGlobal('sessionStorage',{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});vi.stubGlobal('window',new EventTarget());fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);api=await import('../apps/web/lib/api');api.persistSession(session());
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});

describe('web session rotation',()=>{
 it('serializes simultaneous expired requests to one refresh rotation',async()=>{
  fetchMock.mockImplementation(async(url:string,init:RequestInit)=>url.endsWith('/auth/refresh')?response(session('new')):token(init)==='Bearer old'?response({message:'Expired'},401):response({ok:true}));
  const results=await Promise.all([api.request('/resources/trips','old'),api.request('/resources/consignments','old'),api.request('/resources/pods','old')]);
  expect(results).toEqual([{ok:true},{ok:true},{ok:true}]);expect(fetchMock.mock.calls.filter(([u])=>u.endsWith('/auth/refresh'))).toHaveLength(1);expect(api.readSession()?.refreshToken).toBe('refresh-new');
 });
 it('retries a late old-token 401 with the already rotated token',async()=>{
  const late=deferred<Response>();let oldRequests=0;
  fetchMock.mockImplementation(async(url:string,init:RequestInit)=>{if(url.endsWith('/auth/refresh'))return response(session('new'));if(token(init)==='Bearer old'){oldRequests++;return oldRequests===1?response({},401):late.promise}return response({ok:true})});
  const first=api.request('/resources/trips','old'),second=api.request('/resources/pods','old');await first;late.resolve(response({},401));await expect(second).resolves.toEqual({ok:true});expect(fetchMock.mock.calls.filter(([u])=>u.endsWith('/auth/refresh'))).toHaveLength(1);
 });
 it('does not overwrite a newly selected workspace when old refresh finishes',async()=>{
  const refresh=deferred<Response>();fetchMock.mockReturnValue(refresh.promise);const pending=api.refreshSession();api.persistSession(session('other-workspace','membership-b'));refresh.resolve(response(session('new')));await expect(pending).rejects.toThrow('workspace changed');expect(api.readSession()?.accessToken).toBe('other-workspace');
 });
 it('does not restore a session after local sign out',async()=>{
  const refresh=deferred<Response>();fetchMock.mockReturnValue(refresh.promise);const pending=api.refreshSession();storage.clear();refresh.resolve(response(session('new')));await expect(pending).rejects.toThrow('workspace changed');expect(api.readSession()).toBeNull();
 });
 it('keeps wrong credentials as a step-up failure without replaying the one-time code',async()=>{
  fetchMock.mockImplementation(async(url:string)=>url.endsWith('/auth/me')?response(session().user):response({message:'Invalid credentials',code:'STEP_UP_FAILED'},401));
  await expect(api.stepUp(session(),'receiver:grant','wrong','123456')).rejects.toMatchObject({status:401,code:'STEP_UP_FAILED'});expect(fetchMock).toHaveBeenCalledTimes(2);expect(fetchMock.mock.calls.some(([u])=>u.endsWith('/auth/refresh'))).toBe(false);
 });
 it('refreshes before submitting an authenticator code to step-up',async()=>{
  fetchMock.mockImplementation(async(url:string,init:RequestInit)=>{if(url.endsWith('/auth/refresh'))return response(session('new'));if(url.endsWith('/auth/me'))return token(init)==='Bearer old'?response({},401):response(session('new').user);return response({stepUpToken:'proof',expiresIn:300})});
  await expect(api.stepUp(session(),'policy:change','secret','123456')).resolves.toEqual({stepUpToken:'proof',expiresIn:300});const calls=fetchMock.mock.calls.filter(([u])=>u.endsWith('/auth/step-up'));expect(calls).toHaveLength(1);expect(token(calls[0][1])).toBe('Bearer new');
 });
 it('does not rotate a login failure or cross into a different active account',async()=>{
  fetchMock.mockResolvedValue(response({message:'Denied'},401));await expect(api.request('/auth/login',undefined,{email:'a@example.test',password:'wrong'})).rejects.toMatchObject({status:401});api.persistSession({...session('other'),user:{...session().user,id:'user-b'}});await expect(api.request('/resources/trips','old')).rejects.toThrow('account changed');expect(fetchMock.mock.calls.some(([u])=>u.endsWith('/auth/refresh'))).toBe(false);
 });
});

describe('web API contracts',()=>{
 it('preserves the workspace choices, error code and support request identifier',async()=>{
  fetchMock.mockResolvedValue(response({message:'Choose workspace',details:{code:'WORKSPACE_REQUIRED',memberships:[{id:'m1',name:'Depot',role:'driver'}]},requestId:'request-123'},409));await expect(api.request('/auth/login',undefined,{email:'a@example.test',password:'secret'})).rejects.toMatchObject({code:'WORKSPACE_REQUIRED',details:{memberships:[{id:'m1',name:'Depot',role:'driver'}]},requestId:'request-123'});
 });
 it('sends uploaded original evidence with its selected attempt and stable operation ID',async()=>{
  fetchMock.mockResolvedValue(response({id:'e1',scanStatus:'pending'}));await api.uploadEvidence('old','c1',new File(['original'],'photo.png',{type:'image/png'}),'operation-1','photo','attempt-2');const init=fetchMock.mock.calls[0][1];expect(init.body.get('attemptId')).toBe('attempt-2');expect(init.body.get('clientOperationId')).toBe('operation-1');expect(init.body.get('documentType')).toBe('photo');expect(init.body.get('file').name).toBe('photo.png');expect(new Headers(init.headers).has('Content-Type')).toBe(false);
 });
 it('rejects empty and oversized uploads before sending them',async()=>{
  await expect(api.uploadEvidence('old','c1',new File([],'empty.png'),'one')).rejects.toMatchObject({status:400});await expect(api.uploadEvidence('old','c1',new File([new Uint8Array(10*1024*1024+1)],'large.png'),'two')).rejects.toMatchObject({status:413});expect(fetchMock).not.toHaveBeenCalled();
 });
 it('passes a protected mutation proof and preserves request fields',async()=>{
  fetchMock.mockResolvedValue(response({id:'allocation'}));await api.action('old','reverseAllocation',{allocationId:'a1',idempotencyKey:'stable'},'proof');const init=fetchMock.mock.calls[0][1];expect(new Headers(init.headers).get('X-Step-Up')).toBe('proof');expect(JSON.parse(init.body)).toEqual({allocationId:'a1',idempotencyKey:'stable'});
 });
 it('requests the next page and merges overlapping updated rows without duplication',async()=>{
  fetchMock.mockResolvedValue(response([{id:'a',status:'new'},{id:'b'}]));const next=await api.query('old','consignments',undefined,200);expect(fetchMock.mock.calls[0][0]).toContain('?limit=200&offset=200');expect(api.mergeRows([{id:'a',status:'old'}],next)).toEqual([{id:'a',status:'new'},{id:'b'}]);
 });
 it('turns network failure into an actionable error without replaying a mutation',async()=>{
  fetchMock.mockRejectedValue(new TypeError('fetch failed'));await expect(api.action('old','saveDraft',{clientEventId:'stable'})).rejects.toMatchObject({status:0,message:'Unable to reach CargoOrbit. Check your connection and retry.'});expect(fetchMock).toHaveBeenCalledTimes(1);
 });
});
