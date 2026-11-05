import {env} from 'cloudflare:workers';
import {user,json,failure,requireOrigin,limitedBody,ApiError} from '../shared';
import {clientFor,courseFolder,documentFolder,safeName,quarkFailure} from '../../../lib/quark-store';
export const dynamic='force-dynamic';
import {readWorkspace,coursePart} from '../../../lib/workspace-store';
async function snapshotFor(id:string,courseId?:string){return (await readWorkspace(id,courseId)).snapshot;}
export async function GET(req:Request){try{const u=await user(req),client=await clientFor(u.email),info=await client.userInfo(),root=await client.info(client.config.rootFid);if(root.filename!=='拾知')throw new ApiError(503,'指定的拾知目录发生变化，请重新确认');return json({connected:true,folder:root.filename,account:info.nickname});}catch(e){return failure(quarkFailure(e))}}
export async function POST(req:Request){try{
 const u=await user(req);requireOrigin(req);const raw=await limitedBody(req,128*1024);let input:any;try{input=JSON.parse(new TextDecoder().decode(raw))}catch{throw new ApiError(400,'无效的归档请求')}
 const client=await clientFor(u.email);let snapshot:any;if(Array.isArray(input.contextCourseIds)&&input.contextCourseIds.length<=10){snapshot={version:1,courses:[],lessons:{},state:{conversations:[],fileMeta:[],fileFolders:[],savedNotes:[],summaryRecords:{},courseMemories:{},questionRecords:[],quizRecords:[]}};for(const id of new Set(input.contextCourseIds as string[])){if(typeof id!=='string'||id.length>120)throw new ApiError(400,'课程信息不正确');const part=await snapshotFor(u.userId,id);snapshot.courses.push(...part.courses);Object.assign(snapshot.lessons,part.lessons);for(const k of ['conversations','fileMeta','fileFolders','savedNotes'])snapshot.state[k].push(...(part.state[k]||[]));Object.assign(snapshot.state.summaryRecords,part.state.summaryRecords);Object.assign(snapshot.state.courseMemories,part.state.courseMemories||{});}}else snapshot=await snapshotFor(u.userId);if(!snapshot)return json({saved:[],pending:[]});
 const folderSaved:string[]=[],folderPending:string[]=[];const folderIds=Array.isArray(input.folderIds)?input.folderIds:[];if(folderIds.length>30||folderIds.some((id:unknown)=>typeof id!=='string'))throw new ApiError(400,'一次最多同步 30 个文件夹');
 for(const id of folderIds){const folder=snapshot.state.fileFolders.find((f:any)=>f.id===id);const course=folder&&snapshot.courses.find((c:any)=>c.id===folder.course);if(!folder||!course)throw new ApiError(400,'文件夹或课程未找到');try{await documentFolder(client,u.userId,course,folder);folderSaved.push(id);}catch{folderPending.push(id);}}
 const requested=Array.isArray(input.fileIds)?input.fileIds:[];if(requested.length>30||requested.some((id:unknown)=>typeof id!=='string'))throw new ApiError(400,'一次最多归档 30 份附件');
 const saved:string[]=[],pending:string[]=[],errors:string[]=[];
 for(const id of requested){
  const file=snapshot.state.fileMeta.find((f:any)=>f.id===id);if(!file||!(file.kind==='paper'||file.archive===true))throw new ApiError(400,'这份附件尚未选择保存');
  const course=snapshot.courses.find((c:any)=>c.id===file.course);if(!course)throw new ApiError(400,'附件课程未找到');
  const key=u.userId+'/'+id;const record=await env.DB!.prepare('SELECT quark_fid FROM learning_files WHERE key=?').bind(key).first<{quark_fid:string|null}>();if(!record)throw new ApiError(400,'原文件尚未上传');
  const lease=await env.DB!.prepare('UPDATE learning_files SET archive_locked_until=? WHERE key=? AND archive_locked_until<?').bind(Date.now()+120000,key,Date.now()).run();if(!lease.meta.changes){pending.push(id);continue;}
  try{const selected=file.folderId?snapshot.state.fileFolders.find((f:any)=>f.id===file.folderId&&f.course===file.course):null;if(file.folderId&&!selected)throw new ApiError(400,'文件夹尚未同步');const folder=selected?await documentFolder(client,u.userId,course,selected):file.kind==='homework'?await documentFolder(client,u.userId,course,{id:'homework-unfiled-'+course.id,name:'未分类',kind:'homework'}):await courseFolder(client,u.userId,course);const locationId=u.userId+':file-location:'+id;
   if(record.quark_fid){const location=await env.DB!.prepare('SELECT fid FROM learning_quark_folders WHERE id=?').bind(locationId).first<{fid:string}>();if(location?.fid!==folder&&(location||selected)){const info=await client.info(record.quark_fid);if(info?.pdir_fid!==folder)await client.move(record.quark_fid,folder);}await env.DB!.prepare('INSERT INTO learning_quark_folders(id,fid) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET fid=excluded.fid').bind(locationId,folder).run();saved.push(id);continue;}
   const source=await env.BUCKET!.get(key);if(!source)throw new ApiError(503,'原文件暂时不可用');const ext=file.name.match(/\.[^.]+$/)?.[0]||'';const name=safeName(file.title||file.name.replace(/\.[^.]+$/,''))+'--'+file.id+ext;
   const result=await client.upload(new Uint8Array(await source.arrayBuffer()),name,file.type,folder);await env.DB!.prepare('UPDATE learning_files SET quark_fid=?,archived_at=? WHERE key=?').bind(result.fid,Date.now(),key).run();await env.DB!.prepare('INSERT INTO learning_quark_folders(id,fid) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET fid=excluded.fid').bind(locationId,folder).run();await env.BUCKET!.delete(key);saved.push(id);
  }catch(e){pending.push(id);errors.push(quarkFailure(e).message);}finally{await env.DB!.prepare('UPDATE learning_files SET archive_locked_until=0 WHERE key=?').bind(key).run();}
 }
 const requestedCourses=Array.isArray(input.courseIds)?input.courseIds:[];if(requestedCourses.length>10)throw new ApiError(400,'一次最多整理 10 门课程');
 const notesSaved:string[]=[],notesPending:string[]=[];
 for(const courseId of requestedCourses){
  const course=snapshot.courses.find((c:any)=>c.id===courseId);if(!course)throw new ApiError(400,'课程未找到');
  const notes=snapshot.state.savedNotes.filter((n:any)=>n.course===courseId),papers=snapshot.state.fileMeta.filter((f:any)=>f.course===courseId&&['paper','material'].includes(f.kind)),summary=snapshot.state.summaryRecords[courseId],memory=snapshot.state.courseMemories?.[courseId];
  const reviews=snapshot.state.conversations.filter((c:any)=>c.course===courseId&&c.mode==='review');
  if(!notes.length&&!papers.length&&!summary&&!memory?.text&&!reviews.some((c:any)=>c.messages.length))continue;
  const text=['# '+course.name+' · 笔记整理','',...notes.flatMap((n:any)=>['## '+(n.title||'学习笔记'),n.text||'','']),...papers.flatMap((p:any)=>['## '+(p.title||p.name),'原文件：'+p.name,p.transcript||'','']),...(summary?['## 复习总结',summary.text||'','']:[]),...(memory?.text?['## 本课长期记录',memory.text,'']:[]),...reviews.flatMap((c:any)=>c.messages.length?['## '+c.title,...c.messages.flatMap((m:any)=>[m.text||'',''])]:[])].join('\n');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join(''),id=u.userId+':'+courseId;
  await env.DB!.prepare('INSERT OR IGNORE INTO learning_quark_notes(id,digest,fid,locked_until) VALUES(?,?,?,0)').bind(id,'','').run();
  const prior=await env.DB!.prepare('SELECT digest FROM learning_quark_notes WHERE id=?').bind(id).first<{digest:string}>();if(prior?.digest===digest){notesSaved.push(courseId);continue;}
  const lease=await env.DB!.prepare('UPDATE learning_quark_notes SET locked_until=? WHERE id=? AND locked_until<?').bind(Date.now()+120000,id,Date.now()).run();if(!lease.meta.changes){notesPending.push(courseId);continue;}
  try{const latest=await snapshotFor(u.userId,courseId);if(JSON.stringify(coursePart(latest,courseId))!==JSON.stringify(coursePart(snapshot,courseId))){notesPending.push(courseId);continue;}const folder=await courseFolder(client,u.userId,course),result=await client.upload(new TextEncoder().encode(text),'笔记整理.md','text/markdown',folder);await env.DB!.prepare('UPDATE learning_quark_notes SET digest=?,fid=? WHERE id=?').bind(digest,result.fid,id).run();notesSaved.push(courseId);}catch(e){notesPending.push(courseId);errors.push(quarkFailure(e).message);}finally{await env.DB!.prepare('UPDATE learning_quark_notes SET locked_until=0 WHERE id=?').bind(id).run();}
 }
 return json({saved,pending,folderSaved,folderPending,notesSaved,notesPending,message:errors[0]||null});
}catch(e){return failure(quarkFailure(e))}}
