import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPlan } from "../src/parser/parsePlan.js";
import {
  blockNode,
  dropNode,
  listReady,
  markDone,
  reopenNode,
  startNode,
  toggleAcceptance,
} from "../src/plan/commands.js";
import { makeSampleProject } from "./helpers.js";

function makeTinyProject(dest: string): void {
  fs.mkdirSync(path.join(dest, "plan", "milestones"), { recursive: true });
  fs.mkdirSync(path.join(dest, "plan", "iterations"), { recursive: true });
  fs.writeFileSync(
    path.join(dest, "plan", "overview.md"),
    "# 总览\n\n| id | 标题 | 迭代 |\n|----|------|------|\n| A-base | 基座 | I1 |\n| B-app | 应用 | I1 |\n",
  );
  fs.writeFileSync(path.join(dest, "plan", "iterations", "I1.md"), "---\nid: I1\ntitle: 一期\n---\n");
  fs.writeFileSync(
    path.join(dest, "plan", "milestones", "A.md"),
    "---\nid: A-base\ntitle: 基座\ntype: milestone\nstatus: done\ndeps: []\niteration: I1\nacceptance:\n  - [ ] 验收一\n---\n\n## 需求描述\n基座。\n",
  );
  fs.writeFileSync(
    path.join(dest, "plan", "milestones", "B.md"),
    "---\nid: B-app\ntitle: 应用\ntype: milestone\nstatus: planned\ndeps: [A-base]\niteration: I1\nacceptance:\n  - [ ] 全部就绪\n---\n\n## 需求描述\n应用层。\n",
  );
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
    const b = plan.nodes.find((n) => n.fm.id === "B-app")!;
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

describe("startNode", () => {
  it("flips planned → in-progress with no warnings when deps satisfied", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-start-"));
    makeTinyProject(root);
    const { warnings } = startNode(root, "B-app");
    expect(warnings).toEqual([]);
    const text = fs.readFileSync(path.join(root, "plan", "milestones", "B.md"), "utf8");
    expect(text).toMatch(/^status: in-progress$/m);
    // 其余内容不动
    expect(text).toMatch(/deps: \[A-base\]/);
  });
  it("warns (but allows) when deps unmet", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-start2-"));
    makeTinyProject(root);
    const aFile = path.join(root, "plan", "milestones", "A.md");
    fs.writeFileSync(aFile, fs.readFileSync(aFile, "utf8").replace("status: done", "status: in-progress"));
    const { warnings } = startNode(root, "B-app");
    expect(warnings.some((w) => w.includes("依赖未完成") && w.includes("A-base"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "plan", "milestones", "B.md"), "utf8")).toMatch(
      /^status: in-progress$/m,
    );
  });
  it("throws when node is not planned", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-start3-"));
    makeTinyProject(root);
    expect(() => startNode(root, "A-base")).toThrow(/仅 planned/);
    expect(() => startNode(root, "NOPE")).toThrow(/未找到节点/);
  });
});

describe("markDone 护栏警告", () => {
  it("warns on unfinished deps and unchecked acceptance", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-guard-"));
    makeTinyProject(root);
    const aFile = path.join(root, "plan", "milestones", "A.md");
    fs.writeFileSync(aFile, fs.readFileSync(aFile, "utf8").replace("status: done", "status: in-progress"));
    const { warnings } = markDone(root, "B-app", { date: "2026-09-22" });
    expect(warnings.some((w) => w.includes("依赖未完成") && w.includes("A-base"))).toBe(true);
    expect(warnings.some((w) => w.includes("验收标准未勾选"))).toBe(true);
  });
  it("no warnings when deps done and --acc given", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-guard2-"));
    makeTinyProject(root);
    const { warnings } = markDone(root, "B-app", { allAcceptance: true, date: "2026-09-22" });
    expect(warnings).toEqual([]);
  });
  it("warns when previous status is blocked", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-guard3-"));
    makeTinyProject(root);
    const bFile = path.join(root, "plan", "milestones", "B.md");
    fs.writeFileSync(bFile, fs.readFileSync(bFile, "utf8").replace("status: planned", "status: blocked"));
    const { warnings } = markDone(root, "B-app", { allAcceptance: true });
    expect(warnings.some((w) => w.includes("原状态为 blocked"))).toBe(true);
  });
  it("warns when node was already done", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-guard4-"));
    makeTinyProject(root);
    const { warnings } = markDone(root, "A-base", { note: "重复标记", date: "2026-09-22" });
    expect(warnings.some((w) => w.includes("此前已是 done"))).toBe(true);
  });
});

describe("listReady", () => {
  it("lists planned nodes whose deps are done/dropped", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-ready-"));
    makeTinyProject(root);
    // B-app 依赖 A-base(done) → ready
    expect(listReady(root).map((n) => n.id)).toEqual(["B-app"]);
  });
  it("excludes planned nodes with unsatisfied deps", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-ready2-"));
    makeTinyProject(root);
    fs.writeFileSync(
      path.join(root, "plan", "milestones", "A.md"),
      fs
        .readFileSync(path.join(root, "plan", "milestones", "A.md"), "utf8")
        .replace("status: done", "status: in-progress"),
    );
    expect(listReady(root)).toEqual([]);
  });
  it("uses sample project: M3 blocked by in-progress M2, nothing ready", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-ready3-"));
    await makeSampleProject(root);
    expect(listReady(root)).toEqual([]);
  });
});

describe("blockNode / dropNode（旁路状态）", () => {
  it("block: planned → blocked and appends [blocked] note", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-block-"));
    makeTinyProject(root);
    const { file, warnings } = blockNode(root, "B-app", { note: "等待平台选型", date: "2026-09-23" });
    expect(file).toBe("plan/milestones/B.md");
    expect(warnings).toEqual([]);
    const text = fs.readFileSync(path.join(root, "plan", "milestones", "B.md"), "utf8");
    expect(text).toMatch(/^status: blocked$/m);
    expect(text).toContain("- 2026-09-23 [blocked] 等待平台选型");
    expect(text).toContain("应用层。");
  });
  it("block on already-blocked node no-ops with a warning", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-block2-"));
    makeTinyProject(root);
    blockNode(root, "B-app", { date: "2026-09-23" });
    const before = fs.readFileSync(path.join(root, "plan", "milestones", "B.md"), "utf8");
    const { warnings } = blockNode(root, "B-app", { date: "2026-09-24" });
    expect(warnings.some((w) => w.includes("已是 blocked"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "plan", "milestones", "B.md"), "utf8")).toBe(before);
  });
  it("block on done node warns 复核 but proceeds", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-block3-"));
    makeTinyProject(root);
    const { warnings } = blockNode(root, "A-base", { date: "2026-09-23" });
    expect(warnings.some((w) => w.includes("已完成"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "plan", "milestones", "A.md"), "utf8")).toMatch(
      /^status: blocked$/m,
    );
  });
  it("drop: in-progress → dropped with [dropped] note", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-drop-"));
    makeTinyProject(root);
    startNode(root, "B-app");
    const { warnings } = dropNode(root, "B-app", { note: "需求砍掉", date: "2026-09-23" });
    expect(warnings).toEqual([]);
    const text = fs.readFileSync(path.join(root, "plan", "milestones", "B.md"), "utf8");
    expect(text).toMatch(/^status: dropped$/m);
    expect(text).toContain("- 2026-09-23 [dropped] 需求砍掉");
  });
  it("throws on unknown id", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-block4-"));
    makeTinyProject(root);
    expect(() => blockNode(root, "NOPE")).toThrow(/未找到节点/);
    expect(() => dropNode(root, "NOPE")).toThrow(/未找到节点/);
  });
});

describe("reopenNode（撤销旁路/完成）", () => {
  it("done → in-progress by default with [reopened] note", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-reopen-"));
    makeTinyProject(root);
    const { warnings } = reopenNode(root, "A-base", { note: "返工", date: "2026-09-23" });
    expect(warnings).toEqual([]);
    const text = fs.readFileSync(path.join(root, "plan", "milestones", "A.md"), "utf8");
    expect(text).toMatch(/^status: in-progress$/m);
    expect(text).toContain("- 2026-09-23 [reopened] 返工");
  });
  it("restores to planned with --planned", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-reopen2-"));
    makeTinyProject(root);
    reopenNode(root, "A-base", { planned: true });
    expect(fs.readFileSync(path.join(root, "plan", "milestones", "A.md"), "utf8")).toMatch(
      /^status: planned$/m,
    );
  });
  it("blocked → in-progress", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-reopen3-"));
    makeTinyProject(root);
    blockNode(root, "B-app", { date: "2026-09-23" });
    const { warnings } = reopenNode(root, "B-app");
    expect(warnings).toEqual([]);
    expect(fs.readFileSync(path.join(root, "plan", "milestones", "B.md"), "utf8")).toMatch(
      /^status: in-progress$/m,
    );
  });
  it("on planned node throws（用 start 认领开工）", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-reopen4-"));
    makeTinyProject(root);
    expect(() => reopenNode(root, "B-app")).toThrow(/planned，无需重新打开/);
  });
  it("on in-progress node no-ops with a warning", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-reopen5-"));
    makeTinyProject(root);
    startNode(root, "B-app");
    const before = fs.readFileSync(path.join(root, "plan", "milestones", "B.md"), "utf8");
    const { warnings } = reopenNode(root, "B-app");
    expect(warnings.some((w) => w.includes("已是 in-progress"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "plan", "milestones", "B.md"), "utf8")).toBe(before);
  });
});

describe("toggleAcceptance", () => {
  it("翻转指定项并写回文件（1 起编号，可多个），返回更新后的验收列表", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-acc-"));
    await makeSampleProject(root);
    // M2-auth（in-progress）：[x] 密码登录 / [ ] 刷新令牌
    const r = toggleAcceptance(root, "M2-auth", [2]);
    expect(r.file).toBe("plan/milestones/M2-auth.md");
    expect(r.acceptance).toEqual([
      { done: true, text: "密码登录" },
      { done: true, text: "刷新令牌" },
    ]);
    // 全部勾选后提示可用 done 收尾
    expect(r.warnings.some((w) => w.includes("全部勾选"))).toBe(true);
    const text = fs.readFileSync(path.join(root, "plan", "milestones", "M2-auth.md"), "utf8");
    expect(text).toContain("- [x] 密码登录");
    expect(text).toContain("- [x] 刷新令牌");

    // 再翻回（多个序号一次翻转）
    const r2 = toggleAcceptance(root, "M2-auth", [1, 2]);
    expect(r2.acceptance).toEqual([
      { done: false, text: "密码登录" },
      { done: false, text: "刷新令牌" },
    ]);
    const text2 = fs.readFileSync(path.join(root, "plan", "milestones", "M2-auth.md"), "utf8");
    expect(text2).toContain("- [ ] 密码登录");
    expect(text2).toContain("- [ ] 刷新令牌");
  });

  it("done 节点取消勾选给出复核警告", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-acc2-"));
    await makeSampleProject(root);
    // M1-core（done，两项全勾）取消第 1 项
    const r = toggleAcceptance(root, "M1-core", [1]);
    expect(r.acceptance[0].done).toBe(false);
    expect(r.warnings.some((w) => w.includes("复核"))).toBe(true);
  });

  it("序号越界 / 空数组报错", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-acc3-"));
    await makeSampleProject(root);
    expect(() => toggleAcceptance(root, "M2-auth", [])).toThrow(/未指定验收项序号/);
    expect(() => toggleAcceptance(root, "M2-auth", [0])).toThrow(/越界/);
    expect(() => toggleAcceptance(root, "M2-auth", [3])).toThrow(/越界.*共 2 项/);
  });

  it("无验收项节点报错", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-acc4-"));
    await makeSampleProject(root);
    expect(() => toggleAcceptance(root, "M3-login", [1])).toThrow(/没有声明验收标准/);
  });

  it("只动 acceptance 块，其余 frontmatter 与正文不变", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-acc5-"));
    await makeSampleProject(root);
    const before = fs.readFileSync(path.join(root, "plan", "milestones", "M2-auth.md"), "utf8");
    toggleAcceptance(root, "M2-auth", [2]);
    const after = fs.readFileSync(path.join(root, "plan", "milestones", "M2-auth.md"), "utf8");
    expect(after.replace("- [ ] 刷新令牌", "- [ ] 刷新令牌")).toBe(after);
    // 正文与证据声明保持原样
    expect(after).toContain("提供登录鉴权能力。");
    expect(after).toContain("paths: [src/auth/**, src/missing/**]");
    expect(after.replace("- [x] 刷新令牌", "- [ ] 刷新令牌")).toBe(before);
  });
});
