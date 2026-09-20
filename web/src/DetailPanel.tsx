import React from "react";
import type { WorkflowNode } from "../../src/types";
import { STATUS_LABEL } from "./FlowView";

const KIND_LABEL: Record<string, string> = {
  paths: "文件路径", grep: "代码特征", tests: "测试", git: "提交记录",
};

const WARNING_TEXT: Record<string, string> = {
  "evidence-insufficient": "声明为完成，但证据核验未达标——补充 evidence 或复核状态。",
  "ready-to-complete": "证据已齐备，可将状态更新为 done。",
  cycle: "该节点处于循环依赖中，依赖关系需要修复。",
};

/** 区块模式：eyebrow 标签 + 延伸 hairline */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="sec">
      <div className="sec-head">
        <span className="sec-label">{label}</span>
        <span className="sec-rule" />
      </div>
      {children}
    </section>
  );
}

export default function DetailPanel({ node, onClose }: { node: WorkflowNode; onClose: () => void }) {
  const warnings: string[] = [];
  if (node.warning) warnings.push(WARNING_TEXT[node.warning]);
  if (node.cycle) warnings.push(WARNING_TEXT.cycle);
  const conf = Math.round((node.confidence ?? 0) * 100);

  return (
    <aside className="detail">
      <button className="close" onClick={onClose} aria-label="关闭详情">✕</button>

      <div className="detail-eyebrow">{node.type === "milestone" ? "MILESTONE" : "TASK"}</div>
      <h2 className="detail-title">{node.title}</h2>
      <span className="detail-id">{node.id}</span>

      <div className="detail-status">
        <span className={`pill st-${node.displayStatus}`}>
          <i className="pill-dot" />
          {STATUS_LABEL[node.displayStatus]}
        </span>
        {node.inferredStatus && (
          <span className="inferred">
            推断 {STATUS_LABEL[node.inferredStatus]} · 置信 {conf}%
            <span className="conf-track"><span className="conf-fill" style={{ width: `${conf}%` }} /></span>
          </span>
        )}
      </div>

      {warnings.map((w, i) => (
        <div key={i} className="warn-callout">{w}</div>
      ))}

      {node.acceptance.length > 0 && (
        <Section label="验收标准">
          {node.acceptance.map((a, i) => (
            <div key={i} className={`acc-row${a.done ? " done" : ""}`}>
              <span className="cbx" aria-hidden="true">
                {a.done && (
                  <svg viewBox="0 0 10 8"><path d="M1 4.2 3.6 6.8 9 1.2" /></svg>
                )}
              </span>
              <span className="acc-text">{a.text}</span>
            </div>
          ))}
        </Section>
      )}

      {node.evidenceReport.length > 0 && (
        <Section label="证据核验">
          {node.evidenceReport.map((e, i) => (
            <div key={i} className="evi-row">
              <span className={`evi-glyph ${e.skipped ? "skip" : e.ok ? "ok" : "bad"}`} aria-hidden="true">
                {e.skipped ? "○" : e.ok ? "✓" : "✗"}
              </span>
              <div className="evi-body">
                <div className="evi-kind">{KIND_LABEL[e.kind]}</div>
                <div className="evi-detail">{e.detail}</div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {node.commits.length > 0 && (
        <Section label="关联提交">
          <div className="timeline">
            {node.commits.map(c => (
              <div key={c.hash} className="tl-item">
                <div className="tl-head">
                  <code className="hash">{c.hash}</code>
                  <span className="tl-date">{c.date}</span>
                </div>
                <div className="tl-msg" title={c.message}>{c.message}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {node.completionLog.length > 0 && (
        <Section label="完成记录">
          <div className="timeline">
            {node.completionLog.map((l, i) => (
              <div key={i} className="tl-item">
                <div className="log-date">{l.date}</div>
                <div className="log-text">{l.text}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {node.description && (
        <Section label="需求描述">
          <div className="desc">{node.description}</div>
        </Section>
      )}

      <p className="src-file">源文件: {node.file}</p>
    </aside>
  );
}
