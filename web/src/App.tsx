import React, { useState } from "react";
import type { WorkflowJson, WorkflowNode } from "../../src/types";
import FlowView from "./FlowView";
import DetailPanel from "./DetailPanel";

declare global {
  interface Window { __PLANFLOW_DATA__?: WorkflowJson }
}

const wf = window.__PLANFLOW_DATA__;

export default function App() {
  const [tab, setTab] = useState<string>("__all__");
  const [selected, setSelected] = useState<string | null>(null);

  if (!wf) {
    return <div className="empty">缺少数据：请先在项目根运行 planflow sync 后重新打开。</div>;
  }

  const visible: WorkflowNode[] = wf.nodes.filter(n => tab === "__all__" || n.iteration === tab);
  const visibleIds = new Set(visible.map(n => n.id));
  const edges = wf.edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to));
  const node = wf.nodes.find(n => n.id === selected) ?? null;
  const errors = (wf.issues ?? []).filter(i => i.level === "error");

  return (
    <div className="app">
      {errors.length > 0 && (
        <div className="issue-strip">
          ✖ {errors.length} 个规范错误（运行 planflow check 查看），如：{errors[0].message}
        </div>
      )}
      <header className="topbar">
        <h1>{wf.project} · 进度工作流</h1>
        <div className="stats">
          <span>共 {wf.stats.total}</span>
          <span className="s-done">完成 {wf.stats.done}</span>
          <span className="s-wip">进行中 {wf.stats.inProgress}</span>
          <span>未开始 {wf.stats.planned}</span>
          {wf.stats.blocked > 0 && <span className="s-blocked">受阻 {wf.stats.blocked}</span>}
          <span className="s-warn">警示 {wf.stats.warnings}</span>
        </div>
        <nav className="tabs">
          <button className={tab === "__all__" ? "active" : ""} onClick={() => setTab("__all__")}>全部</button>
          {wf.iterations.map(it => (
            <button
              key={it.id}
              className={tab === it.id ? "active" : ""}
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
