# kerjaan2

A ticket board of markdown files inside your repo, worked by AI agents: every
ticket in its own git worktree, a process as heavy as the change is risky,
and one inbox for everything that waits for you.

It is a rewrite of [kerjaan](https://github.com/mirzaakhena/kerjaan) from what
that board taught over some 900 tickets. The design and its reasons are in
[`docs/blueprint.md`](docs/blueprint.md) (Indonesian).

Status: **stage 1 of 3** — the core (board, `k2`, skill, three agents, two
hooks) works and is being tried on real tickets. The viewer is stage 3.

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
- **Side by side by default.** Whatever finishes first lands first. When main
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
