/* ===== ที่เก็บข้อมูล: ไฟล์ JSON หนึ่งไฟล์ต่อหนึ่ง document =====
   - เขียนแบบ atomic (เขียนไฟล์ชั่วคราวแล้ว rename) ข้อมูลไม่พังแม้ไฟดับ
   - เขียนทีละคิว ไม่ชนกันแม้หลายเครื่องส่งพร้อมกัน
   - สำรองข้อมูล = copy โฟลเดอร์ data ทั้งโฟลเดอร์                       */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'data','docs');
fs.mkdirSync(ROOT,{recursive:true});

const safe=s=>String(s).replace(/[^A-Za-z0-9_\-./]/g,'_');
function file(p){
  const parts=safe(p).split('/').filter(x=>x&&x!=='.'&&x!=='..');
  if(parts.length<2)throw new Error('bad path '+p);
  return path.join(ROOT,...parts)+'.json';
}
let chain=Promise.resolve();
function queue(fn){ chain=chain.then(fn,fn); return chain }

function readDoc(p){
  try{ return JSON.parse(fs.readFileSync(file(p),'utf8')) }catch(e){ return null }
}
function writeDoc(p,body,ifVersion){
  return queue(()=>{
    const f=file(p), cur=readDoc(p);
    const ver=cur?(cur.__v||0):0;
    if(ifVersion!=null && ifVersion!==ver) {
      const err=new Error('version_mismatch'); err.code='version_mismatch'; err.version=ver; throw err;
    }
    const out=Object.assign({},body,{__v:ver+1,__at:new Date().toISOString()});
    fs.mkdirSync(path.dirname(f),{recursive:true});
    const tmp=f+'.tmp'+process.pid;
    fs.writeFileSync(tmp,JSON.stringify(out));
    fs.renameSync(tmp,f);
    return out;
  });
}
function deleteDoc(p){
  return queue(()=>{ try{fs.unlinkSync(file(p))}catch(e){} return true });
}
function listCollection(col){
  const dir=path.join(ROOT,...safe(col).split('/').filter(Boolean));
  let names=[]; try{ names=fs.readdirSync(dir) }catch(e){ return [] }
  return names.filter(n=>n.endsWith('.json')).map(n=>{
    const id=n.slice(0,-5);
    return {id, data:readDoc(col+'/'+id)};
  }).filter(x=>x.data);
}
/* lease ง่าย ๆ กันสองเครื่องเขียน document เดียวกันพร้อมกัน */
const leases=new Map();
function acquire(p,holder,ttl){
  const now=Date.now(), cur=leases.get(p);
  if(cur && cur.until>now && cur.holder!==holder) return {acquired:false,expiresAt:new Date(cur.until).toISOString()};
  leases.set(p,{holder,until:now+Math.min(Math.max(ttl||30000,1000),600000)});
  return {acquired:true,holder};
}
module.exports={readDoc,writeDoc,deleteDoc,listCollection,acquire,ROOT};
