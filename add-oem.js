/* Add the OEM brands found in folder 12_แบรนด์ OEM.
   Safe to run more than once - it never duplicates and never touches
   a product that already exists.                                      */
const fs = require('fs'), path = require('path');
const DOCS = path.join(__dirname, 'data', 'docs');

/* ขนาดที่ใช้จริง มาจากใบเสนอราคาของแต่ละเจ้า (ไซส์ 500 มล. เลิกทำแล้ว จึงนับเป็น 600) */
const OEM = [
  { id: 'tvl',     brand: 'เทวาลัย',      sizes: ['350', '600'] },
  { id: 'ronin',   brand: 'โรนิน',        sizes: ['350', '600'] },
  { id: 'ex24',    brand: 'ซีแพ็ก EX24',  sizes: ['350'] },
  { id: 'flip',    brand: 'Flipper House', sizes: ['600'] },
  { id: 'dwija',   brand: 'DWIJA',        sizes: ['600'] },
  { id: 'luxury',  brand: 'Luxury',       sizes: ['350'] },
  { id: 'stone',   brand: 'Stone House',  sizes: ['350'] },
  { id: 'harley',  brand: 'AAS Harley',   sizes: ['350'] },
  { id: 'porsche', brand: 'AAS Porsche',  sizes: ['350'] },
  { id: 'olarn',   brand: 'โอฬาร',        sizes: ['350'] }
];
const PACKSIZE = { '350': 12, '600': 12, '1500': 6 };

function readDoc(p) {
  try { return JSON.parse(fs.readFileSync(path.join(DOCS, p + '.json'), 'utf8')) } catch (e) { return null }
}
function writeDoc(p, body) {
  const f = path.join(DOCS, p + '.json'), t = f + '.tmp';
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(t, JSON.stringify(body, null, 2));
  fs.renameSync(t, f);
}

const doc = readDoc('master/skus');
if (!doc || !Array.isArray(doc.items)) {
  console.log(' [X] master/skus not found - run  node import.js  first.');
  process.exit(1);
}
const items = doc.items;
const have = {};
items.forEach(s => { have[String(s.brand).trim() + '|' + String(s.size).trim()] = true });

let added = 0;
OEM.forEach(o => {
  o.sizes.forEach(z => {
    const size = z + ' ml';
    if (have[o.brand + '|' + size]) return;
    items.push({
      id: o.id + z,
      brand: o.brand,
      size: size,
      name: 'น้ำดื่มตรา ' + o.brand + ' ' + size,
      packSize: PACKSIZE[z] || 12,
      min: 0,
      active: true,
      barcode: '',
      unit: 'แพ็ค',
      oem: true,                 /* ทำให้แยกแบรนด์ OEM ออกจากแบรนด์ของเราเองได้ */
      bottleId: '',
      capId: ''
    });
    added++;
    console.log('  + ' + o.brand + ' ' + size);
  });
});

/* แบรนด์เดิมที่เป็น OEM อยู่แล้ว ติดธง oem ให้ด้วย จะได้จัดกลุ่มถูก */
const OWN = ['ฟินร่า', 'ฟลาวเวอร์', 'เซ็นจิ', 'ลักกี้พลัส', 'อไลฟ์', 'น้ำถัง'];
let flagged = 0;
items.forEach(s => {
  if (OWN.indexOf(String(s.brand).trim()) < 0 && s.oem !== true) { s.oem = true; flagged++ }
});

if (added || flagged) {
  doc.items = items;
  doc.updatedAt = new Date().toISOString();
  writeDoc('master/skus', doc);
}
console.log('');
console.log('  [OK] added ' + added + ' products, marked ' + flagged + ' existing ones as OEM.');
console.log('       total products now: ' + items.length);
console.log('');
