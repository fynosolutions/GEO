# Issue #20 本地阶段1–3状态

2026-11-18（Asia/Taipei）。仅本地实现与验证；未提交、推送、评论或关闭GitHub Issue。

## 已完成

- 37个正式网址由 samples/step1-media/urls.json 驱动，保留顺序、纽约/洛杉矶范围及不同路径；来源ID由URL生成。
- 新CLI默认新鲜HTTP采集；--offline按哈希重放；旧#15接口改为显式--legacy，原样本未覆盖。
- 单来源失败隔离，区分HTTP受阻、网络错误、解析缺口、缓存/落盘错误及本阶段延期；未知数据不补造。
- 可读榜单、目录、单店介绍和报道分别解析；两篇长指南通过本页内嵌正文引用与餐厅链接验证完整顺序，没有按JSON-LD前20项裁掉内容。
- Time Out空JSON-LD的介绍从可见编辑正文导出；目录没有独立介绍时明确保留null。

## 本次真实访问与解析

| 站点 | 网址数 | 已解析页 | 条目 | 结果 |
|---|---:|---:|---:|---|
| Eater NY | 3 | 3 | 20 | parsed: 3 |
| Happy Hour NYC | 1 | 0 | 0 | network_error: 1 |
| Corner | 8 | 0 | 0 | blocked: 8 |
| The Infatuation | 16 | 16 | 104 | parsed: 16 |
| MICHELIN Guide | 2 | 0 | 0 | blocked: 2 |
| Welcome to Chinatown | 1 | 1 | 5 | parsed: 1 |
| All You Can Eat Guide | 2 | 2 | 14 | parsed: 2 |
| Time Out | 2 | 2 | 11 | parsed: 2 |
| Reddit | 2 | 0 | 0 | credentials_missing: 2 |

合计154条记录，141条原文介绍；13条AYCE城市目录卡片没有独立介绍字段，标not_provided。parse_failed=0。

首轮35个非Reddit页面的实际HTTP返回及原始HTML仅保存在.local/issue20/probe/；规范缓存和原始时间/哈希保存在.local/issue20/pages/。新CLI已用这些原始返回重放全部37来源，并另对Eater榜单和Infatuation单店页进行实际新抓冒烟：两页均成功。

Corner本次8页均HTTP429；Michelin两页HTTP202验证响应；Happy Hour连接重置，原因尚不能归为明确平台禁止访问。两个Reddit帖子未发匿名请求，不使用旧保存线程替代。

## 验证

- npm run check / npm run build 通过。
- npm run verify:media-current 通过：37来源结构与证据一致，ready_for_delivery=false。
- npm run verify:media 通过：旧9来源105条/105介绍及上榜表保持不变。
- BROWSER_CHANNEL=chrome node --test --test-concurrency=1 scripts/*.test.mjs：224通过、0失败（第三阶段完整复测）。首次并行测试有一个Chrome框架加载失败，串行完整复测通过，未修改无关UI代码。
- 新增14项当前采集测试，涵盖更换清单、原文边界、内嵌指南计数、HTTP重定向/失败、离线一致性与篡改输出拒绝。
- 无Apify、模型或付费搜索接口调用，本阶段项目采集费用US$0。

## 复核命令

```sh
npm run collect:media
npm run collect:media -- --offline
npm run verify:media-current
npm run verify:media
```

默认本地输出.local/issue20/current/。完整范围含已明确受阻和延期来源，collect:media退出2表示有部分数据，结果仍写出；不等于程序没有运行。

## 下一阶段

第三阶段代码已实现：官方OAuth refresh-token读取、折叠回复展开、每条引文comment_url、精确原文区间复核和每条记录closed。缺凭据不会发匿名请求，也不阻止其他来源。真实缓存中154条均有closed布尔值，其中3条Hometown记录有本页永久关闭证据；false仅表示本页无匹配标记。

Reddit用户已于2026-11-19提交申请，等待批准，两个线程真实接口、完整回复及提及复核尚未验收，phase3_complete=false。申请步骤见docs/REDDIT_API_SETUP.md。下一步为获批后实测、受阻来源manual例外及新电脑单命令最终验收；#20保持未交付。

## Apify candidate (2026-11-19)

Scripts are stored in `scripts/check/step1-media/`; outputs are saved under `samples/step1-media/candidate-apify/` and `candidate-all/`. The existing official adapter is retained. Two direct-post HTML tasks completed without Reddit cookies or configured proxies. Each returned 25 comments; declared counts were 27 and 47. All 50 saved bodies were reviewed, yielding 63 restaurant mentions with original comment URLs. Parent IDs missing from the HTML response are kept unknown. No complete-tree or official-API acceptance is asserted. Exact run/cost metadata remains local. These are candidate outputs only; no commit, push or Issue delivery was performed.

## Non-Reddit finishing work (2026-11-19)

- Happy Hour returned HTTP 200 on recheck; its eight numbered cards, source addresses and original blurbs now parse automatically. Current direct coverage is 25 pages, 162 entries, 149 original descriptions and 13 source-not-provided directory descriptions.
- Corner's eight URLs remain HTTP 429; Michelin's two URLs remain HTTP 202 challenge responses. Actual response files and per-URL hashes/timestamps are stored in `samples/step1-media/manual/access-evidence/` and `manifest.json`. They are not article bodies. Useful browser HTML is still pending for all ten URLs because browser control could not connect.
- `scripts/check/step1-media/manual.mjs` imports exact-URL user-saved HTML after identity, timestamp, hash, path and challenge checks. The collector falls back only after direct failure and preserves direct status/time/hash.
- `generate.mjs` defaults to `samples/step1-media/articles.json`, with `--out` available to preserve historical samples during development. `verify.mjs` checks schema and evidence.
- A separate directory without `.env`, `node_modules`, `dist`, old sample output or `.local` cache completed `npm ci` and fresh collection, writing 37 sources/162 entries at the required path. Exit 2 correctly signals partial data. This is a clean-directory check on the same Mac, not evidence from a second physical computer. Local evidence: `.local/issue20/clean-environment-2026-11-19/verification.json`.
- Full regression: 233 passed, zero failed. Final focused checks: six passed. Build and type checks passed. No additional Apify starts or paid collection during this finishing work. Historical #15 JSON remains unchanged.

Remaining non-Reddit content dependency: obtain and validate ten useful browser HTML files (see manual/README.md). A separate physical computer check has not been performed. No commit, push or Issue closure was performed.

## User HTML acceptance update

All ten user-saved Corner/Michelin sources have been imported. Current output has 35 parsed non-Reddit sources, 221 entries; two official Reddit sources remain credential-blocked. Manual-source audit checks 59 entries, including 41 Corner list cards with no dedicated original description. Their null blurbs are now explicitly `not_provided`, with visible source addresses exported where present. Two Michelin URLs describe the same restaurant and remain two source records. Daily `closed` status is not mapped to permanent closure. Earlier pending-archive notes above describe the previous state and are superseded. Scripts are stored in `scripts/check/step1-media/`; results in `samples/step1-media/current/`. No push or Issue closure.
