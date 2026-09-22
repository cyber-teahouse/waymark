import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import { buildWorkflow } from "../sync/build.js";
import { renderWorkflowHtml, loadBundle, collectEvidenceWatchTargets } from "../render/render.js";

export { collectEvidenceWatchTargets } from "../render/render.js";

export function startServer(root: string, port: number, bundle?: string): http.Server {
  let cache: string | null = null;
  let watcher: FSWatcher | undefined;
  const clients = new Set<http.ServerResponse>();
  const bundleHtml = bundle ?? loadBundle();

  async function renderPage(): Promise<string> {
    const { workflow } = await buildWorkflow(root);
    return renderWorkflowHtml(workflow, bundleHtml);
  }

  const server = http.createServer(async (req, res) => {
    if (req.url === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("retry: 2000\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    try {
      if (cache === null) cache = await renderPage();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(cache);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Waymark 渲染失败: ${(e as Error).message}`);
    }
  });

  const watchTargets = [
    path.join(root, "plan"),
    path.join(root, ".git", "HEAD"),
    path.join(root, ".git", "index"),
    ...collectEvidenceWatchTargets(root),
  ].filter(t => fs.existsSync(t));

  server.on("listening", () => {
    watcher = watch(watchTargets, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    watcher.on("all", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          cache = await renderPage();
          for (const c of clients) c.write("data: reload\n\n");
        } catch {
          // 文档半写状态渲染失败：保留旧页面，等下一次变更
        }
      }, 500);
    });
  });

  server.on("error", (e: Error) => {
    console.error(`✖ Waymark UI 启动失败: ${e.message}`);
    process.exitCode = 1;
  });
  server.on("close", () => {
    void watcher?.close();
  });

  server.listen(port, "127.0.0.1", () => {
    const addr = server.address();
    const p = typeof addr === "object" && addr ? addr.port : port;
    console.log(`Waymark UI: http://localhost:${p}`);
  });
  return server;
}
