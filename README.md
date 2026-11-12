# kerjaan2

A ticket board of markdown files inside your repo, worked by AI agents: every
ticket in its own git worktree, a process as heavy as the change is risky,
and one inbox for everything that waits for you.

It is a rewrite of [kerjaan](https://github.com/mirzaakhena/kerjaan) from what
that board taught over some 900 tickets. The design and its reasons are in
[`docs/blueprint.md`](docs/blueprint.md) (Indonesian).

Status: **stage 3 of 3** — the core (board, `k2`, skill, three agents, four
hooks), parallel work with a merge queue, and the viewer are built and being
tried on real tickets.

## The board

```
<repo>/
├── .kerjaan2/
│   ├── settings.yml     language, test command, lanes, models
│   ├── backlog/ todo/ in_progress/ review/ done/ cancel/     the folder is the status
│   ├── log/<id>.jsonl   machine trail per ticket
│   ├── queue.yml        the order of todo
│   ├── lessons.md       what earlier tickets learned
│   └── .state/          locks and agent IDs; ignored by git
└── .worktrees/<id>-<short-title>/     one per ticket in flight; ignored by git
```

A ticket is `<id> <title>.md`, the ID being its creation time
(`yymmddhhmmxx`). The top of the file is the **contract**, written by people:
`Background`, `Request`, `Done when`. Below a marker is the **record**, written
only by `k2`, in a fixed shape: `Questions`, `Assumptions`, `Decisions`,
`Manual checks`, `Handoff`, `Review`, `Follow-ups`.

## How a ticket moves

```
k2 start <id>      todo → in_progress; a worktree on branch k2/<id>-<title>
   the worker builds and commits there
k2 submit <id>     merges main in, runs the tests on the merged state, checks the gates
                   → review (the light lane counts as passed right there)
k2 verdict <id>    the reviewer: pass, or reject → back to the same worker
k2 land <id>       into main, one at a time → done; removes the worktree and the branch
```

- **`done` means landed in main.** A ticket that passed waits in `review`,
  marked as passed, until its merge. `k2 history <id>` prints its journey.
- **Three lanes.** `light`: no separate reviewer, the gates of `submit`
  decide. `standard`: a reviewer. `strict`: the tests are proven able to fail.
  `submit` raises a lane by itself when the change touches `strict_paths` or
  grows past `light_max_files`.
- **A merge queue.** Tickets land in the order they passed, one at a time;
  the front one keeps its turn until it is in main, so a ticket is brought up
  to date at most once.
- **Side by side by default.** Work and review run in parallel. When main
  moved, `land` merges and tests by itself; only a real conflict goes back to
  the ticket's worker, with the handoff of every ticket that landed meanwhile.
- **Doubt does not stop the queue.** What is cheap to undo becomes a recorded
  assumption; only a decision that cannot be undone blocks, and only its own
  ticket.
- **Nothing that waits for you gets lost.** `k2 inbox` lists open questions,
  unseen assumptions, manual checks, held merges and suggested follow-ups,
  computed from the board every time.
- **State is on disk.** `k2 next` tells the main session what to do; a session
  that was summarized or replaced picks up from `k2 status`.

`k2 help` lists every command.

## Tests and test data

- **`test_command` passes by its exit status alone**, so it must exit non-zero
  whenever a test did not run to its end. Options that force a runner to exit
  once it thinks it is done (`--test-force-exit`, `--forceExit`, `--exit`) can
  end a process before its results are out, and a run then passes with tests
  missing. Stop a hung test with a time limit instead.
- **Test runs take turns** across worktrees unless `parallel_tests: true`:
  worktrees separate files, not ports, local databases or fixed temp paths.
  A project whose tests choose those per worktree may run them at once. Each
  run, and `worktree_setup` / `worktree_teardown`, gets `K2_TICKET`,
  `K2_SLOT` (a small number unique per worktree in flight), `K2_WORKTREE` and
  `K2_MAIN_TREE` — `PORT=$((4000 + K2_SLOT))`, `app_test_$K2_SLOT`.
- **Each ticket carries its own test data.** Data a ticket owns is named after
  it; teardown removes only that, by its exact name, never by a pattern;
  shared data is read, never written.
- **Worktrees live inside the repo**, in `.worktrees/`, ignored by git.
  `node --test` and ripgrep skip that folder; a tool that walks hidden folders
  (plain `grep -r`, some test runners and linters) needs it excluded in its
  own configuration.

## Keeping the rules small

The text an agent reads — the skill, `roles/`, `agents/` — has a budget of
6,000 words, held by a test. A new rule names the rule it removes or
replaces; an incident is first a reason to sharpen a rule that exists.

## The viewer

```
k2 view [--port 4322] [--root <folder of projects>] [--lan]
```

Read-only pages for every board in the folder this repo sits in (or under
`--root`): a new board shows without a restart, and the pages follow the
board as it changes. Per project:

- **Control room**: what waits for you (questions, held merges, manual
  checks, new assumptions, anything stuck), every agent at work with its
  current step and test run, the merge queue, and what starts next.
- **Board**: the six columns, with a badge for each thing that waits for you.
- **History**: what landed per day, how long it took, how often it was
  rejected or had to bring main in.

A ticket opens as a drawer: its contract, its record, and its trail as a
timeline. The tab, the filters and the open ticket are in the address, so a
page can be bookmarked or sent.

The viewer never changes a board: everything is settled in a Claude session.
Without `--lan` it answers on `127.0.0.1` only. `--lan` opens it to your
network **without a password**: anyone there can read every ticket, every
agent command and the output of test runs, which may contain secrets. With
`--lan` it answers under this machine's own addresses and name only, so open
it by an address it prints.

An agent's current step is read from its transcript, whose place the plugin's
hook records when the agent is sent; outside Claude Code the viewer shows the
last line of the ticket's trail instead. Two themed mockups kept for a later
theme switch are in [`docs/mockups/`](docs/mockups/).

## Install

```
/plugin marketplace add /path/to/kerjaan2
/plugin install kerjaan2@kerjaan2
```

Then, in a git repo with at least one commit: ask Claude to "set up kerjaan2
here", or run `k2 init --language "<language>" --test "<test command>"`.

Needs Node 18+ and git 2.31+. No dependencies.

## Tests

```
node --test tests/*.test.mjs
```

Each test builds a throwaway repository and drives the real CLI against it.
