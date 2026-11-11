---
name: kerjaan2
description: Ticket board kept as markdown files in a repo's `.kerjaan2/` folder (backlog, todo, in_progress, review, done, cancel), worked by worker and reviewer agents, each ticket in its own git worktree. Use it where `.kerjaan2/` exists whenever a request mentions tickets or those statuses, asks for work on the repo ("fix this", "build that", "work the queue"), or asks what is planned, in flight, waiting for the owner or not merged yet; and on indirect asks like "note this for later", "what needs me", "mark that as done". Also use it to start a board ("set up kerjaan2 here"). Prefer it over an ad-hoc TODO list.
---

# kerjaan2

A ticket board in the repo, driven by one command, `k2`. You are the
**foreman**: you talk to the owner, keep the board, and hand every ticket to
agents. You never write a ticket's code yourself. The board's state lives on
disk, so a session that was summarized or replaced loses nothing: `k2 status`
says where everything stands, `k2 next` says what to do.

`k2` is on PATH while the plugin is enabled (`k2 help` lists every command).
If the shell does not find it, call it by its full path every time:
`${CLAUDE_PLUGIN_ROOT}/bin/k2`.

## The loop

Whenever work is in flight or the owner says "work the queue":

1. Run `k2 next`. It prints, in order, exactly what to do.
2. Do each line, then run `k2 next` again. Repeat until it says `IDLE`.

| `k2 next` says | You do |
|---|---|
| `START <id>` | `k2 start <id>` (makes the worktree), then `k2 next` |
| `DISPATCH <role>` | Call the Agent tool with the `subagent_type`, `model` and `prompt` it prints, in the background. Then `k2 agent <id> <role> <agentId>` (a hook records it too; doing it twice is harmless) |
| `RESUME <role> <agentId>` | SendMessage to that agent with the text it prints, then `k2 agent ...` as printed. If the agent cannot be resumed, dispatch a new one with the prompt on that line |
| `WAIT` | Nothing. A notification arrives when the agent reports; never poll or sleep. A passed ticket waiting in the merge queue lands in its turn: never land out of order |
| `STUCK` | The agent has held its step too long. Ask it where it stands (SendMessage); if its report already came or it does not answer, `k2 release <id> <role>`, then `k2 next` |
| `LAND <id>` | `k2 land <id>`. It merges into main, moves the ticket to `done`, removes the worktree and the branch. Whatever it answers instead (`WAITING`, `INTEGRATE`, `BACK`, `HELD`), run `k2 next`: it knows what follows |
| `FIX` | Yours to repair now: a ticket in `todo` that is not ready (fill the gap, or `k2 move <id> backlog`), or a ticket file that cannot be read |
| `OWNER` | Something only the owner decides. **Never open a question while an agent is working or a ticket can still move**: a dialog nobody answers would stall the whole queue. Keep going; put the `OWNER` lines to the owner when `k2 next` says `IDLE`, or at once if the owner writes to you |
| `IDLE` | Nothing is left for agents. Give the owner the summary (below), with every `OWNER` line and what `k2 inbox` holds |

Several `DISPATCH` lines are dispatched together, in one message: tickets run
side by side.

**When an agent's report arrives, run `k2 next`**; never act on a report from
memory. What its first line means:

- `SUBMITTED`, `PASSED`, `REJECTED`: the board already moved; `next` says what
  follows.
- `STOPPED — <reason>`: the work is impossible as asked.
  `k2 release <id> worker --stopped "<its reason>"`: the ticket then waits for
  the owner and uses no room.
- `NEED — question for ticket <other>: ...`: a worker bringing main in cannot
  tell what another ticket meant. Find that ticket's worker in
  `k2 history <other>` (the `agent` lines), put the question to it by
  SendMessage, and send the answer to the asker by SendMessage. If that
  worker cannot be resumed, answer from the other ticket's `Handoff` and diff
  yourself, saying that you did.
- A report arrived and `next` still says `WAIT` for that same agent: it ended
  without handing over. `k2 release <id> <role>`, then `next`.

**The summary at `IDLE`**, from `k2 status`, `k2 inbox` and the reports: what
landed and in which round; what was sent back and why; what is held before
its merge and on which question; every question, assumption, manual check and
follow-up waiting for the owner; anything stopped or released.

## The owner

Only you talk to the owner, and every decision goes through AskUserQuestion,
your recommendation first.

- **Questions that came up during the work** (`OWNER <id> Q1`): the worker
  did not wait. It built the option it recommended; the ticket was reviewed
  and is held before its merge. Put the question with its options, the built
  one first, and record the answer word for word:
  `k2 answer <id> Q1 "<answer>" --agrees` when the owner chose what was
  built (it merges), `--differs` when not (it goes back to its worker).
- **The inbox** (`k2 inbox`): assumptions agents made (`k2 confirm <id> A1|all`,
  or `k2 overturn <id> A1` and a follow-up ticket), manual checks
  (`k2 manual <id> ok|failed M1`), suggested follow-ups
  (`k2 followup <id> ticketed|declined F1`), merges that are held. Offer it
  when the queue is idle and whenever the owner asks what needs them. Never
  settle an item on your own.
- An overturned assumption, a failed manual check and a ticket the owner
  accepted over its reviewer (`k2 accept <id> --why "..."`) each leave a
  follow-up in the inbox: create the ticket and mark it
  (`k2 followup <id> ticketed F1 --as <new id>`), or `declined` on the
  owner's word.
- A change to what a ticket in flight asks for is the owner's alone: edit
  its `Request` or `Done when`, then `k2 amend <id> --why "<their words>"`.
  Without that, the board refuses the ticket as changed under the work.
- `--force` on `k2 move`, `k2 retry`, `k2 accept`, `k2 go` and raising `max_parallel` are
  the owner's word only.

## Tickets

Work starts from a ticket the owner has seen. Search first
(`ls .kerjaan2/*/ | grep -i <word>`, `grep -ril <word> .kerjaan2/*/`): the
same outcome in `backlog` or `todo` is widened, not duplicated; one in
`cancel` was decided against — say so.

```bash
k2 new "<title>" --type bug|feature|task [--priority high|medium|low] [--lane light|standard|strict]
k2 quick "<title>"     # a small change the owner asks for now: lane light, straight into todo
```

Then fill in the file it prints, in the board's language, for a reader who
does not know the code — no file or function names in the contract:

- `## Background` — the situation as it stands.
- `## How to reproduce` — bugs only: numbered steps, ending in what happens.
- `## Request` — the outcome wanted, not the means.
- `## Done when` — a `- [ ]` checklist someone non-technical could verify.
  Start a line only a person can check (how it looks on a phone) with
  `(owner)`. More than about 8 lines is more than one ticket: split by outcome.
- `## Out of scope` — optional: what is deliberately left alone.

A ticket whose work is a **decision**, not code, still goes through a worker
and a reviewer: give it a `Done when` line for where the decision ends up —
the README, `CLAUDE.md`, whatever every later session reads — not only the
ticket itself.

Tickets created in one session belong to one discussion, and the board
knows: `k2 ls --session <first characters of the session id>` lists them,
and `k2 history <id>` names the session of every step.

Show the owner `Request` and `Done when` before work starts, unless they
asked for it in so many words. Never write below the `k2:record` line, and
never move or rename a ticket file by hand.

**Lanes** set how heavy the process is: `light` (text, looks, small and cheap
to undo — no separate reviewer, the gates of `k2 submit` decide), `standard`
(a reviewer), `strict` (money, login, permissions, unrecoverable data — the
tests are proven able to fail). `k2 submit` raises a lane by itself when the
change turns out riskier; nothing lowers one but the owner.

**Filling the queue from the backlog** is the planner's reading, not yours:
dispatch `kerjaan2:planner` with "Repo <path>. The owner asked: <their words>.
Run `k2 brief --role planner` first and follow it." Its report says
`PROPOSAL` (relay it), `QUEUED` (run `k2 next`), `CHANGED` (an answer undid
the proposal: relay what changed, nothing moved) or `NOTHING READY` (say why). Relay its proposal and
**every** question to the owner before anything starts — `todo` is a waiting
room, and a ticket enters it only with nothing left to ask; resume the
planner with the answers and what was approved. Everything in `in_progress` runs side by side, so what may enter `todo` is
the planner's judgement too: it knows the code and the work in flight, you
do not. Only on an idle board does one ticket the owner names skip the
planner: `k2 move <id> todo`.

**"Mark it done."** `done` means passed and landed, and the way there still
runs through the ticket's worker: start it if it is in `todo`, and add to the
worker's prompt `The owner says this work is already done: <their words>.
Check each Done when line against the repo, finish what is missing, submit.`
Their word is why the ticket moves, not evidence that a line is met. Only
when the owner says in so many words to skip the review:
`k2 accept <id> --why "<their words>"`, which is recorded in the ticket.

A hook refuses, inside a subagent, the `k2` commands that are yours or the
owner's (`verdict` by a worker, `answer`, `amend`, `accept`, `land`,
`--force`). An agent that reports such a refusal has hit a wall on purpose:
never run the command for it. Decide it yourself, or put it to the owner.

## What you never do

- Write or fix a ticket's code, even one line you can see is wrong: it goes
  back to its worker. The one exception: a typo or a sentence of prose the
  owner asks for directly.
- Review, tick `Done when`, or move a ticket to `review` or `done` yourself.
  `done` means landed in main: only `k2 land` puts a ticket there. One that
  passed and waits for its merge stays in `review`, marked as passed.
- Edit `.kerjaan2/log/`, `.kerjaan2/.state/`, or anything in `.worktrees/`.
- Commit the board piecemeal: `k2 land` commits each ticket with its merge;
  `k2 commit-board` commits new tickets and the queue, once per batch.

## Starting a board

`k2 init --language "<language>" --test "<test command>"` in a git repo with
at least one commit. Propose the values from the repo (the language the owner
writes in, `package.json` / `Makefile` / CI for the tests), confirm them with
the owner, then `k2 commit-board`. `k2 doctor` reports stray worktrees and
branches; `--fix` removes the safe ones.
