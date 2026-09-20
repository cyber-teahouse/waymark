import { simpleGit } from "simple-git";
import type { CommitInfo, EvidenceCheck } from "../types.js";

const MAX_COMMITS = 2000;
const MAX_LISTED = 20;

export async function scoreGit(
  root: string,
  patterns: string[],
): Promise<{ check: EvidenceCheck; commits: CommitInfo[] }> {
  if (patterns.length === 0) {
    return { check: { kind: "git", ok: false, score: 0, detail: "未声明", skipped: true }, commits: [] };
  }
  let regexes: RegExp[];
  try {
    regexes = patterns.map(p => new RegExp(p));
  } catch (e) {
    return { check: { kind: "git", ok: false, score: 0, detail: `正则无效: ${(e as Error).message}`, skipped: true }, commits: [] };
  }
  const git = simpleGit(root);
  try {
    if (!(await git.checkIsRepo())) {
      return { check: { kind: "git", ok: false, score: 0, detail: "非 git 仓库", skipped: true }, commits: [] };
    }
    const out = await git.raw(["log", "-n", String(MAX_COMMITS), "--date=short", "--pretty=format:%h%x09%ad%x09%s"]);
    const all: CommitInfo[] = out.split("\n").filter(Boolean).map(line => {
      const [hash, date, ...rest] = line.split("\t");
      return { hash, date, message: rest.join("\t") };
    });
    const matched = all.filter(c => regexes.some(re => re.test(c.message)));
    return {
      check: {
        kind: "git", ok: matched.length > 0, score: matched.length > 0 ? 1 : 0,
        detail: matched.length > 0 ? `命中 ${matched.length} 条 commit` : "无匹配 commit",
      },
      commits: matched.slice(0, MAX_LISTED),
    };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("does not have any commits")) {
      return { check: { kind: "git", ok: false, score: 0, detail: "仓库无 commit", skipped: true }, commits: [] };
    }
    return { check: { kind: "git", ok: false, score: 0, detail: `git 不可用: ${msg}`, skipped: true }, commits: [] };
  }
}
