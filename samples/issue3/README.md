# Issue #8 / #3 Yelp 交付样例

五家门店分别为 Easy Joy、Frydom Express、Hop Kee、Sun Hop Lee 和 Wo Hop，每家一个 Yelp 原始 JSON。选店原因、页面链接、人工核验结果见 `核对表.md`；错误地址反例见 `wrong-match.json` 和 `wrong-match-说明.md`。

从仓库根目录运行 `npm ci`、`npm run build`，配置 `.env` 中的 `APIFY_TOKEN` 后，按以下格式采集：

```sh
npm run collect -- --name "Restaurant Name" --address "Full street address, City, NY ZIP" --platforms yelp
```

程序输出 `out/<店名>.json`。Google Maps 先解析门店身份，Yelp 单平台输出；样例不手动修改采集字段，页面差异保留在核对表中。人工核验由提交者完成；本次交付检查五家 Yelp JSON 均 matched:true，错误地址样例 matched:false 且业务资料为空。
