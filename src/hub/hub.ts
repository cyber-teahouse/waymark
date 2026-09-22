import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

export interface HubEntry {
  dir: string;      // 项目根（绝对路径）
  name: string;     // 项目名（workflow.project，缺省用目录名）
  found: boolean;   // .waymark/workflow.json 是否可读
  error?: string;   // 未同步/解析失败说明
  stats?: {
    total: number; done: number; inProgress: number;
    planned: number; blocked: number; dropped: number; warnings: number;
  };
  generatedAt?: string;
  pagePath?: string; // .waymark/index.html 绝对路径（存在才有）
}

/** 聚合页无意义的目录：隐藏目录与依赖目录直接跳过。 */
const NOISE_DIRS = new Set(["node_modules"]);

/** 按目录 glob 聚合各项目的 Waymark 数据。 */
export function gatherHubData(patterns: string[]): HubEntry[] {
  const dirs = new Set<string>();
  for (const p of patterns) {
    for (const d of fg.sync(p, { onlyDirectories: true, absolute: true, suppressErrors: true })) {
      const name = path.basename(d);
      if (name.startsWith(".") || NOISE_DIRS.has(name)) continue;
      dirs.add(d);
    }
  }
  return [...dirs].sort().map(dir => {
    const wfFile = path.join(dir, ".waymark", "workflow.json");
    const page = path.join(dir, ".waymark", "index.html");
    const hasPage = fs.existsSync(page);
    try {
      const wf = JSON.parse(fs.readFileSync(wfFile, "utf8"));
      return {
        dir,
        name: typeof wf.project === "string" && wf.project ? wf.project : path.basename(dir),
        found: true,
        stats: wf.stats,
        generatedAt: typeof wf.generatedAt === "string" ? wf.generatedAt : undefined,
        pagePath: hasPage ? page : undefined,
      } satisfies HubEntry;
    } catch (e) {
      return {
        dir,
        name: path.basename(dir),
        found: false,
        error: fs.existsSync(wfFile) ? `workflow.json 解析失败: ${(e as Error).message}` : "未生成工作流数据（在项目根运行 waymark sync）",
        pagePath: hasPage ? page : undefined,
      } satisfies HubEntry;
    }
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function relTime(iso?: string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

function ring(percent: number): string {
  const R = 20, C = 2 * Math.PI * R;
  const arc = (Math.max(0, Math.min(100, percent)) / 100) * C;
  return `<svg class="hub-ring" viewBox="0 0 46 46" aria-hidden="true">
    <circle class="hr-track" cx="23" cy="23" r="${R}"/>
    <circle class="hr-arc" cx="23" cy="23" r="${R}" transform="rotate(-90 23 23)" stroke-dasharray="${arc.toFixed(1)} ${C.toFixed(1)}"/>
    <text class="hr-num" x="23" y="23">${Math.round(percent)}</text>
  </svg>`;
}

/** 聚合页：纯静态 HTML（复用任务控制台视觉令牌），卡片链接指向各项目 index.html。 */
export function renderHubHtml(entries: HubEntry[], generatedAt: string): string {
  const STALE_DAYS = 7;
  const cards = entries.map(e => {
    const title = escapeHtml(e.name);
    if (!e.found) {
      return `<div class="hub-card hub-missing">
        <div class="hub-card-head"><h2>${title}</h2><span class="hub-tag">未同步</span></div>
        <div class="hub-missing-msg">${escapeHtml(e.error ?? "未生成工作流数据")}</div>
      </div>`;
    }
    const s = e.stats!;
    const percent = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
    const rel = relTime(e.generatedAt);
    const stale = e.generatedAt
      ? (Date.now() - new Date(e.generatedAt).getTime()) / 86400000 >= STALE_DAYS
      : false;
    const link = e.pagePath
      ? `file:///${e.pagePath.replace(/\\/g, "/").replace(/^\/+/, "")}`
      : null;
    const open = `<div class="hub-open">${link ? `<a href="${link}">打开进度页 →</a>` : `<span class="hub-no-page">未渲染页面（waymark render）</span>`}</div>`;
    return `<div class="hub-card">
      <div class="hub-card-head">${ring(percent)}
        <div><h2>${link ? `<a href="${link}">${title}</a>` : title}</h2>
        <div class="hub-sub">${s.done} / ${s.total} 完成${rel ? ` · ${rel}` : ""}${stale ? ` · <b class="hub-stale">数据已过期</b>` : ""}</div></div>
      </div>
      <div class="hub-bars">
        <div class="hub-bar"><i style="width:${s.total ? (s.done / s.total) * 100 : 0}%"></i></div>
        <div class="hub-meta">
          <span>${s.total} 节点</span><span class="c-done">完成 ${s.done}</span>
          <span class="c-wip">进行中 ${s.inProgress}</span><span>未开始 ${s.planned}</span>
          ${s.blocked > 0 ? `<span class="c-blocked">受阻 ${s.blocked}</span>` : ""}
          ${s.warnings > 0 ? `<span class="c-warn">警示 ${s.warnings}</span>` : ""}
        </div>
      </div>
      ${open}
    </div>`;
  }).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Waymark Hub · 项目总览</title>
<style>
:root{--paper:#F6F7F9;--card:#FFF;--ink:#1B2430;--ink-2:#5A6572;--ink-3:#66707D;--line:#DFE4EA;--accent:#2C55E0;--done:#0E8A5F;--wip:#2274E0;--blocked:#CE4145;--warn:#B07708;--fd:Bahnschrift,"Segoe UI","Microsoft YaHei",sans-serif;--fb:"Segoe UI","Microsoft YaHei",sans-serif;--fm:"Cascadia Code",Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--fb)}
.hub{max-width:1080px;margin:0 auto;padding:36px 24px}
.hub h1{font-size:20px;margin:0 0 4px}
.hub-sub1{color:var(--ink-3);font-size:13px;margin-bottom:28px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.hub-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;transition:box-shadow 140ms ease,transform 140ms ease}
.hub-card:hover{box-shadow:0 4px 16px rgba(27,36,48,.08);transform:translateY(-1px)}
.hub-card-head{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.hub-card h2{font-size:16px;margin:0}
.hub-card h2 a{color:var(--ink);text-decoration:none}
.hub-card h2 a:hover{color:var(--accent)}
.hub-ring{width:46px;height:46px;flex:none}
.hr-track{fill:none;stroke:var(--line);stroke-width:4}
.hr-arc{fill:none;stroke:var(--accent);stroke-width:4;stroke-linecap:round}
.hr-num{font-family:var(--fd);font-weight:700;font-size:14px;fill:var(--ink);text-anchor:middle;dominant-baseline:central}
.hub-sub{color:var(--ink-3);font-size:12px;margin-top:2px}
.hub-sub b.hub-stale{color:var(--warn)}
.hub-bars{margin-bottom:10px}
.hub-bar{height:4px;border-radius:2px;background:var(--line);overflow:hidden;margin-bottom:8px}
.hub-bar i{display:block;height:100%;background:var(--done);border-radius:2px}
.hub-meta{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--ink-2)}
.c-done{color:var(--done)}.c-wip{color:var(--wip)}.c-blocked{color:var(--blocked)}.c-warn{color:var(--warn)}
.hub-open{border-top:1px solid var(--line);padding-top:10px;font-size:12.5px}
.hub-open a{color:var(--accent);text-decoration:none}
.hub-open a:hover{text-decoration:underline}
.hub-no-page{color:var(--ink-3)}
.hub-missing-msg{color:var(--ink-3);font-size:12.5px;line-height:1.5}
.hub-missing .hub-card-head{margin-bottom:8px}
.hub-tag{margin-left:auto;font-size:11px;color:var(--warn);background:#FBF2DC;border-radius:4px;padding:1px 8px}
</style>
</head>
<body>
<div class="hub">
  <h1>Waymark Hub</h1>
  <div class="hub-sub1">项目总览 · ${entries.length} 个项目 · 数据生成于 ${escapeHtml(new Date(generatedAt).toLocaleString("zh-CN"))} · 重新生成：waymark hub</div>
  <div class="grid">
${cards}
  </div>
</div>
</body>
</html>`;
}
