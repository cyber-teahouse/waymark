import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildGraph } from "../src/graph/buildGraph.js";
import { validatePatterns, validatePlan } from "../src/graph/validate.js";
import { loadPlan } from "../src/parser/parsePlan.js";
import { runInit } from "../src/scaffold.js";

let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-init-"));
});

describe("runInit", () => {
  it("creates a plan/ skeleton that passes check", () => {
    runInit(root);
    const plan = loadPlan(root);
    expect(plan.nodes).toHaveLength(1);
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
