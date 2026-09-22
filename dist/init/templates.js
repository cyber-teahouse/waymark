export const OVERVIEW_MD = `# 项目计划总览

> 本文件是 waymark 的框架文档入口。表格列出全部里程碑，供与 milestones/ 交叉校验。

| id | 标题 | 迭代 |
|----|------|------|
| M1-example | 示例里程碑 | I1 |
`;
export const ITERATION_MD = `---
id: I1
title: 第一个迭代
goal: 描述本次迭代的目标
---

## 范围
- （写本次迭代要完成的内容）
`;
export const NODE_MD = `---
id: M1-example
title: 示例里程碑
type: milestone
status: planned
deps: []
iteration: I1
evidence:
  paths: [src/example/**]
  grep: ["exampleInit"]
acceptance:
  - [ ] 示例验收项一
  - [ ] 示例验收项二
---

## 需求描述
（描述这个节点要做什么）

## 完成记录
（完成后由开发者或 AI agent 追加，格式：- 2026-09-20 完成了什么）
`;
