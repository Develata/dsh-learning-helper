# ADR-0002：结构化学习状态

状态：accepted（用户指定，2026-09-12）。

聊天 memory 无法提供可重放、可验证且一致的评分与学习轨迹。Attempt、ConceptState、ReviewQueue、StudyPlan、PlanRevision 保存为 schema versioned domain data；LLM 只能读取或提交受验证的内容提案。评分与 adaptation 由确定性代码执行。

初版用每课程聚合一次写入容纳整个反馈闭环，匹配 Harness 单记录原子写。避免跨表部分提交，代价为聚合拷贝/序列化成本；采用明确限额，未来扩大课程规模时需要迁移设计。教学/语言偏好才适合 memory。
