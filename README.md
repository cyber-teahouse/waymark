# waymark

`/plan` 驱动的项目进度工作流可视化 CLI：计划文档 + 代码证据 → 自动推断完成度 → DAG 工作流页面。

## 快速开始

```bash
npm link            # 在本包内：全局注册 waymark 命令
npm run build && npm run build:web   # 构建 CLI 与页面产物

cd /path/to/your-project
waymark init       # 生成 plan/ 骨架
waymark check      # 校验规范（id 唯一 / deps 存在 / 无循环依赖 / 迭代引用 / 总览一致）
waymark sync       # 生成 .waymark/workflow.json（含证据推断与警示）
waymark render     # 生成自包含 .waymark/index.html
waymark ui         # 本地实时页面（watch plan/、证据目录与 git），默认 http://localhost:7300

# 推进节点（AI agent 友好）
waymark done M-xxx -m "完成了什么" [--acc]   # 标记完成 + 追加完成记录（--acc 勾全部验收）
waymark ready                     # 列出可开工节点（planned 且依赖已满足）
```

## /plan 结构

```
plan/
├── overview.md          # 框架文档入口 + 里程碑总览表
├── milestones/*.md      # 一个节点一个文件（frontmatter: id/title/type/status/deps/iteration/evidence/acceptance）
└── iterations/*.md      # 迭代计划（frontmatter: id/title/goal/window）
```

状态机：`planned → in-progress → done`（旁路 blocked/dropped）。
证据四维：`paths`/`grep`/`tests`/`git`；推断只提示不覆盖声明；冲突高亮（⚠ 证据不足 / 💡 可标记完成）。

## 命令行参数

- 全局：`--root <dir>` 指定项目根目录（默认当前目录），对所有子命令生效；
- `ui -p, --port <n>`：本地服务端口（默认 7300）。

## 迭代演进

新增 `plan/iterations/I2-xxx.md` + 新节点文件标 `iteration: I2` → `ui` 模式数秒内自动出现在视图中。

## check 规则

- error（exit 1，可接 CI）：id 重复 / 依赖指向不存在节点 / 循环依赖（含路径）/ 迭代引用无效 / 总览表与里程碑双向不一致 / evidence 正则非法；
- warning（仅提示）：已完成但无完成记录 / 进行中但验收无一勾选 / evidence 声明为空。

## 可开工节点

`waymark ready` 列出 planned 且依赖已满足的节点；页面侧这些节点带「可开工」紫色标识，详情栏给出开工提示。

## MCP 集成

`waymark mcp` 以 MCP stdio 服务启动，把项目工作流暴露给 AI agent（ZCode / Claude 等），无需额外参数——`--root` 默认为当前目录。在客户端配置中添加：

```json
{ "mcpServers": { "waymark": { "command": "waymark", "args": ["mcp"] } } }
```

提供 5 个工具：`waymark_summary` 获取项目工作流总览（轻量 JSON：统计/迭代/节点状态）；`waymark_get_node` 按 id 获取节点详情（验收/证据/提交/完成记录）；`waymark_list_ready` 列出可开工节点；`waymark_mark_done` 标记节点完成并追加完成记录；`waymark_check` 校验 /plan 规范并返回错误/警示明细。

## CI 自动渲染

参考 [docs/ci-example.yml](docs/ci-example.yml)：push 时自动 `sync + render` 并提交 `.waymark/index.html`（git 证据需要 `fetch-depth: 0`）。

## License

MIT
