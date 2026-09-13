# 当前状态

**v0.2.2 正式发布准备完成：合入 main，依次推送插件与运行壳 annotated tag。** Release/镜像的远端成功以对应 Actions 和 Release 附件为准；本页随 tag 保存的是发布前验证，不将 tag 推送当作产物发布成功。

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
| 本地Docker预览 | 非root、鉴权、cloud设置、PDF、资料/凭据重启持久化通过；正式v0.2.2镜像由fork CI单独验收 |

回执在ignored `artifacts/`：`mineru-regression.log`、`mineru-standalone.log`、`mineru-audit.json`、`integration-result.json`、`main-mineru-inspection.json`、`mineru-warning-regression.log`、`mineru-warning-before.log`、`mineru-warning-after.log`。不包含密钥。

## 版本与部署

- 发布版本：插件 package `0.2.2`，两仓 annotated `v0.2.2`；正式分支统一到 `main`，不删除旧开发分支或移动历史tag。
- Harness固定 `0.1.5-rc.2` / upstream `c291e7961a515f6d7af9304e7fd1d257929aef26`；Node `24.18.0` / pnpm `11.7.0`。
- 插件tag先发布tgz；运行壳lock固定其exact SHA，同名tag再构建与验证Docker镜像。镜像为 `ghcr.io/develata/learning-helper:0.2.2`，linux/amd64；Release Compose固定实际digest。
- v0.1.0验收保持在 `958cf67627736232d06a9eeee70cdcb2c0369248`；全局旧数据只能显式迁移。
- 用户体验中的预览仍为 `learning-helper-mineru-preview:f249b9b4c04c`，本次提交/发布不会自动替换该容器；旧视觉提示修复尚未装入该实例。

操作：[MinerU配置](operations/mineru.md)、[发布](operations/release.md)、[迁移](operations/migration-v1.md)。真实vision最近验收未声明image能力；不声称所有公式正确。日常实例与用户密钥未修改。

下一步：完成两仓tag CI并核对发布回执；需要更新用户预览时保留原数据与凭据；收集实际学习反馈。无额外功能扩展。
