# 文档路由

Learning Helper：课程证据 + 学习状态 + 可解释的自适应行动。

| 任务 | 阅读路径 |
|---|---|
| 恢复工作 / 版本状态 | [CURRENT](CURRENT.md) → [v0.2 plan](plan/v0.2.md)；不要把本地已验证当作已部署 |
| 理解产品 | [product](product.md) → [overview](architecture/overview.md) |
| 改业务 | [constitution](constitution.md) → [ownership](architecture/module-boundaries.md) → [persistence](contracts/persistence.md) → [acceptance](acceptance/matrix.md) → CodeGraph |
| 改工具/资料 | [agent-tools](contracts/agent-tools.md) / [evidence](contracts/evidence.md) → [integrations](architecture/integrations.md) |
| 改 UI/Host | [web-ui](contracts/web-ui.md) → [integrations](architecture/integrations.md) |
| 运行/排障 / 升级 | [local-dev](operations/local-dev.md) → [Harness integration](operations/harness-integration.md) / [v1迁移](operations/migration-v1.md) |
| 验收 / 演示 | [v0.2 matrix](acceptance/matrix.md) → [golden path](acceptance/golden-path.md) / [真实模型](operations/real-llm.md) / [视频与录制](DEMO.md) |
| 查入口/缘由 | [map](map/README.md) → [Workspace ADR](adr/0005-workspace-learning-boundary.md) / [Document ADR](adr/0006-canonical-document-generations.md) |
| v0.1 历史 | [旧计划](plan/v0.1.md) / [旧验收](acceptance/final-delivery.md)；只证明已冻结 release |

Authority 按语义归属，见 [docs governance](AGENTS.md)。代码/CodeGraph 说明现状，architecture/contracts 约束目标；冲突必须修复 owner 文档或代码，不静默选边。map、CURRENT 和 plan 不重定义 contract。
