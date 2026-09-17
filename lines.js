/* ===== ไลน์ไหนผลิตสินค้าอะไรได้ — กติกาเดียว ใช้ทั้งเซิร์ฟเวอร์และหน้าเว็บ =====

   ลำดับการตัดสิน
     1. มีชื่อสินค้าอยู่ใน lineSkus ของไลน์นั้น -> ใช้ค่านั้นตรงๆ (true/false)
     2. ไลน์ที่ตั้ง strict ไว้ -> ผลิตไม่ได้ (ต้องติ๊กเองเท่านั้น)
     3. นอกนั้น -> ผลิตได้ถ้าขนาดตรงกับที่ไลน์นั้นรองรับ                      */

function sizeKey(sku){
  var m=/(\d{3,4})/.exec((sku && sku.size) || '');
  return m ? m[1] : '600';
}
function isPack(sku){ return ((sku && sku.unit) || 'แพ็ค') === 'แพ็ค' }

function canMake(line, sku, lineSkus){
  if (!line || !sku) return false;
  if (!isPack(sku)) return false;                 /* น้ำถังไม่ได้ผลิตที่ไลน์ */
  var m = (lineSkus || {})[line.id] || {};
  if (Object.prototype.hasOwnProperty.call(m, sku.id)) return m[sku.id] === true;
  if (line.strict) return false;
  return (line.sizes || []).indexOf(sizeKey(sku)) >= 0;
}

module.exports = { canMake, sizeKey, isPack };
