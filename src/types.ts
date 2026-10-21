/**
 * Rule Sheet v1 covers straight parts (1Q, 2Q, 3Q, SQ) and 32" rounds.
 * Every rule scales off length and depth only. Home plates and custom
 * parts come later.
 */
export type StraightShape = '1Q' | '2Q' | '3Q' | 'SQ';
export type RoundKind = 'full' | 'half' | 'three' | 'quarter' | 'race';

export interface StraightPart {
  type: 'straight';
  shape: StraightShape;
  /** Side length in inches. A foot-and-inch length is rounded up to the whole inch. */
  length: number;
  /** Depth in inches, 4 to 48. Decimals are allowed (5.5). */
  depth: number;
  sides: number;
  /** Corners where two sides bolt together through their ears. */
  corners: number;
  /** Ends that anchor to the wall. */
  openEnds: number;
}

export interface RoundPart {
  type: 'round';
  kind: RoundKind;
  diameter: 32;
  depth: number;
  /**
   * Extender length (half, quarter and three-quarter rounds) or the
   * straight-side length (racetrack), in inches. Null when there is none.
   */
  ext: number | null;
  /** 32R pieces, each a quarter of a 32" round. */
  pieces: number;
  /** Joints where two round pieces meet. */
  roundJoints: number;
  openEnds: number;
}

export type Part = StraightPart | RoundPart;
