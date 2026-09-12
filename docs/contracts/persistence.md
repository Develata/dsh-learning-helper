# Persistence contract v1

学习真值：LearningAggregate，存储 domain `learning_helper` version 1，table `courses`，key = course.id。仅 services 通过 provider 写入；不要原地修改 storage-domain 返回对象。

提交在一个 atomic update 内完成：验证 quiz/选项 → Attempt → ConceptState → ReviewQueue → StudyPlan 新版本 + PlanRevision → submission receipt。任何校验或持久化失败都不得暴露部分状态。所有 durable read 和 write 必须通过 schema；版本不兼容或损坏时拒绝打开，不重置数据。

持久化边界使用 `services/state-schema.ts::learningStateSchema`：组合 domain 结构/引用校验与现有 mastery policy 的 Attempts 重放，检查存储的 mastery/status。创建、更新、重启加载使用同一边界；重放只校验，不静默修复。ReviewItem/PlanRevision 的 evidenceAttemptIds 必须互异且全部引用真实错误。v1 策略若改变，需要明确版本与迁移，不能让新算法直接解释旧状态。

Idempotency：submissionId 全课程唯一；同 ID 同 quiz/相同选项重试返回既有 receipt，无重复 Attempt/revision；同 ID 不同内容冲突；相同 quiz 用另一 ID 重提冲突。并发通过 provider 队列和 storage-domain update 串行化，单 Host 进程拥有该 DB；不支持多 Host 同写。

Mastery：初值 0.5；正确非减、错误非增，easy/medium/hard 步长分别为 0.1/0.15/0.2，分数限制到 [0,1]；最近 5 次为窗口。连续两错进入 weak；weak 需连续两对才退出。非 weak 时，至少 4 次证据且 mastery ≥ 0.8 为 strong，至少 2 次且 ≥ 0.6 为 okay，其余有证据为 learning、无证据为 unknown。UI 只显示状态标签，非概率。ReviewQueue 由 weak 概念派生，保留实际错误证据。

Replan：只在新进入 weak 时尝试修订严格未来的下一天。加入 20 分钟 review + 3 题 practice（10 分钟），保留已完成任务，挤出/缩短未完成任务以满足每日预算和每天最多 50 个任务的限制。时间或任务槽不足以容纳完整 review/practice 对，或没有未来日时，保持 ReviewQueue，不阻止判分、不伪造修订；旧计划完整保留。生成的任务 ID 在整个计划中唯一。重复错题而仍 weak 不重复改计划。解释中的概念名最多摘取 160 个 Unicode code points，完整名称仍由 Concept 保存，避免合法长名称使生成的 reason 超过 schema 上限。

资源上限：单课程 200 quizzes / 4000 attempts / 100 plan revisions；超限明确拒绝，绝不静默删学习证据。令 N 为聚合大小、C 为概念数、A 为 Attempt 数；当前校验/策略包含按概念扫描 Attempts，时间 O(N + C×A)、空间 O(N)，C ≤ 100。限额内优先一致性；未来扩大规模需新 ADR 与迁移。

失败由 Host 返回稳定 code；客户端超时不证明未提交，应使用原 submissionId 重试。SQLite 锁冲突直接失败，无后台无限重试。

Course setup 允许 concepts/conceptStates/plans 为空；这是兼容旧完整聚合的 v1 schema relaxation。createCourse 只接收 id/title/subject/examAt?/dailyMinutes，由 service 初始化空集合与 Host 时间。getState.plan 可以为 null；没有已发布 quiz 返回 not-found，没有 initial plan 拒绝提交（conflict）。Source/corpus 不进入该聚合，独立存储见 [Evidence](evidence.md)。

P3 发布沿用同一 learning domain version 1，不新增持久化字段/表。Draft 是独立输入 schema，转换规则见 [Agent tools](agent-tools.md)。Outline、初始 plan、quiz 分别在一次 aggregate update 内落盘；ConceptState 由 initialConceptState 生成，Agent 无权填写。发布引用只来自已验证 Evidence，存储的是 canonical refs；全文留在 evidence.db。Outline 与 v1 plan 的规范化内容直接用于重试比较，quiz 使用内容派生身份，无 command ledger。只有原 P1 policy 可以追加 adaptive PlanRevision。
