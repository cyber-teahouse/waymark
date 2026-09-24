---
id: M3-acc-toggle
title: 单项验收勾选四端贯通
type: milestone
status: done
deps: [M1-sse-refresh]
iteration: I1
evidence:
  paths: [src/**, web/src/**]
  grep: ["/api/acc"]
  git: ["acc"]
acceptance:
  - [x] waymark acc CLI 命令勾选指定验收项
  - [x] MCP waymark_toggle_acceptance 工具
  - [x] UI 验收项点击切换，经 SSE workflow 帧原位更新
  - [x] 勾选状态落库到节点源文件
---

## 需求描述

验收标准只能整组随 done 勾选，无法单项操作。贯通 CLI、MCP、HTTP API、UI 四端的单项验收勾选能力；UI 侧依赖 M1 的 SSE workflow 帧做原位刷新。

## 完成记录

- 2026-09-23 单项验收勾选贯穿 CLI/MCP/UI（47a09fc）
