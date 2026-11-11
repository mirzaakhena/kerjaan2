// The board: where it lives, its settings, its tickets, its lock, its state.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  done_when_limit: 8,
  model_worker_light: 'sonnet',
  model_worker: 'inherit',
  model_reviewer: 'inherit',
  model_planner: 'inherit',
};

// The main worktree's root, from anywhere inside the repo or one of its worktrees.
export function findRoot(cwd = process.cwd()) {
  const r = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd });
  if (r.code !== 0) die('not inside a git repository (k2 needs one: every ticket is worked on a branch)');
  return path.dirname(r.out);
}

export function openBoard({ mustExist = true, cwd } = {}) {
  const root = findRoot(cwd);
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
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([a-z_]+):(.*)$/);
    if (!m) continue;
    const key = m[1];
    const raw = m[2].trim();
    const def = DEFAULTS[key];
    if (Array.isArray(def)) {
      const inner = raw.replace(/^\[/, '').replace(/\]$/, '').trim();
      s[key] = inner ? inner.split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
    } else if (typeof def === 'number') s[key] = raw === '' ? def : Number(raw);
    else if (typeof def === 'boolean') s[key] = raw === 'true';
    else s[key] = raw.replace(/^"(.*)"$/, '$1');
  }
  return s;
}

// ----- lock -----

export function withLock(board, name, fn, { waitMs = 30000, staleMs = 120000 } = {}) {
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
      let holder = 0;
      let age = 0;
      try {
        holder = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8'));
        age = Date.now() - fs.statSync(dir).mtimeMs;
      } catch {}
      let alive = false;
      if (holder) {
        try {
          process.kill(holder, 0);
          alive = true;
        } catch {}
      }
      if (!alive && (holder || age > 2000)) {
        fs.rmSync(dir, { recursive: true, force: true });
        continue;
      }
      if (alive && age > staleMs && name === 'board') {
        fs.rmSync(dir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - start > waitMs) die(`the ${name} lock is held by process ${holder} and did not free up`);
      if (!told && name !== 'board') {
        process.stderr.write(`waiting for the ${name} lock (held by process ${holder})...\n`);
        told = true;
      }
      sleep(200);
    }
  }
  try {
    return fn();
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
  return { ...t, ...T.parse(fs.readFileSync(t.file, 'utf8')) };
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

export function setState(board, id, patch) {
  const s = { ...getState(board, id), ...patch };
  fs.mkdirSync(path.dirname(stateFile(board, id)), { recursive: true });
  fs.writeFileSync(stateFile(board, id), JSON.stringify(s, null, 1));
  return s;
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

// Landed means: passed, and nothing of it is left outside main.
export const isLanded = (board, t) => t.status === 'done' && !branchOf(board, t.id);
