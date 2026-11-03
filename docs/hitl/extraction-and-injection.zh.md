# 提取与注入

[English](extraction-and-injection.md) | 中文

专家点下"标记已解决"之后发生的事：提取 Agent 把讨论提成结构化观点，投递给系统，系统写回回执。

本文描述的是正在生产运行的那个实例，它是新部署的基准。

这是整条链里唯一一段**模型输出直接进入生产系统**的路径，所以它的约束比别处都紧：输出必须是校验过的结构，失败必须可见，投递必须幂等。

## 状态机

```
pending ──(expert marks resolved)──▶ extracting ──▶ ready ──▶ delivered
             ▲                            │           │
             │                            ▼           ▼
         (reopened)                     failed ◀── failed (every sink failed)
```

`insight.status` 五个取值：

| 状态 | 含义 | 专家看到什么 |
|---|---|---|
| `extracting` | 提取 Agent 在跑 | 观点卡显示"正在提取" |
| `ready` | 提取成功，但没有匹配的 sink（或还没投递） | 观点内容 |
| `delivered` | 至少一个 sink 成功 | 观点 + 投递去向 |
| `failed` | 提取失败，或所有 sink 都失败 | 失败原因，可重试 |

"重新打开"把问题退回 `pending`，专家继续讨论；再次标记已解决会**重新提取**。这是必要的：第一次答完之后专家经常会补一个方向，那是一次合法的新交付，不是重复。

## 提取 Agent

**无工具。** 它只读这段讨论，不读 workspace。给它工具它就会去"核实"，然后把系统的材料混进专家的立场里——而专家的立场才是这里要提取的东西。

**新会话，不带历史。** 每次提取重新开始。

**可以用更便宜的模型。** 提取是一个受约束的结构化任务，不需要和常驻 Agent 同档。配置上用一个覆盖项（`extract_harness`）只改模型，其余继承。

### 提示词

核心约束四条，缺一条输出就会变味：

1. **只有专家说的算。** 角色为"专家"的发言，以及专家明确认可的助手发言。助手自己讲的背景、推测、建议，一律不算。
2. **不许发明，不许软化。** 数字和条件原样保留。专家说"只在 shape 大于 4096 时才值得"，不能提成"大 shape 时值得"。
3. **不许评价。** 提取的是立场，不是对立场的判断。
4. **用讨论的语言。** 专家用中文谈的，提成中文。

### 输出契约

要求模型只回一个 JSON 对象：

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

`points` 是这个结构里最有用的部分。一段自然语言的建议注入到系统里，下游 Agent 读完还是得自己拆；`points` 已经拆好了，每条带理由和置信度，下游可以按置信度决定先试哪条。`confidence` 来自**专家说话的肯定程度**，不是提取 Agent 的判断。

`open_questions` 同样要保留：专家说"我不确定这个硬件上 UB 够不够"，这句话对系统的价值不亚于他确定的部分。

### 解析与校验

模型不会每次都只回 JSON。解析要按顺序尝试：最后一个 ```json 代码块；失败则扫描全文，取能解码成功的最大 JSON 对象。

拿到对象后校验，至少：`answer` 是字符串、`points` 是数组、每个 point 的 `claim` 非空。

校验不过就**把失败原因回给模型，让它改一次**（在同一会话里续问"被拒绝了：<原因>，只回修正后的 JSON 对象"）。重试一次，还不过就标记 `failed`，把原因写进 `insight.error` 给专家看。

不要在校验失败时回退到"把原文当作 answer"。宁可失败可见，也不要把没校验过的东西投递进系统。

### 对话里没有专家发言时

直接标 `failed`，原因写"对话里还没有专家的回答"。不要让提取 Agent 去总结一段只有助手说话的对话。

## 主动注入的提取

专家在自由对话里点「注入」时，走同一套机制，但换一份提示词，并多两个输入：

- `target` —— 专家勾选的注入目标（可多选，一个目标产生一条注入记录）。
- `already_injected` —— 同一对话、同一目标、此前已成功投递的注入的 `answer` 与 `points` 摘要。

提示词的差别：

- 要提的是**专家给出的经验、教训、大局判断和指令**，不是对某个问题的回答。
- **排除**专家只是提问的内容，以及助手报告给他的事实——除非专家把它变成了判断或指令。
- **排除** `already_injected` 已经带走的内容，除非专家改了口径——那就给新版本。
- 如果这段对话里没有可注入的新东西，`answered` 返回 `false`。

`answered` 为 false 或 `points` 为空时，不投递，标 `failed`，原因写"这段对话里没找到可以注入的新经验或指导（已注入过的不会重复注入）"。这不是错误，是正常结果：专家点了注入但其实只是在问问题。

主动注入还有一个 `upTo` 字段（点击时刻），提取只看这个时刻之前的消息。否则专家点完注入继续聊，重新提取时范围会漂移。

## 投递

### 载荷

每个 sink 收到同一个载荷：

```json
{"hitl": "<instance name>",
 "question": {"id", "title", "detail", "options", "context", "source", "status",
              "resolvedBy", "resolvedAt", "kind", "target", "..."},
 "insight": {"answered", "answer", "points", "open_questions", "summary"},
 "transcript": [{"role": "expert|assistant", "author", "content", "at"}]}
```

`insight` 里剔掉投递与状态字段（`deliveries`、`receipts`、`status`、`error`）——那些是本系统的记账，不是给系统的内容。`transcript` 给全，因为有些系统想要原话。

### 三种 sink

| 类型 | 配置 | 行为 |
|---|---|---|
| `command` | `{"argv": [...], "cwd", "timeout_s"}` | 载荷 JSON 从标准输入进；**非零退出码 = 投递失败**，专家看得到 |
| `jsonl` | `{"path": "..."}` | 追加一行载荷 |
| `webhook` | `{"url", "headers", "timeout_s"}` | POST 载荷 |

每个 sink 可带 `when`：一组"载荷里的点分路径 → 要求的值"，全部匹配才投。例如 `{"question.source.system": "mysys"}`。

`argv` 和 `path` 里的 `{点分路径}` 会被载荷里的值替换，便于按任务路由到不同脚本或文件。替换的值必须通过字符白名单（`[\w.:@+-]+`），否则拒绝——这些值最终会进命令行。

多个 sink 的结果各自记录（去向、成功与否、详情、时间）。**只要有一个成功就算 `delivered`**；全失败才 `failed`。

### 注入器（系统侧）要做对的事

`command` sink 调用的那个脚本是系统侧的注入器，它决定专家的观点如何真正起作用。几条经验：

**落在系统读得到、且它的自我保护动不到的地方。** 一个会自动回滚的系统（例如 git 回滚到上一个最好版本）只回滚它的产出目录；专家建议要写在回滚范围之外，否则下一次回滚就把它抹掉了。一个成熟实例的做法是写进任务的笔记文件（`docs/notes.md` 的 `## 专家建议` 块），而回滚只碰 `src/`。

**和系统已有的"建议"契约一致。** 如果系统本来就有一个注入人类建议的格式，专家通道沿用它，不要新开一种——下游 Agent 的提示词只认一种。

**幂等键是 `question_id` + 内容哈希，不是 `question_id`。** 只按问题 id 拦，专家补充新方向后再次标记已解决就会被误吞。按内容哈希拦，原样重复才拦。

**可以做得更多，但要可解释。** 成熟实例在注入时还会：把该任务的模型切到更强的档位、拉起几条并行验证分支去试专家给的方向、往总账本和时间线各记一笔。这些都可以，前提是每一步都写进回执，让专家知道他的一句话引发了什么。

**没有明确任务归属的问题要有去处。** `source` 里没有任务字段的（面向整个系统的问题），落到一个全局知识文件，而不是静默丢弃。

## 失败要显形

这条链里每一步失败都必须让专家看见，并且可重试：

| 失败 | 专家看到 | 重试 |
|---|---|---|
| 提取失败 | 观点卡上的红字原因 | 重新提取按钮 |
| 所有 sink 失败 | 失败的去向与错误详情 | 重新提取（会重新投递） |
| 常驻 Agent 回复失败 | 消息里的失败说明 | 再发一条消息 |

静默失败在这里的代价是：专家以为自己的建议进了系统，系统其实什么都没收到，而他还在等回执。
