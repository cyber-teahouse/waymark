import fs from "node:fs";
import path from "node:path";
import { OVERVIEW_MD, ITERATION_MD, NODE_MD } from "./init/templates.js";

const GITIGNORE_LINE = ".planflow/workflow.json";

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

  const gi = path.join(root, ".gitignore");
  if (!fs.existsSync(gi) || !fs.readFileSync(gi, "utf8").includes(GITIGNORE_LINE)) {
    fs.appendFileSync(gi, `${fs.existsSync(gi) && fs.statSync(gi).size > 0 ? "\n" : ""}${GITIGNORE_LINE}\n`, "utf8");
  }
  console.log("✔ 已生成 plan/ 骨架：overview.md + iterations/I1.md + milestones/M1-example.md");
  console.log("  下一步：把现有框架文档内容拆入节点文件（可让 ZCode agent 按 design §3.2 规范拆解），然后运行 planflow check");
}
