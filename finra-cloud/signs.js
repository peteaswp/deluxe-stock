const TYPE_SIGN={produce:1,sell:-1,ret:1,waste:-1,adj_in:1,adj_out:-1};
const MAT_SIGN ={in:1,out:-1,adj_in:1,adj_out:-1,auto:-1};
function netOf(entries){const n={};(entries||[]).forEach(e=>{const s=TYPE_SIGN[e.type];if(s===undefined)return;n[e.skuId]=(n[e.skuId]||0)+s*(+e.qty||0)});return n}
function matNetOf(rows){const n={};(rows||[]).forEach(e=>{const s=MAT_SIGN[e.type];if(s===undefined)return;n[e.matId]=(n[e.matId]||0)+s*(+e.qty||0)});return n}
module.exports={TYPE_SIGN,MAT_SIGN,netOf,matNetOf};
