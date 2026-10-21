# PFI Rules

Rule Sheet v1 of the PFI Sales Order Program as code. It reads any part
number the house writes, builds the part from stock the way the shop does,
and counts the hardware that ships with it and the bolts used in the plant.

The source of truth is the Rule Sheet v1 doc
(https://claude.ai/artifact/G67vMTFjRBtzazceUsVCRn). This module follows
it. When a rule on the sheet changes, the function named below changes
with it, and the tests say what else moved.

No runtime dependencies. Node 22.18 or later runs the TypeScript directly.

```sh
npm install        # TypeScript, for type-checking only
npm test           # node --test tests/*.test.ts
npm run typecheck  # tsc --noEmit
```

## Use

```ts
import { parsePartNumber, buildUnit, buildOrder, salesOrderDescription } from './src/index.ts';

const read = parsePartNumber('3212HR16');
// read.ok === true, read.code === '32HR1216', read.notes === ['Read 3212HR16 as 32HR1216']
if (read.ok) {
  const unit = buildUnit(read.part);
  unit.hw;        // { bolts: 12, nuts: 12, llb: 8, screws: 8, tapcons: 16, l4: 0, s14: 0 }
  unit.inPlant;   // 1¼" bolts used in the plant, not shipped
  unit.layers;    // [{ role: 'top', h: 12 }, { role: 'bottom', h: 4 }]
  unit.blanks;    // every piece to cut, by stock panel and layer
  salesOrderDescription(read.part); // '1/2 R 32" DIAMETER X TWO 12" EXTENDERS X 16" DEPTH'
}

const order = buildOrder([{ code: '42SQ16', qty: 10 }, { code: '32R12', qty: 2 }]);
order.stock;   // { '36X12': 107, '32R12': 8 }
order.rips;    // every cut grouped by type with a count
order.hw;      // shipped hardware for the whole order
```

| Module | What it holds |
|---|---|
| `src/part-number.ts` | `parsePartNumber`, `formatPartNumber`, `describe`, `salesOrderDescription` |
| `src/build.ts` | `layers`, `lengthPieces`, `addOnPlan`, `ripFor`, `boltsPerJoint`, `llbPerSide`, `l4PerWallEnd`, `inPlantBoltsForRun`, `buildUnit` |
| `src/order.ts` | `buildOrder`: stock to pull, cuts by type, ear cuts, saved leftovers, hardware totals |

## Part numbers

An order line is **length + sides + depth**. A single side may also be
written length X depth. Lengths are in inches; a foot-and-inch length is
rounded up to the next whole inch.

| Written | Part |
|---|---|
| `421Q16` or `42X16` | One 42" side, 16" deep |
| `422Q16` | Two sides joined (a half diamond) |
| `423Q16` | Three sides joined |
| `42SQ16` | Closed square, four sides |
| `4'-8"2Q6` | Two 56" sides, 6" deep |
| `32R12` | Full round, 32" diameter |
| `32HR12` | Half round (same as a 2Q) |
| `32HR1812` | Half round with 18" extenders, 12" deep |
| `321Q12` | Quarter round |
| `323Q1816` | Three-quarter round with three 18" sides, 16" deep |
| `32RT2212` | Racetrack with 22" straights (54" overall), 12" deep |

A part number starting with 32 is always a round, since straight lengths
are multiples of 6". A 32" straight side is written `32X12` or `2'-8"2Q12`.
1Q, 2Q and 3Q sides can be any length; only a closed SQ needs whole 6"
cells. Depth is 4" to 48" and can be a decimal (`32HR5.5`).

Three written forms are in use for rounds with extenders. The parser reads
all of them and `formatPartNumber` writes the Rule Sheet's:

| Where it is written | Half round, 6" ext, 16" deep | Quarter round | Racetrack | Read as |
|---|---|---|---|---|
| Rule Sheet, Order Builder | `32HR616` | `321Q616` | `32RT2212` | itself |
| Quotes and layout plans | `3206HR16` | `3206QR16`, `32R1Q24`, `1/4-32R16` | `3212RT24` | `32HR616`, `321Q616`, `321Q24`, `321Q16`, `32RT1224` |
| PFI takeoff app | `3206U16` | `3206HU16` | `54RT12` | `32HR616`, `321Q616`, `32RT2212` |

Every reading that is not already in the written form carries a note
("Read 3206U16 as 32HR616"), so an order line can show what it understood.
The extender box on an order line is `parsePartNumber(code, ext)`: with it
filled, the part number ends in the depth only.

In the Rule Sheet form the extender and depth share one run of digits.
`32HR1812` is unambiguous; `32RT608` could be 6" straights 8" deep or 60"
straights 8" deep, so it is read as the first and carries a note naming
the second (`3260RT8`). `formatPartNumber` never writes a code that reads
back as a different part.

Home plates (`2418HP16`) and specials (`283Q16-SF1`) are refused with a
reason: Rule Sheet v1 does not cover them yet.

## The rules, in brief

**Length.** Every side starts from 36X12 stock. 36" and under is one
36X12 with cells cut off. Over 36" is as many full 36X12s as fit, the
front ear cut off at each 36-to-36 joint, plus one add-on for the rest.
Add-ons per 36X12: 3 single cells, 2 two-cell, 1 three-cell (a cell left
over), 1 four- or five-cell. On an open shape only the wall end is cut to
an exact length, and that end is held with 4L brackets.

**Depth.** A full 12" top (it has the floor-finish edge), 4" or 8" middles
ripped on a rib with 8s before 4s, then a bottom cut to the remainder, as
large as possible up to 12". Ripping a 4" piece leaves an 8" piece with
the finish edge, saved as 36X8 (32X8 for rounds). The 4" left after an 8"
rip is scrapped.

**Rounds.** From 32R12 stock, cut for depth only. Full round 4 pieces,
half 2, quarter 1, racetrack 4 with two straights, three-quarter 3 laid
out round, side, round, side, round, side. A straight bolts to a round flat
on flat with its ear cut off.

**Shipped hardware.** Bolts and nuts: corners × (depth ÷ 4, rounded down).
LLB: 1 per side at 36X12 or smaller, 2 for anything bigger, 3 from 48"
plus 1 per full 12" over 48". Screws: same as LLB. Tapcons: on an SQ the
LLB count; on open shapes LLB plus depth ÷ 4 at each of the 2 wall ends.
4L brackets at a custom wall end: 2 for the top, 1 for a 4" piece, 2 for a
bigger one; each takes 1 Tapcon and 1 #14 screw in place of the Tapcons
through the ear.

**In-plant bolts.** 1 per 4" of each layer at every length joint, 1 per
every other cell along every depth seam, 4 per round depth piece.

## Tests

| File | What it proves |
|---|---|
| `tests/part-number.test.ts` | Every written form reads as the right part, the written form reads back as the same part for every length 6"–240" and every extender 6"–240", and bad part numbers are refused with a reason. |
| `tests/rules.test.ts` | The Rule Sheet's own tables and examples: the length and depth tables, the hardware examples, the 7-bolt check from the video. |
| `tests/golden.test.ts` | Parity with the PFI Order Builder page. `data/order-builder-golden.json` is that page's engine run over 112 parts and 4 orders (`npm run golden` regenerates it from `reference/`). A failure here is a change the shop would see. |
| `tests/bom.test.ts` | The rules against the old hardware calculator (`data/shipped-hardware-bom.json`, the PFI Shipped Hardware BOM sheet). |

### Against the old calculator

Of the calculator's 79 parts, 9 are closed squares at 28", 44" and 56",
which can't be built from 36X12 (not whole cells). Of the 70 that can, the
rules reproduce the calculator exactly for every part 12" deep or less
built from one panel per side: 18 parts. Every other difference is one of
the open questions on the Rule Sheet, and the test fails on any that is
not:

| Difference | Parts | Calculator | Rule Sheet v1 |
|---|---|---|---|
| Bolts per corner | 24 | 5 at 16", 6 at 18", 7 at 24"; 2 at 6", 3 at 10" | depth ÷ 4 rounded down: 4, 4, 6; 1, 2 |
| LLB on long or deep sides | 21 | 1 per panel piece (72" side: 2 at 12", 4 at 16" and 24") | 5 for any 72" side |
| Tapcons | 16 | follow the calculator's LLB | follow the sheet's LLB |
| Custom wall ends | 18 | 28", 44", 45", 56" sides from 24X8 and 28X12 stock, ears at both ends | cut from 36X12, 4L brackets at the wall end |
| In-plant seam bolts | 17 | 2 per 36" strip | 3 (the video count) |
| In-plant, old stock | 16 | built from 24X8 and 28X12 | built from 36X12 |
| Calculator inconsistent | 4 | its own Tapcon count does not follow its own LLB count | |

Thirty-four calculator parts are built here as custom lengths with 4L
brackets, among them the 20", 29", 34" and 38" Wegmans parts whose shipped
totals still match. The Tapcon total is the same at 8" deep either way,
but the 4L brackets and #14 screws are new.

## Open questions

These are on the Rule Sheet under Open items, for the next shop video. The
test lists above move when they are answered.

- Bolts per corner above 12" deep: one more than depth ÷ 4, as the calculator shipped? (`boltsPerJoint`)
- Bolts per corner under 12": is 2 the minimum, and does 10" round up to 3? (`boltsPerJoint`)
- LLB on long sides: 1 per panel piece, or 3 from 48" plus 1 per foot? (`llbPerSide`)
- In-plant depth seam bolts: 2 or 3 per 36" strip? (`inPlantBoltsForRun`)
- 28", 44", 45" and 56" sides: still built from 24X8 and 28X12 stock, or custom lengths from 36X12? (`lengthPieces`, `buildUnit`)
- One written form for rounds with extenders. (`formatPartNumber`)
- 32R8 has no hardware recipe in the calculator.

## Where this fits

- **PFI Order Builder page** (the sales order program the team uses): its
  engine is `reference/order-builder-engine.cjs`, lifted verbatim, and this
  module is its port. The page could take `parsePartNumber` as-is to read
  the quote and layout-plan forms it refuses today.
- **PFI takeoff app** (`wyattotto/PFI`): `partCode` and the parser in
  `truth.ts` write and read the `3206U16` form; `parsePartNumber` and
  `formatPartNumber` cover both. Its unverified 90° and 45° bracket model
  would be replaced by `shippedHardware`.
