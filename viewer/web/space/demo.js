// A board that is not there: tickets made up in the page, moving through a
// whole life, in the shape `viewer/snapshot.mjs` gives, with the trail of
// what happened to them in the shape the server's `timeline` gives: the yard
// plays the demo as it plays a real board. For looking at the yard when the
// real board is quiet. The page says plainly that it is a demo.
const TITLES = ['Save button on the invoice form', 'Rounding of tax per line', 'Export the ledger as CSV', 'Login expires too soon', 'Search by customer name', 'Monthly closing report', 'Currency on the summary', 'Undo for a deleted entry', 'Print layout of receipts', 'Import bank statements', 'Faster trial balance', 'Dark theme for the journal', 'Attach a scan to an entry', 'Audit trail of edits'];
import { LIVERIES, liveryOf } from './plan.js';

const rnd = (a, b) => a + Math.random() * (b - a);

// `onState(state, trail)` is called once a second. The function returned stops
// the demo; its `step()` moves the made-up board on by one second at once, and
// its `setDocks(n)` gives the made-up board another `max_parallel`.
// `docks` is the board's `max_parallel`: that many tickets are worked at once.
export function startDemo(onState, { docks = 4 } = {}) {
  let events = []; // what happened since the last state was given
  const log = (t, event, more = {}) => events.push({ ticket: t.id, at: Date.now(), event, ...more });
  let n = 0;
  let serial = 0;
  let clock = 0;
  let sittings = 0; // how many times new orders were written
  // How a review ends, in turn, so that each way is there to be seen: passed; sent back, then
  // passed; passed and held before the merge for a while.
  const PLOTS = ['pass', 'again', 'held'];
  let reviews = 0;
  const tickets = [];
  const make = (status) => {
    const size = [2, 3, 5, 6, 8][Math.floor(rnd(0, 5))];
    // the ID decides the ship, as on a real board; the demo picks IDs so that all ten ships come by, a pirate among the first
    let id;
    do id = `26111${String(10000000 + serial++).slice(1)}`; while (liveryOf(id) !== LIVERIES[(8 + n * 3) % LIVERIES.length]);
    const t = { id, title: TITLES[n % TITLES.length], status, fm: { lane: 'standard' }, criteria: Array.from({ length: size }, () => ({ done: false })), state: {}, rejected: 0, landed: 0, wait: rnd(14, 30), ask: 0, stuck: 0, test: 0, lastOut: 0, held: 0 };
    n++;
    tickets.push(t);
    return t;
  };
  for (let i = 0; i < 3; i++) { const t = make('done'); t.landed = Date.now() - (3 - i) * 60000; t.criteria.forEach((c) => { c.done = true; }); }
  make('backlog').wait = 4;
  make('todo');
  { const t = make('in_progress'); t.run = { role: 'worker', agent: 'demo', since: Date.now() }; t.criteria.slice(0, 2).forEach((c) => { c.done = true; }); t.wait = 8; }
  { const t = make('review'); t.run = { role: 'reviewer', agent: 'demo', since: Date.now() }; t.criteria.forEach((c) => { c.done = true; }); t.wait = 25; }
  // a board with more places opens with more hulls on its slips
  for (let i = 4; i < docks; i++) { const t = make('in_progress'); t.run = { role: 'worker', agent: 'demo', since: Date.now() }; t.criteria[0].done = true; t.wait = rnd(5, 40); }
  // one that waits for another ticket from the start: the back row of the todo table is never a riddle
  { const t = make('todo'); t.after = tickets.find((o) => o.status === 'in_progress').id; }
  // a todo ticket waits while the ticket it was planned after has not landed
  const waits = (t) => (t.status === 'todo' && t.after && tickets.find((o) => o.id === t.after)?.status !== 'done' ? [t.after] : []);

  // The planner: sent when an order is due, it reads the orders; in its first round, and now and
  // then later, it stops with a question for the owner; answered, it reads on, then moves every
  // order that is due to todo at once, some of them to start after a ticket in flight.
  const planner = { phase: 'idle', left: 0, since: 0, asked: false, rounds: 0, about: null };
  const due = () => tickets.filter((t) => t.status === 'backlog' && t.wait <= 6);
  function plan(dt) {
    const p = planner;
    p.left -= dt;
    if (p.phase === 'idle') {
      if (tickets.some((t) => t.status === 'backlog' && t.wait <= 0)) Object.assign(p, { phase: 'reading', left: rnd(16, 22), since: Date.now(), asked: false });
    } else if (p.phase === 'asking') {
      if (p.left <= 0) Object.assign(p, { phase: 'reading', left: rnd(8, 12), since: Date.now(), about: null });
    } else if (p.left <= 0) {
      if (!p.asked && (p.rounds === 0 || Math.random() < 0.4)) return Object.assign(p, { phase: 'asking', left: rnd(9, 13), asked: true, about: due()[0] || null });
      const flying = tickets.filter((t) => t.status === 'in_progress');
      for (const t of due()) {
        t.status = Math.random() < 0.08 ? 'cancel' : 'todo';
        t.wait = rnd(30, 45);
        if (t.status === 'todo' && flying.length && Math.random() < 0.4) t.after = flying[Math.floor(rnd(0, flying.length))].id;
        log(t, 'moved', { to: t.status });
      }
      p.phase = 'idle';
      p.rounds++;
    }
  }

  function tick(dt) {
    clock += dt;
    const flying = tickets.filter((t) => ['in_progress', 'review'].includes(t.status)).length;
    const busy = Math.max(1, docks / 4); // a board with more places takes more orders
    // orders are written a few in one sitting, as a foreman does: they come as one party, by one boat
    // (the first sitting soon and never a single order, so that a party is there to be seen)
    const waiting = (status) => tickets.filter((t) => t.status === status).length;
    if (waiting('backlog') < 2 * busy && waiting('todo') < Math.min(6, 4 * busy) && Math.random() < (dt / (sittings ? 35 : 6)) * busy) {
      const many = sittings++ ? Math.floor(rnd(1, 4)) : 3;
      for (let k = 0; k < many; k++) { const t = make('backlog'); t.wait += k * rnd(4, 9); log(t, 'created', { status: 'backlog' }); }
    }
    plan(dt);
    for (const t of tickets) {
      t.wait -= dt;
      if (t.status === 'todo' && t.wait <= 0 && flying < Math.max(1, docks - 1) && !waits(t).length) { t.status = 'in_progress'; t.run = null; t.sent = rnd(3, 6); t.wait = rnd(25, 35); log(t, 'started'); return; } // `k2 start`, and a few seconds later the worker is sent
      else if (t.status === 'in_progress' && t.sent > 0) { t.sent -= dt; if (t.sent <= 0) { t.run = { role: 'worker', agent: 'demo', since: Date.now() }; log(t, 'agent', { role: 'worker', agent: 'demo' }); } }
      else if (t.status === 'in_progress') {
        if (t.ask > 0) { t.ask -= dt; if (t.ask <= 0) t.run = { role: 'worker', agent: 'demo', since: Date.now() }; continue; }
        if (t.stuck > 0) { t.stuck -= dt; continue; }
        if (t.test > 0) { t.test -= dt; if (Math.random() < dt / 2) t.lastOut = Date.now(); continue; }
        if (t.wait > 0) continue;
        const open = t.criteria.find((c) => !c.done);
        const dice = Math.random();
        if (dice < 0.08) { t.ask = rnd(10, 16); t.run = null; }
        else if (dice < 0.14) t.stuck = rnd(8, 12);
        else if (dice < 0.3) { t.test = rnd(6, 10); t.lastOut = Date.now(); }
        else if (open) { open.done = true; log(t, 'check', { n: t.criteria.indexOf(open) + 1 }); }
        else { t.status = 'review'; t.run = { role: 'reviewer', agent: 'demo', since: Date.now() }; log(t, 'submitted', { to: 'review' }); }
        t.wait = t.status === 'review' ? rnd(25, 35) : rnd(6, 12);
      } else if (t.status === 'review' && t.wait <= 0) {
        if (t.held > 0) { t.held -= dt; continue; } // the owner has not let it go yet
        if (!t.state.passed) {
          t.plot ??= PLOTS[reviews++ % PLOTS.length];
          if (t.plot === 'again' && !t.rejected) { t.rejected++; t.status = 'in_progress'; t.criteria[t.criteria.length - 1].done = false; t.run = { role: 'worker', agent: 'demo', since: Date.now() }; log(t, 'verdict', { result: 'reject', round: t.rejected, failed: String(t.criteria.length) }); }
          else { t.state.passed = true; t.run = null; t.held = t.plot === 'held' ? rnd(35, 45) : 0; log(t, 'verdict', { result: 'pass', round: t.rejected + 1 }); }
          t.wait = rnd(20, 30);
        } else { t.status = 'done'; t.landed = Date.now(); log(t, 'landed'); }
      }
    }
  }

  const READS = ['Read the backlog', 'Read the request of an order', 'Grep the code for what it touches', 'Write the Done when', 'Order the queue'];
  const STEPS = { worker: ['Edit ledger.mjs', 'Read the contract', 'Run the unit tests', 'Grep "roundTax"', 'Write the handoff note'], reviewer: ['Run the checks itself', 'Read the diff against main', 'Try the criterion by hand'] };
  function state() {
    const now = Date.now();
    const inbox = [];
    const live = { now, agents: {}, planner: planner.phase === 'reading' ? { agent: 'demo', since: planner.since, model: null, step: READS[Math.floor(clock / 4) % READS.length], command: null, at: now } : null, tests: {}, locks: [] };
    const asking = planner.phase === 'asking' ? planner.about : null;
    if (asking) inbox.push({ kind: 'question', id: asking.id, title: asking.title, text: 'Is this one order or two?' });
    for (const t of tickets) {
      if (t.ask > 0) inbox.push({ kind: 'blocking question', id: t.id, title: t.title, text: 'Which rounding rule applies?' });
      if (t.held > 0) inbox.push({ kind: 'not merged', id: t.id, title: t.title, text: 'held: Q1 is still waiting for the owner' });
      if (t.stuck > 0) inbox.push({ kind: 'stuck', id: t.id, title: t.title, text: 'worker demo has been on it for 20m without handing over' });
      if (t.run) live.agents[t.id] = { step: STEPS[t.run.role][Math.floor(clock / 6 + t.title.length) % STEPS[t.run.role].length], at: now };
      if (t.test > 0) live.tests[t.id] = { since: now, lastOutput: t.lastOut, tail: [], pid: 1 };
    }
    return {
      project: 'demo', now, demo: true,
      settings: { max_parallel: docks },
      tickets: tickets.map((t) => ({ id: t.id, title: t.title, status: t.status, fm: t.fm, criteria: t.criteria.map((c) => ({ ...c })), state: { passed: !!t.state.passed, ...(t.held > 0 ? { held: 'Q1 is still waiting for the owner' } : {}) }, rejected: t.rejected, landed: t.landed, last: t.sent > 0 ? { event: 'started' } : undefined, waits: waits(t), plannerAsks: t === asking ? 1 : 0, run: ['in_progress', 'review'].includes(t.status) ? t.run || undefined : undefined })),
      queue: { order: tickets.filter((t) => t.status === 'todo').map((t) => t.id) },
      mergeQueue: tickets.filter((t) => t.status === 'review' && t.state.passed && !(t.held > 0)).map((t) => t.id),
      inbox, live,
    };
  }
  const give = () => {
    const s = state();
    onState(s, { now: s.now, events, reread: false });
    events = [];
  };
  give();
  const step = () => { tick(1); give(); };
  const timer = setInterval(step, 1000);
  const stop = () => clearInterval(timer);
  stop.step = step;
  stop.setDocks = (n) => { docks = n; };
  return stop;
}
