import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makeSampleProject } from "./helpers.js";
import { createMcpServer } from "../src/mcp/server.js";
import { getWorkflowCacheStats, resetWorkflowCache } from "../src/mcp/workflowCache.js";

const TOOL_NAMES = [
  "waymark_summary",
  "waymark_get_node",
  "waymark_list_ready",
  "waymark_mark_done",
  "waymark_check",
];

async function setup(root: string): Promise<{ server: McpServer; client: Client }> {
  const server = createMcpServer(root);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

type ToolResult = { isError?: boolean; content: Array<{ type: string; text?: string }> };

function textOf(result: ToolResult): string {
  expect(result.isError).toBeFalsy();
  return result.content.map(c => (c.type === "text" ? c.text ?? "" : "")).join("");
}

function jsonOf(result: ToolResult): any {
  return JSON.parse(textOf(result));
}

async function makeTempSample(): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf-mcp-"));
  await makeSampleProject(root);
  return root;
}

describe("waymark mcp server", () => {
  it("listTools exposes the 5 tools with non-empty descriptions", async () => {
    const root = await makeTempSample();
    const { server, client } = await setup(root);
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const t of tools) {
      expect(t.description?.length ?? 0).toBeGreaterThan(0);
    }
    await client.close();
    await server.close();
  });

  it("waymark_summary returns stats.total === 3 and node ids", async () => {
    const root = await makeTempSample();
    const { server, client } = await setup(root);
    const result = await client.callTool({ name: "waymark_summary", arguments: {} });
    const obj = jsonOf(result as ToolResult);
    expect(obj.stats.total).toBe(3);
    expect(typeof obj.project).toBe("string");
    expect(obj.project.length).toBeGreaterThan(0);
    expect(typeof obj.generatedAt).toBe("string");
    expect(typeof obj.issuesCount).toBe("number");
    expect(obj.nodes.map((n: { id: string }) => n.id).sort())
      .toEqual(["M1-core", "M2-auth", "M3-login"]);
    // 轻量化：不携带重量级字段
    for (const n of obj.nodes) {
      expect(n.evidenceReport).toBeUndefined();
      expect(n.commits).toBeUndefined();
      expect(n.completionLog).toBeUndefined();
      expect(n.description).toBeUndefined();
    }
    await client.close();
    await server.close();
  });

  it("waymark_get_node returns full node for M1-core; unknown id is an error result", async () => {
    const root = await makeTempSample();
    const { server, client } = await setup(root);
    const ok = await client.callTool({ name: "waymark_get_node", arguments: { id: "M1-core" } });
    const node = jsonOf(ok as ToolResult);
    expect(Array.isArray(node.acceptance)).toBe(true);
    expect(node.acceptance).toHaveLength(2);
    expect(node.acceptance[0].text).toBe("初始化工程");
    expect(node.declaredStatus).toBe("done");

    const bad = await client.callTool({ name: "waymark_get_node", arguments: { id: "NOPE" } });
    expect(bad.isError).toBe(true);
    await client.close();
    await server.close();
  });

  it("waymark_list_ready returns [] for sample (M3 blocked by in-progress M2)", async () => {
    const root = await makeTempSample();
    const { server, client } = await setup(root);
    const result = await client.callTool({ name: "waymark_list_ready", arguments: {} });
    const obj = jsonOf(result as ToolResult);
    expect(obj.items).toEqual([]);
    expect(typeof obj.summary).toBe("string");
    await client.close();
    await server.close();
  });

  it("waymark_mark_done marks M2-auth done with note; then M3-login becomes ready", async () => {
    const root = await makeTempSample();
    const { server, client } = await setup(root);
    const done = await client.callTool({
      name: "waymark_mark_done",
      arguments: { id: "M2-auth", note: "完成认证模块" },
    });
    const doneObj = jsonOf(done as ToolResult);
    expect(doneObj.message).toContain("waymark_summary");

    // 通过 get_node 验证声明状态已变为 done
    const node = jsonOf(await client.callTool({
      name: "waymark_get_node", arguments: { id: "M2-auth" },
    }) as ToolResult);
    expect(node.declaredStatus).toBe("done");

    // M3-login 的依赖 M2-auth 已完成 → 可开工
    const ready = jsonOf(await client.callTool({ name: "waymark_list_ready", arguments: {} }) as ToolResult);
    expect(ready.items.map((i: { id: string }) => i.id)).toEqual(["M3-login"]);
    await client.close();
    await server.close();
  });

  it("waymark_check returns errors: 0 on the sample project", async () => {
    const root = await makeTempSample();
    const { server, client } = await setup(root);
    const result = await client.callTool({ name: "waymark_check", arguments: {} });
    const obj = jsonOf(result as ToolResult);
    expect(obj.errors).toBe(0);
    expect(typeof obj.warnings).toBe("number");
    expect(Array.isArray(obj.issues)).toBe(true);
    await client.close();
    await server.close();
  });
});

describe("workflow cache（MCP 工具共享）", () => {
  it("重复调用命中缓存；plan 变更后自动失效重建", async () => {
    const root = await makeTempSample();
    resetWorkflowCache();
    const { server, client } = await setup(root);

    await client.callTool({ name: "waymark_summary", arguments: {} });
    const afterFirst = getWorkflowCacheStats().rebuilds;

    // 无变更：第二个工具调用应命中缓存，不触发重建
    await client.callTool({ name: "waymark_get_node", arguments: { id: "M1-core" } });
    expect(getWorkflowCacheStats().rebuilds).toBe(afterFirst);

    // 变更 plan/ → 指纹变化 → 下一次调用重建
    fs.appendFileSync(path.join(root, "plan", "milestones", "M3-登录.md"), "\n补充说明\n");
    await client.callTool({ name: "waymark_summary", arguments: {} });
    expect(getWorkflowCacheStats().rebuilds).toBe(afterFirst + 1);

    await client.close();
    await server.close();
  });
});
