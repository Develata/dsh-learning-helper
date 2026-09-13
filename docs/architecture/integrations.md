# Integrations

固定 Harness 0.1.5-rc.2 / upstream c291e7961a515f6d7af9304e7fd1d257929aef26。运行壳拥有 profile/发行配置，学习业务在独立 npm package。v0.2 无 packages/apps patch。

- WorkspaceRegistry.list 的 sessionIds 已核验 session header cwd；WorkspaceResolver 仅使用这个公开投影，不接受工具传路径。一个 Host 实例按请求打开 Workspace 数据。
- defineTool / systemPrompt.section：七工具与一份 grounding policy；普通 QA 不授权 outline/plan/quiz mutation。
- LlmService.prepareCall / prepared.stream、Agent.options、AttachmentService.saveImages：复用当前模型与官方图片输入。PDF 页先在 Worker 渲染 PNG；模型必须显式声明 image modality。未具备能力时明确 gate，不假装视觉成功。Harness attachment 是 transport copy，Workspace PDF/代际文本为学习 provenance authority。
- Mozilla pdfjs-dist 6.3.289：本地文本/页数/页渲染，Apache-2.0；不实现自研 PDF parser。
- MinerU：可选外部自托管 API protocol 2，未打包 Python/OCR/模型；[已核对协议](https://github.com/opendatalab/MinerU/blob/4fe4bde114a23ee5dd637eae99b767f4669bf58c/mineru/cli/fast_api.py)。不兼容冒称 SaaS v4。Token 仅 runtime environment；workspace config 无 secret。
- dsh-open-file、NotebookLM、Obsidian、DeepTutor、向量服务：deferred，不在运行依赖路径。

native dsh.client 继续复用 sidebar、slots、Session/Workspace client controllers、primitives。客户端学习请求走 authenticated same-origin session routes；没有独立 SPA/router。
