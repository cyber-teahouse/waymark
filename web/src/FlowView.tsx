import React, { useMemo } from "react";
import {
  ReactFlow, Background, Controls, MarkerType, Handle, Position, Panel,
  type Node, type Edge, type NodeProps,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { WorkflowNode } from "../../src/types";

export const STATUS_LABEL: Record<string, string> = {
  planned: "未开始", "in-progress": "进行中", done: "已完成", blocked: "受阻", dropped: "已放弃",
};

const NODE_W = 248;
const NODE_H = 78;
const EDGE_COLOR = "#B7C0CB";
const EDGE_HIT = "#2C55E0";

interface PlanNodeData extends Record<string, unknown> {
  wf: WorkflowNode;
  ready: boolean;
  onSelect: (id: string) => void;
}

function PlanNode({ data, selected }: NodeProps) {
  const { wf, ready, onSelect } = data as PlanNodeData;
  const accTotal = wf.acceptance.length;
  const accDone = wf.acceptance.filter(a => a.done).length;
  const depCount = wf.deps.length;
  const aria = [
    wf.title,
    STATUS_LABEL[wf.displayStatus],
    ready ? "可开工" : null,
    accTotal > 0 ? `验收 ${accDone}/${accTotal}` : null,
    depCount > 0 ? `依赖 ${depCount} 项` : null,
    "按 Enter 查看详情",
  ].filter(Boolean).join("，");
  const cls = [
    "plan-node",
    `st-${wf.displayStatus}`,
    wf.cycle ? "cycle" : "",
    selected ? "selected" : "",
  ].filter(Boolean).join(" ");
  return (
    <div
      className={cls}
      role="button"
      tabIndex={0}
      aria-label={aria}
      onClick={() => onSelect(wf.id)}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(wf.id);
        }
      }}
    >
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
            <span className="acc-track" aria-hidden="true">
              <span className="acc-fill" style={{ width: `${Math.round((accDone / accTotal) * 100)}%` }} />
            </span>
            <span className="acc-nums">{accDone}/{accTotal}</span>
          </>
        )}
        {wf.displayStatus === "in-progress" && <span className="wip-dot" title="进行中" />}
        {ready && <span className="node-chip ready">可开工</span>}
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

function Legend() {
  const items: [string, string][] = [
    ["done", "已完成"], ["in-progress", "进行中"], ["planned", "未开始"],
    ["blocked", "受阻"], ["warn", "警示"],
  ];
  return (
    <Panel position="top-right">
      <div className="legend" aria-hidden="true">
        {items.map(([st, label]) => (
          <span key={st} className={`legend-item st-${st}`}>
            <i className="legend-dot" />{label}
          </span>
        ))}
        <span className="legend-item">◆ 里程碑</span>
        <span className="legend-item">◇ 任务</span>
      </div>
    </Panel>
  );
}

export default function FlowView({ nodes, edges, selectedId, readyIds, onSelect }: {
  nodes: WorkflowNode[];
  edges: { from: string; to: string }[];
  selectedId: string | null;
  readyIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const { nodes: rfNodes, edges: rfEdges } = useMemo(() => {
    const laid = layout(nodes, edges);
    // 依赖高亮：选中节点的出入边加强，其余淡化
    const styled = laid.edges.map(e => {
      const connected = selectedId !== null && (e.source === selectedId || e.target === selectedId);
      return {
        ...e,
        style: {
          stroke: connected ? EDGE_HIT : EDGE_COLOR,
          strokeWidth: connected ? 2.25 : 1.5,
          opacity: selectedId === null || connected ? 1 : 0.3,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: connected ? EDGE_HIT : EDGE_COLOR },
      } as Edge;
    });
    // 把 onSelect/ready 注入节点数据（键盘/点击都能打开详情）
    const withSelect = laid.nodes.map(n => ({
      ...n,
      data: { ...n.data, ready: readyIds.has(n.id), onSelect } as Record<string, unknown>,
    }));
    return { nodes: withSelect, edges: styled };
  }, [nodes, edges, selectedId, readyIds, onSelect]);

  return (
    <div className="flow">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.4}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelect(n.id)}
      >
        <Background gap={22} size={1.4} color="#E3E7EC" />
        <Controls showInteractive={false} />
        <Legend />
      </ReactFlow>
    </div>
  );
}

