---
id: M7-prepare-guard
title: prepare 安装防护
type: milestone
status: done
deps: []
iteration: I1
evidence:
  paths: [scripts/**, tests/prepare.test.ts]
  grep: ["hasBuildTools"]
  git: ["prepare"]
acceptance:
  - [x] 构建前 require.resolve 探测 typescript/vite
  - [x] git 依赖 / --omit=dev 安装场景优雅跳过而非拖垮安装
  - [x] 全局安装跳过逻辑保留，新增 2 个测试
---

## 需求描述

prepare 脚本仅判断 npm_config_global；git 依赖安装非 global 且常缺 devDependencies，npm run build 必败并拖垮整个 npm install。构建前探测工具链，缺失则优雅跳过（仓库内置 dist）。

## 完成记录

- 2026-09-24 prepare 增加构建工具链探测（cc3d4a3）
