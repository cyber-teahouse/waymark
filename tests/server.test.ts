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
    expect(body).toContain("__WAYMARK_DATA__");

    const sse = await fetch(`http://127.0.0.1:${port}/events`);
    expect(sse.headers.get("content-type")).toContain("text/event-stream");
    sse.body?.cancel();

    await new Promise<void>(resolve => server.close(() => resolve()));
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  });
});

describe("mutation api（POST /api/start、/api/done）", () => {
  const STUB = '<html><body><div id="root"></div>stub</body></html>';

  async function listen(root: string) {
    const server = startServer(root, 0, STUB);
    await new Promise<void>(resolve => server.on("listening", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    return { server, port };
  }

  async function post(port: number, path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  async function close(server: import("node:http").Server) {
    await new Promise<void>(resolve => server.close(() => resolve()));
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
  }

  it("rejects cross-site posts (403) and bad bodies (400)", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-api-"));
    await makeSampleProject(root);
    const { server, port } = await listen(root);

    const forbidden = await post(port, "/api/start", { id: "M3-login" });
    expect(forbidden.status).toBe(403);

    const noId = await post(port, "/api/start", {}, { "x-waymark": "ui" });
    expect(noId.status).toBe(400);

    const badId = await post(port, "/api/done", { id: "NOPE" }, { "x-waymark": "ui" });
    expect(badId.status).toBe(400);
    expect((await badId.json()).ok).toBe(false);

    await close(server);
  });

  it("POST /api/start 认领节点、改写 plan 文件并刷新页面数据", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-api2-"));
    await makeSampleProject(root);
    const { server, port } = await listen(root);

    const r = await post(port, "/api/start", { id: "M3-login" }, { "x-waymark": "ui" });
    expect(r.status).toBe(200);
    const obj = await r.json();
    expect(obj.ok).toBe(true);
    // M3 依赖的 M2-auth 仍在进行中 → 护栏警告但不阻止
    expect(obj.warnings.some((w: string) => w.includes("依赖未完成"))).toBe(true);

    expect(fs.readFileSync(path.join(root, "plan", "milestones", "M3-登录.md"), "utf8"))
      .toMatch(/^status: in-progress$/m);

    // 页面缓存已重建，携带新状态
    const page = await fetch(`http://127.0.0.1:${port}/`);
    expect(await page.text()).toContain('"declaredStatus":"in-progress"');

    await close(server);
  });

  it("POST /api/done 返回护栏警告并写入完成状态", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-api3-"));
    await makeSampleProject(root);
    const { server, port } = await listen(root);

    // M2-auth 有一项验收未勾选 → 警告
    const r = await post(port, "/api/done", { id: "M2-auth" }, { "x-waymark": "ui" });
    expect(r.status).toBe(200);
    const obj = await r.json();
    expect(obj.ok).toBe(true);
    expect(obj.warnings.some((w: string) => w.includes("验收标准未勾选"))).toBe(true);

    expect(fs.readFileSync(path.join(root, "plan", "milestones", "M2-auth.md"), "utf8"))
      .toMatch(/^status: done$/m);

    await close(server);
  });

  it("POST /api/done 带 note 写入完成记录", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-api4-"));
    await makeSampleProject(root);
    const { server, port } = await listen(root);

    const r = await post(port, "/api/done", {
      id: "M2-auth", note: "页面提交的完成说明", allAcceptance: true,
    }, { "x-waymark": "ui" });
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);

    const text = fs.readFileSync(path.join(root, "plan", "milestones", "M2-auth.md"), "utf8");
    expect(text).toContain("## 完成记录");
    expect(text).toMatch(/- \d{4}-\d{2}-\d{2} 页面提交的完成说明/);

    await close(server);
  });
});
