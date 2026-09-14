/* ===== สิทธิ์การใช้งาน: กำหนดที่เดียว ใช้ทั้งฝั่งเซิร์ฟเวอร์และหน้าเว็บ =====
   1 คน ถือได้หลายตำแหน่ง — สิทธิ์ที่ได้ = รวมทุกตำแหน่งเข้าด้วยกัน      */
const PERMS = {
  'sell.walk'     : 'ออกบิลขายหน้าโรงงาน',
  'sell.wholesale': 'ออกบิลขายส่ง / ขนส่ง',
  'sell.delete'   : 'ลบบิล / ลบรายการ',
  'produce.station':'สถานีไลน์ผลิต (เริ่ม-จบรอบ, สแกน)',
  'produce.log'   : 'บันทึกผลิต / ของเสีย / ปรับยอด',
  'mat.move'      : 'รับเข้า - เบิกใช้วัตถุดิบ',
  'stock.count'   : 'ตรวจนับสต๊อกและวัตถุดิบ',
  'master.edit'   : 'แก้สินค้า วัตถุดิบ กำลังผลิต',
  'money.view'    : 'เห็นต้นทุน กำไร และยอดเงิน',
  'report.export' : 'ส่งออก CSV และพิมพ์ป้ายพาเลท',
  'user.manage'   : 'จัดการผู้ใช้และสิทธิ์'
};
const ROLES = {
  manager  : { name:'ผู้จัดการ / เจ้าของ', dept:'บริหาร', nameEn:'Manager / Owner (everything)',
    perms:Object.keys(PERMS) },
  warehouse_lead: { name:'หัวหน้าคลัง', dept:'คลังสินค้า', nameEn:'Warehouse supervisor',
    perms:['sell.walk','sell.wholesale','sell.delete','produce.log','mat.move','stock.count','master.edit','report.export'] },
  prod_lead : { name:'หัวหน้าฝ่ายผลิต', dept:'ผลิต', nameEn:'Production supervisor',
    perms:['produce.station','produce.log','mat.move','stock.count','master.edit','report.export'] },
  accounting: { name:'บัญชี / การเงิน', dept:'บัญชี', nameEn:'Accounting / Finance',
    perms:['money.view','report.export','sell.delete'] },
  production: { name:'พนักงานคุมเครื่อง', dept:'ผลิต', nameEn:'Production line operator',
    perms:['produce.station','produce.log','mat.move'] },
  sales_front:{ name:'ขายหน้าโรงงาน', dept:'ขาย', nameEn:'Walk-in sales (front of factory)',
    perms:['sell.walk','report.export'] },
  delivery  : { name:'ขนส่ง / ขายส่ง', dept:'ขนส่ง', nameEn:'Delivery / wholesale',
    perms:['sell.wholesale','report.export'] },
  driver    : { name:'พนักงานขับรถ', dept:'ขนส่ง', nameEn:'Truck driver (issue delivery bills only)',
    perms:['sell.wholesale'] },
  warehouse : { name:'คลัง / จัดซื้อ', dept:'คลังสินค้า', nameEn:'Warehouse / purchasing',
    perms:['mat.move','produce.log','report.export'] },
  purchasing: { name:'จัดซื้อ', dept:'จัดซื้อ', nameEn:'Purchasing (materials + cost view)',
    perms:['mat.move','stock.count','money.view','report.export'] },
  office    : { name:'ธุรการ / ออฟฟิศ', dept:'สำนักงาน', nameEn:'Office admin',
    perms:['produce.log','stock.count','report.export'] },
  qc        : { name:'QC / ช่าง', dept:'ควบคุมคุณภาพ', nameEn:'QC / technician',
    perms:['mat.move'] },
  qc_lead   : { name:'หัวหน้า QC', dept:'ควบคุมคุณภาพ', nameEn:'QC supervisor',
    perms:['mat.move','produce.log','stock.count','report.export'] },
  maintenance:{ name:'ซ่อมบำรุง', dept:'ซ่อมบำรุง', nameEn:'Maintenance',
    perms:['mat.move','produce.log'] },
  viewer    : { name:'ดูอย่างเดียว', dept:'-', nameEn:'View only (no changes)',
    perms:[] }
};

/* ---- ตำแหน่งของผู้ใช้ 1 คน: คืนเป็น array เสมอ (รองรับข้อมูลเก่าที่มี role เดียว) ---- */
function rolesOf(u){
  if(!u) return [];
  let list = Array.isArray(u.roles) && u.roles.length ? u.roles : (u.role ? [u.role] : []);
  list = list.filter(r=>ROLES[r]);
  const seen={}, out=[];
  list.forEach(r=>{ if(!seen[r]){seen[r]=1;out.push(r)} });
  return out;
}
/* ---- สิทธิ์ = รวมทุกตำแหน่ง (union) ---- */
function permsOfRoles(list){
  const seen={}, out=[];
  (list||[]).forEach(r=>{
    ((ROLES[r]||{}).perms||[]).forEach(p=>{ if(!seen[p]){seen[p]=1;out.push(p)} });
  });
  return Object.keys(PERMS).filter(p=>seen[p]);   /* เรียงตามลำดับมาตรฐาน */
}
function roleNames(list){ return (list||[]).map(r=>(ROLES[r]||{}).name||r).join(' + ') }
function deptOf(list){
  const seen={}, out=[];
  (list||[]).forEach(r=>{ const d=(ROLES[r]||{}).dept; if(d&&d!=='-'&&!seen[d]){seen[d]=1;out.push(d)} });
  return out.join(' / ');
}
/* ผู้ใช้เห็นแท็บไหนบ้าง — คำนวณจากสิทธิ์ */
function tabsFor(perms){
  const has=p=>perms.indexOf(p)>=0;
  const t=['dash'];
  if(has('produce.station'))t.push('station');
  if(has('sell.walk')||has('sell.wholesale'))t.push('sale');
  if(has('produce.log'))t.push('log');
  t.push('stock');
  if(has('mat.move'))t.push('mat');
  t.push('rep');        /* รายงาน & KPI — อ่านอย่างเดียว ตัวเงินซ่อนถ้าไม่มี money.view */
  t.push('plan');
  if(has('master.edit')||has('user.manage')||has('report.export'))t.push('set');
  return t;
}
module.exports={PERMS,ROLES,tabsFor,rolesOf,permsOfRoles,roleNames,deptOf};
