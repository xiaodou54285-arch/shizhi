import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectRoot} from './sites-env.mjs';

// Wrangler records applied migrations; this command only uses local storage.
const folder=path.join(projectRoot,'.sites-runtime');
await fs.mkdir(folder,{recursive:true});
const config=path.join(folder,'local-database.json');
await fs.writeFile(config,JSON.stringify({
 name:'shizhi-local-database',compatibility_date:'2026-05-15',
 d1_databases:[{binding:'DB',database_name:'site-creator-d1',
  database_id:'00000000-0000-4000-8000-000000000000',
  migrations_dir:path.join(projectRoot,'drizzle')}],
},null,2));
const result=spawnSync(process.execPath,[
 path.join(projectRoot,'node_modules/wrangler/bin/wrangler.js'),
 'd1','migrations','apply','DB','--local','--config',config,
 '--persist-to',path.join(projectRoot,'.wrangler/state'),
],{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;
process.exitCode=result.status??1;
