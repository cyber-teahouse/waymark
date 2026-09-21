import type {
  PlanDoc, IterationDoc, OverviewDoc, PlanIssue,
} from "../types.js";
import type { Graph } from "./buildGraph.js";

export interface ValidateInput {
  nodes: PlanDoc[];
  iterations: IterationDoc[];
  overview?: OverviewDoc;
  graph: Graph;
}

export function validatePlan(input: ValidateInput): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const { nodes, iterations, overview, graph } = input;

  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.fm.id)) {
      issues.push({ level: "error", file: n.file, message: `节点 id 重复: ${n.fm.id}` });
    }
    seen.add(n.fm.id);
  }
  for (const n of nodes) {
    for (const dep of n.fm.deps) {
      if (!seen.has(dep)) {
        issues.push({ level: "error", file: n.file, message: `依赖指向不存在的节点: ${dep}` });
      }
    }
  }
  if (graph.cyclePath) {
    issues.push({
      level: "error", file: graph.cyclePath[0],
      message: `循环依赖: ${graph.cyclePath.join(" -> ")}`,
    });
  }
  const iterIds = new Set(iterations.map(i => i.fm.id));
  for (const n of nodes) {
    if (n.fm.iteration && !iterIds.has(n.fm.iteration)) {
      issues.push({ level: "error", file: n.file, message: `迭代引用无效: ${n.fm.iteration}` });
    }
  }
  if (overview) {
    const milestoneIds = new Set(nodes.filter(n => n.fm.type === "milestone").map(n => n.fm.id));
    const allIds = new Set(nodes.map(n => n.fm.id));
    const tableIds = new Set<string>();
    for (const row of overview.table) {
      tableIds.add(row.id);
      if (!allIds.has(row.id)) {
        issues.push({ level: "error", file: overview.file, message: `总览表含未知节点: ${row.id}` });
      }
    }
    for (const id of milestoneIds) {
      if (!tableIds.has(id)) {
        issues.push({ level: "error", file: overview.file, message: `总览表缺少里程碑: ${id}` });
      }
    }
  }

  // 内容性约定（warning 级，不影响退出码）：
  for (const n of nodes) {
    if (n.fm.status === "done" && n.completionLog.length === 0) {
      issues.push({ level: "warning", file: n.file, message: `${n.fm.id} 已完成但没有完成记录——建议在「完成记录」补充交付说明` });
    }
    if (n.fm.status === "in-progress" && n.fm.acceptance.length > 0
      && !n.fm.acceptance.some(a => /^\s*\[\s*[xX]\s*\]/.test(a))) {
      issues.push({ level: "warning", file: n.file, message: `${n.fm.id} 进行中但验收标准无一勾选——随进展及时勾选` });
    }
    const ev = n.fm.evidence;
    if (ev && Object.values(ev).every(arr => !arr || arr.length === 0)) {
      issues.push({ level: "warning", file: n.file, message: `${n.fm.id} 声明了 evidence 但所有维度为空——不会产生任何推断` });
    }
  }
  return issues;
}

/** 校验 evidence 中的 grep/git 正则可编译。 */
export function validatePatterns(nodes: PlanDoc[]): PlanIssue[] {
  const issues: PlanIssue[] = [];
  for (const n of nodes) {
    const ev = n.fm.evidence;
    if (!ev) continue;
    for (const [kind, patterns] of [["grep", ev.grep], ["git", ev.git]] as const) {
      for (const p of patterns ?? []) {
        try {
          new RegExp(p);
        } catch (e) {
          issues.push({ level: "error", file: n.file, message: `evidence.${kind} 正则无效: ${p}（${(e as Error).message}）` });
        }
      }
    }
  }
  return issues;
}
