import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPlan } from "../src/parser/parsePlan.js";
import { splitNode } from "../src/plan/split.js";
import { makeSampleProject } from "./helpers.js";

describe("splitNode（里程碑拆分为任务链）", () => {
  it("生成任务链：t1 继承原依赖、后续链式、原节点 deps 汇总全部任务", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split-"));
    await makeSampleProject(root);
    const { created, warnings } = splitNode(root, "M2-auth", ["密码表单", "令牌刷新", "登出"]);
    expect(warnings).toEqual(["M2-auth 进行中——拆分后请复核任务范围"]);
    expect(created.map((c) => c.id)).toEqual(["M2-auth-t1", "M2-auth-t2", "M2-auth-t3"]);
    expect(created.every((c) => c.file.startsWith("plan/milestones/"))).toBe(true);

    const plan = loadPlan(root);
    const byId = new Map(plan.nodes.map((n) => [n.fm.id, n]));
    expect(byId.get("M2-auth-t1")!.fm.deps).toEqual(["M1-core"]);
    expect(byId.get("M2-auth-t2")!.fm.deps).toEqual(["M2-auth-t1"]);
    expect(byId.get("M2-auth-t3")!.fm.deps).toEqual(["M2-auth-t2"]);
    expect(byId.get("M2-auth")!.fm.deps).toEqual(["M2-auth-t1", "M2-auth-t2", "M2-auth-t3"]);
    expect(byId.get("M2-auth-t1")!.fm.type).toBe("task");
    expect(byId.get("M2-auth-t1")!.fm.status).toBe("planned");
    expect(byId.get("M2-auth-t1")!.fm.iteration).toBe("I1");
  });

  it("原里程碑验收/证据/描述不动，只改 deps 行", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split2-"));
    await makeSampleProject(root);
    const file = path.join(root, "plan", "milestones", "M2-auth.md");
    const before = fs.readFileSync(file, "utf8");
    splitNode(root, "M2-auth", ["任务"]);
    const after = fs.readFileSync(file, "utf8");
    expect(after).toContain("paths: [src/auth/**, src/missing/**]");
    expect(after).toContain("- [x] 密码登录");
    expect(after).toContain("提供登录鉴权能力。");
    const stripDeps = (t: string) => t.replace(/^deps:.*$/m, "");
    expect(stripDeps(after)).toBe(stripDeps(before));
  });

  it("done/dropped 拒绝拆分；未知 id 报错；id 冲突报错", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split3-"));
    await makeSampleProject(root);
    expect(() => splitNode(root, "M1-core", ["x"])).toThrow(/已是 done/);
    expect(() => splitNode(root, "NOPE", ["x"])).toThrow(/未找到节点/);
    splitNode(root, "M3-login", ["任务一"]);
    expect(() => splitNode(root, "M3-login", ["任务二"])).toThrow(/任务 id 已存在/);
  });

  it("in-progress 拆分出警告", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split4-"));
    await makeSampleProject(root);
    const { warnings } = splitNode(root, "M2-auth", ["任务一"]);
    expect(warnings).toContain("M2-auth 进行中——拆分后请复核任务范围");
  });

  it("标题含 YAML 特殊字符（冒号/引号）时安全落盘", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split6-"));
    await makeSampleProject(root);
    splitNode(root, "M3-login", ['修复: 崩溃"']);
    const doc = loadPlan(root).nodes.find((n) => n.fm.id === "M3-login-t1")!;
    expect(doc.fm.title).toBe('修复: 崩溃"');
  });

  it("块式 deps 写法也能改写", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-split5-"));
    await makeSampleProject(root);
    const file = path.join(root, "plan", "milestones", "M2-auth.md");
    fs.writeFileSync(
      file,
      fs.readFileSync(file, "utf8").replace("deps: [M1-core]", "deps:\n  - M1-core"),
      "utf8",
    );
    splitNode(root, "M2-auth", ["任务一"]);
    const text = fs.readFileSync(file, "utf8");
    expect(text).toContain("deps: [M2-auth-t1]");
    expect(text).not.toContain("- M1-core");
  });
});
