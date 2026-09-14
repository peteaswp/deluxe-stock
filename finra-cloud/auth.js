/* ===== ผู้ใช้และการล็อกอิน — เก็บรหัสผ่านแบบ scrypt ไม่เก็บรหัสจริง ===== */
const crypto=require('crypto'), fs=require('fs'), path=require('path');
const {ROLES,rolesOf,permsOfRoles,deptOf}=require('./roles');
const DIR=path.join(__dirname,'data'); fs.mkdirSync(DIR,{recursive:true});
const UF=path.join(DIR,'users.json'), SF=path.join(DIR,'secret.key');

let SECRET;
try{ SECRET=fs.readFileSync(SF) }catch(e){ SECRET=crypto.randomBytes(32); fs.writeFileSync(SF,SECRET); }

function load(){ try{ return JSON.parse(fs.readFileSync(UF,'utf8')) }catch(e){ return {users:[]} } }
function save(d){ const t=UF+'.tmp'; fs.writeFileSync(t,JSON.stringify(d,null,2)); fs.renameSync(t,UF) }

function hash(pw,salt){ return crypto.scryptSync(pw,salt,32).toString('hex') }
/* รับได้ทั้ง roles:['a','b'] หรือ role:'a' หรือ role:'a,b' */
function wantRoles(src){
  let list=[];
  if(Array.isArray(src.roles))list=src.roles;
  else if(typeof src.roles==='string')list=src.roles.split(/[,\s]+/);
  else if(typeof src.role==='string')list=src.role.split(/[,\s]+/);
  list=list.map(r=>String(r||'').trim()).filter(r=>ROLES[r]);
  const seen={},out=[];
  list.forEach(r=>{if(!seen[r]){seen[r]=1;out.push(r)}});
  return out;
}
function makeUser(u){
  const salt=crypto.randomBytes(16).toString('hex');
  const roles=wantRoles(u); if(!roles.length)roles.push('production');
  return {id:u.id||('u'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)),
    username:String(u.username).toLowerCase().trim(), name:u.name||u.username,
    roles, role:roles[0], dept:u.dept||deptOf(roles),
    salt, hash:hash(u.password,salt), active:u.active!==false,
    mustChange:!!u.mustChange, createdAt:new Date().toISOString()};
}
function listUsers(){ return load().users.map(u=>({id:u.id,username:u.username,name:u.name,roles:rolesOf(u),role:rolesOf(u)[0]||'',dept:u.dept,active:u.active})) }
function findUser(username){ return load().users.find(u=>u.username===String(username||'').toLowerCase().trim()) }
function addUser(u){
  const d=load();
  if(d.users.some(x=>x.username===String(u.username).toLowerCase().trim())) throw new Error('username_taken');
  const nu=makeUser(u); d.users.push(nu); save(d); return nu;
}
function updateUser(id,patch){
  const d=load(), u=d.users.find(x=>x.id===id);
  if(!u) throw new Error('not_found');
  if(patch.name!=null)u.name=patch.name;
  if(patch.roles!=null||patch.role!=null){
    const r=wantRoles(patch);
    if(r.length){ u.roles=r; u.role=r[0]; if(patch.dept==null)u.dept=deptOf(r); }
  }
  if(patch.dept!=null)u.dept=patch.dept;
  if(patch.active!=null)u.active=!!patch.active;
  if(patch.password){ u.salt=crypto.randomBytes(16).toString('hex'); u.hash=hash(patch.password,u.salt); u.mustChange=!!patch.mustChange }
  save(d); return u;
}
function verify(username,password){
  const u=findUser(username);
  if(!u||!u.active) return null;
  const h=hash(password,u.salt);
  if(h.length!==u.hash.length) return null;
  if(!crypto.timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(u.hash,'hex'))) return null;
  return u;
}
/* token = base64(payload).hmac — ไม่ต้องเก็บ session ในเซิร์ฟเวอร์ */
function sign(u,days){
  const exp=Date.now()+(days||14)*864e5;
  const p=Buffer.from(JSON.stringify({id:u.id,exp})).toString('base64url');
  const s=crypto.createHmac('sha256',SECRET).update(p).digest('base64url');
  return p+'.'+s;
}
function readToken(tok){
  if(!tok||tok.indexOf('.')<0)return null;
  const [p,s]=tok.split('.');
  const chk=crypto.createHmac('sha256',SECRET).update(p).digest('base64url');
  if(chk.length!==s.length||!crypto.timingSafeEqual(Buffer.from(chk),Buffer.from(s)))return null;
  let d; try{ d=JSON.parse(Buffer.from(p,'base64url').toString()) }catch(e){ return null }
  if(!d.exp||d.exp<Date.now())return null;
  const u=load().users.find(x=>x.id===d.id);
  if(!u||!u.active)return null;
  return u;
}
function permsOf(u){ return permsOfRoles(rolesOf(u)) }
function count(){ return load().users.length }
module.exports={addUser,updateUser,listUsers,findUser,verify,sign,readToken,permsOf,count,wantRoles};
