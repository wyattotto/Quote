/**
 * How one part is built from stock, and the hardware it takes.
 *
 * Every side starts from 36X12 stock and changes length in 6" cells; rounds
 * come from 32R12 stock and are only cut for depth. A side is stacked top to
 * bottom: a full 12" top (it has the floor-finish edge), 4" or 8" middle
 * pieces ripped on a rib, then a bottom cut to the exact remainder.
 */
import type { Part } from './types.ts';

export type LayerRole = 'top' | 'middle' | 'bottom';
export interface Layer {
  role: LayerRole;
  /** Height of the piece in inches. */
  h: number;
}

/** Depth layers top to bottom. The top is a full 12", or the whole depth when that is 12" or less. */
export function layers(depth: number): Layer[] {
  if (depth <= 12) return [{ role: 'top', h: depth }];
  const rest = depth - 12;
  const out: Layer[] = [{ role: 'top', h: 12 }];
  if (rest <= 12) {
    out.push({ role: 'bottom', h: rest });
    return out;
  }
  // Middles in 4" steps, 8s before 4s; the bottom takes the rest, up to 12".
  let mid = 4 * Math.ceil((rest - 12) / 4);
  const bottom = Math.round((rest - mid) * 100) / 100;
  while (mid >= 8) {
    out.push({ role: 'middle', h: 8 });
    mid -= 8;
  }
  if (mid === 4) out.push({ role: 'middle', h: 4 });
  out.push({ role: 'bottom', h: bottom });
  return out;
}

export type PieceKind = 'full' | 'cutdown' | 'addon';
export interface LengthPiece {
  len: number;
  kind: PieceKind;
}
export interface LengthBuild {
  pieces: LengthPiece[];
  /** 36-to-36 joints, each with the front ear cut off. */
  earJoints: number;
  /** True when the length does not land on a 6" cell. */
  odd: boolean;
}

/** Length pieces for one straight run: 36" and under is one 36X12 cut down; over 36" is full 36s plus one add-on. */
export function lengthPieces(L: number): LengthBuild {
  if (L <= 36) return { pieces: [{ len: L, kind: L === 36 ? 'full' : 'cutdown' }], earJoints: 0, odd: L % 6 !== 0 };
  const n = Math.floor(L / 36);
  const rest = L - n * 36;
  const pieces: LengthPiece[] = Array.from({ length: n }, () => ({ len: 36, kind: 'full' as const }));
  if (rest) pieces.push({ len: rest, kind: 'addon' });
  return { pieces, earJoints: n - 1, odd: rest % 6 !== 0 };
}

/** Add-on pieces per 36X12: 1-cell 3, 2-cell 2, 3-cell 1 (plus a leftover cell), 4- and 5-cell 1. */
export interface AddOnPlan {
  pieces: number;
  cells: number;
  /** Add-ons cut from one 36X12. */
  per: number;
  /** 36X12 panels to pull. */
  panels: number;
}
export function addOnPlan(len: number, pieces: number): AddOnPlan {
  const cells = Math.ceil(len / 6); // an odd add-on uses the next whole cell, trimmed at the wall end
  const per = cells === 1 ? 3 : cells === 2 ? 2 : 1;
  return { pieces, cells, per, panels: Math.ceil(pieces / per) };
}

/** One bolt per 4" of depth at a joint. Odd depths round down (30" = 7). */
export const boltsPerJoint = (depth: number): number => Math.floor(depth / 4);

/** LLB per side: 1 at 36X12 or smaller, 2 for anything bigger, 3 from 48" long plus 1 more per full 12" over 48". */
export function llbPerSide(L: number, D: number): number {
  if (L >= 48) return 3 + Math.floor((L - 48) / 12);
  return L <= 36 && D <= 12 ? 1 : 2;
}

/** 4L brackets at one custom-length wall end: 2 for the top, then 1 for a 4" depth piece or 2 for a bigger one. */
export function l4PerWallEnd(ly: Layer[]): number {
  return ly.reduce((s, l) => s + (l.role === 'top' ? 2 : l.h <= 4 ? 1 : 2), 0);
}

/**
 * In-plant bolts for one straight run: every length joint (cell or add-on to
 * a 36, or 36-to-36) takes 1 bolt per 4" of each layer, and every depth seam
 * takes 1 bolt per every other cell along the strip, rounded down.
 */
export function inPlantBoltsForRun(L: number, D: number): number {
  const lp = lengthPieces(L);
  const ly = layers(D);
  const joints = lp.pieces.length - 1;
  const perJoint = ly.reduce((s, l) => s + boltsPerJoint(l.h), 0);
  let seams = 0;
  for (const p of lp.pieces) for (const l of ly) if (l.role !== 'top') seams += Math.floor(Math.floor(p.len / 6) / 2);
  return joints * perJoint + seams;
}

export interface Rip {
  key: string;
  label: string;
  /** Inches left of the 12" panel after the rip. */
  leftover: number;
  /** True when the leftover is an 8" piece with the floor-finish edge, saved as 36X8 or 32X8. */
  keepLeftover: boolean;
  onRib: boolean;
}

/** The cut a blank needs for its layer, or null for a full 12" top. */
export function ripFor(layer: Layer): Rip | null {
  const h = layer.h;
  const leftover = Math.round((12 - h) * 100) / 100;
  if (layer.role === 'top') {
    if (h === 12) return null;
    return { key: `top${h}`, label: `Rip to ${h}" keeping the floor-finish edge (top piece)`, leftover, keepLeftover: false, onRib: h % 4 === 0 };
  }
  if (h === 12) return { key: 'flip12', label: 'Full 12" piece used as the bottom (no rip)', leftover: 0, keepLeftover: false, onRib: false };
  if (layer.role === 'middle') return { key: `mid${h}`, label: `Rip ${h === 8 ? 'an' : 'a'} ${h}" strip on a rib (middle piece)`, leftover, keepLeftover: h === 4, onRib: true };
  return { key: `bot${h}`, label: `Rip ${h === 8 || h === 11 ? 'an' : 'a'} ${h}" bottom piece${h % 4 ? ' (no rib needed)' : ' on a rib'}`, leftover, keepLeftover: leftover === 8, onRib: h % 4 === 0 };
}

export type RunRole = 'side' | 'extender' | 'straight';
export type BlankSource = '36' | 'cutdown' | 'addon' | '32R';
export interface Blank {
  src: BlankSource;
  len: number;
  layer: Layer;
  role: RunRole | 'round';
}
export interface EarCut {
  why: '36-to-36 joint' | 'straight to round';
  layer: Layer;
}
export interface Run {
  L: number;
  role: RunRole;
}

/** Shipped hardware. Bolts and nuts are 1¼"; a 4L bracket takes a #14 screw (s14) and one of the Tapcons. */
export interface Hardware {
  bolts: number;
  nuts: number;
  llb: number;
  screws: number;
  tapcons: number;
  l4: number;
  s14: number;
}
export const emptyHardware = (): Hardware => ({ bolts: 0, nuts: 0, llb: 0, screws: 0, tapcons: 0, l4: 0, s14: 0 });

export interface UnitBuild {
  part: Part;
  layers: Layer[];
  blanks: Blank[];
  ears: EarCut[];
  runs: Run[];
  /** Wall ends cut to a custom length and held with 4L brackets instead of Tapcons through the ear. */
  customEnds: number;
  hw: Hardware;
  /** 1¼" bolts used in the plant to build the part. Not shipped. */
  inPlant: number;
  notes: string[];
}

/** Everything for one unit of a part. */
export function buildUnit(part: Part): UnitBuild {
  const ly = layers(part.depth);
  const blanks: Blank[] = [];
  const ears: EarCut[] = [];
  const runs: Run[] = [];
  const notes: string[] = [];
  let inPlant = 0;
  const hw = emptyHardware();

  const addRun = (L: number, role: RunRole, freeEnd: boolean) => {
    runs.push({ L, role });
    const lp = lengthPieces(L);
    if (lp.odd) {
      notes.push(
        freeEnd
          ? `${L}" ${role === 'extender' ? 'extenders' : 'sides'} are a custom length: cut the wall end to exact length and use 4L brackets at the wall.`
          : `${L}" ${role === 'straight' ? 'straights between round pieces' : 'pieces'}: cut to exact length.`,
      );
    }
    for (const pc of lp.pieces) for (const l of ly) blanks.push({ src: pc.kind === 'full' ? '36' : pc.kind, len: pc.len, layer: l, role });
    for (let j = 0; j < lp.earJoints; j++) for (const l of ly) ears.push({ why: '36-to-36 joint', layer: l });
    inPlant += inPlantBoltsForRun(L, part.depth);
    hw.llb += llbPerSide(L, part.depth);
  };
  // A straight that bolts to a round loses its front ear and bolts flat on flat.
  // A cut-down piece is cut from the non-ear side, so its ear goes with the scrap.
  const roundEar = (L: number) => {
    if (L >= 36) for (const l of ly) ears.push({ why: 'straight to round', layer: l });
  };

  let customEnds = 0;
  if (part.type === 'straight') {
    for (let s = 0; s < part.sides; s++) addRun(part.length, 'side', part.shape !== 'SQ');
    // Only the wall end is cut to exact length; a closed square needs whole cells.
    if (part.length % 6 && part.shape !== 'SQ') customEnds = part.shape === '1Q' ? 1 : 2;
    hw.bolts = part.corners * boltsPerJoint(part.depth);
  } else {
    for (let i = 0; i < part.pieces; i++) for (const l of ly) blanks.push({ src: '32R', len: 32, layer: l, role: 'round' });
    // 4 bolts join each round depth piece to the one above.
    inPlant += part.pieces * (ly.length - 1) * 4;
    hw.llb += part.pieces * (part.depth <= 12 ? 1 : 2);
    let joints = part.roundJoints;
    let roundToStraight = 0;
    const ext = part.ext;
    if (part.kind === 'race' && ext) {
      addRun(ext, 'straight', false);
      addRun(ext, 'straight', false);
      roundToStraight = 4;
      roundEar(ext);
      roundEar(ext);
    } else if (ext && part.kind === 'three') {
      // Round, side, round, side, round, side: two sides between the round pieces, the third to the wall.
      addRun(ext, 'straight', false);
      addRun(ext, 'straight', false);
      addRun(ext, 'extender', true);
      joints = 0;
      roundToStraight = 5;
      roundEar(ext);
      roundEar(ext);
      roundEar(ext);
      if (ext % 6) customEnds = 1;
    } else if (ext) {
      addRun(ext, 'extender', true);
      addRun(ext, 'extender', true);
      roundToStraight = 2;
      roundEar(ext);
      roundEar(ext);
      if (ext % 6) customEnds = 2;
    }
    hw.bolts = (joints + roundToStraight) * boltsPerJoint(part.depth);
  }

  // Each 4L bracket takes 1 Tapcon to the wall and 1 #14 screw to the piece.
  // At a custom wall end the 4L Tapcons replace the Tapcons through the ear.
  hw.l4 = customEnds * l4PerWallEnd(ly);
  hw.s14 = hw.l4;
  hw.tapcons = hw.llb + (part.openEnds - customEnds) * boltsPerJoint(part.depth) + hw.l4;
  hw.nuts = hw.bolts;
  hw.screws = hw.llb;
  return { part, layers: ly, blanks, ears, runs, customEnds, hw, inPlant, notes };
}

export const shippedHardware = (part: Part): Hardware => buildUnit(part).hw;
export const inPlantBolts = (part: Part): number => buildUnit(part).inPlant;
