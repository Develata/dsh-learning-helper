# 真实 Harness Agent 验收

在 Harness Web → 设置 → 模型中配置 provider、模型与凭证，并选择默认模型。自定义 OpenAI-compatible route 也沿用官方设置。不要把 key 放进仓库、命令参数或验收 JSON。

```bash
pnpm acceptance:llm -- /absolute/path/to/learning-helper
```

入口确认固定 Harness runtime，再 build/pack，通过 `dsh plugin` 安装到临时 profile。settings-file / credentials-local 指向已有 `DSH_HOME`（缺省 `~/.dsh`）配置，不复制凭证，不直接调用模型 SDK。临时 Workspace、两库和会话与日常数据隔离，结束只清理本次临时目录。

真实 Agent 沿用 default model、standard preset、七个 Workspace-bound 正式工具和 grounding section。Observer 用 followup/whenIdle 驱动独占会话区间，再投影真实 session events，无 mock 或手写轨迹。每场景 180 秒、24 steps、30 calls、每次模型输出最多 8192 tokens；超限或尝试与场景无关的工具会取消并记失败，被保护性取消不能称为抗注入通过。

场景：Heine–Cantor QA；未覆盖的黎曼映射定理；读取 injection.txt；明确起始日期的 3 天计划；5 题综合练习；PDF 规范化页码引用。标准 Harness 的 todo_write/skill 属于允许的辅助工具，bash 等无关能力会使该验收场景失败。程序检查真实 search/read、引用 label/ref 精确匹配已读 chunk、read 在 publish 前、每个成功 outline/quiz 的所有引用均已读取，以及成功发布回执与完成状态。

`artifacts/llm-acceptance.json` 只存本机，记录版本/包摘要、provider/model、工具名、有界检索词、引用、答案和检查项；成功发布的 Quiz 仅提取题目/选项/key/解释/引用字段供数学审查，不复制其他 raw arguments。它是验收人员资料，不是学生界面。`semantic_review_required` **不是 PASS**：还需按 [v0.2 语义验收](../acceptance/golden-path.md#真实模型语义验收)检查并记录结论，不能引用 v0.1 的五场景证明。回执不能含 request headers、API key、cookie、launch token 或完整环境；artifacts 不入 Git。

每次运行覆盖默认回执。需要保留某次证明时，将已清理的 JSON 另存到 artifacts 内有明确名称的文件，记录 fullSuite、tested SHA/dirty 状态及 semanticReview 的范围。程序顶层状态可能仍为 semantic_review_required；只有程序通过加实际语义复核才能称相应范围 verified。

没有 credential 时是 `REAL LLM GATE: BLOCKED — credentials unavailable`，其余交付继续。凭证存在但请求或模型行为失败属于 failed，不能归咎于无凭证。

排障可设置 `LH_LLM_SCENARIOS=plan,quiz` 只复现 authoring；回执的 `fullSuite: false` 明确表示它不满足最终全场景验收。失败 publish 记录有界错误和计划 draft，便于诊断字段校验；最终验收不设置此变量。SIGINT/SIGTERM 会终止并等待本次子进程，记失败并清理隔离目录。

PDF 场景上传原创小型真实 PDF，再要求 Agent 使用 search/read 给出实际 page citation。A/B 资料隔离另以真实 authenticated Workspace API 验证。`LH_LLM_SCENARIOS=pdf,original` 可独立验证原件视觉：仅当所选 Harness model 声明 image 且 attachment 可用时执行，真实调用与 fake vision tests 分开记录。未声明能力必须 gate，不修改模型能力标记制造成功。

MinerU optional smoke 需要操作员配置可用官方自托管 protocol 2 endpoint；token 只通过 Host runtime 环境 LEARNING_HELPER_MINERU_TOKEN 提供。普通 CI 的 fake HTTP 完整协议测试不能代替该服务的实际质量验收。
