// The life of one ticket's work: start (a worktree), brief (what this agent
// needs right now), test, submit (merge main in, test, gates), verdict, land.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { die, git, gitTry, run, now, today, parseArgs, slugify, fmtDuration } from './util.mjs';
import * as B from './board.mjs';
import * as T from './ticket.mjs';
import { readiness, occupying } from './cmd-board.mjs';
import { lessons, holdReason } from './cmd-record.mjs';

const K = () => B.k2Name();
const NO_BOARD = ':(exclude).kerjaan2';

// ----- the contract does not move under the work -----

const contractPrint = (contract) => createHash('sha1').update(T.contractText(contract)).digest('hex').slice(0, 12);

// What the ticket asked for when work started (or when the owner last
// confirmed a change), against what its file says now.
function contractMoved(board, t) {
  const sealed = B.readLog(board, t.id).reverse().find((e) => e.contract)?.contract;
  if (!sealed || sealed === contractPrint(t.contract)) return null;
  return `its Request or Done when was edited after work started. Only the owner changes what a ticket in flight asks for: put the change to them, then \`${K()} amend ${t.id} --why "<their words>"\`; or restore the wording`;
}

export function amend(argv) {
  const { pos, opt } = parseArgs(argv);
  const board = B.openBoard();
  if (!opt.why) die('amend needs the owner\'s words: --why "<what changed and why>"');
  B.withLock(board, 'board', () => {
    const t = B.load(B.findTicket(board, pos[0]));
    t.record.decisions.push(T.makeEntry(`${today()} the owner changed what this ticket asks for: ${opt.why}`));
    B.save(t);
    B.log(board, t.id, 'amended', { contract: contractPrint(t.contract) });
    console.log(`${t.id}: the contract as it stands now is the one it is judged against.`);
  });
}

// ----- start -----

export function start(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const main = board.settings.main_branch;
  let pending = null;
  B.withLock(board, 'board', () => {
    const t = B.load(B.findTicket(board, pos[0]));
    const inFlight = ['in_progress', 'review'].includes(t.status);
    let wt = B.worktreeOf(board, t.id);
    if (inFlight && wt) return console.log(`${t.id} is already in ${t.status}\nWorktree: ${wt}`);
    if (!inFlight && t.status !== 'todo') die(`${t.id} is in ${t.status}; only a ticket in todo can start (\`${K()} move ${t.id} todo\`)`);
    if (!inFlight) {
      const r = readiness(board, t);
      if (r.reasons.length) die(`${t.id} is not ready:\n- ${r.reasons.join('\n- ')}`);
      if (r.waits.length) die(`${t.id} waits for ${r.waits.join(', ')} to land in ${main} first`);
      if (B.readQueue(board).pause.includes(t.id) && !B.getState(board, t.id).go) die(`${t.id} has a pause before it: the owner says go first (\`${K()} go ${t.id}\`)`);
      const others = occupying(board);
      const soloOther = others.find((o) => o.fm.solo === 'true');
      if (soloOther) die(`${soloOther.id} is solo and still in flight: nothing starts beside it until it is in ${main}`);
      if (t.fm.solo === 'true' && others.length) die(`${t.id} is solo: it starts once the ${others.length} ticket(s) in flight are in ${main}`);
      const flight = others.length;
      if (flight >= board.settings.max_parallel) die(`${flight} tickets are in flight and max_parallel is ${board.settings.max_parallel}. Only the owner raises it.`);
    }
    if (gitTry(board.root, 'rev-parse', '--verify', '--quiet', `refs/heads/${main}`).code !== 0) die(`main_branch "${main}" does not exist; fix it in settings.yml`);

    let branch = B.branchOf(board, t.id);
    const name = `${t.id}-${slugify(t.title)}`;
    wt = path.join(board.wtRoot, name);
    fs.mkdirSync(board.wtRoot, { recursive: true });
    if (branch) git(board.root, 'worktree', 'add', '-q', wt, branch);
    else {
      branch = B.BRANCH_PREFIX + name;
      git(board.root, 'worktree', 'add', '-q', '-b', branch, wt, main);
    }
    // The board lives in the main tree only: a second copy would be a second board.
    const sparse = gitTry(wt, 'sparse-checkout', 'init', '--no-cone').code === 0
      && gitTry(wt, 'sparse-checkout', 'set', '/*', `!/${B.BOARD_DIR}/`).code === 0;
    if (!sparse) console.log(`note: could not leave ${B.BOARD_DIR}/ out of the worktree; ignore the copy in there, the board is in ${board.dir}`);

    const used = new Set(B.listTickets(board, ['in_progress', 'review']).map((x) => B.getState(board, x.id).slot).filter(Boolean));
    let slot = 1;
    while (used.has(slot)) slot++;
    // The ticket takes its place now, so the room it uses is counted while
    // the setup runs; the setup itself runs after the board is free again.
    if (!inFlight) {
      B.moveFile(board, t, 'in_progress');
      B.dropFromQueue(board, t.id);
      B.setState(board, t.id, { mode: 'first', round: 1, slot, started: now() });
      B.log(board, t.id, 'started', { branch, base: git(board.root, 'rev-parse', '--short', main), contract: contractPrint(t.contract) });
    } else B.setState(board, t.id, { slot });
    pending = { t, wt, branch, slot, inFlight };
  });
  if (!pending) return;
  const { t, wt, branch, slot, inFlight } = pending;
  const setup = board.settings.worktree_setup;
  if (setup) {
    const r = run('sh', ['-c', setup], { cwd: wt, env: wtEnv(board, t.id, slot, wt) });
    if (r.code !== 0) {
      B.withLock(board, 'board', () => {
        gitTry(board.root, 'worktree', 'remove', '--force', wt);
        if (!inFlight) {
          gitTry(board.root, 'branch', '-D', branch);
          B.moveFile(board, B.findTicket(board, t.id), 'todo');
          B.dropState(board, t.id);
          B.log(board, t.id, 'moved', { to: 'todo', why: 'worktree_setup failed' });
        }
      });
      die(`worktree_setup failed (exit ${r.code}); the worktree was removed and the ticket is ${inFlight ? 'left where it was' : 'back in todo'}:\n${tail(r.out + '\n' + r.err, 15)}`);
    }
  }
  console.log(`STARTED ${t.id} ${t.title}\nWorktree: ${wt}\nBranch: ${branch} (from ${main})`);
}

function wtEnv(board, id, slot, wt = B.worktreeOf(board, id)) {
  return { ...process.env, K2_MAIN_TREE: board.root, K2_TICKET: id, K2_SLOT: String(slot || 1), K2_WORKTREE: wt || '' };
}

const tail = (text, n) => text.split('\n').filter((l) => l.trim()).slice(-n).join('\n');

// ----- tests -----

// Uncommitted changes in a worktree, leaving out the files its own test run
// leaves behind (recorded when a run created them): those are not the
// ticket's, and they must not make every later step fail.
function dirt(board, id, wt) {
  const left = B.getState(board, id).artefacts || [];
  return gitTry(wt, 'status', '--porcelain').out.split('\n').filter((l) => {
    if (!l) return false;
    if (!l.startsWith('?? ')) return true;
    const p = l.slice(3).replace(/^"|"$/g, '');
    return !left.some((a) => p === a || p.startsWith(a.endsWith('/') ? a : a + '/') || a.startsWith(p));
  }).join('\n');
}

const untracked = (wt) => gitTry(wt, 'status', '--porcelain').out.split('\n').filter((l) => l.startsWith('?? ')).map((l) => l.slice(3).replace(/^"|"$/g, ''));

// The content under test, as git sees it, with the board left out. Null when
// the tree holds uncommitted changes: then there is no "exactly this content".
export function fingerprint(board, id, wt) {
  if (dirt(board, id, wt)) return null;
  const tree = git(wt, 'ls-tree', 'HEAD').split('\n').filter((l) => l && !l.endsWith(`\t${B.BOARD_DIR}`));
  const r = run('git', ['mktree'], { cwd: wt, input: tree.join('\n') + '\n' });
  if (r.code !== 0) die(`could not fingerprint ${wt}: ${r.err}`);
  return r.out;
}

// The same fingerprint for any commit or tree object.
function treePrint(cwd, treeish) {
  const tree = git(cwd, 'ls-tree', treeish).split('\n').filter((l) => l && !l.endsWith(`\t${B.BOARD_DIR}`));
  const r = run('git', ['mktree'], { cwd, input: tree.join('\n') + '\n' });
  if (r.code !== 0) die(`could not fingerprint ${treeish}: ${r.err}`);
  return r.out;
}

function passedOn(board, id, fp) {
  if (!fp) return null;
  const cmd = board.settings.test_command;
  return B.readLog(board, id).reverse().find((e) => e.event === 'test' && e.exit === 0 && e.fingerprint === fp && e.command === cmd) || null;
}

function runTests(board, t, wt, by) {
  const cmd = board.settings.test_command;
  if (!cmd) return { none: true, exit: 0 };
  const fp = fingerprint(board, t.id, wt);
  const before = new Set(untracked(wt));
  const dir = path.join(board.state, 'progress');
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, `${t.id}.log`);
  const st = B.getState(board, t.id);
  const go = (lockDir) => {
    const fd = fs.openSync(outFile, 'w');
    const t0 = Date.now();
    const r = spawnSync('sh', ['-c', lockDir ? 'echo $$ > "$K2_CHILD"; exec sh -c "$K2_CMD"' : cmd], { cwd: wt, env: { ...wtEnv(board, t.id, st.slot), K2_CMD: cmd, K2_CHILD: lockDir ? path.join(lockDir, 'child') : '' }, stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    return { exit: r.status ?? 1, seconds: (Date.now() - t0) / 1000 };
  };
  const res = board.settings.parallel_tests ? go(null) : B.withLock(board, 'test', go, { waitMs: 3 * 3600 * 1000 });
  // What the run left behind that was not there before is the run's, not the ticket's.
  const left = untracked(wt).filter((p) => !before.has(p));
  if (left.length) {
    const known = B.getState(board, t.id).artefacts || [];
    B.setState(board, t.id, { artefacts: [...new Set([...known, ...left])] });
  }
  const after = fingerprint(board, t.id, wt);
  const output = fs.readFileSync(outFile, 'utf8');
  const stable = fp && fp === after;
  B.log(board, t.id, 'test', { by, exit: res.exit, seconds: Math.round(res.seconds), fingerprint: stable ? fp : null, command: cmd });
  if (res.exit === 0) fs.rmSync(outFile, { force: true });
  return { ...res, output, fingerprint: stable ? fp : null, left };
}

export function test(argv) {
  const { pos, opt } = parseArgs(argv);
  const board = B.openBoard();
  const t = B.load(B.findTicket(board, pos[0]));
  const wt = B.worktreeOf(board, t.id) || die(`${t.id} has no worktree`);
  const custom = pos.slice(1).join(' ');
  if (custom || opt.dir) {
    // A reviewer's or worker's own run: a few tests, or a copy elsewhere. It
    // takes its turn like any other run and records nothing.
    const cmd = custom || board.settings.test_command || die('settings.yml has no test_command; give one after --');
    const cwd = opt.dir ? path.resolve(opt.dir) : wt;
    if (!fs.existsSync(cwd)) die(`${cwd} does not exist`);
    const go = (lockDir) => spawnSync('sh', ['-c', lockDir ? 'echo $$ > "$K2_CHILD"; exec sh -c "$K2_CMD"' : cmd], { cwd, env: { ...wtEnv(board, t.id, B.getState(board, t.id).slot), K2_CMD: cmd, K2_CHILD: lockDir ? path.join(lockDir, 'child') : '' }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const t0 = Date.now();
    const r = board.settings.parallel_tests ? go(null) : B.withLock(board, 'test', go, { waitMs: 3 * 3600 * 1000 });
    const out = tail((r.stdout || '') + '\n' + (r.stderr || ''), 60);
    console.log(`${out}\n-- \`${cmd}\` in ${cwd}: exit ${r.status ?? 1} after ${fmtDuration((Date.now() - t0) / 1000)} (nothing recorded)`);
    process.exitCode = r.status === 0 ? 0 : 1;
    return;
  }
  const r = runTests(board, t, wt, 'manual');
  if (r.none) return console.log('settings.yml has no test_command: nothing to run');
  if (r.exit === 0) console.log(`TESTS PASSED in ${fmtDuration(r.seconds)}${r.fingerprint ? '' : ' (on uncommitted changes: submit will run them again on what is committed)'}`);
  else {
    console.log(`TESTS FAILED (exit ${r.exit}) after ${fmtDuration(r.seconds)}. Last lines:\n${tail(r.output, 40)}`);
    process.exitCode = 1;
  }
}

// ----- submit -----

// As in .gitignore: a pattern with no slash inside it (`*.sql`, `auth/`)
// matches at any depth; one with a slash is taken from the repo root.
export function globToRe(glob) {
  let g = glob.trim().replace(/^\.\//, '');
  const anywhere = !g.replace(/\/$/, '').includes('/');
  g = g.replace(/^\//, '');
  if (g.endsWith('/')) g += '**';
  if (anywhere) g = `**/${g}`;
  const re = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(?:.*/)?');
  return new RegExp(`^${re}`.replace(/\(\?:\.\*\/\)\?$/, '.*') + '$');
}

function changedFiles(wt, main) {
  return gitTry(wt, 'diff', '--name-only', '--no-renames', `${main}...HEAD`, '--', '.', NO_BOARD).out.split('\n').filter(Boolean);
}

// Merge main into the ticket's branch. Returns the conflicting files, if any.
function bringMainIn(board, t, wt) {
  const main = board.settings.main_branch;
  if (gitTry(wt, 'merge-base', '--is-ancestor', main, 'HEAD').code === 0) return { moved: false, conflicts: [] };
  const r = gitTry(wt, 'merge', '--no-edit', main);
  if (r.code === 0) return { moved: true, conflicts: [] };
  const conflicts = gitTry(wt, 'diff', '--name-only', '--diff-filter=U').out.split('\n').filter(Boolean);
  if (!conflicts.length) die(`could not merge ${main} into the branch:\n${r.err || r.out}`);
  return { moved: true, conflicts };
}

// Tickets that landed after this one started, with what they changed and why.
function landedSince(board, t, files = null) {
  const since = B.getState(board, t.id).started || '';
  const out = [];
  for (const raw of B.listTickets(board, ['done'])) {
    if (raw.id === t.id) continue;
    const landed = B.readLog(board, raw.id).reverse().find((e) => e.event === 'landed');
    if (!landed || landed.t < since) continue;
    const shared = files ? (landed.files || []).filter((f) => files.includes(f)) : landed.files || [];
    if (files && !shared.length) continue;
    out.push({ ...B.load(raw), shared });
  }
  return out;
}

function conflictReport(board, t, wt, conflicts) {
  const main = board.settings.main_branch;
  const lines = [
    `CONFLICT ${t.id}: ${main} changed the same lines. The merge is open in ${wt}.`,
    `Files: ${conflicts.join(', ')}`,
    'Resolve so that both changes keep what they meant, `git add` the files, `git commit --no-edit`, then submit again.',
  ];
  for (const o of landedSince(board, t, conflicts)) {
    lines.push('', `Landed meanwhile: ${o.id} ${o.title} (touched ${o.shared.join(', ')})`, `  Its handoff: ${o.record.handoff || '(none written)'}`);
  }
  lines.push('', `If their intent is still unclear, say so in your report: NEED — question for ticket <id>: <question>.`);
  return lines.join('\n');
}

export function submit(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const main = board.settings.main_branch;
  const t = B.load(B.findTicket(board, pos[0]));
  const st = B.getState(board, t.id);
  const integrating = t.status === 'review' && st.passed && st.needs === 'worker';
  if (t.status !== 'in_progress' && !integrating) die(`${t.id} is in ${t.status}; submit hands over a ticket that is in_progress`);
  const wt = B.worktreeOf(board, t.id) || die(`${t.id} has no worktree; \`${K()} start ${t.id}\` makes it again`);

  const dirty = dirt(board, t.id, wt);
  if (dirty) {
    const unmerged = dirty.split('\n').some((l) => /^(UU|AA|DU|UD|AU|UA) /.test(l));
    die(`${unmerged ? 'the merge is not finished' : 'the worktree holds uncommitted changes'}. Commit on the branch first:\n${tail(dirty, 15)}`);
  }
  const merged = bringMainIn(board, t, wt);
  if (merged.conflicts.length) {
    B.setState(board, t.id, { conflict: true });
    B.log(board, t.id, 'conflict', { files: merged.conflicts });
    console.log(conflictReport(board, t, wt, merged.conflicts));
    process.exitCode = 2;
    return;
  }

  const fp = fingerprint(board, t.id, wt);
  let ran = 'no test_command';
  if (board.settings.test_command) {
    const earlier = passedOn(board, t.id, fp);
    if (earlier) ran = `carried from the run of ${earlier.t} on exactly this content`;
    else {
      const r = runTests(board, t, wt, 'submit');
      if (r.exit !== 0) {
        console.log(`TESTS FAILED (exit ${r.exit}) after ${fmtDuration(r.seconds)}${merged.moved ? `, with ${main} merged in` : ''}. Fix, commit, submit again. Last lines:\n${tail(r.output, 40)}`);
        process.exitCode = 1;
        return;
      }
      ran = `passed in ${fmtDuration(r.seconds)}`;
      if (r.left.length) console.log(`note: the test run leaves files behind that git does not ignore (${r.left.slice(0, 5).join(', ')}). k2 leaves them out of its checks; add them to .gitignore.`);
    }
  }
  const head = git(wt, 'rev-parse', '--short', 'HEAD');

  if (integrating) {
    B.setState(board, t.id, { needs: 'reviewer', conflict: false, submitted: head });
    B.log(board, t.id, 'integrated', { commit: head });
    console.log(`INTEGRATED ${t.id} at ${head}; tests: ${ran}.\nA reviewer looks at what you changed to bring ${main} in, then it lands.`);
    return;
  }

  B.withLock(board, 'board', () => {
    const fresh = B.load(B.findTicket(board, t.id));
    const gaps = [];
    const crit = T.criteria(fresh.contract);
    for (const c of crit) {
      if (c.void) continue;
      if (c.owner) {
        if (!fresh.record.manual.some((m) => m.text.startsWith(`(item ${c.n})`))) gaps.push(`item ${c.n} is the owner's to check: write its steps with \`${K()} manual ${t.id} ${c.n} "<steps>"\``);
      } else if (!c.done) gaps.push(`item ${c.n} is not ticked: \`${K()} check ${t.id} ${c.n} "<what you ran and saw>"\``);
    }
    const moved = contractMoved(board, fresh);
    if (moved) gaps.push(moved);
    if (!fresh.record.handoff) gaps.push(`no handoff: \`${K()} handoff ${t.id} "<what changed, why, what must not break>"\``);

    // The lane follows what was really changed. It only ever rises.
    const files = changedFiles(wt, main);
    let lane = fresh.fm.lane;
    let why = '';
    const hot = files.filter((f) => board.settings.strict_paths.some((g) => globToRe(g).test(f)));
    if (hot.length && lane !== 'strict') {
      lane = 'strict';
      why = `it changes ${hot.slice(0, 3).join(', ')}, under strict_paths`;
    } else if (lane === 'light' && files.length > board.settings.light_max_files) {
      lane = 'standard';
      why = `it changes ${files.length} files (light_max_files is ${board.settings.light_max_files})`;
    }
    if (lane !== fresh.fm.lane) {
      fresh.fm.lane = lane;
      fresh.record.decisions.push(T.makeEntry(`${today()} lane raised to ${lane} by k2: ${why}`));
      console.log(`LANE RAISED to ${lane}: ${why}.`);
    }
    if (lane === 'strict' && !fresh.record.decisions.some((d) => /^Red-proof:/i.test(d.text))) {
      gaps.push(`strict lane: prove the tests can go red, then \`${K()} decide ${t.id} "Red-proof: <guards broken>, all red"\` (\`${K()} brief ${t.id} --role worker\` has the steps)`);
    }
    B.save(fresh);
    if (gaps.length) {
      console.log(`NOT SUBMITTED ${t.id}; tests: ${ran}. Still missing:\n- ${gaps.join('\n- ')}`);
      process.exitCode = 1;
      return;
    }
    const light = lane === 'light';
    B.moveFile(board, fresh, 'review');
    const waits = light ? holdReason(fresh) : null;
    B.setState(board, t.id, { submitted: head, conflict: false, passed: light, passedAt: light ? Date.now() : null, held: waits, judged: light ? git(wt, 'rev-parse', 'HEAD') : null });
    B.log(board, t.id, 'submitted', { commit: head, lane, to: 'review', passed: light || undefined, files: files.length, fingerprint: fp });
    console.log(`SUBMITTED ${t.id} at ${head}; tests: ${ran}.`);
    console.log(light ? `Lane light: the gates passed; no reviewer. ${waits ? `It is held before the merge: it ${waits}.` : 'The foreman lands it.'} Do not touch its code from here on.` : `It is in review. Do not touch its code from here on.`);
  });
}

// ----- verdict -----

export function verdict(argv) {
  const { pos, opt, all } = parseArgs(argv);
  const board = B.openBoard();
  const result = pos[1];
  if (!['pass', 'reject'].includes(result)) die('usage: verdict <id> pass|reject [--fail 2,3] --note "<line>" [--note ...]');
  const notes = (all.note || []).map((n) => String(n).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const noteLimit = result === 'reject' ? 900 : 320;
  for (const n of notes) if (n.length > noteLimit) die(`a note has ${n.length} characters; the limit for a ${result} is ${noteLimit}. Evidence, not a transcript.`);
  if (notes.length > 14) die('at most 14 notes: one per criterion, one per kind of finding');
  B.withLock(board, 'board', () => {
    const t = B.load(B.findTicket(board, pos[0]));
    const st = B.getState(board, t.id);
    const integration = t.status === 'review' && st.passed && st.needs === 'reviewer';
    if (t.status !== 'review') die(`${t.id} is in ${t.status}; a verdict is for a ticket in review. If it was in review when you began, it was sent back to its worker meanwhile: report that in one line, and end.`);
    if (st.passed && !integration) die(`${t.id} has already passed and waits to land; there is nothing to judge`);
    const wt = B.worktreeOf(board, t.id);
    const head = wt ? git(wt, 'rev-parse', '--short', 'HEAD') : '?';
    // The verdict is about exactly what was handed over, and review changes nothing.
    if (wt) {
      const litter = dirt(board, t.id, wt);
      if (litter) die(`the worktree changed during the review. Restore it to what was handed over (remove what you created, undo what you edited), then give the verdict again:\n${tail(litter, 12)}`);
      if (st.submitted && st.submitted !== head) {
        // Somebody committed during the review: what was judged is not what is there.
        B.moveFile(board, t, 'in_progress');
        B.setState(board, t.id, { mode: 'resubmit', resubmits: (st.resubmits || 0) + 1, passed: false, passedAt: null, needs: null, held: null });
        B.log(board, t.id, 'moved', { to: 'in_progress', why: `the branch moved during review (${st.submitted} → ${head})` });
        console.log(`NO VERDICT ${t.id}: its branch moved since it was handed over (${st.submitted} → ${head}), so what you judged is not what is there. It is back with its worker to be handed over again. Report that in one line, and end.`);
        process.exitCode = 1;
        return;
      }
    }
    // A verdict comes from the reviewer the foreman sent for this step, not from whoever can type the command.
    const sent = st.reviewer?.agent && st.reviewer.step === (integration ? `integrate:${st.integrations || 1}:reviewer` : `review:${st.round || 1}`);
    if (!sent) die(`no reviewer was sent for this step of ${t.id}. A verdict is the reviewer's alone; a worker never judges its own ticket. (Foreman: dispatch one, then \`${K()} agent ${t.id} reviewer <agentId>\`.)`);
    const moved = contractMoved(board, t);
    if (moved) die(`${t.id}: ${moved}. Report this in one line instead of a verdict, and end.`);
    const round = st.round || 1;
    const what = integration ? 'conflict resolution' : `${t.fm.lane}, round ${round}`;
    if (result === 'reject' && !notes.length) die('a rejection says what failed: --note "<kind of mistake, every instance, how you saw it>"');
    if (result === 'pass' && integration && !notes.length) die('say what you checked in the resolution: --note "<what both sides meant, and that it is kept>"');
    if (result === 'pass' && !integration) {
      const missing = T.criteria(t.contract).filter((c) => !c.void && !notes.some((n) => new RegExp(`^${c.n}\\s*:`).test(n))).map((c) => c.n);
      if (missing.length) die(`a pass says what proved each criterion: one --note "<n>: <evidence>" per item. Missing: ${missing.join(', ')}`);
    }
    t.record.review.push({ text: `${today()} ${what}, at ${head}: ${result === 'pass' ? 'passed' : 'sent back'}.`, sub: notes });

    if (integration) {
      B.save(t);
      if (result === 'pass') B.setState(board, t.id, { needs: null, judged: wt ? git(wt, 'rev-parse', 'HEAD') : null });
      else B.setState(board, t.id, { needs: 'worker', conflict: true, integrations: (st.integrations || 1) + 1, passedAt: Date.now() });
      B.log(board, t.id, 'verdict', { result, integration: true, commit: head });
      return console.log(result === 'pass' ? `PASSED ${t.id} (conflict resolution). The foreman lands it.` : `SENT BACK ${t.id} (conflict resolution). It gave up its turn and joins the back of the merge queue.`);
    }
    if (result === 'pass') {
      B.save(t);
      const waits = holdReason(t);
      B.setState(board, t.id, { passed: true, passedAt: Date.now(), held: waits, judged: wt ? git(wt, 'rev-parse', 'HEAD') : null });
      B.log(board, t.id, 'verdict', { result, round, commit: head });
      return console.log(waits ? `PASSED ${t.id} in round ${round}. It is held before the merge: it ${waits}.` : `PASSED ${t.id} in round ${round}. It reaches done when it lands: the foreman runs \`${K()} land ${t.id}\`.`);
    }
    for (const n of String(opt.fail || '').split(',').map(Number).filter(Boolean)) t.contract = T.setCriterion(t.contract, n, false);
    B.save(t);
    B.moveFile(board, t, 'in_progress');
    B.setState(board, t.id, { mode: 'fix', round: round + 1, rejections: (st.rejections || 0) + 1 });
    B.log(board, t.id, 'verdict', { result, round, commit: head, failed: opt.fail || '' });
    console.log(`SENT BACK ${t.id} (round ${round}): it is in in_progress again, for the same worker.`);
  });
}

// ----- accept -----

// The owner takes a ticket as it is, after its reviewer sent it back.
export function accept(argv) {
  const { pos, opt } = parseArgs(argv);
  const board = B.openBoard();
  if (!opt.why) die('accept needs the owner\'s words: --why "<why it is accepted as it is>"');
  B.withLock(board, 'board', () => {
    const t = B.load(B.findTicket(board, pos[0]));
    if (t.status !== 'in_progress') die(`${t.id} is in ${t.status}; accept is for a ticket its reviewer sent back`);
    const wt = B.worktreeOf(board, t.id) || die(`${t.id} has no worktree`);
    if (dirt(board, t.id, wt)) die(`its worktree ${wt} holds uncommitted changes; have its worker commit or discard them first`);
    t.record.review.push(T.makeEntry(`${today()} accepted by the owner without passing review: ${opt.why}`));
    const f = T.addKeyed(t.record, 'followups', 'open', 'Accepted over its reviewer\'s findings (see Review): what the reviewer found is still true.');
    B.save(t);
    B.moveFile(board, t, 'review');
    B.setState(board, t.id, { passed: true, passedAt: Date.now(), judged: git(wt, 'rev-parse', 'HEAD') });
    B.log(board, t.id, 'accepted', { by: 'owner' });
    console.log(`ACCEPTED ${t.id} on the owner's word. Land it with \`${K()} land ${t.id}\`.\nWhat the reviewer found is still true, and ${f.key} holds it in the inbox: create the follow-up (\`${K()} new "<what is left>" --related ${t.id}\`, then \`${K()} followup ${t.id} ticketed ${f.key}\`), or \`${K()} followup ${t.id} declined ${f.key}\` if the owner drops it.`);
  });
}

// ----- land -----

const mergeOpen = (cwd) => gitTry(cwd, 'rev-parse', '-q', '--verify', 'MERGE_HEAD').code === 0;

export function land(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const main = board.settings.main_branch;
  const id = B.findTicket(board, pos[0]).id;

  B.withLock(board, 'land', () => {
    // Read inside the lock: another land of this ticket may just have finished.
    let t = B.load(B.findTicket(board, id));
    if (t.status === 'done') return console.log(`${t.id} has already landed.`);
    const st0 = B.getState(board, t.id);
    if (t.status !== 'review' || !st0.passed) die(`${t.id} is in ${t.status} and has not passed; only a ticket that passed lands`);
    const branch = B.branchOf(board, t.id) || die(`${t.id} has no branch; \`${K()} doctor\` shows what is left of it`);

    const hold = (reason) => {
      B.setState(board, t.id, { held: reason });
      B.log(board, t.id, 'held', { reason });
      console.log(`HELD ${t.id}: ${reason}\nNothing of it is in ${main}; the ticket stays where it was. It waits for the owner; other tickets carry on.`);
      process.exitCode = 4;
    };

    // The merge queue: only the front ticket lands, and it keeps the front
    // until it is in main. A merge that was held rejoins at the back.
    const unanswered = holdReason(t);
    if (unanswered) {
      B.setState(board, t.id, { held: unanswered });
      console.log(`HELD ${t.id}: it ${unanswered}. Nothing was changed.`);
      process.exitCode = 4;
      return;
    }
    if (st0.held) B.setState(board, t.id, { held: null, passedAt: Date.now() });
    const queue = B.mergeQueue(board);
    const place = queue.findIndex((q) => q.id === t.id);
    if (place > 0) {
      const front = queue[0];
      console.log(`WAITING ${t.id}: number ${place + 1} in the merge queue. ${front.id} is at the front${front.st.needs ? ' and is being brought up to date with ' + main : ''}; it lands first. Nothing was changed.`);
      process.exitCode = 5;
      return;
    }
    if (st0.needs) die(`${t.id} holds the front of the merge queue and is being brought up to date with ${main} (waiting for its ${st0.needs}); land it after that`);

    const moved = contractMoved(board, t);
    if (moved) return hold(moved);
    const current = gitTry(board.root, 'symbolic-ref', '--short', 'HEAD').out;
    if (current !== main) return hold(`the main tree is on branch "${current}", not ${main}`);
    // A merge already open in the main tree is the owner's, never ours to touch.
    if (mergeOpen(board.root)) return hold('the main tree is in the middle of a merge of its own: finish or abort that one first');
    const wt = B.worktreeOf(board, t.id);

    // Only what was judged lands. A commit added after the pass was seen by nobody.
    const tip = git(board.root, 'rev-parse', branch);
    if (st0.judged && tip !== st0.judged) {
      B.withLock(board, 'board', () => {
        B.moveFile(board, B.findTicket(board, t.id), 'in_progress');
        B.setState(board, t.id, { mode: 'resubmit', resubmits: (st0.resubmits || 0) + 1, passed: false, passedAt: null, needs: null, held: null, judged: null });
        B.log(board, t.id, 'moved', { to: 'in_progress', why: `the branch changed after it passed (${st0.judged.slice(0, 7)} → ${tip.slice(0, 7)})` });
      });
      console.log(`BACK ${t.id}: its branch changed after it passed (judged ${st0.judged.slice(0, 7)}, now ${tip.slice(0, 7)}). Nothing lands that was not handed over and judged: it is in in_progress again. Run \`${K()} next\`.`);
      process.exitCode = 3;
      return;
    }

    const back = (conflict, text) => {
      const st = B.getState(board, t.id);
      B.setState(board, t.id, { needs: 'worker', conflict, integrations: (st.integrations || 0) + 1 });
      B.log(board, t.id, 'integrate', { conflict });
      console.log(text);
      process.exitCode = 3;
    };
    const behind = gitTry(board.root, 'merge-base', '--is-ancestor', main, branch).code !== 0;
    let ran = '';
    if (behind) {
      if (!wt) return hold(`${main} moved and the worktree of ${branch} is gone, so the merged state cannot be tested`);
      if (dirt(board, t.id, wt)) return hold(`its worktree ${wt} holds uncommitted changes`);
      const merged = bringMainIn(board, t, wt);
      if (merged.conflicts.length) {
        gitTry(wt, 'merge', '--abort');
        return back(true, `INTEGRATE ${t.id}: ${main} moved and its branch conflicts in ${merged.conflicts.join(', ')}.\nThis is not a rejection. Run \`${K()} next\`: its worker brings ${main} in.`);
      }
      // A merge k2 made itself, with no hand in it, is still what was judged.
      B.setState(board, t.id, { judged: git(board.root, 'rev-parse', branch) });
    }
    // Nothing enters main but content the tests passed on, exactly: the tip
    // of the branch, which now holds all of main. No matching run: run them.
    let tested = null;
    if (board.settings.test_command) {
      if (!wt) return hold(`the worktree of ${branch} is gone, so its tests cannot be run`);
      const fp = fingerprint(board, t.id, wt);
      if (!fp) return hold(`its worktree ${wt} holds uncommitted changes`);
      if (!passedOn(board, t.id, fp)) {
        const r = runTests(board, t, wt, 'land');
        if (r.exit !== 0) return back(false, `INTEGRATE ${t.id}: the tests fail on what would enter ${main} (exit ${r.exit})${behind ? `, with ${main} merged in` : ''}.\nNothing was merged. Run \`${K()} next\`: its worker fixes it.`);
        ran = `; tests passed on the merged state in ${fmtDuration(r.seconds)}`;
      }
      tested = fp;
    }
    const files = gitTry(board.root, 'diff', '--name-only', '--no-renames', `${main}...${branch}`, '--', '.', NO_BOARD).out.split('\n').filter(Boolean);
    const m = gitTry(board.root, 'merge', '--no-ff', '--no-commit', branch);
    if (m.code !== 0) {
      if (mergeOpen(board.root)) gitTry(board.root, 'merge', '--abort'); // ours: none was open a moment ago
      return hold(`git refused the merge into ${main}: ${tail(m.err || m.out, 3)}`);
    }
    if (tested && treePrint(board.root, git(board.root, 'write-tree')) !== tested) {
      if (mergeOpen(board.root)) gitTry(board.root, 'merge', '--abort');
      return hold(`what the merge would put into ${main} is not the content the tests passed on (something else is staged in the main tree, or ${main} moved outside k2)`);
    }
    // The ticket reaches done in the very commit that brings its code into
    // main. If that commit fails, every step taken for it is taken back.
    const undo = [];
    try {
      B.withLock(board, 'board', () => {
        t = B.load(B.findTicket(board, t.id));
        const rounds = B.getState(board, t.id).round || 1;
        const logFile = path.join(board.dir, 'log', `${t.id}.jsonl`);
        const logSize = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
        const queueFile = path.join(board.dir, 'queue.yml');
        const queueText = fs.existsSync(queueFile) ? fs.readFileSync(queueFile, 'utf8') : null;
        undo.push(() => {
          B.moveFile(board, B.findTicket(board, t.id), 'review');
          if (fs.existsSync(logFile)) fs.truncateSync(logFile, logSize);
          if (queueText !== null) fs.writeFileSync(queueFile, queueText);
        });
        B.moveFile(board, t, 'done');
        B.log(board, t.id, 'landed', { branch, files });
        B.dropFromQueue(board, t.id);
        const paths = [`:(glob)${B.BOARD_DIR}/*/${t.id} *`, `${B.BOARD_DIR}/log/${t.id}.jsonl`];
        for (const f of ['queue.yml', 'lessons.md']) if (fs.existsSync(path.join(board.dir, f))) paths.push(`${B.BOARD_DIR}/${f}`);
        git(board.root, 'add', '-A', '--', ...paths);
        const c = gitTry(board.root, 'commit', '-q', '-m', `${t.id} ${t.title}`, '-m', `Lane ${t.fm.lane}, ${rounds} round${rounds === 1 ? '' : 's'}. Ticket: ${B.BOARD_DIR}/done/${t.id}`);
        if (c.code !== 0) throw new Error(c.err || c.out || 'git commit failed');
      });
    } catch (e) {
      for (const u of undo) {
        try {
          u();
        } catch {}
      }
      gitTry(board.root, 'reset', '-q', '--', B.BOARD_DIR);
      if (mergeOpen(board.root)) gitTry(board.root, 'merge', '--abort');
      return hold(`the commit of the merge failed, and the merge was taken back: ${tail(e.message, 4)}`);
    }
    const hash = git(board.root, 'rev-parse', '--short', 'HEAD');
    if (wt) {
      const down = board.settings.worktree_teardown;
      if (down) run('sh', ['-c', down], { cwd: wt, env: wtEnv(board, t.id, st0.slot, wt) });
      const rm = gitTry(board.root, 'worktree', 'remove', '--force', wt);
      if (rm.code !== 0) console.log(`note: could not remove ${wt}: ${rm.err} (\`${K()} doctor --fix\` cleans it)`);
    }
    gitTry(board.root, 'branch', '-D', branch);
    B.dropState(board, t.id);
    console.log(`LANDED ${t.id} in ${main} at ${hash} (${files.length} file${files.length === 1 ? '' : 's'})${ran}. Worktree and branch removed.`);
  }, { waitMs: 3 * 3600 * 1000 });
}

// ----- brief -----

function roleText(role, tags, vars) {
  const file = path.join(B.PLUGIN_ROOT, 'roles', `${role}.md`);
  const out = [];
  let on = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^@@ (.+)$/);
    if (m) {
      on = m[1].split(',').map((x) => x.trim()).some((tag) => tags.includes(tag));
      continue;
    }
    if (on) out.push(line);
  }
  return out.join('\n').replace(/\{(\w+)\}/g, (all, k) => (k in vars ? vars[k] : all)).replace(/\n{3,}/g, '\n\n').trim();
}

export function brief(argv) {
  const { pos, opt } = parseArgs(argv);
  const board = B.openBoard();
  const role = opt.role;
  const s = board.settings;
  if (!['worker', 'reviewer', 'planner'].includes(role)) die('usage: brief <id> --role worker|reviewer   |   brief --role planner');
  const base = { k2: K(), main: s.main_branch, language: s.language, root: board.root, limit: s.done_when_limit };

  if (role === 'planner') {
    console.log(`# k2 brief — planner\nRepo: ${board.root} · ticket prose in ${s.language} · test_command: ${s.test_command || '(none)'}\nstrict_paths: [${s.strict_paths.join(', ')}] · max_parallel: ${s.max_parallel}\n`);
    console.log(roleText('planner', ['always'], base));
    printSituation(board);
    printLessons(board);
    return;
  }

  const t = B.load(B.findTicket(board, pos[0]));
  const st = B.getState(board, t.id);
  const wt = B.worktreeOf(board, t.id);
  const branch = B.branchOf(board, t.id);
  const integrating = t.status === 'review' && !!st.passed && !!st.needs;
  let mode = 'first';
  if (integrating) mode = 'integrate';
  else if (role === 'worker') mode = st.mode || 'first';
  else if ((st.round || 1) > 1) mode = 'round2';
  const want = role === 'worker' ? ['in_progress'] : ['review'];
  const theirs = integrating ? st.needs === role : want.includes(t.status) && !st.passed;
  if (!theirs) die(`${t.id} is in ${t.status}; there is nothing for a ${role} to do on it. Report that and end.`);
  if (!wt) die(`${t.id} has no worktree. Report that and end; the foreman runs \`${K()} start ${t.id}\`.`);

  const vars = { ...base, id: t.id, wt, branch, test: s.test_command || '(none)' };
  console.log(`# k2 brief — ${role} — ${t.id} "${t.title}"`);
  console.log(`Lane: ${t.fm.lane} · mode: ${mode} · round ${st.round || 1} · ticket prose in ${s.language}`);
  console.log(`Worktree: ${wt}   (branch ${branch}; the main tree ${board.root} is not yours to change)`);
  if (role === 'reviewer') {
    const ok = passedOn(board, t.id, fingerprint(board, t.id, wt));
    console.log(s.test_command
      ? ok
        ? `Tests: \`${s.test_command}\` passed at ${ok.t} on exactly the content under review (${ok.fingerprint.slice(0, 10)}). Do not run the full suite again.`
        : `Tests: no passing run of \`${s.test_command}\` on this content. Run \`${K()} test ${t.id}\` yourself.`
      : 'Tests: this project has no test_command. Say so in your verdict; judge by running what you can.');
    console.log(`The change: git -C "${wt}" diff ${s.main_branch}...HEAD -- . '${NO_BOARD}'`);
  } else {
    console.log(`Tests: ${s.test_command ? `\`${s.test_command}\` — submit runs it for you; \`${K()} test ${t.id}\` runs it alone` : 'no test_command in this project'}`);
  }
  if (s.test_command && !s.parallel_tests) console.log(`Test runs take turns across worktrees (they may share ports or data): run every test command of yours through \`${K()} test ${t.id} -- <command>\`${role === 'reviewer' ? ` (in a copy: \`${K()} test ${t.id} --dir <copy> -- <command>\`)` : ''}, never bare.`);
  const tags = ['always', `mode:${mode}`];
  if (!(role === 'reviewer' && mode === 'integrate')) tags.push(`lane:${t.fm.lane}`);
  if (mode !== 'first') console.log(`If you did not work on this ticket before (you are replacing an agent that could not be resumed), nothing below is in your memory: read the ticket, its Handoff and Review, and \`git -C "${wt}" log --oneline ${s.main_branch}..HEAD\` first. Earlier work already sits in the worktree; build on it.`);
  console.log('\n' + roleText(role, tags, vars));

  console.log(`\n## The ticket — ${t.id} ${t.title}\n`);
  console.log(fs.readFileSync(t.file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim());

  if (role === 'reviewer' && mode !== 'integrate') {
    const seen = new Map();
    for (const e of B.readLog(board, t.id)) if (e.event === 'check') seen.set(e.n, e.evidence);
    if (seen.size) {
      console.log(`\n## The worker's claim per item (a claim, not evidence)`);
      for (const [n, ev] of [...seen].sort((a, b) => a[0] - b[0])) console.log(`- ${n}: ${ev}`);
    }
  }
  if (mode === 'integrate') {
    const others = landedSince(board, t);
    if (others.length) console.log(`\n## Landed in ${s.main_branch} since this ticket started`);
    for (const o of others) console.log(`- ${o.id} ${o.title} — files: ${(o.shared || []).slice(0, 12).join(', ') || '(none)'}\n  Handoff: ${o.record.handoff || '(none written)'}`);
  }
  if (role === 'worker') printLessons(board);
}

// What a planner cannot see by reading main: the work that is moving right
// now (its code is on branches), and what main gained most recently.
function printSituation(board) {
  const main = board.settings.main_branch;
  const flight = B.listTickets(board, ['in_progress', 'review']).map(B.load);
  console.log(`\n## In flight now (${flight.length}) — their code is on branches, not in ${main} yet`);
  if (!flight.length) console.log('Nothing. Whatever you queue starts on an idle board.');
  for (const t of flight) {
    const branch = B.branchOf(board, t.id);
    const files = branch ? gitTry(board.root, 'diff', '--name-only', `${main}...${branch}`, '--', '.', NO_BOARD).out.split('\n').filter(Boolean) : [];
    const st = B.getState(board, t.id);
    console.log(`- ${t.id} ${t.title} [${st.passed ? 'passed, waiting to merge' : t.status}${t.fm.solo === 'true' ? ', solo' : ''}]`);
    console.log(`  Request: ${(T.section(t.contract, 'Request') || '').replace(/\s+/g, ' ').slice(0, 300)}`);
    console.log(`  Changed so far: ${files.slice(0, 15).join(', ') || '(nothing committed yet)'}${t.fm.touches.length ? ` · expected: ${t.fm.touches.join(', ')}` : ''}`);
  }
  const landed = [];
  for (const raw of B.listTickets(board, ['done'])) {
    const e = B.readLog(board, raw.id).reverse().find((x) => x.event === 'landed');
    if (e) landed.push({ raw, e });
  }
  landed.sort((a, b) => (a.e.t < b.e.t ? 1 : -1));
  if (landed.length) console.log(`\n## Landed most recently — what ${main} gained, in each worker's words`);
  for (const { raw, e } of landed.slice(0, 8)) {
    const t = B.load(raw);
    console.log(`- ${t.id} ${t.title} (${e.t.slice(0, 16)}) — ${(e.files || []).slice(0, 8).join(', ')}`);
    if (t.record.handoff) console.log(`  ${t.record.handoff.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
}

function printLessons(board) {
  const list = lessons(board);
  if (list.length) console.log(`\n## Lessons from earlier tickets\n${list.join('\n')}`);
}

// ----- history -----

// The journey of one ticket, read from its machine trail.
export function history(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const t = B.findTicket(board, pos[0]);
  const status = (e) => {
    if (e.event === 'created') return e.status;
    if (e.event === 'moved') return e.to;
    if (e.event === 'started') return 'in_progress';
    if (e.event === 'submitted') return e.to;
    if (e.event === 'verdict' && !e.integration && e.result !== 'pass') return 'in_progress';
    if (e.event === 'landed') return 'done';
    return null;
  };
  const detail = (e) => {
    switch (e.event) {
      case 'started': return `worktree on ${e.branch}, from ${e.base}`;
      case 'agent': return `${e.role} is agent ${e.agent}`;
      case 'test': return `tests ${e.exit === 0 ? 'passed' : `failed (exit ${e.exit})`} in ${fmtDuration(e.seconds)} (${e.by})`;
      case 'submitted': return `submitted at ${e.commit}, lane ${e.lane}, ${e.files} file(s)`;
      case 'verdict': return `${e.integration ? 'conflict resolution' : `round ${e.round}`} ${e.result === 'pass' ? 'passed' : 'sent back'} at ${e.commit}`;
      case 'conflict': return `conflict with main in ${(e.files || []).join(', ')}`;
      case 'integrate': return `main moved before it could land${e.conflict ? ' (conflict)' : ' (tests failed on the merged state)'}`;
      case 'integrated': return `brought up to date at ${e.commit}`;
      case 'landed': return `landed in ${board.settings.main_branch} (${(e.files || []).length} file(s)); worktree and branch removed`;
      case 'held': return `held: ${e.reason}`;
      case 'check': return `item ${e.n} ticked: ${e.evidence}`;
      case 'question': return `question ${e.key}${e.blocking ? ' (blocking)' : ''}`;
      default: return [e.key, e.to && `to ${e.to}`].filter(Boolean).join(' ');
    }
  };
  console.log(`${t.id} ${t.title}   [${t.status}]`);
  for (const e of B.readLog(board, t.id)) {
    const st = status(e);
    console.log(`${e.t}  ${(e.session || '-').slice(0, 8)}  ${(st ? `→ ${st}` : '').padEnd(14)} ${e.event.padEnd(12)} ${detail(e)}`.trimEnd());
  }
  console.log('\nThe second column is the session that made the step: `claude --resume <session id>` opens it (the full id is in the log file).');
}
