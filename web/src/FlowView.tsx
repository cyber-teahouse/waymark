import React, { useMemo } from "react";
import {
  ReactFlow, Background, Controls, MarkerType, Handle, Position,
  type Node, type Edge, type NodeProps,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { WorkflowNode } from "../../src/types";

export const STATUS_LABEL: Record<string, string> = {
  planned: "未开始", "in-progress": "进行中", done: "已完成", blocked: "受阻", dropped: "已放弃",
};

const NODE_W = 248;
const NODE_H = 78;
const EDGE_COLOR = "#C6CDD5";

function PlanNode({ data, selected }: NodeProps) {
  const wf = (data as { wf: WorkflowNode }).wf;
  const accTotal = wf.acceptance.length;
  const accDone = wf.acceptance.filter(a => a.done).length;
  const cls = [
    "plan-node",
    `st-${wf.displayStatus}`,
    wf.cycle ? "cycle" : "",
    selected ? "selected" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <Handle type="target" position={Position.Left} />
      <div className="node-eyebrow">
        <span className="node-id">{wf.id}</span>
        <span className="node-type" title={wf.type === "milestone" ? "里程碑" : "任务"}>
          {wf.type === "milestone" ? "◆" : "◇"}
        </span>
      </div>
      <div className="node-title" title={wf.title}>{wf.title}</div>
      <div className="node-meta">
        {accTotal > 0 && (
          <>
            <span className="acc-track">
              <span className="acc-fill" style={{ width: `${Math.round((accDone / accTotal) * 100)}%` }} />
            </span>
            <span className="acc-nums">{accDone}/{accTotal}</span>
          </>
        )}
        {wf.displayStatus === "in-progress" && <span className="wip-dot" title="进行中" />}
        {wf.warning === "evidence-insufficient" && <span className="node-chip">证据不足</span>}
        {wf.warning === "ready-to-complete" && <span className="node-chip">可标记完成</span>}
        {wf.cycle && <span className="node-chip cyc">循环依赖</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { plan: PlanNode };

function layout(nodes: WorkflowNode[], edges: { from: string; to: string }[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 90 });
  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach(e => g.setEdge(e.from, e.to));
  dagre.layout(g);
  const rfNodes: Node[] = nodes.map(n => {
    const p = g.node(n.id);
    return {
      id: n.id,
      type: "plan",
      position: { x: (p?.x ?? 0) - NODE_W / 2, y: (p?.y ?? 0) - NODE_H / 2 },
      data: { wf: n },
    };
  });
  const rfEdges: Edge[] = edges.map(e => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    style: { stroke: EDGE_COLOR, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: EDGE_COLOR },
  }));
  return { nodes: rfNodes, edges: rfEdges };
}

export default function FlowView({ nodes, edges, onSelect }: {
  nodes: WorkflowNode[];
  edges: { from: string; to: string }[];
  onSelect: (id: string) => void;
}) {
  const { nodes: rfNodes, edges: rfEdges } = useMemo(() => layout(nodes, edges), [nodes, edges]);
  return (
    <div className="flow">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelect(n.id)}
      >
        <Background gap={22} size={1.4} color="#E3E7EC" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
