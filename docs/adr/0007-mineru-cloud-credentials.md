# ADR-0007 — MinerU 云端适配与主机凭据

2026-09-13，用户要求支持 mineru.net 云端 API 并在 Web 手动填写密钥。原 protocol 2 适配器的 `/health`、`/tasks` 不是 SaaS v4，不能只替换 base URL。

决策：两种官方协议作为 `DocumentAssetizer` 的并列实现，沿用现有 archive、异步 continuation、验证、atomic generation switch。未写 provider 的旧配置仍表示 self-hosted；cloud 使用固定 mineru.net API 和独立 cloudModel。学习状态与 Evidence DB schema 不变。

密钥通过正式 Harness `ctx.credentials` record 存储，地址由稳定 projectId 派生；不放 Workspace config、Source metadata、Agent tool args 或 browser storage。Web 仅有保存/移除及 configured/writable 只读投影，不回传密钥。主机迁移后需重新配置密钥；同主机移动 Workspace 保持身份。修改只影响后续操作，已启动任务使用当时读取的密钥。

云端 API key 只发给固定 `https://mineru.net/api/v4`。官方返回的签名上传/下载链接只允许明确列出的 HTTPS object-storage hosts；不带 API Authorization，不跟随重定向。ZIP 用 yauzl 异步逐项读取，限制压缩/展开大小、数量、CRC、UTF-8、路径、图片签名和页码。外部路径不直接落盘。供应商改变下载域名会明确失败，需要审核更新 allowlist。

失败：POST 分配响应或后续上传结果不明时，不自动重新提交；用户先核查云端任务，再显式 retryUnknown。已知 task ID 可继续查询；失败不损坏已有 active generation。配置保存不宣称 key 已验证，首次转换才检查服务认证与额度。

协议 authority：[官方 SaaS v4](https://mineru.net/apiManage/docs)、[官方结果文件](https://opendatalab.github.io/MinerU/reference/output_files/)。对应边界见 [evidence](../contracts/evidence.md) 与 [web-ui](../contracts/web-ui.md)。验证使用 fake HTTP 协议/ZIP、credential 隔离、真实 packed Harness UI；真实云端质量由用户提供凭据后的单独实测证明。
