// prepare 生命周期：本地 npm install/ci 时构建 dist；全局安装（git 依赖）时 npm 不装
// devDependencies，此时构建必然失败——仓库已内置 dist 产物，直接跳过。
import { execSync } from "node:child_process";

if (process.env.npm_config_global === "true") {
  console.log("[waymark] 全局安装：跳过构建，使用仓库内置的 dist 产物");
  process.exit(0);
}

try {
  execSync("npm run build && npm run build:web", { stdio: "inherit" });
} catch {
  process.exit(1);
}
