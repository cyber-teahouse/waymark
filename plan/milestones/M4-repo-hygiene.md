---
id: M4-repo-hygiene
title: 仓库清理与防误入
type: milestone
status: done
deps: []
iteration: I1
evidence:
  paths: [.gitignore]
  git: ["仓库清理"]
acceptance:
  - [x] 误入的外部截图与系统日志目录全部移除
  - [x] UI 改版对比图归档到 docs/
  - [x] .gitignore 补充防误入规则
---

## 需求描述

仓库混入外部项目截图（jingjie-*.png）与 NVIDIA 系统日志目录，UI 改版对比图散落根目录。清理并加 .gitignore 防护。

## 完成记录

- 2026-09-23 移除误入文件，归档 UI 改版对比图（7cc1a2b）
