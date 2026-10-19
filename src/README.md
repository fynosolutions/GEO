# 应用源代码

统一存放页面入口、业务模块、基础设施和通用代码。

本目录内容与职责：

- app/：页面、路由及交互入口。
- modules/：按业务领域组织的功能。
- infrastructure/：数据库、文件存储和外部服务适配。
- shared/：跨业务通用的界面组件及工具。

边界与约定：Next.js App Router 位于 app/，商家业务和公开类型位于 modules/merchant/，数据库和文件操作由 infrastructure/ 适配。

当前状态：F1 已实现；检测、优化、报告仍为骨架。
