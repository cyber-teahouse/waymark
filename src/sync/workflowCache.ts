import { workflowInputMtime } from "../render/render.js";
import { buildWorkflow } from "../sync/build.js";
import type { PlanIssue, WorkflowJson } from "../types.js";

export interface CachedWorkflow {
  workflow: WorkflowJson;
  issues: PlanIssue[];
  /** 本次是否命中缓存（未重新扫描证据/git）。 */
  fromCache: boolean;
}

interface CacheEntry {
  fingerprint: number;
  workflow: WorkflowJson;
  issues: PlanIssue[];
}

let entry: CacheEntry | null = null;
let lastRoot: string | null = null;
let rebuildCount = 0;
let queue: Promise<unknown> = Promise.resolve();

/** 输入新鲜度指纹 = plan/ + 证据目录 + git 索引的最新 mtime。
 *  mark_done 会改写 plan 文件、提交会更新 .git/index、改代码会动证据目录，均使指纹变化。 */
function fingerprint(root: string): number {
  return workflowInputMtime(root);
}

/** 串行化重建，避免并发工具调用重复触发昂贵的 git/证据扫描。 */
export function getWorkflowCached(root: string): Promise<CachedWorkflow> {
  const run = queue.then(async (): Promise<CachedWorkflow> => {
    const fp = fingerprint(root);
    if (entry && lastRoot === root && entry.fingerprint === fp) {
      return { workflow: entry.workflow, issues: entry.issues, fromCache: true };
    }
    const { workflow, issues } = await buildWorkflow(root);
    rebuildCount += 1;
    entry = { fingerprint: fp, workflow, issues };
    lastRoot = root;
    return { workflow, issues, fromCache: false };
  });
  queue = run.catch(() => {
    /* 下一次调用重新尝试 */
  });
  return run;
}

/** 测试与诊断用：累计重建次数与缓存状态。 */
export function getWorkflowCacheStats(): { rebuilds: number; hasEntry: boolean; root: string | null } {
  return { rebuilds: rebuildCount, hasEntry: entry !== null, root: lastRoot };
}

/** 测试用：清空缓存（不影响计数器语义，重建次数继续累计）。 */
export function resetWorkflowCache(): void {
  entry = null;
  lastRoot = null;
}
