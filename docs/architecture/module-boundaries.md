# Module ownership

| 模块 | 拥有 | 可以依赖 |
|---|---|---|
| domain | Zod schema、实体、不变量、错误 | zod |
| policy | mastery/hysteresis、ReviewQueue、确定性 replan | domain |
| services | 提交/读取用例、唯一学习状态写入口、组合 schema 与 policy 的持久化校验 | domain、policy、存储端口 |
| providers | storage-domain adapter；后续 Parser/EvidenceIndex | services 端口/持久化校验、domain、公开 Harness API |
| host | Cordis 生命周期、HTTP 校验与结果投影 | services、providers |
| tools（后续） | Agent-visible proposal/read adapters | services、Harness tools |
| client（后续） | Quiz/Plan/Progress/Evidence 展示、交互意图 | Host wire contract、公开 slots |

只有 application services 触发学习状态写入；grading 与策略为纯函数，不依赖 LLM、时钟或 DB。真实时间由 service 注入一次；HTTP 不接受客户端提供 correct/mastery/submittedAt。providers 不反向调用 UI/tools。数学课程特化放 preset/demo，不定义 MathAnalysisService。
