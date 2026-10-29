import {env} from 'cloudflare:workers';
import {QuarkClient,QuarkError} from './quark-client.mjs';
import {ApiError} from '../app/api/shared';
type Config={clientId:string;signKey:string;accessToken:string;refreshToken:string;clientToken?:string;userId:string;deviceId:string;platform:string;rootFid:string;expiresAt?:number;authorizationRevision?:string};
type Runtime={QUARK_AUTH_JSON?:string;QUARK_ALLOWED_EMAIL?:string;QUARK_ENCRYPTION_KEY?:string};
const runtime=()=>env as unknown as Runtime;
const tokenExpiry=(config:Config)=>{if(config.expiresAt)return config.expiresAt;try{return Number(JSON.parse(atob(config.accessToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp)*1000}catch{return 0}};
async function cryptKey(){const key=runtime().QUARK_ENCRYPTION_KEY;if(!key)throw new ApiError(503,'夸克连接尚未配置');return crypto.subtle.importKey('raw',Uint8Array.from(atob(key),c=>c.charCodeAt(0)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function encrypt(config:Config){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},await cryptKey(),new TextEncoder().encode(JSON.stringify(config)));return btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...new Uint8Array(ciphertext)));}
async function decrypt(value:string){const [iv,data]=value.split('.');const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(iv),c=>c.charCodeAt(0))},await cryptKey(),Uint8Array.from(atob(data),c=>c.charCodeAt(0)));return JSON.parse(new TextDecoder().decode(clear)) as Config;}
export function guardQuark(email:string){const r=runtime();if(!r.QUARK_AUTH_JSON||!r.QUARK_ENCRYPTION_KEY)throw new ApiError(503,'夸克连接尚未配置');if(!r.QUARK_ALLOWED_EMAIL||email.toLowerCase()!==r.QUARK_ALLOWED_EMAIL.toLowerCase())throw new ApiError(403,'这份夸克连接只属于学习空间的主人');}
export async function clientFor(email:string){
 guardQuark(email);const initial=JSON.parse(runtime().QUARK_AUTH_JSON!) as Config;
 const config=await authorization(initial);return new QuarkClient(config,fetch,(rejectedToken:string)=>authorization(initial,rejectedToken));
}
async function authorization(initial:Config,rejectedToken?:string){
 const row=await env.DB!.prepare('SELECT value FROM learning_quark_auth WHERE id=?').bind('owner').first<{value:string}>();let config=row?await decrypt(row.value):initial;
 const replaced=()=>Boolean(initial.authorizationRevision&&config.authorizationRevision!==initial.authorizationRevision);
 const expired=()=>tokenExpiry(config)<=Date.now()+90000||Boolean(rejectedToken&&config.accessToken===rejectedToken);
 if(!replaced()&&!expired())return config;
 await env.DB!.prepare('INSERT OR IGNORE INTO learning_quark_auth(id,value,locked_until) VALUES(?,?,0)').bind('owner',await encrypt(config)).run();
 const lock=await env.DB!.prepare('UPDATE learning_quark_auth SET locked_until=? WHERE id=? AND locked_until<?').bind(Date.now()+30000,'owner',Date.now()).run();
 if(!lock.meta.changes)throw new ApiError(503,'夸克正在续期授权，请稍后重试');
 try{const latest=await env.DB!.prepare('SELECT value FROM learning_quark_auth WHERE id=?').bind('owner').first<{value:string}>();config=await decrypt(latest!.value);let changed=false;if(replaced()){config=initial;changed=true;}if(expired()){config=await new QuarkClient(config).refresh() as Config;changed=true;}if(changed)await env.DB!.prepare('UPDATE learning_quark_auth SET value=? WHERE id=?').bind(await encrypt(config),'owner').run();return config;}catch(e){console.error('Quark authorization renewal failed',{name:e instanceof Error?e.name:'unknown',errno:e instanceof QuarkError?e.errno:0});if(e instanceof QuarkError)throw new ApiError(503,'夸克授权续期未完成：'+e.message);throw new ApiError(503,'夸克授权需要重新连接，请在这里联系课程助手');}finally{await env.DB!.prepare('UPDATE learning_quark_auth SET locked_until=0 WHERE id=?').bind('owner').run();}
}
export function safeName(value:string){return value.replace(/[\\/\x00-\x1f:*?"<>|]/g,'_').trim().slice(0,90)||'我的课程';}
export async function courseFolder(client:QuarkClient,userId:string,course:{id:string;name:string}){
 const id=userId+':'+course.id;const existing=await env.DB!.prepare('SELECT fid FROM learning_quark_folders WHERE id=?').bind(id).first<{fid:string}>();if(existing)return existing.fid;
 const folder=await client.createFolder(safeName(course.name)+'（'+course.id.slice(-8)+'）',client.config.rootFid);await env.DB!.prepare('INSERT OR IGNORE INTO learning_quark_folders(id,fid) VALUES(?,?)').bind(id,folder.fid).run();return folder.fid;
}
export function quarkFailure(error:unknown){if(error instanceof ApiError)return error;if(error instanceof QuarkError)return new ApiError(503,'夸克归档暂未完成：'+error.message);console.error('Quark internal failure',error instanceof Error?error.name:'unknown');return new ApiError(503,'夸克归档暂未完成，请稍后重试');}
