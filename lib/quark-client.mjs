import {createHash} from 'node:crypto';
const API='https://open-api-drive.quark.cn';
const hash=(algorithm,value)=>createHash(algorithm).update(value).digest('hex');
export class QuarkError extends Error{constructor(message,errno=0){super(message);this.errno=errno;}}
function stateSHA1(bytes){
 const h=[0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0],w=new Uint32Array(80);
 const rotate=(x,n)=>(x<<n)|(x>>>(32-n));
 for(let offset=0;offset+64<=bytes.length;offset+=64){
  for(let i=0;i<16;i++){const j=offset+i*4;w[i]=(bytes[j]<<24)|(bytes[j+1]<<16)|(bytes[j+2]<<8)|bytes[j+3];}
  for(let i=16;i<80;i++)w[i]=rotate(w[i-3]^w[i-8]^w[i-14]^w[i-16],1);
  let [a,b,c,d,e]=h;
  for(let i=0;i<80;i++){const f=i<20?(b&c)|(~b&d):i<40?b^c^d:i<60?(b&c)|(b&d)|(c&d):b^c^d;const k=i<20?0x5a827999:i<40?0x6ed9eba1:i<60?0x8f1bbcdc:0xca62c1d6;const t=(rotate(a,5)+f+e+k+w[i])>>>0;e=d;d=c;c=rotate(b,30);b=a;a=t;}
  h[0]=(h[0]+a)>>>0;h[1]=(h[1]+b)>>>0;h[2]=(h[2]+c)>>>0;h[3]=(h[3]+d)>>>0;h[4]=(h[4]+e)>>>0;
 }
 return h;
}
function proof(bytes,seed){if(!bytes.length)return '';const start=Number(BigInt('0x'+seed.slice(0,16))%BigInt(bytes.length));return Buffer.from(bytes.subarray(start,Math.min(start+8,bytes.length))).toString('base64');}
export class QuarkClient{
 /** @param {any} config
  * @param {typeof fetch} fetcher
  * @param {((token:string)=>Promise<any>)|null} renew */
 constructor(config,fetcher=fetch,renew=null){this.config=config;this.fetcher=fetcher;this.renew=renew;}
 headers(method,path){const time=String(Date.now());return {'x-pan-client-id':this.config.clientId,'x-pan-tm':time,'x-pan-token':hash('sha256',method.toUpperCase()+'&'+path+'&'+time+'&'+this.config.signKey),'Content-Type':'application/json',Accept:'application/json','X-Agent-ID':'codex',Authorization:'Bearer '+this.config.accessToken};}
 async request(path,method='GET',body=null,query={},customHeaders=null,retried=false){
  const url=new URL(API+path);url.searchParams.set('req_id',crypto.randomUUID());const oauth=path.startsWith('/agent/v1/oauth/');if(!oauth){url.searchParams.set('device_id',this.config.deviceId);url.searchParams.set('access_token',this.config.accessToken);url.searchParams.set('platform',this.config.platform||'Windows');}for(const [k,v]of Object.entries(query))url.searchParams.set(k,String(v));const headers=customHeaders||this.headers(method,path);if(oauth)delete headers.Authorization;
  let response;try{response=await this.fetcher(url,{method,headers,...(body!==null?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});}catch{throw new QuarkError('夸克暂时无法连接，请稍后重试');}
  let result;try{result=await response.json();}catch{throw new QuarkError('夸克返回异常，请稍后重试');}
  if(!response.ok||result.status!==0){if(!oauth&&!customHeaders&&!retried&&Number(result.errno)===11001&&this.renew){this.config=await this.renew(this.config.accessToken);return this.request(path,method,body,query,null,true);}throw new QuarkError(result.agent_msg||result.error_info||'夸克操作未完成',result.errno);}
  return result.data;
 }
 async info(fid){return this.request('/open/v1/file/info','GET',null,{fid,fetch_full_path:'1'});}
 async userInfo(){return this.request('/open/v1/user/info');}
 async createFolder(name,parent){const data=await this.request('/open/v1/dir','POST',{dir_path:name,pdir_fid:parent});if(!data?.fid)throw new QuarkError('夸克目录创建未完成');return data;}
 async refresh(){const path='/agent/v1/oauth/access_token/rotate';const data=await this.request(path,'POST',{refresh_token:this.config.refreshToken,device_id:this.config.deviceId});if(!data?.access_token||!data?.refresh_token)throw new QuarkError('夸克授权需要重新连接');const lifetime=Number(data.expires_in),absolute=Number(data.access_token_expires_at),expiresAt=absolute>1e12?absolute:absolute>1e9?absolute*1000:Date.now()+(Number.isFinite(lifetime)&&lifetime>0?lifetime:900)*1000;return {...this.config,accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt};}
 async upload(bytes,name,type,parent){
  try{return await this.uploadAttempt(bytes,name,type,parent);}catch(e){if(e instanceof QuarkError&&Number(e.errno)===11001&&this.renew){this.config=await this.renew(this.config.accessToken);return this.uploadAttempt(bytes,name,type,parent);}throw e;}
 }
 async uploadAttempt(bytes,name,type,parent){
  bytes=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);const path='/open/v1/file/upload_pre',headers=this.headers('POST',path),token=headers['x-pan-token'];
  const seed1=hash('md5',hash('md5',this.config.userId+token)),seed2=hash('md5',hash('md5',String(bytes.length)));
  const pre=await this.request(path,'POST',{file_name:name,size:bytes.length,sha1:hash('sha1',bytes),md5:hash('md5',bytes),pdir_fid:parent,format_type:type,l_created_at:Date.now(),l_updated_at:Date.now(),same_path_file_reuse:true,parallel_upload:true,hash_update:false,device_id:this.config.deviceId,device_name:'拾知学习空间',agent_id:'codex',proof_version:'v1',proof_seed1:seed1,proof_seed2:seed2,proof_code1:proof(bytes,seed1),proof_code2:proof(bytes,seed2),part_info_list:[{part_number:1,part_size:bytes.length,parallel_sha1_ctx:{part_offset:0,h:stateSHA1(bytes)}}]}, {},headers);
  if(pre.finish&&pre.fid)return {fid:pre.fid};
  const part=pre.upload_urls?.[0];if(!part?.upload_url||!part.signature_info?.signature)throw new QuarkError('夸克未返回上传地址');
  const url=new URL(part.upload_url);if(url.protocol!=='https:')throw new QuarkError('夸克上传地址无效');
  let response;try{response=await this.fetcher(url,{method:'PUT',headers:{...pre.common_headers,Authorization:part.signature_info.signature},body:bytes,signal:AbortSignal.timeout(90000),redirect:'manual'});}catch{throw new QuarkError('夸克文件传输未完成，请重试');}
  if(!response.ok)throw new QuarkError('夸克文件传输未完成（'+response.status+'），请重试');
  const etag=response.headers.get('etag');if(!etag)throw new QuarkError('夸克未确认文件上传');
  const finish=await this.request('/open/v1/file/upload_finish','POST',{task_id:pre.task_id,part_info_list:[{part_number:1,etag}]});if(!finish?.finish||!finish.fid)throw new QuarkError('夸克尚未完成文件保存');return {fid:finish.fid};
 }
 async download(fid){const data=await this.request('/open/v1/file/get_download_url','POST',{fid});const url=data.download_url||data.url;if(!url||new URL(url).protocol!=='https:')throw new QuarkError('夸克原文件地址不可用');let cookie='x_pan_client_id='+this.config.clientId+';x_pan_access_token='+this.config.accessToken;if(this.config.clientToken)cookie+=';x_pan_client_token='+this.config.clientToken;const response=await this.fetcher(url,{headers:{Cookie:cookie,Range:'bytes=0-'+(data.size-1)},signal:AbortSignal.timeout(90000),redirect:'manual'});if(!response.ok)throw new QuarkError('夸克原文件读取未完成');return response;}
}
