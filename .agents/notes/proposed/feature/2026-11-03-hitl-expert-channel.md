# Agent Note: Expert channel (HITL) for an RCI system

Status: proposed

English | [中文](2026-11-03-hitl-expert-channel.zh.md)

## Problem

An RCI system runs unattended for weeks: dozens of agent loops optimizing against an objective, each keeping its own workspace, notes and score history. The loops get stuck in ways no amount of extra rounds resolves, because what they lack is knowledge a human expert holds and the system cannot measure: what the hardware actually does, which direction is already known to be dead, what the team's priorities are.

Pulling that knowledge in requires a closed loop, not a chat window. A question must reach an expert with enough context that they can answer in one pass; the answer must come back as a structured position, not a transcript; the system must act on it; and the expert must learn what their answer caused, or they stop answering. Four parts, and omitting any one of them breaks the loop: a chat window with no extraction leaves prose nobody parses, and extraction with no receipt leaves the expert writing into a void.

A working deployment of that loop exists outside this repository. What it lacks is an architecture for the part experts ask for constantly: "can you show me this", "what does the profiling look like for those branches". Every such request is currently a code change by a developer, so most are never made, and the site stays generic while each RCI system's needs are specific.

## Proposal

Build the expert channel as an all-plugin site, borrowing this repository's architecture rather than running on top of it, and add a creator mode in which an expert's sentence becomes a plugin they can use the same minute.

The loop and its contracts are specified in [docs/hitl/](../../../../docs/hitl/README.md): the [question contract](../../../../docs/hitl/question-contract.md) between a system's asker and the inbox, [extraction and injection](../../../../docs/hitl/extraction-and-injection.md) for what happens after an expert resolves a question, and [creator mode](../../../../docs/hitl/creator-mode.md).

Three decisions carry the design.

**The kernel implements only the loop.** Question ingestion, chat, resolution, extraction, delivery and receipts are the kernel. Everything system-specific — every panel, view and board — is a plugin. A deployment adapts by writing an asker, a sink and a few data providers, never by editing the kernel. This is the one idea taken directly from this repository, and it is taken because the alternative has already been observed to fail: instance-specific panels compiled into the core UI make every deployment a fork.

**Plugins load at runtime, are visible per expert, and are revocable.** A build-time plugin list is incompatible with creator mode, whose entire value is that the expert gets the panel during the conversation in which they asked for it. Per-expert visibility is what keeps a hundred single-purpose panels from accumulating in everyone's home page, and revocability is what makes it safe to let a model write them.

**The three agents stay separate, with non-overlapping tools.** The resident agent answers experts with read-only access to the workspace. The extractor runs with no tools at all, on one discussion, in a fresh session — giving it tools makes it verify the expert against the system's own material, which is exactly the contamination the extraction must avoid. The creator agent writes only inside one plugin directory. These are permission boundaries, not prompt instructions.

The resident agent's prompt is also a design decision, not a detail. Its output feeds material that an expert then signs off on, and that signed-off position is injected automatically. A sycophantic resident agent therefore corrupts the system's input. The prompt requires it to restate neutrally, check the answer against measured evidence, state contradictions and costs as plainly as agreements, and ask only about ambiguity that changes what the system does.

## What this borrows, and what it does not

Borrowed: everything-is-a-plugin; manifest-declared composition; hot reload on install; and the creator-mode workflow discipline — inspect the real API first, start from a template, install through a manager, read whether the install took effect, verify against live state, keep the result persistent and undoable.

Not borrowed: the Cordis runtime and its dependency injection, the single-owner token auth of `dsh web`, and the profile/bundle directory layout. The plugins here extend a human-facing site, not an agent runtime; their lifecycle, permission model and audience all differ.

This repository's harness can host any of the three agents, and suits the creator agent best, since its plugin-development skill already encodes the workflow discipline above. What changes is the layer on top: the inspection tools become the embedding-point list and the data-provider samples, and the skill and templates become HITL ones.

## Alternatives considered

**Driving the loop through the built-in `ask_user_question` tool.** It is the obvious fit for "the agent asks a question" and it is wrong here. Its waiting state is lost when the process restarts, while a question in this system must survive weeks of restarts on both sides. Appending a line to a file the system owns also means the system can ask while the site is down, which a long-running deployment requires. The inbox's durable question record stays authoritative; the tool remains available for the creator agent's clarifying questions, which are short-lived by nature.

**Serving the experts from `dsh web` directly.** It is single-owner: one process token exchanged for one cookie, no accounts. The expert channel needs several named experts, per-expert plugin visibility, and an attribution trail on every answer that gets injected.

**Extracting with a tool-enabled agent, or falling back to raw text when validation fails.** Both let unvalidated or contaminated content into the system. Extraction fails loudly and visibly instead, with a retry the expert can press.

## Acceptance criteria

- Idempotence of ingestion: re-reading a rewritten source file, and re-posting a question id, produce no duplicate question.
- Partial-line safety: a source file written concurrently never yields a torn JSON object.
- Extraction rejects a response missing `answer` or with an empty `claim`, retries once with the reason, and marks the insight failed rather than substituting raw text.
- Re-resolving a question after the expert adds a new direction delivers again; re-resolving with unchanged content does not.
- An injection delivers only the guidance not carried by an earlier injection of the same chat and target.
- A plugin whose built output requests a data provider absent from its `dataNeeds` is refused at install.
- Provider parameters failing their declared pattern are rejected before reaching argv or a URL.
- A plugin that throws during render degrades to an error card without affecting other plugins.
- Every delivery failure, extraction failure and plugin change is visible to the expert and recorded in the event log.

## Risks

**Plugins written by a model execute in experts' browsers.** Private-by-default visibility and an explicit sharing step keep a bad plugin inside one person's view, but sharing is a real transfer of trust, and a shared plugin deserves a second pair of eyes. Install confirmation shows where a plugin appears and what it reads, not its code, because experts will not read code.

**Each data provider is a new read path into the RCI system.** Parameter patterns, caching and sanitization bound the exposure, but every provider added for one panel stays available to every later plugin.

**A wrong extraction is hard for the expert to catch.** A dropped condition or an inflated confidence reaches the system as the expert's own position. Receipts are the only mechanism that surfaces this, and only after the system has acted.

**Runtime plugin loading gives up build-time knowledge of what the UI contains.** The manifest and the `dataNeeds` check replace it; a deployment that disables those checks has neither.

**Creator mode can produce clutter instead of leverage.** Skipping the specification step yields plugins nobody opens twice. Retention, not the number of plugins generated, is the measure worth tracking.

**The loop depends on experts continuing to answer.** The rate limit protects their attention, and receipts are what make answering feel worthwhile; without them the channel decays into an ignored inbox while the system keeps asking.
