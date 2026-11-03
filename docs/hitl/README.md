# Expert channel (HITL)

English | [中文](README.zh.md)

The expert channel is a site that runs beside an RCI system: an agent inside the running system asks a question on its own initiative, the question lands in an inbox, a human expert opens it and talks to a resident agent, and once the discussion settles the expert marks it resolved. A second agent extracts the expert's position, delivers it into the system, and the system reports back into the same chat what it did with it.

It is not a chat tool. It is a **closed loop**: the system asks, the expert answers, extraction structures the answer, delivery injects it, and a receipt closes it. Each step is an auditable event, and dropping any one of them breaks the chain.

An instance of this loop runs in production, and it is the reference: a new deployment reproduces the expert's experience and the backend path described here, and differs only in details. The decision rationale is in the [expert-channel Agent Note](../../.agents/notes/proposed/feature/2026-11-03-hitl-expert-channel.md).

| Document | What it answers |
|---|---|
| This page | The loop, who does what, the event model, deployment |
| [Question contract](question-contract.md) | Who asks, what a question contains, how context is sectioned, how it reaches the inbox |
| [Extraction and injection](extraction-and-injection.md) | What happens after "resolved": the extraction prompt, the JSON contract, delivery, receipts |
| [Creator mode](creator-mode.md) | An expert's sentence becomes a plugin; what the prompts and skills must change |
| [Deployment](deployment.md) | Where the provider key lives, how the model is pinned, and how the browser is left with no account surface |
| [Build prompt](build-prompt.md) | A prompt for an agent standing this up on one specific system |

## The loop

```
RCI workspace (the system runs here)
  │
  │ ① Ask: a stuck working agent produces a question; the asker collects,
  │    sanitizes, rate-limits and deduplicates it
  ▼
outbox.jsonl ──② ingest──▶ inbox ──③ chat──▶ expert ⇄ resident agent (read-only workspace)
                                              │
                                              │ ④ marked resolved
                                              ▼
                                       extractor agent (no tools, one discussion)
                                              │ insight{answer, points, open_questions}
                                              ▼
                                       ⑤ sink delivery ──▶ the RCI system
                                              │
                                              ◀── ⑥ receipt: what the system did with it
```

Steps ②③④⑥ are generic and belong to this system. Steps ①⑤ are **system-specific**: every RCI system writes its own asker and sink, and only has to honor the [question contract](question-contract.md) and the [delivery contract](extraction-and-injection.md).

## Three agents with non-overlapping jobs

| Role | Runs when | Tools | Its job |
|---|---|---|---|
| **Resident agent** | On every expert message | Read-only workspace: files, search, allowlisted commands | Explain what the system is doing and where the evidence is; help the expert state their answer precisely rather than agreeing with it |
| **Extractor agent** | When the expert marks a question resolved | None | Turn the expert's position in one discussion into structured JSON |
| **Creator agent** | When an expert wants a view of their own | Read-only workspace plus write access to one plugin directory | Build a HITL plugin from the expert's description, install it, hot-load it, hand it over for acceptance |

The resident agent keeps one harness session per chat, resumed on every message, so it retains what it has already read. The extractor starts fresh every time and sees only the discussion — its output enters the system and must not be colored by earlier context. The creator agent has its own session and its own permissions.

**The resident agent must stay skeptical.** What the expert writes gets injected into the system automatically, so there is no room for flattery here. Its prompt requires it to restate the expert's answer neutrally, check it against what the system measured, and state contradictions, costs and hidden assumptions as plainly as agreements; it asks only about ambiguity that changes what the system will do. The expert is the authority on facts the agent cannot see — their hardware, their measurements, their priorities — but that does not make every sentence correct.

## The event model

The whole system's truth is an append-only event log at `data_dir/events.jsonl`, replayed into memory at start. That single decision is what makes restart, backup and audit trivial.

Persisted events:

| Event | Payload | Meaning |
|---|---|---|
| `chat.create` | `{chat: {id, title, createdAt, questionId?, author?}}` | A new chat |
| `chat.update` | `{chatId, title?, session?}` | Retitle, or record the agent session this chat resumes |
| `message` | `{chatId, message: {id, role, content, createdAt, author?, questionId?, tools?, error?}}` | One message; a repeated id replaces |
| `question.create` | `{question: {...}}` | A question, or an expert-initiated injection |
| `question.status` | `{questionId, status, by?}` | Pending or resolved |
| `insight` | `{questionId, insight: {...}}` | Extraction result, delivery outcomes, receipts |
| `notify` | `{questionId, channel, to, ok, error?}` | Whether a new question's notification went out |
| `plugin.change` | `{plugin: {...}, action}` | A plugin installed, enabled, disabled or removed |

In-memory, SSE-only events that are never written: `delta` (streaming text) and `activity` (tool-call progress). They are process, not fact; the fact is the complete message that lands in the log.

**One server process per data directory.** Two would both ingest the sources and interleave the log. Hold an exclusive `flock` on `server.lock` and exit if it is taken.

## The three parts of a question page

An expert sees more than a chat box. A question page has three parts, and removing any one of them costs answer quality:

1. **The messages** — the resident agent's replies, the tool calls it made (collapsible), and the expert's own messages.
2. **The context bar on the right** — the `context` that arrived with the question, split on `##` into collapsible cards, each with one line of grey guidance telling the expert what the section is and how to read it. Open by default, width draggable and remembered. An outside expert does not read source; this bar is the only site they get.
3. **The action beside the composer** — "mark resolved" / "reopen" on a question chat, "inject" on a free chat. The action sits next to the input because it is the step after speaking.

Section titles come from the asker and the renderer matches guidance by title prefix. The convention is in the [question contract](question-contract.md).

## Two kinds of injection

| | Question injection | Expert-initiated injection |
|---|---|---|
| Who starts it | The system asks, the expert answers | The expert finishes a free chat and presses inject |
| Record | A `question`, in the inbox, with an email | A `question` with `kind: "inject"`, no inbox entry, no email |
| Extraction range | The whole discussion | The chat up to the click, **minus** what earlier injections of the same chat already carried |
| Target | The question's `source` | Targets the expert ticks (config `inject.targets`) |

Expert-initiated injection is the most valuable and most easily omitted part of the chain: the system cannot ask about what it did not think to ask, and experts should not have to wait to be asked. Both kinds share one extractor, one set of sinks and one receipt path.

## Deployment

```
RCI host
├─ the RCI system itself (its own processes and workspace)
│    ├─ asker (timer- or event-driven) ──▶ outbox.jsonl
│    └─ injector (invoked by a sink) ◀──── the expert's position
├─ HITL backend (single process)
│    ├─ source ingestion and the HTTP ask endpoint
│    ├─ the three agents
│    ├─ event log and SSE
│    └─ plugin registry and builds
└─ HITL frontend (static artifacts, served under a path of the main site)
```

The backend listens on loopback only and the main site reverse-proxies it at `base_path`. Experts log in with an access code kept in an HttpOnly cookie. The RCI system uses a service token for the ask and receipt endpoints.

**Permissions are a hard boundary, not a prompt instruction.** The resident agent runs read-only with secrets and the data directory denied; the creator agent's write access reaches one plugin directory. A prompt that says "do not edit files" does not count.

## Relationship to DeepSeek Harness

This system borrows the **architecture** of dsh. It does not use dsh as an agent — an agent is a harness plus a model, and dsh is the harness layer.

Borrowed:

- **Everything is a plugin.** The kernel implements the loop; every system-specific view, panel and board is a plugin, and adapting a deployment never means editing the kernel.
- **Manifest-declared composition.** A plugin declares the embedding points and the data it needs; configuration decides what is installed and who sees it.
- **Hot reload.** Installing takes effect immediately — no restart, no rebuild.
- **Creator mode.** A model can write, install and verify a plugin, and that act is revocable and requires approval.

Not borrowed: the Cordis dependency-injection runtime, the single-owner token model of `dsh web`, and the profile/bundle directory layout. The plugins here extend a human-facing site rather than an agent runtime, and their lifecycle and permission model differ accordingly.

dsh can host any of the three agents — see [creator mode](creator-mode.md), where it fits best, because it already carries plugin-development skills and scaffolding experience. The plugin format, however, is this system's own.
