# MinerU 配置与测试

v0.2.2 提供 mineru.net SaaS v4 与 Web 密钥配置；v0.2.1 及更早镜像只有 self-hosted protocol 2。安装入口见 [README](../../README.md#快速开始)，发布验收见 [CURRENT](../CURRENT.md)。

## mineru.net 云端

在 [API 管理页](https://mineru.net/apiManage) 创建 API Token；不要在聊天、课程文档或 git 中填写。
安装 v0.2.2 后，在当前 Workspace 的「学习 → 资料 → 配置 MinerU API」选择「mineru.net 官方云端」。

1. 粘贴 API 密钥，选择 VLM 或 Pipeline，启用 MinerU，然后「保存配置」。
2. 页面显示已保存后，输入框清空；留空再保存配置会保留密钥，移除按钮只删除该 Workspace 在当前主机的云端密钥。
3. 选择一份小 PDF，先用「本地快速」，勾选「使用 MinerU 转换为长期 Markdown 资产」再上传。勾选意味着将 PDF 发送到 mineru.net。
4. 等待 Markdown 转换完成，检查 Source parser、页码 citation 和 `learning-assets/`。本地解析与云端转换是两个状态；本地 Ready 不等于云端成功。

密钥保存在公开 Harness credentials provider 管理的位置（Docker 中属于 `/data`），按稳定 projectId 隔离；不在 `.learning-helper/config.json`，不返回明文，不存 browser local/session storage。保留 DSH_HOME 卷可保留凭据；只复制 Workspace 到另一主机时需要重新配置。

保存成功不代表远端已验证认证：首次转换才检查 Token 是否有效。云端限制200页/份，本插件继续使用较严格64MiB文件上限。官方额度与有效期以账户页面为准。

失败时本地PDF/旧证据保留。检查密钥有效期、账户额度和网络后可重试；若显示提交结果未知，先在云端核查任务再明确确认重试。程序不会自动重复提交收费任务。API使用固定官方域名，ZIP下载使用受限官方域名；供应商切换域名/返回格式会明确拒绝，需要适配审核，不能关闭URL检查绕过。

## 自托管 protocol 2

选择「官方自托管 protocol 2」，填写可信服务 base URL，启用并保存。认证仍由 runtime `LEARNING_HELPER_MINERU_TOKEN` 提供；不能把 mineru.net 云端 Token 当作此服务密钥。

Docker 的 `127.0.0.1` 指容器自身。若服务运行在宿主机，需使用实际可达的Docker宿主地址，并按原服务网络绑定配置；Learning Helper不内置MinerU服务或Python模型。

## 验证边界

常规测试使用 fake HTTP cloud/self-hosted 协议、ZIP fixture 和 fake credentials，不消费真实账户额度。用户填写真实 key 后完成的成功解析，才构成 real MinerU acceptance；请只保留日期、模型、页数、Source状态与citation等无密钥回执。
