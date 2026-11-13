// A board that is not there: tickets made up in the page, moving through a
// whole life, in the shape `viewer/snapshot.mjs` gives. For looking at the
// yard when the real board is quiet. The page says plainly that it is a demo.
const TITLES = ['Save button on the invoice form', 'Rounding of tax per line', 'Export the ledger as CSV', 'Login expires too soon', 'Search by customer name', 'Monthly closing report', 'Currency on the summary', 'Undo for a deleted entry', 'Print layout of receipts', 'Import bank statements', 'Faster trial balance', 'Dark theme for the journal', 'Attach a scan to an entry', 'Audit trail of edits'];
import { LIVERIES, liveryOf } from './plan.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export function startDemo(onState) {
  let n = 0;
  let serial = 0;
  let clock = 0;
  const tickets = [];
  const make = (status) => {
    const size = [2, 3, 5, 6, 8][Math.floor(rnd(0, 5))];
    // the ID decides the ship, as on a real board; the demo picks IDs so that all ten ships come by, a pirate among the first
    let id;
    do id = `26111${String(10000000 + serial++).slice(1)}`; while (liveryOf(id) !== LIVERIES[(8 + n * 3) % LIVERIES.length]);
    const t = { id, title: TITLES[n % TITLES.length], status, fm: { lane: 'standard' }, criteria: Array.from({ length: size }, () => ({ done: false })), state: {}, rejected: 0, landed: 0, wait: rnd(14, 30), ask: 0, stuck: 0, test: 0, lastOut: 0 };
    n++;
    tickets.push(t);
    return t;
  };
  for (let i = 0; i < 3; i++) { const t = make('done'); t.landed = Date.now() - (3 - i) * 60000; t.criteria.forEach((c) => { c.done = true; }); }
  make('backlog'); make('todo');
  { const t = make('in_progress'); t.run = { role: 'worker', agent: 'demo', since: Date.now() }; t.criteria.slice(0, 2).forEach((c) => { c.done = true; }); t.wait = 8; }
  { const t = make('review'); t.run = { role: 'reviewer', agent: 'demo', since: Date.now() }; t.criteria.forEach((c) => { c.done = true; }); t.wait = 25; }

  function tick(dt) {
    clock += dt;
    const flying = tickets.filter((t) => ['in_progress', 'review'].includes(t.status)).length;
    if (tickets.filter((t) => t.status === 'backlog').length < 2 && Math.random() < dt / 20) make('backlog');
    for (const t of tickets) {
      t.wait -= dt;
      if (t.status === 'backlog' && t.wait <= 0) { t.status = Math.random() < 0.08 ? 'cancel' : 'todo'; t.wait = rnd(30, 45); }
      else if (t.status === 'todo' && t.wait <= 0 && flying < 3) { t.status = 'in_progress'; t.run = { role: 'worker', agent: 'demo', since: Date.now() }; t.wait = rnd(25, 35); return; }
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
        else if (open) open.done = true;
        else { t.status = 'review'; t.run = { role: 'reviewer', agent: 'demo', since: Date.now() }; }
        t.wait = t.status === 'review' ? rnd(25, 35) : rnd(6, 12);
      } else if (t.status === 'review' && t.wait <= 0) {
        if (!t.state.passed) {
          if (Math.random() < 0.25 && t.rejected < 2) { t.rejected++; t.status = 'in_progress'; t.criteria[t.criteria.length - 1].done = false; t.run = { role: 'worker', agent: 'demo', since: Date.now() }; }
          else { t.state.passed = true; t.run = null; }
          t.wait = rnd(20, 30);
        } else { t.status = 'done'; t.landed = Date.now(); }
      }
    }
  }

  const STEPS = { worker: ['Edit ledger.mjs', 'Read the contract', 'Run the unit tests', 'Grep "roundTax"', 'Write the handoff note'], reviewer: ['Run the checks itself', 'Read the diff against main', 'Try the criterion by hand'] };
  function state() {
    const now = Date.now();
    const inbox = [];
    const live = { now, agents: {}, tests: {}, locks: [] };
    for (const t of tickets) {
      if (t.ask > 0) inbox.push({ kind: 'blocking question', id: t.id, title: t.title, text: 'Which rounding rule applies?' });
      if (t.stuck > 0) inbox.push({ kind: 'stuck', id: t.id, title: t.title, text: 'worker demo has been on it for 20m without handing over' });
      if (t.run) live.agents[t.id] = { step: STEPS[t.run.role][Math.floor(clock / 6 + t.title.length) % STEPS[t.run.role].length], at: now };
      if (t.test > 0) live.tests[t.id] = { since: now, lastOutput: t.lastOut, tail: [], pid: 1 };
    }
    return {
      project: 'demo', now, demo: true,
      tickets: tickets.map((t) => ({ id: t.id, title: t.title, status: t.status, fm: t.fm, criteria: t.criteria, state: { passed: !!t.state.passed }, rejected: t.rejected, landed: t.landed, run: ['in_progress', 'review'].includes(t.status) ? t.run || undefined : undefined })),
      queue: { order: tickets.filter((t) => t.status === 'todo').map((t) => t.id) },
      mergeQueue: tickets.filter((t) => t.status === 'review' && t.state.passed).map((t) => t.id),
      inbox, live,
    };
  }
  onState(state());
  const timer = setInterval(() => { tick(1); onState(state()); }, 1000);
  return () => clearInterval(timer);
}
