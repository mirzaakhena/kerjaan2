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
  let board;
  try {
    board = B.openBoard({ cwd: inp.cwd || process.cwd() });
  } catch (e) {
    // A board that exists but cannot be read (bad settings) is worth saying; no board is not.
    if (/problem|settings/.test(e.message || '')) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `kerjaan2: the board here cannot be read. ${e.message}` } }));
    return;
  }
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
      reason: `Ticket ${id} is still yours and not handed over. Finish it and run \`${k} submit ${id}\`. (If you are bringing main in and cannot tell what another ticket meant, you may end with your NEED line instead: the foreman brings you the answer.) A decision only the owner can make does not stop you: record it with \`${k} ask ${id} --blocking "<question; options; your recommendation>"\`, build the option you recommended, and submit. Only if the work is truly impossible, report STOPPED — <reason> in one line.`,
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
  // The ticket the message is about: named as "Ticket <id>", or the only ID in it.
  const ids = [...new Set(text.match(/\b\d{12}\b/g) || [])];
  const id = text.match(/\bTicket (\d{12})\b/i)?.[1] || (ids.length === 1 ? ids[0] : null);
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
    // The tool's own field first; its text only when the answer is plain text.
    const resp = inp.tool_response;
    if (resp && typeof resp === 'object') agentId = resp.agentId || resp.agent_id || null;
    else agentId = String(resp ?? '').match(/\bagentId: ([A-Za-z0-9_-]{6,})/)?.[1] || null;
  }
  if (!role || !agentId) return;
  B.withLock(board, 'board', () => bind(board, t, role, agentId));
}

// ----- the role guard -----
//
// k2 itself cannot tell who runs it. Claude Code can: a tool call made inside
// a subagent carries that agent's id and type. So this hook, before any Bash
// call that runs k2, refuses the commands that belong to somebody else: a
// worker cannot give a verdict, answer for the owner or land; a reviewer
// cannot touch the work; nobody but the main session speaks for the owner.

const READ = ['help', 'brief', 'show', 'ls', 'status', 'history', 'inbox', 'next', 'ready', 'test', 'hook'];
const MAY = {
  worker: [...READ, 'submit', 'check', 'uncheck', 'handoff', 'decide', 'assume', 'ask', 'learn', 'void', 'manual'],
  reviewer: [...READ, 'verdict', 'followup', 'learn'],
  planner: [...READ, 'new', 'set', 'rename', 'move', 'queue', 'ask', 'answer', 'assume', 'decide', 'commit-board', 'learn'],
  other: READ,
};

// Every k2 invocation in a shell command line: [{ cmd, args }]
export function k2Calls(line) {
  const calls = [];
  for (const part of String(line || '').split(/&&|\|\||[;|\n]|\$\(|`/)) {
    const m = part.match(/(?:^|[\s(])(?:[^\s"']*\/)?k2\s+([a-z][a-z-]*)(.*)$/);
    if (m) calls.push({ cmd: m[1], args: m[2].trim().split(/\s+/).filter(Boolean) });
  }
  return calls;
}

export function refusal(role, { cmd, args }) {
  const allowed = MAY[role] || MAY.other;
  const who = role === 'other' ? 'a subagent that is no kerjaan2 worker, reviewer or planner' : `the ${role}`;
  if (!allowed.includes(cmd)) return `\`k2 ${cmd}\` is not ${who}'s to run.`;
  if (args.includes('--force')) return `--force is the owner's word, given through the main session; it is not ${who}'s to pass.`;
  // The owner settles a manual check or a follow-up; a worker only writes the steps.
  if (cmd === 'manual' && ['ok', 'failed'].includes(args[1])) return 'a manual check is settled by the owner, through the main session.';
  if (cmd === 'followup' && ['ticketed', 'declined'].includes(args[1])) return 'a follow-up is settled by the owner, through the main session.';
  if (cmd === 'queue' && args[0] === 'set' && role !== 'planner') return 'the queue is the planner\'s to set.';
  if (cmd === 'move' && !['todo', 'backlog'].includes(args[1])) return `the planner moves tickets between backlog and todo only.`;
  if (cmd === 'set' && role === 'planner') return null;
  return null;
}

function guard(inp) {
  if (!inp.agent_id) return; // the main session: the foreman, who speaks for the owner
  if (inp.tool_name && inp.tool_name !== 'Bash') return;
  const calls = k2Calls(inp.tool_input?.command);
  if (!calls.length) return;
  if (!boardAt(inp.cwd)) return;
  const role = String(inp.agent_type || '').match(/^kerjaan2:(worker|reviewer|planner)$/)?.[1] || 'other';
  for (const call of calls) {
    const why = refusal(role, call);
    if (!why) continue;
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `kerjaan2: ${why} Nothing was run. If the ticket needs it, say so in your report; the foreman or the owner decides.`,
      },
    }));
    return;
  }
}

export function hook(argv) {
  try {
    const inp = input();
    if (argv[0] === 'session-start') sessionStart(inp);
    else if (argv[0] === 'subagent-stop') subagentStop(inp);
    else if (argv[0] === 'agent-sent') agentSent(inp);
    else if (argv[0] === 'guard') guard(inp);
  } catch {
    // never break the session
  }
}
