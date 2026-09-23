import React, { useEffect, useRef, useState } from "react";
import type { WorkflowNode } from "../../src/types";
import { STATUS_LABEL } from "./FlowView";

const KIND_LABEL: Record<string, string> = {
  paths: "文件路径", grep: "代码特征", tests: "测试", git: "提交记录",
};

const WARNING_TEXT: Record<string, string> = {
  "evidence-insufficient": "声明为完成，但证据核验未达标——补充 evidence 或复核状态。",
  "ready-to-complete": "证据已齐备，可将状态更新为 done。",
  stalled: "声明为进行中，但证据核验为零——确认是否真的开工，或补充 evidence 声明。",
  cycle: "该节点处于循环依赖中，依赖关系需要修复。",
};

/** file:// 打开的静态页面没有本地服务，写操作按钮不渲染。 */
const CAN_MUTATE = typeof window !== "undefined" && window.location.protocol !== "file:";

const COMMIT_PREVIEW = 5;

interface Related {
  upstream: WorkflowNode[];
  downstream: WorkflowNode[];
}

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

/** 依赖关系 chips：点击跳转到该节点 */
function DepChips({ nodes, emptyText, onSelect }: {
  nodes: WorkflowNode[];
  emptyText: string;
  onSelect: (id: string) => void;
}) {
  if (nodes.length === 0) {
    return <div className="dep-empty">{emptyText}</div>;
  }
  return (
    <div className="dep-chips">
      {nodes.map(n => (
        <button key={n.id} className="dep-chip" title={n.title} onClick={() => onSelect(n.id)}>
          <span className="dep-dot" aria-hidden="true" />
          <span className="dep-name">{n.title}</span>
          <code className="dep-id">{n.id}</code>
        </button>
      ))}
    </div>
  );
}

export default function DetailPanel({ node, related, isReady, onSelect, onClose }: {
  node: WorkflowNode;
  related: Related | null;
  isReady: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const [showAllCommits, setShowAllCommits] = useState(false);
  const [busy, setBusy] = useState<null | "start" | "done" | "block" | "drop" | "reopen">(null);
  const [accAll, setAccAll] = useState(false);
  const [note, setNote] = useState("");
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // dialog 语义：接管焦点、Esc 关闭、关闭后归还焦点
  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prevFocus.current?.focus?.();
    };
  }, [onClose]);

  /** 调本地 ui 服务的写接口（与 CLI/MCP 同一引擎）；成功后由 SSE 推流刷新，定时器兜底。 */
  async function act(kind: "start" | "done" | "block" | "drop" | "reopen") {
    if (busy) return;
    setBusy(kind);
    setActionMsg(null);
    try {
      const resp = await fetch(`/api/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-waymark": "ui" },
        body: JSON.stringify(kind === "done"
          ? { id: node.id, allAcceptance: accAll, note: note.trim() || undefined }
          : { id: node.id }),
      });
      const data = await resp.json().catch(() => null) as { ok?: boolean; error?: string; warnings?: string[] } | null;
      if (!resp.ok || !data?.ok) {
        setActionMsg({ ok: false, text: data?.error ?? `请求失败（${resp.status}）` });
        setBusy(null);
        return;
      }
      const warns = data.warnings ?? [];
      const verb = {
        start: "开工", done: "标记完成",
        block: "标记受阻", drop: "放弃", reopen: "重新打开",
      }[kind];
      setActionMsg({ ok: true, text: warns.length ? `已${verb}。注意：${warns.join("；")}` : `已${verb}` });
      // SSE 推流通常先到，这里定时器兜底；刷新前打标记，避免与 SSE 触发的 reload 叠加
      setTimeout(() => {
        try { sessionStorage.setItem("waymark.reloadedAt", String(Date.now())); } catch { /* 忽略 */ }
        window.location.reload();
      }, 1500);
    } catch {
      setActionMsg({ ok: false, text: "网络错误——此页面可能不是 waymark ui 服务提供的，操作未生效" });
      setBusy(null);
    }
  }

  const warnings: string[] = [];
  if (node.warning) warnings.push(WARNING_TEXT[node.warning]);
  if (node.cycle) warnings.push(WARNING_TEXT.cycle);
  const conf = Math.round((node.confidence ?? 0) * 100);
  const commits = showAllCommits ? node.commits : node.commits.slice(0, COMMIT_PREVIEW);
  const hasDeps = related && (related.upstream.length > 0 || related.downstream.length > 0);

  return (
    <aside
      ref={panelRef}
      className="detail"
      role="dialog"
      aria-modal="false"
      aria-labelledby="detail-title"
      tabIndex={-1}
    >
      <button className="close" onClick={onClose} aria-label="关闭详情">✕</button>

      <div className="detail-eyebrow">{node.type === "milestone" ? "MILESTONE" : "TASK"}</div>
      <h2 className="detail-title" id="detail-title">{node.title}</h2>
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

      {CAN_MUTATE && (
        <div className="act-row">
          {node.declaredStatus === "planned" && (
            <button className="act-btn primary" disabled={busy !== null} onClick={() => act("start")}>
              {busy === "start" ? "提交中…" : "认领开工"}
            </button>
          )}
          {(node.declaredStatus === "planned" || node.declaredStatus === "in-progress"
            || node.declaredStatus === "blocked") && (
            <button className="act-btn" disabled={busy !== null} onClick={() => act("done")}>
              {busy === "done" ? "提交中…" : "标记完成"}
            </button>
          )}
          {(node.declaredStatus === "done" || node.declaredStatus === "blocked"
            || node.declaredStatus === "dropped") && (
            <button className="act-btn" disabled={busy !== null} onClick={() => act("reopen")}>
              {busy === "reopen" ? "提交中…" : "重新打开"}
            </button>
          )}
          {(node.declaredStatus === "planned" || node.declaredStatus === "in-progress") && (
            <button
              className="act-btn subtle"
              title="标记为受阻（旁路状态，解除后可重新打开）"
              disabled={busy !== null} onClick={() => act("block")}
            >
              {busy === "block" ? "提交中…" : "受阻"}
            </button>
          )}
          {(node.declaredStatus === "planned" || node.declaredStatus === "in-progress"
            || node.declaredStatus === "blocked") && (
            <button
              className="act-btn subtle danger"
              title="放弃该节点（dropped 旁路状态，不再计入待办）"
              disabled={busy !== null} onClick={() => act("drop")}
            >
              {busy === "drop" ? "提交中…" : "放弃"}
            </button>
          )}
          {(node.declaredStatus === "planned" || node.declaredStatus === "in-progress") && (
            <>
              <label className="act-acc">
                <input type="checkbox" checked={accAll} onChange={e => setAccAll(e.target.checked)} />
                同时勾选全部验收
              </label>
              <input
                className="act-note"
                type="text"
                placeholder="完成说明（写入「完成记录」，可留空）"
                aria-label="完成说明"
                maxLength={200}
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </>
          )}
        </div>
      )}

      {actionMsg && (
        <div className={`warn-callout${actionMsg.ok ? " ready" : " bad"}`} role="status">{actionMsg.text}</div>
      )}

      {isReady && node.displayStatus === "planned" && (
        <div className="warn-callout ready">依赖已满足，可以开工——点击上方「认领开工」直接开始。</div>
      )}

      {warnings.map((w, i) => (
        <div key={i} className="warn-callout">{w}</div>
      ))}

      {hasDeps && (
        <Section label="依赖关系">
          {related!.upstream.length > 0 && (
            <>
              <div className="dep-label">前置节点</div>
              <DepChips nodes={related!.upstream} emptyText="" onSelect={onSelect} />
            </>
          )}
          {related!.downstream.length > 0 && (
            <>
              <div className="dep-label">下游节点</div>
              <DepChips nodes={related!.downstream} emptyText="" onSelect={onSelect} />
            </>
          )}
        </Section>
      )}

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
        <Section label={`关联提交 · ${node.commits.length}`}>
          <div className="timeline">
            {commits.map(c => (
              <div key={c.hash} className="tl-item">
                <div className="tl-head">
                  <code className="hash">{c.hash}</code>
                  <span className="tl-date">{c.date}</span>
                </div>
                <div className="tl-msg" title={c.message}>{c.message}</div>
              </div>
            ))}
          </div>
          {node.commits.length > COMMIT_PREVIEW && (
            <button className="expand-btn" onClick={() => setShowAllCommits(v => !v)}>
              {showAllCommits ? "收起" : `展开全部 ${node.commits.length} 条提交`}
            </button>
          )}
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
