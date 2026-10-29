import {env} from 'cloudflare:workers';
import {user,json,failure,requireOrigin,limitedBody,ApiError} from '../shared';
import {LearningAIError,selectLearningRequest,buildLearningInput} from '../../../lib/learning-ai';
import {modelOptions,defaultModelId,selectProvider,providerRequest,consumeProviderStream} from '../../../lib/ai-providers';
import {readWorkspace} from '../../../lib/workspace-store';
import {webSearchAvailable,searchWeb,addWebContext} from '../../../lib/web-search';
export const dynamic='force-dynamic';
const runtime=()=>env as unknown as Record<string,string|undefined>;
async function owner(req?:Request){const u=await user(req),allowed=runtime().AI_ALLOWED_EMAIL||runtime().OPENAI_ALLOWED_EMAIL||runtime().COURSE_IMPORT_OWNER_EMAIL;if(!allowed||u.email.toLowerCase()!==allowed.toLowerCase())throw new ApiError(403,'此学习助手仅供空间主人使用');return u;}
export async function GET(req:Request){try{await owner(req);const models=modelOptions(runtime());return json({configured:models.length>0,models,defaultModel:defaultModelId(runtime()),webSearch:{available:webSearchAvailable(runtime()),provider:'DeepSeek 搜索',priceNote:'每次搜索约 ¥0.005，另计模型用量'}});}catch(e){return failure(e)}}
const headers={'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const streamError=(e:unknown)=>e instanceof LearningAIError||e instanceof ApiError?e.message:'连接暂时中断，已有内容已保留。请稍后重试。';
function savedOutput(raw:string){try{const value=JSON.parse(raw);if(value?.format==='shizhi-ai-output'&&typeof value.text==='string')return {text:value.text,sources:Array.isArray(value.sources)?value.sources:[],depth:value.depth};}catch{}return {text:raw,sources:[],depth:undefined};}
function serializeOutput(text:string,sources:any[],depth:unknown,failure?:unknown){return JSON.stringify({format:'shizhi-ai-output',text,failure,sources,depth});}
export async function POST(req:Request){
 let key='',claimed=false,timer:ReturnType<typeof setTimeout>|undefined;const abort=new AbortController(),disconnect=()=>abort.abort();req.signal.addEventListener('abort',disconnect,{once:true});
 try{
  const u=await owner(req);requireOrigin(req);
  let data;try{data=JSON.parse(new TextDecoder().decode(await limitedBody(req,14*1024*1024)))}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(400,'请求内容不正确')}
  const {snapshot}=await readWorkspace(u.userId,data.courseId);
  let selected=selectLearningRequest(snapshot,data,false);key=u.userId+':'+selected.message.id;
  const prior=await env.DB!.prepare('SELECT status,output,model,created_at FROM learning_ai_requests WHERE id=?').bind(key).first<{status:string,output:string,model:string,created_at:number}>();
  if(prior?.status==='complete')return new Response(JSON.stringify({type:'done',...savedOutput(prior.output),model:prior.model,cached:true})+'\n',{headers});
  if(prior?.status==='pending'&&Date.now()-prior.created_at<15*60*1000)throw new ApiError(409,'这条消息仍在生成中，请稍后重新查看');
  if(prior?.status==='pending'){await env.DB!.prepare("UPDATE learning_ai_requests SET status='failed' WHERE id=? AND status='pending' AND created_at=?").bind(key,prior.created_at).run();prior.status='failed';}
  if(data.lookupOnly){const saved=prior?.output?savedOutput(prior.output):null;if(saved?.text.trim())return new Response(JSON.stringify({type:'partial',...saved,model:prior!.model})+'\n',{headers});return json({cached:false});}
  if(prior&&!data.retry)throw new ApiError(409,'上次回复未完成，点击重试后再请求。');
  if(!modelOptions(runtime()).length)throw new ApiError(503,'模型尚未配置，内容已保存；请先完成账户连接。');
  const chosen=selectProvider(runtime(),data.modelId||selected.conversation.aiModel),apiKey=chosen.key;
  selected=selectLearningRequest(snapshot,data);
  if(data.webSearch!==undefined&&typeof data.webSearch!=='boolean')throw new ApiError(400,'联网选项不正确');
  if(selected.files.some((f:any)=>f.data?.startsWith('data:image/'))&&!chosen.model.vision)throw new ApiError(400,'这个模型不支持图片，请更换模型。');
  if(selected.files.some((f:any)=>f.data?.startsWith('data:application/pdf;'))&&(!chosen.model.pdf||chosen.provider.protocol!=='responses'))throw new ApiError(400,'这个模型不支持直接读取 PDF，请换模型或附上页面图片。');
  const model=()=>chosen.option.id;
  const prompt=buildLearningInput(snapshot,selected);
  providerRequest(chosen.provider,chosen.model,prompt,data.depth||selected.message.aiDepth||selected.conversation.aiDepth);
  const now=Date.now();
  const lock=prior?env.DB!.prepare("UPDATE learning_ai_requests SET status='pending',created_at=?,model=? WHERE id=? AND status='failed'").bind(now,model(),key):env.DB!.prepare("INSERT OR IGNORE INTO learning_ai_requests(id,user_id,conversation_id,message_id,status,output,model,created_at) VALUES(?,?,?,?,'pending','',?,?)").bind(key,u.userId,selected.conversation.id,selected.message.id,model(),now);
  if(!(await lock.run()).meta.changes)throw new ApiError(409,'这条消息已在处理，请稍后重新查看');claimed=true;
  if(data.webSearch===true)addWebContext(prompt,await searchWeb(runtime(),selected));
  const request=providerRequest(chosen.provider,chosen.model,prompt,data.depth||selected.message.aiDepth||selected.conversation.aiDepth);
  timer=setTimeout(()=>abort.abort(),request.timeout);if(req.signal.aborted)abort.abort();const upstream=await fetch(request.endpoint,{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(request.body),signal:abort.signal});
  if(!upstream.ok||!upstream.body){console.warn(JSON.stringify({event:'ai_upstream_http_error',model:model(),provider:chosen.provider.id,upstreamStatus:upstream.status}));await upstream.body?.cancel();throw new ApiError(upstream.status===429?429:502,upstream.status===401||upstream.status===403?'模型凭证或权限需要重新配置。':upstream.status===429?'模型额度或频率受限，请检查账户额度后重试。':upstream.status>=500?`这条模型线路暂时不可用（服务方返回 HTTP ${upstream.status}）。请切换模型或稍后重试。`:`模型服务未接受请求（HTTP ${upstream.status}），请检查接口配置。`)}
  const encoder=new TextEncoder();let output='';
  const body=new ReadableStream<Uint8Array>({start(controller){void (async()=>{let connected=true;const send=(item:unknown)=>{if(connected)try{controller.enqueue(encoder.encode(JSON.stringify(item)+'\n'))}catch{connected=false}};try{
   send({type:'start',model:model(),depth:request.depth,sources:prompt.sources});
   output=await consumeProviderStream(chosen.provider.protocol,upstream.body!,delta=>{output+=delta;send({type:'delta',text:delta})});
   await env.DB!.prepare("UPDATE learning_ai_requests SET status='complete',output=? WHERE id=?").bind(serializeOutput(output,prompt.sources,request.depth),key).run();send({type:'done',text:output,model:model()});
  }catch(e){const diagnostics=e instanceof LearningAIError?e.diagnostics:undefined;console.warn(JSON.stringify({event:'ai_stream_incomplete',model:model(),provider:chosen.provider.id,depth:request.depth,maxTokens:'max_tokens' in request.body?request.body.max_tokens:request.body.max_output_tokens,elapsedMs:Date.now()-now,code:diagnostics?.code||'stream_interrupted',finishReason:diagnostics?.finishReason,reasoningChars:diagnostics?.reasoningChars,outputChars:output.length}));const old=prior?.output?savedOutput(prior.output):null,keepOld=!output.trim()&&Boolean(old?.text.trim());await env.DB!.prepare("UPDATE learning_ai_requests SET status='failed',output=?,model=? WHERE id=?").bind(serializeOutput(keepOld?old!.text:output,keepOld?old!.sources:prompt.sources,keepOld?old!.depth:request.depth,{message:streamError(e),...diagnostics}),keepOld?prior!.model:model(),key).run().catch(()=>{});send({type:'error',error:streamError(e)});}finally{clearTimeout(timer);req.signal.removeEventListener('abort',disconnect);if(connected)try{controller.close();}catch{}}})();},cancel(){abort.abort();}});
  return new Response(body,{headers});
 }catch(e){clearTimeout(timer);req.signal.removeEventListener('abort',disconnect);if(claimed)await env.DB!.prepare("UPDATE learning_ai_requests SET status='failed' WHERE id=?").bind(key).run().catch(()=>{});return e instanceof LearningAIError?json({error:e.message},e.status):failure(e)}
}
