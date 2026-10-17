# 餐厅平台资料采集脚本

独立开发的第一步：输入餐厅名称和位置，查找 Google Maps、Yelp 门店，输出一个门店的两份平台资料。暂不与本地商家事实比对，也不修改平台内容。不依赖 Elmo、数据库或付费 API。

优先采集 Google Maps 时，使用新入口 `pnpm collect:google --name "Easy Joy" --location "145 Mulberry St, New York, NY"`，详见 [Google 专用说明](GOOGLE_MAPS.md)。该入口独立处理有限视图、限流、验证页及 About/Menu 栏目。

在日常已登录 Chrome 中半自动采集，使用 [本地采集扩展](extensions/google-maps-collector/README.md)：人工打开/展开页面，点击扩展采集并导出 JSON，再用 `restaurant_collector/import-manual.mjs` 生成报告。

## 安装与运行

克隆 GEO 仓库后先进入 `restaurant-collector` 目录；本目录是独立 Node 项目，不需要启动 Elmo。扩展安装无需 Node，见上方扩展说明。

需要 Node.js 22+、pnpm 和浏览器：

```sh
pnpm install
pnpm exec playwright install chromium
node restaurant_collector/cli.mjs --name "Easy Joy" --location "145 Mulberry St, New York, NY"
```

默认打开可见的独立浏览器。后台运行可加 `--headless`。位置建议写街道、城市和州，名称允许少量拼写错误；不要求输入与平台完全相同。搜索服务本身能否召回错拼名称仍受平台影响，算法不能匹配未被召回的候选。

```sh
node restaurant_collector/cli.mjs --name "Easy Jiy" --location "146 Mulbery St, New York, NY" --output output/easyjoy
```

每个平台最多检查 5 个候选（`--limit 1` 至 `--limit 10`）。名称和位置分别满足最低相似度后才选择综合得分最高者；第一名与第二名得分过于接近时返回 ambiguous。分数是启发式排序分，不是正确概率。仅输入城市时，同品牌多分店可能需要更详细的地址。

可以用明确的详情页链接缩小检索范围，仍执行名称/地址校验：

```sh
node restaurant_collector/cli.mjs --name "餐厅名称" --location "街道, 城市, 州" \
  --google-url "https://www.google.com/maps/place/..." \
  --yelp-url "https://www.yelp.com/biz/..."
```

macOS 未安装 Playwright Chromium 时会自动尝试 `/Applications` 下的 Google Chrome。其他路径可设置 `GEO_BROWSER_EXECUTABLE` 为浏览器可执行文件路径。`GEO_PLAYWRIGHT_MODULE` 可指定已有 Playwright 的入口模块绝对路径。脚本不使用个人浏览器档案或保存登录态。

## 输出

每次创建独立输出目录，标准输出也是 JSON：

| 文件 | 内容 |
| --- | --- |
| result.json | 一个门店、两平台各自的字段、状态、匹配分与来源 |
| report.md | 名称、详细地址、电话/网站、简介、特色菜的可读报告 |
| google_maps/yelp.html | 成功匹配详情页的渲染 HTML |
| google_maps/yelp.png | 对应详情页截图 |

字段分平台保留，不将 Google 的值冒充 Yelp 的值。简介保留原文及栏目类型；平台摘要不标为商家自述。特色菜只从明确的 Popular dishes / Signature dishes 栏目获取，不从评价猜测，也不把普通菜单条目当特色菜。未取到的值为 null、状态 not_collected，不能据此认定平台未填写。

整体状态：matched（两平台匹配且分店一致）、partial（仅一平台取得）、ambiguous/not_found（各平台诊断）、cross_platform_conflict（两平台似乎不是同一分店）、unresolved（无可确认门店）。整体未完全 matched 时退出码为 2，参数/启动错误为 1。

登录墙、验证码、403、页面结构变化会返回失败诊断；没有绕过验证的功能。第一版页面选择器属于待真实平台校准的实现，不能承诺每家餐厅都能取得简介和特色菜。若平台未展示这些内容，输出对应未知状态。

输出包含页面资料，保留和使用应按实际来源要求处理。不要提交 output、浏览器凭证或密钥。

## 验证与接入

```sh
pnpm test
```

离线测试覆盖错拼名称、门牌号错误、同名分店歧义、错误品牌、跨平台分店冲突及缺失字段。页面抽取另以本地浏览器夹具验证；这些测试不能替代 Google/Yelp 真实采集验收。

当前格式为 restaurant.collection.v1；之后可增加转换器映射到 Elmo 的 geo.snapshot.v1。门店 ID 在确认匹配后由主工作台分配，采集脚本不创建确认事实。

## 当前验证结果（2026-10-15）

- 36 项匹配、栏目归类、菜单过滤、存储导出及本地浏览器测试通过。浏览器测试使用本地夹具，不代表 Google/Yelp 所有真实页面均已验收。
- Google Maps 独立脚本取得过真实门店的名称、地址、电话和官网，但出现有限视图，未完整取得简介及特色菜；Yelp 实测返回 HTTP 403。
- 半自动扩展的用户实测文件包含概览、Lunch Menu、About 三份快照；菜单过滤修复后可结构化 4 道午餐菜及 12 组、41 项 About 属性。其他菜单分类尚需逐项采集，简介及部分概览热门菜卡片仍有覆盖缺口。
- 用户导出文件、运行证据、个人浏览器状态和凭证均不纳入提交。

```sh
# 在仓库 restaurant-collector 目录中执行
pnpm test             # 无需浏览器的逻辑测试；浏览器测试跳过
pnpm test:browser     # 所有 36 项测试，需先安装 Playwright Chromium
pnpm build:extension  # 同步扩展的 DOM 抽取器
```

更完整的原因、实测依据及后续 API 路线见 [脚本检索限制说明](SCRIPT_LIMITATIONS.md)。
