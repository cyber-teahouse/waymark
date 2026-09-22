import { z } from "zod";
export const NODE_STATUSES = ["planned", "in-progress", "done", "blocked", "dropped"];
export const NodeStatusSchema = z.enum(NODE_STATUSES);
export const EvidenceSchema = z.object({
    paths: z.array(z.string()).optional(),
    grep: z.array(z.string()).optional(),
    tests: z.array(z.string()).optional(),
    git: z.array(z.string()).optional(),
});
export const NodeFrontmatterSchema = z.object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "id 仅允许字母数字与 . _ -"),
    title: z.string().min(1),
    type: z.enum(["milestone", "task"]),
    status: NodeStatusSchema,
    deps: z.array(z.string()).default([]),
    iteration: z.string().optional(),
    evidence: EvidenceSchema.optional(),
    acceptance: z.array(z.string()).default([]),
});
export const IterationFrontmatterSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    goal: z.string().optional(),
    window: z.string().optional(),
});
export const WorkflowNodeSchema = z.object({
    id: z.string(),
    title: z.string(),
    type: z.enum(["milestone", "task"]),
    declaredStatus: NodeStatusSchema,
    inferredStatus: NodeStatusSchema.nullable(),
    displayStatus: NodeStatusSchema,
    warning: z.enum(["evidence-insufficient", "ready-to-complete", "stalled"]).nullable(),
    cycle: z.boolean().optional(),
    confidence: z.number(),
    evidenceReport: z.array(z.object({
        kind: z.enum(["paths", "grep", "tests", "git"]),
        ok: z.boolean(), score: z.number(), detail: z.string(), skipped: z.boolean().optional(),
    })),
    acceptance: z.array(z.object({ text: z.string(), done: z.boolean() })),
    completionLog: z.array(z.object({ date: z.string(), text: z.string() })),
    commits: z.array(z.object({ hash: z.string(), date: z.string(), message: z.string() })),
    iteration: z.string().optional(),
    deps: z.array(z.string()),
    file: z.string(),
    description: z.string(),
});
export const WorkflowJsonSchema = z.object({
    version: z.literal(1),
    generatedAt: z.string(),
    project: z.string(),
    nodes: z.array(WorkflowNodeSchema),
    edges: z.array(z.object({ from: z.string(), to: z.string() })),
    iterations: z.array(z.object({
        id: z.string(), title: z.string(),
        goal: z.string().optional(), window: z.string().optional(),
        nodeIds: z.array(z.string()),
    })),
    issues: z.array(z.object({
        level: z.enum(["error", "warning"]), file: z.string(), message: z.string(),
    })).optional(),
    stats: z.object({
        total: z.number(), done: z.number(), inProgress: z.number(),
        planned: z.number(), blocked: z.number(), dropped: z.number(), warnings: z.number(),
    }),
});
export const DEFAULT_IGNORES = [
    "**/node_modules/**", "**/.git/**", "**/dist/**", "**/out/**", "**/build/**",
    "**/bin/**", "**/obj/**", "**/.waymark/**", "**/coverage/**",
];
export const IGNORE_DIR_NAMES = [
    "node_modules", ".git", "dist", "out", "build", "bin", "obj", ".waymark", "coverage",
];
