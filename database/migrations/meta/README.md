# Drizzle 迁移元数据

由 drizzle-kit generate 管理的 journal 和 schema snapshots，与对应 SQL 一起提交。不要单独重排 journal 或改写已共享执行的迁移；冲突应结合两个分支的 SQL 和真实数据库版本处理。
