# 项目范围与需求索引

状态：F1 已实现，具体工程验收见 F1_VALIDATION.md；本文件保留产品范围索引。

## 产品定位

目标市场为美国餐馆，工作站及标准资料使用英文。11 类资料与地区约定以 [US_MARKET_BASELINE.md](US_MARKET_BASELINE.md) 为当前基线。

餐馆 GEO 单人工作站，由一名操作者管理多家门店，完成建档、检测、优化、复测及报告。当前不建设登录、账号、角色、租户或订阅系统。

## 需求归属

| 领域 | 需求来源与当前状态 | 代码归属 |
| --- | --- | --- |
| F1 商家资料库 | 详细需求见 F1_MERCHANT_LIBRARY_PRD.md；实现及验证见 F1_VALIDATION.md | src/modules/merchant/ |
| A1 提示词检测 | 下一阶段候选；具体范围和验收标准待补充 | src/modules/detection/prompt-monitoring/ |
| B1 一致性检查 | 下一阶段候选；具体范围和验收标准待补充 | src/modules/optimization/consistency-audit/ |
| 报告与复测 | 需先确定指标和比较条件；尚未实现 | src/modules/reports/ |

F1 的详细需求以 [F1 商家资料库产品需求文档](F1_MERCHANT_LIBRARY_PRD.md) 为准，本文不扩大其交付范围。A1、B1 和完整报告不属于现有 F1 本期交付；后续版本号与交付批次待确定。

## 核心业务原则

- 一条 merchant_id 对应一家具体门店，品牌和门店分开管理。
- 标准事实、渠道快照、证据、检测结果各有归属，不重复维护商家主数据。
- 已知、未知、不适用与核实状态分别表达。
- 检测引用当时的商家资料版本，并记录执行条件与证据。
- 问题发现、修正处理和复测结果可关联追溯。

## 实施前待定

- 已确定的技术与存储方案见 F1_IMPLEMENTATION.md；后续模块沿用。
- 商家模块 f1.v2 读取契约已实现；公开入口、完整字段目录和调用示例见 F1_HANDOFF.md。
- A1 检测方式、模型服务、匹配规则、指标口径与失败处理。
- B1 比较字段、标准化规则、问题分类与人工处理流程。
- 报告历史还原、导出格式及复测可比性规则。

后续功能见 [ROADMAP.md](ROADMAP.md)，数据约定见 [API_CONTRACTS.md](API_CONTRACTS.md)。
