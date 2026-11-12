// The board: where it lives, its settings, its tickets, its lock, its state.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { die, run, gitTry, now, sleep, idStamp } from './util.mjs';
import * as T from './ticket.mjs';

export const STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancel'];
export const BOARD_DIR = '.kerjaan2';
export const WT_DIR = '.worktrees';
export const BRANCH_PREFIX = 'k2/';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.dirname(HERE);

// How to call k2 in text shown to agents: bare when the plugin put it on PATH.
export function k2Name() {
  const bin = path.join(PLUGIN_ROOT, 'bin');
  return (process.env.PATH || '').split(path.delimiter).includes(bin) ? 'k2' : path.join(bin, 'k2');
}

export const DEFAULTS = {
  language: 'English',
  main_branch: 'main',
  test_command: '',
  worktree_setup: '',
  worktree_teardown: '',
  max_parallel: 3,
  parallel_tests: false,
  strict_paths: [],
  light_max_files: 8,
  stuck_after_minutes: 60,
  role_guard: true,
  done_when_limit: 8,
  model_worker_light: 'sonnet',
  model_worker: 'inherit',
  model_reviewer: 'inherit',
  model_planner: 'inherit',
};

// The main worktree's root, from anywhere inside the repo or one of its worktrees.
export function findRoot(cwd) {
  const r = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: cwd || process.cwd() });
  if (r.code === 0) return path.dirname(r.out);
  // Inside a kerjaan2 subagent the hook says where the board is, so k2 works
  // from a reviewer's copy in /tmp as well as from the repo.
  const home = process.env.K2_HOME;
  if (home && !cwd && fs.existsSync(path.join(home, BOARD_DIR))) return home;
  die('not inside a git repository (k2 needs one: every ticket is worked on a branch). Run it from the repo or one of its worktrees.');
}

// `root` is given by a caller that already knows it (the viewer asks every
// second and must not start git each time).
export function openBoard({ mustExist = true, cwd, root = findRoot(cwd) } = {}) {
  const dir = path.join(root, BOARD_DIR);
  if (mustExist && !fs.existsSync(path.join(dir, 'settings.yml'))) {
    die(`no board here: ${dir} is missing. Start one with \`${k2Name()} init\`.`);
  }
  const board = { root, dir, state: path.join(dir, '.state'), wtRoot: path.join(root, WT_DIR) };
  board.settings = mustExist ? readSettings(board) : { ...DEFAULTS };
  return board;
}

export function readSettings(board) {
  const s = { ...DEFAULTS };
  const file = path.join(board.dir, 'settings.yml');
  if (!fs.existsSync(file)) return s;
  const bad = [];
  let listKey = null;
  for (const line of fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').split('\n')) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      s[listKey].push(item[1].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    const m = line.match(/^([a-z_]+):(.*)$/);
    if (!m) {
      if (line.trim() && !line.trim().startsWith('#')) bad.push(`cannot read the line "${line.trim()}"`);
      listKey = null;
      continue;
    }
    const key = m[1];
    const raw = m[2].trim();
    listKey = null;
    if (!(key in DEFAULTS)) {
      bad.push(`unknown setting "${key}"`);
      continue;
    }
    const def = DEFAULTS[key];
    if (Array.isArray(def)) {
      // both YAML forms: [a, b] on the line, or "- a" lines under it
      const inner = raw.replace(/^\[/, '').replace(/\]$/, '').trim();
      s[key] = inner ? inner.split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
      if (!raw) listKey = key;
    } else if (typeof def === 'number') {
      if (raw === '') s[key] = def;
      else if (!/^\d+$/.test(raw)) bad.push(`${key} must be a whole number, not "${raw}"`);
      else s[key] = Number(raw);
    } else if (typeof def === 'boolean') {
      if (!['true', 'false', ''].includes(raw)) bad.push(`${key} must be true or false, not "${raw}"`);
      s[key] = raw === 'true';
    } else s[key] = raw.replace(/^"(.*)"$/, '$1');
  }
  if (s.max_parallel < 1) bad.push('max_parallel must be at least 1');
  if (bad.length) die(`${file} has ${bad.length} problem${bad.length === 1 ? '' : 's'}, and k2 will not guess at limits:\n- ${bad.join('\n- ')}`);
  return s;
}

// ----- lock -----

const pidAlive = (pid) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const readPid = (file) => {
  try {
    return Number(fs.readFileSync(file, 'utf8')) || 0;
  } catch {
    return 0;
  }
};

// A lock is a folder. It is held while its holder lives, or while a command
// its holder started (a test run) still lives: a k2 that was killed must not
// free the tests' turn while its test run goes on.
// The board lock may be held through a project's own commit hooks or a
// checkout, so others wait long rather than fail: thirty minutes.
export function withLock(board, name, fn, { waitMs = 30 * 60 * 1000 } = {}) {
  fs.mkdirSync(board.state, { recursive: true });
  const dir = path.join(board.state, `${name}.lock`);
  const start = Date.now();
  let told = false;
  for (;;) {
    try {
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'pid'), String(process.pid));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const holder = readPid(path.join(dir, 'pid'));
      const child = readPid(path.join(dir, 'child'));
      let age = 0;
      try {
        age = Date.now() - fs.statSync(dir).mtimeMs;
      } catch {}
      const alive = pidAlive(holder) || pidAlive(child);
      if (!alive && (holder || age > 2000)) {
        // Take the dead lock away under a name of our own; if what we took
        // turns out to be somebody's fresh lock, put it back.
        const grave = `${dir}.dead.${process.pid}.${Date.now()}`;
        try {
          fs.renameSync(dir, grave);
          const took = readPid(path.join(grave, 'pid'));
          if (took !== holder && pidAlive(took) && !fs.existsSync(dir)) fs.renameSync(grave, dir);
          else fs.rmSync(grave, { recursive: true, force: true });
        } catch {}
        continue;
      }
      if (Date.now() - start > waitMs) die(`the ${name} lock is held by process ${holder || child} and did not free up in ${Math.round(waitMs / 1000)}s`);
      if (!told && (name === 'test' || name === 'land' || (name === 'board' && Date.now() - start > 2500))) {
        process.stderr.write(name === 'board'
          ? `waiting for the board (process ${holder || child} holds it: another k2 command, perhaps a merge whose commit hooks are running). This command goes on by itself when it is free.\n`
          : `waiting for the ${name} lock (held by process ${holder || child})...\n`);
        told = true;
      }
      sleep(name === 'state' ? 20 : 200);
    }
  }
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ----- tickets -----

export function listTickets(board, statuses = STATUSES) {
  const out = [];
  for (const status of statuses) {
    const d = path.join(board.dir, status);
    if (!fs.existsSync(d)) continue;
    for (const name of fs.readdirSync(d).sort()) {
      const m = name.match(/^(\d{12}) (.+)\.md$/);
      if (m) out.push({ id: m[1], title: m[2], status, file: path.join(d, name) });
    }
  }
  return out;
}

export function findTicket(board, ref) {
  if (!ref) die('which ticket? give its ID');
  const want = path.basename(String(ref)).match(/\d{4,12}/)?.[0];
  if (!want) die(`"${ref}" is not a ticket ID`);
  const all = listTickets(board);
  let hits = all.filter((t) => t.id === want);
  if (!hits.length && want.length < 12) hits = all.filter((t) => t.id.endsWith(want));
  if (!hits.length) die(`no ticket ${want} on this board`);
  if (hits.length > 1) die(`${want} matches ${hits.length} tickets: ${hits.map((t) => `${t.status}/${t.id}`).join(', ')}`);
  return hits[0];
}

export function load(t) {
  try {
    return { ...t, ...T.parse(fs.readFileSync(t.file, 'utf8')) };
  } catch (e) {
    die(`cannot read the ticket ${t.file}: ${e.message}. Repair the file by hand (it needs its frontmatter between two --- lines).`);
  }
}

// Every ticket that can be read, and the files that cannot: one damaged file
// must not take the whole board down.
export function loadAll(board, statuses = STATUSES) {
  const tickets = [];
  const broken = [];
  for (const raw of listTickets(board, statuses)) {
    try {
      tickets.push({ ...raw, ...T.parse(fs.readFileSync(raw.file, 'utf8')) });
    } catch (e) {
      broken.push({ ...raw, error: e.message });
    }
  }
  return { tickets, broken };
}

export function save(t) {
  fs.writeFileSync(t.file, T.serialize(t));
}

export function newId(board) {
  const stamp = idStamp();
  const used = new Set(listTickets(board).map((t) => t.id));
  for (let n = 1; n < 100; n++) {
    const id = stamp + String(n).padStart(2, '0');
    if (!used.has(id)) return id;
  }
  die('a hundred tickets in one minute; try again in a moment');
}

export function cleanTitle(title) {
  const t = String(title || '').replace(/[\/\\:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.+$/, '');
  if (!t) die('a ticket needs a title');
  if (t.length > 120) die(`the title is ${t.length} characters; keep it under 120`);
  return t;
}

export function moveFile(board, t, status, title = t.title) {
  const dest = path.join(board.dir, status, `${t.id} ${title}.md`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (dest !== t.file) fs.renameSync(t.file, dest);
  t.file = dest;
  t.status = status;
  t.title = title;
  return t;
}

// ----- log and state -----

export function log(board, id, event, data = {}) {
  const dir = path.join(board.dir, 'log');
  fs.mkdirSync(dir, { recursive: true });
  const rec = { t: now(), event, ...data };
  const session = process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID;
  if (session) rec.session = session;
  // Who made the step, as the role guard handed it over. Its own field: an
  // `agent` event already has a `role`, the one being recorded.
  if (process.env.K2_ROLE) rec.by = `${process.env.K2_ROLE}:${process.env.K2_AGENT || '?'}`;
  fs.appendFileSync(path.join(dir, `${id}.jsonl`), JSON.stringify(rec) + '\n');
}

export function readLog(board, id) {
  const f = path.join(board.dir, 'log', `${id}.jsonl`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

const stateFile = (board, id) => path.join(board.state, 'tickets', `${id}.json`);

export function getState(board, id) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(board, id), 'utf8'));
  } catch {
    return {};
  }
}

// Read, change and write under a lock of its own, and replace the file in one
// step: two commands changing one ticket's state never lose each other's part,
// and no reader ever sees half a file.
export function setState(board, id, patch) {
  return withLock(board, 'state', () => {
    const s = { ...getState(board, id), ...patch };
    const file = stateFile(board, id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s, null, 1));
    fs.renameSync(tmp, file);
    return s;
  }, { waitMs: 20000 });
}

export function dropState(board, id) {
  fs.rmSync(stateFile(board, id), { force: true });
}

// ----- queue -----

export function readQueue(board) {
  const f = path.join(board.dir, 'queue.yml');
  const q = { goal: '', order: [], pause: [] };
  if (!fs.existsSync(f)) return q;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const g = line.match(/^goal:\s*(.*)$/);
    if (g) q.goal = g[1].trim();
    const m = line.match(/^\s*- (\d{12})(\s+pause)?/);
    if (m) {
      q.order.push(m[1]);
      if (m[2]) q.pause.push(m[1]);
    }
  }
  return q;
}

export function writeQueue(board, q) {
  const f = path.join(board.dir, 'queue.yml');
  const titles = new Map(listTickets(board).map((t) => [t.id, t.title]));
  const lines = [`goal: ${q.goal || ''}`.trimEnd(), 'order:'];
  for (const id of q.order) lines.push(`  - ${id}${q.pause.includes(id) ? ' pause' : ''}   # ${titles.get(id) || '?'}`);
  fs.writeFileSync(f, lines.join('\n') + '\n');
}

export function dropFromQueue(board, id) {
  const q = readQueue(board);
  if (!q.order.includes(id)) return;
  q.order = q.order.filter((x) => x !== id);
  q.pause = q.pause.filter((x) => x !== id);
  writeQueue(board, q);
}

// ----- git facts about a ticket -----

export function branchOf(board, id) {
  const r = gitTry(board.root, 'for-each-ref', '--format=%(refname:short)', `refs/heads/${BRANCH_PREFIX}${id}-*`);
  return r.out.split('\n').filter(Boolean)[0] || null;
}

export function worktreeOf(board, id) {
  if (!fs.existsSync(board.wtRoot)) return null;
  const name = fs.readdirSync(board.wtRoot).find((n) => n.startsWith(`${id}-`));
  return name ? path.join(board.wtRoot, name) : null;
}

// done means landed: a ticket reaches done only with its merge into main.
export const isLanded = (board, t) => t.status === 'done';

// Passed (by its reviewer, or by the gates on the light lane) and waiting to land.
export const isPassed = (board, t) => t.status === 'review' && !!getState(board, t.id).passed;

// The merge queue: tickets that passed, in the order they passed. Only the
// front one may land, and it keeps the front until it is in main, so main
// never moves under a ticket that is being brought up to date. A held merge
// stands outside the queue until the owner clears it.
export function mergeQueue(board) {
  return listTickets(board, ['review'])
    .map((t) => ({ ...t, st: getState(board, t.id) }))
    .filter((t) => t.st.passed && !t.st.held && !t.st.stopped)
    .sort((a, b) => (a.st.passedAt || 0) - (b.st.passedAt || 0) || a.id.localeCompare(b.id));
}

// ----- the contract does not move under the work -----

export const contractPrint = (contract) => createHash('sha1').update(T.contractText(contract)).digest('hex').slice(0, 12);

// True when what the ticket asks for differs from what it asked when work
// started, or when the owner (or `k2 void`) last sealed a change.
export function contractMoved(board, t) {
  const sealed = readLog(board, t.id).reverse().find((e) => e.contract)?.contract;
  return !!sealed && sealed !== contractPrint(t.contract);
}
