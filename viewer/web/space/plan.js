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

// The one move that brings a ticket nearer to where the board says it is.
export function nextStep(from, to) {
  if (from === to) return null;
  if (to === 'scrap') return 'scrap';
  const a = ORDER.indexOf(from), b = ORDER.indexOf(to);
  if (a < 0 || b < a) return 'reset'; // moved back, or out of the scrap: no story, it is just put there
  return STEPS[a];
}

// A larger contract is a larger ship.
export function sizeOf(t) {
  const n = (t.criteria || []).filter((c) => !c.void).length;
  return n <= 3 ? 'small' : n <= 6 ? 'medium' : 'large';
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
    const crit = (t.criteria || []).filter((c) => !c.void);
    const test = live.tests?.[t.id];
    const quiet = test ? now - test.lastOutput : 0;
    return {
      id: t.id,
      title: t.title || t.id,
      status: t.status,
      place: PLACE[t.status] || 'shelf',
      size: sizeOf(t),
      // how much of the hull stands: a quarter once started, the rest by criteria met; all of it in review
      build: t.status === 'review' ? 1 : t.status === 'in_progress' ? 0.25 + 0.6 * (crit.length ? crit.filter((c) => c.done).length / crit.length : 0) : 0,
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
  return { tickets, byId: new Map(tickets.map((t) => [t.id, t])), needs: inbox.length, fleet, launchNext: merge[0] || null };
}
