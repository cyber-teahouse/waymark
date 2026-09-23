import { buildGraph } from "../graph/buildGraph.js";
import { validatePatterns, validatePlan } from "../graph/validate.js";
import { loadPlan } from "../parser/parsePlan.js";
import type { PlanIssue, WorkflowJson } from "../types.js";
import { detectProjectName, synthesize } from "./synthesize.js";

export interface BuildOutcome {
  workflow: WorkflowJson;
  issues: PlanIssue[];
}

export async function buildWorkflow(root: string): Promise<BuildOutcome> {
  const plan = loadPlan(root);
  const graph = buildGraph(plan.nodes);
  const issues = [...plan.issues, ...validatePlan({ ...plan, graph }), ...validatePatterns(plan.nodes)];
  const workflow = await synthesize({
    root,
    projectName: detectProjectName(root),
    nodes: plan.nodes,
    iterations: plan.iterations,
    overview: plan.overview,
    graph,
    issues,
  });
  return { workflow, issues };
}
