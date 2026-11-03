# The question contract

English | [中文](question-contract.zh.md)

How a system asks an expert a question, and how that question reaches the inbox. This page defines the contract between the **asker** (system side, written per RCI system) and **ingestion**.

It describes the instance running in production, which is the reference for a new deployment. Numbers and names given as examples — the rate limit, the section headings — are that instance's choices, marked where they appear; the contract around them is not optional.

Question quality sets the ceiling for the whole chain. A question that says only "stuck, please advise" costs the expert ten rounds of chat before they know the site; a question carrying the full site gets a direction in the first reply. So the asker's main job is not asking — it is **turning the current state into material an outside expert can read**.

## Who asks

Two sources share one format and one rate limit:

| Source | Trigger | Typical implementation |
|---|---|---|
| **The working agent itself** | The agent judges that it is stuck | It writes a question file at an agreed path, for example `work/<task>/docs/EXPERT_QUESTION.json`; after collecting it the asker renames the file to `EXPERT_QUESTION.asked.<timestamp>.json` so the agent sees it was taken and does not re-ask |
| **Patrol judgement** | An external rule finds stalling, repeated failure, or a score that has not moved | The patrol posts the task to a board, and the asker turns newly posted entries into questions with `source.role` marking the patrol |

Letting the agent ask is worth far more than rule-based detection alone: it knows what it tried and which layer it is stuck at. It is also easier to abuse, which is why the asker enforces the rate limit.

**The asker runs as a scheduled job** — alongside a patrol every 30 minutes, say — not as a resident process. Every step must be idempotent so a crash and rerun produces no duplicate questions.

## Question fields

The asker appends one JSON line to `outbox.jsonl`:

```json
{"type": "question",
 "id": "<stable unique id>",
 "title": "one line stating what is being asked (<=500 chars, the inbox title)",
 "detail": "optional elaboration",
 "options": ["optional quick answers", "at most six"],
 "context": "## sectioned background material\n...",
 "source": {"system": "mysys", "op": "task-name", "round": 151, "role": "patrol-board"}}
```

| Field | Required | Constraints and use |
|---|---|---|
| `id` | Yes, in practice | The idempotence key. Re-ingesting the same id creates no second question, which makes a rewritten outbox, a lost read offset and a rerun asker all safe. Use `<task>-<content fingerprint>` so different questions about one task do not collide |
| `title` | Yes | A line with an empty title is dropped. It is all the expert sees in the inbox, so it must stand on its own |
| `detail` | No | Rendered under the title on the question card |
| `options` | No | Quick answers; one click sends one as a message. Offer them only when the answer really is an enumeration ("change direction / keep iterating / drop it"). On an open question, options narrow the expert |
| `context` | No, but this is the point | Background material; see the next section |
| `source` | Yes | Where the question belongs. It is both the sink routing key (`when` filters on `question.source.*`) and the injection target. At minimum `system`, plus whatever identifies the specific task |

The fields inside `source` are the system's own, but once chosen they are a contract: sink routing, receipt matching and per-source question cards all depend on them.

## Sectioning the context

`context` is Markdown split by `##` headings. The renderer turns each section into a collapsible card and prefixes one line of guidance matched on the heading.

The section order of a mature deployment (an operator-optimization fleet):

| Section | Content | Why it is there |
|---|---|---|
| `## Background` | The platform, the scoring rules, the vocabulary of outcomes | An outside expert does not know this system's words, and every number below rests on this section |
| `## The problem: <name>` | The task itself, its inputs and outputs | Establishes the shape of the problem first |
| `## Current design` | How it is implemented now and where it is stuck | Lead with the conclusion; not a line-by-line source dump |
| `## Current implementation structure` | File list, key constants, stage breakdown | The section that answers "how does the data flow, how is the work split" |
| `## Map of intermediate artifacts` | Where each kind of intermediate result lives in the workspace | Lets the expert dig in by following the map, or ask the resident agent to read it to them |
| `## Recent evaluations` | Passes over total cases, and the score, per round | Shows the trend, not a single point |
| `## Performance profile` | The latest successful performance run and its slowest cases | Locates which inputs are holding it back |
| `## Directions already tried` | Each direction, in plain language, with its outcome | **The most important section**: it stops the expert from recommending a route already disproven |
| `## What we would like your guidance on` | The actual question | The close. Everything above is material; this is the request |

Section headings are a convention, not free text: the renderer matches guidance by prefix. A new section registers its guidance line on the rendering side in the same change, or it falls back to generic text.

Hard requirements when writing these sections:

- **Translate the jargon.** Every direction in `## Directions already tried` carries a plain-language gloss, and the outcome vocabulary ("disproven", "confirmed in the cloud run", "incorrect results") is defined in `## Background`. The expert is a domain expert, not an expert in this system.
- **Give numbers their frame of reference.** "84.1" carries no information; "84.1 locally against 73.8 in the cloud run, with the reason local scores run high in the background section" does.
- **Truncate.** Cap each section, and when it overflows, point at the artifact map so the expert can have the resident agent read the rest. Background material is an orientation, not a dump.
- **Sanitize.** The asker strips secrets, tokens, access codes, references to internal mechanisms, and internal paths irrelevant to the expert before writing the line. This belongs in the asker, not in the resident agent's prompt, and the sanitization rules need unit tests.

## Rate limiting and deduplication

The asker carries three mechanisms itself, with state in its own file (for example `hitl/bridge_state.json`):

| Mechanism | Suggested value | Why |
|---|---|---|
| **Global rate limit** | At most 2 new questions per rolling hour across all sources | Expert attention is the scarcest resource in the loop. Once the inbox backs up, the whole channel stops working |
| **Per-task cooldown** | At least 6 hours before the same task asks again | One task should have at most one open question |
| **Content deduplication** | Task name plus title fingerprint | The same blocker reworded is not a new question |

A question over the limit is not dropped — it **stays where it is** for the next pass: the agent's question file is not renamed, the board entry is not marked handled. Nothing is lost; it is only deferred.

## Reaching the inbox

Two paths, both available, with `id` providing idempotence:

**Append to a file (preferred).** The system appends a line to `outbox.jsonl`. The backend polls the configured `sources` about every three seconds and records a read offset per file in `data_dir/sources.json`.

The file path has one decisive property: **it does not depend on the site being up**. The site can be upgrading, restarting or crashed, and the system still asks; ingestion catches up when the site returns. For a deployment that runs for weeks, that matters.

Polling details, each of which comes from a real failure:

- Process only up to the last newline and leave the remainder for its newline. Otherwise a half-written JSON object gets parsed.
- A file smaller than the recorded offset was rewritten: reset the offset and re-read, with `id` covering the duplicates.
- A line that fails to parse is skipped without aborting the rest of the file.
- The writing side flushes and `fsync`s; otherwise a crash loses questions that were already "delivered".

**Ask over HTTP.** `POST <base>/api/questions` with the service token and the same payload. Suitable for a system that can reach the site directly, and it skips the polling delay.

On ingestion the backend does three things: create a chat (titled from the first 40 characters of the question title), write `question.create`, and place one empty assistant message in the chat to carry the question card. Then it fires the notification.

## Notification

Every new question emails the experts: title, detail, who asked, and a button that opens that question's chat. The SMTP account and recipients come from the environment; the public site address comes from configuration.

The outcome lands in a `notify` event — whether it was sent and why it failed — not only in a log. "The expert says they never got the mail" happens, and it must be answerable.

Mail goes out for questions only, never for expert-initiated injections.

## Receipts

After the system injects an expert's position, it should tell the expert what it did with it. Receipts travel through the outbox too:

```json
{"type": "receipt", "question_id": "<the question id>", "status": "injected",
 "detail": "injected at ...; six parallel verification lanes opened; best so far ...; conclusion: ..."}
```

Or `POST <base>/api/questions/<id>/receipt` with the service token.

A receipt appends to that question's `insight.receipts` and the expert sees it in the original chat. A receipt whose `status` and `detail` both repeat an existing one is treated as a duplicate and not appended again.

**The receipt is the easiest part of the loop to skip and the least advisable one to skip.** Without it the expert is writing advice into a void. With it — "your direction is in, 2000 rounds later the cloud score is 75.9, still short of the baseline, adjust it if you like" — the expert keeps investing. Two tiers is a good minimum: an "accepted / injected" receipt at delivery, then periodic progress updates and a final outcome report when the work converges.
