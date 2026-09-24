---
id: M6-overview-strict
title: 总览表解析收紧
type: milestone
status: done
deps: [M5-biome-gate]
iteration: I1
evidence:
  paths: [src/parser/**, tests/parsePlan.test.ts]
  grep: ["parseOverview"]
  git: ["总览表"]
acceptance:
  - [x] 只读取第一张 markdown 表格，后续表格忽略并 warning
  - [x] 畸形行（列数不足/id 为空）跳过并 warning，附行号
  - [x] 表头首列非 id 时 warning（中文表头误写场景）
  - [x] 无数据行 / 无表格分别 warning/error，新增 6 个测试
---

## 需求描述

parseOverview 对非标准格式静默吞掉：多张表混读、畸形行丢弃、中文表头当数据行，用户写错毫无感知。收紧为显式 warning/error 分级告警。

## 完成记录

- 2026-09-24 总览表解析收紧——格式问题显式告警而非静默吞掉（01c8dee）
