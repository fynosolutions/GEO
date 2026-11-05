# Issue #1 交付说明

**代码在哪**：开发分支 `issue1_fix`，按用户要求合并交付至 `codex/geo-audit-apify-20261101`。后者是本次最终可用分支，仓库默认 `main` 不在本次推送范围内。`backend/collection.ts` 负责采集和字段映射，`backend/apify.ts` 调用 Apify，`backend/cli.ts` 输出文件；`config/apify.json` 配置 Actor，`frontend/` 提供本地可视化测试。

**怎么运行**：安装 Node.js 24.14+，执行以下命令并在 `.env` 中配置 `APIFY_TOKEN`：

```sh
npm ci
cp .env.example .env
npm run build
npm run collect -- --name "店名" --address "门店地址"
# 或 npm run collect -- --place-id "Google place ID"
```

当前只调用 Apify，browser 暂停；无需为命令行采集安装浏览器。Windows 可双击 `Start-GEO.bat` 启动本地测试页面。输出 `out/<解析出的门店 name>.json`，含八个平台及指定十二个字段。仅映射字段名，保留 Apify 原值、类型和结构，不统一地址、电话、营业时间、评分或价格。门店核验用的比较文本不写回输出。

**怎么算做对——证据与限制**：

1. Mac 从零安装并跑两家真店：**尚未通过 Mac 验证**。Windows 已完成 Katz’s Delicatessen、Balthazar 的真实采集，并对 Easy Joy 八个平台逐一实测。修复后重放保存的真实响应，Google Maps、Yelp、Tripadvisor、DoorDash、Uber Eats、Grubhub、Facebook 均匹配；OpenTable 返回空。重放没有伪造新网络请求。结果和诊断留在本机忽略目录，未提交真实商家运行数据。
2. 核对三个平台的电话、周营业时间和评分：**尚未完整通过**。Google Maps 电话、评分与输出一致；周营业时间未完整展开核对。OpenTable 页面加载失败，Yelp 出现访问挑战，不能宣称三平台人工核对已通过。
3. 一个平台失败后其他平台继续：**已验证**。异常模拟、空结果、取消和真实八平台运行均保留完整平台记录，失败原因写入 error，其余平台继续。

**其他验证**：TypeScript 检查、构建、26 项测试及 Windows 启动器验证通过。测试包含原值/类型保留、网址解析成餐厅名、私有门店匹配、失败隔离、实际文件下载和页面展示。`npm test` 的浏览器测试需先执行 `npx playwright install chromium`；测试不触发真实 Apify 采集。

**没做或没把握**：Mac 实机安装、三平台完整人工核对仍待补充。OpenTable 空结果及各平台缺失字段按实际结果保留，Actor 权限、额度、源站变化会影响覆盖率，不能保证八个平台均有全部资料。当前不宣称 issue #1 全部验收完成。

**交付位置**：推送完成后，在 GitHub issue #1 评论区发布本说明并补上最终提交 SHA/分支链接及可访问的验证证据，供 Mao 验收。仓库中的本文件不能代替 Issue 下的交付评论。无需单独创建 PR，除非仓库保护规则要求。

## Issue #3 修订：门店核验与单平台调试

用户本轮明确要求在原字段上增加 matched。店名和可选地址先用于 Google Maps 门店解析，再以其名称、地址、电话核验勾选的平台，至少两项匹配才返回资料；否则 matched:false、found:false，门店字段为 null。网页可勾选八个平台，JSON 只包含选中项；未选 Google 时仍内部解析 Google 身份。CLI 支持 --platforms yelp,facebook。未选平台不发起搜索/抓取；无法唯一确认 Google 身份时不调用后续平台。该修订随 issue #3 修复交付，见 docs/ISSUE3.md。
