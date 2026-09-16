/* ===== ราคาขาย: กติกาเดียว ใช้ทั้งฝั่งเซิร์ฟเวอร์และหน้าเว็บ =====

   ลำดับการหาราคา (ราคาต่อ 1 แพ็ค)
     1. โปรโมชั่นที่ยังไม่หมดอายุ และครอบคลุมสินค้า+ช่องทางนี้   -> ใช้ราคาโปร (ถูกสุดชนะ)
     2. ขายส่ง: เทียบ "ราคาที่ตกลงกับลูกค้า" กับ "เรตตามจำนวน"  -> ใช้อันที่ถูกกว่า
     3. ขายหน้าโรงงาน: ราคาหน้าร้านของสินค้านั้น
     4. ไม่มีอะไรเลย -> ราคาตั้งต้นใน master/costs

   เรตตามจำนวน คิดจาก "จำนวนแพ็ครวมทั้งบิล" ไม่ใช่ต่อรายการ
   เพราะลูกค้าสั่งรวมกันทีเดียวแล้วได้เรตดีขึ้น (ตามใบราคา OEM)          */

function num(x) { var v = parseFloat(x); return isFinite(v) ? v : 0 }

/* หาเรตตามจำนวน: ขั้นที่สูงที่สุดที่จำนวนถึง */
function tierPrice(tiers, totalPacks) {
  if (!Array.isArray(tiers) || !tiers.length) return null;
  var best = null;
  tiers.forEach(function (t) {
    var min = num(t.min), p = num(t.price);
    if (p <= 0 || totalPacks < min) return;
    if (!best || min > best.min) best = { min: min, price: p };
  });
  return best;
}

/* โปรโมชั่นที่ใช้ได้กับสินค้านี้ในวันนี้ */
function promoPrice(promos, skuId, channel, isoDate) {
  if (!Array.isArray(promos)) return null;
  var best = null;
  promos.forEach(function (p) {
    if (p.active === false) return;
    if (p.from && isoDate < p.from) return;
    if (p.to && isoDate > p.to) return;
    if (p.channel && p.channel !== 'all' && p.channel !== channel) return;
    if (Array.isArray(p.skus) && p.skus.length && p.skus.indexOf(skuId) < 0) return;
    var v = num(p.price);
    if (v <= 0) return;
    if (!best || v < best.price) best = { price: v, name: p.name || 'โปรโมชั่น', id: p.id };
  });
  return best;
}

/* ---- ตัวหลัก ----
   opts: {skuId, channel:'หน้าโรงงาน'|'ขายส่ง', totalPacks, customer, prices, costs, date}
   คืน {price, rule, label}  rule = promo | customer | tier | walk | base | none      */
function priceFor(opts) {
  opts = opts || {};
  var skuId = opts.skuId,
      channel = opts.channel === 'ขายส่ง' ? 'wh' : 'walk',
      packs = num(opts.totalPacks),
      cust = opts.customer || null,
      P = opts.prices || {},
      costs = opts.costs || {},
      date = opts.date || new Date().toISOString().slice(0, 10);

  /* 1. โปรโมชั่นมาก่อนเสมอ */
  var promo = promoPrice(P.promos, skuId, channel, date);
  if (promo) return { price: promo.price, rule: 'promo', label: promo.name };

  if (channel === 'wh') {
    /* 2ก. ราคาที่ตกลงกับลูกค้ารายนี้ */
    var agreed = cust && cust.rates ? num(cust.rates[skuId]) : 0;
    /* 2ข. เรตตามจำนวนรวมทั้งบิล — ต่อสินค้าก่อน ถ้าไม่มีใช้เรตกลาง */
    var t = tierPrice((P.skuTiers || {})[skuId], packs) || tierPrice(P.tiers, packs);

    if (agreed > 0 && t)  return t.price < agreed
      ? { price: t.price, rule: 'tier', label: 'เรต ' + t.min + ' แพ็คขึ้นไป (ถูกกว่าราคาตกลง)' }
      : { price: agreed,  rule: 'customer', label: 'ราคาที่ตกลงกับลูกค้า' };
    if (agreed > 0)       return { price: agreed, rule: 'customer', label: 'ราคาที่ตกลงกับลูกค้า' };
    if (t)                return { price: t.price, rule: 'tier', label: 'เรต ' + t.min + ' แพ็คขึ้นไป' };
  } else {
    /* 3. ขายหน้าโรงงาน */
    var w = num((P.walk || {})[skuId]);
    if (w > 0) return { price: w, rule: 'walk', label: 'ราคาหน้าโรงงาน' };
  }

  /* 4. ราคาตั้งต้นเดิม */
  var b = num((costs.price || {})[skuId]);
  if (b > 0) return { price: b, rule: 'base', label: 'ราคาตั้งต้น' };
  return { price: 0, rule: 'none', label: 'ยังไม่ได้ตั้งราคา' };
}

/* คิดเงินทั้งบิล: [{skuId,qty}] -> {lines:[...], total} */
function billTotal(items, opts) {
  items = items || [];
  var packs = 0;
  items.forEach(function (it) { packs += num(it.qty) });
  var lines = items.map(function (it) {
    var r = priceFor({
      skuId: it.skuId, channel: opts.channel, totalPacks: packs,
      customer: opts.customer, prices: opts.prices, costs: opts.costs, date: opts.date
    });
    return { skuId: it.skuId, qty: num(it.qty), unit: r.price,
             amount: Math.round(r.price * num(it.qty) * 100) / 100,
             rule: r.rule, label: r.label };
  });
  var total = 0; lines.forEach(function (l) { total += l.amount });
  return { lines: lines, total: Math.round(total * 100) / 100, packs: packs };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { priceFor: priceFor, billTotal: billTotal, tierPrice: tierPrice, promoPrice: promoPrice };
}
