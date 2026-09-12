# Learning Helper

为本科生的 3–14 天数学分析/微积分备考提供基于课程证据的持续学习助手。

本仓库是独立 DeepSeek Harness plugin，单 npm package；运行壳是 [Develata/learning-helper](https://github.com/Develata/learning-helper)。学习状态由确定性业务代码维护，LLM 负责解释与提案。

已实现 P1 持久化自适应闭环与 P2 课程证据：空课程创建、TXT/Markdown 导入、独立 SQLite/FTS 检索、稳定引用，以及真实 DSH course_list/search/read 工具和 grounding policy。`pnpm demo` 展示两次错误修改 Day 2；`pnpm demo:evidence` 展示导入与引用回读。真实 LLM semantic smoke 尚缺模型凭证；Quiz UI、学习提案工具、PDF 与 Docker 待后续实现。事实与验收见 [CURRENT](docs/CURRENT.md) 和 [matrix](docs/acceptance/matrix.md)。

开发与运行命令见 [local-dev](docs/operations/local-dev.md)，插件安装见 [harness-integration](docs/operations/harness-integration.md)，设计入口见 [docs](docs/README.md)。

License: MIT。
