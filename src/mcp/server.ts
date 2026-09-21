import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildWorkflow } from "../sync/build.js";
import { markDone, listReady } from "../plan/commands.js";
import { loadPlan } from "../parser/parsePlan.js";
import { buildGraph } from "../graph/buildGraph.js";
import { validatePlan, validatePatterns } from "../graph/validate.js";

const SERVER_NAME = "waymark";
const SERVER_VERSION = "0.2.0";

function jsonText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

/** 与 CLI check 相同的校验组合 */
function collectIssues(root: string) {
  const plan = loadPlan(root);
  const graph = buildGraph(plan.nodes);
  return [
    ...plan.issues,
    ...validatePlan({ ...plan, graph }),
    ...validatePatterns(plan.nodes),
  ];
}

/** 创建 waymark MCP server（未连接 transport）。工具复用 sync/plan/graph 引擎，全部返回 JSON 文本。 */
export function createMcpServer(root: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool("waymark_summary", {
    description: "获取项目工作流总览",
  }, async () => {
    const { workflow, issues } = await buildWorkflow(root);
    return jsonText({
      project: workflow.project,
      generatedAt: workflow.generatedAt,
      stats: workflow.stats,
      iterations: workflow.iterations.map(it => ({
        id: it.id, title: it.title, goal: it.goal, window: it.window,
      })),
      issuesCount: issues.length,
      nodes: workflow.nodes.map(n => ({
        id: n.id, title: n.title, type: n.type,
        displayStatus: n.displayStatus, warning: n.warning,
        iteration: n.iteration, deps: n.deps,
      })),
    });
  });

  server.registerTool("waymark_get_node", {
    description: "获取节点详情（验收/证据/提交/完成记录）",
    inputSchema: { id: z.string().min(1) },
  }, async ({ id }) => {
    const { workflow } = await buildWorkflow(root);
    const node = workflow.nodes.find(n => n.id === id);
    if (!node) throw new Error(`未找到节点: ${id}`);
    return jsonText(node);
  });

  server.registerTool("waymark_list_ready", {
    description: "列出可开工节点",
  }, async () => {
    const items = listReady(root);
    return jsonText({
      summary: items.length === 0
        ? "没有可开工节点（无 planned 状态，或依赖未满足）"
        : `可开工 ${items.length} 个节点`,
      items,
    });
  });

  server.registerTool("waymark_mark_done", {
    description: "标记节点完成并追加完成记录",
    inputSchema: {
      id: z.string().min(1),
      note: z.string().optional(),
      allAcceptance: z.boolean().optional(),
    },
  }, async ({ id, note, allAcceptance }) => {
    const { file } = markDone(root, id, { note, allAcceptance });
    return jsonText({
      message: "已标记完成，建议运行 waymark sync 或调用 waymark_summary 刷新数据",
      file,
    });
  });

  server.registerTool("waymark_check", {
    description: "校验 /plan 规范",
  }, async () => {
    const issues = collectIssues(root);
    return jsonText({
      errors: issues.filter(i => i.level === "error").length,
      warnings: issues.filter(i => i.level === "warning").length,
      issues,
    });
  });

  return server;
}

/** 以 stdio transport 启动 MCP 服务（stdout 即协议通道，勿打印其他内容）。 */
export async function startMcpServer(root: string): Promise<void> {
  const server = createMcpServer(root);
  await server.connect(new StdioServerTransport());
}
