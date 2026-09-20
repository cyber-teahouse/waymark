import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSampleProject } from "./helpers.js";
import { markDone, listReady } from "../src/plan/commands.js";
import { loadPlan } from "../src/parser/parsePlan.js";

function makeTinyProject(dest: string): void {
  fs.mkdirSync(path.join(dest, "plan", "milestones"), { recursive: true });
  fs.mkdirSync(path.join(dest, "plan", "iterations"), { recursive: true });
  fs.writeFileSync(path.join(dest, "plan", "overview.md"),
    "# 总览\n\n| id | 标题 | 迭代 |\n|----|------|------|\n| A-base | 基座 | I1 |\n| B-app | 应用 | I1 |\n");
  fs.writeFileSync(path.join(dest, "plan", "iterations", "I1.md"), "---\nid: I1\ntitle: 一期\n---\n");
  fs.writeFileSync(path.join(dest, "plan", "milestones", "A.md"),
    "---\nid: A-base\ntitle: 基座\ntype: milestone\nstatus: done\ndeps: []\niteration: I1\nacceptance:\n  - [ ] 验收一\n---\n\n## 需求描述\n基座。\n");
  fs.writeFileSync(path.join(dest, "plan", "milestones", "B.md"),
    "---\nid: B-app\ntitle: 应用\ntype: milestone\nstatus: planned\ndeps: [A-base]\niteration: I1\nacceptance:\n  - [ ] 全部就绪\n---\n\n## 需求描述\n应用层。\n");
}

describe("markDone", () => {
  it("sets status to done and appends completion note with date", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-done-"));
    makeTinyProject(root);
    const { file } = markDone(root, "B-app", { note: "完成应用层开发", date: "2026-09-21" });
    expect(file).toBe("plan/milestones/B.md");
    const text = fs.readFileSync(path.join(root, "plan", "milestones", "B.md"), "utf8");
    expect(text).toMatch(/^status: done$/m);
    expect(text).toContain("- 2026-09-21 完成应用层开发");
    expect(text).toContain("## 完成记录");
    // 其余内容不动
    expect(text).toContain("应用层。");
    expect(text).toMatch(/deps: \[A-base\]/);
  });
  it("--acc checks all acceptance items", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-done2-"));
    makeTinyProject(root);
    markDone(root, "B-app", { allAcceptance: true, date: "2026-09-21" });
    const plan = loadPlan(root);
    const b = plan.nodes.find(n => n.fm.id === "B-app")!;
    expect(b.fm.acceptance).toEqual(["[x] 全部就绪"]);
  });
  it("creates completion section when missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-done3-"));
    makeTinyProject(root);
    markDone(root, "A-base", { note: "早已完成", date: "2026-09-21" });
    const text = fs.readFileSync(path.join(root, "plan", "milestones", "A.md"), "utf8");
    expect(text).toContain("## 完成记录\n- 2026-09-21 早已完成");
  });
  it("throws on unknown id", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-done4-"));
    makeTinyProject(root);
    expect(() => markDone(root, "NOPE")).toThrow(/未找到节点/);
  });
});

describe("listReady", () => {
  it("lists planned nodes whose deps are done/dropped", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-ready-"));
    makeTinyProject(root);
    // B-app 依赖 A-base(done) → ready
    expect(listReady(root).map(n => n.id)).toEqual(["B-app"]);
  });
  it("excludes planned nodes with unsatisfied deps", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-ready2-"));
    makeTinyProject(root);
    fs.writeFileSync(path.join(root, "plan", "milestones", "A.md"),
      fs.readFileSync(path.join(root, "plan", "milestones", "A.md"), "utf8").replace("status: done", "status: in-progress"));
    expect(listReady(root)).toEqual([]);
  });
  it("uses sample project: M3 blocked by in-progress M2, nothing ready", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-ready3-"));
    await makeSampleProject(root);
    expect(listReady(root)).toEqual([]);
  });
});
