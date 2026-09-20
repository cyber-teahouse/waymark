import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderHtml } from "./template.js";
import { WorkflowJsonSchema, type WorkflowJson } from "../types.js";

export function bundlePath(): string {
  // 编译后位于 dist/render/render.js → ../web-dist = dist/web-dist（与 vite outDir 一致）
  return fileURLToPath(new URL("../web-dist/index.html", import.meta.url));
}

export function loadBundle(): string {
  const p = bundlePath();
  if (!fs.existsSync(p)) {
    throw new Error(`前端产物缺失: ${p} —— 请先在 planflow 包内运行 npm run build:web`);
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
  const dir = path.join(root, ".planflow");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workflow.json"), JSON.stringify(workflow, null, 2), "utf8");
}

export function writeIndexHtml(root: string, html: string): void {
  const dir = path.join(root, ".planflow");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
}

/** plan/ 下是否有文件比参照文件（workflow.json）新——用于 render 时提示数据过期。 */
export function planNewerThan(root: string, refFile: string): boolean {
  const planDir = path.join(root, "plan");
  if (!fs.existsSync(planDir)) return false;
  const ref = fs.existsSync(refFile) ? fs.statSync(refFile).mtimeMs : 0;
  let newest = 0;
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
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
  walk(planDir);
  return newest > ref;
}
