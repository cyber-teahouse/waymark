# npm 首次发布清单（waymark-cli）

> 目标：把 waymark 从「只能源码构建」变成 `npm i -g waymark-cli` 一条命令装好。
> 已实测确认的事实见文末「现状核查」，清单按执行顺序排列。

## 0. 命名决策（已替你查过）

| 候选 | 状态 | 结论 |
| --- | --- | --- |
| `waymark-cli` | npm 404（可用），且已是 package.json 的 name | ✅ 沿用，零改名成本 |
| `waymark` | 已被占用（0.6.2，他人包） | ❌ 不可用 |

bin 命令名是 `waymark`（与包名无关），用户安装后仍敲 `waymark init`。**无需任何改名动作。**

## 1. 发布前代码改动（三处）

- [ ] **删除 `package.json` 的 `"private": true`**（第 15 行）——硬阻断，不删 `npm publish` 直接被拒
- [ ] **确认 `author` 字段**——现为 `"zenjiro"`，与 git 提交署名（王信杰）不一致；改成你希望公开显示的署名，如 `"王信杰 <邮箱>"`
- [ ] **README 快速起步加安装段**（发布后随包展示，先写好）：

  ```bash
  npm i -g waymark-cli   # 需要 Node >= 20
  cd /path/to/your-project && waymark init
  ```

  原有的 clone/build 流程降级为「参与开发」小节。

无需动 scripts：`prepare` 钩子在 `npm publish` 打包时会自动重建 dist（本地 typescript/vite 可解析），`prepublishOnly` 已跑全量测试——产物新鲜度与质量门都已覆盖。

## 2. 版本发版（沿用 RELEASE.md 流程）

main 上已有 3 个 post-0.3.1 修复（动画打磨、连线渲染根治、CLI 三连修），首发即 0.3.2：

- [ ] bump 四处版本号（package.json / package-lock.json 两处 / README 徽章 / RELEASE.md 历史表）
- [ ] `npm test` 全绿
- [ ] `git commit -m "chore: release 0.3.2"` + `git tag -a v0.3.2 -m "v0.3.2: <一句话>"` + 推送分支与 tag

## 3. 打包自检

```bash
npm pack --dry-run    # 核对清单：dist/**（含 dist/web-dist/index.html）+ package.json + README + LICENSE
```

实测基线（0.3.1 干跑）：27 个文件 / 178.0 kB / unpacked 580.6 kB。偏离这个量级先查原因再发。

可选强校验（真打包装一遍）：

```bash
npm pack                                  # 生成 waymark-cli-0.3.2.tgz
mkdir %TEMP%\wm-smoke && cd %TEMP%\wm-smoke
npm i -g E:\A_Project\waymark\waymark-cli-0.3.2.tgz
waymark --version                         # 应输出 0.3.2
waymark init --root demo && waymark sync --root demo && waymark render --root demo
npm uninstall -g waymark-cli              # 冒烟完卸载
```

## 4. 发布

```bash
npm whoami          # 未登录先 npm login（开了 2FA 备好 authenticator）
npm publish         # 无 scope 公共包，默认 public
npm view waymark-cli version   # 应返回 0.3.2
```

## 5. 发布后收尾

- [ ] 干净环境 `npm i -g waymark-cli` 走一遍 init → sync → render → ui 全链路
- [ ] README 徽章区加 npm version 徽章（可选）
- [ ] GitHub Releases 挂出 v0.3.2（可用 RELEASE.md 历史表那行做正文）
- [ ] RELEASE.md「历史版本」表补 0.3.2 行（若第 2 步未做）

## 回滚预案

- 发错 72 小时内：`npm unpublish waymark-cli@0.3.2`（超时只能 deprecate）
- 撤回提示：`npm deprecate waymark-cli@0.3.2 "请使用 0.3.3"` + 立即发修复版

## 现状核查（2026-09-29 实测）

- `npm view waymark-cli` → 404（名字可用）；`npm view waymark` → 0.6.2（他人占用）
- `npm pack --dry-run` 通过，产物含 CLI 全部编译 js + 内嵌前端 bundle（dist/web-dist/index.html 466.3 kB）
- 运行时版本号唯一来源是包根 package.json（src/version.ts），随包发布 ✓
- 阻断项只有 `"private": true`；其余 package.json 字段（bin/files/engines/repository/license）均已就绪
