import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { markDone, listReady, startNode, blockNode, dropNode, reopenNode, toggleAcceptance } from "../plan/commands.js";
import { collectPlanIssues } from "../plan/check.js";
import { getVersion } from "../version.js";
import { getWorkflowCached } from "../sync/workflowCache.js";

const SERVER_NAME = "waymark";

function jsonText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

/** 创建 waymark MCP server（未连接 transport）。工具复用 sync/plan/graph 引擎，全部返回 JSON 文本。 */
export function createMcpServer(root: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: getVersion() });

  server.registerTool("waymark_summary", {
    description: "获取项目工作流总览",
  }, async () => {
    const { workflow, issues } = await getWorkflowCached(root);
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
    const { workflow } = await getWorkflowCached(root);
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

  server.registerTool("waymark_start_node", {
    description: "认领开工：把 planned 节点标记为 in-progress（开工前先调用 waymark_list_ready）",
    inputSchema: { id: z.string().min(1) },
  }, async ({ id }) => {
    const { file, warnings } = startNode(root, id);
    return jsonText({
      message: "已标记为 in-progress，完成后调用 waymark_mark_done 收尾",
      file,
      warnings,
      readyNext: listReady(root),
    });
  });

  server.registerTool("waymark_block_node", {
    description: "把节点标记为受阻 blocked（旁路状态；解除后用 waymark_reopen_node 恢复）",
    inputSchema: { id: z.string().min(1), note: z.string().optional() },
  }, async ({ id, note }) => {
    const { file, warnings } = blockNode(root, id, { note });
    return jsonText({
      message: "已标记为 blocked——阻塞解除后调用 waymark_reopen_node 恢复",
      file,
      warnings,
      readyNext: listReady(root),
    });
  });

  server.registerTool("waymark_drop_node", {
    description: "放弃节点：标记为 dropped（旁路状态，不再计入待办）",
    inputSchema: { id: z.string().min(1), note: z.string().optional() },
  }, async ({ id, note }) => {
    const { file, warnings } = dropNode(root, id, { note });
    return jsonText({
      message: "已标记为 dropped——需求恢复时用 waymark_reopen_node 恢复",
      file,
      warnings,
    });
  });

  server.registerTool("waymark_reopen_node", {
    description: "重新打开 done/blocked/dropped 节点（撤销误操作）：默认恢复为 in-progress，planned=true 退回未开始",
    inputSchema: {
      id: z.string().min(1),
      planned: z.boolean().optional(),
      note: z.string().optional(),
    },
  }, async ({ id, planned, note }) => {
    const { file, warnings } = reopenNode(root, id, { planned, note });
    return jsonText({
      message: planned
        ? "已恢复为 planned（认领开工用 waymark_start_node）"
        : "已恢复为 in-progress——完成后调用 waymark_mark_done 收尾",
      file,
      warnings,
      readyNext: listReady(root),
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
    const { file, warnings } = markDone(root, id, { note, allAcceptance });
    return jsonText({
      message: "已标记完成，建议运行 waymark sync 或调用 waymark_summary 刷新数据",
      file,
      warnings,
      readyNext: listReady(root),
    });
  });

  server.registerTool("waymark_toggle_acceptance", {
    description: "勾选/取消节点的单项验收标准（indices 为 1 起编号，与页面展示顺序一致，可多个；返回更新后的验收列表）",
    inputSchema: { id: z.string().min(1), indices: z.array(z.number().int().min(1)).min(1) },
  }, async ({ id, indices }) => {
    const { file, warnings, acceptance } = toggleAcceptance(root, id, indices);
    return jsonText({ message: "验收已更新", file, warnings, acceptance });
  });

  server.registerTool("waymark_check", {    description: "校验 /plan 规范",
  }, async () => {
    const issues = collectPlanIssues(root);
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
