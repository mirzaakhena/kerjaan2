// The yard page: renderer, camera, the heads-up display. It reads the board
// the way the other pages do (GET, one event stream) and changes nothing.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadKit } from './kit.js';
import { KIT, BOUNDS, buildWorld } from './world.js';
import { PEOPLE, startCast } from './cast.js';
import { Director } from './director.js';
import { startDemo } from './demo.js';
import { drawFaces } from './faces.js';
import { docksOf } from './plan.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PROJECT = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
const QUERY = new URLSearchParams(location.search);
const DEMO = QUERY.has('demo');
const DEMO_DOCKS = docksOf(QUERY.get('docks')); // `?demo&docks=6`: the demo's board has that many places (4 when not said)
const STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancel'];
const HERE = `/p/${encodeURIComponent(PROJECT)}`;

$('#crumb').innerHTML = `<a href="/">k2</a><span class="sl">/</span><a href="${HERE}/">${esc(PROJECT)}</a><span class="sl">/</span>Shipyard`;
document.title = `${PROJECT} · shipyard · k2`;
$('#demo').textContent = DEMO ? 'Leave the demo' : 'Demo';
$('#demo').href = DEMO ? `${HERE}/space` : `${HERE}/space?demo`;
$('#demo-note').hidden = !DEMO;
if (DEMO) $('#demo-note').innerHTML += ` Slips: ${[1, 3, 4, 6, 7, 10].map((n) => (n === DEMO_DOCKS ? `<b>${n}</b>` : `<a href="${HERE}/space?demo&amp;docks=${n}">${n}</a>`)).join(' · ')}`;

// ----- the board -----
let D = null; // the last state read
let director = null;
function show(state, trail = null) {
  D = state;
  D.tickets = D.tickets || [];
  D.inbox = D.inbox || [];
  const n = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const t of D.tickets) if (n[t.status] !== undefined) n[t.status]++;
  $('#counts').innerHTML = STATUSES.map((s) => `<span class="ro"><i style="background:var(--${s})"></i>${s.replace('_', ' ')}<b>${n[s]}</b></span>`).join('')
    + (D.inbox.length ? `<span class="ro need"><i style="background:var(--in_progress)"></i>need you<b>${D.inbox.length}</b></span>` : '');
  problem('');
  // a fault in the yard is a fault of this page, not of the board: it is not said as one
  try { if (director) director.update(D, trail); } catch (e) { console.error('the yard:', e); }
  renderCard();
}
function problem(text) {
  $('#problem').hidden = !text;
  $('#problem').textContent = text;
}
let asking = false, again = false;
let point = null; // how far the trail has been read: the next read asks from here
async function get(what) {
  const r = await fetch(`/api${HERE}/${what}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}
// The board, then what happened since the last read. In that order: the trail
// then holds every event the state shows, and the yard plays them in turn.
// A read that fails keeps the point, so the next one misses and repeats nothing.
async function read() {
  if (asking) { again = true; return; }
  asking = true;
  try {
    const d = await get('state');
    const trail = await get(`timeline${point ? `?since=${encodeURIComponent(point)}` : ''}`).catch(() => null);
    if (trail) point = trail.point;
    show(d, trail);
  } catch (e) {
    problem(`The board cannot be read: ${e.message || e}. The yard shows what was last seen.`);
  }
  asking = false;
  if (again) { again = false; read(); }
}
let soon = 0;
function readSoon() {
  if (!soon) soon = setTimeout(() => { soon = 0; read(); }, 1000);
}
function follow_board() {
  if (DEMO) { window.k2space.demo = startDemo(show, { docks: DEMO_DOCKS }); return; }
  read();
  const es = new EventSource(`/api${HERE}/events`);
  // a stream that opens again may have missed changes: read the board afresh
  es.onopen = read;
  es.onerror = () => { problem('The viewer does not answer. The yard shows what was last seen; it reads again when the viewer is back.'); if (es.readyState === EventSource.CLOSED) setTimeout(follow_board, 3000); };
  es.addEventListener('board', read);
  es.addEventListener('live', (e) => { if (!D) return; D.live = JSON.parse(e.data); show(D); });
}

// ----- the scene -----
let world = null; // the yard, once its models are loaded
const stage = $('#stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  $('#loading').textContent = 'This browser cannot draw the yard (WebGL is not available).';
  throw e;
}
const small = Math.min(innerWidth, innerHeight) < 600;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.localClippingEnabled = true; // a hull under construction is cut off at the height built
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute('aria-label', 'The shipyard: a 3D view of the board. The people and the tickets are also listed below it.');
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x191b2c);
scene.add(new THREE.HemisphereLight(0xd5e6ff, 0x8f84bd, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.7);
sun.position.set(-28, 46, 30);
sun.target.position.set(0, 0, -4);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(small ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 190 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(26, 1, 1, 700);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.minDistance = 9;
controls.maxDistance = 520;
controls.minPolarAngle = 0.2;
controls.maxPolarAngle = 1.46;

let atHome = true; // until the viewer moves the camera, it is framed anew when the window changes
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (atHome) home();
}
// The whole yard in view, however many slips it has.
function home() {
  const Y = world && world.yard;
  const grown = Y ? Math.max(Y.half / 32, (56 + Y.deep) / 56) : 1;
  const far = (camera.aspect < 1 ? 300 : 140) * grown;
  controls.target.set(2, 0, 1 - (Y ? Y.deep / 2 : 0));
  camera.position.copy(controls.target).add(new THREE.Vector3(0.6, 0.62, 0.82).normalize().multiplyScalar(far));
  atHome = true;
}
resize();
addEventListener('resize', resize);
// The yard was laid out anew (the board has more places, or fewer): the light and the view go with it.
let laid = 0;
function relaid() {
  laid = world.rev;
  const Y = world.yard, reach = Math.max(46, Y.half + 4, (56 + Y.deep) / 2 + 12);
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach });
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.set(0, 0, -4 - Y.deep / 2);
  sun.position.set(-28, 46, 30 - Y.deep / 2);
  if (atHome) home();
}
controls.addEventListener('start', () => { atHome = false; });

// ----- following one person -----
let actors = [];
let followed = null;
let closing = 0; // the distance the camera is still moving in to
const tmp = new THREE.Vector3();

function follow(actor) {
  followed = actor;
  closing = actor ? 26 : 0;
  if (actor) atHome = false;
  for (const b of document.querySelectorAll('#roster [data-actor]')) b.setAttribute('aria-pressed', String(actors[Number(b.dataset.actor)] === followed));
  $('#doing').textContent = followed ? `Following ${followed.name}: ${followed.doing}` : '';
}
// One row per person: the face, the name, and what they are doing now. Drawn again when a shipwright comes or goes.
const faceOf = new Map();
let rosterTimer = 0;
function renderRoster() {
  const fresh = [...new Set(actors.map((a) => a.key))].filter((key) => !faceOf.has(key));
  if (fresh.length) drawFaces(fresh).forEach((url, i) => faceOf.set(fresh[i], url));
  const faces = actors.map((a) => faceOf.get(a.key));
  $('#roster').innerHTML = actors.map((a, i) => `<button class="who" data-actor="${i}" aria-pressed="false" title="Follow ${esc(a.name)}">${faces[i] ? `<img src="${faces[i]}" alt="">` : '<span class="noface"></span>'}<span class="txt"><b>${esc(a.name)}</b><small></small></span></button>`).join('');
  for (const b of document.querySelectorAll('#roster [data-actor]')) b.setAttribute('aria-pressed', String(actors[Number(b.dataset.actor)] === followed));
  renderDoing();
  if (!rosterTimer) rosterTimer = setInterval(renderDoing, 500);
}
function renderDoing() {
  document.querySelectorAll('#roster small').forEach((el, i) => { if (actors[i] && el.textContent !== actors[i].doing) el.textContent = actors[i].doing; });
}
$('#roster').addEventListener('click', (e) => {
  const b = e.target.closest('[data-actor]');
  if (!b) return;
  const a = actors[Number(b.dataset.actor)];
  follow(a === followed ? null : a);
});
$('#home').addEventListener('click', () => { follow(null); home(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') { follow(null); openCard(null); } });
renderer.domElement.addEventListener('wheel', () => { closing = 0; atHome = false; }, { passive: true });

// ----- the ticket behind a ship or a drawing -----
let carded = null;
function openCard(id) {
  carded = id;
  renderCard();
}
function renderCard() {
  const p = carded && director && director.pic ? director.pic.byId.get(carded) : null;
  $('#card').hidden = !p;
  if (!p) return;
  const lines = [];
  if (p.worker !== 'away') lines.push(p.worker === 'stuck' ? 'its worker is stuck' : `worker at work${p.step ? `: ${p.step}` : ''}`);
  if (p.reviewer !== 'away') lines.push(p.reviewer === 'stuck' ? 'its reviewer is stuck' : `reviewer at work${p.step ? `: ${p.step}` : ''}`);
  if (p.testing) lines.push('tests running');
  if (p.asked) lines.push('a question waits for you');
  if (p.rigged && p.status === 'review') lines.push(p.held ? 'passed, held' : p.merge >= 0 ? `passed · merge queue no. ${p.merge + 1}` : 'passed');
  if (p.rejected) lines.push(`sent back ${p.rejected}×`);
  const html = `<div class="card-head"><span class="ro"><i style="background:var(--${esc(p.status)})"></i>${esc(p.status.replace('_', ' '))}</span><span class="tid">${esc(p.id.slice(0, 8))}<b>${esc(p.id.slice(8))}</b></span><button class="chip" id="card-close" aria-label="Close">×</button></div>
    <h2>${esc(p.title)}</h2>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    ${DEMO ? '<p class="dim">A made-up ticket of the demo.</p>' : `<a href="${HERE}/?t=${encodeURIComponent(p.id)}">Open the ticket</a>`}`;
  if ($('#card').dataset.html !== html) { $('#card').innerHTML = html; $('#card').dataset.html = html; }
}
$('#card').addEventListener('click', (e) => { if (e.target.closest('#card-close')) openCard(null); });

// A click that did not drag picks the person, or the ticket, under it.
const ray = new THREE.Raycaster();
const aim = (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
};
const personAt = () => ray.intersectObjects(actors.map((a) => a.hit), false)[0]?.object.userData.actor || null;
function ticketAt() {
  if (!director) return null;
  let o = ray.intersectObjects(director.pickables(), true)[0]?.object;
  while (o && !o.userData.ticket) o = o.parent;
  return o ? o.userData.ticket : null;
}
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  aim(e);
  const person = personAt();
  if (person) return follow(person);
  openCard(ticketAt());
});
let hoverAt = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons || !actors.length || performance.now() - hoverAt < 80) return;
  hoverAt = performance.now();
  aim(e);
  renderer.domElement.style.cursor = personAt() || ticketAt() ? 'pointer' : '';
});

// ----- go -----
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  world.update(t, dt);
  director.frame(dt);
  if (world.rev !== laid) relaid();
  for (const a of actors) a.update(a.hurry ? dt * director.speed : dt); // a scene keeps the yard's pace
  if (followed) {
    // the camera keeps its angle and rides along with the person
    tmp.copy(followed.position).setY(1.2).sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 5));
    controls.target.add(tmp);
    camera.position.add(tmp);
    if (closing) {
      tmp.copy(camera.position).sub(controls.target);
      const d = tmp.length();
      if (Math.abs(d - closing) < 0.3) closing = 0;
      else camera.position.copy(controls.target).add(tmp.multiplyScalar((d + (closing - d) * (1 - Math.exp(-dt * 3))) / d));
    }
  }
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, BOUNDS.x0 - 2, BOUNDS.x1 + 2);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, BOUNDS.z0 - 2, BOUNDS.z1 + 2);
  controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 8);
  controls.update();
  renderer.render(scene, camera);
}

(async () => {
  try {
    const bar = $('#loading b');
    await document.fonts.load('600 20px "IBM Plex Sans Condensed"').catch(() => {});
    await loadKit([...KIT, ...PEOPLE], (p) => { bar.style.width = `${Math.round(p * 100)}%`; });
    world = buildWorld(scene);
    const cast = startCast(scene, world, () => director);
    actors = cast.actors;
    cast.onChange = () => {
      actors = cast.actors;
      if (followed && !actors.includes(followed)) follow(null);
      renderRoster();
    };
    director = new Director(scene, world, cast.cast);
    director.crew = cast.setWrights;
    if (!DEMO) director.ask = readSoon;
    cast.begin();
    renderRoster();
    $('#loading').hidden = true;
    renderer.setAnimationLoop(frame);
    window.k2space = { scene, camera, controls, get actors() { return actors; }, world, director, follow, home, read };
    follow_board();
  } catch (e) {
    console.error(e);
    $('#loading').textContent = `The yard could not be opened: ${e.message || e}`;
  }
})();
