# 实现入口图

| 入口 | 用途 / 调用方向 |
|---|---|
| `src/index.ts::apply` | 打开学习 store，挂 Host route；关闭时释放 |
| `src/host/http.ts::createHandler` | Harness 会话检查 → JSON 验证 → LearningService |
| `src/services/learning.ts::LearningService.submit` | 托管答案评分 → updateConcept → adaptPlan → 一次提交 |
| `src/domain/model.ts::aggregateSchema` | versioned 数据与跨实体一致性校验 |
| `src/services/state-schema.ts::learningStateSchema` | 结构校验 + policy 重放；create/update/重启共享 |
| `src/policy/adaptation.ts::updateConcept/adaptPlan` | 纯 mastery/hysteresis 与预算内未来日重排 |
| `src/providers/storage-domain.ts::HarnessLearningStore` | bounded queue → learningDomain → KvTable.update |
| `src/presets/math-analysis/demo.ts::demoCourse` | 显式 opt-in 自编 fixture，非 LLM/资料验收 |
| `tests/learning.test.ts` / `tests/adaptation-boundaries.test.ts` / `tests/http.test.ts` | 状态、重规划边界与 HTTP 行为证明 |
| `scripts/harness-smoke.mjs` | 真正 packed profile install / Web restart smoke |
| `scripts/harness-checkout.mjs` | exact upstream 基线与 fork 运行时代码差异检查 |

CodeGraph 查询以上 symbol 定位源码/callers/callees，再读 [ownership](../architecture/module-boundaries.md)。Harness 查询：DomainFacility、KvTableImpl.update、WebServer.register、HostConnectionService.requestRejection；未来 UI/tools 查询 ClientModuleRegistry、SlotCore.register、defineTool、AgentPresets。
