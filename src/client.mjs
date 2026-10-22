import {emptyState,today,addDays,weekday,addReservation,cancelReservation,importClasses,publicBooking,activeBookings,audit} from '../shared/domain.mjs';
const KEY='campus-venues-demo-v1';
export const API_ENABLED=import.meta.env.VITE_API_ENABLED==='true';
const publicUser=u=>u?Object.fromEntries(['id','username','name','organization','role','disabled','mustChangePassword'].map(k=>[k,u[k]])):null;
export function createDemo() {
  const state=emptyState();
  state.users=[{id:'demo-admin',username:'demo_admin',name:'演示管理员',organization:'体育部',role:'admin',disabled:false},{id:'demo-member',username:'demo_team',name:'演示申请人',organization:'学生体育协会',role:'member',disabled:false}];
  const monday=addDays(today(),-weekday(today()));
  const patterns=[['field','08:00','09:35','大学体育 · 田径','class'],['gym','10:00','11:35','大学体育 · 羽毛球','class'],['field','15:00','17:00','校队日常训练','event'],['gym','14:00','15:35','大学体育 · 篮球','class'],['field','09:00','11:00','院系足球友谊赛','event'],['gym','16:00','18:00','羽毛球社团活动','event']];
  for(let day=0;day<21;day++) {if(day%7===6)continue;const pattern=patterns[day%patterns.length];state.bookings.push({id:`demo-${day}`,date:addDays(monday,day),venue:pattern[0],start:pattern[1],end:pattern[2],title:pattern[3],type:pattern[4],organization:pattern[4]==='class'?'体育部':'学生体育协会',createdBy:pattern[4]==='class'?'demo-admin':'demo-member',createdByName:pattern[4]==='class'?'演示管理员':'演示申请人',createdByUsername:pattern[4]==='class'?'demo_admin':'demo_team',createdAt:new Date().toISOString()});}
  return state;
}
let memory;
function loadDemo() {if(memory)return memory;try{const s=JSON.parse(localStorage.getItem(KEY));if(s?.version===1&&Array.isArray(s.users)&&Array.isArray(s.bookings))return memory=s;}catch{}return memory=createDemo();}
function saveDemo(s) {memory=s;try{localStorage.setItem(KEY,JSON.stringify(s));}catch{}}
export function resetDemo() {memory=createDemo();saveDemo(memory);sessionStorage.removeItem('venue-demo-user');}
export async function call(path,body,demo=false) {
  if(!demo) {
    if(!API_ENABLED) {if(path==='session')return {user:null};if(path==='schedule'){const r=await fetch(`${import.meta.env.BASE_URL}schedule.json?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error('日历读取失败，请刷新重试');return r.json();}throw new Error('账号服务尚未启用；可进入演示模式体验，正式账号将在 Netlify 部署后启用。');}
    const r=await fetch(`/api/${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await r.json().catch(()=>({error:'服务响应异常'}));if(!r.ok)throw new Error(data.error||'请求失败');return data;
  }
  const s=loadDemo();const user=s.users.find(x=>x.id===sessionStorage.getItem('venue-demo-user')&&!x.disabled);
  if(path==='schedule')return {bookings:activeBookings(s.bookings).map(publicBooking),updatedAt:new Date().toISOString()};
  if(path==='session')return {user:publicUser(user)};
  if(path==='login') {const u=s.users.find(x=>x.id===body.id&&!x.disabled);if(!u)throw new Error('演示账号不可用');sessionStorage.setItem('venue-demo-user',u.id);return {user:publicUser(u)};}
  if(path==='logout'){sessionStorage.removeItem('venue-demo-user');return {ok:true};}
  if(!user)throw new Error('请先选择演示角色');
  let result;
  const draft=structuredClone(s);
  if(path==='mine')return {bookings:s.bookings.filter(x=>x.createdBy===user.id)};
  if(path==='password')throw new Error('演示模式无需密码，请在正式账号服务启用后修改密码');
  if(path==='bookings')result={booking:addReservation(draft,body,user)};
  else if(path==='bookings/cancel')result={booking:cancelReservation(draft,body.id,user)};
  else {
    if(user.role!=='admin')throw new Error('仅大管理员可以操作');
    if(path==='admin')return {users:s.users.map(publicUser),bookings:s.bookings,audit:[...s.audit].reverse()};
    if(path==='timetable')result=importClasses(draft,body.rows,user,body.mode);
    else if(path==='accounts') {
      const username=String(body.username||'').toLowerCase().trim(),name=String(body.name||'').trim();
      if(!/^[a-z0-9_.-]{3,32}$/.test(username)||name.length<2||name.length>40)throw new Error('请填写有效账号（3–32 位英文/数字）和名称（2–40 字）');
      if(s.users.some(x=>x.username===username))throw new Error('账号已存在');
      const u={id:crypto.randomUUID(),username,name,organization:String(body.organization||''),role:'member',disabled:false};draft.users.push(u);audit(draft,user,'account.create',u.id);result={user:publicUser(u),temporaryPassword:'演示账号不使用密码'};
    } else if(path==='accounts/update') {const u=draft.users.find(x=>x.id===body.id&&x.role!=='admin');if(!u)throw new Error('账号不可操作');u.disabled=body.disabled;audit(draft,user,u.disabled?'account.disable':'account.enable',u.id);result={ok:true};}
    else if(path==='accounts/reset')result={user:publicUser(s.users.find(x=>x.id===body.id)),temporaryPassword:'演示账号不使用密码'};
    else throw new Error('操作不存在');
  }
  saveDemo(draft);return result;
}
export const demoUsers=()=>loadDemo().users.filter(u=>!u.disabled).map(publicUser);
export function download(name,contents,type='text/plain;charset=utf-8') {const url=URL.createObjectURL(new Blob([contents],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
