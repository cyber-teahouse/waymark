import { buildGraph } from "../graph/buildGraph.js";
import { validatePatterns, validatePlan } from "../graph/validate.js";
import { loadPlan } from "../parser/parsePlan.js";
import { detectProjectName, synthesize } from "./synthesize.js";
export async function buildWorkflow(root) {
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
