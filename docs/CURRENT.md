# 当前状态

- Current phase：v0.2 Workspace/PDF 实现完成，本地审查/修复/验收通过；Docker独立冷启动与最终远端收尾进行中。两仓 feat/workspace-v02，v0.1.0和用户33333实例不动。
- Last known released state：plugin958cf67627736232d06a9eeee70cdcb2c0369248；fork8a47b6d55f6c603d4c8b90159b30f361e228611b；upstreamc291e7961a515f6d7af9304e7fd1d257929aef26。当前实现批次至ab5322f；未打v0.2tag。
- Works：官方Session→Workspace→单Project；7 tools无courseId，无global picker/learning DB；Workspace内state/evidence、稳定manifest、relative assets、200/201 source边界；PDF.js/原件/page citation；gated vision/cache、MinerU protocol2、atomic generation/historical read；显式offline v1迁移保留原库；原学习闭环和任务会话保留。
- Verification：typecheck、145/145（125 backend+20 client）、build、5 demos、pack；最终packed标准Agent/认证/A-B/restart及Chromium通过；standalone新目录 frozen install/typecheck/tests/build/pack通过；plugin production audit0。截图检查1440light/dark、1024、390；PDF失败仍Ready、100source提示、键盘/丢包/刷新/迟到响应无跨域污染。
- Real Agent：newapi/gpt-5.6-luna，6场景工具/引用检查通过；计划回执文字错误修复后独立authoring复测与数学审查通过。Heine-Cantor有效证明、资料不足明确分区、注入未执行、5题key正确、真实PDF页码引用。artifacts/v02-llm-six-scenarios.json与v02-llm-authoring-reviewed.json；普通测试不调用模型。
- Review fixes：丢失/空evidence DB不重建；中断暂存限制增长；失败generation资源预留；PDF解析/assetization竞态、取消保留local；v1迁移从离线复制库backup避免触碰原WAL；task session归属重核；citation转义；plan schema联合结构与小回执；checkbox CSS。
- Blocked external checks：当前model公开inputModalities不含image，real multimodal未运行；未配置官方MinerU端点/环境，real MinerU未运行。auto/high能力由UI诚实gate，fake覆盖不冒充真实服务。
- Active limits：一个本地Workspace一个Host；不支持NFS/SMB/多Host并发；历史generation最多10次（含失败预留），已存证据不自动删除；旧v1不会启动时自动迁移；prompt建议是best effort；raw session/debug含authoring args，普通UI提交前不泄key。
- Next 3 tasks：① 独立Docker no-cache冷启动/浏览器/重启；② 最终docs/pin一致性、secret/diff/CodeGraph复核；③ push最终plugin，更新fork pin并push，核对两仓clean/local=remote。不得自动打tag或替换用户容器。
