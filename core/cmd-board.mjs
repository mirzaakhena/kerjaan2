// Commands that keep the board: tickets, the queue, what waits for the owner,
// and what the foreman does next.
import fs from 'node:fs';
import path from 'node:path';
import { die, git, gitTry, now, parseArgs } from './util.mjs';
import * as B from './board.mjs';
import * as T from './ticket.mjs';

const K = () => B.k2Name();

// ----- init -----

export function init(argv) {
  const { opt } = parseArgs(argv);
  const board = B.openBoard({ mustExist: false });
  const settingsFile = path.join(board.dir, 'settings.yml');
  if (fs.existsSync(settingsFile)) die(`a board already exists at ${board.dir}`);
  if (gitTry(board.root, 'rev-parse', '--verify', 'HEAD').code !== 0) {
    die('this repository has no commit yet. Make the first commit, then run init again: a worktree needs a commit to branch from.');
  }
  const branch = opt.main || git(board.root, 'symbolic-ref', '--short', 'HEAD');
  for (const s of B.STATUSES) fs.mkdirSync(path.join(board.dir, s), { recursive: true });
  fs.mkdirSync(path.join(board.dir, 'log'), { recursive: true });
  fs.writeFileSync(
    settingsFile,
    [
      '# kerjaan2 board settings. One `key: value` per line; a comment gets a line of its own.',
      '',
      '# The language ticket prose is written in. Structure stays English.',
      `language: ${opt.language || 'English'}`,
      `main_branch: ${branch}`,
      '',
      "# Runs the project's checks, in a ticket's worktree. Empty when there are none.",
      '# A run passes by its exit status alone, so the command must exit non-zero whenever a',
      "# test did not run to its end: avoid options that force the runner to exit early.",
      `test_command: ${opt.test || ''}`.trimEnd(),
      '',
      '# Run in each new worktree (install packages, copy .env), and before one is removed.',
      '# They, and the tests, get K2_MAIN_TREE, K2_WORKTREE, K2_TICKET and K2_SLOT (a small number',
      '# unique per worktree in flight): name ports and test data after them.',
      'worktree_setup:',
      'worktree_teardown:',
      '',
      '# Tickets somebody is working on at once (one that only waits for the owner uses no room);',
      '# and true when test runs in different worktrees share nothing.',
      'max_parallel: 3',
      'parallel_tests: false',
      '',
      '# Lanes: a change under strict_paths (globs) makes a ticket strict;',
      '# a light ticket changing more files than light_max_files becomes standard.',
      "# Globs work as in .gitignore: `*.sql` and `auth/` match at any depth, `src/pay/**` from the root.",
      'strict_paths: []',
      'light_max_files: 8',
      '',
      '# Minutes an agent may hold a step without handing over before `k2 next` calls it stuck.',
      'stuck_after_minutes: 60',
      '',
      '# Inside a kerjaan2 subagent, refuse the k2 commands that belong to the foreman or the owner.',
      '# It works by prefixing each of that agent\'s shell commands with `export K2_ROLE=...;`.',
      'role_guard: true',
      '',
      '# Model per role: sonnet, opus, haiku, a full model id, or inherit (the session\'s model).',
      'model_worker_light: sonnet',
      'model_worker: inherit',
      'model_reviewer: inherit',
      'model_planner: inherit',
      '',
    ].join('\n'),
  );
  // Keep runtime folders out of git without touching the project's .gitignore.
  const exclude = path.join(git(board.root, 'rev-parse', '--path-format=absolute', '--git-common-dir'), 'info', 'exclude');
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  const have = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
  const add = [`/${B.WT_DIR}/`, `/${B.BOARD_DIR}/.state/`].filter((l) => !have.split('\n').includes(l));
  if (add.length) fs.appendFileSync(exclude, (have.endsWith('\n') || !have ? '' : '\n') + add.join('\n') + '\n');
  console.log(`Board created: ${board.dir}`);
  console.log(`Main branch: ${branch}. Check settings.yml (language, test_command), then: ${K()} new "<title>"`);
}

// ----- create and edit -----

export function create(argv, { quick = false } = {}) {
  const { pos, opt } = parseArgs(argv);
  const board = B.openBoard();
  const title = B.cleanTitle(pos.join(' '));
  const fm = {
    type: opt.type || 'task',
    priority: opt.priority || 'medium',
    lane: opt.lane || (quick ? 'light' : 'standard'),
    labels: listArg(opt.labels),
    blocked_by: listArg(opt['blocked-by']).map((x) => B.findTicket(board, x).id),
    related: listArg(opt.related).map((x) => B.findTicket(board, x).id),
    touches: [],
    created: now().slice(0, 16),
  };
  checkEnums(fm);
  const status = opt.status || (quick ? 'todo' : 'backlog');
  if (!['backlog', 'todo'].includes(status)) die('a new ticket starts in backlog or todo');
  const t = B.withLock(board, 'board', () => {
    const id = B.newId(board);
    const file = path.join(board.dir, status, `${id} ${title}.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const ticket = { id, title, status, file, fm, contract: T.template(fm.type), record: T.emptyRecord() };
    B.save(ticket);
    B.log(board, id, 'created', { status });
    return ticket;
  });
  console.log(t.file);
  console.log(`Fill in Background, Request and Done when in that file${quick ? `, then: ${K()} start ${t.id}` : ''}.`);
}

const listArg = (v) => (v ? String(v).split(',').map((x) => x.trim()).filter(Boolean) : []);

function checkEnums(fm) {
  for (const [k, allowed] of Object.entries(T.ENUMS)) {
    if (!allowed.includes(fm[k])) die(`${k} must be one of ${allowed.join(', ')}; got "${fm[k]}"`);
  }
}

export function set(argv) {
  const { pos, opt } = parseArgs(argv);
  const board = B.openBoard();
  const rank = { light: 0, standard: 1, strict: 2 };
  B.withLock(board, 'board', () => {
    const t = B.load(B.findTicket(board, pos[0]));
    const laneBefore = t.fm.lane;
    for (const pair of pos.slice(1)) {
      const eq = pair.indexOf('=');
      if (eq < 0) die(`expected key=value, got "${pair}"`);
      const key = pair.slice(0, eq).replace(/-/g, '_');
      const value = pair.slice(eq + 1);
      if (!T.FM_KEYS.includes(key) || key === 'created') die(`"${key}" is not a field that can be set (${T.FM_KEYS.filter((k) => k !== 'created').join(', ')})`);
      t.fm[key] = T.LIST_KEYS.includes(key) ? listArg(value.replace(/^\[|\]$/g, '')) : value;
      if (key === 'blocked_by' || key === 'related') t.fm[key] = t.fm[key].map((x) => B.findTicket(board, x).id); // the full ID, so a later ticket cannot make a short one ambiguous
      if (key === 'solo') {
        if (!/^(true|yes|false|no)$/i.test(value)) die('solo is true or false');
        t.fm.solo = /^(true|yes)$/i.test(value) ? 'true' : 'false';
      }
    }
    checkEnums(t.fm);
    if (rank[t.fm.lane] < rank[laneBefore] && !opt.force) die(`${laneBefore} → ${t.fm.lane} lowers the lane, and with it who looks at this ticket. Only the owner lowers one: --force, on their word.`);
    if (rank[t.fm.lane] < rank[laneBefore]) t.record.decisions.push(T.makeEntry(`${now().slice(0, 10)} lane lowered from ${laneBefore} to ${t.fm.lane} on the owner's word`));
    B.save(t);
    console.log(`${t.id} updated: ${pos.slice(1).join(' ')}`);
  });
}

export function rename(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  B.withLock(board, 'board', () => {
    const t = B.findTicket(board, pos[0]);
    if (B.branchOf(board, t.id)) die('this ticket has a branch named after it; rename it once it has landed');
    B.moveFile(board, t, t.status, B.cleanTitle(pos.slice(1).join(' ')));
    B.writeQueue(board, B.readQueue(board));
    console.log(t.file);
  });
}

export function move(argv) {
  const { pos, opt } = parseArgs(argv, ['force']);
  const board = B.openBoard();
  const to = pos[1];
  B.withLock(board, 'board', () => {
    const t = B.load(B.findTicket(board, pos[0]));
    if (!B.STATUSES.includes(to)) die(`status must be one of ${B.STATUSES.join(', ')}`);
    if (to === t.status) return console.log(`${t.id} is already in ${to}`);
    const steer = { in_progress: 'start', review: 'submit', done: 'land' }[to];
    if (steer && !opt.force) die(`a ticket reaches ${to} through \`${K()} ${steer} ${t.id}\`, which does the checks that move stands for. (--force is the owner's word only.)`);
    if (to === 'cancel' && !opt.why) die('cancelling needs the reason: --why "<reason>"');
    if (['in_progress', 'review'].includes(t.status) && !opt.force && B.worktreeOf(board, t.id)) {
      die(`${t.id} is being worked on in ${B.worktreeOf(board, t.id)}. Stop its agent first; then repeat with --force and run \`${K()} doctor --fix\` to remove the worktree.`);
    }
    if (to === 'todo') {
      const r = readiness(board, t);
      if (r.reasons.length && !opt.force) die(`${t.id} is not ready for todo:\n- ${r.reasons.join('\n- ')}`);
    }
    if (opt.why) t.record.decisions.push(T.makeEntry(`${now().slice(0, 10)} moved to ${to}: ${opt.why}`));
    B.save(t);
    B.moveFile(board, t, to);
    if (to !== 'todo') B.dropFromQueue(board, t.id);
    // Out of flight, nothing of its run is still true: no agent, no round, no pass.
    if (!IN_FLIGHT.includes(to)) B.dropState(board, t.id);
    else if (B.getState(board, t.id).passed) B.setState(board, t.id, { passed: false, needs: null, judged: null });
    B.log(board, t.id, 'moved', { to, forced: !!opt.force || undefined });
    console.log(t.file);
  });
}

export function show(argv) {
  const { pos, opt } = parseArgs(argv, ['contract', 'path']);
  const board = B.openBoard();
  const t = B.findTicket(board, pos[0]);
  if (opt.path) return console.log(t.file);
  const text = fs.readFileSync(t.file, 'utf8');
  console.log(`# ${t.id} ${t.title}   [${t.status}]   ${t.file}\n`);
  console.log(opt.contract ? text.split('<!-- k2:record')[0].trimEnd() : text.trimEnd());
}

export function ls(argv) {
  const { pos, opt } = parseArgs(argv);
  const board = B.openBoard();
  const statuses = pos.length ? pos : opt.session ? B.STATUSES : B.STATUSES.filter((s) => !['done', 'cancel'].includes(s));
  // Tickets born in one session belong to one discussion: the trail knows which.
  const bornIn = (id) => String(B.readLog(board, id).find((e) => e.event === 'created')?.session || '');
  for (const s of statuses) if (!B.STATUSES.includes(s)) die(`unknown status "${s}"`);
  let n = 0;
  for (const s of statuses) {
    const { tickets: readable, broken } = B.loadAll(board, [s]);
    for (const x of broken) console.log(`  !! cannot read ${x.file}: ${x.error}`);
    const list = readable.filter((x) => !opt.session || bornIn(x.id).startsWith(opt.session));
    if (!list.length) continue;
    console.log(`${s} (${list.length})`);
    for (const t of list) {
      n++;
      console.log(`  ${t.id}  ${t.fm.lane.padEnd(8)} ${t.fm.priority.padEnd(6)} ${t.title}${badgeText(board, t)}`);
    }
  }
  if (!n) console.log('nothing there');
}

export function badges(board, t) {
  const b = {};
  const count = (key, st) => t.record[key].filter((e) => st.includes(e.status)).length;
  if (count('questions', ['open', 'blocking'])) b.questions = count('questions', ['open', 'blocking']);
  if (count('assumptions', ['unseen'])) b.assumptions = count('assumptions', ['unseen']);
  if (count('manual', ['waiting'])) b.manual = count('manual', ['waiting']);
  if (count('followups', ['open'])) b.followups = count('followups', ['open']);
  if (B.isPassed(board, t)) b.unmerged = true;
  return b;
}

function badgeText(board, t) {
  const b = badges(board, t);
  const parts = [];
  if (b.questions) parts.push(`?${b.questions} question`);
  if (b.assumptions) parts.push(`≈${b.assumptions} assumption`);
  if (b.manual) parts.push(`✋${b.manual} manual`);
  if (b.unmerged) parts.push('⚠ passed, not merged');
  return parts.length ? `   [${parts.join(', ')}]` : '';
}

// ----- readiness -----

// reasons: why the ticket may not enter todo. waits: blockers not landed yet.
export function readiness(board, t) {
  const reasons = [];
  const waits = [];
  for (const [k, allowed] of Object.entries(T.ENUMS)) if (!allowed.includes(t.fm[k])) reasons.push(`${k} is "${t.fm[k] || ''}"; it must be one of ${allowed.join(', ')}`);
  if (!T.section(t.contract, 'Request')) reasons.push('Request is empty');
  const crit = T.criteria(t.contract).filter((c) => !c.void && c.text.replace(/^\(owner\)/i, '').trim());
  if (!crit.length) reasons.push('Done when has no item');
  for (const q of t.record.questions) if (q.status === 'blocking') reasons.push(`question ${q.key} is still open: ${q.text}`);
  for (const id of t.fm.blocked_by) {
    let blocker;
    try {
      blocker = B.findTicket(board, id);
    } catch {
      reasons.push(`blocked_by names ${id}, which is not on the board`);
      continue;
    }
    if (blocker.status === 'cancel') reasons.push(`its blocker ${id} was cancelled: drop the dependency or cancel this ticket too`);
    else if (blocker.status === 'backlog') reasons.push(`its blocker ${id} is still in backlog`);
    else if (!B.isLanded(board, blocker)) waits.push(id);
  }
  const notes = [];
  const limit = board.settings.done_when_limit;
  if (crit.length > limit) notes.push(`Done when has ${crit.length} items (limit ${limit}): consider splitting it by outcome`);
  return { reasons, waits, notes };
}

export function ready(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const list = pos.length ? pos.map((p) => B.load(B.findTicket(board, p))) : B.loadAll(board, ['todo']).tickets;
  let bad = 0;
  for (const t of list) {
    const r = readiness(board, t);
    if (r.reasons.length) {
      bad++;
      console.log(`NOT READY ${t.id} ${t.title}\n  - ${r.reasons.join('\n  - ')}`);
    } else {
      console.log(`READY ${t.id} ${t.title}${r.waits.length ? `   (starts after ${r.waits.join(', ')} lands)` : ''}`);
    }
    for (const n of r.notes) console.log(`  note: ${n}`);
  }
  if (!list.length) console.log('todo is empty');
  process.exitCode = bad ? 1 : 0;
}

// ----- queue -----

export function queue(argv) {
  const { pos, opt, all } = parseArgs(argv);
  const board = B.openBoard();
  const sub = pos[0] || 'show';
  if (sub === 'show') {
    const q = B.readQueue(board);
    const todo = orderedTodo(board);
    if (q.goal) console.log(`Goal: ${q.goal}`);
    if (!todo.length) return console.log('todo is empty');
    todo.forEach((t, i) => console.log(`${String(i + 1).padStart(2)}. ${t.id} ${t.title}${q.pause.includes(t.id) ? '   [pause before]' : ''}`));
    return;
  }
  if (sub === 'set') {
    B.withLock(board, 'board', () => {
      const ids = pos.slice(1).map((p) => {
        const t = B.findTicket(board, p);
        if (t.status !== 'todo') die(`${t.id} is in ${t.status}; the queue orders tickets in todo`);
        return t.id;
      });
      const q = B.readQueue(board);
      B.writeQueue(board, {
        goal: opt.goal ?? q.goal,
        order: ids,
        pause: (all['pause-before'] || []).map((p) => B.findTicket(board, p).id),
      });
      console.log(`queue set: ${ids.length} ticket${ids.length === 1 ? '' : 's'}`);
    });
    return;
  }
  die('usage: queue [show] | queue set <id>... [--goal "<one sentence>"] [--pause-before <id>]');
}

const PRI = { high: 0, medium: 1, low: 2 };

// todo in working order: the queue first, then the rest by priority and age.
export function orderedTodo(board) {
  const q = B.readQueue(board);
  const todo = B.loadAll(board, ['todo']).tickets;
  const pos = (t) => (q.order.includes(t.id) ? q.order.indexOf(t.id) : 1e6 + PRI[t.fm.priority] * 1e3);
  return todo.sort((a, b) => pos(a) - pos(b) || a.id.localeCompare(b.id));
}

// ----- inbox -----

export function inboxItems(board) {
  const items = [];
  for (const t of B.loadAll(board).tickets) {
    if (t.status === 'cancel') continue;
    const add = (kind, key, text) => items.push({ kind, id: t.id, title: t.title, status: t.status, key, text });
    for (const q of t.record.questions) if (q.status !== 'answered') add(q.status === 'blocking' ? 'blocking question' : 'question', q.key, q.text);
    for (const a of t.record.assumptions) if (a.status === 'unseen' && ['review', 'done'].includes(t.status)) add('assumption', a.key, a.text);
    for (const m of t.record.manual) if (m.status === 'waiting' && t.status === 'done') add('manual check', m.key, [m.text, ...m.sub.filter((l) => !/^(Checked|Failed) by /.test(l))].join('\n         '));
    for (const f of t.record.followups) if (f.status === 'open' && t.status === 'done') add('follow-up', f.key, f.text);
    const st = B.getState(board, t.id);
    if (B.isPassed(board, t) && st.held) add('not merged', '', `held: ${st.held}`);
    if (rejectedTwice(st) && t.status === 'in_progress') add('rejected twice', '', 'decide: another fix, or accept with a follow-up');
    if (st.stopped) add('stopped', '', `its ${st.stoppedRole || 'worker'} stopped: ${st.stopped}`);
    if (IN_FLIGHT.includes(t.status) && B.contractMoved(board, t)) add('contract changed', '', 'what it asks for was edited after work started: confirm the change (amend) or restore the wording');
    for (const role of ['worker', 'reviewer']) {
      const stuck = stuckFor(board, t, st, role);
      if (stuck !== null) add('stuck', '', `${role} ${st[role].agent} has been on it for ${stuck}m without handing over`);
    }
  }
  return items;
}

const KIND_ORDER = ['blocking question', 'contract changed', 'stopped', 'stuck', 'rejected twice', 'not merged', 'question', 'manual check', 'assumption', 'follow-up'];

export function inbox() {
  const board = B.openBoard();
  const items = inboxItems(board);
  if (!items.length) return console.log('Nothing waits for the owner.');
  for (const kind of KIND_ORDER) {
    const list = items.filter((i) => i.kind === kind);
    if (!list.length) continue;
    console.log(`${kind} (${list.length})`);
    for (const i of list) console.log(`  ${i.id} ${i.key ? i.key + ' ' : ''}${i.text}   — ${i.title}`);
  }
}

// ----- status, next -----

const IN_FLIGHT = ['in_progress', 'review'];

export function modelFor(board, role, lane) {
  const s = board.settings;
  const m = role === 'worker' ? (lane === 'light' ? s.model_worker_light : s.model_worker) : s[`model_${role}`];
  return m && m !== 'inherit' ? m : null;
}

// A step is one stretch of work one agent was sent for. Every way a ticket
// can come back (a rejection, an answer, an amendment, a hand-over repeated)
// makes a new step, so nobody sent for an earlier one still counts.
export function stepOf(t, st) {
  if (t.status === 'review' && st.passed) return `integrate:${st.integrations || 1}:${st.needs || 'worker'}`;
  if (t.status === 'review') return `review:${st.round || 1}:${st.resubmits || 0}:${st.answers || 0}`;
  return `${st.mode || 'first'}:${st.round || 1}:${st.answers || 0}:${st.resubmits || 0}`;
}

// Asked of the owner again after every further rejection, not only the second.
export const rejectedTwice = (st) => (st.rejections || 0) >= 2 && (st.owner_ok_rejections ?? -1) < st.rejections;

// A ticket that only waits for the owner uses no room: nobody works on it.
export const waitsForOwner = (st) => !!((st.passed && st.held) || st.stopped || rejectedTwice(st));

const ownerLine = (t, st) => `OWNER  ${t.id} its ${st.stoppedRole || 'worker'} stopped: ${st.stopped}\n       Owner decides: try again (\`${K()} retry ${t.id}\`), or drop it (\`${K()} move ${t.id} cancel --force --why "<reason>"\`).`;

export function occupying(board) {
  return B.loadAll(board, IN_FLIGHT).tickets.filter((t) => !waitsForOwner(B.getState(board, t.id)));
}

// Minutes an agent has held the current step past the limit, or null.
export function stuckFor(board, t, st, role) {
  const b = st[role];
  if (!b?.agent || b.ended || b.step !== stepOf(t, st) || !b.at || !IN_FLIGHT.includes(t.status)) return null;
  if (role === 'worker' && t.status === 'review' && !(st.passed && st.needs === 'worker')) return null;
  if (role === 'reviewer' && (t.status !== 'review' || (st.passed && st.needs !== 'reviewer'))) return null;
  const minutes = Math.floor((Date.now() - b.at) / 60000);
  return minutes >= board.settings.stuck_after_minutes ? minutes : null;
}

function dispatchLines(board, t, role, st, why) {
  const prev = st[role];
  const step = stepOf(t, st);
  const same = prev?.agent && prev.step === step;
  if (same && !prev.ended) {
    const stuck = stuckFor(board, t, st, role);
    if (stuck !== null) {
      return [
        `STUCK  ${t.id} ${role} ${prev.agent} has been on it for ${stuck}m without handing over.`,
        `       If its report has already arrived, or it does not answer a SendMessage asking where it stands, release it: ${K()} release ${t.id} ${role}`,
      ];
    }
    return [`WAIT   ${t.id} ${role} ${prev.agent} is on it (${why}). Act when its report arrives; if its report arrives and this line is still here, it ended without handing over: ${K()} release ${t.id} ${role}`];
  }
  if (same) why = 'it ended without handing over: finish the step and hand over';
  const prompt = `Ticket ${t.id}. Repo ${board.root}. Run \`${K()} brief ${t.id} --role ${role}\` first and follow it exactly.`;
  const bind = `       then record it: ${K()} agent ${t.id} ${role} <agentId>`;
  if (prev?.agent) {
    return [
      `RESUME ${t.id} ${role} ${prev.agent} — ${why}`,
      `       SendMessage to ${prev.agent}: "${why}. Run \`${K()} brief ${t.id} --role ${role}\` again and follow it."`,
      `       (cannot be resumed? dispatch a new ${role}: subagent_type=kerjaan2:${role}, prompt: ${prompt} You are new to this ticket.)`,
      bind,
    ];
  }
  const model = modelFor(board, role, t.fm.lane);
  return [
    `DISPATCH ${role} for ${t.id} "${t.title}" (lane ${t.fm.lane}) — ${why}`,
    `       Agent: subagent_type=kerjaan2:${role}${model ? ` model=${model}` : ''} run_in_background=true`,
    `       prompt: ${prompt}`,
    bind,
  ];
}

export function nextActions(board) {
  const out = [];
  const { tickets, broken } = B.loadAll(board);
  for (const x of broken) out.push(`FIX    cannot read ${x.file}: ${x.error}. Repair the file by hand; until then this ticket is invisible to the board.`);
  const flight = tickets.filter((t) => IN_FLIGHT.includes(t.status));
  const unmerged = tickets.filter((t) => B.isPassed(board, t));

  for (const t of unmerged) {
    const st = B.getState(board, t.id);
    if (st.stopped) out.push(ownerLine(t, st));
    if (!st.held) continue;
    const qs = t.record.questions.filter((q) => q.status === 'blocking');
    if (qs.length) for (const q of qs) out.push(`OWNER  ${t.id} ${q.key}: ${q.text}\n       it was built on the recommended option, passed, and is held before the merge. Record the answer: ${K()} answer ${t.id} ${q.key} "<answer>" --agrees|--differs`);
    else out.push(`OWNER  ${t.id} cannot land: ${st.held}. Once the owner cleared it: ${K()} land ${t.id} (it rejoins the merge queue at the back)`);
  }
  const mq = B.mergeQueue(board);
  mq.forEach((t0, i) => {
    const t = tickets.find((x) => x.id === t0.id);
    const st = t0.st;
    if (i > 0) return out.push(`WAIT   ${t.id} passed; number ${i + 1} in the merge queue, behind ${mq[0].id}. It lands in its turn.`);
    if (st.needs === 'worker') out.push(...dispatchLines(board, t, 'worker', st, 'main moved after it passed: bring main in (integration, not a rejection)'));
    else if (st.needs === 'reviewer') out.push(...dispatchLines(board, t, 'reviewer', st, 'look only at what its worker changed to bring main in'));
    else out.push(`LAND   ${t.id} is at the front of the merge queue: run \`${K()} land ${t.id}\``);
  });
  for (const t of flight) {
    const st = B.getState(board, t.id);
    if (st.passed) continue;
    for (const q of t.record.questions.filter((x) => x.status === 'blocking')) {
      out.push(`OWNER  ${t.id} ${q.key}: ${q.text}\n       its worker builds the recommended option meanwhile; the ticket is held before it merges. Record the answer: ${K()} answer ${t.id} ${q.key} "<answer>" --agrees|--differs`);
    }
    if (B.contractMoved(board, t)) {
      out.push(`OWNER  ${t.id} what it asks for was edited after work started. Put the change to the owner: confirm it (\`${K()} amend ${t.id} --why "<their words>"\`, which sends it back to its worker), or restore the wording.`);
    } else if (st.stopped) {
      out.push(ownerLine(t, st));
    } else if (t.status === 'review') {
      out.push(...dispatchLines(board, t, 'reviewer', st, (st.round || 1) > 1 ? `the fix is in; round ${st.round}` : 'review it'));
    } else if (rejectedTwice(st)) {
      out.push(`OWNER  ${t.id} was sent back ${st.rejections} times. Owner decides: another fix (\`${K()} retry ${t.id}\`), or accept as is (\`${K()} accept ${t.id} --why "<owner's words>"\`).`);
    } else {
      const why = {
        fix: 'the reviewer sent it back; findings are in the ticket',
        answered: 'the owner answered its question',
        resubmit: 'its branch changed after it was handed over: check it and hand it over again',
        amended: 'the owner changed what it asks for',
      }[st.mode] || 'work the ticket';
      out.push(...dispatchLines(board, t, 'worker', st, why));
    }
  }
  const busy = flight.filter((t) => !waitsForOwner(B.getState(board, t.id)));
  const room = board.settings.max_parallel - busy.length;
  const q = B.readQueue(board);
  let started = 0;
  // A solo ticket (groundwork others stand on) runs with nothing beside it.
  const soloFlying = busy.find((t) => t.fm.solo === 'true');
  if (soloFlying && B.listTickets(board, ['todo']).length) out.push(`WAIT   ${soloFlying.id} is solo: nothing else starts until it is in main.`);
  for (const t of soloFlying ? [] : orderedTodo(board)) {
    if (started >= room) break;
    if (t.fm.solo === 'true' && (busy.length || started)) {
      const r0 = readiness(board, t);
      if (!r0.reasons.length && !r0.waits.length) {
        out.push(`WAIT   ${t.id} is solo: it starts once everything in flight is in main, and nothing starts in front of it.`);
        break;
      }
    }
    const r = readiness(board, t);
    if (r.reasons.length) {
      out.push(`FIX    ${t.id} sits in todo but is not ready: ${r.reasons[0]}`);
      continue;
    }
    if (r.waits.length) continue;
    if (q.pause.includes(t.id) && !B.getState(board, t.id).go) {
      out.push(`OWNER  ${t.id} has a pause before it: ask the owner to go on, then \`${K()} go ${t.id}\``);
      break;
    }
    out.push(`START  ${t.id} "${t.title}" (lane ${t.fm.lane}${t.fm.solo === 'true' ? ', solo' : ''}): run \`${K()} start ${t.id}\`, then \`${K()} next\``);
    started++;
    if (t.fm.solo === 'true') break;
  }
  return out;
}

export function next() {
  const board = B.openBoard();
  const actions = nextActions(board);
  if (actions.length) {
    console.log(actions.join('\n'));
    if (!actions.some((a) => /^(DISPATCH|RESUME|START|LAND|WAIT|STUCK|FIX)/.test(a))) console.log('IDLE   no agent has anything to do: everything left waits for the owner. Put the OWNER lines and the inbox to them now.');
    return;
  }
  const items = inboxItems(board);
  const backlog = B.listTickets(board, ['backlog']).length;
  const todo = B.listTickets(board, ['todo']).length;
  console.log(`IDLE   nothing to dispatch.${todo ? ` ${todo} in todo wait for a blocker to land.` : ''}`);
  if (items.length) console.log(`       ${items.length} item${items.length === 1 ? '' : 's'} wait for the owner: \`${K()} inbox\`, and put them to the owner.`);
  if (backlog && !todo) console.log(`       ${backlog} ticket${backlog === 1 ? '' : 's'} in backlog: offer to fill the queue (planner).`);
}

export function status() {
  const board = B.openBoard();
  const counts = B.STATUSES.map((s) => `${s} ${B.listTickets(board, [s]).length}`).join(' · ');
  console.log(`Board ${board.dir}\n${counts}`);
  const { tickets, broken } = B.loadAll(board);
  for (const x of broken) console.log(`!! cannot read ${x.file}: ${x.error}`);
  const live = tickets.filter((t) => IN_FLIGHT.includes(t.status));
  if (live.length) console.log('\nIn flight');
  for (const t of live) {
    const st = B.getState(board, t.id);
    const agents = ['worker', 'reviewer'].filter((r) => st[r]?.agent).map((r) => `${r} ${st[r].agent}`).join(', ');
    console.log(`  ${t.id} ${t.status.padEnd(11)} ${t.fm.lane.padEnd(8)} ${t.title}${badgeText(board, t)}`);
    console.log(`      worktree ${B.worktreeOf(board, t.id) || '(none)'}${agents ? ` · ${agents}` : ''}`);
  }
  const mq = B.mergeQueue(board);
  if (mq.length) console.log(`\nMerge queue: ${mq.map((t, i) => `${i + 1}. ${t.id}${i === 0 && t.st.needs ? ' (being brought up to date)' : ''}`).join('  ')}`);
  const todo = orderedTodo(board);
  if (todo.length) console.log(`\nQueue: ${todo.map((t) => t.id).join(' → ')}`);
  const items = inboxItems(board);
  if (items.length) {
    const by = {};
    for (const i of items) by[i.kind] = (by[i.kind] || 0) + 1;
    console.log(`\nWaiting for the owner: ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ')}  (${K()} inbox)`);
  }
}

// `transcript` is where the agent's own record of its work is kept, when the
// adapter that sent it knows: the viewer reads the agent's current step there.
export function bind(board, t, role, agentId, transcript) {
  const st = B.getState(board, t.id);
  const step = stepOf(t, st);
  if (st[role]?.agent === agentId && st[role].step === step && !st[role].ended) {
    if (transcript && st[role].transcript !== transcript) B.setState(board, t.id, { [role]: { ...st[role], transcript } });
    return false;
  }
  const where = transcript || (st[role]?.agent === agentId ? st[role].transcript : undefined);
  B.setState(board, t.id, { [role]: { agent: agentId, step, at: Date.now(), ...(where ? { transcript: where } : {}) } });
  B.log(board, t.id, 'agent', { role, agent: agentId, step });
  return true;
}

export function agent(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const [ref, role, agentId] = pos;
  if (!['worker', 'reviewer'].includes(role) || !agentId) die('usage: agent <id> <worker|reviewer> <agentId>');
  B.withLock(board, 'board', () => {
    const t = B.load(B.findTicket(board, ref));
    bind(board, t, role, agentId);
    console.log(`${t.id}: ${role} is agent ${agentId}`);
  });
}

export function go(argv) {
  const board = B.openBoard();
  B.withLock(board, 'board', () => {
    const t = B.findTicket(board, parseArgs(argv).pos[0]);
    B.setState(board, t.id, { go: true });
    console.log(`${t.id}: the owner said go`);
  });
}

export function retry(argv) {
  const board = B.openBoard();
  B.withLock(board, 'board', () => {
    const t = B.findTicket(board, parseArgs(argv).pos[0]);
    const st = B.getState(board, t.id);
    B.setState(board, t.id, { owner_ok_rejections: st.rejections || 0, stopped: null, stoppedRole: null, ...(st.passed ? { passedAt: Date.now() } : {}) });
    B.log(board, t.id, 'retry', { by: 'owner' });
    console.log(`${t.id}: another try, on the owner's word. Run \`${K()} next\`.`);
  });
}

// An agent that ended without handing over: free its step, so `next` sends
// somebody again. With --stopped, the ticket waits for the owner instead.
export function release(argv) {
  const { pos, opt } = parseArgs(argv);
  const board = B.openBoard();
  const role = pos[1] || 'worker';
  if (!['worker', 'reviewer'].includes(role)) die('usage: release <id> [worker|reviewer] [--stopped "<its reason>"]');
  B.withLock(board, 'board', () => {
    const t = B.findTicket(board, pos[0]);
    const st = B.getState(board, t.id);
    if (!st[role]?.agent) die(`${t.id} has no ${role} recorded`);
    B.setState(board, t.id, { [role]: { ...st[role], ended: true }, ...(opt.stopped ? { stopped: String(opt.stopped), stoppedRole: role } : {}) });
    B.log(board, t.id, 'released', { role, agent: st[role].agent, stopped: opt.stopped || undefined });
    console.log(opt.stopped
      ? `${t.id}: its ${role} stopped (${opt.stopped}). The ticket waits for the owner and uses no room meanwhile.`
      : `${t.id}: ${role} ${st[role].agent} released. Run \`${K()} next\`: it says whom to send.`);
  });
}

// ----- committing the board -----

export function commitBoard(argv) {
  const { opt } = parseArgs(argv);
  const board = B.openBoard();
  git(board.root, 'add', '-A', '--', B.BOARD_DIR);
  if (gitTry(board.root, 'diff', '--cached', '--quiet', '--', B.BOARD_DIR).code === 0) return console.log('the board has nothing to commit');
  git(board.root, 'commit', '-q', '-m', opt.m || 'Board: tickets and queue', '--', B.BOARD_DIR);
  console.log(`board committed: ${git(board.root, 'rev-parse', '--short', 'HEAD')}`);
}

// ----- doctor -----

// Worktrees that belong to no ticket in flight. Reads only: the viewer shows
// them, `doctor` removes the clean ones.
export function strayWorktrees(board) {
  if (!fs.existsSync(board.wtRoot)) return [];
  const byId = new Map(B.listTickets(board).map((t) => [t.id, t]));
  const unlanded = (t) => {
    const br = t && t.status === 'done' && B.branchOf(board, t.id);
    return !!br && gitTry(board.root, 'merge-base', '--is-ancestor', br, board.settings.main_branch).code !== 0;
  };
  const out = [];
  for (const name of fs.readdirSync(board.wtRoot)) {
    const id = name.match(/^(\d{12})-/)?.[1];
    const t = byId.get(id);
    if (t && (IN_FLIGHT.includes(t.status) || unlanded(t))) continue;
    const wt = path.join(board.wtRoot, name);
    // --no-optional-locks: a look must not rewrite the index under a merge.
    out.push({ path: wt, id: id || null, status: t ? t.status : null, dirty: !!gitTry(wt, '--no-optional-locks', 'status', '--porcelain').out });
  }
  return out;
}

export function doctor(argv) {
  const { opt } = parseArgs(argv, ['fix']);
  const board = B.openBoard();
  const tickets = B.listTickets(board);
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const problems = [];
  const say = (text, fix) => {
    problems.push(text);
    if (opt.fix && fix) {
      try {
        fix();
        console.log(`FIXED  ${text}`);
      } catch (e) {
        console.log(`FOUND  ${text}\n       could not fix: ${e.message}`);
      }
    } else console.log(`FOUND  ${text}${fix ? '   (--fix removes it)' : ''}`);
  };
  const unlanded = (t) => {
    const br = t && t.status === 'done' && B.branchOf(board, t.id);
    return !!br && gitTry(board.root, 'merge-base', '--is-ancestor', br, board.settings.main_branch).code !== 0;
  };
  const live = (t) => t && (IN_FLIGHT.includes(t.status) || unlanded(t));

  gitTry(board.root, 'worktree', 'prune');
  for (const s of strayWorktrees(board)) {
    say(`worktree ${s.path} belongs to no ticket in flight${s.status ? ` (${s.id} is in ${s.status})` : ''}${s.dirty ? '; it holds uncommitted changes' : ''}`, s.dirty ? null : () => git(board.root, 'worktree', 'remove', '--force', s.path));
  }
  for (const branch of gitTry(board.root, 'for-each-ref', '--format=%(refname:short)', `refs/heads/${B.BRANCH_PREFIX}`).out.split('\n').filter(Boolean)) {
    const id = branch.slice(B.BRANCH_PREFIX.length).match(/^(\d{12})-/)?.[1];
    const t = byId.get(id);
    const merged = gitTry(board.root, 'merge-base', '--is-ancestor', branch, board.settings.main_branch).code === 0;
    if (!live(t)) {
      say(`branch ${branch} belongs to no ticket in flight${merged ? ' and is merged' : ' and holds commits main does not have'}`, merged && !B.worktreeOf(board, id) ? () => git(board.root, 'branch', '-D', branch) : null);
    }
  }
  for (const t of tickets.filter((x) => IN_FLIGHT.includes(x.status))) {
    if (!B.worktreeOf(board, t.id)) say(`${t.id} is in ${t.status} but has no worktree (\`${K()} start ${t.id}\` makes it again)`);
  }
  for (const t of tickets.filter((x) => x.status === 'done')) {
    const br = B.branchOf(board, t.id);
    if (br && gitTry(board.root, 'merge-base', '--is-ancestor', br, board.settings.main_branch).code !== 0) say(`${t.id} is in done but its branch ${br} holds commits ${board.settings.main_branch} does not have: it did not land. Move it back (\`${K()} move ${t.id} in_progress --force\`) and hand it over again.`);
  }
  for (const x of B.loadAll(board).broken) say(`cannot read ${x.file}: ${x.error}`);
  if (gitTry(board.root, 'rev-parse', '-q', '--verify', 'MERGE_HEAD').code === 0) say(`the main tree is in the middle of a merge; nothing can land until it is finished or aborted`);
  const stateDir = path.join(board.state, 'tickets');
  if (fs.existsSync(stateDir)) {
    for (const f of fs.readdirSync(stateDir)) {
      const id = f.replace(/\.json$|\..*\.tmp$/, '');
      if (!live(byId.get(id))) say(`leftover state of ${id}, which is not in flight`, () => fs.rmSync(path.join(stateDir, f), { force: true }));
    }
  }
  if (fs.existsSync(board.state)) {
    for (const f of fs.readdirSync(board.state).filter((n) => /\.lock(\.dead\..*)?$/.test(n))) {
      const dir = path.join(board.state, f);
      const pids = ['pid', 'child'].map((n) => { try { return Number(fs.readFileSync(path.join(dir, n), 'utf8')); } catch { return 0; } }).filter(Boolean);
      const alive = pids.some((p) => { try { process.kill(p, 0); return true; } catch { return false; } });
      if (!alive) say(`stale lock ${f} (its holder is gone)`, () => fs.rmSync(dir, { recursive: true, force: true }));
    }
  }
  const q = B.readQueue(board);
  for (const id of q.order) if (byId.get(id)?.status !== 'todo') say(`queue.yml lists ${id}, which is not in todo`, () => B.dropFromQueue(board, id));
  const seen = new Map();
  for (const t of tickets) {
    if (seen.has(t.id)) say(`two tickets share the ID ${t.id}: ${seen.get(t.id)} and ${t.file}`);
    seen.set(t.id, t.file);
  }
  if (!problems.length) console.log('The board is healthy: no stray worktree, branch or queue line.');
  process.exitCode = problems.length && !opt.fix ? 1 : 0;
}
