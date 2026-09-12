# Learning Helper

为本科生的 3–14 天数学分析/微积分备考提供基于课程证据的持续学习助手。

本仓库是独立 DeepSeek Harness plugin，单 npm package；运行壳是 [Develata/learning-helper](https://github.com/Develata/learning-helper)。学习状态由确定性业务代码维护，LLM 负责解释与提案。

第一轮已实现：独立 TypeScript bundle、真实 SQLite、受 Harness 会话校验的 Host API，以及 `Attempt → weak → ReviewQueue → PlanRevision` 确定性 vertical slice。运行 `pnpm demo` 可查看两次一致连续错误如何修改 Day 2。完整资料导入、Agent 问答与 Quiz UI 尚在后续阶段。实际状态见 [CURRENT](docs/CURRENT.md)，验收见 [matrix](docs/acceptance/matrix.md)。

开发与运行命令见 [local-dev](docs/operations/local-dev.md)，插件安装见 [harness-integration](docs/operations/harness-integration.md)，设计入口见 [docs](docs/README.md)。

License: MIT。
