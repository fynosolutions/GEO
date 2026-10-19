# 餐馆 GEO 工作站

面向单人操作者的餐馆资料、GEO 检测、优化与复测报告工作站。本目录即项目根目录，不再额外嵌套 geo-workstation/。

当前产品面向美国餐馆，工作站界面、11 类资料目录、提示和导出使用英文；新资料使用 US、USD、美国地址和明确选择的门店时区。地区与语言规则、旧资料兼容及 f1.v2 接入变化见 [美国餐馆基线](docs/US_MARKET_BASELINE.md)。开发协作文档保留中文。

F1 商家资料库已提供本机 Web 应用、SQLite 持久化、11 类人工资料维护、版本与公开读取接口、素材、导出及备份恢复。检测、优化、报告仍为占位，未接入外部模型。单人使用，无登录、账号和权限管理。

技术基线：TypeScript、Next.js App Router、Tailwind CSS、shadcn/ui 风格基础控件、Drizzle + better-sqlite3。界面桌面优先、浅色、简单，便于连续录入。依赖版本由 package.json 与 package-lock.json 固定。

## 目录

```text
src/
  app/                       页面与路由入口
    merchant/                商家资料页面
    detection/               检测页面
    optimization/            优化页面
    reports/                 报告页面
  modules/                   业务规则与用例
    merchant/                F1 商家资料及公开接口
    detection/
      core/                  检测批次与执行记录
      prompt-monitoring/     A1 提示词检测
    optimization/
      core/                  问题、建议与修正任务
      consistency-audit/     B1 一致性检查
    reports/
      comparison/            前后复测比较
  infrastructure/
    database/                数据库运行支持
    storage/                 文件存储适配
    providers/               外部服务适配
  shared/
    ui/                      通用界面组件
    utils/                   通用基础工具
database/
  migrations/                数据库版本变更
docs/                        需求、契约与开发规范
tests/                       跨模块集成与端到端验证
AGENTS.md                    AI Coding 项目规则
README.md                    项目总览
```

每个目录均有 README.md，说明用途、职责和使用边界。merchant/public.ts 提供实际商家服务；其他业务模块的 public.ts 仍为占位。scripts/ 提供本机启动支持。

## 阅读入口

- [项目范围与需求索引](docs/PRD.md)
- [F1 商家资料库详细需求](docs/F1_MERCHANT_LIBRARY_PRD.md)
- [模块数据契约草案](docs/API_CONTRACTS.md)
- [开发规范](docs/DEVELOPMENT_RULES.md)
- [功能路线图](docs/ROADMAP.md)
- [AI Coding 规则](AGENTS.md)

## 核心约定

- 商家模块拥有商家主数据，其他模块通过公开接口读取。
- 页面负责展示与交互，业务规则归模块，技术适配归基础设施。
- 检测和报告保留资料版本及证据引用，避免商家编辑改变历史解释。
- 标准事实与渠道快照分开保存，诊断结果不静默覆盖标准事实。
- 后续功能先记录在路线图，实际开发时再新增目录。

## 启动与验证

要求 Node.js 24 LTS、npm；Windows 浏览器使用 Edge 或 Chrome。

项目 .npmrc 关闭依赖安装生命周期脚本，直接使用当前依赖自带的 Windows 预编译二进制，避免 npm 隐式触发 C++ 编译；已验证干净 npm ci 和后续构建、测试。新增需要安装脚本的依赖前先验证并调整安装方案，不要求操作者自行安装编译工具。

```powershell
npm ci
npm run db:migrate
npm run dev
```

访问 http://127.0.0.1:3000/merchant 。开发和生产服务只监听本机地址。

生产运行：`npm run build` 后双击 `Start-GeoBase.cmd`，或执行 `npm start`。双击 `Stop-GeoBase.cmd` 关闭由启动脚本启动的服务。首次安装依赖需要联网；F1 日常人工维护不依赖外部服务。

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run format:check
```

Windows 端到端测试默认使用已安装的 Edge；其他系统需安装 Playwright Chromium。`npm run test:capacity` 在隔离目录验证 300 门店、3 万明细和 10,200 个小型附件，结束后清理数据。容量测试不代表大文件吞吐或多年编辑历史的性能。

运行数据默认在 `.local/geobase`，备份在 `.local/backups`，均被 Git 忽略。可将 `.env.example` 复制为 `.env.local` 并设置独立的 `GEOBASE_DATA_DIR`、`GEOBASE_BACKUP_DIR`。建议备份指向另一块本地磁盘。禁止将活动 SQLite 数据库放入网络共享或文件同步目录。同一数据目录同时只运行一个工作站实例。

每天首次启动先完整备份；失败时需重试或明确选择继续。恢复前先校验备份，再经页面确认执行整体替换，并自动备份当前数据。不支持按名称合并。

`npm run seed:demo` 仅向独立 `.local/demo-us` 目录写入三家虚构样例，不改动正式数据。查看样例可在 PowerShell 设置 `$env:GEOBASE_DATA_DIR='.local/demo-us'` 后运行开发服务。

- [已确认的实施方案](docs/F1_IMPLEMENTATION.md)
- [接口交接与数据形式](docs/F1_HANDOFF.md)
- [验收及性能记录](docs/F1_VALIDATION.md)

升级前停止服务并保存完整备份，再执行 `npm ci`、`npm run db:migrate` 和 `npm run build`。迁移只增量执行；恢复目前要求备份的数据库迁移版本与程序一致，跨版本恢复应使用匹配版本的程序，不直接覆盖数据库文件。
