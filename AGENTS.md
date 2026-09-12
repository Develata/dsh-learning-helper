# Learning Helper — Agent 入口

目标：指定课程资料驱动的短期备考助手；产品核心是持久化的自适应学习闭环。始终中文交流。

- 本仓库拥有全部学习业务；`../learning-helper` 只拥有运行壳与发行层。禁止 submodule。未经证明确实无法使用 bundle/profile/Host/client/slot，不改 Harness core；push 需用户明确同意。
- 开工：本文件 → [docs router](docs/README.md) → [constitution](docs/constitution.md) → [CURRENT](docs/CURRENT.md) → 相关 architecture/contracts/acceptance。
- `.codegraph/` 存在时先用 CodeGraph 定位 symbol 与调用影响；字符串、配置和 Markdown 用 rg；少量明确文件直接读。索引不入 Git，代码变化后 sync。
- 默认单 Agent；仅独立验证或真正独立模块需要时委派。
- 修改必须通过匹配的测试，完成前检查 diff。业务变更同步 owner contract 与 acceptance，ownership 变更同步 architecture，长期决策写 ADR；内部重构不机械改文档。
- 每轮重写 CURRENT，不追加历史。最终回复包含“验证：”，明确未运行和未完成项。
- 独立 install/build/typecheck/test/pack 不可依赖 sibling checkout；Harness 集成验证可以依赖。不得把 fixture 测试称为真实 LLM 验收。
