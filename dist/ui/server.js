import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
import { buildWorkflow } from "../sync/build.js";
import { renderWorkflowHtml, loadBundle, collectEvidenceWatchTargets } from "../render/render.js";
import { startNode, markDone, blockNode, dropNode, reopenNode } from "../plan/commands.js";
export { collectEvidenceWatchTargets } from "../render/render.js";
const MAX_BODY_BYTES = 1_000_000;
function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", (c) => {
            size += c.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error("请求体过大"));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}
export function startServer(root, port, bundle) {
    let cache = null;
    let watcher;
    const clients = new Set();
    const bundleHtml = bundle ?? loadBundle();
    async function renderPage() {
        const { workflow } = await buildWorkflow(root);
        return renderWorkflowHtml(workflow, bundleHtml);
    }
    function pushReload() {
        for (const c of clients)
            c.write("data: reload\n\n");
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
        // 节点写操作（认领开工/标记完成/受阻/放弃/重新打开）：与 CLI/MCP 同一引擎，完成后重建页面并推流刷新
        if (req.url?.startsWith("/api/")) {
            const json = (status, obj) => {
                res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
                res.end(JSON.stringify(obj));
            };
            if (req.method !== "POST") {
                json(405, { ok: false, error: "仅支持 POST" });
                return;
            }
            // CSRF 防护：自定义头无法被跨站表单携带（会触发预检，而本服务不应答预检）
            if (req.headers["x-waymark"] !== "ui") {
                json(403, { ok: false, error: "缺少 x-waymark 请求头（防跨站伪造）" });
                return;
            }
            let body;
            try {
                body = JSON.parse((await readBody(req)) || "{}");
            }
            catch {
                json(400, { ok: false, error: "请求体不是合法 JSON" });
                return;
            }
            if (typeof body.id !== "string" || body.id === "") {
                json(400, { ok: false, error: "缺少节点 id" });
                return;
            }
            const note = typeof body.note === "string" && body.note !== "" ? body.note : undefined;
            try {
                const result = (() => {
                    switch (req.url) {
                        case "/api/start": return startNode(root, body.id);
                        case "/api/done": return markDone(root, body.id, {
                            note,
                            allAcceptance: body.allAcceptance === true,
                        });
                        case "/api/block": return blockNode(root, body.id, { note });
                        case "/api/drop": return dropNode(root, body.id, { note });
                        case "/api/reopen": return reopenNode(root, body.id, {
                            planned: body.planned === true,
                            note,
                        });
                        default: throw new Error(`未知接口: ${req.url}`);
                    }
                })();
                try {
                    cache = await renderPage();
                    pushReload();
                }
                catch {
                    // 数据半写状态渲染失败不影响操作结果，等下次变更再刷新
                }
                json(200, { ok: true, file: result.file, warnings: result.warnings });
            }
            catch (e) {
                json(400, { ok: false, error: e.message });
            }
            return;
        }
        try {
            if (cache === null)
                cache = await renderPage();
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end(cache);
        }
        catch (e) {
            res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
            res.end(`Waymark 渲染失败: ${e.message}`);
        }
    });
    // realpathSync 归一化路径（消除 Windows 8.3 短名/大小写形态差异——同一目录两种形态的
    // 监听会触发 libuv fs-event 断言崩溃），并去重
    const watchTargets = [
        path.join(root, "plan"),
        path.join(root, ".git", "HEAD"),
        path.join(root, ".git", "index"),
        ...collectEvidenceWatchTargets(root),
    ]
        .filter(t => fs.existsSync(t))
        .map(t => { try {
        return fs.realpathSync(t);
    }
    catch {
        return t;
    } });
    const uniqueTargets = [...new Set(watchTargets)];
    server.on("listening", () => {
        watcher = watch(uniqueTargets, {
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 200 },
        });
        let timer;
        watcher.on("all", () => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                try {
                    cache = await renderPage();
                    pushReload();
                }
                catch {
                    // 文档半写状态渲染失败：保留旧页面，等下一次变更
                }
            }, 500);
        });
    });
    server.on("error", (e) => {
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
