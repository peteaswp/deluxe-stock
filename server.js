/* =====================================================================
   ระบบสต๊อกและแผนผลิต ฟินร่า — เซิร์ฟเวอร์ของบริษัท
   รันด้วย Node.js อย่างเดียว ไม่ต้องติดตั้ง package เพิ่ม
   เริ่มใช้งาน:  node server.js
   ===================================================================== */
const http=require('http'), fs=require('fs'), path=require('path'), url=require('url');
const store=require('./store'), auth=require('./auth'), backup=require('./backup'), {ROLES,PERMS,tabsFor,rolesOf,roleNames,deptOf}=require('./roles');
const {netOf,matNetOf}=require('./signs');
const pricing=require('./pricing');
const linerules=require('./lines');

/* รหัสรุ่น: คิดจากไฟล์หลักที่กำลังรันอยู่จริง
   ใช้บอกว่าอัปเดตไฟล์แล้วแต่ยังไม่ได้ปิด-เปิดเซิร์ฟเวอร์ใหม่ */
const BUILD=(()=>{
  try{
    const h=require('crypto').createHash('sha1');
    ['server.js','roles.js','pricing.js','lines.js','store.js','public/index.html'].forEach(f=>{
      try{ h.update(fs.readFileSync(path.join(__dirname,f))) }catch(e){}
    });
    return h.digest('hex').slice(0,8);
  }catch(e){ return 'unknown' }
})();
const STARTED=new Date().toISOString();

/* ---------- เติมข้อมูลที่ยังไม่ครบ ทำอัตโนมัติตอนเปิดเซิร์ฟเวอร์ ----------
   แตะเฉพาะช่องที่ยังว่างอยู่จริง ๆ ของที่คนกรอกไว้เองไม่ถูกทับ
   (เซิร์ฟเวอร์ออนไลน์เก็บข้อมูลไว้บนดิสก์ของตัวเอง ไม่ได้อ่านจากไฟล์ seed
    หลังติดตั้งครั้งแรก จึงต้องเติมให้ตรงนี้)                                */
const FILL_SKU={ tank:{size:'18.9 L', name:'น้ำถัง 18.9 ลิตร'} };
function fillMissingSkuFields(){
  try{
    const d=store.readDoc('master/skus');
    if(!d||!Array.isArray(d.items))return;
    const changed=[];
    d.items.forEach(s=>{
      const want=FILL_SKU[s.id]; if(!want)return;
      const cur=String(s.size||'').trim();
      if(cur&&cur!=='-')return;                 /* มีขนาดแล้ว ไม่ยุ่ง */
      s.size=want.size;
      const nm=String(s.name||'').trim();
      if(!nm||nm===String(s.brand||'').trim())s.name=want.name;
      changed.push(s.id);
    });
    if(!changed.length)return;
    store.writeDoc('master/skus',d)
      .then(()=>console.log('   [i] เติมขนาดสินค้าที่ยังว่างให้แล้ว: '+changed.join(', ')))
      .catch(e=>console.log('   [!] เติมขนาดสินค้าไม่สำเร็จ: '+(e&&e.message||e)));
  }catch(e){}
}

const PORT=process.env.PORT||8080;
const PUB=path.join(__dirname,'public');
const AUDIT=path.join(__dirname,'data','audit.log');

/* ---------- helpers ---------- */
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
function send(res,code,body,headers){
  const h=Object.assign({'Cache-Control':'no-store'},headers||{});
  if(typeof body==='object'&&!Buffer.isBuffer(body)){h['Content-Type']='application/json; charset=utf-8';body=JSON.stringify(body)}
  res.writeHead(code,h); res.end(body);
}
function readBody(req){
  return new Promise((ok,bad)=>{
    let d=''; let n=0;
    req.on('data',c=>{n+=c.length; if(n>5e7){bad(new Error('too_big'));req.destroy();return} d+=c});
    req.on('end',()=>{ try{ ok(d?JSON.parse(d):{}) }catch(e){ bad(new Error('bad_json')) } });
    req.on('error',bad);
  });
}
function cookies(req){
  const o={}; (req.headers.cookie||'').split(';').forEach(p=>{const i=p.indexOf('=');if(i>0)o[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())});
  return o;
}
function audit(user,action,detail){
  const line=JSON.stringify({t:new Date().toISOString(),u:user?user.username:'-',a:action,d:detail})+'\n';
  fs.appendFile(AUDIT,line,()=>{});
}

/* ---------- realtime ---------- */
const clients=new Set();
function broadcast(pathChanged){
  const msg='data: '+JSON.stringify({path:pathChanged})+'\n\n';
  clients.forEach(c=>{ try{c.write(msg)}catch(e){} });
}

/* ---------- permissions ---------- */
function has(u,p){ return auth.permsOf(u).indexOf(p)>=0 }
function need(u,p){ if(!has(u,p)){const e=new Error('forbidden');e.code='forbidden';e.perm=p;throw e} }

function checkDocWrite(u,p,body){
  if(p==='master/customers'){ need(u,'cust.edit'); return body }
  if(p==='master/drivers')  { need(u,'cust.edit'); return body }
  if(p==='master/matcosts') { need(u,'mat.cost');  return body }
  if(p==='master/expcats')  { need(u,'expense.log'); return body }
  if(p==='master/prices')   { need(u,'price.edit'); return body }
  if(p.startsWith('master/')) { need(u,'master.edit'); return body }
  if(p==='stock/baseline'||p==='stock/matbaseline'){
    need(u,'stock.count');
    body.by=u.name; body.uid=u.id;          /* ใครตรวจนับ — ปลอมไม่ได้ */
    return body;
  }
  if(p.startsWith('lines/')) {
    need(u,'produce.station');
    if(body.status==='run'){
      body.operator=u.name; body.uid=u.id;   /* คนคุมเครื่อง = บัญชีที่ล็อกอิน */
      const lid=p.split('/')[1];
      if(body.skuId&&!lineCanMake(lid,body.skuId))
        fail('line_cannot_make',lid+' ผลิตสินค้านี้ไม่ได้ — แก้ได้ที่ ตั้งค่า → ไลน์ไหนผลิตอะไรได้');
    }
    return body;
  }
  if(p.startsWith('ledger/')) return checkLedger(u,p,body);
  const e=new Error('forbidden'); e.code='forbidden'; throw e;
}
function idx(list){ const m={}; (list||[]).forEach(x=>{ if(x&&x.id)m[x.id]=x }); return m }
function fail(code,msg){ const e=new Error(msg); e.code='forbidden'; e.reason=code; e.msg=msg; throw e }
function checkLedger(u,p,body){
  const cur=store.readDoc(p)||{entries:[],mat:[],exp:[]};
  /* ถ้าคำสั่งที่ส่งมาไม่ได้แนบรายการวัตถุดิบหรือค่าใช้จ่ายมาด้วย
     ให้ถือว่า "ไม่แตะต้อง" ไม่ใช่ "ลบทิ้ง" — กันข้อมูลหายจากการเขียนไม่ครบ */
  if(!Array.isArray(body.mat)) body.mat=(cur.mat||[]).slice();
  if(!Array.isArray(body.exp)) body.exp=(cur.exp||[]).slice();
  const a=idx(cur.entries), b=idx(body.entries);
  const added=[],removed=[];
  for(const k in b) if(!a[k]) added.push(b[k]);
  for(const k in a) if(!b[k]) removed.push(a[k]);
  if(removed.length) need(u,'sell.delete');
  if(removed.some(e=>e&&e.back===true)) need(u,'sale.backdate');
  added.forEach(e=>{
    if(e.type==='sell'){
      if(e.back===true){
        /* ยอดขายย้อนหลัง — ไม่ใช่บิลจริง จึงไม่ต้องมีทะเบียนรถ
           แต่ต้องมีสิทธิ์กรอกยอดย้อนหลังเท่านั้น */
        need(u,'sale.backdate');
      }else{
        if(e.channel==='ขายส่ง') need(u,'sell.wholesale'); else need(u,'sell.walk');
        /* ทุกบิลต้องมีเลขบิล และบิลขายส่งต้องมีทะเบียนรถ — กันไว้ที่เซิร์ฟเวอร์ */
        if(!String(e.bill||'').trim()) fail('need_bill','ทุกบิลต้องมีเลขที่บิล');
        if(e.channel==='ขายส่ง'&&!String(e.plate||'').trim())
          fail('need_plate','บิลขายส่งต้องใส่ทะเบียนรถ');
      }
    } else if(e.line){
      need(u,'produce.station');
      if(e.type==='produce'&&e.skuId&&!lineCanMake(e.line,e.skuId))
        fail('line_cannot_make',e.line+' ผลิตสินค้านี้ไม่ได้ — แก้ได้ที่ ตั้งค่า → ไลน์ไหนผลิตอะไรได้');
    }
    else need(u,'produce.log');
    e.uid=u.id; e.uname=u.name;              /* ใครบันทึก — ปลอมไม่ได้ */
    /* ช่อง by ที่ใช้แสดงในรายงาน ก็ผูกกับบัญชีเช่นกัน
       ยกเว้นบิลขายส่ง ที่ by = ชื่อคนขับรถ ซึ่งอาจไม่ใช่คนออกบิล */
    if(!(e.type==='sell'&&e.channel==='ขายส่ง')) e.by=u.name;
  });
  /* ---- ราคาขาย: เซิร์ฟเวอร์คิดเองทุกครั้ง ----
     ยกเว้นบิลที่ตั้งราคาเอง (priceRule='manual') ซึ่งต้องมีสิทธิ์ price.edit
     เรตตามจำนวนคิดจากจำนวนแพ็ครวมทั้งบิล จึงต้องจัดกลุ่มตามเลขบิลก่อน */
  const sells=added.filter(e=>e.type==='sell');
  if(sells.length){
    const PR=store.readDoc('master/prices')||{};
    const CO=store.readDoc('master/costs')||{};
    const CUi=(store.readDoc('master/customers')||{}).items||[];
    const SK=idx((store.readDoc('master/skus')||{}).items||[]);
    const CU={}; CUi.forEach(c=>{ if(c&&c.id)CU[c.id]=c });
    const isPack=id=>{ const k=SK[id]; return !k||(k.unit||'แพ็ค')==='แพ็ค' };
    const grp={};
    sells.forEach(e=>{ const k=String(e.bill||e.billNo||'_'); (grp[k]=grp[k]||[]).push(e) });
    Object.keys(grp).forEach(k=>{
      let packs=0;
      grp[k].forEach(e=>{ if(isPack(e.skuId))packs+=(parseFloat(e.qty)||0) });
      grp[k].forEach(e=>{
        if(e.priceRule==='manual'){ need(u,'price.edit') }
        else{
          const r=pricing.priceFor({skuId:e.skuId,channel:e.channel,totalPacks:packs,
            customer:e.custId?CU[e.custId]:null,prices:PR,costs:CO,
            date:String(e.ts||'').slice(0,10)});
          e.unit=r.price; e.priceRule=r.rule;
        }
        e.amount=Math.round((parseFloat(e.unit)||0)*(parseFloat(e.qty)||0)*100)/100;
      });
    });
  }
  /* ---- ค่าใช้จ่าย ---- */
  const ax=idx(cur.exp), bx=idx(body.exp);
  const addedX=[],removedX=[];
  for(const k in bx) if(!ax[k]) addedX.push(bx[k]);
  for(const k in ax) if(!bx[k]) removedX.push(ax[k]);
  if(addedX.length||removedX.length) need(u,'expense.log');
  addedX.forEach(e=>{
    if(!(parseFloat(e.amount)>0)) fail('need_amount','ค่าใช้จ่ายต้องใส่จำนวนเงิน');
    if(!String(e.note||'').trim()&&!String(e.cat||'').trim())
      fail('need_note','ค่าใช้จ่ายต้องใส่รายละเอียดหรือเลือกประเภท');
    e.uid=u.id; e.uname=u.name; e.by=u.name;      /* ใครเบิก — ปลอมไม่ได้ */
    e.amount=Math.round((parseFloat(e.amount)||0)*100)/100;
  });
  if(addedX.length||removedX.length)
    audit(u,'expense',{date:p.split('/')[1],add:addedX.length,del:removedX.length});
  const am=idx(cur.mat), bm=idx(body.mat);
  const addedM=[],removedM=[];
  for(const k in bm) if(!am[k]) addedM.push(bm[k]);
  for(const k in am) if(!bm[k]) removedM.push(am[k]);
  if(addedM.some(x=>x.type!=='auto')) need(u,'mat.move');
  if(removedM.length) need(u,'mat.move');
  /* รับเข้า-เบิกใช้วัตถุดิบ ต้องมีเลขที่เอกสารทุกครั้ง (ยกเว้นที่ระบบตัดเองจากการผลิต) */
  addedM.forEach(e=>{
    if(e.type==='auto')return;
    if(!String(e.docNo||'').trim()) fail('need_docno','รายการวัตถุดิบต้องมีเลขที่เอกสาร');
  });
  addedM.forEach(e=>{ e.uid=u.id; e.uname=u.name; if(e.type!=='auto') e.by=u.name });
  /* ยอดสุทธิคำนวณที่เซิร์ฟเวอร์เสมอ ฝั่งหน้าเว็บแก้ไม่ได้ */
  body.net=netOf(body.entries);
  body.matNet=matNetOf(body.mat);
  body.expTotal=(body.exp||[]).reduce((t,e)=>t+(parseFloat(e.amount)||0),0);
  if(added.length||removed.length||addedM.length||removedM.length)
    audit(u,'ledger',{date:p.split('/')[1],add:added.length,del:removed.length,mat:addedM.length});
  return body;
}
function canRead(u,p){
  if(p==='master/costs') return has(u,'money.view');
  if(p==='master/matcosts') return has(u,'mat.cost');   /* ต้นทุนวัตถุดิบ เห็นเฉพาะคนที่เกี่ยวข้อง */
  return true;
}

/* ไลน์นี้ผลิตสินค้านี้ได้ไหม — อ่านจาก master/config ทุกครั้ง ผู้จัดการแก้ได้เอง */
function lineCanMake(lineId,skuId){
  const cfg=store.readDoc('master/config')||{};
  const lines=Array.isArray(cfg.lines)&&cfg.lines.length?cfg.lines:null;
  if(!lines) return true;                       /* ยังไม่ได้ตั้งค่า อย่าไปขวางงาน */
  const L=lines.find(x=>x&&x.id===lineId);
  if(!L) return true;                           /* ไลน์ที่ไม่รู้จัก ปล่อยผ่าน */
  const SK=(store.readDoc('master/skus')||{}).items||[];
  const sku=SK.find(x=>x&&x.id===skuId);
  if(!sku) return true;                         /* สินค้าที่ไม่รู้จัก ปล่อยผ่าน */
  return linerules.canMake(L,sku,cfg.lineSkus||{});
}

/* ไฟล์บนดิสก์ถูกแก้หลังเซิร์ฟเวอร์เริ่มทำงานหรือไม่
   ถ้าใช่ แปลว่าอัปเดตแล้วแต่ยังไม่ได้ปิด-เปิดใหม่ ต้องเตือนผู้ใช้ */
function staleBuild(){
  try{
    const t0=new Date(STARTED).getTime();
    return ['server.js','roles.js','pricing.js','lines.js','store.js','auth.js','public/index.html']
      .some(f=>{ try{ return fs.statSync(path.join(__dirname,f)).mtimeMs>t0+1000 }catch(e){ return false } });
  }catch(e){ return false }
}

/* ---------- API ---------- */
async function api(req,res,u,parts,q){
  const m=req.method;

  if(parts[0]==='login'&&m==='POST'){
    const b=await readBody(req);
    const user=auth.verify(b.username,b.password);
    if(!user){ audit(null,'login_fail',{username:b.username}); return send(res,401,{error:'invalid'}) }
    const tok=auth.sign(user,b.remember?30:1);
    audit(user,'login',{});
    return send(res,200,{ok:true},{'Set-Cookie':'fs='+tok+'; HttpOnly; SameSite=Lax; Path=/; Max-Age='+(b.remember?2592000:86400)});
  }
  if(parts[0]==='health'){
    return send(res,200,{ok:true,users:auth.count(),at:new Date().toISOString(),
      build:BUILD,started:STARTED,stale:staleBuild()});
  }
  if(parts[0]==='logout'){ return send(res,200,{ok:true},{'Set-Cookie':'fs=; HttpOnly; Path=/; Max-Age=0'}) }

  if(!u) return send(res,401,{error:'auth'});

  if(parts[0]==='me'&&m==='GET'){
    const perms=auth.permsOf(u), rl=rolesOf(u);
    return send(res,200,{user:{id:u.id,name:u.name,username:u.username,role:rl[0]||'',roles:rl,
      roleName:roleNames(rl),dept:u.dept||deptOf(rl)},perms,tabs:tabsFor(perms),permLabels:PERMS,roles:ROLES,
      build:BUILD,stale:staleBuild()});
  }
  if(parts[0]==='stream'){
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    res.write('retry: 3000\n\n'); clients.add(res);
    const ping=setInterval(()=>{try{res.write(': ping\n\n')}catch(e){}},25000);
    req.on('close',()=>{clearInterval(ping);clients.delete(res)});
    return;
  }
  if(parts[0]==='doc'){
    const p=parts.slice(1).join('/');
    if(m==='GET'){
      if(!canRead(u,p)) return send(res,200,{exists:false});
      const d=store.readDoc(p);
      return send(res,200,{exists:!!d,data:d||null,version:d?d.__v:0});
    }
    if(m==='PUT'){
      const b=await readBody(req);
      let body;
      try{ body=checkDocWrite(u,p,b.data||{}) }
      catch(e){ return send(res,403,{error:'forbidden',perm:e.perm||'',reason:e.reason||'',message:e.msg||''}) }
      try{
        const out=await store.writeDoc(p,body,b.ifVersion);
        broadcast(p);
        return send(res,200,{ok:true,version:out.__v});
      }catch(e){
        if(e.code==='version_mismatch') return send(res,409,{error:'version_mismatch',version:e.version});
        return send(res,500,{error:'write_failed'});
      }
    }
    if(m==='DELETE'){
      try{ checkDocWrite(u,p,{entries:[],mat:[]}) }catch(e){ return send(res,403,{error:'forbidden'}) }
      await store.deleteDoc(p); broadcast(p); audit(u,'delete',{path:p});
      return send(res,200,{ok:true});
    }
  }
  if(parts[0]==='col'&&m==='GET'){
    const col=parts.slice(1).join('/');
    const docs=store.listCollection(col).filter(d=>canRead(u,col+'/'+d.id));
    return send(res,200,{docs});
  }
  if(parts[0]==='lease'&&m==='POST'){
    const b=await readBody(req);
    return send(res,200,store.acquire(parts.slice(1).join('/'),b.holder||'x',b.ttlMs));
  }
  /* ---- สำรองข้อมูล / กู้คืนข้อมูล (เฉพาะคนที่จัดการผู้ใช้ได้) ---- */
  if(parts[0]==='backup'&&m==='GET'){
    if(!has(u,'user.manage')) return send(res,403,{error:'forbidden'});
    const dump=backup.exportAll();
    audit(u,'backup_export',dump.counts);
    const name='finra-backup-'+new Date().toISOString().slice(0,10)+'.json';
    return send(res,200,Buffer.from(JSON.stringify(dump,null,2),'utf8'),{
      'Content-Type':'application/json; charset=utf-8',
      'Content-Disposition':'attachment; filename="'+name+'"'
    });
  }
  if(parts[0]==='restore'&&m==='POST'){
    if(!has(u,'user.manage')) return send(res,403,{error:'forbidden'});
    const b=await readBody(req);
    const bad=backup.check(b&&b.data);
    if(bad) return send(res,400,{error:'bad_file',message:bad});
    try{
      const r=backup.importAll(b.data,{keepUsers:!!b.keepUsers});
      audit(u,'backup_restore',r);
      broadcast('*');
      return send(res,200,{ok:true,...r});
    }catch(e){ return send(res,400,{error:'restore_failed',message:String(e&&e.message||e)}) }
  }
  if(parts[0]==='users'){
    if(m==='GET'){ need2(res,u,'user.manage'); if(!has(u,'user.manage'))return;
      return send(res,200,{users:auth.listUsers(),roles:ROLES}) }
    if(m==='POST'){ if(!has(u,'user.manage'))return send(res,403,{error:'forbidden'});
      const b=await readBody(req);
      if(!b.username||!b.password)return send(res,400,{error:'missing'});
      if(String(b.password).length<4)return send(res,400,{error:'short_password'});
      try{ const nu=auth.addUser(b); audit(u,'user_add',{username:nu.username,roles:(nu.roles||[]).join('+')});
        return send(res,200,{ok:true,id:nu.id}) }
      catch(e){ return send(res,400,{error:e.message}) }
    }
    if(m==='PUT'){ if(!has(u,'user.manage'))return send(res,403,{error:'forbidden'});
      const b=await readBody(req);
      try{ auth.updateUser(b.id,b); audit(u,'user_update',{id:b.id});
        return send(res,200,{ok:true}) }
      catch(e){ return send(res,400,{error:e.message}) }
    }
  }
  if(parts[0]==='password'&&m==='POST'){
    const b=await readBody(req);
    if(!auth.verify(u.username,b.old||''))return send(res,400,{error:'wrong_password'});
    if(String(b.new||'').length<4)return send(res,400,{error:'short_password'});
    auth.updateUser(u.id,{password:b.new}); audit(u,'password_change',{});
    return send(res,200,{ok:true});
  }
  return send(res,404,{error:'not_found'});
}
function need2(res,u,p){ if(!has(u,p)) send(res,403,{error:'forbidden'}) }

/* ---------- static + router ---------- */
const server=http.createServer(async (req,res)=>{
  try{
    const q=url.parse(req.url,true), p=decodeURIComponent(q.pathname);
    const u=auth.readToken(cookies(req).fs);
    if(p.startsWith('/api/')){
      return await api(req,res,u,p.slice(5).split('/').filter(Boolean),q.query);
    }
    let f=p==='/'?'/index.html':p;
    const full=path.join(PUB,path.normalize(f).replace(/^(\.\.[/\\])+/,''));
    if(!full.startsWith(PUB)) return send(res,403,'no');
    fs.readFile(full,(e,d)=>{
      if(e) return send(res,404,'ไม่พบหน้านี้');
      send(res,200,d,{'Content-Type':MIME[path.extname(full)]||'application/octet-stream'});
    });
  }catch(e){ send(res,500,{error:String(e&&e.message||e)}) }
});
fillMissingSkuFields();
server.listen(PORT,()=>{
  const nets=require('os').networkInterfaces(); const ips=[];
  Object.values(nets).forEach(a=>a.forEach(x=>{if(x.family==='IPv4'&&!x.internal)ips.push(x.address)}));
  console.log('');
  console.log('============================================================');
  console.log('   FINRA STOCK SERVER  -  RUNNING');
  console.log('============================================================');
  console.log('   This computer   : http://localhost:'+PORT);
  ips.forEach(ip=>console.log('   Other computers : http://'+ip+':'+PORT));
  console.log('============================================================');
  if(auth.count()===0){
    console.log('');
    console.log('   [!!] No users yet. Close this window and run  2-ADD-USER.bat');
  }
  console.log('');
  console.log('   Keep this window open. Closing it stops the system.');
  console.log('');
});
