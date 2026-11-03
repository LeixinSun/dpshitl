# 创造模式

[English](creator-mode.md) | 中文

专家在对话里说一句"这个能不能展示一下""我想看这几个任务的 profiling 对比"，Agent 就地给他写一个插件、装上、热加载，他当场就能用。

这是专家通道里唯一一个让模型**写代码并装进生产界面**的能力，也是最容易做成玩具的一个。做成玩具的标志是：生成的插件要么跑不起来，要么数据是编的，要么专家看一眼就再也不用了。本文的大部分篇幅在讲怎么避免这三件事。

## 为什么必须改提示词

直接拿 dsh 的创造模式来用不成立，原因不在能力，在**目标对象**：

| | dsh 创造模式 | 专家通道创造模式 |
|---|---|---|
| 产物 | Cordis bundle，扩展 Agent 运行时 | HITL 插件，扩展专家看到的界面 |
| 读什么确定 API | `cordis_inspect_query` 查服务/事件/工具 | 嵌入点清单 + **数据提供者的真实响应样例** |
| 数据从哪来 | 进程内的服务 | 只读数据面（提供者 / 文件根 / SSE） |
| 提需求的人 | 开发者，会描述技术方案 | 领域专家，只会描述他想看什么 |
| 装上之后 | 对所有会话生效 | 默认只对他自己生效，可撤销 |

差别最大的是最后两行。专家不会写"我要一个读 `fleet.op` 提供者、按 lane 聚合、每 10 秒刷新的侧边栏页面"，他会写"看看那几条分支现在怎么样了"。所以创造 Agent 的首要工作不是写代码，是**把一句话问成一份规格**。

所以要改的是三块：系统提示词注入的内容、技能（工作流与模板）、以及人在回路的卡点。

## 创造 Agent 的系统提示词

四块，缺哪块坏哪块：

### 1. 它是谁、产物是什么

它在给一个人类专家做自用工具，产物是一个 HITL 插件。强调两件事：**最小可用优先**（先出能看的第一版，再迭代，不要一次做全），**专家是验收人**（他说好用才算完成，不是构建通过就算完成）。

### 2. 嵌入点与清单参考

把这个部署真正声明了的嵌入点给它——从 `packages/client/*/src/client/` 里的 slot 声明读出来。外加一句硬规则：**嵌入点集合是封闭的**，没有合适的嵌入点就说明这个需求不该用插件解决，应当回去告诉专家。

### 3. 数据面清单 —— 每个提供者带真实响应样例

这是最关键的一块，也是最容易偷懒的一块。只给提供者的名字和描述，模型一定会臆造字段名，写出来的插件渲染出一片 `undefined`。

所以提示词里（或它第一步必须调用的一个工具里）要带每个提供者的**真实响应样例**：

```
fleet.overview — fleet summary, 10s cache
  GET /api/data/fleet.overview
  Sample (truncated): {"ops": [{"op": "nms", "best_score": 84.1, "cloud_score": 73.8,
                              "round": 2194, "phase": "optimize", "alive": true}, ...],
                      "totals": {"alive": 57, "submitted": 134}}
  Field meanings: best_score is the local evaluation score, cloud_score is the cloud
  measurement; the two use different scales — see the system map
```

配套一条硬规则：**写渲染代码之前，先把要用的提供者各拉一次，看真实数据**。禁止从字段名推断含义。

### 4. RCI 系统地图

创造 Agent 和常驻 Agent 共享同一份系统地图（常驻 Agent 的提示词里那份 `SYSTEM_MAP`）：这个系统在做什么、分几个阶段、关键产物在哪、哪些数字是什么口径。

没有这块，它写得出一个能跑的表格，但表格里哪一列重要、哪两个数不能放在一起比，它不知道。专家要的恰恰是后者。

## 让专家的一句话变成一份规格

创造 Agent 在动手之前必须凑齐四件事。缺任何一件就问，用 `ask_user_question` 之类的提问能力问，一次问清，不要挤牙膏：

| 必须确定 | 问法示例 | 缺了会怎样 |
|---|---|---|
| **展示什么** | "你想一眼看到的是趋势、排名，还是单个任务的明细？" | 做出一个信息堆砌、什么都不突出的面板 |
| **数据从哪来** | "这个数是看本地评测分还是云端实测分？"（给选项） | 口径错，整个面板的结论是错的 |
| **什么时候刷新** | "要实时跟着跑，还是打开时看一眼就行？" | 要么打穿下游，要么数据是陈的 |
| **放在哪** | "放首页一眼能看到，还是侧边栏单开一页，还是在对话里随手调出来？" | 占了错误的位置，用两次就嫌烦 |

**常驻 Agent 应该先代为起草。** 专家是在一段对话里提出这个需求的，常驻 Agent 已经知道他们在聊什么任务、看哪些数、卡在哪。由它把上面四项先填好一版草稿交给专家确认，比创造 Agent 从零开始问四个问题要快得多，也更准。这是把已有上下文变现的地方。

规格确认之后写进插件清单的 `description` 和 `createdFrom`，留痕。

## 工作流

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

几个卡点的理由：

**第 1 步查重**是省钱也是省界面。三个专家各要一个"进度面板"，结果是三个几乎一样的面板堆在首页。创造 Agent 要先看已有插件的 `description`，能改就改。

**第 2 步拉数据**前面讲过，这是防止臆造字段的唯一有效手段。

**第 5 步自检**里"`dataNeeds` 与实际请求一致"要能机械检查：构建产物里出现的 `/api/data/<x>` 必须在清单里声明过。声明与行为不一致的插件不许装。

**安装要专家确认**，确认页展示的不是代码，是三件事：它出现在哪、它会读哪些数据、它是谁做的。专家不读代码。

**迭代在同一会话里**，创造 Agent 记得它刚写了什么。专家的反馈通常是"这个数不对""能不能按 lane 分组"，不是重新描述需求。

## 写进技能里的硬规则

把下面这些写成创造 Agent 的技能（替换 dsh 的 `cordis-plugin-development`，保留它"先查 API 再写代码""从模板复制""装上后读安装结果""装完要验证"的纪律）：

- **先看真实数据，再写渲染。** 不许从字段名推断含义。
- **只走数据面。** 不许读文件系统、不许执行命令、不许直连任何后端以外的地址。插件在浏览器里跑，它能拿到的就只有那三个通道。
- **第一版要小。** 一个视图、一个数据源、能看见东西。专家看到实物之后给的反馈，比他事先的描述准得多。
- **渲染要能挂。** 数据没来、字段缺失、数组为空，都要有明确的空态，不能白屏也不要假装有数据。
- **不展示密钥与内部路径。** 和背景材料同一套脱敏规则。
- **声明即行为。** `dataNeeds` 写了什么就只能请求什么。
- **自己不许改内核。** 写权限只在 `plugins/<id>/`；需要新嵌入点就停下来说明，由人去改内核。
- **做完要自己验一遍**：用真实数据渲染一次，把看到的关键数字复述给专家核对。构建通过不等于做对了。

技能里要带**可复制的模板**，至少三个：一个首页面板、一个侧边栏页面、一个 widget。模板里包含清单、组件骨架、数据请求与空态、构建配置。从模板改比从零写出错少一个数量级。

## 权限与可撤销

| 边界 | 规则 |
|---|---|
| 写权限 | 只有 `plugins/<id>/`。RCI workspace 只读，内核代码不可写 |
| 执行 | 构建在受限环境里跑，不联网 |
| 安装 | 每次安装都要专家显式确认，一次确认只覆盖这一次 |
| 运行时 | 插件只有三个只读通道，受 `dataNeeds` 约束 |
| 撤销 | 删除是移到回收位置，可恢复；全程落事件日志 |

**装上的插件在专家的浏览器里执行**，所以这是一条真实的信任边界：一个被诱导写出坏代码的创造 Agent，产物会在别的专家浏览器里跑。`visibility` 默认 `private`、共享要显式动作，这两条是这条边界上的主要防护。共享之前值得让第二个人看一眼。

## 用 dsh 作为创造 Agent 的 harness

dsh 适合做创造 Agent 的 harness：它的创造模式已经有一整套"查 API → 从模板复制到工作目录 → 安装 → 热加载 → 读安装结果 → 验证"的工作流纪律，这套纪律迁移到 HITL 插件上基本不变。

要替换的是上层：

| dsh 的 | 换成 |
|---|---|
| `cordis_inspect_*`（查 Cordis 服务/事件/工具） | 查 HITL 嵌入点 + 数据提供者样例 |
| `cordis-plugin-development` 技能与模板 | HITL 插件技能与模板 |
| `plugin_manager install_bundle`（装进 dsh profile） | 装进 HITL 插件注册表 |
| 安装审批走 dsh 的审批链 | 走专家在界面上的确认 |

保留的是：从模板起步、安装后读取"是否已生效"、生效后用真实数据验证、产物持久化且可撤销。dsh 的"个性化推荐"那条实验路径（后台子 Agent 生成插件、校验、安装、可撤销可恢复）就是这个模型的现成样板。

## 怎么判断它做好了

一个月后回头看三个数：

1. **留存**：生成的插件里，一周后还在被打开的占多少。这个数低说明规格阶段没问清，做出来的东西不是专家要的。
2. **一次成型率**：装上第一版就被接受、不需要迭代的比例。这个数低通常是数据样例没给够。
3. **专家自己发起的次数**：专家主动说"再做一个"的频率。这个数是整件事有没有价值的唯一真实信号。

不要看生成插件的总数。
