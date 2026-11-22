# Reddit Data API 接入准备 — Issue #20

状态：2026-11-18，代码及本地模拟测试已准备，用户尚未申请。当前不具备真实Reddit接口验收证据；不会用匿名JSON、搜索索引或旧手存线程替代官方结果。

## 1. 先申请适合实际用途的数据访问

从 [官方 Data API 文档](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki) 的 Rules → “To request, please contact us here” 进入申请；当前链接为 [申请表](https://support.reddithelp.com/hc/en-us/requests/new?ticket_form_id=14868593862164)。登录自己的Reddit账号。表单类别与可见字段以页面为准，选择Data API相关入口，并如实说明商业/公司用途；这不是Reddit Ads API或学术研究申请。

官方 [访问与用途说明](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data) 及 [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy) 要求访问批准。注册script应用并不自动等于已获数据访问许可或免费商业额度。若入口跳到Devvit，说明这是外部数据分析工作流，申请适合的Data API接入方式。

填写真实的邮箱、Reddit用户名、角色及公司信息；没有提供给agent的信息不代填。表单如果出现以下项目，可按此准备：

- Subject of inquiry：`Read-only Reddit Data API access for a restaurant GEO analysis project`
- Company / role：实际代表公司与开发者身份；企业项目不填成学术研究。
- What subreddits：`r/FoodNYC`、`r/Flushing`。
- Source code / project：`https://github.com/fynosolutions/GEO`；当前Reddit适配器尚在本地开发，未发布。
- Data budget：本卡初始测试预算US$2，请求确认适用费用；不假设已获得免费额度。

用途草稿（核实符合你的实际用途后再提交）：

> I am developing a restaurant GEO analysis tool for a business. The initial scope is two public discussion threads in r/FoodNYC and r/Flushing. We need read-only access to public comments and nested replies to identify restaurant mentions and retain necessary source excerpts with comment permalinks. We do not need account profiles, private messages, posting, voting or moderation actions. This is an external analysis workflow, not an app running inside Reddit/Devvit. Please advise the appropriate access/licensing route, permitted retention and sharing of excerpt-based JSON project handoffs, and whether any fees apply. No API collection will run until access is approved.

两个实际帖子：

- https://www.reddit.com/r/Flushing/comments/1wfu6sh/best_hot_pot_in_flushing
- https://www.reddit.com/r/FoodNYC/comments/1wmlr4l/best_all_you_can_eat_hot_pot_in_manhattan_or_lic

提交申请是你在官方页面上的操作；本工具不会自动代发申请或注册账号。若审批不通过，保存原因，之后按卡片要求向mentor说明。

## 2. 获批后配置应用与本地变量

按Reddit获批流程创建/取得OAuth客户端，并在申请中说明卡片要求script类型。当前本地授权工具使用authorization-code + refresh-token流程，需要批准的客户端支持该流程；不要把script的password流程与浏览器授权流程混用。若批准流程指定其他客户端类型，先与mentor核对卡片要求再配置。历史官方[客户端类型说明](https://github.com/reddit-archive/reddit/wiki/OAuth2-App-Types)和[浏览器授权示例](https://github.com/reddit-archive/reddit/wiki/OAuth2-Python-Example)可供技术参考，实际支持方式以本次批准答复为准。本工具不采集Reddit密码。注册本地回调地址：

```text
http://127.0.0.1:8765/callback
```

在项目根目录 `.env` 填写以下三项，值不发到聊天、不提交Git：

```dotenv
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=script:fyno-geo:1.0 (by /u/YOUR_REDDIT_USERNAME)
REDDIT_REDIRECT_URI=http://127.0.0.1:8765/callback
```

User-Agent中的用户名换成实际账号。先核对Reddit批准的用途、存储/分享限制及计费条件；如果需要付费且本卡预算不足，先协调。

## 3. 用本地工具取得refresh token

```sh
npm run reddit:auth -- --start
```

终端只显示本地地址；在浏览器打开该地址，点击只读授权入口，在Reddit页面自行登录并确认。工具请求 `read` scope 和永久授权，通过随机state核对回调，随后将 `REDDIT_REFRESH_TOKEN` 私密保存到 `.env`，保留其他配置。token不打印到终端或网页。不需要把密码、code、token发给agent。

回调服务器仅绑定127.0.0.1，10分钟后关闭；成功后也会关闭。只在获批、应用和回调配置齐全后运行。若端口被占用，可以同时修改注册回调和 `REDDIT_REDIRECT_URI` 的端口，路径仍为 `/callback`。

## 4. 实际接口验收

复用已抓HTML，只实时访问官方Reddit接口，避免重新请求已限流的网页：

```sh
npm run build
npm run collect:media -- --offline-html
npm run verify:media-current
```

输出位于 `.local/issue20/current/`。检查 `access-checks.json`、`evidence.json` 和 `reddit-review-template.json`。缺凭据、OAuth被拒、限流、帖子已删除及未取全的回复均有独立状态；不自动切到匿名访问，不恢复删除正文。

自动识别词表来自本次媒体条目及目标别名，原文之外不生成店名。它可能漏掉不在词表里的餐厅，因此自动结果不宣称提及已列全。可由操作者或agent核对全部可读评论，把模板另存为 `.local/issue20/reddit-mentions.json`，补齐原文字段区间，将已核对评论 `reviewed` 设为true；没有餐厅提及的评论也要明确空区间。程序检查原生评论ID、区间和完整覆盖。内容指纹不含抓取时间：原文未变可以重用，评论增删或编辑则失效。

```sh
npm run collect:media -- --offline --reddit-review .local/issue20/reddit-mentions.json
npm run verify:media-current
```

API评论快照不含作者/账号资料，仅保存当前必要正文及原生链接，刷新时覆盖；删除/移除的正文不保存，已知帖子删除会清掉旧快照。本地API缓存24小时到期，读取时移除。输出/复核文件也应随最新结果更新，数据保留及任何后续分享按实际批准条件执行；本阶段不推送这些材料。

`reddit_api_calls`/`reddit_oauth_calls`是本次调用次数，`capture_api_calls`是快照原采集次数。离线重放不计新调用。真实API发生请求但缺计费证据时费用标为未知，不自动算成US$0。
