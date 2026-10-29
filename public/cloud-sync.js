(function(){
 const core=KoSyncCore,fields={deletedFiles:'shizhi-deleted-files',deletedConversations:'shizhi-deleted-conversations',conversations:'shizhi-conversations',fileMeta:'shizhi-files',questionRecords:'shizhi-questions',summaryRecords:'shizhi-summaries',savedNotes:'shizhi-notes',quizRecords:'shizhi-quiz-records',courseMemories:'shizhi-course-memories'};
 let accountKey='',authBlocked=false,lastSyncError=null,syncCourseId=null;
 let prefix='',revision=0,last=core.blank(),adapter=null,dirty=false,online=false,busy=false,booted=false,timer=null,db=null,cacheQueue=Promise.resolve(),retryDelay=2000,catalogDirty=false;
 let partitions={},savedCatalog=[],quarkConnected=false,archiveBusy=false,paperDeleteBusy=false;
 const loaded=new Set(),pending=new Set(),versions=new Map(),resets=new Map(),knownFiles=new Set(),loading=new Map(),archivedFiles=new Set(),archivedNotes=new Map();
 const status=(text,kind='pending')=>{const b=document.getElementById('cloud-status');if(b){b.textContent=text;b.dataset.kind=kind;}};
 const archiveStatus=(text,kind='pending')=>{const b=document.getElementById('quark-status');if(b){b.textContent=text;b.title=text;b.dataset.kind=kind;b.hidden=kind!=='error';}document.dispatchEvent(new Event('shizhi-archive-status'));};
 function authNotice(changed=false){authBlocked=true;clearTimeout(timer);let box=document.getElementById('account-notice');if(!box){box=document.createElement('div');box.id='account-notice';box.setAttribute('role','alert');box.style.cssText='position:fixed;inset:0 0 auto;z-index:10000;padding:16px;background:#172d28;color:white;text-align:center;box-shadow:0 2px 14px #0003';document.body.append(box);}box.replaceChildren(document.createTextNode(changed?'账号已切换。请刷新以打开当前账号；原账号的本机记录会保留。 ':'登录已失效，本机记录仍保留。 '));const link=document.createElement('a');link.style.cssText='color:white;text-decoration:underline;margin-left:12px';link.textContent=changed?'刷新页面':'重新登录';link.href=changed?location.href:'/signin-with-chatgpt?return_to='+encodeURIComponent(location.pathname+location.search+location.hash);box.append(link);if(changed){box.style.inset='0';box.style.paddingTop='25vh';}}
 async function accountFetch(path,options={}){if(authBlocked)throw new Error('请先恢复登录或刷新页面');const headers=new Headers(options.headers);if(accountKey)headers.set('X-Shizhi-Account',accountKey);const r=await fetch(path,{...options,headers,credentials:'same-origin',cache:'no-store'});if(r.status===401){authNotice();throw Object.assign(new Error('登录已失效，请点击页面上方的重新登录；记录仍保留。'),{status:401});}if(r.status===409&&r.headers.get('content-type')?.includes('json')){const body=await r.clone().json().catch(()=>null);if(body?.error?.includes('账号已变化')){authNotice(true);throw new Error(body.error);}}return r;}
 async function request(path,options={}){return accountFetch(path,{...options,signal:options.signal||AbortSignal.timeout(options.method==='PUT'&&path.startsWith('/api/files/')?90000:45000)});}
 function checkAccount(remote){if(remote.user?.cacheKey!==accountKey){authNotice(true);throw new Error('账号已变化，请刷新页面');}}
 async function result(r){const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||'同步尚未完成'),{status:r.status});return data;}
 function openCache(name){return new Promise((resolve,reject)=>{const req=indexedDB.open('shizhi-text-'+name,1);req.onupgradeneeded=()=>req.result.createObjectStore('records');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 function cached(key){return new Promise((resolve,reject)=>{const tx=db.transaction('records'),req=tx.objectStore('records').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 function persist(){const snapshot=core.clone(last),savedLoaded=[...loaded],manifest={courses:snapshot.courses,pending:[...pending],catalogDirty,versions:Object.fromEntries(versions),resets:Object.fromEntries(resets)};cacheQueue=cacheQueue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');store.put(manifest,'catalog');for(const id of savedLoaded)store.put(core.course(snapshot,id),'course:'+id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);}));cacheQueue.catch(()=>status('本机保存失败 · 请导出备份','error'));return cacheQueue;}
 function legacyRead(key,def){try{return JSON.parse(localStorage.getItem(prefix+key))??def;}catch{return def;}}
 const schedule=(ms=900)=>{clearTimeout(timer);timer=setTimeout(flush,ms);dirty=catalogDirty||pending.size>0;status(navigator.onLine?'保存中…':'暂存本机 · 等待联网');};
 function apply(render=false){if(adapter)adapter.apply(core.clone(last),render);}
 async function catalog(){const remote=await result(await request('/api/workspace?catalog=1'));checkAccount(remote);if(remote.mode!=='courses')throw new Error('请重新发布最新网页后连接');revision=remote.revision;partitions=remote.partitions||{};savedCatalog=core.merge(remote.snapshot,remote.snapshot).courses;last.courses=core.merge({courses:savedCatalog},{courses:last.courses}).courses;catalogDirty=!core.equal(last.courses,savedCatalog);online=true;return remote;}
 async function ensureCourse(id,refresh=false){if(!id||id==='__none__')return;if(loading.has(id))return loading.get(id);if(loaded.has(id)&&!refresh)return;const task=(async()=>{if(!loaded.has(id)){const stored=await cached('course:'+id);if(stored)last=core.replaceCourse(last,stored,id);loaded.add(id);}if(navigator.onLine){const remote=await result(await request('/api/workspace?courseId='+encodeURIComponent(id))),part=core.project(remote.snapshot),local=core.course(last,id);checkAccount(remote);const reset=Number(remote.resetAt||0);const merged=reset>(resets.get(id)||0)?part:core.merge(part,local);last=core.replaceCourse(last,merged,id);versions.set(id,remote.courseRevision||0);resets.set(id,reset);for(const f of part.state.fileMeta)knownFiles.add(f.id);if(!core.equal(merged,part))pending.add(id);else pending.delete(id);online=true;}else if(!await cached('course:'+id))throw new Error('这门课还未缓存，请联网后打开一次');dirty=catalogDirty||pending.size>0;await persist();apply(false);})();loading.set(id,task);try{return await task;}finally{loading.delete(id);}};
 async function bootstrap(data){const identity=await result(await request('/api/workspace?catalog=1'));if(!/^[a-zA-Z0-9_-]{8,80}$/.test(identity.user?.cacheKey||''))throw new Error('账号信息未能确认，请刷新后重试');accountKey=identity.user.cacheKey;const legacyId=data.workspaceId,legacyPrefix='koLesson:'+legacyId+':';data.workspaceId=legacyId+'-account-'+accountKey;data.legacyWorkspaceId=identity.user.legacyCacheOwner===true?legacyId:null;prefix='koLesson:'+data.workspaceId+':';db=await openCache(data.workspaceId);let manifest=await cached('catalog');if(!manifest&&data.legacyWorkspaceId){const oldDb=await openCache(legacyId);const oldGet=key=>new Promise((resolve,reject)=>{const r=oldDb.transaction('records').objectStore('records').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const old=await oldGet('catalog');if(old){last.courses=old.courses||[];for(const c of last.courses){const part=await oldGet('course:'+c.id);if(part){last=core.replaceCourse(last,part,c.id);loaded.add(c.id);}}for(const id of old.pending||[])pending.add(id);catalogDirty=Boolean(old.catalogDirty);for(const [id,v]of Object.entries(old.versions||{}))versions.set(id,v);for(const [id,v]of Object.entries(old.resets||{}))resets.set(id,v);await persist();manifest=await cached('catalog');}oldDb.close();for(const key of Object.keys(localStorage))if(key.startsWith(legacyPrefix)&&localStorage.getItem(prefix+key.slice(legacyPrefix.length))===null)localStorage.setItem(prefix+key.slice(legacyPrefix.length),localStorage.getItem(key));const resume=sessionStorage.getItem('shizhi-view-v1:'+legacyId);if(resume&&!sessionStorage.getItem('shizhi-view-v1:'+data.workspaceId))sessionStorage.setItem('shizhi-view-v1:'+data.workspaceId,resume);}if(manifest){last.courses=manifest.courses||[];catalogDirty=Boolean(manifest.catalogDirty);for(const id of manifest.pending||[])pending.add(id);for(const [id,v] of Object.entries(manifest.versions||{}))versions.set(id,v);for(const [id,v] of Object.entries(manifest.resets||{}))resets.set(id,v);}else{last=core.project({courses:[...data.courses,...legacyRead('shizhi-extra-courses',[])],lessons:{...data.lessons,...legacyRead('shizhi-restored-lessons',{})},state:Object.fromEntries(Object.entries(fields).map(([f,k])=>[f,legacyRead(k,['summaryRecords','courseMemories'].includes(f)?{}:[])]))});for(const c of last.courses){loaded.add(c.id);pending.add(c.id);}catalogDirty=Boolean(last.courses.length);await persist();for(const k of [...Object.values(fields),'shizhi-extra-courses','shizhi-restored-lessons'])localStorage.removeItem(prefix+k);}
 for(const id of pending){const part=await cached('course:'+id);if(part){last=core.replaceCourse(last,part,id);loaded.add(id);}}
 try{await catalog();let selected;try{selected=JSON.parse(sessionStorage.getItem('shizhi-view-v1:'+data.workspaceId))?.courseId;}catch{}const first=(last.courses.find(c=>c.id===selected&&!c.collapsed)||last.courses.find(c=>!c.collapsed))?.id;if(first)await ensureCourse(first,true);dirty=catalogDirty||pending.size>0;status(dirty?'正在整理记录…':'已保存',dirty?'pending':'saved');}catch(e){dirty=catalogDirty||pending.size>0;status('尚未同步 · 点击重试','error');}data.courses=core.clone(last.courses);data.lessons=core.clone(last.lessons);booted=true;return data;}
 function capture(){if(!adapter)return;const current=core.stamp(core.project(adapter.snapshot()),last);if(!core.equal(current,last)){if(!core.equal(current.courses,last.courses))catalogDirty=true;for(const c of current.courses)if(!core.equal({...core.course(current,c.id),courses:[]},{...core.course(last,c.id),courses:[]})){loaded.add(c.id);pending.add(c.id);}last=core.clone(current);apply(false);persist();schedule();}}
 async function upload(part){for(const f of part.state.fileMeta){if(knownFiles.has(f.id))continue;let r=await request('/api/files/'+encodeURIComponent(f.id),{method:'HEAD'});if(r.ok){knownFiles.add(f.id);continue;}if(r.status!==404)throw new Error('附件状态暂时无法读取');const entry=await adapter.localFile(f.id);if(!entry?.blob)throw new Error('原文件缺失：'+f.name+'，请恢复完整备份');r=await request('/api/files/'+encodeURIComponent(f.id),{method:'PUT',headers:{'Content-Type':f.type},body:entry.blob});if(!r.ok)await result(r);knownFiles.add(f.id);}}
 function noteKey(s,id){return JSON.stringify({notes:s.state.savedNotes.filter(n=>n.course===id),papers:s.state.fileMeta.filter(f=>f.course===id&&['paper','material'].includes(f.kind)).map(f=>({id:f.id,title:f.title,transcript:f.transcript})),summary:s.state.summaryRecords[id],memory:s.state.courseMemories[id],review:s.state.conversations.filter(c=>c.course===id&&c.mode==='review')});}
 async function archive(snapshot){if(!quarkConnected||archiveBusy||paperDeleteBusy||!navigator.onLine)return;const files=snapshot.state.fileMeta.filter(f=>(f.kind==='paper'||f.archive===true)&&!archivedFiles.has(f.id)).slice(0,3),courseIds=[...loaded].filter(id=>noteKey(snapshot,id)!==archivedNotes.get(id)).slice(0,3);if(!files.length&&!courseIds.length)return;archiveBusy=true;try{const r=await accountFetch('/api/quark',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileIds:files.map(f=>f.id),courseIds,contextCourseIds:[...new Set([...courseIds,...files.map(f=>f.course)])]}),signal:AbortSignal.timeout(120000)}),data=await result(r);for(const id of data.saved||[])archivedFiles.add(id);for(const id of courseIds)if(!(data.notesPending||[]).includes(id))archivedNotes.set(id,noteKey(snapshot,id));if((data.pending||[]).length||(data.notesPending||[]).length)throw new Error(data.message||'附件等待保存');archiveStatus('附件已保存','saved');}catch(e){archiveStatus('归档未完成：'+e.message+' · 点击重试','error');}finally{archiveBusy=false;}}

 const archiveChecked=new Set(),archiveChecks=new Map();
 async function checkArchiveFiles(ids){const queue=[...new Set(ids)];await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length){const id=queue.shift();if(archivedFiles.has(id)||archiveChecked.has(id))continue;if(archiveChecks.has(id)){await archiveChecks.get(id);continue;}const task=(async()=>{try{const r=await request('/api/files/'+encodeURIComponent(id),{method:'HEAD'});if(r.ok){archiveChecked.add(id);if(r.headers.get('X-Archive-Status')==='saved'){archivedFiles.add(id);document.dispatchEvent(new Event('shizhi-archive-status'));}}}catch{/* A failed check is not a confirmed archive. */}})();archiveChecks.set(id,task);try{await task;}finally{archiveChecks.delete(id);}}}));}
 async function connectQuark(){try{await result(await request('/api/quark'));quarkConnected=true;await flush();}catch(e){quarkConnected=false;archiveStatus('夸克未连接：'+e.message+' · 点击重试','error');}}
 async function flush(options={}){
  if(authBlocked||!booted||!adapter||busy||(paperDeleteBusy&&!options.forDeletion))return;
  if(!navigator.onLine){status('暂存本机 · 等待联网');return;}
  busy=true;syncCourseId=null;lastSyncError=null;clearTimeout(timer);
  const before=core.clone(last),previousStats=JSON.stringify(Object.entries(partitions).map(([id,p])=>[id,p.stats]));
  try{
   capture();await cacheQueue;await catalog();apply(false);
   if(catalogDirty){await result(await request('/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'catalog',courses:last.courses})}));await catalog();}
   // The catalog gives the course revision. Reuse the loaded snapshot when it
   // matches; the write CAS still rejects a concurrent change after this read.
   const candidates=options.courseId?[options.courseId]:[...pending];
   for(const id of candidates){
    if(!pending.has(id))continue;syncCourseId=id;
    if(!loaded.has(id)||Number(partitions[id]?.revision||0)!==Number(versions.get(id)||0))await ensureCourse(id,true);
    if(!pending.has(id))continue;await upload(core.course(last,id));
    const part=core.course(last,id),r=await request('/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'course',courseId:id,revision:versions.get(id)||0,snapshot:part})});
    if(r.status===409){schedule(800);continue;}
    const data=await result(r);versions.set(id,data.courseRevision);revision=data.revision;
    if(core.equal(core.course(last,id),part))pending.delete(id);
   }
   // A foreground send need not wait for unrelated courses to refresh.
   if(!options.courseId)for(const id of [...loaded])if(!pending.has(id)&&Number(partitions[id]?.revision||0)>Number(versions.get(id)||0)){syncCourseId=id;await ensureCourse(id,true);}
   dirty=catalogDirty||pending.size>0;await persist();apply(!core.equal(before,last)||previousStats!==JSON.stringify(Object.entries(partitions).map(([id,p])=>[id,p.stats])));
   status(dirty?'保存中…':'已保存',dirty?'pending':'saved');if(dirty)schedule();retryDelay=2000;
   if(!options.forDeletion){void archive(core.clone(last));void cleanupDeletedFiles();}
  }catch(e){
   online=false;dirty=catalogDirty||pending.size>0;
   const timeout=e.name==='TimeoutError'||e.name==='AbortError';
   lastSyncError={courseId:syncCourseId,status:e.status||0,message:timeout?'同步连接超时，记录仍保存在本机。':e.message,at:Date.now()};
   status('同步未完成 · '+lastSyncError.message,'error');console.warn('学习同步尚未完成：',lastSyncError.message);
   clearTimeout(timer);if(!authBlocked)timer=setTimeout(flush,retryDelay);retryDelay=Math.min(30000,retryDelay*2);
  }finally{busy=false;syncCourseId=null;}
 }
 async function waitForCourse(courseId,{signal,timeout=120000,onProgress}={}){
  capture();const started=Date.now(),deadline=started+timeout;let retriedAt=0;
  for(;;){
   if(signal?.aborted)throw new Error('本次生成已停止');
   if(authBlocked)throw new Error('登录已失效或账号已切换，请使用页面上方提示恢复；记录仍保留。');
   if(!navigator.onLine)throw new Error('当前处于离线状态，记录已暂存本机；恢复联网后点击重试回复。');
   // Busy may belong to another course, or a background catalog refresh.
   if(!catalogDirty&&!pending.has(courseId)&&online)return;
   const error=lastSyncError,related=error&&(!error.courseId||error.courseId===courseId);
   if(related&&error.at>=started&&[400,403,404,410,413,415,422].includes(error.status))throw new Error('记录同步失败：'+error.message+'（本机记录已保留）');
   if(Date.now()>=deadline)throw new Error(related?'同步尚未完成：'+error.message+' 请稍后点击重试回复，无需重复上传。':'同步耗时较长，记录仍保存在本机；请稍后点击重试回复，无需重复上传。');
   onProgress?.(Date.now()-started>8000?'正在同步本条消息和附件，请稍候…':'正在保存本条消息…');
   if(!busy&&Date.now()-retriedAt>=2000){retriedAt=Date.now();void flush({courseId});}
   await new Promise(resolve=>{const done=()=>{clearTimeout(timerId);signal?.removeEventListener('abort',done);resolve();},timerId=setTimeout(done,100);signal?.addEventListener('abort',done,{once:true});});
  }
 }
 async function ensureAll(){for(const c of last.courses)await ensureCourse(c.id);apply(false);}
 async function history(id){await flush();return result(await request('/api/workspace?courseId='+encodeURIComponent(id)));}
 async function restore(id,version){if(busy)throw new Error('请等当前保存完成后再恢复');await flush();if(pending.has(id))throw new Error('请先完成本课同步');const latest=await history(id);await result(await request('/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'course',courseId:id,revision:latest.courseRevision,restoreRevision:version})}));await ensureCourse(id,true);apply(true);}
 async function remoteFile(id){if(!knownFiles.has(id))return null;const r=await request('/api/files/'+encodeURIComponent(id));return r.ok?{id,blob:await r.blob()}:null;}
 function attach(value){adapter=value;capture();if(dirty)schedule(100);document.getElementById('cloud-status').onclick=flush;document.getElementById('quark-status').onclick=connectQuark;connectQuark();setInterval(()=>{if(document.visibilityState==='visible'&&!busy)flush();},10000);window.addEventListener('online',flush);window.addEventListener('offline',()=>status('暂存本机 · 等待联网'));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')flush();});}
 window.KoCloud={fetch:accountFetch,bootstrap,attach,deletePaper,checkArchiveFiles,retryArchive:connectQuark,changed:capture,remoteFile,flush,waitForCourse,status,fileArchived:id=>archivedFiles.has(id),ensureCourse,ensureAll,history,restore,stats:id=>partitions[id]?.stats,hasCourse:id=>loaded.has(id),cacheValue:key=>core.clone(key==='shizhi-extra-courses'?last.courses:key==='shizhi-restored-lessons'?last.lessons:last.state[Object.keys(fields).find(f=>fields[f]===key)]??null),manages:key=>Object.values(fields).includes(key)||['shizhi-extra-courses','shizhi-restored-lessons'].includes(key),inspect:()=>({revision,dirty,online,busy,archiveBusy,quarkConnected,lastSyncError,syncCourseId,pendingCourses:[...pending],loadedCourses:[...loaded],archivedFiles:[...archivedFiles]})};
 const cleanedDeletes=new Set();
 async function cleanupDeletedFiles(){for(const d of (last.state.deletedFiles||[]).filter(d=>!cleanedDeletes.has(d.id)).slice(0,3)){try{const data=await result(await request('/api/files/'+encodeURIComponent(d.id),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId:d.course})}));if(!data.cleanupPending)cleanedDeletes.add(d.id);}catch{/* Retry retained cleanup markers on the next sync. */}}}
 const deletionDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function deletePaper(id,courseId){
  if(!navigator.onLine)throw new Error('请联网后删除，确保后台同时移除。');
  if(paperDeleteBusy)throw new Error('正在删除另一份笔记，请稍候。');
  paperDeleteBusy=true;
  try{
   const deadline=Date.now()+45000;
   while(busy){if(Date.now()>deadline)throw new Error('同步耗时较长，笔记尚未删除，请稍后重试。');await deletionDelay(100);}
   await flush({forDeletion:true});
   if(pending.has(courseId))throw new Error('这门课尚未保存完成，笔记未删除，请检查网络后重试。');
   let data;
   for(;;){try{data=await result(await request('/api/files/'+encodeURIComponent(id),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId})}));break;}catch(e){if(e.status!==409)throw e;if(Date.now()>deadline)throw new Error('这份笔记仍在归档，尚未删除，请稍后重试。');await deletionDelay(1000);}}
   last=core.replaceCourse(last,core.merge(core.course(last,courseId),data.snapshot),courseId);versions.set(courseId,data.courseRevision);knownFiles.delete(id);archivedFiles.delete(id);archiveChecked.delete(id);if(!data.cleanupPending)cleanedDeletes.add(id);await persist();apply(true);schedule();return data;
  }finally{paperDeleteBusy=false;}
 }


})();
