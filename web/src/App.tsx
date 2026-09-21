import React, { useEffect, useMemo, useState } from "react";
import type { WorkflowJson, WorkflowNode } from "../../src/types";
import FlowView from "./FlowView";
import DetailPanel from "./DetailPanel";

declare global {
  interface Window { __WAYMARK_DATA__?: WorkflowJson }
}

const wf = window.__WAYMARK_DATA__;

/** 进度环：轨道 var(--line)，进度弧 var(--accent)，加载时 400ms 画出（respect prefers-reduced-motion）。 */
function ProgressRing({ percent }: { percent: number }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const R = 21;
  const C = 2 * Math.PI * R;
  const arc = (Math.max(0, Math.min(100, percent)) / 100) * C;
  return (
    <svg className="ring" width="46" height="46" viewBox="0 0 46 46" role="img" aria-label={`总进度 ${percent}%`}>
      <circle className="ring-track" cx="23" cy="23" r={R} />
      <circle
        className="ring-arc"
        cx="23" cy="23" r={R}
        transform="rotate(-90 23 23)"
        strokeDasharray={`${arc} ${C}`}
        strokeDashoffset={drawn ? 0 : arc}
      />
      <text className="ring-num" x="23" y="23">{percent}</text>
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
        <circle
          cx="36" cy="36" r="26" fill="none"
          stroke="#DFE4EA" strokeWidth="3" strokeLinecap="round" strokeDasharray="5.5 8"
        />
      </svg>
      <div className="empty-title">还没有工作流数据</div>
      <div className="empty-sub">在项目根运行 waymark sync 后刷新</div>
    </div>
  );
}

/** 相对时间（生成数据新鲜度展示用）。 */
function relTime(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return `${Math.floor(d / 30)} 个月前`;
}

const STALE_DAYS = 7;

interface HashState { tab: string | null; node: string | null; q: string; st: string | null }

function parseHash(): HashState {
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return { tab: h.get("iter"), node: h.get("node"), q: h.get("q") ?? "", st: h.get("st") };
}

/** 依赖层数：最长路径深度（环上节点按已访问深度计）。 */
function countLayers(nodes: WorkflowNode[], edges: { from: string; to: string }[]): number {
  if (nodes.length === 0) return 0;
  const ids = new Set(nodes.map(n => n.id));
  const depth = new Map(nodes.map(n => [n.id, 0]));
  const indeg = new Map(nodes.map(n => [n.id, 0]));
  const dependents = new Map(nodes.map(n => [n.id, []]));
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    dependents.get(e.from)!.push(e.to);
  }
  const queue = nodes.filter(n => indeg.get(n.id) === 0).map(n => n.id);
  let maxDepth = 0;
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id) ?? 0;
    if (d > maxDepth) maxDepth = d;
    for (const next of dependents.get(id)!) {
      if (d + 1 > (depth.get(next) ?? 0)) depth.set(next, d + 1);
      const left = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, left);
      if (left === 0) queue.push(next);
    }
  }
  return maxDepth + 1;
}

interface ChipDef { key: string; label: string; st: string; count: number }

export default function App() {
  const initial = useMemo(parseHash, []);
  const [tab, setTab] = useState<string>(initial.tab ?? "__all__");
  const [selected, setSelected] = useState<string | null>(initial.node);
  const [query, setQuery] = useState<string>(initial.q);
  const [statusFilter, setStatusFilter] = useState<string | null>(initial.st);

  // 状态 → hash（replaceState，不产生历史记录；外部 hash 变化通过 hashchange 回流）
  useEffect(() => {
    const p = new URLSearchParams();
    if (tab !== "__all__") p.set("iter", tab);
    if (selected) p.set("node", selected);
    if (query) p.set("q", query);
    if (statusFilter) p.set("st", statusFilter);
    const s = p.toString();
    if (`#${s}` !== window.location.hash) {
      history.replaceState(null, "", s ? `#${s}` : window.location.pathname + window.location.search);
    }
  }, [tab, selected, query, statusFilter]);

  useEffect(() => {
    const onHash = () => {
      const h = parseHash();
      setTab(h.tab ?? "__all__");
      setSelected(h.node);
      setQuery(h.q);
      setStatusFilter(h.st);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (!wf) {
    return <EmptyState />;
  }

  // 迭代 scope（统计按 scope 联动；筛选只作用于画布）
  const scopeNodes: WorkflowNode[] = wf.nodes.filter(n => tab === "__all__" || n.iteration === tab);
  const scopeStats = {
    total: scopeNodes.length,
    done: scopeNodes.filter(n => n.displayStatus === "done").length,
    inProgress: scopeNodes.filter(n => n.displayStatus === "in-progress").length,
    planned: scopeNodes.filter(n => n.displayStatus === "planned").length,
    blocked: scopeNodes.filter(n => n.displayStatus === "blocked").length,
    warnings: scopeNodes.filter(n => n.warning !== null).length,
  };
  const percent = scopeStats.total > 0 ? Math.round((scopeStats.done / scopeStats.total) * 100) : 0;

  const q = query.trim().toLowerCase();
  const visible: WorkflowNode[] = scopeNodes.filter(n =>
    (!statusFilter || n.displayStatus === statusFilter) &&
    (!q || n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)),
  );
  const visibleIds = new Set(visible.map(n => n.id));
  const edges = wf.edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to));

  const node = wf.nodes.find(n => n.id === selected) ?? null;
  const errors = (wf.issues ?? []).filter(i => i.level === "error");
  const layers = countLayers(wf.nodes, wf.edges);
  const related = node ? {
    upstream: wf.nodes.filter(n => node.deps.includes(n.id)),
    downstream: wf.nodes.filter(n => n.deps.includes(node.id)),
  } : null;

  const genText = relTime(wf.generatedAt);
  const staleDays = Math.floor((Date.now() - new Date(wf.generatedAt).getTime()) / 86400000);
  const firstWarning = scopeNodes.find(n => n.warning !== null);

  const chips: ChipDef[] = [
    { key: "done", label: "完成", st: "st-done", count: scopeStats.done },
    { key: "in-progress", label: "进行中", st: "st-in-progress", count: scopeStats.inProgress },
    { key: "planned", label: "未开始", st: "st-planned", count: scopeStats.planned },
    ...(scopeStats.blocked > 0
      ? [{ key: "blocked", label: "受阻", st: "st-blocked", count: scopeStats.blocked }]
      : []),
  ];

  const toggleStatus = (st: string) => setStatusFilter(cur => (cur === st ? null : st));

  return (
    <main className="app">
      {errors.length > 0 && (
        <div className="issue-strip" role="alert">
          <b>{errors.length} 个规范错误</b>（运行 waymark check 查看），如：{errors[0].message}
        </div>
      )}
      {staleDays >= STALE_DAYS && (
        <div className="stale-strip">
          数据生成于 {genText}，可能已过期——运行 <code>waymark sync</code> 更新后再刷新本页。
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          <ProgressRing percent={percent} />
          <div className="brand-text">
            <h1 className="brand-line1">
              <span className="brand-name">{wf.project}</span>
              <span className="brand-sub">进度工作流</span>
            </h1>
            <div className="brand-line2">
              {scopeStats.done} / {scopeStats.total} 完成
              <span className="brand-sep">·</span>{wf.stats.total} 节点
              <span className="brand-sep">·</span>{wf.edges.length} 依赖
              <span className="brand-sep">·</span>{layers} 层
              {genText && (
                <>
                  <span className="brand-sep">·</span>生成于 {genText}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="chips">
          {chips.map(c => (
            <button
              key={c.key}
              type="button"
              className={`chip ${c.st}${statusFilter === c.key ? " active" : ""}`}
              aria-pressed={statusFilter === c.key}
              title={`只看「${c.label}」节点`}
              onClick={() => toggleStatus(c.key)}
            >
              <i className="chip-dot" />
              <span className="chip-label">{c.label}</span>
              <span className="chip-num">{c.count}</span>
            </button>
          ))}
          {scopeStats.warnings > 0 && (
            <button
              type="button"
              className="chip st-warn"
              title="定位到第一个警示节点"
              onClick={() => firstWarning && setSelected(firstWarning.id)}
            >
              <i className="chip-dot" />
              <span className="chip-label">警示</span>
              <span className="chip-num">{scopeStats.warnings}</span>
            </button>
          )}
        </div>
        <input
          className="search"
          type="search"
          placeholder="搜索节点…"
          aria-label="搜索节点"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <nav className="segments">
          <button className={tab === "__all__" ? "segment active" : "segment"} onClick={() => setTab("__all__")}>
            全部
          </button>
          {wf.iterations.map(it => (
            <button
              key={it.id}
              className={tab === it.id ? "segment active" : "segment"}
              title={[it.goal, it.window].filter(Boolean).join(" · ")}
              onClick={() => setTab(it.id)}
            >
              {it.id} {it.title}
            </button>
          ))}
        </nav>
      </header>
      <div className="flow-wrap">
        <FlowView nodes={visible} edges={edges} selectedId={selected} onSelect={setSelected} />
        {visible.length === 0 && (
          <div className="flow-empty">
            没有匹配的节点
            {(statusFilter || q) && (
              <button
                type="button"
                className="flow-empty-clear"
                onClick={() => { setStatusFilter(null); setQuery(""); }}
              >
                清除筛选
              </button>
            )}
          </div>
        )}
      </div>
      {node && (
        <DetailPanel
          key={node.id}
          node={node}
          related={related}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
