# GEO Check

本地餐厅跨平台资料审计与对比网站。输入餐厅官网，识别具体门店，通过 OpenAI 搜索、本地 Playwright、截图视觉和 Apify 分别采集资料，在同一张表中比较原有多路径与 Apify 两个版本。

当前技术栈：**Node.js 原生 HTTP 服务 + TypeScript + 静态 HTML/CSS + Playwright**，不是旧 main 分支的 Next.js/SQLite 项目。没有数据库初始化或迁移步骤。

## 1. 运行需求

| 项目 | 要求 |
| --- | --- |
| 系统 | 优先使用 Windows 10/11 + PowerShell，当前启动器及测试以 Windows/Edge 为基线 |
| Node.js | **24.14.0 或更高的 24.x 版本**，已测试 24.21.0。当前配置模块使用 node:http 的 setGlobalProxyFromEnv；旧 Node 22 和较早 24.x 不适用 |
| npm | 随 Node.js 安装，用于 npm ci、编译与测试 |
| 浏览器 | 已安装 Microsoft Edge，Windows 默认使用 Playwright 的 msedge channel |
| OpenAI | 网页审计必须配置 OPENAI_API_KEY，并有可用额度；模型须支持 Responses、web_search、结构化输出；开启视觉时还须支持图片输入 |
| Apify | 可选；启用第二版真实采集需要 APIFY_TOKEN、可用额度及对应 Actor 的访问权限 |
| 网络 | 能访问 npm、OpenAI、Apify 和目标站点；必要时配置可用 HTTP/HTTPS 代理 |
| 存储 | 对 .local 有读写权限，用于结果、截图和持久浏览器会话 |
| Git | 克隆与更新代码时需要；不是运行服务的依赖 |

Python、Conda 均不是 npm 启动的必需依赖。Python 启动脚本仅为可选入口；requirements.txt 没有额外 Python 包。浏览器和并发任务会占用额外内存，建议在普通桌面环境运行，保留足够磁盘空间保存截图和会话。

注意：package.json 的 engines 与启动器仍只检查 Node 主版本 >=22，这是旧的宽松检查；**实际运行以本 README 的 24.14+ 要求为准**。[Node 官方 API 版本说明](https://nodejs.org/api/http.html#httpsetglobalproxyfromenvproxyenv)

## 2. 获取当前分支并安装依赖

新机器可直接克隆当前版本：

~~~powershell
git clone --branch codex/geo-audit-apify-20261101 --single-branch https://github.com/fynosolutions/GEO.git
cd GEO
node --version
npm --version
npm ci
~~~

已有本地目录请进入项目根目录，不要在同一目录再次 clone。修改过的本地文件应先自行保存，再进行 Git 更新。

## 3. 配置服务端 .env

首次运行，仅在 .env 不存在时复制模板：

~~~powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
~~~

基础配置：

~~~dotenv
OPENAI_API_KEY=你的OpenAI密钥
OPENAI_MODEL=你的账户可用且支持所需能力的模型
HOST=127.0.0.1
PORT=3001
AUDIT_DATA_DIR=.local/audits
~~~

不要把上面的中文占位值直接用于运行。现有 .env 可直接编辑，不要重新复制覆盖。已有系统/进程环境变量可能优先于 .env，调整后请重启服务。

要同时生成 Apify 版本，再配置：

~~~dotenv
APIFY_TOKEN=你的ApifyToken
APIFY_ENABLED=true
APIFY_CONFIG_FILE=config/apify.json
APIFY_MAX_CHARGE_USD=0.50
~~~

Token 获取：登录 [Apify Console](https://console.apify.com/)，进入 API & Integrations 创建或复制 API Token，见 [官方说明](https://docs.apify.com/integrations/api)。没有 Token 时仍可运行原有多路径，Apify 不会发起真实任务。

密钥仅放服务端 .env 或服务端环境变量，不写入前端，不提交 Git。真实审计消耗 OpenAI 和 Apify 额度；免费计划也有额度限制。APIFY_MAX_CHARGE_USD 是随单次 Actor 请求传入的限制，其实际作用取决于计费模型，**不是整次审计或账户总预算保证**。

完整配置项见 [.env.example](.env.example) 和 [Apify 接入说明](docs/APIFY_SETUP.md)。旧文档中的阶段说明与当前行为有差异时，以本 README 和 [双版本报告](docs/TWO_VERSION_COLLECTION.md) 为准。

## 4. 启动服务器

### 方式 A：标准 npm 启动

在项目根目录执行：

~~~powershell
npm run build
npm start
~~~

打开终端打印的地址，默认 [http://127.0.0.1:3001](http://127.0.0.1:3001)。保持终端运行；按 Ctrl+C 停止。npm start 不会自动重新编译，修改代码后应先停止旧服务，再重新 build 和 start。

### 方式 B：Windows 一键启动

双击根目录 [Start-GEO.bat](Start-GEO.bat)，或在 PowerShell 中执行：

~~~powershell
.\Start-GEO.bat
~~~

启动器默认使用原开发机器的 E:\CondaEnvs\geo\node.exe，依赖缺失时安装，随后编译并启动。其他机器先指定自己的 Node 路径，例如：

~~~powershell
$env:GEO_NODE = 'C:\Program Files\nodejs\node.exe'
.\Start-GEO.bat
~~~

GEO_NODE 是进程环境变量，要在运行 bat 前设置；只写进 .env 不能改变 bat 在启动前选择的 Node。依赖缺失时，启动器还需要该 Node 环境中存在 node_modules/npm/bin/npm-cli.js。

### 浏览器准备与其他系统

Windows 已安装 Edge 时通常不需再下载 Playwright 浏览器。若改用 Playwright Chromium：

~~~powershell
npx playwright install chromium
~~~

然后在 .env 设置 BROWSER_CHANNEL=chromium。默认 BROWSER_HEADLESS=true，无须显示打开浏览器。

Linux/macOS 使用 npm 命令启动，可配置 Chromium，并按 Playwright 安装所需系统依赖；当前自动化浏览器测试明确使用 msedge，不承诺在未装 Edge 的非 Windows 主机直接通过。不要用 Windows bat 作为 Linux 启动入口。

## 5. 使用步骤

1. 打开首页，输入餐厅官网，多分店时补充目标地址。
2. 提交后跳转独立结果页，显示当前阶段、耗时、来源和可下载 JSON。
3. 主表展示 10 个字段及其 apify_ 版本，共 20 行；各平台为列，官网是额外对照来源。
4. 无数据的平台默认显示在下方状态区，可通过 Show unavailable platforms 恢复表格列。
5. Stop search 可中断任务并保留已完成结果；远端 Apify 中止为尽力操作，提示未确认时请到 Console 检查。
6. 任务可能持续数分钟。重启服务会将未完成任务标记为 interrupted，不自动补跑收费请求。

同一实例只接受一个活跃审计；平台任务内部有两个工作者，浏览器读取串行。不要同时用独立 probe 和审计占用同一浏览器配置目录。

## 6. 当前采集路径

~~~text
输入官网 → 确认门店名称与地址
  └─ 每个平台独立执行
      ├─ A. OpenAI web_search：发现门店页，尝试读取页面或精确门店索引摘要
      ├─ B. Playwright：后台持久会话，读取可见文本与链接
      ├─ C. 图片输入：读取保存截图，再用第二次视觉调用核查
      ├─ D. 独立英文问题 + web_search：前面没有取得字段时兜底
      ├─ E. 英文评论主题查询：review_themes 缺失时补查实际评论证据
      ├─ 保存多路径版本
      ├─ F. Apify Actor：独立运行、轮询、下载完整 dataset
      ├─ Apify 有真实评论正文时，独立生成英文样本总结
      └─ 保存 Apify 版本 → 同表展示两个版本
~~~

- 官网列目前主要由检索工具读取官网及其证据，不意味着本地浏览器已遍历所有官网页面。
- B/C 分支依结果状态、候选 URL 与可读性触发。截图识别不能从验证码或空白页恢复未加载的餐厅资料。
- D 主要兜底“所有字段为空”，不是对每个缺失字段无限重试；发生 API 连接异常时也不保证能到达所有后续分支。
- 每个平台先多路径、再 Apify；不强制等待八个平台的多路径全部完成才启动任何一个 Apify。
- 程序编写的模型指令与提问模板均为英文。商家名称、字段原文和证据可以保留来源语言。
- 默认英文/美国界面，但平台可能忽略语言偏好。记录原文，不擅自翻译或统一价格、数量、日期及时间表达。

常用开关：

| 变量 | 默认行为 |
| --- | --- |
| BROWSER_FALLBACK | 启用本地浏览器补充；设 false 关闭 |
| BROWSER_HEADLESS | true，无窗口运行 |
| BROWSER_PROFILE_DIR | .local/browser-profiles，按平台保存专用会话 |
| BROWSER_SETTLE_TIMEOUT_MS | 45000，导航后的被动等待，上限 120000 |
| VISION_FALLBACK | 启用截图提取与核查 |
| OPENAI_VISION_MODEL | 可另配图片输入模型；未设置则使用主模型 |
| QUESTION_FALLBACK | 启用独立问题兜底 |
| REVIEW_THEMES_FALLBACK | 启用缺失评论主题查询及 Apify 评论正文总结 |
| APIFY_ENABLED | Token 存在时运行已配置 Actor；设 false 关闭 |

## 7. 对比字段与保真规则

| 字段 | 内容 |
| --- | --- |
| name | 门店名称 |
| address | 地址 |
| phone | 电话 |
| opening_hours | 营业时间，保留配送、自取和部分时间等限定 |
| cuisines | 菜系或分类 |
| rating | 平台评分 |
| review_count | 评分/评论数量，保留来源口径 |
| official_website | 实际返回的商家官网，不以平台门店链接替代 |
| price_range | 价格档位或区间，不推算人均 |
| review_themes | 有实际评论证据的有限总结 |

每项另有 apify_ 前缀行，例如 rating 与 apify_rating。两版互不补值；原始 JSON 仍分别保留 values 和 apify 结构，不宣称下载格式已变为扁平 20 字段。

页面缺失显示 —，不代表零；原始结果保留 null 或真实状态。评论主题是唯一允许总结的业务字段，必须说明样本局限。单条评论不代表整体风向，评论标签和商家宣传不能冒充评论正文。供应商数据不一定等于网页逐字原文，数值类型与字符串类型保留。

人均、最近评论日期、菜单链接、评分满分等退出常规表格；为兼容历史数据，原有 15 字段 schema 与原始属性仍保留。

## 8. 八个平台的当前状态

以下是 2026-11-01 Easy Joy、纽约 145 Mulberry St 的实测，不是所有店铺或未来运行的成功率保证：

| 平台 | Apify Actor | 结果 |
| --- | --- | --- |
| Google Maps | compass/crawler-google-places | 返回目标门店记录，61 个顶层字段 |
| Yelp | epctex/yelp-business-api | 替换旧 Actor 后返回记录；电话与官网不同，需核对 |
| Tripadvisor | maxcopell/tripadvisor | 返回目标门店记录，52 个顶层字段 |
| Uber Eats | memo23/uber-eats-scraper | 返回商家、菜单及一条评论样本 |
| DoorDash | memo23/doordash-reviews-cheerio | 返回嵌套门店数据，已适配评分、数量及地址 |
| Grubhub | natanielsantos/grubhub-scraper | 返回电话、菜系、评分、数量及时间结构 |
| OpenTable | s-r/opentable-scraper | 一次为空，复测错店；已拒绝错店，尚无有效目标结果 |
| Toast | 暂无已验证适配 | 缺少已核实目标门店链接与可验证 Actor，明确跳过 |

Actor 配置在 [config/apify.json](config/apify.json)。更换产品时必须核对其输入 schema，不是只替换 Actor 名称。没有对应门店 URL 时，依赖该 URL 的 Actor 跳过；搜索式 Actor 仍可能返回错店。

## 9. 结果文件与目录

~~~text
backend/                 HTTP 服务、采集任务、供应商与英文提示词
frontend/html/           首页与结果页
frontend/ts/             表单、结果渲染与语义字段映射
frontend/css/            样式
config/                  TypeScript 和 Apify 配置
scripts/                 构建、测试、诊断脚本
.local/audits/<id>/       每次审计的 job.json、各平台结果、研究响应与截图
.local/browser-profiles/ 持久浏览器会话
.local/apify-*/          独立 probe 的本地结果
dist/                    构建输出
~~~

审计中的 <platform>.multipath.json 保存原有路径版本，<platform>.apify.json 保存供应商版本，<platform>.json 保存结果页读取的合并容器。原始 Apify dataset 所有下载字段保留，最多下载 10,000 条记录，达到上限标记 truncated。

.local、.env、node_modules 和 dist 不提交 Git。文档中的本地样本 ID、截图与快照不会随 clone 下载；新机器需要配置后自行运行，也不需要复制开发者的浏览器会话。

## 10. 检查与测试

~~~powershell
npm run check
npm run build
npm test
~~~

完整测试覆盖证据过滤、取消、JSON 保存下载、浏览器/视觉模拟、字段映射、双版本隔离、错误分店拒绝及评论样本。依赖已编译的 dist，因此首次 npm test 前必须 build；浏览器测试需要 Edge。

测试中的 OpenAI 与 Apify 请求使用模拟或假 transport，审计模拟显式禁用真实 Apify。测试通过不能证明远端网站当前可访问。此行为与下面真实 probe 不同。

~~~powershell
.\Start-GEO.bat --check
~~~

该命令编译后只运行 scripts/audit.test.mjs 这一组，不等价于 npm test 的完整套件。

真实付费诊断（会消耗额度）：

~~~powershell
node scripts/probe-apify.mjs yelp
~~~

这个脚本内置 Easy Joy 的测试上下文，不是通用批量采集入口。缺 Token 会直接提示并退出。其他历史 probe 可能依赖未随 Git 上传的 .local 样本，应先阅读脚本，不能将其当作新机器必跑步骤。

## 11. 常见问题

| 问题 | 处理方式 |
| --- | --- |
| npm 无法识别 | 安装 Node/npm 并重新打开终端；或设置 GEO_NODE 后用 bat |
| 报 setGlobalProxyFromEnv 导出不存在 | 当前 Node 太旧，升级到支持该 API 的 24.14+，确认启动器实际选择的路径 |
| Edge executable 不存在 | 安装 Edge；或安装 Playwright Chromium 并设置 BROWSER_CHANNEL（完整测试仍需 Edge） |
| 端口被占用 | 在原服务窗口 Ctrl+C；或修改 PORT 后重启，不同时启动两个同端口服务 |
| OpenAI ECONNRESET / CONNECT_TIMEOUT | 检查网络和代理；这是 API 连接问题，不是目标平台的封禁证据 |
| Apify 401/403、Actor 失败 | 检查 Token 权限、Actor 套餐、额度、输入 schema 与 Console 运行日志 |
| empty / skipped / location_mismatch | 分别为无返回、未运行/缺条件、错误门店；查看具体原因，不用其他平台值补齐 |
| 修改代码或 .env 后仍旧 | 停止旧服务，重新 build 并启动；浏览器刷新结果页 |

Windows 会在未显式配置时尝试读取系统代理。需要显式代理时，在 .env 设置（地址按自己的代理修改）：

~~~dotenv
HTTPS_PROXY=http://127.0.0.1:7890
NO_PROXY=localhost,127.0.0.1,::1
# 浏览器需要不同代理时才设置：
# BROWSER_PROXY=http://127.0.0.1:7890
~~~

## 12. 范围、安全与相关文档

当前系统是资料采集与对比工具，不是完整 GEO 评分或 AI 推荐率监测系统。验证码、登录墙、网站规则、供应商限制、索引滞后及模型误读均可能导致缺失或不准确；不能保证完整评论、最新评论排序或八个平台全量采集。

默认仅监听本机，当前没有身份验证，不应直接向公网开放可产生 API 费用的接口。远程使用需配置认证、持久磁盘和单实例运行。保留供应商、证据及数据使用限制，商用前核实数据展示和存储权限。

- [2026-11-01 今日更新与待办](update-2026-11-01.md)
- [双版本采集和实测报告](docs/TWO_VERSION_COLLECTION.md)
- [Apify 配置与阶段记录](docs/APIFY_SETUP.md)
- [API 接入说明](docs/API_SETUP.md)
- [更新历史](update.md)
