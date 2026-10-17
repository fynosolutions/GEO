# Google Maps 单店采集

优先运行 Google 专用脚本，无需启动 Yelp 或 Elmo。输入名称和位置，模糊匹配唯一门店，读取基础资料、简介和明确标注的热门/特色菜栏目，按页面观察输出。输出不包含对本地商家资料的比对或修改建议。

## 运行

依赖已安装；其他电脑先执行 `pnpm install --frozen-lockfile` 及 `pnpm exec playwright install chromium`。macOS 未安装 Chromium 时，自动尝试 Applications 下的 Chrome。

```sh
pnpm collect:google --name "Easy Joy" --location "145 Mulberry St, New York, NY"
```

名称和门牌号允许小范围错误，但搜索是否能召回候选取决于平台；只有置信规则通过且无接近候选时自动选定。门店详情链接已确认时加 `--url`，可减少搜索与候选页请求。

验证码或同意页面的人工处理：

```sh
pnpm collect:google --name "Easy Joy" --location "145 Mulberry St, New York, NY" --interactive
```

程序保持可见浏览器并等待终端回车；由用户自行处理页面，不自动填写验证码或账号密码。完成后重新检查页面，仍受限就停止。非交互模式下直接返回对应失败状态。

有限视图下交互模式也会暂停一次，用户可以选择自行登录 Google 后继续，或直接回车保留有限视图。有限视图仍允许保存已取得字段；验证页未解决则停止。

需要在不同运行间保留项目浏览器状态时，可显式启用独立档案：

```sh
pnpm collect:google --name "Easy Joy" --location "145 Mulberry St, New York, NY" \
  --interactive --profile .google-maps-profile
```

档案可能保存登录 Cookie，只留在本机，不提交或分享。默认不使用持久档案；不读取个人 Chrome 档案。登录是否解除有限视图必须实际验证，脚本不承诺登录后一定可取得所有字段。

脚本现已显式启用 `chromiumSandbox: true`，避免 Playwright 默认添加 `--no-sandbox`。这消除的是沙箱禁用参数，不保证 Google 允许在自动化浏览器中登录；Google 官方说明可能拒绝受软件自动化控制的浏览器。因此独立档案不应当被理解为“可保证登录”的方案。

## 输出与判断

输出目录包含 `result.json`、`report.md`，以及 overview、滚动区域、About/Menu 等实际存在栏目对应的 HTML 和截图。简介保留来源类型，热门菜只表示平台热门菜栏目，不等于商家认证招牌菜。商家动态、顾客评价和菜系标签不冒充简介或特色菜。

`fieldCoverage` 列出取得和未取得的五类字段；`completeness` 为 complete / partial / none。`accessTrace` 记录页面访问状态。

| 状态 | 含义与处理 |
| --- | --- |
| available / collected | 页面正常可读，仍需看字段覆盖情况 |
| limited_view | 页面明确显示有限视图；保留取得的值，其他值保持未知 |
| verification_required | 验证页/异常流量；交互模式供人工处理 |
| consent_required | Google 同意页面；交互模式供人工处理 |
| rate_limited | HTTP 429；停止派发，不自动反复重试 |
| access_denied | HTTP 403 等访问拒绝；保留失败证据 |
| ambiguous / not_found | 未能唯一确认门店；保留候选，补充位置后重试 |
| search_unavailable / failed | 页面未就绪、结构变化或其他错误 |

字段不全或失败退出码为 2；参数、环境或启动错误为 1。单机项目锁限制并发；异常强制退出留下锁时，先确认采集进程已停止，再删除 `.google-maps-collector.lock`。

## 访问限制与当前边界

Google 存在异常自动流量识别与验证码机制，但官方 Search 文档没有公开 Maps 的具体检测阈值；不能把 Search 的行为直接当作 Maps 的完整规则。

本项目已有 Google Maps 成功读取基础字段及有限视图的实际证据，没有据此确认网络被封禁。网络、会话、页面自身可展示内容和解析代码都可能影响覆盖。

已实现导航串行执行、默认 4 秒最小间隔、最多 3 个候选（可设 1–5）、验证码/同意页人工处理、429 停止、分栏目证据保存。它们有助于正确处理访问条件，不保证规避检测或稳定获得平台未提供的字段。

简介和特色菜可能没有显示、需要其他栏目、或只存在于图片中。当前不做图片 OCR、不从评论推断特色菜；尚未取得字段显示 null / not_collected。生产批量读取宜评估 Google Places API；其名称、地址、电话及摘要字段有官方接口，而独立“特色菜”字段不能预设为可用。商家授权后的 Business Profile 接口可用于核对商家自己的描述，需另行接入。

官方来源：

- https://support.google.com/websearch/answer/86640
- https://developers.google.com/maps/documentation/places/web-service/place-details
- https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places
- https://developers.google.com/maps/documentation/places/web-service/policies

API 数据的保留、展示和费用需按实际接口规则设计，不能直接复用网页全量证据保存策略。
