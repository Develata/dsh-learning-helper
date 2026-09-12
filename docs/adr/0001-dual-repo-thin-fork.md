# ADR-0001：双仓库 thin fork

状态：accepted（用户指定，2026-09-12）。

Learning Helper 的业务独立于快速变化的 Harness runtime。采用 Develata/learning-helper 作为固定 upstream 的薄运行壳，Develata/dsh-learning-helper 作为单 package plugin。两个 checkout 不使用 submodule；开发 local link，交付 prebuilt tarball 与 exact SHA。

优先 bundle/profile/Host/client/slots。只有证明这些 seam 不足才允许 core patch，并在 fork 记录 patch。代价是必须维护针对明确 upstream SHA 的 compatibility smoke；收益是业务与运行基础设施各自有单一 owner。
