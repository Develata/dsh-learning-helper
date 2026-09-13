# Data model

v0.2 Workspace manifest：schemaVersion=2、稳定 projectId、title/subject/examAt?/dailyMinutes。内部 `Course.id == manifest.projectId`，每个 Workspace 恰好一个 Course；初始 concepts/plans 可以为空。

学习 aggregate 的 Concept、Quiz、Attempt、ConceptState、ReviewItem、StudyPlan、PlanRevision、Submission 结构和策略保持 v0.1 语义。外部字段投影为 project/projectId，Agent 输入不接收身份字段。

Evidence v2：Source 表示逻辑文档与 raw hash；原 PDF 独立 immutable archive。AssetGeneration 表示一种 PDF.js/vision/MinerU/text 规范化表示。Source.activeGenerationId 是搜索当前代；SourceChunk 的身份包含 source/generation/ordinal，原始 TXT 的 text-v1 identity 保留以兼容迁移。每个 PDF chunk 只能位于同一真实页，block 由系统编号。

Generation reservations / derived-file reservations 是容量和恢复账目，不是学习状态。失败任务保留已知 taskId 可显式恢复；未知提交状态不自动重复提交。[精确 contract](../contracts/evidence.md)。

Student dashboard / quiz result 是派生只读视图，不添加 durable fields；答题前不包含 correctOption/explanation，提交后可恢复反馈。
