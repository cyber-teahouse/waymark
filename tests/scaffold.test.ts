import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildGraph } from "../src/graph/buildGraph.js";
import { validatePatterns, validatePlan } from "../src/graph/validate.js";
import { loadPlan } from "../src/parser/parsePlan.js";
import { collectPlanIssues } from "../src/plan/check.js";
import { listReady } from "../src/plan/commands.js";
import { runInit } from "../src/scaffold.js";

let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-init-"));
});

describe("runInit", () => {
  it("creates a plan/ skeleton that passes check", () => {
    runInit(root);
    const plan = loadPlan(root);
    expect(plan.nodes.filter((n) => n.fm.type === "milestone")).toHaveLength(1);
    expect(plan.nodes.filter((n) => n.fm.type === "task")).toHaveLength(2);
    expect(plan.iterations).toHaveLength(1);
    const issues = [
      ...plan.issues,
      ...validatePlan({ ...plan, graph: buildGraph(plan.nodes) }),
      ...validatePatterns(plan.nodes),
    ];
    expect(issues).toEqual([]);
  });
  it("refuses to overwrite existing plan/", () => {
    expect(() => runInit(root)).toThrow(/已存在/);
  });
});

describe("骨架任务链示例", () => {
  it("新骨架 check 一次通过，ready 初始给出 t1 而非光杆里程碑", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-scaffold-split-"));
    runInit(root);
    expect(fs.existsSync(path.join(root, "plan", "milestones", "M1-example-t1.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "plan", "milestones", "M1-example-t2.md"))).toBe(true);
    expect(collectPlanIssues(root).filter((i) => i.level === "error")).toEqual([]);
    expect(listReady(root).map((r) => r.id)).toEqual(["M1-example-t1"]);
  });
});
