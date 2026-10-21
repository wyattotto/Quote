// Regenerates data/order-builder-golden.json from the Order Builder engine in reference/.
//   node scripts/make-golden.cjs
const fs = require('node:fs');
const path = require('node:path');
const P = require('../reference/order-builder-engine.cjs');
const root = path.join(__dirname, '..');
const bom = JSON.parse(fs.readFileSync(path.join(root, 'data/shipped-hardware-bom.json'), 'utf8')).map((r) => r.part);
const extra = ['36SQ12','42SQ16','362Q16','241Q8','42X16','421Q16','422Q16','423Q16','32R12','32HR12','323Q12','321Q12','32HR1812','32RT3612','32RT2212','323Q1816','321/4R12','36SQ30','36SQ28','36SQ20','36SQ36','661Q12','841Q12','482Q16','4\'-8"2Q6','2\'-8"2Q12','5\'-3.5"1Q16','32HR612','32HR1216','901Q16','541Q12','48SQ18','30SQ12','72SQ12','362Q8','24SQ6','30SQ10','32RT1224','32HR24','321Q616'];
const parts = {};
for (const code of [...new Set([...bom, ...extra])]) {
  const p = P.parse(code, '');
  if (p.error) { parts[code] = { error: p.error }; continue; }
  const u = P.unit(p);
  parts[code] = {
    part: p.type === 'straight' ? { type: 'straight', shape: p.shape, length: p.length, depth: p.depth } : { type: 'round', kind: p.kind, depth: p.depth, ext: p.ext },
    layers: u.layers.map((l) => `${l.h}${l.role[0]}`),
    hw: u.hw, inPlant: u.inPlant, ears: u.ear.length,
    runs: u.runs.map((r) => `${r.L}${r.role[0]}`),
    blanks: u.blanks.map((b) => `${b.src}:${b.len}:${b.layer.h}${b.layer.role[0]}`).sort(),
    notes: u.notes,
  };
}
// The same orders as tests/golden.test.ts.
const ORDERS = {
  example: [['42SQ16', 10], ['362Q12', 4], ['36SQ30', 2], ['32R12', 2], ['32HR1812', 2]],
  lengthTable: [['241Q12', 1], ['301Q12', 1], ['361Q12', 1], ['421Q12', 1], ['481Q12', 1], ['721Q12', 1], ['841Q12', 1]],
  depthTable: [['361Q8', 1], ['361Q12', 1], ['361Q16', 1], ['361Q20', 1], ['361Q24', 1], ['361Q28', 1], ['361Q30', 1], ['361Q36', 1]],
  addons: [['421Q12', 7], ['481Q12', 5], ['541Q12', 4], ['601Q12', 3], ['661Q12', 2]],
};
const orders = {};
for (const [name, lines] of Object.entries(ORDERS)) {
  const r = P.order(lines.map(([code, qty]) => ({ code, ext: '', qty })));
  orders[name] = {
    stock: r.stock, addon: r.addon, cutdown: r.cutdown,
    rips: Object.fromEntries(Object.entries(r.rips).map(([k, v]) => [k, { qty: v.qty, leftover: v.leftover, keepLeftover: !!v.keepLeftover }])),
    ears: r.ears, saved: r.saved, leftoverCells: r.leftoverCells, hw: r.hw, inPlant: r.inPlant, shelfTop8: r.shelfTop8, errors: r.errors,
  };
}
fs.writeFileSync(path.join(root, 'data/order-builder-golden.json'), JSON.stringify({ parts, orders }, null, 1) + '\n');
console.log(`${Object.keys(parts).length} parts, ${Object.keys(orders).length} orders`);
