// What each kind of agent may run. The role reaches k2 through its
// environment (K2_ROLE, set by the plugin's hook for every command a kerjaan2
// subagent runs); with none set, the caller is the main session or a person,
// and nothing is refused. Decided on k2's real arguments, never on a guess at
// a shell command line.
import { parseArgs } from './util.mjs';

const READ = ['help', 'brief', 'show', 'ls', 'status', 'history', 'inbox', 'next', 'ready', 'test'];

export const MAY = {
  worker: [...READ, 'submit', 'check', 'uncheck', 'handoff', 'decide', 'assume', 'ask', 'learn', 'void', 'manual'],
  reviewer: [...READ, 'verdict', 'followup', 'learn'],
  planner: [...READ, 'new', 'set', 'rename', 'move', 'queue', 'ask', 'answer', 'assume', 'decide', 'commit-board', 'learn'],
};

// Why this role may not run this command, or null.
export function refusal(role, cmd, argv) {
  const allowed = MAY[role];
  if (!allowed) return `unknown role "${role}"`;
  if (!allowed.includes(cmd)) return `\`k2 ${cmd}\` is not the ${role}'s to run`;
  let pos = [];
  let opt = {};
  try {
    ({ pos, opt } = parseArgs(argv));
  } catch {
    return null; // the command itself will say what is wrong with its arguments
  }
  if (opt.force) return `--force is the owner's word, given through the main session; it is not the ${role}'s to pass`;
  if (opt.by) return `--by names who decided; the ${role} does not speak for anybody else`;
  if (cmd === 'manual' && ['ok', 'failed'].includes(pos[1])) return 'a manual check is settled by the owner, through the main session';
  if (cmd === 'followup' && ['ticketed', 'declined'].includes(pos[1])) return 'a follow-up is settled by the owner, through the main session';
  if (cmd === 'move' && !['todo', 'backlog'].includes(pos[1])) return 'the planner moves tickets between backlog and todo only';
  return null;
}
