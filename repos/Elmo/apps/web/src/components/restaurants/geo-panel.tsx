import { useQuery, useQueryClient } from "@tanstack/react-query";
import { snapshotSchema } from "@workspace/lib/restaurants/geo/contracts";
import type { Judgment } from "@workspace/lib/restaurants/geo/judgment";
import { isPlatformChannel } from "@workspace/lib/restaurants/geo/platform-contracts";
import type { pilotReport } from "@workspace/lib/restaurants/geo/service";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { useId, useState } from "react";
import {
	auditGeoFn,
	collectGeoFn,
	draftCorrectionFn,
	getGeoFn,
	importPilotFn,
	importSnapshotFn,
	installBankFn,
	listGeoFn,
	pilotExportFn,
	pilotReportFn,
	publicationFn,
	reviewPilotFn,
	scheduleGeoFn,
	verifyGeoFn,
} from "@/server/restaurant-geo";
import { Choice, TextField } from "./fact-editor";
import { PlatformPanel } from "./platform-panel";

type Scope = { organizationId: string; storeId: string };
type RecordData = Omit<Awaited<ReturnType<typeof getGeoFn>>, "payloadJson"> & { payload: Record<string, unknown> };
type PilotReport = Awaited<ReturnType<typeof pilotReport>>;
const kinds: Record<string, string> = {
	question_bank: "问题库",
	snapshot: "渠道快照",
	audit: "事实差异",
	website_audit: "官网检查",
	batch_plan: "查询计划",
	batch_result: "查询批次",
	judgment: "回答复核",
	correction: "修改稿",
	publication: "人工发布记录",
	verification: "重采验证",
	schedule: "周检测设置",
	job_request: "采集任务",
	job_result: "任务结果",
	platform_binding: "平台门店绑定",
	platform_budget: "平台费用预留",
	platform_query: "平台查询状态",
};
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
function download(name: string, value: unknown) {
	const url = URL.createObjectURL(new Blob([pretty(value)], { type: "application/json" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type RunAction = (action: () => Promise<unknown>, message: string) => Promise<void>;

export function GeoPanel({
	scope,
	factVersion,
	canConfirm,
}: {
	scope: Scope;
	factVersion: number;
	canConfirm: boolean;
}) {
	const client = useQueryClient();
	const [selected, setSelected] = useState("");
	const [busy, setBusy] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [url, setUrl] = useState("");
	const [channel, setChannel] = useState<"official" | "google_maps" | "yelp" | "other">("official");
	const [listingId, setListingId] = useState("");
	const [batchId, setBatchId] = useState("easyjoy-pilot-001");
	const [manual, setManual] = useState("");
	const manualId = useId();
	const key = ["restaurant-geo", scope.organizationId, scope.storeId];
	const query = useQuery({ queryKey: key, queryFn: () => listGeoFn({ data: scope }), refetchInterval: 15000 });
	const detail = useQuery({
		queryKey: [...key, selected],
		queryFn: async (): Promise<RecordData> => {
			const row = await getGeoFn({ data: { ...scope, recordId: selected } });
			return { ...row, payload: JSON.parse(row.payloadJson) };
		},
		enabled: !!selected,
	});
	const run: RunAction = async (action, message) => {
		setBusy(true);
		setFeedback("");
		try {
			await action();
			await client.invalidateQueries({ queryKey: key });
			setFeedback(message);
		} catch (error) {
			setFeedback(error instanceof Error ? error.message : "操作失败");
		} finally {
			setBusy(false);
		}
	};
	return (
		<section className="space-y-5">
			<div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
				<h2 className="font-semibold text-lg">GEO 试点流程</h2>
				<p>问题库 → 渠道采集 → 对照已确认事实 → 回答复核 → 修改发布 → 重采与复测</p>
				<p>试点计划为 160 条发现样本与 6 条事实核验。历史观察、未完成和未知分别保留。</p>
				<p>自动采集需后台检查任务运行；ChatGPT / Gemini 查询需本机免费账号与真实探针就绪。</p>
			</div>
			{query.error && (
				<p role="alert" className="text-red-700">
					GEO 扩展数据暂不可用，请检查扩展表安装和数据库连接。P1 门店资料仍可使用。
				</p>
			)}
			{!canConfirm && <p>当前账号可查看记录；配置、导入、复核和发布登记由组织管理员操作。</p>}
			<div className="rounded-lg border p-4 space-y-3">
				<Choice
					label="来源"
					value={channel}
					onChange={(value) => setChannel(value as typeof channel)}
					options={[
						{ value: "official", label: "官网" },
						{ value: "google_maps", label: "Google Maps（实时查询）" },
						{ value: "yelp", label: "Yelp（实时查询）" },
						{ value: "other", label: "其他公开页面" },
					]}
				/>
				{isPlatformChannel(channel) && (
					<PlatformPanel
						key={`${scope.organizationId}:${scope.storeId}:${channel}`}
						scope={scope}
						provider={channel}
						canConfirm={canConfirm}
					/>
				)}
			</div>
			<fieldset disabled={busy || !canConfirm || !!query.error} className="grid gap-5 lg:grid-cols-2 print:hidden">
				<div className="rounded-lg border p-4 space-y-3">
					<h3 className="font-semibold">问题库与回答</h3>
					<Button
						variant="outline"
						onClick={() =>
							void run(() => installBankFn({ data: scope }), "Easy Joy 题库已接入，原文与历史来源均已保留")
						}
					>
						接入 Easy Joy 最终版题库
					</Button>
					<TextField label="本机浏览器批次标识" value={batchId} onChange={setBatchId} />
					<Button
						onClick={() =>
							void run(() => importPilotFn({ data: { ...scope, batchId } }), "批次已校验并导入；成功采集的回答等待复核")
						}
					>
						校验并导入浏览器批次
					</Button>
					<p className="text-xs text-muted-foreground">
						导入会检查冻结计划和原始证据指纹。不会自动提交 AI 查询或覆盖已有结果。
					</p>
				</div>
				{!isPlatformChannel(channel) && (
					<div className="rounded-lg border p-4 space-y-3">
						<h3 className="font-semibold">官网与渠道</h3>
						<TextField label="门店页面链接" value={url} onChange={setUrl} />
						<TextField
							label="此渠道的门店标识（同一条记录持续复用）"
							value={listingId}
							onChange={setListingId}
							placeholder="例如 easyjoy-mulberry-official"
						/>
						<div className="flex flex-wrap gap-2">
							<Button
								onClick={() =>
									void run(
										() => collectGeoFn({ data: { ...scope, url, channel, listingId } }),
										"采集任务已排队；结果将自动出现",
									)
								}
							>
								发起采集
							</Button>
							<Button
								variant="outline"
								onClick={() =>
									void run(
										() => scheduleGeoFn({ data: { ...scope, url, channel, listingId, enabled: true } }),
										"已启用每七天的官网/渠道检查",
									)
								}
							>
								启用周检测
							</Button>
							<Button
								variant="outline"
								onClick={() =>
									void run(
										() => scheduleGeoFn({ data: { ...scope, url, channel, listingId, enabled: false } }),
										"此渠道记录的周检测已关闭",
									)
								}
							>
								关闭周检测
							</Button>
						</div>
					</div>
				)}
				<details className="lg:col-span-2 rounded-lg border p-4">
					<summary>人工渠道快照导入</summary>
					<label htmlFor={manualId} className="block my-2 text-sm">
						粘贴 geo.snapshot.v1 JSON；method 必须为 manual，并附原文与 SHA-256。人工导入不计自动采集验收。
					</label>
					<Textarea id={manualId} value={manual} onChange={(e) => setManual(e.target.value)} rows={5} />
					<Button
						className="mt-2"
						onClick={() =>
							void run(
								() => importSnapshotFn({ data: { ...scope, snapshot: snapshotSchema.parse(JSON.parse(manual)) } }),
								"人工观察已保存",
							)
						}
					>
						校验并保存人工快照
					</Button>
				</details>
			</fieldset>
			<p aria-live="polite" className="whitespace-pre-wrap text-sm">
				{feedback}
			</p>
			<div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
				<nav aria-label="GEO 流程记录" className="space-y-2 max-h-[640px] overflow-auto print:hidden">
					{query.data?.records.length === 0 && (
						<p className="text-sm text-muted-foreground">暂无记录。从接入问题库和采集官网开始。</p>
					)}
					{query.data?.records.map((row) => (
						<button
							type="button"
							key={row.id}
							onClick={() => setSelected(row.id)}
							className={`w-full text-left border rounded-lg p-3 text-sm ${selected === row.id ? "bg-muted" : ""}`}
						>
							<strong>{kinds[row.kind] ?? row.kind}</strong>
							<span className="block text-xs text-muted-foreground">
								{new Date(row.createdAt).toLocaleString("zh-CN")}
							</span>
						</button>
					))}
					{query.data?.truncated && <p>当前显示最近 500 条；更早记录仍保存在数据库。</p>}
				</nav>
				<div className="min-w-0">
					{detail.error && <p role="alert">无法读取记录</p>}
					{detail.data && (
						<RecordView
							key={detail.data.id}
							row={detail.data}
							scope={scope}
							factVersion={factVersion}
							disabled={busy || !canConfirm}
							run={run}
						/>
					)}
				</div>
			</div>
		</section>
	);
}

function RecordView({
	row,
	scope,
	factVersion,
	disabled,
	run,
}: {
	row: RecordData;
	scope: Scope;
	factVersion: number;
	disabled: boolean;
	run: RunAction;
}) {
	const [publishedUrl, setPublishedUrl] = useState("");
	const [note, setNote] = useState("");
	const [snapshotId, setSnapshotId] = useState("");
	const input = { ...scope, recordId: row.id };
	const payload = row.payload;
	const findings = Array.isArray(payload.findings)
		? (payload.findings as {
				id: string;
				field: string;
				status: string;
				expected: unknown;
				observed: unknown;
				reason: string;
			}[])
		: [];
	const questions = Array.isArray(payload.questions)
		? (payload.questions as { id: string; text: string; type: string; language: string }[])
		: [];
	return (
		<article className="rounded-lg border p-4 space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="font-semibold text-lg">{kinds[row.kind] ?? row.kind}</h3>
				<Button variant="outline" onClick={() => download(`${row.kind}-${row.id}.json`, row)} className="print:hidden">
					下载记录
				</Button>
			</div>
			{row.kind === "question_bank" && (
				<>
					<p>8 道原题 + 3 道补充核验；32 条历史观察不进入新基线。</p>
					<ol className="space-y-3">
						{questions.map((q) => (
							<li key={q.id}>
								<span className="text-xs text-muted-foreground">
									{q.type === "discovery" ? "发现" : "事实核验"} · {q.language}
								</span>
								<p>{q.text}</p>
							</li>
						))}
					</ol>
				</>
			)}
			{row.kind === "snapshot" && (
				<>
					<p>
						采集状态：{String(payload.status)} · {payload.method === "automatic" ? "自动采集" : "人工观察"}
					</p>
					{payload.error ? <p className="text-red-700">{String(payload.error)}</p> : null}
					<Button
						disabled={disabled || !factVersion}
						onClick={() => void run(() => auditGeoFn({ data: { ...input, factVersion } }), "已生成带证据的差异记录")}
					>
						对照当前事实版本 V{factVersion || "待确认"}
					</Button>
				</>
			)}
			{row.kind === "audit" && (
				<>
					<p>
						分店匹配：{String(payload.identityStatus)} · 结论：{String(payload.overallStatus)}
					</p>
					<div className="space-y-3">
						{findings.map((f) => (
							<div key={f.id} className="rounded border p-3 text-sm space-y-1">
								<strong>
									{f.field} · {f.status}
								</strong>
								<p>{f.reason}</p>
								<p className="break-all">
									标准：{pretty(f.expected)}
									<br />
									观察：{pretty(f.observed)}
								</p>
								{["mismatch", "missing"].includes(f.status) && (
									<Button
										size="sm"
										disabled={disabled || payload.identityStatus !== "matched"}
										onClick={() =>
											void run(
												() => draftCorrectionFn({ data: { ...input, findingId: f.id } }),
												"修改稿已生成，请人工核实并在渠道发布",
											)
										}
									>
										生成修改稿
									</Button>
								)}
							</div>
						))}
					</div>
				</>
			)}
			{row.kind === "correction" && (
				<fieldset disabled={disabled} className="space-y-3">
					<p className="whitespace-pre-wrap">{String(payload.text)}</p>
					<p className="text-sm">完成渠道上的人工确认与实际发布后，在此登记；登记本身不代表系统验证成功。</p>
					<TextField label="已修改的公开页面" value={publishedUrl} onChange={setPublishedUrl} />
					<TextField label="发布说明" value={note} onChange={setNote} />
					<Button
						onClick={() =>
							void run(
								() => publicationFn({ data: { ...input, publishedUrl, publishedAt: new Date().toISOString(), note } }),
								"已登记人工发布，等待重新采集验证",
							)
						}
					>
						确认已人工发布
					</Button>
				</fieldset>
			)}
			{row.kind === "publication" && (
				<fieldset disabled={disabled} className="space-y-3">
					<p>请先重采同一门店渠道，再选择发布之后的快照。</p>
					<TextField label="新快照记录 ID（可在下载记录中查看）" value={snapshotId} onChange={setSnapshotId} />
					<Button
						onClick={() =>
							void run(() => verifyGeoFn({ data: { ...input, snapshotId } }), "验证结果已保存；AI 复测另建批次")
						}
					>
						验证修正
					</Button>
				</fieldset>
			)}
			{row.kind === "batch_result" && <BatchReview input={input} disabled={disabled} run={run} />}
			<details>
				<summary className="text-sm cursor-pointer">来源、指纹与完整记录</summary>
				<pre className="mt-3 text-xs whitespace-pre-wrap break-all max-h-[600px] overflow-auto">{pretty(row)}</pre>
			</details>
		</article>
	);
}

function BatchReview({
	input,
	disabled,
	run,
}: {
	input: Scope & { recordId: string };
	disabled: boolean;
	run: RunAction;
}) {
	const client = useQueryClient();
	const key = ["geo-pilot-report", input.organizationId, input.storeId, input.recordId];
	const query = useQuery({
		queryKey: key,
		queryFn: async (): Promise<PilotReport> => JSON.parse(await pilotReportFn({ data: input })),
	});
	const [sampleId, setSampleId] = useState("");
	const [mention, setMention] = useState<Judgment["mention"]>("unknown");
	const [recommendation, setRecommendation] = useState<Judgment["recommendation"]>("unknown");
	const [branch, setBranch] = useState<Judgment["branch"]>("unknown");
	const [quote, setQuote] = useState("");
	const [note, setNote] = useState("");
	const [rank, setRank] = useState("");
	const quoteId = useId();
	const sample = query.data?.batch.samples.find((s) => s.id === sampleId);
	const choices = [
		{ value: "unknown", label: "未知／无法判断" },
		{ value: "yes", label: "是" },
		{ value: "no", label: "否" },
	];
	return (
		<div className="space-y-4">
			{query.error && <p role="alert">报告读取失败</p>}
			{query.data?.groups.map((group) => (
				<div key={`${group.platform}-${group.type}-${group.language}`} className="rounded border p-3 text-sm">
					<strong>
						{group.platform} · {group.type === "discovery" ? "发现" : "事实核验"} · {group.language}
					</strong>
					<p>
						计划 {group.planned} / 已采集 {group.collected} / 已复核 {group.reviewed}
					</p>
					<p>
						明确推荐 {group.recommended} / 明确判断 {group.judgedRecommendation}；其中正确分店推荐{" "}
						{group.correctBranchRecommended}
					</p>
					<p>{group.limitation}</p>
				</div>
			))}
			{query.data && (
				<Button variant="outline" onClick={() => download(`${query.data.batch.batchId}-report.json`, query.data)}>
					下载报告数据
				</Button>
			)}
			{query.data && (
				<Button
					disabled={disabled}
					variant="outline"
					className="ml-2"
					onClick={() =>
						void run(async () => {
							const result = await pilotExportFn({ data: input });
							const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
							const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
							const link = document.createElement("a");
							link.href = url;
							link.download = result.filename;
							link.click();
							setTimeout(() => URL.revokeObjectURL(url), 1000);
						}, "PDF 已生成")
					}
				>
					导出 PDF
				</Button>
			)}
			<fieldset disabled={disabled} className="space-y-3 print:hidden">
				<Choice
					label="选择成功回答进行复核"
					value={sampleId}
					onChange={(value) => {
						setSampleId(value);
						setMention("unknown");
						setRecommendation("unknown");
						setBranch("unknown");
						setQuote("");
						setNote("");
						setRank("");
					}}
					options={[
						{ value: "", label: "请选择" },
						...(query.data?.batch.samples
							.filter((s) => s.status === "succeeded")
							.map((s) => ({ value: s.id, label: `${s.platform} · ${s.id}` })) ?? []),
					]}
				/>
				{sample?.response && (
					<>
						<p>{sample.question.text}</p>
						<pre className="text-sm whitespace-pre-wrap max-h-80 overflow-auto">{sample.response.text}</pre>
						<p className="text-xs">可见引用：{sample.response.citations.length} 条；详见完整记录。</p>
						<div className="grid gap-3 sm:grid-cols-3">
							<Choice
								label="是否提及"
								value={mention}
								onChange={(v) => setMention(v as typeof mention)}
								options={choices}
							/>
							<Choice
								label="是否明确推荐"
								value={recommendation}
								onChange={(v) => setRecommendation(v as typeof recommendation)}
								options={choices}
							/>
							<Choice
								label="分店"
								value={branch}
								onChange={(v) => setBranch(v as typeof branch)}
								options={[
									{ value: "unknown", label: "未知" },
									{ value: "matched", label: "正确分店" },
									{ value: "wrong_branch", label: "其他分店／串店" },
								]}
							/>
						</div>
						<TextField label="明确推荐顺序（未知留空）" value={rank} onChange={setRank} type="number" />
						<label htmlFor={quoteId}>回答原文摘录</label>
						<Textarea id={quoteId} value={quote} onChange={(e) => setQuote(e.target.value)} />
						<TextField label="判断依据" value={note} onChange={setNote} />
						<Button
							onClick={() =>
								void run(async () => {
									await reviewPilotFn({
										data: {
											...input,
											judgment: {
												sampleId,
												mention,
												recommendation,
												branch,
												quote,
												note,
												rank: rank ? Number(rank) : null,
											},
										},
									});
									await client.invalidateQueries({ queryKey: key });
								}, "复核记录已追加，报告已更新")
							}
						>
							保存复核
						</Button>
					</>
				)}
			</fieldset>
		</div>
	);
}
