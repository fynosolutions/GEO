# 业务模块

按业务领域组织规则、用例及对外接口。

本目录内容与职责：

- merchant/：商家主数据与资料维护。
- detection/：检测批次、执行与评估。
- optimization/：问题、建议和修正任务。
- reports/：报告汇总与复测比较。

边界与约定：模块通过公开接口协作，不跨模块导入内部实现；存在真实复用需求后再提取通用能力。

当前状态：merchant 为实际 F1 业务实现；detection、optimization、reports 仍为占位。
