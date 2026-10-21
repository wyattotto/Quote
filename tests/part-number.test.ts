import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePartNumber, formatPartNumber, describe, salesOrderDescription, roundPart, straightPart,
  type ParseOk, type RoundKind, type StraightShape,
} from '../src/index.ts';

function read(code: string, ext: number | null = null): ParseOk {
  const r = parsePartNumber(code, ext);
  if (!r.ok) throw new Error(`${code}: ${r.error}`);
  return r;
}
function fails(code: string, ext: number | null = null): string {
  const r = parsePartNumber(code, ext);
  if (r.ok) throw new Error(`${code} should not parse, read as ${r.code}`);
  return r.error;
}

test('the Rule Sheet part number table', () => {
  const rows: Array<[string, string, number, number]> = [
    ['421Q16', 'One side', 1, 0],
    ['422Q16', 'Two sides joined', 2, 1],
    ['423Q16', 'Three sides joined', 3, 2],
    ['42SQ16', 'Closed square, four sides', 4, 4],
  ];
  for (const [code, words, sides, corners] of rows) {
    const { part } = read(code);
    assert.equal(part.type, 'straight');
    if (part.type !== 'straight') continue;
    assert.equal(part.length, 42);
    assert.equal(part.depth, 16);
    assert.equal(part.sides, sides, code);
    assert.equal(part.corners, corners, code);
    assert.ok(describe(part).startsWith(words), describe(part));
  }
  const rounds: Array<[string, RoundKind, number, number, number | null]> = [
    ['32R12', 'full', 4, 4, null],
    ['32HR12', 'half', 2, 1, null],
    ['323Q12', 'three', 3, 2, null],
    ['321Q12', 'quarter', 1, 0, null],
    ['321/4R12', 'quarter', 1, 0, null],
    ['32HR1812', 'half', 2, 1, 18],
  ];
  for (const [code, kind, pieces, joints, ext] of rounds) {
    const { part } = read(code);
    assert.equal(part.type, 'round');
    if (part.type !== 'round') continue;
    assert.equal(part.kind, kind, code);
    assert.equal(part.pieces, pieces, code);
    assert.equal(part.roundJoints, joints, code);
    assert.equal(part.ext, ext, code);
    assert.equal(part.depth, 12, code);
  }
});

test('every written form of a round reads as the same part', () => {
  const cases: Array<[string, string]> = [
    // quotes and layout plans: extender or straight length before the letters
    ['3212HR16', '32HR1216'],
    ['3206HR16', '32HR616'],
    ['3206QR16', '321Q616'],
    ['3212RT24', '32RT1224'],
    ['32R1Q24', '321Q24'],
    ['32R3Q24', '323Q24'],
    ['1/4-32R16', '321Q16'],
    ['3/4-32R16', '323Q16'],
    ['32HR24', '32HR24'],
    // the takeoff app
    ['3206U16', '32HR616'],
    ['3206HU16', '321Q616'],
    ['3206R16', '32HR616'],
    ['54RT12', '32RT2212'],
    // Order Builder aliases
    ['32SQ12', '32R12'],
    ['32FR12', '32R12'],
    ['322Q12', '32HR12'],
    ['32U12', '32HR12'],
    ['32QR12', '321Q12'],
    ['32HU12', '321Q12'],
    ['323/4R12', '323Q12'],
    // lower case and spaces
    ['32 hr 1812', '32HR1812'],
    ['3206hr16"', '32HR616'],
  ];
  for (const [input, canonical] of cases) {
    const r = read(input);
    assert.equal(r.code, canonical, input);
    if (r.code !== input.toUpperCase().replace(/[\s"]/g, '')) assert.ok(r.notes.some((n) => n.startsWith('Read ')), `${input} should say how it was read`);
  }
  assert.ok(read('32SQ12').notes.some((n) => n.includes('full round')));
  assert.ok(read('54RT12').notes.some((n) => n.includes('22" straights')));
});

test('straight sides in every written form', () => {
  assert.equal(read('42X16').code, '421Q16');
  assert.equal(read("4'-8\"2Q6").code, '562Q6');
  const odd = read("5'-3.5\"1Q16");
  assert.equal(odd.code, '641Q16');
  assert.ok(odd.notes.some((n) => n.includes('rounded up to 64"')));
  assert.equal(read("4'2Q12").code, '482Q12');
  assert.equal(read("2'-8''X12").code, '32X12');
  // A part number starting with 32 is a round; a 32" straight side is written 32X12 or 2'-8"2Q12.
  const side = read('32X12').part;
  assert.deepEqual(side, straightPart('1Q', 32, 12));
  const v = read("2'-8\"2Q12");
  assert.deepEqual(v.part, straightPart('2Q', 32, 12));
  assert.equal(v.code, "2'-8\"2Q12");
  assert.equal(read('322Q12').part.type, 'round');
});

test('the extender box', () => {
  const boxed = read('32HR12', 18);
  assert.equal(boxed.code, '32HR1812');
  assert.deepEqual(boxed.part, roundPart('half', 12, 18));
  assert.match(fails('32HR1812', 18), /depth only/);
  const over = read('3206HR16', 12);
  assert.equal(over.part.type === 'round' ? over.part.ext : null, 12);
  assert.ok(over.notes.some((n) => n.includes('overrides')));
  assert.equal(read('32RT12', 36).code, '32RT3612');
  // A full round takes no extenders; the box is ignored.
  assert.equal(read('32R12', 6).code, '32R12');
  assert.match(fails('32HR12', 0), /number of inches/);
});

test('decimal depths', () => {
  assert.deepEqual(read('32HR5.5').part, roundPart('half', 5.5, null));
  assert.deepEqual(read('32HR185.5').part, roundPart('half', 5.5, 18));
  assert.deepEqual(read('3218HR5.5').part, roundPart('half', 5.5, 18));
  assert.deepEqual(read('42X5.5').part, straightPart('1Q', 5.5 === 5.5 ? 42 : 0, 5.5));
  assert.equal(read('36SQ12.5').code, '36SQ12.5');
});

test('rule-form digits that can be read two ways carry a note', () => {
  const r = read('32RT608');
  assert.deepEqual(r.part, roundPart('race', 8, 6));
  assert.ok(r.notes.some((n) => n.includes('60"') && n.includes('3260RT8')), r.notes.join(' | '));
  // 64" extenders are over the 60" line, so 32HR648 is only 6" extenders 48" deep.
  const s = read('32HR648');
  assert.deepEqual(s.part, roundPart('half', 48, 6));
  assert.equal(s.notes.length, 0);
  assert.deepEqual(read('3264HR8').part, roundPart('half', 8, 64));
});

test('part numbers the rules do not cover are refused with a reason', () => {
  assert.match(fails(''), /Enter a part number/);
  assert.match(fails('3630103Q8'), /more than 20 feet/);
  assert.match(fails('28SQ12'), /multiple of 6/);
  assert.match(fails('44SQ8'), /multiple of 6/);
  assert.match(fails('32HR3'), /outside 4–48/);
  assert.match(fails('42SQ50'), /outside 4–48/);
  assert.match(fails('4SQ12'), /at least 6"/);
  assert.match(fails('2418HP16'), /home plate/);
  assert.match(fails('283Q16-SF1'), /special fabrication/);
  assert.match(fails('SF 48X30BX12'), /special fabrication/);
  assert.match(fails('32RT12'), /straight-side length/);
  assert.match(fails('3204HR16'), /less than one 6" cell/);
  assert.match(fails('36RT12'), /too short for a racetrack/);
  assert.match(fails('4024L8'), /Can't read/);
  assert.match(fails('ABC'), /Can't read/);
});

test('the written form reads back as the same part', () => {
  for (const shape of ['1Q', '2Q', '3Q', 'SQ'] as StraightShape[]) {
    for (let L = 6; L <= 240; L++) {
      if (shape === 'SQ' && L % 6) continue;
      for (const depth of [4, 8, 12, 16, 24, 30, 48, 5.5]) {
        const part = straightPart(shape, L, depth);
        const back = parsePartNumber(formatPartNumber(part));
        assert.ok(back.ok, `${formatPartNumber(part)}: ${back.ok ? '' : back.error}`);
        assert.deepEqual(back.part, part, formatPartNumber(part));
      }
    }
  }
  for (const depth of [4, 5.5, 8, 12, 12.5, 16, 24, 48]) {
    const full = roundPart('full', depth);
    assert.deepEqual(read(formatPartNumber(full)).part, full);
    for (const kind of ['half', 'quarter', 'three', 'race'] as RoundKind[]) {
      const bare = roundPart(kind, depth, null);
      if (kind !== 'race') assert.deepEqual(read(formatPartNumber(bare)).part, bare);
      for (let ext = 6; ext <= 240; ext++) {
        const part = roundPart(kind, depth, ext);
        const code = formatPartNumber(part);
        const back = parsePartNumber(code);
        assert.ok(back.ok, `${code}: ${back.ok ? '' : back.error}`);
        assert.deepEqual(back.part, part, code);
        assert.equal(back.notes.filter((n) => n.startsWith('Read ')).length, 0, `${code} is already in the written form`);
      }
    }
  }
});

test('descriptions in the sales order wording', () => {
  const so = (code: string) => salesOrderDescription(read(code).part);
  assert.equal(so('36SQ12'), 'SQUARE 36" X 12" DEPTH');
  assert.equal(so('362Q12'), '3\'-0" 2-SIDED (HALF DIAMOND) X 12" DEPTH');
  assert.equal(so('421Q16'), 'SINGLE 42" SIDE X 16" DEPTH');
  assert.equal(so('423Q16'), '3-SIDED 42" X 16" DEPTH');
  assert.equal(so('32R12'), 'ROUND 32" DIAMETER X 12" DEPTH');
  assert.equal(so('32HR612'), '1/2 R 32" DIAMETER X TWO 6" EXTENDERS X 12" DEPTH');
  assert.equal(so('321Q24'), '1/4 R 32" DIAMETER X 24" DEPTH');
  assert.equal(so('323Q1816'), '3/4 R 32" DIAMETER X THREE 18" SIDES X 16" DEPTH');
  assert.equal(so('32RT2212'), 'RACETRACK - 32" DIAMETER X 22" STRAIGHTS (54" OVERALL) X 12" DEPTH');
  assert.equal(describe(read('32HR1812').part), 'Half round, 32" diameter, 18" extenders × 12" deep');
  assert.equal(describe(read('42X5.5').part), 'One side, 42" long × 5.5" deep');
});
