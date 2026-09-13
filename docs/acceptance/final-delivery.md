# v0.1 最终验收

Authority：**v0.1.0 / P5 历史交付证明**，固定插件 `958cf67627736232d06a9eeee70cdcb2c0369248`、运行壳 `8a47b6d55f6c603d4c8b90159b30f361e228611b`。下文五场景、100 tests、两张截图及 TXT/Markdown 风险适用性均指该版本，不是当前 Workspace/PDF 开发版。

历史产品范围见 [v0.1.0 product 快照](https://github.com/Develata/dsh-learning-helper/blob/v0.1.0/docs/product.md)；当前版本改读 [v0.2 matrix](matrix.md)、[golden path](golden-path.md) 与 [CURRENT](../CURRENT.md)。本地 `artifacts/*` 是可重跑覆盖的非版本化输出，不能仅凭同名文件认定它仍是 v0.1 回执。

| Gate | 必需证据 | 状态 |
|---|---|---|
| Real LLM | packed plugin + pinned Harness Agent；真实 search/read；答案引用逐项来自已读 chunk；逐项数学语义检查；资料不足/注入；尽量覆盖 outline/plan/quiz | verified：2026-09-12 / newapi / gpt-5.6-luna；五场景程序 + 逐项语义检查 |
| Deployment | 固定源码 SHA、Node/pnpm/image digest；build --no-cache；新 volume 冷启动；浏览器创建/上传；重启持久化；Host/Origin/auth 未放宽 | verified：发行脚本已通过；最终插件 pin 的回执由 fork 持有 |
| Product delivery | README 原创贡献与限制；原创讲义；2–3 分钟脚本；安全独立 demo 环境 | verified：README、DEMO、两张实际浏览器截图、MIT notices |
| Release review | 全回归、packed Chromium、standalone、依赖/许可/secret/diff 检查；六视角 review；runtime patch=0；远端发布回执单独由 fork 记录 | verified：100 tests、浏览器/独立安装通过；审查范围与已知 upstream 风险见下文 |

模型语义检查分两层：程序验证真实工具轨迹及 citationLabel/canonicalRef 精确匹配；逐项检查连续性、紧致定义域假设、一致连续结论、证明逻辑、intuition 与 proof 区分。禁止只用关键词或另一个模型宣称数学正确。回执只保留投影后的 provider/model、场景、工具名、引用、答案/题目与检查结果供语义审查；不存 API key/cookie/launch token。

当时的发布门槛要求真实模型通过后才打 v0.1.0 tag，缺凭证不能宣称 fully accepted。该 tag 已发布并保持冻结；后续经用户授权的 v0.2 不重写此 release。

## 真实模型结论（2026-09-12）

官方 Harness Agent，provider `newapi`，model `gpt-5.6-luna`。QA 实际 list/search/read，正确给出连续实函数、紧致闭区间与一致连续结论，子列反证有效，直觉和证明分开，充分/必要关系明确；所有 citation label/ref 与实际已读片段精确匹配。资料不足场景明确拒绝课程内证明，课外背景独立标识，不把该证明思路验收为完整证明。注入场景实际读 injection.txt，保持有效引用且无无关/破坏操作。

Authoring：真实读取资料后发布五个自然概念及 DAG、三天每天 60 分钟的 v1、五题练习。逐题检查五个 0-based 正确选项下标及解释；所有概念/题目引用均来自发布前实际 read。本次结果是语义样例，不是固定题库。

回执的 `semantic_review_required` 经 Codex 逐项数学检查后记 `passed`；没有另建自动 LLM judge。被拒绝的早期回执保留本地，发现的问题已修复并复验。这证明当前样例可由真实模型完成，不保证所有未来输出正确。学生提交与重排/浏览器故障恢复由独立确定性 assembled tests 证明，不冒充同一条全自主录像。

## 依赖审查（2026-09-12）

`pnpm audit --prod`：插件直接 production dependency（Zod）及独立插件完整依赖 audit 均为 0 advisory。固定 Harness workspace 报告 38 项；从实际 Docker 镜像提取 package/lock 后审查的生产集合为 **24 项：11 high / 12 moderate / 1 low / 0 critical**。两者范围不同，不能用插件的 0 掩盖 Harness 的风险；本机原始 JSON 在 artifacts，未提交。没有盲目升级/override pinned ecosystem。

| 分类 | 观察与处置 |
|---|---|
| actionable / 已修复 | P5 自有桥接保持 Host/Origin/auth，body/source 有界，secret 不进入镜像或回执；本轮代码发现的问题由测试/真实模型复验。 |
| transitive / pinned upstream | js-yaml（3 项）、fast-uri（6 项）、ip-address（3 项）、protobufjs（1 项）、hono（7 项）、@hono/node-server（1 项）、qs（2 项）、sharp（1 项）。保留固定版本与风险事实，不宣称全部不可达。 |
| 本课程路径不适用 | TXT/Markdown 作为纯文本解析，不调用 YAML、URI 校验库、protobuf、图片解码或 Hono body/static parser；学习 Host 路由直接使用 Harness webServer，JSON body/schema/课程 ownership 自有校验。 |
| 限制 | Harness 的其他工具、图片附件、MCP 等仍可能触及这些传递组件，未做全 runtime exploit 验证。本机单用户、loopback-only 是交付边界，不等于漏洞修复；公网/不可信代理共享部署不受支持。 |

代表性来源：[js-yaml merge CPU](https://github.com/advisories/GHSA-52cp-r559-cp3m)、[js-yaml empty merge](https://github.com/advisories/GHSA-2883-xcg3-v3hh)、[fast-uri authority](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx)、[sharp/libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)。版本和分类基于实际 lockfile/audit；漏洞适用性判断限于上表所述代码路径。

## 已修复的发布问题

- 检索说明未表达正文 AND/literal 规则：补全模型可见说明，单主题/分语言/缩短空查询；不改变 P2 算法。
- 原创讲义的充分/必要措辞和极限量词不完整：补齐定义与聚点前提，明确闭区间不是一致连续的必要条件。
- 真实模型出现不精确引用：grounding 明确精确 Markdown label/ref；验收按实际 read 的时序匹配，失败发布不再冒充成功回执。
- 无资料时过度展开课外证明：收紧既有指引，资料不足必须明确说明，补充知识分区且不能冒充已验证课程证明。
- 计划任务 questionCount 的无效组合：公开工具 schema 区分 learn/review 与 practice，错误返回字段路径；不放松 Domain。
- 真实题目的答案下标曾与解释不符：在字段说明与教学指引中要求按最终数组逐题核对 0-based index；语义验收逐题检查实际选项，不以工具成功代替数学正确。
- 作者引用了只在 outline 看过 ID 的 chunk：验收新增所有已发布 concept/item 引用的实际读取检查及负例测试。
- 模型按主题虚构“今日 Day 3”：练习按主题描述，仅根据明确日期或用户选择关联日次。
- 验收工作目录继承工程 Agent 上下文：改为隔离学生 workspace；SIGTERM 终止并等待本次子进程。
- 可移植 profile 缺 peer providers：从固定 Harness 公开 runtime closure 导出，并为已声明 peers 建立显式链接；少量不同版本 peer 来自插件 frozen lock，未改 Harness core。
- Quiz 发布确认重复出处造成 label 缩写：给模型发送简洁发布摘要，canonical public value 不变；卡片兼容摘要及历史完整结果，实际 Chromium 复验开始入口与 replay。
- Docker patch 参数顺序与 source 配置组合错误：按真实 CLI 顺序传入，测试 patch 保留 evidencePath；新 volume 实际复验。

## 最终检查范围

学生/评分者：README 与 2–3 分钟 Demo 直接呈现错题→Weak→v2→原因；Quiz、Plan 两张截图来自真实浏览器。Agent：七个正式工具、只有用户学习动作授权发布、source 从不拥有指令 authority。开发/维护：独立 install/typecheck/test/build/pack，双库 ownership 不变，runtime 0 patch，版本锁与 docs owner 清晰。

安全/恢复：public quiz、dashboard、普通 tool card/DOM 提交前不含 key；auth/Origin/wrong-course、资料与输出上限、取消/失败、重复提交/响应丢失、刷新/重启均覆盖。性能检查针对容量与等待上限，未做微优化。1440 light/dark、1024、390、长中文/数学名、空/错态、键盘/focus/radio labels 经实际 Chromium 自审；不声称完整 WCAG 或所有 runtime 组件的渗透测试。

本机回执：`artifacts/llm-acceptance.json`、`integration-result.json`、`standalone-result.json`、`docker-result.json`、audit JSON 和 browser 截图。只提交高密度结论，不提交 DB、凭证、缓存或整份 session。最终部署 SHA、无缓存镜像与远端发布结果由 fork 发行记录拥有，避免把 final commit 自己的 SHA 写进自身。
