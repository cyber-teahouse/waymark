---
id: M1-sse-refresh
title: SSE 局部刷新与指纹缓存
type: milestone
status: done
deps: []
iteration: I1
evidence:
  paths: [src/ui/**, web/src/**]
  grep: ["EventSource"]
  git: ["SSE"]
acceptance:
  - [x] SSE 推送 workflow JSON 帧，前端局部刷新保留画布视口
  - [x] 保留 reload 兼容帧，旧前端不崩
  - [x] 输入指纹命中时复用缓存，不重复扫描证据/git
---

## 需求描述

详情面板操作后整页 reload 会丢失画布视口与面板状态。改为 SSE 直接推送 workflow JSON，前端原位更新；渲染层加输入指纹缓存避免重复计算。

## 完成记录

- 2026-09-23 SSE 推送 workflow JSON 局部刷新 + 指纹缓存复用（dc057d4）
