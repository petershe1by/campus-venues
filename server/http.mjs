import {dispatch} from './service.mjs';
const READ=new Set(['schedule','session','mine','admin']);
export function makeHandler(getStore,env=process.env,{secure=true}={}) {
  return async(req,context={})=>{
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
    const path=new URL(req.url).pathname.replace(/^\/api\/?/,'');
    if(!['GET','POST'].includes(req.method))return respond({error:'方法不支持'},405);
    if((req.method==='GET')!==READ.has(path))return respond({error:'请求方法错误'},405);
    let body={};
    if(req.method==='POST') {
      if(req.headers.get('origin')!==new URL(req.url).origin)return respond({error:'请求来源不匹配'},403);
      if(!req.headers.get('content-type')?.startsWith('application/json'))return respond({error:'需要 JSON 请求'},415);
      if(Number(req.headers.get('content-length')||0)>1024*1024)return respond({error:'请求过大'},413);
      const text=await req.text();if(text.length>1024*1024)return respond({error:'请求过大'},413);
      try{body=JSON.parse(text);}catch{return respond({error:'JSON 格式错误'},400);}
      if(!body||typeof body!=='object'||Array.isArray(body))return respond({error:'请求内容无效'},400);
    }
    const cookieName=secure?'__Host-venue_session':'venue_session';
    const cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`));const token=cookie?.slice(cookieName.length+1)||'';
    try {
      const store=await getStore();
      const result=await store.transact(async state=>{const draft=structuredClone(state);try{const data=await dispatch(draft,path,body,token,env,context.ip||'unknown');Object.assign(state,draft);return {data};}catch(e){if(path==='login')state.attempts=draft.attempts;return {error:e.message,status:e.status||400};}});
      if(result.error)return respond({error:result.error},result.status);
      const data=result.data;
      if(data.sessionToken||data.clearCookie) {headers['Set-Cookie']=`${cookieName}=${data.sessionToken||''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${data.clearCookie?0:43200}${secure?'; Secure':''}`;delete data.sessionToken;delete data.clearCookie;}
      return respond(data);
    }catch(e){console.error('API storage error',e.name);return respond({error:'账号服务暂未启用或数据库不可用，请稍后重试'},503);}
  };
}
