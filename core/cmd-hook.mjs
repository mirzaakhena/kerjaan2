// Hook handlers for the Claude Code adapter. Each reads the hook's JSON on
// stdin and answers on stdout. A hook never fails the session: any error
// here ends quietly.
import fs from 'node:fs';
import path from 'node:path';
import * as B from './board.mjs';
import { nextActions, inboxItems } from './cmd-board.mjs';

function input() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function boardAt(cwd) {
  try {
    return B.openBoard({ cwd: cwd || process.cwd() });
  } catch {
    return null;
  }
}

// What a session needs to know when it starts, resumes, or was just summarized:
// the work in flight and its agents live on disk, not in anyone's memory.
function sessionStart(inp) {
  const board = boardAt(inp.cwd);
  if (!board) return;
  const actions = nextActions(board);
  const inbox = inboxItems(board);
  const live = actions.filter((a) => !a.startsWith('START'));
  if (!live.length && !inbox.length) return;
  const k = B.k2Name();
  const text = [
    `kerjaan2 board at ${board.dir}: work is in flight or waits for the owner. You are the foreman (skill kerjaan2).`,
    ...(live.length ? ['What to do next, from the board itself:', ...live] : []),
    ...(inbox.length ? [`${inbox.length} item(s) wait for the owner: run \`${k} inbox\` and put them to the owner.`] : []),
    `Run \`${k} status\` for the full picture before starting anything new.`,
  ].join('\n');
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
}

// A worker that stops with its ticket neither handed over nor waiting on a
// recorded question looks finished to the foreman and is not.
function subagentStop(inp) {
  if (inp.stop_hook_active) return;
  if (!/worker/.test(inp.agent_type || '')) return;
  const board = boardAt(inp.cwd);
  if (!board) return;
  const dir = path.join(board.state, 'tickets');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const id = f.replace(/\.json$/, '');
    const st = B.getState(board, id);
    if (st.worker?.agent !== inp.agent_id) continue;
    let t;
    try {
      t = B.load(B.findTicket(board, id));
    } catch {
      return;
    }
    const waiting = t.record.questions.some((q) => q.status === 'blocking');
    const mine = t.status === 'in_progress' || (t.status === 'done' && st.needs === 'worker');
    if (!mine || waiting) return;
    const k = B.k2Name();
    console.log(JSON.stringify({
      decision: 'block',
      reason: `Ticket ${id} is still yours and not handed over. Finish it and run \`${k} submit ${id}\`; or, if a decision only the owner can make stops you, record it with \`${k} ask ${id} --blocking "<question>"\` and report STOPPED. If something else makes it impossible, report STOPPED — <reason> in one line.`,
    }));
    return;
  }
}

export function hook(argv) {
  try {
    const inp = input();
    if (argv[0] === 'session-start') sessionStart(inp);
    else if (argv[0] === 'subagent-stop') subagentStop(inp);
  } catch {
    // never break the session
  }
}
