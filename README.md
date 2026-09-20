# planflow

`/plan` 驱动的项目进度工作流可视化 CLI：计划文档 + 代码证据 → 自动推断完成度 → DAG 工作流页面。

## 快速开始

```bash
npm link            # 在本包内：全局注册 planflow 命令
npm run build && npm run build:web   # 构建 CLI 与页面产物

cd /path/to/your-project
planflow init       # 生成 plan/ 骨架
planflow check      # 校验规范（id 唯一 / deps 存在 / 无循环依赖 / 迭代引用 / 总览一致）
planflow sync       # 生成 .planflow/workflow.json（含证据推断与警示）
planflow render     # 生成自包含 .planflow/index.html
planflow ui         # 本地实时页面（watch plan/、证据目录与 git），默认 http://localhost:7300
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

## 迭代演进

新增 `plan/iterations/I2-xxx.md` + 新节点文件标 `iteration: I2` → `ui` 模式数秒内自动出现在视图中。
