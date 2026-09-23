import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPlan } from "../src/parser/parsePlan.js";
import { makeSampleProject } from "./helpers.js";

let root: string;
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-parse-"));
  await makeSampleProject(root);
});

describe("loadPlan", () => {
  it("parses all three nodes with frontmatter intact", () => {
    const { nodes, issues } = loadPlan(root);
    expect(issues).toEqual([]);
    expect(nodes.map((n) => n.fm.id).sort()).toEqual(["M1-core", "M2-auth", "M3-login"]);
    const m1 = nodes.find((n) => n.fm.id === "M1-core")!;
    expect(m1.fm.status).toBe("done");
    expect(m1.fm.evidence?.git).toEqual(["core|骨架"]);
    expect(m1.completionLog).toEqual([{ date: "2026-09-18", text: "完成工程初始化与构建脚本" }]);
    expect(m1.description).toContain("最小工程骨架");
  });
  it("handles Chinese filename and empty acceptance", () => {
    const { nodes } = loadPlan(root);
    const m3 = nodes.find((n) => n.fm.id === "M3-login")!;
    expect(m3.file).toBe("plan/milestones/M3-登录.md");
    expect(m3.fm.acceptance).toEqual([]);
  });
  it("parses iterations and overview table", () => {
    const { iterations, overview } = loadPlan(root);
    expect(iterations).toHaveLength(1);
    expect(iterations[0].fm.id).toBe("I1");
    expect(overview!.table.map((r) => r.id)).toEqual(["M1-core", "M2-auth", "M3-login"]);
    expect(overview!.table[0].title).toBe("核心骨架");
  });
  it("reports error on broken frontmatter and skips the file", async () => {
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "pf-bad-"));
    await makeSampleProject(root2);
    fs.writeFileSync(path.join(root2, "plan", "milestones", "BAD.md"), "---\nid: [unclosed\n---\n正文\n");
    const { nodes, issues } = loadPlan(root2);
    expect(nodes.some((n) => n.file.endsWith("BAD.md"))).toBe(false);
    expect(issues.some((i) => i.level === "error" && i.file.endsWith("BAD.md"))).toBe(true);
  });
  it("adds error issue when overview.md missing", async () => {
    const root3 = fs.mkdtempSync(path.join(os.tmpdir(), "pf-noov-"));
    await makeSampleProject(root3);
    fs.rmSync(path.join(root3, "plan", "overview.md"));
    const { overview, issues } = loadPlan(root3);
    expect(overview).toBeUndefined();
    expect(issues.some((i) => i.message.includes("overview.md"))).toBe(true);
  });
  it("tolerates unquoted github task-list acceptance items", async () => {
    const root4 = fs.mkdtempSync(path.join(os.tmpdir(), "pf-task-"));
    await makeSampleProject(root4);
    fs.writeFileSync(
      path.join(root4, "plan", "milestones", "M4-form.md"),
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
`,
    );
    const { nodes, issues } = loadPlan(root4);
    expect(issues).toEqual([]);
    const m4 = nodes.find((n) => n.fm.id === "M4-form")!;
    expect(m4.fm.acceptance).toEqual(["[x] 邮箱登录", "[ ] 刷新令牌"]);
  });
});

describe("parseOverview 收紧：格式问题显式告警而非静默吞掉", () => {
  async function rootWithOverview(overviewMd: string): Promise<string> {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), "pf-ov-"));
    await makeSampleProject(r);
    fs.writeFileSync(path.join(r, "plan", "overview.md"), overviewMd);
    return r;
  }

  it("完整表格不产生任何 issue", async () => {
    const { overview, issues } = loadPlan(root);
    expect(overview!.table).toHaveLength(3);
    expect(issues.filter((i) => i.file === "plan/overview.md")).toEqual([]);
  });

  it("第一张表之后的其它表格被忽略并告警", async () => {
    const r = await rootWithOverview(`# 总览

| id | 标题 | 迭代 |
|----|------|------|
| M1-core | 核心骨架 | I1 |
| M2-auth | 认证模块 | I1 |
| M3-login | 登录页面 | I1 |

## 图例

| 状态 | 含义 |
|------|------|
| done | 已完成 |
`);
    const { overview, issues } = loadPlan(r);
    expect(overview!.table.map((row) => row.id)).toEqual(["M1-core", "M2-auth", "M3-login"]);
    expect(issues.some((i) => i.level === "warning" && i.message.includes("只读取第一张表"))).toBe(true);
  });

  it("畸形行（列数不足 / id 为空）跳过并告警，不影响其它行", async () => {
    const r = await rootWithOverview(`# 总览

| id | 标题 | 迭代 |
|----|------|------|
| M1-core | 核心骨架 | I1 |
| M2-auth |
|  | 匿名行 | I1 |
| M3-login | 登录页面 | I1 |
`);
    const { overview, issues } = loadPlan(r);
    expect(overview!.table.map((row) => row.id)).toEqual(["M1-core", "M3-login"]);
    const warns = issues.filter((i) => i.level === "warning" && i.message.includes("格式不完整"));
    expect(warns).toHaveLength(2);
    expect(warns[0].message).toContain("第 6 行");
    expect(warns[1].message).toContain("第 7 行");
  });

  it("表头首列不是 id 时告警（可能误写成中文表头）", async () => {
    const r = await rootWithOverview(`# 总览

| 编号 | 标题 | 迭代 |
|------|------|------|
| M1-core | 核心骨架 | I1 |
`);
    const { overview, issues } = loadPlan(r);
    expect(overview!.table.map((row) => row.id)).toEqual(["编号", "M1-core"]);
    expect(issues.some((i) => i.level === "warning" && i.message.includes("而非 id"))).toBe(true);
  });

  it("表格存在但没有数据行时告警", async () => {
    const r = await rootWithOverview(`# 总览

| id | 标题 | 迭代 |
|----|------|------|
`);
    const { overview, issues } = loadPlan(r);
    expect(overview!.table).toEqual([]);
    expect(issues.some((i) => i.level === "warning" && i.message.includes("没有数据行"))).toBe(true);
  });

  it("文件里完全没有表格时报 error", async () => {
    const r = await rootWithOverview("# 总览\n\n这里没有表格。\n");
    const { overview, issues } = loadPlan(r);
    expect(overview).toBeUndefined();
    expect(issues.some((i) => i.level === "error" && i.message.includes("未找到总览表"))).toBe(true);
  });
});
