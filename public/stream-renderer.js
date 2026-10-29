(function(){
 // Only the unfinished block changes while streaming. Previously completed
 // paragraphs and formulas retain their DOM nodes and KaTeX layout.
 function scan(text){
  let boundary=0,math=null,mathStart=-1,fence=false,inlineCode=false;
  for(let i=0;i<text.length;){
   if(text.startsWith('```',i)&&!math){fence=!fence;inlineCode=false;i+=3;continue;}
   if(fence){i++;continue;}
   if(text[i]==='`'&&!math){inlineCode=!inlineCode;i++;continue;}
   if(inlineCode){if(text[i]==='\n')inlineCode=false;i++;continue;}
   if(math){if(text.startsWith(math,i)){i+=math.length;math=null;mathStart=-1;}else if(text[i]==='\\'&&!['\\]','\\)'].includes(math)){i+=2;}else i++;continue;}
   if(text.startsWith('\\[',i)||text.startsWith('\\(',i)){math=text[i+1]==='['?'\\]':'\\)';mathStart=i;i+=2;continue;}
   if(text[i]==='\\'){i+=2;continue;}
   if(text[i]==='$'){math=text.startsWith('$$',i)?'$$':'$';mathStart=i;i+=math.length;continue;}
   if(text[i]==='\n'){const blank=text.slice(i).match(/^\n[ \t]*\n/);if(blank){boundary=i+blank[0].length;i=boundary;continue;}}
   i++;
  }
  return {boundary,mathStart};
 }
 window.createShizhiStreamRenderer=({renderMarkdown,renderMath})=>{
  const states=new WeakMap();
  const sanitize=text=>text.replace(/!\[[^\]]*\]\([^)]+\)/g,'（图片链接）').replace(/!\[\[[^\]]+\]\]/g,'（图片链接）');
  function fill(node,text){node.innerHTML=renderMarkdown(sanitize(text));renderMath(node);}
  return (body,text)=>{
   let state=states.get(body);
   if(!state||!text.startsWith(state.text)){
    const complete=document.createElement('div'),tail=document.createElement('div');
    complete.className='stream-complete';tail.className='stream-tail';body.replaceChildren(complete,tail);
    state={text:'',committed:'',tailText:null,complete,tail};states.set(body,state);
   }
   if(state.text===text&&state.tailText!==null)return;
   state.text=text;let tail=text.slice(state.committed.length);const found=scan(tail);
   if(found.boundary){
    const block=tail.slice(0,found.boundary),node=document.createElement('div');node.className='stream-block';fill(node,block);state.complete.append(node);state.committed+=block;tail=tail.slice(found.boundary);state.tailText=null;
   }
   const openAt=found.mathStart<0?-1:found.mathStart-found.boundary;
   const visible=openAt<0?tail:tail.slice(0,openAt),signature=visible+'\u0000'+(openAt>=0);
   if(signature!==state.tailText){
    fill(state.tail,visible);
    if(openAt>=0){const marker=document.createElement('span');marker.className='stream-formula-pending';marker.textContent='公式排版中…';state.tail.append(marker);}
    state.tailText=signature;
   }
  };
 };
})();
