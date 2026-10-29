import {env} from 'cloudflare:workers';
import {validateSnapshot} from '../app/api/shared';
import {readCatalog,saveCatalog} from './workspace-store';
export async function importCourseCatalog(user:{userId:string,email:string}){
 const runtime=env as unknown as Record<string,string|undefined>;
 const raw=runtime.COURSE_IMPORT_JSON||Array.from({length:8},(_,i)=>runtime['COURSE_IMPORT_JSON_'+(i+1)]||'').join('');
 if(!raw||!runtime.COURSE_IMPORT_OWNER_EMAIL||user.email.toLowerCase()!==runtime.COURSE_IMPORT_OWNER_EMAIL.toLowerCase())return;
 const entries=validateSnapshot(JSON.parse(raw)).courses;
 const current=await readCatalog(user.userId),existing=current.snapshot.courses;let changed=false;
 for(const entry of entries){const old=existing.find((c:any)=>c.id===entry.id||(c.name===entry.name&&c.category===entry.category));if(!old){existing.push(entry);changed=true;}else for(const field of ['semester','courseType','collapsed'])if(old[field]===undefined&&entry[field]!==undefined){old[field]=entry[field];old.updatedAt=Date.now();changed=true;}}
 if(changed){await saveCatalog(user.userId,existing);return readCatalog(user.userId);}return current;
}
