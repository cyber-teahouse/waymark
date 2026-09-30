# 更细的流程拆分：split 脚手架 + 验收项加权进度（设计文档）

> 日期：2026-10-01 · 状态：已批准方向（C 为主干 + B 补充，方案 A 留作远期），待实施
> 背景：waymark 准备面向更多项目使用（npm 首发在即），节点粒度模型的三个痛点：进度跳变（统计口径是节点数）、agent 认领单元太粗（ready 给的是可能横跨数天的里程碑）、依赖无法下沉到里程碑内部。

## 1. 目标与非目标

**目标**

1. 把「大里程碑拆成 agent 认领得动的任务单元」变成一条命令（`waymark split`）和一个 MCP 工具（`waymark_split_node`），拆分本身可由 agent 在协议内完成。
2. 粗粒度里程碑的内部进度可见：进度口径从「节点完成比」细化为「验收项加权」。

**非目标**

- 不引入父子层级 schema（节点不新增 `parent` 字段、里程碑不目录化）——方案 A 留作远期。
- 不改 DAG 画布渲染与 dagre 布局（task 节点和边现在就能渲染）。
- 不改状态机（planned → in-progress → done 与旁路语义原样）。

## 2. 拆分约定（纯约定，零 schema 变更）

现有 `deps` 机制就是层级表达，不新增模型：

- `type: milestone` = **交付物**：验收标准、证据、完成记录挂这里，是人对外的跟踪单位。
- `type: task` = **一个 PR / 一个 agent 会话**的可执行单元，`waymark ready` / `waymark start` 的自然对象。
- 拆分后的连线形态（以 `M2-auth` 拆出 3 个任务、原依赖 `M1-core` 为例）：

```
M1-core ──→ M2-auth-t1 ──→ M2-auth-t2 ──→ M2-auth-t3 ──→ M2-auth
            （继承原依赖）    （链式）        （链式）      （汇总）
```

- `M2-auth.deps = [M2-auth-t1, M2-auth-t2, M2-auth-t3]`——里程碑被任务「闸住」：任务未完成时里程碑不可 ready，`done` 里程碑会触发既有的「依赖未完成」护栏警告（复用现有机制，零新代码）。
- 任务链式依赖（t(n) deps t(n-1)）让 `ready` 一次只给出一个可开工单元，匹配 agent 串行工作流；可并行的工作用户手改 deps 即可。
- 里程碑在任务进行期间保持 planned（不自动 in-progress）；想表达「交付中」可手动 `waymark start`，文档说明即可，不加自动化。
- 约定写法：milestone = outcome，task = 1 PR / 1 agent 会话（30 分钟～2 小时）。

## 3. `waymark split` 命令与 `waymark_split_node` MCP 工具

共用引擎 `src/plan/split.ts`（新建），CLI 与 MCP 是薄壳——与 start/done 等命令同构。

### CLI

```
waymark split <id> <任务标题1> <任务标题2> ...
```

### 行为规格

- 为第 N 个标题生成 `plan/milestones/<原id>-t<N>.md`（如 `M2-auth-t1`）；目标 id 已存在任何节点（含其他文件占用的 id）时直接报错并列出冲突 id，不做智能避让。
- 生成文件 frontmatter：`id` / `title`（用户传入标题）/ `type: task` / `status: planned` / `deps`（按第 2 节连线）/ `iteration`（继承原节点）；正文带「## 需求描述」占位。**验收、证据、描述留在原里程碑**（它是成果规格）。
- 原里程碑 frontmatter 的 `deps` 改写为全部新任务 id；其余字段（status/acceptance/evidence/iteration）不动。
- **不改 overview.md**：总览表的强一致校验只覆盖 milestone（`validate.ts` 的「总览表缺少里程碑」仅对 `type: milestone` 报 error），task 行可有可无——保持总览表的里程碑粒度，零文件扰动。
- 护栏：`done` / `dropped` 节点拒绝拆分（提示先 reopen）；id 未找到按现有错误口径；原节点 `in-progress` 允许拆分但出警告。
- 完成后输出：创建的文件清单、新依赖连线、提醒 `waymark sync`。

### MCP 工具

- 名称 `waymark_split_node`（与 `waymark_start_node` 等命名对齐）。
- 入参：`{ id: string, titles: string[] (min 1) }`；返回：`{ message, created: [{ id, file }], readyNext: ReadyItem[] }`。

## 4. init 模板示范拆分形态

`waymark init` 骨架从「1 个示例里程碑」改为「1 个里程碑 + 2 个示例任务」：

- `M1-example`：保留现有验收与证据声明，`deps: [M1-example-t1, M1-example-t2]`。
- `M1-example-t1`：`deps: []`；`M1-example-t2`：`deps: [M1-example-t1]`；均 `type: task`、`iteration: I1`。
- overview.md 总览表只列 `M1-example`（task 不需要，见第 3 节）。
- 验收标准：新骨架 `waymark check` 一次通过，`waymark ready` 初始返回 t1 而非光杆里程碑。

## 5. B：验收项加权进度

### 口径（可解释、无魔法系数）

- 权重单位：**非 dropped 节点**，每个权重 1。
- 节点贡献：`displayStatus === "done"` 记 1；否则记 `已勾验收数 / 验收总数`（无验收声明记 0）。用 `displayStatus`（与现有 stats 口径一致）而非 declaredStatus。
- `progress = round(100 × Σ贡献 / 单位数)`；全部节点 dropped 时 progress = 0（防除零）。

### 数据契约（加性扩展）

`workflow.json` 的 `stats` 新增可选字段：`acceptanceTotal`（非 dropped 节点验收总数）、`acceptanceDone`（其中已勾数）、`progress`（0–100 整数）。zod schema 加 optional 字段，`version` 保持 `1`，`synthesize.ts` 末尾的契约自检照常生效。

### 展示位（三处切换为加权值，均带回退）

| 位置 | 现状 | 改为 |
|---|---|---|
| `waymark status` 终端进度条 | 节点完成比 | `progress`（缺失回退节点比）；「完成 x/y」文案保留 |
| 页面进度（web） | 节点完成比 | `stats.progress`（可选链回退） |
| hub 完成率圆环 | `done/total` | `stats.progress ?? done/total`（hub 读任意项目的旧 workflow.json，回退是硬要求） |

## 6. 兼容性与风险

| 项 | 结论 |
|---|---|
| workflow.json 契约 | 仅加 optional 字段；旧页面 / 旧 MCP 客户端不受影响 |
| plan 文档格式 | 零变更（split 产物就是普通节点文件，旧版本 waymark 也能解析） |
| check 规则 | 不新增规则；split 产物天然通过（任务依赖存在、无环、无总览表要求） |
| 旧项目迁移 | 不强制；约定进文档，`split` 随时可用 |
| dagre 布局 | 节点数变多会让画布更密——不在本期处理（MiniMap/fit 已有） |

## 7. 测试策略

- `split` 引擎：连线正确性（继承/链式/汇总）、frontmatter 保留性（原里程碑验收/证据不动）、拒绝 done/dropped、id 冲突报错、in-progress 警告、iteration 继承。
- CLI 端到端：split → check 通过 → ready 只给任务 → done 任务链 → 里程碑 done 时未完成依赖警告。
- MCP：`waymark_split_node` 返回结构与 `readyNext`。
- 加权统计：含验收/无验收混合、dropped 排除、全 dropped 除零、契约自检通过。
- init 模板：新骨架 init → check → sync → ready 断言。
- 回归：现有 162 用例全绿；发版前 dist 重建 + 狗粮（用 `waymark split` 拆自己的一个里程碑走完闭环）。

## 8. 文档更新

- README（中/英）：命令表加 `split`、MCP 表加 `waymark_split_node`、「/plan 结构」补 milestone/task 约定与连线形态图。
- RELEASE.md：随下次发版（0.3.3）记入历史表。

## 9. 远期方向（本期不做，方案 A 记录）

若约定 + 脚手架落地后仍有层级需求（里程碑内多层级 WBS、子任务独立证据推断），再评估 `parent` 字段 + 画布层级渲染。触发信号：用户实际项目中 task 数量大到画布不可读、或出现「任务的完成定义」本身需要验收清单之外的跟踪。
