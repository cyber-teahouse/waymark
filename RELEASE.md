# 发版流程（Release Checklist）

每次发版按以下步骤执行。以发 `0.2.1` 为例，将版本号替换为目标版本。

## 前置条件

- `main` 分支上待发布的改动已全部合并，工作区干净（`git status` 无未提交内容）
- 本机 git 凭据可推送（`~/.git-credentials` 中有有效的 GitHub token）

## 步骤

### 1. 版本 bump

同时修改两处（只改 package.json 会导致 lock 不一致）：

- `package.json` 的 `version` 字段
- `package-lock.json` 顶部 `version` 与 `packages."".version` 两处
- `README.md` 顶部的 version 徽章（`img.shields.io/badge/version-…`）

版本号遵循 semver：`patch`（缺陷修复 / 小改进）、`minor`（新功能）、`major`（破坏性变更）。

> 版本号是 CLI `--version` 与 MCP server 版本的唯一来源（`src/version.ts` 运行时从包根 package.json 读取），不需要改任何代码里的硬编码。

### 2. 验证

```bash
npm test        # typecheck + 87 个测试；version 测试会校验 getVersion() 与 package.json 一致
```

测试不过不发版。

### 3. 提交并打 tag

```bash
git add package.json package-lock.json
git commit -m "chore: release 0.2.1"
git tag -a v0.2.1 -m "v0.2.1: <一句话说明本版内容>"
```

- commit 用 `chore:` 前缀，与功能提交分开
- tag 用 annotated tag（`-a`），附一句本版要点，便于 `git tag -l -n` 速览

### 4. 推送分支与 tag

```bash
git push origin main
git push origin v0.2.1
```

### 5. 核对

```bash
git status -sb                     # 应为 main...origin/main（无 ahead/behind）
git ls-remote --tags origin | tail -3   # 确认 tag 已上远端
```

## Windows 环境注意事项

本机（Windows）的 git 配了 `credential.helperSelector`，在非交互终端推送时会弹窗并被取消，报 `User cancelled dialog`。两种解法：

- **一次性绕过**（推荐，不动全局配置）：

  ```bash
  git -c credential.helperSelector= -c credential.helper=store push origin main
  ```

- **一劳永逸**：`git config --global credential.helperSelector store`

凭据本身存于 `~/.git-credentials`（store 助手），换新 token 时直接改该文件中 `github.com` 所在行。

## 历史版本

| 版本 | 日期 | 要点 |
|------|------|------|
| 0.2.1 | 2026-09-22 | 证据目录过期检测、版本号单一来源（getVersion）、MCP 工作流缓存（workflowCache） |
| 0.2.0 | — | MCP server（5 工具）、内容感知校验、可开工提示、CI 示例 |
