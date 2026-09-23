import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorkflow } from "../src/sync/build.js";
import { computeDisplay } from "../src/sync/synthesize.js";
import { makeSampleProject } from "./helpers.js";

describe("computeDisplay 矩阵", () => {
  it("no evidence → declared, no warning", () => {
    const r = computeDisplay("in-progress", null, false);
    expect(r).toEqual({ displayStatus: "in-progress", warning: null });
  });
  it("agreeing evidence → declared, no warning", () => {
    expect(computeDisplay("done", "done", true)).toEqual({ displayStatus: "done", warning: null });
    expect(computeDisplay("planned", "planned", true)).toEqual({ displayStatus: "planned", warning: null });
  });
  it("declared done + insufficient evidence → warning evidence-insufficient", () => {
    expect(computeDisplay("done", "in-progress", true).warning).toBe("evidence-insufficient");
    expect(computeDisplay("done", "planned", true).warning).toBe("evidence-insufficient");
  });
  it("declared planned + full evidence → hint ready-to-complete", () => {
    expect(computeDisplay("planned", "done", true).warning).toBe("ready-to-complete");
  });
  it("declared planned + partial evidence → no warning (推断仅详情展示)", () => {
    expect(computeDisplay("planned", "in-progress", true)).toEqual({
      displayStatus: "planned",
      warning: null,
    });
  });
  it("declared in-progress + zero evidence → stalled; partial evidence → no warning", () => {
    expect(computeDisplay("in-progress", "planned", true)).toEqual({
      displayStatus: "in-progress",
      warning: "stalled",
    });
    expect(computeDisplay("in-progress", "in-progress", true).warning).toBeNull();
  });
  it("display never overrides declared", () => {
    for (const declared of ["planned", "in-progress", "done", "blocked", "dropped"] as const) {
      expect(computeDisplay(declared, "done", true).displayStatus).toBe(declared);
    }
  });
});

describe("buildWorkflow on sample project", () => {
  it("produces contract-valid workflow with expected statuses and edges", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-sync-"));
    await makeSampleProject(root, true);
    const { workflow, issues } = await buildWorkflow(root);
    expect(issues).toEqual([]);
    expect(workflow.stats.total).toBe(3);
    const m1 = workflow.nodes.find((n) => n.id === "M1-core")!;
    expect(m1.displayStatus).toBe("done");
    expect(m1.inferredStatus).toBe("done");
    expect(m1.commits.length).toBeGreaterThan(0);
    const m2 = workflow.nodes.find((n) => n.id === "M2-auth")!;
    expect(m2.inferredStatus).toBe("in-progress"); // paths 半命中 + tests 缺失 → 低分进行中
    expect(m2.warning).toBeNull();
    const m3 = workflow.nodes.find((n) => n.id === "M3-login")!;
    expect(m3.inferredStatus).toBeNull(); // 无 evidence 声明
    expect(m3.displayStatus).toBe("planned");
    expect(workflow.edges).toContainEqual({ from: "M1-core", to: "M2-auth" });
    expect(workflow.iterations[0].nodeIds).toHaveLength(3);
    expect(workflow.stats.done).toBe(1);
    expect(workflow.nodes.every((n) => typeof n.cycle === "boolean")).toBe(true);
    expect(workflow.issues).toEqual([]);
  });
});
