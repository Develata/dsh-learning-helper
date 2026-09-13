# 当前状态

- Current phase：v0.2 Workspace/PDF 实现、审查修复与本轮验收完成；两仓保留 feat/workspace-v02，未打v0.2 tag，未替换日常v0.1部署。
- Last verified runtime：aad1263221da277f70ca1d724aff4e83fad29be2；后续提交仅收尾文档。最终远端metadata HEAD由Git记录，运行壳UPSTREAM_BASE与versions.lock固定最终plugin SHA。v0.1.0仍指向958cf67627736232d06a9eeee70cdcb2c0369248，upstream仍为c291e7961a515f6d7af9304e7fd1d257929aef26。
- Works：官方Session→Workspace→单Project；7 tools无courseId，无global picker/learning DB；Workspace内state/evidence、稳定manifest、relative assets、200/201 source边界；PDF.js/原件/page citation；gated vision/cache、MinerU protocol2、atomic generation/historical read；显式offline v1迁移保留原库；原学习闭环与任务会话保留。
- Verification：typecheck、146/146（126 backend+20 client）、build、5 demos、pack；packed标准Agent/认证/A-B/restart及Chromium通过；standalone新目录 frozen install/typecheck/tests/build/pack通过；CodeGraph sync和runtime diff gate通过。截图检查1440light/dark、1024、390；PDF失败仍Ready、100source提示、键盘/丢包/刷新/迟到响应无跨域污染。
- Docker：上述runtime SHA从固定远端源码build --no-cache，新volume冷启动、Chromium、错误Origin/未认证拒绝、容器重启后dashboard/sources完整快照一致，全部PASS。image b928a43414dc76156a482bd7dfb7026032a6ea205cdbf87cbb5d76c2af34b6bc；184个打包运行文件与最终本地构建逐字节一致。文档提交不重复完整镜像构建；最终pin和验收输入的区别由运行壳UPSTREAM_BASE记录。本地回执artifacts/docker-result.json、v02-runtime-equivalence.json；仅测试volume已清理。
- Real Agent：newapi/gpt-5.6-luna，六场景工具/引用检查通过；计划回执文字错误修复后独立authoring复测与数学审查通过。Heine-Cantor有效证明、资料不足明确分区、注入未执行、5题key正确、真实PDF页码引用。artifacts/v02-llm-six-scenarios.json与v02-llm-authoring-reviewed.json；普通测试不调用模型。
- Review fixes：丢失/空evidence DB不重建；中断暂存限制增长；失败generation资源预留；PDF解析/assetization竞态、取消保留local；v1迁移从离线复制库backup避免触碰原WAL；task session归属重核；citation转义；plan schema联合结构与小回执；checkbox CSS；原生Workspace导航测试竞态；已失败MinerU恢复不再改Source.updatedAt。
- External gates：当前model公开inputModalities不含image，real multimodal未运行；未配置官方MinerU端点/环境，real MinerU未运行。auto/high能力由UI明确gate，fake覆盖不冒充真实服务。
- Dependency review：plugin production audit0；实际Docker runtime closure仍24 advisories（11 high/12 moderate/1 low）。不能把旧TXT路径适用性结论套到PDF/image；边界见COMPATIBILITY。
- Active limits：一个本地Workspace一个Host；不支持NFS/SMB/多Host并发；历史generation最多10次（含失败预留），已存证据不自动删除；旧v1不会启动时自动迁移；prompt建议是best effort；raw session/debug含authoring args，普通UI提交前不泄key。
- Next 3 tasks：① 有合适image模型时执行真实multimodal核验；② 有官方MinerU服务时执行真实protocol2 smoke；③ 用户体验与远端audit后再决定是否迁移日常实例、合入默认分支及发布v0.2.0；不自动执行这些发布动作。
