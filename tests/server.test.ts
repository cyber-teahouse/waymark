import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSampleProject } from "./helpers.js";
import { collectEvidenceWatchTargets, startServer } from "../src/ui/server.js";

describe("collectEvidenceWatchTargets", () => {
  it("derives existing static dirs from evidence globs", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-ui-"));
    await makeSampleProject(root);
    const targets = collectEvidenceWatchTargets(root);
    expect(targets.some(t => t.replace(/\\/g, "/").endsWith("src/core"))).toBe(true);
    expect(targets.some(t => t.replace(/\\/g, "/").endsWith("src/auth"))).toBe(true);
  });
});

describe("server smoke", () => {
  it("serves html with injected data and exposes SSE headers", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-ui2-"));
    await makeSampleProject(root);
    // bundle 参数注入 stub，测试不依赖 vite 构建产物；默认走 loadBundle()
    const server = startServer(root, 0, '<html><body><div id="root"></div>stub</body></html>');
    await new Promise<void>(resolve => server.on("listening", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    const page = await fetch(`http://127.0.0.1:${port}/`);
    expect(page.status).toBe(200);
    const body = await page.text();
    expect(body).toContain("stub");
    expect(body).toContain("__PLANFLOW_DATA__");

    const sse = await fetch(`http://127.0.0.1:${port}/events`);
    expect(sse.headers.get("content-type")).toContain("text/event-stream");
    sse.body?.cancel();

    await new Promise<void>(resolve => server.close(() => resolve()));
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  });
});
