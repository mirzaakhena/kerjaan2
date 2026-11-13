# kerjaan2

A Claude Code plugin: a ticket board of markdown files in a repo's
`.kerjaan2/` folder, worked by agents, each ticket in its own git worktree,
driven by one CLI, `k2`. A from-scratch rewrite of
`/Users/mirza/Workspace/kerjaan` (kept for reference; do not change it).

**Read before changing anything:**

- `docs/blueprint.md` — the design and every decision the owner made, in
  Indonesian, in the order they were made. A later section overrides an
  earlier one. Never undo a decision recorded there without asking the owner.
- `docs/handoff-viewer.md` — where the work stands after stage 3 (the viewer)
  and what is still open.

## Layout

- `bin/k2` → `core/run.mjs` → `core/cli.mjs`. `core/*.mjs` is the whole CLI:
  Node 18+, zero dependencies.
- `roles/*.md` — what agents are told, printed by `k2 brief`; blocks tagged
  `@@ <tag>` are chosen by lane and mode. `core/roles.mjs` — what each role
  may run.
- `skills/kerjaan2/SKILL.md` — the foreman (main session). `agents/*.md` —
  thin wrappers. `hooks/hooks.json` + `core/cmd-hook.mjs` + `bin/k2-guard` —
  four hooks.
- `viewer/` — `k2 view`: `server.mjs` (GET only, never writes),
  `snapshot.mjs` (what the pages show, computed with `core/`),
  `transcript.mjs` (the one module that knows Claude Code), `web/` (plain JS,
  CSS, the fonts). `web/space/` — the 3D shipyard page (`/p/<project>/space`):
  three.js and CC0 models are vendored there; `plan.js` says what the board
  means in the yard, `director.js` moves the tickets, `?demo` shows a made-up
  board. Its decisions and limits are the last section of the blueprint. `docs/mockups/` — the approved mockup and two themed ones
  kept for a later theme switch.
- `tests/k2.test.mjs`, `tests/viewer.test.mjs` — every test builds a throwaway
  repo and drives the real CLI; the viewer's start its server in the test
  process.

## Working rules here

- Tests: `node --test tests/*.test.mjs` (about three minutes). For a defect,
  write the test first and see it fail.
- The text agents read (`skills/`, `roles/`, `agents/`) has a budget of 6,000
  words, held by a test. A new rule names the rule it removes or replaces.
- Code, skill, roles and CLI messages are in English; ticket prose follows
  the board's `language`. Talk to the owner in Indonesian.
- Every release: bump `version` in `.claude-plugin/plugin.json`, one commit,
  never push. The owner runs `/plugin update kerjaan2` and opens a new session.
- kerjaan2 has a board of its own (`.kerjaan2/`, tickets in Indonesian): work
  here goes through tickets. The plugin that runs is the installed copy in the
  cache, not this source: a change takes effect after `/plugin update kerjaan2`
  and a new session.
- The owner's standing preferences: decisions are put as a multiple-choice
  question with the recommendation first; nothing is claimed as working that
  was not run; after a larger change an independent reviewer subagent checks
  it, and its report is relayed as it is before anything is fixed.
- The trial project is `/Users/mirza/Workspace/k2-akunting` (a small
  accounting CLI with a live `.kerjaan2/` board). Do not write to it except
  through a real session of its own.
