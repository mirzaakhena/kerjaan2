// A crane at every slip, to look at before anything is built: the slips are laid out by the yard's own
// plan.js, the largest ship stands on each, a shipwright on every spot. `derek-plan.js` says where the
// cranes stand, how much room is left and how they move; this file only draws that.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { STREET, ROW } from '../../../viewer/web/space/plan.js';
import { OPTIONS, COUNTS, KINDS, SHIP, CRATE, BODY, TIGHT, layout, clearances, swing, pose, parked, stateOf } from './derek-plan.js';

const $ = (s) => document.querySelector(s);
const KITS = '../../../viewer/web/space/kits/';
const WRIGHTS = ['male-b', 'male-f', 'female-c', 'male-a']; // the yard's four shipwrights
const SEA = -0.72;

// ----- models -----
const loader = new GLTFLoader();
const loaded = new Map();
const kitMat = new Map();
async function load(key) {
  const gltf = await loader.loadAsync(`${KITS}${key}.glb`);
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
sun.position.set(-40, 90, 60);
sun.target.position.set(0, 0, -10);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(4096);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 50, bottom: -50, near: 1, far: 300 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(26, 1, 1, 900);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.screenSpacePanning = false;
controls.maxPolarAngle = 1.5;
const resize = () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  // on a wide page the numbers stand at the right: the yard is drawn that much to the left
  if (innerWidth > 1100) camera.setViewOffset(innerWidth, innerHeight, 210, 0, innerWidth, innerHeight); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
};
resize();
addEventListener('resize', resize);

const C = { pad: 0xb9b2cc, quay: 0xcbc5da, road: 0xded9ea, stoneDark: 0xa9a2c2, wood: 0xb0703f, woodDark: 0x8a5230, woodLight: 0xd29a62, iron: 0x4b4f6b, yellow: 0xe2b23c, water: 0x2b86e0, clash: 0xff5a4e, tight: 0xffb547, clear: 0x3fcf9d };
const mats = new Map();
const mat = (color, opts = {}) => { const k = `${color}${JSON.stringify(opts)}`; if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts })); return mats.get(k); };
function box(p, w, h, d, color, x = 0, y = 0, z = 0, opts) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; m.userData.own = true; p.add(m); return m; }
function cyl(p, r, h, color, x = 0, y = 0, z = 0, seg = 12, r2 = r) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), mat(color)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; m.userData.own = true; p.add(m); return m; }
function label(text, w, h, { fg = '#172033', bg = '#fbf6e8', size = 0.6 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 ${Math.round(c.height * size)}px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif`;
  g.fillText(text, c.width / 2, c.height / 2 + 2, c.width - 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: !bg, side: THREE.DoubleSide }));
  m.userData.own = true; m.userData.tex = tex;
  return m;
}

// ----- the largest ship: its outline from above, and how high its deck lies -----
const probe = { ship: null, mat: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), hull: [], decks: new Map() };
const isRig = (o) => { for (let n = o; n; n = n.parent) if (/^(sail|flag)/.test(n.name)) return true; return false; };
function measure() {
  const o = spawn('pirate/ship-large');
  o.scale.setScalar(SHIP.scale);
  o.updateMatrixWorld(true);
  const strips = new Map(), v = new THREE.Vector3(), W = 0.25;
  o.traverse((m) => {
    if (!m.isMesh) return;
    if (isRig(m)) { m.visible = false; return; }
    m.material = probe.mat;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const k = Math.floor(v.z / W);
      const s = strips.get(k) || { z0: k * W, z1: (k + 1) * W, w: 0, mast: 0 };
      if (v.y <= SHIP.cut * SHIP.scale) s.w = Math.max(s.w, Math.abs(v.x)); else s.mast = Math.max(s.mast, Math.abs(v.x));
      strips.set(k, s);
    }
  });
  probe.ship = o;
  probe.hull = [...strips.values()].sort((a, b) => a.z0 - b.z0);
}
// The first thing of the hull under the point where a load is set down, seen from just under the gunwale.
const ray = new THREE.Raycaster();
function deckAt(L, drop) {
  const d = L.Y.docks[drop.k];
  const x = drop.x - d.x, z = drop.z - d.z - SHIP.z;
  const key = `${x.toFixed(2)},${z.toFixed(2)}`;
  if (!probe.decks.has(key)) {
    ray.set(new THREE.Vector3(x, SHIP.cut * SHIP.scale - 0.02, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(probe.ship, true).filter((h) => h.object.visible)[0];
    probe.decks.set(key, SHIP.y + (hit ? hit.point.y : 1.2));
  }
  return probe.decks.get(key);
}

// ----- what is shown -----
const q = new URLSearchParams(location.search);
const state = {
  code: OPTIONS.some((o) => o.code === q.get('o')) ? q.get('o') : 'F1',
  n: COUNTS.includes(Number(q.get('n'))) ? Number(q.get('n')) : 4,
  stage: q.get('s') === 'masts' ? 'masts' : 'hull',
};
let yard = null; // the group of everything laid out
let live = null; // { L, room, sw, cranes: [{ c, arm, trolley, cable, hook, crate, set }] }
const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e3);
let shipMat = null;

function raze(g) {
  g.traverse((o) => { if (o.userData.own) { o.geometry?.dispose(); o.userData.tex?.dispose(); if (o.userData.tex) o.material.dispose(); } });
  scene.remove(g);
}

function slipAt(g, k, d) {
  const sx = d.x, dz = d.z;
  box(g, 6.4, 0.06, 12.4, C.pad, sx, 0.03, dz - 6.3);
  for (const dx of [-1.2, 1.2]) box(g, 0.28, 0.2, 12.4, C.woodDark, sx + dx, 0.16, dz - 6.3);
  for (const z of [-10.5, -7.5, -4.5, -1.5]) box(g, 3.4, 0.26, 0.5, C.wood, sx, 0.16, dz + z);
  if (dz) for (const dx of [-1.2, 1.2]) box(g, 0.28, 0.1, -dz, C.woodDark, sx + dx, 0.05, dz / 2);
  box(g, 5.2, 0.22, 7.4, C.wood, sx, -1.02, 3.5).rotation.x = 0.29;
  for (const s of [-1, 1]) {
    for (const z of [-11, -8, -5, -2]) cyl(g, 0.09, 3.5, C.woodDark, sx + s * 3.05, 1.75, dz + z, 6);
    for (const y of [1.7, 3.3]) box(g, 0.7, 0.08, 9.8, C.woodLight, sx + s * 3.05, y, dz - 6.5);
  }
  cyl(g, 0.07, 1.5, C.iron, sx - 3.1, 0.75, dz - 12.3, 6);
  const sign = label(`SLIP ${k + 1}`, 1.9, 0.48);
  sign.position.set(sx - 3.1, 1.75, dz - 12.3);
  g.add(sign);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), mat(0x3a3f5c));
  lamp.position.set(sx - 3.1, 2.25, dz - 12.3);
  lamp.userData.own = true;
  g.add(lamp);
}

function shipAt(g, d) {
  const o = spawn('pirate/ship-large');
  o.scale.setScalar(SHIP.scale);
  o.position.set(d.x, SHIP.y, d.z + SHIP.z);
  o.traverse((m) => { if (m.isMesh) m.material = shipMat; if (/^(sail|flag)/.test(m.name)) m.visible = false; });
  g.add(o);
}

function wrightAt(g, key, x, z, face) {
  const o = spawn(key);
  o.scale.setScalar(2.5);
  o.position.set(x, 0, z);
  o.rotation.y = face;
  const idle = loaded.get(key).animations.find((a) => a.name === 'idle');
  if (idle) { const mixer = new THREE.AnimationMixer(o); mixer.clipAction(idle).play(); mixer.update(0.4); } // posed once: they only stand
  g.add(o);
}

function craneAt(g, c, how) {
  const o = new THREE.Group();
  o.position.set(c.x, 0, c.z);
  g.add(o);
  // the ground it takes, in the colour of how much room is left around it
  const tile = box(g, c.foot * 2 + 0.5, 0.05, c.foot * 2 + 0.5, C[how], c.x, 0.09, c.z, { emissive: C[how], emissiveIntensity: 0.5 });
  tile.castShadow = false;
  if (how !== 'clear') {
    const flag = new THREE.Sprite(new THREE.SpriteMaterial({ map: badge(how), depthTest: false }));
    flag.position.set(c.x, 10.6, c.z);
    flag.scale.setScalar(2.4);
    flag.renderOrder = 5;
    g.add(flag);
  }
  box(o, c.foot * 2, 0.7, c.foot * 2, C.stoneDark, 0, 0.35, 0);
  cyl(o, 0.32, 7.4, C.iron, 0, 4.4, 0, 8, 0.24);
  const arm = new THREE.Group();
  arm.position.y = 7.8;
  o.add(arm);
  box(arm, 0.4, 0.4, 7.6, C.yellow, 0, 0, 1.6);
  box(arm, 1.1, 1, 1.4, C.iron, 0, -0.2, -2.6);
  box(arm, 1.2, 1.1, 1.3, C.yellow, 0, 0.5, 0);
  const trolley = new THREE.Group();
  arm.add(trolley);
  box(trolley, 0.5, 0.18, 0.5, C.iron, 0, -0.28, 0);
  const cable = cyl(trolley, 0.035, 1, C.iron, 0, 0, 0, 5);
  const hook = box(trolley, 0.22, 0.16, 0.22, C.iron);
  const crate = spawn('pirate/crate');
  crate.scale.setScalar(0.8);
  trolley.add(crate);
  const pile = spawn('pirate/crate');
  pile.scale.setScalar(0.8);
  pile.position.set(c.pile.x, 0, c.pile.z);
  g.add(pile);
  const set = spawn('pirate/crate');
  set.visible = false;
  g.add(set);
  return { c, arm, trolley, cable, hook, crate, set };
}
const badges = new Map();
function badge(how) {
  if (!badges.has(how)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = how === 'clash' ? '#e5483a' : '#f0a92e';
    g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#fff'; g.font = '700 86px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(how === 'clash' ? '✕' : '!', 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    badges.set(how, t);
  }
  return badges.get(how);
}

function build() {
  if (yard) raze(yard);
  yard = new THREE.Group();
  scene.add(yard);
  const L = layout(state.code, state.n), Y = L.Y;
  const room = clearances(L, probe.hull);
  const masts = state.stage === 'masts';
  const deck = (drop) => deckAt(L, drop);
  const sw = swing(L, probe.hull, { masts, deck });
  cut.constant = masts ? 1e3 : SHIP.y + SHIP.cut * SHIP.scale;

  // the quay, the water, the streets
  const inland = 16.5 + Y.deep;
  box(yard, Y.half * 2, 2.4, inland, C.quay, 0, -1.2, -inland / 2).castShadow = false;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.3, transparent: true, opacity: 0.9 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA, 7 - inland / 2);
  sea.userData.own = true;
  sea.receiveShadow = true;
  yard.add(sea);
  const road = (x0, x1, z0, z1) => { box(yard, x1 - x0, 0.02, z1 - z0, C.road, (x0 + x1) / 2, 0.015, (z0 + z1) / 2).castShadow = false; };
  road(-Y.half, Y.half, STREET - 0.8, STREET + 0.8);
  if (Y.back) { road(-Y.half, Y.half, STREET - ROW - 0.8, STREET - ROW + 0.8); for (const x of Y.cross) road(x - 0.8, x + 0.8, STREET - ROW, STREET); }

  Y.docks.forEach((d, k) => {
    slipAt(yard, k, d);
    shipAt(yard, d);
    let i = 0;
    for (const s of [-1, 1]) for (const z of [-10, -7.5, -5, -2.5]) wrightAt(yard, `people/character-${WRIGHTS[(k + i++) % 4]}`, d.x + s * Y.side, d.z + z, s < 0 ? Math.PI / 2 : -Math.PI / 2);
  });
  const row = Y.docks.slice(0, Y.front);
  for (const lx of [row[0].x - 5, row[row.length - 1].x + 4.6, ...(!Y.back && Y.pitch >= 9.3 ? row.slice(1).map((d) => d.x - Y.pitch / 2) : [])]) {
    cyl(yard, 0.09, 3.4, C.iron, lx, 1.7, -12.4, 6);
    box(yard, 0.34, 0.4, 0.34, 0xffe2a0, lx, 3.55, -12.4, { emissive: 0xffc860, emissiveIntensity: 0.9 });
    box(yard, 0.5, 0.08, 0.5, C.iron, lx, 3.8, -12.4);
  }

  // the option's code, on a plate by the water as in the showroom
  const plate = label(`${L.opt.code}  ${L.opt.name}`, 14, 1.5, { size: 0.56 });
  plate.rotation.x = -1.05;
  plate.position.set(row[0].x + (row[row.length - 1].x - row[0].x) / 2, 0.9, 9.6);
  yard.add(plate);

  live = { L, room, sw, deck, masts, cranes: L.cranes.map((c, i) => craneAt(yard, c, stateOf(room.per[i]))) };
  write();
}

function frame(t) {
  for (const k of live.cranes) {
    const p = live.masts ? parked() : pose(live.L, k.c, t, live.deck);
    k.arm.rotation.y = p.a;
    k.trolley.position.z = p.r;
    const top = (p.y + CRATE.h) - 7.8, len = -0.3 - top; // from the trolley down to the top of the load
    k.cable.scale.y = len;
    k.cable.position.y = -0.3 - len / 2;
    k.hook.position.y = top + 0.06;
    k.crate.visible = p.carrying;
    k.crate.position.y = p.y - 7.8;
    k.crate.rotation.y = -p.a; // the hook swivels: the load keeps its bearing
    k.set.visible = p.set > 0;
    if (p.set > 0) { k.set.position.set(p.drop.x, live.deck(p.drop), p.drop.z); k.set.scale.setScalar(0.8 * p.set); } // taken into the hull
  }
}

// ----- the numbers -----
const num = (d) => (Number.isFinite(d) ? d.toFixed(2).replace('.', ',').replace('-', '−') : '—');
const WORD = { clash: 'bersinggungan', tight: 'rapat', clear: 'lega' };
const KIND = { ship: 'kapal', worker: 'tukang di tempatnya', dock: 'landasan dok tetangga', fitting: 'perancah, papan nama, lampu', road: 'jalan tukang', crane: 'derek lain' };
const all = new Map(); // 'F1/4' -> clearances
const roomOf = (code, n) => { const k = `${code}/${n}`; if (!all.has(k)) all.set(k, clearances(layout(code, n), probe.hull)); return all.get(k); };

function write() {
  const { L, room, sw, masts } = live;
  const rows = KINDS.map((k) => { const d = room.least[k], s = Number.isFinite(d) ? stateOf(d) : 'clear'; return `<tr><td>${KIND[k]}</td><td class="n ${s}">${num(d)}</td><td class="${s}">${Number.isFinite(d) ? WORD[s] : 'jauh'}</td></tr>`; }).join('');
  const hit = room.per.filter((d) => stateOf(d) === 'clash').length;
  const verdict = room.state === 'clash' ? `✕ Bersinggungan: ${hit} dari ${L.cranes.length} derek berdiri di atas benda lain (paling dalam ${num(room.min)}). Derek itu bertanda merah.`
    : room.state === 'tight' ? `! Muat, tetapi rapat: jarak bebas terkecil ${num(room.min)} (lebih sempit dari ${num(TIGHT)}, jarak tersempit di galangan sekarang).` : `✓ Muat: jarak bebas terkecil ${num(room.min)}.`;
  const moving = masts
    ? `Tiang kapal (tinggi 9,0) lebih tinggi daripada lengan derek (7,6), jadi lengan tidak bisa lewat di atas kapal yang tiangnya sudah berdiri: semua derek berhenti menghadap laut. Jarak lengan ke tiang terdekat <b>${num(sw.mast)}</b>, ke derek tetangga <b>${num(sw.arm)}</b>.`
    : `Satu putaran penuh, diperiksa tiap 0,05 detik: lengan ke derek tetangga paling dekat <b class="${stateOf(sw.arm)}">${num(sw.arm)}</b>; muatan ke kapal lain, tukang, perancah, dan derek paling dekat <b class="${stateOf(sw.load) === 'clash' ? 'clash' : ''}">${num(sw.load)}</b>.`;
  const grid = OPTIONS.map((o) => `<tr><td title="${o.name}">${o.code}</td>${COUNTS.map((n) => { const r = roomOf(o.code, n); return `<td data-o="${o.code}" data-n="${n}" class="${r.state}${o.code === state.code && n === state.n ? ' on' : ''}">${r.state === 'clash' ? '✕' : r.state === 'tight' ? '!' : '✓'} ${num(r.min)}</td>`; }).join('')}</tr>`).join('');
  $('#note').innerHTML = `<h2>${L.opt.code} · ${L.opt.name}</h2><p>${L.opt.text} <b>${L.cranes.length} derek untuk ${L.n} dok.</b></p>
<div id="verdict" class="${room.state}">${verdict}</div>
<table><tr><th>Dari tapak derek ke</th><th>jarak bebas terkecil</th><th></th></tr>${rows}</table>
<p>${moving}</p>
<table id="grid"><tr><th>Semua pilihan</th>${COUNTS.map((n) => `<th style="text-align:center">${n} dok</th>`).join('')}</tr>${grid}</table>
<small>Angka dalam satuan galangan: landasan dok lebarnya 6,4, kapal terbesar 4,2 × 11,5. Angka negatif: sedalam itu derek masuk ke benda lain. Tukang dihitung sebagai lingkaran berjari-jari ${num(BODY)} di tiap tempat berdirinya. ${L.opt.shared ? 'Derek bersama tidak punya dok sendiri: kedua dok di sisinya ikut dihitung. ' : 'Landasan dok milik derek itu sendiri tidak dihitung. '}Palet bahan (satu peti di tanah) tidak dihitung. Derek tunggal di dekat mercusuar tidak digambar. Dok, jarak, dan dua barisnya dihitung oleh plan.js galangan yang sebenarnya.</small>`;
  for (const b of document.querySelectorAll('[data-o]:not(td)')) b.setAttribute('aria-pressed', String(b.dataset.o === state.code));
  for (const b of document.querySelectorAll('[data-n]:not(td)')) b.setAttribute('aria-pressed', String(Number(b.dataset.n) === state.n));
  for (const b of document.querySelectorAll('[data-stage]')) b.setAttribute('aria-pressed', String(b.dataset.stage === state.stage));
}

function look() {
  const Y = live.L.Y;
  const t = new THREE.Vector3(-0.75, 0, -6 - Y.deep / 2);
  const d = Math.max(105, Y.half * 3.3 + Y.deep * 1.6);
  controls.target.copy(t);
  camera.position.copy(t).add(new THREE.Vector3(0.12, 0.95, 1).normalize().multiplyScalar(camera.aspect < 1 ? d * 1.9 : d));
}

function show(next, reframe) {
  Object.assign(state, next);
  history.replaceState(null, '', `?o=${state.code}&n=${state.n}${state.stage === 'masts' ? '&s=masts' : ''}`);
  build();
  if (reframe) look();
}

function wire() {
  $('#opts').innerHTML = OPTIONS.map((o) => `<button data-o="${o.code}" title="${o.name}">${o.code}</button>`).join(' ');
  $('#counts').innerHTML = COUNTS.map((n) => `<button data-n="${n}">${n}</button>`).join(' ');
  document.addEventListener('click', (e) => {
    const cell = e.target.closest('td[data-o]');
    if (cell) return show({ code: cell.dataset.o, n: Number(cell.dataset.n) }, Number(cell.dataset.n) !== state.n);
    const o = e.target.closest('button[data-o]'); if (o) return show({ code: o.dataset.o }, false);
    const n = e.target.closest('button[data-n]'); if (n) return show({ n: Number(n.dataset.n) }, true);
    const s = e.target.closest('[data-stage]'); if (s) return show({ stage: s.dataset.stage }, false);
  });
}

const clock = new THREE.Clock();
(async () => {
  try {
    await document.fonts.ready;
    await Promise.all(['pirate/ship-large', 'pirate/crate', ...WRIGHTS.map((n) => `people/character-${n}`)].map(load));
    shipMat = kitMat.get('pirate').clone();
    Object.assign(shipMat, { side: THREE.DoubleSide, clippingPlanes: [cut], clipShadows: true, shadowSide: THREE.BackSide });
    measure();
    wire();
    build();
    look();
    $('#loading').hidden = true;
    renderer.setAnimationLoop(() => { clock.getDelta(); frame(window.mock?.hold ?? clock.elapsedTime); controls.update(); renderer.render(scene, camera); }); // `mock.hold = t` stops the yard's clock at t, to look at one moment
    window.mock = { scene, camera, controls, state, show, frame, get live() { return live; }, hull: probe.hull, roomOf };
  } catch (e) {
    console.error(e);
    $('#loading').textContent = `Mockup tidak bisa dibuka: ${e.message || e}`;
  }
})();
