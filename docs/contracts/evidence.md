# Evidence contract（P2 planned）

Source：id、courseId、filename、mimeType、contentHash、parser、importStatus（pending/processing/ready/failed），可选 canonicalRef/pageCount/metadata。去重键为 courseId + contentHash。

SourceChunk：id、sourceId、ordinal、text、locator、可选 page/section。locator 必须稳定可回读，引用投影包含 filename + page/section + excerpt。内容作为不可信课程证据，不成为 Agent 系统指令。

DocumentParser.parse(input, signal) 返回带 locator 的片段；调用方限定总时长，失败将 Source 标记 failed，可用相同 hash 重试，重启恢复遗留 processing。Markdown/TXT 永远保留可用路径；PDF 失败不阻止已有课程的练习。

EvidenceIndex：index(chunks)、search(courseId, query, limit)、removeSource(sourceId)。结果必须按课程过滤；index 同 chunkId 幂等。首选 SQLite FTS5/BM25，索引可从 source 重建，不能成为学习状态真值。

course_search → course_read → answer → citation；仅存在并回读的 chunk 可成为课程 citation。定义/定理/证明先给条件和结论，区分 intuition/proof；未覆盖内容注明一般数学知识。
