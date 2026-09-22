import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSampleProject } from "./helpers.js";
import { buildWorkflow } from "../src/sync/build.js";
import { renderWorkflowHtml, writeWorkflow, writeIndexHtml, planNewerThan, workflowInputMtime, dirNewestMtime } from "../src/render/render.js";

describe("renderWorkflowHtml", () => {
  it("renders workflow into standalone html using stub bundle", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-render-"));
    await makeSampleProject(root);
    const { workflow } = await buildWorkflow(root);
    const html = renderWorkflowHtml(workflow, '<html><body><div id="root"></div></body></html>');
    expect(html).toContain("M1-core");
    expect(html).toContain("__WAYMARK_DATA__");
    expect(html).toContain('<div id="root">');
  });
  it("writeWorkflow + writeIndexHtml produce files under .waymark", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-render2-"));
    await makeSampleProject(root);
    const { workflow } = await buildWorkflow(root);
    writeWorkflow(root, workflow);
    writeIndexHtml(root, "<html>ok</html>");
    expect(fs.existsSync(path.join(root, ".waymark", "workflow.json"))).toBe(true);
    expect(fs.readFileSync(path.join(root, ".waymark", "index.html"), "utf8")).toBe("<html>ok</html>");
  });
});

describe("planNewerThan（含证据目录）", () => {
  it("ref 文件最新时返回 false", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-render3-"));
    await makeSampleProject(root);
    const ref = path.join(root, "ref.json");
    fs.writeFileSync(ref, "{}");
    // ref 刚刚写入，必然晚于 plan/ 与证据目录的 mtime
    const future = Date.now() + 10_000;
    fs.utimesSync(ref, future / 1000, future / 1000);
    expect(planNewerThan(root, ref)).toBe(false);
  });

  it("证据目录内文件比 ref 新时返回 true（plan/ 未动）", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-render4-"));
    await makeSampleProject(root);
    const ref = path.join(root, "ref.json");
    fs.writeFileSync(ref, "{}");
    const future = Date.now() + 10_000;
    fs.utimesSync(ref, future / 1000, future / 1000);
    // 只改证据文件，不动 plan/
    const evidenceFile = path.join(root, "src", "core", "index.ts");
    const newer = future / 1000 + 10;
    fs.utimesSync(evidenceFile, newer, newer);
    expect(planNewerThan(root, ref)).toBe(true);
  });

  it("workflowInputMtime 不晚于证据目录 mtime；dirNewestMtime 对缺失目录返回 0", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-render5-"));
    await makeSampleProject(root);
    expect(workflowInputMtime(root))
      .toBeGreaterThanOrEqual(dirNewestMtime(path.join(root, "src", "core")));
    expect(dirNewestMtime(path.join(root, "no-such-dir"))).toBe(0);
  });

  it("dirNewestMtime 跳过 node_modules 等忽略目录", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-render6-"));
    await makeSampleProject(root);
    const nm = path.join(root, "src", "core", "node_modules", "big");
    fs.mkdirSync(nm, { recursive: true });
    const futureSec = Date.now() / 1000 + 3600;
    const deep = path.join(nm, "f.js");
    fs.writeFileSync(deep, "x");
    fs.utimesSync(deep, futureSec, futureSec);
    expect(dirNewestMtime(path.join(root, "src", "core"))).toBeLessThan(futureSec * 1000);
  });
});
