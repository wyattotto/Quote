/**
 * A whole order: raw stock to pull, every cut grouped by type, ear cuts,
 * saved leftovers, and the hardware totals.
 */
import { buildUnit, emptyHardware, ripFor, addOnPlan, type AddOnPlan, type Hardware, type Rip, type UnitBuild } from './build.ts';
import { parsePartNumber, type ParseResult } from './part-number.ts';

export interface OrderLine {
  code: string;
  qty: number;
  /** The extender box, when the part number ends in the depth only. */
  ext?: number | string | null;
}

export interface OrderLineResult {
  line: OrderLine;
  qty: number;
  parsed: ParseResult;
  unit: UnitBuild | null;
}

export interface RipTotal extends Rip {
  /** Panel the rip is made on: 36, a cut-down length, an add-on length, or 32R. */
  size: string;
  qty: number;
}

export interface OrderSummary {
  lines: OrderLineResult[];
  /** Raw stock to pull. Saved 36X8 and 32X8 on the shelf are not tracked. */
  stock: { '36X12': number; '32R12': number };
  /** Add-on pieces by length, and the 36X12s they are cut from. */
  addon: Record<string, AddOnPlan>;
  /** 36X12s cut down to a shorter side, by length. */
  cutdown: Record<string, number>;
  cutdownRoles: Record<string, string[]>;
  rips: Record<string, RipTotal>;
  ears: number;
  /** 8" leftovers with the floor-finish edge, saved for orders 8" deep or less. */
  saved: { '36X8': number; '32X8': number };
  /** Single cells left after cutting 18" add-ons. */
  leftoverCells: number;
  hw: Hardware;
  inPlant: number;
  /** 8"-deep tops cut from 36X12, which a saved 36X8 could cover instead. */
  shelfTop8: number;
  errors: number;
}

export function buildOrder(lines: OrderLine[]): OrderSummary {
  const res: OrderSummary = {
    lines: [],
    stock: { '36X12': 0, '32R12': 0 },
    addon: {},
    cutdown: {},
    cutdownRoles: {},
    rips: {},
    ears: 0,
    saved: { '36X8': 0, '32X8': 0 },
    leftoverCells: 0,
    hw: emptyHardware(),
    inPlant: 0,
    shelfTop8: 0,
    errors: 0,
  };
  const addonPieces: Record<string, number> = {};

  for (const line of lines) {
    const parsed = parsePartNumber(line.code, line.ext ?? null);
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    if (!parsed.ok) {
      res.lines.push({ line, qty, parsed, unit: null });
      res.errors++;
      continue;
    }
    const u = buildUnit(parsed.part);
    res.lines.push({ line, qty, parsed, unit: u });
    if (!qty) continue;
    for (const k of Object.keys(u.hw) as Array<keyof Hardware>) res.hw[k] += u.hw[k] * qty;
    res.inPlant += u.inPlant * qty;
    res.ears += u.ears.length * qty;
    for (const b of u.blanks) {
      if (b.src === '36') res.stock['36X12'] += qty;
      else if (b.src === '32R') res.stock['32R12'] += qty;
      else if (b.src === 'cutdown') {
        res.stock['36X12'] += qty;
        res.cutdown[b.len] = (res.cutdown[b.len] ?? 0) + qty;
        const roles = (res.cutdownRoles[b.len] ??= []);
        if (!roles.includes(b.role)) roles.push(b.role);
      } else addonPieces[b.len] = (addonPieces[b.len] ?? 0) + qty;

      const r = ripFor(b.layer);
      if (!r) continue;
      const size = b.src === '32R' ? '32R' : String(b.len);
      const key = `${r.key}|${size}`;
      const total = (res.rips[key] ??= { ...r, size, qty: 0 });
      total.qty += qty;
      if (r.keepLeftover && (size === '36' || size === '32R')) res.saved[size === '36' ? '36X8' : '32X8'] += qty;
      if (b.layer.role === 'top' && b.layer.h === 8 && size === '36') res.shelfTop8 += qty;
    }
  }

  for (const [len, pieces] of Object.entries(addonPieces)) {
    const plan = addOnPlan(Number(len), pieces);
    res.addon[len] = plan;
    res.stock['36X12'] += plan.panels;
    if (plan.cells === 3) res.leftoverCells += pieces;
  }
  return res;
}
