import React from "react";
import type { WorkflowNode } from "../../src/types";
import { STATUS_LABEL } from "./FlowView";

const KIND_LABEL: Record<string, string> = {
  paths: "文件路径", grep: "代码特征", tests: "测试", git: "提交记录",
};

export default function DetailPanel({ node, onClose }: { node: WorkflowNode; onClose: () => void }) {
  return (
    <aside className="detail">
      <button className="close" onClick={onClose} aria-label="关闭">×</button>
      <h2>{node.title} <small>{node.id}</small></h2>
      <div className="detail-status">
        <span className={`pill s-${node.displayStatus}`}>{STATUS_LABEL[node.displayStatus]}</span>
        {node.warning === "evidence-insufficient" && <span className="pill warn">⚠ 声明完成但证据不足</span>}
        {node.warning === "ready-to-complete" && <span className="pill hint">💡 证据已齐，可标记完成</span>}
        {node.inferredStatus && (
          <span className="muted">
            推断: {STATUS_LABEL[node.inferredStatus]} · 置信 {Math.round(node.confidence * 100)}%
          </span>
        )}
      </div>
      {node.acceptance.length > 0 && (
        <>
          <h3>验收标准</h3>
          <ul className="acc-list">
            {node.acceptance.map((a, i) => (
              <li key={i} className={a.done ? "done" : ""}>{a.done ? "☑" : "☐"} {a.text}</li>
            ))}
          </ul>
        </>
      )}
      {node.evidenceReport.length > 0 && (
        <>
          <h3>证据核验</h3>
          <ul className="evi-list">
            {node.evidenceReport.map((e, i) => (
              <li key={i}>
                <span>{e.skipped ? "○" : e.ok ? "✓" : "✗"} {KIND_LABEL[e.kind]}</span>{" "}
                <small>{e.detail}</small>
              </li>
            ))}
          </ul>
        </>
      )}
      {node.commits.length > 0 && (
        <>
          <h3>关联提交</h3>
          <ul className="commit-list">
            {node.commits.map(c => (
              <li key={c.hash}><code>{c.hash}</code> {c.date} {c.message}</li>
            ))}
          </ul>
        </>
      )}
      {node.completionLog.length > 0 && (
        <>
          <h3>完成记录</h3>
          <ul>
            {node.completionLog.map((l, i) => <li key={i}><b>{l.date}</b> {l.text}</li>)}
          </ul>
        </>
      )}
      {node.description && (
        <>
          <h3>需求描述</h3>
          <pre className="desc">{node.description}</pre>
        </>
      )}
      <p className="muted file">源文件: {node.file}</p>
    </aside>
  );
}
