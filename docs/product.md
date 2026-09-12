# 产品范围

用户：短期备考大学数学分析/微积分的本科生，复习窗口 3–14 天。痛点是昨天的错误不能可靠改变今天的练习安排。

价值：Evidence + Learner State + Adaptive Action。评分取舍依次为完整闭环、Agent 功能、学习体验、外观、额外能力。

MUST：课程创建；Markdown/TXT 与 PDF 资料导入；引用式 QA；3 天计划；5 题交互 MCQ；确定性评分；Attempt/ConceptState/ReviewQueue 持久化；薄弱检测；实际重排与 PlanRevision；学生看到变更缘由。

SHOULD：模拟测验、进度面板、计划历史、PDF 预览、简答题。COULD：FSRS、总结、Anki、Obsidian、NotebookLM、DeepTutor、向量搜索。WON'T v0.1：认证/多用户、教师或家长后台、社交、音视频教师、默认多 Agent、复杂知识追踪、大型向量库、通知与 cron。

首个 Demo 是 3-Day Adaptive Study Loop：Day 1 一致连续两次答错，Day 2 加入 20 分钟定向复习和 3 题练习，显示错误证据与计划差异。路径由 [golden-path](acceptance/golden-path.md) 定义；fixtures 仅证明业务逻辑，不能替代真实 Agent orchestration。
