import fs from "node:fs";
import path from "node:path";
import { loadPlan } from "../parser/parsePlan.js";
import { loadPlanSource, writePlanSource } from "./commands.js";

export interface SplitCreated {
  id: string;
  file: string;
}

export interface SplitResult {
  created: SplitCreated[];
  warnings: string[];
}

/** deps 行改写：兼容内联（deps: [a, b]）与块式（deps: 换行缩进列表）；缺失时插到 status 行后。 */
function rewriteDeps(raw: string, depsLine: string, id: string): string {
  if (/^deps:[^\n]*\]/m.test(raw) || /^deps:[ \t]*\S+[^\n]*$/m.test(raw)) {
    return raw.replace(/^deps:[^\n]*$/m, depsLine);
  }
  if (/^deps:\s*$/m.test(raw)) {
    return raw.replace(/^deps:\s*\n(\s*-\s+[^\n]*\n?)*/m, `${depsLine}\n`);
  }
  if (/^status:[^\n]*\n/m.test(raw)) {
    return raw.replace(/^(status:[^\n]*\n)/m, `$1${depsLine}\n`);
  }
  throw new Error(`${id} 的 frontmatter 缺少 status/deps 声明，无法定位改写位置`);
}

/** 把节点拆成任务链：t1 继承原依赖，其后链式；原节点 deps 改写为全部任务（汇总闸口——
 *  任务未完成时 done 原节点触发既有「依赖未完成」护栏）。验收/证据/描述留在原节点——
 *  它是成果规格；任务只带标题与依赖。任务文件不进 overview.md（总览表强校验仅覆盖 milestone）。 */
export function splitNode(root: string, id: string, titles: string[]): SplitResult {
  if (titles.length === 0) throw new Error("未提供任务标题");
  const plan = loadPlan(root);
  const doc = plan.nodes.find((n) => n.fm.id === id);
  if (!doc) throw new Error(`未找到节点: ${id}`);
  if (doc.fm.status === "done" || doc.fm.status === "dropped") {
    throw new Error(`${id} 已是 ${doc.fm.status}——拆分前先 waymark reopen`);
  }
  const existing = new Set(plan.nodes.map((n) => n.fm.id));
  const taskIds = titles.map((_, i) => `${id}-t${i + 1}`);
  const clash = taskIds.filter((t) => existing.has(t));
  if (clash.length > 0) throw new Error(`任务 id 已存在: ${clash.join("、")}`);

  const warnings: string[] = [];
  if (doc.fm.status === "in-progress") warnings.push(`${id} 进行中——拆分后请复核任务范围`);
  if (doc.fm.type === "task") warnings.push(`${id} 本身是 task——通常只拆 milestone，请确认`);

  const dir = path.posix.dirname(doc.file);
  const created: SplitCreated[] = taskIds.map((tid, i) => {
    const deps = i === 0 ? doc.fm.deps : [taskIds[i - 1]];
    const iteration = doc.fm.iteration ? `iteration: ${doc.fm.iteration}\n` : "";
    // 标题按 YAML 双引号标量落盘：裸写含「: 」的标题会产生非法 frontmatter
    const yamlTitle = `"${titles[i].replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const rel = `${dir}/${tid}.md`;
    const body = [
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
    fs.writeFileSync(path.join(root, rel), body, "utf8");
    return { id: tid, file: rel };
  });

  const abs = path.join(root, doc.file);
  const { text: raw, crlf } = loadPlanSource(abs);
  writePlanSource(abs, rewriteDeps(raw, `deps: [${taskIds.join(", ")}]`, id), crlf);

  return { created, warnings };
}
