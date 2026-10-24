/** Cache readiness probes and coalesce callers so a public probe cannot amplify provider traffic. */
export function cachedReadiness(check:(signal:AbortSignal)=>Promise<void>,ttlMs=15000,timeoutMs=6000){
 let cached:{ready:boolean;until:number}|undefined;
 let pending:Promise<boolean>|undefined;
 return ():Promise<boolean>=>{
  if(cached&&cached.until>Date.now())return Promise.resolve(cached.ready);
  if(pending)return pending;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const work=Promise.resolve().then(()=>check(controller.signal)).then(()=>true,()=>false);
  const timeout=new Promise<boolean>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(false)},timeoutMs)});
  pending=Promise.race([work,timeout]).then(ready=>{clearTimeout(timer);cached={ready,until:Date.now()+ttlMs};return ready});
  // If a broken dependency ignores cancellation, retain the completed false probe until it settles.
  // This prevents later health requests from accumulating more abandoned network operations.
  void work.then(()=>{pending=undefined});
  return pending;
 };
}
