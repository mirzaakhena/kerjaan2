// What the viewer shows, computed from the board with the same code k2 uses.
// Nothing here writes: no lock is taken, no file is changed, git is only asked.
import fs from 'node:fs';
import path from 'node:path';
import * as B from '../core/board.mjs';
import * as T from '../core/ticket.mjs';
import * as C from '../core/cmd-board.mjs';
import { run } from '../core/util.mjs';
import { lastStep } from './transcript.mjs';

const IN_FLIGHT = ['in_progress', 'review'];
const ms = (t) => (t ? new Date(String(t).replace(' ', 'T')).getTime() : null);

// ----- projects -----

export const MAX_DEPTH = 3;
export const isBoard = (dir) => fs.existsSync(path.join(dir, B.BOARD_DIR, 'settings.yml'));

// Of `dirs`, those git ignores in a repository that encloses them, no higher
// than `root`. Git itself is asked, once per such repository, so every rule it
// knows counts; a .gitignore outside any repository counts for nothing.
function gitIgnored(root, dirs) {
  const asked = new Map(); // repository -> the folders inside it
  for (const dir of dirs) {
    for (let up = dir; up !== root;) {
      up = path.dirname(up);
      if (fs.existsSync(path.join(up, '.git'))) (asked.get(up) || asked.set(up, []).get(up)).push(dir);
    }
  }
  const ignored = new Set();
  for (const [repo, inside] of asked) {
    const r = run('git', ['check-ignore', '-z', '--stdin'], { cwd: repo, input: inside.map((d) => path.relative(repo, d)).join('\0') });
    if (r.code === 0) for (const rel of r.out.split('\0')) if (rel) ignored.add(path.join(repo, rel));
  }
  return ignored;
}

// `root` itself and every folder up to `depth` levels under it that holds a
// board, the nearest first. Hidden folders and node_modules are not entered;
// a symlink is not followed.
export function scanProjects(root, depth = 1) {
  const found = [];
  let level = [root];
  for (let d = 0; level.length; d++) {
    const next = [];
    for (const dir of level) {
      if (isBoard(dir)) found.push(dir);
      if (d >= Math.min(depth, MAX_DEPTH)) continue;
      let names = [];
      try {
        names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules').map((e) => e.name).sort();
      } catch {}
      for (const n of names) next.push(path.join(dir, n));
    }
    level = next;
  }
  const ignored = gitIgnored(root, found);
  const out = found.filter((dir) => !ignored.has(dir)).map((dir) => ({ name: path.basename(dir), dir, path: path.relative(root, dir) || '.' }));
  // Two folders of one name cannot both be addressed: the nearest keeps it.
  return out.filter((p, i) => out.findIndex((q) => q.name === p.name) === i);
}

// Where a project's repository is does not change while the viewer runs:
// git is asked once per project, not on every look.
const roots = new Map();
export function openProject(project) {
  if (!roots.has(project.dir)) roots.set(project.dir, B.findRoot(project.dir));
  return B.openBoard({ root: roots.get(project.dir) });
}

// ----- change detection -----

const statSig = (file) => {
  try {
    const s = fs.statSync(file);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return '-';
  }
};

function dirSig(dir) {
  let names;
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return '-';
  }
  return names.map((n) => `${n}=${statSig(path.join(dir, n))}`).join('|');
}

// Changes when anything the board pages show has changed.
export function boardSignature(board) {
  return [
    ...B.STATUSES.map((s) => dirSig(path.join(board.dir, s))),
    dirSig(path.join(board.dir, 'log')),
    dirSig(path.join(board.state, 'tickets')),
    statSig(path.join(board.dir, 'queue.yml')),
    statSig(path.join(board.dir, 'settings.yml')),
    (() => {
      try {
        return fs.readdirSync(board.wtRoot).sort().join(',');
      } catch {
        return '-';
      }
    })(),
    // The clock moves the board too: an agent turns stuck with no file written.
    B.listTickets(board, IN_FLIGHT).map((t) => {
      const st = B.getState(board, t.id);
      return ['worker', 'reviewer'].map((role) => C.stuckFor(board, t, st, role)).join('/');
    }).join(','),
  ].join('\n');
}

// ----- the trail, summed up per ticket -----

const logCache = new Map(); // file -> { sig, facts }

function trailFacts(board, id) {
  const file = path.join(board.dir, 'log', `${id}.jsonl`);
  const sig = statSig(file);
  const hit = logCache.get(file);
  if (hit && hit.sig === sig) return hit.facts;
  const log = B.readLog(board, id);
  const first = (e) => log.find((x) => x.event === e);
  const last = log[log.length - 1] || null;
  const facts = {
    started: ms(first('started')?.t),
    landed: ms([...log].reverse().find((x) => x.event === 'landed')?.t),
    rejected: log.filter((x) => x.event === 'verdict' && x.result !== 'pass' && !x.integration).length,
    broughtIn: Math.max(log.filter((x) => x.event === 'integrate').length, log.filter((x) => x.event === 'integrated').length),
    last: last ? { ...last, at: ms(last.t) } : null,
  };
  logCache.set(file, { sig, facts });
  return facts;
}

// ----- the trail, event by event -----

// A point in the trails of a board: how far each ticket's trail had been read,
// in bytes of whole lines, and which file that was. A trail only grows, so
// what lies past a point is exactly what was written after it.
const trailFiles = (board) => {
  const dir = path.join(board.dir, 'log');
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => /^\d{12}\.jsonl$/.test(n)).sort();
  } catch {}
  return names.map((n) => ({ id: n.slice(0, 12), file: path.join(dir, n) }));
};

// The events written after `point` (none of them with no point), oldest
// first, each naming its ticket, and the point to ask from next time. Null
// when the point is not of this board as it is now (a trail gone, replaced
// or cut short): the page must read the state again.
// A line that is no event (cut, not JSON, no time) is passed over.
export function trailSince(board, point = null) {
  const at = {};
  const events = [];
  const files = trailFiles(board);
  if (point) {
    if (point.dir !== board.dir) return null;
    const have = new Set(files.map((f) => f.id));
    for (const id of Object.keys(point.at)) if (!have.has(id)) return null;
  }
  for (const { id, file } of files) {
    const was = point?.at[id] || null;
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      if (was) return null;
      continue;
    }
    if (was && (was.ino !== stat.ino || stat.size < was.end)) return null;
    const from = was ? was.end : 0;
    if (was && stat.size === from) {
      at[id] = was;
      continue;
    }
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch {
      if (was) return null;
      continue;
    }
    if (buf.length < from) return null;
    // Only whole lines: one still being written is read next time.
    const end = buf.lastIndexOf(10) + 1;
    at[id] = { ino: stat.ino, end: Math.max(end, from) };
    if (!point || end <= from) continue;
    for (const line of buf.subarray(from, end).toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.event !== 'string') continue;
      const when = ms(e.t);
      if (!Number.isFinite(when)) continue;
      events.push({ ...e, ticket: id, at: when });
    }
  }
  // By time; within one second, a ticket's own order is kept.
  events.sort((a, b) => a.at - b.at);
  return { events, point: { dir: board.dir, at } };
}

export const samePoint = (a, b) => {
  if (a.dir !== b.dir) return false;
  const ka = Object.keys(a.at);
  return ka.length === Object.keys(b.at).length && ka.every((id) => b.at[id] && b.at[id].ino === a.at[id].ino && b.at[id].end === a.at[id].end);
};

// ----- the board -----

const rel = (board, p) => (p ? path.relative(board.root, p) : null);

function activeRole(t, st) {
  const step = C.stepOf(t, st);
  for (const role of ['reviewer', 'worker']) {
    const b = st[role];
    if (!b?.agent || b.ended || b.step !== step) continue;
    if (role === 'worker' && t.status === 'review' && !(st.passed && st.needs === 'worker')) continue;
    if (role === 'reviewer' && (t.status !== 'review' || (st.passed && st.needs !== 'reviewer'))) continue;
    return role;
  }
  return null;
}

export function boardState(project) {
  const board = openProject(project);
  const { tickets, broken } = B.loadAll(board);
  const q = B.readQueue(board);
  const todo = C.orderedTodo(board);
  const mq = B.mergeQueue(board);
  const light = tickets.map((t) => {
    const st = IN_FLIGHT.includes(t.status) ? B.getState(board, t.id) : {};
    const facts = trailFacts(board, t.id);
    const role = IN_FLIGHT.includes(t.status) ? activeRole(t, st) : null;
    const out = {
      id: t.id,
      title: t.title,
      status: t.status,
      fm: t.fm,
      criteria: T.criteria(t.contract).map((c) => ({ done: c.done, void: c.void, owner: c.owner })),
      badges: C.badges(board, t),
      started: facts.started,
      landed: facts.landed,
      rejected: facts.rejected,
      broughtIn: facts.broughtIn,
    };
    if (t.status === 'todo') out.waits = C.readiness(board, t).waits;
    if (IN_FLIGHT.includes(t.status)) {
      out.worktree = rel(board, B.worktreeOf(board, t.id));
      out.state = { round: st.round || 1, rejections: st.rejections || 0, slot: st.slot || null, passed: !!st.passed, held: st.held || null, needs: st.needs || null, stopped: st.stopped || null, conflict: st.conflict || null };
      out.last = facts.last;
      if (role) out.run = { role, agent: st[role].agent, since: st[role].at || null, model: C.modelFor(board, role, t.fm.lane) };
    }
    return out;
  });
  return {
    project: project.name,
    now: Date.now(),
    settings: {
      language: board.settings.language,
      max_parallel: board.settings.max_parallel,
      test_command: board.settings.test_command,
      stuck_after_minutes: board.settings.stuck_after_minutes,
    },
    // A pause the owner lifted (`k2 go`) is no pause any more, as for `k2 next`.
    queue: { goal: q.goal, order: todo.map((t) => t.id), pause: q.pause.filter((id) => !B.getState(board, id).go) },
    // Tickets in flight that take a place, as `k2 next` counts them.
    places: { used: C.occupying(board).length, max: board.settings.max_parallel },
    mergeQueue: mq.map((t) => t.id),
    inbox: C.inboxItems(board),
    orphans: C.strayWorktrees(board).map((s) => ({ path: rel(board, s.path), id: s.id, status: s.status, dirty: s.dirty })),
    broken: broken.map((x) => ({ file: rel(board, x.file), error: x.error })),
    tickets: light,
    live: liveState(project, board),
  };
}

// ----- what moves while nothing on the board does -----

const pidAlive = (pid) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const readNum = (file) => {
  try {
    return Number(fs.readFileSync(file, 'utf8')) || 0;
  } catch {
    return 0;
  }
};

function tailOf(file, lines = 12, bytes = 16 * 1024) {
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(Math.min(size, bytes));
    fs.readSync(fd, buf, 0, buf.length, size - buf.length);
    fs.closeSync(fd);
    return buf.toString('utf8').split('\n').filter((l) => l.trim()).slice(-lines).map((l) => l.slice(0, 240));
  } catch {
    return [];
  }
}

// A test run in progress: its output file, and the k2 that runs it still alive.
function testRun(board, id) {
  const dir = path.join(board.state, 'progress');
  const pid = readNum(path.join(dir, `${id}.pid`));
  if (!pidAlive(pid)) return null;
  const out = path.join(dir, `${id}.log`);
  try {
    return { since: fs.statSync(path.join(dir, `${id}.pid`)).mtimeMs, lastOutput: fs.statSync(out).mtimeMs, tail: tailOf(out), pid };
  } catch {
    return null;
  }
}

// The planner belongs to no ticket: the hook records it on the board when it
// is sent, resumed and stopped. One that was never seen stopping (a session
// closed halfway) is not at work for ever: with no sign of life for
// `stuck_after_minutes`, neither its dispatch nor a step in its transcript,
// it no longer counts.
function plannerAtWork(board) {
  const p = B.getPlanner(board);
  if (!p || p.ended || typeof p.at !== 'number') return null;
  const act = lastStep(p.transcript, p.at);
  if (Date.now() - Math.max(p.at, act?.at || 0) >= board.settings.stuck_after_minutes * 60000) return null;
  return { agent: p.agent, since: p.at, model: C.modelFor(board, 'planner'), step: act?.step || null, command: act?.command || null, at: act?.at || null };
}

// Agents at work, test runs, and who holds a turn. Cheap: asked once a second.
export function liveState(project, board = openProject(project)) {
  const agents = {};
  const tests = {};
  for (const t0 of B.listTickets(board, IN_FLIGHT)) {
    const st = B.getState(board, t0.id);
    const role = activeRole(t0, st);
    if (role) {
      const step = lastStep(st[role].transcript, st[role].at);
      if (step) agents[t0.id] = step;
    }
    const run = testRun(board, t0.id);
    if (run) tests[t0.id] = run;
  }
  const locks = [];
  for (const name of ['board', 'test', 'land']) {
    const dir = path.join(board.state, `${name}.lock`);
    const pid = readNum(path.join(dir, 'pid'));
    const child = readNum(path.join(dir, 'child'));
    if (!pidAlive(pid) && !pidAlive(child)) continue;
    const ticket = name === 'test' ? Object.keys(tests).find((id) => tests[id].pid === pid) || null : null;
    locks.push({ name, pid, ticket });
  }
  return { now: Date.now(), agents, planner: plannerAtWork(board), tests, locks };
}

// ----- one ticket in full -----

export function ticketDetail(project, ref) {
  const board = openProject(project);
  if (!/^\d{12}$/.test(String(ref))) return null;
  const found = B.listTickets(board).find((t) => t.id === ref);
  if (!found) return null;
  const t = B.load(found);
  const sec = (title) => T.section(t.contract, title);
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    fm: t.fm,
    sections: { background: sec('Background'), repro: sec('How to reproduce'), request: sec('Request'), scope: sec('Out of scope') },
    criteria: T.criteria(t.contract),
    record: t.record,
    log: B.readLog(board, t.id).map((e) => ({ ...e, at: ms(e.t) })),
    badges: C.badges(board, t),
    worktree: IN_FLIGHT.includes(t.status) ? rel(board, B.worktreeOf(board, t.id)) : null,
  };
}

// ----- the list of projects -----

export function projectCard(project) {
  try {
    const board = openProject(project);
    const counts = {};
    for (const s of B.STATUSES) counts[s] = B.listTickets(board, [s]).length;
    let running = 0;
    for (const t of B.listTickets(board, IN_FLIGHT)) if (activeRole(t, B.getState(board, t.id))) running++;
    return { name: project.name, path: project.path, counts, running, needs: C.inboxItems(board).length };
  } catch (e) {
    return { name: project.name, path: project.path, error: String(e.message || e) };
  }
}
