import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { IterationFrontmatterSchema, NodeFrontmatterSchema, } from "../types.js";
function extractSection(content, heading) {
    const re = new RegExp(`^##\\s+${heading}\\s*$`, "m");
    const m = re.exec(content);
    if (!m)
        return "";
    const start = m.index + m[0].length;
    const rest = content.slice(start);
    const next = rest.search(/^##\s+/m);
    return next === -1 ? rest : rest.slice(0, next);
}
function parseCompletionLog(content) {
    return extractSection(content, "完成记录")
        .split("\n")
        .map((l) => l.trim())
        .map((l) => /^-\s*(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(l))
        .filter((m) => m !== null)
        .map((m) => ({ date: m[1], text: m[2] }));
}
function listMdFiles(dir) {
    if (!fs.existsSync(dir))
        return [];
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .sort();
}
export function listNodeFiles(root) {
    return listMdFiles(path.join(root, "plan", "milestones")).map((f) => `plan/milestones/${f}`);
}
export function listIterationFiles(root) {
    return listMdFiles(path.join(root, "plan", "iterations")).map((f) => `plan/iterations/${f}`);
}
function toPosix(p) {
    return p.split(path.sep).join("/");
}
/** 将 frontmatter 中 GitHub 任务清单写法（`- [x] 文本` / `- [ ] 文本` / `- [X] 文本`，允许任意缩进）
 *  改写为合法的带双引号 YAML 字符串，避免未加引号的 `[x]` 被当作 flow sequence 导致解析失败。
 *  仅改写第一个 `---` 与下一个 `---` 之间的 frontmatter 块；定位不到块时原样返回。 */
function preprocessYaml(raw) {
    const open = /^---[ \t]*(\r?\n|$)/.exec(raw);
    if (!open)
        return raw;
    const bodyStart = open[0].length;
    const close = /^---[ \t]*(\r?\n|$)/m.exec(raw.slice(bodyStart));
    if (!close)
        return raw;
    const bodyEnd = bodyStart + close.index;
    const fixed = raw
        .slice(bodyStart, bodyEnd)
        .split(/\r?\n/)
        .map((l) => l.replace(/^(\s*-\s*)\[([ xX])\]\s*(.*)$/, (_l, dash, mark, text) => `${dash}"[${mark}] ${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`))
        .join("\n");
    return raw.slice(0, bodyStart) + fixed + raw.slice(bodyEnd);
}
/** 解析单个节点文件；解析/校验失败时返回 issue 而不抛出。 */
export function parseNodeFile(root, relFile) {
    const abs = path.join(root, relFile);
    let raw;
    try {
        raw = fs.readFileSync(abs, "utf8");
    }
    catch (e) {
        return { issue: { level: "error", file: relFile, message: `读取失败: ${e.message}` } };
    }
    let parsed;
    try {
        parsed = matter(preprocessYaml(raw));
    }
    catch (e) {
        return {
            issue: { level: "error", file: relFile, message: `frontmatter 解析失败: ${e.message}` },
        };
    }
    const fm = NodeFrontmatterSchema.safeParse(parsed.data);
    if (!fm.success) {
        const msg = fm.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ");
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
export function parseIterationFile(root, relFile) {
    const abs = path.join(root, relFile);
    let parsed;
    try {
        parsed = matter(preprocessYaml(fs.readFileSync(abs, "utf8")));
    }
    catch (e) {
        return { issue: { level: "error", file: relFile, message: `迭代文件解析失败: ${e.message}` } };
    }
    const fm = IterationFrontmatterSchema.safeParse(parsed.data);
    if (!fm.success) {
        return {
            issue: { level: "error", file: relFile, message: `迭代 frontmatter 校验失败: ${fm.error.message}` },
        };
    }
    return { doc: { file: toPosix(relFile), fm: fm.data } };
}
/** 解析 overview.md 的总览表；缺文件/缺表格返回 error issue。
 *  只读取文件中的第一张 markdown 表格（连续的 | 行块）；其余表格、
 *  畸形行、空表不再静默吞掉，而是产生 warning 让用户感知格式问题。 */
export function parseOverview(root) {
    const relFile = "plan/overview.md";
    const abs = path.join(root, relFile);
    const issues = [];
    const warn = (message) => issues.push({ level: "warning", file: relFile, message });
    if (!fs.existsSync(abs)) {
        issues.push({
            level: "error",
            file: relFile,
            message: "缺少 plan/overview.md（总览表用于与 milestones/ 交叉校验）",
        });
        return { issues };
    }
    let lines;
    try {
        lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
    }
    catch (e) {
        issues.push({ level: "error", file: relFile, message: `读取失败: ${e.message}` });
        return { issues };
    }
    // 定位第一张表：第一个 | 行开始的连续行块
    const firstTable = lines.findIndex((l) => l.trim().startsWith("|"));
    if (firstTable === -1) {
        issues.push({
            level: "error",
            file: relFile,
            message: "overview.md 中未找到总览表（需要 | id | 标题 | 迭代 | 形式的表格）",
        });
        return { issues };
    }
    let tableEnd = firstTable;
    while (tableEnd < lines.length && lines[tableEnd].trim().startsWith("|"))
        tableEnd++;
    const extraOffset = lines.slice(tableEnd).findIndex((l) => l.trim().startsWith("|"));
    if (extraOffset !== -1) {
        warn(`第 ${tableEnd + extraOffset + 1} 行起还有其它表格，总览只读取第一张表，已忽略`);
    }
    const rows = lines.slice(firstTable, tableEnd).map((l, i) => ({
        lineNo: firstTable + i + 1,
        cells: l
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim()),
    }));
    const dataRows = rows.filter(({ cells }) => !cells.every((c) => /^[-: ]*$/.test(c))); // 去分隔行
    const header = dataRows[0];
    if (!header) {
        warn("总览表只有分隔行，缺少表头与数据行");
        return { doc: { file: relFile, table: [] }, issues };
    }
    if (!/^id$/i.test(header.cells[0])) {
        warn(`第 ${header.lineNo} 行首列是「${header.cells[0]}」而非 id——若这是表头请改为 | id | 标题 | 迭代 |，否则该行会被当作里程碑数据`);
    }
    const table = [];
    for (const { cells, lineNo } of dataRows) {
        if (/^id$/i.test(cells[0]))
            continue; // 表头
        if (cells.length < 2 || cells[0] === "") {
            warn(`第 ${lineNo} 行格式不完整（至少需要 | id | 标题 | 两列），已跳过：${cells.join(" | ") || "(空)"}`);
            continue;
        }
        table.push({ id: cells[0], title: cells[1], iteration: cells[2] ?? "" });
    }
    if (table.length === 0) {
        warn("总览表没有数据行——里程碑应逐行列入，供与 milestones/ 交叉校验");
    }
    return { doc: { file: relFile, table }, issues };
}
export function loadPlan(root) {
    const issues = [];
    const nodes = [];
    for (const f of listNodeFiles(root)) {
        const { doc, issue } = parseNodeFile(root, f);
        if (doc)
            nodes.push(doc);
        if (issue)
            issues.push(issue);
    }
    const iterations = [];
    for (const f of listIterationFiles(root)) {
        const { doc, issue } = parseIterationFile(root, f);
        if (doc)
            iterations.push(doc);
        if (issue)
            issues.push(issue);
    }
    const ov = parseOverview(root);
    const overview = ov.doc;
    issues.push(...ov.issues);
    return { nodes, iterations, overview, issues };
}
