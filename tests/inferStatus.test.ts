import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { inferEvidence, parseAcceptance } from "../src/infer/inferStatus.js";
import type { NodeFrontmatter } from "../src/types.js";
import { makeSampleProject } from "./helpers.js";

let root: string;
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-infer-"));
  await makeSampleProject(root, true); // 带 git：M1 断言依赖 git 证据命中
});

describe("parseAcceptance", () => {
  it("parses checkbox syntax", () => {
    expect(parseAcceptance(["[x] 已完成项", "[ ] 未完成项", "无勾选格式"])).toEqual([
      { done: true, text: "已完成项" },
      { done: false, text: "未完成项" },
      { done: false, text: "无勾选格式" },
    ]);
  });
});

function fm(over: Partial<NodeFrontmatter>): NodeFrontmatter {
  return {
    id: "X",
    title: "X",
    type: "task",
    status: "planned",
    deps: [],
    acceptance: [],
    ...over,
  };
}

describe("inferEvidence", () => {
  it("returns null inference when no evidence declared", async () => {
    const r = await inferEvidence(root, fm({ id: "M3-login" }));
    expect(r.inferred).toBeNull();
    expect(r.report).toEqual([]);
  });
  it("M1: paths+grep+git all hit → done suggested (acceptance all checked)", async () => {
    const r = await inferEvidence(
      root,
      fm({
        id: "M1-core",
        status: "done",
        evidence: { paths: ["src/core/**"], grep: ["coreInit"], git: ["core|骨架"] },
        acceptance: ["[x] 初始化工程", "[x] 基础构建脚本"],
      }),
    );
    expect(r.score).toBe(1);
    expect(r.inferred).toBe("done");
    expect(r.confidence).toBe(1);
    expect(r.commits.length).toBeGreaterThan(0);
  });
  it("M2: paths half + tests missing → in-progress with score 0.25", async () => {
    const r = await inferEvidence(
      root,
      fm({
        id: "M2-auth",
        evidence: { paths: ["src/auth/**", "src/missing/**"], tests: ["tests/auth/**"] },
      }),
    );
    expect(r.score).toBeCloseTo(0.25);
    expect(r.inferred).toBe("in-progress");
  });
  it("full evidence but unchecked acceptance suggests in-progress, not done", async () => {
    const r = await inferEvidence(
      root,
      fm({
        id: "M1-core",
        evidence: { paths: ["src/core/**"] },
        acceptance: ["[ ] 还没做"],
      }),
    );
    expect(r.score).toBe(1);
    expect(r.inferred).toBe("in-progress");
  });
  it("zero evidence everywhere → planned", async () => {
    const r = await inferEvidence(
      root,
      fm({
        id: "M1-core",
        evidence: { grep: ["zzz-nope"] },
      }),
    );
    expect(r.score).toBe(0);
    expect(r.inferred).toBe("planned");
  });
});
