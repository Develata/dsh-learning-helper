# 产品范围

用户：短期备考大学数学分析/微积分的本科生，复习窗口 3–14 天。痛点是昨天的错误不能可靠改变今天的练习安排。

价值：Evidence + Learner State + Adaptive Action。评分取舍依次为完整闭环、Agent 功能、学习体验、外观、额外能力。

v0.1 交付范围：课程创建；Markdown/TXT 资料导入；引用式 QA；3 天计划；5 题交互 MCQ；确定性评分；Attempt/ConceptState/ReviewQueue 持久化；薄弱检测；实际重排与 PlanRevision；学生看到变更缘由。真实模型行为与部署验收独立于确定性功能证明，见 [最终验收](acceptance/final-delivery.md)。

P5 feature freeze：PDF/MinerU/OpenFile、模拟测验、简答题、FSRS、Anki、Obsidian、NotebookLM、DeepTutor、向量搜索均 deferred。v0.1 是本机单用户学习助手，沿用 Harness 浏览器认证；不提供多用户、教师/家长后台、社交、音视频教师、默认多 Agent、复杂知识追踪、通知/cron、用户删除 Source（避免引用悬空）。

首个 Demo 是 3-Day Adaptive Study Loop：Day 1 一致连续两次答错，Day 2 加入 20 分钟定向复习和 3 题练习，显示错误证据与计划差异。路径由 [golden-path](acceptance/golden-path.md) 定义；fixtures 仅证明业务逻辑，不能替代真实 Agent orchestration。
