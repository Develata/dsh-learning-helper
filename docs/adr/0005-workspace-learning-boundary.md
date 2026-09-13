# ADR-0005 · Workspace learning boundary

Accepted for v0.2. Supersedes v0.1 global Course selection and global learning database placement; the deterministic learning aggregate semantics remain.

One registered local Harness Workspace owns one Learning Project. The pinned Harness exposes `workspaceRegistry.list()` and header-validated `Workspace.sessionIds`; it does not expose a workspace-scoped Cordis composition lifetime. One Host plugin therefore resolves each authenticated session against that public membership, then opens workspace-local services. A missing, detached or mismatched session fails closed. A path supplied in model arguments is never an authority.

`.learning-helper/manifest.json` owns a generated stable project identity. Internal Course IDs remain an implementation vocabulary for the established policy/replay code and migration, with exactly one aggregate per workspace. The browser and model no longer select Course IDs. Moving the directory retains project identity; Harness registration is updated separately.

The public storage-domain facility routes by domain, not by each request's workspace. A narrow SQLite LearningStore implements the existing service port, with atomic validated updates, bounded single-writer queue and explicit schema version. No private Harness SQLite implementation is imported. Evidence stays in its separate database. Paths persisted by this plugin are relative to the workspace.

v0.1 remains recoverable by its tag and original data. Migration is an explicit offline copy/validate/activate operation; it never rewrites legacy data or runs automatically at container boot. See the v0.2 plan for acceptance gates.
