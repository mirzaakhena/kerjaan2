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
