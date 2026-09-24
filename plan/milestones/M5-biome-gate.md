---
id: M5-biome-gate
title: biome 门禁接入 CI
type: milestone
status: done
deps: [M1-sse-refresh, M2-entry-parity, M3-acc-toggle]
iteration: I1
evidence:
  paths: [biome.json, .github/**]
  grep: ["biome"]
  git: ["biome"]
acceptance:
  - [x] biome 单工具替代 ESLint+Prettier 双链，57 文件 30ms 完成 lint+format
  - [x] 修复 App hooks 顺序真实隐患（wf 改 state 后 hooks 落入条件分支）
  - [x] 修复 button type、数组 key、SVG aria 等存量 a11y/正确性问题
  - [x] npm test 前置 lint；CI 在 npm ci 后第一步跑 biome check
---

## 需求描述

仓库无 lint/format 门禁，风格漂移且存在 hooks 顺序等真实隐患。引入 biome 单工具方案：全仓格式化、修复存量问题、接入 npm scripts 与 CI。

## 完成记录

- 2026-09-24 biome 单工具 lint/format 门禁接入 CI，全仓格式化 53 文件（6b85616）
