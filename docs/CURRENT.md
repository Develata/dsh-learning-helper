# 当前状态

- Current phase：P1 vertical slice 已实现并完成本轮 review 修复；下一阶段 P2（资料与证据）。
- Last known good commit：`f10620ab09087e77219c126b1c505290183535f0`。业务状态修复 `469fd81` 与集成验收修复 `f10620a` 已分批提交；代码与下述已验证工作区一致，不是完整 MVP release。
- What works：独立 TypeScript bundle；真实 storage-domain/SQLite；5 题评分与 Attempt → weak → ReviewQueue → Day 2 PlanRevision；幂等、并发、锁失败整体回滚、进程重启恢复；Host API 与 prebuilt tgz 集成。
- Review fixes：派生状态按实际策略重放校验，拒绝无证据的 mastery/status、重复或答对记录的复习引用；长概念名、任务 ID 碰撞、任务槽不足不再破坏合法提交；集成命令正确处理 pnpm 的 `--`，固定 upstream runtime 并允许 fork 发行说明，回执区分本次成功/失败与工作区状态。
- What is broken / incomplete：本轮已复现问题均已修复，当前验证无失败。资料上传/检索/citation、Agent tools、交互 Quiz UI、学习 preset、Docker 尚未实现。
- Active decisions：见 [ownership](architecture/module-boundaries.md) 与 [persistence](contracts/persistence.md)；Harness core patch = 0，学习 DB 由单 Host 写入。本轮没有修改 Harness fork。
- Known blockers：P2 无新增阻塞。上一轮已记录的 OpenFile peer 版本差异尚未复验；TXT/MD 先行不依赖它。
- Last verification（2026-09-12，Node 24.18.0 / pnpm 11.7.0）：`pnpm run typecheck`、`pnpm test`（38/38）、`git diff --check` 通过；`pnpm run test:integration -- /home/deve/gitclone/learning-helper` 通过 build/pack、tarball 安装、config dump、认证/来源校验、Web HTML/JS/CSS、Host 提交及新进程幂等回执恢复。具体运行与包摘要见本地 `artifacts/integration-result.json`。
- Standalone verification：复制当前源码、脚本和测试到无 sibling checkout 的独立临时目录，`pnpm install --offline --frozen-lockfile`、typecheck、38 tests、build、pack 均通过；临时副本已删除。CodeGraph 已同步。
- Harness baseline：upstream `c291e7961a515f6d7af9304e7fd1d257929aef26` / 0.1.5-rc.2；本轮集成使用 fork `81310159250f879bfeb58d179dbc84462381748e`。此前 build 与 storage tests 49/49 已通过，本轮未修改上游代码，未重复运行其全量检查。未做真实 LLM 或浏览器交互/视觉验收。
- Next 3 concrete tasks：① Course 创建用例与 Source/Chunk，TXT/MD 导入/hash 去重/稳定 locator；② 独立 SQLite FTS EvidenceIndex 与 course_search/read 引用契约；③ PDF parser adapter 的实际版本验证、timeout/retry/restart recovery 与文本 fallback。
