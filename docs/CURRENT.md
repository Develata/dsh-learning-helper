# 当前状态

**v0.2.2 已正式发布，两仓 main 为默认分支，annotated tag、Release 与 Docker CI 全部核实。** 本页是发布后记录；tag固定实际构建提交，后续文档提交不改变镜像输入。

## 本版内容与边界

mineru.net SaaS v4：固定官方 API、单次签名上传、batch poll、受限 ZIP 校验；Web 按 Workspace 配置密钥，公开 Harness credentials 持久化，不写 Workspace 明文、不回显。保留自托管 protocol 2、原始 PDF、历史 generation 与 citation。当前 active MinerU Markdown 已就绪时隐藏旧视觉失败提示；本地解析警告与新转换失败仍显示。学习状态与 Evidence schema 不变，Harness packages/apps 0 patch。

用户已用官方云端完成24页PDF：471个active chunks、24页均有locator、canonical Markdown落盘、原件SHA256一致、真实Host search/read与citation通过。核查为只读，未重发收费任务，未逐页审阅公式质量；这不等于Harness视觉模型验收。

## 验证

| 验证面 | 实际结果 |
|---|---|
| typecheck / tests | 139 backend/script + 26 client = 165/165 |
| build / pack / demos | PASS；5个demo，Workspace/PDF包含在内 |
| standalone | 无sibling的新目录 frozen install/typecheck/165 tests/build/pack通过；版本元数据更新另由tag CI核验 |
| packed Harness / Chromium | 原生cloud设置保存/刷新/移除/丢失响应重试；MD/PDF、authoring、quiz、Weak→v2、Workspace隔离、任务会话与重启均PASS |
| 旧视觉警告 | 新DOM回归修复前失败、修复后通过；覆盖active MinerU、local fallback、仅assetization ready、新转换失败 |
| cloud / credentials | fake HTTP、ZIP路径/CRC/UTF-8/体积/页码、配置隔离、canonical切换/历史引用/重启通过；另有上述真实云端文件验收 |
| dependency audit | plugin production 0；固定Harness runtime既有风险见 [COMPATIBILITY](../COMPATIBILITY.md) |
| 正式Docker / GHCR | [CI](https://github.com/Develata/learning-helper/actions/runs/34784628196) PASS；同一镜像cold boot、真实Chromium、Host/Origin认证与restart persistence通过后原样发布，Release附件校验和通过；空Docker凭据目录匿名pull成功，manifest digest与config摘要均匹配CI回执 |
| 本地Docker预览 | 非root、鉴权、cloud设置、PDF、资料/凭据重启持久化通过；与已发布v0.2.2镜像分开记录 |

回执在ignored `artifacts/`：`mineru-regression.log`、`mineru-standalone.log`、`mineru-audit.json`、`integration-result.json`、`main-mineru-inspection.json`、`mineru-warning-regression.log`、`mineru-warning-before.log`、`mineru-warning-after.log`。不包含密钥。

## 版本与部署

- 插件 annotated `v0.2.2`：`5e8f2f2bbceccea23bfdb9987046e3cea4f410fd`；[CI](https://github.com/Develata/dsh-learning-helper/actions/runs/34784369697) tests/package/publish全绿，165 tests；[Release](https://github.com/Develata/dsh-learning-helper/releases/tag/v0.2.2) tgz/SHA256SUMS已核对。
- 运行壳 annotated `v0.2.2`：`23e47427e514d5a5594173a7c381bf2efe2105e2`；[Release](https://github.com/Develata/learning-helper/releases/tag/v0.2.2) 提供Compose/版本锁/镜像digest/验收回执。两仓正式分支为main，旧分支与tag保留。
- Harness固定 `0.1.5-rc.2` / upstream `c291e7961a515f6d7af9304e7fd1d257929aef26`；Node `24.18.0` / pnpm `11.7.0`。
- 插件tag先发布tgz；运行壳lock固定其exact SHA，同名tag再构建与验证Docker镜像。镜像为 `ghcr.io/develata/learning-helper:0.2.2`，linux/amd64；Release Compose固定 `sha256:a4a90cd47b5f5190e3ea2ce5329b44ef83c4b4e4160322c595fc55988c38c95b`。
- v0.1.0验收保持在 `958cf67627736232d06a9eeee70cdcb2c0369248`；全局旧数据只能显式迁移。
- 用户体验中的预览仍为 `learning-helper-mineru-preview:f249b9b4c04c`，本次提交/发布不会自动替换该容器；旧视觉提示修复尚未装入该实例。

操作：[MinerU配置](operations/mineru.md)、[发布](operations/release.md)、[迁移](operations/migration-v1.md)。真实vision最近验收未声明image能力；不声称所有公式正确。日常实例与用户密钥未修改。

下一步：用户需要升级预览时保留原数据与凭据，使用正式Release Compose；继续收集实际学习反馈。无额外功能扩展。
