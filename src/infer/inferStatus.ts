import type {
  AcceptanceItem, CommitInfo, EvidenceCheck, EvidenceKind, NodeFrontmatter, NodeStatus,
} from "../types.js";
import { scorePaths, scoreTests } from "./scorePaths.js";
import { scoreGrep } from "./scoreGrep.js";
import { scoreGit } from "./scoreGit.js";

export function parseAcceptance(items: string[]): AcceptanceItem[] {
  return items.map(s => {
    const m = /^\[([ xX])\]\s*(.+)$/.exec(s.trim());
    return m ? { done: m[1] !== " ", text: m[2] } : { done: false, text: s.trim() };
  });
}

export interface InferenceResult {
  report: EvidenceCheck[];
  score: number;              // 已声明维度平均分 0~1
  inferred: NodeStatus | null; // 无 evidence 时为 null
  confidence: number;
  commits: CommitInfo[];
}

export async function inferEvidence(root: string, fm: NodeFrontmatter): Promise<InferenceResult> {
  const ev = fm.evidence;
  if (!ev) {
    return { report: [], score: 0, inferred: null, confidence: 0, commits: [] };
  }
  const report: EvidenceCheck[] = [];
  const declared: EvidenceKind[] = [];
  const commits: CommitInfo[] = [];

  if (ev.paths) {
    report.push(scorePaths(root, ev.paths));
    declared.push("paths");
  }
  if (ev.grep) {
    const r = scoreGrep(root, ev.grep, ev.paths ?? []);
    report.push(r.check);
    declared.push("grep");
  }
  if (ev.tests) {
    report.push(scoreTests(root, ev.tests));
    declared.push("tests");
  }
  if (ev.git) {
    const r = await scoreGit(root, ev.git);
    report.push(r.check);
    commits.push(...r.commits);
    declared.push("git");
  }

  const score = declared.length === 0
    ? 0
    : declared.reduce((sum, kind) => sum + (report.find(c => c.kind === kind)?.score ?? 0), 0) / declared.length;

  const acceptance = parseAcceptance(fm.acceptance);
  const allDone = acceptance.length > 0 && acceptance.every(a => a.done);
  let inferred: NodeStatus;
  if (score <= 0) inferred = "planned";
  else if (score >= 1) inferred = allDone ? "done" : "in-progress";
  else inferred = "in-progress";

  return { report, score, inferred, confidence: score, commits };
}
