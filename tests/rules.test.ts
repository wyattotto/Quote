/** The Rule Sheet v1 tables and examples, one test per section. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePartNumber, buildUnit, layers, lengthPieces, addOnPlan, boltsPerJoint, llbPerSide, l4PerWallEnd,
  inPlantBoltsForRun, ripFor, shippedHardware, inPlantBolts, salesOrderDescription,
  type Part, type Hardware,
} from '../src/index.ts';

function part(code: string): Part {
  const r = parsePartNumber(code);
  if (!r.ok) throw new Error(`${code}: ${r.error}`);
  return r.part;
}
const hw = (code: string): Hardware => shippedHardware(part(code));
const shipped = (bolts: number, llb: number, tapcons: number, l4 = 0): Hardware => ({ bolts, nuts: bolts, llb, screws: llb, tapcons, l4, s14: l4 });

test('length build: every side starts from 36X12 and changes in 6" cells', () => {
  const table: Array<[number, Array<[number, string]>, number]> = [
    [24, [[24, 'cutdown']], 0],
    [30, [[30, 'cutdown']], 0],
    [36, [[36, 'full']], 0],
    [42, [[36, 'full'], [6, 'addon']], 0],
    [48, [[36, 'full'], [12, 'addon']], 0],
    [72, [[36, 'full'], [36, 'full']], 1],
    [84, [[36, 'full'], [36, 'full'], [12, 'addon']], 1],
  ];
  for (const [L, pieces, earJoints] of table) {
    const lb = lengthPieces(L);
    assert.deepEqual(lb.pieces.map((p) => [p.len, p.kind]), pieces, `${L}"`);
    assert.equal(lb.earJoints, earJoints, `${L}" ear cuts`);
    assert.equal(lb.odd, false);
  }
  assert.equal(lengthPieces(28).odd, true);
  assert.equal(lengthPieces(56).odd, true);
  assert.deepEqual(lengthPieces(66).pieces.map((p) => p.len), [36, 30]);
});

test('add-ons per 36X12: 3 single cells, 2 two-cell, 1 three-cell with a cell left, 1 four- or five-cell', () => {
  assert.deepEqual(addOnPlan(6, 3), { pieces: 3, cells: 1, per: 3, panels: 1 });
  assert.deepEqual(addOnPlan(6, 4), { pieces: 4, cells: 1, per: 3, panels: 2 });
  assert.deepEqual(addOnPlan(12, 2), { pieces: 2, cells: 2, per: 2, panels: 1 });
  assert.deepEqual(addOnPlan(18, 1), { pieces: 1, cells: 3, per: 1, panels: 1 });
  assert.deepEqual(addOnPlan(24, 1), { pieces: 1, cells: 4, per: 1, panels: 1 });
  assert.deepEqual(addOnPlan(30, 2), { pieces: 2, cells: 5, per: 1, panels: 2 });
  // An odd add-on uses the next whole cell, trimmed at the wall end.
  assert.equal(addOnPlan(8, 1).cells, 2);
});

test('depth build: a full 12" top, 4" or 8" middles, a bottom cut to the remainder', () => {
  const table: Array<[number, string[]]> = [
    [8, ['8 top']],
    [12, ['12 top']],
    [16, ['12 top', '4 bottom']],
    [20, ['12 top', '8 bottom']],
    [24, ['12 top', '12 bottom']],
    [28, ['12 top', '4 middle', '12 bottom']],
    [30, ['12 top', '8 middle', '10 bottom']],
    [36, ['12 top', '8 middle', '4 middle', '12 bottom']],
    [48, ['12 top', '8 middle', '8 middle', '8 middle', '12 bottom']],
    [5.5, ['5.5 top']],
    [25.5, ['12 top', '4 middle', '9.5 bottom']],
  ];
  for (const [D, want] of table) assert.deepEqual(layers(D).map((l) => `${l.h} ${l.role}`), want, `${D}" deep`);
});

test('leftovers: a 4" rip saves a 36X8, an 8" rip scraps 4", a bottom is as big as possible', () => {
  assert.equal(ripFor({ role: 'top', h: 12 }), null);
  assert.deepEqual([ripFor({ role: 'top', h: 8 })!.leftover, ripFor({ role: 'top', h: 8 })!.keepLeftover], [4, false]);
  assert.deepEqual([ripFor({ role: 'middle', h: 4 })!.leftover, ripFor({ role: 'middle', h: 4 })!.keepLeftover], [8, true]);
  assert.deepEqual([ripFor({ role: 'middle', h: 8 })!.leftover, ripFor({ role: 'middle', h: 8 })!.keepLeftover], [4, false]);
  assert.deepEqual([ripFor({ role: 'bottom', h: 4 })!.leftover, ripFor({ role: 'bottom', h: 4 })!.keepLeftover], [8, true]);
  assert.deepEqual([ripFor({ role: 'bottom', h: 10 })!.leftover, ripFor({ role: 'bottom', h: 10 })!.onRib], [2, false]);
  assert.equal(ripFor({ role: 'bottom', h: 12 })!.key, 'flip12');
  assert.equal(ripFor({ role: 'bottom', h: 8 })!.onRib, true);
});

test('shipped hardware examples from the Rule Sheet', () => {
  assert.deepEqual(hw('36SQ12'), shipped(12, 4, 4));
  assert.deepEqual(hw('42SQ16'), shipped(16, 8, 8));
  assert.deepEqual(hw('362Q16'), shipped(4, 4, 12));
  assert.deepEqual(hw('241Q8'), shipped(0, 1, 5));
});

test('bolts per corner: depth ÷ 4, odd depths round down', () => {
  assert.deepEqual([8, 12, 16, 20, 30].map(boltsPerJoint), [2, 3, 4, 5, 7]);
  assert.equal(hw('36SQ30').bolts, 28);
  assert.equal(hw('36SQ30').nuts, 28);
});

test('LLB per side, screws the same', () => {
  assert.equal(llbPerSide(36, 12), 1);
  assert.equal(llbPerSide(30, 8), 1);
  assert.equal(llbPerSide(36, 16), 2);
  assert.equal(llbPerSide(42, 12), 2);
  assert.equal(llbPerSide(48, 12), 3);
  assert.equal(llbPerSide(60, 12), 4);
  assert.equal(llbPerSide(72, 12), 5);
  assert.equal(llbPerSide(72, 24), 5);
  for (const code of ['36SQ12', '722Q16', '32HR1812']) assert.equal(hw(code).screws, hw(code).llb, code);
});

test('Tapcons: on an SQ the LLB count; on open shapes LLB plus depth ÷ 4 at each of the 2 wall ends', () => {
  for (const code of ['36SQ12', '72SQ24', '42SQ16']) assert.equal(hw(code).tapcons, hw(code).llb, code);
  assert.equal(hw('362Q16').tapcons, 4 + 2 * 4);
  assert.equal(hw('421Q16').tapcons, 2 + 2 * 4);
  assert.equal(hw('723Q12').tapcons, 15 + 2 * 3);
});

test('in-plant bolts: 1 per 4" of each layer at a length joint, 1 per every other cell along a depth seam', () => {
  assert.equal(inPlantBolts(part('42X16')), 7, 'the count in the video');
  assert.equal(inPlantBoltsForRun(42, 12), 3);
  assert.equal(inPlantBoltsForRun(42, 8), 2);
  assert.equal(inPlantBoltsForRun(36, 16), 3, 'a 36" strip');
  assert.equal(inPlantBoltsForRun(48, 16), 4 + 3 + 1, '36-to-add-on joint across both layers, then the two strips');
  assert.equal(inPlantBoltsForRun(72, 12), 3, 'a 36-to-36 joint');
  assert.equal(inPlantBoltsForRun(72, 16), 4 + 3 + 3);
  assert.equal(inPlantBoltsForRun(36, 12), 0);
  assert.equal(inPlantBoltsForRun(24, 16), 2, 'a 4-cell strip');
  assert.equal(inPlantBoltsForRun(12, 16), 1);
  assert.equal(inPlantBoltsForRun(6, 16), 0);
});

test('rounds come from 32R12 stock and use the straight-part hardware rules', () => {
  const full = buildUnit(part('32R12'));
  assert.equal(full.blanks.length, 4);
  assert.ok(full.blanks.every((b) => b.src === '32R'));
  assert.deepEqual(full.hw, shipped(12, 4, 4));
  assert.equal(inPlantBolts(part('32R16')), 16, '4 bolts join each round depth piece to the one above');
  assert.equal(inPlantBolts(part('32R12')), 0);

  const half = buildUnit(part('32HR1812'));
  assert.deepEqual(half.runs, [{ L: 18, role: 'extender' }, { L: 18, role: 'extender' }]);
  assert.equal(half.hw.bolts, (1 + 2) * 3, 'one round joint and two round-to-straight joints');
  assert.equal(half.hw.llb, 2 + 1 + 1);
  assert.equal(half.hw.tapcons, 4 + 2 * 3);

  const quarter = buildUnit(part('321Q12'));
  assert.deepEqual(quarter.hw, shipped(0, 1, 1 + 2 * 3));
  assert.deepEqual(buildUnit(part('321Q616')).runs.map((r) => r.role), ['extender', 'extender']);
});

test('racetrack: 32RT + straight length + depth; a 54" pocket is 32RT2212', () => {
  const rt = buildUnit(part('32RT2212'));
  assert.equal(rt.part.type === 'round' ? rt.part.ext : null, 22);
  assert.deepEqual(rt.runs, [{ L: 22, role: 'straight' }, { L: 22, role: 'straight' }]);
  assert.equal(rt.hw.bolts, (2 + 4) * 3, 'two round joints and four round-to-straight joints');
  assert.equal(rt.hw.tapcons, rt.hw.llb, 'closed shape');
  assert.ok(rt.notes.some((n) => n.includes('cut to exact length')));
  assert.equal(salesOrderDescription(rt.part), 'RACETRACK - 32" DIAMETER X 22" STRAIGHTS (54" OVERALL) X 12" DEPTH');
  const long = buildUnit(part('32RT3612'));
  assert.equal(long.ears.length, 2, 'a 36" straight loses its ear at each round');
});

test('three-quarter round with sides: round, side, round, side, round, side', () => {
  const u = buildUnit(part('323Q1816'));
  assert.deepEqual(u.runs.map((r) => r.role), ['straight', 'straight', 'extender']);
  assert.equal(u.hw.bolts, 5 * 4, 'five round-to-straight joints, no round-to-round');
  assert.equal(u.blanks.filter((b) => b.src === '32R').length, 3 * 2);
});

test('custom lengths: only the wall end is cut, held with 4L brackets', () => {
  const v = buildUnit(part("4'-8\"2Q6"));
  assert.equal(v.customEnds, 2);
  assert.equal(v.hw.l4, 2 * 2, '2 per end for a 6" top');
  assert.equal(v.hw.s14, v.hw.l4);
  assert.ok(v.notes.some((n) => n.includes('4L brackets')));
  assert.equal(v.hw.tapcons, v.hw.llb + 0 * boltsPerJoint(6) + v.hw.l4, 'the 4L Tapcons replace the ones through the ear');
  assert.equal(buildUnit(part('421Q16')).customEnds, 0);
  assert.equal(buildUnit(part('44X16')).customEnds, 1);
  assert.equal(buildUnit(part('443Q16')).customEnds, 2);
  assert.deepEqual([16, 18, 24, 12].map((d) => l4PerWallEnd(layers(d))), [3, 4, 4, 2]);
  assert.equal(buildUnit(part('32HR2012')).customEnds, 2, '20" extenders are a custom length');
});
