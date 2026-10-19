# 数据库运行支持

放置数据库连接、客户端初始化、事务支持及持久化适配所需的运行代码。

本目录内容与职责：

- 按最终数据库方案实现连接与生命周期管理。
- 为业务模块提供持久化所需的适配能力。

边界与约定：数据库版本变更脚本统一放在根目录 database/migrations/。表和字段的业务含义归所属业务模块，连接凭据不写入源码。

当前状态：connection.ts 管理 SQLite/Drizzle、WAL 与迁移；schema.ts 定义 F1 表；repository.ts 实现商家公开 Repository 适配。每类明细有独立表，结构化 JSON 由商家字段目录严格校验；版本快照只读。migrate.ts 加载 .env.local 并执行增量迁移。
