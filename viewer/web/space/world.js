// The yard: a quay with four slips, a row of sheds behind them, a terrace, a
// mail pier, a crane, a lighthouse and the bay. Built once; `update` moves
// the water, the boats, the crane and the light.
//
// Axes: x runs west to east along the quay, +z is out to sea, the quay's
// surface is y = 0.
import * as THREE from 'three';
import { spawn, materialOf } from './kit.js';

export const KIT = [
  'pirate/barrel', 'pirate/crate', 'pirate/crate-bottles', 'pirate/chest', 'pirate/boat-row-small', 'pirate/flag-high', 'pirate/flag-pennant', 'pirate/palm-bend', 'pirate/palm-straight', 'pirate/palm-detailed-bend', 'pirate/palm-detailed-straight', 'pirate/patch-sand-foliage', 'pirate/platform-planks', 'pirate/rocks-a', 'pirate/rocks-b', 'pirate/rocks-c', 'pirate/ship-small', 'pirate/ship-medium', 'pirate/ship-large', 'pirate/ship-pirate-small', 'pirate/ship-pirate-medium', 'pirate/ship-pirate-large', 'pirate/structure', 'pirate/structure-roof', 'pirate/structure-fence', 'pirate/tower-complete-large', 'pirate/tower-watch', 'pirate/grass', 'pirate/grass-patch', 'pirate/grass-plant',
  'watercraft/boat-fishing-small', 'watercraft/boat-tug-a', 'watercraft/boat-tow-a', 'watercraft/boat-sail-a', 'watercraft/cargo-pile-a', 'watercraft/cargo-container-a', 'watercraft/cargo-container-b', 'watercraft/buoy', 'watercraft/buoy-flag',
];

export const BOUNDS = { x0: -32, x1: 32, z0: -30, z1: 26 };
export const STREET = -13.6; // the walkway between the sheds and the slips
export const SLIP_X = [-16.5, -6, 4.5, 15];
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
  parent.add(m);
  return m;
}
function cyl(parent, r, h, color, x, y, z, seg = 10, r2 = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
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
  parent.add(m);
  return m;
}

// A rolled drawing: what a ticket is while it is still paper.
// Made thousands of times in a day, so every one shares the same geometry.
const SHARED = {
  roll: new THREE.CylinderGeometry(0.11, 0.11, 0.62, 8).rotateZ(Math.PI / 2),
  band: new THREE.CylinderGeometry(0.118, 0.118, 0.1, 8).rotateZ(Math.PI / 2),
  plank: new THREE.BoxGeometry(1.7, 0.09, 0.3),
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

// A ticket's ship. Its size says how large the contract is, its livery (one of
// ten, `liveryOf` in plan.js) which ticket it is: eight plain hulls told apart
// by the colour of sail and flag, and two pirate hulls, whose black sail is
// drawn in the model and cannot be dyed, told apart by their flag.
// `setBuild(0..1)` shows it from the keel up: the hull stands at 0.7, the masts
// at 1. Sails and flags come with `setRigged`.
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
  return m;
}

export function buildWorld(scene) {
  const rnd = seeded(20261113);
  const world = new THREE.Group();
  scene.add(world);
  const paving = pavingTexture();

  // ----- the ground -----
  box(world, 64, 5, 30, C.rock, 0, -2.5, -15);
  const quay = new THREE.Mesh(new THREE.PlaneGeometry(64, 30), new THREE.MeshStandardMaterial({ map: paving, roughness: 0.95 }));
  paving.repeat.set(8, 3.75);
  quay.rotation.x = -Math.PI / 2;
  quay.position.set(0, 0.004, -15);
  quay.receiveShadow = true;
  world.add(quay);
  box(world, 64, 0.5, 0.7, C.stone, 0, -0.2, 0.05); // the edge of the quay
  box(world, 64, 2, 26, C.sand, 0, -4, 13); // the sea bed

  // the terrace behind the sheds, with its stairs
  box(world, 64, 1.6, 9, C.stoneDark, 0, 0.8, -25.5);
  box(world, 64, 0.12, 8.6, C.grass, 0, 1.6, -25.7);
  box(world, 64, 0.22, 0.5, C.stone, 0, 1.62, -21.2);
  for (let i = 0; i < 5; i++) box(world, 4, 0.32, 0.62, C.stone, 5, 0.16 + i * 0.32, -18.3 - i * 0.6);
  for (const sx of [2.75, 7.25]) box(world, 0.5, 2, 3.2, C.stoneDark, sx, 1, -19.5);

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
  const seaBase = seaGeo.attributes.position.array.slice();

  // ----- the slips -----
  const slips = SLIP_X.map((sx, i) => {
    box(world, 6.4, 0.06, 12.4, C.pad, sx, 0.03, -6.3);
    for (const dx of [-1.2, 1.2]) box(world, 0.28, 0.2, 12.4, C.woodDark, sx + dx, 0.16, -6.3);
    for (const dz of [-10.5, -7.5, -4.5, -1.5]) box(world, 3.4, 0.26, 0.5, C.wood, sx, 0.16, dz);
    const ramp = box(world, 5.2, 0.22, 7.4, C.wood, sx, -1.02, 3.5);
    ramp.rotation.x = 0.29;
    for (const side of [-1, 1]) {
      for (const dz of [-11, -8, -5, -2]) cyl(world, 0.09, 3.5, C.woodDark, sx + side * 3.05, 1.75, dz, 6);
      for (const y of [1.7, 3.3]) box(world, 0.7, 0.08, 9.8, C.woodLight, sx + side * 3.05, y, -6.5);
    }
    cyl(world, 0.07, 1.5, C.iron, sx - 3.1, 0.75, -12.3, 6);
    sign(world, `SLIP ${i + 1}`, sx - 3.1, 1.75, -12.3, { w: 1.9 });
    // the name of the ticket on the slip, and a lamp that burns while its tests run
    const label = plate(3.4, 0.64);
    label.position.set(sx - 4.1, 0.62, -0.95); // at the head of the ramp, facing the bay
    label.rotation.x = -0.45;
    world.add(label);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x3a3f5c, roughness: 0.6, emissive: 0x000000 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), lampMat);
    lamp.position.set(sx - 3.1, 2.25, -12.3);
    world.add(lamp);
    const LAMP = { fresh: 0x3fcf9d, slow: 0xffb547, silent: 0xff5a4e };
    let lit = null;
    const spots = [];
    for (const side of [-1, 1]) for (const dz of [-10, -7.5, -5, -2.5]) spots.push({ x: sx + side * 3.95, z: dz, face: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
    return {
      x: sx,
      spots,
      label: label.userData.write,
      lamp(state) {
        if (state === lit) return;
        lit = state;
        lampMat.emissive.setHex(state ? LAMP[state] : 0x000000);
        lampMat.emissiveIntensity = state ? 1.6 : 0;
        lampMat.color.setHex(state ? LAMP[state] : 0x3a3f5c);
      },
    };
  });

  // ----- the row of sheds -----
  const S = 1.6;
  // orders: where a ticket arrives and waits (backlog)
  for (const dx of [-2, 2]) prop(world, 'pirate/structure', -24 + dx, 0, -17.6, { s: S });
  box(world, 3.4, 0.9, 1, C.wood, -24.6, 0.45, -16.6);
  box(world, 3.6, 0.1, 1.2, C.woodLight, -24.6, 0.95, -16.6);
  box(world, 2.6, 2.4, 0.5, C.woodDark, -21.6, 1.2, -19);
  const shelfSlots = [];
  for (let r = 2; r >= 0; r--) for (let k = 0; k < 4; k++) shelfSlots.push({ x: -22.5 + k * 0.6, y: 0.62 + r * 0.72, z: -18.72, ry: Math.PI / 2 });
  sign(world, 'ORDERS', -24, 3.9, -15.55);
  // drawings: where the architect is when the planner is not at work
  prop(world, 'pirate/structure-roof', -13, 0, -17.6, { s: S });
  const desk = box(world, 2.2, 0.08, 1.4, C.woodLight, -13, 1.02, -17.3);
  desk.rotation.x = 0.35;
  const sheet = box(world, 1.7, 0.02, 1.05, C.paper, -13, 1.08, -17.28);
  sheet.rotation.x = 0.35;
  for (const dx of [-0.9, 0.9]) box(world, 0.12, 0.95, 1, C.woodDark, -13 + dx, 0.47, -17.4);
  prop(world, 'pirate/barrel', -15.2, 0, -18.6, { s: 0.7 });
  for (let k = 0; k < 3; k++) { const s = scroll(); s.position.set(-15.2 + (k - 1) * 0.16, 1.05, -18.6); s.rotation.z = Math.PI / 2 - 0.2 * (k - 1); world.add(s); }
  sign(world, 'DRAWINGS', -13, 0.5, -15.3, { w: 2.6 });
  // the todo table (E3 of the showroom): the tickets lie side by side in the order they will be built;
  // in the front row what may start, in the back row, with a grey band, what waits for another ticket
  const TX = -3, TZ = -18.6;
  box(world, 7.2, 0.14, 2, C.woodLight, TX, 1, TZ);
  for (const dx of [-3.2, 3.2]) for (const dz of [-0.8, 0.8]) box(world, 0.2, 1, 0.2, C.woodDark, TX + dx, 0.5, TZ + dz);
  box(world, 7.2, 0.02, 0.06, C.woodDark, TX, 1.08, TZ);
  const row = (dz) => Array.from({ length: 8 }, (_, k) => ({ x: TX - 2.87 + k * 0.82, y: 1.19, z: TZ + dz, ry: Math.PI / 2 }));
  const queueSlots = row(0.5), waitSlots = row(-0.5);
  for (const dx of [-1.1, 1.1]) cyl(world, 0.07, 2.7, C.woodDark, TX + dx, 1.35, TZ - 1.5, 6);
  sign(world, 'TODO', TX, 2.75, TZ - 1.45, { w: 2.4 });
  // inspection: where the reviewer keeps the stamps
  prop(world, 'pirate/structure-fence', 12, 0, -17.6, { s: S });
  box(world, 2, 0.9, 0.9, C.wood, 12, 0.45, -17.6);
  prop(world, 'pirate/flag-high', 14.6, 0, -16, { s: 1.1 });
  sign(world, 'INSPECTION', 12, 3.9, -15.55, { w: 3.4 });
  // timber: what the shipwrights fetch, and where a cancelled hull ends
  for (const [dx, dz, ry, n] of [[0, 0, 0, 4], [2.6, -0.6, 0.4, 3], [-2.5, -0.8, -0.2, 2]]) for (let k = 0; k < n; k++) prop(world, 'pirate/platform-planks', 22 + dx, k * 0.4, -18 + dz, { ry: ry + k * 0.08 });
  prop(world, 'watercraft/cargo-pile-a', 26.5, 0, -18.5);
  sign(world, 'TIMBER', 22, 0.5, -15.6, { w: 2.2 });

  // ----- the mail pier -----
  box(world, 3, 0.22, 10.4, C.wood, -28, -0.11, 5.2);
  for (let k = 0; k < 9; k++) box(world, 3.1, 0.03, 0.06, C.woodDark, -28, 0.01, 0.6 + k * 1.15);
  for (const dx of [-1.3, 1.3]) for (const dz of [2, 6, 10]) cyl(world, 0.2, 3.4, C.woodDark, -28 + dx, -1.3, dz, 8);
  cyl(world, 0.08, 1.3, C.iron, -29.2, 0.65, 9.9, 6);
  box(world, 0.5, 0.6, 0.4, C.red, -29.2, 1.5, 9.9);
  prop(world, 'watercraft/buoy-flag', -30, SEA + 0.25, 16);
  prop(world, 'watercraft/buoy', -4, SEA + 0.25, 17.4);

  // ----- the crane -----
  const crane = new THREE.Group();
  crane.position.set(21.5, 0, -3); // its jib is short enough to swing clear of the lighthouse
  world.add(crane);
  box(crane, 2.4, 0.7, 2.4, C.stoneDark, 0, 0.35, 0);
  cyl(crane, 0.32, 7.4, C.iron, 0, 4.4, 0, 8, 0.24);
  const arm = new THREE.Group();
  arm.position.y = 7.8;
  crane.add(arm);
  box(arm, 0.4, 0.4, 7.6, 0xe2b23c, 0, 0, 1.6);
  box(arm, 1.1, 1, 1.4, C.iron, 0, -0.2, -2.6);
  box(arm, 1.2, 1.1, 1.3, 0xe2b23c, 0, 0.5, 0);
  cyl(arm, 0.035, 4, C.iron, 0, -2, 5, 5);
  const load = prop(arm, 'pirate/crate', 0, -4.7, 5, { s: 0.8 });
  arm.rotation.y = 0.5;

  // ----- the lighthouse -----
  cyl(world, 3.6, 3.3, C.stoneDark, 28, -1.35, 3.4, 12, 3.3);
  prop(world, 'pirate/tower-complete-large', 28, 0.3, 3.4, { s: 1.2 });
  prop(world, 'pirate/rocks-a', 30.2, -2.2, 7.5, { s: 0.75, ry: 1 });
  prop(world, 'pirate/rocks-c', 24.6, -2.2, 6.3, { s: 0.7, ry: 2.2 });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 16, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0a8, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.geometry.translate(0, -8, 0);
  beam.geometry.rotateX(-Math.PI / 2);
  const lamp = new THREE.Group();
  lamp.position.set(28, 9.4, 3.4);
  lamp.add(beam);
  world.add(lamp);
  // one flag for each thing that waits for the owner, five at most
  const flags = [0, 1, 2, 3, 4].map((k) => { const f = prop(world, 'pirate/flag-high', 24.6 + k * 1.5, 0, -6.6, { s: 1.05, ry: -0.3 }); f.visible = false; return f; });

  // ----- things along the quay -----
  for (const lx of [-11.25, -0.75, 9.75, 19.6, -21.5]) { // between the lanes people walk
    cyl(world, 0.09, 3.4, C.iron, lx, 1.7, -12.4, 6);
    box(world, 0.34, 0.4, 0.34, 0xffe2a0, lx, 3.55, -12.4, { emissive: 0xffc860, emissiveIntensity: 0.9 });
    box(world, 0.5, 0.08, 0.5, C.iron, lx, 3.8, -12.4);
  }
  for (let bx = -30; bx <= 30; bx += 4) if (!SLIP_X.some((sx) => Math.abs(bx - sx) < 3.2) && Math.abs(bx + 28) > 2) cyl(world, 0.22, 0.55, C.iron, bx, 0.27, -0.7, 8, 0.16);
  const clutter = [['pirate/barrel', -11.6, -11.4], ['pirate/crate', -11, -10.3], ['pirate/crate-bottles', -0.9, -11.2], ['pirate/barrel', 9.4, -11.4], ['pirate/crate', 10, -10.3], ['pirate/barrel', 23.6, -10.6], ['pirate/chest', -19.6, -16.2], ['pirate/crate', -29.6, -3], ['pirate/barrel', -30.2, -4.4], ['watercraft/cargo-container-a', -30, -9.5], ['watercraft/cargo-container-b', -30, -9.5, 1.1], ['pirate/crate', 17.6, -18.6], ['pirate/barrel', 8.6, -19.6]];
  for (const [key, x, z, y = 0] of clutter) prop(world, key, x, y, z, { s: key.includes('cargo') ? 1 : 0.75, ry: rnd() * 6 });
  // a bench that looks out to sea
  box(world, 2.2, 0.12, 0.6, C.woodLight, 27.6, 0.62, -9.4);
  for (const dx of [-0.9, 0.9]) box(world, 0.14, 0.6, 0.5, C.woodDark, 27.6 + dx, 0.3, -9.4);

  // ----- the terrace -----
  const palms = ['palm-bend', 'palm-straight', 'palm-detailed-bend', 'palm-detailed-straight'];
  for (let k = 0; k < 15; k++) {
    const x = -30 + k * 4.2 + rnd() * 1.6;
    if (x > 1.5 && x < 8.5) continue;
    prop(world, `pirate/${palms[Math.floor(rnd() * 4)]}`, x, 1.66, -23.4 - rnd() * 4.6, { s: 1.15 + rnd() * 0.55, ry: rnd() * 6 });
  }
  for (let k = 0; k < 26; k++) prop(world, `pirate/${['grass', 'grass-patch', 'grass-plant'][Math.floor(rnd() * 3)]}`, -31 + rnd() * 62, 1.66, -22.2 - rnd() * 7, { s: 0.9 + rnd() * 0.8, ry: rnd() * 6 });
  for (const [key, x, z, s] of [['rocks-b', -29, -27.5, 0.8], ['rocks-c', -8, -28, 0.7], ['rocks-a', 18, -27.6, 0.75], ['rocks-c', 30, -24, 0.6]]) prop(world, `pirate/${key}`, x, 1.6, z, { s, ry: rnd() * 6 });
  prop(world, 'pirate/tower-watch', -19, 1.66, -26, { s: 1.2 });
  prop(world, 'pirate/flag-pennant', -19, 5, -26, { s: 1.2 });
  prop(world, 'pirate/patch-sand-foliage', 12, 1.62, -26, { s: 0.9 });

  // ----- what floats -----
  const afloat = [];
  const float = (key, x, z, { ry = 0, s = 1, draft = 0.42, sway = 1 } = {}) => {
    const o = prop(world, key, x, SEA - draft, z, { ry, s });
    afloat.push({ o, y: SEA - draft, phase: rnd() * 6, sway });
    return o;
  };
  const MAIL_AWAY = { x: -21, z: 15.5, ry: -2.2 }, MAIL_IN = { x: -25.4, z: 8.6, ry: 0.15 };
  const mailBoat = float('pirate/boat-row-small', MAIL_AWAY.x, MAIL_AWAY.z, { ry: MAIL_AWAY.ry, draft: 0.2 });
  float('watercraft/boat-fishing-small', 28.5, 13.5, { ry: 2.2, draft: 0.3 });
  float('watercraft/boat-tow-a', 21.5, 4.6, { ry: Math.PI / 2, draft: 0.4 });
  float('watercraft/boat-sail-a', 29, 23.5, { ry: 0.7, draft: 0.3 });
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

  const stations = {
    pierEnd: { x: -28, z: 8.8, face: 0 },
    orders: { x: -24.6, z: -15.4, face: Math.PI },
    shelf: { x: -21.6, z: -17.6, face: Math.PI },
    reading: { x: -19.8, z: -17.4, face: -2.2 }, // beside the order board, clear of the roof: whoever reads there is seen
    drafting: { x: -13, z: -16.1, face: Math.PI },
    queue: { x: -3, z: -17.05, face: Math.PI },
    inspection: { x: 12, z: -16.3, face: Math.PI },
    timber: { x: 22, z: -16.2, face: Math.PI },
    crane: { x: 21.5, z: -5.3, face: 0 },
    lighthouse: { x: 27.6, z: -1.4, face: 0 },
    bench: { x: 27.6, z: -9.3, face: 0 },
    edge: { x: -2.05, z: -1.6, face: 0 },
    walk: { x: 0, z: -13.6, face: 0 },
  };

  const craneState = { aim: 0.5 };
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
    arm.rotation.y += (craneState.aim - arm.rotation.y) * Math.min(1, dt * 0.8);
    load.rotation.y = -arm.rotation.y;
    lamp.rotation.y = t * 0.5;
  }

  return {
    stations, slips, shelfSlots, queueSlots, waitSlots, anchors, crane: craneState, update, move,
    make: { scroll, plank, ship: makeShip },
    sea: SEA,
    floatOn(o, draft, sway = 0.5) { afloat.push({ o, y: SEA - draft, phase: rnd() * 6, sway }); },
    floatOff(o) { const i = afloat.findIndex((f) => f.o === o); if (i >= 0) afloat.splice(i, 1); },
    setFlags(n) { flags.forEach((f, k) => { f.visible = k < n; }); },
    // the mail boat rows in with a new order, and out again
    mailIn: () => move(mailBoat, MAIL_IN, 5),
    mailOut: () => move(mailBoat, MAIL_AWAY, 7),
  };
}

// From one place on the quay to another: straight along a lane, across by the street.
export function route(from, to, lane = 0) {
  const sz = STREET + lane;
  if (Math.abs(from.x - to.x) < 0.5) return [to];
  const pts = [];
  if (Math.abs(from.z - sz) > 0.7) pts.push({ x: from.x, z: sz });
  if (Math.abs(to.z - sz) > 0.7) pts.push({ x: to.x, z: sz });
  pts.push(to);
  return pts;
}
