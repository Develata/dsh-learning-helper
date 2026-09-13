# ADR-0006 · Canonical-first document generations

Accepted for v0.2. A Source identifies a supplied document; an AssetGeneration identifies one normalized representation. TXT/Markdown normalize directly. PDFs retain immutable original bytes and use local PDF.js extraction, capability-gated vision, and optionally an independent MinerU assetization job.

Search sees only the active generation. Reading a chunk can resolve historical generations, so an outline or quiz published before an asset upgrade retains its evidence. Generation content and provenance are validated completely before a database transaction changes the active generation. Failure leaves the previous representation usable.

PDF citation page numbers come from deterministic parsing and validated provenance, never unrestricted model output. Derived Markdown carries original PDF page provenance. Archived originals are excluded from ordinary retrieval and accessed only through bounded page inspection.

MinerU is an external optional provider, not a runtime-image dependency. The adapter follows a verified official asynchronous protocol, retains results locally, bounds polling/concurrency/output, and treats an ambiguous submit response as requiring explicit recovery rather than blindly creating another job. Credentials remain runtime-only. Provider failure does not invalidate existing PDF evidence.
