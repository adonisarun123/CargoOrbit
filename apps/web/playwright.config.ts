import {defineConfig,devices} from '@playwright/test';
import {resolve} from 'node:path';
const root=resolve(__dirname,'../..');
const sharedEnv={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),NODE_ENV:'test',CARGOORBIT_E2E:'1',WEB_ORIGIN:'http://localhost:3000',PORT:'4000',MALWARE_SCANNER:'development-clean',EVIDENCE_STORAGE:'local',EVIDENCE_ROOT:`${root}/test-results/evidence`};
export default defineConfig({
 testDir:'../../tests',testMatch:'web-launch*.spec.ts',fullyParallel:false,workers:1,retries:0,timeout:120000,expect:{timeout:15000},forbidOnly:!!process.env.CI,
 outputDir:resolve(root,'test-results/browser'),reporter:[['list'],['html',{outputFolder:resolve(root,'playwright-report'),open:'never'}],['junit',{outputFile:resolve(root,'test-results/browser-junit.xml')}]],
 use:{baseURL:'http://localhost:3000',trace:'retain-on-failure',screenshot:'only-on-failure',video:'retain-on-failure',acceptDownloads:true},
 projects:[{name:'chromium-desktop',use:{...devices['Desktop Chrome']}}],
 webServer:[{command:'node apps/web/e2e/start-api.mjs',cwd:root,url:'http://localhost:4000/v1/health/ready',timeout:90000,reuseExistingServer:false,env:sharedEnv},{command:'npm run start --workspace=@cargoorbit/web',cwd:root,url:'http://localhost:3000',timeout:90000,reuseExistingServer:false,env:{...sharedEnv,NODE_ENV:'production'}}],
});
