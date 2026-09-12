# 系统结构

Harness 拥有 Agent runtime、模型、session、MCP、Web shell 与学习存储基础设施。Learning plugin 拥有学习语义、证据与工具；runtime core patches = 0。

```text
Agent Plane:    defineTool + grounding section → LearningService metadata / EvidenceService
Evidence Plane: EvidenceService → DocumentParser + EvidenceStore → evidence.db (Source/Chunk/FTS)
Learning Plane: LearningService → domain/policy → HarnessLearningStore → state.db (learning aggregate)
Host routes:   authenticated HTTP → 对应 application service
```

P1 答题仍按课程一次原子写 Attempt/ConceptState/ReviewQueue/StudyPlan/PlanRevision，不访问 corpus。P2 EvidenceService 只用 Course 元数据确认身份，不 clone 学习历史；资料不进入 LearningAggregate。两个数据库各自拥有原子性，没有跨库事务；来源/课程删除暂缓，避免悬空引用。

依赖与写权限由 [module boundaries](module-boundaries.md) 拥有，具体存储决定见 [ADR-0003](../adr/0003-separate-evidence-store.md)。客户端学习界面与 outline/quiz/plan 提案工具仍是后续阶段。
