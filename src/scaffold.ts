import fs from "node:fs";
import path from "node:path";
import { ITERATION_MD, NODE_MD, OVERVIEW_MD, TASK1_MD, TASK2_MD } from "./init/templates.js";

const GITIGNORE_LINE = ".waymark/workflow.json";

export function runInit(root: string): void {
  const planDir = path.join(root, "plan");
  if (fs.existsSync(planDir)) {
    throw new Error("已存在 plan/ 目录，拒绝覆盖");
  }
  fs.mkdirSync(path.join(planDir, "milestones"), { recursive: true });
  fs.mkdirSync(path.join(planDir, "iterations"), { recursive: true });
  fs.writeFileSync(path.join(planDir, "overview.md"), OVERVIEW_MD, "utf8");
  fs.writeFileSync(path.join(planDir, "iterations", "I1.md"), ITERATION_MD, "utf8");
  fs.writeFileSync(path.join(planDir, "milestones", "M1-example.md"), NODE_MD, "utf8");
  fs.writeFileSync(path.join(planDir, "milestones", "M1-example-t1.md"), TASK1_MD, "utf8");
  fs.writeFileSync(path.join(planDir, "milestones", "M1-example-t2.md"), TASK2_MD, "utf8");

  const gi = path.join(root, ".gitignore");
  if (!fs.existsSync(gi) || !fs.readFileSync(gi, "utf8").includes(GITIGNORE_LINE)) {
    fs.appendFileSync(
      gi,
      `${fs.existsSync(gi) && fs.statSync(gi).size > 0 ? "\n" : ""}${GITIGNORE_LINE}\n`,
      "utf8",
    );
  }
  console.log("✔ 已生成 plan/ 骨架：overview.md + iterations/I1.md + milestones/（1 里程碑 + 2 任务链示例）");
  console.log(
    "  下一步：把现有框架文档内容拆入节点文件（结构见 README「/plan 结构」章节），然后运行 waymark check",
  );
}
