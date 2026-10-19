# 数据库版本管理

集中存放数据库结构及数据版本变更相关文件。

本目录内容与职责：

- migrations/：按顺序执行的数据库迁移。

边界与约定：运行时连接和客户端代码在 src/infrastructure/database/。采用 SQLite + Drizzle，配置在根 drizzle.config.ts，结构定义在 src/infrastructure/database/schema.ts。

当前状态：migrations/ 已包含有序 SQL 与对应 Drizzle 元数据；运行时数据库不入库。
