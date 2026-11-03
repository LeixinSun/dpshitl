# Extraction and injection

English | [中文](extraction-and-injection.zh.md)

What happens after an expert presses "mark resolved": an extractor agent turns the discussion into a structured position, the position is delivered to the system, and the system writes a receipt back.

This describes the instance running in production, which is the reference for a new deployment.

This is the only stretch of the chain where **model output enters a production system directly**, so its constraints are tighter than anywhere else: the output must be validated structure, failure must be visible, and delivery must be idempotent.

## The state machine

```
pending ──(expert marks resolved)──▶ extracting ──▶ ready ──▶ delivered
             ▲                            │           │
             │                            ▼           ▼
         (reopened)                     failed ◀── failed (every sink failed)
```

`insight.status` takes five values:

| Status | Meaning | What the expert sees |
|---|---|---|
| `extracting` | The extractor is running | The insight card shows extraction in progress |
| `ready` | Extraction succeeded, but no sink matched (or delivery has not run) | The insight content |
| `delivered` | At least one sink succeeded | The insight plus where it went |
| `failed` | Extraction failed, or every sink failed | The reason, with a retry |

Reopening returns the question to `pending` and the expert continues. Marking it resolved again **re-extracts**. That is necessary: after answering, experts routinely add one more direction, and that is a legitimate new delivery rather than a duplicate.

## The extractor agent

**No tools.** It reads only the discussion, never the workspace. Give it tools and it starts "verifying" the expert, mixing the system's material into the expert's position — and the expert's position is exactly what is being extracted here.

**A fresh session, no history.** Each extraction starts over.

**A cheaper model is fine.** Extraction is a constrained structured task and does not need the resident agent's tier. Configure it as an override (`extract_harness`) that changes only the model and inherits the rest.

### The prompt

Four constraints carry it; drop one and the output changes character:

1. **Only what the expert said counts.** Messages in the expert role, plus assistant statements the expert explicitly endorsed. The assistant's own background, speculation and suggestions do not count.
2. **Do not invent, do not soften.** Numbers and conditions survive verbatim. "Only worth it above shape 4096" must not become "worth it for large shapes".
3. **Do not grade.** What is extracted is the position, not a judgement of it.
4. **Use the language of the discussion.** A discussion held in Chinese extracts into Chinese.

### The output contract

Require exactly one JSON object:

```json
{"answered": true,
 "answer": "the expert's direct answer, 1-3 sentences",
 "points": [{"claim": "one position, fact or instruction of the expert",
             "rationale": "why, as they gave it (empty if they gave none)",
             "confidence": "high | medium | low (how firmly they said it)",
             "applies_to": "which part of the work it concerns"}],
 "open_questions": ["what the expert left open or said they did not know"],
 "summary": "one paragraph: the question and the expert's position"}
```

`points` is the most useful part of this structure. A paragraph of natural-language advice injected into a system still has to be taken apart by whichever agent reads it; `points` is already apart, each item carrying its rationale and confidence, so downstream can decide what to try first. `confidence` records **how firmly the expert stated it**, not the extractor's judgement.

`open_questions` matters just as much: "I am not sure the unified buffer is large enough on this hardware" is worth no less to the system than the parts the expert was sure about.

### Parsing and validation

The model will not always return JSON alone. Parse in order: the last ```json fenced block; failing that, scan the text and take the largest decodable JSON object.

Then validate, at minimum: `answer` is a string, `points` is an array, and every point has a non-empty `claim`.

On a validation failure, **hand the reason back to the model and let it correct once** — continue in the same session with "rejected: <reason>; reply with the corrected JSON object only". Retry once; if it still fails, mark the insight `failed` and put the reason in `insight.error` for the expert.

Do not fall back to treating the raw text as `answer`. A visible failure is better than unvalidated content entering the system.

### When the discussion has no expert message

Mark it `failed` with "no expert answer in this discussion yet". Do not let the extractor summarize a conversation in which only the assistant spoke.

## Extracting an expert-initiated injection

When an expert presses inject in a free chat, the same machinery runs with a different prompt and two extra inputs:

- `target` — the targets the expert ticked; each target produces its own injection record.
- `already_injected` — the `answer` and `points` summaries of earlier successful injections from the same chat and target.

How the prompt differs:

- What is extracted is **the experience, lessons, judgement and instructions the expert gave**, not an answer to a question.
- **Exclude** what the expert merely asked, and facts the assistant reported to them, unless the expert turned those into a judgement or an instruction.
- **Exclude** what `already_injected` already carried, unless the expert changed their position — then give the new version.
- If the chat holds nothing new to inject, return `answered: false`.

When `answered` is false or `points` is empty, nothing is delivered: mark it `failed` with "no new experience or guidance to inject found in this discussion (what has already been injected is not injected twice)". This is not an error but a normal outcome — the expert pressed inject while actually only asking questions.

An expert-initiated injection also carries `upTo`, the moment of the click, and extraction considers only messages before it. Otherwise an expert who keeps chatting after pressing inject makes the re-extraction range drift.

## Delivery

### The payload

Every sink receives the same payload:

```json
{"hitl": "<instance name>",
 "question": {"id", "title", "detail", "options", "context", "source", "status",
              "resolvedBy", "resolvedAt", "kind", "target", "..."},
 "insight": {"answered", "answer", "points", "open_questions", "summary"},
 "transcript": [{"role": "expert|assistant", "author", "content", "at"}]}
```

`insight` drops the delivery and status fields (`deliveries`, `receipts`, `status`, `error`) — those are this system's bookkeeping, not content for the system. The `transcript` goes in full, because some systems want the original words.

### Three sink types

| Type | Configuration | Behavior |
|---|---|---|
| `command` | `{"argv": [...], "cwd", "timeout_s"}` | The payload JSON arrives on stdin; a **non-zero exit marks the delivery failed** and the expert sees it |
| `jsonl` | `{"path": "..."}` | Appends one payload line |
| `webhook` | `{"url", "headers", "timeout_s"}` | POSTs the payload |

Each sink may carry `when`: a set of dotted paths into the payload mapped to required values, all of which must match. For example `{"question.source.system": "mysys"}`.

A `{dotted.path}` inside `argv` or `path` is substituted from the payload, which is how one deployment routes different tasks to different scripts or files. A substituted value must pass a character allowlist (`[\w.:@+-]+`) or the delivery is refused — these values end up on a command line.

Each sink's outcome is recorded separately: destination, success, detail and time. **One success makes the insight `delivered`**; only an all-failure result makes it `failed`.

### What the injector gets right

The script a `command` sink invokes is the system-side injector, and it decides how the expert's position actually takes effect. Lessons from a working deployment:

**Write where the system reads and its self-protection cannot reach.** A system that auto-reverts (to its last best version, say) reverts only its output directory; expert guidance must live outside that range or the next revert erases it. One mature approach writes into the task's notebook file (a `## Expert guidance` block in `docs/notes.md`) while reverts only touch `src/`.

**Match the system's existing advice contract.** If the system already has a format for injecting human advice, reuse it rather than inventing a second one — the downstream agent's prompt only recognizes one.

**The idempotence key is `question_id` plus a content hash, not `question_id`.** Keying on the question id alone swallows the legitimate second delivery after an expert adds a new direction. Hashing the content blocks only genuine repeats.

**Doing more is fine if it is explainable.** A mature deployment also pins that task to a stronger model, spawns a few parallel verification branches to try the expert's direction, and records an entry in both its ledger and its timeline. All of that is fine, provided every step reaches the receipt so the expert learns what their sentence set in motion.

**Questions with no task to belong to need a destination.** A question whose `source` names no task — one about the system as a whole — lands in a global knowledge file rather than being dropped silently.

## Failure must show

Every failure in this chain must be visible to the expert and retryable:

| Failure | What the expert sees | Retry |
|---|---|---|
| Extraction failed | The reason, in red, on the insight card | A re-extract button |
| Every sink failed | The failed destinations and their errors | Re-extract, which re-delivers |
| The resident agent failed to reply | The failure stated in the message | Send another message |

The cost of silent failure here is specific: the expert believes their advice reached the system, the system received nothing, and the expert is still waiting for a receipt.
