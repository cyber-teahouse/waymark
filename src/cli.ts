#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { loadPlan } from "./parser/parsePlan.js";
import { buildGraph } from "./graph/buildGraph.js";
import { validatePlan, validatePatterns } from "./graph/validate.js";
import { runInit } from "./scaffold.js";
import { buildWorkflow } from "./sync/build.js";
import { loadBundle, renderWorkflowHtml, writeIndexHtml, writeWorkflow } from "./render/render.js";

const program = new Command();
program.name("planflow").description("/plan 驱动的项目进度工作流可视化")
  .version("0.1.0").option("--root <dir>", "项目根目录", process.cwd());

program.command("check")
  .description("校验 /plan 文档规范")
  .action(() => {
    const root = program.opts<{ root: string }>().root;
    const plan = loadPlan(root);
    const graph = buildGraph(plan.nodes);
    const issues = [
      ...plan.issues,
      ...validatePlan({ ...plan, graph }),
      ...validatePatterns(plan.nodes),
    ];
    for (const i of issues) {
      console.log(`${i.level === "error" ? "✖" : "⚠"} [${i.level}] ${i.file}: ${i.message}`);
    }
    const errors = issues.filter(i => i.level === "error").length;
    if (errors > 0) {
      console.error(`✖ 校验失败: ${errors} 个错误`);
      process.exitCode = 1;
    } else {
      console.log("✔ 校验通过");
    }
  });

program.command("sync")
  .description("解析 /plan + 代码证据 → 生成 .planflow/workflow.json")
  .action(async () => {
    const root = program.opts<{ root: string }>().root;
    const { workflow, issues } = await buildWorkflow(root);
    writeWorkflow(root, workflow);
    const s = workflow.stats;
    console.log(`✔ workflow.json 已生成: ${path.join(root, ".planflow", "workflow.json")}`);
    console.log(`节点 ${s.total} | 完成 ${s.done} | 进行中 ${s.inProgress} | 未开始 ${s.planned} | 警示 ${s.warnings}`);
    for (const i of issues) {
      console.log(`${i.level === "error" ? "✖" : "⚠"} [${i.level}] ${i.file}: ${i.message}`);
    }
    if (issues.some(i => i.level === "error")) process.exitCode = 1;
  });

program.command("render")
  .description("由 .planflow/workflow.json 生成自包含 index.html")
  .action(() => {
    const root = program.opts<{ root: string }>().root;
    const wfFile = path.join(root, ".planflow", "workflow.json");
    if (!fs.existsSync(wfFile)) {
      console.error("✖ 未找到 .planflow/workflow.json，请先运行 planflow sync");
      process.exitCode = 1;
      return;
    }
    try {
      const workflow = JSON.parse(fs.readFileSync(wfFile, "utf8"));
      const html = renderWorkflowHtml(workflow, loadBundle());
      writeIndexHtml(root, html);
      console.log(`✔ 已生成 ${path.join(root, ".planflow", "index.html")}（可直接用浏览器打开）`);
    } catch (e) {
      console.error(`✖ ${(e instanceof Error) ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  });

program.command("ui")
  .description("启动本地实时工作流页面（watch plan/ 与证据目录）")
  .option("-p, --port <n>", "端口", "7300")
  .action(async (opts: { port: string }) => {
    const root = program.opts<{ root: string }>().root;
    const port = Number(opts.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      console.error("✖ 端口无效: " + opts.port);
      process.exitCode = 1;
      return;
    }
    try {
      const { startServer } = await import("./ui/server.js");
      startServer(root, port);
    } catch (e) {
      console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  });

program.command("init")
  .description("在项目根生成 plan/ 骨架")
  .action(() => {
    const root = program.opts<{ root: string }>().root;
    try {
      runInit(root);
    } catch (e) {
      console.error(`✖ ${(e as Error).message}`);
      process.exitCode = 1;
    }
  });

export async function runCli(argv: string[]): Promise<void> {
  await program.parseAsync(argv);
}

if (process.argv[1]?.endsWith("cli.js") || process.argv[1]?.endsWith("cli.ts")) {
  await runCli(process.argv);
}
