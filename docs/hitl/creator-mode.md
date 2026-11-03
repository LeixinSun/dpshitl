# Creator mode

English | [中文](creator-mode.zh.md)

An expert says, mid-conversation, "can you show me this" or "I want to compare the profiling across those branches", and an agent writes them a plugin, installs it and hot-loads it. They use it immediately.

This is the one capability in the expert channel where a model **writes code that lands in a production interface**, and the easiest one to build as a toy. The three signs of a toy: the generated plugin does not run, its data is invented, or the expert looks at it once and never again. Most of this page is about avoiding those three.

## Why the prompts must change

Taking dsh's creator mode as-is does not work, and the reason is not capability but **audience**:

| | dsh creator mode | Expert-channel creator mode |
|---|---|---|
| Artifact | A Cordis bundle extending the agent runtime | A HITL plugin extending what an expert sees |
| How it learns the real API | `cordis_inspect_query` over services, events, tools | The embedding-point list plus **real response samples from data providers** |
| Where data comes from | In-process services | The read-only data plane |
| Who states the requirement | A developer, who describes a technical approach | A domain expert, who describes what they want to see |
| After install | Takes effect for every session | Visible only to them by default, and revocable |

The last two rows carry the difference. An expert will not write "a sidebar page reading the `fleet.op` provider, aggregated by lane, refreshed every 10 seconds"; they write "let me see how those branches are doing". So the creator agent's first job is not writing code — it is **turning a sentence into a specification**.

Three things therefore change: what the system prompt injects, the skill (workflow and templates), and the human-in-the-loop checkpoints.

## The creator agent's system prompt

Four blocks; each one missing breaks something specific:

### 1. Who it is and what it produces

It is building a self-service tool for a human expert, and the artifact is a HITL plugin. Two points carry weight: **smallest useful version first** (ship something visible, then iterate; do not build everything at once) and **the expert accepts it** (done means they find it useful, not that the build passed).

### 2. The embedding-point and manifest reference

Hand it the embedding points this deployment actually declares, read from the slot declarations in `packages/client/*/src/client/`, plus one hard rule: **the set of embedding points is closed**. No suitable embedding point means this request should not be solved with a plugin, and the agent should go back and say so.

### 3. The data plane, with a real response sample per provider

This is the most important block, and the easiest one to skimp on. Given only provider names and descriptions, the model will invent field names and render a panel full of `undefined`.

So the prompt — or a tool it must call first — carries a **real response sample** per provider:

```
fleet.overview — fleet summary, 10s cache
  GET /api/data/fleet.overview
  Sample (truncated): {"ops": [{"op": "nms", "best_score": 84.1, "cloud_score": 73.8,
                              "round": 2194, "phase": "optimize", "alive": true}, ...],
                      "totals": {"alive": 57, "submitted": 134}}
  Field meanings: best_score is the local evaluation score, cloud_score is the cloud
  measurement; the two use different scales — see the system map
```

With a matching hard rule: **fetch every provider you intend to use before writing render code**. Inferring meaning from a field name is forbidden.

### 4. A map of the RCI system

The creator agent shares the resident agent's system map: what the system does, what its stages are, where the key artifacts live, and which scale each number is on.

Without it, the agent can produce a table that runs, but not know which column matters or which two numbers must never sit side by side. The latter is exactly what the expert wants.

## Turning a sentence into a specification

The creator agent must have four things settled before it starts. Anything missing, it asks — through a question capability such as `ask_user_question`, asked once and completely, not dragged out:

| Must be settled | Example question | What goes wrong without it |
|---|---|---|
| **What to show** | "Do you want to see a trend at a glance, a ranking, or the detail of one task?" | A panel that piles up information and emphasizes nothing |
| **Which data** | "Is this the local evaluation score or the cloud measurement?" (with options) | The wrong scale, which makes every conclusion on the panel wrong |
| **When it refreshes** | "Should it follow the run live, or is a snapshot on open enough?" | Either a flattened downstream service or stale numbers |
| **Where it goes** | "Home page at a glance, its own sidebar page, or something you pull up inside a chat?" | It occupies the wrong position and becomes an annoyance after two uses |

**The resident agent should draft this first.** The expert raised the request inside a conversation, and the resident agent already knows which task they were discussing, which numbers they were looking at, and where it is stuck. Having it fill in the four items and hand the expert a draft to confirm is faster and more accurate than a creator agent asking four questions from scratch. This is where existing context pays off.

Once confirmed, the specification goes into the plugin manifest's `description` and `createdFrom` as a record.

## The workflow

```
Expert states the need in a chat
   │
   ├─ Resident agent drafts the spec (what / data / refresh / position) → expert confirms or edits
   │
   ▼
Creator agent (own session, write access limited to plugins/<id>/)
   1. List existing plugins and confirm this is not a duplicate — amend one if you can
   2. Fetch the providers it will use and look at the real responses
   3. Copy a template into plugins/<id>/, write the manifest and the component
   4. Build (ESM, react external)
   5. Self-check: build passes, only allowlisted APIs used, dataNeeds matches actual requests
   ▼
Install (expert confirms: which data it reads, where it appears)
   ▼
Hot load → the expert sees it immediately
   ▼
Expert accepts ──not satisfied──▶ back to the creator agent, same session, with their feedback
   │
   satisfied
   ▼
Keep (private) ──optionally──▶ share with all experts / delete
```

Why each checkpoint exists:

**Step 1, the duplicate check,** saves both money and screen space. Three experts each asking for a "progress panel" yields three near-identical panels stacked on the home page. The creator agent reads the existing plugins' `description` first and amends where it can.

**Step 2, fetching the data,** is the only effective defense against invented fields.

**Step 5's "dataNeeds matches actual requests"** must be mechanically checkable: every `/api/data/<x>` appearing in the built output has to be declared in the manifest. A plugin whose declaration and behavior disagree is not installed.

**Install requires the expert's confirmation,** and the confirmation screen shows three things rather than code: where it appears, which data it reads, and who built it. Experts do not read code.

**Iteration stays in the same session,** so the creator agent remembers what it just wrote. The feedback is usually "this number is wrong" or "can you group it by lane", not a restatement of the requirement.

## Hard rules for the skill

Write these into the creator agent's skill, replacing dsh's `cordis-plugin-development` while keeping its discipline — inspect the real API before writing, start from a template, read the install result, verify after installing:

- **Look at real data before writing render code.** Never infer meaning from a field name.
- **Use the data plane only.** No filesystem reads, no command execution, no connections to anything but the backend. A plugin runs in a browser; those three channels are all it has.
- **The first version is small.** One view, one data source, something visible. The feedback an expert gives after seeing a real artifact is far better than their advance description.
- **Render must survive bad data.** Missing data, absent fields and empty arrays each need an explicit empty state. Never blank, and never pretend there is data.
- **Never display secrets or internal paths.** The same sanitization rules as background material.
- **Declaration equals behavior.** `dataNeeds` lists exactly what it may request.
- **It does not edit the kernel.** Write access covers `plugins/<id>/` only; a need for a new embedding point stops the work and is reported for a human to act on.
- **Verify your own work**: render once with real data and restate the key numbers to the expert for a sanity check. A passing build is not evidence of correctness.

The skill ships **copyable templates**, at least three: a home panel, a sidebar page and a widget. Each template contains the manifest, a component skeleton, the data request with its empty state, and the build configuration. Starting from a template produces an order of magnitude fewer mistakes than starting from nothing.

## Permissions and revocability

| Boundary | Rule |
|---|---|
| Write access | `plugins/<id>/` only. The RCI workspace is read-only and kernel code is not writable |
| Execution | Builds run in a restricted environment with no network |
| Install | Every install needs the expert's explicit confirmation, covering that install only |
| Runtime | A plugin has three read-only channels, bounded by `dataNeeds` |
| Revocation | Deletion moves to a recycle location and is recoverable; every step lands in the event log |

**An installed plugin executes in an expert's browser**, which makes this a real trust boundary: a creator agent talked into writing bad code produces an artifact that runs in someone else's browser. `visibility` defaulting to `private`, and sharing being an explicit action, are the main protections on that boundary. A second pair of eyes before sharing is worth the minute it costs.

## Using dsh as the creator agent's harness

dsh suits the creator agent: its creator mode already carries the full discipline of "inspect the API, copy a template into a working directory, install, hot-load, read the install result, verify", and that discipline transfers to HITL plugins essentially unchanged.

What gets replaced is the layer above:

| dsh's | Becomes |
|---|---|
| `cordis_inspect_*` over Cordis services, events and tools | The HITL embedding points plus data-provider samples |
| The `cordis-plugin-development` skill and templates | The HITL plugin skill and templates |
| `plugin_manager install_bundle` into a dsh profile | Installation into the HITL plugin registry |
| Install approval through dsh's approval chain | The expert's confirmation in the interface |

What is kept: starting from a template, reading whether the install took effect, verifying against real data afterwards, and keeping the artifact persistent and undoable. dsh's experimental personalized-recommendation path — a background subagent that generates a plugin, validates it, installs it, with undo and restore — is a working template for this model.

## How to tell it is working

Three numbers, looked at a month later:

1. **Retention**: of the plugins generated, how many are still being opened a week later. A low number means the specification step did not ask enough, and what got built is not what the expert wanted.
2. **First-version acceptance**: the share accepted on install without iteration. A low number usually means the data samples were too thin.
3. **Expert-initiated requests**: how often an expert asks for another one. This is the only honest signal that the whole thing is worth having.

Do not track the total number of plugins generated.
