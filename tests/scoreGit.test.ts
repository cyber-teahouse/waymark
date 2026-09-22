import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { scoreGit, loadGitSnapshot } from "../src/infer/scoreGit.js";

let repo: string;
let plain: string;
let emptyRepo: string;

beforeAll(async () => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "pf-git-"));
  plain = fs.mkdtempSync(path.join(os.tmpdir(), "pf-plain-"));
  emptyRepo = fs.mkdtempSync(path.join(os.tmpdir(), "pf-empty-"));
  const git = simpleGit(repo);
  await git.init();
  await git.addConfig("user.email", "t@t.local");
  await git.addConfig("user.name", "t");
  fs.writeFileSync(path.join(repo, "a.txt"), "x");
  await git.add(".");
  await git.commit("feat: core 骨架初始化");
  fs.writeFileSync(path.join(repo, "b.txt"), "y");
  await git.add(".");
  await git.commit("fix: auth 修复登录");
});

describe("scoreGit", () => {
  it("matches commit message and returns commit list", async () => {
    const r = await scoreGit(repo, ["core|骨架"]);
    expect(r.check.score).toBe(1);
    expect(r.commits.length).toBe(1);
    expect(r.commits[0].message).toContain("骨架");
  });
  it("no match scores 0", async () => {
    expect((await scoreGit(repo, ["zzz"])).check.score).toBe(0);
  });
  it("empty repo (no commits) reports 仓库无 commit, not generic git failure", async () => {
    const git = simpleGit(emptyRepo);
    await git.init();
    const r = await scoreGit(emptyRepo, ["core"]);
    expect(r.check.skipped).toBe(true);
    expect(r.check.score).toBe(0);
    expect(r.check.detail).toBe("仓库无 commit");
  });
  it("non-repo dir is skipped", async () => {
    const r = await scoreGit(plain, ["core"]);
    expect(r.check.skipped).toBe(true);
    expect(r.check.score).toBe(0);
  });
  it("invalid regex is skipped", async () => {
    const r = await scoreGit(repo, ["([bad"]);
    expect(r.check.skipped).toBe(true);
  });
});

describe("loadGitSnapshot（批量共享，避免每节点一次 git 进程）", () => {
  it("snapshot path produces identical results to direct path", async () => {
    const snap = await loadGitSnapshot(repo);
    expect(snap.ok).toBe(true);
    const direct = await scoreGit(repo, ["core|骨架"]);
    const batched = await scoreGit(repo, ["core|骨架"], snap);
    expect(batched.check).toEqual(direct.check);
    expect(batched.commits).toEqual(direct.commits);
    // 无命中时同样一致
    expect((await scoreGit(repo, ["zzz"], snap)).check.score).toBe(0);
  });
  it("non-repo snapshot carries detail; scoreGit consumes it as skipped", async () => {
    const snap = await loadGitSnapshot(plain);
    expect(snap.ok).toBe(false);
    expect(snap.detail).toBe("非 git 仓库");
    const r = await scoreGit(plain, ["core"], snap);
    expect(r.check).toMatchObject({ skipped: true, score: 0, detail: "非 git 仓库" });
  });
  it("empty repo snapshot reports 仓库无 commit through the snapshot path", async () => {
    const snap = await loadGitSnapshot(emptyRepo);
    expect(snap.detail).toBe("仓库无 commit");
    const r = await scoreGit(emptyRepo, ["core"], snap);
    expect(r.check.detail).toBe("仓库无 commit");
  });
});
