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
  assert.equal(at(working).place, 'ready', 'started, and no worker sent yet: its slip is ready, its drawing not fetched');
  assert.equal(at(working).worker, 'away', 'no agent was recorded on it');
  assert.equal(at(working).build, 0);
  assert.equal(pic.docks, 3, 'as many slips as the board has places');
  assert.equal(r.k('agent', working, 'worker', 'w1').code, 0);
  const sent = picture((await get(s, '/api/p/toko/state')).body).byId.get(working);
  assert.equal(sent.place, 'slip');
  assert.ok(sent.build >= 0.25 && sent.build < 1);
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
  assert.equal(m('a').build, 0.25 + 0.75 * 0.5);
  assert.equal(m('b').reviewer, 'working');
  assert.equal(m('b').step, 'Run the checks');
  assert.equal(m('b').build, 0.25 + 0.75 * 0.5, 'handing over does not raise the hull: only a criterion met does');
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
  assert.equal(more.byId.get('q').build, 1, 'a void criterion does not count');
  assert.equal(picture({ tickets: [t('o', 'in_progress', { criteria: [{ done: true }, { done: false, owner: true }] })] }).byId.get('o').build, 1, 'nor does one that is the owner\'s to check');
  assert.equal(more.byId.get('q').asked, true, 'a question that does not block is still a question');
  assert.equal(more.byId.get('q').testing, 'silent', 'six minutes without output');
  assert.equal(more.byId.get('u').testing, 'fresh');
  assert.equal(more.byId.get('s').held, true);
  assert.deepEqual(more.fleet, ['d6', 'd5', 'd4', 'd3'], 'four ships stay at anchor');
  // the word the yard knows a stuck agent by is the word the board really writes
  assert.match(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core', 'cmd-board.mjs'), 'utf8'), /add\('stuck', '', `\$\{role\} \$\{st\[role\]\.agent\} has been on it/);

  // one step at a time towards where the board has it
  assert.deepEqual(['mail', 'shelf', 'queue', 'ready', 'slip'].map((from) => nextStep(from, 'bay')), ['deliver', 'plan', 'prepare', 'fetch', 'launch']);
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
  const { dir, settle, board, errors, E, trailOf } = await stagedYard();
  const ids = ['261113190704', '261113190701', '261113191201'];
  dir.update(board(ids.map((id) => T(id, 'in_progress', 5))), trailOf([]));
  await settle();
  const built = ids.map((id) => dir.tokens.get(id).ship);
  assert.deepEqual(built.map((s) => [s.size, s.livery]), [['medium', 'pirate-white'], ['medium', 'purple'], ['medium', 'white']]);
  dir.update(board(ids.map((id) => T(id, 'review', 5))), trailOf(ids.map((id) => E(id, 'submitted'))));
  await settle();
  dir.update(board(ids.map((id, k) => ({ ...T(id, 'done', 5), landed: k + 1 }))), trailOf(ids.map((id) => E(id, 'landed'))));
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
// `journal` is what was played, in order: each carrying step, each verdict, each change of a hull on a slip.
// The order boat of a staged yard, held by the test: every coming and going is written down, and
// each waits until the test lets it through (`boat.pass()`), unless `boat.free` is set.
function heldBoat({ world, cast, dir }, log) {
  const waiting = [];
  const boat = { free: false, pass() { for (const go of waiting.splice(0)) go(); } };
  const gate = (what) => () => { log.push(what); return boat.free ? undefined : new Promise((go) => waiting.push(go)); };
  world.mailIn = gate('boat in');
  world.mailOut = gate('boat out');
  world.mailTake = () => log.push('crate taken');
  const { courier } = cast;
  const shelved = () => [...dir.tokens.values()].filter((t) => t.place === 'shelf').map((t) => t.id).sort().join(',');
  courier.goTo = async (to) => { log.push(`courier to ${to.name} [${shelved()}]`); };
  return boat;
}
const tick = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

test('orders written close together come by one boat as one party; one written much later comes by the next', async () => {
  const { GROUP, joins } = await import('../viewer/web/space/plan.js');
  assert.equal(GROUP, 60000, 'close together: within 60 seconds of the one before');
  // the rule, case by case
  const party = { open: true, last: 100000 };
  assert.equal(joins(party, 100000), true, 'written at the same moment');
  assert.equal(joins(party, 100000 + GROUP), true, '60 seconds after the one before');
  assert.equal(joins(party, 100001 + GROUP), false, 'a moment more than 60 seconds');
  assert.equal(joins({ ...party, open: false }, 100001), false, 'the boat has left');
  assert.equal(joins(null, 100000), false, 'no boat');

  const yard = await stagedYard();
  const { dir, settle, T, board, where, errors, journal, E, trailOf, clock } = yard;
  const log = [];
  const boat = heldBoat(yard, log);
  boat.free = true;
  dir.update(board([]), trailOf([]));
  // three in one sitting, each within 60 s of the one before it (the third is 70 s after the first), a fourth much later
  const t0 = clock.t;
  const made = [['a', 0], ['b', 20000], ['c', 70000], ['d', 70000 + GROUP + 1]].map(([id, dt]) => ({ ...E(id, 'created', { status: 'backlog' }), at: t0 + dt }));
  clock.t = t0 + 140000;
  dir.update(board(['a', 'b', 'c', 'd'].map((id) => T(id, 'backlog'))), trailOf(made));
  assert.deepEqual(where(), { a: 'mail', b: 'mail', c: 'mail', d: 'mail' });
  await settle();
  assert.deepEqual(where(), { a: 'shelf', b: 'shelf', c: 'shelf', d: 'shelf' });
  // one boat and one walk for the three: nothing is on the shelf until the courier is back at it; then the next boat, for the one
  assert.deepEqual(log, [
    'boat in', 'courier to pierEnd []', 'crate taken', 'boat out', 'courier to shelf []',
    'boat in', 'courier to pierEnd [a,b,c]', 'crate taken', 'boat out', 'courier to shelf [a,b,c]',
  ]);
  assert.deepEqual(journal, ['deliver a', 'deliver b', 'deliver c', 'deliver d']);
  assert.equal(dir.party, null, 'no boat is left behind');
  assert.deepEqual(errors, []);
});

test('the boat comes in, lies at the pier and leaves; the courier goes out only to a boat that lies there, and an order shows only once filed', async () => {
  const yard = await stagedYard();
  const { dir, T, board, where, errors, E, trailOf, cast } = yard;
  const log = [];
  const boat = heldBoat(yard, log);
  const { courier } = cast;
  const work = async () => { for (let job; (job = courier.jobs.shift());) { await job.run(courier); job.done(); } await tick(); };
  dir.update(board([]), trailOf([]));
  const all = (...ids) => board(ids.map((id) => T(id, 'backlog')));
  const made = (...ids) => trailOf(ids.map((id) => E(id, 'created', { status: 'backlog' })));

  // the boat sets out as soon as the first order is seen; while it is on its way nobody is asked to the pier
  dir.update(all('a'), made('a'));
  await tick();
  assert.deepEqual(log, ['boat in']);
  assert.equal(courier.jobs.length, 0, 'no boat at the pier: the courier is not called');
  // an order written while the boat is on its way goes with it
  dir.update(all('a', 'b'), made('b'));
  await tick();
  assert.deepEqual(log, ['boat in']);
  boat.pass(); // it lies at the pier
  await tick();
  assert.equal(courier.jobs.length, 1, 'the boat lies at the pier: the courier is called, once');
  // an order written while the boat lies at the pier goes with it too
  dir.update(all('a', 'b', 'c'), made('c'));
  await tick();
  assert.equal(courier.jobs.length, 1);
  assert.deepEqual(where(), { a: 'mail', b: 'mail', c: 'mail' }, 'none shows before the courier has filed it');
  await work();
  assert.deepEqual(log, ['boat in', 'courier to pierEnd []', 'crate taken', 'boat out', 'courier to shelf []']);
  assert.deepEqual(where(), { a: 'shelf', b: 'shelf', c: 'shelf' }, 'the whole party is filed in one walk');
  // an order written once the boat has left the pier waits for the next boat, however soon it was written
  dir.update(all('a', 'b', 'c', 'd'), made('d'));
  await tick();
  assert.equal(where().d, 'mail');
  assert.equal(log.length, 5, 'the next boat does not come while the first is still in sight');
  assert.equal(courier.jobs.length, 0);
  boat.pass(); // the first boat is gone
  await tick();
  assert.equal(log[5], 'boat in');
  boat.pass();
  await tick();
  await work();
  boat.pass();
  await tick();
  assert.deepEqual(log.slice(5), ['boat in', 'courier to pierEnd [a,b,c]', 'crate taken', 'boat out', 'courier to shelf [a,b,c]']);
  assert.equal(where().d, 'shelf');
  assert.equal(dir.party, null);

  // out of hours the courier keeps off the pier: no chore of theirs goes there
  const castSrc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'web', 'space', 'cast.js'), 'utf8');
  assert.equal(castSrc.match(/pierEnd/g), null, 'nobody walks to the pier of their own accord');
  assert.deepEqual(errors, []);
});

test('an order proposed after another ticket landed is created as any other, and comes by the boat the same way', async () => {
  const yard = await stagedYard();
  const { dir, settle, T, board, where, errors, journal, E, trailOf } = yard;
  const log = [];
  heldBoat(yard, log).free = true;
  dir.update(board([T('a', 'review', { criteria: [{ done: true }], state: { passed: true } })]), trailOf([]));
  dir.update(board([T('a', 'done', { criteria: [{ done: true }], landed: 5 }), T('p', 'backlog'), T('q', 'backlog')]),
    trailOf([E('a', 'landed'), E('p', 'created', { status: 'backlog', session: 's1' }), E('q', 'created', { status: 'backlog', session: 's1' })]));
  assert.deepEqual(where(), { a: 'slip', p: 'mail', q: 'mail' });
  await settle();
  assert.deepEqual(where(), { a: 'bay', p: 'shelf', q: 'shelf' });
  assert.deepEqual(log.filter((x) => x.startsWith('boat')), ['boat in', 'boat out'], 'one boat for the two proposals');
  assert.ok(journal.includes('deliver p') && journal.includes('deliver q') && journal.includes('launch a'));
  assert.deepEqual(errors, []);
});

// `cranes`: the yard has a crane at every slip (the real ones of crane.js), moved on with every frame as the page does
async function stagedYard({ cranes = false } = {}) {
  const { Director } = await import('../viewer/web/space/director.js');
  const thing = () => ({ position: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } }, rotation: { y: 0, set() {} }, userData: {}, visible: true });
  const spot = { x: 0, z: 0 };
  const slipAt = (k) => ({ x: k * 10, z: -6.4, k, spots: Array.from({ length: 8 }, (_, i) => ({ x: k * 10, z: 0, slip: k, spot: i })), lamp() {}, label(text) { this.name = text; } });
  const world = {
    slips: [0, 1, 2, 3].map(slipAt),
    laid: [], // every layout asked for
    setDocks(n) { this.laid.push(n); this.slips.length = 0; for (let k = 0; k < n; k++) this.slips.push(slipAt(k)); },
    anchors: [0, 1, 2, 3].map((k) => ({ x: k * 10, z: 20, ry: 0 })),
    shelfSlots: Array.from({ length: 12 }, () => ({ x: 0, y: 0, z: 0, ry: 0 })), queueSlots: Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0, ry: 0 })), waitSlots: Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0, ry: 0 })),
    stations: new Proxy({}, { get: (_, name) => ({ x: 0, z: 0, name, station: name }) }), sea: 0,
    make: { scroll: thing, plank: thing, crate: thing, ship: (size, livery) => ({ o: thing(), size, livery, built: null, rigged: null, setBuild(b) { this.built = b; }, setRigged(v) { this.rigged = v; }, dispose() {} }), anchor: () => ({ o: thing(), drop: null, set(k) { this.drop = k; }, at() {} }) },
    move: async () => {}, floatOn() {}, floatOff() {}, setFlags() {}, mailIn() {}, mailTake() {}, mailOut() {},
    fade: async (o) => { faded.push(o); },
  };
  const faded = [];
  // a person keeps a diary: where they went (a station, or a slip) and what they took in their hands
  // `drama`: what the people said and did, which spot of a slip they went to, and the scenes of the review, in order
  const drama = [];
  const person = (name) => {
    const diary = [];
    return { name, jobs: [], doing: '', diary, say(glyph) { drama.push(`${name} says ${glyph}`); }, hold(item) { diary.push(item ? 'takes a drawing' : 'hands empty'); }, goTo: async (to) => { diary.push(to.station ? `to ${to.station}` : `to slip ${to.slip + 1}`); if (to.spot !== undefined) drama.push(`${name} to slip ${to.slip + 1} spot ${to.spot}`); }, act: async (what) => { drama.push(`${name} ${what}`); }, wait: async () => {} };
  };
  const cast = { courier: person('courier'), planner: person('planner'), foreman: person('foreman'), wrights: [0, 1, 2, 3].map((k) => person(`wright ${k + 1}`)), inspector: person('inspector'), crane: person('crane'), keeper: person('keeper') };
  const people = [cast.courier, cast.planner, cast.foreman, ...cast.wrights, cast.inspector, cast.crane, cast.keeper];
  const errors = [];
  const dir = new Director({ add() {}, remove() {} }, world, cast);
  if (cranes) {
    const { Crane } = await import('../viewer/web/space/crane.js');
    world.cranes = world.slips.map(() => new Crane());
    const lay = world.setDocks.bind(world);
    world.setDocks = (n) => { lay(n); while (world.cranes.length < n) world.cranes.push(new Crane()); while (world.cranes.length > n) world.cranes.pop().retire(); };
    const frame = dir.frame.bind(dir);
    dir.frame = (dt) => { for (const c of world.cranes) c.step(dt); frame(dt); };
  }
  // one shipwright for each slip, as the page keeps them
  dir.crew = (n) => {
    while (cast.wrights.length < n) { const a = person(`wright ${cast.wrights.length + 1}`); cast.wrights.push(a); people.push(a); }
    while (cast.wrights.length > n) people.splice(people.indexOf(cast.wrights.pop()), 1);
  };
  const clock = { t: 1700000000000 };
  dir.clock = () => clock.t;
  const asked = { n: 0 };
  dir.ask = () => { asked.n++; };
  const journal = [];
  for (const step of ['deliver', 'plan', 'prepare', 'fetch', 'launch', 'scrap', 'verdict']) {
    const real = dir[step].bind(dir);
    dir[step] = (tok, a, b) => { journal.push(step === 'verdict' ? `${a ? 'pass' : 'reject'} ${tok.id}` : `${step} ${tok.id}`); if (step === 'verdict' || step === 'launch') drama.push(`[${journal[journal.length - 1]}]`); return real(tok, a, b); };
  }
  for (const scene of ['handed', 'cheer']) {
    const real = dir[scene].bind(dir);
    dir[scene] = (tok, live) => { drama.push(`[${scene} ${tok.id}]`); return real(tok, live); };
  }
  const look = dir.look.bind(dir);
  dir.look = (tok) => {
    const was = tok.pic ? tok.pic.build : null;
    look(tok);
    if (was !== null && tok.pic.build !== was && tok.pic.place === 'slip') journal.push(`hull ${tok.id} ${tok.pic.build}`);
  };
  // let every job asked for be done, until nothing is being carried any more
  const settle = async () => {
    for (let i = 0; i < 400; i++) {
      for (const a of people) { const job = a.jobs.shift(); if (job) { try { await job.run(a); } catch (e) { errors.push(e); } job.done(); } }
      dir.frame(0.2); // a hull on its way up or down gets there
      await new Promise((r) => setImmediate(r));
      if (!people.some((a) => a.jobs.length) && ![...dir.tokens.values()].some((t) => t.busy)) return;
    }
    throw new Error('the yard never came to rest');
  };
  const T = (id, status, more = {}) => ({ id, title: id, status, criteria: [{ done: false }], state: {}, ...more });
  const board = (tickets, more = {}) => ({ tickets, inbox: [], queue: { order: [] }, mergeQueue: [], live: { now: 1, agents: {}, tests: {} }, ...more });
  const where = () => Object.fromEntries([...dir.tokens.values()].map((t) => [t.id, t.place]));
  // an event of the trail, and a read of it, in the shape the server gives
  const E = (ticket, event, more = {}) => ({ ticket, event, at: clock.t, ...more });
  const trailOf = (events, more = {}) => ({ now: clock.t, events, reread: false, ...more });
  // where a ticket lies on the todo table: 'front 0', 'back 2', or null when it is not drawn there
  const row = (id) => {
    const tok = dir.tokens.get(id);
    if (!tok || tok.place !== 'queue' || !tok.slot) return null;
    const f = world.queueSlots.indexOf(tok.slot), b = world.waitSlots.indexOf(tok.slot);
    return f >= 0 ? `front ${f}` : `back ${b}`;
  };
  return { dir, settle, T, board, where, errors, journal, E, trailOf, clock, asked, people, cast, row, world, drama, faded };
}

test('the yard plays the trail of a ticket: every event a scene, in the order written, none skipped and none run over', async () => {
  const { dir, settle, T, board, where, errors, journal, E, trailOf } = await stagedYard();
  const crit = (a, b) => [{ done: a }, { done: b }, { done: false, owner: true }];
  const life = (id) => [
    [T(id, 'backlog', { criteria: crit(false, false) }), [E(id, 'created', { status: 'backlog' })], 'shelf'],
    [T(id, 'todo', { criteria: crit(false, false) }), [E(id, 'moved', { to: 'todo' })], 'queue'],
    [T(id, 'in_progress', { criteria: crit(false, false) }), [E(id, 'started'), E(id, 'agent', { role: 'worker' })], 'slip'],
    // two events close together on one ticket: the last criterion met, then handed over
    [T(id, 'review', { criteria: crit(true, true) }), [E(id, 'check', { n: 1 }), E(id, 'test', { exit: 0 }), E(id, 'check', { n: 2 }), E(id, 'submitted', { to: 'review' })], 'slip'],
    [T(id, 'in_progress', { criteria: crit(true, false), rejected: 1 }), [E(id, 'verdict', { result: 'reject', round: 1, failed: '2' })], 'slip'],
    [T(id, 'review', { criteria: crit(true, true), rejected: 1, state: { passed: true } }), [E(id, 'check', { n: 2 }), E(id, 'submitted', { to: 'review' }), E(id, 'verdict', { result: 'pass', round: 2 })], 'slip'],
    [T(id, 'done', { criteria: crit(true, true), rejected: 1, landed: 5 }), [E(id, 'integrate', {}), E(id, 'integrated', {}), E(id, 'landed')], 'bay'],
  ];
  const played = (id) => ['deliver', 'plan', 'prepare', `hull ${id} 0.25`, 'fetch', `hull ${id} 0.625`, `hull ${id} 1`, `hull ${id} 0.625`, 'reject', `hull ${id} 1`, 'pass', 'launch'].map((x) => (x.startsWith('hull') ? x : `${x} ${id}`));

  dir.update(board([]), trailOf([])); // the page opens on an empty board
  // one read of the board per step of the ticket's life
  for (const [ticket, events, place] of life('a')) {
    // the board alone moves nothing: the yard shows a change when its event is played, not before
    const before = { ...where() }, n = journal.length;
    dir.update(board([ticket]));
    await settle();
    assert.deepEqual(where(), before);
    assert.equal(journal.length, n);
    dir.update(board([ticket]), trailOf(events));
    if (events[0].event === 'created') assert.equal(where().a, 'mail', 'a new order comes by the mail boat');
    await settle();
    assert.equal(where().a, place, events.map((e) => e.event).join(' '));
  }
  assert.deepEqual(journal, played('a'));
  const a = dir.tokens.get('a');
  assert.equal(a.anchor, 0);
  assert.equal(a.pic.rejected, 1);

  // the whole life in one read (the page was away for a while): the same scenes, in the same order
  journal.length = 0;
  const all = life('b');
  dir.update(board([all[6][0], all[6][0].id === 'b' ? T('a', 'done', { landed: 5 }) : null]), trailOf(all.flatMap(([, events]) => events)));
  assert.equal(where().b, 'mail');
  await settle();
  assert.equal(where().b, 'bay');
  assert.deepEqual(journal, played('b'));

  // two tickets in one read: each keeps its own order
  journal.length = 0;
  const both = [...life('c'), ...life('d')];
  const mixed = [];
  for (let i = 0; i < 7; i++) mixed.push(...life('c')[i][1], ...life('d')[i][1]);
  dir.update(board([both[6][0], both[13][0]]), trailOf(mixed));
  await settle();
  for (const id of ['c', 'd']) assert.deepEqual(journal.filter((x) => x.endsWith(` ${id}`) || x.startsWith(`hull ${id} `)), played(id));
  assert.deepEqual(errors, []);
});

test('the yard is never ahead of the board, plays faster when it is behind, and gives up the story when it is too far behind', async () => {
  const { paceOf, CALM, LATE, FAST } = await import('../viewer/web/space/plan.js');
  assert.deepEqual([CALM, LATE, FAST], [30000, 300000, 4]);
  // behind by this much -> scenes play this many times as fast (0: no story, the yard is put as the board is)
  for (const [lag, pace] of [[0, 1], [5000, 1], [30000, 1], [45000, 1.5], [60000, 2], [90000, 3], [120000, 4], [200000, 4], [300000, 4], [300001, 0], [3600000, 0]]) assert.equal(paceOf(lag), pace, `${lag} ms behind`);
  // the limits are written where the owner reads them
  const doc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'galangan-padanan.md'), 'utf8');
  for (const words of [/30 detik/, /4 kali/, /5 menit/]) assert.match(doc, words);

  const { dir, settle, T, board, where, errors, journal, E, trailOf, clock } = await stagedYard();
  dir.update(board([T('a', 'todo'), T('b', 'todo')]), trailOf([]));
  await settle();
  // an event just written: its scene plays as it is
  dir.update(board([T('a', 'in_progress'), T('b', 'todo')]), trailOf([E('a', 'started')]));
  dir.frame(0.016);
  assert.equal(dir.speed, 1);
  assert.equal(where().a, 'ready', 'its slip is taken; the foreman is still on his way to look in');
  // the scene is not over and the board moves on: the yard falls behind
  for (const [behind, speed] of [[20000, 1], [30000, 1], [45000, 1.5], [90000, 3], [120000, 4], [299000, 4]]) {
    clock.t = 1700000000000 + behind;
    dir.frame(0.016);
    assert.equal(dir.speed, speed, `${behind} ms behind`);
    assert.equal(dir.tokens.get('a').busy, true);
  }
  // caught up: the pace is its own again
  await settle();
  dir.frame(0.016);
  assert.equal(dir.speed, 1);
  dir.update(board([T('a', 'in_progress'), T('b', 'todo')]), trailOf([E('a', 'agent', { role: 'worker' })]));
  await settle();
  assert.equal(where().a, 'slip');
  assert.deepEqual(journal, ['prepare a', 'hull a 0.25', 'fetch a']);

  // more than five minutes behind: no story; everything is put as the board is now
  journal.length = 0;
  const ship = dir.tokens.get('a').ship;
  dir.update(board([T('a', 'in_progress'), T('b', 'in_progress')]), trailOf([E('b', 'started')]));
  assert.deepEqual(journal, ['prepare b'], 'the scene began');
  clock.t += 301000;
  const now = board([T('a', 'review', { criteria: [{ done: true }] }), T('b', 'review', { criteria: [{ done: true }], state: { passed: true } })]);
  dir.update(now, trailOf([E('a', 'check', { n: 1 }), E('a', 'submitted'), E('b', 'check', { n: 1 }), E('b', 'submitted'), E('b', 'verdict', { result: 'pass' })].map((e) => ({ ...e, at: e.at - 301000 }))));
  dir.frame(0.016);
  assert.deepEqual(where(), { a: 'slip', b: 'slip' });
  const b = dir.tokens.get('b');
  assert.deepEqual([b.pic.status, b.pic.build, b.pic.rigged, b.todo.length], ['review', 1, true, 0]);
  assert.deepEqual([dir.tokens.get('a').pic.status, dir.tokens.get('a').pic.build], ['review', 1]);
  assert.equal(dir.tokens.get('a').ship, ship, 'a hull that stays on its slip is not rebuilt');
  const n = journal.length;
  const built = b.ship;
  await settle(); // the foreman, cut short, finishes his walk: it changes nothing
  dir.frame(0.016);
  assert.equal(journal.filter((x) => /^(pass|reject|launch|deliver|plan|scrap|fetch)/.test(x)).length, 0, 'nothing was played');
  assert.equal(journal.length, n);
  assert.equal(b.ship, built);
  assert.deepEqual(dir.slipOf.map((t) => t && t.id), ['a', 'b', null, null]);
  assert.equal(dir.speed, 1);
  assert.deepEqual(errors, []);
});

test('a page just opened shows the board as it is, and plays no history', async () => {
  const { dir, settle, T, board, where, errors, journal, trailOf, people } = await stagedYard();
  const D = board([T('s', 'backlog'), T('q', 'todo'), T('w', 'in_progress', { criteria: [{ done: true }, { done: false }] }), T('r', 'review', { criteria: [{ done: true }], state: { passed: true }, rejected: 2 }), T('d', 'done', { landed: 5 }), T('x', 'cancel')]);
  dir.update(D, trailOf([])); // the first read of the trail has no point: the server gives no history
  assert.deepEqual(where(), { s: 'shelf', q: 'queue', w: 'slip', r: 'slip', d: 'bay', x: 'scrap' }, 'at once');
  assert.equal(people.some((a) => a.jobs.length), false, 'nobody was asked to carry anything');
  assert.equal([...dir.tokens.values()].some((t) => t.busy), false);
  const w = dir.tokens.get('w'), r = dir.tokens.get('r');
  assert.deepEqual([w.shown, w.pic.build], [0.625, 0.625]);
  assert.deepEqual([r.pic.rigged, r.pic.rejected, r.pic.build], [true, 2, 1]);
  assert.ok(dir.tokens.get('d').ship && dir.tokens.get('d').anchor === 0);
  await settle();
  dir.update(D, trailOf([]));
  await settle();
  assert.deepEqual(journal, []);
  assert.deepEqual(errors, []);
});

test('a hull rises or falls only when a criterion is met, taken back or struck out; never while an agent merely works', async () => {
  const { dir, settle, T, board, errors, journal, E, trailOf } = await stagedYard();
  const crit = (...done) => done.map((d) => (d === 'void' ? { done: false, void: true } : { done: d }));
  const at = (c, more = {}) => board([T('a', 'in_progress', { criteria: crit(...c), run: { role: 'worker' }, ...more })], { live: { now: 1, agents: { a: { step: 'Edit ledger.mjs' } }, tests: {} } });
  dir.update(at([false, false, false, false]), trailOf([]));
  const tok = dir.tokens.get('a');
  const hull = () => [tok.pic.build, Math.round(tok.shown * 1e4) / 1e4, Math.round(tok.ship.built * 1e4) / 1e4];
  // an hour of a worker at work, the board read every second: the hull stands where it stood
  for (let i = 0; i < 3600; i++) { if (i % 60 === 0) dir.update(at([false, false, false, false])); dir.frame(1); }
  assert.equal(tok.pic.worker, 'working');
  assert.deepEqual(hull(), [0.25, 0.25, 0.25]);
  const step = async (c, events, build, more) => {
    dir.update(at(c, more), trailOf(events));
    await settle();
    for (let i = 0; i < 60; i++) dir.frame(1);
    assert.deepEqual(hull(), [build, build, build], events.map((e) => e.event).join(' '));
  };
  await step([true, false, false, false], [E('a', 'check', { n: 1 })], 0.25 + 0.75 / 4); // met: up
  await step([true, true, false, false], [E('a', 'check', { n: 2 })], 0.25 + 0.75 / 2);
  await step([true, false, false, false], [E('a', 'uncheck', { n: 2 })], 0.25 + 0.75 / 4); // taken back: down
  await step([true, false, false, 'void'], [E('a', 'void', { n: 4 })], 0.5); // struck out: one of three
  // everything else leaves it alone
  await step([true, false, false, 'void'], ['agent', 'test', 'question', 'answer', 'assumption', 'manual', 'retry', 'released', 'conflict', 'held'].map((e) => E('a', e)), 0.5);
  await step([true, true, true, 'void'], [E('a', 'check', { n: 2 }), E('a', 'check', { n: 3 })], 1);
  await step([true, true, true, 'void'], [E('a', 'submitted')], 1, { status: 'review' });
  await step([true, true, true, 'void'], [E('a', 'verdict', { result: 'reject', round: 1 })], 1, { rejected: 1 }); // sent back with no criterion named
  await step([true, true, false, 'void'], [E('a', 'uncheck', { n: 3 })], 0.75, { rejected: 1 });
  assert.deepEqual(journal.filter((x) => x.startsWith('hull')), [0.4375, 0.625, 0.4375, 0.5, 0.75, 1, 0.75].map((b) => `hull a ${b}`));
  assert.doesNotMatch(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'web', 'space', 'director.js'), 'utf8'), /creep/);
  assert.deepEqual(errors, []);
});

test('what the trail does not carry shows from the board as it is: the last step, a running test, a stuck agent, a question', async () => {
  const { dir, settle, T, board, errors, journal, E, trailOf } = await stagedYard();
  dir.update(board([T('a', 'in_progress'), T('b', 'in_progress')]), trailOf([]));
  const a = dir.tokens.get('a'), b = dir.tokens.get('b');
  assert.deepEqual([a.pic.worker, a.pic.step, a.pic.testing, a.pic.asked], ['away', null, null, false]);
  // a read of what is live (no trail with it): taken over at once
  const live = (more = {}) => ({ live: { now: 1000000, agents: { a: { step: 'Edit ledger.mjs' } }, tests: { a: { lastOutput: 1000000 - 90000 } } }, ...more });
  dir.update(board([T('a', 'in_progress', { run: { role: 'worker' } }), T('b', 'in_progress')], live()));
  assert.deepEqual([a.pic.worker, a.pic.step, a.pic.testing], ['working', 'Edit ledger.mjs', 'slow']);
  dir.update(board([T('a', 'in_progress', { run: { role: 'worker' } }), T('b', 'in_progress')], live({ inbox: [{ kind: 'stuck', id: 'a', text: 'worker x has been on it for 20m without handing over' }, { kind: 'question', id: 'b', text: '?' }] })));
  assert.deepEqual([a.pic.worker, b.pic.asked, dir.pic.needs], ['stuck', true, 2]);
  // what the trail does carry waits for its event, though the board already has it
  dir.update(board([T('a', 'review', { run: { role: 'reviewer' }, criteria: [{ done: true }] }), T('b', 'in_progress')], { live: { now: 1, agents: { a: { step: 'Read the diff' } }, tests: {} } }));
  assert.deepEqual([a.pic.status, a.pic.build, a.pic.reviewer, a.pic.step], ['in_progress', 0.25, 'working', 'Read the diff']);
  assert.equal(dir.underReview(), null, 'the inspector does not go round a hull the yard has not seen handed over');
  dir.update(board([T('a', 'review', { run: { role: 'reviewer' }, criteria: [{ done: true }] }), T('b', 'in_progress')]), trailOf([E('a', 'check', { n: 1 }), E('a', 'submitted')]));
  await settle();
  assert.deepEqual([a.pic.status, a.pic.build], ['review', 1]);
  assert.equal(dir.underReview(), a);
  assert.deepEqual(journal, ['hull a 1']);
  assert.deepEqual(errors, []);
});

test('a page that lost the viewer and found it again plays every scene once: none lost, none twice', async () => {
  const root = workspace();
  const r = repo(root, 'toko');
  const a = plainTicket(r, 'Tombol simpan');
  const b = plainTicket(r, 'Halaman daftar');
  const s = await serve(root);
  const { dir, settle, where, errors, journal } = await stagedYard();
  // the page's read: the board, then the trail from where it had read to
  let point;
  const read = async ({ lost = false } = {}) => {
    // (a long command of the test held this process: the server may first have to drop an idle socket)
    const D = (await get(s, '/api/p/toko/state').catch(() => get(s, '/api/p/toko/state'))).body;
    const t = await trail(s, 'toko', point);
    if (lost) return null; // the answer never arrived: the page keeps its point
    point = t.point;
    dir.update(D, t);
    await settle();
    return t;
  };
  await read();
  assert.deepEqual(where(), { [a]: 'queue', [b]: 'queue' });
  assert.deepEqual(journal, []);
  // the connection is gone while the board moves on, and a read fails
  handOver(r, a);
  await read({ lost: true });
  assert.equal(r.k('start', b).code, 0);
  assert.deepEqual(journal, [], 'nothing reached the page');
  // connected again: everything since the point, each scene once
  const back = await read();
  assert.equal(back.reread, false);
  assert.deepEqual(where(), { [a]: 'slip', [b]: 'ready' });
  const scenes = [`prepare ${a}`, `hull ${a} 1`, `fetch ${a}`, `prepare ${b}`];
  assert.deepEqual([...journal].sort(), [...scenes].sort());
  assert.deepEqual(journal.filter((x) => x.includes(a)), scenes.filter((x) => x.includes(a)), 'in order');
  assert.equal(dir.tokens.get(a).pic.status, 'review');
  // reading again, and again after another lost answer, repeats nothing
  await read();
  await read({ lost: true });
  await read();
  assert.equal(journal.length, scenes.length);
  // a point the server no longer knows (it was started again, or the page was away for too long): the yard is put
  // as the board is, with no story, and plays on from there
  assert.equal(r.k('move', a, 'in_progress', '--force', '--why', 'dibuka lagi').code, 0);
  const c = plainTicket(r, 'Laporan');
  assert.equal(r.k('start', c).code, 0);
  point = 'a-point-nobody-knows';
  const cold = await read();
  assert.equal(cold.reread, true);
  assert.deepEqual(where(), { [a]: 'slip', [b]: 'ready', [c]: 'ready' });
  assert.equal(dir.tokens.get(a).pic.status, 'in_progress');
  assert.equal(journal.length, scenes.length, 'no scene for what was missed');
  // work on a ticket nobody was seen sent for: its drawing is fetched first, then the hull rises
  assert.equal(r.k('check', b, '1', 'terlihat').code, 0);
  await read();
  assert.deepEqual(journal.slice(scenes.length), [`hull ${b} 1`, `fetch ${b}`]);
  assert.equal(where()[b], 'slip');
  assert.deepEqual(errors, []);
});

test('the yard and the board differ and no event says why: the ticket is put as the board has it, on the second look', async () => {
  const { dir, settle, T, board, where, errors, journal, E, trailOf, asked } = await stagedYard();
  dir.update(board([T('a', 'todo'), T('b', 'in_progress')]), trailOf([]));
  await settle();
  // a ticket file moved by hand, and one written by hand: no event for either
  const D = board([T('a', 'backlog'), T('b', 'in_progress', { criteria: [{ done: true }] }), T('n', 'todo')]);
  asked.n = 0;
  dir.update(D, trailOf([]));
  await settle();
  assert.deepEqual(where(), { a: 'queue', b: 'slip' }, 'one look may have caught the board between a file and its event');
  assert.ok(asked.n > 0, 'the page is asked to read again');
  dir.update(D, trailOf([]));
  await settle();
  assert.deepEqual(where(), { a: 'shelf', b: 'slip', n: 'queue' });
  assert.equal(dir.tokens.get('b').pic.build, 1);
  assert.deepEqual(journal, ['hull b 1'], 'put there, not carried');
  // an event that arrives in the second look explains the difference: it is played, not put
  journal.length = 0;
  dir.update(board([T('a', 'todo'), T('b', 'in_progress', { criteria: [{ done: true }] }), T('n', 'todo')]), trailOf([]));
  dir.update(board([T('a', 'todo'), T('b', 'in_progress', { criteria: [{ done: true }] }), T('n', 'todo')]), trailOf([E('a', 'moved', { to: 'todo' })]));
  await settle();
  assert.deepEqual(journal, ['plan a']);
  // an event of a ticket the board has not shown yet (the board was read a moment earlier) waits for the next look
  journal.length = 0;
  const first = [T('a', 'todo'), T('b', 'in_progress', { criteria: [{ done: true }] }), T('n', 'todo')];
  dir.update(board(first), trailOf([E('z', 'created', { status: 'backlog' })]));
  await settle();
  assert.equal(dir.tokens.has('z'), false);
  dir.update(board([...first, T('z', 'backlog')]), trailOf([]));
  assert.equal(where().z, 'mail');
  await settle();
  assert.equal(where().z, 'shelf');
  assert.deepEqual(journal, ['deliver z']);
  // a ticket moved back is put there with no story; one cancelled is taken away
  journal.length = 0;
  dir.update(board([T('a', 'backlog'), T('b', 'cancel'), T('n', 'todo'), T('z', 'backlog')]), trailOf([E('a', 'moved', { to: 'backlog' }), E('b', 'moved', { to: 'cancel' })]));
  await settle();
  assert.deepEqual(where(), { a: 'shelf', b: 'scrap', n: 'queue', z: 'shelf' });
  assert.deepEqual(journal, ['scrap b']);
  assert.deepEqual(dir.slipOf, [null, null, null, null]);
  assert.deepEqual(errors, []);
});

test('the yard moves tickets as the board does: four slips, each held by one ship, freed when it lands', async () => {
  const { dir, settle, T, board, where, errors, E, trailOf } = await stagedYard();
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  dir.update(board(ids.map((id) => T(id, 'todo'))), trailOf([]));
  await settle();
  assert.deepEqual(new Set(Object.values(where())), new Set(['queue']));
  // six start in one look at the board: four get a slip, two wait as drawings
  dir.update(board(ids.map((id) => T(id, 'in_progress'))), trailOf(ids.flatMap((id) => [E(id, 'started'), E(id, 'agent', { role: 'worker' })])));
  await settle();
  const berthed = [...dir.tokens.values()].filter((t) => t.place === 'slip');
  assert.equal(berthed.length, 4);
  assert.deepEqual(berthed.map((t) => t.slip).sort(), [0, 1, 2, 3]);
  assert.ok(berthed.every((t) => t.ship && dir.slipOf[t.slip] === t));
  assert.equal(Object.values(where()).filter((p) => p === 'queue').length, 2);
  assert.equal(dir.slipOf[-1], undefined);
  // one lands: its slip goes to one of the two that waited, and it lies at anchor
  const first = berthed[0].id;
  dir.update(board(ids.map((id) => T(id, id === first ? 'done' : 'in_progress', id === first ? { landed: 5 } : {}))), trailOf([E(first, 'landed')]));
  await settle();
  assert.equal(where()[first], 'bay');
  assert.equal(dir.tokens.get(first).anchor, 0);
  assert.deepEqual(dir.fleet.map((t) => t.id), [first]);
  assert.equal(Object.values(where()).filter((p) => p === 'slip').length, 4);
  assert.equal(Object.values(where()).filter((p) => p === 'queue').length, 1);
  assert.deepEqual(dir.slipOf.map((t) => t.slip), [0, 1, 2, 3]);
  // the one still waiting lands without ever having had a slip: it takes none from those at work
  const waiting = Object.entries(where()).find(([, p]) => p === 'queue')[0];
  dir.update(board(ids.map((id) => T(id, [first, waiting].includes(id) ? 'done' : 'in_progress', { landed: id === first ? 5 : id === waiting ? 9 : 0 }))), trailOf([E(waiting, 'check', { n: 1 }), E(waiting, 'submitted'), E(waiting, 'landed')]));
  await settle();
  assert.equal(where()[waiting], 'bay');
  assert.deepEqual(dir.fleet.map((t) => t.id), [first, waiting]);
  assert.equal(dir.slipOf.filter(Boolean).length, 4);
  // a cancelled hull frees its slip; a cancelled drawing leaves the board
  const gone = dir.slipOf[2].id;
  dir.update(board(ids.map((id) => T(id, id === gone ? 'cancel' : [first, waiting].includes(id) ? 'done' : 'in_progress', { landed: id === first ? 5 : id === waiting ? 9 : 0 }))), trailOf([E(gone, 'moved', { to: 'cancel' })]));
  await settle();
  assert.equal(where()[gone], 'scrap');
  assert.equal(dir.slipOf[2], null);
  assert.equal(dir.tokens.get(gone).ship, null);
  assert.deepEqual(errors, []);
});

test('a ticket that starts: its slip is made ready, and when a worker is sent the slip\'s own shipwright fetches the drawing; the keel is laid when he is back', async () => {
  const { dir, settle, T, board, where, errors, journal, E, trailOf, cast, world } = await stagedYard();
  dir.update(board([T('a', 'todo'), T('b', 'todo'), T('c', 'in_progress')]), trailOf([]));
  await settle();
  assert.deepEqual(dir.slipOf.map((t) => t && t.id), ['c', null, null, null]);
  for (const a of [cast.foreman, ...cast.wrights]) a.diary.length = 0;
  // `k2 start`: the slip is taken and named; the drawing stays with the queue and no hull stands
  dir.update(board([T('a', 'in_progress'), T('b', 'todo'), T('c', 'in_progress')]), trailOf([E('a', 'started')]));
  await settle();
  dir.frame(0.016);
  const a = dir.tokens.get('a');
  assert.deepEqual([a.place, a.slip, a.ship, !!a.obj, a.pic.build], ['ready', 1, null, true, 0]);
  assert.match(world.slips[1].name, /a$/, 'its name is up on the slip');
  assert.deepEqual(journal, ['prepare a']);
  assert.deepEqual(cast.foreman.diary, ['to slip 2'], 'the foreman looks in, and carries nothing');
  assert.deepEqual(cast.wrights[1].diary, [], 'nobody fetches before a worker is sent');
  // looks at the board alone, however many, start nothing
  for (let i = 0; i < 5; i++) { dir.update(board([T('a', 'in_progress', { run: { role: 'worker' } }), T('b', 'todo'), T('c', 'in_progress')])); await settle(); }
  assert.equal(a.ship, null);
  // the worker is sent: that slip's shipwright, and nobody else, goes to the queue and back
  let onTheWay = null;
  const walk = cast.wrights[1].goTo;
  cast.wrights[1].goTo = async function (to) { if (to.slip !== undefined) onTheWay = { ship: a.ship, obj: !!a.obj, place: a.place }; return walk.call(this, to); };
  dir.update(board([T('a', 'in_progress', { run: { role: 'worker' } }), T('b', 'todo'), T('c', 'in_progress')]), trailOf([E('a', 'agent', { role: 'worker', agent: 'w1' })]));
  assert.equal(a.ship, null, 'not at once');
  await settle();
  assert.deepEqual(cast.wrights[1].diary, ['to queue', 'takes a drawing', 'to slip 2', 'hands empty']);
  assert.deepEqual(onTheWay, { ship: null, obj: false, place: 'ready' }, 'while he carries the drawing it is off the queue, and no hull stands yet');
  assert.deepEqual([a.place, a.slip, !!a.ship, a.obj, a.pic.build], ['slip', 1, true, null, 0.25]);
  assert.deepEqual(journal, ['prepare a', 'hull a 0.25', 'fetch a']);
  assert.deepEqual(cast.foreman.diary, ['to slip 2'], 'the foreman never carried a drawing to a slip');
  for (const k of [0, 2, 3]) assert.deepEqual(cast.wrights[k].diary, []);
  // a second worker on the same ticket (sent back, sent again) fetches nothing
  dir.update(board([T('a', 'in_progress', { run: { role: 'worker' } }), T('b', 'todo'), T('c', 'in_progress')]), trailOf([E('a', 'agent', { role: 'worker', agent: 'w2' }), E('a', 'agent', { role: 'reviewer', agent: 'r1' })]));
  await settle();
  assert.equal(journal.length, 3);
  // a reviewer sent is not a worker; a ticket started and cancelled before any worker came gives its slip back
  dir.update(board([T('a', 'in_progress'), T('b', 'in_progress'), T('c', 'in_progress')]), trailOf([E('b', 'started'), E('b', 'agent', { role: 'reviewer' })]));
  await settle();
  assert.deepEqual([where().b, dir.tokens.get('b').slip], ['ready', 2]);
  dir.update(board([T('a', 'in_progress'), T('b', 'cancel'), T('c', 'in_progress')]), trailOf([E('b', 'moved', { to: 'cancel' })]));
  await settle();
  assert.deepEqual([where().b, dir.slipOf[2]], ['scrap', null]);
  // a page opened between the two events shows the same: a slip made ready, no hull
  const later = await stagedYard();
  later.dir.update(later.board([T('a', 'in_progress', { last: { event: 'started' } }), T('c', 'in_progress', { last: { event: 'agent' } })]), later.trailOf([]));
  assert.deepEqual(later.where(), { a: 'ready', c: 'slip' });
  assert.equal(later.people.some((p) => p.jobs.length), false);
  later.dir.update(later.board([T('a', 'in_progress', { run: { role: 'worker' } }), T('c', 'in_progress')]), later.trailOf([later.E('a', 'agent', { role: 'worker' })]));
  await later.settle();
  assert.deepEqual(later.journal, ['hull a 0.25', 'fetch a']);
  // no word of the foreman carrying a ticket is left in the yard
  const src = ['director.js', 'cast.js'].map((f) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'web', 'space', f), 'utf8')).join('\n');
  assert.doesNotMatch(src.slice(src.indexOf('async prepare('), src.indexOf('async fetch(')), /hold\(/);
  assert.doesNotMatch(src, /foreman[^\n]*hold\(/);
  assert.deepEqual([...errors, ...later.errors], []);
});

test('the yard has as many slips as the board has places: one row up to six, two rows from seven to ten, and nothing stands on anything else', async () => {
  const { yardOf, footprints, docksOf, picture, DOCKS_MAX } = await import('../viewer/web/space/plan.js');
  assert.equal(DOCKS_MAX, 10);
  // what the board says -> how many slips
  for (const [said, n] of [[1, 1], [3, 3], [6, 6], [7, 7], [10, 10], [11, 10], [40, 10], [0, 1], [undefined, 4]]) {
    assert.equal(docksOf(said), n, `max_parallel ${said}`);
    assert.equal(picture({ tickets: [], settings: said === undefined ? undefined : { max_parallel: said } }).docks, n);
  }
  const rows = Object.fromEntries(Array.from({ length: 10 }, (_, k) => [k + 1, [yardOf(k + 1).front, yardOf(k + 1).back]]));
  assert.deepEqual(rows, { 1: [1, 0], 2: [2, 0], 3: [3, 0], 4: [4, 0], 5: [5, 0], 6: [6, 0], 7: [4, 3], 8: [5, 3], 9: [5, 4], 10: [6, 4] });
  const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
  const inside = (p, r) => p.x0 > r.x0 && p.x0 < r.x1 && p.z0 > r.z0 && p.z0 < r.z1;
  for (let n = 1; n <= 10; n++) {
    const Y = yardOf(n);
    assert.equal(Y.docks.length, n);
    assert.equal(Y.docks.filter((d) => d.z === 0).length, Y.front);
    // every slipway of the back row runs to the water between two slips of the front row
    const front = Y.docks.slice(0, Y.front).map((d) => d.x);
    for (const d of Y.docks.slice(Y.front)) assert.ok(front.some((x, i) => i + 1 < front.length && Math.abs(d.x - (x + front[i + 1]) / 2) < 1e-9), `${n}: slip at ${d.x}`);
    const F = footprints(Y);
    const of = (kind) => F.filter((f) => f.kind === kind);
    assert.equal(of('dock').length, n);
    const solid = [...of('dock'), ...of('crane'), ...of('lighthouse'), ...of('pier'), ...of('sheds')];
    // (a crane stands on the corner of its own slip, and on nothing else)
    const own = (a, b) => a.k === b.k && [a.kind, b.kind].sort().join() === 'crane,dock';
    for (const a of solid) for (const b of solid) if (a !== b && !own(a, b)) assert.equal(hit(a, b), false, `${n} slips: ${a.kind} ${a.k ?? ''} on ${b.kind} ${b.k ?? ''}`);
    assert.equal(of('crane').length, n, 'a crane for every slip, and no other');
    // nothing stands where a hull goes down to the water, but its own slip
    for (const way of of('slipway')) for (const b of [...solid, ...of('slipway')]) if (b.k !== way.k || (b.kind !== 'dock' && b.kind !== 'slipway')) assert.equal(hit(way, b), false, `${n} slips: slipway ${way.k} on ${b.kind} ${b.k ?? ''}`);
    // where people walk and stand: clear of every slip, the crane, the lighthouse and the sheds; nobody stands where a hull of another slip goes down
    for (const path of [...of('street'), ...of('lane')]) for (const b of solid) if (b.kind !== 'pier') assert.equal(hit(path, b), false, `${n} slips: ${path.kind} on ${b.kind} ${b.k ?? ''}`);
    for (const p of of('spot')) {
      for (const b of solid) assert.equal(inside(p, b), false, `${n} slips: a place to stand at slip ${p.k} is on ${b.kind} ${b.k ?? ''}`);
      for (const way of of('slipway')) if (way.k !== p.k) assert.equal(inside(p, way), false, `${n} slips: a place to stand at slip ${p.k} is in slipway ${way.k}`);
    }
    // all of it is on the island
    for (const f of F) assert.ok(f.x0 >= -Y.half && f.x1 <= Y.half, `${n} slips: ${f.kind} is off the island`);
  }
  assert.deepEqual(yardOf(4).docks.map((d) => d.x), [-16.5, -6, 4.5, 15], 'the yard of four is the yard as it was');
  assert.equal(yardOf(4).half, 32);

  // the director keeps that many slips, and a shipwright for each
  for (const n of [1, 3, 6, 10, 14]) {
    const { dir, settle, T, board, errors, E, trailOf, cast, world } = await stagedYard();
    const ids = Array.from({ length: 12 }, (_, k) => `t${String(k).padStart(2, '0')}`);
    dir.update(board(ids.map((id) => T(id, 'todo')), { settings: { max_parallel: n } }), trailOf([]));
    const slips = Math.min(n, 10);
    assert.deepEqual([world.slips.length, cast.wrights.length, dir.slipOf.length], [slips, slips, slips], `max_parallel ${n}`);
    // twelve start: as many as there are slips are built, each by the shipwright of its slip; the rest wait as drawings
    dir.update(board(ids.map((id) => T(id, 'in_progress')), { settings: { max_parallel: n } }), trailOf(ids.flatMap((id) => [E(id, 'started'), E(id, 'agent', { role: 'worker' })])));
    await settle();
    const built = [...dir.tokens.values()].filter((t) => t.place === 'slip');
    assert.equal(built.length, slips);
    assert.deepEqual(built.map((t) => t.slip).sort((a, b) => a - b), Array.from({ length: slips }, (_, k) => k));
    assert.equal([...dir.tokens.values()].filter((t) => t.place === 'queue' && t.obj).length, 12 - slips, 'the rest wait as drawings');
    cast.wrights.forEach((a, k) => assert.deepEqual(a.diary, ['to queue', 'takes a drawing', `to slip ${k + 1}`, 'hands empty']));
    assert.deepEqual(errors, []);
  }
});

test('max_parallel changes while the page is open: the slips follow, and no ship is lost', async () => {
  const { dir, settle, T, board, where, errors, E, trailOf, cast, world } = await stagedYard();
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const at = (n, status = {}) => board(ids.map((id) => T(id, status[id] || 'in_progress', status[id] === 'done' ? { landed: 5 } : {})), { settings: { max_parallel: n } });
  dir.update(at(3), trailOf([]));
  await settle();
  assert.equal(world.slips.length, 3);
  const ships = () => Object.fromEntries([...dir.tokens.values()].filter((t) => t.ship).map((t) => [t.id, t.ship]));
  const three = ships();
  assert.deepEqual(Object.keys(three), ['a', 'b', 'c']);
  assert.deepEqual(Object.values(where()).filter((p) => p === 'queue').length, 4);
  // raised to six: three more slips and shipwrights; the hulls that stood keep standing, three that waited get a slip
  dir.update(at(6), trailOf([]));
  assert.deepEqual([world.slips.length, cast.wrights.length], [6, 6]);
  await settle();
  const six = ships();
  assert.deepEqual(Object.keys(six).sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
  for (const id of ['a', 'b', 'c']) assert.equal(six[id], three[id], `${id} is the ship it was`);
  assert.deepEqual(dir.slipOf.map((t) => t.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  // every hull stands on its own slip, wherever the new layout put that
  world.setDocks = function (n) { this.laid.push(n); this.slips.length = 0; for (let k = 0; k < n; k++) this.slips.push({ x: 100 + k * 7, z: -6.4 - (k > 3 ? 14.8 : 0), k, spots: Array.from({ length: 8 }, () => ({ x: 0, z: 0, slip: k })), lamp() {}, label() {} }); };
  // lowered to two while six hulls stand: no slip with a ship goes, and none takes a new one
  dir.update(at(2), trailOf([]));
  await settle();
  assert.equal(world.slips.length, 6, 'a slip that is to go stays until its ship has left');
  assert.deepEqual(ships(), six);
  assert.equal(where().g, 'queue');
  // the ships of slips 1, 3 and 6 land: slip 6 goes (5 is still held), and the one that waits gets none of the freed ones beyond the two
  dir.update(at(2, { a: 'done', c: 'done', f: 'done' }), trailOf(['a', 'c', 'f'].map((id) => E(id, 'landed'))));
  await settle();
  for (let i = 0; i < 3; i++) dir.frame(1);
  await settle();
  assert.deepEqual([where().a, where().c, where().f], ['bay', 'bay', 'bay']);
  assert.deepEqual([world.slips.length, cast.wrights.length], [5, 5]);
  assert.deepEqual(dir.slipOf.map((t) => t && t.id), ['g', 'b', null, 'd', 'e'], 'the one that waited took slip 1, within the two; slip 3 stays empty');
  for (const id of ['b', 'd', 'e']) {
    const tok = dir.tokens.get(id);
    assert.equal(tok.ship, six[id]);
    assert.deepEqual([tok.ship.o.position.x, tok.ship.o.position.z], [world.slips[tok.slip].x, world.slips[tok.slip].z], `${id} moved with its slip`);
  }
  for (const id of ['a', 'c', 'f']) assert.equal(dir.tokens.get(id).ship, six[id], 'the ship at anchor is the one that was built');
  // the last ones leave: two slips are left
  dir.update(at(2, { a: 'done', c: 'done', f: 'done', d: 'done', e: 'done' }), trailOf(['d', 'e'].map((id) => E(id, 'landed'))));
  await settle();
  for (let i = 0; i < 3; i++) dir.frame(1);
  assert.deepEqual([world.slips.length, cast.wrights.length, dir.slipOf.map((t) => t && t.id)], [2, 2, ['g', 'b']]);
  assert.equal(Object.keys(ships()).length, 6, 'four at anchor, two on the slips (the oldest at anchor has sailed)');
  // nothing is laid out anew while a hull is on its way down a slipway
  dir.tokens.get('b').adrift = true;
  dir.update(at(8, { a: 'done', c: 'done', f: 'done', d: 'done', e: 'done' }), trailOf([]));
  assert.equal(world.slips.length, 2);
  dir.tokens.get('b').adrift = false;
  dir.frame(1);
  assert.equal(world.slips.length, 8);
  assert.deepEqual(errors, []);
});

test('the demo can be opened with any number of slips', async () => {
  const { startDemo } = await import('../viewer/web/space/demo.js');
  const { picture } = await import('../viewer/web/space/plan.js');
  for (const n of [1, 3, 6, 10]) {
    const { dir, settle, world, cast, errors } = await stagedYard();
    const reads = [];
    const stop = startDemo((D, trail) => reads.push([D, trail]), { docks: n });
    stop();
    assert.equal(reads[0][0].settings.max_parallel, n);
    assert.equal(picture(reads[0][0]).docks, n);
    let most = 0;
    for (let i = 0; i < 400; i++) {
      if (i) stop.step();
      for (const [D, trail] of reads.splice(0)) { dir.update(D, trail); await settle(); }
      most = Math.max(most, dir.slipOf.filter((t) => t && t.ship).length);
      assert.equal(world.slips.length, n);
    }
    assert.equal(cast.wrights.length, n);
    assert.ok(most >= Math.min(n, 2) && most <= n, `${n} slips: ${most} hulls at most`);
    if (n >= 6) assert.ok(most >= n - 2, `${n} slips: the demo fills them (${most})`);
    // the made-up board gets another max_parallel while it runs
    stop.setDocks(n === 10 ? 4 : n + 1);
    stop.step();
    assert.equal(reads[0][0].settings.max_parallel, n === 10 ? 4 : n + 1);
    assert.deepEqual(errors, []);
  }
  const main = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'web', 'space', 'main.js'), 'utf8');
  assert.match(main, /QUERY\.get\('docks'\)/, 'the page takes the number from its address');
  const doc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'galangan-padanan.md'), 'utf8');
  for (const words of [/max_parallel/, /\?demo&docks=/, /dua baris/, /Shipwright 1–10/]) assert.match(doc, words);
});

test('a cancelled ticket tells no story: its token fades where it is, nobody walks for it, its place is free at once', async () => {
  const { dir, settle, T, board, where, errors, E, trailOf, faded, people, world } = await stagedYard();
  const live = [T('s', 'backlog'), T('q', 'todo'), T('w', 'in_progress', { criteria: [{ done: true }] }), T('r', 'review', { criteria: [{ done: true }] }), T('d', 'done', { landed: 5 }), T('x', 'todo')];
  dir.update(board(live), trailOf([]));
  await settle();
  assert.deepEqual(where(), { s: 'shelf', q: 'queue', w: 'slip', r: 'slip', d: 'bay', x: 'queue' });
  const slipOfW = dir.tokens.get('w').slip, anchorOfD = dir.tokens.get('d').anchor;
  const things = ['s', 'q', 'w', 'r', 'd'].map((id) => dir.tokens.get(id).ship?.o || dir.tokens.get(id).obj);
  assert.ok(things.every(Boolean));
  const cancelled = live.map((t) => (t.id === 'x' ? t : { ...t, status: 'cancel' }));
  dir.update(board(cancelled), trailOf(['s', 'q', 'w', 'r', 'd'].map((id) => E(id, 'moved', { to: 'cancel' }))));
  // nobody is asked for anything, and everything is done in the same look
  assert.ok(people.every((a) => !a.jobs.length), 'no person has a job for it');
  await settle();
  assert.deepEqual(faded, things, 'every token fades, where it was');
  for (const id of ['s', 'q', 'w', 'r', 'd']) {
    const tok = dir.tokens.get(id);
    assert.equal(tok.place, 'scrap');
    assert.equal(tok.obj, null);
    assert.equal(tok.ship, null);
  }
  assert.deepEqual(dir.slipOf, [null, null, null, null]);
  assert.equal(dir.anchorOf[anchorOfD], null);
  assert.deepEqual(dir.fleet, []);
  // the slip they left is at once taken by another ticket
  dir.update(board([...cancelled.slice(0, 5), T('x', 'in_progress')]), trailOf([E('x', 'started')]));
  await settle();
  assert.equal(dir.tokens.get('x').place, 'ready', 'its slip is made ready at once');
  assert.equal(dir.tokens.get('x').slip >= 0 && dir.slipOf[dir.tokens.get('x').slip].id, 'x');
  // a page opened on a board with a cancelled ticket shows nothing of it
  const later = await stagedYard();
  later.dir.update(later.board([later.T('k', 'cancel'), later.T('l', 'todo')]), later.trailOf([]));
  await later.settle();
  assert.deepEqual(later.where(), { k: 'scrap', l: 'queue' });
  assert.deepEqual(later.faded, []);
  assert.equal(later.dir.tokens.get('k').obj, null);
  assert.equal(later.dir.tokens.get('k').ship, null);
  assert.deepEqual(errors, []);
  void world;
});

test('the architect reads the order board while the planner works, shows a "?" while a question of the planner waits, and not otherwise', async () => {
  const { picture } = await import('../viewer/web/space/plan.js');
  const { plannerDuty } = await import('../viewer/web/space/director.js');
  const root = workspace();
  const r = repo(root, 'toko');
  const session = path.join(root, 'claude', 'sess-1.jsonl');
  const agentFile = path.join(root, 'claude', 'sess-1', 'subagents', 'agent-perencana1.jsonl');
  fs.mkdirSync(path.dirname(agentFile), { recursive: true });
  fs.writeFileSync(session, '');
  const hook = (name, payload) => assert.equal(sh(r.dir, K2, ['hook', name], JSON.stringify({ cwd: r.dir, transcript_path: session, ...payload })).code, 0);
  const asPlanner = (...a) => sh(r.dir, K2, a, undefined, { K2_ROLE: 'planner', K2_AGENT: 'perencana1' });
  const order = ticket(r, 'Pesanan baru', { status: 'backlog' });
  const other = ticket(r, 'Pesanan lain', { status: 'backlog' });
  const s = await serve(root);
  const { dir, cast, world } = await stagedYard();
  world.stations = { reading: { x: -20, z: -17 }, shelf: { x: -21, z: -17 }, drafting: { x: -13, z: -16 }, queue: { x: -3, z: -17 } };
  // the architect, with what was done written down
  const did = [];
  const a = { ...cast.planner, say: (g) => did.push(`say ${g}`), goTo: async (to) => { did.push(`go ${to === world.stations.reading ? 'order board' : 'elsewhere'}`); }, act: async (name) => { did.push(name); } };
  // one look at the real board, then one turn of the architect's duty
  const turn = async () => {
    const D = (await get(s, '/api/p/toko/state')).body;
    dir.update(D);
    did.length = 0;
    a.doing = '';
    const on = await plannerDuty(a, world, dir);
    return { on, planner: picture(D).planner, did: [...did], doing: a.doing };
  };

  // nobody plans: no duty, the architect is left to the chores of the desk, and goes nowhere
  let t = await turn();
  assert.deepEqual([t.on, t.planner, t.did], [false, { reading: false, step: null, asks: 0 }, []]);
  // a question of somebody else (the owner's session, a worker) is not the planner's
  assert.equal(r.k('ask', other, 'Ini dari sesi utama?').code, 0);
  t = await turn();
  assert.deepEqual([t.on, t.planner.asks, t.did], [false, 0, []]);

  // the planner is sent: at the order board, reading, with no "?"
  hook('agent-sent', { tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan2:planner', prompt: 'Plan the backlog.' }, tool_response: { status: 'async_launched', agentId: 'perencana1' } });
  t = await turn();
  assert.deepEqual([t.on, t.planner.reading, t.planner.asks], [true, true, 0]);
  assert.deepEqual(t.did, ['go order board', 'interact-right']);
  assert.equal(t.doing, 'reading the orders');
  // its last step is what the architect is said to be doing
  const line = (ts, content) => JSON.stringify({ type: 'assistant', timestamp: new Date(ts).toISOString(), message: { role: 'assistant', content } }) + '\n';
  fs.writeFileSync(agentFile, line(Date.now() + 1000, [{ type: 'tool_use', name: 'Bash', input: { command: 'k2 list backlog', description: 'Membaca backlog' } }]));
  t = await turn();
  assert.equal(t.doing, 'reading the orders: Membaca backlog');

  // it asks the owner two things, still at work: reading, with a "?"
  assert.equal(asPlanner('ask', order, '--blocking', 'Satu pesanan atau dua?').code, 0);
  assert.equal(asPlanner('ask', order, 'Warna apa?').code, 0);
  t = await turn();
  assert.deepEqual([t.planner.reading, t.planner.asks], [true, 2]);
  assert.deepEqual(t.did, ['go order board', 'say ?', 'interact-right']);
  // it stops and waits for the answers: the architect stays at the order board, still, with the "?"
  hook('subagent-stop', { agent_id: 'perencana1', agent_type: 'kerjaan2:planner' });
  t = await turn();
  assert.deepEqual([t.on, t.planner.reading, t.planner.asks], [true, false, 2]);
  assert.deepEqual(t.did, ['go order board', 'say ?', 'idle']);
  assert.match(t.doing, /waiting for the owner's answer to 2 questions/);
  // one answered: one is left, the "?" stays
  assert.equal(r.k('answer', order, 'Q1', 'Dua.').code, 0);
  t = await turn();
  assert.deepEqual([t.on, t.planner.asks, t.did.includes('say ?')], [true, 1, true]);
  assert.match(t.doing, /to a question/);
  // the last answered and no planner at work: no "?", no duty, away from the order board
  assert.equal(r.k('answer', order, 'Q2', 'Biru.').code, 0);
  t = await turn();
  assert.deepEqual([t.on, t.planner, t.did], [false, { reading: false, step: null, asks: 0 }, []]);
  // resumed with the answers: reading again, the "?" gone
  hook('agent-sent', { tool_name: 'SendMessage', tool_input: { to: 'perencana1', message: 'Jawaban pemilik ada di tiket.' }, tool_response: { success: true } });
  t = await turn();
  assert.deepEqual([t.planner.reading, t.did], [true, ['go order board', 'interact-right']]);
  hook('subagent-stop', { agent_id: 'perencana1', agent_type: 'kerjaan2:planner' });
  t = await turn();
  assert.deepEqual([t.on, t.did], [false, []]);
  // a question of the planner on a cancelled ticket waits for nobody
  assert.equal(asPlanner('ask', other, 'Masih perlu?').code, 0);
  assert.equal((await turn()).planner.asks, 1);
  assert.equal(r.k('move', other, 'cancel', '--why', 'tidak jadi').code, 0);
  t = await turn();
  assert.deepEqual([t.on, t.planner.asks], [false, 0]);

  // the cast: the planner's character is the Naval Architect, with this duty; no Draughtsman is left
  const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'web', 'space');
  const castJs = fs.readFileSync(path.join(web, 'cast.js'), 'utf8');
  assert.match(castJs, /name: 'Naval Architect', role: 'planner', at: 'drafting', chores: chores\.planner, duty: plannerDuty \}/);
  assert.equal([...castJs.matchAll(/\{ key: \d+, name: '/g)].length + 1, 7, 'seven kinds of people, as before');
  for (const f of fs.readdirSync(web).filter((n) => n.endsWith('.js'))) assert.doesNotMatch(fs.readFileSync(path.join(web, f), 'utf8'), /draughtsman/i, f);
  // with no planner at work the architect's chores keep away from the order board
  const chores = castJs.slice(castJs.indexOf('  planner: ['), castJs.indexOf('  foreman: ['));
  assert.doesNotMatch(chores, /stations\.(shelf|orders|queue)/);
});

test('tickets that become todo are carried to the todo table in one walk and lie there in queue order, those that wait for another ticket in the back row', async () => {
  const { picture } = await import('../viewer/web/space/plan.js');
  // which todo tickets wait for another ticket, on a real board
  const root = workspace();
  const r = repo(root, 'toko');
  const [base, after, free, paused, solo] = ['Dasar', 'Sesudah dasar', 'Bebas', 'Dijeda', 'Sendirian'].map((title) => plainTicket(r, title));
  assert.equal(r.k('set', after, `blocked_by=${base}`).code, 0);
  assert.equal(r.k('set', solo, 'solo=true').code, 0);
  assert.equal(r.k('queue', 'set', base, after, free, paused, solo, '--pause-before', paused).code, 0);
  const s = await serve(root);
  const waiting = async () => { const pic = picture((await get(s, '/api/p/toko/state')).body); return Object.fromEntries([base, after, free, paused, solo].map((id, k) => [['base', 'after', 'free', 'paused', 'solo'][k], pic.byId.get(id).waiting])); };
  // nothing in flight: only the one blocked by a ticket that has not landed waits for another; a pause waits for the owner
  assert.deepEqual(await waiting(), { base: false, after: true, free: false, paused: false, solo: false });
  // one in flight: the solo ticket must wait for it too
  assert.equal(r.k('start', base).code, 0);
  assert.deepEqual(await waiting(), { base: false, after: true, free: false, paused: false, solo: true });

  // made-up boards: a solo ticket in flight holds every todo ticket back; landed, none
  const t = (id, status, more = {}) => ({ id, title: id, status, criteria: [{ done: false }], state: {}, fm: {}, ...more });
  const rows = (tickets, more = {}) => picture({ tickets, ...more }).tickets.filter((x) => x.status === 'todo').map((x) => x.waiting);
  assert.deepEqual(rows([t('a', 'in_progress', { fm: { solo: 'true' } }), t('b', 'todo'), t('c', 'todo', { waits: [] })]), [true, true]);
  assert.deepEqual(rows([t('a', 'done', { fm: { solo: 'true' } }), t('b', 'todo'), t('c', 'todo', { waits: ['x'] })]), [false, true]);
  assert.deepEqual(rows([t('a', 'review'), t('b', 'todo', { fm: { solo: 'true' } }), t('c', 'todo')]), [true, false]);
  assert.deepEqual(rows([t('a', 'review'), t('b', 'todo', { fm: { solo: 'true' } })], { places: { used: 0, max: 3 } }), [false], 'what is in flight waits for the owner: it takes no place');
  assert.equal(picture({ tickets: [t('a', 'backlog', { waits: ['x'] })] }).tickets[0].waiting, false, 'only a todo ticket has a row');

  // in the yard
  const { dir, settle, T, board, where, errors, journal, E, trailOf, cast, row } = await stagedYard();
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const queue = { order: ['c', 'a', 'e', 'b', 'd'] };
  dir.update(board(ids.map((id) => T(id, 'backlog'))), trailOf([]));
  await settle();
  assert.deepEqual(ids.map(row), [null, null, null, null, null]);
  // the planner moves the whole lot at once: one walk of the architect for all five
  const todo = (waits) => board(ids.map((id) => T(id, 'todo', { waits: waits[id] || [] })), { queue });
  let walks = 0;
  const goTo = cast.planner.goTo;
  cast.planner.goTo = async (to) => { walks++; return goTo(to); };
  dir.update(todo({ b: ['z'], e: ['z'] }), trailOf(ids.map((id) => E(id, 'moved', { to: 'todo' }))));
  assert.equal(cast.planner.jobs.length, 1, 'one walk');
  assert.deepEqual(ids.map(row), [null, null, null, null, null], 'not on the table before they are carried there');
  await settle();
  assert.equal(walks, 2, 'to the order board, then to the todo table');
  assert.deepEqual(journal, ids.map((id) => `plan ${id}`));
  assert.deepEqual(new Set(Object.values(where())), new Set(['queue']));
  // side by side in the order of the queue; b and e wait for another ticket: the back row
  assert.deepEqual(Object.fromEntries(ids.map((id) => [id, row(id)])), { c: 'front 0', a: 'front 1', d: 'front 2', e: 'back 0', b: 'back 1' });
  // the queue is put in another order: the table follows
  dir.update(todo({ b: ['z'], e: ['z'] }), trailOf([]));
  dir.update(board(ids.map((id) => T(id, 'todo', { waits: { b: ['z'], e: ['z'] }[id] || [] })), { queue: { order: ['d', 'b', 'c', 'e', 'a'] } }), trailOf([]));
  assert.deepEqual(Object.fromEntries(ids.map((id) => [id, row(id)])), { d: 'front 0', c: 'front 1', a: 'front 2', b: 'back 0', e: 'back 1' });
  // what e waited for has landed: e comes forward, to its place in the queue; b stays behind
  dir.update(todo({ b: ['z'] }), trailOf([]));
  assert.deepEqual(Object.fromEntries(ids.map((id) => [id, row(id)])), { c: 'front 0', a: 'front 1', e: 'front 2', d: 'front 3', b: 'back 0' });
  // and a ticket that starts to wait goes back
  dir.update(todo({ b: ['z'], c: ['y'] }), trailOf([]));
  assert.deepEqual(Object.fromEntries(ids.map((id) => [id, row(id)])), { a: 'front 0', e: 'front 1', d: 'front 2', c: 'back 0', b: 'back 1' });
  assert.equal(cast.planner.jobs.length, 0, 'nobody carries a ticket from one row to the other');

  // a ticket that becomes todo while the architect is already on the way to the table goes in the next walk
  journal.length = 0;
  walks = 0;
  const more = (st) => board([...ids.map((id) => T(id, 'todo')), T('f', st.f), T('g', st.g)], { queue: { order: [...ids, 'f', 'g'] } });
  dir.update(more({ f: 'backlog', g: 'backlog' }), trailOf([]));
  dir.update(more({ f: 'backlog', g: 'backlog' }), trailOf([]));
  const act = cast.planner.act;
  let late = false;
  cast.planner.act = async (name) => { if (name === 'interact-right' && !late) { late = true; dir.update(more({ f: 'todo', g: 'todo' }), trailOf([E('g', 'moved', { to: 'todo' })])); } return act(name); };
  dir.update(more({ f: 'todo', g: 'backlog' }), trailOf([E('f', 'moved', { to: 'todo' })]));
  await settle();
  assert.equal(walks, 4, 'two walks');
  assert.deepEqual([row('f'), row('g')], ['front 5', 'front 6']);
  // each row shows eight; the rest is not drawn, and is there when a place comes free
  const many = Array.from({ length: 10 }, (_, k) => `m${k}`);
  const full = await stagedYard();
  full.dir.update(full.board(many.map((id) => full.T(id, 'todo', { waits: ['z'] })), { queue: { order: many } }), full.trailOf([]));
  assert.deepEqual(many.map(full.row), [...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `back ${k}`), null, null]);
  assert.deepEqual(many.map((id) => full.dir.tokens.get(id).obj.visible), [true, true, true, true, true, true, true, true, false, false]);
  full.dir.update(full.board(many.map((id, k) => full.T(id, 'todo', { waits: k ? ['z'] : [] })), { queue: { order: many } }), full.trailOf([]));
  assert.deepEqual([full.row('m0'), full.row('m8'), full.row('m9')], ['front 0', 'back 7', null]);
  assert.deepEqual([...errors, ...full.errors], []);
  // the limit is written where the owner reads it
  const doc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'galangan-padanan.md'), 'utf8');
  assert.match(doc, /Naval Architect/);
  assert.match(doc, /8 di baris depan dan 8 di baris belakang/);
  assert.doesNotMatch(doc, /papan QUEUE/);
});

test('the demo shows the architect reading, asking and moving tickets, with a back row on the todo table', async () => {
  const { picture } = await import('../viewer/web/space/plan.js');
  const { startDemo } = await import('../viewer/web/space/demo.js');
  const { dir, settle, errors, cast, row } = await stagedYard();
  const reads = [];
  const stop = startDemo((D, trail) => reads.push([D, trail]));
  stop();
  assert.ok(picture(reads[0][0]).tickets.some((t) => t.status === 'todo' && t.waiting) && picture(reads[0][0]).tickets.some((t) => t.status === 'todo' && !t.waiting), 'both rows from the first look');
  const phases = []; // what the planner of the demo is seen doing, each change once
  let carried = 0, came = 0, batch = 0;
  for (let i = 0; i < 1500; i++) {
    if (i) stop.step();
    for (const [D, trail] of reads.splice(0)) {
      const p = picture(D).planner;
      const phase = p.asks ? (p.reading ? 'reading and asking' : 'asking') : p.reading ? 'reading' : 'idle';
      if (phases[phases.length - 1] !== phase) phases.push(phase);
      if (p.reading) assert.equal(typeof p.step, 'string');
      if (p.asks) assert.ok(D.inbox.some((x) => x.kind === 'question' && D.tickets.find((t) => t.id === x.id).plannerAsks), 'the question is in the inbox, on the ticket it is about');
      const moved = trail.events.filter((e) => e.event === 'moved' && e.to === 'todo');
      // tickets are moved at the end of a turn of reading, never out of nowhere
      if (moved.length) assert.equal(phases[phases.length - 2], 'reading', phases.join(' > '));
      batch = Math.max(batch, moved.length);
      dir.update(D, trail);
      carried += cast.planner.jobs.length;
      await settle();
      const todo = D.tickets.filter((x) => x.status === 'todo');
      assert.ok(todo.length <= 8, 'the demo keeps to what the table shows');
      for (const t of todo) assert.equal(row(t.id)?.split(' ')[0], picture(D).byId.get(t.id).waiting ? 'back' : 'front', t.id);
      // a ticket that waited comes forward when the one it waited for has landed
      for (const t of D.tickets) if (t.status === 'todo' && !t.waits.length && dir.tokens.get(t.id).wasBack) came++;
      for (const t of D.tickets) dir.tokens.get(t.id).wasBack = t.status === 'todo' && t.waits.length > 0;
    }
  }
  assert.deepEqual(phases.slice(0, 5), ['idle', 'reading', 'asking', 'reading', 'idle'], 'the first round asks');
  assert.ok(carried > 3, 'the architect carried tickets');
  assert.ok(batch > 1, 'several in one walk at least once');
  assert.ok(came > 0, 'a ticket came forward');
  assert.deepEqual(errors, []);
});

test('the yard keeps a ticket that one look at the board missed, and sees a new one in by the mail', async () => {
  const { dir, settle, T, board, where, errors, E, trailOf } = await stagedYard();
  dir.update(board([T('a', 'in_progress'), T('b', 'backlog')]), trailOf([]));
  await settle();
  assert.deepEqual(where(), { a: 'slip', b: 'shelf' });
  const ship = dir.tokens.get('a').ship;
  // a file caught half-written: the ticket is not in this look, and is there again in the next
  dir.update(board([T('b', 'backlog')]), trailOf([]));
  dir.frame(1);
  await settle();
  dir.update(board([T('a', 'in_progress'), T('b', 'backlog')]), trailOf([]));
  await settle();
  assert.equal(dir.tokens.get('a').ship, ship, 'the same ship on the same slip');
  // gone for good: forgotten, its slip free
  dir.update(board([T('b', 'backlog')]), trailOf([]));
  for (let i = 0; i < 8; i++) dir.frame(1);
  assert.equal(dir.tokens.has('a'), false);
  assert.deepEqual(dir.slipOf, [null, null, null, null]);
  // a ticket made while the page is open comes by the mail boat, step by step to where its events take it
  dir.update(board([T('b', 'backlog'), T('n', 'todo')]), trailOf([E('n', 'created', { status: 'backlog' }), E('n', 'moved', { to: 'todo' })]));
  assert.equal(where().n, 'mail');
  await settle();
  assert.equal(where().n, 'queue');
  // two reviews with a reviewer each: the inspector goes to both in turn
  const two = board([T('x', 'review', { run: { role: 'reviewer' } }), T('y', 'review', { run: { role: 'reviewer' } })]);
  dir.update(two, trailOf([]));
  for (let i = 0; i < 8; i++) dir.frame(1);
  dir.update(two, trailOf([]));
  await settle();
  const seen = new Set([0, 1, 2, 3].map(() => dir.underReview().id));
  assert.deepEqual([...seen].sort(), ['x', 'y']);
  assert.deepEqual(errors, []);
});

test('a review is a scene: the shipwright jumps when it is handed over, the inspector goes round the hull and gives the verdict, and a hull that passed stays on its slip until it lands', async () => {
  const { dir, settle, T, board, where, errors, journal, E, trailOf, drama, cast } = await stagedYard();
  const { play, seen, picture } = await import('../viewer/web/space/plan.js');
  const done = [{ done: true }];
  const of = (id) => drama.splice(0).filter((x) => !/^(courier|planner|foreman|crane|keeper)/.test(x));
  const lap = [0, 3, 7, 4].map((i) => [`inspector to slip 1 spot ${i}`, 'inspector interact-right']).flat();
  const open = (D) => { dir.update(D, trailOf([])); dir.update(D, trailOf([])); }; // a ticket no event brought is put in place on the second look
  dir.update(board([T('a', 'in_progress', { criteria: done })]), trailOf([]));
  const a = dir.tokens.get('a');

  // handed over: the shipwright of that slip jumps for joy; no sails yet, and nobody has judged it
  dir.update(board([T('a', 'review', { criteria: done, run: { role: 'reviewer' } })]), trailOf([E('a', 'submitted', { to: 'review' }), E('a', 'agent', { role: 'reviewer' })]));
  await settle();
  assert.deepEqual(of(), ['[handed a]', 'wright 1 says 🥳', 'wright 1 jump']);
  assert.deepEqual([a.pic.status, a.rig, a.ship.rigged, where().a], ['review', false, false, 'slip']);
  assert.equal(dir.underReview(), a, 'the inspector\'s round is for the hull a reviewer is on');

  // passed: the shipwright waits, the inspector goes round, walks up, a few words; only then the sails, and joy
  const sails = [];
  const say = cast.inspector.say;
  cast.inspector.say = (g) => { sails.push(`${g} ${a.rig}`); say(g); };
  const passed = board([T('a', 'review', { criteria: done, state: { passed: true } })], { mergeQueue: ['a'] });
  dir.update(passed, trailOf([E('a', 'verdict', { result: 'pass', round: 1 })]));
  await settle();
  assert.deepEqual(of(), ['[pass a]', 'wright 1 to slip 1 spot 6', ...lap, 'inspector says 💬', 'inspector interact-right', 'inspector says ✓', 'inspector emote-yes', 'wright 1 says 😄', 'wright 1 jump']);
  assert.deepEqual(sails, ['💬 false', '✓ false'], 'the sails go up when the inspector has spoken, not before');
  assert.deepEqual([a.rig, a.ship.rigged], [true, true]);
  cast.inspector.say = say;
  // passed is not launched: it stays on its slip, however long, first in the merge queue or not
  for (let i = 0; i < 600; i++) { if (i % 20 === 0) dir.update(passed, trailOf([])); dir.frame(1); }
  await settle();
  assert.deepEqual([where().a, a.slip, dir.fleet.length, journal.filter((x) => x.startsWith('launch')).length], ['slip', 0, 0, 0]);
  assert.equal(a.ship.o.position.z, -6.4, 'the hull has not moved down the ramp');
  // bringing main in after the pass (handed over again, judged again): the sails stay up, no scene (Q2)
  dir.update(passed, trailOf([E('a', 'integrate', { conflict: true }), E('a', 'agent', { role: 'worker' }), E('a', 'submitted', { to: 'review' }), E('a', 'verdict', { result: 'pass', integration: true })]));
  await settle();
  assert.deepEqual(of(), []);
  assert.deepEqual([a.rig, a.pic.status, where().a], [true, 'review', 'slip']);
  // landed: now, and only now, it goes down the ramp and out to an anchor
  dir.update(board([T('a', 'done', { criteria: done, landed: 5 })]), trailOf([E('a', 'landed')]));
  await settle();
  assert.deepEqual([where().a, a.anchor, dir.slipOf[0]], ['bay', 0, null]);
  assert.deepEqual(journal.filter((x) => x.startsWith('launch')), ['launch a']);
  drama.length = 0;

  // sent back: the hull stands until the inspector has given his ❌; the shipwright is sad, and goes back to work
  const two = [{ done: true }, { done: true }];
  open(board([T('b', 'in_progress', { criteria: two })]));
  const b = dir.tokens.get('b');
  dir.update(board([T('b', 'review', { criteria: two })]), trailOf([E('b', 'submitted', { to: 'review' })]));
  await settle();
  drama.length = 0;
  b.lapped = true; // the inspector has been round it while the reviewer worked (cast.js): he goes straight to the shipwright
  const stood = [];
  cast.inspector.say = (g) => { stood.push(`${g} ${b.shown}`); say(g); };
  const back = board([T('b', 'in_progress', { criteria: [{ done: true }, { done: false }], rejected: 1, run: { role: 'worker' } })]);
  dir.update(back, trailOf([E('b', 'verdict', { result: 'reject', round: 1, failed: '2' })]));
  for (let i = 0; i < 30; i++) dir.frame(1); // nobody has come yet
  assert.equal(b.shown, 1);
  await settle();
  cast.inspector.say = say;
  assert.deepEqual(of(), ['[reject b]', 'wright 1 to slip 1 spot 6', 'inspector says ❌', 'inspector emote-no', 'wright 1 says 😢', 'wright 1 emote-no', 'wright 1 to slip 1 spot 1', 'wright 1 attack-melee-right']);
  assert.deepEqual(stood, ['❌ 1']);
  assert.deepEqual([b.pic.status, b.rig, b.pic.rejected, b.pic.build, where().b], ['in_progress', false, 1, 0.625, 'slip']);
  assert.ok(Math.abs(b.shown - 0.625) < 0.03, 'then the hull comes down');
  // accepted by the owner over the rejection: joy and sails, and no inspector (Q1)
  dir.update(board([T('b', 'review', { criteria: [{ done: true }, { done: false }], rejected: 1, state: { passed: true } })]), trailOf([E('b', 'accepted', { by: 'owner' })]));
  await settle();
  assert.deepEqual(of(), ['[cheer b]', 'wright 1 says 🥳', 'wright 1 jump']);
  assert.deepEqual([b.pic.status, b.rig, where().b, b.odd], ['review', true, 'slip', false]);

  // the light lane passes as it is handed over, with no reviewer: the same, and no inspector
  open(board([T('b', 'review', { state: { passed: true } }), T('c', 'in_progress', { criteria: done })]));
  dir.update(board([T('b', 'review', { state: { passed: true } }), T('c', 'review', { criteria: done, state: { passed: true } })]), trailOf([E('c', 'submitted', { to: 'review', passed: true, lane: 'light' })]));
  await settle();
  const c = dir.tokens.get('c');
  assert.deepEqual(of(), ['[cheer c]', 'wright 2 says 🥳', 'wright 2 jump']);
  assert.deepEqual([c.rig, where().c], [true, 'slip']);
  assert.equal(journal.filter((x) => /^(pass|reject) c/.test(x)).length, 0);

  // what each event says of the review
  const see = seen(picture(board([T('p', 'in_progress')])).byId.get('p'));
  assert.equal(play(see, { event: 'submitted' }), 'handed');
  assert.equal(play(see, { event: 'verdict', result: 'reject' }), 'reject');
  assert.equal(play(see, { event: 'submitted', passed: true }), 'cheer');
  assert.equal(play(see, { event: 'submitted' }), null, 'handed over again after it passed');
  assert.equal(see.rigged, true);
  assert.equal(play(see, { event: 'verdict', result: 'pass', integration: true }), null);
  assert.equal(play(see, { event: 'landed' }), null);
  assert.equal(see.status, 'done');
  assert.deepEqual(errors, []);
});

test('one inspector, many hulls: he comes to every one of them, one after the other, in the order of their events', async () => {
  const { dir, settle, T, board, errors, journal, E, trailOf, drama, clock } = await stagedYard();
  const ids = ['w', 'x', 'y', 'z'];
  dir.update(board(ids.map((id) => T(id, 'review', { criteria: [{ done: true }] }))), trailOf([]));
  // four verdicts in one read (more than a person is otherwise asked to carry), the last hull judged first
  const at = (id) => clock.t + (id === 'z' ? 0 : id === 'y' ? 1 : id === 'x' ? 2 : 3);
  const verdict = (id) => ({ ...E(id, 'verdict', id === 'y' ? { result: 'reject', round: 1 } : { result: 'pass', round: 1 }), at: at(id) });
  dir.update(board(ids.map((id) => T(id, id === 'y' ? 'in_progress' : 'review', { criteria: [{ done: true }], rejected: id === 'y' ? 1 : 0, state: { passed: id !== 'y' } }))), trailOf(['z', 'y', 'x', 'w'].map(verdict)));
  await settle();
  assert.deepEqual(journal.filter((x) => /^(pass|reject)/.test(x)).sort(), ['pass w', 'pass x', 'pass z', 'reject y']);
  // every hull gets its round and its verdict, whole, before the next
  const his = drama.filter((x) => x.startsWith('inspector to') || /^inspector says [✓❌]/.test(x)).map((x) => x.replace(/inspector (to slip|says) /, '').replace(/ spot \d/, ''));
  assert.deepEqual(his, ['4', '4', '4', '4', '✓', '3', '3', '3', '3', '❌', '2', '2', '2', '2', '✓', '1', '1', '1', '1', '✓']);
  for (const id of ids) assert.equal(dir.tokens.get(id).rig, id !== 'y');
  assert.deepEqual(errors, []);
});

test('a hull that passed and is held or stopped waits with its anchor down, and takes it in again once it is let go', async () => {
  const { dir, settle, T, board, where, errors, E, trailOf } = await stagedYard();
  const { picture } = await import('../viewer/web/space/plan.js');
  const done = [{ done: true }];
  const run = (D, secs = 5) => { for (let i = 0; i < secs * 10; i++) { if (i % 10 === 0) dir.update(D); dir.frame(0.1); } };
  const yard = (a, b, c, d) => board([T('a', 'review', { criteria: done, state: a }), T('b', 'review', { criteria: done, state: b }), T('c', 'in_progress', { criteria: done, state: c }), T('d', 'review', { criteria: done, state: d })]);
  // as the page opens: one held, one stopped, one stopped that never passed, one that passed and is free
  const D = yard({ passed: true, held: 'has Q1 open' }, { passed: true, stopped: 'the reviewer gave up' }, { stopped: 'the worker gave up' }, { passed: true });
  assert.deepEqual(['a', 'b', 'c', 'd'].map((id) => picture(D).byId.get(id).moored), [true, true, false, false]);
  dir.update(D, trailOf([]));
  const tok = (id) => dir.tokens.get(id);
  const drop = () => ['a', 'b', 'c', 'd'].map((id) => (tok(id).hook ? tok(id).hook.drop : null));
  assert.deepEqual(drop(), [null, null, null, null]);
  dir.frame(0.1);
  assert.ok(tok('a').hook.drop > 0 && tok('a').hook.drop < 1, 'it goes down, it is not just there');
  run(D);
  assert.deepEqual(drop(), [1, 1, null, null]);
  run(D, 600);
  assert.deepEqual(drop(), [1, 1, null, null], 'it stays down for as long as the hold lasts');
  assert.deepEqual(Object.values(where()), ['slip', 'slip', 'slip', 'slip']);
  // let go (the question answered, `k2 retry`): no event says so, the board does; the anchor comes up and is stowed
  const free = yard({ passed: true }, { passed: true }, { stopped: 'the worker gave up' }, { passed: true });
  dir.update(free);
  dir.frame(0.1);
  assert.ok(tok('a').hook.drop < 1 && tok('a').hook.drop > 0, 'it comes up, it does not just vanish');
  run(free);
  assert.deepEqual(drop(), [null, null, null, null]);
  // held again (the merge was refused: the one hold the trail does write)
  const again = yard({ passed: true }, { passed: true }, {}, { passed: true, held: 'the main tree is on another branch' });
  dir.update(again, trailOf([E('d', 'held', { reason: 'the main tree is on another branch' })]));
  await settle();
  run(again);
  assert.deepEqual(drop(), [null, null, null, 1]);
  // a pass that is held from the start: the anchor waits for the scene of the pass, it does not run ahead of the sails
  const before = board([T('e', 'review', { criteria: done })]);
  dir.update(before, trailOf([]));
  for (let i = 0; i < 8; i++) dir.frame(1);
  dir.update(before, trailOf([]));
  const held = board([T('e', 'review', { criteria: done, state: { passed: true, held: 'has Q1 open' } })]);
  dir.update(held, trailOf([E('e', 'verdict', { result: 'pass', round: 1 })]));
  for (let i = 0; i < 20; i++) dir.frame(0.1);
  assert.deepEqual([tok('e').rig, tok('e').hook], [false, null]);
  await settle();
  run(held);
  assert.deepEqual([tok('e').rig, tok('e').hook.drop, where().e], [true, 1, 'slip']);
  // it lands while the anchor is still down (the hold lifted and the merge made between two looks): the anchor does not stay behind on the slip
  const anchor = tok('e').hook;
  dir.update(board([T('e', 'done', { criteria: done, landed: 9 })]), trailOf([E('e', 'landed')]));
  await settle();
  assert.deepEqual([where().e, tok('e').hook, tok('e').drop], ['bay', null, 0]);
  assert.ok(anchor.drop < 1);
  assert.deepEqual(errors, []);
});

test('the demo shows a review each way: one passed, one sent back and then passed, one passed and held', async () => {
  const { startDemo } = await import('../viewer/web/space/demo.js');
  const { dir, settle, errors, journal } = await stagedYard();
  const reads = [];
  const stop = startDemo((D, trail) => reads.push([D, trail]));
  stop();
  const verdicts = new Map(); // ticket -> its verdicts, in order
  const held = new Set(), moored = new Set(), landed = new Set();
  const shown = () => {
    const straight = [...verdicts].some(([id, v]) => v.join() === 'pass' && !held.has(id) && landed.has(id));
    const again = [...verdicts].some(([id, v]) => v.join() === 'reject,pass' && landed.has(id));
    const kept = [...held].some((id) => moored.has(id) && landed.has(id));
    return straight && again && kept;
  };
  for (let i = 0; i < 1500 && !shown(); i++) {
    if (i) stop.step();
    for (const [D, trail] of reads.splice(0)) {
      for (const e of trail.events) {
        if (e.event === 'verdict') verdicts.set(e.ticket, [...(verdicts.get(e.ticket) || []), e.result]);
        if (e.event === 'landed') landed.add(e.ticket);
      }
      for (const t of D.tickets) {
        if (!t.state.held) continue;
        held.add(t.id);
        assert.equal(t.state.passed, true);
        assert.ok(!D.mergeQueue.includes(t.id), 'a held ticket is not in the merge queue');
        assert.ok(D.inbox.some((x) => x.id === t.id && x.kind === 'not merged'), 'and it waits for the owner');
      }
      dir.update(D, trail);
      await settle();
      for (let k = 0; k < 20; k++) dir.frame(0.1);
      for (const tok of dir.tokens.values()) {
        if (tok.hook && tok.hook.drop === 1) { moored.add(tok.id); assert.ok(held.has(tok.id) && tok.place === 'slip' && tok.rig); }
        if (tok.place === 'bay') assert.ok(tok.pic.status === 'done' && tok.hook === null, 'only what landed is in the bay');
      }
    }
  }
  assert.ok(shown(), `within 25 minutes of the demo: ${JSON.stringify([...verdicts])} held ${[...held]} moored ${[...moored]} landed ${[...landed]}`);
  for (const id of held) assert.ok(journal.includes(`pass ${id}`));
  assert.deepEqual(errors, []);
});

test('the demo makes up a trail too: a ticket can be watched from its order to its anchor', async () => {
  const { startDemo } = await import('../viewer/web/space/demo.js');
  const { dir, settle, where, errors, journal, world } = await stagedYard();
  const reads = [];
  const boats = { n: 0 };
  world.mailIn = () => { boats.n++; };
  const stop = startDemo((D, trail) => reads.push([D, trail]));
  stop(); // no timer: the test moves the demo on by hand
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0][1].events, [], 'the demo opens on a board as it is');
  const seen = [];
  let born = null; // the first ticket ordered while the demo runs that lands
  for (let i = 0; i < 6000 && !born; i++) {
    if (i) stop.step();
    for (const [D, trail] of reads.splice(0)) {
      assert.equal(typeof trail.now, 'number');
      for (const e of trail.events) {
        assert.match(e.ticket, /^\d{12}$/);
        assert.equal(typeof e.at, 'number');
        assert.equal(typeof e.event, 'string');
        assert.ok(D.tickets.some((t) => t.id === e.ticket), 'an event is of a ticket on the board');
        seen.push(e);
      }
      dir.update(D, trail);
      await settle();
      // the yard, played out, is where the made-up board is: nothing is put by hand
      for (const t of D.tickets) assert.equal(dir.tokens.get(t.id).pic.status, t.status, `${t.id} after ${trail.events.map((e) => e.event).join(' ')}`);
    }
    born = seen.find((e) => e.event === 'landed' && seen.some((x) => x.ticket === e.ticket && x.event === 'created'))?.ticket || null;
  }
  assert.ok(born, 'a ticket ordered in the demo landed');
  // the first orders written in the demo are a party of more than one, by one boat
  const firstAt = seen.find((e) => e.event === 'created').at;
  assert.ok(seen.filter((e) => e.event === 'created' && e.at - firstAt < 1000).length > 1, 'more than one order in the first party');
  assert.ok(boats.n < seen.filter((e) => e.event === 'created').length, 'fewer boats than orders');
  const life = seen.filter((e) => e.ticket === born).map((e) => e.event);
  assert.deepEqual([life[0], life[1], life[2], life[3], life[life.length - 1]], ['created', 'moved', 'started', 'agent', 'landed']);
  assert.ok(life.includes('check') && life.includes('submitted') && life.includes('verdict'));
  assert.deepEqual(journal.filter((x) => x.endsWith(` ${born}`) && /^(deliver|plan|prepare|fetch|launch|scrap)/.test(x)), ['deliver', 'plan', 'prepare', 'fetch', 'launch'].map((x) => `${x} ${born}`));
  assert.ok(journal.includes(`pass ${born}`));
  assert.equal(where()[born], 'bay');
  // every kind of event the demo writes is one the board writes
  const known = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'web', 'trail.js'), 'utf8');
  for (const name of new Set(seen.map((e) => e.event))) assert.match(known, new RegExp(`\\b${name}: \\(`), name);
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

test('the mockup of a crane at every slip stands on the yard\'s own slips, and no arm or load strikes anything', async () => {
  const { yardOf } = await import('../viewer/web/space/plan.js');
  const { OPTIONS, COUNTS, KINDS, layout, clearances, swing } = await import('../docs/mockups/galangan/derek-plan.js');
  // the largest ship from above, as a plain box: 4.2 wide, 11.5 long, a mast amidships
  const hull = Array.from({ length: 46 }, (_, k) => ({ z0: -5.75 + k * 0.25, z1: -5.5 + k * 0.25, w: 2.112, mast: k === 22 ? 1.94 : 0 }));
  assert.deepEqual(COUNTS, [4, 6, 10]);
  assert.ok(OPTIONS.length >= 3 && OPTIONS.some((o) => o.shared), 'three placements at least, one of them a crane between two slips');
  assert.equal(new Set(OPTIONS.map((o) => o.code)).size, OPTIONS.length);
  const states = new Set();
  for (const o of OPTIONS) for (const n of COUNTS) {
    const L = layout(o.code, n), at = `${o.code} with ${n} slips`;
    assert.deepEqual(L.Y.docks, yardOf(n).docks, `${at}: the slips are the yard's`);
    assert.equal(L.cranes.length, o.shared ? L.Y.front / 2 + L.Y.back / 2 : n, `${at}: how many cranes`);
    assert.deepEqual([...new Set(L.cranes.flatMap((c) => c.serves))].sort((a, b) => a - b), L.Y.docks.map((_, k) => k), `${at}: every slip is served`);
    const room = clearances(L, hull);
    for (const k of KINDS) assert.ok(!Number.isNaN(room.least[k]), `${at}: ${k}`);
    assert.equal(room.per.length, L.cranes.length);
    states.add(room.state);
    for (const masts of [false, true]) {
      const s = swing(L, hull, { masts, step: 0.1 });
      assert.ok(s.arm > 0, `${at}${masts ? ', masts up' : ''}: an arm strikes another crane (${s.arm})`);
      if (masts) assert.ok(s.mast > 0, `${at}: a parked arm strikes a mast (${s.mast})`);
      else assert.ok(s.load > 0, `${at}: a load strikes something on its way (${s.load})`);
    }
  }
  assert.ok(states.has('clash') && states.has('clear'), 'the page has both to show: a placement that fits and one that does not');
  // the full foot beside a slip stands on the shipwrights' spots, whatever the number of slips
  for (const n of COUNTS) assert.ok(clearances(layout('F1', n), hull).least.worker < 0);
});

// ----- a crane at every slip -----

const SPACE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'web', 'space');
const turn = () => new Promise((r) => setImmediate(r));

// Every triangle of a .glb model as the box around it, in the model's own space; `rig`: part of a sail or a flag.
function trianglesOf(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12);
  const J = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(20 + jl + 8);
  const mul = (a, c) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * c[j * 4 + k]; return o; };
  const local = (n) => {
    if (n.matrix) return n.matrix;
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
  };
  const read = (i) => {
    const a = J.accessors[i], v = J.bufferViews[a.bufferView];
    const off = (v.byteOffset || 0) + (a.byteOffset || 0), n = { SCALAR: 1, VEC3: 3 }[a.type];
    const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType], stride = v.byteStride || size * n;
    const get = { 5126: (o) => bin.readFloatLE(o), 5125: (o) => bin.readUInt32LE(o), 5123: (o) => bin.readUInt16LE(o), 5121: (o) => bin.readUInt8(o) }[a.componentType];
    return Array.from({ length: a.count }, (_, k) => Array.from({ length: n }, (_, c) => get(off + k * stride + c * size)));
  };
  const out = [];
  const walk = (i, M, rig) => {
    const n = J.nodes[i];
    const W = mul(M, local(n));
    rig = rig || /^(sail|flag)/.test(n.name || '');
    if (n.mesh !== undefined) for (const p of J.meshes[n.mesh].primitives) {
      const P = read(p.attributes.POSITION).map(([x, y, z]) => [W[0] * x + W[4] * y + W[8] * z + W[12], W[1] * x + W[5] * y + W[9] * z + W[13], W[2] * x + W[6] * y + W[10] * z + W[14]]);
      const I = p.indices !== undefined ? read(p.indices).map((v) => v[0]) : P.map((_, k) => k);
      for (let t = 0; t + 2 < I.length; t += 3) {
        const T = [P[I[t]], P[I[t + 1]], P[I[t + 2]]];
        const lo = (c) => Math.min(T[0][c], T[1][c], T[2][c]), hi = (c) => Math.max(T[0][c], T[1][c], T[2][c]);
        out.push({ x0: lo(0), x1: hi(0), y0: lo(1), y1: hi(1), z0: lo(2), z1: hi(2), rig });
      }
    }
    for (const c of n.children || []) walk(c, W, rig);
  };
  for (const r of J.scenes[J.scene || 0].nodes) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], false);
  return out;
}
// The six hulls as the yard berths them on a slip (world.js: their scale, 0.28 above the ground), about the middle of the hull.
const HULLS = { small: 1, medium: 1, large: 0.88, 'pirate-small': 1, 'pirate-medium': 1, 'pirate-large': 0.88 };
let berthed = null;
function hullsBerthed() {
  berthed ??= Object.fromEntries(Object.entries(HULLS).map(([k, s]) => [k, trianglesOf(path.join(SPACE, 'kits', 'pirate', `ship-${k}.glb`)).map((t) => ({ x0: t.x0 * s, x1: t.x1 * s, z0: t.z0 * s, z1: t.z1 * s, y0: t.y0 * s + 0.28, y1: t.y1 * s + 0.28, rig: t.rig }))]));
  return berthed;
}

test('every slip has a slewing crane of its own on the corner of its head, from one slip to ten; the large crane by the lighthouse is gone', async () => {
  const { yardOf, footprints } = await import('../viewer/web/space/plan.js');
  const { FOOT } = await import('../viewer/web/space/crane.js');
  assert.equal(FOOT * 2, 0.9, 'the narrow foot of F4');
  const apart = (a, b) => { const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1), dz = Math.max(a.z0 - b.z1, b.z0 - a.z1); return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz); };
  for (let n = 1; n <= 10; n++) {
    const Y = yardOf(n), F = footprints(Y);
    assert.equal(Y.crane, undefined, 'no crane of the yard as a whole');
    assert.equal(Y.cranes.length, n);
    const feet = F.filter((f) => f.kind === 'crane');
    assert.equal(feet.length, n);
    Y.docks.forEach((d, k) => {
      const c = Y.cranes[k], foot = feet.find((f) => f.k === k);
      // F4: on the east corner of the slip's own head, where its scaffold ends
      assert.deepEqual([c.x - d.x, c.z - d.z].map((v) => Math.round(v * 100) / 100), [3.05, -12], `${n} slips, slip ${k + 1}`);
      assert.deepEqual([foot.x0, foot.x1, foot.z0, foot.z1].map((v) => Math.round(v * 100) / 100), [c.x - 0.45, c.x + 0.45, c.z - 0.45, c.z + 0.45].map((v) => Math.round(v * 100) / 100));
      // the ground of every other slip, where every other hull goes down to the water, the streets, and every other crane
      for (const f of F) {
        if (f === foot || f.kind === 'spot' || f.kind === 'sheds' || f.kind === 'lighthouse' || f.kind === 'pier') continue;
        if (f.k === k && (f.kind === 'dock' || f.kind === 'slipway')) continue;
        assert.ok(apart(foot, f) >= 0.1, `${n} slips: the crane of slip ${k + 1} is ${apart(foot, f)} from ${f.kind} ${f.k ?? ''}`);
      }
      // a shipwright on any spot, as a circle half a unit wide; the scaffold of its own slip
      for (const f of F.filter((x) => x.kind === 'spot')) assert.ok(apart(foot, f) - 0.5 >= 0.1, `${n} slips: the crane of slip ${k + 1} and somebody at slip ${f.k + 1}`);
      assert.ok(apart(foot, { x0: d.x + 3.05 - 0.35, x1: d.x + 3.05 + 0.35, z0: d.z - 11.4, z1: d.z - 1.6 }) >= 0.1);
      for (const f of F.filter((x) => ['sheds', 'lighthouse', 'pier'].includes(x.kind))) assert.ok(apart(foot, f) > 1);
    });
  }
  // nothing of the large crane is left in the yard, and nobody has a place to stand by it
  const world = fs.readFileSync(path.join(SPACE, 'world.js'), 'utf8');
  assert.doesNotMatch(world, /east\.add\(crane\)|world\.add\(crane\)|craneState|\bcrane: \[/);
  assert.match(world, /docks\.add\(crane\)/, 'a crane is part of its slip, and is laid out with it');
  assert.equal((world.match(/cyl\(crane, 0\.32, 7\.4/g) || []).length, 1, 'one way to build a crane: at a slip');
});

test('a crane works, holds, parks and sets a piece down as it is told', async () => {
  const { Crane, CARRY } = await import('../viewer/web/space/crane.js');
  const c = new Crane();
  const run = (secs, each = () => {}) => { for (let t = 0; t < secs; t += 0.05) { c.step(0.05); each(); } };
  const pose = () => JSON.stringify(c.pose);
  // new: parked, and nothing moves
  const first = pose();
  run(30);
  assert.deepEqual([c.parked, c.still, pose()], [true, true, first]);
  // at work: it takes a piece off the stack, carries it over the hull, holds it there, carries it back, and again
  c.aim('work');
  const seen = new Set();
  let turned = 0;
  run(120, () => { seen.add(`${c.at} ${c.load ? 'loaded' : 'empty'}`); turned = Math.min(turned, c.a); });
  assert.deepEqual([...seen].sort(), ['hull loaded', 'stack empty', 'stack loaded']);
  assert.ok(turned < -0.3 && turned >= -0.38, `it turns over the hull, and no further than it may (${turned})`);
  assert.equal(c.parked, false);
  assert.equal(c.piece, null, 'at work it leaves no piece in the hull');
  // held: it ends what it was at, and then nothing of it moves, whatever it holds
  c.aim('hold');
  run(8);
  const held = pose();
  run(60);
  assert.deepEqual([c.still, pose(), c.parked], [true, held, false]);
  // one piece asked for: set down in the hull at the height asked, though it is held; the promise waits for it
  let set = 0;
  const asked = c.deliver(() => 2.4).then(() => { set++; });
  run(1);
  await turn();
  assert.equal(set, 0);
  let lay = null;
  run(40, () => { if (c.piece && lay === null) lay = { ...c.piece, load: c.load, at: c.at }; });
  await asked;
  assert.equal(set, 1);
  assert.deepEqual([Math.round(lay.y * 100) / 100, lay.load, lay.at], [2.4, false, 'hull']);
  assert.equal(c.piece, null, 'the piece is taken into the hull');
  assert.ok(c.still && !c.load && c.y === CARRY, 'and it holds again, the hook up');
  // two asked for at once: two pieces, one after the other
  let two = 0;
  c.deliver().then(() => { two++; });
  c.deliver().then(() => { two++; });
  run(60);
  await turn();
  assert.equal(two, 2);
  // parked: what it carries goes back first; whoever waits for it is told
  c.aim('work');
  run(12);
  assert.equal(c.load, true);
  c.aim('park');
  let free = false;
  c.whenParked().then(() => { free = true; });
  await turn();
  assert.equal(free, false);
  run(30);
  await turn();
  assert.deepEqual([c.parked, free, c.load, pose()], [true, true, false, first]);
  // a piece asked for and then no hull to take it: nobody waits for ever
  c.aim('hold');
  let dropped = false;
  c.deliver().then(() => { dropped = true; });
  c.aim('park');
  await turn();
  assert.equal(dropped, true);
  c.aim('work');
  run(12);
  let gone = false;
  c.deliver().then(() => { gone = true; });
  c.whenParked().then(() => { gone = gone && true; });
  c.retire();
  await turn();
  assert.equal(gone, true, 'its slip was taken away');
  // behind the board, it keeps the yard's pace
  const fast = new Crane(), slow = new Crane();
  fast.pace = 4;
  fast.aim('work');
  slow.aim('work');
  for (let t = 0; t < 3; t += 0.05) { fast.step(0.05); slow.step(0.05); }
  assert.ok(fast.load && !slow.load);
});

test('no arm, cable or piece of a crane ever strikes a hull, a mast, a sail, a shipwright, a scaffold or another crane, with any ship on any slip of any yard', async () => {
  const { yardOf } = await import('../viewer/web/space/plan.js');
  const { Crane, craneAt, reach, DECK, CRATE } = await import('../viewer/web/space/crane.js');
  const models = hullsBerthed();
  const M = 0.1; // the least room asked for
  const deckOf = (ship) => 0.28 + HULLS[ship] * DECK[ship.replace('pirate-', '')];
  // nothing of a hull without its sails stands higher under the piece than where the yard lays it
  const drop = craneAt({ x: 0, z: 6.4 }).drop; // about the middle of the hull
  for (const [ship, tris] of Object.entries(models)) {
    const under = tris.filter((t) => !t.rig && t.x1 > drop.x - CRATE.x && t.x0 < drop.x + CRATE.x && t.z1 > drop.z - CRATE.z && t.z0 < drop.z + CRATE.z);
    assert.ok(under.length > 0, `${ship}: the piece is set down over the hull`);
    assert.ok(Math.max(...under.map((t) => t.y1)) <= deckOf(ship), `${ship}: the deck is at ${Math.max(...under.map((t) => t.y1))}`);
  }
  // every pose of a life: at work, pieces set down, held with a piece asked for, parked with a piece in the hook
  function life(deck) {
    const c = new Crane();
    const seen = new Map();
    const run = (secs) => {
      for (let t = 0; t < secs; t += 0.05) {
        c.step(0.05);
        const p = c.pose;
        const key = `${p.a.toFixed(2)} ${p.r.toFixed(1)} ${p.y.toFixed(1)} ${p.load} ${c.parked}`;
        if (!seen.has(key)) seen.set(key, { ...p, parked: c.parked });
      }
    };
    c.aim('work'); run(80);
    c.deliver(() => deck); c.deliver(() => deck); run(40);
    c.aim('hold'); run(10); c.deliver(() => deck); run(30);
    c.aim('work'); run(13); c.aim('park'); run(30);
    assert.ok(c.parked);
    c.aim('work'); run(22); c.aim('park'); run(30);
    return [...seen.values()];
  }
  const inBox = (s, x, z, y0, y1) => y0 < s.y1 + M && s.y0 - M < y1 && x > s.x0 - M && x < s.x1 + M && z > s.z0 - M && z < s.z1 + M;
  const points = (p) => { // an arm's part, as points a tenth apart along it and across
    const len = Math.hypot(p.bx - p.ax, p.bz - p.az), n = Math.ceil(len / 0.1), nx = (p.bz - p.az) / len, nz = -(p.bx - p.ax) / len, out = [];
    for (let i = 0; i <= n; i++) for (const side of [-1, 0, 1]) out.push([p.ax + (p.bx - p.ax) * i / n + nx * p.w * side, p.az + (p.bz - p.az) * i / n + nz * p.w * side]);
    return out;
  };
  function strike(R, solids, arms) {
    if (arms) for (const p of R.arm) for (const [x, z] of points(p)) for (const s of solids) if (inBox(s, x, z, p.y0, p.y1)) return `its arm strikes ${s.kind}`;
    for (const s of solids) {
      if (inBox(s, R.cable.x, R.cable.z, R.cable.y0, R.cable.y1)) return `its cable strikes ${s.kind}`;
      const l = R.load, v = s.own ? 0 : M; // a piece may come to lie on its own hull
      if (l && l.x0 < s.x1 + M && s.x0 - M < l.x1 && l.z0 < s.z1 + M && s.z0 - M < l.z1 && l.y0 < s.y1 + v && s.y0 - v < l.y1) return `its piece strikes ${s.kind}`;
    }
    return null;
  }
  let poses = 0;
  for (const ship of Object.keys(HULLS)) {
    const all = life(deckOf(ship));
    assert.ok(all.some((p) => p.parked) && all.some((p) => p.load && p.a < -0.3) && all.some((p) => p.load && p.y < 3), 'the life has it parked, carrying over the hull, and setting down');
    poses += all.length;
    const air = { x0: 0, x1: 0, z0: 0, z1: 0 }; // about the crane's own mast
    for (const p of all) for (const part of reach({ x: 0, z: 0 }, p).arm) for (const [x, z] of points(part)) { air.x0 = Math.min(air.x0, x); air.x1 = Math.max(air.x1, x); air.z0 = Math.min(air.z0, z); air.z1 = Math.max(air.z1, z); }
    for (let n = 1; n <= 10; n++) {
      const Y = yardOf(n), cranes = Y.docks.map(craneAt);
      const row = Y.docks.slice(0, Y.front);
      const lamps = [row[0].x - 5, row[row.length - 1].x + 4.6, ...(!Y.back && Y.pitch >= 9.3 ? row.slice(1).map((d) => d.x - Y.pitch / 2) : [])];
      // where each crane's arm ever is: no two of them share any air
      const swept = cranes.map((c) => ({ x0: c.x + air.x0, x1: c.x + air.x1, z0: c.z + air.z0, z1: c.z + air.z1 }));
      swept.forEach((a, i) => swept.forEach((b, j) => { if (i < j) assert.ok(Math.max(a.x0 - b.x1, b.x0 - a.x1, a.z0 - b.z1, b.z0 - a.z1) > 0.5, `${n} slips: the arms of cranes ${i + 1} and ${j + 1} could meet`); }));
      Y.docks.forEach((d, k) => {
        const c = cranes[k];
        // its own hull has its sails up only while it is parked (the director sees to that); every other hull may have them up at any time
        for (const rigged of [false, true]) {
          const solids = [];
          Y.docks.forEach((o, j) => {
            for (const t of models[ship]) {
              if (j === k && t.rig && !rigged) continue;
              const s = { kind: j === k ? (t.rig ? 'its own sails' : 'its own hull') : `the ship on slip ${j + 1}`, own: j === k, x0: o.x + t.x0, x1: o.x + t.x1, z0: o.z - 6.4 + t.z0, z1: o.z - 6.4 + t.z1, y0: t.y0, y1: t.y1 };
              if (s.x1 > c.x - 7 && s.x0 < c.x + 7 && s.z1 > c.z - 7 && s.z0 < c.z + 7 && s.y1 > 1) solids.push(s);
            }
            for (const side of [-1, 1]) {
              solids.push({ kind: 'a scaffold', x0: o.x + side * 3.05 - 0.35, x1: o.x + side * 3.05 + 0.35, z0: o.z - 11.4, z1: o.z - 1.6, y0: 0, y1: 3.34 });
              for (const dz of [-10, -7.5, -5, -2.5]) solids.push({ kind: 'a shipwright', x0: o.x + side * Y.side - 0.5, x1: o.x + side * Y.side + 0.5, z0: o.z + dz - 0.5, z1: o.z + dz + 0.5, y0: 0, y1: 2.3 });
            }
            solids.push({ kind: 'a slip\'s sign', x0: o.x - 4.05, x1: o.x - 2.15, z0: o.z - 12.5, z1: o.z - 12.1, y0: 0, y1: 2.5 });
            if (j !== k) solids.push({ kind: 'another crane', x0: cranes[j].x - 0.65, x1: cranes[j].x + 0.65, z0: cranes[j].z - 0.65, z1: cranes[j].z + 0.65, y0: 0, y1: 8.85 });
          });
          for (const x of lamps) solids.push({ kind: 'a lamp', x0: x - 0.25, x1: x + 0.25, z0: -12.65, z1: -12.15, y0: 0, y1: 3.85 });
          const high = solids.filter((s) => s.y1 > 6.9), turned = new Set();
          for (const p of all) {
            if (p.parked !== rigged) continue;
            const a = p.a.toFixed(2);
            const hit = strike(reach(c, p), turned.has(a) ? solids : high, !turned.has(a)) || (turned.has(a) ? null : strike(reach(c, p), solids, false));
            turned.add(a);
            assert.equal(hit, null, `${n} slips, ${ship} hulls, the crane of slip ${k + 1}${rigged ? ', parked beside its sails' : ''}: ${hit} at ${JSON.stringify(p)}`);
          }
        }
      });
    }
  }
  assert.ok(poses > 600, 'the lives were long enough to see');
});

test('the crane of a slip works while the ticket\'s worker does and the hull has not passed; it stands still with nobody at work, and at an empty slip', async () => {
  const { craneGoal } = await import('../viewer/web/space/plan.js');
  // the rule, case by case
  for (const [p, goal] of [
    [null, 'park'],
    [{ status: 'in_progress', worker: 'working', rigged: false }, 'work'],
    [{ status: 'in_progress', worker: 'away', rigged: false }, 'hold'],
    [{ status: 'in_progress', worker: 'stuck', rigged: false }, 'hold'],
    [{ status: 'review', worker: 'away', reviewer: 'working', rigged: false }, 'hold'],
    [{ status: 'review', worker: 'working', rigged: false }, 'hold'],
    [{ status: 'review', worker: 'away', rigged: true }, 'park'],
    [{ status: 'in_progress', worker: 'working', rigged: true }, 'park'],
    [{ status: 'done', worker: 'away', rigged: false }, 'park'],
  ]) assert.equal(craneGoal(p), goal, JSON.stringify(p));

  const { dir, settle, T, board, errors, world } = await stagedYard({ cranes: true });
  const at = (a, b, inbox = []) => board([T('a', 'in_progress', a), T('b', 'in_progress', b)], { inbox });
  dir.update(at({ run: { role: 'worker' } }, {}), { now: 1, events: [], reread: false });
  await settle();
  const [A, B] = ['a', 'b'].map((id) => dir.tokens.get(id));
  const cranes = world.cranes;
  assert.deepEqual([A.slip, B.slip, cranes.length], [0, 1, 4]);
  const poses = () => cranes.map((c) => JSON.stringify(c.pose));
  const start = poses();
  const moved = () => { const was = poses(); let any = [false, false, false, false]; for (let i = 0; i < 300; i++) { dir.frame(0.1); any = any.map((m, k) => m || poses()[k] !== was[k]); } return any; };
  // a worker on a, nobody on b, two empty slips
  let seenLoad = false;
  for (let i = 0; i < 300; i++) { dir.frame(0.1); seenLoad = seenLoad || (cranes[0].load && cranes[0].at === 'hull'); }
  assert.deepEqual(cranes.map((c) => c.goal), ['work', 'hold', 'park', 'park']);
  assert.ok(seenLoad, 'the crane of a carries a piece over the hull');
  assert.deepEqual(poses().slice(1), start.slice(1), 'the others have not moved at all');
  assert.deepEqual(moved(), [true, false, false, false]);
  assert.equal(A.shown, A.pic.build, 'and the hull stands where it stood: only a criterion met raises it');
  // the worker of a leaves (it asked the owner something): its crane stops; b gets one: its crane starts
  dir.update(at({}, { run: { role: 'worker' } }));
  for (let i = 0; i < 100; i++) dir.frame(0.1); // it ends what it was at
  assert.deepEqual(cranes.map((c) => c.goal), ['hold', 'work', 'park', 'park']);
  assert.deepEqual(moved(), [false, true, false, false]);
  // a worker that is stuck is not at work
  dir.update(at({}, { run: { role: 'worker' } }, [{ kind: 'stuck', id: 'b', text: 'worker x has been on it for 20m' }]));
  for (let i = 0; i < 100; i++) dir.frame(0.1);
  assert.deepEqual(cranes.map((c) => c.goal), ['hold', 'hold', 'park', 'park']);
  assert.deepEqual(moved(), [false, false, false, false]);
  // back at work: on again
  dir.update(at({ run: { role: 'worker' } }, { run: { role: 'worker' } }));
  assert.deepEqual(moved(), [true, true, false, false]);
  assert.deepEqual(errors, []);
});

test('a criterion met: the crane of the slip sets one piece down in the hull, and only then does the hull rise', async () => {
  const { dir, settle, T, board, errors, E, trailOf, world } = await stagedYard({ cranes: true });
  const at = (done, more = {}) => board([T('a', 'in_progress', { criteria: done.map((d) => (d === 'void' ? { done: false, void: true } : { done: d })), run: { role: 'worker' }, ...more })]);
  dir.update(at([false, false, false, false]), trailOf([]));
  const tok = dir.tokens.get('a'), crane = world.cranes[tok.slip];
  let pieces = 0;
  const deliver = crane.deliver.bind(crane);
  crane.deliver = (deck) => { pieces++; return deliver(deck); };
  // frames until the yard is at rest: when a piece came to lie, and how high the hull stood then
  const play = async () => {
    const laid = [];
    let had = false;
    for (let i = 0; i < 1200; i++) {
      dir.frame(0.1);
      if (crane.piece && !had) laid.push(Math.round(tok.shown * 20) / 20); // (a hull within 0.02 of its height has come to rest)
      had = !!crane.piece;
      await turn();
      if (!tok.busy && !tok.todo.length && i > 5) break;
    }
    assert.equal(tok.busy, false, 'the scene came to its end');
    for (let i = 0; i < 100; i++) dir.frame(0.1); // the hull comes to rest
    return laid;
  };
  const hull = () => [tok.pic.build, Math.round(tok.shown * 100) / 100];
  for (let i = 0; i < 100; i++) dir.frame(0.1);
  assert.deepEqual([hull(), pieces], [[0.25, 0.25], 0]);
  // one criterion met: one piece; the hull stood as it was until the piece lay in it, and rose after
  dir.update(at([true, false, false, false]), trailOf([E('a', 'check', { n: 1 })]));
  assert.deepEqual(await play(), [0.25]);
  assert.deepEqual([hull(), pieces], [[0.4375, 0.44], 1]);
  // two met close together: two pieces, each before its own rise
  dir.update(at([true, true, true, false]), trailOf([E('a', 'check', { n: 2 }), E('a', 'check', { n: 3 })]));
  assert.deepEqual(await play(), [0.45, 0.6]);
  assert.deepEqual([hull(), pieces], [[0.8125, 0.81], 3]);
  // taken back, or struck out: the hull moves, and no piece comes
  dir.update(at([true, true, false, false]), trailOf([E('a', 'uncheck', { n: 3 })]));
  assert.deepEqual(await play(), []);
  dir.update(at([true, true, false, 'void']), trailOf([E('a', 'void', { n: 4 })]));
  assert.deepEqual(await play(), []);
  assert.deepEqual([hull(), pieces], [[0.75, 0.75], 3]);
  // met while its worker is not seen at work any more (the yard plays it later than it happened): the piece comes all the same
  dir.update(at([true, true, true, 'void'], { run: undefined }), trailOf([E('a', 'check', { n: 3 })]));
  assert.deepEqual(await play(), [0.75]);
  assert.deepEqual([hull(), pieces, crane.goal], [[1, 1], 4, 'hold']);
  // the keel laid with a criterion already met: no piece for the keel itself, and nobody waits for one
  dir.update(board([T('a', 'in_progress', { criteria: [{ done: true }, { done: true }, { done: true }, { done: false, void: true }] }), T('b', 'in_progress', { criteria: [{ done: true }, { done: false }] })]), trailOf([E('b', 'started'), E('b', 'check', { n: 1 })]));
  await settle();
  const b = dir.tokens.get('b');
  for (let i = 0; i < 100; i++) dir.frame(0.1);
  assert.deepEqual([b.place, Math.round(b.shown * 100) / 100, b.wait], ['slip', 0.63, false]);
  // too far behind for a story: the ticket is put as the board has it, and no piece is waited for
  dir.update(board([T('a', 'in_progress', { criteria: [{ done: true }, { done: true }, { done: true }, { done: false, void: true }] }), T('b', 'in_progress', { criteria: [{ done: true }, { done: true }] })]), trailOf([E('b', 'check', { n: 2 })]));
  assert.equal(b.wait, true);
  dir.catchUp();
  for (let i = 0; i < 5; i++) await turn();
  assert.deepEqual([b.wait, b.busy, world.cranes[b.slip].orders.length], [false, false, 0]);
  for (let i = 0; i < 100; i++) dir.frame(0.1);
  assert.equal(Math.round(b.shown * 100) / 100, 1);
  assert.deepEqual(errors, []);
});

test('a hull that passed: its crane parks before the sails are set and stays parked until the ship is launched', async () => {
  const { dir, settle, T, board, errors, E, trailOf, world, where } = await stagedYard({ cranes: true });
  const crit = [{ done: true }];
  dir.update(board([T('a', 'in_progress', { criteria: crit, run: { role: 'worker' } }), T('b', 'in_progress', { criteria: crit, run: { role: 'worker' } })]), trailOf([]));
  const [a, b] = ['a', 'b'].map((id) => dir.tokens.get(id));
  const [ca, cb] = [world.cranes[a.slip], world.cranes[b.slip]];
  // at every frame from here on: no sail is up beside a crane that is not parked
  let frames = 0, early = 0;
  const frame = dir.frame.bind(dir);
  dir.frame = (dt) => {
    frame(dt);
    frames++;
    for (const tok of [a, b]) if (tok.ship && tok.place === 'slip' && tok.ship.rigged && !world.cranes[tok.slip].parked) early++;
  };
  // both cranes are over their hulls with a piece in the hook
  for (let i = 0; i < 2000 && !(ca.load && ca.at === 'hull' && cb.load && cb.at === 'hull'); i++) dir.frame(0.1);
  assert.ok(ca.load && cb.load && ca.at === 'hull');
  // a: handed over, inspected, passed. b: passed with no reviewer (the light lane): the sails would go up at once
  dir.update(board([T('a', 'review', { criteria: crit, state: { passed: true } }), T('b', 'review', { criteria: crit, state: { passed: true } })]),
    trailOf([E('a', 'submitted', { to: 'review' }), E('a', 'verdict', { result: 'pass', round: 1 }), E('b', 'submitted', { to: 'review', passed: true })]));
  assert.equal(b.pic.rigged, true);
  dir.frame(0.1);
  assert.deepEqual([cb.goal, cb.parked, b.ship.rigged], ['park', false, false], 'the piece goes back first; no sail yet');
  await settle();
  for (let i = 0; i < 300; i++) dir.frame(0.1);
  assert.deepEqual([a.rig, a.ship.rigged, ca.parked, b.rig, b.ship.rigged, cb.parked], [true, true, true, true, true, true]);
  assert.deepEqual([ca.load, cb.load, ca.pose.a, cb.pose.a], [false, false, 0, 0], 'turned to the water, away from the masts, the hook empty');
  // it stays so for as long as the ship waits: held before the merge, say
  const parked = JSON.stringify([ca.pose, cb.pose]);
  dir.update(board([T('a', 'review', { criteria: crit, state: { passed: true, held: 'Q1' } }), T('b', 'review', { criteria: crit, state: { passed: true } })]), trailOf([]));
  for (let i = 0; i < 600; i++) dir.frame(0.1);
  assert.equal(JSON.stringify([ca.pose, cb.pose]), parked);
  // launched: parked all the way, and after, at the empty slip
  dir.update(board([T('a', 'done', { criteria: crit, landed: 5 }), T('b', 'done', { criteria: crit, landed: 6 })]), trailOf([E('a', 'landed'), E('b', 'landed')]));
  await settle();
  for (let i = 0; i < 300; i++) dir.frame(0.1);
  assert.deepEqual([where().a, where().b], ['bay', 'bay']);
  assert.equal(JSON.stringify([ca.pose, cb.pose]), parked);
  assert.deepEqual([ca.goal, cb.goal], ['park', 'park']);
  assert.ok(frames > 1000);
  assert.equal(early, 0, 'a sail was up beside a crane at work');

  // landed with its crane still at work (no pass was seen): the launch waits until the crane is out of the way
  const yard = await stagedYard({ cranes: true });
  yard.dir.update(yard.board([yard.T('c', 'in_progress', { criteria: crit, run: { role: 'worker' } })]), yard.trailOf([]));
  const c = yard.dir.tokens.get('c'), cc = yard.world.cranes[c.slip];
  for (let i = 0; i < 2000 && !(cc.load && cc.at === 'hull'); i++) yard.dir.frame(0.1);
  let wrong = 0;
  const f2 = yard.dir.frame.bind(yard.dir);
  yard.dir.frame = (dt) => { f2(dt); if (c.ship && c.place === 'slip' && (c.ship.rigged || c.adrift) && !cc.parked) wrong++; };
  yard.dir.update(yard.board([yard.T('c', 'done', { criteria: crit, landed: 5 })]), yard.trailOf([yard.E('c', 'landed')]));
  // (the yard's frames go on while the people do their jobs, as on the page)
  let over = false;
  const jobs = yard.settle().then(() => { over = true; });
  for (let i = 0; i < 3000 && !over; i++) { yard.dir.frame(0.1); await turn(); }
  await jobs;
  assert.deepEqual([yard.where().c, cc.parked, wrong], ['bay', true, 0]);
  // a page opened on a hull that passed: its crane is parked from the first frame, and the sails are up
  const open = await stagedYard({ cranes: true });
  open.world.cranes[0].aim('work');
  for (let i = 0; i < 150; i++) open.world.cranes[0].step(0.1);
  open.dir.update(open.board([open.T('d', 'review', { criteria: crit, state: { passed: true } })]), open.trailOf([]));
  open.dir.frame(0.1);
  assert.deepEqual([open.world.cranes[0].parked, open.dir.tokens.get('d').ship.rigged], [true, true]);
  assert.deepEqual([...errors, ...yard.errors, ...open.errors], []);
});

test('the slips change while the page is open: every slip keeps its crane, a new slip gets one, and a slip taken away takes its crane with it', async () => {
  const { dir, settle, T, board, errors, world } = await stagedYard({ cranes: true });
  const ids = ['a', 'b', 'c'];
  const at = (n, gone = []) => board(ids.filter((id) => !gone.includes(id)).map((id) => T(id, 'in_progress', { run: { role: 'worker' } })), { settings: { max_parallel: n } });
  dir.update(at(3), { now: 1, events: [], reread: false });
  await settle();
  for (let i = 0; i < 150; i++) dir.frame(0.1);
  const three = [...world.cranes];
  assert.deepEqual([three.length, three.map((c) => c.goal)], [3, ['work', 'work', 'work']]);
  const mid = JSON.stringify(three[1].pose);
  // raised to six: the three keep theirs, as they were; three more, parked at their empty slips
  dir.update(at(6));
  assert.equal(world.cranes.length, 6);
  assert.deepEqual(world.cranes.slice(0, 3), three);
  assert.equal(JSON.stringify(three[1].pose), mid);
  for (let i = 0; i < 50; i++) dir.frame(0.1);
  assert.deepEqual(world.cranes.map((c) => c.goal), ['work', 'work', 'work', 'park', 'park', 'park']);
  assert.ok(world.cranes.slice(3).every((c) => c.parked));
  // lowered to one while three hulls stand: their slips stay, and their cranes with them
  dir.update(at(1));
  for (let i = 0; i < 50; i++) dir.frame(0.1);
  assert.deepEqual(world.cranes, three);
  // the last hull goes while its crane has a piece asked for: the slip is taken away, and nobody waits for the piece
  let told = false;
  three[2].deliver().then(() => { told = true; });
  dir.update(at(1, ['c']));
  for (let i = 0; i < 80; i++) { dir.frame(0.1); await turn(); }
  assert.deepEqual([world.cranes.length, told], [2, true]);
  assert.deepEqual(world.cranes, three.slice(0, 2));
  assert.deepEqual(errors, []);
});

test('the crane operator has no crane: they stand by the ship whose turn it is to land, and their chores name no crane', async () => {
  const { craneDuty } = await import('../viewer/web/space/director.js');
  const { dir, settle, T, board, errors, world, cast } = await stagedYard();
  const crit = [{ done: true }];
  const at = (queue) => board([T('a', 'review', { criteria: crit, state: { passed: true } }), T('b', 'review', { criteria: crit, state: { passed: true } }), T('q', 'todo')], { mergeQueue: queue });
  dir.update(at([]), { now: 1, events: [], reread: false });
  await settle();
  const a = cast.crane;
  a.diary.length = 0;
  assert.equal(await craneDuty(a, world, dir), false, 'nothing waits to land: no duty');
  assert.equal(await craneDuty(a, world, null), false);
  dir.update(at(['b', 'a']));
  assert.equal(await craneDuty(a, world, dir), true);
  assert.deepEqual([a.diary, a.doing], [['to slip 2'], 'standing by to launch “b”']);
  dir.update(at(['a']));
  a.diary.length = 0;
  assert.equal(await craneDuty(a, world, dir), true);
  assert.deepEqual(a.diary, ['to slip 1']);
  // first in the queue, and not a hull on a slip: nowhere to stand
  dir.update(at(['q']));
  assert.equal(await craneDuty(a, world, dir), false);
  // still on the list of people, and nothing they do names a crane of their own
  const src = fs.readFileSync(path.join(SPACE, 'cast.js'), 'utf8');
  assert.match(src, /name: 'Crane operator', role: 'crane', at: 'mooring', chores: chores\.crane, duty: craneDuty/);
  const chores = src.slice(src.indexOf('  crane: ['), src.indexOf('  keeper: ['));
  assert.equal([...chores.matchAll(/a\.doing = '([^']+)'/g)].length, 3);
  for (const m of chores.matchAll(/a\.doing = '([^']+)'/g)) assert.doesNotMatch(m[1], /crane|load/);
  assert.doesNotMatch(src + fs.readFileSync(path.join(SPACE, 'director.js'), 'utf8'), /stations\.crane|w\.crane\b|w\.crane\./);
  assert.match(fs.readFileSync(path.join(SPACE, 'world.js'), 'utf8'), /mooring: \[/);
  assert.deepEqual(errors, []);
});

test('the demo shows the cranes at work, a piece set down for a criterion met, and a crane parked beside sails', async () => {
  const { startDemo } = await import('../viewer/web/space/demo.js');
  const { dir, settle, errors, world } = await stagedYard({ cranes: true });
  const reads = [];
  const stop = startDemo((D, trail) => reads.push([D, trail]));
  stop();
  const shown = { working: false, pieces: 0, parked: false, still: false };
  let early = 0;
  const frame = dir.frame.bind(dir);
  dir.frame = (dt) => {
    frame(dt);
    world.cranes.forEach((c, k) => {
      const tok = dir.onSlip(k);
      if (c.goal === 'work') assert.ok(tok && tok.pic.worker === 'working' && !tok.pic.rigged, 'a crane works only while a worker does');
      if (c.goal === 'work' && c.load && c.at === 'hull') shown.working = true;
      if (tok && tok.ship.rigged && c.parked) shown.parked = true;
      if (tok && tok.ship.rigged && !c.parked && !tok.adrift) early++;
      if (tok && c.goal === 'hold' && c.still) shown.still = true;
    });
  };
  for (const c of world.cranes) { const deliver = c.deliver.bind(c); c.deliver = (deck) => deliver(deck).then(() => { shown.pieces++; }); }
  const done = () => shown.working && shown.pieces >= 3 && shown.parked && shown.still;
  for (let i = 0; i < 1500 && !done(); i++) {
    if (i) stop.step();
    for (const [D, trail] of reads.splice(0)) {
      dir.update(D, trail);
      await settle();
      for (let k = 0; k < 10; k++) dir.frame(0.1); // a second of the yard for a second of the demo
    }
  }
  assert.ok(done(), `within 25 minutes of the demo: ${JSON.stringify(shown)}`);
  assert.equal(early, 0, 'a sail was up beside a crane that was not parked');
  assert.deepEqual(errors, []);
});
