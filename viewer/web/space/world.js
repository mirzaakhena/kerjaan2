// The yard: a quay with its slips and a crane at the head of each, a row of
// sheds behind them, a terrace, a mail pier, a lighthouse and the bay. Built
// once; `update` moves the water, the boats, the cranes and the light. `setDocks(n)` lays the slips
// out anew (`yardOf` in plan.js says where): the island grows wider, and
// deeper for a second row, and what stands at its ends and at its back moves
// out with it.
//
// Axes: x runs west to east along the quay, +z is out to sea, the quay's
// surface is y = 0.
import * as THREE from 'three';
import { spawn, materialOf } from './kit.js';
import { yardOf, STREET } from './plan.js';
import { Crane, craneAt, FOOT, PIVOT, CRATE, PLANK, DECK } from './crane.js';

export const KIT = [
  'pirate/barrel', 'pirate/crate', 'pirate/crate-bottles', 'pirate/chest', 'pirate/boat-row-small', 'pirate/flag-high', 'pirate/flag-pennant', 'pirate/palm-bend', 'pirate/palm-straight', 'pirate/palm-detailed-bend', 'pirate/palm-detailed-straight', 'pirate/patch-sand-foliage', 'pirate/platform-planks', 'pirate/rocks-a', 'pirate/rocks-b', 'pirate/rocks-c', 'pirate/ship-small', 'pirate/ship-medium', 'pirate/ship-large', 'pirate/ship-pirate-small', 'pirate/ship-pirate-medium', 'pirate/ship-pirate-large', 'pirate/structure', 'pirate/structure-roof', 'pirate/structure-fence', 'pirate/tower-complete-large', 'pirate/tower-watch', 'pirate/grass', 'pirate/grass-patch', 'pirate/grass-plant',
  'watercraft/boat-fishing-small', 'watercraft/boat-tug-a', 'watercraft/boat-tow-a', 'watercraft/boat-sail-a', 'watercraft/cargo-pile-a', 'watercraft/cargo-container-a', 'watercraft/cargo-container-b', 'watercraft/buoy', 'watercraft/buoy-flag',
];

export const BOUNDS = { x0: -32, x1: 32, z0: -30, z1: 26 };
export { STREET };
// How people cross the yard as it is laid out now (`route`): the street behind the last row, and where one
// gets from it to the street between the rows.
const WAYS = { back: STREET, cross: [] };
const SEA = -0.72;

const C = {
  rock: 0x7d72b3, stone: 0xcbc5da, stoneDark: 0xa9a2c2, pad: 0xb3acc8, grass: 0x86c35a, sand: 0xe6cf98,
  wood: 0xb0703f, woodDark: 0x8a5230, woodLight: 0xd29a62, paper: 0xfbf6e8, iron: 0x4b4f6b, red: 0xd9503f, grey: 0x8b93b0, water: 0x2b86e0, deep: 0x1f5fc0,
};

// The same yard every time it is opened.
function seeded(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mats = new Map();
const mat = (color, opts = {}) => {
  const key = `${color}:${JSON.stringify(opts)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...opts }));
  return mats.get(key);
};

function box(parent, w, h, d, color, x, y, z, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? mat(color, opts) : color);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  m.userData.own = 1; // its geometry is its own
  parent.add(m);
  return m;
}
function cyl(parent, r, h, color, x, y, z, seg = 10, r2 = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  m.userData.own = 1;
  parent.add(m);
  return m;
}
function prop(parent, key, x, y, z, { s = 1, ry = 0 } = {}) {
  const o = spawn(key);
  o.position.set(x, y, z);
  o.scale.setScalar(s);
  o.rotation.y = ry;
  parent.add(o);
  return o;
}

function pavingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const rnd = seeded(7);
  g.fillStyle = '#a49dbb';
  g.fillRect(0, 0, 512, 512);
  const h = 64;
  for (let row = 0; row < 8; row++) {
    let x = row % 2 ? -48 : 0;
    while (x < 512) {
      const w = 80 + Math.floor(rnd() * 3) * 24;
      const l = 78 + rnd() * 8;
      g.fillStyle = `hsl(${255 + rnd() * 12}, ${18 + rnd() * 8}%, ${l}%)`;
      g.fillRect(x + 2, row * h + 2, w - 4, h - 4);
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function sign(parent, text, x, y, z, { w = 3.2, ry = 0 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f6ead0';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#7a4a2b'; g.lineWidth = 10;
  g.strokeRect(5, 5, 502, 118);
  g.fillStyle = '#3b2a22';
  g.font = '600 68px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.own = 2; // its material and picture too
  parent.add(m);
  return m;
}
// Take down what was built for a layout that is no more.
function raze(group) {
  group.traverse((o) => {
    if (!o.isMesh || !o.userData.own) return;
    o.geometry.dispose();
    if (o.userData.own === 2) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
  group.clear();
}

// A rolled drawing: what a ticket is while it is still paper.
// Made thousands of times in a day, so every one shares the same geometry.
const SHARED = {
  roll: new THREE.CylinderGeometry(0.11, 0.11, 0.62, 8).rotateZ(Math.PI / 2),
  band: new THREE.CylinderGeometry(0.118, 0.118, 0.1, 8).rotateZ(Math.PI / 2),
  plank: new THREE.BoxGeometry(1.7, 0.09, 0.3),
  shank: new THREE.CylinderGeometry(0.11, 0.11, 1.9, 8),
  stock: new THREE.CylinderGeometry(0.09, 0.09, 1.3, 8).rotateZ(Math.PI / 2),
  ring: new THREE.TorusGeometry(0.24, 0.07, 6, 14),
  arms: new THREE.TorusGeometry(0.8, 0.12, 6, 16, Math.PI).rotateZ(Math.PI),
  fluke: new THREE.ConeGeometry(0.22, 0.42, 4),
  chain: new THREE.CylinderGeometry(0.05, 0.05, 1, 6),
};
const part = (g, geo, color) => { const m = new THREE.Mesh(geo, mat(color)); m.castShadow = m.receiveShadow = true; g.add(m); };
// Its band is red; grey while the ticket waits for another one (`userData.tie`).
export function scroll() {
  const g = new THREE.Group();
  part(g, SHARED.roll, C.paper);
  part(g, SHARED.band, C.red);
  const band = g.children[1];
  g.userData.tie = (waiting) => { band.material = mat(waiting ? C.grey : C.red); };
  return g;
}
export function plank() {
  const g = new THREE.Group();
  part(g, SHARED.plank, C.woodLight);
  return g;
}

// The anchor of a hull that passed and is held: let down from the bow of the ship on `slip`, it
// leans on the quay beside the ramp, chained to the bow. `set(0..1)`: stowed .. down.
const ANCHOR = { size: 1.3, fall: 2.6, lean: 0.5, hawse: new THREE.Vector3(-2.1, 2.3, -1.5) };
const UP = new THREE.Vector3(0, 1, 0);
export function makeAnchor(slip) {
  const o = new THREE.Group();
  const at = (s) => o.position.set(s.x + 2.4, 0, s.z + 4.9); // beside the bow of the hull that stands there
  at(slip);
  const a = new THREE.Group();
  a.scale.setScalar(ANCHOR.size);
  o.add(a);
  const iron = (geo, x, y) => { const m = new THREE.Mesh(geo, mat(C.iron)); m.position.set(x, y, 0); m.castShadow = true; a.add(m); };
  iron(SHARED.arms, 0, 0.92);
  iron(SHARED.shank, 0, 1.07);
  iron(SHARED.stock, 0, 1.75);
  iron(SHARED.ring, 0, 2.22);
  iron(SHARED.fluke, -0.8, 1.02);
  iron(SHARED.fluke, 0.8, 1.02);
  const chain = new THREE.Mesh(SHARED.chain, mat(C.iron));
  o.add(chain);
  const ring = new THREE.Vector3(), run = new THREE.Vector3();
  const set = (k) => {
    const lean = ANCHOR.lean * Math.max(0, (k - 0.6) / 0.4); // it settles against the quay, towards the ship
    a.position.y = (1 - k) * ANCHOR.fall;
    a.rotation.z = lean;
    const h = 2.22 * ANCHOR.size;
    ring.set(-Math.sin(lean) * h, a.position.y + Math.cos(lean) * h, 0);
    run.subVectors(ring, ANCHOR.hawse);
    chain.scale.y = run.length();
    chain.position.copy(ANCHOR.hawse).addScaledVector(run, 0.5);
    chain.quaternion.setFromUnitVectors(UP, run.normalize());
  };
  set(0);
  return { o, set, at };
}

// A ticket's ship. Its size says how large the contract is, its livery (one of
// ten, `liveryOf` in plan.js) which ticket it is: eight plain hulls told apart
// by the colour of sail and flag, and two pirate hulls, whose black sail is
// drawn in the model and cannot be dyed, told apart by their flag.
// `setBuild(0..1)` shows it from the keel up: the hull stands at 0.7, the masts
// at 1. Sails and flags come with `setRigged`. `top()` is how high a piece comes
// to lie that the slip's crane sets down in it: on the deck, or on what stands of the hull so far.
const SHIPS = { small: ['small', 1], medium: ['medium', 1], large: ['large', 0.88] };
const LIVERY = {
  white: { sail: 0xffffff }, red: { sail: 0xff6a5a }, teal: { sail: 0x5fe0d2 }, yellow: { sail: 0xffd75a },
  blue: { sail: 0x6fb4ff }, green: { sail: 0x7ddc8f }, orange: { sail: 0xffa257 }, purple: { sail: 0xc49bff },
  'pirate-red': { pirate: true, flag: 0xe5483a }, 'pirate-white': { pirate: true, flag: 0xffffff },
};
export function makeShip(size, livery) {
  const [hull, s] = SHIPS[size] || SHIPS.small;
  const look = LIVERY[livery] || LIVERY.white;
  const o = spawn(`pirate/ship-${look.pirate ? 'pirate-' : ''}${hull}`);
  o.scale.setScalar(s);
  o.userData.livery = LIVERY[livery] ? livery : 'white';
  const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e3);
  const mk = (color, plain) => {
    const m = materialOf('pirate').clone();
    if (plain) m.map = null; // a flag is one flat colour, whatever the model painted it
    if (color != null) m.color.setHex(color);
    m.side = THREE.DoubleSide;
    m.clippingPlanes = [cut];
    m.clipShadows = true;
    m.shadowSide = THREE.BackSide; // the inside of an open hull would otherwise shade itself in stripes
    return m;
  };
  const mHull = mk(null), mSail = look.pirate ? mHull : mk(look.sail), mFlag = mk(look.flag ?? look.sail, true);
  const rig = [];
  o.traverse((n) => { if (n.isMesh) n.material = mHull; });
  o.traverse((n) => {
    const m = /^sail/.test(n.name) ? mSail : /^flag/.test(n.name) ? mFlag : null;
    if (!m) return;
    rig.push(n);
    n.traverse((k) => { if (k.isMesh) k.material = m; });
  });
  return {
    o,
    setBuild(b) { cut.constant = b >= 0.999 ? 1e3 : o.position.y + s * (b < 0.7 ? 0.25 + (b / 0.7) * 3.6 : 3.85 + ((b - 0.7) / 0.3) * 6.4); },
    setRigged(v) { for (const n of rig) n.visible = v; },
    top() { return Math.min(cut.constant, o.position.y + s * DECK[hull]); },
    dispose() { for (const m of new Set([mHull, mSail, mFlag])) m.dispose(); },
  };
}

function plate(w, h, px = 512, py = 96) {
  const c = document.createElement('canvas');
  c.width = px; c.height = py;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }));
  let shown = null;
  m.userData.write = (text) => {
    if (text === shown) return;
    shown = text;
    m.visible = !!text;
    const g = c.getContext('2d');
    g.fillStyle = '#fbf6e8';
    g.fillRect(0, 0, px, py);
    g.fillStyle = '#2a2f45';
    g.font = '500 44px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
    g.textBaseline = 'middle';
    let out = text;
    while (out.length > 4 && g.measureText(out).width > px - 28) out = `${out.slice(0, -2)}…`;
    g.fillText(out, 14, py / 2 + 2);
    t.needsUpdate = true;
  };
  m.visible = false;
  m.userData.own = 2;
  return m;
}

export function buildWorld(scene) {
  const rnd = seeded(20261113);
  const world = new THREE.Group();
  scene.add(world);
  const paving = pavingTexture();
  // What moves when the slips are laid out anew: `back` and `terrace` go inland to make room for a second row,
  // `east` and `west` go out with the ends of the island, `docks` is built again.
  const group = () => { const g = new THREE.Group(); world.add(g); return g; };
  const back = group(), terrace = group(), east = group(), west = group(), docks = group();

  // ----- the ground -----
  const rock = box(world, 64, 5, 30, C.rock, 0, -2.5, -15);
  const quay = new THREE.Mesh(new THREE.PlaneGeometry(64, 30), new THREE.MeshStandardMaterial({ map: paving, roughness: 0.95 }));
  quay.rotation.x = -Math.PI / 2;
  quay.position.set(0, 0.004, -15);
  quay.receiveShadow = true;
  world.add(quay);
  const wide = [box(world, 64, 0.5, 0.7, C.stone, 0, -0.2, 0.05), box(world, 64, 2, 26, C.sand, 0, -4, 13)]; // the edge of the quay, the sea bed

  // the terrace behind the sheds, with its stairs
  box(terrace, 64, 1.6, 9, C.stoneDark, 0, 0.8, -25.5);
  box(terrace, 64, 0.12, 8.6, C.grass, 0, 1.6, -25.7);
  box(terrace, 64, 0.22, 0.5, C.stone, 0, 1.62, -21.2);
  for (let i = 0; i < 5; i++) box(back, 4, 0.32, 0.62, C.stone, 5, 0.16 + i * 0.32, -18.3 - i * 0.6);
  for (const sx of [2.75, 7.25]) box(back, 0.5, 2, 3.2, C.stoneDark, sx, 1, -19.5);

  // ----- the sea -----
  const sides = new THREE.Mesh(new THREE.BoxGeometry(63.9, 2.28, 25.95), new THREE.MeshStandardMaterial({ color: C.deep, transparent: true, opacity: 0.5, roughness: 0.3, depthWrite: false }));
  sides.position.set(0, -1.86, 13.02);
  world.add(sides);
  const seaGeo = new THREE.PlaneGeometry(64, 26, 56, 24);
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: C.water, transparent: true, opacity: 0.84, roughness: 0.22, metalness: 0.05, flatShading: true }));
  sea.position.set(0, SEA, 13);
  sea.receiveShadow = true;
  world.add(sea);
  wide.push(sides, sea);
  const seaBase = seaGeo.attributes.position.array.slice();

  // ----- the slips: as many as the board has places, built by `setDocks` -----
  const slips = [];
  const LAMP = { fresh: 0x3fcf9d, slow: 0xffb547, silent: 0xff5a4e };
  function slipAt(k, d, side) {
    const sx = d.x, dz = d.z;
    box(docks, 6.4, 0.06, 12.4, C.pad, sx, 0.03, dz - 6.3);
    for (const dx of [-1.2, 1.2]) box(docks, 0.28, 0.2, 12.4, C.woodDark, sx + dx, 0.16, dz - 6.3);
    for (const z of [-10.5, -7.5, -4.5, -1.5]) box(docks, 3.4, 0.26, 0.5, C.wood, sx, 0.16, dz + z);
    // a slip of the back row: its slipway runs to the water between two slips of the front row
    if (dz) for (const dx of [-1.2, 1.2]) box(docks, 0.28, 0.1, -dz, C.woodDark, sx + dx, 0.05, dz / 2);
    const ramp = box(docks, 5.2, 0.22, 7.4, C.wood, sx, -1.02, 3.5);
    ramp.rotation.x = 0.29;
    for (const s of [-1, 1]) {
      for (const z of [-11, -8, -5, -2]) cyl(docks, 0.09, 3.5, C.woodDark, sx + s * 3.05, 1.75, dz + z, 6);
      for (const y of [1.7, 3.3]) box(docks, 0.7, 0.08, 9.8, C.woodLight, sx + s * 3.05, y, dz - 6.5);
    }
    cyl(docks, 0.07, 1.5, C.iron, sx - 3.1, 0.75, dz - 12.3, 6);
    sign(docks, `SLIP ${k + 1}`, sx - 3.1, 1.75, dz - 12.3, { w: 1.9 });
    // the name of the ticket on the slip, and a lamp that burns while its tests run
    const label = plate(3.4, 0.64);
    label.position.set(sx, 0.36, dz + 0.12); // on the ground at the head of the slipway, facing the bay
    label.rotation.x = -0.45;
    docks.add(label);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x3a3f5c, roughness: 0.6, emissive: 0x000000 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), lampMat);
    lamp.position.set(sx - 3.1, 2.25, dz - 12.3);
    lamp.userData.own = 2;
    docks.add(lamp);
    let lit = null;
    // its crane: the classic slewing crane on a narrow foot, at the corner of the slip's head; what it
    // lifts lies stacked on the scaffold beside it
    const c = craneAt(d);
    const crane = new THREE.Group();
    crane.position.set(c.x, 0, c.z);
    docks.add(crane);
    box(crane, FOOT * 2, 0.7, FOOT * 2, C.stoneDark, 0, 0.35, 0);
    cyl(crane, 0.32, 7.4, C.iron, 0, 4.4, 0, 8, 0.24);
    const arm = new THREE.Group();
    arm.position.y = PIVOT;
    crane.add(arm);
    box(arm, 0.4, 0.4, 7.6, 0xe2b23c, 0, 0, 1.6);
    box(arm, 1.1, 1, 1.4, C.iron, 0, -0.2, -2.6);
    box(arm, 1.2, 1.1, 1.3, 0xe2b23c, 0, 0.5, 0);
    const trolley = new THREE.Group();
    arm.add(trolley);
    box(trolley, 0.5, 0.18, 0.5, C.iron, 0, -0.28, 0);
    const cable = cyl(trolley, 0.035, 1, C.iron, 0, 0, 0, 5);
    const hook = box(trolley, 0.22, 0.16, 0.22, C.iron, 0, 0, 0);
    const load = prop(trolley, 'pirate/crate', 0, 0, 0, { s: 0.8 });
    prop(docks, 'pirate/crate', c.stack.x, PLANK, c.stack.z, { s: 0.8 });
    const piece = prop(docks, 'pirate/crate', c.drop.x, 0, c.drop.z, { s: 0.8 }); // the one just set down, as it is taken into the hull
    piece.visible = false;
    const drawCrane = (state) => {
      const p = state.pose;
      arm.rotation.y = p.a;
      trolley.position.z = p.r;
      const top = p.y + CRATE.h - PIVOT, len = -0.3 - top; // from the trolley down to the top of the piece
      cable.scale.y = len;
      cable.position.y = -0.3 - len / 2;
      hook.position.y = top + 0.06;
      load.visible = p.load;
      load.position.y = p.y - PIVOT;
      load.rotation.y = -p.a; // the hook swivels: the piece keeps its bearing
      piece.visible = !!state.piece;
      if (state.piece) { piece.position.y = state.piece.y; piece.scale.setScalar(0.8 * state.piece.k); }
    };
    const spots = [];
    for (const s of [-1, 1]) for (const z of [-10, -7.5, -5, -2.5]) spots.push({ x: sx + s * side, z: dz + z, face: s < 0 ? Math.PI / 2 : -Math.PI / 2 });
    return {
      x: sx,
      z: dz - 6.4, // where a hull stands
      spots,
      drawCrane,
      label: label.userData.write,
      lamp(state) {
        if (state === lit) return;
        lit = state;
        lampMat.emissive.setHex(state ? LAMP[state] : 0x000000);
        lampMat.emissiveIntensity = state ? 1.6 : 0;
        lampMat.color.setHex(state ? LAMP[state] : 0x3a3f5c);
      },
    };
  }

  // ----- the row of sheds -----
  const S = 1.6;
  // orders: where a ticket arrives and waits (backlog)
  for (const dx of [-2, 2]) prop(back, 'pirate/structure', -24 + dx, 0, -17.6, { s: S });
  box(back, 3.4, 0.9, 1, C.wood, -24.6, 0.45, -16.6);
  box(back, 3.6, 0.1, 1.2, C.woodLight, -24.6, 0.95, -16.6);
  box(back, 2.6, 2.4, 0.5, C.woodDark, -21.6, 1.2, -19);
  const shelfSlots = [];
  for (let r = 2; r >= 0; r--) for (let k = 0; k < 4; k++) shelfSlots.push({ x: -22.5 + k * 0.6, y: 0.62 + r * 0.72, z: -18.72, z0: -18.72, ry: Math.PI / 2 });
  sign(back, 'ORDERS', -24, 3.9, -15.55);
  // drawings: where the architect is when the planner is not at work
  prop(back, 'pirate/structure-roof', -13, 0, -17.6, { s: S });
  const desk = box(back, 2.2, 0.08, 1.4, C.woodLight, -13, 1.02, -17.3);
  desk.rotation.x = 0.35;
  const sheet = box(back, 1.7, 0.02, 1.05, C.paper, -13, 1.08, -17.28);
  sheet.rotation.x = 0.35;
  for (const dx of [-0.9, 0.9]) box(back, 0.12, 0.95, 1, C.woodDark, -13 + dx, 0.47, -17.4);
  prop(back, 'pirate/barrel', -15.2, 0, -18.6, { s: 0.7 });
  for (let k = 0; k < 3; k++) { const s = scroll(); s.position.set(-15.2 + (k - 1) * 0.16, 1.05, -18.6); s.rotation.z = Math.PI / 2 - 0.2 * (k - 1); back.add(s); }
  sign(back, 'DRAWINGS', -13, 0.5, -15.3, { w: 2.6 });
  // the todo table (E3 of the showroom): the tickets lie side by side in the order they will be built;
  // in the front row what may start, in the back row, with a grey band, what waits for another ticket
  const TX = -3, TZ = -18.6;
  box(back, 7.2, 0.14, 2, C.woodLight, TX, 1, TZ);
  for (const dx of [-3.2, 3.2]) for (const dz of [-0.8, 0.8]) box(back, 0.2, 1, 0.2, C.woodDark, TX + dx, 0.5, TZ + dz);
  box(back, 7.2, 0.02, 0.06, C.woodDark, TX, 1.08, TZ);
  const row = (dz) => Array.from({ length: 8 }, (_, k) => ({ x: TX - 2.87 + k * 0.82, y: 1.19, z: TZ + dz, z0: TZ + dz, ry: Math.PI / 2 }));
  const queueSlots = row(0.5), waitSlots = row(-0.5);
  for (const dx of [-1.1, 1.1]) cyl(back, 0.07, 2.7, C.woodDark, TX + dx, 1.35, TZ - 1.5, 6);
  sign(back, 'TODO', TX, 2.75, TZ - 1.45, { w: 2.4 });
  // inspection: where the reviewer keeps the stamps
  prop(back, 'pirate/structure-fence', 12, 0, -17.6, { s: S });
  box(back, 2, 0.9, 0.9, C.wood, 12, 0.45, -17.6);
  prop(back, 'pirate/flag-high', 14.6, 0, -16, { s: 1.1 });
  sign(back, 'INSPECTION', 12, 3.9, -15.55, { w: 3.4 });
  // timber: what the shipwrights fetch
  for (const [dx, dz, ry, n] of [[0, 0, 0, 4], [2.6, -0.6, 0.4, 3], [-2.5, -0.8, -0.2, 2]]) for (let k = 0; k < n; k++) prop(back, 'pirate/platform-planks', 22 + dx, k * 0.4, -18 + dz, { ry: ry + k * 0.08 });
  prop(back, 'watercraft/cargo-pile-a', 26.5, 0, -18.5);
  sign(back, 'TIMBER', 22, 0.5, -15.6, { w: 2.2 });

  // ----- the mail pier -----
  box(west, 3, 0.22, 10.4, C.wood, -28, -0.11, 5.2);
  for (let k = 0; k < 9; k++) box(west, 3.1, 0.03, 0.06, C.woodDark, -28, 0.01, 0.6 + k * 1.15);
  for (const dx of [-1.3, 1.3]) for (const dz of [2, 6, 10]) cyl(west, 0.2, 3.4, C.woodDark, -28 + dx, -1.3, dz, 8);
  cyl(west, 0.08, 1.3, C.iron, -29.2, 0.65, 9.9, 6);
  box(west, 0.5, 0.6, 0.4, C.red, -29.2, 1.5, 9.9);
  prop(west, 'watercraft/buoy-flag', -30, SEA + 0.25, 16);
  prop(world, 'watercraft/buoy', -4, SEA + 0.25, 17.4);

  // ----- the lighthouse -----
  cyl(east, 3.6, 3.3, C.stoneDark, 28, -1.35, 3.4, 12, 3.3);
  prop(east, 'pirate/tower-complete-large', 28, 0.3, 3.4, { s: 1.2 });
  prop(east, 'pirate/rocks-a', 30.2, -2.2, 7.5, { s: 0.75, ry: 1 });
  prop(east, 'pirate/rocks-c', 24.6, -2.2, 6.3, { s: 0.7, ry: 2.2 });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 16, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0a8, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.geometry.translate(0, -8, 0);
  beam.geometry.rotateX(-Math.PI / 2);
  const lamp = new THREE.Group();
  lamp.position.set(28, 9.4, 3.4);
  lamp.add(beam);
  east.add(lamp);
  // one flag for each thing that waits for the owner, five at most
  const flags = [0, 1, 2, 3, 4].map((k) => { const f = prop(east, 'pirate/flag-high', 24.6 + k * 1.5, 0, -6.6, { s: 1.05, ry: -0.3 }); f.visible = false; return f; });

  // ----- things along the quay (the lamps, the bollards and what lies between the slips come with the slips) -----
  const clutter = [[east, 'pirate/barrel', 23.6, -10.6], [east, 'pirate/crate', 21.1, -2.6], [east, 'pirate/barrel', 22.2, -2.1], [back, 'pirate/chest', -19.6, -16.2], [west, 'pirate/crate', -29.6, -3], [west, 'pirate/barrel', -30.2, -4.4], [west, 'watercraft/cargo-container-a', -30, -9.5], [west, 'watercraft/cargo-container-b', -30, -9.5, 1.1], [back, 'pirate/crate', 17.6, -18.6], [back, 'pirate/barrel', 8.6, -19.6]];
  for (const [to, key, x, z, y = 0] of clutter) prop(to, key, x, y, z, { s: key.includes('cargo') ? 1 : 0.75, ry: rnd() * 6 });
  // a bench that looks out to sea
  box(east, 2.2, 0.12, 0.6, C.woodLight, 27.6, 0.62, -9.4);
  for (const dx of [-0.9, 0.9]) box(east, 0.14, 0.6, 0.5, C.woodDark, 27.6 + dx, 0.3, -9.4);

  // ----- the terrace -----
  const palms = ['palm-bend', 'palm-straight', 'palm-detailed-bend', 'palm-detailed-straight'];
  for (let k = 0; k < 15; k++) {
    const x = -30 + k * 4.2 + rnd() * 1.6;
    if (x > 1.5 && x < 8.5) continue;
    prop(back, `pirate/${palms[Math.floor(rnd() * 4)]}`, x, 1.66, -23.4 - rnd() * 4.6, { s: 1.15 + rnd() * 0.55, ry: rnd() * 6 });
  }
  for (let k = 0; k < 26; k++) prop(back, `pirate/${['grass', 'grass-patch', 'grass-plant'][Math.floor(rnd() * 3)]}`, -31 + rnd() * 62, 1.66, -22.2 - rnd() * 7, { s: 0.9 + rnd() * 0.8, ry: rnd() * 6 });
  for (const [key, x, z, s] of [['rocks-b', -29, -27.5, 0.8], ['rocks-c', -8, -28, 0.7], ['rocks-a', 18, -27.6, 0.75], ['rocks-c', 30, -24, 0.6]]) prop(back, `pirate/${key}`, x, 1.6, z, { s, ry: rnd() * 6 });
  prop(back, 'pirate/tower-watch', -19, 1.66, -26, { s: 1.2 });
  prop(back, 'pirate/flag-pennant', -19, 5, -26, { s: 1.2 });
  prop(back, 'pirate/patch-sand-foliage', 12, 1.62, -26, { s: 0.9 });

  // what grows on the ends of a wider island: seen when the island reaches that far
  const far = [];
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
    far.push(prop(back, `pirate/${palms[Math.floor(rnd() * 4)]}`, side * (33.5 + k * 4.1 + rnd() * 1.4), 1.66, -23.4 - rnd() * 4.6, { s: 1.15 + rnd() * 0.55, ry: rnd() * 6 }));
    for (let g = 0; g < 2; g++) far.push(prop(back, `pirate/${['grass', 'grass-patch', 'grass-plant'][Math.floor(rnd() * 3)]}`, side * (32.5 + k * 4 + rnd() * 3), 1.66, -22.2 - rnd() * 7, { s: 0.9 + rnd() * 0.8, ry: rnd() * 6 }));
  }

  // ----- what floats -----
  const afloat = [];
  const float = (key, x, z, { ry = 0, s = 1, draft = 0.42, sway = 1, to = world } = {}) => {
    const o = prop(to, key, x, SEA - draft, z, { ry, s });
    afloat.push({ o, y: SEA - draft, phase: rnd() * 6, sway });
    return o;
  };
  // the order boat: in from the open edge of the sea, alongside the pier, out past the pier's end to the other side
  const MAIL = { far: { x: -15, z: 25.4 }, in: { x: -25.4, z: 8.6, ry: 0.15 }, round: { x: -27.2, z: 13.2 }, off: { x: -31.7, z: 22.5 } };
  const mailBoat = float('pirate/boat-row-small', MAIL.far.x, MAIL.far.z, { draft: 0.2, to: west });
  mailBoat.visible = false; // there is a boat only while it brings orders
  const mailCrate = prop(mailBoat, 'pirate/crate', 0, 0.22, 0, { s: 0.45 });
  float('watercraft/boat-fishing-small', 28.5, 13.5, { ry: 2.2, draft: 0.3, to: east });
  float('watercraft/boat-tow-a', 21.5, 4.6, { ry: Math.PI / 2, draft: 0.4, to: east });
  float('watercraft/boat-sail-a', 29, 23.5, { ry: 0.7, draft: 0.3, to: east });
  const tug = float('watercraft/boat-tug-a', 0, 15, { draft: 0.32 });
  // where landed ships lie at anchor, newest four
  const anchors = [-21, -9, 3, 15].map((x) => ({ x, z: 21.6, ry: Math.PI / 2 }));

  // Moves over time, each a promise: { o, from, to, t, secs, done }.
  const moves = [];
  const ease = (k) => k * k * (3 - 2 * k);
  function move(o, to, secs) {
    const old = moves.findIndex((m) => m.o === o);
    if (old >= 0) moves.splice(old, 1)[0].done();
    return new Promise((done) => {
      const from = { x: o.position.x, y: o.position.y, z: o.position.z, ry: o.rotation.y, s: o.scale.x };
      const goal = { ...from, ...to };
      // turn the short way round
      goal.ry = from.ry + Math.atan2(Math.sin(goal.ry - from.ry), Math.cos(goal.ry - from.ry));
      moves.push({ o, from, to: goal, t: 0, secs, done });
    });
  }

  // Fades: a thing that goes out of sight slowly. It gets materials of its own, so nothing else fades.
  const fades = [];
  function fade(o, secs) {
    return new Promise((done) => {
      const mats = [];
      o.traverse((n) => {
        if (!n.isMesh) return;
        const own = (Array.isArray(n.material) ? n.material : [n.material]).map((m) => {
          const c = m.clone();
          c.transparent = true;
          c.depthWrite = false;
          mats.push(c);
          return c;
        });
        n.material = Array.isArray(n.material) ? own : own[0];
        n.castShadow = false;
      });
      fades.push({ o, mats, from: mats.map((m) => m.opacity), t: 0, secs, done });
    });
  }

  // Where people stand: [x, z, the way they face, what they move with] in the yard of four slips.
  const HOME = {
    pierEnd: [-28, 8.8, 0, west],
    orders: [-24.6, -15.4, Math.PI, back],
    shelf: [-21.6, -17.6, Math.PI, back],
    reading: [-19.8, -17.4, -2.2, back], // beside the order board, clear of the roof: whoever reads there is seen
    drafting: [-13, -16.1, Math.PI, back],
    queue: [-3, -17.05, Math.PI, back],
    inspection: [12, -16.3, Math.PI, back],
    timber: [22, -16.2, Math.PI, back],
    mooring: [21.5, -5.3, 0, east], // by the tow boat: where the crane operator is when no ship is due to land
    lighthouse: [27.6, -1.4, 0, east],
    bench: [27.6, -9.3, 0, east],
    edge: [0, -1.6, 0, null], // beside the first slip: set by `setDocks`
    walk: [0, STREET, 0, null],
  };
  const stations = Object.fromEntries(Object.entries(HOME).map(([key, [x, z, face]]) => [key, { x, z, face }]));

  // Lay the yard out for `n` slips. Everything keeps its place in its own part of the yard; the parts move.
  function setDocks(n) {
    const Y = yardOf(n);
    const wx = Y.half / 32, wz = (30 + Y.deep) / 30;
    back.position.z = terrace.position.z = -Y.deep;
    east.position.x = Y.east;
    west.position.x = -Y.east;
    terrace.scale.x = wx;
    for (const m of wide) m.scale.x = wx;
    rock.scale.set(wx, 1, wz);
    quay.scale.set(wx, wz, 1);
    rock.position.z = quay.position.z = -15 * wz;
    paving.repeat.set(8 * wx, 3.75 * wz);
    for (const o of far) o.visible = Math.abs(o.position.x) < Y.half - 1.2;
    raze(docks);
    slips.length = 0;
    Y.docks.forEach((d, k) => slips.push(slipAt(k, d, Y.side)));
    // every slip has its crane; one that was there keeps doing what it did, wherever its slip now stands
    while (cranes.length < slips.length) cranes.push(new Crane());
    while (cranes.length > slips.length) cranes.pop().retire();
    slips.forEach((s, k) => s.drawCrane(cranes[k]));
    // lamps at the ends of the front row, and between its slips where there is room (in two rows a slipway runs there)
    const lampAt = (lx) => {
      cyl(docks, 0.09, 3.4, C.iron, lx, 1.7, -12.4, 6);
      box(docks, 0.34, 0.4, 0.34, 0xffe2a0, lx, 3.55, -12.4, { emissive: 0xffc860, emissiveIntensity: 0.9 });
      box(docks, 0.5, 0.08, 0.5, C.iron, lx, 3.8, -12.4);
    };
    const row = Y.docks.slice(0, Y.front);
    lampAt(row[0].x - 5);
    lampAt(row[row.length - 1].x + 4.6);
    if (!Y.back && Y.pitch >= 9.3) row.slice(1).forEach((d, k) => {
      const mx = d.x - Y.pitch / 2;
      lampAt(mx);
      prop(docks, k % 2 ? 'pirate/crate-bottles' : 'pirate/barrel', mx - 0.35, 0, -11.3, { s: 0.75, ry: k * 2.1 });
      if (!(k % 2)) prop(docks, 'pirate/crate', mx + 0.25, 0, -10.3, { s: 0.75, ry: k * 1.3 + 0.5 });
    });
    for (let bx = 2 - Math.floor(Y.half); bx <= Y.half - 2; bx += 4) if (!Y.docks.some((d) => Math.abs(bx - d.x) < 3.2) && Math.abs(bx - Y.pier.x) > 2) cyl(docks, 0.22, 0.55, C.iron, bx, 0.27, -0.7, 8, 0.16);
    for (const [key, [x, z, , part]] of Object.entries(HOME)) {
      stations[key].x = x + (part === east ? Y.east : part === west ? -Y.east : 0);
      stations[key].z = z - (part === back ? Y.deep : 0);
    }
    stations.edge.x = row[0].x - 4.6;
    for (const slot of [...shelfSlots, ...queueSlots, ...waitSlots]) slot.z = slot.z0 - Y.deep;
    WAYS.back = STREET - Y.deep;
    WAYS.cross = Y.cross;
    Object.assign(BOUNDS, { x0: -Y.half, x1: Y.half, z0: -30 - Y.deep });
    api.yard = Y;
    api.rev++;
  }

  const towards = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  const cranes = []; // one for each slip, in their order (crane.js); the director says what each is to do
  function update(t, dt) {
    const p = seaGeo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = seaBase[i], z = seaBase[i + 2];
      const edge = Math.min(1, (32 - Math.abs(x)) / 3, (13 - Math.abs(z)) / 2);
      p[i + 1] = edge * (Math.sin(x * 0.55 + t * 1.1) * 0.09 + Math.sin(z * 0.8 - t * 0.8 + x * 0.2) * 0.07);
    }
    seaGeo.attributes.position.needsUpdate = true;
    for (const f of afloat) {
      f.o.position.y = f.y + Math.sin(t * 1.1 + f.phase) * 0.06 * f.sway;
      f.o.rotation.z = Math.sin(t * 0.9 + f.phase) * 0.035 * f.sway;
      f.o.rotation.x = Math.sin(t * 0.7 + f.phase * 2) * 0.02 * f.sway;
    }
    // the tug goes round the bay
    const a = t * 0.09;
    tug.position.x = 6 + Math.cos(a) * 13;
    tug.position.z = 14.6 + Math.sin(a) * 2.2;
    tug.rotation.y = Math.atan2(-Math.sin(a) * 13, Math.cos(a) * 2.2);
    for (let i = fades.length - 1; i >= 0; i--) {
      const f = fades[i];
      f.t = Math.min(1, f.t + dt / f.secs);
      f.mats.forEach((m, j) => { m.opacity = f.from[j] * (1 - ease(f.t)); });
      if (f.t >= 1) { fades.splice(i, 1); for (const m of f.mats) m.dispose(); f.done(); }
    }
    for (let i = moves.length - 1; i >= 0; i--) {
      const m = moves[i];
      m.t = Math.min(1, m.t + dt / m.secs);
      const k = ease(m.t), mix = (key) => m.from[key] + (m.to[key] - m.from[key]) * k;
      m.o.position.x = mix('x');
      m.o.position.z = mix('z');
      if (!afloat.some((f) => f.o === m.o)) m.o.position.y = mix('y');
      m.o.rotation.y = mix('ry');
      m.o.scale.setScalar(mix('s'));
      if (m.t >= 1) { moves.splice(i, 1); m.done(); }
    }
    cranes.forEach((c, k) => { c.step(dt); slips[k].drawCrane(c); });
    lamp.rotation.y = t * 0.5;
  }

  const api = {
    stations, slips, shelfSlots, queueSlots, waitSlots, anchors, cranes, update, move, fade, setDocks,
    yard: null, // how it is laid out now (`yardOf`)
    rev: 0, // goes up with every new layout
    make: { scroll, plank, crate: () => { const o = spawn('pirate/crate'); o.scale.setScalar(0.5); return o; }, ship: makeShip, anchor: makeAnchor },
    sea: SEA,
    floatOn(o, draft, sway = 0.5) { afloat.push({ o, y: SEA - draft, phase: rnd() * 6, sway }); },
    floatOff(o) { const i = afloat.findIndex((f) => f.o === o); if (i >= 0) afloat.splice(i, 1); },
    setFlags(n) { flags.forEach((f, k) => { f.visible = k < n; }); },
    // The order boat. `mailIn` resolves when it lies at the pier, `mailOut` when it is gone from
    // sight; `mailTake` empties it. `pace` is how many times faster than usual it goes.
    async mailIn(pace = 1) {
      const { far, in: at } = MAIL;
      mailBoat.position.x = far.x;
      mailBoat.position.z = far.z;
      mailBoat.rotation.y = towards(far, at);
      mailBoat.scale.setScalar(0.02);
      mailBoat.visible = mailCrate.visible = true;
      await move(mailBoat, { x: -23.6, z: 12.6, s: 1 }, 8 / pace);
      await move(mailBoat, at, 3 / pace);
    },
    mailTake() { mailCrate.visible = false; },
    async mailOut(pace = 1) {
      const { in: at, round, off } = MAIL;
      await move(mailBoat, { ...round, ry: towards(at, round) }, 3.5 / pace);
      await move(mailBoat, { ry: towards(round, off) }, 1.2 / pace);
      await move(mailBoat, { ...off, s: 0.02 }, 7 / pace);
      mailBoat.visible = false;
    },
  };
  setDocks(4);
  return api;
}

// From one place on the quay to another: straight along a lane, across by the street. With two rows of slips
// there are two streets, one behind each row; from one to the other one walks between the slips of the back row.
const streetOf = (p) => (WAYS.back !== STREET && p.z < STREET - 1 ? WAYS.back : STREET);
export function route(from, to, lane = 0) {
  const a = streetOf(from) + lane, b = streetOf(to) + lane;
  const pts = [];
  if (a === b) {
    if (Math.abs(from.x - to.x) < 0.5) return [to];
    if (Math.abs(from.z - a) > 0.7) pts.push({ x: from.x, z: a });
    if (Math.abs(to.z - a) > 0.7) pts.push({ x: to.x, z: a });
  } else {
    const cost = (x) => Math.abs(from.x - x) + Math.abs(to.x - x);
    const cx = WAYS.cross.reduce((best, x) => (cost(x) < cost(best) ? x : best), WAYS.cross[0]) + lane;
    if (Math.abs(from.z - a) > 0.7) pts.push({ x: from.x, z: a });
    pts.push({ x: cx, z: a }, { x: cx, z: b });
    if (Math.abs(to.z - b) > 0.7) pts.push({ x: to.x, z: b });
  }
  pts.push(to);
  return pts;
}
