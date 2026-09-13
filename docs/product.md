# 产品范围

用户：短期备考的本科生，首批数学分析/微积分，复习窗口3–14天。产品价值是把错题证据持续转化为接下来的学习行动，而非只回答当前问题。

**v0.2：One Workspace = one Learning Project。** 学生在 Harness 选择本地 Workspace，然后启用学习能力；资料、原件、canonical assets、学习状态、计划和练习历史都随 Workspace 保存和移动。没有插件全局课程列表。

保留完整闭环：Evidence → Agent grounded outline/initial plan/quiz → student MCQ → deterministic Attempt/ConceptState/ReviewQueue → adaptive PlanRevision → 学生看到为什么改变。一个计划任务可新建多个学习会话，新建自动发送学习请求，继续已有会话不重发。

资料：TXT/Markdown 直接成为 canonical asset；PDF 本地快速解析带页码证据，自动/高精度由当前 Harness 模型的 image 能力决定。可选外部官方 MinerU API 转换为长期 Markdown；失败不破坏已有证据。正常检索 canonical generation，只有歧义/图表/公式/出处核验才检查原件页面。

优先级仍是完整闭环、Agent行为、学生体验、外观、额外能力。领域代码拥有学习事实，模型提出 draft；材料与模型输出不拥有规则权限。结构/出处验证不等于数学正确性证明。

仍不做：多用户/独立认证、教师后台、社交、语音、视频、通知/cron、FSRS、向量库、Obsidian/NotebookLM/DeepTutor/OpenFile集成、Source删除。只支持本地单Host文件系统，SQLite不承诺NFS/SMB/云盘同步挂载安全。真实模型/MinerU可用性与实际验收状态见 [matrix](acceptance/matrix.md) / [CURRENT](CURRENT.md)。

v0.1.0 保留为已验收版本；升级必须显式[迁移](operations/migration-v1.md)，不启动时静默重置旧数据。核心演示仍是：两次一致连续错误 → Weak → 明天20分钟复习和3道针对题。
