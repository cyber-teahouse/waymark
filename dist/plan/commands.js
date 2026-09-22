import fs from "node:fs";
import path from "node:path";
import { loadPlan } from "../parser/parsePlan.js";
function splitFrontmatter(raw) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    if (!m)
        throw new Error("文件缺少 frontmatter 块");
    return { fm: m[1], body: raw.slice(m.index + m[0].length) };
}
function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** 依赖中未满足（存在且非 done/dropped）的 id 列表；缺失的依赖视为满足，由 check 另行报错。 */
function unmetDeps(plan, deps) {
    const statusOf = new Map(plan.nodes.map(n => [n.fm.id, n.fm.status]));
    return deps.filter(d => {
        const s = statusOf.get(d);
        return s !== undefined && s !== "done" && s !== "dropped";
    });
}
/** 把节点标记为完成：status → done，可选勾全部验收、追加完成记录行。只动 frontmatter 的 status/acceptance 与完成记录区块。 */
export function markDone(root, id, opts = {}) {
    const plan = loadPlan(root);
    const doc = plan.nodes.find(n => n.fm.id === id);
    if (!doc)
        throw new Error(`未找到节点: ${id}`);
    const abs = path.join(root, doc.file);
    const raw = fs.readFileSync(abs, "utf8");
    const { fm, body } = splitFrontmatter(raw);
    const nextFm = (() => {
        let fm2 = fm.replace(/^status:\s*.*$/m, "status: done");
        if (opts.allAcceptance) {
            fm2 = fm2.replace(/^(\s*-\s*)\[\s?\]/gm, "$1[x]");
        }
        return fm2;
    })();
    const date = opts.date ?? today();
    const note = opts.note?.trim().replace(/\r?\n+/g, " ");
    const nextBody = (() => {
        if (!note)
            return body;
        const secRe = /^##\s+完成记录\s*$/m;
        const sec = secRe.exec(body);
        if (!sec) {
            return body.replace(/\s*$/, `\n\n## 完成记录\n- ${date} ${note}\n`);
        }
        const after = body.slice(sec.index + sec[0].length);
        const next = /^##\s+/m.exec(after);
        const insertAt = sec.index + sec[0].length + (next ? next.index : after.length);
        return `${body.slice(0, insertAt)}\n- ${date} ${note}${body.slice(insertAt)}`;
    })();
    fs.writeFileSync(abs, `---\n${nextFm}\n---\n${nextBody}`, "utf8");
    // 护栏警告：不阻止完成，但把可疑之处亮出来（对 agent 误操作的主要防线）
    const warnings = [];
    const unmet = unmetDeps(plan, doc.fm.deps);
    if (unmet.length)
        warnings.push(`依赖未完成: ${unmet.join("、")}——请确认是否确实可以完成`);
    if (!opts.allAcceptance) {
        const unchecked = doc.fm.acceptance.filter(a => !/^\s*\[\s*[xX]\s*\]/.test(a)).length;
        if (unchecked > 0)
            warnings.push(`${unchecked} 项验收标准未勾选——如已全部达成可用 --acc 勾选`);
    }
    if (doc.fm.status === "done")
        warnings.push("此前已是 done——本次仅追加记录，请确认不是重复操作");
    if (doc.fm.status === "blocked" || doc.fm.status === "dropped") {
        warnings.push(`原状态为 ${doc.fm.status}——旁路节点被标记完成，请复核`);
    }
    return { file: doc.file, warnings };
}
/** 认领开工：planned → in-progress。非 planned 报错；依赖未满足仅警告（允许有意识的并行开发）。 */
export function startNode(root, id) {
    const plan = loadPlan(root);
    const doc = plan.nodes.find(n => n.fm.id === id);
    if (!doc)
        throw new Error(`未找到节点: ${id}`);
    if (doc.fm.status !== "planned") {
        throw new Error(`${id} 当前状态为 ${doc.fm.status}，仅 planned 节点可认领开工`);
    }
    const abs = path.join(root, doc.file);
    const raw = fs.readFileSync(abs, "utf8");
    const { fm, body } = splitFrontmatter(raw);
    const nextFm = fm.replace(/^status:\s*.*$/m, "status: in-progress");
    fs.writeFileSync(abs, `---\n${nextFm}\n---\n${body}`, "utf8");
    const warnings = [];
    const unmet = unmetDeps(plan, doc.fm.deps);
    if (unmet.length)
        warnings.push(`依赖未完成: ${unmet.join("、")}——建议先完成依赖节点（waymark ready 查看可开工节点）`);
    return { file: doc.file, warnings };
}
/** 可开工节点：planned 且依赖全部 done/dropped（缺失的依赖视为满足，由 check 另行报错）。 */
export function listReady(root) {
    const plan = loadPlan(root);
    const statusOf = new Map(plan.nodes.map(n => [n.fm.id, n.fm.status]));
    return plan.nodes
        .filter(n => n.fm.status === "planned")
        .filter(n => n.fm.deps.every(d => {
        const s = statusOf.get(d);
        return s === undefined || s === "done" || s === "dropped";
    }))
        .map(n => ({ id: n.fm.id, title: n.fm.title, iteration: n.fm.iteration, file: n.file }));
}
