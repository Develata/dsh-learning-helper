# v0.1 最终验收

Authority：P5 交付证明。产品范围由 [product](../product.md) 拥有；不重新设计 P1–P4。

| Gate | 必需证据 | 初始状态 |
|---|---|---|
| Real LLM | packed plugin + pinned Harness Agent；真实 search/read；答案引用逐项来自已读 chunk；数学人工检查；资料不足/注入；尽量覆盖 outline/plan/quiz | blocked：尚无已验证凭证 |
| Deployment | 固定源码 SHA、Node/pnpm/image digest；build --no-cache；新 volume 冷启动；浏览器创建/上传；重启持久化；Host/Origin/auth 未放宽 | planned |
| Product delivery | README 原创贡献与限制；原创讲义；2–3 分钟脚本；安全独立 demo 环境 | planned |
| Release review | 全回归、packed Chromium、standalone、依赖/许可/secret/diff 检查；六视角 review；两仓 clean 且 local=remote；runtime patch=0 | planned |

模型语义检查分两层：程序验证真实工具轨迹及 citationLabel/canonicalRef 精确匹配；人工检查连续性、紧致定义域假设、一致连续结论、证明逻辑、intuition 与 proof 区分。禁止只用关键词或另一个模型宣称数学正确。回执只存 provider/model、场景、工具名、引用与检查结果；不存 key/cookie/launch token。

缺少凭证时其他 gate 继续，最终必须明确 `REAL LLM GATE: BLOCKED — credentials unavailable`。全部非凭证 gate 通过仍不能宣称 fully accepted；真实模型也通过才考虑 v0.1.0 tag。P5 后停止功能开发。
