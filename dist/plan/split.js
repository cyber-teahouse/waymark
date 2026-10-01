import fs from "node:fs";
import path from "node:path";
import { loadPlan } from "../parser/parsePlan.js";
import { loadPlanSource, splitFrontmatter, writePlanSource } from "./commands.js";
/** deps 条目改写（只在 frontmatter 字符串上跑，正文永不受影响）：兼容单行内联（deps: [a, b]
 *  与 deps: []）、内联标量（deps: a）、块式（deps: 换行缩进 - x）、多行 flow（deps: [ 跨行 ]），
 *  整体替换为单行新值；缺失 deps 时插到 status 行后。 */
function rewriteDeps(fm, depsLine, id) {
    if (/^deps:[^\n]*\]/m.test(fm)) {
        return fm.replace(/^deps:[^\n]*$/m, depsLine);
    }
    // 首个值字符排除 [：deps: [ 是 flow 语法的开括号，归多行 flow 分支处理
    if (/^deps:[ \t]*[^\s[][^\n]*$/m.test(fm)) {
        return fm.replace(/^deps:[^\n]*$/m, depsLine);
    }
    // 多行 flow：deps 行有 [ 但无 ]，从 [ 起跨行吞到第一个 ] 整体替换，避免残留半截序列
    if (/^deps:[^\n]*\[[^\n]*$/m.test(fm)) {
        return fm.replace(/^deps:[^\n]*\[[\s\S]*?\]/m, depsLine);
    }
    if (/^deps:[ \t]*\n([ \t]*-[^\n]*\n?)+/m.test(fm)) {
        return fm.replace(/^deps:[ \t]*\n([ \t]*-[^\n]*\n?)+/m, (m0) => m0.endsWith("\n") ? `${depsLine}\n` : depsLine);
    }
    if (/^status:[^\n]*$/m.test(fm)) {
        return fm.replace(/^(status:[^\n]*$)/m, `$1\n${depsLine}`);
    }
    throw new Error(`${id} 的 frontmatter 缺少 status/deps 声明，无法定位改写位置`);
}
/** 把节点拆成任务链：t1 继承原依赖，其后链式；原节点 deps 改写为全部任务（汇总闸口——
 *  任务未完成时 done 原节点触发既有「依赖未完成」护栏）。验收/证据/描述留在原节点——
 *  它是成果规格；任务只带标题与依赖。任务文件不进 overview.md（总览表强校验仅覆盖 milestone）。
 *  原节点改写先算后写、目标文件先查冲突再落盘——任何校验失败都不留半成品；
 *  写入失败亦回滚已创建任务文件（逆序 best-effort 删除后原样抛出），同样不留半成品。 */
export function splitNode(root, id, titles) {
    if (titles.length === 0)
        throw new Error("未提供任务标题");
    for (const t of titles) {
        // 多行标题经 YAML 双引号标量会折叠成空格，静默改掉标题——直接拒绝
        if (/\r?\n/.test(t))
            throw new Error("任务标题不能包含换行");
        // 空白标题只会生成空壳 task 文件——trim 后为空直接拒绝
        if (t.trim() === "")
            throw new Error("任务标题不能为空白");
    }
    const plan = loadPlan(root);
    const doc = plan.nodes.find((n) => n.fm.id === id);
    if (!doc)
        throw new Error(`未找到节点: ${id}`);
    if (doc.fm.status === "done" || doc.fm.status === "dropped") {
        throw new Error(`${id} 已是 ${doc.fm.status}——拆分前先 waymark reopen`);
    }
    const existing = new Set(plan.nodes.map((n) => n.fm.id));
    const taskIds = titles.map((_, i) => `${id}-t${i + 1}`);
    const clash = taskIds.filter((t) => existing.has(t));
    if (clash.length > 0)
        throw new Error(`任务 id 已存在: ${clash.join("、")}`);
    const warnings = [];
    if (doc.fm.status === "in-progress")
        warnings.push(`${id} 进行中——拆分后请复核任务范围`);
    if (doc.fm.type === "task")
        warnings.push(`${id} 本身是 task——通常只拆 milestone，请确认`);
    // 先在原文件上算出改写结果（可能抛错），此时还没有写任何文件
    const abs = path.join(root, doc.file);
    const { text: raw, crlf } = loadPlanSource(abs);
    const { fm, body } = splitFrontmatter(raw);
    const nextFm = rewriteDeps(fm, `deps: [${taskIds.join(", ")}]`, id);
    const nextRaw = `---\n${nextFm}\n---\n${body}`;
    const dir = path.posix.dirname(doc.file);
    for (const tid of taskIds) {
        const rel = `${dir}/${tid}.md`;
        // clash 检查只看得到可解析节点，这里兜底挡住不可解析的同名旧文件被静默覆盖
        if (fs.existsSync(path.join(root, rel)))
            throw new Error(`任务文件已存在: ${rel}`);
    }
    const created = [];
    try {
        for (let i = 0; i < taskIds.length; i++) {
            const tid = taskIds[i];
            const deps = i === 0 ? doc.fm.deps : [taskIds[i - 1]];
            const iteration = doc.fm.iteration ? `iteration: ${doc.fm.iteration}\n` : "";
            // 标题按 YAML 双引号标量落盘：裸写含「: 」的标题会产生非法 frontmatter
            const yamlTitle = `"${titles[i].replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
            const rel = `${dir}/${tid}.md`;
            const fileBody = [
                "---",
                `id: ${tid}`,
                `title: ${yamlTitle}`,
                "type: task",
                "status: planned",
                `deps: [${deps.join(", ")}]`,
                `${iteration}---`,
                "",
                "## 需求描述",
                "（拆分自动生成——补充这个任务要做什么）",
                "",
            ].join("\n");
            fs.writeFileSync(path.join(root, rel), fileBody, "utf8");
            created.push({ id: tid, file: rel });
        }
        writePlanSource(abs, nextRaw, crlf);
    }
    catch (e) {
        // 写入失败（含原节点改写失败）→ 逆序 best-effort 删除已创建任务文件，不留半成品；原错误原样抛出
        for (let i = created.length - 1; i >= 0; i--) {
            try {
                fs.rmSync(path.join(root, created[i].file), { force: true });
            }
            catch {
                // 删除失败不掩盖原始写入错误
            }
        }
        throw e;
    }
    return { created, warnings };
}
