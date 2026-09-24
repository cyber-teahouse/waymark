---
id: M2-entry-parity
title: 三入口能力对齐
type: milestone
status: done
deps: []
iteration: I1
evidence:
  paths: [src/**]
  grep: ["--fresh"]
  git: ["fresh"]
acceptance:
  - [x] status --fresh 与 render --fresh 同口径自动重 sync
  - [x] 数据过期时无 --fresh 给出提示而非静默用旧数据
  - [x] UI 全部操作（start/done/block/drop/reopen）可填操作说明
---

## 需求描述

status 命令缺乏 --fresh 过期重算口径；UI 操作说明只有部分操作支持。统一三入口（CLI/MCP/UI）能力面。

## 完成记录

- 2026-09-23 status --fresh 过期口径 + UI 全操作可填说明（870b79a）
