# 当前状态

- Current phase：P1 完成；下一轮 P2（资料与证据）。
- Last known good commit：业务实现 `03e6da7dd70cdd3ffbea7e2cfaaf6353375580d8`。首轮文档基线 `78bce95`；不是完整 MVP release。
- What works：独立 TypeScript bundle；真实 storage-domain/SQLite；5 题确定性评分；Attempt → weak → ReviewQueue → Day 2 PlanRevision；幂等/并发/失败恢复；Host 读取与提交接口；prebuilt tgz 安装与 Web 进程重启恢复。
- What is broken：当前匹配范围检查无失败。资料上传/检索/citation、Agent tools、交互 Quiz UI、学习 preset、Docker 未实现。
- Active decisions：单 package；Harness core patch = 0；每课程聚合一次原子写；公开 Connection 校验每条学习路由；demo fixture 默认关闭。
- Known blockers：P2 无阻塞。OpenFile peers 与当前 Harness 版本不一致，不能直接宣称兼容；不影响 TXT/MD 先行。尚无真实 LLM 语义验收。
- Last verification（2026-09-12，Node 24.18.0 / pnpm 11.7.0）：`pnpm install --frozen-lockfile`、`pnpm peers check`、`pnpm run typecheck`、`pnpm test`（23/23）、`pnpm demo`、`pnpm run build`、`pnpm pack --pack-destination artifacts` 均通过；`pnpm run test:integration` 验证 tarball 安装、dump config、认证/来源校验、Web HTML/JS/CSS 资源、Host 提交、重启与幂等 receipt。
- Standalone verification：将已提交文件导出至独立临时目录（无 sibling checkout），再次 install/typecheck/23 tests/build/pack 全部通过。
- Harness baseline：`c291e7961a515f6d7af9304e7fd1d257929aef26` / 0.1.5-rc.2；`pnpm install --frozen-lockfile`、`pnpm run build` 通过；`pnpm exec vitest run packages/storage/storage-domain/tests/domain.spec.ts packages/storage/storage-sqlite/tests/sqlite-backend.spec.ts`（49/49）。未跑全量上游测试；未做浏览器交互/视觉验收。
- Next 3 concrete tasks：① Course 创建用例与 Source/Chunk，TXT/MD 导入/hash 去重/稳定 locator；② 独立 SQLite FTS EvidenceIndex 与 course_search/read 引用契约；③ PDF parser adapter 的实际版本验证、timeout/retry/restart recovery 与文本 fallback。
