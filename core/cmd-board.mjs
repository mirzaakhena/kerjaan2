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
      `test_command: ${opt.test || ''}`.trimEnd(),
      '',
      '# Run in each new worktree (install packages, copy .env), and before one is removed.',
      '# They get K2_MAIN_TREE, K2_TICKET and K2_SLOT (a small number unique per worktree in flight).',
      'worktree_setup:',
      'worktree_teardown:',
      '',
      '# Tickets worked side by side; true when test runs in different worktrees share nothing.',
      'max_parallel: 3',
      'parallel_tests: false',
      '',
      '# Lanes: a change under strict_paths (globs) makes a ticket strict;',
      '# a light ticket changing more files than light_max_files becomes standard.',
      'strict_paths: []',
      'light_max_files: 8',
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
    blocked_by: listArg(opt['blocked-by']),
    related: listArg(opt.related),
    touches: [],
    created: now().slice(0, 16),
  };
  checkEnums(fm);
  const status = opt.status || 'backlog';
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
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  B.withLock(board, 'board', () => {
    const t = B.load(B.findTicket(board, pos[0]));
    for (const pair of pos.slice(1)) {
      const eq = pair.indexOf('=');
      if (eq < 0) die(`expected key=value, got "${pair}"`);
      const key = pair.slice(0, eq).replace(/-/g, '_');
      const value = pair.slice(eq + 1);
      if (!T.FM_KEYS.includes(key) || key === 'created') die(`"${key}" is not a field that can be set (${T.FM_KEYS.filter((k) => k !== 'created').join(', ')})`);
      t.fm[key] = T.LIST_KEYS.includes(key) ? listArg(value.replace(/^\[|\]$/g, '')) : value;
      if (key === 'blocked_by' || key === 'related') for (const id of t.fm[key]) B.findTicket(board, id);
    }
    checkEnums(t.fm);
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
    const steer = { in_progress: 'start', review: 'submit', done: 'verdict' }[to];
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
    if (B.getState(board, t.id).passed) B.setState(board, t.id, { passed: false, needs: null });
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
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const statuses = pos.length ? pos : B.STATUSES.filter((s) => !['done', 'cancel'].includes(s));
  for (const s of statuses) if (!B.STATUSES.includes(s)) die(`unknown status "${s}"`);
  let n = 0;
  for (const s of statuses) {
    const list = B.listTickets(board, [s]);
    if (!list.length) continue;
    console.log(`${s} (${list.length})`);
    for (const raw of list) {
      const t = B.load(raw);
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
  const crit = T.criteria(t.contract).filter((c) => c.text.replace(/^\(owner\)/i, '').trim());
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
  const list = pos.length ? pos.map((p) => B.findTicket(board, p)) : B.listTickets(board, ['todo']);
  let bad = 0;
  for (const raw of list) {
    const t = B.load(raw);
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
  const todo = B.listTickets(board, ['todo']).map(B.load);
  const pos = (t) => (q.order.includes(t.id) ? q.order.indexOf(t.id) : 1e6 + PRI[t.fm.priority] * 1e3);
  return todo.sort((a, b) => pos(a) - pos(b) || a.id.localeCompare(b.id));
}

// ----- inbox -----

export function inboxItems(board) {
  const items = [];
  for (const raw of B.listTickets(board)) {
    if (raw.status === 'cancel') continue;
    const t = B.load(raw);
    const add = (kind, key, text) => items.push({ kind, id: t.id, title: t.title, status: t.status, key, text });
    for (const q of t.record.questions) if (q.status !== 'answered') add(q.status === 'blocking' ? 'blocking question' : 'question', q.key, q.text);
    for (const a of t.record.assumptions) if (a.status === 'unseen' && ['review', 'done'].includes(t.status)) add('assumption', a.key, a.text);
    for (const m of t.record.manual) if (m.status === 'waiting' && t.status === 'done') add('manual check', m.key, m.text);
    for (const f of t.record.followups) if (f.status === 'open' && t.status === 'done') add('follow-up', f.key, f.text);
    const st = B.getState(board, t.id);
    if (B.isPassed(board, t) && st.held) add('not merged', '', `held: ${st.held}`);
    if (st.rejections >= 2 && t.status === 'in_progress') add('rejected twice', '', 'decide: another fix, or accept with a follow-up');
  }
  return items;
}

const KIND_ORDER = ['blocking question', 'rejected twice', 'not merged', 'question', 'manual check', 'assumption', 'follow-up'];

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

function modelFor(board, role, lane) {
  const s = board.settings;
  const m = role === 'worker' ? (lane === 'light' ? s.model_worker_light : s.model_worker) : s[`model_${role}`];
  return m && m !== 'inherit' ? m : null;
}

export function stepOf(t, st) {
  if (t.status === 'review' && st.passed) return `integrate:${st.integrations || 1}:${st.needs || 'worker'}`;
  if (t.status === 'review') return `review:${st.round || 1}`;
  return `${st.mode || 'first'}:${st.round || 1}:${st.answers || 0}`;
}

function dispatchLines(board, t, role, st, why) {
  const prev = st[role];
  const step = stepOf(t, st);
  if (prev?.agent && prev.step === step) return [`WAIT   ${t.id} ${role} ${prev.agent} is on it (${why}). Act when its report arrives.`];
  const prompt = `Ticket ${t.id}. Repo ${board.root}. Run \`${K()} brief ${t.id} --role ${role}\` first and follow it exactly.`;
  const bind = `       then record it: ${K()} agent ${t.id} ${role} <agentId>`;
  if (prev?.agent) {
    return [
      `RESUME ${t.id} ${role} ${prev.agent} — ${why}`,
      `       SendMessage to ${prev.agent}: "${why}. Run \`${K()} brief ${t.id} --role ${role}\` again and follow it."`,
      `       (cannot be resumed? dispatch a new ${role} with the prompt: ${prompt})`,
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
  const tickets = B.listTickets(board).map(B.load);
  const flight = tickets.filter((t) => IN_FLIGHT.includes(t.status));
  const unmerged = tickets.filter((t) => B.isPassed(board, t));

  const turn = unmerged.find((t) => B.getState(board, t.id).needs && !B.getState(board, t.id).held);
  for (const t of unmerged) {
    const st = B.getState(board, t.id);
    if (turn && turn.id !== t.id && !st.needs && !st.held) {
      out.push(`WAIT   ${t.id} passed; it lands right after ${turn.id}, which is being brought up to date with main.`);
      continue;
    }
    if (st.held) out.push(`HELD   ${t.id} cannot land: ${st.held}. Tell the owner; once cleared: ${K()} land ${t.id}`);
    else if (st.needs === 'worker') out.push(...dispatchLines(board, t, 'worker', st, 'main moved after it passed: bring main in (integration, not a rejection)'));
    else if (st.needs === 'reviewer') out.push(...dispatchLines(board, t, 'reviewer', st, 'look at the conflict resolution only'));
    else out.push(`LAND   ${t.id} passed: run \`${K()} land ${t.id}\``);
  }
  for (const t of flight) {
    const st = B.getState(board, t.id);
    const blocking = t.record.questions.filter((q) => q.status === 'blocking');
    if (st.passed) continue;
    if (t.status === 'review') {
      out.push(...dispatchLines(board, t, 'reviewer', st, (st.round || 1) > 1 ? `the fix is in; round ${st.round}` : 'review it'));
    } else if (blocking.length) {
      for (const q of blocking) out.push(`ASK    ${t.id} ${q.key} (owner): ${q.text}\n       record the answer: ${K()} answer ${t.id} ${q.key} "<answer>"`);
    } else if ((st.rejections || 0) >= 2 && !st.owner_ok_round) {
      out.push(`ASK    ${t.id} was sent back twice. Owner decides: another fix (\`${K()} retry ${t.id}\`), or accept as is (\`${K()} accept ${t.id} --why "<owner's words>"\`).`);
    } else {
      const why = { fix: 'the reviewer sent it back; findings are in the ticket', answered: 'the owner answered its question' }[st.mode] || 'work the ticket';
      out.push(...dispatchLines(board, t, 'worker', st, why));
    }
  }
  const room = board.settings.max_parallel - flight.length;
  const q = B.readQueue(board);
  let started = 0;
  for (const t of orderedTodo(board)) {
    if (started >= room) break;
    const r = readiness(board, t);
    if (r.reasons.length) {
      out.push(`FIX    ${t.id} sits in todo but is not ready: ${r.reasons[0]}`);
      continue;
    }
    if (r.waits.length) continue;
    if (q.pause.includes(t.id) && !B.getState(board, t.id).go) {
      out.push(`ASK    ${t.id} has a pause before it: ask the owner to go on, then \`${K()} go ${t.id}\``);
      break;
    }
    out.push(`START  ${t.id} "${t.title}" (lane ${t.fm.lane}): run \`${K()} start ${t.id}\`, then \`${K()} next\``);
    started++;
  }
  return out;
}

export function next() {
  const board = B.openBoard();
  const actions = nextActions(board);
  if (actions.length) return console.log(actions.join('\n'));
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
  const tickets = B.listTickets(board).map(B.load);
  const live = tickets.filter((t) => IN_FLIGHT.includes(t.status));
  if (live.length) console.log('\nIn flight');
  for (const t of live) {
    const st = B.getState(board, t.id);
    const agents = ['worker', 'reviewer'].filter((r) => st[r]?.agent).map((r) => `${r} ${st[r].agent}`).join(', ');
    console.log(`  ${t.id} ${t.status.padEnd(11)} ${t.fm.lane.padEnd(8)} ${t.title}${badgeText(board, t)}`);
    console.log(`      worktree ${B.worktreeOf(board, t.id) || '(none)'}${agents ? ` · ${agents}` : ''}`);
  }
  const todo = orderedTodo(board);
  if (todo.length) console.log(`\nQueue: ${todo.map((t) => t.id).join(' → ')}`);
  const items = inboxItems(board);
  if (items.length) {
    const by = {};
    for (const i of items) by[i.kind] = (by[i.kind] || 0) + 1;
    console.log(`\nWaiting for the owner: ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ')}  (${K()} inbox)`);
  }
}

export function agent(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const [ref, role, agentId] = pos;
  if (!['worker', 'reviewer'].includes(role) || !agentId) die('usage: agent <id> <worker|reviewer> <agentId>');
  B.withLock(board, 'board', () => {
    const t = B.load(B.findTicket(board, ref));
    const st = B.getState(board, t.id);
    B.setState(board, t.id, { [role]: { agent: agentId, step: stepOf(t, st) } });
    B.log(board, t.id, 'agent', { role, agent: agentId, step: stepOf(t, st) });
    console.log(`${t.id}: ${role} is agent ${agentId}`);
  });
}

export function go(argv) {
  const board = B.openBoard();
  const t = B.findTicket(board, parseArgs(argv).pos[0]);
  B.setState(board, t.id, { go: true });
  console.log(`${t.id}: the owner said go`);
}

export function retry(argv) {
  const board = B.openBoard();
  const t = B.findTicket(board, parseArgs(argv).pos[0]);
  const st = B.getState(board, t.id);
  B.setState(board, t.id, { owner_ok_round: st.round || 1 });
  B.log(board, t.id, 'retry', { by: 'owner' });
  console.log(`${t.id}: another fix, on the owner's word. Run \`${K()} next\`.`);
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
  const live = (t) => t && IN_FLIGHT.includes(t.status);

  gitTry(board.root, 'worktree', 'prune');
  if (fs.existsSync(board.wtRoot)) {
    for (const name of fs.readdirSync(board.wtRoot)) {
      const id = name.match(/^(\d{12})-/)?.[1];
      const t = byId.get(id);
      const wt = path.join(board.wtRoot, name);
      if (!live(t)) {
        const dirty = gitTry(wt, 'status', '--porcelain').out;
        say(`worktree ${wt} belongs to no ticket in flight${t ? ` (${id} is in ${t.status})` : ''}${dirty ? '; it holds uncommitted changes' : ''}`, dirty ? null : () => git(board.root, 'worktree', 'remove', '--force', wt));
      }
    }
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
