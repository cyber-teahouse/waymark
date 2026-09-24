---
id: M8-remote-merge
title: 远程 UI 增强合并与冒烟
type: milestone
status: done
deps: [M1-sse-refresh, M3-acc-toggle, M5-biome-gate]
iteration: I1
evidence:
  paths: [web/src/**]
  grep: ["ViewportSync"]
  git: ["Merge"]
acceptance:
  - [x] 合并远程入场动画/筛选角标/快捷键浮层/视口跟随四组增强
  - [x] 解决 SSE 局部刷新与整页 reload 兜底机制冲突（保留局部刷新）
  - [x] 补回 biome 清理误删的 NODE_H 常量
  - [x] init→sync→ui 全链路浏览器冒烟通过（含 acc 勾选原位刷新）
---

## 需求描述

推送时远程有两条新 UI 提交（视口跟随、入场动画等），与本地 SSE 局部刷新机制在 main.tsx/DetailPanel 冲突。语义合并取两端功能并集，丢弃已被 SSE 取代的整页 reload 兜底，浏览器冒烟验证共存。

## 完成记录

- 2026-09-24 合并 origin/main 并全链路冒烟，推送 04bbc82
