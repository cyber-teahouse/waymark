import React, { useMemo } from "react";
import {
  ReactFlow, Controls, MarkerType, Handle, Position, Panel,
  type Node, type Edge, type NodeProps, type EdgeProps,
} from "@xyflow/react";
import type { WorkflowNode } from "../../src/types";

export const STATUS_LABEL: Record<string, string> = {
  planned: "未开始", "in-progress": "进行中", done: "已完成", blocked: "受阻", dropped: "已放弃",
};

const NODE_W = 248;
const NODE_H = 78;
const EDGE_COLOR = "#8A7B5C";
const EDGE_HIT = "#B04A24";

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
      <Handle type="target" position={Position.Top} />
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
        {wf.warning === "stalled" && <span className="node-chip">无进展证据</span>}
        {wf.cycle && <span className="node-chip cyc">循环依赖</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { plan: PlanNode };

const ROW_H = 152;
const COL_W = NODE_W + 46;

/** 最长路径分层：依赖必然从浅层指向深层（DAG 保证严格递增）。 */
function computeRanks(nodes: WorkflowNode[], edges: { from: string; to: string }[]): Map<string, number> {
  const ids = new Set(nodes.map(n => n.id));
  const depth = new Map(nodes.map(n => [n.id, 0]));
  const indeg = new Map(nodes.map(n => [n.id, 0]));
  const dependents = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    dependents.get(e.from)!.push(e.to);
  }
  const queue = nodes.filter(n => (indeg.get(n.id) ?? 0) === 0).map(n => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id) ?? 0;
    for (const next of dependents.get(id)!) {
      if (d + 1 > (depth.get(next) ?? 0)) depth.set(next, d + 1);
      const left = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, left);
      if (left === 0) queue.push(next);
    }
  }
  return depth;
}

/**
 * 之字形登山步道布局：按依赖层从上往下铺，奇数层左右折返（像山道的之字弯），
 * 每层叠加正弦摆动 + 节点微抖动，让路「活」起来，而不是死板的正交网格。
 * 同时按行走顺序串联一条点状步道线（trail edges），强化"路标"隐喻。
 */
function layout(nodes: WorkflowNode[], edges: { from: string; to: string }[]): { nodes: Node[]; edges: Edge[] } {
  const ranks = computeRanks(nodes, edges);
  const byRank = new Map<number, WorkflowNode[]>();
  nodes.forEach(n => {
    const r = ranks.get(n.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(n);
  });
  const rankList = [...byRank.keys()].sort((a, b) => a - b);
  const pos = new Map<string, { x: number; y: number }>();
  const journey: string[] = [];
  rankList.forEach(r => {
    const row = byRank.get(r)!;
    row.sort((a, b) => `${a.iteration}${a.id}`.localeCompare(`${b.iteration}${b.id}`));
    const serpentine = r % 2 === 1;
    // 行走顺序：偶数层从左往右，奇数层从右往左折返
    journey.push(...(serpentine ? [...row].reverse() : row).map(n => n.id));
    const wobble = Math.sin(r * 1.35) * 96;
    row.forEach((n, i) => {
      const order = serpentine ? row.length - 1 - i : i;
      const jitter = Math.sin(i * 2.3 + r * 0.9) * 12;
      pos.set(n.id, { x: 110 + order * COL_W + wobble, y: 80 + r * ROW_H + jitter });
    });
  });
  const rfNodes: Node[] = nodes.map(n => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    return {
      id: n.id,
      type: "plan",
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: { wf: n },
    };
  });
  // 点状步道线：贯穿全部路标，铺在依赖线之下
  const trailEdges: Edge[] = journey.slice(1).map((to, i) => ({
    id: `trail-${i}`,
    source: journey[i],
    target: to,
    type: "trail",
    selectable: false,
    data: { trail: true },
  }));
  const rfEdges: Edge[] = edges.map(e => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    style: { stroke: EDGE_COLOR, strokeWidth: 1.75 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: EDGE_COLOR },
  }));
  return { nodes: rfNodes, edges: [...trailEdges, ...rfEdges] };
}

/** 步道线：圆点连成的虚线路径，非交互。纸色 halo 垫底，从等高线里脱出来。 */
function TrailEdge({ sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const dx = Math.max(Math.abs(targetX - sourceX) * 0.45, 56);
  const d = `M ${sourceX},${sourceY} C ${sourceX + dx},${sourceY} ${targetX - dx},${targetY} ${targetX},${targetY}`;
  return (
    <>
      <path d={d} className="trail-halo" />
      <path d={d} className="trail-path" />
    </>
  );
}

const edgeTypes = { trail: TrailEdge };

/** 等高线地形 backdrop：手绘感曲线层叠，图纸质感（静态纸纹，不随平移缩放）。 */
function TopoBackdrop() {
  return (
    <svg className="topo" aria-hidden="true" viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice">
      <path d="M-60,150 C180,90 360,230 600,170 S980,60 1460,150" />
      <path d="M-60,230 C200,170 380,310 620,250 S1000,140 1460,230" />
      <path d="M-60,310 C220,250 400,390 640,330 S1020,220 1460,310" />
      <path d="M-60,560 C240,500 420,640 660,580 S1040,470 1460,560" />
      <path d="M-60,645 C260,585 440,725 680,665 S1060,555 1460,645" />
      <path d="M-60,730 C280,670 460,810 700,750 S1080,640 1460,730" />
      <path d="M-60,815 C300,755 480,895 720,835 S1100,725 1460,815" />
    </svg>
  );
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
        <span className="legend-item"><i className="legend-trail" />步道</span>
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
    // 依赖高亮：选中节点的出入边加强，其余淡化；步道线恒常显示
    const styled = laid.edges.map(e => {
      if ((e.data as { trail?: boolean } | undefined)?.trail) return e;
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
      <TopoBackdrop />
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.4}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelect(n.id)}
      >
        <Controls showInteractive={false} />
        <Legend />
      </ReactFlow>
    </div>
  );
}

