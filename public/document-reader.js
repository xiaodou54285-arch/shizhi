// File contents are learning material, never application instructions.
// Reader libraries are served from this Site and loaded only for attachments.
let zipLib,pdfLib;
const MAX_TEXT=120000;
function bounded(text){if(text.length>MAX_TEXT)throw Error('文件提取文字超过 12 万字符（含字母和空格），请拆分文件后提交。');return text;}
function xml(bytes){const text=new TextDecoder().decode(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('文档包含不支持的 XML 声明。');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('文档结构无法读取，请另存后重试。');return doc;}
function paragraphs(doc){return [...doc.getElementsByTagNameNS('*','p')].map(p=>[...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join('')).filter(Boolean).join('\n');}
// PDF.js getTextContent uses async stream iteration, unavailable on some iPads.
// Read text chunks with the same reader API used by our streamed AI replies.
async function readPdfPageText(page){
 const reader=page.streamTextContent().getReader();let text='',finished=false;
 try{for(;;){const {done,value}=await reader.read();if(done){finished=true;break;}for(const item of value.items)if(typeof item.str==='string')text+=item.str+(item.hasEOL?'\n':' ');bounded(text);}return text.trim();}
 finally{if(!finished)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function pageImage(page){
 const base=page.getViewport({scale:1});let image;
 for(const [width,quality] of [[1600,.8],[1300,.74],[1000,.68]]){
  const viewport=page.getViewport({scale:Math.min(2,width/base.width)}),canvas=document.createElement('canvas');
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  try{const context=canvas.getContext('2d');if(!context)throw Error('无法绘制 PDF 页面');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);await page.render({canvasContext:context,viewport}).promise;image=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(image&&image.size<=650*1024)return image;}
  finally{canvas.width=canvas.height=0;}
 }
 throw Error('PDF 页面图片过大，请只附上需要讨论的页面。');
}
export function selectPdfPages(missing,total,{pageRange='',preferEnd=false}={}){
 const match=pageRange&&String(pageRange).match(/^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/),start=match?Number(match[1]):0,end=match?Number(match[2]||match[1]):0;
 if(pageRange&&(!match||start<1||end<start||end>total))throw Error('PDF 页码范围请输入 1～'+total+' 页。');
 return pageRange?Array.from({length:end-start+1},(_,i)=>start+i):preferEnd?[...missing].reverse():missing;
}
export async function pdfPageCount(blob){
 const pdfjs=await (pdfLib??=import('/vendor/pdf.mjs?v=20261014-compat'));
 pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs?v=20261014-compat';
 const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false});
 try{return (await task.promise).numPages;}finally{await task.destroy();}
}
export async function readDocument(blob,name,{pageImages=false,pageRange='',preferEnd=false}={}){
 const ext=name.split('.').pop().toLowerCase();
 if(['txt','md','markdown'].includes(ext))return {text:bounded(await blob.text()),note:'文件全文文字'};
 if(['ppt','doc'].includes(ext))throw Error('旧版 '+ext.toUpperCase()+' 请另存为 '+(ext==='ppt'?'PPTX':'DOCX')+' 或 PDF 后提交。');
 if(['pptx','docx'].includes(ext)){
  const {unzipSync}=await (zipLib??=import('/vendor/fflate.mjs'));
  let total=0;
  const files=unzipSync(new Uint8Array(await blob.arrayBuffer()),{filter:entry=>{
   const selected=ext==='pptx'?/^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(entry.name):/^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(entry.name);
   if(selected){total+=entry.originalSize;if(total>12*1024*1024)throw Error('文档展开后过大，请拆分文件。');}return selected;
  }});
  const names=Object.keys(files).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const text=bounded(names.map(path=>{const content=paragraphs(xml(files[path]));const n=path.match(/(?:slide|notesSlide)(\d+)/)?.[1];return content?(n?'【'+(path.includes('notesSlides')?'讲者备注':'幻灯片')+' '+n+'】\n':'')+content:'';}).filter(Boolean).join('\n\n'));
  if(!text.trim())throw Error('这份文档没有可提取的文字，请附上页面截图。');
  return {text,note:ext==='pptx'?'幻灯片及讲者备注文字；图片、图表和公式版式未读取':'文档正文、页眉页脚及注释文字；图片和公式版式未读取'};
 }
 if(ext==='pdf'){
  const pdfjs=await (pdfLib??=import('/vendor/pdf.mjs?v=20261014-compat'));
  pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs?v=20261014-compat';
  const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false});
  let pdf;
  try{pdf=await task.promise;if(pdf.numPages>200)throw Error('PDF 超过 200 页，请拆分后提交。');let parts=[],missing=[],images=[];
   for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);let text;try{text=await readPdfPageText(page);}finally{page.cleanup();}if(!text){missing.push(i);if(!pageImages)parts.push('【PDF 第 '+i+' 页：未提取到文字，页面可能是图片或空白；需要截图才能读取】');}else parts.push('【PDF 第 '+i+' 页】\n'+text);bounded(parts.join('\n\n'));}
   const candidates=pageImages?selectPdfPages(missing,pdf.numPages,{pageRange,preferEnd}):[];
   const imageBudget=9*1024*1024-new TextEncoder().encode(parts.join('\n\n')).length;let imageBytes=0;
   for(const i of candidates){const page=await pdf.getPage(i);try{const blob=await pageImage(page);if(imageBytes+blob.size>imageBudget)break;images.push({page:i,blob});imageBytes+=blob.size;}finally{page.cleanup();}}
   images.sort((a,b)=>a.page-b.page);const selected=images.map(x=>x.page);
   if(missing.length===pdf.numPages&&!pageImages)throw Error('PDF 第 '+missing.slice(0,8).join('、')+' 页没有可提取文字；请换支持直接读取 PDF 的模型，或附上这些页的截图。');
   const imageOnly=pageImages&&missing.length===pdf.numPages,text=parts.join('\n\n')||(imageOnly?'这份 PDF 没有可提取的文字；页面图片会随提问发送给模型。':'');
   const selection=selected.length?'第 '+(selected.every((n,i)=>!i||n===selected[i-1]+1)?selected[0]+'～'+selected.at(-1):selected.join('、'))+' 页':'无图像页';
   return {text:bounded(text),note:pageImages?(missing.length>selected.length||pageRange?'PDF 共 '+pdf.numPages+' 页；本次以页面图片读取'+selection+'；其余图片页未读取，可在附件处设置页码范围。':selected.length?'PDF '+selection+'以页面图片提供给模型；其余页面提取文字':'PDF 每页文字；图片、图表和版式未读取'):missing.length?'PDF 文字已读取；第 '+missing.slice(0,16).join('、')+(missing.length>16?' 等 '+missing.length+' 页':' 页')+'未提取到文字，需附截图；图片、图表及版式未读取':'PDF 每页文字；图片、图表和版式未读取',...(pageImages?{images,imageOnly,totalPages:pdf.numPages}:{})};
  }catch(e){if(e.name==='PasswordException')throw Error('PDF 有密码保护，请解锁后提交。');throw e;}finally{await task.destroy();}
 }
 throw Error('请选择 PDF、PPTX、DOCX、TXT 或 Markdown 文件。');
}
