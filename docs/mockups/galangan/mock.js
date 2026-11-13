// A showroom, not the yard: every candidate shape stands on the floor with a
// code on a plate in front of it, so the owner can choose by pointing.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const $ = (s) => document.querySelector(s);
const YARD = '../../../viewer/web/space/kits/'; // what the yard already ships
const MORE = './kits/'; // candidates only this mockup has

// ----- models -----
const loader = new GLTFLoader();
const loaded = new Map();
const kitMat = new Map();
async function load(key, base) {
  const gltf = await loader.loadAsync(`${base}${key}.glb`);
  const kit = key.split('/')[0];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (!kitMat.has(kit)) { o.material.metalness = 0; o.material.roughness = 0.85; kitMat.set(kit, o.material); }
    o.material = kitMat.get(kit);
    o.castShadow = o.receiveShadow = true;
  });
  loaded.set(key, gltf);
}
const spawn = (key) => (key.startsWith('people/') ? cloneSkinned(loaded.get(key).scene) : loaded.get(key).scene.clone(true));

const USED = ['male-c', 'male-e', 'worker', 'male-b', 'male-f', 'female-c', 'male-a', 'female-d', 'female-b', 'male-g'];
const ROLE = ['Courier', 'Draughtsman', 'Foreman', 'Shipwright 1', 'Shipwright 2', 'Shipwright 3', 'Shipwright 4', 'Inspector', 'Crane operator', 'Keeper'];
const SPARE = ['male-d', 'female-a', 'female-e', 'female-f', 'soldier', 'raider', 'knight', 'robot', 'alien', 'zombie'];
const FROM_YARD = [...USED.map((n) => `people/character-${n}`), 'pirate/ship-small', 'pirate/ship-medium', 'pirate/ship-large', 'pirate/crate', 'pirate/barrel', 'pirate/boat-row-small', 'pirate/tower-complete-large', 'pirate/flag-high', 'pirate/flag-pennant', 'pirate/structure', 'pirate/platform-planks', 'watercraft/boat-tug-a', 'watercraft/boat-tow-a', 'watercraft/boat-sail-a', 'watercraft/boat-fishing-small'];
const FROM_MOCK = [...SPARE.map((n) => `people/character-${n}`), 'pirate/ship-pirate-small', 'pirate/ship-pirate-medium', 'pirate/ship-pirate-large', 'pirate/ship-ghost', 'pirate/ship-wreck', 'pirate/mast', 'pirate/chest', 'watercraft/boat-tug-b', 'watercraft/boat-tug-c', 'watercraft/boat-tow-b', 'watercraft/boat-sail-b', 'watercraft/boat-speed-a'];

// ----- scene -----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('#stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x191b2c);
scene.add(new THREE.HemisphereLight(0xd5e6ff, 0x8f84bd, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.7);
sun.position.set(-40, 90, 130);
sun.target.position.set(0, 0, 70);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(4096);
Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 420 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(26, 1, 1, 900);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.screenSpacePanning = false;
controls.maxPolarAngle = 1.5;
const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
resize();
addEventListener('resize', resize);

const C = { stone: 0xcbc5da, stoneDark: 0xa9a2c2, wood: 0xb0703f, woodDark: 0x8a5230, woodLight: 0xd29a62, paper: 0xfbf6e8, iron: 0x4b4f6b, red: 0xd9503f, yellow: 0xe2b23c, green: 0x2f6b5a, black: 0x2a2c3a, roof: 0xc0563f, water: 0x2b86e0 };
const mats = new Map();
const mat = (color, opts = {}) => { const k = `${color}${JSON.stringify(opts)}`; if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts })); return mats.get(k); };
function box(p, w, h, d, color, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; p.add(m); return m; }
function cyl(p, r, h, color, x = 0, y = 0, z = 0, seg = 12, r2 = r) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), mat(color)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; p.add(m); return m; }
// a beam from one point to another
function beam(p, a, b, t, color) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = box(p, t, t, A.distanceTo(B), color);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), B.clone().sub(A).normalize()); // in the parent's own space
  return m;
}
function group(x, z, parent = scene) { const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g); return g; }

const floor = new THREE.Mesh(new THREE.PlaneGeometry(190, 250), mat(0x3a3d5c));
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, -0.02, 68);
floor.receiveShadow = true;
scene.add(floor);

function plate(text, x, z, { w = 5, sub = '' } = {}) {
  const [code, ...rest] = text.split('  ');
  const name = rest.join(' ');
  const c = document.createElement('canvas');
  c.width = 640; c.height = 330;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf6e8';
  g.fillRect(0, 0, c.width, c.height);
  g.textBaseline = 'middle';
  g.fillStyle = '#1e7bd6';
  g.font = '600 104px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
  g.fillText(code, 18, 66);
  g.fillStyle = '#172033';
  g.font = '500 62px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
  const lines = [];
  for (const word of name.split(' ')) { const last = lines[lines.length - 1]; if (last !== undefined && g.measureText(`${last} ${word}`).width < 600) lines[lines.length - 1] = `${last} ${word}`; else lines.push(word); }
  lines.slice(0, 2).forEach((l, i) => g.fillText(l, 18, 162 + i * 68));
  if (sub) { g.font = '400 40px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif'; g.fillStyle = '#5b6680'; g.fillText(sub, 18, 162 + Math.min(lines.length, 2) * 68); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  w = Math.max(3.7, w * 0.8);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * c.height / c.width), new THREE.MeshBasicMaterial({ map: tex }));
  m.rotation.x = -1.05;
  m.position.set(x, 0.6, z);
  scene.add(m);
}
function heading(text, x, z) {
  const c = document.createElement('canvas');
  c.width = 1400; c.height = 150;
  const g = c.getContext('2d');
  g.fillStyle = '#e3e9f5';
  g.font = '600 96px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 80);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(28, 3), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x + 14, 0.02, z);
  scene.add(m);
}

const spin = []; // { o, speed, swing }
const mixers = [];
const people = [];
const bob = [];
const puffs = [];

// ----- A: cranes, all of them turning -----
function load_on(arm, x, y, z, drop) {
  cyl(arm, 0.035, drop, C.black, x, y - drop / 2, z, 5);
  const c = spawn('pirate/crate');
  c.scale.setScalar(0.8);
  c.position.set(x, y - drop - 0.6, z);
  arm.add(c);
}
const CRANES = [
  ['A1', 'Tiang baja (yang sekarang)', (g) => {
    box(g, 2.4, 0.7, 2.4, C.stoneDark, 0, 0.35, 0);
    cyl(g, 0.32, 7.4, C.iron, 0, 4.4, 0, 8, 0.24);
    const arm = group(0, 0, g); arm.position.y = 7.8;
    box(arm, 0.4, 0.4, 7.6, C.yellow, 0, 0, 1.6);
    box(arm, 1.1, 1, 1.4, C.iron, 0, -0.2, -2.6);
    box(arm, 1.2, 1.1, 1.3, C.yellow, 0, 0.5, 0);
    load_on(arm, 0, 0, 5, 4);
    return arm;
  }],
  ['A2', 'Kran kayu berumah (abad pertengahan)', (g) => {
    cyl(g, 2.3, 0.6, C.stoneDark, 0, 0.3, 0, 10);
    const arm = group(0, 0, g);
    cyl(arm, 1.75, 3.6, C.wood, 0, 2.4, 0, 8, 1.55);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; cyl(arm, 0.09, 3.6, C.woodDark, Math.sin(a) * 1.68, 2.4, Math.cos(a) * 1.68, 5); }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.25, 2.1, 8), mat(C.roof));
    roof.position.y = 5.25; roof.castShadow = true; arm.add(roof);
    box(arm, 0.7, 1.2, 0.1, C.black, 0, 1.3, 1.72);
    for (const dx of [-0.38, 0.38]) beam(arm, [dx, 3.6, 1.2], [dx * 0.4, 7.6, 6.2], 0.3, C.woodDark);
    beam(arm, [0, 5.4, 1.4], [0, 6.2, 4.4], 0.2, C.woodLight);
    cyl(arm, 0.5, 0.36, C.woodLight, 0, 7.5, 6.1, 10).rotation.z = Math.PI / 2;
    load_on(arm, 0, 7.5, 6.2, 4.6);
    return arm;
  }],
  ['A3', 'Derek tiang kayu dengan tali', (g) => {
    for (const r of [0, Math.PI / 2]) box(g, 4.4, 0.4, 0.5, C.woodDark, 0, 0.2, 0).rotation.y = r;
    const arm = group(0, 0, g);
    cyl(arm, 0.24, 7.6, C.wood, 0, 4, 0, 8, 0.18);
    beam(arm, [0, 1.2, 0.2], [0, 6.4, 6], 0.3, C.woodLight);
    beam(arm, [0, 7.7, 0], [0, 6.5, 6], 0.06, C.paper);
    beam(arm, [0, 7.7, 0], [0, 3.6, 2.6], 0.06, C.paper);
    cyl(arm, 0.42, 0.5, C.woodDark, 0, 1.5, -0.55, 10).rotation.z = Math.PI / 2;
    load_on(arm, 0, 6.3, 6, 3.6);
    // stays to the ground, which do not turn
    for (const [x, z] of [[-3.2, -3], [3.2, -3]]) beam(g, [0, 7.7, 0], [x, 0, z], 0.05, C.paper);
    return arm;
  }],
  ['A4', 'Derek besi leher angsa (era Victoria)', (g) => {
    cyl(g, 1.7, 0.9, C.stone, 0, 0.45, 0, 8);
    cyl(g, 1.35, 0.3, C.stoneDark, 0, 1.05, 0, 8);
    const arm = group(0, 0, g);
    cyl(arm, 0.5, 2.4, C.green, 0, 2.4, 0, 10, 0.36);
    const pts = [[0, 3.4, 0], [0, 5.4, 0.7], [0, 6.9, 2.1], [0, 7.6, 3.9], [0, 7.5, 5.6]];
    for (let i = 0; i < pts.length - 1; i++) beam(arm, pts[i], pts[i + 1], 0.42 - i * 0.05, C.green);
    beam(arm, [0, 2.2, 0.3], [0, 6.2, 2.4], 0.14, C.black);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.09, 6, 18), mat(C.black));
    wheel.position.set(0.55, 2.6, 0); wheel.rotation.y = Math.PI / 2; arm.add(wheel);
    cyl(arm, 0.06, 1.5, C.black, 0.55, 2.6, 0, 5).rotation.x = Math.PI / 2;
    cyl(arm, 0.06, 1.5, C.black, 0.55, 2.6, 0, 5);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), mat(C.black));
    ball.position.set(0, 3, -1.5); ball.castShadow = true; arm.add(ball);
    beam(arm, [0, 3, 0], [0, 3, -1.4], 0.2, C.green);
    load_on(arm, 0, 7.4, 5.6, 4.3);
    return arm;
  }],
  ['A5', 'Derek uap beroda dengan cerobong', (g) => {
    box(g, 3.2, 0.5, 3.6, C.black, 0, 0.75, 0);
    for (const [x, z] of [[-1.4, -1.2], [1.4, -1.2], [-1.4, 1.2], [1.4, 1.2]]) cyl(g, 0.5, 0.3, C.iron, x * 1.12, 0.5, z, 12).rotation.z = Math.PI / 2;
    const arm = group(0, 0, g); arm.position.y = 1;
    cyl(arm, 1.3, 0.3, C.iron, 0, 0.15, 0, 12);
    box(arm, 2.3, 2.3, 2.5, C.red, 0, 1.5, -0.5);
    box(arm, 2.7, 0.2, 2.9, C.black, 0, 2.75, -0.5);
    box(arm, 1.2, 0.8, 0.06, 0xbfe3ff, 0, 1.9, 0.78);
    cyl(arm, 0.3, 2.4, C.black, 0.6, 3.9, -1.2, 10, 0.24);
    cyl(arm, 0.6, 1.6, C.iron, -0.5, 1.2, -1.2, 10).rotation.x = Math.PI / 2;
    for (const dx of [-0.45, 0.45]) beam(arm, [dx, 0.6, 0.8], [dx * 0.3, 6.6, 6.6], 0.14, C.yellow);
    for (let k = 1; k < 7; k++) { const f = k / 7; beam(arm, [-0.45 + 0.315 * f, 0.6 + 6 * f, 0.8 + 5.8 * f], [0.45 - 0.315 * f, 0.6 + 6 * (f + 0.07), 0.8 + 5.8 * (f + 0.07)], 0.08, C.yellow); }
    beam(arm, [0, 2.9, -0.4], [0, 6.6, 6.6], 0.05, C.black);
    load_on(arm, 0, 6.5, 6.6, 4.4);
    for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0xdfe3ee, transparent: true, opacity: 0.7, roughness: 1 })); arm.add(s); puffs.push({ o: s, phase: k / 4, x: 0.6, y: 5.2, z: -1.2 }); }
    return arm;
  }],
];

// ----- C, D: ships -----
function makeShip(key, { sail = 0xffffff, flag = null, hull = 0xffffff, build = 1, rigged = true, s = 1 } = {}) {
  const o = spawn(`pirate/${key}`);
  o.scale.setScalar(s);
  const base = kitMat.get('pirate');
  const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e3);
  const mk = (color) => { const m = base.clone(); m.color.setHex(color); m.side = THREE.DoubleSide; m.clippingPlanes = [cut]; m.clipShadows = true; m.shadowSide = THREE.BackSide; return m; };
  const mHull = mk(hull), mSail = mk(sail), mFlag = mk(flag ?? sail);
  o.traverse((n) => { if (n.isMesh) n.material = mHull; });
  o.traverse((n) => {
    const kind = /^sail/.test(n.name) ? mSail : /^flag/.test(n.name) ? mFlag : null;
    if (!kind) return;
    n.visible = rigged;
    n.traverse((m) => { if (m.isMesh) m.material = kind; });
  });
  if (build < 1) cut.constant = s * (build < 0.7 ? 0.25 + (build / 0.7) * 3.6 : 3.85 + ((build - 0.7) / 0.3) * 6.4);
  return o;
}
const SAIL = { putih: 0xffffff, merah: 0xff6a5a, biru: 0x6fb4ff, kuning: 0xffd75a, hijau: 0x7ddc8f, jingga: 0xffa257, ungu: 0xc49bff, toska: 0x5fe0d2 };
const SHIPS = [
  ['C1', 'ship-small', 'putih', 'Kecil · layar putih'], ['C2', 'ship-small', 'merah', 'Kecil · layar merah'], ['C3', 'ship-small', 'toska', 'Kecil · layar toska'],
  ['C4', 'ship-medium', 'kuning', 'Sedang · layar kuning'], ['C5', 'ship-medium', 'biru', 'Sedang · layar biru'], ['C6', 'ship-medium', 'hijau', 'Sedang · layar hijau'],
  ['C7', 'ship-large', 'putih', 'Besar · layar putih'], ['C8', 'ship-large', 'jingga', 'Besar · layar jingga'],
  ['C9', 'ship-pirate-medium', 'putih', 'Sedang · layar hitam tengkorak'], ['C10', 'ship-pirate-large', 'putih', 'Besar · layar hitam tengkorak'],
];

function pond(g, r = 4.2) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 28), new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.25, transparent: true, opacity: 0.88 })); m.position.y = 0.15; m.receiveShadow = true; g.add(m); }
function scroll(p, x, y, z, ry = 0) { const g = new THREE.Group(); const a = cyl(g, 0.11, 0.62, C.paper, 0, 0, 0, 8); a.rotation.z = Math.PI / 2; const b = cyl(g, 0.118, 0.1, C.red, 0, 0, 0, 8); b.rotation.z = Math.PI / 2; g.position.set(x, y, z); g.rotation.y = ry; p.add(g); return g; }

// ----- people -----
function person(key, x, z) {
  const o = spawn(key);
  o.scale.setScalar(2.5);
  o.position.set(x, 0, z);
  scene.add(o);
  const mixer = new THREE.AnimationMixer(o);
  const actions = Object.fromEntries(loaded.get(key).animations.map((c) => [c.name, mixer.clipAction(c)]));
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  bubble.position.set(x, 3.2, z);
  bubble.scale.setScalar(1.3);
  bubble.visible = false;
  scene.add(bubble);
  const p = { o, mixer, actions, current: null, bubble };
  mixers.push(mixer);
  people.push(p);
  return p;
}
function play(name) {
  for (const p of people) {
    const next = p.actions[name];
    if (!next || next === p.current) continue;
    next.reset().fadeIn(0.2).play();
    if (p.current) p.current.fadeOut(0.2);
    p.current = next;
  }
}
const bubbles = new Map();
function bubbleTex(glyph) {
  if (!bubbles.has(glyph)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.strokeStyle = '#2a2f45'; g.lineWidth = 6;
    g.beginPath(); g.arc(64, 54, 46, 0.62 * Math.PI, 0.38 * Math.PI); g.lineTo(64, 124); g.closePath(); g.fill(); g.stroke();
    g.font = '60px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#2a2f45';
    g.fillText(glyph, 64, 58);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    bubbles.set(glyph, t);
  }
  return bubbles.get(glyph);
}
function emoji(glyph) {
  for (const p of people) { p.bubble.visible = !!glyph; if (glyph) { p.bubble.material.map = bubbleTex(glyph); p.bubble.material.needsUpdate = true; } }
}

// ----- build the showroom -----
const VIEWS = {
  all: [[0, 0, 72], 420], crane: [[0, 3, 1], 84], people: [[0, 1, 18.5], 62], ships: [[0, 3, 50], 120], parts: [[4, 3, 92], 112], other: [[-1, 2, 128], 100],
};
const NOTES = {
  all: '<b>Lima baris.</b> Tiap benda punya kode di papan kecil di depannya. Sebut kodenya untuk memilih, misalnya "derek A2, kapal C1–C8".',
  crane: '<b>A · Derek putar klasik.</b> Kelimanya berputar. A1 adalah yang sekarang. A2–A5 buatan kode, jadi warna dan ukurannya masih bisa diubah.',
  people: '<b>B · Karakter.</b> Baris depan sudah dipakai (dengan perannya). Baris belakang cadangan dari paket yang sama. Tombol di bawah memainkan gerakan dan balon emoji pada semuanya.',
  ships: '<b>C · Sepuluh kapal.</b> Tiga ukuran lambung, dua gaya (biasa dan bajak laut), warna layar dari kode. Layar hitam bertengkorak tidak bisa diwarnai.',
  parts: '<b>D · Komponen kapal.</b> D1–D4: tahap bangun satu kapal. D5–D8: warna lambung. D9–D12: bentuk lain di paket (kapal hantu, bangkai, tiang lepas).',
  other: '<b>E · Komponen lain.</b> Perahu pesanan, meja todo, papan pesanan, kapal tunda, sinyal menara, jangkar tanda ditahan.',
};
function go(name) {
  const [t, d] = VIEWS[name];
  controls.target.set(...t);
  camera.position.set(...t).add(new THREE.Vector3(0.1, 0.95, 1).normalize().multiplyScalar(camera.aspect < 1 ? d * 1.9 : d));
  $('#note').innerHTML = NOTES[name];
  for (const b of document.querySelectorAll('[data-go]')) b.setAttribute('aria-pressed', String(b.dataset.go === name));
}

function build() {
  // A
  heading('A · Derek putar klasik', -30, -9);
  CRANES.forEach(([code, name, make], i) => {
    const g = group(-24 + i * 12, 0);
    const arm = make(g);
    spin.push({ o: arm, speed: 0.25 + i * 0.03, phase: i });
    plate(`${code}  ${name}`, -24 + i * 12, 4.6, { w: 8 });
    const who = spawn('people/character-female-b'); who.scale.setScalar(2.5); who.position.set(-24 + i * 12 - 2.6, 0, 2.2); scene.add(who); // for scale
  });

  // B
  heading('B · Karakter', -30, 10.5);
  USED.forEach((n, i) => { person(`people/character-${n}`, -18 + i * 4, 15); plate(`B${i + 1}  ${ROLE[i]}`, -18 + i * 4, 17.1, { w: 3.6 }); });
  SPARE.forEach((n, i) => { person(`people/character-${n}`, -18 + i * 4, 20.5); plate(`B${i + 11}  ${n}`, -18 + i * 4, 22.6, { w: 3.6 }); });
  play('idle');

  // C
  heading('C · Sepuluh kapal', -30, 29);
  SHIPS.forEach(([code, key, sail, name], i) => {
    const x = -24 + (i % 5) * 12, z = 38 + Math.floor(i / 5) * 21;
    const g = group(x, z);
    pond(g, 5.4);
    const s = makeShip(key, { sail: SAIL[sail], s: key.endsWith('large') ? 0.8 : 0.9 });
    s.position.y = -0.45;
    g.add(s);
    bob.push({ o: s, y: -0.45, phase: i });
    plate(`${code}  ${name}`, x, z + 6.6, { w: 8 });
  });

  // D
  heading('D · Komponen kapal: tahap bangun, warna lambung, bentuk lain', -30, 74);
  [['D1', 0.1, false, 'Lunas (baru mulai)'], ['D2', 0.45, false, 'Lambung setengah'], ['D3', 1, false, 'Lambung dan tiang, tanpa layar'], ['D4', 1, true, 'Layar terpasang (lulus)']].forEach(([code, b, rig, name], i) => {
    const g = group(-27 + i * 9, 82);
    const s = makeShip('ship-medium', { build: b, rigged: rig, s: 0.72 }); s.position.y = 0.25; g.add(s);
    plate(`${code}  ${name}`, -27 + i * 9, 87.6, { w: 7 });
  });
  [['D5', 0xffffff, 'Lambung kayu asli'], ['D6', 0xc9a98a, 'Lambung gelap'], ['D7', 0xffc9b0, 'Lambung kemerahan'], ['D8', 0xb7d9ff, 'Lambung kebiruan']].forEach(([code, hull, name], i) => {
    const g = group(-27 + i * 9, 99);
    const s = makeShip('ship-small', { hull, sail: 0xffffff, s: 0.72 }); s.position.y = 0.25; g.add(s);
    plate(`${code}  ${name}`, -27 + i * 9, 104.4, { w: 7 });
  });
  [['D9', 'ship-ghost', 'Kapal hantu (hijau polos)'], ['D10', 'ship-wreck', 'Bangkai kapal'], ['D11', 'ship-pirate-small', 'Bajak laut kecil'], ['D12', 'mast', 'Tiang lepas']].forEach(([code, key, name], i) => {
    const g = group(12 + i * 9, 82);
    const s = spawn(`pirate/${key}`); s.scale.setScalar(0.72); s.position.y = key === 'mast' ? 0 : 0.25; g.add(s);
    plate(`${code}  ${name}`, 12 + i * 9, 87.6, { w: 7 });
  });

  // E
  heading('E · Komponen lain', -30, 112);
  const E = (i) => [-26 + (i % 5) * 12.5, 120 + Math.floor(i / 5) * 14];
  // E1 the order boat: a row boat with drawings in it
  { const [x, z] = E(0); const g = group(x, z); pond(g, 3.4); const b = spawn('pirate/boat-row-small'); b.position.y = 0.05; g.add(b); for (let k = 0; k < 4; k++) scroll(b, -0.3 + k * 0.2, 0.55, 0.1, 0.3 * k); bob.push({ o: b, y: 0.05, phase: 1 }); plate('E1  Perahu pesanan: perahu dayung', x, z + 4.6, { w: 8 }); }
  { const [x, z] = E(1); const g = group(x, z); pond(g, 3.4); const b = spawn('watercraft/boat-sail-b'); b.position.y = -0.1; g.add(b); for (let k = 0; k < 4; k++) scroll(b, -0.3 + k * 0.2, 0.75, -0.6, 0.3 * k); bob.push({ o: b, y: -0.1, phase: 2 }); plate('E2  Perahu pesanan: perahu layar', x, z + 4.6, { w: 8 }); }
  // E3 the todo table: ready in front, waiting behind
  { const [x, z] = E(2); const g = group(x, z); box(g, 7, 0.14, 2, C.woodLight, 0, 1, 0); for (const dx of [-3.1, 3.1]) for (const dz of [-0.8, 0.8]) box(g, 0.2, 1, 0.2, C.woodDark, dx, 0.5, dz); box(g, 7, 0.02, 0.06, C.woodDark, 0, 1.08, 0); for (let k = 0; k < 5; k++) scroll(g, -2.6 + k * 1.3, 1.2, 0.5); for (let k = 0; k < 3; k++) { const s = scroll(g, -2.6 + k * 1.3, 1.2, -0.5); s.traverse((m) => { if (m.isMesh && m.material === mat(C.red)) m.material = mat(0x8b93b0); }); } plate('E3  Meja todo', x, z + 3.2, { w: 8, sub: 'depan: siap · belakang: menunggu tiket lain' }); }
  // E4 the order board: pinned drawings
  { const [x, z] = E(3); const g = group(x, z); box(g, 5.2, 2.6, 0.16, C.woodDark, 0, 1.9, 0); box(g, 4.8, 2.2, 0.06, 0xdcc9a0, 0, 1.9, 0.1); for (const dx of [-2.4, 2.4]) cyl(g, 0.1, 3.3, C.woodDark, dx, 1.65, 0, 6); for (let k = 0; k < 7; k++) scroll(g, -1.7 + (k % 4) * 1.13, 2.45 - Math.floor(k / 4) * 1.05, 0.24); plate('E4  Papan pesanan (backlog)', x, z + 3.2, { w: 8 }); }
  // E5 tugs
  { const [x, z] = E(4); const g = group(x, z); pond(g, 4.6); ['boat-tug-a', 'boat-tug-b', 'boat-tow-a'].forEach((k, i) => { const b = spawn(`watercraft/${k}`); b.position.set(-2.6 + i * 2.6, -0.1, 0); g.add(b); bob.push({ o: b, y: -0.1, phase: i }); }); plate('E5  Kapal tunda: tiga calon', x, z + 5.6, { w: 8, sub: 'kiri ke kanan: a · b · c' }); }
  // E6 the tower with its lamp and flags
  { const [x, z] = E(5); const g = group(x, z); cyl(g, 2.6, 0.6, C.stoneDark, 0, 0.3, 0, 12); const t = spawn('pirate/tower-complete-large'); t.scale.setScalar(0.8); t.position.y = 0.6; g.add(t); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); lamp.position.y = 7.1; g.add(lamp); lampMat = lamp.material; [0xff6a5a, 0xffd75a, 0x6fb4ff, 0x7ddc8f].forEach((c, i) => { cyl(g, 0.06, 3.4, C.iron, 3.2 + i * 1, 1.7, 1, 5); const f = box(g, 0.9, 0.6, 0.05, c, 3.7 + i * 1, 3, 1); f.castShadow = true; }); plate('E6  Menara: lampu dan bendera', x, z + 4.6, { w: 8, sub: 'lampu: putih, kuning, merah · bendera per jenis' }); }
  // E7 held: an anchor and a yellow flag by the slip
  { const [x, z] = E(6); const g = group(x, z); const a = group(0, 0, g); cyl(a, 0.09, 1.8, C.black, 0, 1.3, 0, 6); cyl(a, 0.07, 1.1, C.black, 0, 2, 0, 6).rotation.z = Math.PI / 2; const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 14), mat(C.black)); ring.position.y = 2.4; a.add(ring); const arc = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.1, 6, 16, Math.PI), mat(C.black)); arc.rotation.z = Math.PI; arc.position.y = 1.15; a.add(arc); a.rotation.z = 0.25; cyl(g, 0.06, 3.4, C.iron, 1.8, 1.7, 0, 5); box(g, 0.9, 0.6, 0.05, C.yellow, 2.3, 3, 0); plate('E7  Ditahan: jangkar dan bendera kuning', x, z + 3.2, { w: 8 }); }
  // E8 the pigeon that brings the owner's answer
  { const [x, z] = E(7); const g = group(x, z); const b = group(0, 0, g); const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), mat(0xf4f6fb)); body.scale.set(0.8, 0.8, 1.3); b.add(body); const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0xf4f6fb)); head.position.set(0, 0.22, 0.4); b.add(head); const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), mat(C.yellow)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.2, 0.62); b.add(beak); const wl = box(b, 0.9, 0.05, 0.45, 0xdfe5f2, -0.55, 0.1, 0), wr = box(b, 0.9, 0.05, 0.45, 0xdfe5f2, 0.55, 0.1, 0); scroll(b, 0, -0.3, 0.1).scale.setScalar(0.6); pigeon = { b, wl, wr }; plate('E8  Merpati pembawa jawaban', x, z + 3.2, { w: 8 }); }
  // E9 the wooden scaffold of a slip, as now
  { const [x, z] = E(8); const g = group(x, z); for (const side of [-1, 1]) { for (const dz of [-3, 0, 3]) cyl(g, 0.09, 3.5, C.woodDark, side * 2.4, 1.75, dz, 6); for (const y of [1.7, 3.3]) box(g, 0.7, 0.08, 7.4, C.woodLight, side * 2.4, y, 0); } for (const dx of [-1, 1]) box(g, 0.28, 0.2, 8, C.woodDark, dx, 0.16, 0); plate('E9  Perancah dok (yang sekarang)', x, z + 5, { w: 8 }); }
  // E10 a bell on the tower's side
  { const [x, z] = E(9); const g = group(x, z); for (const dx of [-0.9, 0.9]) cyl(g, 0.1, 3, C.woodDark, dx, 1.5, 0, 6); box(g, 2.2, 0.2, 0.3, C.woodDark, 0, 3, 0); const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.55, 0.8, 12), mat(C.yellow, { metalness: 0.5, roughness: 0.4 })); bell.position.y = 2.4; bell.castShadow = true; g.add(bell); bellO = bell; plate('E10  Lonceng: perahu pesanan terlihat', x, z + 3.2, { w: 8 }); }
}
let lampMat = null, pigeon = null, bellO = null;

// ----- tools -----
function tools() {
  const anims = ['idle', 'walk', 'sprint', 'jump', 'emote-yes', 'emote-no', 'sit', 'pick-up', 'interact-right', 'attack-melee-right', 'holding-both', 'die'];
  const emojis = ['', '🥳', '❌', '❓', '😢', '✅', '💡', '😴', '🔨'];
  $('#tools').innerHTML = `<span>Gerakan karakter:</span>${anims.map((a) => `<button data-anim="${a}">${a}</button>`).join('')}<span class="sep"></span><span>Balon:</span>${emojis.map((e) => `<button data-emoji="${e}">${e || 'tanpa'}</button>`).join('')}`;
  $('#tools').addEventListener('click', (e) => {
    const a = e.target.closest('[data-anim]'); if (a) play(a.dataset.anim);
    const m = e.target.closest('[data-emoji]'); if (m) emoji(m.dataset.emoji);
  });
  document.querySelector('.bar').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });
}

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  for (const s of spin) s.o.rotation.y = Math.sin(t * s.speed + s.phase) * 1.1;
  for (const m of mixers) m.update(dt);
  for (const b of bob) { b.o.position.y = b.y + Math.sin(t * 1.1 + b.phase) * 0.05; b.o.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.03; }
  for (const p of puffs) { const k = (t * 0.35 + p.phase) % 1; p.o.position.set(p.x + k * 0.8, p.y + k * 2.6, p.z); p.o.scale.setScalar(0.5 + k * 1.2); p.o.material.opacity = 0.7 * (1 - k); }
  if (lampMat) lampMat.color.setHex([0xffffff, 0xffc04a, 0xff5a4e][Math.floor(t / 2.5) % 3]);
  if (pigeon) { pigeon.b.position.set(Math.sin(t * 0.9) * 2.4, 2.6 + Math.sin(t * 1.8) * 0.3, Math.cos(t * 0.9) * 1.6); pigeon.b.rotation.y = t * 0.9 + Math.PI / 2; const f = Math.sin(t * 14) * 0.7; pigeon.wl.rotation.z = -f; pigeon.wr.rotation.z = f; }
  if (bellO) bellO.rotation.z = Math.sin(t * 5) * 0.35;
  controls.update();
  renderer.render(scene, camera);
}

(async () => {
  try {
    await document.fonts.ready;
    await Promise.all([...FROM_YARD.map((k) => load(k, YARD)), ...FROM_MOCK.map((k) => load(k, MORE))]);
    build();
    tools();
    go('all');
    $('#loading').hidden = true;
    renderer.setAnimationLoop(frame);
    window.mock = { scene, camera, controls, go, play, emoji };
  } catch (e) {
    console.error(e);
    $('#loading').textContent = `Ruang pamer tidak bisa dibuka: ${e.message || e}`;
  }
})();
