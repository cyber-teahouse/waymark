import React, { useMemo } from "react";
import {
  ReactFlow, Background, Controls, MarkerType, Handle, Position,
  type Node, type Edge, type NodeProps,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { WorkflowNode } from "../../src/types";

export const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  planned: { bg: "#f3f4f6", border: "#9ca3af" },
  "in-progress": { bg: "#dbeafe", border: "#2563eb" },
  done: { bg: "#dcfce7", border: "#16a34a" },
  blocked: { bg: "#fee2e2", border: "#dc2626" },
  dropped: { bg: "#f9fafb", border: "#d1d5db" },
};

export const STATUS_LABEL: Record<string, string> = {
  planned: "未开始", "in-progress": "进行中", done: "已完成", blocked: "受阻", dropped: "已放弃",
};

function PlanNode({ data, selected }: NodeProps) {
  const wf = (data as { wf: WorkflowNode }).wf;
  const c = STATUS_COLORS[wf.displayStatus] ?? STATUS_COLORS.planned;
  const border = wf.cycle ? "#dc2626" : wf.warning ? "#f59e0b" : c.border;
  const icon = wf.cycle ? "🔄 " : wf.warning === "evidence-insufficient" ? "⚠ " : wf.warning === "ready-to-complete" ? "💡 " : "";
  return (
    <div
      className="plan-node"
      style={{
        background: c.bg,
        borderColor: border,
        borderStyle: wf.cycle ? "dashed" : "solid",
        outline: selected ? `2px solid ${border}` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="plan-node-title">{icon}{wf.title}</div>
      <div className="plan-node-meta">
        <span className="badge">{wf.type === "milestone" ? "里程碑" : "任务"}</span>
        <span>{STATUS_LABEL[wf.displayStatus]}</span>
        {wf.acceptance.length > 0 && (
          <span className="acc">{wf.acceptance.filter(a => a.done).length}/{wf.acceptance.length}</span>
        )}
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
  nodes.forEach(n => g.setNode(n.id, { width: 240, height: 76 }));
  edges.forEach(e => g.setEdge(e.from, e.to));
  dagre.layout(g);
  const rfNodes: Node[] = nodes.map(n => {
    const p = g.node(n.id);
    return {
      id: n.id,
      type: "plan",
      position: { x: (p?.x ?? 0) - 120, y: (p?.y ?? 0) - 38 },
      data: { wf: n },
    };
  });
  const rfEdges: Edge[] = edges.map(e => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    markerEnd: { type: MarkerType.ArrowClosed },
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
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
