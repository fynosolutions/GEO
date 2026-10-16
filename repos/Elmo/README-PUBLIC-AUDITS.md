# 餐厅免费品牌 AI 可见性体检 V1

面向美国一家具体餐厅门店的免费英文体检。每次冻结8道发现题、2道品牌核验题及两个模型，共20个回答槽位。在线报告、PDF和邮件读取同一个报告版本；官网技术分、提及、推荐、分店及引用统计分别展示。Google／Yelp授权不影响这条流程。

代码已具备集成入口；实际上线仍须取得真实采集、判定质量、发件域名、费用核对及服务器演练证据。合成演示、静态检查或PDF生成成功不能替代这些验收。

## 客户与管理员入口

| 入口 | 行为 |
| --- | --- |
| `/free-report` | 公开提交官网和邮箱 |
| `/audit/verify` | 先显示确认页，POST消费一次性令牌，随后清除URL中的令牌 |
| `/audit/:auditId` | 客户确认门店、查看进度及英文报告；会话仅授权这一份体检 |
| `/admin/audits` | 中文运营后台，要求现有内部账号的 **user.role = admin** |
| `/api/public-audits/availability` | 无客户信息的受理状态，可作存活检查；HTTP 200不代表已通过真实验收 |

邮箱验证仅验证邮箱，不证明客户拥有官网。连锁门店分别确认地址；官网提取标记为 `website_observed`，客户填写标记为 `requester_asserted`，不会写入P1管理员已确认事实。

客户默认领取会话7天、验证链接30分钟、报告访问期限30天。过期后服务端拒绝访问，体检worker执行内容清理；管理员也可显式删除。财务与必要操作记录遵循最少保留原则。

## 本机开发与无付费检查

按原仓库安装Node.js 24与pnpm，在Elmo根目录执行；不要使用npm／npx或修改供应链保护设置：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @workspace/lib check-types
pnpm --filter @workspace/worker check-types
pnpm --filter @workspace/lib exec vitest run src/audits src/providers/registry/openai-api.test.ts src/providers/registry/openrouter.test.ts src/website-excerpt.test.ts
pnpm --filter @workspace/web exec vitest run --project unit src/server/public-audit-http.test.ts src/server/public-audits.test.ts
$env:PYTHONPATH = (Resolve-Path ../geo-optimizer-skill/src).Path
python -m unittest discover -s integrations/geo -p 'test*.py' -v
pnpm lint
```

开发环境仍需原仓库要求的数据库、鉴权密钥与加密密钥；`SCRAPE_TARGETS=stub:stub`及`ONBOARDING_LLM_TARGET=stub:stub`仅阻止旧功能调用真实研究模型，并不会使新体检伪装成真实检测。新运行时不含自动合成回退；真实调用默认关闭。集成测试通过依赖注入执行合成回答，并要求独立测试数据库及显式测试模式。不得在公网设置 `NODE_ENV=test` 或 `AUDIT_TEST_MODE=1`。

网站采集通过 `integrations/geo/audit_website.py` 调用已有DNS绑定、私网校验、跳转重新校验及流式大小限制。最多读取5个同源HTML页面，另检查robots.txt和llms.txt。技术分采用明确命名的有界GEO Optimizer profile；CDN探针、插件及其他AI discovery端点不在该profile中。无地址或电话、多门店、正文抽取不完整不会阻止独立技术检查。Node摘要入口也使用这条安全抓取链路。

复现本轮合成集成验收时，使用已初始化的独立`auditv1test_<timestamp>`数据库及忽略的私密环境文件，确保`NODE_ENV=test`、`AUDIT_TEST_MODE=1`、`PUBLIC_AUDIT_LIVE_CALLS_ENABLED=0`，然后执行：

```bash
pnpm exec tsx --env-file=deploy/audits/.state/test.env scripts/public-audits-integration.mts
pnpm exec tsx --env-file=deploy/audits/.state/test.env scripts/public-audits-render-proof.mts
```

该文件只在本机保留，不随仓库分发；新机器需先准备全新的隔离库及测试加密密钥。不要将这些命令指向原P1数据库。质量样本的真实采集应在暂停体检worker的维护窗口单独运行，以免与报告检测争抢provider并发。

## Linux单机部署

使用 `deploy/audits/compose.yaml`，独立的新PostgreSQL 16数据库、web、仅体检worker及Caddy。公网只开放Caddy的80／443端口；数据库、web、原始证据及PDF卷没有直接公开端口。不要将此Compose直接指向原P1生产数据库。

部署目录结构必须保留：

```text
repos/
  Elmo/
    deploy/audits/
  geo-optimizer-skill/
    src/
```

Docker构建上下文是 `repos/`。优化器源码从本地相邻目录复制，不运行GitHub安装脚本。镜像使用Debian、Node.js 24、系统Python依赖、英文字体以及锁文件中的Playwright和对应Chromium。pnpm安装保持 `--frozen-lockfile` 和全部供应链保护。构建需要下载基础镜像、系统包、受策略允许的依赖及浏览器；不在本次静态配置检查中自动构建。

在Linux的Elmo根目录准备配置：

```bash
cp deploy/audits/.env.example deploy/audits/.env
chmod 600 deploy/audits/.env
mkdir -p deploy/audits/.state/quality
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32
```

将三次独立生成的值分别填入数据库密码、`BETTER_AUTH_SECRET`及`ELMO_ENCRYPTION_KEY`，其余域名、发件地址及模型密钥按实际配置。不要把密钥放入构建参数、源码、截图或日志。保留加密密钥的独立加密备份；数据库恢复缺少旧密钥时无法读取既有加密投递内容。

下文命令均在Elmo根目录执行：

```bash
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml config --quiet
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml build web
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml up -d postgres
```

迁移不由容器入口自动执行。先阅读 `AGENTS.md`、`DATABASE-CHANGE-REVIEW.md`及新增迁移，核对目标库、备份与隔离库验收；获得该目标数据库迁移的明确授权后才运行：

```bash
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml --profile maintenance run --rm migrate
```

首次部署在启动公网Caddy前完成管理员初始化。临时启动仅本机端口的web：

```bash
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml -f deploy/audits/compose.bootstrap.yaml up -d web
```

在操作员电脑建立 `ssh -L 3010:127.0.0.1:3010 operator@server`，通过 `http://localhost:3010/auth/register`完成唯一的初始内部账号注册。当前local注册只授予组织管理员，平台体检管理员另要求 `user.role='admin'`。在已授权的数据库会话核对账号ID及邮箱后，按 `deploy/audits/grant-admin.sql` 显式授予；不能通过客户入口自授角色。重新登录检查后台访问。

移除bootstrap override重新创建web，再启动worker与代理：

```bash
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml up -d --force-recreate web
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml up -d audit-worker proxy
```

Caddy覆盖来访请求的 `X-Real-IP`、`X-Forwarded-For`，服务端仅在 `AUDIT_TRUST_PROXY=1` 时使用该地址进行哈希限流。此配置假设Caddy直接接收互联网连接；若前置CDN，先针对可信代理配置独立评审，不能直接信任任意客户端传入的IP头。来源：[Caddy代理头文档](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers)。

## 真实启用与预算

默认同时关闭 `PUBLIC_AUDIT_ENABLED`、`PUBLIC_AUDIT_LIVE_CALLS_ENABLED`和`AUDIT_SHARED_BUDGET_ENABLED`，后台数据库的受理开关也须启用。费用核对完成后才设置`AUDIT_SHARED_BUDGET_ENABLED=1`，启用与Google／Yelp共用的项目账本；公开真实模式必须保留该设置。`GEO_PLATFORM_PRIOR_SPEND_USD`构成待核对历史费用下限，仅计入一次。20美元是硬编码累计测试上限，不能靠环境变量或后台扩大。

启用顺序：

1. 在后台核对项目历史支出、既有Google／Yelp预留及未核实调用；未核对不能将历史默认视为零。账本已核对后不能减少历史支出。
2. 核实OpenAI与OpenRouter账号、冻结模型ID、真实搜索、用量／引用返回能力及Resend发件域名。当前模型不可用必须停该目标，不能静默换模型。
3. 人工核实价格和费用上界，将 `AUDIT_PRICE_REVIEWED_AT`设为核实当天的ISO UTC时间；超过7天会阻止新付费派发。该时间仅是复核记录，不能代替实际核实。
4. 通过60条可追溯人工标注餐饮回答的真实判定质量门槛，用`createAuditQualityEvidence(config, rows)`产生绑定配置哈希、完整样本及真实计费记录的证据JSON；不能手写通过状态或用合成输出冒充。将文件以UID1000可读的权限存到服务器`deploy/audits/.state/quality/quality-evidence.json`，Compose以只读目录挂载到`/run/audit-quality/`，`AUDIT_QUALITY_EVIDENCE_FILE`指向该文件。缺失、版本不匹配或未达门槛均关闭公开受理。
5. 在公网代理停止的条件下，使用下述仅localhost的真实验收override，通过SSH隧道、已通过的质量证据和预算账本，在后台开启受理，再完成一家真实美国餐厅的20条回答、真实验证邮件、英文HTML、PDF及就绪邮件。此override显式打开真实调用且可能计费，只在用户恢复真实服务验收后执行。验收通过再将正式`.env`的两个启用变量设为1，以基础Compose重新创建web／worker并启动代理。

```bash
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml stop proxy
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml -f deploy/audits/compose.acceptance.yaml up -d --force-recreate web audit-worker
# Complete the real acceptance via ssh -L 3010:127.0.0.1:3010 operator@server.
# After acceptance, update the explicit flags in .env and remove the override:
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml up -d --force-recreate web audit-worker
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml up -d proxy
```

质量证据中的人工标签来源与供应商计费记录需要操作员核实。文件哈希和配置绑定可检测意外变更，不能独立证明标签作者身份或真实账单；不得将该文件描述成第三方认证。

判定评估采用项目实际判定器及记录回放。promptfoo作为可选的隔离开发工具，未加入生产依赖；可通过`AUDIT_PROMPTFOO_MODULE`指定单独审核安装的模块路径。`pnpm --filter @workspace/lib audit:judge-replay --adapter-smoke`仅检查两个合成案例的适配器连接，不生成可用于公开上线的通过证据。

每次外部调用先持久预留最坏费用，成功结果立即保存。不确定是否计费的调用保留预留且不自动重发。判定无实际用量时保留保守费用，不能将其记为零。预算耗尽、价格复核过期或密钥缺失时暂停受理／派发。

### 收集判定质量证据

当前真实服务验收仍暂停。恢复后，由操作员先用`audit:judge-fixtures <私有文件路径>`导出64条待审核案例，逐条确认标签并填写`humanReview.reviewer`、`reviewedAt`、`status=reviewed`，将文件及每条案例的`annotationsPending`设为false。保留合成案例标记；合成输入经人工复核后可用于测试判定器，不能描述为真实客户回答。

收集器要求`AUDIT_EVALUATION_LIVE_ENABLED=1`、`PUBLIC_AUDIT_LIVE_CALLS_ENABLED=1`、`AUDIT_SHARED_BUDGET_ENABLED=1`，有效价格复核、OpenAI凭据及已对账数据库；公开受理可继续关闭。先在操作员进程加载相关环境配置，再执行：

```bash
pnpm --filter @workspace/lib audit:judge-collect --run-id quality-20261016 --actor internal-operator --fixtures /private/reviewed-fixtures.json --output-dir /private/quality-20261016 --config /private/current-audit-config.json
```

`--config`可省略并使用默认配置；上线证据必须与当前发布配置一致。每例先写入共享费用预留，再调用实际判定器，并立即保存原始判定及账本关联。用相同run ID、参数和目录恢复时复用已完成结果；不确定结果、缺失费用回执或配置变化会停止执行，不自动重发。完整执行后，即使质量不合格也生成`quality-evidence.json`并返回失败退出码；审核通过后才将`AUDIT_QUALITY_EVIDENCE_FILE`指向该文件。费用保留最坏上限，不宣称是已核实实际账单。

## 管理员操作手册

所有后台写操作填写具体原因，保存操作者、时间及前后值。组织管理员权限或客户邮箱会话不能替代平台管理员权限。

| 操作 | 用法与边界 |
| --- | --- |
| 查询任务 | 以邮箱、门店或状态筛选；分别查看检测、PDF、邮件状态及失败／unknown |
| 查看证据 | 阅读保存的原始回答与引用、官网来源及哈希；不得将私有卷映射成静态网站 |
| 复核判定 | 选择样本，填写结构化提及／推荐／分店结论；正面结论及竞品仍需真实连续原文摘录 |
| 发布修订 | 先保存复核，再发布新报告版本；旧报告和冻结计划保留 |
| 修改建议 | 每条建议关联证据，不把技术缺失写成“导致未被推荐”的因果事实 |
| PDF／邮件重试 | 独立执行投递任务，不重新询问模型；邮件幂等键防止普通重试重复发送 |
| 付费失败处理 | 仅对明确返回401／403／429的拒绝请求显式补测；新attempt使用新调用键与费用预留，并发布新报告版本。已发但未持久化的uncertain需人工核对和新的完整复测，不自动补发 |
| 整店复测 | 创建关联原体检的新audit，重新预检预算；不覆盖旧回答或更改原门店身份 |
| 修改题库与模型 | 编辑配置后校验并发布版本，仅影响之后的新体检；仍需8发现／2核验及两个已审查模型 |
| 预算及受理 | 核对历史费用、查看预留／余量、暂停受理；不能突破累计20美元 |
| 恢复访问 | 客户使用领取页请求新的邮件链接；管理员可重发新的报告／恢复链接，保留操作记录。旧过期验证令牌不重复使用 |
| 撤销／删除 | 撤销访问会阻止新任务和领取；删除前等待在途任务结束，清理报告／证据及客户资料，保留最少财务与操作记录 |

发布修订不会重跑模型。需要变更门店或问题／模型条件时新建体检；不能通过改报告标题改变检测对象。

## 故障与恢复

- **模型认证失败：**停止该目标，保留另一个目标的结果；核对凭据后新建明确的复测，不扩大预算。
- **超时／worker中断：**数据库租约到期后恢复未派发工作；已发的模型／判定任务为uncertain。保留成功的前6条，不因第7条中断重跑前6条。
- **15分钟派发窗口结束：**停止派发新AI调用；保存已完成结果并交付标明缺口的报告。
- **PDF失败：**在线报告仍可读；后台单独重试PDF。
- **邮件失败：**检测结果不变；核实发件域名后重试投递或由客户恢复入口重新领取。
- **预算耗尽：**暂停受理，核对账本与供应商记录；不清空账本、不将uncertain改为零。
- **紧急暂停：**先在后台暂停受理；设置 `PUBLIC_AUDIT_LIVE_CALLS_ENABLED=0`并重建worker可阻止后续付费派发。正在发送的请求可能仍计费，保留其预留。

```bash
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml logs --tail 100 audit-worker
docker compose --env-file deploy/audits/.env -f deploy/audits/compose.yaml restart audit-worker
```

不要在日志中输出访问令牌、加密投递正文、API密钥或报告全文。pg-boss只作调度；任务持久状态、唯一键、租约和预算账本决定是否执行。`PUBLIC_AUDIT_WORKER_ONLY=1`确保此部署不启动旧周期付费队列。

## 备份、恢复演练与回退

`backup.sh`短暂停止当前正在运行的web和worker，使数据库与私有文件保持一致；生成custom格式数据库备份、私有文件归档及SHA-256清单，然后恢复原先运行的服务。脚本不备份明文密钥，应另存加密密钥的受控加密副本。

```bash
bash deploy/audits/backup.sh
bash deploy/audits/restore-drill.sh /absolute/path/to/Elmo/deploy/audits/backups/UTC_DIRECTORY
```

恢复脚本只创建新的`*_audit_restore_drill`数据库并写入独立`audit-drill`卷，不清理、不覆盖在线数据库。重复演练需新Compose项目或人工确认后的独立演练卷；`--keep-old-files`会拒绝覆盖上次文件。演练库不启动worker，避免意外重发或收费。

演练记录应包含：清单校验、`pg_restore`通过、恢复前后audit／报告／费用记录数、选定报告JSON哈希及PDF文件头、原加密密钥能读取投递数据，以及中断恢复时模型调用次数。仅列出备份文件不能算恢复验收。

升级前完成相同备份及隔离迁移检查。回退先暂停受理／付费派发，恢复旧镜像；新迁移尽量保持向后兼容。若需要数据库还原，先验证目标库及卷、单独确认停机窗口并使用已演练备份；不自动执行删表或清空卷。

当前交付包含Compose静态验证、隔离WSL PostgreSQL数据库的恢复演练以及真实Playwright PDF渲染检查；没有构建或部署Linux容器。完整真实模型／邮件验收按用户要求暂停，不能将合成检查标为生产验收。详见`deploy/audits/ACCEPTANCE.md`。

部署依据：[Docker构建上下文与忽略规则](https://docs.docker.com/build/concepts/context/)、[Playwright浏览器安装](https://playwright.dev/docs/browsers)、[Playwright容器要求](https://playwright.dev/docs/docker)。
