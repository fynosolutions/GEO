# Issue #2 交付说明

基线：`codex/geo-audit-apify-20261101`，`78392af`。仅修复 #2，不更换平台或实现 #1/#3/#4/#5。

## 修改

- backend/apify.ts：Unicode/NFKC 名称比较，保留中文；混合名称比较全部词段；名称无法解析不再跳过地址检查。仍只将明确冲突标 location_mismatch，供应商结果保持 unverified。
- backend/audit.ts：移除不可达的 official readable 分支。初始化对象始终为 error，且从未浏览器读取；官网继续使用带证据的研究结果，说明改成 browser collection was not attempted。没有新增收费调用。
- backend/auth.ts、server.ts、frontend/ts/auth.ts：所有 /api 路由统一认证，环境变量 GEO_API_TOKEN；Bearer 或签名的 8 小时 HttpOnly/SameSite=Strict 会话。未配置返回 503；缺失/错误认证 401；跨来源写请求 403；URL token 无效。截图、下载、取消、health 同样受保护。前端不持久化 token；HTTPS 部署设置 COOKIE_SECURE=true。
- package.json、锁文件、check-runtime.mjs、Start-GEO.bat、README：统一 Node >=24.14.0；npm check/build/start/test 在加载应用前检查版本。

## 验证

macOS，Node v24.14.0；在没有 .env、dist、node_modules 的新 Git clone 中 标准 `npm ci` 成功（5 个锁定依赖，0 vulnerabilities）。

```sh
npm ci
npm run check
npm run build
BROWSER_CHANNEL=chrome npm test
```

本轮结果：29 项测试全部通过；类型检查、构建、diff 空白检查通过。

测试覆盖中文名称正确/错误、同名错误地址、中英文混合及全角字符；未授权调用 401；Bearer 和浏览器登录；会话篡改、过期和 token 轮换；跨来源与 URL token 拒绝；Node 22/24.13 拒绝、24.14/25 接受；官网 web_search 路径和状态说明；原浏览器/截图/采集与展示回归。测试只使用本地服务、合成页面和模拟供应商，不发起真实付费采集。

## 范围

本机干净安装和启动可以验证；未在另一台物理电脑或 Windows 上实机验收。Windows 启动脚本共用版本检查；CI/实际 Windows 验收仍可补充。共享 token 是本卡要求的最小访问控制，不提供多用户账户和权限系统。原数据匹配组件没有升级为 #3 的完整两项证据匹配。
