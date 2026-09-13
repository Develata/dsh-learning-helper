# 验收矩阵

状态基于实际执行，不继承旧版本的发布结论。v0.1.0 完整验收固定见 [final-delivery](final-delivery.md)；下列为 v0.2 工作状态，最终命令/模型/远端状态由 [CURRENT](../CURRENT.md) 记录。

| Capability | Status | Proof |
|---|---|---|
| Workspace manifest / empty setup / one project | verified | workspace.test / workspace-recovery：双初始化幂等、A/B identity |
| official Session scope / 7 tools / no courseId | verified | workspace-tools；packed standard Agent与公开registry；无globalCourse入口 |
| Workspace-local state / old learner invariants | verified | workspace/learning/adaptation-boundaries/student/authoring；同一学习算法及回放校验 |
| A/B isolation / moved workspace | verified | workspace、workspace-recovery、packed Chromium A/B切换及还原 |
| TXT/Markdown assets / 200 sources | verified | generations；200接受/201拒绝；中英文/FTS/有界短词fallback |
| PDF.js archive / pages / locators / dedupe | verified | pdf、pdf-pipeline；实际PDF.js与Chromium binary upload |
| auto/high-accuracy mode / cache / failure | verified | fake vision 测试；实际模型能力为独立 gate |
| original page tool bounds | verified | pdf-pipeline：非PDF/未知source/错误页/超4页拒绝；workspace tools作用域 |
| separate parsing/assetization state | verified | pdf-pipeline：local可用时仍标解析中；MinerU不能与未结束视觉解析竞争，取消保留local |
| MinerU official protocol2 adapter | verified | fake HTTP：health、task、poll、result、lost/failed/timeout、未知提交不自动重发 |
| atomic generation / old citation / quotas | verified | generations、MinerU：active-only search / historical read；失败派生预留与第11次拒绝 |
| explicit v1 migration / original untouched | verified | migration：完整已评分fixture、概念/计划/练习/citations相同、重复幂等、原库hash不变 |
| native student UI / quiz / Weak→v2 | verified | packed Chromium：初始化/上传/工具卡片/键盘作答/丢包重试/刷新/错误恢复 |
| safe cards / pre-submit keys absent | verified | student/client + Chromium public payload/DOM/quiz_publish card |
| task sessions / draft / retry | verified | client task tests + packed Chromium：继承Workspace/model、自动发送、原草稿、继续不重发 |
| long Chinese / final visual / soft-warning UI | verified | Chromium 1440/1024/390 light/dark截图；100条source投影；checkbox尺寸断言与PDF错误状态 |
| actual Harness LLM workspace QA / PDF | verified | newapi/gpt-5.6-luna实际search/read和准确citation；最终全场景复核仍在进行 |
| actual Harness outline/plan/quiz v0.2 | verified | newapi/gpt-5.6-luna：真实publish；六场景程序检查加authoring回执修复后语义复核 |
| actual multimodal / real MinerU | blocked | 当前 newapi/gpt-5.6-luna 的公开 inputModalities 未声明 image；未配置官方 MinerU 服务 |
| standalone / final full regression | verified | 无sibling的新副本 frozen install/typecheck/145 tests/build/pack；本地5个demo和packed restart |
| v0.2 Docker cold boot/restart | planned | 仍需新的exact plugin SHA与独立volume验证；不替换用户v0.1实例 |
| no Harness runtime patch | verified | upstream c291e796 对 packages/apps 0 diff |
| vector/PKM/FSRS/multi-user/source deletion | deferred | 不在本轮范围 |
