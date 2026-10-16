# V1 开发验收记录 — 2026-10-16

本记录区分合成系统验收、真实官网只读检查及尚未执行的真实服务验收。未发布公网服务，未调用付费模型，未发送外部邮件。本轮实际外部API支出为 **US$0**。

## 已执行

| 项目 | 证据与结果 |
| --- | --- |
| 完整自动测试 | 业务库745、网页554、配置118、投递52，共1469项单元／回归测试通过；另有10项Python测试。仓库lint、五个相关包类型检查及依赖许可证检查通过，网页生产构建通过 |
| 类型检查 | `@workspace/lib`与`@workspace/worker`的`tsc --noEmit`通过 |
| 模型运行时及摘要回归 | 5个相关Vitest文件、33个测试通过，覆盖取消／输出上限／零隐式重试、显式Exa、真实搜索状态、401／403判定错误传播及独立投递 |
| Python抓取回归 | 10个测试通过，含缺少业务字段仍进行技术检查、多门店、最多5页、不可达网站无伪造技术分、实际Response在受限流式读取前不能触发`.content`全量下载 |
| 数据库迁移 | 只在新建的独立`auditv1test_<timestamp>`数据库执行27条基线迁移；确认3个新不可变／冻结计划触发器存在。原`restaurant_p1`及`restaurant_p1_test`未迁移、未写入 |
| 完整服务集成 | `scripts/public-audits-integration.mts`通过以下7组检查。主流程20个合成模型回答，额外401／403补测场景共44次合成provider调用；并发峰值OpenAI 2、Gemini 2 |
| 真实官网只读 | 对`https://www.easyjoybuffet.com/`执行安全采集，读取2页，得到1个候选门店、2份网页证据及技术分52。此分数来自有界技术profile，不是AI推荐率；没有询问模型 |
| 真实PDF渲染 | 从合成报告使用生产Playwright渲染器生成81,771字节英文PDF；12页，9个必需部分齐全，保留醒目“Synthetic Test Report”标签；渲染PNG并检查首页、表格续页、证据页与末页，未见重叠／裁切 |
| 浏览器冒烟与布局 | 最新生产构建通过；Headless Edge在隔离测试库、仅localhost环境完成5项检查：英文免费报告表单、390px手机布局、验证页GET不消费令牌且清理地址栏、未授权报告不显示客户数据、管理员页面进入认证入口。最终浏览器错误为0，桌面／手机及权限页面截图已目视检查，无横向溢出或裁切；未初始化管理员的隔离库进入`/auth/register`是预期行为 |
| Compose静态验证 | 基础、仅本机bootstrap、仅本机真实验收override的`docker compose config --quiet`均通过 |
| Linux脚本语法 | `backup.sh`及`restore-drill.sh`通过`bash -n` |
| 隔离数据库恢复 | 在WSL PostgreSQL14上，custom格式dump通过`pg_restore --list`，还原到另一个新建drill数据库。原快照与恢复库的6个audit、5个报告、119条费用预留及全部报告哈希一致 |
| 私有文件恢复 | 独立归档并还原74份私有文件；逐文件SHA-256全部匹配。此演练没有启动恢复库的worker |

数据库恢复快照在后来扩展401／403及删除测试之前生成，所以上表恢复库数量不等于最终测试库数量；这是预先保存快照的正常结果。测试库中不确定调用保留了合成费用预留，不能把这些测试账本数额描述为真实供应商扣款，也没有将不确定预留清零。

## 7组服务集成检查

1. 邮件outbox加密、仅查看链接不消费凭证、验证令牌一次性、客户A／B隔离及平台管理员限制。
2. 确认后固定20个样本、重复确认幂等、数据库拒绝修改冻结计划、P1已确认事实记录数不变。
3. 前6条持久化后恢复；第7条模拟外部成功后无法保存，任务成为uncertain；不重新询问已保存回答，不自动重发不确定调用；交付19／20的partial报告。
4. 管理员依原文复核、发布版本2；版本1及其哈希不变；PDF／邮件再生成不增加模型调用；数据库拒绝改写已发布报告。
5. 每小时邮件限额生效；模拟时间窗结束后恢复链接可用；过期会话被拒绝。
6. 两个并发12美元预留竞争20美元上限，只允许一个成功。仅释放专门创建的、从未产生真实调用的竞争测试预留。
7. 明确401／403拒绝后的人工补测使用新的attempt和费用键，发布新版本并保留旧报告；删除客户内容后证据目录消失，相关操作日志理由及payload移除客户资料。

## 样例与复现

- `samples/restaurant-visibility-synthetic.html`：独立英文HTML，全部结果明确为合成。
- `samples/restaurant-visibility-synthetic.pdf`：对应的真实渲染PDF，只用于排版与投递验收。
- `scripts/public-audits-integration.mts`：仅接受数据库名`auditv1test_<timestamp>`、显式`NODE_ENV=test`和`AUDIT_TEST_MODE=1`；拒绝启用真实模型调用。
- `scripts/public-audits-render-proof.mts`：从隔离测试结果重新生成英文HTML和PDF，不调用模型、不发邮件。

本机原始执行记录保存在`deploy/audits/.state/`，包括测试结果、只读官网证据、备份清单及页面PNG。该目录及全部`.env`被Git及Docker构建忽略，不应打包给客户或提交仓库。

浏览器证据为`.state/browser-smoke.json`、`free-report-desktop.png`、`free-report-mobile.png`、`verify-report.png`、`unauthorized-report.png`及`admin-auth-gate.png`。检查没有发送体检提交／验证POST、没有创建管理员、没有调用模型或发送邮件；本轮临时网页服务与WSL保活进程已全部停止。浏览器检查发现并修复了原登录／注册页在服务端渲染时访问`window`的重定向问题，最终重新构建和复测通过。

## 尚未完成的上线验收

- 按用户要求，OpenRouter和Resend配置及真实模型／邮件测试已暂停；缺少这些配置时公开入口保持关闭。
- 60条可追溯人工标注数据、实际判定器计费调用及质量门槛证据尚未取得。合成评估和人工编写的“通过”字段都不能解除上线门槛。
- 未完成20条真实双模型回答、真实验证／就绪邮件、真实收件人领取与恢复访问的完整端到端验收。
- Docker daemon未启动，未构建、启动Linux容器，未申请真实HTTPS证书，未运行容器版备份脚本。WSL隔离库恢复演练不能被称为服务器部署验收。
- 本轮为软件验证，未完成营业门店资料的人工事实核验，也不作AI排名提升承诺。

## 原有部署兼容修复 — 2026-10-16

原品牌建档的官网摘要恢复为Node.js独立执行，保留Jina Reader及Readability回退，使用带公网地址检查、DNS绑定、逐次跳转检查、大小与时间上限的抓取层。原Node-only Docker镜像不需要新体检的Python采集器、相邻优化器目录或Chromium。新体检的完整官网审计继续使用专用镜像中的Python采集器。

已检查原Dockerfile、CLI Compose生成器及worker入口：原镜像和CLI部署路径保留；只有显式设置 `PUBLIC_AUDIT_WORKER_ONLY=1` 才跳过原队列；未设置时仍注册原队列。导入体检运行时不会启动Python／PDF子进程，也不会初始化Resend客户端；这些依赖只在相应体检任务执行时使用。

`node scripts/verify-legacy-node-compat.mjs` 已在Node.js 24.16.0／Windows x64通过：将实际摘要入口和依赖打包为独立ESM，唯一外部依赖为Node内置模块；可选canvas使用linkedom自带的无原生依赖回退。将产物复制到系统临时目录后，在与源码无关的工作目录运行，PATH为空，Python及GEO源码路径不存在，运行时不读取node_modules。Jina成功、Jina返回401后Readability读取HTML、恶意脚本不进入摘要和5种私网／非法协议输入均通过；真实网络请求、模型调用、邮件及子进程尝试均为0。证据为 `.state/legacy-node-proof/result.json`；其DNS与HTTP为内存fixture。

| 兼容回归 | 结果 |
| --- | --- |
| 官网摘要 | 9项测试通过，包含Reader成功、失败回退、授权头隔离及无Python依赖 |
| Node安全抓取 | 53项测试通过，包含DNS绑定、私网与跳转、超时和正文限制 |
| worker启动 | 6项测试通过，覆盖旧队列保留、新旧并存、体检专用模式及原功能开关 |
| 原品牌建档 | 12项既有测试通过 |
| 完整相关检查 | 共享库810项、网页554项测试通过；lib／web／worker类型检查、网页生产构建及仓库lint通过 |
| 已有数据库Compose | 使用Docker Compose5.5.1、合成连接地址完成默认及maintenance profile静态验证；五个新服务连接同一个共享库，均不依赖默认新PostgreSQL服务，该服务默认不启用 |
| 备份／恢复保护 | 两个脚本通过 `bash -n`；配置文件非空赋值、空赋值及外部环境变量三种情形共6项检查均在Docker及数据库操作前拒绝共享库模式 |

已有项目通过 `compose.existing-db.yaml` 接入原数据库，原、新服务的Google／Yelp与体检调用才会共用同一项目账本；需在迁移授权、备份及对账后同时启用各进程的共享预算开关。本轮仅用合成地址验证Compose，没有连接原数据库，也没有执行迁移。

此修复没有执行数据库迁移、真实模型调用或邮件发送。Linux容器构建和旧部署升级仍需Docker环境实际验收，不能用源码检查或Node回归测试代替。

## 测试基础设施及清理边界

测试新建了一个专用数据库角色、一个源测试库及一个恢复演练库。为Windows连接新增的`pg_hba.conf`规则仅允许该新数据库／新角色及当前Windows地址`/32`，使用SCRAM；既有规则不变。旧配置副本、确切名称及隐藏WSL保活PID保存在忽略的`.state/`。

清理时先检查`.state/database-name.txt`与`.state/wsl-keeper.pid`，只停止本轮保活进程；若移除测试HBA规则，逐字删除本轮精确规则后reload，不能覆盖整个配置或删除既有P1规则。数据库和角色没有自动删除，操作员确认不再需要这些测试证据后再按确切名称清理。
