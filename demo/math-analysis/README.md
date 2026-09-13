# 确定性演示与原创资料

从插件仓库根目录运行；每个命令创建并清理自己的临时目录，不接触日常 Workspace，也不调用外部模型。

| 命令 | 证明范围 |
|---|---|
| `pnpm demo` | 保留 v0.1 storage-domain 回归：预置五题，前三题正确、两道一致连续错误 → Weak → Day 2 重排 |
| `pnpm demo:evidence` | TXT/Markdown 导入、检索、read 与稳定引用 |
| `pnpm demo:authoring` | 已有 Learning/Evidence service 与真实 ToolRuntime 的作者闭环 |
| `pnpm demo:workspace` | v0.2 空 Workspace → 资料 → outline/plan/quiz → 错题 → Weak/v2 |
| `pnpm demo:pdf` | 实际 PDF.js 本地解析、页数与页码引用 |

预置学习数据定义在 [`demo.ts`](../../src/presets/math-analysis/demo.ts)，由演示脚本和测试显式加载。v0.2 Host 的 Config 为空，**不支持 `demo: true`**，也不会自动创建演示项目。

[`lecture-03.md`](lecture-03.md) 是项目原创讲义；`injection.txt` 是不可信资料测试文本。可复现的当前 Web 视频、截图及录制方式见 [DEMO](../../docs/DEMO.md#仓库演示素材)。真实模型行为另按 [Agent 验收](../../docs/operations/real-llm.md) 检查，fixture 不代替它。
