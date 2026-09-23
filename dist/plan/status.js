import fs from "node:fs";
import path from "node:path";
import { planNewerThan } from "../render/render.js";
import { WorkflowJsonSchema } from "../types.js";
const BAR_W = 24;
function relTime(iso, now) {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t))
        return null;
    const mins = Math.floor((now.getTime() - t) / 60000);
    if (mins < 1)
        return "刚刚";
    if (mins < 60)
        return `${mins} 分钟前`;
    const h = Math.floor(mins / 60);
    if (h < 24)
        return `${h} 小时前`;
    const d = Math.floor(h / 24);
    if (d < 30)
        return `${d} 天前`;
    return `${Math.floor(d / 30)} 个月前`;
}
/** 渲染终端进度一览（纯函数：workflow 进、文本出，便于测试）。 */
export function renderStatus(wf, now = new Date()) {
    const s = wf.stats;
    const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
    const filled = Math.round((pct / 100) * BAR_W);
    const bar = "█".repeat(filled) + "░".repeat(BAR_W - filled);
    const lines = [];
    lines.push(`${wf.project} · 进度工作流`);
    lines.push(`${bar} ${pct}%（${s.done}/${s.total}）`);
    const parts = [
        `完成 ${s.done}`,
        `进行中 ${s.inProgress}`,
        `未开始 ${s.planned}`,
        ...(s.blocked > 0 ? [`受阻 ${s.blocked}`] : []),
        ...(s.dropped > 0 ? [`已放弃 ${s.dropped}`] : []),
        ...(s.warnings > 0 ? [`⚠ 警示 ${s.warnings}`] : []),
    ];
    lines.push(parts.join(" · "));
    // 可开工：planned 且依赖全部 done/dropped（缺失视为满足，与 CLI ready 同口径）
    const statusOf = new Map(wf.nodes.map((n) => [n.id, n.displayStatus]));
    const ready = wf.nodes.filter((n) => n.displayStatus === "planned" &&
        n.deps.every((d) => {
            const st = statusOf.get(d);
            return st === undefined || st === "done" || st === "dropped";
        }));
    if (ready.length > 0) {
        lines.push("", `可开工 ${ready.length} 个:`);
        for (const n of ready) {
            lines.push(`  ▶ ${n.id}  ${n.title}${n.iteration ? `  [${n.iteration}]` : ""}`);
        }
    }
    const blocked = wf.nodes.filter((n) => n.displayStatus === "blocked");
    if (blocked.length > 0) {
        lines.push("", `受阻 ${blocked.length} 个:`);
        for (const n of blocked)
            lines.push(`  ▲ ${n.id}  ${n.title}`);
    }
    const errors = (wf.issues ?? []).filter((i) => i.level === "error").length;
    if (errors > 0)
        lines.push("", `✖ plan 存在 ${errors} 个规范错误（waymark check 查看）`);
    const gen = relTime(wf.generatedAt, now);
    if (gen)
        lines.push("", `生成于 ${gen}（waymark sync 更新）`);
    return lines.join("\n");
}
/** 读 .waymark/workflow.json 并渲染状态一览；缺失时按 opts.fresh 决定是否自动 sync，
 *  过期时 --fresh 自动重新 sync、无 --fresh 则在输出末尾提示（与 render --fresh 同口径）。 */
export async function statusReport(root, opts = {}) {
    const wfFile = path.join(root, ".waymark", "workflow.json");
    const missing = !fs.existsSync(wfFile);
    const stale = !missing && planNewerThan(root, wfFile);
    if (missing && !opts.fresh) {
        throw new Error("未找到 .waymark/workflow.json，请先运行 waymark sync（或使用 --fresh 自动同步）");
    }
    if (missing || (stale && opts.fresh)) {
        const { buildWorkflow } = await import("../sync/build.js");
        const { writeWorkflow } = await import("../render/render.js");
        const { workflow, issues } = await buildWorkflow(root);
        writeWorkflow(root, workflow);
        if (issues.some((i) => i.level === "error")) {
            console.warn("⚠ plan 存在规范错误（waymark check 查看），已按当前数据展示");
        }
    }
    const parsed = WorkflowJsonSchema.safeParse(JSON.parse(fs.readFileSync(wfFile, "utf8")));
    if (!parsed.success) {
        throw new Error(`workflow 数据不符合契约: ${parsed.error.message}`);
    }
    const report = renderStatus(parsed.data, opts.now);
    return stale && !opts.fresh
        ? `${report}\n\n⚠ plan/ 或证据目录在 sync 之后有改动，数据可能过期——运行 waymark sync（或 waymark status --fresh）更新`
        : report;
}
