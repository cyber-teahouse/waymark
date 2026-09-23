import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { DEFAULT_IGNORES } from "../types.js";
function hasSubstantialFile(root, glob) {
    const files = fg.sync(glob, {
        cwd: root,
        onlyFiles: true,
        dot: false,
        ignore: DEFAULT_IGNORES,
        suppressErrors: true,
    });
    return files.some((f) => {
        try {
            return fs.statSync(path.join(root, f)).size > 0;
        }
        catch {
            return false;
        }
    });
}
export function scorePaths(root, globs) {
    if (globs.length === 0) {
        return { kind: "paths", ok: false, score: 0, detail: "未声明", skipped: true };
    }
    let hit = 0;
    const misses = [];
    for (const g of globs) {
        if (hasSubstantialFile(root, g))
            hit++;
        else
            misses.push(g);
    }
    const score = hit / globs.length;
    return {
        kind: "paths",
        ok: score === 1,
        score,
        detail: `${hit}/${globs.length} 个模式命中实质文件${misses.length ? `；未命中: ${misses.join(", ")}` : ""}`,
    };
}
export function scoreTests(root, globs) {
    if (globs.length === 0) {
        return { kind: "tests", ok: false, score: 0, detail: "未声明", skipped: true };
    }
    let hit = 0;
    const misses = [];
    for (const g of globs) {
        if (hasSubstantialFile(root, g))
            hit++;
        else
            misses.push(g);
    }
    // 存在性证据权重封顶 0.5：测试文件存在 ≠ 测试通过，单独此维永远不会把节点推断为 done
    const score = 0.5 * (hit / globs.length);
    return {
        kind: "tests",
        ok: hit === globs.length,
        score,
        detail: misses.length === 0
            ? `${globs.length} 个测试 glob 均存在（存在性证据，权重封顶 0.5）`
            : `测试文件缺失: ${misses.join(", ")}${hit > 0 ? `（${hit}/${globs.length} 命中）` : ""}`,
    };
}
