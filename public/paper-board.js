/* Reorder metadata only. Original files and course ownership stay intact. */
window.ShizhiPaperOrder=(files)=>[...files].sort((a,b)=>{
 const x=Number.isFinite(a.paperOrder)?a.paperOrder:Infinity,y=Number.isFinite(b.paperOrder)?b.paperOrder:Infinity;
 return (x-y)||Number(b.createdAt||0)-Number(a.createdAt||0)||a.id.localeCompare(b.id);
});
window.createShizhiPaperBoard=({grid,onReorder,toast})=>{
 let drag=null,frame=0;
 const cards=()=>[...grid.querySelectorAll(':scope > [data-paper-id]')].sort((a,b)=>(Number(a.style.order)||0)-(Number(b.style.order)||0));
 const ids=()=>cards().map(el=>el.dataset.paperId);
 function restore(order){const map=new Map(cards().map(el=>[el.dataset.paperId,el]));for(const id of order)if(map.has(id)){const card=map.get(id);card.style.order='';grid.append(card);}}
 function moveAt(x,y){const hit=document.elementFromPoint(x,y)?.closest('[data-paper-id]');if(!hit||hit.parentElement!==grid||hit===drag.card)return;const nodes=cards(),from=nodes.indexOf(drag.card),to=nodes.indexOf(hit);nodes.splice(from,1);nodes.splice(to,0,drag.card);nodes.forEach((card,i)=>card.style.order=String(i));}
 function tick(){frame=0;if(!drag?.active)return;const edge=64,step=drag.y<edge?-16:drag.y>innerHeight-edge?16:0;if(step)window.scrollBy({top:step,behavior:'instant'});moveAt(drag.x,drag.y);frame=requestAnimationFrame(tick);}
 function finish(cancel=false){if(!drag)return;const old=drag;drag=null;cancelAnimationFrame(frame);frame=0;old.card.classList.remove('paper-dragging');old.handle.setAttribute('aria-pressed','false');if(old.handle.hasPointerCapture(old.pointer))old.handle.releasePointerCapture(old.pointer);if(cancel){restore(old.order);return;}const order=ids();restore(order);if(old.active&&order.join('|')!==old.order.join('|'))onReorder(order);}
 grid.addEventListener('pointerdown',e=>{const handle=e.target.closest('[data-paper-drag]');if(!handle||e.button!==0||drag)return;const card=handle.closest('[data-paper-id]');e.preventDefault();handle.focus({preventScroll:true});drag={handle,card,pointer:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,order:ids(),active:false};handle.setPointerCapture(e.pointerId);});
 grid.addEventListener('pointermove',e=>{if(!drag||drag.pointer!==e.pointerId)return;drag.x=e.clientX;drag.y=e.clientY;if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>6){drag.active=true;drag.card.classList.add('paper-dragging');drag.handle.setAttribute('aria-pressed','true');frame=requestAnimationFrame(tick);}});
 grid.addEventListener('pointerup',e=>{if(drag?.pointer===e.pointerId)finish();});
 grid.addEventListener('pointercancel',()=>finish(true));grid.addEventListener('lostpointercapture',()=>finish(true));
 grid.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){finish(true);return;}const handle=e.target.closest('[data-paper-drag]');if(!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const order=ids(),index=order.indexOf(handle.dataset.paperDrag),next=index+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);if(next<0||next>=order.length)return;[order[index],order[next]]=[order[next],order[index]];restore(order);onReorder(order);grid.querySelector(`[data-paper-drag="${handle.dataset.paperDrag}"]`)?.focus({preventScroll:true});});
 function refreshArchive(){for(const el of grid.querySelectorAll('[data-archive-file]')){const saved=KoCloud.fileArchived(el.dataset.archiveFile);el.textContent=saved?'已存夸克':'等待归档到夸克';el.dataset.saved=String(saved);}for(const b of grid.querySelectorAll('[data-save-quark]'))b.hidden=KoCloud.fileArchived(b.dataset.saveQuark);}
 document.addEventListener('shizhi-archive-status',refreshArchive);
 return {beforeRender:()=>finish(true),refreshArchive,rendered:()=>{refreshArchive();void KoCloud.checkArchiveFiles(ids());}};
};
