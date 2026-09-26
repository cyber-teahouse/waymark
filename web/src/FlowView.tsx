import {
  Controls,
  type Edge,
  type EdgeProps,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowNode } from "../../src/types";

export const STATUS_LABEL: Record<string, string> = {
  planned: "未开始",
  "in-progress": "进行中",
  done: "已完成",
  blocked: "受阻",
  dropped: "已放弃",
};

const NODE_W = 204;
const NODE_H = 152;
const EDGE_COLOR = "#8A7B5C";
const EDGE_HIT = "#B04A24";

/** 缩略图节点配色：与 styles.css 状态令牌（--done/--wip/--planned/--blocked/--dropped）同色。 */
const MINIMAP_COLOR: Record<string, string> = {
  done: "#2E6B4E",
  "in-progress": "#B04A24",
  planned: "#8A8272",
  blocked: "#A83A28",
  dropped: "#A79E8C",
};

interface PlanNodeData extends Record<string, unknown> {
  wf: WorkflowNode;
  ready: boolean;
  rank: number;
  onSelect: (id: string) => void;
}

/** 路标图钉：状态决定形态（实心=已走、脉冲=当前、空心=未走）。 */
const STATUS_GLYPH: Record<string, string> = {
  done: "✓",
  "in-progress": "●",
  planned: "○",
  blocked: "▲",
  dropped: "✕",
};

// 入场动画只播一次：首帧挂载的节点播；之后筛选/切换导致的重挂载不再播（FlowView 首帧后置 true）
let entrancePlayed = false;

function PlanNode({ data, selected }: NodeProps) {
  const { wf, ready, rank, onSelect } = data as PlanNodeData;
  // 挂载瞬间定格是否播入场动画，后续重渲染不影响（避免动画被中途摘掉）
  const [enter] = useState(() => !entrancePlayed);
  const accTotal = wf.acceptance.length;
  const accDone = wf.acceptance.filter((a) => a.done).length;
  const depCount = wf.deps.length;
  const aria = [
    wf.title,
    STATUS_LABEL[wf.displayStatus],
    ready ? "可开工" : null,
    accTotal > 0 ? `验收 ${accDone}/${accTotal}` : null,
    depCount > 0 ? `依赖 ${depCount} 项` : null,
    "按 Enter 查看详情",
  ]
    .filter(Boolean)
    .join("，");
  const cls = [
    "wp",
    `st-${wf.displayStatus}`,
    wf.cycle ? "cycle" : "",
    selected ? "selected" : "",
    enter ? "enter" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    // biome-ignore lint/a11y/useSemanticElements: DAG 画布节点内含复杂子结构（Handle/徽章/多行文本），原生 button 会破坏 xyflow 布局；已带 tabIndex 与键盘处理
    <div
      className={cls}
      role="button"
      tabIndex={0}
      aria-label={aria}
      style={{ animationDelay: `${Math.min(rank, 12) * 90}ms` }}
      onClick={() => onSelect(wf.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(wf.id);
        }
      }}
    >
      <Handle type="target" position={Position.Left} className="wp-handle" />
      <span className="wp-pin" aria-hidden="true">
        <span className="wp-glyph">{STATUS_GLYPH[wf.displayStatus] ?? "○"}</span>
      </span>
      <span className="wp-label">
        <span className="wp-eyebrow">
          <span>{wf.id}</span>
          <span className="wp-type" title={wf.type === "milestone" ? "里程碑" : "任务"}>
            {wf.type === "milestone" ? "◆" : "◇"}
          </span>
        </span>
        <span className="wp-title" title={wf.title}>
          {wf.title}
        </span>
        <span className="wp-meta">
          {accTotal > 0 && (
            <>
              <span className="acc-track" aria-hidden="true">
                <span className="acc-fill" style={{ width: `${Math.round((accDone / accTotal) * 100)}%` }} />
              </span>
              <span className="acc-nums">
                {accDone}/{accTotal}
              </span>
            </>
          )}
          {ready && <span className="node-chip ready">可开工</span>}
          {wf.warning === "evidence-insufficient" && <span className="node-chip">证据不足</span>}
          {wf.warning === "ready-to-complete" && <span className="node-chip">可标记完成</span>}
          {wf.warning === "stalled" && <span className="node-chip">无进展证据</span>}
          {wf.cycle && <span className="node-chip cyc">循环依赖</span>}
        </span>
      </span>
      <Handle type="source" position={Position.Right} className="wp-handle" />
    </div>
  );
}

const nodeTypes = { plan: PlanNode, camp: CampDecor };

/** 营地旗标：迭代分界处的小旗，非交互。 */
function CampDecor({ data }: NodeProps) {
  const { label } = data as { label: string };
  return (
    <div className="camp" aria-hidden="true">
      <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
        <path d="M1,13 V1 M1,1 L11,3.5 L1,6 Z" className="camp-flag" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

/** 罗盘装饰：右下角固定，强化地图质感。 */
function Compass() {
  return (
    <svg className="compass" width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="30" cy="32" r="24" className="compass-ring" />
      <circle cx="30" cy="32" r="2" className="compass-dot" />
      <path d="M30,12 L34,32 L30,52 L26,32 Z" className="compass-needle" />
      <text x="30" y="10" className="compass-n">
        N
      </text>
    </svg>
  );
}

/** 最长路径分层：依赖必然从浅层指向深层（DAG 保证严格递增）。 */
function computeRanks(nodes: WorkflowNode[], edges: { from: string; to: string }[]): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  const depth = new Map(nodes.map((n) => [n.id, 0]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const dependents = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    dependents.get(e.from)!.push(e.to);
  }
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
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
 * 思维导图式山径：以依赖树为骨架，根居左、枝向右发散。
 * 每枚路标认一位"主亲"（依赖层最浅的父节点），DFS 层叠布局——
 * 叶子自上而下各占一道，父节点垂直居中于子树，枝条用 S 形曲线。
 * 主亲枝 = 步道（旅程顺序），跨枝依赖退化为淡色虚线；
 * 迭代分界处立营地旗标，角落配罗盘装饰。
 */
const MM_X0 = 240; // 根节点钉心 x
const MM_LEVEL = 380; // 层间距（枝条长度：卡缘间隙 176 + 卡宽 204）
const MM_LEAF_GAP = 176; // 叶子垂直间距（≥ 节点高 + 呼吸）

/** 选主亲：依赖层最浅者（并列取 id 小者），保证主亲图是严格树。 */
function primaryParents(
  nodes: WorkflowNode[],
  edges: { from: string; to: string }[],
  ranks: Map<string, number>,
) {
  const ids = new Set(nodes.map((n) => n.id));
  const parent = new Map<string, string>();
  const candidates: { from: string; to: string }[] = [];
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    candidates.push(e);
    const cur = parent.get(e.to);
    const better =
      cur === undefined ||
      (ranks.get(e.from) ?? 0) < (ranks.get(cur) ?? 0) ||
      ((ranks.get(e.from) ?? 0) === (ranks.get(cur) ?? 0) && e.from < cur);
    if (better) parent.set(e.to, e.from);
  }
  return { parent, candidates };
}

function layout(
  nodes: WorkflowNode[],
  edges: { from: string; to: string }[],
  iterations: { id: string; title: string }[],
): {
  nodes: Node[];
  edges: Edge[];
  trailIds: string[];
} {
  const ranks = computeRanks(nodes, edges);
  const { parent, candidates } = primaryParents(nodes, edges, ranks);
  const iterId = (a: WorkflowNode, b: WorkflowNode) =>
    `${a.iteration}${a.id}`.localeCompare(`${b.iteration}${b.id}`);

  // 主亲树的孩子表（按迭代+id 排序，保证旅程顺序稳定）
  const children = new Map<string, WorkflowNode[]>();
  const isRoot = new Set(nodes.map((n) => n.id));
  for (const [to, from] of parent) {
    isRoot.delete(to);
    const f = nodes.find((n) => n.id === from);
    const t = nodes.find((n) => n.id === to);
    if (!f || !t) continue;
    if (!children.has(from)) children.set(from, []);
    children.get(from)!.push(t);
  }
  for (const list of children.values()) list.sort(iterId);
  const roots = nodes.filter((n) => isRoot.has(n.id)).sort(iterId);

  // DFS 层叠布局：叶子依次占一道，父节点居中于子树
  const pos = new Map<string, { x: number; y: number }>();
  const trail: WorkflowNode[] = [];
  let leafCursor = 0;
  const PIN = 17; // 图钉半径
  const dfs = (n: WorkflowNode, depth: number) => {
    trail.push(n);
    const kids = children.get(n.id) ?? [];
    if (kids.length === 0) {
      pos.set(n.id, { x: MM_X0 + depth * MM_LEVEL, y: leafCursor * MM_LEAF_GAP });
      leafCursor++;
      return;
    }
    const first = leafCursor;
    for (const k of kids) dfs(k, depth + 1);
    const y = ((first + leafCursor - 1) / 2) * MM_LEAF_GAP;
    pos.set(n.id, { x: MM_X0 + depth * MM_LEVEL, y });
  };
  roots.forEach((r) => {
    dfs(r, 0);
  });
  // 无依赖也无被依赖的孤立节点：当作根补排
  for (const n of nodes) if (!pos.has(n.id)) dfs(n, 0);

  // 营地旗标：每个迭代首枚路标上方立一面小旗（层级路牌）
  const campNodes: Node[] = [];
  const seenIter = new Set<string>();
  trail.forEach((n, i) => {
    const iterKey = n.iteration ?? "";
    if (seenIter.has(iterKey)) return;
    seenIter.add(iterKey);
    if (i === 0) return;
    const p = pos.get(n.id);
    if (!p) return;
    const title = iterations.find((it) => it.id === iterKey)?.title ?? iterKey;
    campNodes.push({
      id: `camp-${iterKey}`,
      type: "camp",
      position: { x: p.x - 62, y: p.y - PIN - 46 },
      selectable: false,
      draggable: false,
      // 声明初始尺寸：受控用法不传 onNodesChange，RF 不回写 measured，
      // MiniMap 依赖尺寸存在（nodeHasDimensions 回退链含 initialWidth/Height）才渲染节点
      initialWidth: 140,
      initialHeight: 24,
      data: { label: `${iterKey} · ${title}` },
    });
  });

  const rfNodes: Node[] = nodes.map((n) => {
    const p = pos.get(n.id) ?? { x: MM_X0, y: 0 };
    return {
      id: n.id,
      type: "plan",
      // 节点盒以图钉为锚：钉心对准枝点，枝条停在钉缘
      position: { x: p.x - NODE_W / 2, y: p.y - PIN },
      // 同营地节点：声明初始尺寸供 MiniMap 的 nodeHasDimensions 回退链命中
      initialWidth: NODE_W,
      initialHeight: NODE_H,
      data: { wf: n, rank: ranks.get(n.id) ?? 0 },
    };
  });

  const reached = (s: string) => s === "done" || s === "in-progress" || s === "blocked" || s === "dropped";

  // 步道 = 主亲枝（DFS 顺序）；走过与否看父节点是否已到达
  const trailEdges: Edge[] = [];
  for (const [to, from] of parent) {
    const fi = trail.findIndex((n) => n.id === from);
    const ti = trail.findIndex((n) => n.id === to);
    if (fi < 0 || ti < 0) continue;
    const f = nodes.find((n) => n.id === from)!;
    trailEdges.push({
      id: `trail-${from}-${to}`,
      source: from,
      target: to,
      type: "trail",
      selectable: false,
      data: { trail: true, walked: reached(f.displayStatus) },
    });
  }
  trailEdges.sort(
    (a, b) => trail.findIndex((n) => n.id === a.source) - trail.findIndex((n) => n.id === b.source),
  );

  // 跨枝依赖：淡色虚线，退为背景纹理
  const primary = new Set([...parent.entries()].map(([to, from]) => `${from}->${to}`));
  const rfEdges: Edge[] = candidates
    .filter((e) => !primary.has(`${e.from}->${e.to}`))
    .map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      style: { stroke: EDGE_COLOR, strokeWidth: 1.4, opacity: 0.55, strokeDasharray: "5 5" },
      markerEnd: { type: MarkerType.ArrowClosed, width: 11, height: 11, color: EDGE_COLOR },
    }));
  return {
    nodes: [...campNodes, ...rfNodes],
    edges: [...trailEdges, ...rfEdges],
    trailIds: trail.map((n) => n.id),
  };
}

/** 步道线（思维导图枝条）：已行走 = 橙色实线（纸色 halo 衬底），
 *  未行走 = 淡色圆点虚线。S 形曲线连接父子钉心。 */
function TrailEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const walked = (data as { walked?: boolean } | undefined)?.walked;
  const dx = Math.max(targetX - sourceX, 60);
  const d = `M ${sourceX},${sourceY} C ${sourceX + dx * 0.55},${sourceY} ${targetX - dx * 0.45},${targetY} ${targetX},${targetY}`;
  return (
    <>
      {walked && <path d={d} className="trail-halo" />}
      <path d={d} className={walked ? "trail-walked" : "trail-path"} />
    </>
  );
}

const edgeTypes = { trail: TrailEdge };

function Legend() {
  const items: [string, string][] = [
    ["done", "已完成"],
    ["in-progress", "进行中"],
    ["planned", "未开始"],
    ["blocked", "受阻"],
    ["warn", "警示"],
  ];
  return (
    <Panel position="top-right">
      <div className="legend" aria-hidden="true">
        {items.map(([st, label]) => (
          <span key={st} className={`legend-item st-${st}`}>
            <i className="legend-dot" />
            {label}
          </span>
        ))}
        <span className="legend-item">◆ 里程碑</span>
        <span className="legend-item">◇ 任务</span>
        <span className="legend-item">
          <i className="legend-trail" />
          步道
        </span>
      </div>
    </Panel>
  );
}

/** 视口暂存 key：按页面路径隔离（file:// 多项目互不干扰）。 */
const VIEWPORT_KEY = `waymark.viewport:${typeof window !== "undefined" ? window.location.pathname : ""}`;

/** 视口同步（须挂在 <ReactFlow> 内）：
 *  画布内容（节点/边集合）变化时防抖重 fit；选中屏外节点时平滑移入视野。 */
function ViewportSync({
  selectedId,
  fp,
  hasNodes,
  wrapRef,
}: {
  selectedId: string | null;
  fp: string;
  hasNodes: boolean;
  wrapRef: React.RefObject<HTMLDivElement | null>;
}) {
  const rf = useReactFlow();
  const prevFp = useRef(fp);

  // 筛选/切换迭代后重新 fit（防抖 350ms：避免搜索逐字输入时连续缩放）
  useEffect(() => {
    if (prevFp.current === fp) return;
    prevFp.current = fp;
    if (!hasNodes) return;
    const timer = window.setTimeout(() => {
      void rf.fitView({ padding: 0.15, duration: 250 });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [fp, hasNodes, rf]);

  // 选中变化时：节点在视野外（或被详情面板遮住）才平滑移入，已在视野内则不动
  useEffect(() => {
    if (!selectedId) return;
    const wrap = wrapRef.current;
    const node = rf.getNode(selectedId);
    if (!wrap || !node) return;
    const { x: vx, y: vy, zoom } = rf.getViewport();
    const w = node.measured?.width ?? NODE_W;
    const h = node.measured?.height ?? NODE_H;
    const cx = node.position.x + w / 2;
    const cy = node.position.y + h / 2;
    const rect = wrap.getBoundingClientRect();
    // 详情面板占位：宽屏右侧抽屉 420px，窄屏底部 72vh 图纸抽屉（与 styles.css 对齐）
    const wide = rect.width > 720;
    const M = 56;
    const safe = {
      x0: M,
      y0: M,
      x1: rect.width - (wide ? 420 : 0) - M,
      y1: rect.height - (wide ? 0 : rect.height * 0.72) - M,
    };
    const sx = cx * zoom + vx;
    const sy = cy * zoom + vy;
    if (sx >= safe.x0 && sx <= safe.x1 && sy >= safe.y0 && sy <= safe.y1) return;
    void rf.setViewport(
      { x: (safe.x0 + safe.x1) / 2 - cx * zoom, y: (safe.y0 + safe.y1) / 2 - cy * zoom, zoom },
      { duration: 300 },
    );
  }, [selectedId, rf, wrapRef]);

  return null;
}

export default function FlowView({
  nodes,
  edges,
  iterations,
  selectedId,
  readyIds,
  onSelect,
  onTrailChange,
}: {
  nodes: WorkflowNode[];
  edges: { from: string; to: string }[];
  iterations: { id: string; title: string }[];
  selectedId: string | null;
  readyIds: Set<string>;
  onSelect: (id: string) => void;
  /** 布局完成后回报旅程顺序（步道键盘导航用） */
  onTrailChange?: (trailIds: string[]) => void;
}) {
  const {
    nodes: rfNodes,
    edges: rfEdges,
    trailIds,
  } = useMemo(() => {
    const laid = layout(nodes, edges, iterations);
    // 依赖高亮：选中节点的出入边加强，其余淡化；步道线恒常显示
    const styled = laid.edges.map((e) => {
      if ((e.data as { trail?: boolean } | undefined)?.trail) return e;
      const connected = selectedId !== null && (e.source === selectedId || e.target === selectedId);
      return {
        ...e,
        style: {
          stroke: connected ? EDGE_HIT : EDGE_COLOR,
          strokeWidth: connected ? 2.25 : 1.75,
          opacity: selectedId === null || connected ? 1 : 0.3,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 15,
          height: 15,
          color: connected ? EDGE_HIT : EDGE_COLOR,
        },
      } as Edge;
    });
    // 把 onSelect/ready 注入节点数据（键盘/点击都能打开详情）
    // 同步 RF selected：受控用法内部选择态不更新，搜索/键盘/点击选中的高亮全靠这里回注
    const withSelect = laid.nodes.map((n) => ({
      ...n,
      selected: n.id === selectedId,
      data: { ...n.data, ready: readyIds.has(n.id), onSelect } as Record<string, unknown>,
    }));
    return { nodes: withSelect, edges: styled, trailIds: laid.trailIds };
  }, [nodes, edges, iterations, selectedId, readyIds, onSelect]);

  // 布局变化（筛选/数据更新）后同步旅程顺序给父组件
  useEffect(() => {
    onTrailChange?.(trailIds);
  }, [trailIds, onTrailChange]);

  // 首帧提交后标记：之后挂载的节点不再播入场动画
  useEffect(() => {
    entrancePlayed = true;
  }, []);

  const wrapRef = useRef<HTMLDivElement>(null);

  // 画布内容指纹（节点 + 依赖边集合）：内容变了才重 fit，也用于视口恢复校验
  const fp = useMemo(
    () =>
      `${nodes
        .map((n) => n.id)
        .sort()
        .join(",")}#${edges
        .map((e) => `${e.from}>${e.to}`)
        .sort()
        .join(",")}`,
    [nodes, edges],
  );

  // 整页 reload（SSE / 操作兜底）后恢复视口；指纹不符（数据已变）则退回 fitView。只读首帧
  const savedViewport = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(VIEWPORT_KEY);
      if (!raw) return undefined;
      const v = JSON.parse(raw) as { fp?: unknown; x?: unknown; y?: unknown; zoom?: unknown };
      if (v.fp !== fp) return undefined;
      if (typeof v.x !== "number" || typeof v.y !== "number" || typeof v.zoom !== "number") return undefined;
      return { x: v.x, y: v.y, zoom: v.zoom };
    } catch {
      return undefined;
    }
  }, []);

  return (
    <div className="flow" ref={wrapRef}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView={!savedViewport}
        defaultViewport={savedViewport}
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelect(n.id)}
        onMoveEnd={(_, vp) => {
          try {
            sessionStorage.setItem(VIEWPORT_KEY, JSON.stringify({ fp, ...vp }));
          } catch {
            /* 存储不可用时静默 */
          }
        }}
      >
        <Controls showInteractive={false} />
        {nodes.length > 10 && (
          <MiniMap
            ariaLabel="画布缩略图"
            bgColor="#F7F2E4"
            className="trail-minimap"
            maskColor="rgba(242, 236, 221, 0.62)"
            maskStrokeColor="#B4AC97"
            maskStrokeWidth={1}
            nodeBorderRadius={2.5}
            nodeColor={(n) => {
              const wf = (n.data as { wf?: WorkflowNode }).wf;
              return wf ? (MINIMAP_COLOR[wf.displayStatus] ?? "#8A8272") : "transparent";
            }}
            nodeStrokeColor="transparent"
            pannable
            position="bottom-left"
            style={{ left: 48 }}
            zoomable
          />
        )}
        <Legend />
        <ViewportSync selectedId={selectedId} fp={fp} hasNodes={rfNodes.length > 0} wrapRef={wrapRef} />
      </ReactFlow>
      <Compass />
    </div>
  );
}
