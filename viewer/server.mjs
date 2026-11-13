// `k2 view`: read-only pages for every board under one folder. One process,
// no dependencies, GET only. It never takes a lock and never writes.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { die, parseArgs, run } from '../core/util.mjs';
import { scanProjects, isBoard, MAX_DEPTH, openProject, boardSignature, boardState, liveState, ticketDetail, projectCard } from './snapshot.mjs';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const DEFAULT_PORT = 4322;

const hash = (s) => createHash('sha1').update(s).digest('hex');

export function startServer({ root, port = DEFAULT_PORT, lan = false, depth = 1 } = {}) {
  root = fs.realpathSync(path.resolve(root));
  const host = lan ? '0.0.0.0' : '127.0.0.1';
  const cache = new Map(); // project name -> { sig, body }

  const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
    res.end(body);
  };
  const json = (res, value, code = 200) => send(res, code, JSON.stringify(value));
  // A deep search costs tens of milliseconds: a board already found is looked
  // for again only when it is gone. The list of boards always searches.
  const known = new Map();
  const scan = () => {
    const all = scanProjects(root, depth);
    known.clear();
    for (const p of all) known.set(p.name, p);
    return all;
  };
  const project = (name) => {
    const hit = known.get(name);
    if (hit && isBoard(hit.dir)) return hit;
    return scan().find((p) => p.name === name) || null;
  };

  function stateBody(p) {
    const sig = boardSignature(openProject(p));
    const hit = cache.get(p.name);
    if (hit && hit.sig === sig) {
      // The board did not move; what is live is asked fresh every time.
      const body = JSON.parse(hit.body);
      body.live = liveState(p);
      body.now = Date.now();
      return JSON.stringify(body);
    }
    const body = JSON.stringify(boardState(p));
    cache.set(p.name, { sig, body });
    return body;
  }

  // One watch per board, however many pages follow it: once a second it
  // looks, and says a line to every page when the board, or what is live on
  // it, changed. A board that cannot be read (bad settings, folder gone) is a
  // state like any other: pages hear when it is entered and when it is left.
  const watches = new Map(); // project name -> { pages, timer, board, live, beat }
  function look(name, w) {
    let sig = 'unreadable';
    let live = null;
    try {
      const p = project(name);
      if (p) {
        const board = openProject(p);
        sig = hash(boardSignature(board));
        live = liveState(p, board);
      }
    } catch {
      // said below, as a change of the board
    }
    const say = (text) => { for (const res of w.pages) res.write(text); };
    if (sig !== w.board) {
      if (w.board !== undefined) say('event: board\ndata: {}\n\n');
      w.board = sig;
    }
    if (live) {
      const liveSig = hash(JSON.stringify({ ...live, now: 0 }));
      if (liveSig !== w.live) {
        if (w.live !== undefined) say(`event: live\ndata: ${JSON.stringify(live)}\n\n`);
        w.live = liveSig;
      }
    }
    if (++w.beat % 20 === 0) say(': still here\n\n');
  }
  function events(req, res, p) {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    if (req.method === 'HEAD') return res.end();
    res.write('retry: 2000\n\n');
    let w = watches.get(p.name);
    if (!w) {
      w = { pages: new Set(), board: undefined, live: undefined, beat: 0 };
      look(p.name, w); // where things stand now; only what changes after is said
      w.timer = setInterval(() => look(p.name, w), 1000);
      watches.set(p.name, w);
    }
    w.pages.add(res);
    res.on('close', () => {
      w.pages.delete(res);
      if (w.pages.size) return;
      clearInterval(w.timer);
      if (watches.get(p.name) === w) watches.delete(p.name);
    });
  }

  // The names this machine is reached by. A page of another site that made a
  // name of its own point here (DNS rebinding) arrives under that name and
  // is refused, with --lan as without.
  function knownHost(header) {
    const name = String(header || '').toLowerCase().replace(/:\d+$/, '');
    if (['127.0.0.1', 'localhost', '[::1]'].includes(name)) return true;
    if (!lan || !name) return false;
    const mine = os.hostname().toLowerCase();
    const names = new Set([mine, mine.replace(/\.local$/, ''), `${mine.replace(/\.local$/, '')}.local`]);
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) names.add(a.family === 'IPv6' ? `[${a.address.toLowerCase()}]` : a.address);
    return names.has(name);
  }

  function asset(res, rel) {
    const file = path.normalize(path.join(WEB, rel));
    if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    // The models and the 3D library are large and change only with a release: a browser may keep them for a day.
    const keep = /^space\/(kits|three)\//.test(path.relative(WEB, file).split(path.sep).join('/'));
    send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream', keep ? { 'cache-control': 'public, max-age=86400' } : {});
  }

  const server = http.createServer((req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'the viewer only reads', 'text/plain; charset=utf-8', { allow: 'GET, HEAD' });
      if (!knownHost(req.headers.host)) return send(res, 403, lan ? 'this viewer answers under this machine\'s own addresses and name only: open it by the address it printed when it started' : 'this viewer answers on 127.0.0.1 only; start it with --lan to reach it from another device', 'text/plain; charset=utf-8');
      const url = new URL(req.url, 'http://x');
      let parts;
      try {
        parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      } catch {
        return send(res, 400, 'bad address', 'text/plain; charset=utf-8');
      }
      if (parts[0] === 'assets') return asset(res, parts.slice(1).join('/'));
      if (parts[0] === 'api') {
        if (parts[1] === 'projects' && parts.length === 2) return json(res, { root, lan, depth, projects: scan().map(projectCard) });
        if (parts[1] === 'p' && parts[2]) {
          const p = project(parts[2]);
          if (!p) return json(res, { error: `no board named "${parts[2]}" under ${root}` }, 404);
          if (parts[3] === 'state' && parts.length === 4) return send(res, 200, stateBody(p));
          if (parts[3] === 'events' && parts.length === 4) return events(req, res, p);
          if (parts[3] === 'ticket' && parts.length === 5) {
            const t = ticketDetail(p, parts[4]);
            return t ? json(res, t) : json(res, { error: `no ticket ${parts[4]}` }, 404);
          }
        }
        return json(res, { error: 'no such address' }, 404);
      }
      // Every page is the same file; the script reads the address.
      if (parts.length === 0 || (parts[0] === 'p' && parts.length === 2)) return send(res, 200, fs.readFileSync(path.join(WEB, 'index.html')), TYPES['.html']);
      // The yard: the same board as a place with people in it.
      if (parts[0] === 'p' && parts.length === 3 && parts[2] === 'space' && project(parts[1])) return send(res, 200, fs.readFileSync(path.join(WEB, 'space', 'space.html')), TYPES['.html']);
      send(res, 404, 'not found', 'text/plain; charset=utf-8');
    } catch (e) {
      // A board that cannot be read is said, not hidden: the page shows it.
      json(res, { error: String(e.message || e) }, 500);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const at = server.address().port;
      resolve({ server, port: at, root, depth, url: `http://127.0.0.1:${at}/`, watches: () => watches.size, close: () => new Promise((r) => { for (const w of watches.values()) clearInterval(w.timer); watches.clear(); server.closeAllConnections?.(); server.close(() => r()); }) });
    });
  });
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

export async function view(argv) {
  const { pos, opt } = parseArgs(argv);
  if (pos.length) die(`view takes no argument ("${pos[0]}"): view [--port ${DEFAULT_PORT}] [--root <folder of projects>] [--depth 1-${MAX_DEPTH}] [--lan]`);
  if (opt.port !== undefined && !/^\d{1,5}$/.test(String(opt.port))) die(`--port must be a number from 0 to 65535, not "${opt.port}"`);
  const port = opt.port === undefined ? DEFAULT_PORT : Number(opt.port);
  if (port > 65535) die(`--port must be a number from 0 to 65535, not "${opt.port}"`);
  if (opt.depth !== undefined && !/^[1-3]$/.test(String(opt.depth))) die(`--depth must be 1, 2 or 3 (how many levels under the folder are searched for boards), not "${opt.depth}"`);
  const depth = opt.depth === undefined ? 1 : Number(opt.depth);
  // With no folder named: the folder this repo sits in, so its neighbours show too.
  let root = opt.root;
  if (!root) {
    const r = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: process.cwd() });
    root = r.code === 0 ? path.dirname(path.dirname(r.out)) : process.cwd();
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) die(`${root} is not a folder`);
  let s;
  try {
    s = await startServer({ root, port, lan: !!opt.lan, depth });
  } catch (e) {
    if (e.code === 'EADDRINUSE') die(`port ${port} is taken (a viewer may already be running: open http://127.0.0.1:${port}/). Choose another with --port.`);
    throw e;
  }
  const found = scanProjects(s.root, depth);
  console.log(`k2 viewer: ${s.url}`);
  console.log(`boards under ${s.root}${depth > 1 ? ` (${depth} levels down)` : ''}: ${found.length ? found.map((p) => (p.path.includes(path.sep) ? `${p.name} (${p.path})` : p.name)).join(', ') : 'none yet (a board appears here as soon as `k2 init` makes one)'}`);
  if (opt.lan) {
    for (const a of lanAddresses()) console.log(`on your network: http://${a}:${s.port}/`);
    console.log('WARNING: --lan has no password. Anyone on this network can read every ticket, every agent command and the output of test runs, which may contain secrets. It answers under the addresses above and this machine\'s name only.');
  }
  console.log('Read-only. Ctrl-C stops it.');
}
