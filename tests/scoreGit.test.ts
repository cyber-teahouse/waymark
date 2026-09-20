import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { scoreGit } from "../src/infer/scoreGit.js";

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
