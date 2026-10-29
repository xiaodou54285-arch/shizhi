import {mkdir,copyFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),target=new URL('public/vendor/',root);
await mkdir(target,{recursive:true});
for(const [source,name] of [['pdfjs-dist/legacy/build/pdf.mjs','pdf.mjs'],['pdfjs-dist/legacy/build/pdf.worker.mjs','pdf.worker.mjs'],['pdfjs-dist/LICENSE','pdfjs-LICENSE.txt'],['fflate/esm/browser.js','fflate.mjs'],['fflate/LICENSE','fflate-LICENSE.txt']])await copyFile(new URL('node_modules/'+source,root),new URL(name,target));
