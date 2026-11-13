// Where a crane at every slip would stand, how close it comes to what is
// already there, and how it moves. Pure: no scene, so the numbers the page
// shows can be checked in Node. The slips themselves are the yard's own:
// `yardOf` and `footprints` of viewer/web/space/plan.js, never copied.
import { yardOf, footprints } from '../../../viewer/web/space/plan.js';

export const COUNTS = [4, 6, 10];
export const BODY = 0.5; // a shipwright, as a circle: the head of the model at the yard's scale
export const SHIP = { scale: 0.88, y: 0.28, z: -6.4, cut: 3.85 }; // the largest ship on its slip, as the yard berths it; the hull stands up to `cut`
export const FULL = 1.2, SLIM = 0.45; // half the side of the crane's foot: A1 as it stands, and A1 on a narrow foot
// the arm of A1, along its own length from the mast: the jib, the cab, the counterweight (half widths)
export const ARM = { y0: 7.1, parts: [[-2.2, 5.4, 0.2], [-0.6, 0.6, 0.65], [-3.3, -1.9, 0.6]] };
export const REACH = [1.1, 5]; // how near and how far the hook runs along the jib
export const CRATE = { x: 0.43, z: 0.52, h: 0.62, carry: 5.2 }; // the load (half its sides): the hook swivels, so it keeps its bearing while the jib turns; `carry` is how high its underside travels
const GAP = 0.05;

export const OPTIONS = [
  { code: 'F1', name: 'Derek penuh di samping tiap dok', foot: FULL, shared: false, text: 'Derek A1 seperti adanya (tapak 2,4), satu di sisi timur tiap dok, rapat ke perancah.' },
  { code: 'F2', name: 'Derek penuh, satu untuk dua dok', foot: FULL, shared: true, text: 'Derek A1 seperti adanya (tapak 2,4), berdiri di antara dua dok bersebelahan dan melayani keduanya bergantian.' },
  { code: 'F3', name: 'Kaki ramping di samping tiap dok', foot: SLIM, shared: false, text: 'Derek A1 dengan tapak dikecilkan menjadi 0,9, satu di sisi timur tiap dok, di antara dua tempat berdiri tukang.' },
  { code: 'F4', name: 'Kaki ramping di sudut kepala dok', foot: SLIM, shared: false, text: 'Derek A1 dengan tapak 0,9, di sudut landasan dok itu sendiri, di ujung darat. Jangkauannya hanya sepertiga belakang lambung; bahan diambil dari tepi jalan.' },
  { code: 'F5', name: 'Kaki ramping, satu untuk dua dok', foot: SLIM, shared: true, text: 'Derek A1 dengan tapak 0,9, berdiri di antara dua dok bersebelahan dan melayani keduanya bergantian.' },
];
export const optionOf = (code) => OPTIONS.find((o) => o.code === code);

const sq = (x, z, h) => ({ x0: x - h, x1: x + h, z0: z - h, z1: z + h });
// How far apart two rectangles are; below zero: how deep one stands in the other.
export function apart(a, b) {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1), dz = Math.max(a.z0 - b.z1, b.z0 - a.z1);
  return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz);
}

// The cranes of one option in a yard of `n` slips. Each has a foot, the slips it serves, the pallet
// it lifts from and, per slip served, the point over the hull where it sets the load down.
export function layout(code, n) {
  const opt = optionOf(code), Y = yardOf(n);
  const rows = [Y.docks.slice(0, Y.front), Y.docks.slice(Y.front)];
  const k = (d) => Y.docks.indexOf(d);
  const cranes = [];
  const add = (x, z, serves, pile, drops) => cranes.push({ i: cranes.length, x, z, foot: opt.foot, rect: sq(x, z, opt.foot), serves, pile, drops });
  for (const row of rows) {
    if (opt.shared) {
      // pairs from the west; a slip left over at the end of a row gets a crane of its own, at the same distance
      for (let p = 0; p < row.length; p += 2) {
        const a = row[p], b = row[p + 1];
        const x = a.x + Y.pitch / 2, z = a.z - 8.75;
        const off = Math.max(1, Y.pitch / 2 - 4.7); // as near the keel as the hook reaches
        add(x, z, b ? [k(a), k(b)] : [k(a)], { x, z: a.z - 11.45 }, [{ k: k(a), x: a.x + off, z: a.z - 8 }, ...(b ? [{ k: k(b), x: b.x - off, z: b.z - 8 }] : [])]);
      }
    } else if (code === 'F4') {
      for (const d of row) add(d.x + 3.05, d.z - 12, [k(d)], { x: d.x + 3.05, z: d.z - 13.6 }, [{ k: k(d), x: d.x + 0.8, z: d.z - 9.2 }]);
    } else {
      const x = 3.4 + opt.foot + GAP; // clear of the scaffold
      for (const d of row) add(d.x + x, d.z - 8.75, [k(d)], { x: d.x + Math.min(4.05, Y.pitch / 2), z: d.z - 11.45 }, [{ k: k(d), x: d.x + 0.9, z: d.z - 6.4 }]);
    }
  }
  return { code, opt, n: Y.n, Y, cranes };
}

// What stands in the yard, for the cranes to keep clear of. `hull`: the largest ship from above, as strips
// across the keel { z0, z1, w, mast } about its own middle; `mast` is the half width of what stands above the hull.
export function things(Y, hull) {
  const out = [];
  const put = (kind, r, h, k, more = {}) => out.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, kind, h, k, ...more });
  Y.docks.forEach((d, k) => {
    for (const s of hull) {
      put('ship', { x0: d.x - s.w, x1: d.x + s.w, z0: d.z + SHIP.z + s.z0, z1: d.z + SHIP.z + s.z1 }, SHIP.y + SHIP.cut * SHIP.scale, k);
      if (s.mast) put('mast', { x0: d.x - s.mast, x1: d.x + s.mast, z0: d.z + SHIP.z + s.z0, z1: d.z + SHIP.z + s.z1 }, 9.1, k);
    }
    for (const s of [-1, 1]) {
      for (const dz of [-10, -7.5, -5, -2.5]) put('worker', sq(d.x + s * Y.side, d.z + dz, 0), 2.3, k, { r: BODY });
      put('fitting', { x0: d.x + s * 3.05 - 0.35, x1: d.x + s * 3.05 + 0.35, z0: d.z - 11.4, z1: d.z - 1.6 }, 3.5, k); // the scaffold
    }
    put('fitting', { x0: d.x - 4.05, x1: d.x - 2.15, z0: d.z - 12.35, z1: d.z - 12.25 }, 2.5, k); // the slip's sign and lamp
  });
  const row = Y.docks.slice(0, Y.front);
  const lamps = [row[0].x - 5, row[row.length - 1].x + 4.6, ...(!Y.back && Y.pitch >= 9.3 ? row.slice(1).map((d) => d.x - Y.pitch / 2) : [])];
  for (const x of lamps) put('fitting', sq(x, -12.4, 0.25), 3.85, -1, { lamp: true });
  for (const f of footprints(Y)) {
    if (f.kind === 'dock' || f.kind === 'slipway') put('dock', f, 0.3, f.k);
    if (f.kind === 'street' || f.kind === 'lane') put('road', f, 0, -1);
  }
  return out;
}

// The least room between the cranes' feet and each kind of thing: { ship, worker, dock, fitting, road, crane }
// in the yard's own unit, and per crane its least. A slip's own ground is not its crane's neighbour; a crane
// between two slips has no slip of its own.
export const KINDS = ['ship', 'worker', 'dock', 'fitting', 'road', 'crane'];
export function clearances(L, hull) {
  const T = things(L.Y, hull);
  const least = Object.fromEntries(KINDS.map((k) => [k, Infinity]));
  const per = L.cranes.map((c) => {
    let mine = Infinity;
    const take = (kind, d) => { least[kind] = Math.min(least[kind], d); mine = Math.min(mine, d); };
    for (const t of T) {
      if (t.kind === 'mast') continue;
      if (t.kind === 'dock' && !L.opt.shared && c.serves.includes(t.k)) continue;
      take(t.kind, apart(c.rect, t) - (t.r || 0));
    }
    for (const o of L.cranes) if (o !== c) take('crane', apart(c.rect, o.rect));
    return mine;
  });
  const min = Math.min(...Object.values(least));
  return { least, per, min, state: stateOf(min) };
}
export const TIGHT = 0.1; // the yard's own least margin: a shipwright's spot to the widest hull passing behind it
export const stateOf = (d) => (d <= 0.004 ? 'clash' : d < TIGHT ? 'tight' : 'clear');

// ----- how a crane moves -----
//
// One trip, in seconds: lower the hook onto the pallet, lift, swing to the hull, set the load down, lift, swing back.
const TRIP = 14;
const ease = (u) => u * u * (3 - 2 * u);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const aim = (c, p) => ({ a: Math.atan2(p.x - c.x, p.z - c.z), r: Math.max(REACH[0], Math.min(REACH[1], Math.hypot(p.x - c.x, p.z - c.z))) });
// Neighbours work half a trip apart: two jibs never point along the row at the same moment.
export const startOf = (L, c) => (L.opt.shared ? c.i * 3 : (c.i % 2) * (TRIP / 2));
export const cycleOf = (c) => TRIP * c.drops.length;
// Where the arm is at `t`: { a: the jib's bearing, r: how far out the hook, y: the load's underside, carrying, leg, set: 0..1 the load just set down }.
// `deck(drop)`: how high the hull's deck is where the load is set down.
export function pose(L, c, t, deck = () => 2) {
  const T = (((t + startOf(L, c)) % cycleOf(c)) + cycleOf(c)) % cycleOf(c);
  const leg = Math.floor(T / TRIP), u = T - leg * TRIP;
  const drop = c.drops[leg];
  const from = aim(c, c.pile), to = aim(c, drop);
  to.a = from.a + wrap(to.a - from.a);
  const low = CRATE.h + 0.02, top = CRATE.carry, down = deck(drop) + 0.03; // the pallet keeps one crate: the hook takes the one on top
  const mix = (a, b, f) => a + (b - a) * ease(Math.max(0, Math.min(1, f)));
  const at = (f) => ({ a: mix(from.a, to.a, f), r: mix(from.r, to.r, f) });
  const P = (o, y, carrying, set = 0) => ({ ...o, y, carrying, leg, drop, set });
  if (u < 1.5) return P(at(0), mix(top, low, u / 1.5), false);
  if (u < 2) return P(at(0), low, true);
  if (u < 3.5) return P(at(0), mix(low, top, (u - 2) / 1.5), true);
  if (u < 7) return P(at((u - 3.5) / 3.5), top, true);
  if (u < 8.5) return P(at(1), mix(top, down, (u - 7) / 1.5), true);
  if (u < 9) return P(at(1), down, false, 1);
  if (u < 10) return P(at(1), mix(down, top, u - 9), false, 1 - (u - 9));
  if (u < 13) return P(at(1 - (u - 10) / 3), top, false);
  return P(at(0), top, false);
}
// With the masts up no jib passes over a hull: every crane stands turned to the water, hook up.
export const parked = () => ({ a: 0, r: 2.5, y: CRATE.carry, carrying: false, leg: 0, drop: null, set: 0 });

const segs = (c, p) => ARM.parts.map(([s0, s1, w]) => ({ ax: c.x + Math.sin(p.a) * s0, az: c.z + Math.cos(p.a) * s0, bx: c.x + Math.sin(p.a) * s1, bz: c.z + Math.cos(p.a) * s1, w }));
function pointSeg(px, pz, s) {
  const vx = s.bx - s.ax, vz = s.bz - s.az;
  const f = Math.max(0, Math.min(1, ((px - s.ax) * vx + (pz - s.az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - s.ax - vx * f, pz - s.az - vz * f);
}
function segSeg(a, b) {
  const d = (p, q, r) => (r.x - p.x) * (q.z - p.z) - (r.z - p.z) * (q.x - p.x);
  const A = { x: a.ax, z: a.az }, B = { x: a.bx, z: a.bz }, C = { x: b.ax, z: b.az }, D = { x: b.bx, z: b.bz };
  if (d(A, B, C) * d(A, B, D) < 0 && d(C, D, A) * d(C, D, B) < 0) return 0;
  return Math.min(pointSeg(a.ax, a.az, b), pointSeg(a.bx, a.bz, b), pointSeg(b.ax, b.az, a), pointSeg(b.bx, b.bz, a));
}
const rectPoint = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
function rectSeg(r, s) { // near enough: the segment in steps
  let m = Infinity;
  const n = Math.max(1, Math.ceil(Math.hypot(s.bx - s.ax, s.bz - s.az) / 0.2));
  for (let i = 0; i <= n; i++) m = Math.min(m, rectPoint(r, s.ax + (s.bx - s.ax) * i / n, s.az + (s.bz - s.az) * i / n));
  return m;
}

// The whole round of every crane, in small steps: the least room between two cranes' arms (and, with the masts up,
// between an arm and a mast), and between a load on its way and anything it could strike. `masts`: the ships are finished.
export function swing(L, hull, { masts = false, deck = () => 2, step = 0.05 } = {}) {
  const T = things(L.Y, hull);
  const solid = [...T.filter((t) => t.kind !== 'dock' && t.kind !== 'road' && t.kind !== 'mast'),
    ...L.cranes.map((c) => ({ kind: 'crane', ...sq(c.x, c.z, 0.35), h: 9, own: c.i })), ...L.cranes.map((c) => ({ kind: 'crane', ...c.rect, h: 0.7, own: c.i }))];
  const tall = T.filter((t) => t.kind === 'mast');
  const period = masts ? step : Math.max(...L.cranes.map(cycleOf));
  let arm = Infinity, load = Infinity, mast = Infinity;
  for (let t = 0; t < period; t += step) {
    const poses = L.cranes.map((c) => (masts ? parked() : pose(L, c, t, deck)));
    const arms = L.cranes.map((c, i) => segs(c, poses[i]));
    for (let i = 0; i < arms.length; i++) {
      for (let j = i + 1; j < arms.length; j++) for (const a of arms[i]) for (const b of arms[j]) arm = Math.min(arm, segSeg(a, b) - a.w - b.w);
      // another crane's mast and cab are in `arms[j]` (the cab); its mast below the arm is no matter to an arm
      if (masts) for (const a of arms[i]) for (const m of tall) mast = Math.min(mast, rectSeg(m, a) - a.w);
      const c = L.cranes[i], p = poses[i];
      const x = c.x + Math.sin(p.a) * p.r, z = c.z + Math.cos(p.a) * p.r;
      if (masts) continue;
      for (const s of solid) {
        if (p.y >= s.h) continue;
        if (s.kind === 'ship' && p.drop && s.k === p.drop.k && Math.hypot(x - p.drop.x, z - p.drop.z) < 0.01) continue; // into the hull it is meant for
        load = Math.min(load, apart({ x0: x - CRATE.x, x1: x + CRATE.x, z0: z - CRATE.z, z1: z + CRATE.z }, s) - (s.r || 0));
      }
    }
  }
  return { arm, load, mast: masts ? mast : null };
}
