/* Send a smaller copy when needed. Never replace retained originals. */
window.ShizhiModelImages={async prepare(entries,textBytes=0){
 const max=10*1024*1024-1024,images=entries.filter(e=>e.blob.type.startsWith('image/')),fixed=entries.filter(e=>!e.blob.type.startsWith('image/')).reduce((n,e)=>n+e.blob.size,0)+textBytes;
 if(entries.reduce((n,e)=>n+e.blob.size,0)+textBytes<=max&&!images.some(e=>e.blob.type==='image/bmp'))return entries;
 if(fixed>=max||!images.length)throw new Error('本次 PDF 原件或文档合计超过 10 MB，请分次引用或使用提取文字。');
 const allowance=Math.floor((max-fixed)/images.length);if(allowance<256*1024)throw new Error('本次文档留给图片的空间不足，请将图片与文档分次提交。');
 const output=[];for(const e of entries){if(!e.blob.type.startsWith('image/')){output.push(e);continue;}if(e.blob.size<=allowance&&e.blob.type!=='image/bmp'){output.push(e);continue;}
 let bitmap,url;try{try{bitmap=await createImageBitmap(e.blob);}catch{url=URL.createObjectURL(e.blob);bitmap=new Image();bitmap.src=url;await bitmap.decode();}let copy;const w=bitmap.width,h=bitmap.height;for(const [edge,quality] of [[3200,.92],[2800,.9],[2400,.88],[2000,.86]]){const scale=Math.min(1,edge/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);copy=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));canvas.width=canvas.height=0;if(copy&&copy.size<=allowance)break;}if(!copy||copy.size>allowance)throw new Error('图片压缩后仍过大，请把笔记分成两次发送，以保留手写清晰度。');output.push({...e,blob:copy});}finally{bitmap?.close?.();if(url)URL.revokeObjectURL(url);}}
 return output;
}};
