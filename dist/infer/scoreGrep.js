import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { DEFAULT_IGNORES, IGNORE_DIR_NAMES } from "../types.js";
const MAX_FILES = 20000;
const MAX_FILE_BYTES = 1_000_000;
function isBinary(buf) {
    return buf.subarray(0, 8000).includes(0);
}
function walkFiles(dir, out) {
    if (out.length >= MAX_FILES)
        return;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const e of entries) {
        if (out.length >= MAX_FILES)
            return;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            // plan/ 存放计划文档，grep 模式本身声明于其 frontmatter——跳过以免自证命中
            if (e.name !== "plan" && !IGNORE_DIR_NAMES.includes(e.name))
                walkFiles(full, out);
        }
        else if (e.isFile()) {
            out.push(full);
        }
    }
}
function collectCandidates(root, scopeGlobs) {
    if (scopeGlobs.length === 0) {
        const files = [];
        walkFiles(root, files);
        return files;
    }
    return fg
        .sync(scopeGlobs, {
        cwd: root,
        onlyFiles: true,
        dot: false,
        ignore: DEFAULT_IGNORES,
        suppressErrors: true,
    })
        .map((f) => path.join(root, f));
}
function cacheKey(scopeGlobs) {
    return scopeGlobs.join("\u0000");
}
export function scoreGrep(root, patterns, scopeGlobs = [], fileCache) {
    if (patterns.length === 0) {
        return { check: { kind: "grep", ok: false, score: 0, detail: "未声明", skipped: true }, sampleHits: [] };
    }
    let regexes;
    try {
        regexes = patterns.map((p) => new RegExp(p));
    }
    catch (e) {
        return {
            check: {
                kind: "grep",
                ok: false,
                score: 0,
                detail: `正则无效: ${e.message}`,
                skipped: true,
            },
            sampleHits: [],
        };
    }
    const key = cacheKey(scopeGlobs);
    const cached = fileCache?.get(key);
    const candidates = cached ?? collectCandidates(root, scopeGlobs);
    if (!cached)
        fileCache?.set(key, candidates);
    const sampleHits = [];
    let anyHit = false;
    let truncated = candidates.length >= MAX_FILES;
    for (const file of candidates) {
        let stat;
        try {
            stat = fs.statSync(file);
        }
        catch {
            continue;
        }
        if (stat.size > MAX_FILE_BYTES) {
            truncated = true;
            continue;
        }
        let buf;
        try {
            buf = fs.readFileSync(file);
        }
        catch {
            continue;
        }
        if (isBinary(buf))
            continue;
        const lines = buf.toString("utf8").split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            if (regexes.some((re) => re.test(lines[i]))) {
                anyHit = true;
                if (sampleHits.length < 3) {
                    sampleHits.push(`${path.relative(root, file).split(path.sep).join("/")}:${i + 1}`);
                }
                break;
            }
        }
    }
    const scopeNote = scopeGlobs.length > 0 ? "（声明范围内）" : "（全仓）";
    return {
        check: {
            kind: "grep",
            ok: anyHit,
            score: anyHit ? 1 : 0,
            detail: anyHit
                ? `命中${scopeNote}: ${sampleHits.join(", ")}${truncated ? "（已截断扫描）" : ""}`
                : `未命中${scopeNote}${truncated ? "（已截断扫描）" : ""}`,
        },
        sampleHits,
    };
}
