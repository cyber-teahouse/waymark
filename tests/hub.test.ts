import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSampleProject } from "./helpers.js";
import { buildWorkflow } from "../src/sync/build.js";
import { writeWorkflow, writeIndexHtml } from "../src/render/render.js";
import { gatherHubData, renderHubHtml } from "../src/hub/hub.js";
import { runCli } from "../src/cli.js";

let base: string;
let synced: string;
let unsynced: string;

beforeAll(async () => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "pf-hub-").replace(/\\/g, "/"));
  synced = path.join(base, "alpha-proj").replace(/\\/g, "/");
  unsynced = path.join(base, "beta-proj").replace(/\\/g, "/");
  fs.mkdirSync(path.join(base, "gamma-empty"), { recursive: true });
  fs.mkdirSync(path.join(base, "node_modules", "some-pkg"), { recursive: true });
  fs.mkdirSync(path.join(base, ".hidden-proj"), { recursive: true });
  await makeSampleProject(synced);
  fs.mkdirSync(path.join(unsynced, "plan", "milestones"), { recursive: true });
  // alpha 预先完成 sync + render，供 pagePath / 数据聚合断言使用
  const { workflow } = await buildWorkflow(synced);
  writeWorkflow(synced, workflow);
  writeIndexHtml(synced, "<html>ok</html>");
});

describe("gatherHubData", () => {
  it("aggregates synced/unsynced/empty projects by glob, skipping noise dirs", async () => {
    const entries = gatherHubData([`${base}/*`]);
    expect(entries.map(e => e.name).sort()).toEqual(["alpha-proj", "beta-proj", "gamma-empty"]);
    const alpha = entries.find(e => e.name === "alpha-proj")!;
    expect(alpha.found).toBe(true);
    expect(alpha.stats!.total).toBe(3);
    expect(alpha.pagePath).toBeTruthy();
    const beta = entries.find(e => e.name === "beta-proj")!;
    expect(beta.found).toBe(false);
    expect(beta.error).toContain("waymark sync");
  });
  it("falls back to directory name when project field missing", async () => {
    const root = path.join(base, "alpha-proj").replace(/\\/g, "/");
    const wfFile = path.join(root, ".waymark", "workflow.json");
    const wf = JSON.parse(fs.readFileSync(wfFile, "utf8"));
    delete wf.project;
    fs.writeFileSync(wfFile, JSON.stringify(wf), "utf8");
    const entries = gatherHubData([`${base}/alpha-proj`]);
    expect(entries[0].name).toBe("alpha-proj");
    // 还原
    wf.project = "alpha-proj";
    fs.writeFileSync(wfFile, JSON.stringify(wf), "utf8");
  });
});

describe("renderHubHtml", () => {
  it("renders cards with escaped names, stats, file links and unsynced state", () => {
    const entries = gatherHubData([`${base}/*`]);
    const html = renderHubHtml(entries, new Date().toISOString());
    expect(html).toContain("项目总览");
    expect(html).toContain("alpha-proj");
    expect(html).toContain("beta-proj");
    expect(html).toContain("未同步");
    expect(html).toContain("waymark sync");
    expect(html).toContain("<a");
    expect(html).toContain("file://");
    expect(html).not.toContain("<script>alert"); // 名称转义
  });
  it("marks stale data older than 7 days", () => {
    const entries = gatherHubData([`${base}/alpha-proj`]);
    const old = new Date(Date.now() - 10 * 86400000).toISOString();
    const patched = entries.map(e => ({ ...e, generatedAt: old }));
    const html = renderHubHtml(patched, new Date().toISOString());
    expect(html).toContain("已过期");
  });
});

describe("hub CLI command", () => {
  it("writes .waymark/hub.html under --root and prints a summary", async () => {
    await runCli(["--root", base, "hub"]);
    const hubFile = path.join(base, ".waymark", "hub.html");
    const html = fs.readFileSync(hubFile, "utf8");
    expect(html).toContain("项目总览");
    expect(html).toContain("alpha-proj");
  });
  it("honors trailing --root and -o for a custom output path", async () => {
    const out = path.join(base, "custom-hub.html").replace(/\\/g, "/");
    await runCli(["hub", "--root", base, "-o", out]);
    expect(fs.existsSync(out)).toBe(true);
  });
});
