// The life of one ticket's work: start (a worktree), brief (what this agent
// needs right now), test, submit (merge main in, test, gates), verdict, land.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { die, git, gitTry, run, now, today, parseArgs, slugify, fmtDuration } from './util.mjs';
import * as B from './board.mjs';
import * as T from './ticket.mjs';
import { readiness } from './cmd-board.mjs';
import { lessons } from './cmd-record.mjs';

const K = () => B.k2Name();
const NO_BOARD = ':(exclude).kerjaan2';

// ----- start -----

export function start(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const main = board.settings.main_branch;
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
      const flight = B.listTickets(board, ['in_progress', 'review']).length;
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
    const setup = board.settings.worktree_setup;
    if (setup) {
      const r = run('sh', ['-c', setup], { cwd: wt, env: wtEnv(board, t.id, slot) });
      if (r.code !== 0) {
        gitTry(board.root, 'worktree', 'remove', '--force', wt);
        if (!inFlight) gitTry(board.root, 'branch', '-D', branch);
        die(`worktree_setup failed (exit ${r.code}); the worktree was removed again:\n${tail(r.out + '\n' + r.err, 15)}`);
      }
    }
    if (!inFlight) {
      B.moveFile(board, t, 'in_progress');
      B.dropFromQueue(board, t.id);
      B.setState(board, t.id, { mode: 'first', round: 1, slot, started: now() });
      B.log(board, t.id, 'started', { branch, base: git(board.root, 'rev-parse', '--short', main) });
    } else B.setState(board, t.id, { slot });
    console.log(`STARTED ${t.id} ${t.title}\nWorktree: ${wt}\nBranch: ${branch} (from ${main})`);
  });
}

function wtEnv(board, id, slot) {
  return { ...process.env, K2_MAIN_TREE: board.root, K2_TICKET: id, K2_SLOT: String(slot || 1) };
}

const tail = (text, n) => text.split('\n').filter((l) => l.trim()).slice(-n).join('\n');

// ----- tests -----

// The content under test, as git sees it, with the board left out. Null when
// the tree holds uncommitted changes: then there is no "exactly this content".
export function fingerprint(wt) {
  if (gitTry(wt, 'status', '--porcelain').out) return null;
  const tree = git(wt, 'ls-tree', 'HEAD').split('\n').filter((l) => l && !l.endsWith(`\t${B.BOARD_DIR}`));
  const r = run('git', ['mktree'], { cwd: wt, input: tree.join('\n') + '\n' });
  if (r.code !== 0) die(`could not fingerprint ${wt}: ${r.err}`);
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
  const fp = fingerprint(wt);
  const dir = path.join(board.state, 'progress');
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, `${t.id}.log`);
  const st = B.getState(board, t.id);
  const go = () => {
    const fd = fs.openSync(outFile, 'w');
    const t0 = Date.now();
    const r = spawnSync('sh', ['-c', cmd], { cwd: wt, env: wtEnv(board, t.id, st.slot), stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    return { exit: r.status ?? 1, seconds: (Date.now() - t0) / 1000 };
  };
  const res = board.settings.parallel_tests ? go() : B.withLock(board, 'test', go, { waitMs: 3 * 3600 * 1000 });
  const after = fingerprint(wt);
  const output = fs.readFileSync(outFile, 'utf8');
  const stable = fp && fp === after;
  B.log(board, t.id, 'test', { by, exit: res.exit, seconds: Math.round(res.seconds), fingerprint: stable ? fp : null, command: cmd });
  if (res.exit === 0) fs.rmSync(outFile, { force: true });
  return { ...res, output, fingerprint: stable ? fp : null };
}

export function test(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const t = B.load(B.findTicket(board, pos[0]));
  const wt = B.worktreeOf(board, t.id) || die(`${t.id} has no worktree`);
  const r = runTests(board, t, wt, 'manual');
  if (r.none) return console.log('settings.yml has no test_command: nothing to run');
  if (r.exit === 0) console.log(`TESTS PASSED in ${fmtDuration(r.seconds)}${r.fingerprint ? '' : ' (on uncommitted changes: submit will run them again on what is committed)'}`);
  else {
    console.log(`TESTS FAILED (exit ${r.exit}) after ${fmtDuration(r.seconds)}. Last lines:\n${tail(r.output, 40)}`);
    process.exitCode = 1;
  }
}

// ----- submit -----

function globToRe(glob) {
  let g = glob.replace(/^\.\//, '');
  if (g.endsWith('/')) g += '**';
  const re = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`);
}

function changedFiles(wt, main) {
  return gitTry(wt, 'diff', '--name-only', `${main}...HEAD`, '--', '.', NO_BOARD).out.split('\n').filter(Boolean);
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
  const integrating = t.status === 'done' && st.needs === 'worker';
  if (t.status !== 'in_progress' && !integrating) die(`${t.id} is in ${t.status}; submit hands over a ticket that is in_progress`);
  const wt = B.worktreeOf(board, t.id) || die(`${t.id} has no worktree; \`${K()} start ${t.id}\` makes it again`);

  const dirty = gitTry(wt, 'status', '--porcelain').out;
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

  const fp = fingerprint(wt);
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
    }
  }
  const head = git(wt, 'rev-parse', '--short', 'HEAD');

  if (integrating) {
    const needsEyes = st.conflict && t.fm.lane !== 'light';
    B.setState(board, t.id, { needs: needsEyes ? 'reviewer' : null, conflict: false });
    B.log(board, t.id, 'integrated', { commit: head });
    console.log(`INTEGRATED ${t.id} at ${head}; tests: ${ran}.\n${needsEyes ? 'A reviewer looks at the conflict resolution, then it lands.' : `It can land: the foreman runs \`${K()} land ${t.id}\`.`}`);
    return;
  }

  B.withLock(board, 'board', () => {
    const fresh = B.load(B.findTicket(board, t.id));
    const gaps = [];
    const crit = T.criteria(fresh.contract);
    for (const c of crit) {
      if (c.owner) {
        if (!fresh.record.manual.some((m) => m.text.startsWith(`(item ${c.n})`))) gaps.push(`item ${c.n} is the owner's to check: write its steps with \`${K()} manual ${t.id} ${c.n} "<steps>"\``);
      } else if (!c.done) gaps.push(`item ${c.n} is not ticked: \`${K()} check ${t.id} ${c.n} "<what you ran and saw>"\``);
    }
    if (!fresh.record.handoff) gaps.push(`no handoff: \`${K()} handoff ${t.id} "<what changed, why, what must not break>"\``);
    for (const q of fresh.record.questions) if (q.status === 'blocking') gaps.push(`question ${q.key} still waits for the owner: report STOPPED — question ${q.key}`);

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
    const to = lane === 'light' ? 'done' : 'review';
    B.moveFile(board, fresh, to);
    B.setState(board, t.id, { submitted: head, conflict: false });
    B.log(board, t.id, 'submitted', { commit: head, lane, to, files: files.length, fingerprint: fp });
    console.log(`SUBMITTED ${t.id} at ${head}; tests: ${ran}.`);
    console.log(to === 'done' ? `Lane light: the gates passed and it is done. The foreman lands it.` : `It is in review. Do not touch its code from here on.`);
  });
}

// ----- verdict -----

export function verdict(argv) {
  const { pos, opt, all } = parseArgs(argv);
  const board = B.openBoard();
  const result = pos[1];
  if (!['pass', 'reject'].includes(result)) die('usage: verdict <id> pass|reject [--fail 2,3] --note "<line>" [--note ...]');
  const notes = (all.note || []).map((n) => String(n).replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const n of notes) if (n.length > 320) die(`a note is one line (320 characters at most); this one has ${n.length}. Evidence, not output.`);
  if (notes.length > 14) die('at most 14 notes: one per criterion, one per kind of finding');
  B.withLock(board, 'board', () => {
    const t = B.load(B.findTicket(board, pos[0]));
    const st = B.getState(board, t.id);
    const integration = t.status === 'done' && st.needs === 'reviewer';
    if (t.status !== 'review' && !integration) die(`${t.id} is in ${t.status}; a verdict is for a ticket in review`);
    const wt = B.worktreeOf(board, t.id);
    const head = wt ? git(wt, 'rev-parse', '--short', 'HEAD') : '?';
    const round = st.round || 1;
    const what = integration ? 'conflict resolution' : `${t.fm.lane}, round ${round}`;
    if (result === 'reject' && !notes.length) die('a rejection says what failed: --note "<kind of mistake, every instance, how you saw it>"');
    if (result === 'pass' && !integration && !notes.length) die('a pass says what proved each criterion: --note "1: <evidence>" per item');
    t.record.review.push({ text: `${today()} ${what}, at ${head}: ${result === 'pass' ? 'passed' : 'sent back'}.`, sub: notes });

    if (integration) {
      B.save(t);
      if (result === 'pass') B.setState(board, t.id, { needs: null });
      else B.setState(board, t.id, { needs: 'worker', conflict: true, integrations: (st.integrations || 1) + 1 });
      B.log(board, t.id, 'verdict', { result, integration: true, commit: head });
      return console.log(result === 'pass' ? `PASSED ${t.id} (conflict resolution). The foreman lands it.` : `SENT BACK ${t.id} (conflict resolution).`);
    }
    if (result === 'pass') {
      B.save(t);
      B.moveFile(board, t, 'done');
      B.log(board, t.id, 'verdict', { result, round, commit: head });
      return console.log(`PASSED ${t.id} in round ${round}: it is done. The foreman lands it with \`${K()} land ${t.id}\`.`);
    }
    for (const n of String(opt.fail || '').split(',').map(Number).filter(Boolean)) t.contract = T.setCriterion(t.contract, n, false);
    B.save(t);
    B.moveFile(board, t, 'in_progress');
    B.setState(board, t.id, { mode: 'fix', round: round + 1, rejections: (st.rejections || 0) + 1 });
    B.log(board, t.id, 'verdict', { result, round, commit: head, failed: opt.fail || '' });
    console.log(`SENT BACK ${t.id} (round ${round}): it is in in_progress again, for the same worker.`);
  });
}

// ----- land -----

export function land(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const main = board.settings.main_branch;
  let t = B.load(B.findTicket(board, pos[0]));
  if (t.status !== 'done') die(`${t.id} is in ${t.status}; only a ticket that is done lands`);
  const branch = B.branchOf(board, t.id);
  if (!branch) return console.log(`${t.id} has already landed: no branch of it is left.`);
  const st0 = B.getState(board, t.id);
  if (st0.needs) die(`${t.id} is being brought up to date with ${main} (waiting for its ${st0.needs}); land it after that`);

  const hold = (reason) => {
    B.setState(board, t.id, { held: reason });
    B.log(board, t.id, 'held', { reason });
    console.log(`HELD ${t.id}: ${reason}\nNothing was changed. Tell the owner; once cleared, land again. Other tickets carry on.`);
    process.exitCode = 4;
  };

  B.withLock(board, 'land', () => {
    B.setState(board, t.id, { held: null });
    const current = gitTry(board.root, 'symbolic-ref', '--short', 'HEAD').out;
    if (current !== main) return hold(`the main tree is on branch "${current}", not ${main}`);
    const wt = B.worktreeOf(board, t.id);
    const behind = gitTry(board.root, 'merge-base', '--is-ancestor', main, branch).code !== 0;
    let ran = '';
    if (behind) {
      if (!wt) return hold(`${main} moved and the worktree of ${branch} is gone, so the merged state cannot be tested`);
      if (gitTry(wt, 'status', '--porcelain').out) return hold(`its worktree ${wt} holds uncommitted changes`);
      const merged = bringMainIn(board, t, wt);
      const back = (conflict, text) => {
        const st = B.getState(board, t.id);
        B.setState(board, t.id, { needs: 'worker', conflict, integrations: (st.integrations || 0) + 1 });
        B.log(board, t.id, 'integrate', { conflict });
        console.log(text);
        process.exitCode = 3;
      };
      if (merged.conflicts.length) {
        gitTry(wt, 'merge', '--abort');
        return back(true, `INTEGRATE ${t.id}: ${main} moved and its branch conflicts in ${merged.conflicts.join(', ')}.\nThis is not a rejection. Run \`${K()} next\`: its worker brings ${main} in.`);
      }
      const r = runTests(board, t, wt, 'land');
      if (r.exit !== 0) return back(false, `INTEGRATE ${t.id}: ${main} merged cleanly, but the tests fail on the merged state (exit ${r.exit}).\nThis is not a rejection. Run \`${K()} next\`: its worker fixes it.`);
      ran = r.none ? '' : `; tests passed on the merged state in ${fmtDuration(r.seconds)}`;
    }
    const files = gitTry(board.root, 'diff', '--name-only', `${main}...${branch}`, '--', '.', NO_BOARD).out.split('\n').filter(Boolean);
    const m = gitTry(board.root, 'merge', '--no-ff', '--no-commit', branch);
    if (m.code !== 0) {
      gitTry(board.root, 'merge', '--abort');
      return hold(`git refused the merge into ${main}: ${tail(m.err || m.out, 3)}`);
    }
    B.withLock(board, 'board', () => {
      t = B.load(B.findTicket(board, t.id));
      const rounds = B.getState(board, t.id).round || 1;
      B.log(board, t.id, 'landed', { branch, files });
      B.dropFromQueue(board, t.id);
      const paths = [`:(glob)${B.BOARD_DIR}/*/${t.id} *`, `${B.BOARD_DIR}/log/${t.id}.jsonl`];
      if (fs.existsSync(path.join(board.dir, 'queue.yml'))) paths.push(`${B.BOARD_DIR}/queue.yml`);
      git(board.root, 'add', '-A', '--', ...paths);
      const c = gitTry(board.root, 'commit', '-q', '-m', `${t.id} ${t.title}`, '-m', `Lane ${t.fm.lane}, ${rounds} round${rounds === 1 ? '' : 's'}. Ticket: ${B.BOARD_DIR}/done/${t.id}`);
      if (c.code !== 0) die(`the merge is staged in ${board.root} but the commit failed:\n${c.err || c.out}`);
    });
    const hash = git(board.root, 'rev-parse', '--short', 'HEAD');
    if (wt) {
      const down = board.settings.worktree_teardown;
      if (down) run('sh', ['-c', down], { cwd: wt, env: wtEnv(board, t.id, st0.slot) });
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
    printLessons(board);
    return;
  }

  const t = B.load(B.findTicket(board, pos[0]));
  const st = B.getState(board, t.id);
  const wt = B.worktreeOf(board, t.id);
  const branch = B.branchOf(board, t.id);
  const integrating = t.status === 'done' && !!st.needs;
  let mode = 'first';
  if (integrating) mode = 'integrate';
  else if (role === 'worker') mode = st.mode || 'first';
  else if ((st.round || 1) > 1) mode = 'round2';
  const want = role === 'worker' ? ['in_progress'] : ['review'];
  if (!want.includes(t.status) && !integrating) die(`${t.id} is in ${t.status}; there is nothing for a ${role} to do on it. Report that and end.`);
  if (!wt) die(`${t.id} has no worktree. Report that and end; the foreman runs \`${K()} start ${t.id}\`.`);

  const vars = { ...base, id: t.id, wt, branch, test: s.test_command || '(none)' };
  console.log(`# k2 brief — ${role} — ${t.id} "${t.title}"`);
  console.log(`Lane: ${t.fm.lane} · mode: ${mode} · round ${st.round || 1} · ticket prose in ${s.language}`);
  console.log(`Worktree: ${wt}   (branch ${branch}; the main tree ${board.root} is not yours to change)`);
  if (role === 'reviewer') {
    const ok = passedOn(board, t.id, fingerprint(wt));
    console.log(s.test_command
      ? ok
        ? `Tests: \`${s.test_command}\` passed at ${ok.t} on exactly the content under review (${ok.fingerprint.slice(0, 10)}). Do not run the full suite again.`
        : `Tests: no passing run of \`${s.test_command}\` on this content. Run \`${K()} test ${t.id}\` yourself.`
      : 'Tests: this project has no test_command. Say so in your verdict; judge by running what you can.');
    console.log(`The change: git -C "${wt}" diff ${s.main_branch}...HEAD -- . '${NO_BOARD}'`);
  } else {
    console.log(`Tests: ${s.test_command ? `\`${s.test_command}\` — submit runs it for you; \`${K()} test ${t.id}\` runs it alone` : 'no test_command in this project'}`);
  }
  console.log('\n' + roleText(role, ['always', `lane:${t.fm.lane}`, `mode:${mode}`], vars));

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

function printLessons(board) {
  const list = lessons(board);
  if (list.length) console.log(`\n## Lessons from earlier tickets\n${list.join('\n')}`);
}
