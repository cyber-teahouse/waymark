import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSampleProject } from "./helpers.js";
import { loadPlan } from "../src/parser/parsePlan.js";

let root: string;
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-parse-"));
  await makeSampleProject(root);
});

describe("loadPlan", () => {
  it("parses all three nodes with frontmatter intact", () => {
    const { nodes, issues } = loadPlan(root);
    expect(issues).toEqual([]);
    expect(nodes.map(n => n.fm.id).sort()).toEqual(["M1-core", "M2-auth", "M3-login"]);
    const m1 = nodes.find(n => n.fm.id === "M1-core")!;
    expect(m1.fm.status).toBe("done");
    expect(m1.fm.evidence?.git).toEqual(["core|骨架"]);
    expect(m1.completionLog).toEqual([{ date: "2026-09-18", text: "完成工程初始化与构建脚本" }]);
    expect(m1.description).toContain("最小工程骨架");
  });
  it("handles Chinese filename and empty acceptance", () => {
    const { nodes } = loadPlan(root);
    const m3 = nodes.find(n => n.fm.id === "M3-login")!;
    expect(m3.file).toBe("plan/milestones/M3-登录.md");
    expect(m3.fm.acceptance).toEqual([]);
  });
  it("parses iterations and overview table", () => {
    const { iterations, overview } = loadPlan(root);
    expect(iterations).toHaveLength(1);
    expect(iterations[0].fm.id).toBe("I1");
    expect(overview!.table.map(r => r.id)).toEqual(["M1-core", "M2-auth", "M3-login"]);
    expect(overview!.table[0].title).toBe("核心骨架");
  });
  it("reports error on broken frontmatter and skips the file", async () => {
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "pf-bad-"));
    await makeSampleProject(root2);
    fs.writeFileSync(path.join(root2, "plan", "milestones", "BAD.md"),
      "---\nid: [unclosed\n---\n正文\n");
    const { nodes, issues } = loadPlan(root2);
    expect(nodes.some(n => n.file.endsWith("BAD.md"))).toBe(false);
    expect(issues.some(i => i.level === "error" && i.file.endsWith("BAD.md"))).toBe(true);
  });
  it("adds error issue when overview.md missing", async () => {
    const root3 = fs.mkdtempSync(path.join(os.tmpdir(), "pf-noov-"));
    await makeSampleProject(root3);
    fs.rmSync(path.join(root3, "plan", "overview.md"));
    const { overview, issues } = loadPlan(root3);
    expect(overview).toBeUndefined();
    expect(issues.some(i => i.message.includes("overview.md"))).toBe(true);
  });
  it("tolerates unquoted github task-list acceptance items", async () => {
    const root4 = fs.mkdtempSync(path.join(os.tmpdir(), "pf-task-"));
    await makeSampleProject(root4);
    fs.writeFileSync(path.join(root4, "plan", "milestones", "M4-form.md"),
`---
id: M4-form
title: 表单细节
type: task
status: in-progress
deps: []
acceptance:
  - [x] 邮箱登录
  - [ ] 刷新令牌
---

## 需求描述
优化表单细节。
`);
    const { nodes, issues } = loadPlan(root4);
    expect(issues).toEqual([]);
    const m4 = nodes.find(n => n.fm.id === "M4-form")!;
    expect(m4.fm.acceptance).toEqual(["[x] 邮箱登录", "[ ] 刷新令牌"]);
  });
});
