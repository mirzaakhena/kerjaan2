// Every test builds a throwaway repository with a board and drives the real
// CLI against it. Nothing in this checkout is changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as T from '../core/ticket.mjs';

const K2 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'k2');

function sh(cwd, cmd, args, input) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', input, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// A repo whose "tests" fail when any file contains the word BROKEN.
function repo({ test: testCmd = 'node check.js', settings = {} } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'k2-')));
  const git = (...a) => sh(dir, 'git', a);
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'line one\nline two\nline three\n');
  fs.writeFileSync(path.join(dir, 'check.js'), "const fs=require('fs');const bad=fs.readdirSync('.').filter(f=>f.endsWith('.txt')&&fs.readFileSync(f,'utf8').includes('BROKEN'));process.exit(bad.length?1:0)\n");
  git('add', '-A');
  git('commit', '-qm', 'init');
  const k = (...a) => sh(dir, K2, a);
  assert.equal(k('init', '--language', 'Bahasa Indonesia', '--test', testCmd).code, 0);
  const file = path.join(dir, '.kerjaan2', 'settings.yml');
  let s = fs.readFileSync(file, 'utf8');
  for (const [key, v] of Object.entries(settings)) s = s.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${v}`);
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
  assert.match(r.k('next').out, /RESUME .* reviewer r1/);
  assert.match(r.k('brief', id, '--role', 'reviewer').out, /This is a later round/);
  assert.match(r.k('verdict', id, 'pass', '--note', '1: cat app.txt menampilkan baris dua').out, /PASSED .* round 2/);
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
  assert.match(r.kIn(wb, 'submit', b).out, /INTEGRATED .*reviewer looks at the conflict resolution/s);
  assert.match(r.k('next').out, /reviewer .*conflict resolution only/);
  assert.match(r.k('brief', b, '--role', 'reviewer').out, /Only the conflict resolution/);
  r.k('verdict', b, 'pass');
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
  assert.match(r.kIn(wts[1], 'submit', b).out, /INTEGRATED .*It can land/s);
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
