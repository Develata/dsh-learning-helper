# Learning Helper

为本科生的 3–14 天数学分析/微积分备考提供基于课程证据的持续学习助手。

本仓库是独立 DeepSeek Harness plugin，单 npm package；运行壳是 [Develata/learning-helper](https://github.com/Develata/learning-helper)。学习状态由确定性业务代码维护，LLM 负责解释与提案。

已接通课程资料、Agent 提案与持久化自适应闭环。P4 在 Harness 原生右侧增加 Learning 面板：创建/选择课程、上传 TXT/Markdown、查看计划与进度、完成交互练习、刷新恢复反馈，并解释错题如何带来 Day 2 的 20 分钟复习和 3 道针对题。生成快捷动作预填聊天，由 Agent 使用既有七工具完成发布。

普通练习界面与专用工具卡片在提交前不显示答案；原始 session/debug/export 不作为考试防作弊边界。真实 LLM 语义验收仍缺模型凭证，PDF 与 Docker 延后。`pnpm demo`、`demo:evidence`、`demo:authoring` 分别验证自适应、证据与完整 backend；packed integration 另运行真实浏览器闭环。状态与证据见 [CURRENT](docs/CURRENT.md) 和 [matrix](docs/acceptance/matrix.md)。

开发与运行命令见 [local-dev](docs/operations/local-dev.md)，插件安装见 [harness-integration](docs/operations/harness-integration.md)，设计入口见 [docs](docs/README.md)。

License: MIT。
