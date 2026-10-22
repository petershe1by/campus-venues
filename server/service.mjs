import { scrypt,randomBytes,timingSafeEqual,createHash } from 'node:crypto';
import {promisify} from 'node:util';
import {addReservation,cancelReservation,importClasses,activeBookings,publicBooking,audit} from '../shared/domain.mjs';
const derive=promisify(scrypt);
export async function hashPassword(password) {const salt=randomBytes(16).toString('hex');const hash=await derive(password,salt,64);return `${salt}:${hash.toString('hex')}`;}
export async function checkPassword(password,encoded) {const [salt,hex]=encoded.split(':');const actual=await derive(password,salt,64);return timingSafeEqual(Buffer.from(hex,'hex'),actual);}
const digest=s=>createHash('sha256').update(s).digest('hex');
const safeUser=u=>u?Object.fromEntries(['id','username','name','organization','role','disabled','mustChangePassword','createdAt'].map(k=>[k,u[k]])):null;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function passwordValid(p) {if(typeof p!=='string'||p.length<12||p.length>128)fail('密码须为 12–128 位');}
function authenticated(state,token) {const s=state.sessions.find(x=>x.hash===digest(token||'')&&x.expires>Date.now());return s?state.users.find(u=>u.id===s.userId&&!u.disabled):null;}
export async function dispatch(state,path,body,token,env={},ip='local') {
  const user=authenticated(state,token);
  if(path==='schedule')return {bookings:activeBookings(state.bookings).map(publicBooking),updatedAt:new Date().toISOString()};
  if(path==='session')return {user:safeUser(user)};
  if(path==='login') {
    const key=digest(ip);state.attempts=state.attempts.filter(x=>x.at>Date.now()-600000);
    if(state.attempts.filter(x=>x.key===key).length>=12)fail('尝试次数过多，请 10 分钟后再试',429);
    state.attempts.push({key,at:Date.now()});
    const username=String(body.username||'').toLowerCase().trim();const password=String(body.password||'');
    if(password.length>128)fail('账号或密码错误',401);
    let account=state.users.find(u=>u.username===username);
    if(!state.users.length&&env.ADMIN_USERNAME&&env.ADMIN_INITIAL_PASSWORD) {
      passwordValid(env.ADMIN_INITIAL_PASSWORD);
      if(username===env.ADMIN_USERNAME.toLowerCase() && digest(password)===digest(env.ADMIN_INITIAL_PASSWORD)) {
        account={id:crypto.randomUUID(),username,name:'大管理员',organization:'场地管理',role:'admin',disabled:false,mustChangePassword:true,createdAt:new Date().toISOString(),passwordHash:await hashPassword(password)};state.users.push(account);audit(state,account,'admin.bootstrap',account.id);
      }
    }
    const dummy='00000000000000000000000000000000:'+'00'.repeat(64);
    const matches=await checkPassword(password,account?.passwordHash||dummy);
    if(!account||account.disabled||!matches)fail('账号或密码错误',401);
    state.attempts=state.attempts.filter(x=>x.key!==key);
    const newToken=randomBytes(32).toString('hex');state.sessions=state.sessions.filter(s=>s.expires>Date.now());
    state.sessions.push({hash:digest(newToken),userId:account.id,expires:Date.now()+12*3600000});audit(state,account,'auth.login',account.id);
    return {user:safeUser(account),sessionToken:newToken};
  }
  if(!user)fail('请先登录',401);
  if(path==='logout') {state.sessions=state.sessions.filter(s=>s.hash!==digest(token));return {ok:true,clearCookie:true};}
  if(path==='password') {
    if(!await checkPassword(String(body.currentPassword||''),user.passwordHash))fail('当前密码不正确');
    passwordValid(body.password);user.passwordHash=await hashPassword(body.password);user.mustChangePassword=false;
    state.sessions=state.sessions.filter(s=>s.userId!==user.id||s.hash===digest(token));audit(state,user,'auth.password',user.id);return {user:safeUser(user)};
  }
  if(user.mustChangePassword)fail('请先修改初始密码',403);
  if(path==='mine')return {bookings:state.bookings.filter(b=>b.createdBy===user.id)};
  if(path==='bookings')return {booking:addReservation(state,body,user)};
  if(path==='bookings/cancel')return {booking:cancelReservation(state,body.id,user)};
  if(user.role!=='admin')fail('仅大管理员可以执行此操作',403);
  if(path==='admin')return {users:state.users.map(safeUser),bookings:state.bookings,audit:state.audit.slice(-500).reverse()};
  if(path==='accounts') {
    const username=String(body.username||'').toLowerCase().trim(),name=String(body.name||'').trim(),organization=String(body.organization||'').trim();
    if(!/^[a-z0-9_.-]{3,32}$/.test(username))fail('账号须为 3–32 位字母、数字、下划线、点或短横线');
    if(name.length<2||name.length>40)fail('使用人名称须为 2–40 字');
    if(organization.length>60)fail('组织名称最多 60 字');
    if(state.users.some(u=>u.username===username))fail('账号已存在');
    const temporaryPassword=randomBytes(12).toString('base64url');
    const u={id:crypto.randomUUID(),username,name,organization,role:'member',disabled:false,mustChangePassword:true,passwordHash:await hashPassword(temporaryPassword),createdAt:new Date().toISOString()};
    state.users.push(u);audit(state,user,'account.create',u.id);return {user:safeUser(u),temporaryPassword};
  }
  if(path==='accounts/update'||path==='accounts/reset') {
    const u=state.users.find(u=>u.id===body.id);if(!u||u.role==='admin')fail('只能操作申请账号');
    state.sessions=state.sessions.filter(s=>s.userId!==u.id);
    if(path==='accounts/reset') {const temporaryPassword=randomBytes(12).toString('base64url');u.passwordHash=await hashPassword(temporaryPassword);u.mustChangePassword=true;audit(state,user,'account.reset',u.id);return {user:safeUser(u),temporaryPassword};}
    if(typeof body.disabled!=='boolean')fail('账号状态无效');u.disabled=body.disabled;audit(state,user,u.disabled?'account.disable':'account.enable',u.id);return {user:safeUser(u)};
  }
  if(path==='timetable')return importClasses(state,body.rows,user,body.mode);
  fail('接口不存在',404);
}
