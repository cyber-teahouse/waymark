import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { DEFAULT_IGNORES, type EvidenceCheck } from "../types.js";

function hasSubstantialFile(root: string, glob: string): boolean {
  const files = fg.sync(glob, { cwd: root, onlyFiles: true, dot: false, ignore: DEFAULT_IGNORES, suppressErrors: true });
  return files.some(f => {
    try {
      return fs.statSync(path.join(root, f)).size > 0;
    } catch {
      return false;
    }
  });
}

export function scorePaths(root: string, globs: string[]): EvidenceCheck {
  if (globs.length === 0) {
    return { kind: "paths", ok: false, score: 0, detail: "未声明", skipped: true };
  }
  let hit = 0;
  const misses: string[] = [];
  for (const g of globs) {
    if (hasSubstantialFile(root, g)) hit++;
    else misses.push(g);
  }
  const score = hit / globs.length;
  return {
    kind: "paths", ok: score === 1, score,
    detail: `${hit}/${globs.length} 个模式命中实质文件${misses.length ? `；未命中: ${misses.join(", ")}` : ""}`,
  };
}

export function scoreTests(root: string, globs: string[]): EvidenceCheck {
  if (globs.length === 0) {
    return { kind: "tests", ok: false, score: 0, detail: "未声明", skipped: true };
  }
  const present = globs.every(g => hasSubstantialFile(root, g));
  return present
    ? { kind: "tests", ok: true, score: 0.5, detail: `${globs.length} 个测试 glob 均存在（v1 只查存在性）` }
    : { kind: "tests", ok: false, score: 0, detail: `测试文件缺失: ${globs.join(", ")}` };
}
