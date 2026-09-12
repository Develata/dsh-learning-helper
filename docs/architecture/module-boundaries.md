# Module ownership

| 模块 | 拥有 | 可以依赖 |
|---|---|---|
| domain | Zod schema、实体、不变量、错误、证据限额 | zod |
| policy | mastery/hysteresis、ReviewQueue、replan；静态 grounding 指令 | domain、静态 preset guidance |
| services | Course 创建/元数据、唯一学习状态写入口、CourseAuthoringService 提案编排；Evidence 导入/检索/读取用例与 parser/store 端口 | domain、policy、端口 |
| providers | HarnessLearningStore；SqliteEvidenceStore；TextParser | services 端口/持久化校验、domain、公开 Harness API、Node SQLite/文件设施 |
| host | Cordis 生命周期、认证 HTTP、输入验证与结果投影 | services、providers、tools 注册 |
| tools | 读取/提案 Agent adapters、typed canonical output/render | services、公开 Harness tools/systemPrompt |
| client | Quiz/Plan/Progress/Course 展示与交互意图、取消与 UI state | type-only public projections、公开 slots/inputActions、Harness primitives |

LearningService 独占学习写用例；grading/策略不依赖 LLM、DB 或系统时钟，时间由 service 注入。EvidenceService 确认 Course 存在后调用 parser/store；SqliteEvidenceStore 只拥有 Evidence DB 和 FTS 投影，不能创建 Course。Learner 聚合不引用 corpus 文本，答题路径不调用 EvidenceStore。检索只读取 Course 元数据，不重放 Attempt。

providers 不反向调用 UI/tools，不 import Harness 私有实现。CourseAuthoringService 组合 LearningService 与 EvidenceService：验证 draft、解析同课程引用后调用 LearningService 的窄发布用例。LearningService 在现有 atomic update 内重验 active/setup/refs/幂等并写入；AuthoringService 和 tools 不访问 provider/DB。跨库只读 Evidence → 写 Learning，不新增事务设施。工具允许经过验证的 outline/initial plan/quiz 提案，资料导入仍是 Human/Application action。数学内容特化在 preset/demo；不建立 MathAnalysisService。

Student dashboard / quiz summary / result 是 services 的只读投影；LearningService 从单个 committed aggregate 调用纯 projection helpers。Client 不 import Host runtime、provider 或 AuthoringService，也不新增 durable fields。
