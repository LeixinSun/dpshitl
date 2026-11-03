# The build prompt

English | [中文](build-prompt.zh.md)

A prompt for an agent that must stand up the expert channel on one specific RCI system. Copy the block below, fill in the three bracketed facts, and give it to an agent with write access to both this repository and the target system.

It is written to resist the way this task usually fails: the agent reads a specification, believes it, and builds against embedding points and storage that do not exist. So the prompt makes discovery the first deliverable and forbids design until discovery is reported.

## What to fill in

| Placeholder | What goes there |
|---|---|
| `<SYSTEM>` | What the running system does, in two or three sentences: what it optimizes, what one unit of work is, how long a run lasts |
| `<WORKSPACE>` | Absolute path of the workspace the system runs in |
| `<HARNESS>` | Absolute path of this repository checkout |
| `<REFERENCE>` | How to reach the production instance — a host and two paths, or a checkout. The prompt's reading list assumes `<REFERENCE_UI>` is the site and `<REFERENCE_SYS>` its system-side integration |

## The prompt

```text
You are standing up an expert channel: a web interface where human experts
answer questions the running system's agents raise, and the answers return to
the system automatically.

THE SYSTEM
<SYSTEM>
Its workspace is <WORKSPACE>. The harness repository is <HARNESS>.

THE LOOP YOU ARE BUILDING
  ask → inbox → discuss → mark resolved → extract → inject → receipt
Each step is useless alone. A chat with no extraction leaves prose nobody
parses; extraction with no receipt leaves the expert writing into a void and
they stop answering within a week. Build the whole loop or say which part you
are deferring and why.

THE ARCHITECTURE IS ALREADY SETTLED
An instance of this loop is in production and is the reference. Match it in
these respects; the details are yours.

  - A question is a durable record, not a live wait. The system appends it to
    a file it owns; the site ingests that file on a timer and keeps its own
    append-only event log. This is what lets the system ask while the site is
    restarting, and lets a question outlive a restart on either side.
  - A question's id is the idempotence key, so re-ingesting a rewritten file
    creates nothing twice.
  - Each question opens a chat. The expert discusses it with a resident agent
    that reads the workspace read-only, then marks it resolved.
  - Marking resolved triggers a separate extractor agent over that one
    discussion, and its structured output is delivered to the system through
    a configured sink.
  - The system writes receipts back onto the question, and the expert sees
    them in the same chat.

Do NOT build questions on the harness's live pending-interaction mechanism
(`SessionPendingInteraction`, what the shipped Inbox page lists). It is the
tempting shortcut: it hands you an inbox and an answer card for free. It also
loses every waiting question when the Host restarts, and cannot accept a
question while the site is down — so it would give experts a different system
from the one in production. Read it in phase 1 to know what it does, then
build the durable record.

READ THESE FIRST, IN THIS ORDER

1. The production instance's system side — how questions are produced and
   how answers land:
     <REFERENCE_SYS>/tools/hitl_bridge.py    the asker: collects, sanitizes,
                                             rate-limits, writes receipts
     <REFERENCE_SYS>/tools/hitl_sink.py      the injector: where an expert's
                                             position is written, idempotence
     <REFERENCE_SYS>/hitl/instance.json      how the whole thing is configured
     <REFERENCE_SYS>/hitl/resident.md        the resident agent's prompt
     <REFERENCE_SYS>/hitl/outbox.jsonl       real questions and receipts; read
                                             the tail, this is the wire format

2. The production instance's site — the loop's own machinery:
     <REFERENCE_UI>/backend/hitl/store.py       the append-only event log
     <REFERENCE_UI>/backend/hitl/sources.py     ingesting the outbox, offsets
     <REFERENCE_UI>/backend/hitl/extract.py     extractor prompt, validation,
                                                sinks, delivery
     <REFERENCE_UI>/backend/hitl/agent.py       the resident agent
     <REFERENCE_UI>/backend/hitl/app.py         the HTTP and SSE surface
     <REFERENCE_UI>/frontend/src/pages/Inbox.tsx
     <REFERENCE_UI>/frontend/src/pages/Chat.tsx
     <REFERENCE_UI>/frontend/src/components/QuestionCard.tsx
     <REFERENCE_UI>/frontend/src/components/ContextBar.tsx
     <REFERENCE_UI>/frontend/src/components/contextSections.tsx
     <REFERENCE_UI>/frontend/src/components/InsightCard.tsx

3. Only then, the harness you are building on: <HARNESS>, starting from
   <HARNESS>/packages/client/AGENTS.md (binding) and the discovery items in
   phase 1.

4. Last, and as commentary rather than instruction:
   <HARNESS>/docs/hitl/. It describes the same loop in prose. Where it and
   the running code disagree, the running code is right — report the
   disagreement.

PHASE 1 — DISCOVERY. Produce a written report before any design.

Answer from the code and the running system, citing file paths:

  About the system
  1. Where does a unit of work keep its state, its history, and its notes?
     Name the exact files.
  2. How does the system currently decide something is stuck? If a human
     already looks at something to judge this, what do they look at?
  3. Where could an expert's guidance be written so the system's next round
     reads it? Does any mechanism (a revert, a reset, a regeneration) erase
     files in that location? Verify this rather than assuming.
  4. Does the system already accept human input anywhere? Reuse that format
     if so; a second format means the downstream agent's prompt knows only one
     of them.

  About the harness
  5. Run the web app and open it. List what exists already: the sidebar
     entries, the Inbox page, what the conversation offers.
  6. Read packages/client/ui-session/src/client/index.ts for
     SessionPendingInteraction and the status snapshot, and
     packages/client/ui-hitl-inbox/src/client/inbox-rows.ts for how the
     existing Inbox derives its rows. Report what the shipped Inbox already
     gives you and what it cannot do, so you know what you are replacing.
  7. Read packages/interaction/tool-ask-user/src/index.ts and
     packages/interaction/user-questions/src/index.ts. Report what
     mode: 'timed' changes, and what userQuestions.answer(agent, callId,
     answer) does to a question whose foreground window already closed.
  8. Find the extension points you would actually use, by reading the slot
     declarations in packages/client/*/src/client/. Report the exact slot
     names. Do not invent one; if nothing fits, say so.

  What this phase is for
  9. Map each part of the reference loop above onto what you found: which
     file the asker writes, which location survives the system's own resets,
     which existing human-input format to reuse. Name anything in the
     reference architecture that this system cannot support as written, and
     say what you would do instead.

Report findings. Stop. Wait for a decision.

PHASE 2 — THE ASKING END. The narrow end first, because it is where quality
is decided.

Write the asker in the system, not in the harness. It runs on a timer, is
idempotent under reruns, and for each question produces:
  - a stable id (task plus a content fingerprint), so re-ingestion is safe
  - a title that stands alone in an inbox list
  - context: the current state, written for a domain expert who does not know
    this system. Translate every internal term. Give every number its frame
    of reference. Include what has already been tried and ruled out — without
    it, experts recommend dead routes and stop trusting the channel.
  - sanitization: no keys, no tokens, no internal paths. Do this in the asker
    where it is testable, never in a prompt. Unit-test it.
  - a rate limit. Expert attention is the scarce resource; two questions an
    hour across all sources is a sane start. Over the limit, leave the
    question in place for the next pass rather than dropping it.

Show me three real questions this produces from the live system before
building any UI. If an outside expert cannot answer them from the context
alone, the asker is not done and no amount of interface will fix it.

PHASE 3 — THE UI. Only what phase 1 found. Follow
<HARNESS>/packages/client/AGENTS.md: it is binding, covering slots, props,
locale-owned copy, and the three registration surfaces a new package needs.
Do not restate copy in components; route it through a locale dictionary.

PHASE 4 — THE RETURN PATH.
  - Extraction runs with NO TOOLS, in a fresh session, over one discussion.
    Tools make it verify the expert against the system's own material, which
    is exactly the contamination to avoid. Output is validated JSON: the
    answer, the claims with rationale and confidence, what is still open. On
    a validation failure, hand the reason back and let it correct once, then
    fail visibly. Never fall back to treating raw text as the answer.
  - Injection writes where phase 1 question 3 established it survives.
    Idempotence keys on the question id plus a content hash, not the id
    alone: an expert who adds a direction after answering is making a
    legitimate second delivery.
  - Receipts go back into the question's own chat. Report what the system did
    and what came of it. This is the step that gets skipped and the one that
    decides whether experts keep answering.

RULES THROUGHOUT
  - Permissions are enforced, not requested. The agent answering experts is
    read-only by configuration. "Do not edit files" in a prompt is not a
    control.
  - Every failure is visible to the expert and retryable. An expert who
    believes their answer landed, while the system received nothing, is the
    worst state this system can be in.
  - Run the checks in <HARNESS>/packages/client/AGENTS.md before claiming
    done. Report only checks you actually ran, with their output.
  - When you find that the harness already does something this prompt
    describes differently, the harness wins. Tell me.
```

## Why it is shaped this way

**Running code first, prose last.** The reading order is deliberate: the production system side, its site, the harness being built on, and only then the prose in `docs/hitl/` — as commentary, not instruction. The failure this prevents is concrete: those pages once carried eight embedding points, a plugin manifest and a storage model, all designed before anyone read the harness, and the Inbox package built afterwards uses none of them. An agent that reads prose first builds the prose. Hence the standing rule: where running code and text disagree, the code wins and the disagreement gets reported.

**The asking end before the interface.** Question quality sets the ceiling for everything downstream. A question carrying the current state, the vocabulary, and the ruled-out directions gets a usable answer in one reply; "stuck, please advise" costs ten rounds and the expert stops opening the inbox. Three real questions is a cheap test of whether the hard part works.

**The architecture is given, not discovered.** A production instance of this loop already exists, so there is nothing to decide about question storage — only about how this system maps onto it. The prompt names the tempting shortcut (the harness's live pending-interaction mechanism) and rules it out explicitly, because an agent that finds the shipped Inbox page will otherwise build on it and hand experts a different system: one that forgets every waiting question when the Host restarts.

**Receipts called out twice.** It is the step with no immediate local reward, so it is the step that gets cut. Cutting it kills the loop slowly: experts answer, hear nothing, and stop.
