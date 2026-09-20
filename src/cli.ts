#!/usr/bin/env node
import { Command } from "commander";
import { loadPlan } from "./parser/parsePlan.js";
import { buildGraph } from "./graph/buildGraph.js";
import { validatePlan, validatePatterns } from "./graph/validate.js";

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

export async function runCli(argv: string[]): Promise<void> {
  await program.parseAsync(argv);
}

if (process.argv[1]?.endsWith("cli.js") || process.argv[1]?.endsWith("cli.ts")) {
  await runCli(process.argv);
}
