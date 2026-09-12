# Agent tools（P3 planned）

遵循 Harness defineTool，按学习 preset 显式注册；Host 存储不因 tool 被调用才初始化。工具返回值由 Harness session log 承载模型可见证据。

| 候选 tool | 输入 → 输出 | side effect |
|---|---|---|
| course_search | courseId/query/limit → 引用摘要 | 无 |
| course_read | courseId/chunkIds → 原文与 locator | 无 |
| learning_state_get | courseId → ConceptState/ReviewQueue | 无 |
| study_plan_get | courseId → 当前计划/变更证据 | 无 |
| study_plan_publish | validated draft + expectedVersion → plan | 提交经过校验的计划提案 |
| quiz_publish | QuizDraft → 无答案 public quiz | 验证 concept/source 后保存私有 key |
| quiz_result_get | courseId/quizId → 已提交结果 | 无 |
| course_outline_publish | CourseOutlineDraft → concepts | schema/source/prerequisite validation 后 commit |

尚未注册这些工具；名称与 JSON schema 会在 P3 实现时对齐精确 TypeScript 定义。不暴露 record_attempt、update_mastery、set_correct、raw_sql 或任意 state mutation。未知课程/引用、版本冲突、invalid draft、资源超限必须失败；工具不得把模型提供的正确性当评分事实。
