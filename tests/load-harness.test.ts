import {createServer} from 'node:http';
import {once} from 'node:events';
import {describe,it,expect} from 'vitest';
import {loadConfiguration,measureLoad} from '../scripts/load-test.mjs';
describe('bounded load measurement harness',()=>{
 it('measures an actual local HTTP workload and fails an explicit error target',async()=>{let received=0;const server=createServer((req,res)=>{received++;res.statusCode=req.url==='/fail'?503:200;res.end('fixture-only');}).listen(0,'127.0.0.1');await once(server,'listening');try{const address=server.address() as {port:number};const config=loadConfiguration({LOAD_BASE_URL:`http://127.0.0.1:${address.port}`,LOAD_PATHS_JSON:'["/ok","/fail"]',LOAD_MAX_REQUESTS:'10',LOAD_REQUESTS_PER_SECOND:'100',LOAD_DURATION_SECONDS:'1',LOAD_P95_TARGET_MS:'500',LOAD_ERROR_RATE_TARGET:'0'});const result=await measureLoad(config);expect(received).toBe(10);expect(result.measurements.requests).toBe(10);expect(result.measurements.errors).toBe(5);expect(result.measurements.p95Milliseconds).toBeGreaterThan(0);expect(result.acceptance.passed).toBe(false);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}});
 it('refuses unapproved external targets and unreasonable request budgets',()=>{expect(()=>loadConfiguration({LOAD_BASE_URL:'https://example.invalid'})).toThrow(/authorization/);expect(()=>loadConfiguration({LOAD_BASE_URL:'http://localhost',LOAD_MAX_REQUESTS:'1000000'})).toThrow(/LOAD_MAX_REQUESTS/);expect(()=>loadConfiguration({LOAD_BASE_URL:'http://localhost',LOAD_PATHS_JSON:'["//example.invalid"]'})).toThrow(/relative/);});
});
