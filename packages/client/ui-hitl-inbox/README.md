---
description: "Expert inbox for the dsh web client: the sidebar Inbox panel lists every question the running agents are waiting on and opens the Session that asked it."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-hitl-inbox

English | [中文](README.zh.md)

## Summary

An expert working beside several running agents needs one place that answers "who is waiting on me". This package adds that place: the sidebar **Inbox** entry and the page it opens, listing every Session whose agent is currently waiting for an answer. Each row leads with the question, names the Session behind it, and opens that Session's conversation, where the asking domain owns the answer. The page navigates; it never answers on the conversation's behalf.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open **Inbox** in the sidebar. Each row shows the first question of one waiting request, the kind of answer wanted — a question, a plan review, or an approval — and the Session's display title; a Session the list has no row for is labelled untitled. A request carrying several questions shows how many. Clicking a row opens that Session, where its own composer card takes the answer. When no agent is waiting, the page says so.

A row appears and disappears with the pending interaction its own domain publishes, so answering a question in a conversation clears its row without the page polling anything.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The list is derived, not stored. `waitingRows()` folds the global Session status snapshot into one row per Session holding a `pendingInteraction`; a Session carries at most one highest-precedence pending request, so there is no per-Session grouping to do. The page registers into the root `main` keyed slot under the panel id `hitl-inbox`, and its sidebar entry registers into `sidebar.panellist` under the same id, which is how selecting the entry selects the page.

Pending-interaction carriers belong to the domain that raised the request. This package reads two optional fields off a carrier — the question list for the headline and the count — and names three kinds in its own copy. A kind it does not know still lists, with its Session and the generic question label, rather than being dropped: a new interaction domain must not make an expert's inbox silently incomplete.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these when the inbox is not enough. They move from the list to the domains that fill it.

- [ui-user-questions](../ui-user-questions/README.md) — raises the `question` and `plan-review` interactions and owns the card that answers them.
- [ui-approval](../ui-approval/README.md) — raises the `approval` interaction.
- [ui-session](../ui-session/README.md) — declares `SessionPendingInteraction` and publishes the status snapshot this page folds.
- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.panellist` and renders the entry.

-----

<a id="model-experience"></a>
## Model Experience

None, as listing pending interactions and navigating to a Session does not construct model input.

#### KV Cache effect

None; the domain that raised a question owns any subsequent model interaction.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These are current package constraints, not a task backlog.

- **Waiting questions only** — the page lists what is pending now. Questions already answered leave no row, so the inbox is not a history; a Session's own conversation holds its answered questions.
- **The browser's Sessions only** — a Session this browser has not listed contributes no row, so a question raised in a Session outside the current list stays invisible until that list covers it.
- **No durable question channel** — rows come from live pending interactions, so a question does not survive a Host restart that drops its wait. A question channel an external system can append to, and that outlives both sides, is specified in [docs/hitl](../../../docs/hitl/question-contract.md) and is not implemented here.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
