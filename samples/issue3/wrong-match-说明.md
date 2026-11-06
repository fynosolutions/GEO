# 错误地址反例

人工测试输入 Hop Kee 店名与 Wo Hop 的地址（17 Mott St, New York, NY 10013），详见核对表最后一行。

对应 `wrong-match.json` 的采集时间为 `2026-11-06T12:53:07.846Z`。结果为 `found:false`、`matched:false`，店名、地址、电话、营业时间、评分、评论数和价格档位均为 null。Google Maps 未确认输入的门店身份，后续 Yelp 采集未启动，没有返回其他门店的资料。JSON 保留原始采集结果。
