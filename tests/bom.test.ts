/**
 * The rules against what the shop shipped before: the old hardware
 * calculator, as copied into the "PFI Shipped Hardware BOM" sheet.
 *
 * The rules match the calculator exactly for every part 12" deep or less
 * built from one panel per side. Where they differ, the difference has to be
 * one of the open questions on the Rule Sheet; an unexplained difference
 * fails the test. When a question is answered and a rule changes, the lists
 * below move with it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePartNumber, buildUnit, boltsPerJoint, lengthPieces, layers, type StraightPart, type UnitBuild } from '../src/index.ts';

interface BomRow { part: string; section: string; bolts: number; nuts: number; llb: number; screws: number; tapcons: number }
const bom = JSON.parse(readFileSync(new URL('../data/shipped-hardware-bom.json', import.meta.url), 'utf8')) as BomRow[];
const build = JSON.parse(readFileSync(new URL('../data/build-components.json', import.meta.url), 'utf8')) as Record<string, number>;

/** Closed squares the calculator built from 24X8 and 28X12 stock. Sides that are not whole 6" cells can't be a closed square from 36X12. */
const NOT_WHOLE_CELLS = ['44SQ8', '44SQ12', '28SQ12', '56SQ12', '28SQ16', '56SQ16', '28SQ24', '56SQ24', '28SQ9'];

/** Parts the rules reproduce exactly, shipped and in-plant. */
const EXACT = [
  '241Q8', '242Q8', '243Q8', '24SQ8', '441Q8', '442Q8', '443Q8',
  '361Q12', '362Q12', '363Q12', '36SQ12',
  '201Q8', '202Q8', '342Q8', '382Q8', '293Q8', '343Q8', '362Q8',
];

/**
 * Rows where the calculator's own Tapcon count does not follow its own LLB
 * count: its 28"-side 24"-deep rows repeat the 16" counts, and 723Q16 has
 * 24 where 722Q16's pattern gives 20.
 */
const CALCULATOR_INCONSISTENT = ['281Q24', '282Q24', '283Q24', '723Q16'];

/** Lengths the calculator built from 24X8 or 28X12 stock, with ears at both ends. */
const OLD_STOCK_LENGTHS = new Set([24, 28, 44, 45, 56]);

/** What the calculator appears to have used: depth ÷ 4 rounded, at least 2, and one more per corner on a part deeper than 12". */
const legacyBoltsPerCorner = (D: number) => Math.max(2, Math.round(D / 4)) + (D > 12 ? 1 : 0);

type Reason =
  | 'bolts-per-corner'
  | 'llb-long-or-deep'
  | 'tapcons-follow-llb'
  | 'custom-wall-end'
  | 'calculator-inconsistent'
  | 'in-plant-old-stock'
  | 'in-plant-seam-bolts';

function explain(row: BomRow, p: StraightPart, u: UnitBuild, inPlant: number | undefined): { reasons: Reason[]; unexplained: string[] } {
  const reasons: Reason[] = [];
  const unexplained: string[] = [];
  const D = p.depth;
  const L = p.length;

  if (u.hw.bolts !== row.bolts) {
    if (row.bolts === p.corners * legacyBoltsPerCorner(D) && u.hw.bolts === p.corners * boltsPerJoint(D)) reasons.push('bolts-per-corner');
    else unexplained.push(`bolts ${row.bolts} -> ${u.hw.bolts}`);
  }
  if (row.nuts !== row.bolts || u.hw.nuts !== u.hw.bolts) unexplained.push('nuts are not the bolt count');

  if (u.hw.llb !== row.llb) {
    if (L > 36 || D > 12) reasons.push('llb-long-or-deep');
    else unexplained.push(`LLB ${row.llb} -> ${u.hw.llb}`);
  }
  if (row.screws !== row.llb || u.hw.screws !== u.hw.llb) unexplained.push('screws are not the LLB count');

  // The calculator's Tapcons follow the same rule as the sheet's, given its LLB count...
  const calculatorRule = row.llb + (p.shape === 'SQ' ? 0 : 2 * boltsPerJoint(D));
  if (row.tapcons !== calculatorRule) {
    if (CALCULATOR_INCONSISTENT.includes(row.part)) reasons.push('calculator-inconsistent');
    else unexplained.push(`calculator Tapcons ${row.tapcons} do not follow its LLB (${calculatorRule})`);
  } else if (u.hw.tapcons !== row.tapcons) {
    // ...so a difference is the LLB difference, or 4L brackets at a custom wall end in place of ear Tapcons.
    const fromLlb = u.hw.llb - row.llb;
    const fromEnds = u.hw.l4 - u.customEnds * boltsPerJoint(D);
    if (u.hw.tapcons - row.tapcons === fromLlb + fromEnds) {
      if (fromLlb) reasons.push('tapcons-follow-llb');
      if (fromEnds) reasons.push('custom-wall-end');
    } else unexplained.push(`Tapcons ${row.tapcons} -> ${u.hw.tapcons}`);
  }

  if (inPlant !== undefined && inPlant !== u.inPlant) {
    const strips = p.sides * lengthPieces(L).pieces.filter((x) => x.len === 36).length * (layers(D).length - 1);
    if (OLD_STOCK_LENGTHS.has(L)) reasons.push('in-plant-old-stock');
    else if (D > 12 && u.inPlant - inPlant === strips) reasons.push('in-plant-seam-bolts');
    else unexplained.push(`in-plant ${inPlant} -> ${u.inPlant}`);
  }
  return { reasons, unexplained };
}

test('the rules against the old hardware calculator', (t) => {
  const exact: string[] = [];
  const counts: Partial<Record<Reason, number>> = {};
  const failures: string[] = [];
  const customLength: string[] = [];

  for (const row of bom) {
    const r = parsePartNumber(row.part);
    if (!r.ok) {
      assert.ok(NOT_WHOLE_CELLS.includes(row.part), `${row.part} should parse: ${r.error}`);
      continue;
    }
    assert.equal(r.part.type, 'straight');
    const p = r.part as StraightPart;
    const u = buildUnit(p);
    if (u.customEnds) customLength.push(row.part);
    const inPlant = build[row.part];
    const same = u.hw.bolts === row.bolts && u.hw.llb === row.llb && u.hw.tapcons === row.tapcons && (inPlant === undefined || inPlant === u.inPlant);
    if (same) {
      exact.push(row.part);
      continue;
    }
    const { reasons, unexplained } = explain(row, p, u, inPlant);
    for (const reason of reasons) counts[reason] = (counts[reason] ?? 0) + 1;
    if (unexplained.length) failures.push(`${row.part}: ${unexplained.join(', ')}`);
  }

  t.diagnostic(`exact matches: ${exact.length} of ${bom.length - NOT_WHOLE_CELLS.length} buildable parts`);
  for (const [reason, n] of Object.entries(counts)) t.diagnostic(`${reason}: ${n}`);
  t.diagnostic(`built as a custom length (4L brackets): ${customLength.join(', ')}`);
  assert.deepEqual(failures, [], 'every difference from the calculator must be one of the open questions');
  assert.deepEqual(exact.sort(), [...EXACT].sort());
  for (const code of NOT_WHOLE_CELLS) assert.ok(bom.some((row) => row.part === code), code);
});

test('the calculator agrees on the bolt count at 8" and 12"; it differs only deeper than 12" or off a 4" step', () => {
  for (const row of bom) {
    const r = parsePartNumber(row.part);
    if (!r.ok || r.part.type !== 'straight') continue;
    const u = buildUnit(r.part);
    const D = r.part.depth;
    if (u.hw.bolts !== row.bolts) assert.ok(D > 12 || D % 4 !== 0, `${row.part} at ${D}"`);
    else if (D === 8 || D === 12) assert.equal(u.hw.bolts, row.bolts, row.part);
  }
});
