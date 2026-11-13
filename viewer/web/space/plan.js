// What the board means in the yard. Pure: no scene, no page, so it is tested
// in Node against the shape `viewer/snapshot.mjs` gives.
//
// A ticket is in one place at a time:
//   mail  -> shelf   -> queue -> ready       -> slip                 -> bay    (or scrap)
//   (new)   backlog     todo     in_progress    in_progress, review     done      cancel
//
// `ready`: `k2 start` has given the ticket a slip (its name is up) and no
// worker has come yet; its drawing still lies with the queue. The shipwright
// of that slip fetches it when a worker is sent, and only then the keel is laid.

export const PLACE = { backlog: 'shelf', todo: 'queue', in_progress: 'slip', review: 'slip', done: 'bay', cancel: 'scrap' };
const ORDER = ['mail', 'shelf', 'queue', 'ready', 'slip', 'bay'];
const STEPS = ['deliver', 'plan', 'prepare', 'fetch', 'launch'];
// Where the yard has a ticket, by what it has seen of it.
export const placeOf = (see) => (see.status === 'in_progress' && !see.fetched ? 'ready' : PLACE[see.status] || 'shelf');
export const FLEET = 4; // how many landed ships stay at anchor
// Orders written close together come as one party, by one boat: each within GROUP of the one
// written before it, while that boat has not left the pier.
export const GROUP = 60000;
export const joins = (party, at) => !!party && party.open && at >= party.last && at - party.last <= GROUP;

// The one move that brings a ticket nearer to where the board says it is.
export function nextStep(from, to) {
  if (from === to) return null;
  if (to === 'scrap') return 'scrap';
  const a = ORDER.indexOf(from), b = ORDER.indexOf(to);
  if (a < 0 || b < a) return 'reset'; // moved back, or out of the scrap: no story, it is just put there
  return STEPS[a];
}

// How much of the hull stands: a quarter once the keel is laid, the rest by the
// criteria met. It moves only when one is met, taken back or struck out. The
// lines that are the owner's to check are not counted: the hull is whole when
// the worker's part is.
export function buildOf(status, crit) {
  if (status !== 'in_progress' && status !== 'review') return 0;
  const mine = crit.filter((c) => !c.void && !c.owner);
  return 0.25 + 0.75 * (mine.length ? mine.filter((c) => c.done).length / mine.length : status === 'review' ? 1 : 0);
}

// ----- the trail: what the yard plays -----
//
// The yard keeps, for every ticket, what it has shown of it so far, and
// changes that only by playing the events of the ticket's trail, in order.
// What the trail does not carry (an agent's last step, a running test, a
// stuck agent, a question) is read from the board as it is.
export const seen = (p) => ({ status: p.status, crit: p.crit.map((c) => ({ ...c })), rigged: p.rigged, rejected: p.rejected, fetched: p.begun });
// (sails matter only while a hull is in review; whether the drawing was fetched is the yard's own account:
// the board cannot always tell)
export const sameSeen = (a, b) => a.status === b.status && (a.status !== 'review' || a.rigged === b.rigged) && a.rejected === b.rejected
  && a.crit.length === b.crit.length && a.crit.every((c, i) => c.done === b.crit[i].done && c.void === b.crit[i].void);

// One event, played: `see` becomes what the ticket was after it. Says 'pass'
// or 'reject' when the inspector has a verdict to give. An event with no
// scene of its own changes nothing here.
export function play(see, e) {
  const mark = (n, key, value) => { const c = see.crit[Number(n) - 1]; if (c) c[key] = value; };
  switch (e.event) {
    case 'created': see.status = PLACE[e.status] ? e.status : 'backlog'; return null;
    case 'moved': if (PLACE[e.to]) { see.status = e.to; see.rigged = false; see.fetched = true; } return null;
    case 'started': if (see.status !== 'in_progress') see.fetched = false; see.status = 'in_progress'; return null; // the slip is made ready; nobody builds yet
    case 'agent': if (e.role === 'worker') see.fetched = true; return null; // the shipwright fetches the drawing
    // work nobody was seen sent for is work all the same: the drawing is fetched first
    case 'check': see.fetched = true; mark(e.n, 'done', true); return null;
    case 'uncheck': see.fetched = true; mark(e.n, 'done', false); return null;
    case 'void': see.fetched = true; mark(e.n, 'void', true); return null;
    case 'submitted': see.status = 'review'; see.fetched = true; see.rigged = !!e.passed; return e.passed ? 'pass' : null;
    case 'amended': see.rigged = false; return null;
    case 'landed': see.status = 'done'; return null;
    case 'verdict':
      if (e.integration) return null; // on how main was brought in: the ship stays as it is
      if (e.result === 'pass') { see.rigged = true; return 'pass'; }
      see.status = 'in_progress';
      see.fetched = true;
      see.rigged = false;
      see.rejected++;
      for (const n of String(e.failed || '').split(',')) mark(n, 'done', false);
      return 'reject';
    default: return null;
  }
}

// The yard's own clock may run behind the board's, never ahead. Up to CALM
// behind, scenes play as they are; further behind they play faster, up to
// FAST times; more than LATE behind, the yard gives up the story (0) and is
// put as the board is now.
export const CALM = 30000;
export const LATE = 300000;
export const FAST = 4;
export const paceOf = (lag) => (lag > LATE ? 0 : lag > CALM ? Math.min(FAST, lag / CALM) : 1);

// A larger contract is a larger ship.
export function sizeOf(t) {
  const n = (t.criteria || []).filter((c) => !c.void).length;
  return n <= 3 ? 'small' : n <= 6 ? 'medium' : 'large';
}

// Which of the ten ships a ticket gets, for good: a small hash of its ID. Not
// the ID's own digits: an ID is a timestamp, and tickets written in one sitting
// would come out as neighbours. Eight plain hulls named for their sail (the
// flag has the sail's colour), two pirates named for their flag.
export const LIVERIES = ['white', 'red', 'teal', 'yellow', 'blue', 'green', 'orange', 'purple', 'pirate-red', 'pirate-white'];
export function liveryOf(id) {
  let h = 0x811c9dc5;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return LIVERIES[(h >>> 0) % LIVERIES.length];
}

// ----- the slips: as many as the board's `max_parallel` -----
//
// One to six stand in one row along the water. Seven to ten stand in two: the
// row behind is set half a step aside, so that each of its slipways runs to
// the water between two slips of the front row. More than ten are not drawn:
// what finds no slip waits as a drawing.
export const DOCKS_MAX = 10;
export const docksOf = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? 4 : Math.max(1, Math.min(DOCKS_MAX, Math.round(Number(v)))));
export const STREET = -13.6; // the walkway behind the front row
export const ROW = 14.8; // how far behind the front row the second one stands
const DOCK = 3.4; // half the width of a slip, scaffold and all
const HULL = 2.4; // half the beam of the widest ship
const WEST = 15.5, EAST = 17; // what the mail pier, and the crane with the lighthouse, take of the waterfront

// Where everything stands for `n` slips. x runs along the water, z is negative inland; the quay's edge is z = 0.
// `half` is half the island's width: it grows when the slips need more waterfront than the yard of four had.
export function yardOf(n) {
  n = docksOf(n);
  const front = n <= 6 ? n : Math.ceil((n + 1) / 2);
  const back = n - front;
  const pitch = back ? 2 * (DOCK + HULL) + 0.8 : Math.max(2 * DOCK + 1, Math.min(10.5, 31.5 / Math.max(1, front - 1)));
  const span = (front - 1) * pitch;
  const half = Math.max(32, (span + WEST + EAST) / 2);
  const x0 = (WEST - EAST) / 2 - span / 2;
  const side = back ? DOCK + 0.3 : Math.min(3.95, pitch / 2); // where people stand beside a hull
  const docks = [];
  for (let k = 0; k < front; k++) docks.push({ x: x0 + k * pitch, z: 0, row: 0 });
  for (let k = 0; k < back; k++) docks.push({ x: x0 + (k + 0.5) * pitch, z: -ROW, row: 1 });
  // where one walks from the street behind the back row to the one between the rows: past the ends of the back row, and between its slips
  const cross = back ? Array.from({ length: back + 1 }, (_, k) => x0 + k * pitch) : [];
  return { n, front, back, pitch, half, deep: back ? ROW : 0, east: half - 32, side, docks, cross, crane: { x: half - 10.5, z: -3 }, light: { x: half - 4, z: 3.4 }, pier: { x: 4 - half } };
}

// What stands on the ground of such a yard, as rectangles { kind, x0, x1, z0, z1 }: for the test that nothing overlaps.
export function footprints(Y) {
  const out = [];
  const rect = (kind, x, w, z0, z1, more = {}) => out.push({ kind, x0: x - w, x1: x + w, z0, z1, ...more });
  Y.docks.forEach((d, k) => {
    rect('dock', d.x, DOCK, d.z - 12.5, d.z - 0.1, { k });
    rect('slipway', d.x, HULL, d.z - 0.1, 10.5, { k }); // what its hull sweeps on the way to the water
    for (const s of [-1, 1]) for (const dz of [-10, -7.5, -5, -2.5]) out.push({ kind: 'spot', x0: d.x + s * Y.side, x1: d.x + s * Y.side, z0: d.z + dz, z1: d.z + dz, k });
  });
  rect('crane', Y.crane.x, 1.2, Y.crane.z - 1.2, Y.crane.z + 1.2);
  rect('lighthouse', Y.light.x, 3.6, Y.light.z - 3.6, Y.light.z + 3.6);
  rect('pier', Y.pier.x + 1.1, 2.7, 0, 10.4); // with the mail boat alongside
  out.push({ kind: 'street', x0: -Y.half, x1: Y.half, z0: STREET - 0.8, z1: STREET + 0.8 });
  if (Y.back) {
    out.push({ kind: 'street', x0: -Y.half, x1: Y.half, z0: STREET - ROW - 0.8, z1: STREET - ROW + 0.8 });
    for (const x of Y.cross) rect('lane', x, 0.8, STREET - ROW, STREET);
  }
  out.push({ kind: 'sheds', x0: -Y.half, x1: Y.half, z0: -30 - Y.deep, z1: -15.3 - Y.deep });
  return out;
}

export function picture(D) {
  const inbox = D.inbox || [];
  const live = D.live || {};
  const now = live.now || D.now || Date.now();
  const order = D.queue?.order || [];
  const merge = D.mergeQueue || [];
  const tickets = (D.tickets || []).map((t) => {
    const mine = inbox.filter((i) => i.id === t.id);
    const at = (role) => (t.run?.role !== role ? 'away' : mine.some((i) => i.kind === 'stuck' && String(i.text).startsWith(`${role} `)) ? 'stuck' : 'working');
    const crit = (t.criteria || []).map((c) => ({ done: !!c.done, void: !!c.void, owner: !!c.owner }));
    // Started, and nothing has happened since: the slip is ready, the drawing not yet fetched.
    const begun = t.status !== 'in_progress' || t.run?.role === 'worker' || crit.some((c) => c.done) || (t.rejected || 0) > 0 || t.last?.event !== 'started';
    const test = live.tests?.[t.id];
    const quiet = test ? now - test.lastOutput : 0;
    return {
      id: t.id,
      title: t.title || t.id,
      status: t.status,
      begun,
      place: placeOf({ status: t.status, fetched: begun }),
      size: sizeOf(t),
      livery: liveryOf(t.id),
      crit,
      build: begun ? buildOf(t.status, crit) : 0,
      rigged: !!t.state?.passed,
      worker: at('worker'),
      reviewer: at('reviewer'),
      step: live.agents?.[t.id]?.step || null,
      // as on the control room: green, amber after a minute without output, red after five
      testing: test ? (quiet < 60000 ? 'fresh' : quiet < 300000 ? 'slow' : 'silent') : null,
      asked: mine.some((i) => i.kind === 'question' || i.kind === 'blocking question'),
      held: !!(t.state?.held || t.state?.stopped),
      rejected: t.rejected || 0,
      order: order.indexOf(t.id) < 0 ? 1e9 : order.indexOf(t.id),
      merge: merge.indexOf(t.id),
      landed: t.landed || 0,
    };
  });
  const fleet = tickets.filter((t) => t.status === 'done').sort((a, b) => b.landed - a.landed || (a.id < b.id ? 1 : -1)).slice(0, FLEET).map((t) => t.id);
  return { tickets, byId: new Map(tickets.map((t) => [t.id, t])), needs: inbox.length, fleet, launchNext: merge[0] || null, docks: docksOf(D.settings?.max_parallel) };
}
