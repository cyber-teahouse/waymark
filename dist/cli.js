#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { getVersion } from "./version.js";
import { collectPlanIssues } from "./plan/check.js";
import { runInit } from "./scaffold.js";
import { buildWorkflow } from "./sync/build.js";
import { loadBundle, renderWorkflowHtml, writeIndexHtml, writeWorkflow, planNewerThan } from "./render/render.js";
import { markDone, listReady, startNode, blockNode, dropNode, reopenNode } from "./plan/commands.js";
import { gatherHubData, renderHubHtml } from "./hub/hub.js";
/**
 * 创建一套全新的命令树。每次 runCli 调用都新建 program，
 * 避免 commander 单例重复 parse 的状态残留（测试中多次调用尤其重要）。
 */
export function createProgram() {
    const program = new Command();
    program.name("waymark").description("/plan 驱动的项目进度工作流可视化")
        .version(getVersion()).option("--root <dir>", "项目根目录", process.cwd());
    /** 解析项目根：子命令后置 --root 优先，回退全局（前置）选项。 */
    const rootOf = (cmd) => cmd.opts().root ?? program.opts().root;
    /** 子命令统一挂载 --root（agent 习惯把 flag 放在子命令之后；commander 全局选项只认前置）。 */
    const withRoot = (cmd) => cmd.option("--root <dir>", "项目根目录（默认当前目录）");
    withRoot(program.command("check"))
        .description("校验 /plan 文档规范")
        .action((_opts, cmd) => {
        const root = rootOf(cmd);
        const issues = collectPlanIssues(root);
        for (const i of issues) {
            console.log(`${i.level === "error" ? "✖" : "⚠"} [${i.level}] ${i.file}: ${i.message}`);
        }
        const errors = issues.filter(i => i.level === "error").length;
        if (errors > 0) {
            console.error(`✖ 校验失败: ${errors} 个错误`);
            process.exitCode = 1;
        }
        else {
            console.log("✔ 校验通过");
        }
    });
    withRoot(program.command("sync"))
        .description("解析 /plan + 代码证据 → 生成 .waymark/workflow.json")
        .action(async (_opts, cmd) => {
        const root = rootOf(cmd);
        const { workflow, issues } = await buildWorkflow(root);
        writeWorkflow(root, workflow);
        const s = workflow.stats;
        console.log(`✔ workflow.json 已生成: ${path.join(root, ".waymark", "workflow.json")}`);
        console.log(`节点 ${s.total} | 完成 ${s.done} | 进行中 ${s.inProgress} | 未开始 ${s.planned} | 警示 ${s.warnings}`);
        for (const i of issues) {
            console.log(`${i.level === "error" ? "✖" : "⚠"} [${i.level}] ${i.file}: ${i.message}`);
        }
        if (issues.some(i => i.level === "error"))
            process.exitCode = 1;
    });
    withRoot(program.command("start"))
        .description("认领开工：把 planned 节点标记为 in-progress（AI agent 友好）")
        .argument("<id>", "节点 id")
        .action((id, _opts, cmd) => {
        try {
            const root = rootOf(cmd);
            const { file, warnings } = startNode(root, id);
            console.log(`✔ ${id} 已开工（in-progress，${file}）`);
            for (const w of warnings)
                console.warn(`⚠ ${w}`);
        }
        catch (e) {
            console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
            process.exitCode = 1;
        }
    });
    withRoot(program.command("done"))
        .description("把节点标记为完成并追加完成记录（AI agent 友好的收尾命令）")
        .argument("<id>", "节点 id")
        .option("-m, --note <text>", "完成说明（追加到「完成记录」，日期为今天）")
        .option("--acc", "同时勾选全部验收标准")
        .action((id, opts, cmd) => {
        try {
            const root = rootOf(cmd);
            const { file, warnings } = markDone(root, id, { note: opts.note, allAcceptance: opts.acc });
            console.log(`✔ ${id} 已标记完成（${file}）`);
            for (const w of warnings)
                console.warn(`⚠ ${w}`);
            const issues = collectPlanIssues(root);
            const errors = issues.filter(i => i.level === "error").length;
            if (errors > 0) {
                console.warn(`⚠ 当前计划存在 ${errors} 个规范错误（waymark check 查看）`);
                process.exitCode = 1;
            }
            console.log("提示：运行 waymark sync 更新工作流数据");
        }
        catch (e) {
            console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
            process.exitCode = 1;
        }
    });
    withRoot(program.command("block"))
        .description("把节点标记为受阻 blocked（旁路状态，解除后用 waymark reopen 恢复）")
        .argument("<id>", "节点 id")
        .option("-m, --note <text>", "阻塞说明（追加到「完成记录」，带 [blocked] 前缀）")
        .action((id, opts, cmd) => {
        try {
            const root = rootOf(cmd);
            const { file, warnings } = blockNode(root, id, { note: opts.note });
            console.log(`✔ ${id} 已标记受阻（${file}）`);
            for (const w of warnings)
                console.warn(`⚠ ${w}`);
        }
        catch (e) {
            console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
            process.exitCode = 1;
        }
    });
    withRoot(program.command("drop"))
        .description("放弃节点：标记为 dropped（旁路状态，不再计入待办）")
        .argument("<id>", "节点 id")
        .option("-m, --note <text>", "放弃原因（追加到「完成记录」，带 [dropped] 前缀）")
        .action((id, opts, cmd) => {
        try {
            const root = rootOf(cmd);
            const { file, warnings } = dropNode(root, id, { note: opts.note });
            console.log(`✔ ${id} 已放弃（dropped，${file}）`);
            for (const w of warnings)
                console.warn(`⚠ ${w}`);
        }
        catch (e) {
            console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
            process.exitCode = 1;
        }
    });
    withRoot(program.command("reopen"))
        .description("重新打开 done/blocked/dropped 节点（撤销误操作，恢复为 in-progress）")
        .argument("<id>", "节点 id")
        .option("--planned", "恢复为 planned 而非 in-progress（退回未开始）")
        .option("-m, --note <text>", "说明（追加到「完成记录」，带 [reopened] 前缀）")
        .action((id, opts, cmd) => {
        try {
            const root = rootOf(cmd);
            const { file, warnings } = reopenNode(root, id, { planned: opts.planned, note: opts.note });
            console.log(`✔ ${id} 已重新打开（${opts.planned ? "planned" : "in-progress"}，${file}）`);
            for (const w of warnings)
                console.warn(`⚠ ${w}`);
        }
        catch (e) {
            console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
            process.exitCode = 1;
        }
    });
    withRoot(program.command("ready"))
        .description("列出当前可开工的节点（planned 且依赖已满足）")
        .action((_opts, cmd) => {
        const root = rootOf(cmd);
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
    withRoot(program.command("render"))
        .description("由 .waymark/workflow.json 生成自包含 index.html")
        .option("--fresh", "数据缺失或过期时自动执行 sync 后再渲染")
        .action(async (opts, cmd) => {
        const root = rootOf(cmd);
        const wfFile = path.join(root, ".waymark", "workflow.json");
        const missing = !fs.existsSync(wfFile);
        const stale = !missing && planNewerThan(root, wfFile);
        if (missing || stale) {
            if (opts.fresh) {
                try {
                    const { workflow, issues } = await buildWorkflow(root);
                    writeWorkflow(root, workflow);
                    if (issues.some(i => i.level === "error")) {
                        console.warn("⚠ plan 存在规范错误（waymark check 查看），已按当前数据渲染");
                    }
                    console.log(missing ? "ℹ 未找到 workflow.json，已自动 sync" : "ℹ 数据已过期，已自动重新 sync");
                }
                catch (e) {
                    console.error(`✖ 自动 sync 失败: ${(e instanceof Error) ? e.message : String(e)}`);
                    process.exitCode = 1;
                    return;
                }
            }
            else if (missing) {
                console.error("✖ 未找到 .waymark/workflow.json，请先运行 waymark sync（或使用 --fresh 自动同步）");
                process.exitCode = 1;
                return;
            }
            else {
                console.warn("⚠ plan/ 或证据目录在 sync 之后有改动，工作流数据可能过期——建议重新 waymark sync（或使用 --fresh）");
            }
        }
        try {
            const workflow = JSON.parse(fs.readFileSync(wfFile, "utf8"));
            const html = renderWorkflowHtml(workflow, loadBundle());
            writeIndexHtml(root, html);
            console.log(`✔ 已生成 ${path.join(root, ".waymark", "index.html")}（可直接用浏览器打开）`);
        }
        catch (e) {
            console.error(`✖ ${(e instanceof Error) ? e.message : String(e)}`);
            process.exitCode = 1;
        }
    });
    withRoot(program.command("ui"))
        .description("启动本地实时工作流页面（watch plan/ 与证据目录）")
        .option("-p, --port <n>", "端口", "7300")
        .action(async (opts, cmd) => {
        const root = rootOf(cmd);
        const port = Number(opts.port);
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
            console.error("✖ 端口无效: " + opts.port);
            process.exitCode = 1;
            return;
        }
        try {
            const { startServer } = await import("./ui/server.js");
            startServer(root, port);
        }
        catch (e) {
            console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
            process.exitCode = 1;
        }
    });
    withRoot(program.command("mcp"))
        .description("以 MCP stdio 服务启动（供 AI agent 集成）")
        .action(async (_opts, cmd) => {
        const root = rootOf(cmd);
        const { startMcpServer } = await import("./mcp/server.js");
        await startMcpServer(root);
    });
    withRoot(program.command("hub"))
        .description("聚合多个项目的进度为一张总览页（在项目们的父目录运行）")
        .argument("[patterns...]", "项目目录 glob，默认 --root 下的一级子目录")
        .option("-o, --out <file>", "输出文件路径（相对 --root 解析）", path.join(".waymark", "hub.html"))
        .action((patterns, opts, cmd) => {
        try {
            const root = rootOf(cmd);
            const rootUrl = root.replace(/\\/g, "/").replace(/\/+$/, "");
            const abs = (p) => path.isAbsolute(p) ? p.replace(/\\/g, "/") : `${rootUrl}/${p.replace(/\\/g, "/")}`;
            const entries = gatherHubData((patterns.length > 0 ? patterns : ["*"]).map(abs));
            const outFile = path.isAbsolute(opts.out) ? opts.out : path.join(root, opts.out);
            fs.mkdirSync(path.dirname(outFile), { recursive: true });
            fs.writeFileSync(outFile, renderHubHtml(entries, new Date().toISOString()), "utf8");
            const synced = entries.filter(e => e.found).length;
            console.log(`✔ hub 总览已生成: ${outFile}`);
            console.log(`项目 ${entries.length} | 已同步 ${synced} | 未同步 ${entries.length - synced}`);
            for (const e of entries) {
                if (!e.found)
                    console.log(`  ⚠ ${e.name}: ${e.error}`);
                else if (!e.pagePath)
                    console.log(`  ⚠ ${e.name}: 页面未渲染（waymark render）`);
            }
        }
        catch (e) {
            console.error(`✖ ${e.message}`);
            process.exitCode = 1;
        }
    });
    withRoot(program.command("init"))
        .description("在项目根生成 plan/ 骨架")
        .action((_opts, cmd) => {
        const root = rootOf(cmd);
        try {
            runInit(root);
        }
        catch (e) {
            console.error(`✖ ${e.message}`);
            process.exitCode = 1;
        }
    });
    return program;
}
/** argv 为纯用户参数（不含 node 与脚本路径），与命令行行为一致。 */
export async function runCli(argv) {
    await createProgram().parseAsync(argv, { from: "user" });
}
if (process.argv[1]?.endsWith("cli.js") || process.argv[1]?.endsWith("cli.ts")) {
    await runCli(process.argv.slice(2));
}
