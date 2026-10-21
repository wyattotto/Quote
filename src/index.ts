export type { Part, RoundKind, RoundPart, StraightPart, StraightShape } from './types.ts';
export {
  MIN_DEPTH, MAX_DEPTH, MIN_LENGTH, MAX_LENGTH, MIN_EXT, MAX_EXT, MAX_EXT_IN_RULE_FORM, ROUND_DIAMETER,
  STRAIGHT_SHAPES, ROUND_KINDS,
  parsePartNumber, formatPartNumber, normalizePartNumber, splitExtDepth, validDepth,
  describe, salesOrderDescription, straightPart, roundPart,
  type ParseOk, type ParseFail, type ParseResult,
} from './part-number.ts';
export {
  layers, lengthPieces, addOnPlan, boltsPerJoint, llbPerSide, l4PerWallEnd, inPlantBoltsForRun, ripFor,
  buildUnit, shippedHardware, inPlantBolts, emptyHardware,
  type Layer, type LayerRole, type LengthPiece, type LengthBuild, type PieceKind, type AddOnPlan,
  type Rip, type Run, type RunRole, type Blank, type BlankSource, type EarCut, type Hardware, type UnitBuild,
} from './build.ts';
export { buildOrder, type OrderLine, type OrderLineResult, type OrderSummary, type RipTotal } from './order.ts';
