import {LearningAIError,consumeLearningStream} from './learning-ai';
export type ModelSpec={id:string;label:string;vision?:boolean;pdf?:boolean;reasoning?:string};
type Provider={id:string;label:string;baseURL:string;protocol:'responses'|'chat';keyEnv:string;models:ModelSpec[]};
export function configuredProviders(runtime:Record<string,string|undefined>):Provider[]{
 let values:Provider[]=[];
 if(runtime.AI_PROVIDERS_JSON){try{values=JSON.parse(runtime.AI_PROVIDERS_JSON)}catch{throw new LearningAIError(503,'模型配置需要检查')}}
 else if(runtime.OPENAI_API_KEY)values=[{id:'openai',label:'OpenAI 官方',baseURL:'https://api.openai.com/v1',protocol:'responses',keyEnv:'OPENAI_API_KEY',models:[{id:runtime.OPENAI_MODEL||'gpt-6-luna',label:runtime.OPENAI_MODEL||'GPT-6 Luna',vision:true,pdf:true,reasoning:'low'}]}];
 if(!Array.isArray(values)||values.length>10)throw new LearningAIError(503,'模型配置需要检查');
 const ids=new Set<string>();
 return values.filter(p=>{
  let url:URL;try{url=new URL(p.baseURL)}catch{throw new LearningAIError(503,'模型接口配置需要检查')}
  if(!/^[a-z0-9_-]{1,40}$/.test(p.id)||ids.has(p.id)||!p.label||!['responses','chat'].includes(p.protocol)||!/^\w{1,80}$/.test(p.keyEnv)||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port||!['api.openai.com','ctmoai.com','api.deepseek.com'].includes(url.hostname)||url.pathname.replace(/\/$/,'')!=='/v1'||!Array.isArray(p.models)||!p.models.length||p.models.some(m=>!m.id||!m.label||m.id.length>120))throw new LearningAIError(503,'模型接口配置需要检查');
  ids.add(p.id);return Boolean(runtime[p.keyEnv]);
 });
}
export function modelOptions(runtime:Record<string,string|undefined>){return configuredProviders(runtime).flatMap(p=>p.models.map(m=>({id:p.id+':'+m.id,model:m.id,label:m.label,provider:p.label,vision:Boolean(m.vision),pdf:Boolean(m.pdf)&&p.protocol==='responses',depths:depthOptions(p,m),defaultDepth:p.protocol==='responses'?'quick':p.baseURL.includes('deepseek')?'standard':'default'})))}
export function defaultModelId(runtime:Record<string,string|undefined>){
 const options=modelOptions(runtime),deepseek=configuredProviders(runtime).find(p=>new URL(p.baseURL).hostname==='api.deepseek.com'&&p.models.some(m=>m.id==='deepseek-flash'));
 return (deepseek?deepseek.id+':deepseek-flash':undefined)||options.find(m=>m.id===runtime.AI_DEFAULT_MODEL)?.id||options[0]?.id;
}
export function selectProvider(runtime:Record<string,string|undefined>,selection?:unknown){
 const options=modelOptions(runtime);const wanted=selection||defaultModelId(runtime);
 const option=options.find(m=>m.id===wanted);if(!option)throw new LearningAIError(400,'请选择可用的模型');
 const provider=configuredProviders(runtime).find(p=>p.id+':'+option.model===option.id)!;
 return {provider,model:provider.models.find(m=>m.id===option.model)!,option,key:runtime[provider.keyEnv]!};
}
export function depthOptions(provider:Provider,model:ModelSpec){return provider.protocol==='responses'||provider.baseURL.includes('deepseek')?['quick','standard','deep']:['default'];}
export function depthSettings(provider:Provider,model:ModelSpec,depth?:unknown){const allowed=depthOptions(provider,model),value=depth|| (allowed.includes('standard')&&provider.baseURL.includes('deepseek')?'standard':allowed[0]);if(!allowed.includes(value as string))throw new LearningAIError(400,'请选择这个模型支持的回答深度');return {depth:value,effort:value==='default'?model.reasoning:value==='quick'?'low':value==='standard'?'high':provider.baseURL.includes('deepseek')?'max':'xhigh',tokens:provider.baseURL.includes('deepseek')?(value==='deep'?65536:value==='standard'?32768:8192):(value==='deep'?16000:value==='standard'?10000:6000),timeout:value==='deep'?240000:value==='standard'?180000:120000};}
export function providerRequest(provider:Provider,model:ModelSpec,prompt:{input:any[];instructions:string},depth?:unknown){
 const settings=depthSettings(provider,model,depth),endpoint=provider.baseURL.replace(/\/$/,'')+'/'+(provider.protocol==='responses'?'responses':'chat/completions');
 const body=provider.protocol==='responses'?{model:model.id,input:prompt.input,instructions:prompt.instructions,store:false,stream:true,max_output_tokens:settings.tokens,...(settings.effort?{reasoning:{effort:settings.effort}}:{})}:{model:model.id,stream:true,max_tokens:settings.tokens,...(provider.baseURL.includes('deepseek')?{thinking:{type:settings.depth==='quick'?'disabled':'enabled'}}:{}),messages:[{role:'system',content:prompt.instructions},...prompt.input.map(m=>({role:m.role,content:m.role==='assistant'?m.content.filter((c:any)=>typeof c.text==='string').map((c:any)=>c.text).join('\n'):m.content.map((c:any)=>c.type==='input_image'?{type:'image_url',image_url:{url:c.image_url}}:{type:'text',text:c.text})}))],...(settings.effort?{reasoning_effort:settings.effort}:{})};
 return {endpoint,body,timeout:settings.timeout,depth:settings.depth};
}
export async function consumeProviderStream(protocol:Provider['protocol'],body:ReadableStream<Uint8Array>,onDelta:(v:string)=>void){
 if(protocol==='responses')return consumeLearningStream(body,onDelta);
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='',output='',complete=false,reasoningChars=0;
 const parse=(block:string)=>{const raw=block.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).join('\n');if(!raw||raw==='[DONE]')return;const e=JSON.parse(raw);if(e.error)throw new LearningAIError(502,'模型暂时未能完成回复');const c=e.choices?.[0];if(typeof c?.delta?.reasoning_content==='string')reasoningChars+=c.delta.reasoning_content.length;if(c?.delta?.content){output+=c.delta.content;onDelta(c.delta.content)}if(c?.finish_reason==='length')throw new LearningAIError(502,output.trim()?'模型返回长度限制，已有内容已保留；可继续未完成的回复。':reasoningChars?'模型在思考阶段达到本次长度限制，尚未输出答案。请切换“快速”重试，或使用“深入”。':'模型返回长度限制，尚未输出答案。请重试或切换模型。',{code:'length_limit',finishReason:'length',reasoningChars,outputChars:output.length});if(['stop','content_filter'].includes(c?.finish_reason))complete=true;if(output.length>100000)throw new LearningAIError(502,'回复过长，请拆分问题')};
 try{for(;;){const {done,value}=await reader.read();buffer=(buffer+decoder.decode(value,{stream:!done})).replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){parse(buffer.slice(0,end));buffer=buffer.slice(end+2)}if(buffer.length>1024*1024)throw new LearningAIError(502,'模型响应格式不正确');if(done){if(buffer.trim())parse(buffer);break}}if(!complete||!output)throw new LearningAIError(502,'连接中断，回复未完成；已有内容已保留。');return output}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
