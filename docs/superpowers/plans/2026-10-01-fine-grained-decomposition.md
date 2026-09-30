# 更细的流程拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `waymark split`（里程碑→任务链拆分，CLI + MCP）与验收项加权进度（stats.progress，三处展示），配套 init 模板示范与中英文档。

**Architecture:** 拆分是纯约定——`deps` 表达层级（t1 继承原依赖、后续链式、原节点 deps 汇总全部任务），零 schema 变更；加权进度是 stats 的加性可选字段，所有展示位带回退。规格见 `docs/superpowers/specs/2026-10-01-fine-grained-decomposition-design.md`。

**Tech Stack:** TypeScript (Node ESM)、vitest、commander、MCP SDK、React (web)。

**环境注意（本机 Git Bash）：** PATH 不含 POSIX 形式的工具目录，每个 shell 命令前先
`export PATH="/d/my_code/Git/cmd:/usr/bin:/d/Program Files/nodejs:$PATH"`；
git 用 `/d/my_code/Git/cmd/git.exe`。**不要运行 `npm run build:web`**（web-dist 只会引入 CRLF/LF 行尾差异，勿当变更提交，见 memory `waymark-web-src-gap`）；web 侧改动用 `npm run typecheck` 验证。

---

### Task 1: split 引擎（src/plan/split.ts）

**Files:**
- Modify: `src/plan/commands.ts`（`loadPlanSource`/`writePlanSource` 加 `export`）
- Create: `src/plan/split.ts`
- Test: `tests/planSplit.test.ts`

- [ ] **Step 1: 导出 commands.ts 的读写助手**

在 `src/plan/commands.ts` 中把两处定义加 `export`（其余不动）：

```ts
export function loadPlanSource(abs: string): { text: string; crlf: boolean } {
```

```ts
export function writePlanSource(abs: string, text: string, crlf: boolean): void {
```

- [ ] **Step 2: 写失败测试 `tests/planSplit.test.ts`**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPlan } from "../src/parser/parsePlan.js";
import { splitNode } from "../src/plan/split.js";
import { makeSampleProject } from "./helpers.js";

describe("splitNode（里程碑拆分为任务链）", () => {
  it("生成任务链：t1 继承原依赖、后续链式、原节点 deps 汇总全部任务", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split-"));
    await makeSampleProject(root);
    const { created, warnings } = splitNode(root, "M2-auth", ["密码表单", "令牌刷新", "登出"]);
    expect(warnings).toEqual([]);
    expect(created.map((c) => c.id)).toEqual(["M2-auth-t1", "M2-auth-t2", "M2-auth-t3"]);
    expect(created.every((c) => c.file.startsWith("plan/milestones/"))).toBe(true);

    const plan = loadPlan(root);
    const byId = new Map(plan.nodes.map((n) => [n.fm.id, n]));
    expect(byId.get("M2-auth-t1")!.fm.deps).toEqual(["M1-core"]);
    expect(byId.get("M2-auth-t2")!.fm.deps).toEqual(["M2-auth-t1"]);
    expect(byId.get("M2-auth-t3")!.fm.deps).toEqual(["M2-auth-t2"]);
    expect(byId.get("M2-auth")!.fm.deps).toEqual(["M2-auth-t1", "M2-auth-t2", "M2-auth-t3"]);
    expect(byId.get("M2-auth-t1")!.fm.type).toBe("task");
    expect(byId.get("M2-auth-t1")!.fm.status).toBe("planned");
    expect(byId.get("M2-auth-t1")!.fm.iteration).toBe("I1");
  });

  it("原里程碑验收/证据/描述不动，只改 deps 行", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split2-"));
    await makeSampleProject(root);
    const file = path.join(root, "plan", "milestones", "M2-auth.md");
    const before = fs.readFileSync(file, "utf8");
    splitNode(root, "M2-auth", ["任务"]);
    const after = fs.readFileSync(file, "utf8");
    expect(after).toContain("paths: [src/auth/**, src/missing/**]");
    expect(after).toContain("- [x] 密码登录");
    expect(after).toContain("提供登录鉴权能力。");
    const stripDeps = (t: string) => t.replace(/^deps:.*$/m, "");
    expect(stripDeps(after)).toBe(stripDeps(before));
  });

  it("done/dropped 拒绝拆分；未知 id 报错；id 冲突报错", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split3-"));
    await makeSampleProject(root);
    expect(() => splitNode(root, "M1-core", ["x"])).toThrow(/已是 done/);
    expect(() => splitNode(root, "NOPE", ["x"])).toThrow(/未找到节点/);
    splitNode(root, "M3-login", ["任务一"]);
    expect(() => splitNode(root, "M3-login", ["任务二"])).toThrow(/任务 id 已存在/);
  });

  it("in-progress 拆分出警告", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split4-"));
    await makeSampleProject(root);
    const { warnings } = splitNode(root, "M2-auth", ["任务一"]);
    expect(warnings).toContain("M2-auth 进行中——拆分后请复核任务范围");
  });

  it("标题含 YAML 特殊字符（冒号/引号）时安全落盘", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split6-"));
    await makeSampleProject(root);
    splitNode(root, "M3-login", ['修复: 崩溃"']);
    const doc = loadPlan(root).nodes.find((n) => n.fm.id === "M3-login-t1")!;
    expect(doc.fm.title).toBe('修复: 崩溃"');
  });

  it("块式 deps 写法也能改写", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split5-"));
    await makeSampleProject(root);
    const file = path.join(root, "plan", "milestones", "M2-auth.md");
    fs.writeFileSync(
      file,
      fs.readFileSync(file, "utf8").replace("deps: [M1-core]", "deps:\n  - M1-core"),
      "utf8",
    );
    splitNode(root, "M2-auth", ["任务一"]);
    const text = fs.readFileSync(file, "utf8");
    expect(text).toContain("deps: [M2-auth-t1]");
    expect(text).not.toContain("- M1-core");
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/planSplit.test.ts`
Expected: FAIL（`Cannot find module .../src/plan/split.js`）

- [ ] **Step 4: 实现 `src/plan/split.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { loadPlan } from "../parser/parsePlan.js";
import { loadPlanSource, writePlanSource } from "./commands.js";

export interface SplitCreated {
  id: string;
  file: string;
}

export interface SplitResult {
  created: SplitCreated[];
  warnings: string[];
}

/** deps 行改写：兼容内联（deps: [a, b]）与块式（deps: 换行缩进列表）；缺失时插到 status 行后。 */
function rewriteDeps(raw: string, depsLine: string, id: string): string {
  if (/^deps:[^\n]*\]/m.test(raw) || /^deps:\s*\S+[^\n]*$/m.test(raw)) {
    return raw.replace(/^deps:[^\n]*$/m, depsLine);
  }
  if (/^deps:\s*$/m.test(raw)) {
    return raw.replace(/^deps:\s*\n(\s*-\s+[^\n]*\n?)*/m, `${depsLine}\n`);
  }
  if (/^status:[^\n]*\n/m.test(raw)) {
    return raw.replace(/^(status:[^\n]*\n)/m, `$1${depsLine}\n`);
  }
  throw new Error(`${id} 的 frontmatter 缺少 status/deps 声明，无法定位改写位置`);
}

/** 把节点拆成任务链：t1 继承原依赖，其后链式；原节点 deps 改写为全部任务（汇总闸口——
 *  任务未完成时 done 原节点触发既有「依赖未完成」护栏）。验收/证据/描述留在原节点——
 *  它是成果规格；任务只带标题与依赖。任务文件不进 overview.md（总览表强校验仅覆盖 milestone）。 */
export function splitNode(root: string, id: string, titles: string[]): SplitResult {
  if (titles.length === 0) throw new Error("未提供任务标题");
  const plan = loadPlan(root);
  const doc = plan.nodes.find((n) => n.fm.id === id);
  if (!doc) throw new Error(`未找到节点: ${id}`);
  if (doc.fm.status === "done" || doc.fm.status === "dropped") {
    throw new Error(`${id} 已是 ${doc.fm.status}——拆分前先 waymark reopen`);
  }
  const existing = new Set(plan.nodes.map((n) => n.fm.id));
  const taskIds = titles.map((_, i) => `${id}-t${i + 1}`);
  const clash = taskIds.filter((t) => existing.has(t));
  if (clash.length > 0) throw new Error(`任务 id 已存在: ${clash.join("、")}`);

  const warnings: string[] = [];
  if (doc.fm.status === "in-progress") warnings.push(`${id} 进行中——拆分后请复核任务范围`);
  if (doc.fm.type === "task") warnings.push(`${id} 本身是 task——通常只拆 milestone，请确认`);

  const dir = path.posix.dirname(doc.file);
  const created: SplitCreated[] = taskIds.map((tid, i) => {
    const deps = i === 0 ? doc.fm.deps : [taskIds[i - 1]];
    const iteration = doc.fm.iteration ? `iteration: ${doc.fm.iteration}\n` : "";
    // 标题按 YAML 双引号标量落盘：裸写含「: 」的标题会产生非法 frontmatter
    const yamlTitle = `"${titles[i].replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const rel = `${dir}/${tid}.md`;
    const body = [
      "---",
      `id: ${tid}`,
      `title: ${yamlTitle}`,
      "type: task",
      "status: planned",
      `deps: [${deps.join(", ")}]`,
      `${iteration}---`,
      "",
      "## 需求描述",
      "（拆分自动生成——补充这个任务要做什么）",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(root, rel), body, "utf8");
    return { id: tid, file: rel };
  });

  const abs = path.join(root, doc.file);
  const { text: raw, crlf } = loadPlanSource(abs);
  writePlanSource(abs, rewriteDeps(raw, `deps: [${taskIds.join(", ")}]`, id), crlf);

  return { created, warnings };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/planSplit.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 6: 格式化并提交**

```bash
npx biome check --write
git add src/plan/commands.ts src/plan/split.ts tests/planSplit.test.ts
git commit -m "feat(plan): waymark split 引擎——里程碑拆任务链（继承/链式/汇总闸口），验收证据留在原节点"
```

---

### Task 2: CLI `waymark split`

**Files:**
- Modify: `src/cli.ts`
- Test: `tests/cli.test.ts`

- [ ] **Step 1: 写失败测试（追加到 `tests/cli.test.ts` 末尾）**

先在文件顶部 import 区加：

```ts
import { loadPlan } from "../src/parser/parsePlan.js";
```

再追加：

```ts
describe("split 命令接线", () => {
  it("拆分输出清单且任务文件落库、deps 汇总", async () => {
    const root = await makeValidProject();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runCli(["split", "M2-auth", "密码表单", "令牌刷新", "--root", root]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("已拆出 2 个任务"));
    spy.mockRestore();
    const m2 = loadPlan(root).nodes.find((n) => n.fm.id === "M2-auth")!;
    expect(m2.fm.deps).toEqual(["M2-auth-t1", "M2-auth-t2"]);
  });

  it("done 节点拒绝拆分且退出码 1", async () => {
    const root = await makeValidProject();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runCli(["split", "M1-core", "x", "--root", root]);
    expect(process.exitCode).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("已是 done"));
    process.exitCode = 0;
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/cli.test.ts`
Expected: 新增 2 用例 FAIL（未知命令 `split`）

- [ ] **Step 3: 在 `src/cli.ts` 接线**

import 区（`./plan/commands.js` 的导入块之后）加：

```ts
import { splitNode } from "./plan/split.js";
```

在 `withRoot(program.command("ready"))` 命令块之前插入：

```ts
  withRoot(program.command("split"))
    .description("把节点拆成任务链：一个标题一个 task 文件，原节点 deps 汇总全部任务（拆细后逐个认领）")
    .argument("<id>", "节点 id")
    .argument("<titles...>", "任务标题（一个标题一个任务文件）")
    .action((id: string, titles: string[], _opts: unknown, cmd: Command) => {
      try {
        const root = rootOf(cmd);
        const { created, warnings } = splitNode(root, id, titles);
        console.log(`✔ 已拆出 ${created.length} 个任务（${id} 的 deps 已指向任务链）`);
        for (const c of created) console.log(`  + ${c.id}  ${c.file}`);
        for (const w of warnings) console.warn(`⚠ ${w}`);
        console.log("提示：运行 waymark sync 更新工作流数据");
      } catch (e) {
        console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
        process.exitCode = 1;
      }
    });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/cli.test.ts`
Expected: PASS

- [ ] **Step 5: 格式化并提交**

```bash
npx biome check --write
git add src/cli.ts tests/cli.test.ts
git commit -m "feat(cli): waymark split 命令接线"
```

---

### Task 3: MCP `waymark_split_node`

**Files:**
- Modify: `src/mcp/server.ts`
- Test: `tests/mcp.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/mcp.test.ts`：`TOOL_NAMES` 数组中 `"waymark_start_node"` 之后插入 `"waymark_split_node"`。文件末尾追加（沿用文件既有的 `setup`/`jsonOf` 辅助）：

```ts
describe("waymark_split_node", () => {
  it("拆分返回创建清单与 readyNext，首个任务可被 ready 列出", async () => {
    resetWorkflowCache();
    const root = await makeTempSample();
    const { client } = await setup(root);
    const result = await client.callTool({
      name: "waymark_split_node",
      arguments: { id: "M2-auth", titles: ["密码表单", "令牌刷新"] },
    });
    const json = jsonOf(result);
    expect(json.created.map((c: { id: string }) => c.id)).toEqual(["M2-auth-t1", "M2-auth-t2"]);
    expect(json.readyNext.some((r: { id: string }) => r.id === "M2-auth-t1")).toBe(true);
    await client.close();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/mcp.test.ts`
Expected: FAIL（工具不存在 / TOOL_NAMES 不匹配）

- [ ] **Step 3: 实现**

`src/mcp/server.ts`：import 区 `./plan/commands.js` 导入块之后加：

```ts
import { splitNode } from "../plan/split.js";
```

在 `waymark_start_node` 的 `server.registerTool` 块之后插入：

```ts
  server.registerTool(
    "waymark_split_node",
    {
      description:
        "把节点拆成任务链：titles 每项生成一个 task 文件（type: task，链式依赖），原节点 deps 改为指向全部任务；验收/证据留在原节点——大里程碑先拆细再逐个 waymark_start_node 认领",
      inputSchema: { id: z.string().min(1), titles: z.array(z.string().min(1)).min(1) },
    },
    async ({ id, titles }) => {
      const { created, warnings } = splitNode(root, id, titles);
      return jsonText({
        message: `已拆出 ${created.length} 个任务，原节点 deps 已汇总任务链`,
        created,
        warnings,
        readyNext: listReady(root),
      });
    },
  );
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/mcp.test.ts`
Expected: PASS

- [ ] **Step 5: 格式化并提交**

```bash
npx biome check --write
git add src/mcp/server.ts tests/mcp.test.ts
git commit -m "feat(mcp): waymark_split_node——agent 协议内拆分里程碑"
```

---

### Task 4: stats 验收项加权字段

**Files:**
- Modify: `src/types.ts`（stats schema）、`src/sync/synthesize.ts`（stats 计算）
- Test: `tests/synthesize.test.ts`

- [ ] **Step 1: 写失败测试（追加到 `tests/synthesize.test.ts` 末尾；缺的 import 补上：`fs`/`os`/`path`/`makeSampleProject`/`buildWorkflow`，按文件既有 import 风格）**

```ts
describe("验收项加权进度（stats.progress）", () => {
  it("done 记满、未 done 记验收勾选占比、dropped 不计权重", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-wprogress-"));
    await makeSampleProject(root);
    const { workflow } = await buildWorkflow(root);
    // 样例：M1-core done(2/2) + M2-auth in-progress(1/2) + M3-login planned(无验收)
    // 权重 = (1 + 0.5 + 0) / 3 = 50%
    expect(workflow.stats.progress).toBe(50);
    expect(workflow.stats.acceptanceTotal).toBe(4);
    expect(workflow.stats.acceptanceDone).toBe(3);
  });

  it("dropped 节点不计权重与验收统计；全部 dropped 时 progress 为 0（防除零）", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-wprogress2-"));
    await makeSampleProject(root);
    await dropNode(root, "M2-auth", { note: "外包" });
    await dropNode(root, "M3-login", { note: "砍掉" });
    let { workflow } = await buildWorkflow(root);
    // 只剩 done 的 M1-core：权重 1/1，验收只统计 M1 的 2/2
    expect(workflow.stats.progress).toBe(100);
    expect(workflow.stats.acceptanceTotal).toBe(2);
    expect(workflow.stats.acceptanceDone).toBe(2);

    await dropNode(root, "M1-core", { note: "全部放弃" });
    ({ workflow } = await buildWorkflow(root));
    expect(workflow.stats.progress).toBe(0);
  });
});
```

（缺的 import 按文件既有风格补：`dropNode` 来自 `../src/plan/commands.js`。）

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/synthesize.test.ts`
Expected: FAIL（`progress` undefined）

- [ ] **Step 3: types.ts 扩展 stats schema**

`src/types.ts` 的 `stats: z.object({...})` 中 `warnings: z.number(),` 之后加：

```ts
    acceptanceTotal: z.number().optional(),
    acceptanceDone: z.number().optional(),
    progress: z.number().optional(),
```

- [ ] **Step 4: synthesize.ts 计算**

`src/synthesize.ts`（路径为 `src/sync/synthesize.ts`）中原 `const stats = {...}` 整块替换为：

```ts
  // 验收项加权进度：非 dropped 节点各占 1 权重，done 记 1，否则记已勾验收占比（无验收记 0）
  const active = wfNodes.filter((n) => n.displayStatus !== "dropped");
  const accDone = (n: WorkflowNode): number => n.acceptance.filter((a) => a.done).length;
  const weight = active.reduce(
    (sum, n) =>
      sum +
      (n.displayStatus === "done"
        ? 1
        : n.acceptance.length > 0
          ? accDone(n) / n.acceptance.length
          : 0),
    0,
  );
  const stats = {
    total: wfNodes.length,
    done: wfNodes.filter((n) => n.displayStatus === "done").length,
    inProgress: wfNodes.filter((n) => n.displayStatus === "in-progress").length,
    planned: wfNodes.filter((n) => n.displayStatus === "planned").length,
    blocked: wfNodes.filter((n) => n.displayStatus === "blocked").length,
    dropped: wfNodes.filter((n) => n.displayStatus === "dropped").length,
    warnings: wfNodes.filter((n) => n.warning !== null).length,
    acceptanceTotal: active.reduce((sum, n) => sum + n.acceptance.length, 0),
    acceptanceDone: active.reduce((sum, n) => sum + accDone(n), 0),
    progress: active.length > 0 ? Math.round((weight / active.length) * 100) : 0,
  };
```

- [ ] **Step 5: 运行全量 synthesize + types 测试确认通过（契约自检在 synthesize 末尾会验证新字段合法）**

Run: `npx vitest run tests/synthesize.test.ts tests/types.test.ts`
Expected: PASS

- [ ] **Step 6: 格式化并提交**

```bash
npx biome check --write
git add src/types.ts src/sync/synthesize.ts tests/synthesize.test.ts
git commit -m "feat(sync): stats 增加验收项加权进度（acceptanceTotal/acceptanceDone/progress，契约加性扩展）"
```

---

### Task 5: status 进度条切加权口径

**Files:**
- Modify: `src/plan/status.ts:31`
- Test: `tests/status.test.ts`

- [ ] **Step 1: 写失败测试（追加到 `tests/status.test.ts`；沿用文件既有 import，缺 `makeSampleProject` 则补 `import { makeSampleProject } from "./helpers.js";`）**

```ts
describe("加权进度条", () => {
  it("progress 字段存在时按加权口径展示（样例 50% 而非节点比 33%）", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-statusp-"));
    await makeSampleProject(root);
    const { buildWorkflow } = await import("../src/sync/build.js");
    const { workflow } = await buildWorkflow(root);
    const out = renderStatus(workflow, new Date());
    expect(out).toContain("50%（1/3）");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/status.test.ts`
Expected: FAIL（现为 `33%（1/3）`）

- [ ] **Step 3: 修改 `src/plan/status.ts` 第 31 行**

```ts
  const pct =
    typeof s.progress === "number"
      ? s.progress
      : s.total > 0
        ? Math.round((s.done / s.total) * 100)
        : 0;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/status.test.ts`
Expected: PASS（既有用例不受影响——旧数据无 progress 字段走回退分支）

- [ ] **Step 5: 格式化并提交**

```bash
npx biome check --write
git add src/plan/status.ts tests/status.test.ts
git commit -m "feat(status): 进度条切验收项加权口径（旧数据回退节点比）"
```

---

### Task 6: hub 圆环切加权口径

**Files:**
- Modify: `src/hub/hub.ts`（`HubEntry.stats` 内联类型 + percent 计算）
- Test: `tests/hub.test.ts`

- [ ] **Step 1: 写失败测试（追加到 `tests/hub.test.ts`，沿用文件既有 import；缺 `renderHubHtml`/`gatherHubData` 按既有用例的导入方式补）**

```ts
describe("加权完成率圆环", () => {
  it("优先 stats.progress，缺失回退 done/total", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-hubp-"));
    const proj = path.join(root, "alpha");
    fs.mkdirSync(path.join(proj, ".waymark"), { recursive: true });
    const stats = { total: 2, done: 1, inProgress: 1, planned: 0, blocked: 0, dropped: 0, warnings: 0 };
    const write = (s: object) =>
      fs.writeFileSync(
        path.join(proj, ".waymark", "workflow.json"),
        JSON.stringify({
          version: 1,
          generatedAt: new Date().toISOString(),
          project: "alpha",
          nodes: [],
          edges: [],
          iterations: [],
          stats: s,
        }),
        "utf8",
      );
    const page = (p: string) => {
      fs.mkdirSync(path.join(p, ".waymark"), { recursive: true });
      fs.writeFileSync(path.join(p, ".waymark", "index.html"), "<html></html>", "utf8");
    };
    write({ ...stats, progress: 75 });
    page(proj);
    const html = renderHubHtml(gatherHubData([proj.replace(/\\/g, "/")]), new Date().toISOString());
    expect(html).toContain(">75<");

    write(stats); // 旧数据无 progress → 回退 1/2 = 50
    const html2 = renderHubHtml(gatherHubData([proj.replace(/\\/g, "/")]), new Date().toISOString());
    expect(html2).toContain(">50<");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/hub.test.ts`
Expected: FAIL（两处都渲染 50）

- [ ] **Step 3: 修改 `src/hub/hub.ts`**

`HubEntry` 接口的 `stats` 内联类型 `warnings: number;` 之后加一行：

```ts
    progress?: number;
```

`renderHubHtml` 中的 percent 计算（原 `const percent = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;`）替换为：

```ts
      const percent =
        typeof s.progress === "number"
          ? s.progress
          : s.total > 0
            ? Math.round((s.done / s.total) * 100)
            : 0;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/hub.test.ts`
Expected: PASS

- [ ] **Step 5: 格式化并提交**

```bash
npx biome check --write
git add src/hub/hub.ts tests/hub.test.ts
git commit -m "feat(hub): 完成率圆环优先 stats.progress（旧 workflow.json 回退节点比）"
```

---

### Task 7: web 页面进度切加权口径

**Files:**
- Modify: `web/src/App.tsx`（第 208 行附近 percent 计算）

- [ ] **Step 1: 修改 percent 计算**

`web/src/App.tsx` 中（原）：

```tsx
  const percent = scopeStats.total > 0 ? Math.round((scopeStats.done / scopeStats.total) * 100) : 0;
```

替换为（与 stats.progress 同口径，且支持迭代筛选范围）：

```tsx
  // 验收项加权：done 记满、未 done 记勾选占比，dropped 不计——与 stats.progress 同口径
  const activeNodes = scopeNodes.filter((n) => n.displayStatus !== "dropped");
  const percent =
    activeNodes.length > 0
      ? Math.round(
          (activeNodes.reduce(
            (sum, n) =>
              sum +
              (n.displayStatus === "done"
                ? 1
                : n.acceptance.length > 0
                  ? n.acceptance.filter((a) => a.done).length / n.acceptance.length
                  : 0),
            0,
          ) /
            activeNodes.length) *
            100,
        )
      : 0;
```

- [ ] **Step 2: 类型检查验证（不跑 build:web，见环境注意）**

Run: `npm run typecheck`
Expected: 无错误（两端 tsconfig 都过）

- [ ] **Step 3: 提交**

```bash
git add web/src/App.tsx
git commit -m "feat(web): 进度显示切验收项加权口径（迭代筛选范围同口径）"
```

---

### Task 8: init 模板示范任务链

**Files:**
- Modify: `src/init/templates.ts`、`src/scaffold.ts`
- Test: `tests/scaffold.test.ts`

- [ ] **Step 1: 写失败测试（追加到 `tests/scaffold.test.ts`，沿用既有 import；缺则补 `import { collectPlanIssues } from "../src/plan/check.js";` 与 `import { listReady } from "../src/plan/commands.js";`）**

```ts
describe("骨架任务链示例", () => {
  it("新骨架 check 一次通过，ready 初始给出 t1 而非光杆里程碑", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-scaffold-split-"));
    runInit(root);
    expect(fs.existsSync(path.join(root, "plan", "milestones", "M1-example-t1.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "plan", "milestones", "M1-example-t2.md"))).toBe(true);
    expect(collectPlanIssues(root).filter((i) => i.level === "error")).toEqual([]);
    expect(listReady(root).map((r) => r.id)).toEqual(["M1-example-t1"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/scaffold.test.ts`
Expected: FAIL（t1 文件不存在）

- [ ] **Step 3: 修改 `src/init/templates.ts`**

`NODE_MD` 中 `deps: []` 改为：

```
deps: [M1-example-t1, M1-example-t2]
```

文件末尾追加两个模板：

```ts
export const TASK1_MD = `---
id: M1-example-t1
title: 示例任务一（先做）
type: task
status: planned
deps: []
iteration: I1
---

## 需求描述
（一个 task = 一个 PR / 一次 agent 会话能完成的量）
`;

export const TASK2_MD = `---
id: M1-example-t2
title: 示例任务二（依赖任务一）
type: task
status: planned
deps: [M1-example-t1]
iteration: I1
---

## 需求描述
（任务链让 waymark ready 一次只给出一个可开工单元）
`;
```

- [ ] **Step 4: 修改 `src/scaffold.ts`**

import 行改为：

```ts
import { ITERATION_MD, NODE_MD, OVERVIEW_MD, TASK1_MD, TASK2_MD } from "./init/templates.js";
```

`runInit` 中 `M1-example.md` 写入行之后加：

```ts
  fs.writeFileSync(path.join(planDir, "milestones", "M1-example-t1.md"), TASK1_MD, "utf8");
  fs.writeFileSync(path.join(planDir, "milestones", "M1-example-t2.md"), TASK2_MD, "utf8");
```

末尾 `console.log` 的骨架描述改为：

```ts
  console.log("✔ 已生成 plan/ 骨架：overview.md + iterations/I1.md + milestones/（1 里程碑 + 2 任务链示例）");
```

- [ ] **Step 5: 运行测试确认通过（注意既有 scaffold 用例若断言文件数量/输出文案需同步）**

Run: `npx vitest run tests/scaffold.test.ts tests/parsePlan.test.ts`
Expected: PASS（若既有用例断言「M1-example.md」存在性不受影响；断言 init 输出文案的用例改成新文案）

- [ ] **Step 6: 格式化并提交**

```bash
npx biome check --write
git add src/init/templates.ts src/scaffold.ts tests/scaffold.test.ts
git commit -m "feat(init): 骨架示范任务链——里程碑 + 2 任务，ready 初始给出任务"
```

---

### Task 9: 文档 + dist 重建 + 全量验证 + 狗粮

**Files:**
- Modify: `README.md`、`README.en.md`、`dist/**`（构建产物，随源码一起提交）

- [ ] **Step 1: README.md 三处**

「🗺️ 命令一览」表 `waymark ready` 行之后加：

```markdown
| `waymark split <id> <标题…>` | 把节点拆成任务链：一个标题一个 task 文件（链式依赖），原节点 deps 汇总全部任务；验收/证据留在原节点 |
```

「🤖 MCP 集成」表 `waymark_start_node` 行之后加：

```markdown
| `waymark_split_node` | 把节点拆成任务链（titles 数组，链式依赖），返回创建清单与下一步可开工节点——大里程碑先拆细再认领 |
```

「🪧 /plan 结构」的三个 bullet 之后加一个 bullet：

```markdown
- **拆分约定**：milestone = 交付物（验收/证据挂这），task = 一个 PR / 一次 agent 会话；`waymark split M-xxx 任务一 任务二` 生成任务链（t1 继承依赖、后续链式、里程碑 deps 汇总），`ready` 一次只给一个可开工单元
```

- [ ] **Step 2: README.en.md 对应三处（英文表述，位置同 README.md）**

Commands 表加：

```markdown
| `waymark split <id> <title…>` | Split a node into a task chain: one title per task file (chained deps), the node's deps roll up to all tasks; acceptance/evidence stay on the original node |
```

MCP 表加：

```markdown
| `waymark_split_node` | Split a node into a task chain (array of titles, chained deps); returns created tasks and the next ready nodes — decompose big milestones before claiming |
```

/The plan structure/ 的 bullet 后加：

```markdown
- **Decomposition convention**: milestone = the outcome (acceptance/evidence live here), task = one PR / one agent session; `waymark split M-xxx task-one task-two` generates a task chain (t1 inherits deps, the rest chain, the milestone's deps roll up) so `ready` yields one claimable unit at a time
```

- [ ] **Step 3: 全量验证**

```bash
npm run build        # 重建 dist（src 变了；CI 有 dist 漂移校验）
npm test             # biome + typecheck + vitest 全量
```

Expected: 全绿（用例数 ≥ 162 + 新增约 12 个）

- [ ] **Step 4: 狗粮验证（临时目录走全链路；注意 init 骨架已含 M1-example + t1/t2 任务链，勿对 M1-example 再 split——会撞 id）**

```bash
# A：任务链示范 + task 再拆（临时项目）
node dist/cli.js init --root /tmp/wm-dogfood-a
node dist/cli.js ready --root /tmp/wm-dogfood-a            # 应只给 M1-example-t1
node dist/cli.js start M1-example-t1 --root /tmp/wm-dogfood-a
node dist/cli.js done M1-example-t1 -m "第一个任务" --root /tmp/wm-dogfood-a
node dist/cli.js ready --root /tmp/wm-dogfood-a            # 应轮到 M1-example-t2
node dist/cli.js sync --root /tmp/wm-dogfood-a
node dist/cli.js status --root /tmp/wm-dogfood-a           # 应为 33%（t1 done 1 权重 / 3 active）
node dist/cli.js split M1-example-t2 子步骤A 子步骤B --root /tmp/wm-dogfood-a   # 拆 planned 的 t2：出「本身是 task」警告但允许
node dist/cli.js ready --root /tmp/wm-dogfood-a            # 应轮到 M1-example-t2-t1
node dist/cli.js sync --root /tmp/wm-dogfood-a
node dist/cli.js status --root /tmp/wm-dogfood-a           # 应为 20%（done 1 / active 5）
node dist/cli.js check --root /tmp/wm-dogfood-a            # 校验通过
# B：done 节点拒绝拆分（本仓库自身）
node dist/cli.js split M1-sse-refresh x
```

Expected: A 全链路符合注释预期；B 输出 `✖ M1-sse-refresh 已是 done——拆分前先 waymark reopen`，退出码 1。验证后 `rm -rf /tmp/wm-dogfood-a`。

- [ ] **Step 5: 提交**

```bash
git add README.md README.en.md dist
git commit -m "docs: split 与加权进度进 README（中英）；dist 重建"
```

---

## 收尾（不在本计划内，提醒）

- 发版：这些改动随下次 release（0.3.3 或并入未发布的 0.3.2 决策由用户定）走 RELEASE.md 流程。
- 本仓库 dogfooding：可用 `waymark split` 拆未来的 I2/I3 里程碑。
