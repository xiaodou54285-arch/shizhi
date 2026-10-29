import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const html=fs.readFileSync(new URL('../public/space.html',import.meta.url),'utf8');
for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g))if(!match[1].includes('application/json'))new Function(match[2]);
const commands=[['node_modules/typescript/bin/tsc','--noEmit','--incremental','false'],['tests/audit-regressions.cjs'],...['stream-renderer.js','cloud-sync.js','conversation-workspace.js','document-reader.js','split-reader.js','view-resume.js','paper-board.js'].map(file=>['--check','public/'+file])];
for(const args of commands){const result=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
console.log('PASS: types, account isolation/cancellation regressions, and application script syntax.');
