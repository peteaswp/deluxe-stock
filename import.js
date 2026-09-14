/* นำข้อมูลเดิมเข้าเซิร์ฟเวอร์:  node import.js <โฟลเดอร์ที่มีไฟล์ json>  */
const fs=require('fs'), path=require('path'), store=require('./store');
const src=process.argv[2]||path.join(__dirname,'seed');
function put(p,obj){ return store.writeDoc(p,obj).then(()=>console.log('  +',p)) }
(async()=>{
  if(!fs.existsSync(src)){ console.log('ไม่พบโฟลเดอร์',src); process.exit(1) }
  const f=n=>JSON.parse(fs.readFileSync(path.join(src,n),'utf8'));
  const has=n=>fs.existsSync(path.join(src,n));
  console.log('นำเข้าข้อมูลจาก',src);
  if(has('master_skus.json'))      await put('master/skus',f('master_skus.json'));
  if(has('master_config.json'))    await put('master/config',f('master_config.json'));
  if(has('master_costs.json'))     await put('master/costs',f('master_costs.json'));
  if(has('master_materials.json')) await put('master/materials',f('master_materials.json'));
  if(has('stock_baseline.json'))   await put('stock/baseline',f('stock_baseline.json'));
  if(has('stock_matbaseline.json'))await put('stock/matbaseline',f('stock_matbaseline.json'));
  for(const L of ['L1','L2','L3']) await put('lines/'+L,{status:'idle',packs:0});
  const led=path.join(src,'ledger');
  if(fs.existsSync(led)){
    for(const n of fs.readdirSync(led).filter(x=>x.endsWith('.json')))
      await put('ledger/'+n.slice(0,-5),JSON.parse(fs.readFileSync(path.join(led,n),'utf8')));
  }
  console.log('เสร็จแล้ว');
})();
