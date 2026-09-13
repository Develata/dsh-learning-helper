# ADR-0003：课程证据使用独立 SQLite

状态：accepted（P2 用户明确要求）。

适用范围：独立 Evidence DB 的决策继续有效；下文的全局 Course、schema version 1 与初版导入细节属于 v0.1。v0.2 的 Workspace 存放位置和多代证据分别由 [ADR-0005](0005-workspace-learning-boundary.md)、[ADR-0006](0006-canonical-document-generations.md) 接替，当前边界见 [Evidence contract](../contracts/evidence.md)。

LearningAggregate 是一次答题的原子学习状态，更新包含 clone/校验/策略重放。教材进入聚合会把每次答题成本与 corpus 大小绑定；Evidence 改由独立 `evidence.db` 拥有 Source、Chunk、FTS。使用 Node 自带 SQLite，复用数据库能力且不引入 native package。Harness storage-sqlite 仅提供 KV，不导入其私有 SQL 实现，不混写 state.db；session-query 继续只管理会话历史。

EvidenceService 确认 Course 存在，调用 DocumentParser 与窄 EvidenceStore；providers 实现 SQLite/FTS 与 TXT/MD parser。两个 DB 不做分布式事务；课程删除及 Source 删除暂缓。导入先持久化 processing，再在同一 evidence 事务中提交 chunks/index/ready；失败无部分可检索数据，重启将 processing 变为 failed，显式重导恢复。单 Host owner，close 中断在途解析并等其退出；SQLite 锁等待有界。

Evidence schema 独立 PRAGMA user_version=1；未知版本/损坏拒绝打开，绝不删除重建。FTS 是可替换检索投影，原始 chunks 与稳定 locator 是真值；无 FTS 的 runtime 采用有课程大小上限的 literal 检索。未来 Parser/EvidenceStore 可以替换，但需保持 Course ownership、引用稳定性、失败与输出上限契约。
