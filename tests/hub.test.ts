import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { gatherHubData, renderHubHtml } from "../src/hub/hub.js";
import { writeIndexHtml, writeWorkflow } from "../src/render/render.js";
import { buildWorkflow } from "../src/sync/build.js";
import { makeSampleProject } from "./helpers.js";

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
  it("aggregates synced/unsynced projects by glob, skipping noise and non-project dirs", async () => {
    const entries = gatherHubData([`${base}/*`]);
    // gamma-empty（无 plan/ 与 .waymark/）不是项目目录，不再列入
    expect(entries.map((e) => e.name).sort()).toEqual(["alpha-proj", "beta-proj"]);
    const alpha = entries.find((e) => e.name === "alpha-proj")!;
    expect(alpha.found).toBe(true);
    expect(alpha.stats!.total).toBe(3);
    expect(alpha.pagePath).toBeTruthy();
    const beta = entries.find((e) => e.name === "beta-proj")!;
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
    const patched = entries.map((e) => ({ ...e, generatedAt: old }));
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

describe("加权完成率圆环", () => {
  it("优先 stats.progress，缺失回退 done/total", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-hubp-"));
    const proj = path.join(root, "alpha");
    fs.mkdirSync(path.join(proj, ".waymark"), { recursive: true });
    const stats = { total: 2, done: 1, inProgress: 1, planned: 0, blocked: 0, dropped: 0, warnings: 0 };
    const write = (s: object) =>
      fs.writeFileSync(
        path.join(proj, ".waymark", "workflow.json"),
        JSON.stringify({
          version: 1,
          generatedAt: new Date().toISOString(),
          project: "alpha",
          nodes: [],
          edges: [],
          iterations: [],
          stats: s,
        }),
        "utf8",
      );
    const page = (p: string) => {
      fs.mkdirSync(path.join(p, ".waymark"), { recursive: true });
      fs.writeFileSync(path.join(p, ".waymark", "index.html"), "<html></html>", "utf8");
    };
    write({ ...stats, progress: 75 });
    page(proj);
    const html = renderHubHtml(gatherHubData([proj.replace(/\\/g, "/")]), new Date().toISOString());
    expect(html).toContain(">75<");

    write(stats); // 旧数据无 progress → 回退 1/2 = 50
    const html2 = renderHubHtml(gatherHubData([proj.replace(/\\/g, "/")]), new Date().toISOString());
    expect(html2).toContain(">50<");

    write({ ...stats, progress: "75" as unknown as number }); // 非数值 progress → typeof 守卫拒绝 → 回退 1/2 = 50
    const html3 = renderHubHtml(gatherHubData([proj.replace(/\\/g, "/")]), new Date().toISOString());
    expect(html3).toContain(">50<");
  });
});

describe("hub 健壮性（stats 形状守卫与钳制）", () => {
  it("workflow.json 可 parse 但 stats 形状不符 → found:false，渲染不崩且显示修复提示", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-hubbad-"));
    const proj = path.join(root, "broken").replace(/\\/g, "/");
    fs.mkdirSync(path.join(proj, ".waymark"), { recursive: true });
    fs.writeFileSync(
      path.join(proj, ".waymark", "workflow.json"),
      JSON.stringify({ version: 1, project: "broken", generatedAt: new Date().toISOString(), stats: 5 }),
      "utf8",
    );
    const entries = gatherHubData([proj]);
    expect(entries[0].found).toBe(false);
    expect(entries[0].error).toContain("缺少 stats");
    expect(entries[0].error).toContain("waymark sync");
    const html = renderHubHtml(entries, new Date().toISOString());
    expect(html).toContain("缺少 stats 或格式不符");
  });

  it("progress 越界（手改 500）→ percent 统一钳制，圆环文本与 bar 宽度均为 100", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-hubclamp-"));
    const proj = path.join(root, "alpha").replace(/\\/g, "/");
    fs.mkdirSync(path.join(proj, ".waymark"), { recursive: true });
    fs.writeFileSync(
      path.join(proj, ".waymark", "workflow.json"),
      JSON.stringify({
        version: 1,
        generatedAt: new Date().toISOString(),
        project: "alpha",
        stats: {
          total: 2,
          done: 1,
          inProgress: 1,
          planned: 0,
          blocked: 0,
          dropped: 0,
          warnings: 0,
          progress: 500,
        },
      }),
      "utf8",
    );
    const html = renderHubHtml(gatherHubData([proj]), new Date().toISOString());
    expect(html).toContain(">100<");
    expect(html).toContain('style="width:100%"');
  });
});
