// Every test builds a throwaway repository with a board and drives the real
// CLI against it. Nothing in this checkout is changed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as T from '../core/ticket.mjs';

const K2 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'k2');

const cleanEnv = () => {
  const e = { ...process.env };
  for (const k of ['K2_ROLE', 'K2_AGENT', 'K2_HOME']) delete e[k];
  return e;
};

function sh(cwd, cmd, args, input) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', input, env: { ...cleanEnv(), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// A repo whose "tests" fail when any file contains the word BROKEN.
const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

function repo({ test: testCmd = 'node check.js', settings = {} } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'k2-')));
  made.push(dir);
  const git = (...a) => sh(dir, 'git', a);
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'line one\nline two\nline three\n');
  fs.writeFileSync(path.join(dir, 'check.js'), "const fs=require('fs');const bad=fs.readdirSync('.').filter(f=>f.endsWith('.txt')&&fs.readFileSync(f,'utf8').includes('BROKEN'));process.exit(bad.length?1:0)\n");
  git('add', '-A');
  git('commit', '-qm', 'init');
  // Tests give verdicts as the reviewer the foreman sent.
  const k = (...a) => {
    if (a[0] === 'verdict') sh(dir, K2, ['agent', a[1], 'reviewer', 'rv']);
    return sh(dir, K2, a);
  };
  assert.equal(k('init', '--language', 'Bahasa Indonesia', '--test', testCmd).code, 0);
  const file = path.join(dir, '.kerjaan2', 'settings.yml');
  let s = fs.readFileSync(file, 'utf8');
  for (const [key, v] of Object.entries(settings)) {
    const re = new RegExp(`^${key}:.*$`, 'm');
    s = re.test(s) ? s.replace(re, `${key}: ${v}`) : `${s}\n${key}: ${v}\n`;
  }
  fs.writeFileSync(file, s);
  return { dir, git, k, kIn: (cwd, ...a) => sh(cwd, K2, a) };
}

// A ticket in todo with a filled contract. Returns its ID.
function ticket(r, title, { lane = 'standard', items = ['Baris baru tampil'], extra = [] } = {}) {
  const out = r.k('new', title, '--type', 'feature', '--lane', lane, '--status', 'todo', ...extra).out;
  const file = out.split('\n')[0];
  const id = path.basename(file).slice(0, 12);
  const text = fs.readFileSync(file, 'utf8')
    .replace('## Request\n', '## Request\nBaris baru ada di berkas.\n')
    .replace('## Done when\n', `## Done when\n${items.map((i) => `- [ ] ${i}`).join('\n')}\n`);
  fs.writeFileSync(file, text);
  return id;
}

const wtOf = (r, id) => path.join(r.dir, '.worktrees', fs.readdirSync(path.join(r.dir, '.worktrees')).find((n) => n.startsWith(id)));
const statusOf = (r, id) => path.basename(path.dirname(r.k('show', id, '--path').out.trim()));

function work(r, id, file, content, { checks = [1] } = {}) {
  const wt = wtOf(r, id);
  fs.writeFileSync(path.join(wt, file), content);
  sh(wt, 'git', ['add', '-A']);
  sh(wt, 'git', ['commit', '-qm', `work ${id}`]);
  for (const n of checks) assert.equal(r.k('check', id, String(n), 'dijalankan dan terlihat').code, 0);
  assert.equal(r.k('handoff', id, 'Menambah satu baris. Baris lain jangan berubah.').code, 0);
  return wt;
}

test('a ticket file survives a round trip, record and all', () => {
  const t = { fm: { type: 'bug', priority: 'high', lane: 'strict', labels: ['a', 'b'], blocked_by: [], related: [], touches: ['src/'], created: '2026-11-11 10:00' }, contract: '## Request\nX\n\n## Done when\n- [ ] satu\n- [x] (owner) dua\n', record: T.emptyRecord() };
  T.addKeyed(t.record, 'questions', 'blocking', 'Hapus data lama?\nSaran: tidak');
  T.addKeyed(t.record, 'assumptions', 'unseen', 'Satu mata uang', ['Why: belum ada permintaan lain']);
  t.record.handoff = 'Yang berubah.\nDua baris.';
  t.record.review.push({ text: '2026-11-11 strict, round 1, at abc: passed.', sub: ['1: uji merah saat dirusak'] });
  const again = T.parse(T.serialize(t));
  assert.deepEqual(again.fm, t.fm);
  assert.deepEqual(again.record, t.record);
  assert.equal(T.serialize(again), T.serialize(t));
  const crit = T.criteria(again.contract);
  assert.deepEqual(crit.map((c) => [c.n, c.done, c.owner]), [[1, false, false], [2, true, true]]);
  assert.match(T.setCriterion(again.contract, 1, true), /- \[x\] satu/);
});

test('an empty record writes no section and no marker', () => {
  const text = T.serialize({ fm: { type: 'task', priority: 'low', lane: 'light', created: 'x' }, contract: '## Request\nY\n', record: T.emptyRecord() });
  assert.ok(!text.includes('k2:record'));
});

test('a light ticket goes from todo to main without a reviewer, and leaves nothing behind', () => {
  const r = repo();
  const id = ticket(r, 'Tambah baris keempat', { lane: 'light' });
  assert.match(r.k('next').out, new RegExp(`START  ${id}`));
  assert.equal(r.k('start', id).code, 0);
  const wt = wtOf(r, id);
  assert.ok(!fs.existsSync(path.join(wt, '.kerjaan2')), 'the worktree holds no second board');
  assert.match(r.k('next').out, /DISPATCH worker .*\n.*model=sonnet/);
  r.k('agent', id, 'worker', 'w1');
  assert.match(r.k('next').out, /^WAIT/);

  fs.writeFileSync(path.join(wt, 'app.txt'), 'line one\nline two\nline three\nline four\n');
  const dirty = r.kIn(wt, 'submit', id);
  assert.match(dirty.out, /uncommitted changes/);
  sh(wt, 'git', ['commit', '-qam', 'four']);
  const gaps = r.kIn(wt, 'submit', id);
  assert.equal(gaps.code, 1);
  assert.match(gaps.out, /item 1 is not ticked/);
  assert.match(gaps.out, /no handoff/);
  r.kIn(wt, 'check', id, '1', 'cat app.txt menampilkan baris keempat');
  r.kIn(wt, 'handoff', id, 'Baris keempat ditambahkan di akhir.');
  const ok = r.kIn(wt, 'submit', id);
  assert.match(ok.out, /SUBMITTED .*carried from the run/s);
  assert.equal(statusOf(r, id), 'review', 'done means landed: until then it waits in review, marked as passed');

  assert.match(r.k('next').out, new RegExp(`LAND   ${id}`));
  assert.match(r.k('ls', 'review').out, /passed, not merged/);
  assert.match(r.k('brief', id, '--role', 'reviewer').out, /nothing for a reviewer to do/);
  assert.match(r.k('verdict', id, 'pass', '--note', 'x').out, /already passed/);
  assert.match(r.k('land', id).out, /LANDED/);
  assert.equal(statusOf(r, id), 'done');
  assert.match(fs.readFileSync(path.join(r.dir, 'app.txt'), 'utf8'), /line four/);
  assert.ok(!fs.existsSync(wt), 'the worktree is removed');
  assert.equal(r.git('branch', '--list', 'k2/*').out.trim(), '');
  assert.equal(r.git('status', '--porcelain', '--', '.kerjaan2/done', '.kerjaan2/log').out.trim(), '', 'the merge commit carries the ticket');
  assert.match(r.git('log', '-1', '--format=%s').out, new RegExp(`^${id} Tambah baris keempat`));
  assert.match(r.k('doctor').out, /healthy/);
  assert.match(r.k('next').out, /IDLE/);
});

test('a standard ticket is reviewed; a rejection goes back to the same worker and counts a round', () => {
  const r = repo();
  const id = ticket(r, 'Ubah baris kedua', { items: ['Baris kedua berubah', '(owner) Enak dibaca'] });
  r.k('start', id);
  r.k('agent', id, 'worker', 'w1');
  const wt = work(r, id, 'app.txt', 'line one\nline 2\nline three\n');
  assert.match(r.kIn(wt, 'check', id, '2', 'x').out, /owner's to check/);
  assert.match(r.kIn(wt, 'submit', id).out, /item 2 is the owner's to check/);
  r.kIn(wt, 'manual', id, '2', '1. Buka app.txt\n2. Baca baris kedua\nHarus terlihat: line 2');
  assert.match(r.kIn(wt, 'submit', id).out, /It is in review/);
  assert.match(r.k('next').out, /DISPATCH reviewer/);
  assert.match(r.k('brief', id, '--role', 'reviewer').out, /passed at .* on exactly the content under review/);
  assert.match(r.k('brief', id, '--role', 'reviewer').out, /Depth: standard/);
  assert.match(r.k('brief', id, '--role', 'worker').out, /nothing for a worker to do/);
  assert.match(r.kIn(r.dir, 'verdict', id, 'pass', '--note', '1: ok', '--note', '2: ok').out, /no reviewer was sent for this step/, 'a worker cannot judge its own ticket');
  r.k('agent', id, 'reviewer', 'r1');

  assert.equal(r.k('verdict', id, 'reject').code, 1, 'a rejection must say what failed');
  assert.match(r.k('verdict', id, 'reject', '--fail', '1', '--note', 'Baris kedua masih berbahasa Inggris').out, /SENT BACK/);
  assert.equal(statusOf(r, id), 'in_progress');
  assert.match(fs.readFileSync(r.k('show', id, '--path').out.trim(), 'utf8'), /- \[ \] Baris kedua berubah/);
  assert.match(r.k('next').out, /RESUME .* worker w1/);
  assert.match(r.k('brief', id, '--role', 'worker').out, /The reviewer sent this ticket back/);
  r.k('agent', id, 'worker', 'w1');

  fs.writeFileSync(path.join(wt, 'app.txt'), 'line one\nbaris dua\nline three\n');
  sh(wt, 'git', ['commit', '-qam', 'fix']);
  r.kIn(wt, 'check', id, '1', 'baris dua terlihat');
  r.kIn(wt, 'submit', id);
  assert.match(r.k('next').out, /RESUME .* reviewer (r1|rv)/);
  assert.match(r.k('brief', id, '--role', 'reviewer').out, /This is a later round/);
  assert.match(r.k('verdict', id, 'pass', '--note', '1: cat app.txt menampilkan baris dua').out, /Missing: 2/);
  assert.match(r.k('verdict', id, 'pass', '--note', '1: cat app.txt menampilkan baris dua', '--note', '2: langkah di Manual checks bisa diikuti').out, /PASSED .* round 2/);
  assert.equal(statusOf(r, id), 'review');
  r.k('land', id);
  assert.equal(statusOf(r, id), 'done');
  const text = fs.readFileSync(r.k('show', id, '--path').out.trim(), 'utf8');
  assert.match(text, /round 1, at \w+: sent back\./);
  assert.match(text, /round 2, at \w+: passed\./);
  assert.match(r.k('inbox').out, /manual check \(1\)/);
  assert.equal(r.k('manual', id, 'ok', 'M1').code, 0);
  assert.match(fs.readFileSync(r.k('show', id, '--path').out.trim(), 'utf8'), /- \[x\] \(owner\) Enak dibaca/);
  assert.match(r.k('inbox').out, /Nothing waits/);
});

test('two tickets side by side: the first lands at once, the second is brought up to date and its conflict reviewed', () => {
  const r = repo();
  const a = ticket(r, 'Ubah baris pertama versi A');
  const b = ticket(r, 'Ubah baris pertama versi B');
  r.k('start', a);
  r.k('start', b);
  const next = r.k('next').out;
  assert.ok(next.includes(`DISPATCH worker for ${a}`) && next.includes(`DISPATCH worker for ${b}`), 'both are dispatched together');
  const wa = work(r, a, 'app.txt', 'line A\nline two\nline three\n');
  const wb = work(r, b, 'app.txt', 'line B\nline two\nline three\n');
  r.k('agent', b, 'worker', 'wb');
  r.kIn(wa, 'submit', a);
  r.kIn(wb, 'submit', b);
  r.k('verdict', a, 'pass', '--note', '1: ok');
  r.k('verdict', b, 'pass', '--note', '1: ok');
  assert.match(r.k('land', a).out, /LANDED/);

  const held = r.k('land', b);
  assert.equal(held.code, 3);
  assert.match(held.out, /INTEGRATE .* conflicts in app\.txt/);
  assert.equal(statusOf(r, b), 'review', 'an integration is not a rejection: the ticket stays in review, passed');
  assert.equal(sh(wb, 'git', ['status', '--porcelain']).out.trim(), '', 'the failed merge was backed out');
  assert.match(r.k('next').out, /RESUME .* worker wb — main moved/);
  const brief = r.k('brief', b, '--role', 'worker').out;
  assert.match(brief, /mode: integrate/);
  assert.match(brief, new RegExp(`${a} Ubah baris pertama versi A`), 'the brief names what landed meanwhile');
  assert.match(brief, /Handoff: Menambah satu baris/);
  assert.match(r.k('land', b).out, /being brought up to date/);

  sh(wb, 'git', ['merge', 'main']);
  const open = r.kIn(wb, 'submit', b);
  assert.match(open.out, /merge is not finished/);
  fs.writeFileSync(path.join(wb, 'app.txt'), 'line A and B\nline two\nline three\n');
  sh(wb, 'git', ['add', 'app.txt']);
  sh(wb, 'git', ['commit', '-q', '--no-edit']);
  assert.match(r.kIn(wb, 'submit', b).out, /INTEGRATED .*A reviewer looks at what you changed/s);
  assert.match(r.k('next').out, /reviewer .*look only at what its worker changed/);
  const rb = r.k('brief', b, '--role', 'reviewer').out;
  assert.match(rb, /Only what changed after this ticket passed/);
  assert.match(rb, /log --first-parent --cc -p [0-9a-f]{12}\.\.HEAD/, 'it reads from the commit it judged');
  assert.ok(!rb.includes('per `Done when` line'), 'no per-criterion template here');
  assert.ok(!rb.includes('Depth: standard'), 'one depth, not two');
  assert.equal(r.k('verdict', b, 'pass').code, 1, 'say what was checked');
  r.k('verdict', b, 'pass', '--note', 'kedua maksud terjaga');
  assert.match(r.k('land', b).out, /LANDED/);
  assert.match(fs.readFileSync(path.join(r.dir, 'app.txt'), 'utf8'), /line A and B/);
  assert.match(r.k('doctor').out, /healthy/);
});

test('the merge queue: tickets land in the order they passed, and the front keeps its turn while it is brought up to date', () => {
  const r = repo();
  const ids = ['A', 'B', 'C'].map((x) => ticket(r, `Baris pertama ${x}`, { lane: 'light' }));
  for (const id of ids) r.k('start', id);
  const wts = ids.map((id, i) => work(r, id, i === 2 ? 'c.txt' : 'app.txt', `line ${i}\n`));
  ids.forEach((id, i) => r.kIn(wts[i], 'submit', id));
  const [a, b, c] = ids;
  const early = r.k('land', c);
  assert.equal(early.code, 5, 'only the front of the merge queue lands');
  assert.match(early.out, new RegExp(`WAITING ${c}: number 3 in the merge queue. ${a} is at the front`));
  assert.match(r.k('status').out, new RegExp(`Merge queue: 1. ${a}  2. ${b}  3. ${c}`));
  r.k('land', a);
  assert.equal(r.k('land', b).code, 3, 'B conflicts with A');
  const waits = r.k('land', c);
  assert.equal(waits.code, 5);
  assert.match(waits.out, new RegExp(`WAITING ${c}: number 2 in the merge queue. ${b} is at the front and is being brought up to date`));
  assert.match(r.k('next').out, new RegExp(`WAIT   ${c} passed; number 2 in the merge queue, behind ${b}`));
  assert.match(r.k('status').out, new RegExp(`Merge queue: 1. ${b} \\(being brought up to date\\)  2. ${c}`));
  sh(wts[1], 'git', ['merge', 'main']);
  fs.writeFileSync(path.join(wts[1], 'app.txt'), 'line 0 and 1\n');
  sh(wts[1], 'git', ['add', '-A']);
  sh(wts[1], 'git', ['commit', '-q', '--no-edit']);
  assert.match(r.kIn(wts[1], 'submit', b).out, /INTEGRATED .*A reviewer looks/s, 'a conflict resolved by hand gets a reviewer on every lane');
  r.k('verdict', b, 'pass', '--note', 'kedua baris terjaga');
  assert.match(r.k('land', b).out, /LANDED/);
  assert.match(r.k('land', c).out, /LANDED/);
  const h = r.k('history', b).out;
  assert.match(h, /→ in_progress\s+started/);
  assert.match(h, /→ review\s+submitted/);
  assert.match(h, /→ done\s+landed/);
  assert.match(h, /integrate\s+main moved before it could land \(conflict\)/);
  assert.match(h, /landed in main/);
});

test('a held merge steps out of the merge queue, and rejoins at the back once cleared', () => {
  const r = repo();
  const a = ticket(r, 'Berkas A tertahan', { lane: 'light' });
  const b = ticket(r, 'Berkas B lancar', { lane: 'light' });
  r.k('start', a);
  r.k('start', b);
  r.kIn(work(r, a, 'a.txt', 'A\n'), 'submit', a);
  r.kIn(work(r, b, 'b.txt', 'B\n'), 'submit', b);
  r.git('checkout', '-q', '-b', 'lain');
  const held = r.k('land', a);
  assert.equal(held.code, 4);
  assert.match(held.out, /HELD .* the main tree is on branch "lain"/);
  r.git('checkout', '-q', 'main');
  assert.match(r.k('inbox').out, /not merged \(1\)/);
  const next = r.k('next').out;
  assert.match(next, new RegExp(`OWNER  ${a} cannot land: the main tree is on branch`));
  assert.match(next, new RegExp(`LAND   ${b} is at the front`), 'the queue moves on without the held one');
  assert.match(r.k('land', b).out, /LANDED/);
  assert.match(r.k('land', a).out, /LANDED .*tests passed on the merged state/);
  assert.match(r.k('doctor').out, /healthy/);
});

test('main moved without touching the same lines: land merges, tests the merged state and lands with no agent', () => {
  const r = repo();
  const a = ticket(r, 'Tambah berkas A', { lane: 'light' });
  const b = ticket(r, 'Tambah berkas B', { lane: 'light' });
  r.k('start', a);
  r.k('start', b);
  const wa = work(r, a, 'a.txt', 'A\n');
  const wb = work(r, b, 'b.txt', 'B\n');
  r.kIn(wa, 'submit', a);
  r.kIn(wb, 'submit', b);
  r.k('land', a);
  const out = r.k('land', b).out;
  assert.match(out, /LANDED .*tests passed on the merged state/);
  assert.ok(fs.existsSync(path.join(r.dir, 'a.txt')) && fs.existsSync(path.join(r.dir, 'b.txt')));
});

test('submit merges main in first, and reports a conflict with the other ticket\'s handoff', () => {
  const r = repo();
  const a = ticket(r, 'Tulis ulang baris tiga A', { lane: 'light' });
  const b = ticket(r, 'Tulis ulang baris tiga B', { lane: 'light' });
  r.k('start', a);
  r.k('start', b);
  const wa = work(r, a, 'app.txt', 'line one\nline two\nline 3A\n');
  r.kIn(wa, 'submit', a);
  r.k('land', a);
  const wb = work(r, b, 'app.txt', 'line one\nline two\nline 3B\n');
  const c = r.kIn(wb, 'submit', b);
  assert.equal(c.code, 2);
  assert.match(c.out, /CONFLICT .*\nFiles: app\.txt/);
  assert.match(c.out, new RegExp(`Landed meanwhile: ${a}`));
  assert.match(c.out, /Its handoff: Menambah satu baris/);
  assert.equal(statusOf(r, b), 'in_progress');
});

test('a failing test run stops the handover', () => {
  const r = repo();
  const id = ticket(r, 'Rusak', { lane: 'light' });
  r.k('start', id);
  const wt = work(r, id, 'app.txt', 'BROKEN\n');
  const out = r.kIn(wt, 'submit', id);
  assert.equal(out.code, 1);
  assert.match(out.out, /TESTS FAILED/);
  assert.equal(statusOf(r, id), 'in_progress');
});

test('the lane rises with what was really changed, and strict asks for the red-proof', () => {
  const r = repo({ settings: { strict_paths: '[pay/**]', light_max_files: '1' } });
  const wide = ticket(r, 'Dua berkas', { lane: 'light' });
  r.k('start', wide);
  const w1 = work(r, wide, 'one.txt', '1\n');
  fs.writeFileSync(path.join(w1, 'two.txt'), '2\n');
  sh(w1, 'git', ['add', '-A']);
  sh(w1, 'git', ['commit', '-qm', 'two']);
  assert.match(r.kIn(w1, 'submit', wide).out, /LANE RAISED to standard.*\n.*\n?.*review/s);
  assert.equal(statusOf(r, wide), 'review');

  const hot = ticket(r, 'Sentuh pembayaran', { lane: 'light' });
  r.k('start', hot);
  const w2 = wtOf(r, hot);
  fs.mkdirSync(path.join(w2, 'pay'));
  work(r, hot, 'pay/rate.txt', '10\n');
  const refused = r.kIn(w2, 'submit', hot);
  assert.match(refused.out, /LANE RAISED to strict/);
  assert.match(refused.out, /Red-proof/);
  assert.equal(statusOf(r, hot), 'in_progress');
  assert.match(r.k('brief', hot, '--role', 'worker').out, /This ticket is strict/);
  r.k('decide', hot, 'Red-proof: batas tarif dirusak, uji merah');
  assert.match(r.kIn(w2, 'submit', hot).out, /It is in review/);
});

test('a question for the owner never stops the work: it is built on the recommendation, reviewed, and held before the merge', () => {
  const r = repo();
  const a = ticket(r, 'Perlu keputusan');
  const b = ticket(r, 'Jalan terus', { lane: 'light' });
  r.k('start', a);
  r.k('start', b);
  r.k('agent', a, 'worker', 'wa');
  assert.match(r.k('ask', a, '--blocking', 'Hapus data lama? Saran: tidak').out, /Do not stop: build the option you recommended/);
  let next = r.k('next').out;
  assert.match(next, new RegExp(`OWNER  ${a} Q1`));
  assert.match(next, new RegExp(`WAIT   ${a} worker wa`), 'its worker keeps working');
  const wa = work(r, a, 'app.txt', 'line one\nline two\nline 3\n');
  assert.match(r.kIn(wa, 'submit', a).out, /It is in review/);
  assert.match(r.k('verdict', a, 'pass', '--note', '1: ok').out, /held before the merge: it waits for the owner's answer to Q1/);
  const held = r.k('land', a);
  assert.equal(held.code, 4);
  assert.match(held.out, /HELD .*waits for the owner's answer to Q1/);
  r.kIn(work(r, b, 'b.txt', 'b\n'), 'submit', b);
  assert.match(r.k('land', b).out, /LANDED/, 'the held ticket does not block the merge queue');
  next = r.k('next').out;
  assert.match(next, new RegExp(`OWNER  ${a} Q1.*\\n.*held before the merge`));
  assert.match(next, /IDLE   no agent has anything to do/);
  assert.match(r.k('inbox').out, /blocking question \(1\)/);
  assert.match(r.k('answer', a, 'Q1', 'Jangan dihapus').out, /--agrees .* or --differs/);
  assert.match(r.k('answer', a, 'Q1', 'Jangan dihapus', '--agrees').out, /joins the merge queue/);
  assert.match(r.k('land', a).out, /LANDED/);
  assert.match(fs.readFileSync(r.k('show', a, '--path').out.trim(), 'utf8'), /Q1 \[answered\].*\n  → Jangan dihapus \(owner, /);
});

test('an answer that differs from what was built sends the ticket back to its worker', () => {
  const r = repo();
  const a = ticket(r, 'Dibangun dengan saran');
  r.k('start', a);
  r.k('agent', a, 'worker', 'wa');
  r.k('ask', a, '--blocking', 'Format A atau B? Saran: A');
  r.kIn(work(r, a, 'app.txt', 'A\n'), 'submit', a);
  r.k('verdict', a, 'pass', '--note', '1: ok');
  assert.match(r.k('answer', a, 'Q1', 'B', '--differs').out, /in in_progress again/);
  assert.equal(statusOf(r, a), 'in_progress');
  assert.match(r.k('next').out, /RESUME .* worker wa — the owner answered/);
  assert.match(r.k('brief', a, '--role', 'worker').out, /chose differently from what you\s+built/);
  const wt = wtOf(r, a);
  fs.writeFileSync(path.join(wt, 'app.txt'), 'B\n');
  sh(wt, 'git', ['commit', '-qam', 'B']);
  assert.match(r.kIn(wt, 'submit', a).out, /It is in review/);
  r.k('verdict', a, 'pass', '--note', '1: ok');
  assert.match(r.k('land', a).out, /LANDED/);
});

test('in backlog, a question for the owner keeps the ticket out of todo until it is answered', () => {
  const r = repo();
  const file = r.k('new', 'Belum jelas').out.split('\n')[0];
  const id = path.basename(file).slice(0, 12);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Request\n', '## Request\nX\n').replace('## Done when\n', '## Done when\n- [ ] satu\n'));
  assert.match(r.k('ask', id, '--blocking', 'Batasnya berapa?').out, /cannot enter todo/);
  assert.match(r.k('move', id, 'todo').out, /question Q1 is still open/);
  r.k('answer', id, 'Q1', 'Seratus');
  assert.equal(r.k('move', id, 'todo').code, 0);
});

test('assumptions show on done tickets until the owner has seen them', () => {
  const r = repo();
  const id = ticket(r, 'Dengan asumsi', { lane: 'light' });
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n');
  assert.equal(r.k('assume', id, 'Satu mata uang').code, 1, 'an assumption needs its reason');
  r.k('assume', id, 'Satu mata uang saja', '--why', 'tiket tidak menyebut yang lain', '--undo', 'tambah kolom mata uang');
  r.kIn(wt, 'submit', id);
  r.k('land', id);
  assert.match(r.k('ls', 'done').out, /≈1 assumption/);
  assert.match(r.k('inbox').out, /assumption \(1\)/);
  r.k('confirm', id, 'all');
  assert.match(r.k('inbox').out, /Nothing waits/);
});

test('readiness: no Done when, a blocker in backlog, and a blocker that has not landed', () => {
  const r = repo();
  const empty = r.k('new', 'Kosong').out.split('\n')[0];
  const emptyId = path.basename(empty).slice(0, 12);
  assert.match(r.k('move', emptyId, 'todo').out, /Request is empty/);
  const first = ticket(r, 'Dasar', { lane: 'light' });
  const second = ticket(r, 'Di atasnya', { lane: 'light', extra: ['--blocked-by', first] });
  assert.match(r.k('ready').out, new RegExp(`READY ${second} .*starts after ${first} lands`));
  assert.match(r.k('start', second).out, /waits for/);
  const next = r.k('next').out;
  assert.ok(next.includes(`START  ${first}`) && !next.includes(`START  ${second}`));
  r.k('start', first);
  r.kIn(work(r, first, 'base.txt', 'b\n'), 'submit', first);
  assert.match(r.k('start', second).out, /waits for/, 'done is not enough: it must be in main');
  r.k('land', first);
  assert.match(r.k('start', second).out, /STARTED/);
});

test('max_parallel caps the tickets in flight, and the queue sets the order', () => {
  const r = repo({ settings: { max_parallel: '1' } });
  const a = ticket(r, 'Satu', { lane: 'light' });
  const b = ticket(r, 'Dua', { lane: 'light' });
  r.k('queue', 'set', b, a, '--goal', 'Urutan terbalik');
  assert.match(r.k('queue').out, new RegExp(`1\\. ${b}[\\s\\S]*2\\. ${a}`));
  const next = r.k('next').out;
  assert.ok(next.includes(`START  ${b}`) && !next.includes(`START  ${a}`));
  r.k('start', b);
  assert.match(r.k('start', a).out, /max_parallel is 1/);
});

test('a solo ticket runs with nothing beside it, and nothing starts in front of it', () => {
  const r = repo();
  const a = ticket(r, 'Fitur biasa', { lane: 'light' });
  const g = ticket(r, 'Ubah struktur data', { lane: 'light' });
  const c = ticket(r, 'Fitur sesudahnya', { lane: 'light' });
  r.k('set', g, 'solo=true');
  assert.match(fs.readFileSync(r.k('show', g, '--path').out.trim(), 'utf8'), /^solo: true$/m);
  assert.ok(!/^solo:/m.test(fs.readFileSync(r.k('show', a, '--path').out.trim(), 'utf8')), 'solo is written only when set');
  r.k('queue', 'set', a, g, c);
  let next = r.k('next').out;
  assert.ok(next.includes(`START  ${a}`) && !next.includes(`START  ${g}`) && !next.includes(`START  ${c}`), next);
  assert.match(next, new RegExp(`WAIT   ${g} is solo`));
  r.k('start', a);
  assert.match(r.k('start', g).out, /is solo: it starts once/);
  r.kIn(work(r, a, 'a.txt', 'a\n'), 'submit', a);
  assert.match(r.k('start', g).out, /is solo: it starts once/, 'passed is not landed');
  r.k('land', a);
  next = r.k('next').out;
  assert.ok(next.includes(`START  ${g}`) && next.includes(', solo)') && !next.includes(`START  ${c}`), next);
  r.k('start', g);
  assert.match(r.k('start', c).out, /is solo and still in flight/);
  assert.match(r.k('next').out, new RegExp(`WAIT   ${g} is solo: nothing else starts`));
  r.kIn(work(r, g, 'g.txt', 'g\n'), 'submit', g);
  r.k('land', g);
  assert.match(r.k('next').out, new RegExp(`START  ${c}`));
});

test('the planner brief shows what main cannot: the work in flight and what landed last', () => {
  const r = repo();
  const a = ticket(r, 'Sudah mendarat', { lane: 'light' });
  const b = ticket(r, 'Sedang terbang');
  r.k('start', a);
  r.kIn(work(r, a, 'a.txt', 'a\n'), 'submit', a);
  r.k('land', a);
  r.k('start', b);
  const wb = wtOf(r, b);
  fs.writeFileSync(path.join(wb, 'baru.txt'), 'x\n');
  sh(wb, 'git', ['add', '-A']);
  sh(wb, 'git', ['commit', '-qm', 'wip']);
  const out = r.k('brief', '--role', 'planner').out;
  assert.match(out, /## In flight now \(1\)/);
  assert.match(out, new RegExp(`- ${b} Sedang terbang \\[in_progress\\]\\n  Request: Baris baru ada di berkas\\.\\n  Changed so far: baru\\.txt`));
  assert.match(out, new RegExp(`## Landed most recently[\\s\\S]*- ${a} Sudah mendarat .* — a\\.txt\\n  Menambah satu baris`));
});

test('a criterion is voided only by an answered question, and a reviewer then checks the void', () => {
  const r = repo();
  const id = ticket(r, 'Satu butir batal', { lane: 'light', items: ['Baris baru tampil', 'Ekspor ke CSV'] });
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n');
  assert.match(r.kIn(wt, 'submit', id).out, /item 2 is not ticked/);
  assert.equal(r.k('void', id, '2').code, 1, 'a void names the decision behind it');
  assert.match(r.k('void', id, '2', 'tidak perlu lagi').out, /No question is named/);
  assert.match(r.k('void', id, '2', 'Q1: ekspor ditunda').out, /Q1 is not an answered question/);
  r.k('ask', id, '--blocking', 'Ekspor CSV masih perlu? Saran: tunda');
  r.k('answer', id, 'Q1', 'Tunda', '--agrees');
  assert.match(r.k('void', id, '2', 'Q1: ekspor ditunda').out, /struck as void\. The lane is now standard/);
  assert.match(fs.readFileSync(r.k('show', id, '--path').out.trim(), 'utf8'), /- \[ \] ~~Ekspor ke CSV~~ — void: Q1: ekspor ditunda/);
  assert.match(r.k('check', id, '2', 'x').out, /is void/);
  assert.match(r.kIn(wt, 'submit', id).out, /It is in review/, 'no longer light: somebody looks at the void');
});

test('any test command takes its turn through k2 test, in the worktree or in a copy, and records nothing', () => {
  const r = repo();
  const id = ticket(r, 'Uji sebagian');
  r.k('start', id);
  const wt = wtOf(r, id);
  const ok = r.k('test', id, '--', 'echo', 'halo-$K2_TICKET');
  assert.equal(ok.code, 0);
  assert.match(ok.out, new RegExp(`halo-${id}[\\s\\S]*exit 0 .*nothing recorded`));
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'k2-copy-'));
  made.push(copy);
  fs.writeFileSync(path.join(copy, 'app.txt'), 'BROKEN\n');
  fs.copyFileSync(path.join(wt, 'check.js'), path.join(copy, 'check.js'));
  const bad = r.k('test', id, '--dir', copy);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /exit 1/);
  assert.ok(!fs.readFileSync(path.join(r.dir, '.kerjaan2', 'log', `${id}.jsonl`), 'utf8').includes('"test"'));
  assert.match(r.k('brief', id, '--role', 'worker').out, /Test runs take turns across worktrees/);
});

test('a rejection may be written in full; a pass stays short', () => {
  const r = repo();
  const id = ticket(r, 'Catatan panjang');
  r.k('start', id);
  r.kIn(work(r, id, 'x.txt', 'x\n'), 'submit', id);
  const long = 'Batas tidak dijaga di tiga tempat. '.repeat(20);
  assert.match(r.k('verdict', id, 'pass', '--note', long).out, /limit for a pass is 320/);
  assert.match(r.k('verdict', id, 'reject', '--fail', '1', '--note', long).out, /SENT BACK/);
});

test('a verdict is refused when the review changed the worktree or the branch moved under it', () => {
  const r = repo();
  const id = ticket(r, 'Ditinjau dengan rapi');
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n');
  r.kIn(wt, 'submit', id);
  fs.writeFileSync(path.join(wt, 'sisa-peninjau.txt'), 'coba\n');
  assert.match(r.k('verdict', id, 'pass', '--note', '1: ok').out, /worktree changed during the review[\s\S]*sisa-peninjau\.txt/);
  sh(wt, 'git', ['add', '-A']);
  sh(wt, 'git', ['commit', '-qm', 'menyelinap']);
  assert.match(r.k('verdict', id, 'pass', '--note', '1: ok').out, /NO VERDICT .* branch moved since it was handed over/);
  assert.equal(statusOf(r, id), 'in_progress', 'it goes back to be handed over again');
});

test('an accepted ticket is tested at the merge, and a red one stays out of main', () => {
  const r = repo();
  const id = ticket(r, 'Diterima pemilik');
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'BROKEN\n');
  const before = r.git('rev-parse', 'main').out.trim();
  assert.match(r.k('accept', id, '--why', 'cukup untuk sekarang').out, /ACCEPTED .*create the follow-up/s);
  const out = r.k('land', id);
  assert.equal(out.code, 3);
  assert.match(out.out, /the tests fail on what would enter main/);
  assert.equal(r.git('rev-parse', 'main').out.trim(), before, 'main did not move');
  fs.writeFileSync(path.join(wt, 'x.txt'), 'baik\n');
  sh(wt, 'git', ['commit', '-qam', 'pulih']);
  assert.match(r.kIn(wt, 'submit', id).out, /INTEGRATED/);
  r.k('verdict', id, 'pass', '--note', 'perbaikan dilihat');
  assert.match(r.k('land', id).out, /LANDED/);
  assert.equal(sh(r.dir, 'node', ['check.js']).code, 0, 'main is green');
});

test('a merge is held when the main tree has something else staged', () => {
  const r = repo();
  const id = ticket(r, 'Main tree kotor', { lane: 'light' });
  r.k('start', id);
  r.kIn(work(r, id, 'x.txt', 'x\n'), 'submit', id);
  fs.writeFileSync(path.join(r.dir, 'titipan.txt'), 'belum diuji\n');
  r.git('add', 'titipan.txt');
  const out = r.k('land', id);
  assert.equal(out.code, 4);
  assert.match(out.out, /HELD .*(git refused the merge|is not the content the tests passed on)/s);
  assert.ok(!r.git('log', '--format=%s', 'main').out.includes('Main tree kotor'), 'nothing was merged');
  r.git('reset', '-q', 'titipan.txt');
  fs.rmSync(path.join(r.dir, 'titipan.txt'));
  assert.match(r.k('land', id).out, /LANDED/);
});

test('a failing worktree_setup puts the ticket back in todo, and the board is free while it runs', () => {
  const r = repo({ settings: { worktree_setup: 'echo "$K2_WORKTREE" > env.out; test -f ../../boleh' } });
  const id = ticket(r, 'Setup gagal', { lane: 'light' });
  const bad = r.k('start', id);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /worktree_setup failed .* back in todo/);
  assert.equal(statusOf(r, id), 'todo');
  assert.equal(r.git('branch', '--list', 'k2/*').out.trim(), '');
  assert.match(r.k('doctor').out, /healthy/);
  fs.writeFileSync(path.join(r.dir, 'boleh'), '');
  assert.match(r.k('start', id).out, /STARTED/);
  assert.equal(fs.readFileSync(path.join(wtOf(r, id), 'env.out'), 'utf8').trim(), wtOf(r, id), 'the setup sees K2_WORKTREE');
});

test('tickets born in one session are listed together', () => {
  const r = repo();
  const env = (sid) => ({ ...process.env, CLAUDE_SESSION_ID: sid, CLAUDE_CODE_SESSION_ID: sid });
  const mk = (title, sid) => spawnSync(K2, ['new', title], { cwd: r.dir, encoding: 'utf8', env: env(sid) }).stdout;
  mk('Dari sesi satu A', 'aaaa1111-0000');
  mk('Dari sesi satu B', 'aaaa1111-0000');
  mk('Dari sesi dua', 'bbbb2222-0000');
  const out = r.k('ls', '--session', 'aaaa1111').out;
  assert.match(out, /backlog \(2\)/);
  assert.ok(out.includes('Dari sesi satu A') && out.includes('Dari sesi satu B') && !out.includes('Dari sesi dua'));
});

test('doctor finds a worktree and a branch nobody owns, and --fix removes them', () => {
  const r = repo();
  const id = ticket(r, 'Ditinggal', { lane: 'light' });
  r.k('start', id);
  r.k('move', id, 'backlog', '--force', '--why', 'ditunda');
  const found = r.k('doctor');
  assert.equal(found.code, 1);
  assert.match(found.out, /worktree .* belongs to no ticket in flight/);
  r.k('doctor', '--fix');
  assert.match(r.k('doctor').out, /healthy/);
  assert.equal(r.git('branch', '--list', 'k2/*').out.trim(), '');
});

test('the stop hook sends back a worker that ends before handing over, and lets a stopped one go', () => {
  const r = repo();
  const id = ticket(r, 'Belum selesai');
  r.k('start', id);
  r.k('agent', id, 'worker', 'agent-7');
  const hook = (extra = {}) => sh(r.dir, K2, ['hook', 'subagent-stop'], JSON.stringify({ cwd: r.dir, agent_id: 'agent-7', agent_type: 'kerjaan2:worker', ...extra })).out;
  assert.match(hook(), /"decision":"block"/);
  assert.equal(hook({ stop_hook_active: true }).trim(), '');
  assert.equal(hook({ agent_id: 'someone-else' }).trim(), '');
  r.k('ask', id, '--blocking', 'Boleh hapus?');
  assert.match(hook(), /"decision":"block"/, 'a question for the owner is no reason to stop');
  const start = sh(r.dir, K2, ['hook', 'session-start'], JSON.stringify({ cwd: r.dir })).out;
  assert.match(JSON.parse(start).hookSpecificOutput.additionalContext, /1 item\(s\) wait for the owner/);
});

test('the rules an agent reads stay under 6,000 words', () => {
  const root = path.join(path.dirname(K2), '..');
  const files = ['skills/kerjaan2/SKILL.md', ...['roles', 'agents'].flatMap((d) => fs.readdirSync(path.join(root, d)).map((f) => `${d}/${f}`))];
  const words = files.reduce((n, f) => n + fs.readFileSync(path.join(root, f), 'utf8').split(/\s+/).filter(Boolean).length, 0);
  assert.ok(words <= 6000, `${words} words`);
});

// ----- found by the independent review of 0.9.0 -----

const passLight = (r, title, file, content) => {
  const id = ticket(r, title, { lane: 'light' });
  r.k('start', id);
  r.kIn(work(r, id, file, content), 'submit', id);
  return id;
};

test('a commit that fails at the merge leaves the ticket where it was, and loses nothing', () => {
  const r = repo();
  const a = passLight(r, 'Commit gagal', 'a.txt', 'a\n');
  const b = passLight(r, 'Tiket berikutnya', 'b.txt', 'b\n');
  const hook = path.join(r.dir, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const before = r.git('rev-parse', 'main').out.trim();
  const out = r.k('land', a);
  assert.equal(out.code, 4);
  assert.match(out.out, /HELD .*commit/s);
  assert.equal(statusOf(r, a), 'review', 'not in done: it did not land');
  assert.equal(r.git('rev-parse', 'main').out.trim(), before);
  assert.notEqual(r.git('rev-parse', '-q', '--verify', 'MERGE_HEAD').code, 0, 'no merge is left open in the main tree');
  assert.ok(!fs.readFileSync(path.join(r.dir, '.kerjaan2', 'log', `${a}.jsonl`), 'utf8').includes('"landed"'));
  fs.rmSync(hook);
  assert.match(r.k('land', b).out, /LANDED/);
  assert.ok(fs.existsSync(r.k('show', a, '--path').out.trim()), 'the held ticket is still on the board');
  assert.match(r.k('land', a).out, /LANDED/);
  assert.match(r.k('doctor').out, /healthy/);
});

test('a merge the owner has open in the main tree is never aborted by land', () => {
  const r = repo();
  const a = passLight(r, 'Pemilik sedang merge', 'a.txt', 'a\n');
  r.git('checkout', '-q', '-b', 'sisi');
  fs.writeFileSync(path.join(r.dir, 'app.txt'), 'sisi\n');
  r.git('commit', '-qam', 'sisi');
  r.git('checkout', '-q', 'main');
  fs.writeFileSync(path.join(r.dir, 'app.txt'), 'utama\n');
  r.git('commit', '-qam', 'utama');
  r.git('merge', 'sisi');
  fs.writeFileSync(path.join(r.dir, 'app.txt'), 'diselesaikan pemilik\n');
  r.git('add', 'app.txt');
  const out = r.k('land', a);
  assert.equal(out.code, 4);
  assert.match(out.out, /HELD .*middle of a merge/s);
  assert.equal(r.git('rev-parse', '-q', '--verify', 'MERGE_HEAD').code, 0, "the owner's merge is still open");
  assert.equal(fs.readFileSync(path.join(r.dir, 'app.txt'), 'utf8'), 'diselesaikan pemilik\n');
});

test('only what was judged lands: a commit after the verdict sends the ticket back to be handed over again', () => {
  const r = repo();
  const id = ticket(r, 'Commit sesudah putusan', { lane: 'strict' });
  r.k('start', id);
  r.k('agent', id, 'worker', 'w1');
  const wt = work(r, id, 'x.txt', 'x\n');
  r.k('decide', id, 'Red-proof: batas dirusak, uji merah');
  r.kIn(wt, 'submit', id);
  r.k('agent', id, 'reviewer', 'r1');
  r.k('verdict', id, 'pass', '--note', '1: ok');
  fs.writeFileSync(path.join(wt, 'selundupan.txt'), 'tidak ditinjau\n');
  sh(wt, 'git', ['add', '-A']);
  sh(wt, 'git', ['commit', '-qm', 'sesudah putusan']);
  const out = r.k('land', id);
  assert.equal(out.code, 3);
  assert.match(out.out, /changed after it passed/);
  assert.equal(statusOf(r, id), 'in_progress');
  assert.ok(!fs.existsSync(path.join(r.dir, 'selundupan.txt')));
  assert.match(r.k('brief', id, '--role', 'worker').out, /mode: resubmit/);
  assert.match(r.kIn(wt, 'submit', id).out, /It is in review/);
});

test('a fix made after the tests failed on the merged state is seen by a reviewer before it lands', () => {
  const r = repo();
  const a = passLight(r, 'Mendarat dulu', 'a.txt', 'a\n');
  const b = ticket(r, 'Rusak bila digabung');
  r.k('start', b);
  r.k('agent', b, 'worker', 'wb');
  const wb = work(r, b, 'check.js', "const fs=require('fs');process.exit(fs.existsSync('a.txt')?1:0)\n");
  r.kIn(wb, 'submit', b);
  r.k('agent', b, 'reviewer', 'rb');
  r.k('verdict', b, 'pass', '--note', '1: ok');
  r.k('land', a);
  const out = r.k('land', b);
  assert.equal(out.code, 3);
  assert.match(out.out, /tests fail on what would enter main/);
  fs.writeFileSync(path.join(wb, 'check.js'), 'process.exit(0)\n');
  sh(wb, 'git', ['commit', '-qam', 'perbaikan']);
  assert.match(r.kIn(wb, 'submit', b).out, /INTEGRATED .*reviewer/s);
  assert.match(r.k('land', b).out, /waiting for its reviewer/);
  r.k('verdict', b, 'pass', '--note', 'perbaikan uji dilihat');
  assert.match(r.k('land', b).out, /LANDED/);
});

test('an agent that ended without handing over does not stall its ticket: release, stopped, and the stuck clock', () => {
  const r = repo({ settings: { stuck_after_minutes: '0' } });
  const id = ticket(r, 'Agen menghilang');
  r.k('start', id);
  r.k('agent', id, 'worker', 'hilang');
  assert.match(r.k('next').out, /STUCK  .* worker hilang/);
  assert.match(r.k('inbox').out, /stuck \(1\)/);
  assert.match(r.k('release', id, 'worker').out, /released/);
  assert.match(r.k('next').out, /RESUME .* worker hilang — it ended without handing over/);
  r.k('agent', id, 'worker', 'baru');
  // the stop hook, second time round, marks the agent as ended by itself
  sh(r.dir, K2, ['hook', 'subagent-stop'], JSON.stringify({ cwd: r.dir, agent_id: 'baru', agent_type: 'kerjaan2:worker', stop_hook_active: true }));
  assert.match(r.k('next').out, /RESUME .* worker baru — it ended without handing over/);
  assert.match(r.k('release', id, 'worker', '--stopped', 'pustaka yang dibutuhkan tidak ada').out, /waits for the owner/);
  const next = r.k('next').out;
  assert.match(next, /OWNER  .* its worker stopped: pustaka yang dibutuhkan tidak ada/);
  assert.match(next, /IDLE/);
  assert.match(r.k('inbox').out, /stopped \(1\)/);
  r.k('retry', id);
  assert.match(r.k('next').out, /RESUME .* worker baru/);
});

test('tickets that only wait for the owner use no room, do not block a solo ticket, and leave the queue idle', () => {
  const r = repo({ settings: { max_parallel: '2' } });
  const held = [1, 2].map((n) => {
    const id = ticket(r, `Ditahan ${n}`, { lane: 'light' });
    r.k('start', id);
    r.k('ask', id, '--blocking', 'Boleh? Saran: ya');
    r.kIn(work(r, id, `h${n}.txt`, 'x\n'), 'submit', id);
    return id;
  });
  const solo = ticket(r, 'Fondasi', { lane: 'light' });
  r.k('set', solo, 'solo=true');
  let next = r.k('next').out;
  assert.match(next, new RegExp(`START  ${solo}`), 'two held tickets do not fill max_parallel 2, nor block solo');
  assert.equal((next.match(new RegExp(`OWNER  ${held[0]} Q1`, 'g')) || []).length, 1, 'each question is printed once');
  assert.match(r.k('start', solo).out, /STARTED/);
  r.kIn(work(r, solo, 's.txt', 's\n'), 'submit', solo);
  r.k('land', solo);
  next = r.k('next').out;
  assert.match(next, /IDLE   no agent has anything to do/);
  assert.ok(!/^(DISPATCH|RESUME|START|LAND|WAIT)/m.test(next), next);
});

test('one unreadable ticket file is named and stepped over; CRLF files read fine', () => {
  const r = repo();
  const good = ticket(r, 'Sehat', { lane: 'light' });
  const crlf = r.k('show', good, '--path').out.trim();
  fs.writeFileSync(crlf, fs.readFileSync(crlf, 'utf8').replace(/\n/g, '\r\n'));
  const bad = path.join(r.dir, '.kerjaan2', 'backlog', '261231235901 Rusak.md');
  fs.writeFileSync(bad, 'tanpa frontmatter\n');
  const next = r.k('next').out;
  assert.match(next, /FIX    cannot read .*261231235901 Rusak\.md/);
  assert.match(next, new RegExp(`START  ${good}`), 'the rest of the board still works, CRLF ticket included');
  assert.equal(r.k('inbox').code, 0);
  assert.match(r.k('ls', 'backlog').out, /!! cannot read .*Rusak\.md/);
  assert.match(r.k('show', '261231235901').out, /Rusak/);
  assert.match(r.k('doctor').out, /cannot read .*Rusak\.md/);
  const hookOut = sh(r.dir, K2, ['hook', 'session-start'], JSON.stringify({ cwd: r.dir })).out;
  assert.match(hookOut, /cannot read/);
});

test('settings are validated: a YAML list is read, a bad number or an unknown key is refused', () => {
  const r = repo();
  const file = path.join(r.dir, '.kerjaan2', 'settings.yml');
  const base = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, base.replace(/^strict_paths:.*$/m, 'strict_paths:\n  - pay/\n  - "*.sql"'));
  const id = ticket(r, 'Menyentuh pembayaran', { lane: 'light' });
  r.k('start', id);
  const wt = wtOf(r, id);
  fs.mkdirSync(path.join(wt, 'src', 'pay'), { recursive: true });
  work(r, id, 'src/pay/tarif.txt', '10\n');
  assert.match(r.kIn(wt, 'submit', id).out, /LANE RAISED to strict: it changes src\/pay\/tarif\.txt/, 'a block-style list is read, and pay/ matches at any depth');
  fs.writeFileSync(file, base.replace(/^max_parallel:.*$/m, 'max_parallel: three'));
  assert.match(r.k('next').out, /max_parallel must be a whole number, not "three"/);
  fs.writeFileSync(file, base + '\nmax_paralel: 2\n');
  assert.match(r.k('status').out, /unknown setting "max_paralel"/);
});

test('strict_paths globs: the common shapes', async () => {
  const { globHit } = await import('../core/cmd-work.mjs');
  const hit = globHit;
  assert.ok(hit('*.sql', 'db/m.sql') && hit('*.sql', 'm.sql'));
  assert.ok(hit('auth/', 'src/auth/login.txt') && hit('auth/', 'auth/x'));
  assert.ok(hit('src/pay/**', 'src/pay/a/b.js') && !hit('src/pay/**', 'lib/src/pay/a.js'));
  assert.ok(hit('/config.yml', 'config.yml') && !hit('/config.yml', 'a/config.yml'));
  assert.ok(!hit('*.sql', 'm.sqlite') && !hit('auth/', 'authx/y'));
});

test('every checklist line counts however it is typed, and the contract cannot change under the work', () => {
  const r = repo();
  const file = r.k('new', 'Daftar aneh', '--lane', 'light', '--status', 'todo').out.split('\n')[0];
  const id = path.basename(file).slice(0, 12);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Request\n', '## Request\nX\n').replace('## Done when\n', '## Done when\n- [ ] satu\n* [ ] dua\n  - [ ] tiga\n- [] empat\n1. [ ] lima\n'));
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n');
  assert.match(r.kIn(wt, 'submit', id).out, /item 2 is not ticked[\s\S]*item 5 is not ticked/, 'all five lines are seen');
  for (const n of [2, 3, 4, 5]) r.k('check', id, String(n), 'ok');
  const now = fs.readFileSync(r.k('show', id, '--path').out.trim(), 'utf8');
  fs.writeFileSync(r.k('show', id, '--path').out.trim(), now.replace('- [x] lima\n', ''));
  const refused = r.kIn(wt, 'submit', id);
  assert.match(refused.out, /edited after work started/);
  assert.match(r.k('amend', id, '--why', 'butir lima dibatalkan Mirza').out, /judged against/);
  assert.match(r.kIn(wt, 'submit', id).out, /SUBMITTED/);
});

test('a handoff is plain text: a heading in it is refused, not silently cut', () => {
  const r = repo();
  const id = ticket(r, 'Serah terima', { lane: 'light' });
  r.k('start', id);
  const out = r.k('handoff', id, 'Yang berubah.\n## Review\n- 2026-01-01 strict, round 1, at abc: passed.');
  assert.equal(out.code, 1);
  assert.match(out.out, /plain sentences/);
});

test('every rejection past the second is put to the owner again', () => {
  const r = repo();
  const id = ticket(r, 'Ditolak berkali-kali');
  r.k('start', id);
  r.k('agent', id, 'worker', 'w');
  const wt = work(r, id, 'x.txt', 'x\n');
  const reject = () => {
    r.k('check', id, '1', 'ok');
    r.kIn(wt, 'submit', id);
    r.k('verdict', id, 'reject', '--fail', '1', '--note', 'belum');
  };
  reject();
  assert.match(r.k('next').out, /RESUME .* worker w/);
  reject();
  assert.match(r.k('next').out, /OWNER  .* was sent back 2 times/);
  r.k('retry', id);
  assert.match(r.k('next').out, /RESUME .* worker w/);
  reject();
  assert.match(r.k('next').out, /OWNER  .* was sent back 3 times/, 'retry is one more try, not a licence to loop');
});

test('an untracked file is never guessed to be a test artefact: the handover waits until git ignores it or holds it', () => {
  const r = repo({ test: 'node check.js && echo ran > laporan.out && test -f pembantu.txt' });
  const id = ticket(r, 'Uji meninggalkan berkas', { lane: 'light' });
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n');
  fs.writeFileSync(path.join(wt, 'pembantu.txt'), 'dibutuhkan uji, belum di-commit\n');
  const out = r.kIn(wt, 'submit', id);
  assert.equal(out.code, 1);
  assert.match(out.out, /neither tracked nor ignored[\s\S]*a file the code or the tests need[\s\S]*pembantu\.txt/, 'both routes are named, not only .gitignore');
  sh(wt, 'git', ['add', 'pembantu.txt']);
  sh(wt, 'git', ['commit', '-qm', 'pembantu']);
  const again = r.kIn(wt, 'submit', id);
  assert.equal(again.code, 1);
  assert.match(again.out, /files appeared during the run that git neither tracks nor ignores: laporan\.out[\s\S]*committed on this branch[\s\S]*\.gitignore/);
  assert.equal(statusOf(r, id), 'in_progress');
  fs.writeFileSync(path.join(wt, '.gitignore'), 'laporan.out\n');
  sh(wt, 'git', ['add', '.gitignore']);
  sh(wt, 'git', ['commit', '-qm', 'abaikan laporan']);
  assert.match(r.kIn(wt, 'submit', id).out, /SUBMITTED/);
  assert.match(r.k('land', id).out, /LANDED/);
  assert.ok(fs.existsSync(path.join(r.dir, 'pembantu.txt')), 'what the tests needed is in main');
  assert.equal(sh(r.dir, 'sh', ['-c', 'node check.js && test -f pembantu.txt']).code, 0);
});

test('a new source file that was never added still stops the handover', () => {
  const r = repo();
  const id = ticket(r, 'Lupa git add', { lane: 'light' });
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n');
  fs.writeFileSync(path.join(wt, 'lupa.txt'), 'belum di-add\n');
  assert.match(r.kIn(wt, 'submit', id).out, /neither tracked nor ignored[\s\S]*lupa\.txt/);
});

test('a k2 that is killed does not free the tests\' turn while its test run still lives', async () => {
  const r = repo();
  const a = ticket(r, 'Uji lama', { lane: 'light' });
  const b = ticket(r, 'Uji berikutnya', { lane: 'light' });
  r.k('start', a);
  r.k('start', b);
  const { spawn } = await import('node:child_process');
  const first = spawn(K2, ['test', a, '--', 'sleep', '4'], { cwd: r.dir, stdio: 'ignore' });
  const child = path.join(r.dir, '.kerjaan2', '.state', 'test.lock', 'child');
  for (let i = 0; i < 100 && !fs.existsSync(child); i++) await new Promise((res) => setTimeout(res, 50));
  assert.ok(fs.existsSync(child), 'the run recorded itself in the lock');
  first.kill('SIGKILL');
  await new Promise((res) => setTimeout(res, 200));
  const t0 = Date.now();
  const second = r.k('test', b, '--', 'echo', 'giliran-kedua');
  assert.match(second.out, /giliran-kedua/);
  assert.ok(Date.now() - t0 > 2000, `the second run waited for the orphaned one (${Date.now() - t0}ms)`);
});

test('quick makes a ticket that can start; an unknown option is refused; a short blocker ID is stored in full', () => {
  const r = repo();
  const file = r.k('quick', 'Ganti satu kata').out.split('\n')[0];
  const id = path.basename(file).slice(0, 12);
  assert.equal(statusOf(r, id), 'todo');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Request\n', '## Request\nX\n').replace('## Done when\n', '## Done when\n- [ ] satu\n'));
  assert.match(r.k('start', id).out, /STARTED/);
  assert.match(r.k('new', 'Judul', '--prioritas', 'high').out, /unknown option --prioritas/);
  assert.equal(r.k('ask', id, '--', '--force itu apa?').code, 0, 'text beginning with -- goes after a lone --');
  const other = ticket(r, 'Bergantung');
  r.k('set', other, `blocked_by=${id.slice(-4)}`);
  assert.match(fs.readFileSync(r.k('show', other, '--path').out.trim(), 'utf8'), new RegExp(`^blocked_by: \\[${id}\\]$`, 'm'));
});

test('an overturned assumption and a failed manual check stay in the inbox as follow-ups until settled', () => {
  const r = repo();
  const id = ticket(r, 'Asumsi keliru', { lane: 'light', items: ['Baris baru tampil', '(owner) Enak dilihat'] });
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n');
  r.k('assume', id, 'Satu mata uang', '--why', 'tidak disebut', '--undo', 'tambah kolom');
  r.k('manual', id, '2', '1. Buka berkas 2. Baca isinya 3. Harus terlihat: x');
  assert.match(fs.readFileSync(r.k('show', id, '--path').out.trim(), 'utf8'), /M1 \[waiting\] \(item 2\) 1\. Buka berkas\n  2\. Baca isinya\n  3\. Harus terlihat: x/, 'steps typed on one line are one per line');
  r.kIn(wt, 'submit', id);
  r.k('land', id);
  r.k('overturn', id, 'A1', '--note', 'harus multi mata uang');
  r.k('manual', id, 'failed', 'M1');
  const inbox = r.k('inbox').out;
  assert.match(inbox, /follow-up \(2\)/);
  assert.match(inbox, /Overturned A1: Satu mata uang/);
  r.k('followup', id, 'ticketed', 'F1', '--as', '261231000001');
  r.k('followup', id, 'declined', 'F2');
  assert.match(r.k('inbox').out, /Nothing waits/);
});

test('the hooks: an agent is recorded the moment it is sent, and the matchers are anchored', () => {
  const r = repo();
  const id = ticket(r, 'Dicatat hook');
  r.k('start', id);
  const sent = (payload) => sh(r.dir, K2, ['hook', 'agent-sent'], JSON.stringify({ cwd: r.dir, ...payload }));
  sent({ tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan2:worker', prompt: `Ticket ${id}. Repo x.` }, tool_response: 'Async agent launched successfully. agentId: abc123def (internal)' });
  assert.match(r.k('next').out, /WAIT   .* worker abc123def is on it/);
  sent({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', prompt: `Ticket ${id}.` }, tool_response: { agentId: 'zzz999zzz' } });
  assert.match(r.k('next').out, /worker abc123def/, 'an agent of another kind is not bound');
  r.k('release', id, 'worker');
  sent({ tool_name: 'SendMessage', tool_input: { to: 'abc123def', message: `Ticket ${id}: finish and hand over.` }, tool_response: { success: true } });
  assert.match(r.k('next').out, /WAIT   .* worker abc123def is on it/, 'a resume binds the step again');
  const hooks = JSON.parse(fs.readFileSync(path.join(path.dirname(K2), '..', 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.equal(hooks.SubagentStop[0].matcher, '^kerjaan2:(worker|planner)$');
  assert.ok(!new RegExp(hooks.SubagentStop[0].matcher).test('kerjaan:kerjaan-worker'));
  const stop = (type) => sh(r.dir, K2, ['hook', 'subagent-stop'], JSON.stringify({ cwd: r.dir, agent_id: 'abc123def', agent_type: type })).out;
  assert.equal(stop('kerjaan:kerjaan-worker').trim(), '', "the old plugin's worker is not ours");
  assert.match(stop('kerjaan2:worker'), /"decision":"block"/);
});

test('the hooks: the planner is recorded on the board while it works, tied to no ticket', () => {
  const r = repo();
  const id = ticket(r, 'Sedang dikerjakan');
  r.k('start', id);
  const file = path.join(r.dir, '.kerjaan2', '.state', 'planner.json');
  const read = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  const call = (name, payload) => sh(r.dir, K2, ['hook', name], JSON.stringify({ cwd: r.dir, ...payload }));
  const sent = (payload) => call('agent-sent', { transcript_path: '/c/sess-1.jsonl', ...payload });
  const stop = (agent, type = 'kerjaan2:planner') => call('subagent-stop', { agent_id: agent, agent_type: type });
  const before = Date.now();

  // An agent that is not kerjaan2's, with or without a ticket in its prompt, writes nothing.
  sent({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', prompt: 'Plan the backlog.' }, tool_response: { agentId: 'orang-lain' } });
  sent({ tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan:planner', prompt: 'Plan the backlog.' }, tool_response: { agentId: 'orang-lain' } });
  sent({ tool_name: 'SendMessage', tool_input: { to: 'orang-lain', message: 'go on' }, tool_response: { success: true } });
  stop('orang-lain', 'general-purpose');
  assert.equal(read(), null);
  assert.deepEqual(fs.readdirSync(path.join(r.dir, '.kerjaan2', '.state', 'tickets')), [`${id}.json`]);

  // Sent: at work, since now, and no ticket named, though the prompt names one.
  const first = sent({ tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan2:planner', prompt: `Plan the backlog. Ticket ${id} is in flight.` }, tool_response: { status: 'async_launched', agentId: 'perencana1' } });
  assert.equal(first.code, 0);
  assert.equal(first.out, '');
  let p = read();
  assert.deepEqual(Object.keys(p).sort(), ['agent', 'at', 'transcript']);
  assert.equal(p.agent, 'perencana1');
  assert.ok(p.at >= before && p.at <= Date.now());
  assert.equal(p.transcript, path.join('/c/sess-1', 'subagents', 'agent-perencana1.jsonl'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.dir, '.kerjaan2', '.state', 'tickets', `${id}.json`), 'utf8')).worker, undefined, 'the ticket the prompt names is not bound to the planner');

  // Stopped: the record ends, and the stop asks nothing of the planner.
  assert.equal(stop('perencana1').out, '');
  p = read();
  assert.equal(p.agent, 'perencana1');
  assert.ok(p.ended >= p.at);

  // Resumed with a message: alive again, from now.
  const was = p.at;
  sent({ tool_name: 'SendMessage', tool_input: { to: 'perencana1', message: `The owner answered Q1 of ${id}.` }, tool_response: { success: true } });
  p = read();
  assert.equal(p.ended, undefined);
  assert.ok(p.at >= was);
  assert.equal(p.transcript, path.join('/c/sess-1', 'subagents', 'agent-perencana1.jsonl'));
  // A message to somebody else leaves it alone.
  stop('perencana1');
  sent({ tool_name: 'SendMessage', tool_input: { to: 'orang-lain', message: 'go on' }, tool_response: { success: true } });
  assert.ok(read().ended);

  // A newer planner replaces it, and the older one stopping late does not end the newer.
  sent({ tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan2:planner', prompt: 'Plan.' }, tool_response: 'Async agent launched successfully. agentId: perencana2 (internal)' });
  stop('perencana1');
  p = read();
  assert.equal(p.agent, 'perencana2');
  assert.equal(p.ended, undefined);

  // A planner run in the foreground is reported sent only when it is back: never shown at work.
  sent({ tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan2:planner', prompt: 'Plan.' }, tool_response: { status: 'completed', agentId: 'perencana3' } });
  assert.ok(read().ended);
  stop('perencana4');
  sent({ tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan2:planner', prompt: 'Plan.' }, tool_response: { agentId: 'perencana4' } });
  assert.equal(read().agent, 'perencana4');
  assert.ok(read().ended, 'its stop was seen first');

  // Workers and reviewers are recorded as before.
  sent({ tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan2:worker', prompt: `Ticket ${id}.` }, tool_response: { agentId: 'pekerja77' } });
  assert.match(r.k('next').out, /WAIT   .* worker pekerja77 is on it/);
  assert.equal(read().agent, 'perencana4');
  // Nothing of this is committed or shown as a change of the board.
  assert.equal(sh(r.dir, 'git', ['status', '--porcelain', '--', '.kerjaan2/.state']).out.trim(), '');
});

test('the planner hooks never fail a session: no board, a board that cannot be read, a held lock', () => {
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan2:planner', prompt: 'Plan.' }, tool_response: { agentId: 'perencana1' } };
  const quiet = (dir, name, extra, why) => {
    const out = sh(dir, K2, ['hook', name], JSON.stringify({ cwd: dir, ...extra }));
    assert.equal(out.code, 0, why);
    assert.equal(out.out, '', why);
  };
  const each = (dir, why) => {
    quiet(dir, 'agent-sent', payload, why);
    quiet(dir, 'agent-sent', { tool_name: 'SendMessage', tool_input: { to: 'perencana1', message: 'go on' } }, why);
    quiet(dir, 'subagent-stop', { agent_id: 'perencana1', agent_type: 'kerjaan2:planner' }, why);
  };
  // No repository at all, and a repository with no board.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'k2-none-'));
  each(bare, 'not a repository');
  sh(bare, 'git', ['init', '-q']);
  each(bare, 'no board');
  assert.equal(fs.existsSync(path.join(bare, '.kerjaan2')), false);
  fs.rmSync(bare, { recursive: true, force: true });
  // Settings that cannot be read.
  const r = repo();
  const settings = path.join(r.dir, '.kerjaan2', 'settings.yml');
  const good = fs.readFileSync(settings, 'utf8');
  fs.writeFileSync(settings, 'max_parallel: banyak\n: : :\n');
  each(r.dir, 'bad settings');
  fs.writeFileSync(settings, good);
  const file = path.join(r.dir, '.kerjaan2', '.state', 'planner.json');
  assert.equal(fs.existsSync(file), false);
  // A record that is not JSON is replaced, not tripped over.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ setengah');
  quiet(r.dir, 'subagent-stop', { agent_id: 'perencana1', agent_type: 'kerjaan2:planner' }, 'a broken record');
  quiet(r.dir, 'agent-sent', { tool_name: 'SendMessage', tool_input: { to: 'perencana1', message: 'go on' } }, 'a broken record');
  quiet(r.dir, 'agent-sent', payload, 'a broken record');
  fs.rmSync(file);
  // The state lock held by a live process: the hook gives up within its ten seconds, in silence.
  const lock = path.join(r.dir, '.kerjaan2', '.state', 'state.lock');
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
  const t0 = Date.now();
  quiet(r.dir, 'agent-sent', payload, 'locked');
  assert.ok(Date.now() - t0 < 10000, 'within the hook\'s timeout');
  assert.equal(fs.existsSync(file), false);
  fs.rmSync(lock, { recursive: true, force: true });
  quiet(r.dir, 'agent-sent', payload, 'free again');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).agent, 'perencana1');
});

test('a ticket taken out of flight forgets its agents', () => {
  const r = repo();
  const id = ticket(r, 'Ditarik lalu dimulai lagi', { lane: 'light' });
  r.k('start', id);
  r.k('agent', id, 'worker', 'lama');
  r.k('move', id, 'todo', '--force', '--why', 'ditunda');
  r.k('doctor', '--fix');
  r.k('start', id);
  assert.match(r.k('next').out, /DISPATCH worker/);
});

// ----- found by the second round of the independent review (0.10.0) -----

test('after a ticket comes back in the same round, its earlier reviewer no longer counts: a new one is sent, and nobody else can pass it', () => {
  const r = repo();
  const id = ticket(r, 'Kembali di putaran yang sama');
  r.k('start', id);
  r.k('agent', id, 'worker', 'w');
  const wt = work(r, id, 'x.txt', 'x\n');
  r.kIn(wt, 'submit', id);
  r.k('verdict', id, 'pass', '--note', '1: ok');
  fs.writeFileSync(path.join(wt, 'tambahan.txt'), 'belum dinilai\n');
  sh(wt, 'git', ['add', '-A']);
  sh(wt, 'git', ['commit', '-qm', 'sesudah putusan']);
  assert.equal(r.k('land', id).code, 3);
  r.kIn(wt, 'submit', id);
  const next = r.k('next').out;
  assert.match(next, /RESUME .* reviewer rv/, 'the reviewer is sent again, not waited for');
  assert.ok(!/WAIT .* reviewer/.test(next), next);
  assert.match(r.kIn(r.dir, 'verdict', id, 'pass', '--note', '1: ok').out, /no reviewer was sent for this step/);
  assert.equal(statusOf(r, id), 'review');
  assert.ok(!fs.existsSync(path.join(r.dir, 'tambahan.txt')));
});

test('a void mark or a tick typed into the file by hand does not get past the gates', () => {
  const r = repo();
  const id = ticket(r, 'Diketik tangan', { lane: 'light', items: ['Baris baru tampil', 'Hal sulit yang tidak dikerjakan'] });
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n');
  const file = r.k('show', id, '--path').out.trim();
  const orig = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, orig.replace('- [ ] Hal sulit yang tidak dikerjakan', '- [ ] ~~Hal sulit yang tidak dikerjakan~~ — void: tidak perlu'));
  assert.match(r.kIn(wt, 'submit', id).out, /edited after work started/);
  fs.writeFileSync(file, orig.replace('- [ ] Hal sulit yang tidak dikerjakan', '- [x] Hal sulit yang tidak dikerjakan'));
  assert.match(r.kIn(wt, 'submit', id).out, /item 2 was ticked by hand/);
  assert.equal(statusOf(r, id), 'in_progress');
});

test('a lane is lowered only on the owner\'s word', () => {
  const r = repo();
  const id = ticket(r, 'Jalur ketat', { lane: 'strict' });
  assert.match(r.k('set', id, 'lane=light').out, /lowers the lane/);
  assert.match(fs.readFileSync(r.k('show', id, '--path').out.trim(), 'utf8'), /^lane: strict$/m);
  assert.equal(r.k('set', id, 'lane=light', '--force').code, 0);
  assert.equal(r.k('set', id, 'lane=strict').code, 0, 'raising needs nothing');
});

test('a stopped ticket at the front of the merge queue steps aside, and the queue moves on', () => {
  const r = repo();
  const ids = ['A', 'B', 'C'].map((x) => ticket(r, `Antre ${x}`, { lane: 'light' }));
  for (const id of ids) r.k('start', id);
  const wts = ids.map((id, i) => work(r, id, i === 2 ? 'c.txt' : 'app.txt', `baris ${i}\n`));
  ids.forEach((id, i) => r.kIn(wts[i], 'submit', id));
  const [a, b, c] = ids;
  r.k('land', a);
  assert.equal(r.k('land', b).code, 3);
  r.k('agent', b, 'worker', 'wb');
  assert.match(r.k('release', b, 'worker', '--stopped', 'konflik tidak bisa diselesaikan').out, /waits for the owner/);
  const next = r.k('next').out;
  assert.match(next, new RegExp(`OWNER  ${b} its worker stopped: konflik tidak bisa diselesaikan`));
  assert.match(next, new RegExp(`LAND   ${c}`));
  assert.match(r.k('land', c).out, /LANDED/);
  r.k('retry', b);
  assert.match(r.k('next').out, new RegExp(`RESUME ${b} worker wb`));
});

test('a contract changed during review is put to the owner, and an amendment sends the ticket back to its worker', () => {
  const r = repo();
  const id = ticket(r, 'Kontrak berubah saat ditinjau');
  r.k('start', id);
  r.k('agent', id, 'worker', 'w');
  const wt = work(r, id, 'x.txt', 'x\n');
  r.kIn(wt, 'submit', id);
  const file = r.k('show', id, '--path').out.trim();
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Done when\n', '## Done when\n- [ ] Butir baru dari pemilik\n'));
  assert.match(r.k('verdict', id, 'pass', '--note', '1: ok', '--note', '2: ok').out, /edited after work started/);
  const next = r.k('next').out;
  assert.match(next, new RegExp(`OWNER  ${id} .*edited after work started`));
  assert.ok(!/(WAIT|RESUME|DISPATCH) .* reviewer/.test(next), next);
  assert.match(r.k('inbox').out, /contract changed \(1\)/);
  assert.match(r.k('amend', id, '--why', 'pemilik menambah satu butir').out, /back with its worker/);
  assert.equal(statusOf(r, id), 'in_progress');
  assert.match(r.k('next').out, /RESUME .* worker w — the owner changed what it asks for/);
  assert.match(r.k('brief', id, '--role', 'worker').out, /mode: amended/);
});

test('a verdict can hold a note for every criterion however many there are; strict_paths follow .gitignore', async () => {
  const r = repo();
  const items = Array.from({ length: 16 }, (_, i) => `Butir ${i + 1}`);
  const id = ticket(r, 'Enam belas butir', { items });
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n', { checks: items.map((_, i) => i + 1) });
  r.kIn(wt, 'submit', id);
  const notes = items.flatMap((_, i) => ['--note', `${i + 1}: ok`]);
  assert.match(r.k('verdict', id, 'pass', ...notes).out, /PASSED/);
  const { globHit } = await import('../core/cmd-work.mjs');
  assert.ok(globHit('pay', 'src/pay/x.js') && globHit('/pay', 'pay/x') && globHit('pay/*', 'pay/a/b') && !globHit('/pay', 'src/pay/x'));
  assert.ok(globHit('*.sql', 'db/m.sql') && globHit('auth/', 'src/auth/login.txt') && !globHit('auth/', 'src/auth') && !globHit('*.sql', 'm.sqlite'));
});

test('the agent-sent hook binds the ticket the prompt is about, not the first number in it', () => {
  const r = repo();
  const a = ticket(r, 'Tiket A');
  const b = ticket(r, 'Tiket B');
  r.k('start', a);
  r.k('start', b);
  r.k('agent', a, 'worker', 'pekerja-a');
  sh(r.dir, K2, ['hook', 'agent-sent'], JSON.stringify({ cwd: r.dir, tool_name: 'Agent', tool_input: { subagent_type: 'kerjaan2:worker', prompt: `Lessons from ${a} apply. Ticket ${b}. Repo x. Run k2 brief ${b} --role worker.` }, tool_response: { content: 'agent id: palsu999', agentId: 'pekerja-b' } }));
  const next = r.k('next').out;
  assert.match(next, new RegExp(`WAIT   ${a} worker pekerja-a`));
  assert.match(next, new RegExp(`WAIT   ${b} worker pekerja-b`));
});

test('the role guard: the hook hands the caller\'s role to the command, and k2 refuses what is not that role\'s', () => {
  const r = repo();
  const id = ticket(r, 'Dijaga peran');
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n');
  const guard = (payload) => sh(r.dir, path.join(path.dirname(K2), 'k2-guard'), [], JSON.stringify({ cwd: r.dir, hook_event_name: 'PreToolUse', tool_name: 'Bash', ...payload })).out;
  const out = JSON.parse(guard({ agent_id: 'a-1', agent_type: 'kerjaan2:worker', tool_input: { command: 'cd x && k2 land 1', description: 'd', timeout: 5000 } })).hookSpecificOutput;
  assert.equal(out.updatedInput.command, `export K2_ROLE=worker K2_AGENT=a-1 K2_HOME='${r.dir}'; cd x && k2 land 1`);
  assert.equal(out.updatedInput.timeout, 5000, 'the rest of the input is kept');
  assert.equal(out.permissionDecision, undefined, 'the hook approves nothing by itself');
  assert.equal(guard({ tool_input: { command: 'k2 land 1' } }).trim(), '', 'the main session is left alone');
  assert.equal(guard({ agent_id: 'a-2', agent_type: 'general-purpose', tool_input: { command: 'k2 status' } }).trim(), '', 'so is an agent that is not ours');
  assert.match(JSON.parse(guard({ agent_id: 'a-1', agent_type: 'kerjaan2:worker', tool_input: { command: 'export K2_ROLE=reviewer; ls' } })).hookSpecificOutput.updatedInput.command, /^export K2_ROLE=worker /, 'a command that names a role itself is prefixed all the same');
  const outside = JSON.parse(sh(os.tmpdir(), path.join(path.dirname(K2), 'k2-guard'), [], JSON.stringify({ cwd: os.tmpdir(), tool_name: 'Bash', agent_id: 'a-1', agent_type: 'kerjaan2:reviewer', tool_input: { command: 'ls' } })).out).hookSpecificOutput.updatedInput.command;
  assert.equal(outside, 'export K2_ROLE=reviewer K2_AGENT=a-1; ls', 'the role travels even when the call starts outside the repo');

  // What the wrapped command then meets: k2 itself, deciding on its real arguments.
  const as = (role, script) => spawnSync('sh', ['-c', `export K2_ROLE=${role} K2_AGENT=a-1; ${script}`], { cwd: r.dir, encoding: 'utf8', env: { ...cleanEnv(), K: K2, ID: id } });
  const refused = (role, script) => {
    const x = as(role, script);
    return x.status === 6 && /Nothing was changed/.test(x.stderr + x.stdout);
  };
  // every shell form the parser-based guard let through
  for (const script of ['"$K" land $ID', "'" + K2 + "' land $ID", 'bash -c "$K land $ID"', 'eval "$K accept $ID --why x"', 'X=$K; $X land $ID', '"$K" status >/dev/null & "$K" land $ID', '"$K" \\\n land $ID', '"$K" "land" $ID', 'node "$(dirname "$K")/../core/run.mjs" land $ID', '"$K" verdict $ID pass --note "1: ok"', '"$K" amend $ID --why x', '"$K" agent $ID reviewer palsu', '"$K" answer $ID Q1 ya --agrees', '"$K" hook agent-sent </dev/null', '"$K" manual $ID ok M1', '"$K" set $ID lane=light --force=1']) {
    assert.ok(refused('worker', script), `a worker must not get through with: ${script}`);
  }
  assert.equal(statusOf(r, id), 'in_progress', 'none of them changed anything');
  // text that merely mentions a command or a flag is nobody's business
  assert.equal(as('worker', '"$K" decide $ID "kita membuang flag --force; lihat k2 land | nanti"').status, 0);
  assert.equal(as('worker', '"$K" handoff $ID "Mandor menjalankan k2 land sesudahnya."').status, 0);
  assert.equal(as('worker', 'git -C "' + wt + '" commit -q --allow-empty -m "docs: kapan k2 land menolak"').status, 0);
  assert.equal(as('worker', '"$K" submit $ID').status, 0, 'a worker hands over');
  assert.ok(refused('worker', '"$K" check $ID 1 x') === false);
  // a reviewer judges and nothing else
  r.kIn(r.dir, 'agent', id, 'reviewer', 'a-1');
  assert.ok(refused('reviewer', '"$K" check $ID 1 x') && refused('reviewer', '"$K" submit $ID') && refused('reviewer', '"$K" followup $ID declined F1'));
  assert.equal(as('reviewer', '"$K" followup $ID "Jalur --force belum diuji"').status, 0);
  assert.equal(as('reviewer', '"$K" verdict $ID pass --note "1: ok; lihat k2 land"').status, 0);
  // a planner prepares and nothing else
  const other = ticket(r, 'Untuk planner');
  const asP = (script) => spawnSync('sh', ['-c', `export K2_ROLE=planner; ${script}`], { cwd: r.dir, encoding: 'utf8', env: { ...cleanEnv(), K: K2, ID: other, FLY: id } });
  for (const script of ['"$K" start $ID', '"$K" land $FLY', '"$K" set $ID lane=light --force', '"$K" move $ID cancel --why x', '"$K" move --why siap $ID done']) assert.equal(asP(script).status, 6, script);
  assert.equal(asP('"$K" set $ID lane=strict touches=src/').status, 0);
  assert.equal(asP('"$K" move --why "siap" $ID backlog').status, 0, 'options before the status do not confuse it');
  r.k('ask', id, '--blocking', 'Boleh? Saran: ya');
  assert.match(asP('"$K" answer $FLY Q1 ya --agrees').stderr, /is in flight/);
  const hooks = JSON.parse(fs.readFileSync(path.join(path.dirname(K2), '..', 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.equal(hooks.PreToolUse[0].matcher, 'Bash');
  assert.ok(!hooks.PreToolUse[0].hooks[0].if, 'it runs for every Bash call: an if rule would let quoted forms slip');
});

test('while a merge is being committed the ticket is not yet done: nothing that waits for it starts', async () => {
  const r = repo();
  const a = passLight(r, 'Fondasi yang sedang di-commit', 'base.txt', 'b\n');
  const d = ticket(r, 'Menunggu fondasi', { lane: 'light', extra: ['--blocked-by', a] });
  const hook = path.join(r.dir, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nsleep 3\nexit 1\n', { mode: 0o755 });
  const { spawn } = await import('node:child_process');
  const landing = spawn(K2, ['land', a], { cwd: r.dir, stdio: 'ignore' });
  await new Promise((res) => setTimeout(res, 1500));
  const mid = r.k('start', d);
  await new Promise((res) => landing.on('exit', res));
  assert.ok(!/STARTED/.test(mid.out), 'it waited for the board, and the commit failed');
  assert.match(mid.out, /waits for/);
  assert.equal(statusOf(r, d), 'todo');
  assert.equal(statusOf(r, a), 'review');
});

test('a void does not seal a criterion somebody deleted by hand; rewording Background trips nothing', () => {
  const r = repo();
  const id = ticket(r, 'Hapus lalu batalkan', { lane: 'light', items: ['Satu', 'Dua', 'Tiga'] });
  r.k('start', id);
  r.k('ask', id, '--blocking', 'Dua masih perlu? Saran: tidak');
  r.k('answer', id, 'Q1', 'Tidak', '--agrees');
  const file = r.k('show', id, '--path').out.trim();
  const orig = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, orig.replace('## Background\n', '## Background\nSatu kalimat penjelas tambahan.\n\n').replace('## Request\n', '## Request\n\n'));
  assert.equal(r.k('void', id, '2', 'Q1').code, 0, 'Background and blank lines are not the contract');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('- [ ] Tiga\n', ''));
  assert.match(r.k('void', id, '1', 'Q1').out, /will not seal somebody's edit/);
});

// ----- found by the fourth round (the live session and 0.13.0) -----

test('taking the box off a criterion breaks the seal: it cannot quietly become prose', () => {
  const r = repo();
  const id = ticket(r, 'Kotak dibuang', { lane: 'light', items: ['Satu', 'Dua', 'Hal ketiga yang sulit'] });
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n', { checks: [1, 2] });
  const file = r.k('show', id, '--path').out.trim();
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('- [ ] Hal ketiga yang sulit', '- Hal ketiga yang sulit'));
  assert.match(r.kIn(wt, 'submit', id).out, /edited after work started/);
});

test('inside a subagent k2 finds the board from any folder, and a test run does not inherit the agent\'s role', () => {
  const r = repo({ test: 'test -z "$K2_ROLE" && test -z "$K2_AGENT" && node check.js' });
  const id = ticket(r, 'Dari folder lain', { lane: 'light' });
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n');
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'k2-copy-'));
  made.push(copy);
  const from = (env, ...a) => spawnSync(K2, a, { cwd: copy, encoding: 'utf8', env: { ...cleanEnv(), ...env } });
  assert.match(from({}, 'test', id, '--dir', copy, '--', 'echo', 'x').stderr, /not inside a git repository/);
  const inAgent = { K2_ROLE: 'reviewer', K2_AGENT: 'a-1', K2_HOME: r.dir };
  const ran = from(inAgent, 'test', id, '--dir', copy, '--', 'echo "peran=[$K2_ROLE]"');
  assert.equal(ran.status, 0, ran.stderr);
  assert.match(ran.stdout, /peran=\[\]/, 'the command under test does not see the role');
  const sub = spawnSync(K2, ['submit', id], { cwd: wt, encoding: 'utf8', env: { ...cleanEnv(), K2_ROLE: 'worker', K2_AGENT: 'a-9', K2_HOME: r.dir } });
  assert.match(sub.stdout, /SUBMITTED/, 'the project\'s own tests ran without a role');
  const trail = fs.readFileSync(path.join(r.dir, '.kerjaan2', 'log', `${id}.jsonl`), 'utf8');
  assert.match(trail, /"event":"submitted".*"by":"worker:a-9"/, 'the trail says which kind of agent made each step');
});

test('the inbox shows every step of a manual check, not only the first', () => {
  const r = repo();
  const id = ticket(r, 'Langkah lengkap', { lane: 'light', items: ['Baris baru tampil', '(owner) Enak dilihat'] });
  r.k('start', id);
  const wt = work(r, id, 'x.txt', 'x\n');
  r.k('manual', id, '2', '1. Buka berkas 2. Baca isinya 3. Harus terlihat: x');
  r.kIn(wt, 'submit', id);
  r.k('land', id);
  assert.match(r.k('inbox').out, /M1 \(item 2\) 1\. Buka berkas\n\s+2\. Baca isinya\n\s+3\. Harus terlihat: x/);
});

test('a worker or reviewer writes only to the ticket it was sent for', () => {
  const r = repo();
  const mine = ticket(r, 'Tiket saya');
  const theirs = ticket(r, 'Tiket orang lain');
  r.k('start', mine);
  r.k('start', theirs);
  r.k('agent', mine, 'worker', 'saya');
  r.k('agent', theirs, 'worker', 'dia');
  const as = (...a) => spawnSync(K2, a, { cwd: r.dir, encoding: 'utf8', env: { ...cleanEnv(), K2_ROLE: 'worker', K2_AGENT: 'saya', K2_HOME: r.dir } });
  assert.equal(as('decide', mine, 'keputusan sendiri').status, 0);
  const no = as('handoff', theirs, 'bukan tiket saya');
  assert.equal(no.status, 6);
  assert.match(no.stderr, /belongs to worker dia/);
  assert.equal(as('show', theirs).status, 0, 'reading another ticket is fine');
  assert.equal(as('learn', 'satu pelajaran').status, 0);
});

test('a command that has to wait for the board says so instead of hanging in silence', () => {
  const r = repo();
  const lock = path.join(r.dir, '.kerjaan2', '.state', 'board.lock');
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
  const out = spawnSync(K2, ['learn', 'menunggu'], { cwd: r.dir, encoding: 'utf8', env: cleanEnv(), timeout: 6000 });
  fs.rmSync(lock, { recursive: true, force: true });
  assert.match(out.stderr, /waiting for the board/);
});
