# 验收矩阵

状态基于实际执行，不继承旧版本的发布结论。v0.1.0 完整验收固定见 [final-delivery](final-delivery.md)；下列为 v0.2 工作状态，精确代码/回执与本地/远端边界见 [CURRENT](../CURRENT.md)。verified 只对 Proof 所述版本、环境和范围成立；planned 表示尚待执行，blocked 表示已有明确外部阻塞，deferred 不属当前范围。真实模型、fake provider、完整 browser smoke 与演示录屏分别列示。

| Capability | Status | Proof |
|---|---|---|
| Workspace manifest / empty setup / one project | verified | workspace.test / workspace-recovery：双初始化幂等、A/B identity |
| official Session scope / 7 tools / no courseId | verified | workspace-tools；packed standard Agent与公开registry；无globalCourse入口 |
| Workspace-local state / old learner invariants | verified | workspace/learning/adaptation-boundaries/student/authoring；同一学习算法及回放校验 |
| A/B isolation / moved workspace | verified | workspace、workspace-recovery、packed Chromium A/B切换及还原 |
| TXT/Markdown assets / 200 sources | verified | generations；200接受/201拒绝；中英文/FTS/有界短词fallback |
| PDF.js archive / pages / locators / dedupe | verified | pdf、pdf-pipeline；实际PDF.js与Chromium binary upload |
| auto/high-accuracy orchestration / cache / failure | verified | pdf-pipeline使用fake vision：切回缓存代、失败保留此前active、扫描件local-fast拒绝与旧引用/重启；不证明真实模型解析质量 |
| PDF default / per-import override / deadline | verified | workspace-http真实上传：默认local-fast不调用视觉，显式high调用；client API 45秒/取消；Chromium默认选择与配置刷新保持手动选择 |
| original page tool bounds | verified | pdf-pipeline：非PDF/未知source/错误页/超4页拒绝；workspace tools作用域 |
| separate parsing/assetization state | verified | pdf-pipeline：local可用时仍标解析中；MinerU不能与未结束视觉解析竞争，取消保留local |
| MinerU official protocol2 adapter | verified | fake HTTP：health、task、poll、result、lost/failed/timeout、未知提交不自动重发 |
| atomic generation / old citation / quotas | verified | generations、MinerU：active-only search / historical read；失败派生预留与第11次拒绝；已失败MinerU重启不改Source快照；缓存代切换同步Latin/trigram与历史read |
| explicit v1 migration / original untouched | verified | migration：完整已评分fixture、概念/计划/练习/citations相同、重复幂等、原库hash不变 |
| native student UI / quiz / Weak→v2 | verified | packed Chromium：初始化/上传/工具卡片/键盘作答/丢包重试/刷新/错误恢复 |
| safe cards / pre-submit keys absent | verified | student/client + Chromium public payload/DOM/quiz_publish card；真实workspace ToolRuntime精简plan回执及浏览器3天/每日60分钟，旧plan回放兼容 |
| learning math / Markdown display | verified | math-browser-checks + packed Chromium：四种公式分隔符、真实 KaTeX 字体、公式选项点击、提交后解析/知识点/工具卡、错误 TeX 与 HTML/URL 回退；1440/1024/390 light/dark，长公式可滚动且计划不撑宽 |
| task sessions / draft / retry | verified | client task tests + packed Chromium：继承Workspace/model、自动发送、原草稿、继续不重发；task-session-port回归覆盖创建回执先于Workspace follow、取消/超时释放订阅和迟到导航 |
| long Chinese / final visual / soft-warning UI | verified | Chromium 1440/1024/390 light/dark截图；100条source投影；checkbox尺寸断言与PDF错误状态 |
| actual Harness LLM workspace QA / PDF | verified | 2026-09-13 newapi/gpt-5.6-luna实际search/read和准确citation；六场景与后续authoring回执的各自语义范围见 [golden path](golden-path.md#真实模型语义验收) |
| actual Harness outline/plan/quiz v0.2 | verified | 同日真实publish；计划口述不一致修复后，单独plan/quiz复验通过；不是最新checkout重新运行全场景 |
| actual multimodal / real MinerU | blocked | 最近外部验收时模型未声明 image、未配置官方 MinerU；本轮未重查运行环境或重跑服务 |
| standalone / final full regression | verified | 无sibling的新副本 frozen install/typecheck/156 tests/build/pack；本地5个demo和packed restart |
| Docker cold boot/restart at aad1263 | verified | 已保存的no-cache/new-volume/Chromium/auth/restart回执；与此前a0fa0c6运行文件等价，不覆盖后续本地修复 |
| Docker / GHCR v0.2.1 | verified | [镜像CI](https://github.com/Develata/learning-helper/actions/runs/34778266086)：b63399c构建镜像、冷启动、完整Chromium、认证/Origin、重启通过；Release回执与digest校验、空Docker凭据目录匿名pull通过 |
| v0.2 screenshots / captioned video | verified | 真实 packed Chromium、四张PNG、115秒H.264全片解码；作者draft为fixture，说明与入口见 [DEMO](../DEMO.md#仓库演示素材) |
| dependency scope review | verified | plugin production audit0；实际Docker runtime24条固定upstream风险，见COMPATIBILITY；不声称全部不可达 |
| no Harness runtime patch | verified | upstream c291e796 对 packages/apps 0 diff |
| vector/PKM/FSRS/multi-user/source deletion | deferred | 不在本轮范围 |
