# AI Coding 项目规则

## 项目背景

这是餐馆 GEO 单人工作站。F1 使用 TypeScript、Next.js App Router、SQLite、Drizzle、本地文件存储；业务与持久化测试用 Vitest，浏览器流程用 Playwright。检测、优化、报告仍是占位，不描述为已实现功能。实施基线和交接见 docs/F1_IMPLEMENTATION.md、docs/F1_HANDOFF.md。

## 阅读顺序

1. 根目录 README.md。
2. 本次任务涉及目录的 README.md。
3. docs/PRD.md 与相关详细需求，F1 以 docs/F1_MERCHANT_LIBRARY_PRD.md 为准。
4. docs/API_CONTRACTS.md、docs/DEVELOPMENT_RULES.md。

## 实现约定

- 产品面向美国餐馆。界面、11 类字段目录、错误和导出使用英文；新标准资料以英文、US、USD、美国地址和明确门店时区为基线，详见 docs/US_MARKET_BASELINE.md。保留原文证据、原文别名、旧资料及旧单位，不静默翻译或换算。
- 页面交互放 src/app/，业务规则放 src/modules/，技术适配放 src/infrastructure/。
- 模块通过 public.ts 协作，不导入其他模块内部实现或直接读写其数据表。
- 后续模块沿用已确认的技术基线及 f1.v2 商家契约。安装使用 npm ci；不另建商家主数据模型。技术基线或不兼容接口调整需先更新设计与契约、协调调用方。
- 商家模块拥有商家主数据；检测、优化和报告保留资料版本与证据关联。
- 不静默覆盖标准事实，不把未知当作否，不默认公开或外发内部资料。
- 当前没有登录、租户和订阅需求，不主动增加这些系统。
- 后续功能记录在 docs/ROADMAP.md，实际开发时再创建目录。
- 新增目录时补充 README.md，说明职责和边界；更新公开接口时同步维护数据契约。
- 不提交密钥、真实商家数据或运行时数据库及备份文件。
- 保留用户已有文件，不进行无关重构。

## 验证与汇报

按实际变更执行必要验证；优先验证关键业务和跨模块数据完整性，不为占位骨架编写空测试。交付时说明改动、验证结果和待实现内容。实际技术栈确定后更新根 README.md 的命令说明。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
