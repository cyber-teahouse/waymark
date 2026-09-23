import { describe, expect, it } from "vitest";
import { IterationFrontmatterSchema, NodeFrontmatterSchema, WorkflowJsonSchema } from "../src/types.js";

const validFm = {
  id: "M1-core",
  title: "核心骨架",
  type: "milestone",
  status: "done",
  deps: [],
  acceptance: ["[x] 初始化", "[ ] 清理"],
  evidence: { paths: ["src/core/**"] },
};

describe("NodeFrontmatterSchema", () => {
  it("accepts valid frontmatter", () => {
    const r = NodeFrontmatterSchema.safeParse(validFm);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.deps).toEqual([]);
  });
  it("rejects bad status enum", () => {
    expect(NodeFrontmatterSchema.safeParse({ ...validFm, status: "finished" }).success).toBe(false);
  });
  it("rejects id with spaces", () => {
    expect(NodeFrontmatterSchema.safeParse({ ...validFm, id: "M 1" }).success).toBe(false);
  });
  it("rejects missing type", () => {
    const { type: _drop, ...rest } = validFm;
    expect(NodeFrontmatterSchema.safeParse(rest).success).toBe(false);
  });
});

describe("IterationFrontmatterSchema", () => {
  it("accepts minimal iteration", () => {
    expect(IterationFrontmatterSchema.safeParse({ id: "I1", title: "MVP" }).success).toBe(true);
  });
});

describe("WorkflowJsonSchema", () => {
  it("accepts a minimal workflow", () => {
    const wf = {
      version: 1,
      generatedAt: "2026-09-20T00:00:00+08:00",
      project: "demo",
      nodes: [
        {
          id: "M1-core",
          title: "核心骨架",
          type: "milestone",
          declaredStatus: "done",
          inferredStatus: "done",
          displayStatus: "done",
          warning: null,
          confidence: 1,
          evidenceReport: [],
          acceptance: [],
          completionLog: [],
          commits: [],
          deps: [],
          file: "plan/milestones/M1.md",
          description: "",
        },
      ],
      edges: [],
      iterations: [{ id: "I1", title: "MVP", nodeIds: ["M1-core"] }],
      stats: { total: 1, done: 1, inProgress: 0, planned: 0, blocked: 0, dropped: 0, warnings: 0 },
    };
    expect(WorkflowJsonSchema.safeParse(wf).success).toBe(true);
  });
});
