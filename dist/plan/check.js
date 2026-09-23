import { buildGraph } from "../graph/buildGraph.js";
import { validatePatterns, validatePlan } from "../graph/validate.js";
import { loadPlan } from "../parser/parsePlan.js";
/** 完整校验组合：解析 issues + 图规范 + 证据正则。CLI check/done 与 MCP waymark_check 共用，保证口径一致。 */
export function collectPlanIssues(root) {
    const plan = loadPlan(root);
    const graph = buildGraph(plan.nodes);
    return [...plan.issues, ...validatePlan({ ...plan, graph }), ...validatePatterns(plan.nodes)];
}
