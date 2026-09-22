<p align="center">
  <img src="assets/banner.svg" alt="waymark banner" width="960">
</p>

<h1 align="center">waymark</h1>

<p align="center">
  <code>/plan</code> 驱动的项目进度工作流可视化 CLI —— 计划文档 + 代码证据 → 自动推断完成度 → DAG 工作流页面
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/version-0.2.1-%23c98f2c" alt="version"></a>
  <a href="#"><img src="https://img.shields.io/badge/node-%3E%3D20-339933" alt="node"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license"></a>
  <a href="https://github.com/cyber-teahouse/waymark/commits/main"><img src="https://img.shields.io/github/last-commit/cyber-teahouse/waymark" alt="last commit"></a>
  <a href="https://github.com/cyber-teahouse/waymark"><img src="https://img.shields.io/github/stars/cyber-teahouse/waymark?style=social" alt="stars"></a>
</p>

在山野里，**waymark（路标）**告诉你走到了哪、下一步往哪去。这个项目为软件项目做同样的事：把 `plan/` 目录下的计划文档当作路标石，扫描代码证据自动推断每块路标的真实进度，再铺成一张可交互的 DAG 步道地图——人和 AI agent 都不会在山里迷路。

## ✨ 亮点

| | |
|---|---|
| 📄 **文档即数据源** | 一个节点一个 Markdown 文件（frontmatter 声明状态/依赖/验收/证据），无数据库、无账号 |
| 🔍 **证据四维推断** | `paths` / `grep` / `tests` / `git` 四类代码证据打分，自动推断节点完成度 |
| ⚖️ **冲突只警示** | 推断不覆盖声明：证据不足 ⚠、可标记完成 💡，高亮提示但不篡改你的计划 |
| 🤖 **AI agent 闭环** | `ready` 查可开工节点、`done` 收尾并追加完成记录，配合 MCP 工具集全程协议内操作 |
| 📦 **单文件页面** | 前端产物内嵌 CLI，`.waymark/index.html` 双击即开，目标项目零依赖 |
| 🔥 **实时热重载** | `waymark ui` 监听 plan/、证据目录与 git，改动数秒内推流到浏览器 |

## 🥾 快速起步

```bash
npm link            # 在本包内：全局注册 waymark 命令
npm run build && npm run build:web   # 构建 CLI 与页面产物

cd /path/to/your-project
waymark init       # 生成 plan/ 骨架
waymark check      # 校验规范（可接 CI，出错 exit 1）
waymark sync       # 解析 plan + 代码证据 → .waymark/workflow.json
waymark render     # 生成自包含 .waymark/index.html
waymark ui         # 本地实时页面（默认 http://localhost:7300）
```

推进节点（AI agent 友好）：

```bash
waymark done M-xxx -m "完成了什么" [--acc]   # 标记完成 + 追加完成记录（--acc 勾全部验收）
waymark ready                               # 列出可开工节点（planned 且依赖已满足）
```

## 🗺️ 命令一览

| 你说 | 它做什么 |
|---|---|
| `waymark init` | 在项目根生成 `plan/` 骨架（overview + 迭代 + 示例节点） |
| `waymark check` | 校验 /plan 规范：id 唯一 / 依赖存在 / 无循环 / 迭代引用 / 总览一致 / 正则合法 |
| `waymark sync` | 解析 plan + 证据推断 → 生成 `.waymark/workflow.json`（含警示） |
| `waymark render` | 由 workflow.json 生成自包含 `.waymark/index.html`（plan 或证据过期会提醒重新 sync） |
| `waymark ui [-p 7300]` | 本地实时工作流页面，watch plan/、证据目录与 git，SSE 热重载 |
| `waymark done <id> -m <note>` | 标记完成、追加带日期的完成记录，可选 `--acc` 勾选全部验收 |
| `waymark ready` | 列出 planned 且依赖已满足的节点，页面侧带「可开工」紫色标识 |
| `waymark mcp` | 以 MCP stdio 服务启动，把上述能力暴露给 AI agent |

全局参数：`--root <dir>` 指定项目根目录（默认当前目录），对所有子命令生效。

## 🪧 /plan 结构

```
plan/
├── overview.md          # 框架文档入口 + 里程碑总览表
├── milestones/*.md      # 一个节点一个文件
│   # frontmatter: id / title / type / status / deps / iteration / evidence / acceptance
└── iterations/*.md      # 迭代计划（id / title / goal / window）
```

- **状态机**：`planned → in-progress → done`（旁路 `blocked` / `dropped`）
- **证据四维**：`paths`（文件存在）/ `grep`（代码命中）/ `tests`（测试存在）/ `git`（提交匹配）；推断只提示不覆盖声明
- **迭代演进**：新增 `plan/iterations/I2-xxx.md` + 节点标 `iteration: I2` → `ui` 模式数秒内自动出现在视图

### check 规则

| 级别 | 规则 |
|---|---|
| error（exit 1） | id 重复 / 依赖指向不存在节点 / 循环依赖（含路径）/ 迭代引用无效 / 总览表与里程碑双向不一致 / evidence 正则非法 |
| warning（仅提示） | 已完成但无完成记录 / 进行中但验收无一勾选 / evidence 声明为空 |

## 🤖 MCP 集成

`waymark mcp` 以 MCP stdio 服务启动，无需额外参数。在客户端配置中添加：

```json
{ "mcpServers": { "waymark": { "command": "waymark", "args": ["mcp"] } } }
```

| 工具 | 说明 |
|---|---|
| `waymark_summary` | 项目工作流总览（轻量 JSON：统计/迭代/节点状态） |
| `waymark_get_node` | 按 id 获取节点详情（验收/证据/提交/完成记录） |
| `waymark_list_ready` | 列出可开工节点 |
| `waymark_mark_done` | 标记节点完成并追加完成记录 |
| `waymark_check` | 校验 /plan 规范并返回错误/警示明细 |

结果按输入（plan/ + 证据目录 + git 索引）mtime 指纹缓存，高频调用不会重复扫描。

## 🔄 CI 自动渲染

参考 [docs/ci-example.yml](docs/ci-example.yml)：push 时自动 `sync + render` 并提交 `.waymark/index.html`（git 证据需要 `fetch-depth: 0`）。

## 🧰 工程结构

```
src/
├── cli.ts          # 入口：init / check / sync / done / ready / render / ui / mcp
├── parser/         # plan/ 文档解析（frontmatter + 完成记录 + 总览表）
├── graph/          # DAG 构建（拓扑排序/环检测）与 check 校验规则
├── infer/          # 证据四维评分 → 状态推断
├── sync/           # 声明×推断冲突矩阵 → workflow.json
├── render/         # 契约自检 + 数据注入单文件 HTML（含证据目录过期检测）
├── plan/           # done / ready 命令
├── ui/             # 本地服务：chokidar watch + SSE 热重载
├── mcp/            # MCP stdio 服务 + 工作流缓存
└── version.ts      # 版本号唯一来源（包根 package.json）
web/                # React 单页应用（xyflow DAG 画布 + dagre 布局）
tests/              # 17 个测试文件（parser/graph/infer/render/server/e2e/mcp）
```

## 🧭 已知事项

- 页面 SVG 动画在 GitHub 上可能被冻结为静态帧——banner 按静态优先设计
- 过期检测基于文件 mtime（plan/ + 证据目录 + git 索引），精确到文件系统时钟粒度
- 发版流程见 [RELEASE.md](RELEASE.md)

## 📜 License

[MIT](LICENSE) · 如果 waymark 帮你少开了一次进度对齐会，欢迎给它一颗 ⭐
