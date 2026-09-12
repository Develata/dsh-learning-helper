# 当前状态

- Current phase：P5 / v0.1 feature freeze。实现与验收完成；不启动 P6。最终部署 pin、镜像与远端发布回执由 fork 的 UPSTREAM_BASE / deploy/learning-helper 拥有。
- Last known good code：`21d71591ac4f24f2acb48259722005a260280dcd`（随后仅冻结文档）。Harness runtime 固定 `c291e7961a515f6d7af9304e7fd1d257929aef26` / 0.1.5-rc.2，packages/apps 0 patch；Node 24.18.0、pnpm 11.7.0。
- What works：TXT/MD → Evidence → grounded outline/plan/quiz → 作答 → deterministic Attempt/Weak/ReviewQueue/v2；原生 Learning panel、反馈、Why changed、重试/刷新/双库重启。完整能力见 [matrix](acceptance/matrix.md)。
- Real LLM：2026-09-12，官方 Harness Agent + packed plugin，`newapi / gpt-5.6-luna`；QA、资料不足、实际读取注入资料、outline/3-day plan/5-item quiz 全部通过程序与逐项语义检查。真实轨迹与数学检查在本机 artifacts/llm-acceptance.json；不是 mock。语义范围见 [final acceptance](acceptance/final-delivery.md)。
- Deployment：固定源码/image digest 的 multi-stage Docker；全新 volume / no-cache build / Chromium / restart persistence / auth+Origin 通过。non-root、loopback byte bridge、预构建 profile，启动不 install。最终 plugin SHA 推送后再由 fork 锁定并复验同一发行路径。
- Verification（2026-09-12）：typecheck；100 tests（92 backend/script + 8 client）；build；三个 demo；pack；packed Harness + Chromium；无 sibling install/peers/typecheck/tests/build/pack；CodeGraph sync；diff/secret/license/audit review。1440 light/dark、1024、390、键盘/长中文/错误态已自审。
- Known limits：TXT/MD only，单用户本机；Quiz 普通文本，citation deep-link 未交付。普通 UI 提交前隐藏 key，但 raw session/debug/export 不是考试安全边界。模型质量仍需判断；样例验收不保证未来每次生成。固定 Harness runtime 有 24 条已分类 advisory，未盲目升级；见 final acceptance。没有已确认的本轮范围内遗留 correctness failure。
- Next 3 tasks：① 按 [DEMO](DEMO.md) 录制真实课程演示；② 提交固定版本及两仓地址；③ 完成课程验收后，再由用户决定是否长期维护。PDF/外部集成/FSRS/多用户 deferred。
