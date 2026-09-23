import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSampleProject } from "./helpers.js";
import { runCli } from "../src/cli.js";
import { renderStatus, statusReport } from "../src/plan/status.js";
import type { WorkflowJson } from "../src/types.js";

async function syncedProject(): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-status-"));
  await makeSampleProject(root);
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  await runCli(["--root", root, "sync"]);
  spy.mockRestore();
  return root;
}

describe("renderStatus", () => {
  const now = new Date("2026-09-23T12:00:00Z");

  it("渲染进度条、统计与可开工清单", () => {
    const wf: WorkflowJson = {
      version: 1,
      generatedAt: "2026-09-23T10:00:00Z",
      project: "示例",
      nodes: [
        { id: "A", title: "甲", type: "milestone", declaredStatus: "done", inferredStatus: null, displayStatus: "done", warning: null, confidence: 1, evidenceReport: [], acceptance: [], completionLog: [], commits: [], iteration: "I1", deps: [], file: "plan/a.md", description: "" },
        { id: "B", title: "乙", type: "task", declaredStatus: "planned", inferredStatus: null, displayStatus: "planned", warning: null, confidence: 1, evidenceReport: [], acceptance: [], completionLog: [], commits: [], iteration: "I1", deps: ["A"], file: "plan/b.md", description: "" },
        { id: "C", title: "丙", type: "task", declaredStatus: "blocked", inferredStatus: null, displayStatus: "blocked", warning: null, confidence: 1, evidenceReport: [], acceptance: [], completionLog: [], commits: [], deps: [], file: "plan/c.md", description: "" },
      ],
      edges: [{ from: "A", to: "B" }],
      iterations: [{ id: "I1", title: "MVP", nodeIds: ["A", "B"] }],
      issues: [],
      stats: { total: 3, done: 1, inProgress: 0, planned: 1, blocked: 1, dropped: 0, warnings: 0 },
    };
    const out = renderStatus(wf, now);
    expect(out).toContain("示例 · 进度工作流");
    expect(out).toContain("33%（1/3）");
    expect(out).toContain("完成 1 · 进行中 0 · 未开始 1 · 受阻 1");
    expect(out).toContain("▶ B  乙  [I1]");
    expect(out).toContain("▲ C  丙");
    expect(out).toContain("生成于 2 小时前");
  });

  it("依赖未满足与旁路 dropped 的口径和 ready 一致", () => {
    const base = {
      version: 1 as const, generatedAt: "2026-09-23T12:00:00Z", project: "p",
      edges: [] as { from: string; to: string }[], iterations: [], issues: [],
      evidenceReport: [], acceptance: [], completionLog: [], commits: [], file: "", description: "", confidence: 1, warning: null, inferredStatus: null,
    };
    const mk = (id: string, displayStatus: "done" | "planned" | "dropped", deps: string[]) => ({
      ...base, id, title: id, type: "task" as const, declaredStatus: displayStatus, displayStatus, deps,
    });
    const wf: WorkflowJson = {
      ...base,
      nodes: [
        mk("A", "done", []),
        mk("B", "dropped", []),
        // C 依赖已完成的 A → 可开工；D 依赖 dropped 的 B → 可开工；E 依赖不存在的 X → 可开工
        mk("C", "planned", ["A"]), mk("D", "planned", ["B"]), mk("E", "planned", ["X"]),
        // F 依赖 planned 的 C → 不可开工
        mk("F", "planned", ["C"]),
      ],
      stats: { total: 6, done: 1, inProgress: 0, planned: 5, blocked: 0, dropped: 1, warnings: 0 },
    };
    const out = renderStatus(wf, now);
    expect(out).toContain("可开工 3 个");
    expect(out).toContain("▶ C");
    expect(out).toContain("▶ D");
    expect(out).toContain("▶ E");
    expect(out).not.toContain("▶ F");
  });
});

describe("waymark status 命令", () => {
  it("已 sync 项目输出一览", async () => {
    const root = await syncedProject();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runCli(["status", "--root", root]);
    const out = spy.mock.calls.map(c => c[0]).join("\n");
    spy.mockRestore();
    expect(out).toContain("进度工作流");
    expect(out).toContain("（1/3）");
  });

  it("未 sync 时报错提示，--fresh 自动同步", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-status-"));
    await makeSampleProject(root);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await runCli(["status", "--root", root]);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("请先运行 waymark sync"));

    spy.mockClear();
    await runCli(["status", "--root", root, "--fresh"]);
    const out = spy.mock.calls.map(c => c[0]).join("\n");
    expect(out).toContain("进度工作流");

    spy.mockRestore();
    err.mockRestore();
  });

  it("statusReport 与 CLI 输出一致", async () => {
    const root = await syncedProject();
    const text = await statusReport(root);
    expect(text).toContain("进度工作流");
  });
});
