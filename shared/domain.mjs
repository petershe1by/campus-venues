export const VENUES = [
  { id: 'south-field', name: '南操场', detail: '户外运动 · 可共同使用' },
  { id: 'north-field', name: '北操场', detail: '户外运动 · 可共同使用' },
  { id: 'new-gym', name: '新体育馆', detail: '室内运动 · 可共同使用' },
  { id: 'old-gym', name: '老体育馆', detail: '室内运动 · 可共同使用' }
];
export const timeMinutes = t => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error('时间须为 HH:mm（00:00–23:59）'); return Number(t.slice(0,2))*60+Number(t.slice(3)); };
export function validDate(d) { if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||d<'2000-01-01'||d>'2100-12-31')return false;const t=new Date(`${d}T00:00:00Z`);return !Number.isNaN(t.valueOf())&&t.toISOString().slice(0,10)===d; }
export const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai'}).format(new Date());
export function addDays(d,n) { const date=new Date(`${d}T00:00:00Z`); date.setUTCDate(date.getUTCDate()+n); return date.toISOString().slice(0,10); }
export const weekday = d => (new Date(`${d}T00:00:00Z`).getUTCDay()+6)%7;
export const venueName = id => VENUES.find(v=>v.id===id)?.name || ({field:'操场（旧记录）',gym:'体育馆（旧记录）'})[id] || id;
export function normalizeBooking(input) {
  const b={date:String(input.date||''),venue:String(input.venue||''),start:String(input.start||''),end:String(input.end||''),title:String(input.title||'').trim(),organization:String(input.organization||'').trim()};
  if (!validDate(b.date)) throw new Error('请选择有效日期（2000–2100 年）');
  if (!VENUES.some(v=>v.id===b.venue)) throw new Error('请选择南操场、北操场、新体育馆或老体育馆');
  if(timeMinutes(b.end)<=timeMinutes(b.start)) throw new Error('结束时间必须晚于开始时间；跨天请分开预约');
  if(b.title.length<2 || b.title.length>80) throw new Error('活动/课程名称须为 2–80 字');
  if(b.organization.length>60) throw new Error('组织名称不能超过 60 字');
  return b;
}
export const overlaps = (a,b) => a.date===b.date && a.venue===b.venue && a.start<b.end && a.end>b.start;
export const activeBookings = list => list.filter(b=>!b.cancelledAt);
export function periodBookings(list,date,period) { return activeBookings(list).filter(b=>b.date===date && (period==='am'?b.start<'12:00':b.end>'12:00')).sort((a,b)=>a.start.localeCompare(b.start)); }
export function timelineLayout(list) {
  const ends=[];
  const items=[...activeBookings(list)].sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end)).map(b=>{
    let lane=ends.findIndex(end=>end<=b.start);
    if(lane<0)lane=ends.length;
    ends[lane]=b.end;return {...b,lane};
  });
  return {items,lanes:Math.max(1,ends.length)};
}
export function addReservation(state,input,user,now=new Date().toISOString()) {
  if(!user || user.disabled) throw new Error('请使用管理员分发的账号登录');
  const b=normalizeBooking(input);
  if(Date.parse(`${b.date}T${b.start}:00+08:00`)<=Date.parse(now)) throw new Error('不能预约已经过去的时间');
  const result={...b,id:crypto.randomUUID(),type:'event',createdBy:user.id,createdByName:user.name,createdByUsername:user.username,createdAt:now};
  state.bookings.push(result); audit(state,user,'booking.create',result.id,now); return result;
}
export function audit(state,user,action,target,now=new Date().toISOString()) { state.audit.push({id:crypto.randomUUID(),actorId:user.id,actor:user.username,action,target,at:now}); }
export function cancelReservation(state,id,user) {
  const b=state.bookings.find(x=>x.id===id && !x.cancelledAt); if(!b) throw new Error('预约不存在或已取消');
  if(!user || (user.role!=='admin' && (b.createdBy!==user.id || b.type==='class'))) throw new Error('只能取消自己的活动预约');
  b.cancelledAt=new Date().toISOString(); b.cancelledBy=user.id; audit(state,user,'booking.cancel',id); return b;
}
export function importClasses(state,rows,user,mode='append') {
  if(user?.role!=='admin') throw new Error('仅大管理员可以导入课表');
  if(!['append','replace'].includes(mode)) throw new Error('无效的导入方式');
  if(!Array.isArray(rows)||!rows.length||rows.length>2000) throw new Error('一次须导入 1–2000 条课程');
  const normalized=rows.map(normalizeBooking);
  const base=activeBookings(state.bookings).filter(b=>mode!=='replace'||b.type!=='class');
  const incoming=[]; let skipped=0;
  for(const b of normalized) {
    if([...base,...incoming].some(x=>x.type==='class'&&x.date===b.date&&x.venue===b.venue&&x.start===b.start&&x.end===b.end&&x.title===b.title)) { skipped++; continue; }
    incoming.push({...b,id:crypto.randomUUID(),type:'class',createdBy:user.id,createdByName:user.name,createdByUsername:user.username,createdAt:new Date().toISOString()});
  }
  if(mode==='replace') for(const b of state.bookings) if(b.type==='class'&&!b.cancelledAt) {b.cancelledAt=new Date().toISOString(); b.cancelledBy=user.id;}
  state.bookings.push(...incoming); audit(state,user,'timetable.import',`${mode}:${incoming.length}`); return {imported:incoming.length,skipped};
}
export function publicBooking(b) { return Object.fromEntries(['id','date','venue','start','end','title','organization','type','createdAt'].map(k=>[k,b[k]])); }
export function emptyState() {return {version:1,users:[],sessions:[],bookings:[],audit:[],attempts:[]};}
