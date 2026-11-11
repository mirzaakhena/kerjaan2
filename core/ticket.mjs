// A ticket file has two zones. The contract (frontmatter and prose) is written
// by people. The record, below the marker, is written by k2 alone, in a fixed
// shape, so it can be read back without guessing at prose.
import { die } from './util.mjs';

export const MARK = '<!-- k2:record — written by k2 only; do not edit by hand -->';

export const FM_KEYS = ['type', 'priority', 'lane', 'solo', 'labels', 'blocked_by', 'related', 'touches', 'created'];
export const LIST_KEYS = ['labels', 'blocked_by', 'related', 'touches'];
export const ENUMS = {
  type: ['bug', 'feature', 'task'],
  priority: ['high', 'medium', 'low'],
  lane: ['light', 'standard', 'strict'],
};

// Record sections, in the order they are written.
export const SECTIONS = [
  { key: 'questions', title: 'Questions', prefix: 'Q', statuses: ['open', 'blocking', 'answered'] },
  { key: 'assumptions', title: 'Assumptions', prefix: 'A', statuses: ['unseen', 'confirmed', 'overturned'] },
  { key: 'decisions', title: 'Decisions' },
  { key: 'manual', title: 'Manual checks', prefix: 'M', statuses: ['waiting', 'ok', 'failed'] },
  { key: 'handoff', title: 'Handoff', text: true },
  { key: 'review', title: 'Review' },
  { key: 'followups', title: 'Follow-ups', prefix: 'F', statuses: ['open', 'ticketed', 'declined'] },
];

export function emptyRecord() {
  const r = {};
  for (const s of SECTIONS) r[s.key] = s.text ? '' : [];
  return r;
}

function parseValue(key, raw) {
  const v = raw.trim();
  if (LIST_KEYS.includes(key)) {
    const inner = v.replace(/^\[/, '').replace(/\]$/, '').trim();
    return inner ? inner.split(',').map((x) => x.trim()).filter(Boolean) : [];
  }
  return v;
}

export function parse(text) {
  text = text.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) die('ticket has no frontmatter');
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):(.*)$/);
    if (kv) fm[kv[1]] = parseValue(kv[1], kv[2].replace(/\s+#.*$/, ''));
  }
  for (const k of LIST_KEYS) fm[k] ||= [];
  if (fm.solo !== undefined) fm.solo = /^(true|yes|on)$/i.test(fm.solo) ? 'true' : 'false';
  const body = text.slice(m[0].length);
  const at = body.indexOf('<!-- k2:record');
  const contract = (at < 0 ? body : body.slice(0, at)).replace(/\s+$/, '') + '\n';
  const record = emptyRecord();
  if (at >= 0) parseRecord(body.slice(body.indexOf('\n', at) + 1), record);
  return { fm, contract, record };
}

function parseRecord(text, record) {
  let section = null;
  let entry = null;
  for (const line of text.split('\n')) {
    const h = line.match(/^## (.+)$/);
    if (h) {
      section = SECTIONS.find((s) => s.title === h[1].trim()) || null;
      entry = null;
      continue;
    }
    if (!section) continue;
    if (section.text) {
      record[section.key] += line + '\n';
      continue;
    }
    if (line.startsWith('- ')) {
      const keyed = section.prefix && line.match(/^- ([A-Z]\d+) \[(\w+)\] (.*)$/);
      entry = keyed
        ? { key: keyed[1], status: keyed[2], text: keyed[3], sub: [] }
        : { text: line.slice(2), sub: [] };
      record[section.key].push(entry);
    } else if (entry && line.startsWith('  ') && line.trim()) {
      entry.sub.push(line.slice(2));
    }
  }
  record.handoff = record.handoff.trim();
}

export function serialize({ fm, contract, record }) {
  const lines = ['---'];
  for (const k of FM_KEYS) {
    const v = fm[k];
    if (k === 'solo' && v !== 'true') continue; // written only when set
    lines.push(LIST_KEYS.includes(k) ? `${k}: [${(v || []).join(', ')}]` : `${k}: ${v ?? ''}`.trimEnd());
  }
  lines.push('---', '', contract.replace(/^\n+/, '').replace(/\s+$/, ''), '');
  const rec = [];
  for (const s of SECTIONS) {
    const v = record[s.key];
    if (s.text) {
      if (v && v.trim()) rec.push(`## ${s.title}`, v.trim(), '');
      continue;
    }
    if (!v.length) continue;
    rec.push(`## ${s.title}`);
    for (const e of v) {
      rec.push(e.key ? `- ${e.key} [${e.status}] ${e.text}` : `- ${e.text}`);
      for (const sub of e.sub || []) rec.push(`  ${sub}`);
    }
    rec.push('');
  }
  if (rec.length) lines.push(MARK, '', ...rec);
  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

// One entry is a head line plus short continuation lines.
export function makeEntry(text, limit = 700) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) die('the text is empty');
  if (lines.join(' ').length > limit) {
    die(`too long (${lines.join(' ').length} characters; the limit is ${limit}). The ticket holds a summary, never a log.`);
  }
  return { text: lines[0], sub: lines.slice(1) };
}

export function addKeyed(record, sectionKey, status, text, extraSub = [], limit) {
  const s = SECTIONS.find((x) => x.key === sectionKey);
  const n = record[sectionKey].reduce((max, e) => Math.max(max, Number(e.key?.slice(1)) || 0), 0) + 1;
  const e = makeEntry(text, limit);
  const entry = { key: `${s.prefix}${n}`, status, text: e.text, sub: [...e.sub, ...extraSub] };
  record[sectionKey].push(entry);
  return entry;
}

export function findKeyed(record, sectionKey, key) {
  const want = String(key).toUpperCase();
  const s = SECTIONS.find((x) => x.key === sectionKey);
  const full = /^\d+$/.test(want) ? `${s.prefix}${want}` : want;
  const e = record[sectionKey].find((x) => x.key === full);
  if (!e) die(`no ${full} in ${s.title}`);
  return e;
}

// ----- the contract -----

export function section(contract, title) {
  const re = new RegExp(`^## ${title}[ \\t]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
  const m = contract.match(re);
  return m ? m[1].trim() : null;
}

// One line of a checklist, however it was typed: "- [ ]", "* [x]", "1. [ ]",
// "- []", indented. A line the gate could not see would be a criterion
// nobody has to meet.
const BOX = /^\s*(?:[-*+]|\d+[.)])\s+\[( |x|X)?\]\s*(.*)$/;

// The Done when checklist: [{ n, done, owner, void, text }]
export function criteria(contract) {
  const body = section(contract, 'Done when') || '';
  const out = [];
  for (const line of body.split('\n')) {
    const m = line.match(BOX);
    if (m) out.push({ n: out.length + 1, done: !!m[1] && m[1] !== ' ', owner: /^\(owner\)/i.test(m[2].trim()), void: m[2].trim().startsWith('~~'), text: m[2].trim() });
  }
  return out;
}

function rewriteCriterion(contract, n, fn) {
  let seen = 0;
  let inside = false;
  let hit = false;
  const lines = contract.split('\n').map((line) => {
    if (/^## /.test(line)) inside = /^## Done when\s*$/.test(line);
    const m = inside && line.match(BOX);
    if (m && ++seen === n) {
      hit = true;
      return fn(m[2].trim(), !!m[1] && m[1] !== ' ');
    }
    return line;
  });
  if (!hit) die(`Done when has no item ${n}`);
  return lines.join('\n');
}

export const setCriterion = (contract, n, done) => rewriteCriterion(contract, n, (text) => `- [${done ? 'x' : ' '}] ${text}`);

// A criterion a later decision made pointless is struck, never deleted.
export function voidCriterion(contract, n, reason) {
  return rewriteCriterion(contract, n, (text) => {
    if (text.startsWith('~~')) die(`item ${n} is already void`);
    return `- [ ] ~~${text}~~ — void: ${reason}`;
  });
}

// What a ticket asks for, reduced to what must not change under the work:
// the Request and each criterion's wording. Ticks and void marks are left out.
export function contractText(contract) {
  const crit = criteria(contract).map((c) => c.text.replace(/^~~(.*?)~~ — void: .*$/, '$1').trim());
  return JSON.stringify([(section(contract, 'Request') || '').replace(/\s+/g, ' ').trim(), crit]);
}

export function template(type) {
  const parts = ['## Background', ''];
  if (type === 'bug') parts.push('## How to reproduce', '');
  parts.push('## Request', '', '## Done when', '');
  return parts.join('\n');
}
