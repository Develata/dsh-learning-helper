# 当前状态

- Current phase：v0.2 体验改进：插件数学公式显示已接入并通过 packed Web/Chromium 验收。仍在 feat/workspace-v02，未打 tag、未合入默认分支、未更新日常实例。
- Last verified runtime：0ffef0df3e4d5ab01aa90f21d608a048c68a764f（数学显示与回归测试）；后续提交仅文档。当前远端/运行壳 pin 仍是此前 a0fa0c6a851cb106ac00b02b3381b5c126110837，尚未发布本次数学 UI 更新。v0.1.0仍指向958cf67627736232d06a9eeee70cdcb2c0369248，upstream仍为c291e7961a515f6d7af9304e7fd1d257929aef26。
- Works：官方Session→Workspace→单Project；7 tools无courseId，无global picker/learning DB；Workspace内state/evidence、稳定manifest、relative assets、200/201 source边界；PDF.js/原件/page citation；gated vision/cache、MinerU protocol2、atomic generation/historical read；显式offline v1迁移保留原库；原学习闭环与任务会话保留。 学习内容统一经公开MarkdownText/KaTeX渲染：题目/选项/解析/知识点/计划/tool cards；无新增依赖，未改Host/Domain/持久化。
- Verification：本轮typecheck、146/146（126 backend+20 client）、build/pack、3个原学习demo通过；无sibling的新临时目录frozen install/typecheck/tests/build/pack通过；packed标准Agent/认证/A-B/restart及Chromium通过。数学专项：四种分隔符、KaTeX字体、公式选项点击、键盘、提交后解释、错误TeX/code/currency/HTML/URL安全、长公式横向滚动；1440light/dark、1024、390实际截图审查，pageErrors=[]。回执artifacts/integration-result.json与/tmp/lh-math-browser/result.json；Browser plugin not available，使用现有Playwright 1.61.1。CodeGraph sync与Harness runtime 0 diff通过。
- Docker：历史已验证runtime aad1263221da277f70ca1d724aff4e83fad29be2从固定远端源码build --no-cache，新volume冷启动、Chromium、认证、容器重启持久化通过；image b928a43414dc76156a482bd7dfb7026032a6ea205cdbf87cbb5d76c2af34b6bc。本次数学显示未重建镜像/更新部署，旧v02-runtime-equivalence回执不能用于宣称本轮运行文件一致。
- Real Agent（此前v0.2验收，本轮显示变更未再调用模型）：newapi/gpt-5.6-luna，六场景工具/引用检查通过；计划回执文字错误修复后独立authoring复测与数学审查通过。Heine-Cantor有效证明、资料不足明确分区、注入未执行、5题key正确、真实PDF页码引用。artifacts/v02-llm-six-scenarios.json与v02-llm-authoring-reviewed.json；普通测试不调用模型。
- Review fixes：数学段落继承面板字号；aria-describedby关联题干、原生radio仍支持点击/键盘。390px计划Grid的自动最小宽度被长公式撑到452px；单变量浏览器验证后改为minmax(0,1fr)，恢复390px无横向溢出。公式仅在内容内滚动。普通卡片仍不读取raw authoring args；HTML和不可信TeX不执行。
- External gates：当前model公开inputModalities不含image，real multimodal未运行；未配置官方MinerU端点/环境，real MinerU未运行。auto/high能力由UI明确gate，fake覆盖不冒充真实服务。
- Dependency review：plugin production audit0；实际Docker runtime closure仍24 advisories（11 high/12 moderate/1 low）。不能把旧TXT路径适用性结论套到PDF/image；边界见COMPATIBILITY。
- Active limits：一个本地Workspace一个Host；不支持NFS/SMB/多Host并发；历史generation最多10次（含失败预留），已存证据不自动删除；旧v1不会启动时自动迁移；prompt建议是best effort；raw session/debug含authoring args，普通UI提交前不泄key。
- Next 3 tasks：① 用户查看本次数学显示截图并决定何时更新日常实例/运行壳pin；② 有image模型时执行真实multimodal核验；③ 有官方MinerU服务时执行真实protocol2 smoke。保持v0.2未发布状态，不自动迁移用户数据。
