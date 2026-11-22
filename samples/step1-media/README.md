Current script entry: `scripts/check/step1-media/generate.mjs`. Default output: `samples/step1-media/articles.json`; use `--out samples/step1-media/current` during development to retain the historical files below. See `manual/README.md` for the ten pending browser archives.

Scripts are stored in `scripts/check/step1-media/`; see that directory’s README for the current media and optional Apify candidate commands. Outputs are saved in this sample directory’s `current/`, `candidate-apify/` and `candidate-all/` subdirectories during development. The historical #15 files below remain unchanged.

# Issue #20 local phases 1–3

`urls.json` contains the 37 URLs supplied in Issue #20, including the Los Angeles inputs and two Reddit posts. Add/remove supported-layout URLs here; article URLs are not maintained in code.

```sh
npm ci
npm run build
npm run collect:media
# Reuse HTML; only official Reddit is refreshed (requires approved OAuth)
npm run collect:media -- --offline-html
npm run verify:media-current
# Optional exact cached replay, without network
npm run collect:media -- --offline
```

Fresh results are local in `.local/issue20/current/`; inspect `coverage.md`, `articles.json` and `access-checks.json`. HTTP outcomes, final URLs, original fetch times and content hashes are preserved. Exit 2 reports partial source coverage; outputs are still available. Current rows include source-specific `closed`; Reddit quote rows include `comment_url`. The official OAuth adapter is implemented, but live acceptance awaits approved access and local credentials. Missing keys never trigger anonymous requests or old saved-thread fallback. Manual exceptions and clean-machine final acceptance remain pending; this is not a full #20 handoff. See `docs/REDDIT_API_SETUP.md` for application steps and the local read-only authorization helper.

The JSON/evidence files alongside this README remain the historical #15 delivery below. They are not the new 37-source result. `npm run verify:media` continues to validate those historical files; `verify:media-current` validates the new local output. No private cache is needed for the latter's schema check, but offline recollection needs the HTTP captures. Full implementation details and custom input/output flags are in `backend/media/README.md`.

---

# Issue #15 交付数据

2026-11-12 已使用用户提供的九份 HTML 重新导出。共九个来源、105 个餐厅/目录/社区条目，105 条介绍或评论原文均已写入 blurb，缺失介绍为 0。JSON 和上榜表由同一程序生成。

| 来源 | 条目 | 已导出介绍/评论 | 输入 |
|---|---:|---:|---|
| Infatuation 火锅榜单 | 10 | 10 | 用户保存的 HTML |
| Eater 火锅榜单 | 18 | 18 | 用户保存的 HTML |
| Infatuation 火锅目录 | 6 | 6 | 用户保存的 HTML；排除指南卡片 |
| Infatuation 点心榜单 | 15 | 15 | 用户保存的 HTML |
| Infatuation 自助餐榜单 | 10 | 10 | 用户保存的 HTML |
| Eater 自助餐榜单 | 14 | 14 | 用户保存的 HTML |
| Reddit 火锅讨论 | 12 | 12 | 用户保存的 HTML；47 个评论节点 |
| Time Out 点心榜单 | 17 | 17 | 用户保存的 HTML |
| Michelin 点心推荐 | 3 | 3 | 用户保存的 HTML |
| 合计 | 105 | 105 | 九份输入均核对来源 URL 和内容哈希 |

## 文件

- articles.json：严格保留 Issue #15 的文章及餐厅字段，原文位于 blurb。
- 上榜表.md：六家目标分店的确认榜单、目录及其他分店/社区提及。
- evidence.json：用户保存时间、SHA-256、数量、介绍与评论覆盖证据。
- acceptance.json、验收报告.md：complete:true、ready_for_delivery:true，及仍保留的字段限制。
- description-availability.json：105 条均已导出；not_selected、parse_failed、未知和确认空介绍均为 0。
- cache-manifest.json：本地输入校验值，不包含 HTML 或登录状态。
- supplied-texts.template.json：空数组，当前没有待补介绍。
- access-checks.json：此前访问尝试的历史记录；不代表本轮重新联网访问结果。

## 核验范围

八个媒体/目录页面共 93 条，Reddit 有 12 个不同餐厅提及。Reddit 保存文件哈希未变：47 个唯一评论节点、46 个可读、1 个删除节点；此前已审阅全部可读评论。删除正文不恢复，结论仅覆盖保存版本。目录顺序和社区首次提及顺序不解释为媒体排名。

Infatuation 点心页面标题写 11 家，正文餐厅卡片与结构化列表均为 15 条，保留正文 15 条。Michelin 简介写四家，显示数量与实际卡片为三家，保留三条及差异说明。Time Out 未给地址、部分 Infatuation 日期冲突、Reddit 未给完整分店地址，继续保留 null，不猜测补齐。介绍原文的 83 个 null 已全部消除。

完整性标记表示程序的来源覆盖、数量和介绍检查通过，不替代 mentor 验收。输入为用户保存的页面，不声称重新完成实时网页访问。

## 复现

```sh
npm ci
npm run check
npm run build
npm run verify:media
BROWSER_CHANNEL=chrome npm test
# 需要本地私有输入；全新检出不含这些 HTML
npm run collect:media -- --legacy --descriptions full --supplied-pages .local/issue15/user-supplied --out samples/step1-media
```

原始 HTML、资源文件和登录状态仅保留本地，不上传仓库。离线 verify:media 不联网、不调用付费服务。此次导入无 Apify 调用，Apify 费用 US$0，未启动商户采集或每周任务。本次修复交付至 main；具体提交及验收证据见 Issue #15 最新交付说明。

本轮验证：npm run check、npm run build、npm run verify:media、git diff --check 均通过；BROWSER_CHANNEL=chrome npm test 共 166 项通过、0 失败。额外将 105 条介绍的各段文字与对应用户 HTML 的可见文本逐一核对，全部匹配。新保存的 Infatuation 火锅目录中 Three Hot Pot 与 99 Favor Taste 的顺序对调，已按新页面保留；六家目标分店的上榜统计没有变化。

推送前已整合 main 的 #13 提交 8691c17，重新完成类型检查、构建、离线样例核验；完整测试 169 项通过、0 失败（含 27 项媒体测试）。前述 166 项为整合前验证。原始 HTML 未进入提交。
