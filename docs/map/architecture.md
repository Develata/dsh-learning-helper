# 实现入口图

| 入口 | 用途 / 调用方向 |
|---|---|
| `src/index.ts::apply` | 打开两种 store、挂 Host routes、注册 tools/grounding；关闭时释放 |
| `src/host/http.ts::createHandler` | Harness 会话检查 → JSON 验证 → LearningService / EvidenceService |
| `src/services/learning.ts::createCourse/getCourse/listCourses` | 空 setup 创建与轻量元数据投影 |
| `src/services/evidence.ts::EvidenceService` | Course identity → hash/dedupe → parser → atomic import；只读 search/read |
| `src/providers/text-parser.ts::TextParser` | heading-aware、lossless、bounded chunks/locators |
| `src/providers/evidence-sqlite.ts::SqliteEvidenceStore` | 独立 schema/transaction/FTS、恢复与查询 |
| `src/tools/course-tools.ts::registerCourseTools` | 三个 retrieval tools + 唯一 grounding section |
| `src/tools/learning-tools.ts::registerLearningTools` | learning_state_get 与三 publish adapters；typed input/output |
| `src/services/authoring.ts::CourseAuthoringService` | strict draft → EvidenceService.read → LearningService.publishOutline/publishInitialPlan/publishQuiz |
| `src/domain/authoring.ts` | Draft schemas、DAG、规范化与输入数量界限 |
| `src/presets/math-analysis/guidance.ts` | 数学分析教学 guidance，无 storage/framework |
| `tests/authoring.test.ts` / `tests/learning-tools.test.ts` / `demo/math-analysis/authoring.ts` | grounded 发布、失败/幂等/并发与 backend 闭环 |
| `src/policy/grounding.ts::GROUNDING_POLICY` | 静态可信 grounding 规则，不含 corpus |
| `tests/evidence.test.ts` / `tests/course-tools.test.ts` / `tests/evidence-http.test.ts` | Evidence failure/bounds/restart、真实 registry 与 HTTP |
| `src/services/learning.ts::LearningService.submit` | 托管答案评分 → updateConcept → adaptPlan → 一次提交 |
| `src/domain/model.ts::aggregateSchema` | versioned 数据与跨实体一致性校验 |
| `src/services/state-schema.ts::learningStateSchema` | 结构校验 + policy 重放；create/update/重启共享 |
| `src/policy/adaptation.ts::updateConcept/adaptPlan` | 纯 mastery/hysteresis 与预算内未来日重排 |
| `src/providers/storage-domain.ts::HarnessLearningStore` | bounded queue → learningDomain → KvTable.update |
| `src/presets/math-analysis/demo.ts::demoCourse` | 显式 opt-in 自编 fixture，非 LLM/资料验收 |
| `tests/learning.test.ts` / `tests/adaptation-boundaries.test.ts` / `tests/http.test.ts` | 状态、重规划边界与 HTTP 行为证明 |
| `src/services/student.ts::studentDashboard/quizSummaries/quizResult` | 单 snapshot 派生安全学生读模型 |
| `src/client/index.tsx::apply` | native client 注册、header/blank composer 入口、sidebar/tool slots |
| `src/client/panel.tsx::LearningPanel` | 选课/分区/官方 composer 预填 → Host read models |
| `src/client/quiz.tsx::QuizForm` | 浏览器冻结提交身份 → Host submit → result 恢复 |
| `src/client/tool-model.ts::toolCardModel` | live/replay 安全卡片，只解析 canonical rendered result |
| `scripts/browser-smoke.mjs` / `tests/client` | packed Harness 浏览器闭环、故障/恢复/答案隔离与 client model |
| `scripts/harness-smoke.mjs` | 真正 packed profile install / Web restart smoke |
| `scripts/acceptance-llm.mjs` / `scripts/llm-probe.mjs` / `scripts/llm-trajectory.mjs` | 临时 packed profile → 真实 Harness Agent → sanitized 引用/发布回执；仅验收用 |
| `scripts/harness-checkout.mjs` | exact upstream 基线与 fork 运行时代码差异检查 |

CodeGraph 查询以上 symbol 定位源码/callers/callees，再读 [ownership](../architecture/module-boundaries.md)。Harness 查询：DomainFacility、KvTableImpl.update、WebServer.register、HostConnectionService.requestRejection；当前 tools/prompt 查询 defineTool、SystemPrompt.section；UI 查询 ClientModuleRegistry、SlotCore.register、SidebarRightService.openTab、InputActions。
