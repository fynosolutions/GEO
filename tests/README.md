# 跨模块验证

存放跨模块集成测试和端到端验证，覆盖完整业务流程及关键数据关联。

本目录内容与职责：

- 商家编辑后历史检测仍能引用当时资料。
- 渠道快照可追溯，审计不会静默覆盖标准事实。
- 批次中部分执行失败时指标分母按约定处理。
- 检测条件不同的复测能够标注可比性限制。
- 备份恢复能还原资料、附件关联和历史。

边界与约定：以上为待实现的验证方向，不表示已有测试。模块内部测试可与代码相邻放置；测试框架在技术栈确定后选择，不为目录占位编写空测试。

当前已实现：Vitest 业务、跨模块与备份/运行时集成测试，Playwright 浏览器流程，以及独立容量验证。merchant.test.ts 覆盖状态、校验、归属、历史和公开投影；edge-cases.test.ts 覆盖稳定选项、金额精度、虚拟事实和兼容读取；backup.test.ts / runtime.test.ts 覆盖完整包、失败保护、多实例锁和恢复中断；full-catalog.test.ts 使用全部分类和明细验证公开入口。workspace.e2e.ts 验证真实浏览器录入、失败保留输入、分组导航、核实和备份流程。

运行 npm test、npm run test:e2e。sample-data.ts 是三家明确标记虚构的联调样例；merchant-client.ts 仅从 merchant/public.ts 导入类型与能力，作为同事最小调用示例。npm run seed:demo 将样例写入独立 .local/demo，不改正式数据；capacity.ts 使用临时隔离数据，验证结束后清理。

检测指标与复测测试仍待相应模块实现，不将这些规划当作已验证能力。

美国餐馆基线：us-market.test.ts 验证英文保存、美国地址 / 电话 / USD / 时区、夏令时日期和旧资料备份兼容。sample-data.ts 使用英文美国虚构资料；seed:demo 写入独立 .local/demo-us，原演示目录不覆盖。浏览器测试使用隔离的 .local/e2e-us-data 与 .local/e2e-us-backups；具体通过范围见 docs/F1_VALIDATION.md。
