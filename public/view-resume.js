/* Tab-local view history and reading position; study records remain in cloud sync. */
window.createShizhiResume=({workspace,state,navigate,$})=>{
 const key='shizhi-view-v1:'+workspace,marker='shizhiNavigation';let restoring=true,timer,ready=false,routeKey='',revision=0;
 const active=()=>document.querySelector('.conversation-view:not(.hidden)');
 const valid=s=>s?.version===1&&['home','courses','course','lesson','ask','homework','review','paper','area'].includes(s.page);
 const identity=s=>JSON.stringify([s.page,s.courseId,s.conversationId||'',s.page==='lesson'?s.lessonIndex:0,s.page==='paper'?s.fileTab:'']);
 const entry=()=>history.state?.[marker]?.workspace===workspace?history.state[marker]:null;
 try{history.scrollRestoration='manual';}catch{}
 function capture(){const s=state(),view=active(),chat=view?.querySelector('.chat-messages'),r=chat?.getBoundingClientRect(),anchor=chat&&[...chat.querySelectorAll('[data-message-id]')].find(n=>n.getBoundingClientRect().bottom>r.top+1);return {version:1,...s,scroll:{x:scrollX,y:scrollY,sidebar:$('#sidebar').scrollTop,chat:chat?{top:chat.scrollTop,left:chat.scrollLeft,anchor:anchor?.dataset.messageId,offset:anchor?anchor.getBoundingClientRect().top-r.top:0}:null,history:view?.querySelector('.conversation-history')?.scrollTop||0}};}
 function remember(view){try{sessionStorage.setItem(key,JSON.stringify(view));}catch{}}
 function put(view,index,push=false){const url=new URL(location.href);url.hash='view='+view.page;history[push?'pushState':'replaceState']({...history.state,[marker]:{workspace,index,view}},'',url);routeKey=identity(view);updateButton();}
 function updateButton(){const b=$('#workspace-back');if(b)b.disabled=!ready||restoring||(!entry()?.index&&state().page==='home');}
 function save(){if(restoring||!ready)return;try{const view=capture();remember(view);if(identity(view)===routeKey)put(view,entry()?.index||0);}catch{/* Storage/history denial must not block navigation. */}}
 function pageChanged(){if(restoring||!ready)return;const view=state();if(identity(view)!==routeKey){clearTimeout(timer);try{const saved=capture();put(saved,(entry()?.index||0)+1,true);remember(saved);}catch{}return;}schedule();}
 function schedule(){if(restoring)return;clearTimeout(timer);timer=setTimeout(save,150);}
 const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 async function restore(saved,ticket){
  const applied=await navigate(valid(saved)?saved:null,()=>ticket===revision);if(ticket!==revision)return;
  const chat=active()?.querySelector('.chat-messages');if(valid(saved)&&applied&&chat?.shizhiAssets)await Promise.race([chat.shizhiAssets,new Promise(resolve=>setTimeout(resolve,5000))]);await frame();await frame();if(ticket!==revision)return;
  if(valid(saved)&&applied){const view=active(),position=saved.scroll||{};if(chat&&position.chat){chat.scrollTop=Number(position.chat.top)||0;chat.scrollLeft=Number(position.chat.left)||0;const anchor=[...chat.querySelectorAll('[data-message-id]')].find(n=>n.dataset.messageId===position.chat.anchor);if(anchor)chat.scrollTop+=anchor.getBoundingClientRect().top-chat.getBoundingClientRect().top-(Number(position.chat.offset)||0);}if(view)view.querySelector('.conversation-history').scrollTop=Number(position.history)||0;$('#sidebar').scrollTop=Number(position.sidebar)||0;window.scrollTo({left:Number(position.x)||0,top:Number(position.y)||0,behavior:'instant'});}
 }
 async function start(){let saved=entry()?.view;try{saved??=JSON.parse(sessionStorage.getItem(key));}catch{}const ticket=++revision;try{await restore(saved,ticket);}finally{restoring=false;ready=true;try{const view=capture();if(!entry()){const home={...view,page:'home',conversationId:null,scroll:{x:0,y:0,sidebar:0}};put(home,0);put(view,1,true);}else put(view,entry().index);remember(view);}catch{}updateButton();}}
 window.addEventListener('popstate',async e=>{const target=e.state?.[marker];if(target?.workspace!==workspace)return;clearTimeout(timer);const ticket=++revision;restoring=true;updateButton();try{await restore(target.view,ticket);}finally{if(ticket===revision){restoring=false;ready=true;try{const view=capture();put(view,target.index);remember(view);}catch{}updateButton();}}});
 document.addEventListener('scroll',schedule,{capture:true,passive:true});window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save();});
 document.addEventListener('click',save,{capture:true});
 const button=$('#workspace-back');if(button)button.onclick=()=>{if(restoring||!ready)return;save();if(entry()?.index>0)history.back();else if(state().page!=='home')void navigate({...state(),version:1,page:'home'});};
 return {start,pageChanged,save};
};
