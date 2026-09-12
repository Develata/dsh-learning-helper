# 验收矩阵

执行环境与命令日期由 [CURRENT](../CURRENT.md) 记录；下面只保存能力与证据关联。

| Capability | Status | Proof / Test | Demo step |
|---|---|---|---|
| CodeGraph 双仓初始化 | verified | 1.6.0 init/status，插件实现后 sync | Agent 导航 |
| Harness core patch = 0 | verified | `git diff --name-only`：packages/apps 无变更；[audit](../architecture/integrations.md) | 安装 |
| Bundle 独立 install/typecheck/build/pack | verified | 独立临时副本中 install/typecheck/test/build/pack；运行与测试数见 CURRENT，tgz 含 dist/manifest/docs | 打开 |
| Fixture 5 题确定性 adaptation | verified | `tests/learning.test.ts`：两错→weak→review→v2；预算与旧计划保留 | 提交→Day 2 |
| 幂等/并发/故障/恢复 | verified | 相同提交不再写；不同 quiz 并发无丢失；SQLite lock 整体失败；新 Node 进程恢复 | 反馈持久化 |
| 派生状态与复习证据一致性 | verified | `tests/learning.test.ts`：拒绝无证据的 mastery/status；SQLite 重启拒绝篡改的状态、重复错误和答对记录的修订引用，不重置数据 | 学习状态 |
| 合法输入的重规划边界 | verified | `tests/adaptation-boundaries.test.ts`：长概念名、任务 ID 碰撞、完成任务/待办任务达上限时仍正确提交 | 提交→Day 2 |
| Host API 输入与答案隔离 | verified | `tests/http.test.ts`：无 key 投影、拒绝错误输入、body size/time bound、Harness 拒绝回执 | Quiz Host |
| 真实 Harness local link / tarball / Web boot | verified | local `dsh plugin add` 与 `scripts/harness-smoke.mjs`；会话校验、静态资源、新进程复用 receipt | 运行壳 |
| Course 创建 UI / material / citation | planned | P2：当前仅内部 create + authored fixture | 上传/问答 |
| Agent outline/quiz/plan tools | planned | P3：需要 tool/semantic acceptance | 提案 |
| Quiz + plan-change UI | planned | P4：尚无 dsh.client，本轮不声称浏览器交互完成 | 交互/解释 |
| pinned Docker delivery | planned | P5 | cold boot |
