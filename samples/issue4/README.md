# Issue #4 / #9 acceptance package

Current primary samples are from real manual run `8409d050-b86b-425d-867b-3d2761273a1d` on 2026-11-06 UTC. See [delivery](../../docs/ISSUE9_DELIVERY.md) for the full acceptance matrix.

- 渠道表.md: 14 channel statuses, seven per store.
- 营业时间表.md: 112 daily rows.
- 菜价抽查.md: five dishes per store, 10/10 independent page matches.
- easy-joy/ and frydom-express/: unchanged originals, derived arrays, independent price evidence and screenshots.
- 旧菜单例子/ and 无日期例子/: real dated stale and undated image cases.
- 营业时间边界测试.json: clearly synthetic 30/45-minute cases.
- run-manifest.json and source-revision.json: actual run identity and tested-source fingerprint.

Both store reports are partial. Repeated menu observations across channels are not unique dishes. Unknown and blocked sources are not reported as absent. Historical and targeted supplementary evidence is labelled separately; previous-20261106-before-final/ preserves the replaced primary package.
