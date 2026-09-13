# Evidence contract v2

Authority：Workspace 是 Source、archive、canonical asset、Evidence 与 provenance 的边界。Model/user HTTP 不能传 root/courseId 来选库；Host 从当前 authenticated Session membership 解析。当前 `.learning-helper/evidence.db` 的 `PRAGMA user_version=2`；未知版本或损坏拒绝打开。v0.1 schema1 只通过显式[迁移](../operations/migration-v1.md)进入新版，不原地升级。

Source：raw PDF SHA-256 或规范化 TXT hash 去重；同 Workspace 相同内容只一份，不同 Workspace 独立。TXT 保留 UTF-8、heading 与精确 line/column，canonical file 从规范化全文写出。PDF 原件位于 `.learning-helper/archive/<sourceId>/original.pdf`；不作为普通搜索语料，不删除。

Generation：完整验证后一次 SQLite transaction 激活 Source.activeGenerationId 与两个 FTS 投影。重新选择已有缓存代也必须切换 active pointer/FTS，不增加 generation 或重复 chunk。search 只返回 active generation；read(chunkIds) 可读取历史代，已有 Concept/Quiz sourceRefs 不失效。数据库是 active pointer truth，filesystem provenance 为可检查的投影。模型永远不能自行提供 pageCount/随意页码；PDF.js 给出 pageCount，PDF chunk 不跨页。

检索输入：query 非空且 ≤200 字符、limit 1..20；read 1..8 个唯一 chunk，总正文≤24000 字符。SQL 参数绑定，FTS terms 单独引用；Latin unicode61/BM25、长度≥3 的 CJK terms 使用 trigram，短词/FTS 不可用时只在有界 active corpus 扫描。空格是 AND，不是语义检索。返回 structured chunkId/sourceId/filename/locator/score/excerpt/citationLabel/canonicalRef；read 包含全文。

引用：TXT 使用真实 section/line range；PDF（含 derived MinerU Markdown）使用原 PDF filename/page。canonicalRef 来自 read；不得编造页码。资料、文件名、图片、图中的指令都是 UNTRUSTED EVIDENCE，不改变 Agent policy。

| 边界 | 上限 |
|---|---|
| Sources | 200/Workspace，100 起 UI 软提醒 |
| TXT/Markdown | 512 KiB/份、最多512 chunks；每chunk最多4000 UTF-16 code units / 80行 |
| PDF upload/archive | 64 MiB/份；2000 页；archive 2 GiB/Workspace |
| 一代文本/chunks | 8 MiB / 8192 chunks |
| 历史代尝试 | 每 source 最多 10（包括失败但已预留身份），同身份重试复用 |
| canonical / indexed / 辅助派生文本 | 各自独立 64 MiB/Workspace |
| MinerU media | 单结果最多256 files，总 media 64 MiB/Workspace |
| 派生文件账目 | 最多10000；落盘前预留，失败不释放后偷偷积累 |
| PDF Worker | 进程最多2；120s可终止，JS heap512MiB；上传最多4、30s |
| vision / original | 每次 original 1..4真实页；单页PNG≤4MiB，最多1600px长边；视觉导入最多64页，单页60s，总600s |
| MinerU | 全进程最多2任务，总10..600s；2s poll，无无限网络重试 |

PDF modes：local-fast 全部本地；auto 低文本/图像复杂/孤立字符 heuristic 页请求视觉；high-accuracy 请求所有页视觉。初次导入可先提供 local generation；重新解析在目标代完整就绪前保留此前 active generation，能力不可用/失败展示 warning，不能称为高精度成功。扫描 PDF 无本地文本时切换 local-fast 必须明确失败，不能用旧视觉结果宣称本地解析成功。Vision cache key 含 raw source identity、PDF.js version、mode、provider/model 与页码。

MinerU 是独立增强动作：health(protocol2) → 单次 POST /tasks → status → JSON result。self-hosted 支持官方 pipeline/vlm-engine/hybrid-engine backend，不跟随返回 URL。cloud 为单独官方 SaaS v4 adapter：POST /file-urls/batch → PUT 一个签名 URL → GET /extract-results/batch/:id → ZIP。模型为 vlm/pipeline，单PDF最多200页；沿用更小的本地64MiB限制。Token 只发固定 mineru.net API，上传只接受 mineru.oss-cn-shanghai.aliyuncs.com，下载只接受该host或cdn-mineru.openxlab.org.cn；HTTPS，不重定向，签名URL不持久化/不日志。ZIP≤128MiB/1024 entries，按流解压所需文件，Markdown≤8MiB、content_list≤16MiB、media≤64MiB/256份；校验CRC/UTF-8/页码，拒绝重复、symlink和逃逸路径，不向磁盘直接解包。缺失page provenance拒绝激活。凭据所有权见[ADR-0007](../adr/0007-mineru-cloud-credentials.md)。结果 UTF-8/大小/page_idx/media 路径验证后立即持久化 derived Markdown、结构化内容、图片与 provenance，再激活。未知提交结果标 outcome-unknown，需要用户明确检查并重试；已知 taskId 超时/重启可恢复。失败不使已有 PDF evidence 不可用。重复启动恢复已终结的状态必须保持 Source 快照（包括 updatedAt）不变；只有真实状态变化才更新时间。

路径：只保存相对路径；所有组件检查 containment 和 symlink。支持可信本地文件系统单 Host；不声称抵抗拥有同一文件系统写权限的恶意 OS 进程，也不支持 NFS/SMB/同步云盘上的 SQLite 多写。
