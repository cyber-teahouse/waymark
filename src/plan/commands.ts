import fs from "node:fs";
import path from "node:path";
import { parseAcceptance } from "../infer/inferStatus.js";
import { loadPlan } from "../parser/parsePlan.js";
import type { AcceptanceItem } from "../types.js";

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

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Plan = ReturnType<typeof loadPlan>;

/** 依赖中未满足（存在且非 done/dropped）的 id 列表；缺失的依赖视为满足，由 check 另行报错。 */
function unmetDeps(plan: Plan, deps: string[]): string[] {
  const statusOf = new Map(plan.nodes.map((n) => [n.fm.id, n.fm.status]));
  return deps.filter((d) => {
    const s = statusOf.get(d);
    return s !== undefined && s !== "done" && s !== "dropped";
  });
}

/** 在「完成记录」区块头部插入一行 `- <date> <text>`；无区块时在文末追加该区块。 */
function insertCompletionNote(body: string, date: string, text: string): string {
  const secRe = /^##\s+完成记录\s*$/m;
  const sec = secRe.exec(body);
  if (!sec) {
    return body.replace(/\s*$/, `\n\n## 完成记录\n- ${date} ${text}\n`);
  }
  const after = body.slice(sec.index + sec[0].length);
  const next = /^##\s+/m.exec(after);
  const insertAt = sec.index + sec[0].length + (next ? next.index : after.length);
  return `${body.slice(0, insertAt)}\n- ${date} ${text}${body.slice(insertAt)}`;
}

/** 把节点标记为完成：status → done，可选勾全部验收、追加完成记录行。只动 frontmatter 的 status/acceptance 与完成记录区块。 */
export function markDone(
  root: string,
  id: string,
  opts: MarkDoneOptions = {},
): { file: string; warnings: string[] } {
  const plan = loadPlan(root);
  const doc = plan.nodes.find((n) => n.fm.id === id);
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

  const date = opts.date ?? today();
  const note = opts.note?.trim().replace(/\r?\n+/g, " ");
  const nextBody = note ? insertCompletionNote(body, date, note) : body;

  fs.writeFileSync(abs, `---\n${nextFm}\n---\n${nextBody}`, "utf8");

  // 护栏警告：不阻止完成，但把可疑之处亮出来（对 agent 误操作的主要防线）
  const warnings: string[] = [];
  const unmet = unmetDeps(plan, doc.fm.deps);
  if (unmet.length) warnings.push(`依赖未完成: ${unmet.join("、")}——请确认是否确实可以完成`);
  if (!opts.allAcceptance) {
    const unchecked = doc.fm.acceptance.filter((a) => !/^\s*\[\s*[xX]\s*\]/.test(a)).length;
    if (unchecked > 0) warnings.push(`${unchecked} 项验收标准未勾选——如已全部达成可用 --acc 勾选`);
  }
  if (doc.fm.status === "done") warnings.push("此前已是 done——本次仅追加记录，请确认不是重复操作");
  if (doc.fm.status === "blocked" || doc.fm.status === "dropped") {
    warnings.push(`原状态为 ${doc.fm.status}——旁路节点被标记完成，请复核`);
  }
  return { file: doc.file, warnings };
}

/** 认领开工：planned → in-progress。非 planned 报错；依赖未满足仅警告（允许有意识的并行开发）。 */
export function startNode(root: string, id: string): { file: string; warnings: string[] } {
  const plan = loadPlan(root);
  const doc = plan.nodes.find((n) => n.fm.id === id);
  if (!doc) throw new Error(`未找到节点: ${id}`);
  if (doc.fm.status !== "planned") {
    throw new Error(`${id} 当前状态为 ${doc.fm.status}，仅 planned 节点可认领开工`);
  }
  const abs = path.join(root, doc.file);
  const raw = fs.readFileSync(abs, "utf8");
  const { fm, body } = splitFrontmatter(raw);
  const nextFm = fm.replace(/^status:\s*.*$/m, "status: in-progress");
  fs.writeFileSync(abs, `---\n${nextFm}\n---\n${body}`, "utf8");
  const warnings: string[] = [];
  const unmet = unmetDeps(plan, doc.fm.deps);
  if (unmet.length)
    warnings.push(`依赖未完成: ${unmet.join("、")}——建议先完成依赖节点（waymark ready 查看可开工节点）`);
  return { file: doc.file, warnings };
}

export interface ReadyItem {
  id: string;
  title: string;
  iteration?: string;
  file: string;
}

export interface StatusChangeOptions {
  /** 记录说明，追加到「完成记录」，自动带 [blocked]/[dropped]/[reopened] 前缀 */
  note?: string;
  /** 记录日期（默认今天，测试可注入） */
  date?: string;
  /** reopen 专用：恢复为 planned 而非 in-progress */
  planned?: boolean;
}

/** 旁路/撤销状态变更的公共实现：改 frontmatter status + 可选完成记录行。
 *  目标状态与当前相同且无说明时不改写文件（幂等）。 */
function changeStatus(
  root: string,
  id: string,
  to: "blocked" | "dropped" | "in-progress" | "planned",
  opts: StatusChangeOptions,
  logTag: string,
): { file: string; warnings: string[] } {
  const plan = loadPlan(root);
  const doc = plan.nodes.find((n) => n.fm.id === id);
  if (!doc) throw new Error(`未找到节点: ${id}`);
  const abs = path.join(root, doc.file);
  const raw = fs.readFileSync(abs, "utf8");
  const { fm, body } = splitFrontmatter(raw);

  const warnings: string[] = [];
  if (doc.fm.status === to) {
    warnings.push(`此前已是 ${to}——本次仅可能补充记录`);
  } else if (doc.fm.status === "done" && (to === "blocked" || to === "dropped")) {
    warnings.push("节点已完成——改为旁路状态前请确认不是误操作");
  }

  const note = opts.note?.trim().replace(/\r?\n+/g, " ");
  const date = opts.date ?? today();
  if (doc.fm.status === to && !note) {
    return { file: doc.file, warnings };
  }
  const nextFm = fm.replace(/^status:\s*.*$/m, `status: ${to}`);
  const nextBody = note ? insertCompletionNote(body, date, `[${logTag}] ${note}`) : body;
  fs.writeFileSync(abs, `---\n${nextFm}\n---\n${nextBody}`, "utf8");
  return { file: doc.file, warnings };
}

/** 标记受阻：任意状态 → blocked（旁路，可 reopen 恢复）。 */
export function blockNode(
  root: string,
  id: string,
  opts: StatusChangeOptions = {},
): { file: string; warnings: string[] } {
  return changeStatus(root, id, "blocked", opts, "blocked");
}

/** 放弃节点：任意状态 → dropped（旁路，不再视为可开工/待办）。 */
export function dropNode(
  root: string,
  id: string,
  opts: StatusChangeOptions = {},
): { file: string; warnings: string[] } {
  return changeStatus(root, id, "dropped", opts, "dropped");
}

/** 重新打开：done/blocked/dropped → in-progress（撤销误操作；--planned 退回未开始）。 */
export function reopenNode(
  root: string,
  id: string,
  opts: StatusChangeOptions = {},
): { file: string; warnings: string[] } {
  const plan = loadPlan(root);
  const doc = plan.nodes.find((n) => n.fm.id === id);
  if (!doc) throw new Error(`未找到节点: ${id}`);
  if (doc.fm.status === "planned") {
    if (opts.planned) {
      return changeStatus(root, id, "planned", opts, "reopened");
    }
    throw new Error(`${id} 当前为 planned，无需重新打开（认领开工用 waymark start）`);
  }
  if (doc.fm.status === "in-progress" && !opts.note) {
    return { file: doc.file, warnings: ["已是 in-progress——本次仅可能补充记录"] };
  }
  const to = opts.planned ? "planned" : "in-progress";
  return changeStatus(root, id, to, opts, "reopened");
}

/** 勾选/取消单项验收（indices 为 1 起编号，与页面展示顺序一致，可多个）：
 *  只翻转 acceptance 列表块内指定行的 [ ]/[x]，其余 frontmatter 与正文不动。 */
export function toggleAcceptance(
  root: string,
  id: string,
  indices: number[],
): { file: string; warnings: string[]; acceptance: AcceptanceItem[] } {
  if (indices.length === 0) throw new Error("未指定验收项序号");
  const plan = loadPlan(root);
  const doc = plan.nodes.find((n) => n.fm.id === id);
  if (!doc) throw new Error(`未找到节点: ${id}`);
  const total = doc.fm.acceptance.length;
  if (total === 0) throw new Error(`${id} 没有声明验收标准`);
  for (const i of indices) {
    if (!Number.isInteger(i) || i < 1 || i > total) {
      throw new Error(`验收项序号越界: ${i}（共 ${total} 项，1 起编号）`);
    }
  }
  const abs = path.join(root, doc.file);
  const raw = fs.readFileSync(abs, "utf8");
  const { fm, body } = splitFrontmatter(raw);

  // 只在 acceptance: 块列表内计数与翻转；遇到下一个顶层键即块结束
  const targets = new Set(indices);
  let inAcc = false;
  let itemNo = 0;
  const nextFm = fm
    .split(/\r?\n/)
    .map((l) => {
      if (/^acceptance:\s*$/.test(l)) {
        inAcc = true;
        return l;
      }
      if (inAcc && /^[^\s-]/.test(l)) inAcc = false;
      if (!inAcc) return l;
      const m = /^(\s*-\s*)\[([ xX])\](.*)$/.exec(l);
      if (!m) return l;
      itemNo++;
      if (!targets.has(itemNo)) return l;
      return `${m[1]}[${m[2] === " " ? "x" : " "}]${m[3]}`;
    })
    .join("\n");
  if (itemNo !== total) {
    throw new Error(
      `${id} 的 acceptance 写法不规范（声明 ${total} 项，块列表中只识别到 ${itemNo} 项）——请使用 "- [ ] 文本" 块列表写法`,
    );
  }
  fs.writeFileSync(abs, `---\n${nextFm}\n---\n${body}`, "utf8");

  const acceptance = parseAcceptance(doc.fm.acceptance).map((a, i) =>
    targets.has(i + 1) ? { ...a, done: !a.done } : a,
  );
  const warnings: string[] = [];
  if (doc.fm.status === "done" && acceptance.some((a) => !a.done)) {
    warnings.push("节点已完成——取消验收勾选会让 done 状态与验收不一致，请复核");
  }
  if (doc.fm.status !== "done" && acceptance.length > 0 && acceptance.every((a) => a.done)) {
    warnings.push("验收已全部勾选——可以用 waymark done 收尾");
  }
  return { file: doc.file, warnings, acceptance };
}

/** 可开工节点：planned 且依赖全部 done/dropped（缺失的依赖视为满足，由 check 另行报错）。 */
export function listReady(root: string): ReadyItem[] {
  const plan = loadPlan(root);
  const statusOf = new Map(plan.nodes.map((n) => [n.fm.id, n.fm.status]));
  return plan.nodes
    .filter((n) => n.fm.status === "planned")
    .filter((n) =>
      n.fm.deps.every((d) => {
        const s = statusOf.get(d);
        return s === undefined || s === "done" || s === "dropped";
      }),
    )
    .map((n) => ({ id: n.fm.id, title: n.fm.title, iteration: n.fm.iteration, file: n.file }));
}
