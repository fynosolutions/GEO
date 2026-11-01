# GEO Check

本地餐馆跨平台资料对照网站。输入门店官网（多分店可补充地址），提交后跳转到独立结果页，通过 OpenAI Responses API 的网页搜索工具发现并尝试读取平台页面，逐列呈现结果。

## 当前功能

已恢复八个平台，并保留官网对照列，共九列。所有第三方平台使用同一套多路径采集流程。结果页可点击 Stop search 中断请求并保留已完成结果；基础信息允许使用明确标注的目标平台搜索摘要证据。历史三列审计仍按原批次内容显示。

已加入多路径补充：索引/页面文字 → 本地浏览器文字 → 截图视觉识别。截图路径使用两次模型调用进行提取和核对，保留图片与区域证据；同平台只补缺失字段，有冲突不静默覆盖。默认开启 VISION_FALLBACK，图像能力可通过 OPENAI_VISION_MODEL 配置。识别成功不等于完整覆盖或无误，受限页面仍可为null。

- 八个平台：Google Maps、Yelp、Tripadvisor、OpenTable、Uber Eats、DoorDash、Toast、Grubhub。
- 15个业务字段，仅评论风向允许AI总结；其他值保留平台原文，缺失值为null。
- 后台执行、页面轮询、来源证据及评论采样说明、八个平台及官网共九份独立JSON下载和本地持久保存。
- 搜索读取受限时，自动尝试Playwright浏览器备用读取，默认使用已安装Edge；显示采集方式、尝试状态及截图。不会绕过验证码或登录墙，详情见配置说明。
- 未配置key时明确提示；无法访问、未找到、分店不明等情况分别处理。
- 当前不是完整GEO评分或AI推荐率检测系统。网页搜索不保证能访问每个平台，也不能保证完整评论覆盖。

## 启动与接入

Windows 推荐双击根目录 `Start-GEO.bat`。它直接使用 `E:\CondaEnvs\geo\node.exe`，自动构建并启动，无需先激活 Conda，也不依赖终端是否能识别 npm。保持窗口开启，浏览器访问窗口打印的网址，按 Ctrl+C 停止。运行 `Start-GEO.bat --check` 可仅构建并执行模拟测试，不启动长期服务或调用真实 API。

Node.js 22+，现有Conda环境geo可用。

```powershell
conda activate geo
npm ci
Copy-Item .env.example .env
notepad .env
```

仅在.env不存在时执行复制；填入OPENAI_API_KEY并保存，不要把密钥放进前端。已有.env直接编辑，避免覆盖。

```powershell
npm run check
npm run build
npm test
npm start
```

访问 http://127.0.0.1:3001。也可以沿用 `python scripts/serve.py` 构建并启动。首次真实调用前确认API项目有余额和模型/网页搜索权限。

详细配置、费用、接口、存储与部署说明：[docs/API_SETUP.md](docs/API_SETUP.md)。

## 目录

- backend/：HTTP服务、配置、采集任务、Schema、英文提示词。
- frontend/html/：首页与独立结果页。
- frontend/ts/：表单提交、结果轮询与安全文本渲染。
- frontend/css/：页面样式。
- scripts/：构建、Python启动入口、模拟OpenAI测试。
- config/：TypeScript编译配置。
- .local/audits/：运行时结果，每批次独立目录，不提交。
- dist/：构建输出，不提交。

## 验证范围与边界

类型检查、构建、模拟OpenAI的HTTP流程/八份JSON保存下载及证据约束测试已接入。模拟测试不调用真实API、不验证第三方平台实际可读性。配置key后的首个真实门店需人工对照来源验收。重启中的任务会标记interrupted；不会自动产生收费重试。

默认仅监听本机。当前无身份验证，不要直接公开部署可产生API费用的接口。远程部署使用持久Node主机和持久数据盘，并放在有认证的私有反向代理/VPN之后，单实例运行。API key保留在服务端环境或.env中。
