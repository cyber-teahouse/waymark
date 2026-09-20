import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSampleProject } from "./helpers.js";
import { buildWorkflow } from "../src/sync/build.js";
import { renderWorkflowHtml, writeWorkflow, writeIndexHtml } from "../src/render/render.js";

describe("renderWorkflowHtml", () => {
  it("renders workflow into standalone html using stub bundle", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-render-"));
    await makeSampleProject(root);
    const { workflow } = await buildWorkflow(root);
    const html = renderWorkflowHtml(workflow, '<html><body><div id="root"></div></body></html>');
    expect(html).toContain("M1-core");
    expect(html).toContain("__PLANFLOW_DATA__");
    expect(html).toContain('<div id="root">');
  });
  it("writeWorkflow + writeIndexHtml produce files under .planflow", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-render2-"));
    await makeSampleProject(root);
    const { workflow } = await buildWorkflow(root);
    writeWorkflow(root, workflow);
    writeIndexHtml(root, "<html>ok</html>");
    expect(fs.existsSync(path.join(root, ".planflow", "workflow.json"))).toBe(true);
    expect(fs.readFileSync(path.join(root, ".planflow", "index.html"), "utf8")).toBe("<html>ok</html>");
  });
});
