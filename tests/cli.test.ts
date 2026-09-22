import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSampleProject } from "./helpers.js";
import { runCli } from "../src/cli.js";

async function makeValidProject(): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-cli-"));
  await makeSampleProject(root);
  return root;
}

describe("CLI --root 位置", () => {
  it("前置与后置 --root 均可定位项目根（check 通过）", async () => {
    const root = await makeValidProject();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCli(["--root", root, "check"]);
    expect(spy).toHaveBeenCalledWith("✔ 校验通过");

    spy.mockClear();
    await runCli(["check", "--root", root]);
    expect(spy).toHaveBeenCalledWith("✔ 校验通过");

    spy.mockRestore();
  });

  it("后置 --root 在其余读命令上同样生效（ready）", async () => {
    const root = await makeValidProject();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    // 样例中 M3-login 依赖未完成的 M2-auth → 无可开工节点
    await runCli(["ready", "--root", root]);
    expect(spy).toHaveBeenCalledWith("没有可开工节点（无 planned 状态，或依赖未满足）");
    spy.mockRestore();
  });
});

describe("block/drop/reopen 命令接线", () => {
  it("block 后 reopen，控制台输出状态且文件落库", async () => {
    const root = await makeValidProject();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCli(["--root", root, "block", "M3-login", "-m", "等待设计稿"]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("已标记受阻"));

    spy.mockClear();
    await runCli(["--root", root, "reopen", "M3-login"]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("已重新打开（in-progress"));
    spy.mockRestore();

    const text = fs.readFileSync(path.join(root, "plan", "milestones", "M3-登录.md"), "utf8");
    expect(text).toMatch(/^status: in-progress$/m);
    expect(text).toContain("[blocked] 等待设计稿");
  });
});
