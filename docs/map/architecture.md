# 实现入口图

| 入口 | 用途 / 调用方向 |
|---|---|
| `src/index.ts::apply` | 打开两种 store、挂 Host routes、注册 tools/grounding；关闭时释放 |
| `src/host/http.ts::createHandler` | Harness 会话检查 → JSON 验证 → LearningService / EvidenceService |
| `src/services/learning.ts::createCourse/getCourse/listCourses` | 空 setup 创建与轻量元数据投影 |
| `src/services/evidence.ts::EvidenceService` | Course identity → hash/dedupe → parser → atomic import；只读 search/read |
| `src/providers/text-parser.ts::TextParser` | heading-aware、lossless、bounded chunks/locators |
| `src/providers/evidence-sqlite.ts::SqliteEvidenceStore` | 独立 schema/transaction/FTS、恢复与查询 |
| `src/tools/course-tools.ts::registerCourseTools` | defineTool + systemPrompt.section，直接调用 application service |
| `src/policy/grounding.ts::GROUNDING_POLICY` | 静态可信 grounding 规则，不含 corpus |
| `tests/evidence.test.ts` / `tests/course-tools.test.ts` / `tests/evidence-http.test.ts` | Evidence failure/bounds/restart、真实 registry 与 HTTP |
| `src/services/learning.ts::LearningService.submit` | 托管答案评分 → updateConcept → adaptPlan → 一次提交 |
| `src/domain/model.ts::aggregateSchema` | versioned 数据与跨实体一致性校验 |
| `src/services/state-schema.ts::learningStateSchema` | 结构校验 + policy 重放；create/update/重启共享 |
| `src/policy/adaptation.ts::updateConcept/adaptPlan` | 纯 mastery/hysteresis 与预算内未来日重排 |
| `src/providers/storage-domain.ts::HarnessLearningStore` | bounded queue → learningDomain → KvTable.update |
| `src/presets/math-analysis/demo.ts::demoCourse` | 显式 opt-in 自编 fixture，非 LLM/资料验收 |
| `tests/learning.test.ts` / `tests/adaptation-boundaries.test.ts` / `tests/http.test.ts` | 状态、重规划边界与 HTTP 行为证明 |
| `scripts/harness-smoke.mjs` | 真正 packed profile install / Web restart smoke |
| `scripts/harness-checkout.mjs` | exact upstream 基线与 fork 运行时代码差异检查 |

CodeGraph 查询以上 symbol 定位源码/callers/callees，再读 [ownership](../architecture/module-boundaries.md)。Harness 查询：DomainFacility、KvTableImpl.update、WebServer.register、HostConnectionService.requestRejection；当前 tools/prompt 查询 defineTool、SystemPrompt.section；未来 UI 查询 ClientModuleRegistry、SlotCore.register、AgentPresets。
