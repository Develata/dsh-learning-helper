# 文档路由

Learning Helper：课程证据 + 学习状态 + 可解释的自适应行动。

| 任务 | 阅读路径 |
|---|---|
| 恢复工作 | [CURRENT](CURRENT.md) → [v0.2 plan](plan/v0.2.md) |
| 理解产品 | [product](product.md) → [overview](architecture/overview.md) |
| 改业务 | [constitution](constitution.md) → [ownership](architecture/module-boundaries.md) → [persistence](contracts/persistence.md) → [acceptance](acceptance/matrix.md) → CodeGraph |
| 改工具/资料 | [agent-tools](contracts/agent-tools.md) / [evidence](contracts/evidence.md) → [integrations](architecture/integrations.md) |
| 改 UI/Host | [web-ui](contracts/web-ui.md) → [integrations](architecture/integrations.md) |
| 运行/排障 | [local-dev](operations/local-dev.md) → [Harness integration](operations/harness-integration.md) |
| 最终交付 | [v0.2 matrix](acceptance/matrix.md) / [v0.1历史](acceptance/final-delivery.md) → [真实模型](operations/real-llm.md) / [演示脚本](DEMO.md) |
| 查入口/缘由 | [map](map/README.md) / [ADR-0001](adr/0001-dual-repo-thin-fork.md) / [ADR-0002](adr/0002-structured-learner-state.md) |

Authority 按语义归属，见 [docs governance](AGENTS.md)。代码/CodeGraph 说明现状，architecture/contracts 约束目标；冲突必须修复 owner 文档或代码，不静默选边。map、CURRENT 和 plan 不重定义 contract。
