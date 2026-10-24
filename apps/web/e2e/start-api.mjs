import {spawn} from 'node:child_process';
if(process.env.CARGOORBIT_E2E!=='1'||process.env.NODE_ENV==='production')throw new Error('This launcher is only for nonproduction browser acceptance');
const children=['apps/api/dist/main.js','apps/api/dist/worker.js'].map(file=>spawn(process.execPath,[file],{stdio:'inherit',env:process.env}));
let stopping=false;function stop(signal='SIGTERM'){if(stopping)return;stopping=true;for(const child of children)child.kill(signal)}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>stop(signal));
for(const child of children){child.on('error',error=>{console.error(error.message);stop();process.exitCode=1});child.on('exit',code=>{if(!stopping){process.exitCode=code||1;stop()}})}
