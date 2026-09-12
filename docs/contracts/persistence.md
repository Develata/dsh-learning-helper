# Persistence contract v1

唯一真值：LearningAggregate，存储 domain `learning_helper` version 1，table `courses`，key = course.id。仅 services 通过 provider 写入；不要原地修改 storage-domain 返回对象。

提交在一个 atomic update 内完成：验证 quiz/选项 → Attempt → ConceptState → ReviewQueue → StudyPlan 新版本 + PlanRevision → submission receipt。任何校验或持久化失败都不得暴露部分状态。所有 durable read 和 write 必须通过 schema；版本不兼容或损坏时拒绝打开，不重置数据。

Idempotency：submissionId 全课程唯一；同 ID 同 quiz/相同选项重试返回既有 receipt，无重复 Attempt/revision；同 ID 不同内容冲突；相同 quiz 用另一 ID 重提冲突。并发通过 provider 队列和 storage-domain update 串行化，单 Host 进程拥有该 DB；不支持多 Host 同写。

Mastery：初值 0.5；正确非减、错误非增，difficulty 调整步长；最近 5 次为窗口。连续两错进入 weak；weak 需连续两对才退出。UI 只显示状态标签，非概率。ReviewQueue 由 weak 概念派生，保留实际错误证据。

Replan：只在新进入 weak 时尝试修订严格未来的下一天。加入 20 分钟 review + 3 题 practice（10 分钟），保留已完成任务，挤出/缩短未完成任务以满足每日预算。容量不足或没有未来日时保持 ReviewQueue，不伪造修订；旧计划完整保留。重复错题而仍 weak 不重复改计划。

资源上限：单课程 200 quizzes / 4000 attempts / 100 plan revisions；超限明确拒绝，绝不静默删学习证据。每次提交拷贝和验证课程聚合，时间/空间 O(课程聚合大小)，限额内优先一致性；未来扩大规模需新 ADR 与迁移。

失败由 Host 返回稳定 code；客户端超时不证明未提交，应使用原 submissionId 重试。SQLite 锁冲突直接失败，无后台无限重试。
