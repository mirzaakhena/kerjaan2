// Small helpers shared by every k2 module. No dependencies.
import { spawnSync } from 'node:child_process';

export class K2Error extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

export const die = (message, code = 1) => {
  throw new K2Error(message, code);
};

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
  return {
    code: r.status ?? 1,
    out: (r.stdout || '').replace(/\s+$/, ''),
    err: (r.stderr || '').replace(/\s+$/, ''),
  };
}

export const gitTry = (cwd, ...args) => run('git', args, { cwd });

export function git(cwd, ...args) {
  const r = gitTry(cwd, ...args);
  if (r.code !== 0) die(`git ${args.join(' ')} failed in ${cwd}:\n${r.err || r.out}`);
  return r.out;
}

const pad = (n) => String(n).padStart(2, '0');

export function now(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const today = () => now().slice(0, 10);

export function idStamp(d = new Date()) {
  return `${pad(d.getFullYear() % 100)}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Every option k2 knows. An unknown one is refused rather than left to
// swallow the next word; text that begins with -- goes after a lone `--`.
const VALUE_OPTS = ['type', 'priority', 'lane', 'status', 'labels', 'blocked-by', 'related', 'why', 'role', 'goal', 'pause-before', 'note', 'fail', 'by', 'undo', 'as', 'session', 'dir', 'language', 'test', 'main', 'm', 'stopped', 'port', 'root', 'depth'];
const BOOL_OPTS = ['blocking', 'force', 'contract', 'path', 'fix', 'agrees', 'differs', 'lan'];

// --flag value, --flag=value, --bool. Repeated flags are kept in order.
export function parseArgs(argv) {
  const pos = [];
  const all = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      pos.push(...argv.slice(i + 1));
      break;
    }
    if (a === '-m' || (a.startsWith('--') && a.length > 2)) {
      let name = a === '-m' ? 'm' : a.slice(2);
      let value;
      const eq = name.indexOf('=');
      if (eq >= 0) {
        value = name.slice(eq + 1);
        name = name.slice(0, eq);
      }
      if (BOOL_OPTS.includes(name)) value = true;
      else if (!VALUE_OPTS.includes(name)) die(`unknown option --${name}. If this is text that begins with "--", put it after a lone "--".`);
      else if (value === undefined) {
        value = argv[++i];
        if (value === undefined) die(`--${name} needs a value`);
      }
      (all[name] ||= []).push(value);
    } else pos.push(a);
  }
  const opt = {};
  for (const k of Object.keys(all)) opt[k] = all[k][all[k].length - 1];
  return { pos, opt, all };
}

export function slugify(title, words = 4) {
  const s = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, words)
    .join('-');
  return s || 'ticket';
}

export function fmtDuration(seconds) {
  const s = Math.round(seconds);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${pad(s % 60)}s`;
}
