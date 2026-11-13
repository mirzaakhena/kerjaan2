// The viewer, against throwaway repositories with real boards made by the
// real CLI. The server runs in this process, on a port the system picks.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../viewer/server.mjs';
import { lastStep } from '../viewer/transcript.mjs';

const K2 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'k2');
const cleanEnv = () => {
  const e = { ...process.env };
  for (const k of ['K2_ROLE', 'K2_AGENT', 'K2_HOME']) delete e[k];
  return e;
};
const sh = (cwd, cmd, args, input, env = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', input, timeout: 60000, env: { ...cleanEnv(), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', ...env } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

const made = [];
const servers = [];
after(async () => {
  for (const s of servers) await s.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

// A folder of projects, as the owner's workspace is.
function workspace() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'k2v-')));
  made.push(root);
  return root;
}

function repo(root, name) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  const git = (...a) => sh(dir, 'git', a);
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'line one\n');
  fs.writeFileSync(path.join(dir, 'check.js'), 'process.exit(0)\n');
  git('add', '-A');
  git('commit', '-qm', 'init');
  const k = (...a) => sh(dir, K2, a);
  assert.equal(k('init', '--language', 'Bahasa Indonesia', '--test', 'node check.js').code, 0);
  return { dir, git, k };
}

// A ticket with a filled contract. Returns its ID.
function ticket(r, title, { lane = 'standard', status = 'todo' } = {}) {
  const out = r.k('new', title, '--type', 'feature', '--lane', lane, '--status', status).out;
  const file = out.split('\n')[0];
  const text = fs.readFileSync(file, 'utf8')
    .replace('## Request\n', '## Request\nBaris baru ada di berkas.\n')
    .replace('## Done when\n', '## Done when\n- [ ] Baris baru tampil\n- [ ] (owner) Rupa di layar\n');
  fs.writeFileSync(file, text);
  return path.basename(file).slice(0, 12);
}

async function serve(root, opts = {}) {
  const s = await startServer({ root, port: 0, ...opts });
  servers.push(s);
  return s;
}
const get = async (s, p) => {
  const r = await fetch(`http://127.0.0.1:${s.port}${p}`);
  const text = await r.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { status: r.status, body, type: r.headers.get('content-type') };
};
// A request whose Host header is ours to choose, which fetch does not allow.
const raw = (s, p, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: s.port, path: p, method, headers }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  });
  req.on('error', reject);
  req.end();
});
// Everything under a board, with sizes and times: what a read must not move.
const fingerprintOf = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const n of fs.readdirSync(d).sort()) {
      const f = path.join(d, n);
      const st = fs.statSync(f);
      if (st.isDirectory()) { out.push(`${f}/ ${st.mtimeMs}`); walk(f); } else out.push(`${f} ${st.size} ${st.mtimeMs}`);
    }
  };
  walk(dir);
  return out.join('\n');
};

test('every folder with a board under the root is a project; others are not', async () => {
  const root = workspace();
  const a = repo(root, 'alpha');
  repo(root, 'beta');
  fs.mkdirSync(path.join(root, 'not-a-board'));
  ticket(a, 'Satu');
  const s = await serve(root);
  const r = await get(s, '/api/projects');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.projects.map((p) => p.name), ['alpha', 'beta']);
  assert.equal(r.body.projects[0].counts.todo, 1);
  assert.equal(r.body.projects[1].counts.todo, 0);
  // A board made after the server started shows without a restart.
  repo(root, 'gamma');
  assert.deepEqual((await get(s, '/api/projects')).body.projects.map((p) => p.name), ['alpha', 'beta', 'gamma']);
});

test('--depth looks further down, three levels at most; one level without it', async () => {
  const root = workspace();
  repo(root, 'alpha');
  fs.mkdirSync(path.join(root, 'group', 'deep'), { recursive: true });
  repo(root, 'group/beta');
  repo(root, 'group/deep/gamma');
  fs.mkdirSync(path.join(root, 'a', 'b', 'c'), { recursive: true });
  repo(root, 'a/b/c/delta');
  const names = async (opts) => (await get(await serve(root, opts), '/api/projects')).body.projects.map((p) => p.name);
  assert.deepEqual(await names(), ['alpha']);
  assert.deepEqual(await names({ depth: 2 }), ['alpha', 'beta']);
  assert.deepEqual(await names({ depth: 3 }), ['alpha', 'beta', 'gamma'], 'a board four levels down is out of reach');
  // A deeper board is told apart by where it is, and opens like any other.
  const s = await serve(root, { depth: 3 });
  const cards = (await get(s, '/api/projects')).body.projects;
  assert.deepEqual(cards.map((p) => p.path), ['alpha', 'group/beta', 'group/deep/gamma']);
  assert.equal((await get(s, '/api/p/gamma/state')).status, 200);
  assert.equal((await get(await serve(root), '/api/p/gamma/state')).status, 404);
  for (const bad of ['0', '4', 'x', '2.5']) {
    const r = sh(root, K2, ['view', '--depth', bad]);
    assert.notEqual(r.code, 0, `--depth ${bad}`);
    assert.match(r.out, /--depth must be 1, 2 or 3/);
  }
});

test('a folder git ignores is not a project, nor is one under node_modules or a hidden folder', async () => {
  const root = workspace();
  const mono = path.join(root, 'mono');
  fs.mkdirSync(path.join(mono, 'vendor'), { recursive: true });
  fs.mkdirSync(path.join(mono, 'packages'));
  fs.mkdirSync(path.join(mono, 'node_modules'));
  fs.mkdirSync(path.join(mono, '.cache'));
  fs.mkdirSync(path.join(root, 'plain'));
  sh(mono, 'git', ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(mono, '.gitignore'), 'vendor/\n/scratch\n');
  repo(root, 'mono/packages/app');
  repo(root, 'mono/vendor/lib');
  repo(root, 'mono/scratch');
  repo(root, 'mono/node_modules/pkg');
  repo(root, 'mono/.cache/hidden');
  // A .gitignore outside any repository is only a file: git would not read it either.
  fs.writeFileSync(path.join(root, 'plain', '.gitignore'), 'kept/\n');
  repo(root, 'plain/kept');
  const s = await serve(root, { depth: 3 });
  assert.deepEqual((await get(s, '/api/projects')).body.projects.map((p) => p.name), ['kept', 'app']);
  assert.equal((await get(s, '/api/p/lib/state')).status, 404);
});

test('the state of a board: tickets, queue, inbox and one ticket in full', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const one = ticket(r, 'Tombol simpan');
  const two = ticket(r, 'Halaman daftar', { lane: 'strict' });
  const idea = ticket(r, 'Gagasan nanti', { status: 'backlog' });
  assert.equal(r.k('queue', 'set', two, one, '--goal', 'Dua hal dulu').code, 0);
  assert.equal(r.k('ask', idea, '--blocking', 'Warna apa? Saran: biru.').code, 0);
  const s = await serve(root);
  const st = (await get(s, '/api/p/toko/state')).body;
  assert.equal(st.project, 'toko');
  assert.deepEqual(st.queue.order, [two, one]);
  assert.equal(st.queue.goal, 'Dua hal dulu');
  assert.equal(st.tickets.length, 3);
  const t2 = st.tickets.find((t) => t.id === two);
  assert.equal(t2.status, 'todo');
  assert.equal(t2.fm.lane, 'strict');
  assert.deepEqual(t2.criteria, [{ done: false, void: false, owner: false }, { done: false, void: false, owner: true }]);
  assert.equal(st.tickets.find((t) => t.id === idea).badges.questions, 1);
  assert.deepEqual(st.inbox.map((i) => [i.kind, i.id, i.key]), [['blocking question', idea, 'Q1']]);
  assert.equal(st.settings.max_parallel, 3);
  assert.deepEqual(st.live.agents, {});

  const d = (await get(s, `/api/p/toko/ticket/${idea}`)).body;
  assert.equal(d.title, 'Gagasan nanti');
  assert.equal(d.sections.request, 'Baris baru ada di berkas.');
  assert.equal(d.criteria[1].owner, true);
  assert.equal(d.record.questions[0].status, 'blocking');
  assert.deepEqual(d.log.map((e) => e.event), ['created', 'question']);
  assert.equal(typeof d.log[0].at, 'number');

  assert.equal((await get(s, '/api/p/toko/ticket/999999999999')).status, 404);
  assert.equal((await get(s, '/api/p/toko/ticket/..%2Fsettings.yml')).status, 404);
  assert.equal((await get(s, '/api/p/nowhere/state')).status, 404);
});

test('the viewer only reads: no write method, no file outside its pages, nothing on the board moves', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const id = ticket(r, 'Tombol simpan');
  assert.equal(r.k('start', id).code, 0);
  const before = fingerprintOf(path.join(r.dir, '.kerjaan2'));
  const status = r.git('status', '--porcelain').out;
  const s = await serve(root);
  for (const p of ['/', '/p/toko/', '/api/projects', '/api/p/toko/state', `/api/p/toko/ticket/${id}`, '/assets/app.js', '/assets/style.css']) {
    assert.equal((await get(s, p)).status, 200, p);
  }
  assert.match((await get(s, '/')).type, /text\/html/);
  assert.match((await get(s, '/assets/fonts/plex-mono-400.woff2')).type, /font\/woff2/);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal((await raw(s, '/api/p/toko/state', { host: `127.0.0.1:${s.port}` }, method)).status, 405, method);
  for (const p of ['/assets/../server.mjs', '/assets/..%2Fserver.mjs', '/assets/%2e%2e/%2e%2e/core/cli.mjs', '/assets/fonts/../../snapshot.mjs', '/assets/', '/server.mjs', '/p/toko/extra/deep']) {
    const res = await raw(s, p, { host: `127.0.0.1:${s.port}` });
    assert.equal(res.status, 404, p);
    assert.ok(!res.body.includes('import '), p);
  }
  assert.equal(fingerprintOf(path.join(r.dir, '.kerjaan2')), before);
  assert.equal(r.git('status', '--porcelain').out, status);
});

test('the yard: a page of its own per board, with its scripts, models and textures; it only reads too', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  ticket(r, 'Tombol simpan');
  const before = fingerprintOf(path.join(r.dir, '.kerjaan2'));
  const s = await serve(root);
  const page = await get(s, '/p/toko/space');
  assert.equal(page.status, 200);
  assert.match(page.type, /text\/html/);
  assert.match(page.body, /assets\/space\/main\.js/);
  // every file the page and its modules name is served, under a type a browser accepts
  const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'web', 'space');
  for (const [file, type] of [['main.js', /javascript/], ['space.css', /text\/css/], ['three/three.module.min.js', /javascript/], ['three/loaders/GLTFLoader.js', /javascript/], ['kits/people/character-worker.glb', /model\/gltf-binary/], ['kits/pirate/Textures/colormap.png', /image\/png/]]) {
    const res = await get(s, `/assets/space/${file}`);
    assert.equal(res.status, 200, file);
    assert.match(res.type, type, file);
  }
  // the models the yard loads are all in the repo, and the repo holds no model it does not load
  const src = ['world.js', 'cast.js'].map((f) => fs.readFileSync(path.join(web, f), 'utf8')).join('\n');
  const named = new Set([...src.matchAll(/'((?:pirate|watercraft|people)\/[a-z0-9-]+)'/g)].map((m) => m[1]));
  const kept = ['people', 'pirate', 'watercraft'].flatMap((kit) => fs.readdirSync(path.join(web, 'kits', kit)).filter((f) => f.endsWith('.glb')).map((f) => `${kit}/${f.slice(0, -4)}`));
  assert.ok(kept.length > 40, 'the models were found');
  assert.deepEqual([...named].sort(), kept.sort());
  assert.match((await get(s, '/assets/space/main.js')).body, /loadKit\(\[\.\.\.KIT, \.\.\.PEOPLE\]/, 'the page loads exactly those two lists');
  for (const kit of ['people', 'pirate', 'watercraft']) assert.match(fs.readFileSync(path.join(web, 'kits', kit, 'LICENSE.txt'), 'utf8'), /Creative Commons Zero/);
  assert.equal((await get(s, '/p/nowhere/space')).status, 404);
  assert.equal((await get(s, '/p/toko/space/deep')).status, 404);
  assert.equal(fingerprintOf(path.join(r.dir, '.kerjaan2')), before);
});

test('the yard reads the board: where each ticket is, who is on it, and what waits for the owner', async () => {
  const { picture, nextStep, sizeOf } = await import('../viewer/web/space/plan.js');
  const root = workspace();
  const r = repo(root, 'toko');
  const waiting = ticket(r, 'Menunggu');
  const working = ticket(r, 'Dikerjakan');
  assert.equal(r.k('start', working).code, 0);
  const s = await serve(root);
  const D = (await get(s, '/api/p/toko/state')).body;
  const pic = picture(D);
  assert.equal(pic.tickets.length, D.tickets.length);
  const at = (id) => pic.byId.get(id);
  assert.equal(at(waiting).place, { backlog: 'shelf', todo: 'queue' }[at(waiting).status]);
  assert.equal(at(working).status, 'in_progress');
  assert.equal(at(working).place, 'slip');
  assert.equal(at(working).worker, 'away', 'no agent was recorded on it');
  assert.ok(at(working).build >= 0.25 && at(working).build < 1);
  assert.equal(at(working).title, 'Dikerjakan');
  assert.equal(pic.needs, D.inbox.length);
  assert.deepEqual(pic.fleet, []);

  // made-up states, in the shape the server gives
  const t = (id, status, more = {}) => ({ id, title: id, status, criteria: [{ done: true }, { done: false }], state: {}, ...more });
  const made = picture({
    tickets: [t('a', 'in_progress', { run: { role: 'worker' } }), t('b', 'review', { run: { role: 'reviewer' }, rejected: 1 }), t('c', 'review', { state: { passed: true } }), t('d', 'done', { landed: 5 }), t('e', 'done', { landed: 9 }), t('f', 'cancel'), t('g', 'todo'), t('h', 'todo')],
    inbox: [{ kind: 'stuck', id: 'a', text: 'worker x has been on it for 20m without handing over' }, { kind: 'blocking question', id: 'g', text: '?' }],
    queue: { order: ['h', 'g'] }, mergeQueue: ['c'],
    live: { now: 1000000, agents: { b: { step: 'Run the checks' } }, tests: { a: { lastOutput: 1000000 - 90000 } } },
  });
  const m = (id) => made.byId.get(id);
  assert.equal(m('a').worker, 'stuck');
  assert.equal(m('a').reviewer, 'away');
  assert.equal(m('a').testing, 'slow', 'no output for a minute and a half');
  assert.equal(m('a').build, 0.25 + 0.6 * 0.5);
  assert.equal(m('b').reviewer, 'working');
  assert.equal(m('b').step, 'Run the checks');
  assert.equal(m('b').build, 1);
  assert.equal(m('b').rigged, false);
  assert.equal(m('c').rigged, true);
  assert.equal(m('c').merge, 0);
  assert.equal(made.launchNext, 'c');
  assert.deepEqual(made.fleet, ['e', 'd'], 'newest landed first');
  assert.equal(m('f').place, 'scrap');
  assert.equal(m('g').asked, true);
  assert.ok(m('h').order < m('g').order, 'the queue keeps the order of the board');
  assert.equal(made.needs, 2);
  assert.equal(m('b').place, 'slip');
  assert.equal(m('d').place, 'bay');
  assert.equal(m('b').worker, 'away', 'the stuck worker is on another ticket');
  assert.equal(m('h').asked, false, 'the question is on another ticket');
  assert.equal(m('c').held, false);
  const more = picture({
    tickets: [t('q', 'in_progress', { criteria: [{ done: true }, { done: false, void: true }] }), t('s', 'review', { state: { passed: true, held: 'manual' } }), t('u', 'in_progress'), ...[1, 2, 3, 4, 5, 6].map((n) => t(`d${n}`, 'done', { landed: n }))],
    inbox: [{ kind: 'question', id: 'q', text: '?' }],
    live: { now: 1000000, tests: { q: { lastOutput: 1000000 - 6 * 60000 }, u: { lastOutput: 1000000 - 5000 } } },
  });
  assert.equal(more.byId.get('q').build, 0.25 + 0.6, 'a void criterion does not count');
  assert.equal(more.byId.get('q').asked, true, 'a question that does not block is still a question');
  assert.equal(more.byId.get('q').testing, 'silent', 'six minutes without output');
  assert.equal(more.byId.get('u').testing, 'fresh');
  assert.equal(more.byId.get('s').held, true);
  assert.deepEqual(more.fleet, ['d6', 'd5', 'd4', 'd3'], 'four ships stay at anchor');
  // the word the yard knows a stuck agent by is the word the board really writes
  assert.match(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core', 'cmd-board.mjs'), 'utf8'), /add\('stuck', '', `\$\{role\} \$\{st\[role\]\.agent\} has been on it/);

  // one step at a time towards where the board has it
  assert.deepEqual(['mail', 'shelf', 'queue', 'slip'].map((from) => nextStep(from, 'bay')), ['deliver', 'plan', 'start', 'launch']);
  assert.equal(nextStep('shelf', 'shelf'), null);
  assert.equal(nextStep('queue', 'scrap'), 'scrap');
  assert.equal(nextStep('slip', 'queue'), 'reset', 'a ticket moved back is put there, with no story');
  assert.equal(nextStep('scrap', 'shelf'), 'reset');
  assert.deepEqual([2, 5, 9].map((n) => sizeOf({ criteria: Array.from({ length: n }, () => ({})) })), ['small', 'medium', 'large']);
});

test('the yard gives every ticket one of ten ships, by a hash of its ID, the same from the slip to the bay', async () => {
  const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'web', 'space');
  const { picture, liveryOf, sizeOf, LIVERIES } = await import('../viewer/web/space/plan.js');
  assert.deepEqual(LIVERIES, ['white', 'red', 'teal', 'yellow', 'blue', 'green', 'orange', 'purple', 'pirate-red', 'pirate-white']);
  // the same ID is the same ship on every load and every device: nothing but the ID goes in
  assert.deepEqual(['261113190704', '261113190701', '261113191201', '261113190706'].map(liveryOf), ['pirate-white', 'purple', 'white', 'pirate-red'], 'the rule was changed: every ticket on every board changes ship');
  // tickets written in one sitting are not neighbours, and all ten ships are handed out about evenly
  const run = Array.from({ length: 1000 }, (_, k) => liveryOf(`2611131${String(10000 + k).slice(1)}0`));
  const count = Object.fromEntries(LIVERIES.map((l) => [l, run.filter((x) => x === l).length]));
  for (const l of LIVERIES) assert.ok(count[l] > 60 && count[l] < 140, `${l}: ${count[l]} of 1000`);
  const step = run.slice(1).map((l, k) => (LIVERIES.indexOf(l) - LIVERIES.indexOf(run[k]) + 10) % 10);
  for (let d = 0; d < 10; d++) assert.ok(step.filter((x) => x === d).length < 200, `consecutive IDs differ by ${d} too often: the hash is the ID's own digits`);
  // the picture carries it, whatever the ticket's status and size
  const T = (id, status, n) => ({ id, title: id, status, criteria: Array.from({ length: n }, () => ({ done: false })), state: {} });
  for (const status of ['backlog', 'todo', 'in_progress', 'review', 'done', 'cancel']) for (const n of [1, 5, 9]) {
    const p = picture({ tickets: [T('261113190704', status, n)] }).tickets[0];
    assert.equal(p.livery, 'pirate-white');
    assert.equal(p.size, sizeOf({ criteria: Array.from({ length: n }, () => ({})) }), 'size still follows the criteria');
  }
  // the yard draws every livery in every size, and names no other
  const world = fs.readFileSync(path.join(web, 'world.js'), 'utf8');
  const drawn = world.slice(world.indexOf('const LIVERY = {'), world.indexOf('export function makeShip'));
  assert.deepEqual([...drawn.matchAll(/'?([a-z-]+)'?: \{/g)].map((m) => m[1]).sort(), [...LIVERIES].sort());
  for (const size of ['small', 'medium', 'large']) for (const style of ['', 'pirate-']) assert.ok(fs.existsSync(path.join(web, 'kits', 'pirate', `ship-${style}${size}.glb`)), `${style}${size}`);
  // one ship object, made once with the ticket's livery, from keel to anchor; a page opened later makes the same
  const { dir, settle, board, errors } = await stagedYard();
  const ids = ['261113190704', '261113190701', '261113191201'];
  dir.update(board(ids.map((id) => T(id, 'in_progress', 5))));
  await settle();
  const built = ids.map((id) => dir.tokens.get(id).ship);
  assert.deepEqual(built.map((s) => [s.size, s.livery]), [['medium', 'pirate-white'], ['medium', 'purple'], ['medium', 'white']]);
  dir.update(board(ids.map((id) => T(id, 'review', 5))));
  await settle();
  dir.update(board(ids.map((id, k) => ({ ...T(id, 'done', 5), landed: k + 1 }))));
  await settle();
  assert.deepEqual(ids.map((id) => dir.tokens.get(id).place), ['bay', 'bay', 'bay']);
  assert.deepEqual(ids.map((id) => dir.tokens.get(id).ship), built, 'the ship at anchor is the one that was built');
  const later = await stagedYard();
  later.dir.update(later.board(ids.map((id, k) => ({ ...T(id, 'done', 5), landed: k + 1 }))));
  await later.settle();
  assert.deepEqual(ids.map((id) => later.dir.tokens.get(id).ship.livery), ['pirate-white', 'purple', 'white']);
  // the demo shows many kinds at once: its first tickets all differ, a pirate among those afloat
  const { startDemo } = await import('../viewer/web/space/demo.js');
  let first;
  startDemo((D) => { first = D; })();
  const shown = picture(first).tickets;
  assert.equal(new Set(shown.map((t) => t.livery)).size, shown.length);
  const hulls = shown.filter((t) => ['in_progress', 'review', 'done'].includes(t.status)).map((t) => t.livery);
  assert.ok(hulls.length >= 5 && hulls.some((l) => l.startsWith('pirate')) && hulls.some((l) => !l.startsWith('pirate')), hulls.join(' '));
  assert.deepEqual([...errors, ...later.errors], []);
});

// The director with a yard and people that are not drawn: every walk and wait is over at once.
async function stagedYard() {
  const { Director } = await import('../viewer/web/space/director.js');
  const thing = () => ({ position: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } }, rotation: { y: 0, set() {} }, userData: {}, visible: true });
  const spot = { x: 0, z: 0 };
  const world = {
    slips: [0, 1, 2, 3].map((k) => ({ x: k * 10, spots: Array.from({ length: 8 }, () => spot), lamp() {}, label() {} })),
    anchors: [0, 1, 2, 3].map((k) => ({ x: k * 10, z: 20, ry: 0 })),
    shelfSlots: Array.from({ length: 12 }, () => ({ x: 0, y: 0, z: 0, ry: 0 })), queueSlots: Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0, ry: 0 })),
    stations: new Proxy({}, { get: () => spot }), crane: {}, sea: 0,
    make: { scroll: thing, plank: thing, ship: (size, livery) => ({ o: thing(), size, livery, setBuild() {}, setRigged() {}, dispose() {} }) },
    move: async () => {}, floatOn() {}, floatOff() {}, setFlags() {}, mailIn() {}, mailOut() {},
  };
  const person = () => ({ jobs: [], doing: '', say() {}, hold() {}, goTo: async () => {}, act: async () => {}, wait: async () => {} });
  const cast = { courier: person(), planner: person(), foreman: person(), wrights: [person(), person(), person(), person()], inspector: person(), crane: person(), keeper: person() };
  const people = [cast.courier, cast.planner, cast.foreman, ...cast.wrights, cast.inspector, cast.crane, cast.keeper];
  const errors = [];
  const dir = new Director({ add() {}, remove() {} }, world, cast);
  // let every job asked for be done, until nothing is being carried any more
  const settle = async () => {
    for (let i = 0; i < 400; i++) {
      for (const a of people) { const job = a.jobs.shift(); if (job) { try { await job.run(a); } catch (e) { errors.push(e); } job.done(); } }
      await new Promise((r) => setImmediate(r));
      if (!people.some((a) => a.jobs.length) && ![...dir.tokens.values()].some((t) => t.busy)) return;
    }
    throw new Error('the yard never came to rest');
  };
  const T = (id, status, more = {}) => ({ id, title: id, status, criteria: [{ done: false }], state: {}, ...more });
  const board = (tickets, more = {}) => ({ tickets, inbox: [], queue: { order: [] }, mergeQueue: [], live: { now: 1, agents: {}, tests: {} }, ...more });
  const where = () => Object.fromEntries([...dir.tokens.values()].map((t) => [t.id, t.place]));
  return { dir, settle, T, board, where, errors };
}

test('the yard moves tickets as the board does: four slips, each held by one ship, freed when it lands', async () => {
  const { dir, settle, T, board, where, errors } = await stagedYard();
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  dir.update(board(ids.map((id) => T(id, 'todo'))));
  await settle();
  assert.deepEqual(new Set(Object.values(where())), new Set(['queue']));
  // six start in one look at the board: four get a slip, two wait as drawings
  dir.update(board(ids.map((id) => T(id, 'in_progress'))));
  await settle();
  const berthed = [...dir.tokens.values()].filter((t) => t.place === 'slip');
  assert.equal(berthed.length, 4);
  assert.deepEqual(berthed.map((t) => t.slip).sort(), [0, 1, 2, 3]);
  assert.ok(berthed.every((t) => t.ship && dir.slipOf[t.slip] === t));
  assert.equal(Object.values(where()).filter((p) => p === 'queue').length, 2);
  assert.equal(dir.slipOf[-1], undefined);
  // one lands: its slip goes to one of the two that waited, and it lies at anchor
  const first = berthed[0].id;
  dir.update(board(ids.map((id) => T(id, id === first ? 'done' : 'in_progress', id === first ? { landed: 5 } : {}))));
  await settle();
  assert.equal(where()[first], 'bay');
  assert.equal(dir.tokens.get(first).anchor, 0);
  assert.deepEqual(dir.fleet.map((t) => t.id), [first]);
  assert.equal(Object.values(where()).filter((p) => p === 'slip').length, 4);
  assert.equal(Object.values(where()).filter((p) => p === 'queue').length, 1);
  assert.deepEqual(dir.slipOf.map((t) => t.slip), [0, 1, 2, 3]);
  // the one still waiting lands without ever having had a slip: it takes none from those at work
  const waiting = Object.entries(where()).find(([, p]) => p === 'queue')[0];
  dir.update(board(ids.map((id) => T(id, [first, waiting].includes(id) ? 'done' : 'in_progress', { landed: id === first ? 5 : id === waiting ? 9 : 0 }))));
  await settle();
  assert.equal(where()[waiting], 'bay');
  assert.deepEqual(dir.fleet.map((t) => t.id), [first, waiting]);
  assert.equal(dir.slipOf.filter(Boolean).length, 4);
  // a cancelled hull frees its slip; a cancelled drawing leaves the board
  const gone = dir.slipOf[2].id;
  dir.update(board(ids.map((id) => T(id, id === gone ? 'cancel' : [first, waiting].includes(id) ? 'done' : 'in_progress', { landed: id === first ? 5 : id === waiting ? 9 : 0 }))));
  await settle();
  assert.equal(where()[gone], 'scrap');
  assert.equal(dir.slipOf[2], null);
  assert.equal(dir.tokens.get(gone).ship, null);
  assert.deepEqual(errors, []);
});

test('the yard keeps a ticket that one look at the board missed, and sees a new one in by the mail', async () => {
  const { dir, settle, T, board, where, errors } = await stagedYard();
  dir.update(board([T('a', 'in_progress'), T('b', 'backlog')]));
  await settle();
  assert.deepEqual(where(), { a: 'slip', b: 'shelf' });
  const ship = dir.tokens.get('a').ship;
  // a file caught half-written: the ticket is not in this look, and is there again in the next
  dir.update(board([T('b', 'backlog')]));
  dir.frame(1);
  await settle();
  dir.update(board([T('a', 'in_progress'), T('b', 'backlog')]));
  await settle();
  assert.equal(dir.tokens.get('a').ship, ship, 'the same ship on the same slip');
  // gone for good: forgotten, its slip free
  dir.update(board([T('b', 'backlog')]));
  for (let i = 0; i < 8; i++) dir.frame(1);
  assert.equal(dir.tokens.has('a'), false);
  assert.deepEqual(dir.slipOf, [null, null, null, null]);
  // a ticket first seen while the page is open comes by the mail boat, step by step to where it is
  dir.update(board([T('b', 'backlog'), T('n', 'todo')]));
  assert.equal(where().n, 'mail');
  await settle();
  assert.equal(where().n, 'queue');
  // two reviews with a reviewer each: the inspector goes to both in turn
  dir.update(board([T('x', 'review', { run: { role: 'reviewer' } }), T('y', 'review', { run: { role: 'reviewer' } })]));
  for (let i = 0; i < 8; i++) dir.frame(1);
  await settle();
  const seen = new Set([0, 1, 2, 3].map(() => dir.underReview().id));
  assert.deepEqual([...seen].sort(), ['x', 'y']);
  assert.deepEqual(errors, []);
});

test('on this machine only, a request under another host name is refused; --lan answers under this machine\'s name', async () => {
  const root = workspace();
  repo(root, 'toko');
  const local = await serve(root);
  assert.equal(local.server.address().address, '127.0.0.1');
  assert.equal((await raw(local, '/api/projects', { host: 'evil.example' })).status, 403);
  assert.equal((await raw(local, '/api/projects', { host: `localhost:${local.port}` })).status, 200);
  const lan = await serve(root, { lan: true });
  assert.equal(lan.server.address().address, '0.0.0.0');
  assert.equal((await raw(lan, '/api/projects', { host: `${os.hostname()}:4322` })).status, 200);
});

test('an agent at work: its role, and its step read from the transcript the hook recorded', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const id = ticket(r, 'Tombol simpan');
  assert.equal(r.k('start', id).code, 0);
  // The session's transcript, and beside it the subagent's, as Claude Code keeps them.
  const session = path.join(root, 'claude', 'sess-1.jsonl');
  const agentFile = path.join(root, 'claude', 'sess-1', 'subagents', 'agent-abc123def.jsonl');
  fs.mkdirSync(path.dirname(agentFile), { recursive: true });
  fs.writeFileSync(session, '');
  const hook = sh(r.dir, K2, ['hook', 'agent-sent'], JSON.stringify({
    cwd: r.dir, transcript_path: session, tool_name: 'Agent',
    tool_input: { subagent_type: 'kerjaan2:worker', prompt: `Ticket ${id}. Run k2 brief first.` },
    tool_response: { agentId: 'abc123def' },
  }));
  assert.equal(hook.code, 0, hook.out);
  const state = JSON.parse(fs.readFileSync(path.join(r.dir, '.kerjaan2', '.state', 'tickets', `${id}.json`), 'utf8'));
  assert.equal(state.worker.agent, 'abc123def');
  assert.equal(state.worker.transcript, agentFile);

  const s = await serve(root);
  // Sent, but nothing done yet: the role shows, the step does not.
  let st = (await get(s, '/api/p/toko/state')).body;
  let t = st.tickets.find((x) => x.id === id);
  assert.equal(t.run.role, 'worker');
  assert.equal(t.run.agent, 'abc123def');
  assert.equal(typeof t.run.since, 'number');
  assert.equal(t.last.event, 'agent');
  assert.equal(t.worktree.startsWith('.worktrees/'), true);
  assert.deepEqual(st.live.agents, {});

  const line = (ts, content) => JSON.stringify({ type: 'assistant', timestamp: new Date(ts).toISOString(), message: { role: 'assistant', content } });
  const at = Date.now() + 2000;
  fs.writeFileSync(agentFile, [
    line(at, [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/y/app.txt' } }]),
    line(at + 1000, [{ type: 'text', text: 'Sekarang uji.' }, { type: 'tool_use', name: 'Bash', input: { command: 'k2 test 1234', description: 'Menjalankan seluruh uji' } }]),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }),
  ].join('\n') + '\n');
  st = (await get(s, '/api/p/toko/state')).body;
  assert.deepEqual(st.live.agents[id], { step: 'Menjalankan seluruh uji', command: 'k2 test 1234', at: at + 1000 });

  // A Bash call with no description shows its command; other tools their file.
  fs.appendFileSync(agentFile, line(at + 2000, [{ type: 'tool_use', name: 'Edit', input: { file_path: '/x/y/app.txt', old_string: 'a', new_string: 'b' } }]) + '\n');
  assert.equal((await get(s, '/api/p/toko/state')).body.live.agents[id].step, 'Edit app.txt');
});

test('the planner at work: the board state says so and since when, with its last step; ended, resumed, and never left working for ever', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const session = path.join(root, 'claude', 'sess-1.jsonl');
  const agentFile = path.join(root, 'claude', 'sess-1', 'subagents', 'agent-perencana1.jsonl');
  fs.mkdirSync(path.dirname(agentFile), { recursive: true });
  fs.writeFileSync(session, '');
  const hook = (name, payload) => assert.equal(sh(r.dir, K2, ['hook', name], JSON.stringify({ cwd: r.dir, transcript_path: session, ...payload })).code, 0);
  const s = await serve(root);
  const live = async () => (await get(s, '/api/p/toko/state')).body.live;
  const file = path.join(r.dir, '.kerjaan2', '.state', 'planner.json');

  // No planner was ever sent: the state says so, and reading it wrote nothing.
  assert.equal((await live()).planner, null);
  assert.equal(fs.existsSync(file), false, 'the viewer does not write the record');

  const before = Date.now();
  hook('agent-sent', { tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan2:planner', prompt: 'Plan the backlog.' }, tool_response: { status: 'async_launched', agentId: 'perencana1' } });
  let p = (await live()).planner;
  assert.equal(p.agent, 'perencana1');
  assert.ok(p.since >= before && p.since <= Date.now());
  assert.equal(p.step, null, 'sent, nothing done yet');
  assert.equal(p.ticket, undefined);
  // No ticket is in flight for it, and it takes no place.
  const st = (await get(s, '/api/p/toko/state')).body;
  assert.equal(st.places.used, 0);
  assert.deepEqual(st.live.agents, {});

  // Its last step, from the transcript.
  const line = (ts, content) => JSON.stringify({ type: 'assistant', timestamp: new Date(ts).toISOString(), message: { role: 'assistant', content } }) + '\n';
  fs.writeFileSync(agentFile, line(Date.now() + 1000, [{ type: 'tool_use', name: 'Bash', input: { command: 'k2 list backlog', description: 'Membaca backlog' } }]));
  p = (await live()).planner;
  assert.equal(p.step, 'Membaca backlog');
  assert.equal(p.command, 'k2 list backlog');
  assert.equal(typeof p.at, 'number');

  // It stops: no longer at work. A message resumes it: at work again, and a step of before the resume is not this one's.
  const mtime = fs.statSync(file).mtimeMs;
  await live();
  assert.equal(fs.statSync(file).mtimeMs, mtime, 'reading leaves the record as it is');
  hook('subagent-stop', { agent_id: 'perencana1', agent_type: 'kerjaan2:planner' });
  assert.equal((await live()).planner, null);
  fs.writeFileSync(agentFile, line(Date.now() - 5000, [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/lama.md' } }]));
  hook('agent-sent', { tool_name: 'SendMessage', tool_input: { to: 'perencana1', message: 'The owner answered.' }, tool_response: { success: true } });
  p = (await live()).planner;
  assert.equal(p.agent, 'perencana1');
  assert.equal(p.step, null);

  // Never seen stopping (the session was closed): after stuck_after_minutes with no sign of life it is not at work.
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const limit = 60 * 60000;
  fs.writeFileSync(agentFile, '');
  fs.writeFileSync(file, JSON.stringify({ ...rec, at: Date.now() - limit + 30000 }));
  assert.equal((await live()).planner.agent, 'perencana1', 'just under the limit');
  fs.writeFileSync(file, JSON.stringify({ ...rec, at: Date.now() - limit - 1000 }));
  assert.equal((await live()).planner, null, 'over the limit');
  // A step it made lately is a sign of life: a long planning is not cut off at the limit.
  fs.writeFileSync(agentFile, line(Date.now() - 60000, [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/baru.md' } }]));
  assert.equal((await live()).planner.step, 'Read baru.md');
  fs.writeFileSync(agentFile, line(Date.now() - limit - 1000, [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/baru.md' } }]));
  assert.equal((await live()).planner, null);
  // The board's own limit, not a fixed hour.
  const settings = path.join(r.dir, '.kerjaan2', 'settings.yml');
  fs.writeFileSync(settings, fs.readFileSync(settings, 'utf8').replace(/^stuck_after_minutes:.*$/m, 'stuck_after_minutes: 5'));
  fs.writeFileSync(file, JSON.stringify({ ...rec, at: Date.now() - 4 * 60000 }));
  assert.equal((await live()).planner.agent, 'perencana1');
  fs.writeFileSync(file, JSON.stringify({ ...rec, at: Date.now() - 6 * 60000 }));
  assert.equal((await live()).planner, null);
  // A record of another shape is no planner, and no error.
  for (const junk of ['{ setengah', '[]', '{"agent":7}', '{"agent":"x"}', 'null']) {
    fs.writeFileSync(file, junk);
    const res = await get(s, '/api/p/toko/state');
    assert.equal(res.status, 200, junk);
    assert.equal(res.body.live.planner, null, junk);
  }
});

test('the Control room shows the planner as a card of its own', () => {
  const code = fs.readFileSync(path.join(path.dirname(K2), '..', 'viewer', 'web', 'app.js'), 'utf8');
  assert.match(code, /D\.live\.planner/);
  assert.match(code, /class="agent planner"/);
});

test('a transcript that is missing, empty, cut, or from an earlier dispatch gives no step', () => {
  const root = workspace();
  const f = path.join(root, 't.jsonl');
  assert.equal(lastStep(undefined), null);
  assert.equal(lastStep(path.join(root, 'none.jsonl')), null);
  fs.writeFileSync(f, '');
  assert.equal(lastStep(f), null);
  fs.writeFileSync(f, '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"comm\n');
  assert.equal(lastStep(f), null);
  const old = JSON.stringify({ type: 'assistant', timestamp: new Date(1000).toISOString(), message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } });
  fs.writeFileSync(f, old + '\n');
  assert.equal(lastStep(f, Date.now()), null);
  assert.equal(lastStep(f, 0).step, 'ls');
});

test('a test run in progress shows while the k2 that runs it lives, and only then', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const id = ticket(r, 'Tombol simpan');
  assert.equal(r.k('start', id).code, 0);
  const dir = path.join(r.dir, '.kerjaan2', '.state', 'progress');
  // A real run leaves no marker behind once it has ended.
  assert.equal(r.k('test', id).code, 0);
  assert.equal(fs.existsSync(path.join(dir, `${id}.pid`)), false);
  const s = await serve(root);
  assert.deepEqual((await get(s, '/api/p/toko/state')).body.live.tests, {});
  // A run that failed left its output; with no living runner it is not "running".
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.log`), 'one\ntwo\nthree\n');
  fs.writeFileSync(path.join(dir, `${id}.pid`), '999999');
  assert.deepEqual((await get(s, '/api/p/toko/state')).body.live.tests, {});
  fs.writeFileSync(path.join(dir, `${id}.pid`), String(process.pid));
  const run = (await get(s, '/api/p/toko/state')).body.live.tests[id];
  assert.deepEqual(run.tail, ['one', 'two', 'three']);
  assert.equal(typeof run.since, 'number');
  assert.equal(typeof run.lastOutput, 'number');
});

test('a worktree that belongs to no ticket in flight is shown as an orphan', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const id = ticket(r, 'Tombol simpan');
  assert.equal(r.k('start', id).code, 0);
  fs.mkdirSync(path.join(r.dir, '.worktrees', '991231235901-sisa-lama'), { recursive: true });
  const s = await serve(root);
  const st = (await get(s, '/api/p/toko/state')).body;
  assert.deepEqual(st.orphans.map((o) => o.path), ['.worktrees/991231235901-sisa-lama']);
  // doctor still finds the same one, from the same code.
  assert.match(r.k('doctor').out, /991231235901-sisa-lama belongs to no ticket in flight/);
});

test('the page is told when the board changes', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const s = await serve(root);
  const ac = new AbortController();
  const res = await fetch(`http://127.0.0.1:${s.port}/api/p/toko/events`, { signal: ac.signal });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  let seen = '';
  const until = async (re, ms) => {
    const end = Date.now() + ms;
    while (!re.test(seen) && Date.now() < end) {
      const chunk = await Promise.race([reader.read(), new Promise((ok) => setTimeout(() => ok(null), end - Date.now()))]);
      if (!chunk || chunk.done) break;
      seen += Buffer.from(chunk.value).toString('utf8');
    }
    return re.test(seen);
  };
  await until(/retry:/, 3000);
  ticket(r, 'Tiket baru');
  assert.equal(await until(/event: board/, 8000), true, seen);
  ac.abort();
});

test('a board that cannot be read is said on its card, and the others still show', async () => {
  const root = workspace();
  repo(root, 'baik');
  const bad = repo(root, 'rusak');
  fs.appendFileSync(path.join(bad.dir, '.kerjaan2', 'settings.yml'), '\nmax_parallel: banyak\n');
  const s = await serve(root);
  const list = (await get(s, '/api/projects')).body.projects;
  assert.equal(list.find((p) => p.name === 'baik').counts.todo, 0);
  assert.match(list.find((p) => p.name === 'rusak').error, /max_parallel/);
  const st = await get(s, '/api/p/rusak/state');
  assert.equal(st.status, 500);
  assert.match(st.body.error, /max_parallel/);
});

test('k2 view refuses a bad port and a folder that is not there; an agent may not start it', () => {
  const root = workspace();
  const r = repo(root, 'toko');
  assert.match(r.k('view', '--port', 'abc').out, /--port must be a number/);
  assert.match(r.k('view', '--root', path.join(root, 'tidak-ada')).out, /is not a folder/);
  const asWorker = sh(r.dir, K2, ['view'], undefined, { K2_ROLE: 'worker', K2_AGENT: 'x' });
  assert.equal(asWorker.code, 6);
  assert.match(asWorker.out, /not the worker's to run/);
});

// ----- found by the independent review of 0.15.0 -----

import vm from 'node:vm';
import { spawn } from 'node:child_process';

// A ticket with one criterion and none for the owner, so it can be handed over.
function plainTicket(r, title, lane = 'standard') {
  const out = r.k('new', title, '--type', 'feature', '--lane', lane, '--status', 'todo').out;
  const file = out.split('\n')[0];
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Request\n', '## Request\nBaris baru ada di berkas.\n').replace('## Done when\n', '## Done when\n- [ ] Baris baru tampil\n'));
  return path.basename(file).slice(0, 12);
}
const wtOf = (r, id) => path.join(r.dir, '.worktrees', fs.readdirSync(path.join(r.dir, '.worktrees')).find((n) => n.startsWith(id)));
// start → a commit → evidence → handoff → submit.
function handOver(r, id) {
  assert.equal(r.k('start', id).code, 0);
  const wt = wtOf(r, id);
  fs.writeFileSync(path.join(wt, `${id}.txt`), 'baru\n');
  sh(wt, 'git', ['add', '-A']);
  sh(wt, 'git', ['commit', '-qm', `work ${id}`]);
  assert.equal(r.k('check', id, '1', 'dijalankan dan terlihat').code, 0);
  assert.equal(r.k('handoff', id, 'Menambah satu berkas.').code, 0);
  const s = sh(wt, K2, ['submit', id]);
  assert.equal(s.code, 0, s.out);
}
// The events of one project, as the page hears them.
async function listen(s, name) {
  const ac = new AbortController();
  const res = await fetch(`http://127.0.0.1:${s.port}/api/p/${name}/events`, { signal: ac.signal });
  const reader = res.body.getReader();
  let seen = '';
  let pending = null;
  const until = async (re, ms) => {
    const end = Date.now() + ms;
    while (!re.test(seen) && Date.now() < end) {
      pending ||= reader.read();
      const chunk = await Promise.race([pending, new Promise((ok) => setTimeout(() => ok(null), Math.max(0, end - Date.now())))]);
      if (!chunk) break;
      pending = null;
      if (chunk.done) break;
      seen += Buffer.from(chunk.value).toString('utf8');
    }
    return re.test(seen);
  };
  return { status: res.status, until, forget: () => { seen = ''; }, text: () => seen, close: () => { ac.abort(); (pending || Promise.resolve()).catch(() => {}); } };
}
const stateOf = async (s, name) => (await get(s, `/api/p/${name}/state`)).body;
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

test('an agent that becomes stuck reaches the page though no file changed', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const id = plainTicket(r, 'Tombol simpan');
  assert.equal(r.k('start', id).code, 0);
  assert.equal(r.k('agent', id, 'worker', 'wa').code, 0);
  // Three seconds short of the limit (60 minutes by default).
  const file = path.join(r.dir, '.kerjaan2', '.state', 'tickets', `${id}.json`);
  const st = JSON.parse(fs.readFileSync(file, 'utf8'));
  st.worker.at = Date.now() - 60 * 60000 + 3000;
  fs.writeFileSync(file, JSON.stringify(st));
  const s = await serve(root);
  const ev = await listen(s, 'toko');
  await ev.until(/retry:/, 3000);
  assert.deepEqual((await stateOf(s, 'toko')).inbox.map((i) => i.kind), []);
  assert.equal(await ev.until(/event: board/, 8000), true, 'the page is told when the clock makes an agent stuck');
  assert.deepEqual((await stateOf(s, 'toko')).inbox.map((i) => i.kind), ['stuck']);
  assert.match(r.k('inbox').out, /stuck \(1\)/);
  ev.close();
});

test('looking at a board with a stray worktree leaves the repository as it was, index and locks included', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const id = plainTicket(r, 'Tombol simpan');
  assert.equal(r.k('commit-board').code, 0);
  assert.equal(r.k('start', id).code, 0);
  fs.mkdirSync(path.join(r.dir, '.worktrees', '991231235901-sisa-lama'), { recursive: true });
  // A tracked file written again with the same bytes: git status would want to refresh the index.
  await wait(1100);
  fs.writeFileSync(path.join(r.dir, 'app.txt'), 'line one\n');
  const print = () => {
    const out = [];
    const walk = (d) => {
      for (const n of fs.readdirSync(d).sort()) {
        const f = path.join(d, n);
        const st = fs.lstatSync(f);
        out.push(`${f} ${st.isDirectory() ? 'dir' : st.size} ${st.mtimeMs} ${st.ino}`);
        if (st.isDirectory()) walk(f);
      }
    };
    walk(r.dir);
    return out.join('\n');
  };
  const before = print();
  const s = await serve(root);
  const ev = await listen(s, 'toko');
  await ev.until(/retry:/, 3000);
  for (const p of ['/api/projects', '/api/p/toko/state', `/api/p/toko/ticket/${id}`]) assert.equal((await get(s, p)).status, 200, p);
  assert.equal((await stateOf(s, 'toko')).orphans.length, 1);
  await wait(1500);
  ev.close();
  assert.equal(print(), before);
});

test('the viewer never waits for the board: it answers while another command holds the lock', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  plainTicket(r, 'Tombol simpan');
  const lock = path.join(r.dir, '.kerjaan2', '.state', 'board.lock');
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
  const s = await serve(root);
  const answer = await Promise.race([get(s, '/api/p/toko/state'), wait(4000).then(() => null)]);
  fs.rmSync(lock, { recursive: true, force: true });
  assert.ok(answer, 'no answer within four seconds');
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.live.locks.map((l) => l.name), ['board']);
});

test('a broken link under .worktrees is reported by doctor as before, and does not break the page', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  fs.mkdirSync(path.join(r.dir, '.worktrees'), { recursive: true });
  fs.symlinkSync('/nonexistent-k2', path.join(r.dir, '.worktrees', 'putus'));
  const d = r.k('doctor');
  assert.match(d.out, /worktree .*putus belongs to no ticket in flight/);
  assert.ok(!/ENOENT|at strayWorktrees/.test(d.out), d.out);
  const s = await serve(root);
  assert.equal((await get(s, '/api/p/toko/state')).status, 200);
});

test('a page that follows a board hears when it becomes unreadable and when it is readable again', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const file = path.join(r.dir, '.kerjaan2', 'settings.yml');
  const good = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, `${good}\nmax_parallel: banyak\n`);
  const s = await serve(root);
  assert.equal((await get(s, '/api/p/toko/state')).status, 500);
  const ev = await listen(s, 'toko');
  await ev.until(/retry:/, 3000);
  fs.writeFileSync(file, good);
  assert.equal(await ev.until(/event: board/, 6000), true, 'readable again');
  assert.equal((await get(s, '/api/p/toko/state')).status, 200);
  ev.forget();
  fs.renameSync(r.dir, path.join(root, 'toko-pindah'));
  assert.equal(await ev.until(/event: board/, 6000), true, 'gone');
  assert.equal((await get(s, '/api/p/toko/state')).status, 404);
  ev.close();
});

test('every line of a trail reads as words: no missing field shows as "undefined"', () => {
  const code = fs.readFileSync(path.join(path.dirname(K2), '..', 'viewer', 'web', 'trail.js'), 'utf8');
  const box = {};
  vm.runInNewContext(code, { window: box });
  const text = (e) => Array.from(box.K2Trail.eventText(e));
  // The shapes core/cmd-work.mjs writes.
  assert.deepEqual(text({ event: 'verdict', result: 'pass', integration: true, commit: 'abc1234' }).slice(0, 2), ['Bringing main in: passed by the reviewer', 'at abc1234']);
  assert.equal(text({ event: 'verdict', result: 'reject', integration: true, commit: 'abc1234' })[0], 'Bringing main in: sent back by the reviewer');
  assert.equal(text({ event: 'verdict', result: 'pass', round: 2, commit: 'abc1234' })[0], 'Passed review, round 2');
  assert.deepEqual(text({ event: 'held', reason: 'question Q1 is not answered' }).slice(0, 2), ['Merge held', 'question Q1 is not answered']);
  assert.deepEqual(text({ event: 'integrate', conflict: true }).slice(0, 2), ['Main moved: bringing it in', 'conflict with main']);
  assert.deepEqual(text({ event: 'integrate', conflict: false }).slice(0, 2), ['Main moved: bringing it in', 'the tests failed on the merged content']);
  assert.deepEqual(text({ event: 'something-new' }).slice(0, 2), ['something-new', '']);
  const shapes = [
    { event: 'created' }, { event: 'moved', to: 'todo' }, { event: 'started' }, { event: 'agent', role: 'worker' }, { event: 'test', exit: 0 }, { event: 'check', n: 1 },
    { event: 'uncheck', n: 1 }, { event: 'void', n: 1 }, { event: 'manual', key: 'M1' }, { event: 'question', key: 'Q1' }, { event: 'answer', key: 'Q1' }, { event: 'assumption', key: 'A1' },
    { event: 'conflict' }, { event: 'submitted' }, { event: 'verdict' }, { event: 'integrate' }, { event: 'integrated' }, { event: 'held' }, { event: 'landed' }, { event: 'accepted' },
    { event: 'amended' }, { event: 'released' }, { event: 'retry' },
  ];
  for (const e of shapes) assert.ok(!/undefined|null/.test(text(e).slice(0, 2).join(' ')), `${e.event}: ${text(e).join(' | ')}`);
});

test('a pause the owner lifted with `k2 go` is no longer shown as a pause', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const id = plainTicket(r, 'Tombol simpan');
  assert.equal(r.k('queue', 'set', id, '--pause-before', id).code, 0);
  const s = await serve(root);
  assert.deepEqual((await stateOf(s, 'toko')).queue.pause, [id]);
  assert.equal(r.k('go', id).code, 0);
  assert.match(r.k('next').out, new RegExp(`START\\s+${id}`));
  assert.deepEqual((await stateOf(s, 'toko')).queue.pause, []);
});

test('a real test run shows as running while it runs, and the page hears what is live', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  fs.writeFileSync(path.join(r.dir, 'check.js'), "console.log('mulai');setTimeout(()=>process.exit(0), 2500)\n");
  r.git('commit', '-qam', 'slow check');
  const id = plainTicket(r, 'Tombol simpan');
  assert.equal(r.k('start', id).code, 0);
  const s = await serve(root);
  const ev = await listen(s, 'toko');
  await ev.until(/retry:/, 3000);
  const run = spawn(K2, ['test', id], { cwd: r.dir, env: cleanEnv(), stdio: 'ignore' });
  const ended = new Promise((ok) => run.on('exit', ok));
  let seen = null;
  // The run shows as soon as it starts; its first line of output a moment later.
  for (let i = 0; i < 20 && !seen?.tail.length; i++) { await wait(150); seen = (await stateOf(s, 'toko')).live.tests[id] || seen; }
  assert.ok(seen, 'the run never showed');
  assert.deepEqual(seen.tail, ['mulai']);
  assert.equal(await ev.until(/event: live/, 4000), true, 'no word of the run reached the page');
  const st = await stateOf(s, 'toko');
  assert.equal(st.live.locks.find((l) => l.name === 'test')?.ticket, id);
  assert.equal(await ended, 0);
  assert.deepEqual((await stateOf(s, 'toko')).live.tests, {});
  ev.close();
});

test('the page sees a change made after it first looked', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  plainTicket(r, 'Satu');
  const s = await serve(root);
  assert.equal((await stateOf(s, 'toko')).tickets.length, 1);
  assert.equal((await stateOf(s, 'toko')).tickets.length, 1);
  plainTicket(r, 'Dua');
  assert.equal((await stateOf(s, 'toko')).tickets.length, 2);
});

test('who is on a ticket, through its life: worker, nobody, reviewer, nobody; then the merge queue', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const id = plainTicket(r, 'Tombol simpan');
  const s = await serve(root);
  const look = async () => { const st = await stateOf(s, 'toko'); return { st, t: st.tickets.find((x) => x.id === id) }; };
  assert.equal(r.k('start', id).code, 0);
  let v = await look();
  assert.equal(v.t.run, undefined, 'started, nobody sent');
  assert.deepEqual(v.st.places, { used: 1, max: 3 }, 'a started ticket takes a place though nobody is on it');
  assert.equal(r.k('agent', id, 'worker', 'wa').code, 0);
  assert.equal((await look()).t.run.role, 'worker');
  assert.equal(r.k('release', id, 'worker').code, 0);
  assert.equal((await look()).t.run, undefined, 'released');
  assert.equal(r.k('agent', id, 'worker', 'wb').code, 0);
  assert.equal((await look()).t.run.agent, 'wb');
  // Handed over: the worker's step is over though nobody ended it.
  const wt = wtOf(r, id);
  fs.writeFileSync(path.join(wt, 'baru.txt'), 'baru\n');
  sh(wt, 'git', ['add', '-A']);
  sh(wt, 'git', ['commit', '-qm', 'work']);
  r.k('check', id, '1', 'terlihat');
  r.k('handoff', id, 'Satu berkas baru.');
  assert.equal(sh(wt, K2, ['submit', id]).code, 0);
  v = await look();
  assert.equal(v.t.status, 'review');
  assert.equal(v.t.run, undefined, 'in review, no reviewer yet');
  assert.deepEqual(v.st.mergeQueue, []);
  assert.equal(r.k('agent', id, 'reviewer', 'rv').code, 0);
  assert.equal((await look()).t.run.role, 'reviewer');
  assert.equal(r.k('verdict', id, 'pass', '--note', '1: terlihat').code, 0);
  v = await look();
  assert.equal(v.t.run, undefined, 'passed: the reviewer is done');
  assert.equal(v.t.state.passed, true);
  assert.equal(v.t.badges.unmerged, true);
  assert.deepEqual(v.st.mergeQueue, [id]);
  assert.equal(r.k('land', id).code, 0);
  v = await look();
  assert.equal(v.t.status, 'done');
  assert.equal(typeof v.t.landed, 'number');
  assert.deepEqual(v.st.mergeQueue, []);
  assert.deepEqual(v.st.places, { used: 0, max: 3 });
});

test('many pages on one board share one watch, and it ends with the last of them', async () => {
  const root = workspace();
  repo(root, 'toko');
  const s = await serve(root);
  assert.equal(s.watches(), 0);
  const all = await Promise.all([listen(s, 'toko'), listen(s, 'toko'), listen(s, 'toko')]);
  for (const ev of all) await ev.until(/retry:/, 3000);
  assert.equal(s.watches(), 1);
  all[0].close();
  await wait(300);
  assert.equal(s.watches(), 1);
  all[1].close();
  all[2].close();
  for (let i = 0; i < 20 && s.watches(); i++) await wait(100);
  assert.equal(s.watches(), 0);
  // A HEAD on the stream is answered and ended, not left open.
  const head = await Promise.race([raw(s, '/api/p/toko/events', { host: `127.0.0.1:${s.port}` }, 'HEAD'), wait(2000).then(() => null)]);
  assert.ok(head, 'HEAD never ended');
  assert.equal(s.watches(), 0);
});

test('--lan answers under this machine\'s addresses and name only', async () => {
  const root = workspace();
  repo(root, 'toko');
  const s = await serve(root, { lan: true });
  const ask = (host) => raw(s, '/api/projects', { host }).then((x) => x.status);
  assert.equal(await ask('attacker.example'), 403);
  assert.equal(await ask(`attacker.example:${s.port}`), 403);
  assert.equal(await ask('192.168.1.20.attacker.example'), 403);
  assert.equal(await ask(`127.0.0.1:${s.port}`), 200);
  assert.equal(await ask(`localhost:${s.port}`), 200);
  assert.equal(await ask(`${os.hostname()}:${s.port}`), 200);
  const mine = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal);
  if (mine) assert.equal(await ask(`${mine.address}:${s.port}`), 200);
});

test('a transcript of an unexpected shape gives no step and no failure', async () => {
  const root = workspace();
  const f = path.join(root, 't.jsonl');
  const line = (use) => JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { content: [use] } });
  fs.writeFileSync(f, line({ type: 'tool_use', name: 'Bash', input: null }) + '\n');
  assert.deepEqual(lastStep(f).step, 'Bash');
  fs.writeFileSync(f, line({ type: 'tool_use', name: null, input: 7 }) + '\n');
  assert.doesNotThrow(() => lastStep(f));
  fs.writeFileSync(f, line({ type: 'tool_use' }) + '\n' + '{"type":"assistant","message":{"content":"tool_use"}}\n');
  assert.doesNotThrow(() => lastStep(f));
});

test('k2 view refuses an empty port and words it does not know', () => {
  const root = workspace();
  const r = repo(root, 'toko');
  assert.match(r.k('view', '--port', '').out, /--port must be a number/);
  assert.match(r.k('view', 'sekarang').out, /takes no argument/);
});

test('recording an agent again by hand keeps where its transcript is', () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const id = plainTicket(r, 'Tombol simpan');
  assert.equal(r.k('start', id).code, 0);
  const session = path.join(root, 'sess.jsonl');
  sh(r.dir, K2, ['hook', 'agent-sent'], JSON.stringify({ cwd: r.dir, transcript_path: session, tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan2:worker', prompt: `Ticket ${id}.` }, tool_response: { agentId: 'abc123def' } }));
  const read = () => JSON.parse(fs.readFileSync(path.join(r.dir, '.kerjaan2', '.state', 'tickets', `${id}.json`), 'utf8')).worker;
  const where = read().transcript;
  assert.ok(where.endsWith(path.join('sess', 'subagents', 'agent-abc123def.jsonl')));
  assert.equal(r.k('release', id, 'worker').code, 0);
  assert.equal(r.k('agent', id, 'worker', 'abc123def').code, 0);
  assert.equal(read().transcript, where);
  // Another agent is another transcript: the old place is not handed on.
  assert.equal(r.k('release', id, 'worker').code, 0);
  assert.equal(r.k('agent', id, 'worker', 'zzz999').code, 0);
  assert.equal(read().transcript, undefined);
});

test('worker and reviewer are told to describe each shell step, in the board\'s language', () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const mine = plainTicket(r, 'Tombol simpan');
  assert.equal(r.k('start', mine).code, 0);
  assert.match(r.k('brief', mine, '--role', 'worker').out, /Give every Bash call a `description` in Bahasa Indonesia/);
  const theirs = plainTicket(r, 'Halaman daftar');
  handOver(r, theirs);
  assert.match(r.k('brief', theirs, '--role', 'reviewer').out, /Give every Bash call a `description` in Bahasa Indonesia/);
});

// ----- the trail since a point -----

const trail = async (s, name, since) => (await get(s, `/api/p/${name}/timeline${since === undefined ? '' : `?since=${encodeURIComponent(since)}`}`)).body;
// Every event of a board as its files hold them: ticket and line, in file order.
const written = (r) => {
  const dir = path.join(r.dir, '.kerjaan2', 'log');
  return fs.readdirSync(dir).sort().flatMap((n) => fs.readFileSync(path.join(dir, n), 'utf8').split('\n').filter(Boolean).map((l) => `${n.slice(0, 12)} ${l}`));
};
const asWritten = (e) => { const { ticket, at, ...rest } = e; return `${ticket} ${JSON.stringify(rest)}`; };

test('the trail since a point: nothing without a point, then only what came after, in time order, each naming its ticket', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const a = plainTicket(r, 'Tombol simpan');
  const s = await serve(root);
  const first = await trail(s, 'toko');
  assert.deepEqual(first.events, [], 'no point: no history');
  assert.equal(first.reread, false);
  assert.equal(typeof first.point, 'string');
  assert.ok(first.point.length > 0);
  assert.equal(typeof first.now, 'number');
  const before = written(r);
  // Nothing written: asking again gives nothing, with or without the point.
  assert.deepEqual((await trail(s, 'toko', first.point)).events, []);
  assert.deepEqual((await trail(s, 'toko')).events, []);

  const b = plainTicket(r, 'Halaman daftar'); // a ticket born after the point
  assert.equal(r.k('start', a).code, 0);
  assert.equal(r.k('agent', a, 'worker', 'wa').code, 0);
  assert.equal(r.k('start', b).code, 0);
  const second = await trail(s, 'toko', first.point);
  assert.equal(second.reread, false);
  const after1 = written(r).filter((l) => !before.includes(l));
  assert.deepEqual(second.events.map(asWritten).sort(), [...after1].sort(), 'exactly what was written after the point');
  assert.ok(second.events.length >= 4);
  for (const e of second.events) {
    assert.match(e.ticket, /^\d{12}$/);
    assert.ok([a, b].includes(e.ticket));
    assert.equal(typeof e.at, 'number');
    assert.equal(typeof e.event, 'string');
  }
  assert.ok(second.events.some((e) => e.ticket === a && e.event === 'started'));
  assert.ok(second.events.some((e) => e.ticket === b && e.event === 'created'));
  for (let i = 1; i < second.events.length; i++) assert.ok(second.events[i - 1].at <= second.events[i].at, 'oldest first');
  // Within one ticket the order is the order written.
  for (const id of [a, b]) assert.deepEqual(second.events.filter((e) => e.ticket === id).map(asWritten), after1.filter((l) => l.startsWith(id)));
  // The old point still answers, and answers the same.
  assert.deepEqual((await trail(s, 'toko', first.point)).events, second.events);
});

test('the trail in time order across tickets, whatever order their files come in', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const a = plainTicket(r, 'Satu');
  const b = plainTicket(r, 'Dua');
  const s = await serve(root);
  const p0 = (await trail(s, 'toko')).point;
  const log = (id) => path.join(r.dir, '.kerjaan2', 'log', `${id}.jsonl`);
  const [lo, hi] = [a, b].sort();
  fs.appendFileSync(log(lo), '{"t":"2026-01-01 10:00:05","event":"x3"}\n{"t":"2026-01-01 10:00:09","event":"x5"}\n');
  fs.appendFileSync(log(hi), '{"t":"2026-01-01 10:00:01","event":"x1"}\n{"t":"2026-01-01 10:00:05","event":"x4"}\n{"t":"2026-01-01 10:00:03","event":"x2"}\n');
  const got = await trail(s, 'toko', p0);
  assert.deepEqual(got.events.map((e) => e.event), ['x1', 'x2', 'x3', 'x4', 'x5']);
  assert.deepEqual(got.events.map((e) => e.ticket), [hi, hi, lo, hi, lo]);
});

test('one request after another, each from the point of the last: nothing lost, nothing twice', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const a = plainTicket(r, 'Tombol simpan');
  const s = await serve(root);
  const start = written(r);
  let point = (await trail(s, 'toko')).point;
  const seen = [];
  const ask = async () => {
    const got = await trail(s, 'toko', point);
    assert.equal(got.reread, false);
    point = got.point;
    seen.push(...got.events.map(asWritten));
    return got.events.length;
  };
  const steps = [
    () => r.k('start', a),
    () => r.k('agent', a, 'worker', 'wa'),
    () => {}, // nothing written between two requests
    () => { plainTicket(r, 'Halaman daftar'); plainTicket(r, 'Cetak nota'); },
    () => r.k('release', a, 'worker'),
    () => {},
    () => r.k('agent', a, 'worker', 'wb'),
  ];
  const counts = [];
  for (const step of steps) {
    step();
    counts.push(await ask());
  }
  assert.equal(counts[2], 0);
  assert.equal(counts[5], 0);
  assert.ok(counts[0] > 0 && counts[1] > 0 && counts[3] >= 2 && counts[4] > 0 && counts[6] > 0, JSON.stringify(counts));
  const all = written(r).filter((l) => !start.includes(l));
  assert.equal(new Set(seen).size, seen.length, 'nothing twice');
  assert.deepEqual([...seen].sort(), [...all].sort(), 'nothing lost');
  // Two pages, each with its own points, both get everything.
  const other = await serve(root);
  assert.deepEqual((await trail(other, 'toko', point)).reread, true, 'a point of another server is not known here');
});

test('a line still being written is given once, when it is whole', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const a = plainTicket(r, 'Tombol simpan');
  const s = await serve(root);
  const log = path.join(r.dir, '.kerjaan2', 'log', `${a}.jsonl`);
  let got = await trail(s, 'toko');
  fs.appendFileSync(log, '{"t":"2026-01-01 10:00:00","event":"whole"}\n{"t":"2026-01-01 10:00:01","ev');
  got = await trail(s, 'toko', got.point);
  assert.deepEqual(got.events.map((e) => e.event), ['whole']);
  fs.appendFileSync(log, 'ent":"late"}\n');
  got = await trail(s, 'toko', got.point);
  assert.deepEqual(got.events.map((e) => e.event), ['late']);
  assert.deepEqual((await trail(s, 'toko', got.point)).events, []);
});

test('the last event of a ticket that landed or was cancelled after the point is still given', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const a = plainTicket(r, 'Tombol simpan');
  const b = plainTicket(r, 'Halaman daftar');
  handOver(r, a);
  assert.equal(r.k('agent', a, 'reviewer', 'rv').code, 0);
  const passed = r.k('verdict', a, 'pass', '--note', '1: terlihat');
  assert.equal(passed.code, 0, passed.out);
  const s = await serve(root);
  const p0 = (await trail(s, 'toko')).point;
  assert.equal(r.k('land', a).code, 0);
  const cancelled = r.k('move', b, 'cancel', '--why', 'tidak jadi');
  assert.equal(cancelled.code, 0, cancelled.out);
  const st = await stateOf(s, 'toko');
  assert.equal(st.tickets.find((t) => t.id === a).status, 'done');
  assert.equal(st.tickets.find((t) => t.id === b).status, 'cancel');
  const got = await trail(s, 'toko', p0);
  const of = (id) => got.events.filter((e) => e.ticket === id);
  assert.equal(of(a).at(-1).event, 'landed');
  assert.ok(of(b).some((e) => e.event === 'moved' && e.to === 'cancel'), JSON.stringify(of(b)));
  // And once more from the new point: they are not given again.
  assert.deepEqual((await trail(s, 'toko', got.point)).events, []);
});

test('a point not known, or more than ten minutes back, is answered as no point, and the page is told to read the state again', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const r2 = repo(root, 'lain');
  const a = plainTicket(r, 'Tombol simpan');
  plainTicket(r2, 'Di papan lain');
  let now = 1_800_000_000_000;
  const s = await serve(root, { clock: () => now });
  const fresh = async (since, why) => {
    const got = await trail(s, 'toko', since);
    assert.equal(got.reread, true, why);
    assert.deepEqual(got.events, [], why);
    assert.equal(typeof got.point, 'string', why);
    // The point it gives works at once.
    const next = await trail(s, 'toko', got.point);
    assert.equal(next.reread, false, why);
    return got;
  };
  const p0 = (await trail(s, 'toko')).point;
  assert.equal(r.k('start', a).code, 0);
  for (const bad of ['', 'nope', '0', 'null', 'undefined', '../x', `${p0}x`, p0.slice(1), 'a'.repeat(5000), '__proto__', 'constructor']) await fresh(bad, `"${bad.slice(0, 20)}"`);
  // A point of another board is not one of this board.
  const foreign = (await trail(s, 'lain')).point;
  await fresh(foreign, 'another board\'s point');
  assert.equal((await trail(s, 'lain', foreign)).reread, false);

  // Ten minutes to the second is still in reach; a moment more is not.
  now += 10 * 60 * 1000;
  let got = await trail(s, 'toko', p0);
  assert.equal(got.reread, false, 'exactly ten minutes');
  assert.ok(got.events.some((e) => e.event === 'started'));
  now += 1;
  await fresh(p0, 'ten minutes and a moment');

  // A page that keeps asking while nothing is written does not grow old.
  let p = (await trail(s, 'toko')).point;
  for (let i = 0; i < 5; i++) {
    now += 4 * 60 * 1000;
    got = await trail(s, 'toko', p);
    assert.equal(got.reread, false, `quiet round ${i}`);
    p = got.point;
  }
  assert.equal(r.k('agent', a, 'worker', 'wa').code, 0);
  got = await trail(s, 'toko', p);
  assert.deepEqual(got.events.map((e) => e.event), ['agent']);
  // A page that slept for hours.
  now += 3 * 60 * 60 * 1000;
  await fresh(got.point, 'hours later');
  await fresh(p, 'hours later, an older point');

  // A trail replaced or cut short under a point: the board is not the one the point saw.
  p = (await trail(s, 'toko')).point;
  const log = path.join(r.dir, '.kerjaan2', 'log', `${a}.jsonl`);
  const text = fs.readFileSync(log, 'utf8');
  fs.writeFileSync(log, text.split('\n').slice(0, 1).join('\n') + '\n');
  await fresh(p, 'a trail cut short');
  p = (await trail(s, 'toko')).point;
  fs.rmSync(log);
  await fresh(p, 'a trail gone');
});

test('a broken line in a trail is passed over; the request still answers with the rest', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const a = plainTicket(r, 'Tombol simpan');
  const b = plainTicket(r, 'Halaman daftar');
  const s = await serve(root);
  const p0 = (await trail(s, 'toko')).point;
  const log = (id) => path.join(r.dir, '.kerjaan2', 'log', `${id}.jsonl`);
  const bad = [
    'not json at all',
    '{"t":"2026-01-01 10:00:00","event":"cut',
    '[1,2,3]',
    '42',
    'null',
    '"a string"',
    '{"event":"no time"}',
    '{"t":"yesterday","event":"bad time"}',
    '{"t":"2026-01-01 10:00:00"}',
    '{"t":"2026-01-01 10:00:00","event":7}',
    '\u0000\u0001�',
    '   ',
    '',
  ];
  fs.appendFileSync(log(a), bad.join('\n') + '\n' + '{"t":"2026-01-01 10:00:02","event":"good-a"}\n' + bad.join('\r\n') + '\n');
  fs.appendFileSync(log(b), Buffer.concat([Buffer.from([0xff, 0xfe, 0x0a]), Buffer.from('{"t":"2026-01-01 10:00:01","event":"good-b"}\n')]));
  assert.equal(r.k('start', a).code, 0); // the real CLI still writes after the damage
  const res = await get(s, `/api/p/toko/timeline?since=${p0}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.reread, false);
  assert.deepEqual(res.body.events.filter((e) => /^good/.test(e.event)).map((e) => `${e.ticket} ${e.event}`), [`${b} good-b`, `${a} good-a`]);
  assert.ok(res.body.events.some((e) => e.ticket === a && e.event === 'started'));
  assert.equal(res.body.events.length, 3, JSON.stringify(res.body.events));
  // The damage is behind the new point: it does not come back, and the next event does.
  assert.equal(r.k('agent', a, 'worker', 'wa').code, 0);
  assert.deepEqual((await trail(s, 'toko', res.body.point)).events.map((e) => e.event), ['agent']);
});

test('the trail only answers GET, and asking it changes nothing on the board', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const a = plainTicket(r, 'Tombol simpan');
  assert.equal(r.k('start', a).code, 0);
  const s = await serve(root);
  const host = { host: `127.0.0.1:${s.port}` };
  const board = path.join(r.dir, '.kerjaan2');
  const before = fingerprintOf(board);
  const status = r.git('status', '--porcelain').out;
  const wtBefore = fingerprintOf(wtOf(r, a));
  let got = await trail(s, 'toko');
  assert.equal(r.k('agent', a, 'worker', 'wa').code, 0);
  const moved = fingerprintOf(board);
  assert.notEqual(moved, before, 'the CLI moved the board');
  for (const since of [undefined, got.point, 'unknown', got.point]) got = await trail(s, 'toko', since === undefined ? undefined : since);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    for (const p of ['/api/p/toko/timeline', `/api/p/toko/timeline?since=${got.point}`]) {
      const res = await raw(s, p, host, method);
      assert.equal(res.status, 405, `${method} ${p}`);
    }
  }
  assert.equal((await get(s, '/api/p/toko/timeline/extra')).status, 404);
  assert.equal((await get(s, '/api/p/nowhere/timeline')).status, 404);
  assert.equal(fingerprintOf(board), moved, 'asking moved nothing');
  assert.equal(fingerprintOf(wtOf(r, a)), wtBefore);
  assert.equal(r.git('status', '--porcelain').out, status);
});
