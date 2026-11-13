// What the board means in the yard. Pure: no scene, no page, so it is tested
// in Node against the shape `viewer/snapshot.mjs` gives.
//
// A ticket is in one place at a time:
//   mail  -> shelf   -> queue -> slip                 -> bay    (or scrap)
//   (new)   backlog     todo     in_progress, review     done      cancel

export const PLACE = { backlog: 'shelf', todo: 'queue', in_progress: 'slip', review: 'slip', done: 'bay', cancel: 'scrap' };
const ORDER = ['mail', 'shelf', 'queue', 'slip', 'bay'];
const STEPS = ['deliver', 'plan', 'start', 'launch'];
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
export const seen = (p) => ({ status: p.status, crit: p.crit.map((c) => ({ ...c })), rigged: p.rigged, rejected: p.rejected });
// (sails matter only while a hull is in review)
export const sameSeen = (a, b) => a.status === b.status && (a.status !== 'review' || a.rigged === b.rigged) && a.rejected === b.rejected
  && a.crit.length === b.crit.length && a.crit.every((c, i) => c.done === b.crit[i].done && c.void === b.crit[i].void);

// One event, played: `see` becomes what the ticket was after it. Says which
// scene of the review it is, if any: 'handed' (given over to a reviewer),
// 'pass' or 'reject' (the inspector's verdict), 'cheer' (passed with no
// reviewer: the light lane, or the owner's `k2 accept`). An event with no
// scene of its own changes nothing here.
// A hull that passed stays on its slip: only `landed` sends it down the ramp.
export function play(see, e) {
  const mark = (n, key, value) => { const c = see.crit[Number(n) - 1]; if (c) c[key] = value; };
  switch (e.event) {
    case 'created': see.status = PLACE[e.status] ? e.status : 'backlog'; return null;
    case 'moved': if (PLACE[e.to]) { see.status = e.to; see.rigged = false; } return null;
    case 'started': see.status = 'in_progress'; return null;
    case 'check': mark(e.n, 'done', true); return null;
    case 'uncheck': mark(e.n, 'done', false); return null;
    case 'void': mark(e.n, 'void', true); return null;
    case 'submitted':
      // handed over again while main is brought in after the pass: the sails stay up, no scene
      if (see.status === 'review' && see.rigged) return null;
      see.status = 'review';
      see.rigged = !!e.passed;
      return e.passed ? 'cheer' : 'handed';
    case 'accepted': see.status = 'review'; see.rigged = true; return 'cheer';
    case 'amended': see.rigged = false; return null;
    case 'landed': see.status = 'done'; return null;
    case 'verdict':
      if (e.integration) return null; // on how main was brought in: the ship stays as it is
      if (e.result === 'pass') { see.rigged = true; return 'pass'; }
      see.status = 'in_progress';
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
    const test = live.tests?.[t.id];
    const quiet = test ? now - test.lastOutput : 0;
    return {
      id: t.id,
      title: t.title || t.id,
      status: t.status,
      place: PLACE[t.status] || 'shelf',
      size: sizeOf(t),
      livery: liveryOf(t.id),
      crit,
      build: buildOf(t.status, crit),
      rigged: !!t.state?.passed,
      worker: at('worker'),
      reviewer: at('reviewer'),
      step: live.agents?.[t.id]?.step || null,
      // as on the control room: green, amber after a minute without output, red after five
      testing: test ? (quiet < 60000 ? 'fresh' : quiet < 300000 ? 'slow' : 'silent') : null,
      asked: mine.some((i) => i.kind === 'question' || i.kind === 'blocking question'),
      held: !!(t.state?.held || t.state?.stopped),
      // passed and kept from the merge: the ship waits on its slip with the anchor down
      moored: t.status === 'review' && !!t.state?.passed && !!(t.state?.held || t.state?.stopped),
      rejected: t.rejected || 0,
      order: order.indexOf(t.id) < 0 ? 1e9 : order.indexOf(t.id),
      merge: merge.indexOf(t.id),
      landed: t.landed || 0,
    };
  });
  const fleet = tickets.filter((t) => t.status === 'done').sort((a, b) => b.landed - a.landed || (a.id < b.id ? 1 : -1)).slice(0, FLEET).map((t) => t.id);
  return { tickets, byId: new Map(tickets.map((t) => [t.id, t])), needs: inbox.length, fleet, launchNext: merge[0] || null };
}
