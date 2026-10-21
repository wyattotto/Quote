/**
 * Part numbers: reading every form the house writes, and writing one.
 *
 * An order line is length + sides + depth (42SQ16, 362Q12, 421Q16). A
 * single side may also be written length X depth (42X16). Rounds start
 * with 32, the diameter; the letters are the shape and the last number is
 * the depth. A part number starting with 32 is always a round, since
 * straight lengths are multiples of 6; a 32" straight side is written
 * 32X12 or 2'-8"2Q12.
 *
 * Three written forms are in use for rounds with extenders and this module
 * reads all of them:
 *   Rule Sheet v1 / Order Builder   32HR1812   32RT3612   321Q616   323Q1816
 *   quotes and layout plans         3218HR12   3236RT12   3206QR16  32R1Q24  32R3Q24  1/4-32R16
 *   PFI takeoff app                 3218U12    54RT12     3206HU16
 * It writes the Rule Sheet form (see formatPartNumber).
 */
import type { Part, RoundKind, RoundPart, StraightPart, StraightShape } from './types.ts';

export const MIN_DEPTH = 4;
export const MAX_DEPTH = 48;
export const MIN_LENGTH = 6;
/** 20 feet. Longer is a typo. */
export const MAX_LENGTH = 240;
/** An extender shorter than one 6" cell makes no sense. */
export const MIN_EXT = 6;
/** Extenders and racetrack straights are built like sides, so they share the length limit. */
export const MAX_EXT = MAX_LENGTH;
/**
 * In the Rule Sheet form (32HR1812) the extender and depth share one run of
 * digits. When two readings are both valid, the one with the two-digit depth
 * wins, and the other is only considered when its extender is this long or
 * shorter (32HR648 is 6" extenders 48" deep, not 64" extenders 8" deep).
 */
export const MAX_EXT_IN_RULE_FORM = 60;
export const ROUND_DIAMETER = 32;

export const STRAIGHT_SHAPES: Record<StraightShape, { sides: number; corners: number; openEnds: number; name: string }> = {
  '1Q': { sides: 1, corners: 0, openEnds: 2, name: 'One side' },
  '2Q': { sides: 2, corners: 1, openEnds: 2, name: 'Two sides' },
  '3Q': { sides: 3, corners: 2, openEnds: 2, name: 'Three sides' },
  SQ: { sides: 4, corners: 4, openEnds: 0, name: 'Closed square' },
};

export const ROUND_KINDS: Record<RoundKind, { pieces: number; roundJoints: number; openEnds: number; name: string; takesExt: boolean; needsExt: boolean }> = {
  full: { pieces: 4, roundJoints: 4, openEnds: 0, name: 'Full round', takesExt: false, needsExt: false },
  half: { pieces: 2, roundJoints: 1, openEnds: 2, name: 'Half round', takesExt: true, needsExt: false },
  three: { pieces: 3, roundJoints: 2, openEnds: 2, name: 'Three-sided round', takesExt: true, needsExt: false },
  quarter: { pieces: 1, roundJoints: 0, openEnds: 2, name: 'Quarter round', takesExt: true, needsExt: false },
  race: { pieces: 4, roundJoints: 2, openEnds: 0, name: 'Racetrack', takesExt: true, needsExt: true },
};

/** Letters that name a round shape, in every form. */
const KIND_OF: Record<string, RoundKind> = {
  HR: 'half', U: 'half', '2Q': 'half',
  '1Q': 'quarter', QR: 'quarter', HU: 'quarter',
  '3Q': 'three',
  RT: 'race',
};

export interface ParseOk {
  ok: true;
  /** The part number as typed. */
  input: string;
  /** The same part in the written form this module uses. */
  code: string;
  part: Part;
  /** How the input was read when it was not already in that form. */
  notes: string[];
}
export interface ParseFail {
  ok: false;
  input: string;
  error: string;
}
export type ParseResult = ParseOk | ParseFail;

export function straightPart(shape: StraightShape, length: number, depth: number): StraightPart {
  const s = STRAIGHT_SHAPES[shape];
  return { type: 'straight', shape, length, depth, sides: s.sides, corners: s.corners, openEnds: s.openEnds };
}

export function roundPart(kind: RoundKind, depth: number, ext: number | null = null): RoundPart {
  const r = ROUND_KINDS[kind];
  return { type: 'round', kind, diameter: ROUND_DIAMETER, depth, ext: r.takesExt ? ext : null, pieces: r.pieces, roundJoints: r.roundJoints, openEnds: r.openEnds };
}

export const validDepth = (d: number): boolean => Number.isFinite(d) && d >= MIN_DEPTH && d <= MAX_DEPTH;
const depthError = (d: number) => `Depth ${d}" is outside ${MIN_DEPTH}–${MAX_DEPTH}"`;
const num = (x: number) => String(Math.round(x * 100) / 100);

/** Upper case, no spaces, straight quotes, 1/4 for ¼, and no trailing inch mark. */
export function normalizePartNumber(raw: string): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[″”“]/g, '"')
    .replace(/[′’‘]/g, "'")
    .replace(/''/g, '"')
    .replace(/¼/g, '1/4')
    .replace(/¾/g, '3/4')
    .replace(/½/g, '1/2')
    .replace(/\s+/g, '')
    .replace(/"$/, '');
}

function checkStraight(shape: StraightShape, length: number, depth: number): string | null {
  if (!Number.isFinite(length) || length < MIN_LENGTH) return `Length must be at least ${MIN_LENGTH}"`;
  if (length > MAX_LENGTH) return `${length}" is more than 20 feet. Check the part number.`;
  if (shape === 'SQ' && length % 6) return `${length}" isn't a multiple of 6". A closed square bolts at every corner, so its sides must be whole cells.`;
  if (!validDepth(depth)) return depthError(depth);
  return null;
}

/**
 * Splits the digits after the shape letters in the Rule Sheet form into
 * extender length and depth: 1812 is 18" extenders 12" deep, 612 is 6" and
 * 12", 12 is a depth alone. Returns every valid reading, best first.
 */
export function splitExtDepth(tail: string): Array<{ depth: number; ext: number | null }> {
  const whole = Number(tail);
  if (validDepth(whole)) return [{ depth: whole, ext: null }];
  const [int, frac] = tail.split('.');
  const out: Array<{ depth: number; ext: number | null }> = [];
  for (const n of [2, 1]) {
    if (int.length <= n) continue;
    const depth = Number(int.slice(-n) + (frac !== undefined ? `.${frac}` : ''));
    const ext = Number(int.slice(0, -n));
    if (validDepth(depth) && ext >= MIN_EXT && ext <= MAX_EXT_IN_RULE_FORM) out.push({ depth, ext });
  }
  return out;
}

function roundWithTail(kind: RoundKind, code: string, tail: string, typed: number | null, notes: string[]): RoundPart | string {
  const R = ROUND_KINDS[kind];
  let depth: number;
  let ext: number | null;
  if (typed != null) {
    depth = Number(tail);
    if (!validDepth(depth)) {
      return Number.isFinite(depth) && depth > MAX_DEPTH
        ? `With the extender box filled, the part number ends in the depth only (32HR12 and 18 in the box)`
        : depthError(depth);
    }
    ext = typed;
  } else {
    const readings = splitExtDepth(tail);
    if (readings.length === 0) return Number.isFinite(Number(tail)) ? depthError(Number(tail)) : `Can't read the depth in ${code}`;
    ({ depth, ext } = readings[0]);
    if (readings.length > 1) {
      const alt = readings[1];
      notes.push(`${code} could also be ${alt.ext}" ${kind === 'race' ? 'straights' : 'extenders'} ${alt.depth}" deep. Read as ${ext}" and ${depth}". Write 32${String(alt.ext).padStart(2, '0')}${kind === 'race' ? 'RT' : kind === 'half' ? 'HR' : kind === 'quarter' ? '1Q' : '3Q'}${alt.depth} for the other.`);
    }
  }
  if (R.needsExt && !ext) return 'Racetrack needs a straight-side length (32RT3612 = 36" straights, 12" deep)';
  if (!R.takesExt) ext = null;
  return roundPart(kind, depth, ext);
}

function parseRound(code: string, typed: number | null, notes: string[]): RoundPart | string | null {
  let m: RegExpMatchArray | null;

  // Quarter and three-quarter rounds as the quotes write them: 32R1Q24, 32R3Q24, 321/4R12, 323/4R12.
  if ((m = code.match(/^32R([13])Q(\d+(?:\.\d+)?)$/)) || (m = code.match(/^32([13])\/4R(\d+(?:\.\d+)?)$/))) {
    return roundWithTail(m[1] === '1' ? 'quarter' : 'three', code, m[2], typed, notes);
  }

  // Full round: 32R12. 32SQ12 is read the same way, since a 32" closed square can't be built from 6" cells.
  if ((m = code.match(/^32(R|FR|SQ)(\d+(?:\.\d+)?)$/))) {
    const depth = Number(m[2]);
    if (!validDepth(depth)) return depthError(depth);
    if (m[1] === 'SQ') notes.push(`32SQ read as a full round: a 32" closed square can't be built from 6" cells`);
    return roundPart('full', depth);
  }

  // Extender first, as the quotes, layout plans and the takeoff app write it:
  // 3206HR16, 3212U16, 3206QR16, 3206HU16, 3212RT24. 3206R16 is the app's older half round.
  if ((m = code.match(/^32(\d{2,3})(HR|U|R|QR|HU|1Q|2Q|3Q|RT)(\d+(?:\.\d+)?)$/))) {
    const ext = Number(m[1]);
    const depth = Number(m[3]);
    const kind: RoundKind = m[2] === 'R' ? 'half' : KIND_OF[m[2]];
    if (m[2] === 'R') notes.push('A round with extenders is a half round');
    if (ext < MIN_EXT) return `Extender length ${ext}" is less than one 6" cell`;
    if (ext > MAX_EXT) return `Extender length ${ext}" is more than 20 feet. Check the part number.`;
    if (!validDepth(depth)) return depthError(depth);
    if (typed != null && typed !== ext) notes.push(`The extender box (${typed}") overrides the ${ext}" in the part number`);
    return roundPart(kind, depth, typed ?? ext);
  }

  // Rule Sheet form: 32HR12, 32HR1812, 321Q12, 323Q1816, 32RT3612. 322Q, 32U, 32QR and 32HU read the same.
  if ((m = code.match(/^32(HR|2Q|U|1Q|QR|HU|3Q|RT)(\d+(?:\.\d+)?)$/))) {
    return roundWithTail(KIND_OF[m[1]], code, m[2], typed, notes);
  }

  return null;
}

/**
 * Reads a part number in any of the house's written forms.
 *
 * `extBox` is the separate extender-length box on an order line: when it is
 * filled, the part number ends in the depth only (32HR12 with 18 in the box
 * is 32HR1812).
 */
export function parsePartNumber(raw: string, extBox: number | string | null = null): ParseResult {
  const input = String(raw ?? '');
  const code = normalizePartNumber(input);
  const fail = (error: string): ParseFail => ({ ok: false, input, error });
  if (!code) return fail('Enter a part number');
  const typed = extBox === '' || extBox == null ? null : Number(extBox);
  if (typed != null && !(typed > 0)) return fail('Extender length must be a number of inches');
  const notes: string[] = [];
  const ok = (part: Part): ParseOk => {
    const canonical = formatPartNumber(part);
    if (canonical !== code) notes.unshift(`Read ${code} as ${canonical}`);
    return { ok: true, input, code: canonical, part, notes };
  };
  let m: RegExpMatchArray | null;

  // Families Rule Sheet v1 doesn't cover yet.
  if (/HP[LR]?\d*$/.test(code)) return fail(`${code} is a home plate. Home plates aren't in Rule Sheet v1.`);
  if (/^SF|SF[CLR]?\d*$/.test(code)) return fail(`${code} is a special fabrication. Specials aren't in Rule Sheet v1.`);

  // Feet and inches: 4'-8"2Q6, 2'-8"X12, 5'-3.5"1Q16. Rounded up to the next whole inch.
  if ((m = code.match(/^(\d+)'-?(\d+(?:\.\d+)?)?"?([123]Q|SQ|X)(\d+(?:\.\d+)?)$/))) {
    const exact = Number(m[1]) * 12 + (m[2] ? Number(m[2]) : 0);
    const length = Math.ceil(exact);
    if (length !== exact) notes.push(`${m[1]}'-${m[2] ?? 0}" rounded up to ${length}"`);
    const shape = (m[3] === 'X' ? '1Q' : m[3]) as StraightShape;
    const depth = Number(m[4]);
    const err = checkStraight(shape, length, depth);
    if (err) return fail(err);
    return ok(straightPart(shape, length, depth));
  }

  // Quarter round as a layout plan writes it: 1/4-32R16.
  if ((m = code.match(/^([13])\/4-?32R(\d+(?:\.\d+)?)$/))) {
    const r = roundWithTail(m[1] === '1' ? 'quarter' : 'three', code, m[2], typed, notes);
    return typeof r === 'string' ? fail(r) : ok(r);
  }

  if (code.startsWith('32')) {
    const r = parseRound(code, typed, notes);
    if (r !== null) return typeof r === 'string' ? fail(r) : ok(r);
  }

  // Racetrack by overall length, as the takeoff app writes it: 54RT12 is two 32" round ends with 22" straights.
  if ((m = code.match(/^(\d+)RT(\d+(?:\.\d+)?)$/))) {
    const overall = Number(m[1]);
    const depth = Number(m[2]);
    if (overall < ROUND_DIAMETER + MIN_EXT) return fail(`${overall}" overall is too short for a racetrack: two 32" round ends need at least ${ROUND_DIAMETER + MIN_EXT}"`);
    if (!validDepth(depth)) return fail(depthError(depth));
    notes.push(`${overall}" overall is two 32" round ends with ${overall - ROUND_DIAMETER}" straights`);
    return ok(roundPart('race', depth, overall - ROUND_DIAMETER));
  }

  // Straights: 421Q16, 36SQ12, or a single side 42X16.
  if ((m = code.match(/^(\d+)([123]Q|SQ)(\d+(?:\.\d+)?)$/))) {
    const shape = m[2] as StraightShape;
    const length = Number(m[1]);
    const depth = Number(m[3]);
    const err = checkStraight(shape, length, depth);
    if (err) return fail(err);
    return ok(straightPart(shape, length, depth));
  }
  if ((m = code.match(/^(\d+)X(\d+(?:\.\d+)?)$/))) {
    const length = Number(m[1]);
    const depth = Number(m[2]);
    const err = checkStraight('1Q', length, depth);
    if (err) return fail(err);
    return ok(straightPart('1Q', length, depth));
  }

  return fail(`Can't read ${code}. Examples: 42SQ16, 362Q12, 421Q16, 32R12, 32HR1812`);
}

/**
 * The written form this module uses: the Rule Sheet's. 421Q16, 36SQ12,
 * 32R12, 32HR1812, 321Q616, 323Q1816, 32RT3612. A 32" straight side is
 * written 32X12 or 2'-8"2Q12 so it is not read as a round, and an extender
 * over 60" goes extender-first (3272HR12) so it is not read as a depth.
 */
export function formatPartNumber(part: Part): string {
  if (part.type === 'straight') {
    const { shape, length, depth } = part;
    if (length === ROUND_DIAMETER) return shape === '1Q' ? `32X${num(depth)}` : `2'-8"${shape}${num(depth)}`;
    return `${length}${shape}${num(depth)}`;
  }
  const d = num(part.depth);
  const letters = { full: 'R', half: 'HR', quarter: '1Q', three: '3Q', race: 'RT' }[part.kind];
  if (part.ext == null) return `32${letters}${d}`;
  const extFirst = `32${String(Math.round(part.ext)).padStart(2, '0')}${letters}${d}`;
  if (part.ext > MAX_EXT_IN_RULE_FORM) return extFirst;
  // The Rule Sheet form runs the extender and depth digits together. When that
  // would read back as a different part (3260HR4 as 6" extenders 4" deep), the
  // extender-first form is written instead.
  const back = splitExtDepth(`${num(part.ext)}${d}`)[0];
  return back && back.depth === part.depth && back.ext === part.ext ? `32${letters}${num(part.ext)}${d}` : extFirst;
}

/** Plain words: "Two sides joined, 42" long × 16" deep". */
export function describe(part: Part): string {
  if (part.type === 'straight') {
    const d = { '1Q': 'One side', '2Q': 'Two sides joined', '3Q': 'Three sides joined', SQ: 'Closed square, four sides' }[part.shape];
    return `${d}, ${part.length}" long × ${num(part.depth)}" deep`;
  }
  const ext = part.ext
    ? part.kind === 'race' ? `, ${num(part.ext)}" straights` : part.kind === 'three' ? `, three ${num(part.ext)}" sides` : `, ${num(part.ext)}" extenders`
    : '';
  return `${ROUND_KINDS[part.kind].name}, 32" diameter${ext} × ${num(part.depth)}" deep`;
}

/** The description line in the PFI Sales Order's own wording. */
export function salesOrderDescription(part: Part): string {
  const D = `${num(part.depth)}" DEPTH`;
  if (part.type === 'straight') {
    const L = `${part.length}"`;
    const ft = `${Math.floor(part.length / 12)}'-${part.length % 12}"`;
    return {
      '1Q': `SINGLE ${L} SIDE X ${D}`,
      '2Q': `${ft} 2-SIDED (HALF DIAMOND) X ${D}`,
      '3Q': `3-SIDED ${L} X ${D}`,
      SQ: `SQUARE ${L} X ${D}`,
    }[part.shape];
  }
  const ext = part.ext ? ` X TWO ${num(part.ext)}" EXTENDERS` : '';
  switch (part.kind) {
    case 'full': return `ROUND 32" DIAMETER X ${D}`;
    case 'half': return `1/2 R 32" DIAMETER${ext} X ${D}`;
    case 'quarter': return `1/4 R 32" DIAMETER${ext} X ${D}`;
    case 'three': return `3/4 R 32" DIAMETER${part.ext ? ` X THREE ${num(part.ext)}" SIDES` : ''} X ${D}`;
    case 'race': return `RACETRACK - 32" DIAMETER X ${num(part.ext ?? 0)}" STRAIGHTS (${32 + (part.ext ?? 0)}" OVERALL) X ${D}`;
  }
}
