import { describe, it, expect } from "vitest";
import type { PlanDoc } from "../src/types.js";
import { buildGraph } from "../src/graph/buildGraph.js";

function doc(id: string, deps: string[] = []): PlanDoc {
  return {
    file: `plan/milestones/${id}.md`,
    fm: {
      id, title: id, type: "task", status: "planned", deps,
      acceptance: [],
    },
    description: "", completionLog: [],
  };
}

describe("buildGraph", () => {
  it("builds edges and topo order (deps before dependents)", () => {
    const g = buildGraph([doc("C", ["A", "B"]), doc("A"), doc("B", ["A"])]);
    expect(g.edges).toContainEqual({ from: "A", to: "C" });
    expect(g.edges).toContainEqual({ from: "B", to: "C" });
    expect(g.topoOrder.indexOf("A")).toBeLessThan(g.topoOrder.indexOf("C"));
    expect(g.cycleNodes).toEqual([]);
  });
  it("detects a cycle and returns its path", () => {
    const g = buildGraph([doc("A", ["B"]), doc("B", ["C"]), doc("C", ["A"]), doc("D")]);
    expect(g.topoOrder).toEqual(["D"]);
    expect(g.cycleNodes.sort()).toEqual(["A", "B", "C"]);
    expect(g.cyclePath).not.toBeNull();
    expect(g.cyclePath).toHaveLength(4); // A -> B -> C -> A
    expect(g.cyclePath![0]).toBe(g.cyclePath![3]);
  });
  it("ignores deps pointing to unknown nodes (reported by validate, not graph)", () => {
    const g = buildGraph([doc("A", ["NOPE"])]);
    expect(g.edges).toEqual([]);
    expect(g.topoOrder).toEqual(["A"]);
  });
});
