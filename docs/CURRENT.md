# 当前状态

- Current phase：v0.2 全局 review/fix 已完成，本地分批提交；仍在 feat/workspace-v02，未 push、未打 tag、未合入默认分支、未更新日常实例。
- Last verified runtime：635009c2679ff8e7cb46faf63710aaa4942d55f9。当前远端/运行壳 pin 仍为 a0fa0c6a851cb106ac00b02b3381b5c126110837；本轮及前次数学显示改动均未发布。v0.1.0仍指向958cf67627736232d06a9eeee70cdcb2c0369248；Harness upstream c291e7961a515f6d7af9304e7fd1d257929aef26。
- Works：官方Session→Workspace→单Project；7 tools无courseId/global picker；Workspace-local state/evidence、稳定manifest与relative assets；200 sources；PDF.js/原件/page citation；gated vision/cache、MinerU protocol2、atomic generation/historical read；显式offline v1迁移保留原库；原学习闭环、任务会话和共享MarkdownText/KaTeX数学显示。
- Review scope：Workspace/路径隔离、数据库所有权与回放、迁移/失败恢复、PDF/视觉/MinerU、authoring/tools、Host认证/公开投影、客户端提交/切换/回放、配额、包与文档。未改Harness runtime、学习算法或durable schema，未增加依赖。
- Findings fixed：① 缓存PDF代重新选择未切换active/FTS；已修复，重新解析失败保留此前active，扫描件无本地文本不能冒充local-fast成功，旧citation仍可读。② Workspace默认PDF模式被Host/UI忽略，local-fast可能意外走视觉；已修复默认继承/显式覆盖/配置加载门槛。③ binary upload误用12秒deadline；恢复独立45秒并保留caller cancellation。④ 精简study_plan_publish回执被旧卡片读成0天；兼容新回执和历史完整plan，异常数据安全回退。四项均先复现再修复。
- Verification：typecheck、151/151（129 backend/script +22 client）、build/pack、5个demo通过；无sibling的新副本frozen install/typecheck/tests/build/pack通过。packed标准Agent/认证/A-B/重启及真实Chromium通过：默认PDF模式、手动覆盖与设置刷新、3天/每日60分钟发布卡片、答题失败/丢包重试/刷新、Weak/v2、数学/键盘/错误状态。1440light、390dark与PDF失败截图实际查看，自动布局覆盖1440/1024/390 light/dark，pageErrors=[]。CodeGraph sync/影响面及Harness packages/apps相对upstream零diff通过。
- Proof：artifacts/integration-result.json记录本轮提交前585ebc0+dirty工作树的tested tgz；上述runtime commit保存相同已测试代码，后续只提交已运行browser检查及文档。浏览器回执/截图 /tmp/lh-review-browser/result.json；本机日志 /tmp/lh-review-*.log。Browser plugin不可用，使用Harness已有Playwright 1.61.1；未运行用户模型或修改用户数据。
- Capacity：独立200-source、50,792,490 bytes正文fixture：导入3.38秒，英文FTS20条31.6ms、三字无命中0.4ms、两字无命中扫描98.8ms；单机单次测量，不作生产延迟保证。复现见local-dev。
- Dependency/security：本轮plugin production audit 0；tracked文件与diff凭据模式扫描无匹配，无DB/cache/artifacts入Git。既有Docker runtime closure 24 advisories（11 high/12 moderate/1 low）沿用已记录的固定upstream风险，见COMPATIBILITY；本轮未重新审计或构建镜像。
- External verification：此前newapi/gpt-5.6-luna已通过六场景工具/引用及authoring数学复核，本轮未重跑真实LLM。上次外部验收时公开inputModalities未声明image、未配置官方MinerU服务；本轮未重跑这些外部gate，真实multimodal/MinerU仍未验证，fake覆盖不冒充真实服务。
- Docker：历史aad1263221da277f70ca1d724aff4e83fad29be2已通过无缓存build/冷启动/浏览器/认证/重启；本轮未部署，旧runtime-equivalence回执不证明当前改动已进入容器。
- Active limits：本地Workspace只允许一个Host；不支持NFS/SMB/多Host并发；历史generation最多10次含失败预留，不自动删除已存证据；v1不自动迁移；raw session/debug可能含authoring args，普通UI提交前不泄key。
- Next 3 tasks：① 用户体验本地修复，另行决定push与部署；② 配置image模型后验证真实multimodal；③ 有官方MinerU服务时执行真实protocol2 smoke。保持v0.2未发布状态。
