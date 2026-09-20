import React, { useEffect, useState } from "react";
import type { WorkflowJson, WorkflowNode } from "../../src/types";
import FlowView from "./FlowView";
import DetailPanel from "./DetailPanel";

declare global {
  interface Window { __PLANFLOW_DATA__?: WorkflowJson }
}

const wf = window.__PLANFLOW_DATA__;

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
      <div className="empty-sub">在项目根运行 planflow sync 后刷新</div>
    </div>
  );
}

const BASE_CHIPS: { key: "done" | "inProgress" | "planned"; label: string; st: string }[] = [
  { key: "done", label: "完成", st: "st-done" },
  { key: "inProgress", label: "进行中", st: "st-in-progress" },
  { key: "planned", label: "未开始", st: "st-planned" },
];

export default function App() {
  const [tab, setTab] = useState<string>("__all__");
  const [selected, setSelected] = useState<string | null>(null);

  if (!wf) {
    return <EmptyState />;
  }

  const visible: WorkflowNode[] = wf.nodes.filter(n => tab === "__all__" || n.iteration === tab);
  const visibleIds = new Set(visible.map(n => n.id));
  const edges = wf.edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to));
  const node = wf.nodes.find(n => n.id === selected) ?? null;
  const errors = (wf.issues ?? []).filter(i => i.level === "error");
  const percent = wf.stats.total > 0 ? Math.round((wf.stats.done / wf.stats.total) * 100) : 0;

  return (
    <div className="app">
      {errors.length > 0 && (
        <div className="issue-strip">
          <b>{errors.length} 个规范错误</b>（运行 planflow check 查看），如：{errors[0].message}
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          <ProgressRing percent={percent} />
          <div className="brand-text">
            <div className="brand-line1">
              <span className="brand-name">{wf.project}</span>
              <span className="brand-sub">进度工作流</span>
            </div>
            <div className="brand-line2">{wf.stats.done} / {wf.stats.total} 完成</div>
          </div>
        </div>
        <div className="chips">
          {BASE_CHIPS.map(c => (
            <span key={c.key} className={`chip ${c.st}`}>
              <i className="chip-dot" />
              <span className="chip-label">{c.label}</span>
              <span className="chip-num">{wf.stats[c.key]}</span>
            </span>
          ))}
          {wf.stats.blocked > 0 && (
            <span className="chip st-blocked">
              <i className="chip-dot" />
              <span className="chip-label">受阻</span>
              <span className="chip-num">{wf.stats.blocked}</span>
            </span>
          )}
          {wf.stats.warnings > 0 && (
            <span className="chip st-warn">
              <i className="chip-dot" />
              <span className="chip-label">警示</span>
              <span className="chip-num">{wf.stats.warnings}</span>
            </span>
          )}
        </div>
        <nav className="segments">
          <button className={tab === "__all__" ? "segment active" : "segment"} onClick={() => setTab("__all__")}>
            全部
          </button>
          {wf.iterations.map(it => (
            <button
              key={it.id}
              className={tab === it.id ? "segment active" : "segment"}
              title={it.goal ?? ""}
              onClick={() => setTab(it.id)}
            >
              {it.id} {it.title}
            </button>
          ))}
        </nav>
      </header>
      <FlowView nodes={visible} edges={edges} onSelect={setSelected} />
      {node && <DetailPanel node={node} onClose={() => setSelected(null)} />}
    </div>
  );
}
