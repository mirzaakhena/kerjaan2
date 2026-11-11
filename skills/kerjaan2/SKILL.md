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

```bash
command -v k2 >/dev/null || alias k2="${CLAUDE_PLUGIN_ROOT}/bin/k2"   # k2 is on PATH when the plugin is enabled
k2 help          # every command, one screen
```

## The loop

Whenever work is in flight or the owner says "work the queue":

1. Run `k2 next`. It prints, in order, exactly what to do.
2. Do each line, then run `k2 next` again. Repeat until it says `IDLE`.

| `k2 next` says | You do |
|---|---|
| `START <id>` | `k2 start <id>` (makes the worktree), then `k2 next` |
| `DISPATCH <role>` | Call the Agent tool with the `subagent_type`, `model` and `prompt` it prints, in the background. Then `k2 agent <id> <role> <agentId>` |
| `RESUME <role> <agentId>` | SendMessage to that agent with the text it prints, then `k2 agent ...` as printed. If the agent cannot be resumed, dispatch a new one |
| `WAIT` | Nothing. A notification arrives when the agent reports; never poll or sleep. A passed ticket waiting in the merge queue lands in its turn: never land out of order |
| `LAND <id>` | `k2 land <id>`. It merges into main, moves the ticket to `done`, removes the worktree and the branch |
| `OWNER` | Something only the owner decides. **Never open a question while an agent is working or a ticket can still move**: a dialog nobody answers would stall the whole queue. Keep going; put the `OWNER` lines to the owner when `k2 next` ends in `IDLE`, or at once if the owner writes to you |
| `IDLE` | Summarize for the owner; offer what `k2 inbox` holds |

Several `DISPATCH` lines are dispatched together, in one message: tickets run
side by side. When an agent's report arrives, run `k2 next`; never act on a
report from memory. A worker's `NEED — question for ticket <id>` goes to that
ticket's worker by SendMessage (its agent ID is in `k2 status`), and the
answer back to the asker.

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
Run `k2 brief --role planner` first and follow it." Relay its proposal and
**every** question to the owner before anything starts — `todo` is a waiting
room, and a ticket enters it only with nothing left to ask; resume the
planner with the answers and what was approved. One ticket the owner names needs no planner: `k2 move <id> todo`.

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
