import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PREPARE = path.resolve(__dirname, "..", "scripts", "prepare.mjs");

describe("prepare 脚本安装防护", () => {
  it("全局安装时跳过构建", () => {
    const out = execFileSync(process.execPath, [PREPARE], {
      env: { ...process.env, npm_config_global: "true" },
      encoding: "utf8",
    });
    expect(out).toContain("全局安装");
    expect(out).toContain("跳过构建");
  });

  it("缺少构建依赖时跳过而非失败（git 依赖 / --omit=dev 场景）", () => {
    // 把脚本复制到无 node_modules 的临时目录：require.resolve 找不到 typescript/vite，
    // 应走优雅跳过路径（exit 0）而不是构建失败（exit 1 拖垮 npm install）。
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-prepare-"));
    const copy = path.join(dir, "prepare.mjs");
    fs.copyFileSync(PREPARE, copy);
    const out = execFileSync(process.execPath, [copy], { cwd: dir, encoding: "utf8" });
    expect(out).toContain("未检测到构建依赖");
  });
});
