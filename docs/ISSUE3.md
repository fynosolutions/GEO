# Issue #3 交付说明

代码位于 codex/geo-audit-apify-20261101 分支，主要在 backend/collection.ts、backend/apify.ts 和 config/apify.json，frontend/ 提供本地可视化测试。配置 APIFY_TOKEN 后执行 npm ci、npm run build，再运行 npm run collect -- --name "店名" --address "完整地址" --platforms yelp，生成 out/<店名>.json。采集先通过 Google Maps 确认目标，再使用完整地址和电话查找 Yelp 候选；最多三个不同候选依次抓取，至少两项身份信息一致才返回，匹配成功立即停止，否则 matched:false 并清空门店资料、记录原因。构建和 32 项自动测试通过，两家真实门店实测的名称、地址、电话均一致；原始响应和输出保存在本机 .local/validation/kfc-yelp-2026-11-04T07-39-03-252Z/。该目录为本机证据，不随 Git 推送。源站和搜索结果变化仍可能造成漏店，缺失字段保留 null。代码按用户指令合并推送至上述分支，默认 main 不在本次范围内；Issue 评论由用户发布。
