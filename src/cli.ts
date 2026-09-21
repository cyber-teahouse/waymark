#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { loadPlan } from "./parser/parsePlan.js";
import { buildGraph } from "./graph/buildGraph.js";
import { validatePlan, validatePatterns } from "./graph/validate.js";
import { runInit } from "./scaffold.js";
import { buildWorkflow } from "./sync/build.js";
import { loadBundle, renderWorkflowHtml, writeIndexHtml, writeWorkflow, planNewerThan } from "./render/render.js";
import { markDone, listReady } from "./plan/commands.js";

const program = new Command();
program.name("waymark").description("/plan 驱动的项目进度工作流可视化")
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
  .description("解析 /plan + 代码证据 → 生成 .waymark/workflow.json")
  .action(async () => {
    const root = program.opts<{ root: string }>().root;
    const { workflow, issues } = await buildWorkflow(root);
    writeWorkflow(root, workflow);
    const s = workflow.stats;
    console.log(`✔ workflow.json 已生成: ${path.join(root, ".waymark", "workflow.json")}`);
    console.log(`节点 ${s.total} | 完成 ${s.done} | 进行中 ${s.inProgress} | 未开始 ${s.planned} | 警示 ${s.warnings}`);
    for (const i of issues) {
      console.log(`${i.level === "error" ? "✖" : "⚠"} [${i.level}] ${i.file}: ${i.message}`);
    }
    if (issues.some(i => i.level === "error")) process.exitCode = 1;
  });

program.command("done")
  .description("把节点标记为完成并追加完成记录（AI agent 友好的收尾命令）")
  .argument("<id>", "节点 id")
  .option("-m, --note <text>", "完成说明（追加到「完成记录」，日期为今天）")
  .option("--acc", "同时勾选全部验收标准")
  .action((id: string, opts: { note?: string; acc?: boolean }) => {
    try {
      const root = program.opts<{ root: string }>().root;
      const { file } = markDone(root, id, { note: opts.note, allAcceptance: opts.acc });
      console.log(`✔ ${id} 已标记完成（${file}）`);
      const plan = loadPlan(root);
      const graph = buildGraph(plan.nodes);
      const issues = [
        ...plan.issues,
        ...validatePlan({ ...plan, graph }),
        ...validatePatterns(plan.nodes),
      ];
      const errors = issues.filter(i => i.level === "error").length;
      if (errors > 0) {
        console.warn(`⚠ 当前计划存在 ${errors} 个规范错误（waymark check 查看）`);
        process.exitCode = 1;
      }
      console.log("提示：运行 waymark sync 更新工作流数据");
    } catch (e) {
      console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  });

program.command("ready")
  .description("列出当前可开工的节点（planned 且依赖已满足）")
  .action(() => {
    const root = program.opts<{ root: string }>().root;
    const items = listReady(root);
    if (items.length === 0) {
      console.log("没有可开工节点（无 planned 状态，或依赖未满足）");
      return;
    }
    console.log(`可开工 ${items.length} 个节点:`);
    for (const it of items) {
      console.log(`  ${it.id}  ${it.title}${it.iteration ? `  [${it.iteration}]` : ""}`);
    }
  });

program.command("render")
  .description("由 .waymark/workflow.json 生成自包含 index.html")
  .action(() => {
    const root = program.opts<{ root: string }>().root;
    const wfFile = path.join(root, ".waymark", "workflow.json");
    if (!fs.existsSync(wfFile)) {
      console.error("✖ 未找到 .waymark/workflow.json，请先运行 waymark sync");
      process.exitCode = 1;
      return;
    }
    try {
      const workflow = JSON.parse(fs.readFileSync(wfFile, "utf8"));
      if (planNewerThan(root, wfFile)) {
        console.warn("⚠ plan/ 在 sync 之后有改动，工作流数据可能过期——建议重新 waymark sync");
      }
      const html = renderWorkflowHtml(workflow, loadBundle());
      writeIndexHtml(root, html);
      console.log(`✔ 已生成 ${path.join(root, ".waymark", "index.html")}（可直接用浏览器打开）`);
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

program.command("mcp")
  .description("以 MCP stdio 服务启动（供 AI agent 集成）")
  .action(async () => {
    const root = program.opts<{ root: string }>().root;
    const { startMcpServer } = await import("./mcp/server.js");
    await startMcpServer(root);
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
