# npm 首发清单（waymark-cli）

> 目标：把 waymark 从「只能源码构建」变成 `npm i -g waymark-cli` 一条命令装好。
>
> **状态（2026-10-01）**：发布前改动与版本发版已完成并推送（6b32ed6 / b23a8f3，tag `v0.3.2`），
> 打包自检与冒烟通过。**仅剩第 4 节 `npm publish`（需 `npm login`）与第 5 节发布后收尾。**
> 此后日常发版走 [RELEASE.md](../RELEASE.md)（已补「npm 发布」步骤），本清单归档留作首发记录。

## 0. 命名决策（已查实）

| 候选 | 状态 | 结论 |
| --- | --- | --- |
| `waymark-cli` | npm 404（可用），且已是 package.json 的 name | ✅ 沿用，零改名成本 |
| `waymark` | 已被占用（0.6.2，他人包） | ❌ 不可用 |

bin 命令名是 `waymark`（与包名无关），用户安装后仍敲 `waymark init`。**无需任何改名动作。**

## 1. 发布前代码改动（三处）

- [x] **删除 `package.json` 的 `"private": true`**（硬阻断项，6b32ed6 已删）
- [ ] **确认 `author` 字段**——现为 `"zenjiro"`，与 git 提交署名（王信杰）不一致；publish 前改成你希望公开显示的署名（发出后修改只能随下个版本）
- [x] **README 快速起步加安装段**（6b32ed6），原 clone/build 流程降级为「参与开发」小节

scripts 无需改动：`prepare` 钩子在 `npm publish` 打包时自动重建 dist（本地 typescript/vite 可解析），`prepublishOnly` 已跑全量测试——产物新鲜度与质量门都已覆盖。

## 2. 版本发版（已完成，沿用 RELEASE.md 流程）

- [x] bump 四处版本号（package.json / package-lock.json 两处 / README 徽章 / RELEASE.md 历史表）
- [x] `npm test` 全绿（21 文件 158 用例）
- [x] `chore: release 0.3.2` 提交 + annotated tag `v0.3.2` + 推送分支与 tag

## 3. 打包自检（已通过）

```bash
npm pack --dry-run    # 核对清单：dist/**（含 dist/web-dist/index.html）+ package.json + README + LICENSE
```

- [x] 干跑基线：27 个文件 / 178.7 kB / unpacked 583.2 kB（0.3.1 基线 178.0 kB，差异来自 README 安装段）
- [x] 真装冒烟：tgz 全局安装 → 全新目录 `--version`(0.3.2) → init → sync → render（469 KB 单文件页）→ check → status 全链路通过，验证后已卸载清理

## 4. 发布（唯一待办）

```bash
npm whoami          # 未登录先 npm login（开了 2FA 备好 authenticator）
npm publish         # 无 scope 公共包，默认 public；打包的是当前工作区（非 tag）
npm view waymark-cli version   # 应返回 0.3.2
```

## 5. 发布后收尾

- [ ] 干净环境 `npm i -g waymark-cli` 走一遍 init → sync → render → ui 全链路（第 3 节冒烟已覆盖 init/sync/render/check/status）
- [ ] GitHub Releases 挂出 v0.3.2（RELEASE.md 历史表该行可直接做正文）
- [ ] README 徽章区加 npm version 徽章（可选）

## 回滚预案

- 发错 72 小时内：`npm unpublish waymark-cli@0.3.2`（超时只能 deprecate）
- 撤回提示：`npm deprecate waymark-cli@0.3.2 "请使用 0.3.3"` + 立即发修复版

## 现状核查（2026-09-29 实测）

- `npm view waymark-cli` → 404（名字可用）；`npm view waymark` → 0.6.2（他人占用）
- `npm pack --dry-run` 通过，产物含 CLI 全部编译 js + 内嵌前端 bundle（dist/web-dist/index.html 466.3 kB）
- 运行时版本号唯一来源是包根 package.json（src/version.ts），随包发布 ✓
