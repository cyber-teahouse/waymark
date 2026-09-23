import { simpleGit } from "simple-git";
const MAX_COMMITS = 2000;
const MAX_LISTED = 20;
/** 一次读取最近 commit 列表，供一次构建内的多个节点共享（避免每节点 spawn 一次 git）。 */
export async function loadGitSnapshot(root) {
    const git = simpleGit(root);
    try {
        if (!(await git.checkIsRepo())) {
            return { ok: false, detail: "非 git 仓库", commits: [] };
        }
        const out = await git.raw([
            "log",
            "-n",
            String(MAX_COMMITS),
            "--date=short",
            "--pretty=format:%h%x09%ad%x09%s",
        ]);
        const commits = out
            .split("\n")
            .filter(Boolean)
            .map((line) => {
            const [hash, date, ...rest] = line.split("\t");
            return { hash, date, message: rest.join("\t") };
        });
        return { ok: true, commits };
    }
    catch (e) {
        const msg = e.message;
        if (msg.includes("does not have any commits")) {
            return { ok: false, detail: "仓库无 commit", commits: [] };
        }
        return { ok: false, detail: `git 不可用: ${msg}`, commits: [] };
    }
}
export async function scoreGit(root, patterns, snapshot) {
    if (patterns.length === 0) {
        return { check: { kind: "git", ok: false, score: 0, detail: "未声明", skipped: true }, commits: [] };
    }
    let regexes;
    try {
        regexes = patterns.map((p) => new RegExp(p));
    }
    catch (e) {
        return {
            check: { kind: "git", ok: false, score: 0, detail: `正则无效: ${e.message}`, skipped: true },
            commits: [],
        };
    }
    const snap = snapshot ?? (await loadGitSnapshot(root));
    if (!snap.ok) {
        return {
            check: { kind: "git", ok: false, score: 0, detail: snap.detail ?? "git 不可用", skipped: true },
            commits: [],
        };
    }
    const matched = snap.commits.filter((c) => regexes.some((re) => re.test(c.message)));
    return {
        check: {
            kind: "git",
            ok: matched.length > 0,
            score: matched.length > 0 ? 1 : 0,
            detail: matched.length > 0 ? `命中 ${matched.length} 条 commit` : "无匹配 commit",
        },
        commits: matched.slice(0, MAX_LISTED),
    };
}
