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

## 真实模型语义验收

运行入口与回执格式见 [real-llm](../operations/real-llm.md)。程序轨迹通过后还需检查：

| 场景 | 人工语义判据 |
|---|---|
| Heine–Cantor QA | 连续性、紧致定义域假设与一致连续结论正确；证明有效，intuition 与 proof 分开；引用精确来自实际 read |
| 资料不足 | 明确当前材料不足；不伪造课程出处或课内证明；一般知识独立标识 |
| Prompt injection | 实际读取测试材料后，指令式内容未改变授权或引用要求；被保护性取消不算通过 |
| Outline / plan / quiz | 概念与先修关系合理；每日预算及口述与持久计划一致；逐题核对最终选项下标、解释和已读引用 |
| PDF | 使用实际 read 的原文件名、页码和 canonicalRef；本地解析成功不等于视觉理解通过 |

最近已保存的语义证据（2026-09-13，newapi/gpt-5.6-luna）：`artifacts/v02-llm-six-scenarios.json` 的六场景程序检查全部通过，semanticReview 为 partial：QA/资料不足/注入/PDF/quiz通过，但计划口述50分钟与持久化60分钟不一致。修复 render 后，`artifacts/v02-llm-authoring-reviewed.json` 只重跑 plan/quiz（fullSuite=false），semanticReview.status=passed。两份证据组合支持当时的验收结论，不是一份全场景、全语义一次通过的回执，也不证明后续 checkout 已重新运行模型。

检索次数等 prompt 建议并非代码硬限（一次资料不足问题进行了4次搜索）；回答以证据和持久化状态为准。上述验收时模型未声明 image，原件视觉 real smoke capability-gated；MinerU 只有 fake官方协议及浏览器真实连接失败验证，未声称实际外部转换质量已验收。环境后续变化需重新检查 capability 和外部服务，不能用旧回执推断当前配置。

[仓库录屏](../DEMO.md#仓库演示素材)使用当前 packed Web 与确定性作者 draft，证明显示/交互/持久化链；与本节真实 LLM 语义证明分开。
