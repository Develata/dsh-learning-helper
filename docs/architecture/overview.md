# 系统结构

Harness 拥有 Agent runtime、模型、session、MCP、Web shell 和持久化基础设施。Learning plugin 拥有 Course、Evidence、Concept、Practice、Learner State、StudyPlan、ReviewQueue、PlanRevision。

依赖方向：Host / Agent tools / Client → application services → domain + policy；providers 实现 services 的端口，存储经 Harness storage-domain 接入。Client 只提交选项，Host 从私有答案生成 Attempt。

第一条 vertical slice：Quiz submission → 纯状态转换 → 每课程一次 durable update → 返回脱敏结果。状态与其证据作为单个课程聚合保存，以符合上游单记录原子写能力；不引入第二套 DB 或跨表补偿协议。

资料链路后续接入独立 DocumentParser / EvidenceIndex，不把课程语料伪装成 session history。未来能力必须通过 [integrations](integrations.md) 的窄边界加入。
