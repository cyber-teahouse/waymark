import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { scoreGrep } from "../src/infer/scoreGrep.js";
import { makeSampleProject } from "./helpers.js";

let root: string;
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-grep-"));
  await makeSampleProject(root);
});

describe("scoreGrep", () => {
  it("hits a pattern in repo", () => {
    const r = scoreGrep(root, ["coreInit"]);
    expect(r.check.score).toBe(1);
    expect(r.check.ok).toBe(true);
    expect(r.sampleHits.length).toBeGreaterThan(0);
    expect(r.sampleHits[0]).toContain("src/core/index.ts");
  });
  it("misses unknown pattern", () => {
    expect(scoreGrep(root, ["zzz-not-there"]).check.score).toBe(0);
  });
  it("any-of patterns hit", () => {
    expect(scoreGrep(root, ["zzz", "strategy"]).check.score).toBe(1);
  });
  it("respects scope globs", () => {
    const r = scoreGrep(root, ["coreInit"], ["src/auth/**"]);
    expect(r.check.score).toBe(0);
    expect(r.check.detail).toContain("范围内");
  });
  it("skips binary files and huge files", () => {
    fs.writeFileSync(path.join(root, "bin.dat"), Buffer.from([0x00, 0x01, 0x62, 0x63]));
    fs.writeFileSync(path.join(root, "huge.txt"), `coreInit${"a".repeat(1_100_000)}`);
    const r = scoreGrep(root, ["coreInit"], ["bin.dat", "huge.txt", "src/core/**"]);
    expect(r.check.score).toBe(1); // 仍由 src/core 命中；bin/huge 被跳过不报错
  });
  it("invalid regex is skipped, not thrown", () => {
    const r = scoreGrep(root, ["([bad"]);
    expect(r.check.skipped).toBe(true);
    expect(r.check.score).toBe(0);
  });
  it("default walk excludes plan/ but explicit scope still reaches it", () => {
    fs.writeFileSync(path.join(root, "plan", "milestones", "UNIQUE-marker.md"), "zqxwvToken only here\n");
    expect(scoreGrep(root, ["zqxwvToken"]).check.score).toBe(0);
    expect(scoreGrep(root, ["zqxwvToken"], ["plan/**"]).check.score).toBe(1);
  });
});

describe("scoreGrep 共享文件缓存（构建内一次遍历）", () => {
  it("cache path produces identical results to direct path", () => {
    const cache = new Map<string, string[]>();
    const direct = scoreGrep(root, ["coreInit"]);
    const batched = scoreGrep(root, ["coreInit"], [], cache);
    expect(batched.check).toEqual(direct.check);
    expect(batched.sampleHits).toEqual(direct.sampleHits);
    // scope 不同 → 不同缓存槽，互不污染
    expect(scoreGrep(root, ["coreInit"], ["src/auth/**"], cache).check.score).toBe(0);
    // 同一 scope 第二次调用命中缓存，结果一致
    expect(scoreGrep(root, ["coreInit"], [], cache).check).toEqual(direct.check);
  });
  it("cache intentionally serves the snapshot from build start (files changed mid-build stay stale)", () => {
    const cache = new Map<string, string[]>();
    expect(scoreGrep(root, ["neverMatchedTokenX"], [], cache).check.score).toBe(0);
    fs.writeFileSync(path.join(root, "late-file.ts"), "neverMatchedTokenX\n");
    // 同一构建内：缓存未失效，改文件不影响本次结果（新构建会用新缓存重新遍历）
    expect(scoreGrep(root, ["neverMatchedTokenX"], [], cache).check.score).toBe(0);
    expect(scoreGrep(root, ["neverMatchedTokenX"]).check.score).toBe(1);
  });
});
