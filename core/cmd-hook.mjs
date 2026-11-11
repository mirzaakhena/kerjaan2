// Hook handlers for the Claude Code adapter. Each reads the hook's JSON on
// stdin and answers on stdout. A hook never fails the session: any error
// here ends quietly.
import fs from 'node:fs';
import path from 'node:path';
import * as B from './board.mjs';
import { nextActions, inboxItems, bind } from './cmd-board.mjs';

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
  const live = actions.filter((a) => !a.startsWith('START') && !a.startsWith('OWNER'));
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
  if (!/^(kerjaan2:)?worker$/.test(inp.agent_type || '')) return;
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
    const mine = t.status === 'in_progress' || (t.status === 'review' && st.passed && st.needs === 'worker');
    if (!mine) return;
    if (inp.stop_hook_active) {
      // Told once already and it ends all the same: say so on the board, so
      // `next` sends somebody instead of waiting for a report that is not coming.
      B.setState(board, id, { worker: { ...st.worker, ended: true } });
      return;
    }
    const k = B.k2Name();
    console.log(JSON.stringify({
      decision: 'block',
      reason: `Ticket ${id} is still yours and not handed over. Finish it and run \`${k} submit ${id}\`. A decision only the owner can make does not stop you: record it with \`${k} ask ${id} --blocking "<question; options; your recommendation>"\`, build the option you recommended, and submit. Only if the work is truly impossible, report STOPPED — <reason> in one line.`,
    }));
    return;
  }
}

// The foreman is told to record each agent with `k2 agent`. This does it for
// it the moment the agent is sent or resumed, so a forgotten step cannot put
// a second worker into the same worktree.
function agentSent(inp) {
  const board = boardAt(inp.cwd);
  if (!board) return;
  const ti = inp.tool_input || {};
  const text = String(ti.prompt || ti.message || '');
  const id = text.match(/\b\d{12}\b/)?.[0];
  if (!id) return;
  let t;
  try {
    t = B.load(B.findTicket(board, id));
  } catch {
    return;
  }
  if (!['in_progress', 'review'].includes(t.status)) return;
  const st = B.getState(board, t.id);
  let role = null;
  let agentId = null;
  if (inp.tool_name === 'SendMessage') {
    agentId = String(ti.to || '');
    role = ['worker', 'reviewer'].find((r) => st[r]?.agent === agentId) || null;
  } else {
    role = String(ti.subagent_type || '').match(/^kerjaan2:(worker|reviewer)$/)?.[1] || null;
    const resp = typeof inp.tool_response === 'string' ? inp.tool_response : JSON.stringify(inp.tool_response ?? '');
    agentId = resp.match(/agent[_ ]?id\\?["':\s]+([A-Za-z0-9_-]{6,})/i)?.[1] || null;
  }
  if (!role || !agentId) return;
  B.withLock(board, 'board', () => bind(board, t, role, agentId));
}

export function hook(argv) {
  try {
    const inp = input();
    if (argv[0] === 'session-start') sessionStart(inp);
    else if (argv[0] === 'subagent-stop') subagentStop(inp);
    else if (argv[0] === 'agent-sent') agentSent(inp);
  } catch {
    // never break the session
  }
}
