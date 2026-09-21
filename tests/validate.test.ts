import { describe, it, expect } from "vitest";
import type { PlanDoc, IterationDoc, OverviewDoc } from "../src/types.js";
import { buildGraph } from "../src/graph/buildGraph.js";
import { validatePlan, validatePatterns } from "../src/graph/validate.js";

function doc(id: string, over: Partial<PlanDoc["fm"]> = {}): PlanDoc {
  return {
    file: `plan/milestones/${id}.md`,
    fm: { id, title: id, type: "milestone", status: "planned", deps: [], acceptance: [], ...over },
    description: "", completionLog: [],
  };
}

describe("validatePlan", () => {
  it("passes a consistent plan with no issues", () => {
    const nodes = [doc("A", { iteration: "I1" }), doc("B", { deps: ["A"] })];
    const iterations: IterationDoc[] = [{ file: "plan/iterations/I1.md", fm: { id: "I1", title: "MVP" } }];
    const overview: OverviewDoc = { file: "plan/overview.md", table: [
      { id: "A", title: "A", iteration: "I1" }, { id: "B", title: "B", iteration: "" },
    ] };
    expect(validatePlan({ nodes, iterations, overview, graph: buildGraph(nodes) })).toEqual([]);
  });
  it("flags duplicate ids", () => {
    const nodes = [doc("A"), doc("A")];
    const issues = validatePlan({ nodes, iterations: [], graph: buildGraph(nodes) });
    expect(issues.filter(i => i.message.includes("重复"))).toHaveLength(1);
  });
  it("flags unknown dep target", () => {
    const nodes = [doc("A", { deps: ["NOPE"] })];
    const issues = validatePlan({ nodes, iterations: [], graph: buildGraph(nodes) });
    expect(issues.some(i => i.message.includes("NOPE"))).toBe(true);
  });
  it("flags cycle with path", () => {
    const nodes = [doc("A", { deps: ["B"] }), doc("B", { deps: ["A"] })];
    const issues = validatePlan({ nodes, iterations: [], graph: buildGraph(nodes) });
    expect(issues.some(i => i.level === "error" && i.message.includes("循环依赖"))).toBe(true);
  });
  it("flags invalid iteration reference", () => {
    const nodes = [doc("A", { iteration: "I9" })];
    const issues = validatePlan({ nodes, iterations: [], graph: buildGraph(nodes) });
    expect(issues.some(i => i.message.includes("迭代引用无效"))).toBe(true);
  });
  it("cross-checks overview table both directions (milestones only)", () => {
    const nodes = [doc("A"), doc("B", { type: "task" })];
    const overview: OverviewDoc = { file: "plan/overview.md", table: [
      { id: "A", title: "A", iteration: "" }, { id: "GHOST", title: "幽灵", iteration: "" },
    ] };
    const issues = validatePlan({ nodes, iterations: [], overview, graph: buildGraph(nodes) });
    expect(issues.some(i => i.message.includes("总览表缺少"))).toBe(false); // A 在表中
    expect(issues.some(i => i.message.includes("GHOST"))).toBe(true);       // 表中未知节点
    // B 是 task 不要求入表；再验证 milestone 缺失方向：
    const overview2: OverviewDoc = { file: "plan/overview.md", table: [] };
    const issues2 = validatePlan({ nodes: [doc("A")], iterations: [], overview: overview2, graph: buildGraph([doc("A")]) });
    expect(issues2.some(i => i.message.includes("总览表缺少") && i.message.includes("A"))).toBe(true);
  });
  it("flags invalid evidence regexes", () => {
    const nodes = [doc("A", { evidence: { grep: ["([bad"] } })];
    expect(validatePatterns(nodes)).toHaveLength(1);
  });
  it("warns when done node has no completion log", () => {
    const nodes = [doc("A", { status: "done" })]; // doc 工厂 completionLog 为空
    const issues = validatePlan({ nodes, iterations: [], graph: buildGraph(nodes) });
    expect(issues.some(i => i.level === "warning" && i.message.includes("完成记录"))).toBe(true);
  });
  it("does not warn about completion log when log exists", () => {
    const nodes = [{ ...doc("A", { status: "done" }), completionLog: [{ date: "2026-09-22", text: "完成了" }] }];
    const issues = validatePlan({ nodes, iterations: [], graph: buildGraph(nodes) });
    expect(issues.some(i => i.message.includes("完成记录"))).toBe(false);
  });
  it("warns when in-progress node has no checked acceptance", () => {
    const nodes = [doc("A", { status: "in-progress", acceptance: ["[ ] 一", "[ ] 二"] })];
    const issues = validatePlan({ nodes, iterations: [], graph: buildGraph(nodes) });
    expect(issues.some(i => i.level === "warning" && i.message.includes("验收"))).toBe(true);
  });
  it("does not warn about acceptance when none declared or some checked", () => {
    const none = [doc("A", { status: "in-progress" })];
    expect(validatePlan({ nodes: none, iterations: [], graph: buildGraph(none) })
      .some(i => i.message.includes("验收"))).toBe(false);
    const some = [doc("A", { status: "in-progress", acceptance: ["[x] 一", "[ ] 二"] })];
    expect(validatePlan({ nodes: some, iterations: [], graph: buildGraph(some) })
      .some(i => i.message.includes("验收"))).toBe(false);
  });
  it("warns when evidence declared but every dimension is empty", () => {
    const nodes = [doc("A", { evidence: { paths: [], grep: [] } })];
    const issues = validatePlan({ nodes, iterations: [], graph: buildGraph(nodes) });
    expect(issues.some(i => i.level === "warning" && i.message.includes("evidence"))).toBe(true);
  });
  it("does not warn when at least one evidence dimension is non-empty", () => {
    const nodes = [doc("A", { evidence: { paths: [], grep: ["init"] } })];
    expect(validatePlan({ nodes, iterations: [], graph: buildGraph(nodes) })
      .some(i => i.message.includes("evidence"))).toBe(false);
  });
});
