// The one place the viewer knows about Claude Code: an agent's transcript is
// a file of JSON lines, and the last tool call in it is what the agent is
// doing now. Where the file is was recorded when the agent was sent
// (`core/cmd-hook.mjs`); with no record, or a file of another shape, this
// answers null and the viewer shows the ticket's trail instead.
import fs from 'node:fs';
import path from 'node:path';

const TAIL = 256 * 1024;
const short = (s, n) => {
  const one = String(s || '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

function describe(name, input = {}) {
  if (typeof input.description === 'string' && input.description.trim()) return short(input.description, 160);
  if (name === 'Bash') return short(input.command, 120);
  if (input.file_path) return `${name} ${path.basename(String(input.file_path))}`;
  if (input.pattern) return `${name} "${short(input.pattern, 60)}"`;
  return name;
}

// { step, command, at } of the last tool call made after `since` (ms), or null.
export function lastStep(file, since = 0) {
  if (!file) return null;
  let text;
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(Math.min(size, TAIL));
    fs.readSync(fd, buf, 0, buf.length, size - buf.length);
    fs.closeSync(fd);
    text = buf.toString('utf8');
  } catch {
    return null;
  }
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"tool_use"')) continue;
    let rec;
    try {
      rec = JSON.parse(lines[i]);
    } catch {
      continue; // the first line of a tail is usually cut in half
    }
    const content = rec?.message?.content;
    if (rec?.type !== 'assistant' || !Array.isArray(content)) continue;
    const use = [...content].reverse().find((c) => c?.type === 'tool_use');
    if (!use) continue;
    const at = rec.timestamp ? new Date(rec.timestamp).getTime() : null;
    if (since && at && at < since - 1000) return null; // a step of an earlier dispatch is not this one's
    return { step: describe(use.name, use.input), command: use.name === 'Bash' ? short(use.input?.command, 300) : null, at };
  }
  return null;
}
