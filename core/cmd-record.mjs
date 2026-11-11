// Commands that write a ticket's record: questions, assumptions, decisions,
// manual checks, the handoff, follow-ups, and the project's lessons.
import fs from 'node:fs';
import path from 'node:path';
import { die, parseArgs, today } from './util.mjs';
import * as B from './board.mjs';
import * as T from './ticket.mjs';

const K = () => B.k2Name();

function edit(ref, fn) {
  const board = B.openBoard();
  return B.withLock(board, 'board', () => {
    const t = B.load(B.findTicket(board, ref));
    const said = fn(t, board);
    B.save(t);
    if (said) console.log(said);
  });
}

const who = (opt) => opt.by || 'owner';

const openBlocking = (t) => t.record.questions.filter((q) => q.status === 'blocking');
const HOLD = (keys) => `waits for the owner's answer to ${keys.join(', ')}`;

export function ask(argv) {
  const { pos, opt } = parseArgs(argv, ['blocking']);
  edit(pos[0], (t, board) => {
    const e = T.addKeyed(t.record, 'questions', opt.blocking ? 'blocking' : 'open', pos.slice(1).join(' '));
    B.log(board, t.id, 'question', { key: e.key, blocking: !!opt.blocking });
    if (!opt.blocking) return `${t.id} ${e.key} recorded. It does not hold the work up: carry on.`;
    if (['in_progress', 'review'].includes(t.status)) {
      return `${t.id} ${e.key} recorded for the owner. Do not stop: build the option you recommended, and submit as usual. The ticket will be reviewed, then held before it merges until the owner has answered.`;
    }
    return `${t.id} ${e.key} recorded: the ticket cannot enter todo until the owner has answered.`;
  });
}

export function answer(argv) {
  const { pos, opt } = parseArgs(argv, ['agrees', 'differs']);
  edit(pos[0], (t, board) => {
    const q = T.findKeyed(t.record, 'questions', pos[1]);
    const a = T.makeEntry(pos.slice(2).join(' '));
    const wasBlocking = q.status === 'blocking';
    const flying = ['in_progress', 'review'].includes(t.status);
    // The worker went ahead with its recommendation: was the owner's answer that one?
    if (wasBlocking && flying && !opt.agrees && !opt.differs) {
      die(`${t.id} was built on the option the worker recommended for ${q.key}. Say which it is: --agrees (the owner chose that option; the ticket goes on to merge) or --differs (the owner chose otherwise; it goes back to its worker).`);
    }
    q.status = 'answered';
    q.sub.push(`→ ${[a.text, ...a.sub].join(' ')} (${who(opt)}, ${today()})`);
    B.log(board, t.id, 'answer', { key: q.key, agrees: opt.agrees ? true : opt.differs ? false : undefined });
    if (!wasBlocking || !flying) return `${t.id} ${q.key} answered.`;
    const st = B.getState(board, t.id);
    if (opt.differs) {
      if (t.status === 'review') B.moveFile(board, t, 'in_progress');
      B.setState(board, t.id, { mode: 'answered', answers: (st.answers || 0) + 1, passed: false, passedAt: null, needs: null, held: null });
      return `${t.id} ${q.key} answered differently from what was built: it is in in_progress again. Run \`${K()} next\` to resume its worker.`;
    }
    const left = openBlocking(t).map((x) => x.key);
    if (st.passed && !left.length) {
      B.setState(board, t.id, { held: null, passedAt: Date.now() });
      return `${t.id} ${q.key} answered as built: it joins the merge queue. Run \`${K()} next\`.`;
    }
    if (st.passed) B.setState(board, t.id, { held: HOLD(left) });
    return `${t.id} ${q.key} answered as built.${left.length ? ` Still open: ${left.join(', ')}.` : ''}`;
  });
}

// A ticket that passed with a question still open for the owner is held
// before it merges; nothing that cannot be undone reaches main unanswered.
export function holdReason(t) {
  const keys = openBlocking(t).map((q) => q.key);
  return keys.length ? HOLD(keys) : null;
}

export function assume(argv) {
  const { pos, opt } = parseArgs(argv);
  if (!opt.why) die('an assumption needs --why "<why this reading>" (and --undo "<what to change if it is wrong>")');
  edit(pos[0], (t, board) => {
    const sub = [`Why: ${opt.why}`];
    if (opt.undo) sub.push(`If wrong: ${opt.undo}`);
    const e = T.addKeyed(t.record, 'assumptions', 'unseen', pos.slice(1).join(' '), sub);
    B.log(board, t.id, 'assumption', { key: e.key });
    return `${t.id} ${e.key} recorded. Carry on as assumed.`;
  });
}

function settleAssumption(argv, status) {
  const { pos, opt } = parseArgs(argv);
  edit(pos[0], (t, board) => {
    const keys = pos[1] === 'all' ? t.record.assumptions.filter((a) => a.status === 'unseen').map((a) => a.key) : pos.slice(1);
    if (!keys.length) die('which assumption? give A1, A2 ... or "all"');
    for (const k of keys) {
      const a = T.findKeyed(t.record, 'assumptions', k);
      a.status = status;
      a.sub.push(`${status === 'confirmed' ? 'Confirmed' : 'Overturned'} by ${who(opt)}, ${today()}${opt.note ? `: ${opt.note}` : ''}`);
      B.log(board, t.id, 'assumption-' + status, { key: a.key });
    }
    const tail = status === 'overturned' && t.status === 'done'
      ? ` The ticket is done: create the follow-up with \`${K()} new "<title>" --related ${t.id}\`.`
      : '';
    return `${t.id}: ${keys.join(', ')} ${status}.${tail}`;
  });
}

export const confirm = (argv) => settleAssumption(argv, 'confirmed');
export const overturn = (argv) => settleAssumption(argv, 'overturned');

export function decide(argv) {
  const { pos } = parseArgs(argv);
  edit(pos[0], (t) => {
    t.record.decisions.push(T.makeEntry(pos.slice(1).join(' ')));
    return `${t.id}: decision recorded.`;
  });
}

export function check(argv) {
  const { pos } = parseArgs(argv);
  edit(pos[0], (t, board) => {
    const n = Number(pos[1]);
    const c = T.criteria(t.contract).find((x) => x.n === n);
    if (!c) die(`Done when has no item ${pos[1]}`);
    if (c.void) die(`item ${n} is void; there is nothing to tick`);
    if (c.owner) die(`item ${n} is the owner's to check. Write its steps instead: ${K()} manual ${t.id} ${n} "<steps, and what they should see>"`);
    const evidence = pos.slice(2).join(' ').trim();
    if (!evidence) die('say what you ran and what you saw: check <id> <n> "<evidence>"');
    if (evidence.length > 400) die('evidence is one or two lines: what you ran and what you saw');
    t.contract = T.setCriterion(t.contract, n, true);
    B.log(board, t.id, 'check', { n, evidence });
    return `${t.id}: item ${n} ticked.`;
  });
}

// Named `void_` because void is a reserved word.
export function void_(argv) {
  const { pos } = parseArgs(argv);
  edit(pos[0], (t, board) => {
    const n = Number(pos[1]);
    const reason = pos.slice(2).join(' ').replace(/\s+/g, ' ').trim();
    if (!reason) die('void <id> <n> "<the decision that made it pointless: Q2, or the owner\'s words and date>"');
    if (reason.length > 200) die('the reason is one line');
    t.contract = T.voidCriterion(t.contract, n, reason);
    B.log(board, t.id, 'void', { n, reason });
    return `${t.id}: item ${n} struck as void. The reviewer checks that the reason names a decision of the owner.`;
  });
}

export function uncheck(argv) {
  const { pos } = parseArgs(argv);
  edit(pos[0], (t, board) => {
    t.contract = T.setCriterion(t.contract, Number(pos[1]), false);
    B.log(board, t.id, 'uncheck', { n: Number(pos[1]) });
    return `${t.id}: item ${pos[1]} unticked.`;
  });
}

export function manual(argv) {
  const { pos, opt } = parseArgs(argv);
  const verb = pos[1];
  if (verb === 'ok' || verb === 'failed') {
    return edit(pos[0], (t, board) => {
      const m = T.findKeyed(t.record, 'manual', pos[2]);
      m.status = verb;
      m.sub.push(`${verb === 'ok' ? 'Checked' : 'Failed'} by ${who(opt)}, ${today()}${opt.note ? `: ${opt.note}` : ''}`);
      const n = Number(m.text.match(/^\(item (\d+)\)/)?.[1]);
      if (n && verb === 'ok') t.contract = T.setCriterion(t.contract, n, true);
      B.log(board, t.id, 'manual-' + verb, { key: m.key });
      return `${t.id} ${m.key}: ${verb}.${verb === 'failed' ? ` Create the follow-up: ${K()} new "<title>" --type bug --related ${t.id}` : ''}`;
    });
  }
  edit(pos[0], (t, board) => {
    const n = Number(verb);
    const c = T.criteria(t.contract).find((x) => x.n === n);
    if (!c) die(`usage: manual <id> <item number> "<steps>"  |  manual <id> ok|failed <M1>`);
    const old = t.record.manual.find((m) => m.text.startsWith(`(item ${n})`));
    const e = T.makeEntry(pos.slice(2).join(' '), 1800);
    if (old) {
      old.text = `(item ${n}) ${e.text}`;
      old.sub = e.sub;
      old.status = 'waiting';
      return `${t.id} ${old.key} rewritten.`;
    }
    const m = T.addKeyed(t.record, 'manual', 'waiting', `(item ${n}) ${pos.slice(2).join(' ')}`, [], 1800);
    B.log(board, t.id, 'manual', { key: m.key, n });
    return `${t.id} ${m.key} recorded for item ${n}: the owner checks it by hand; it does not hold the ticket.`;
  });
}

export function handoff(argv) {
  const { pos } = parseArgs(argv);
  edit(pos[0], (t) => {
    const text = pos.slice(1).join(' ').trim() || fs.readFileSync(0, 'utf8').trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    if (!words) die('the handoff is empty');
    if (words > 180) die(`the handoff is ${words} words; keep it to about 150: what changed, why, what must not break.`);
    t.record.handoff = text;
    return `${t.id}: handoff written (${words} words).`;
  });
}

export function followup(argv) {
  const { pos, opt } = parseArgs(argv);
  const verb = pos[1];
  if (verb === 'ticketed' || verb === 'declined') {
    return edit(pos[0], (t) => {
      const f = T.findKeyed(t.record, 'followups', pos[2]);
      f.status = verb;
      if (opt.as) f.sub.push(`→ ${opt.as}`);
      return `${t.id} ${f.key}: ${verb}.`;
    });
  }
  edit(pos[0], (t) => {
    const f = T.addKeyed(t.record, 'followups', 'open', pos.slice(1).join(' '));
    return `${t.id} ${f.key} recorded as a suggested follow-up.`;
  });
}

const LESSON_LIMIT = 60;

export function learn(argv) {
  const { pos } = parseArgs(argv);
  const board = B.openBoard();
  const text = pos.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) die('learn "<one line the next ticket should know>"');
  if (text.length > 240) die('a lesson is one line (240 characters at most)');
  B.withLock(board, 'board', () => {
    const file = path.join(board.dir, 'lessons.md');
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('- ')) : [];
    lines.push(`- ${text}`);
    const kept = lines.slice(-LESSON_LIMIT);
    fs.writeFileSync(file, `# Lessons\n\nWhat earlier tickets learned about this project. Newest last; k2 keeps the last ${LESSON_LIMIT}.\n\n${kept.join('\n')}\n`);
    console.log(`lesson recorded (${kept.length} kept)`);
  });
}

export function lessons(board) {
  const file = path.join(board.dir, 'lessons.md');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('- '));
}
