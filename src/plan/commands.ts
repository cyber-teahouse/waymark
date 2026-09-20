import fs from "node:fs";
import path from "node:path";
import { loadPlan } from "../parser/parsePlan.js";

export interface MarkDoneOptions {
  note?: string;
  allAcceptance?: boolean;
  /** 完成记录日期（默认今天，ISO 测试可注入） */
  date?: string;
}

function splitFrontmatter(raw: string): { fm: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) throw new Error("文件缺少 frontmatter 块");
  return { fm: m[1], body: raw.slice(m.index + m[0].length) };
}

/** 把节点标记为完成：status → done，可选勾全部验收、追加完成记录行。只动 frontmatter 的 status/acceptance 与完成记录区块。 */
export function markDone(root: string, id: string, opts: MarkDoneOptions = {}): { file: string } {
  const plan = loadPlan(root);
  const doc = plan.nodes.find(n => n.fm.id === id);
  if (!doc) throw new Error(`未找到节点: ${id}`);
  const abs = path.join(root, doc.file);
  const raw = fs.readFileSync(abs, "utf8");
  const { fm, body } = splitFrontmatter(raw);

  const nextFm = (() => {
    let fm2 = fm.replace(/^status:\s*.*$/m, "status: done");
    if (opts.allAcceptance) {
      fm2 = fm2.replace(/^(\s*-\s*)\[\s?\]/gm, "$1[x]");
    }
    return fm2;
  })();

  const date = opts.date ?? (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const note = opts.note?.trim().replace(/\r?\n+/g, " ");
  const nextBody = (() => {
    if (!note) return body;
    const secRe = /^##\s+完成记录\s*$/m;
    const sec = secRe.exec(body);
    if (!sec) {
      return body.replace(/\s*$/, `\n\n## 完成记录\n- ${date} ${note}\n`);
    }
    const after = body.slice(sec.index + sec[0].length);
    const next = /^##\s+/m.exec(after);
    const insertAt = sec.index + sec[0].length + (next ? next.index : after.length);
    return `${body.slice(0, insertAt)}\n- ${date} ${note}${body.slice(insertAt)}`;
  })();

  fs.writeFileSync(abs, `---\n${nextFm}\n---\n${nextBody}`, "utf8");
  return { file: doc.file };
}

export interface ReadyItem {
  id: string;
  title: string;
  iteration?: string;
  file: string;
}

/** 可开工节点：planned 且依赖全部 done/dropped（缺失的依赖视为满足，由 check 另行报错）。 */
export function listReady(root: string): ReadyItem[] {
  const plan = loadPlan(root);
  const statusOf = new Map(plan.nodes.map(n => [n.fm.id, n.fm.status]));
  return plan.nodes
    .filter(n => n.fm.status === "planned")
    .filter(n => n.fm.deps.every(d => {
      const s = statusOf.get(d);
      return s === undefined || s === "done" || s === "dropped";
    }))
    .map(n => ({ id: n.fm.id, title: n.fm.title, iteration: n.fm.iteration, file: n.file }));
}
