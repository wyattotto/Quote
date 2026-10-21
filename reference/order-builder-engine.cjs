// The PFI engine as it runs on the PFI Order Builder page (claude.ai artifact LE7r7oi42jFDajkMTL72FL), lifted verbatim.
// Reference only: src/ is the port. scripts/make-golden.cjs runs this to regenerate data/order-builder-golden.json.
const PFI = (() => {
  const MAX_DEPTH = 48;
  const bpj = d => Math.floor(d / 4);               // bolts per joint / corner, odd depths round down
  const validDepth = d => Number.isFinite(d) && d >= 4 && d <= MAX_DEPTH;

  const STRAIGHT = {
    '1Q': { sides: 1, corners: 0, open: 2, name: 'One side' },
    '2Q': { sides: 2, corners: 1, open: 2, name: 'Two sides' },
    '3Q': { sides: 3, corners: 2, open: 2, name: 'Three sides' },
    'SQ': { sides: 4, corners: 4, open: 0, name: 'Closed square' },
  };
  const ROUND = {
    full:    { pieces: 4, rrJoints: 4, open: 0, name: 'Full round', takesExt: false },
    half:    { pieces: 2, rrJoints: 1, open: 2, name: 'Half round', takesExt: true },
    three:   { pieces: 3, rrJoints: 2, open: 2, name: 'Three-sided round', takesExt: true },
    quarter: { pieces: 1, rrJoints: 0, open: 2, name: 'Quarter round', takesExt: true },
    race:    { pieces: 4, rrJoints: 2, open: 0, name: 'Racetrack', takesExt: true, straights: true },
  };

  // Split trailing digits into extender length + depth (e.g. 1812 -> 18 / 12).
  function splitExtDepth(digits) {
    if (digits.includes('.')) return null;   // decimal depth with extenders: put the extender length in the Ext. box
    const whole = parseInt(digits, 10);
    if (validDepth(whole)) return { depth: whole, ext: null };
    for (const n of [2, 1]) {
      if (digits.length <= n) continue;
      const depth = parseInt(digits.slice(-n), 10), ext = parseInt(digits.slice(0, -n), 10);
      if (validDepth(depth) && ext >= 6) return { depth, ext };
    }
    return null;
  }

  function parse(raw, extBox, straightOnly) {
    const code = String(raw || '').toUpperCase().replace(/\s+/g, '').replace('¼', '1/4');
    if (!code) return { error: 'Enter a part number' };
    const extTyped = extBox === '' || extBox == null ? null : Number(extBox);
    if (extTyped != null && !(extTyped > 0)) return { error: 'Extender length must be a number of inches' };
    let m;
    // Rounds (32" diameter). A straight length is always a multiple of 6, so 32... is a round.
    const roundForms = [
      [/^32(?:R|FR|SQ)(\d+(?:\.\d+)?)$/, 'full'],
      [/^32HR(\d+(?:\.\d+)?)$/, 'half'],
      [/^322Q(\d+(?:\.\d+)?)$/, 'half'],
      [/^323Q(\d+(?:\.\d+)?)$/, 'three'],
      [/^321Q(\d+(?:\.\d+)?)$/, 'quarter'],
      [/^321\/4R(\d+(?:\.\d+)?)$/, 'quarter'],
      [/^32RT(\d+(?:\.\d+)?)$/, 'race'],
    ];
    for (const [re, kind] of roundForms) {
      if (straightOnly || !(m = code.match(re))) continue;
      const R = ROUND[kind];
      let depth, ext = null;
      if (!R.takesExt) { depth = parseFloat(m[1]); }
      else {
        const s = extTyped != null ? { depth: parseFloat(m[1]), ext: extTyped } : splitExtDepth(m[1]);
        if (!s) return { error: `Can't read the depth in ${code}` };
        depth = s.depth; ext = s.ext;
        if (extTyped != null && s.ext == null) ext = extTyped;
      }
      if (!validDepth(depth)) return { error: `Depth ${depth}" is outside 4–${MAX_DEPTH}"` };
      if (R.straights && !ext) return { error: 'Racetrack needs a straight-side length' };
      return { type: 'round', kind, code, ...R, depth, ext, diameter: 32 };
    }
    // Feet-and-inches lengths, e.g. 4'-8"2Q6 or 2'-8"2Q12 (rounded up to the next whole inch)
    if ((m = code.match(/^(\d+)'-?(\d+(?:\.\d+)?)?(?:"|'')?([123]Q|SQ|X)(\d+(?:\.\d+)?)$/))) {
      const inches = Math.ceil(parseInt(m[1], 10) * 12 + (m[2] ? parseFloat(m[2]) : 0));
      return parse(m[3] === 'X' ? `${inches}X${m[4]}` : `${inches}${m[3]}${m[4]}`, extBox, true);
    }
    // Straights: 421Q16, 36SQ12, or a single side 42X16
    if ((m = code.match(/^(\d+?)([123]Q|SQ)(\d+(?:\.\d+)?)$/)) || (m = code.match(/^(\d+)X(\d+(?:\.\d+)?)$/))) {
      const length = parseInt(m[1], 10);
      const shape = m.length === 4 ? m[2] : '1Q';
      const depth = parseFloat(m.length === 4 ? m[3] : m[2]);
      if (!(length >= 6)) return { error: 'Length must be at least 6"' };
      if (length % 6 && shape === 'SQ') return { error: `${length}" isn't a multiple of 6". A closed square bolts at every corner, so its sides must be whole cells.` };
      if (!validDepth(depth)) return { error: `Depth ${depth}" is outside 4–${MAX_DEPTH}"` };
      return { type: 'straight', code, length, depth, shape, ...STRAIGHT[shape] };
    }
    return { error: `Can't read ${code}. Examples: 42SQ16, 362Q12, 32R12, 32HR1812` };
  }

  // Depth layers top to bottom. Top is a full 12 (or the whole depth when 12 or less).
  function layers(D) {
    if (D <= 12) return [{ role: 'top', h: D }];
    const R = D - 12; const out = [{ role: 'top', h: 12 }];
    if (R <= 12) { out.push({ role: 'bottom', h: R }); return out; }
    let mid = 4 * Math.ceil((R - 12) / 4);       // middles in 4" steps, bottom takes the rest (up to 12")
    const b = Math.round((R - mid) * 100) / 100;
    while (mid >= 8) { out.push({ role: 'middle', h: 8 }); mid -= 8; }
    if (mid === 4) out.push({ role: 'middle', h: 4 });
    out.push({ role: 'bottom', h: b });
    return out;
  }

  // Length pieces for one straight run of length L.
  function lengthPieces(L) {
    if (L <= 36) return { pieces: [{ len: L, kind: L === 36 ? 'full' : 'cutdown' }], earJoints: 0, odd: L % 6 !== 0 };
    const n = Math.floor(L / 36), r = L - n * 36;
    const pieces = Array.from({ length: n }, () => ({ len: 36, kind: 'full' }));
    if (r) pieces.push({ len: r, kind: 'addon' });
    return { pieces, earJoints: n - 1, odd: r % 6 !== 0 };
  }

  // LLB per side: 1 at 36X12 or smaller, 2 for anything bigger, 3 from 48" long plus 1 more per full 12" over 48"
  const llbPerSide = (L, D) => L >= 48 ? 3 + Math.floor((L - 48) / 12) : (L <= 36 && D <= 12) ? 1 : 2;

  // In-plant bolts for one straight run: length joints across every layer + depth seams.
  function inPlantForRun(L, D) {
    const lp = lengthPieces(L), ly = layers(D);
    const joints = lp.pieces.length - 1;
    const perJoint = ly.reduce((s, l) => s + bpj(l.h), 0);
    let seams = 0;
    for (const p of lp.pieces) for (const l of ly) if (l.role !== 'top') seams += Math.floor(Math.floor(p.len / 6) / 2);
    return joints * perJoint + seams;
  }

  // Everything for ONE unit of a parsed line.
  function unit(p) {
    const ly = layers(p.depth);
    const blanks = [];  // {src:'36'|'cutdown'|'addon'|'32R', len, layer}
    const ear = [];     // ear cuts
    const runs = [];    // straight runs {L, role}
    const notes = [];
    let inPlant = 0, roundSeamUnknown = false;
    const hw = { bolts: 0, nuts: 0, llb: 0, screws: 0, tapcons: 0, l4: 0, s14: 0 };
    const addRun = (L, role, earBothEnds, freeEnd) => {
      runs.push({ L, role });
      const lp = lengthPieces(L);
      if (lp.odd) notes.push(freeEnd ? `${L}" ${role === 'extender' ? 'extenders' : 'sides'} are a custom length: cut the wall end to exact length and use 4L brackets at the wall.` : `${L}" ${role === 'straight' ? 'straights between round pieces' : 'pieces'}: cut to exact length.`);
      for (const pc of lp.pieces) for (const l of ly) blanks.push({ src: pc.kind === 'full' ? '36' : pc.kind, len: pc.len, layer: l, role });
      for (let j = 0; j < lp.earJoints; j++) for (const l of ly) ear.push({ why: '36-to-36 joint', layer: l });

      inPlant += inPlantForRun(L, p.depth);
      hw.llb += llbPerSide(L, p.depth);
    };
    // 4L brackets at each custom-length wall end: 2 for the 12" top, then 1 for a 4" depth piece or 2 for a bigger one (16" = 3, 18" = 4, 24" = 4)
    const l4PerEnd = ly.reduce((s, l) => s + (l.role === 'top' ? 2 : l.h <= 4 ? 1 : 2), 0);
    let customEnds = 0;
    // A straight that bolts to a round loses its front ear. A cut-down piece is cut from the non-ear side, so its ear goes with the scrap.
    const roundEar = L => { if (L >= 36) for (const l of ly) ear.push({ why: 'straight to round', layer: l }); };
    if (p.type === 'straight') {
      for (let s = 0; s < p.sides; s++) addRun(p.length, 'side', false, p.shape !== 'SQ');
      if (p.length % 6 && p.shape !== 'SQ') customEnds = p.shape === '1Q' ? 1 : 2;
      hw.bolts = p.corners * bpj(p.depth);
    } else {
      for (let i = 0; i < p.pieces; i++) for (const l of ly) blanks.push({ src: '32R', len: 32, layer: l });
      inPlant += p.pieces * (ly.length - 1) * 4;   // 4 bolts join each round depth piece to the one above (Wyatt's video IMG_1860)
      hw.llb += p.pieces * (p.depth <= 12 ? 1 : 2);
      // Straights bolt to round pieces flat on flat: the ear is cut off at every round-to-straight joint.
      let joints = p.rrJoints, rs = 0;
      if (p.kind === 'race') { addRun(p.ext, 'straight'); addRun(p.ext, 'straight'); rs = 4; roundEar(p.ext); roundEar(p.ext); }
      else if (p.ext && p.kind === 'three') {          // R, side, R, side, R, side (Wyatt's diagram IMG_1863)
        addRun(p.ext, 'straight'); addRun(p.ext, 'straight'); addRun(p.ext, 'extender', false, true); joints = 0; rs = 5;
        roundEar(p.ext); roundEar(p.ext); roundEar(p.ext);
        if (p.ext % 6) customEnds = 1;
      }
      else if (p.ext) { addRun(p.ext, 'extender', false, true); addRun(p.ext, 'extender', false, true); rs = 2; roundEar(p.ext); roundEar(p.ext); if (p.ext % 6) customEnds = 2; }
      joints += rs;
      hw.bolts = joints * bpj(p.depth);
    }
    // Each 4L bracket: 1 Tapcon to the wall and 1 #14 screw to the piece (or a 1¼" bolt and nut).
    // A custom wall end uses 4L brackets in place of the Tapcons through the ear.
    hw.l4 = customEnds * l4PerEnd; hw.s14 = hw.l4;
    hw.tapcons = hw.llb + (p.open - customEnds) * bpj(p.depth) + hw.l4;
    hw.nuts = hw.bolts; hw.screws = hw.llb;
    return { layers: ly, blanks, ear, runs, hw, inPlant, roundSeamUnknown, notes };
  }

  // Describe one cut a blank needs for its layer.
  function ripFor(layer, src) {
    const h = layer.h, edge = src === '32R' ? '32R' : null;
    if (layer.role === 'top') {
      if (h === 12) return null;
      return { key: `top${h}`, label: `Rip to ${h}" keeping the floor-finish edge (top piece)`, leftover: 12 - h, keepLeftover: false, onRib: h % 4 === 0 };
    }
    if (h === 12) return { key: 'flip12', label: 'Full 12" piece used as the bottom (no rip)', leftover: 0 };
    if (layer.role === 'middle') return { key: `mid${h}`, label: `Rip ${h === 8 ? 'an' : 'a'} ${h}" strip on a rib (middle piece)`, leftover: 12 - h, keepLeftover: h === 4, onRib: true };
    return { key: `bot${h}`, label: `Rip ${h === 8 || h === 11 ? 'an' : 'a'} ${h}" bottom piece${h % 4 ? ' (no rib needed)' : ' on a rib'}`, leftover: 12 - h, keepLeftover: 12 - h === 8, onRib: h % 4 === 0 };
  }

  // Whole order.
  function order(lines) {
    const res = { lines: [], stock: { '36X12': 0, '32R12': 0 }, addon: {}, cutdown: {}, cutdownRoles: {}, rips: {}, ears: 0,
      saved: { '36X8': 0, '32X8': 0 }, leftoverCells: 0, hw: { bolts: 0, nuts: 0, llb: 0, screws: 0, tapcons: 0, l4: 0, s14: 0 },
      inPlant: 0, roundSeamUnknown: false, shelfTop8: 0, errors: 0 };
    for (const ln of lines) {
      const p = parse(ln.code, ln.ext);
      const qty = Math.max(0, Math.floor(Number(ln.qty) || 0));
      if (p.error) { res.lines.push({ ln, p, qty }); res.errors++; continue; }
      const u = unit(p);
      res.lines.push({ ln, p, qty, u });
      for (const k in u.hw) res.hw[k] += u.hw[k] * qty;
      res.inPlant += u.inPlant * qty;
      if (u.roundSeamUnknown && qty) res.roundSeamUnknown = true;
      res.ears += u.ear.length * qty;
      for (const b of u.blanks) {
        const n = qty;
        if (!n) continue;
        if (b.src === '36') res.stock['36X12'] += n;
        else if (b.src === '32R') res.stock['32R12'] += n;
        else if (b.src === 'cutdown') { res.stock['36X12'] += n; res.cutdown[b.len] = (res.cutdown[b.len] || 0) + n; (res.cutdownRoles[b.len] = res.cutdownRoles[b.len] || {})[b.role] = true; }
        else if (b.src === 'addon') { res.addon[b.len] = (res.addon[b.len] || 0) + n; }
        const r = ripFor(b.layer, b.src);
        if (r) {
          const sz = b.src === '32R' ? '32R' : String(b.len);
          const key = `${r.key}|${sz}`;
          res.rips[key] = res.rips[key] || { ...r, size: sz, qty: 0 };
          res.rips[key].qty += n;
          if (r.keepLeftover && (sz === '36' || sz === '32R')) res.saved[sz === '36' ? '36X8' : '32X8'] += n;
          if (b.layer.role === 'top' && b.layer.h === 8 && sz === '36') res.shelfTop8 += n;
        }
      }
    }
    // Add-on pieces per 36X12: 1-cell 3, 2-cell 2, 3-cell 1 (+1 leftover cell), 4/5-cell 1.
    for (const len in res.addon) {
      const n = res.addon[len], cells = Math.ceil(len / 6);   // an odd add-on uses the next whole cell, trimmed at the wall end
      const per = cells === 1 ? 3 : cells === 2 ? 2 : 1;
      const panels = Math.ceil(n / per);
      res.addon[len] = { pieces: n, cells, per, panels };
      res.stock['36X12'] += panels;
      if (cells === 3) res.leftoverCells += n;
    }
    return res;
  }

  return { parse, layers, lengthPieces, unit, order, bpj, llbPerSide, ripFor, STRAIGHT, ROUND };
})();
module.exports = PFI;
