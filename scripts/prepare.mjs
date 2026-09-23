// prepare 生命周期：本地 npm install/ci 时构建 dist；全局安装或 git 依赖安装时
// devDependencies 往往不可用（npm 不装 / --omit=dev / 网络受限），此时构建必然失败
// 且会拖垮整个安装流程——仓库已内置 dist 产物，检测不到构建工具链就直接跳过。
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

if (process.env.npm_config_global === "true") {
  console.log("[waymark] 全局安装：跳过构建，使用仓库内置的 dist 产物");
  process.exit(0);
}

const require = createRequire(import.meta.url);
const hasBuildTools = ["typescript", "vite"].every((pkg) => {
  try {
    require.resolve(pkg);
    return true;
  } catch {
    return false;
  }
});

if (!hasBuildTools) {
  console.log("[waymark] 未检测到构建依赖（typescript/vite），跳过构建，使用仓库内置的 dist 产物");
  process.exit(0);
}

try {
  execSync("npm run build && npm run build:web", { stdio: "inherit" });
} catch {
  process.exit(1);
}
