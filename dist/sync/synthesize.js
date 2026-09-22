import path from "node:path";
import fs from "node:fs";
import { WorkflowJsonSchema, } from "../types.js";
import { inferEvidence, parseAcceptance } from "../infer/inferStatus.js";
import { loadGitSnapshot } from "../infer/scoreGit.js";
export function computeDisplay(declared, inferred, hasEvidence) {
    if (!hasEvidence || inferred === null)
        return { displayStatus: declared, warning: null };
    if (declared === "done" && inferred !== "done") {
        return { displayStatus: declared, warning: "evidence-insufficient" };
    }
    if (declared === "planned" && inferred === "done") {
        return { displayStatus: declared, warning: "ready-to-complete" };
    }
    if (declared === "in-progress" && inferred === "planned") {
        return { displayStatus: declared, warning: "stalled" };
    }
    return { displayStatus: declared, warning: null };
}
export async function synthesize(input) {
    const orderIndex = new Map(input.graph.topoOrder.map((id, i) => [id, i]));
    const sorted = [...input.nodes].sort((a, b) => (orderIndex.get(a.fm.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.fm.id) ?? Number.MAX_SAFE_INTEGER));
    const wfNodes = [];
    // 有任一节点声明 git 证据时，整次构建只读一次 git log
    const gitSnapshot = input.nodes.some(n => n.fm.evidence?.git?.length)
        ? await loadGitSnapshot(input.root)
        : undefined;
    // grep 候选文件遍历同样按构建共享（全仓遍历是最贵的一步）
    const grepCache = new Map();
    for (const doc of sorted) {
        const inf = await inferEvidence(input.root, doc.fm, gitSnapshot, grepCache);
        const hasEvidence = doc.fm.evidence !== undefined;
        const { displayStatus, warning } = computeDisplay(doc.fm.status, inf.inferred, hasEvidence);
        wfNodes.push({
            id: doc.fm.id,
            title: doc.fm.title,
            type: doc.fm.type,
            declaredStatus: doc.fm.status,
            inferredStatus: inf.inferred,
            displayStatus,
            warning,
            cycle: input.graph.cycleNodes.includes(doc.fm.id),
            confidence: inf.confidence,
            evidenceReport: inf.report,
            acceptance: parseAcceptance(doc.fm.acceptance),
            completionLog: doc.completionLog,
            commits: inf.commits,
            iteration: doc.fm.iteration,
            deps: doc.fm.deps,
            file: doc.file,
            description: doc.description,
        });
    }
    const stats = {
        total: wfNodes.length,
        done: wfNodes.filter(n => n.displayStatus === "done").length,
        inProgress: wfNodes.filter(n => n.displayStatus === "in-progress").length,
        planned: wfNodes.filter(n => n.displayStatus === "planned").length,
        blocked: wfNodes.filter(n => n.displayStatus === "blocked").length,
        dropped: wfNodes.filter(n => n.displayStatus === "dropped").length,
        warnings: wfNodes.filter(n => n.warning !== null).length,
    };
    const workflow = {
        version: 1,
        generatedAt: new Date().toISOString(),
        project: input.projectName,
        nodes: wfNodes,
        edges: input.graph.edges,
        iterations: input.iterations.map(it => ({
            id: it.fm.id,
            title: it.fm.title,
            goal: it.fm.goal,
            window: it.fm.window,
            nodeIds: wfNodes.filter(n => n.iteration === it.fm.id).map(n => n.id),
        })),
        issues: input.issues,
        stats,
    };
    return WorkflowJsonSchema.parse(workflow); // 契约自检：内部生成的数据必须过自己的 schema
}
export function detectProjectName(root) {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
        if (typeof pkg.name === "string" && pkg.name)
            return pkg.name;
    }
    catch {
        // 非 node 项目 → 用目录名
    }
    return path.basename(path.resolve(root));
}
