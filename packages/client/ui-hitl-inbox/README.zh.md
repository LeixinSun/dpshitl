---
description: "dsh Web 客户端的专家收件箱：侧边栏「收件箱」页列出正在运行的 Agent 等待回答的每一个问题，并打开提问的那个 Session。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-hitl-inbox

[English](README.md) | 中文

## 概述

一位专家同时盯着好几个在跑的 Agent 时，需要一个地方回答「谁在等我」。本包提供这个地方：侧边栏的**收件箱**入口，以及它打开的页面，列出当前正在等待回答的每一个 Session。每一行以问题本身开头，标明它属于哪个 Session，点击进入该 Session 的对话——回答由提问的那个域自己承接。这个页面只做跳转，不代替对话回答。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在侧边栏打开**收件箱**。每一行显示一个等待中请求的第一个问题、想要哪一类回答（提问、方案确认或待批准），以及该 Session 的显示标题；列表里没有对应行的 Session 标为未命名。一个请求带多个问题时会显示数量。点击一行进入该 Session，由它自己的输入卡片承接回答。没有 Agent 在等待时，页面会说明这一点。

行的出现与消失跟随各自域发布的 pending interaction，所以在对话里回答完一个问题，它的行会自动消失，页面不做任何轮询。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点击展开</summary>

列表是推导出来的，不是存下来的。`waitingRows()` 把全局 Session 状态快照折叠成「每个持有 `pendingInteraction` 的 Session 一行」；一个 Session 至多持有一个优先级最高的等待请求，所以不存在按 Session 分组的问题。页面注册进根部的 `main` keyed slot，面板 id 为 `hitl-inbox`；它的侧边栏入口以同一个 id 注册进 `sidebar.panellist`——这正是「选中入口即选中页面」的实现方式。

pending interaction 的载体归属于发起该请求的域。本包只从载体上读两个可选字段——问题列表（取标题和数量）——并在自己的文案里命名三种 kind。遇到不认识的 kind 仍然列出，带上它的 Session 和通用的提问标签，而不是丢掉：新增一个交互域不应该让专家的收件箱悄悄变得不完整。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

收件箱本身不够用时读这些。它们从列表走向填充列表的那些域。

- [ui-user-questions](../ui-user-questions/README.zh.md) —— 发起 `question` 与 `plan-review` 交互，并拥有回答它们的卡片。
- [ui-approval](../ui-approval/README.zh.md) —— 发起 `approval` 交互。
- [ui-session](../ui-session/README.zh.md) —— 声明 `SessionPendingInteraction`，并发布本页面折叠的状态快照。
- [ui-sidebar](../ui-sidebar/README.zh.md) —— 声明 `sidebar.panellist` 并渲染入口。

-----

<a id="model-experience"></a>
## 模型体验

None, as listing pending interactions and navigating to a Session does not construct model input.

#### KV Cache effect

None; the domain that raised a question owns any subsequent model interaction.

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

以下是本包当前的约束，不是待办清单。

- **只列等待中的问题** —— 页面列的是此刻还悬着的请求。已回答的问题不留行，所以收件箱不是历史记录；已回答的问题在各自 Session 的对话里。
- **只覆盖本浏览器已列出的 Session** —— 本浏览器没有列出的 Session 不贡献任何行，因此在当前列表之外的 Session 里提出的问题，在列表覆盖到它之前不可见。
- **没有持久的提问通道** —— 行来自实时的 pending interaction，所以 Host 重启丢掉等待时，问题不会留下。一条外部系统可以追加、且不依赖两侧同时在线的提问通道，规格在 [docs/hitl](../../../docs/hitl/question-contract.zh.md)，本包没有实现。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作背景 —— 点击展开</summary>

None.

</details>
