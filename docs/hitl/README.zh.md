# 专家通道（HITL）

[English](README.md) | 中文

专家通道是跑在 RCI 系统旁边的一个网站：系统里正在转的 Agent 自主提问，问题进收件箱，人类专家点进去和常驻 Agent 对话，谈清楚后标记已解决，另一个 Agent 把专家的立场提取出来注入回系统，系统再把"拿它做了什么"回执到同一个对话里。

它不是聊天工具。它是一条**闭环**：系统问 → 专家答 → 自动提取 → 注入 → 回执。每一环都是可审计的事件，少一环这条链就断了。

这套闭环已经有一个在生产跑的实例，它就是基准：新部署要复刻这里描述的专家交互和后端路径，只在细节上不同。决策理由在 [专家通道 Agent Note](../../.agents/notes/proposed/feature/2026-11-03-hitl-expert-channel.zh.md)。

| 文档 | 它回答什么 |
|---|---|
| 本文 | 闭环全貌、角色分工、事件模型、部署形态 |
| [提问契约](question-contract.zh.md) | 谁提问、问题长什么样、背景材料怎么分节、怎么落到收件箱 |
| [提取与注入](extraction-and-injection.zh.md) | 标记已解决之后发生什么：提取提示词、JSON 契约、投递、回执 |
| [创造模式](creator-mode.zh.md) | 专家用一句话让 Agent 给自己写插件；提示词与技能要怎么改 |
| [部署](deployment.zh.md) | 模型 Key 放在哪、怎么钉死模型、怎么让浏览器完全没有账户界面 |
| [搭建 prompt](build-prompt.zh.md) | 给那个要在具体系统上把它搭起来的 Agent 用的 prompt |

## 闭环

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

六个环节里，②③④⑥ 是通用的，由本系统实现；①⑤ 是**系统特定**的，由每个 RCI 系统自己写适配器，只需遵守[提问契约](question-contract.zh.md)和[投递契约](extraction-and-injection.zh.md)。

## 三个 Agent，职责不重叠

| 角色 | 什么时候跑 | 工具 | 它的任务 |
|---|---|---|---|
| **常驻 Agent** | 专家每发一条消息 | 只读 workspace（读文件、搜索、白名单命令） | 解释系统现在在干什么、证据在哪；帮专家把回答讲准，而不是附和专家 |
| **提取 Agent** | 专家点"标记已解决"时 | 无工具 | 把这段对话里专家的立场提成结构化 JSON |
| **创造 Agent** | 专家要一个自己的面板时 | 只读 workspace + 写插件目录 | 按专家描述写一个 HITL 插件，装上、热加载、让专家验收 |

常驻 Agent 一个对话一个会话，每条消息续上一次的会话，所以它记得已经读过什么。提取 Agent 每次新开，不带历史，只看这段讨论——它的输出要进系统，不能被之前的上下文污染。创造 Agent 独立会话、独立权限。

**常驻 Agent 必须保持怀疑。** 专家写下的话会被自动注入到系统里，所以这里不能有附和。常驻 Agent 的提示词要求它：中立复述专家的回答，拿系统测到的数据去核对，一样坦率地说出哪里矛盾、哪里有代价、靠什么假设；只问还真正影响系统行动的歧义。专家在他们看不到的事实上（他们的机器、他们的测量、他们的优先级）是权威，但这不等于每句话都对。

## 事件模型

全系统的真相是一个只追加的事件日志 `data_dir/events.jsonl`，启动时回放进内存。它决定了重启、备份、审计都是平凡的。

持久事件：

| 事件 | 载荷 | 含义 |
|---|---|---|
| `chat.create` | `{chat: {id, title, createdAt, questionId?, author?}}` | 新对话 |
| `chat.update` | `{chatId, title?, session?}` | 改标题；或记下这个对话续用的 Agent 会话 id |
| `message` | `{chatId, message: {id, role, content, createdAt, author?, questionId?, tools?, error?}}` | 一条消息；同 id 覆盖 |
| `question.create` | `{question: {...}}` | 一个提问（或一次主动注入） |
| `question.status` | `{questionId, status, by?}` | 待解决 / 已解决 |
| `insight` | `{questionId, insight: {...}}` | 提取结果、投递结果、回执 |
| `notify` | `{questionId, channel, to, ok, error?}` | 新问题的通知发没发出去 |
| `plugin.change` | `{plugin: {...}, action}` | 插件被装上、启用、停用、卸载 |

仅在内存、只走 SSE、不落盘的事件：`delta`（流式文本）、`activity`（工具调用进度）。它们是过程，不是事实；真相是落盘的那条完整消息。

**一个数据目录只能有一个服务进程。** 两个进程会各自摄取 outbox 并交错写日志。用 `flock` 在 `server.lock` 上独占，拿不到就退出。

## 对话页面的三栏

专家看到的不只是聊天框。一个问题对话由三部分构成，缺一个专家就答不准：

1. **消息流** —— 常驻 Agent 的回答、它调过哪些工具（可折叠）、专家自己的发言。
2. **背景材料栏（右侧）** —— 提问时随问题一起送来的 `context`，按 `##` 拆成可折叠卡片，每张卡下面一行灰色导读告诉专家"这节是什么、该怎么读"。默认展开，宽度可拖拽并记住。外部专家不读源码，这一栏是他们唯一的现场。
3. **输入框左下角的动作** —— 问题对话是「标记已解决 / 重新打开」，自由对话是「注入」。动作紧挨输入框，因为它是说完话之后的下一步。

背景材料的分节标题由提问器决定，渲染侧按标题前缀匹配导读文案。约定见[提问契约](question-contract.zh.md)。

## 两种注入

| | 问题注入 | 主动注入 |
|---|---|---|
| 谁发起 | 系统提问，专家回答 | 专家在自由对话里谈完，自己点「注入」 |
| 记录 | `question`，进收件箱，发邮件 | `question` 且 `kind: "inject"`，不进收件箱，不发邮件 |
| 提取范围 | 整段讨论 | 这个对话截至点击时刻的内容，**减去**同一对话早先已注入过的部分 |
| 目标 | 问题的 `source` | 专家勾选的目标（配置 `inject.targets`） |

主动注入是这条链里价值最高也最容易被忽略的一环：系统没想到要问的事，专家未必等着被问。两者走同一套提取、同一套 sink、同一套回执。

## 部署形态

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

后端只监听回环地址，由主站反向代理到 `base_path`。专家用访问码登录，码存在 HttpOnly cookie 里。RCI 系统用服务令牌调提问与回执接口。

**权限是硬边界，不是提示词里的叮嘱。** 常驻 Agent 以只读模式运行，密钥与数据目录在拒绝列表里；创造 Agent 的写权限只开到插件目录。靠提示词说"不要改文件"不算数。

## 和 DeepSeek Harness 的关系

本系统借 dsh 的**架构思想**，不是把 dsh 当成一个 Agent 用——Agent 是 harness 加 model，dsh 是 harness 层。

借过来的：

- **一切皆插件。** 内核只实现闭环；所有系统特定的展示、面板、数据视图都是插件，不改内核代码。
- **清单 + 组合。** 插件自带清单声明它要哪些嵌入点、哪些数据，由配置决定装哪些、对谁可见。
- **热加载。** 装上即生效，不重启、不重新构建。
- **创造模式。** 模型可以写插件、装插件、验收插件，并且这件事是可撤销、要审批的。

不照搬的：dsh 的 Cordis 依赖注入运行时、它的 Web 单用户令牌模型、它的 profile/bundle 目录结构。本系统的插件是面向人类专家的界面扩展，不是 Agent 运行时的能力扩展，两者的生命周期和权限模型都不同。

dsh 可以作为任意一个 Agent 的 harness（见[创造模式](creator-mode.zh.md)），尤其是创造 Agent——它自带插件开发技能和脚手架经验。但插件格式是本系统自己的。
