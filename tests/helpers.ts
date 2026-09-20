import fs from "node:fs";
import path from "node:path";

/** 生成样例项目：3 节点（M1 完成/M2 进行中/M3 未开始）+ I1 迭代 + 总览 + 代码证据。
 *  withGit=true 时额外初始化 git 仓并提交一条 "feat: core 骨架初始化"（供 git 证据维度命中）。 */
export async function makeSampleProject(dest: string, withGit = false): Promise<void> {
  fs.mkdirSync(path.join(dest, "plan", "milestones"), { recursive: true });
  fs.mkdirSync(path.join(dest, "plan", "iterations"), { recursive: true });
  fs.mkdirSync(path.join(dest, "src", "core"), { recursive: true });
  fs.mkdirSync(path.join(dest, "src", "auth"), { recursive: true });

  fs.writeFileSync(path.join(dest, "plan", "overview.md"), `# 示例项目

| id | 标题 | 迭代 |
|----|------|------|
| M1-core | 核心骨架 | I1 |
| M2-auth | 认证模块 | I1 |
| M3-login | 登录页面 | I1 |
`);

  fs.writeFileSync(path.join(dest, "plan", "iterations", "I1-mvp.md"),
`---
id: I1
title: MVP
goal: 跑通最小闭环
---
`);

  fs.writeFileSync(path.join(dest, "plan", "milestones", "M1-core.md"),
`---
id: M1-core
title: 核心骨架
type: milestone
status: done
deps: []
iteration: I1
evidence:
  paths: [src/core/**]
  grep: ["coreInit"]
  git: ["core|骨架"]
acceptance:
  - [x] 初始化工程
  - [x] 基础构建脚本
---

## 需求描述
搭建可构建的最小工程骨架。

## 完成记录
- 2026-09-18 完成工程初始化与构建脚本
`);

  fs.writeFileSync(path.join(dest, "plan", "milestones", "M2-auth.md"),
`---
id: M2-auth
title: 认证模块
type: milestone
status: in-progress
deps: [M1-core]
iteration: I1
evidence:
  paths: [src/auth/**, src/missing/**]
  tests: [tests/auth/**]
acceptance:
  - [x] 密码登录
  - [ ] 刷新令牌
---

## 需求描述
提供登录鉴权能力。

## 完成记录
- 2026-09-19 完成密码登录
`);

  fs.writeFileSync(path.join(dest, "plan", "milestones", "M3-登录.md"),
`---
id: M3-login
title: 登录页面
type: task
status: planned
deps: [M2-auth]
iteration: I1
acceptance: []
---

## 需求描述
登录表单 UI。
`);

  fs.writeFileSync(path.join(dest, "src", "core", "index.ts"), "export function coreInit(): void {}\n");
  fs.writeFileSync(path.join(dest, "src", "auth", "login.ts"), "export const strategy = 'password';\n");

  if (withGit) {
    const { simpleGit } = await import("simple-git");
    const git = simpleGit(dest);
    await git.init(["-b", "main"]);
    await git.addConfig("user.email", "t@t.local");
    await git.addConfig("user.name", "t");
    await git.add(".");
    await git.commit("feat: core 骨架初始化");
  }
}
