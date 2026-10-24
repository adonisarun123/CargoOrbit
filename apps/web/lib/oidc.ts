import {request,type Session} from './api';
export type OidcFlow={configurationId:string;browserBinding:string;kind:'login'|'link';expiresAt:string;returnTo:string;membershipId?:string;sessionId?:string;completionId?:string};
export const oidcKey=(state:string)=>`cargoorbit.oidc.${state}`;
export function safeReturnTo(value:unknown){if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\x00-\x20\x7f]/.test(value))return '/';try{const url=new URL(value,'https://cargoorbit.invalid');if(url.origin!=='https://cargoorbit.invalid'||url.pathname.startsWith('/sso/callback'))return '/';return url.pathname+url.search+url.hash}catch{return '/'}}
export function browserBinding(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
export function readOidcFlow(state:string):OidcFlow|null{try{if(!/^[A-Za-z0-9_-]{43}$/.test(state))return null;const data=JSON.parse(sessionStorage.getItem(oidcKey(state))||'null');if(!data||!['login','link'].includes(data.kind)||!data.configurationId||!(/^[A-Za-z0-9_-]{43}$/.test(data.browserBinding))||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.now())return null;return data}catch{return null}}
export async function beginOidc(configurationId:string,session?:Session,stepUpToken?:string){
 const binding=browserBinding(),flow=await request(`/auth/oidc/${session?'link':'login'}/start`,session?.accessToken,{configurationId,browserBinding:binding},undefined,stepUpToken?{'X-Step-Up':stepUpToken}:{}),destination=new URL(flow.authorizationUrl);
 if(destination.protocol!=='https:'||destination.username||destination.password)throw new Error('The identity provider returned an invalid sign-in destination.');
 const saved:OidcFlow={configurationId,browserBinding:binding,kind:session?'link':'login',expiresAt:flow.expiresAt,returnTo:safeReturnTo(location.pathname+location.search+location.hash),membershipId:session?.user.membershipId,sessionId:session?.user.sessionId};sessionStorage.setItem(oidcKey(flow.state),JSON.stringify(saved));location.assign(destination.href);
}
