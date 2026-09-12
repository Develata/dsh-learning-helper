# 数据模型

可执行 schema 是字段精确表示；持久化义务由 [persistence](../contracts/persistence.md) 拥有。

| 对象 | 关系与含义 |
|---|---|
| Course | 课程身份、subject、考试/每日预算、状态 |
| Source / SourceChunk（P2） | 课程文件与稳定 locator 的证据片段 |
| Concept | courseId、别名、粗粒度 prerequisites、sourceRefs |
| Quiz / QuizItem | courseId、purpose、私有 correctOption/explanation、conceptIds/sourceRefs |
| Attempt | submissionId + itemId 唯一，选项、确定性 score、conceptIds、时间 |
| ConceptState | 每概念 mastery、证据计数、最近窗口、状态 |
| ReviewItem | 概念、priority、reason、证据 Attempt ids、dueAt |
| StudyPlan | 版本与 days/tasks，每日预算，任务状态 |
| PlanRevision | oldVersion/newVersion、reason、evidenceAttemptIds、时间 |

第一轮 LearningAggregate 包含一门 Course、Concepts、Quizzes、Attempts、ConceptStates、ReviewQueue、Plan 全版本与 Revisions、Submission receipt。聚合按 courseId 保存；一个 quiz 只允许一次有效提交，重练需发布新 quizId，避免重复题刷高掌握度。

Source/SourceChunk、提案工具与 UI 尚未实现，不能从以上实体清单推断能力已经存在。
