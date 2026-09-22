import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderHtml } from "./template.js";
import { WorkflowJsonSchema, type WorkflowJson } from "../types.js";
import { loadPlan } from "../parser/parsePlan.js";

export function bundlePath(): string {
  // 编译后位于 dist/render/render.js → ../web-dist = dist/web-dist（与 vite outDir 一致）
  return fileURLToPath(new URL("../web-dist/index.html", import.meta.url));
}

export function loadBundle(): string {
  const p = bundlePath();
  if (!fs.existsSync(p)) {
    throw new Error(`前端产物缺失: ${p} —— 请先在 waymark 包内运行 npm run build:web`);
  }
  return fs.readFileSync(p, "utf8");
}

/** 对 workflow 契约自检后渲染完整 HTML。 */
export function renderWorkflowHtml(workflow: unknown, bundleHtml: string): string {
  const parsed = WorkflowJsonSchema.safeParse(workflow);
  if (!parsed.success) {
    throw new Error(`workflow 数据不符合契约: ${parsed.error.message}`);
  }
  return renderHtml(parsed.data, bundleHtml);
}

export function writeWorkflow(root: string, workflow: WorkflowJson): void {
  const dir = path.join(root, ".waymark");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workflow.json"), JSON.stringify(workflow, null, 2), "utf8");
}

export function writeIndexHtml(root: string, html: string): void {
  const dir = path.join(root, ".waymark");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
}

/** 目录内全部文件的最新 mtime（递归；目录不存在返回 0，单个文件 stat 失败忽略）。 */
export function dirNewestMtime(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let newest = 0;
  const walk = (d: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        try {
          newest = Math.max(newest, fs.statSync(full).mtimeMs);
        } catch {
          // 文件刚好被删：忽略
        }
      }
    }
  };
  walk(dir);
  return newest;
}

/** 从全部节点的 evidence.paths/tests 推导需要监听的静态目录（首个通配符前的部分）。 */
export function collectEvidenceWatchTargets(root: string): string[] {
  const plan = loadPlan(root);
  const dirs = new Set<string>();
  for (const n of plan.nodes) {
    const globs = [...(n.fm.evidence?.paths ?? []), ...(n.fm.evidence?.tests ?? [])];
    for (const g of globs) {
      const base = g.split("*")[0].replace(/\/$/, "");
      if (!base) continue;
      const abs = path.resolve(root, base);
      if (!fs.existsSync(abs)) continue;
      dirs.add(fs.statSync(abs).isDirectory() ? abs : path.dirname(abs));
    }
  }
  return [...dirs];
}

/** 工作流输入（plan/ 文档 + 证据目录 + git 索引）的最新 mtime。 */
export function workflowInputMtime(root: string): number {
  let newest = dirNewestMtime(path.join(root, "plan"));
  for (const t of [
    path.join(root, ".git", "HEAD"),
    path.join(root, ".git", "index"),
    ...collectEvidenceWatchTargets(root),
  ]) {
    try {
      if (!fs.existsSync(t)) continue;
      newest = fs.statSync(t).isDirectory()
        ? Math.max(newest, dirNewestMtime(t))
        : Math.max(newest, fs.statSync(t).mtimeMs);
    } catch {
      // 文件刚好被删：忽略
    }
  }
  return newest;
}

/** plan/ 或证据输入是否有文件比参照文件（workflow.json）新——用于 render 时提示数据过期。 */
export function planNewerThan(root: string, refFile: string): boolean {
  const ref = fs.existsSync(refFile) ? fs.statSync(refFile).mtimeMs : 0;
  return workflowInputMtime(root) > ref;
}
