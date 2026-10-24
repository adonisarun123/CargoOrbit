import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import https from 'node:https';
import {IntegrationError,type ProviderAdapter,type ProviderRequest,type ProviderResponse} from './types.js';

/** A gateway transport; not a claim to implement unpublished government/vendor schemas. */
function publicAddress(address:string) {
  if (isIP(address)!==4) return false;
  const [a,b,c]=address.split('.').map(Number);
  return !(a===0 || a===10 || a===127 || a!>=224 ||
    a===169&&b===254 || a===172&&b!>=16&&b!<=31 ||
    a===192&&(b===168 || b===0 || b===88&&c===99) ||
    a===100&&b!>=64&&b!<=127 ||
    a===198&&(b===18 || b===19 || b===51&&c===100) ||
    a===203&&b===0&&c===113);
}

export interface GatewayConfiguration {
  baseUrl:string;
  allowedHosts:string[];
  requestPath:string;
  lookupPath?:string;
  token:()=>Promise<string>;
  timeoutMs?:number;
  maximumResponseBytes?:number;
}

export class ApprovedGatewayAdapter implements ProviderAdapter {
  private origin:URL;
  constructor(private config:GatewayConfiguration) {
    this.origin=new URL(config.baseUrl);
    if (this.origin.protocol!=='https:' || this.origin.username || this.origin.password ||
      this.origin.search || this.origin.hash || this.origin.pathname!=='/' ||
      this.origin.port&&this.origin.port!=='443' || !config.allowedHosts.includes(this.origin.hostname) ||
      isIP(this.origin.hostname)) {
      throw new IntegrationError(500,'UNSAFE_PROVIDER_CONFIG','Use an allowlisted HTTPS hostname origin without credentials, custom ports, path or query');
    }
    for (const path of [config.requestPath,config.lookupPath].filter(Boolean) as string[]) {
      if (!/^\/[a-zA-Z0-9/_-]*$/.test(path) || path.includes('..')) {
        throw new IntegrationError(500,'UNSAFE_PROVIDER_PATH','Gateway paths must be fixed absolute paths');
      }
    }
    if (config.timeoutMs!==undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs<1 || config.timeoutMs>30000)) {
      throw new IntegrationError(500,'UNSAFE_PROVIDER_TIMEOUT','Gateway deadline must be between 1 and 30000 milliseconds');
    }
  }

  execute(request:ProviderRequest) { return this.call(this.config.requestPath,request); }
  reconcile(request:ProviderRequest) {
    if (!this.config.lookupPath) throw new IntegrationError(503,'LOOKUP_NOT_CONFIGURED','No lookup contract is configured');
    return this.call(this.config.lookupPath,{operationId:request.operationId,operation:request.operation});
  }

  private async call(path:string,payload:unknown):Promise<ProviderResponse> {
    // This deadline includes DNS, credentials, TLS and response streaming. An inactivity
    // timeout alone lets a provider keep a request open indefinitely by trickling data.
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const deadline=new Promise<never>((_resolve,reject)=>{
      timer=setTimeout(()=>{
        controller.abort();
        reject(new IntegrationError(504,'PROVIDER_TIMEOUT','Provider operation exceeded its deadline'));
      },this.config.timeoutMs??15000);
    });
    try { return await Promise.race([this.send(path,payload,controller.signal),deadline]); }
    finally { if(timer)clearTimeout(timer); }
  }

  private async send(path:string,payload:unknown,signal:AbortSignal):Promise<ProviderResponse> {
    const records=await lookup(this.origin.hostname,{all:true,family:4});
    signal.throwIfAborted();
    if (!records.length || records.some(r=>!publicAddress(r.address))) {
      throw new IntegrationError(503,'PROVIDER_DNS_REJECTED','Provider DNS does not resolve exclusively to public addresses');
    }
    const address=records[0]!.address;
    const token=await this.config.token();
    signal.throwIfAborted();
    if (!token || /[\r\n]/.test(token)) throw new IntegrationError(503,'PROVIDER_CREDENTIAL','Provider credential is unavailable');
    const bytes=Buffer.from(JSON.stringify(payload));
    return new Promise((resolve,reject)=>{
      const req=https.request({
        hostname:this.origin.hostname,port:443,path,method:'POST',servername:this.origin.hostname,signal,
        lookup:((_hostname:unknown,_options:unknown,callback:any)=>callback(null,address,4)) as any,
        headers:{'Content-Type':'application/json','Content-Length':bytes.length,'Authorization':`Bearer ${token}`,'Idempotency-Key':String((payload as {operationId:string}).operationId)},
      },res=>{
        const chunks:Buffer[]=[];
        let length=0;
        res.on('data',(chunk:Buffer)=>{
          length+=chunk.length;
          if (length>(this.config.maximumResponseBytes??1024*1024)) {
            req.destroy(new Error('PROVIDER_RESPONSE_LIMIT'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end',()=>{
          if (!res.statusCode || res.statusCode<200 || res.statusCode>=300) {
            reject(new IntegrationError(502,'PROVIDER_HTTP_ERROR','Provider did not return a successful response'));
            return;
          }
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as ProviderResponse); }
          catch { reject(new IntegrationError(502,'PROVIDER_INVALID_JSON','Provider response is not valid JSON')); }
        });
        res.on('error',()=>reject(new IntegrationError(502,'PROVIDER_RESPONSE_FAILED','Provider response was interrupted')));
      });
      req.on('error',()=>reject(new IntegrationError(502,'PROVIDER_TRANSPORT_FAILED','Provider request could not be confirmed')));
      req.end(bytes);
    });
  }
}

export {publicAddress as isPublicProviderAddress};
