import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderWorkflowHtml, writeWorkflow } from "../src/render/render.js";
import { runInit } from "../src/scaffold.js";
import { buildWorkflow } from "../src/sync/build.js";
import { makeSampleProject } from "./helpers.js";

describe("e2e: init → sync → render", () => {
  it("init scaffold passes its own check; sync+render produce viewable html", async () => {
    // 1) init 到全新目录，且骨架自身零 issue
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-e2e-"));
    runInit(root);
    const { workflow, issues } = await buildWorkflow(root);
    expect(issues).toEqual([]);
    expect(workflow.stats.total).toBe(1);

    // 2) 覆盖为完整样例项目，sync + render
    fs.rmSync(path.join(root, "plan"), { recursive: true, force: true });
    await makeSampleProject(root);
    const full = await buildWorkflow(root);
    expect(full.issues).toEqual([]);
    writeWorkflow(root, full.workflow);

    const stubBundle = '<!doctype html><html><body><div id="root"></div></body></html>';
    const html = renderWorkflowHtml(full.workflow, stubBundle);
    writeIndexHtmlFile(root, html);
    const written = fs.readFileSync(path.join(root, ".waymark", "index.html"), "utf8");
    expect(written).toContain("M1-core");
    expect(written).toContain("__WAYMARK_DATA__");
    expect(written).toContain('<div id="root">');
  });
});

function writeIndexHtmlFile(root: string, html: string): void {
  fs.mkdirSync(path.join(root, ".waymark"), { recursive: true });
  fs.writeFileSync(path.join(root, ".waymark", "index.html"), html, "utf8");
}
