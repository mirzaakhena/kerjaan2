import { K2Error } from './util.mjs';
import * as board from './cmd-board.mjs';
import * as record from './cmd-record.mjs';
import * as work from './cmd-work.mjs';
import { hook } from './cmd-hook.mjs';
import { refusal, MAY } from './roles.mjs';
import * as B from './board.mjs';

const COMMANDS = {
  init: board.init,
  new: (a) => board.create(a),
  quick: (a) => board.create(a, { quick: true }),
  set: board.set,
  rename: board.rename,
  move: board.move,
  show: board.show,
  ls: board.ls,
  ready: board.ready,
  queue: board.queue,
  inbox: board.inbox,
  status: board.status,
  next: board.next,
  agent: board.agent,
  go: board.go,
  retry: board.retry,
  release: board.release,
  'commit-board': board.commitBoard,
  doctor: board.doctor,
  ask: record.ask,
  answer: record.answer,
  assume: record.assume,
  confirm: record.confirm,
  overturn: record.overturn,
  decide: record.decide,
  check: record.check,
  uncheck: record.uncheck,
  void: record.void_,
  manual: record.manual,
  handoff: record.handoff,
  followup: record.followup,
  learn: record.learn,
  start: work.start,
  brief: work.brief,
  test: work.test,
  submit: work.submit,
  verdict: work.verdict,
  land: work.land,
  accept: work.accept,
  amend: work.amend,
  history: work.history,
  hook,
  // The viewer is a server: it is loaded only when asked for, and it stays up.
  view: (a) => import('../viewer/server.mjs').then((m) => m.view(a)),
};

const HELP = `k2 — the kerjaan2 board. Run from anywhere inside the repo or one of its worktrees.

Board     init · new "<title>" [--type bug|feature|task] [--priority] [--lane] · quick "<title>"
          ls [status...] [--session <id>] · show <id> [--contract|--path] · history <id> · set <id> key=value... · rename <id> "<title>"
          move <id> <status> [--why "<reason>"] · status · inbox · doctor [--fix] · commit-board [-m]
Queue     ready [<id>...] · queue [show] · queue set <id>... [--goal "..."] [--pause-before <id>] · next
Work      start <id> · brief <id> --role worker|reviewer · brief --role planner · test <id> [--dir <path>] [-- <command>]
          submit <id> · verdict <id> pass|reject [--fail 2,3] --note "..." · land <id>
          agent <id> worker|reviewer <agentId> · release <id> [worker|reviewer] [--stopped "..."] · retry <id> · accept <id> --why "..." · amend <id> --why "..." · go <id>
Record    ask <id> [--blocking] "<question>" · answer <id> Q1 "<answer>"
          assume <id> "<assumption>" --why "..." [--undo "..."] · confirm|overturn <id> A1|all
          decide <id> "<decision>" · check <id> <n> "<evidence>" · uncheck <id> <n> · void <id> <n> "<decision>"
          manual <id> <n> "<steps>" · manual <id> ok|failed M1 · handoff <id> "<text>"
          followup <id> "<problem>" · followup <id> ticketed|declined F1 · learn "<one line>"
Viewer    view [--port 4322] [--root <folder of projects>] [--depth 1-3] [--lan]   (read-only pages for every board under the folder; --depth: how many levels down, 1 unless given)`;

export function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || rest.includes('--help') || cmd === '--help' || cmd === '-h') return console.log(HELP);
  const fn = COMMANDS[cmd];
  try {
    if (!fn) throw new K2Error(`unknown command "${cmd}". Run \`k2 help\`.`);
    // Inside a kerjaan2 subagent, the commands that belong to somebody else are refused.
    const role = process.env.K2_ROLE;
    if (role) {
      const why = refusal(role, cmd, rest);
      if (why) throw new K2Error(`${why}. Nothing was changed. If the ticket needs it, say so in your report: the foreman or the owner decides.`, 6);
      // A worker or reviewer writes only to the ticket it was sent for.
      const me = process.env.K2_AGENT;
      const writes = !['help', 'brief', 'show', 'ls', 'status', 'history', 'inbox', 'next', 'ready', 'test', 'learn'].includes(cmd);
      if (me && writes && ['worker', 'reviewer'].includes(role) && /^\d{4,12}$/.test(rest[0] || '')) {
        let owner = null;
        try {
          const board = B.openBoard();
          owner = B.getState(board, B.findTicket(board, rest[0]).id)[role]?.agent || null;
        } catch {}
        if (owner && owner !== me) throw new K2Error(`that ticket belongs to ${role} ${owner}, not to you (${me}). Nothing was changed.`, 6);
      }
    }
    const done = fn(rest);
    if (done && typeof done.catch === 'function') done.catch(fail);
  } catch (e) {
    fail(e);
  }
}

function fail(e) {
  if (!(e instanceof K2Error)) throw e;
  console.error(`k2: ${e.message}`);
  process.exitCode = e.code;
}
