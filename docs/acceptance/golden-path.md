# Golden path v0.2

1. 在 Harness 创建/选择本地 Workspace A，打开 Learning，初始化项目 metadata。
2. 上传 lecture-03.md；Ready、canonical asset、hash dedupe。
3. 真实 Agent 按当前Session检索/read；课程问答引用必须精确匹配实际阅读回执。
4. 用户请求三天计划：Agent读取证据→grounded outline→初始v1。随后请求五题→quiz_publish。
5. 普通卡片和publicQuiz不显示答案。学生故意错两道一致连续，提交。
6. deterministic grading→5 Attempts→Weak→ReviewQueue→PlanRevision v1→v2，Day2新增20分钟review+3题；UI解释真实错误，刷新恢复。
7. 从计划任务新建学习会话，沿用Workspace/model，冻结开场请求自动发送；继续仅导航，丢包重试同identity。
8. 上传小PDF local-fast；原件archive不可变，localgeneration page-aware；search/read显示原PDF真实页码。
9. 对复杂页用available的Harness vision；不可用显示gate。模拟/真实MinerU需分别标注：异步转换→canonicalMarkdown→activegeneration切换；旧Quiz/Concept引用仍可read，原件不删。
10. 切Workspace B：无A的state/source/quiz。回A完整恢复。停Host、移动A并重新注册：manifest identity、相对路径、DB/citation保持。

Deterministic gate：`demo:workspace`、`demo:pdf`、workspace/pdf/mineru/migration测试、packed Chromium。真实模型/外部MinerU是独立gate；不以fixture脚本冒充模型自主行动。v0.1迁移须用offline副本验证，禁止覆盖工作中的项目。实际状态见matrix/CURRENT。

真实模型记录（2026-09-13）：newapi/gpt-5.6-luna 实际通过 QA、资料不足、注入、outline/plan、quiz、PDF 六场景的工具/引用检查。人工数学核对确认 Heine–Cantor 子列反证有效、没有伪造课程引用、5题 keys/解释正确。审查发现计划口述分钟数不一致，精简 render 为确定性日总时长后单独重跑 authoring，两次发布及语义复核通过。原失败与修复后回执均保留本地 artifacts；不声称一次run从未失败。

检索次数等 prompt 建议并非代码硬限（一次资料不足问题进行了4次搜索）；回答以证据和持久化状态为准。当前模型未声明 image，原件视觉 real smoke capability-gated；MinerU 只有 fake官方协议及浏览器真实连接失败验证，未声称实际外部转换质量已验收。
