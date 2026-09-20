import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  NodeFrontmatterSchema, IterationFrontmatterSchema,
  type PlanDoc, type IterationDoc, type OverviewDoc, type OverviewTableEntry,
  type CompletionEntry, type PlanIssue,
} from "../types.js";

function extractSection(content: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "m");
  const m = re.exec(content);
  if (!m) return "";
  const start = m.index + m[0].length;
  const rest = content.slice(start);
  const next = rest.search(/^##\s+/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function parseCompletionLog(content: string): CompletionEntry[] {
  return extractSection(content, "完成记录")
    .split("\n")
    .map(l => l.trim())
    .map(l => /^-\s*(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => ({ date: m[1], text: m[2] }));
}

function listMdFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".md")).sort();
}

export function listNodeFiles(root: string): string[] {
  return listMdFiles(path.join(root, "plan", "milestones"))
    .map(f => `plan/milestones/${f}`);
}

export function listIterationFiles(root: string): string[] {
  return listMdFiles(path.join(root, "plan", "iterations"))
    .map(f => `plan/iterations/${f}`);
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** 将 frontmatter 中 GitHub 任务清单写法（`- [x] 文本` / `- [ ] 文本` / `- [X] 文本`，允许任意缩进）
 *  改写为合法的带双引号 YAML 字符串，避免未加引号的 `[x]` 被当作 flow sequence 导致解析失败。
 *  仅改写第一个 `---` 与下一个 `---` 之间的 frontmatter 块；定位不到块时原样返回。 */
function preprocessYaml(raw: string): string {
  const open = /^---[ \t]*(\r?\n|$)/.exec(raw);
  if (!open) return raw;
  const bodyStart = open[0].length;
  const close = /^---[ \t]*(\r?\n|$)/m.exec(raw.slice(bodyStart));
  if (!close) return raw;
  const bodyEnd = bodyStart + close.index;
  const fixed = raw.slice(bodyStart, bodyEnd).split(/\r?\n/).map(l =>
    l.replace(/^(\s*-\s*)\[([ xX])\]\s*(.*)$/,
      (_l: string, dash: string, mark: string, text: string) =>
        `${dash}"[${mark}] ${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`))
    .join("\n");
  return raw.slice(0, bodyStart) + fixed + raw.slice(bodyEnd);
}

/** 解析单个节点文件；解析/校验失败时返回 issue 而不抛出。 */
export function parseNodeFile(root: string, relFile: string): { doc?: PlanDoc; issue?: PlanIssue } {
  const abs = path.join(root, relFile);
  let raw: string;
  try {
    raw = fs.readFileSync(abs, "utf8");
  } catch (e) {
    return { issue: { level: "error", file: relFile, message: `读取失败: ${(e as Error).message}` } };
  }
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(preprocessYaml(raw));
  } catch (e) {
    return { issue: { level: "error", file: relFile, message: `frontmatter 解析失败: ${(e as Error).message}` } };
  }
  const fm = NodeFrontmatterSchema.safeParse(parsed.data);
  if (!fm.success) {
    const msg = fm.error.issues.map(i => `${i.path.join(".")} ${i.message}`).join("; ");
    return { issue: { level: "error", file: relFile, message: `frontmatter 校验失败: ${msg}` } };
  }
  return {
    doc: {
      file: toPosix(relFile),
      fm: fm.data,
      description: extractSection(parsed.content, "需求描述").trim(),
      completionLog: parseCompletionLog(parsed.content),
    },
  };
}

export function parseIterationFile(root: string, relFile: string): { doc?: IterationDoc; issue?: PlanIssue } {
  const abs = path.join(root, relFile);
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(preprocessYaml(fs.readFileSync(abs, "utf8")));
  } catch (e) {
    return { issue: { level: "error", file: relFile, message: `迭代文件解析失败: ${(e as Error).message}` } };
  }
  const fm = IterationFrontmatterSchema.safeParse(parsed.data);
  if (!fm.success) {
    return { issue: { level: "error", file: relFile, message: `迭代 frontmatter 校验失败: ${fm.error.message}` } };
  }
  return { doc: { file: toPosix(relFile), fm: fm.data } };
}

/** 解析 overview.md 的总览表；缺文件返回 issue。 */
export function parseOverview(root: string): { doc?: OverviewDoc; issue?: PlanIssue } {
  const relFile = "plan/overview.md";
  const abs = path.join(root, relFile);
  if (!fs.existsSync(abs)) {
    return { issue: { level: "error", file: relFile, message: "缺少 plan/overview.md（总览表用于与 milestones/ 交叉校验）" } };
  }
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/).filter(l => l.trim().startsWith("|"));
  const rows = lines
    .map(l => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim()))
    .filter(cells => !cells.every(c => /^[-: ]*$/.test(c)))   // 去分隔行
    .filter(cells => cells.length >= 2 && cells[0] !== "" && !/^id$/i.test(cells[0]));  // 去表头
  const table: OverviewTableEntry[] = rows.map(cells => ({
    id: cells[0], title: cells[1], iteration: cells[2] ?? "",
  }));
  return { doc: { file: relFile, table } };
}

export interface LoadedPlan {
  nodes: PlanDoc[];
  iterations: IterationDoc[];
  overview?: OverviewDoc;
  issues: PlanIssue[];
}

export function loadPlan(root: string): LoadedPlan {
  const issues: PlanIssue[] = [];
  const nodes: PlanDoc[] = [];
  for (const f of listNodeFiles(root)) {
    const { doc, issue } = parseNodeFile(root, f);
    if (doc) nodes.push(doc);
    if (issue) issues.push(issue);
  }
  const iterations: IterationDoc[] = [];
  for (const f of listIterationFiles(root)) {
    const { doc, issue } = parseIterationFile(root, f);
    if (doc) iterations.push(doc);
    if (issue) issues.push(issue);
  }
  const ov = parseOverview(root);
  const overview = ov.doc;
  if (ov.issue) issues.push(ov.issue);
  return { nodes, iterations, overview, issues };
}
