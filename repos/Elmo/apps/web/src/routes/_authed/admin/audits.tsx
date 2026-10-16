import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { auditRequest } from "@/components/audits/audit-client";
import { AuditError, auditButtonClass, auditInputClass } from "@/components/audits/audit-layout";

export const Route = createFileRoute("/_authed/admin/audits")({
	staticData: { crumb: "餐厅免费体检" },
	component: AuditAdmin,
});

type Row = Record<string, unknown>;
function record(value: unknown): Row {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}
function rows(value: unknown): Row[] {
	return Array.isArray(value) ? value.map(record) : [];
}
function pretty(value: unknown): string {
	return JSON.stringify(value ?? null, null, 2);
}
function title(audit: Row): string {
	const subject = record(audit.subject);
	return String(subject.name ?? audit.website ?? audit.id ?? "未知门店");
}

function taskKey(task: Row): string {
	return String(task.task_key ?? task.taskKey ?? task.id);
}
function reviewId(task: Row): string {
	return taskKey(task).replace(/^(sample|judgment):/, "");
}

function AuditAdmin() {
	const [list, setList] = useState<Row>({});
	const [detail, setDetail] = useState<Row | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const [configText, setConfigText] = useState("");
	const [reviewTask, setReviewTask] = useState("");
	const [reviewText, setReviewText] = useState("");
	const [suggestionsText, setSuggestionsText] = useState("[]");
	const loadList = useCallback(async () => {
		const result = await auditRequest<Row>(
			`/api/admin/audits?search=${encodeURIComponent(search)}&status=${encodeURIComponent(filter)}`,
		);
		setList(Array.isArray(result) ? { audits: result } : result);
	}, [search, filter]);
	const loadDetail = useCallback(async (id: string) => {
		const result = await auditRequest<Row>(`/api/admin/audits/${id}`);
		setDetail(result);
		setSelectedId(id);
		const config = result.config;
		if (config) setConfigText(pretty(config));
	}, []);
	useEffect(() => {
		void loadList().catch((cause) => setError(cause instanceof Error ? cause.message : "无法加载任务。"));
	}, [loadList]);
	async function action(name: string, payload: Row = {}, id = selectedId) {
		if (!reason.trim()) {
			setError("请先填写操作原因，所有修改都将记录到操作日志。");
			return;
		}
		setBusy(true);
		setError(null);
		setMessage(null);
		try {
			const result = await auditRequest<unknown>("/api/admin/audits/actions", {
				auditId: id ?? undefined,
				action: name,
				payload,
				reason,
			});
			setMessage(`操作已完成：${name} · ${pretty(result)}`);
			await loadList();
			if (id && !["delete", "revoke"].includes(name)) await loadDetail(id);
			if (name === "delete") {
				setDetail(null);
				setSelectedId(null);
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "操作失败。");
		} finally {
			setBusy(false);
		}
	}
	async function submitReview(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		try {
			const judgment: unknown = JSON.parse(reviewText);
			await action("review", { sampleId: reviewTask, taskId: reviewTask, judgment });
		} catch {
			setError("判定必须是有效 JSON。");
		}
	}
	async function publishConfig() {
		try {
			await action("publish-config", { config: JSON.parse(configText) }, null);
		} catch {
			setError("配置必须是有效 JSON。");
		}
	}
	async function previewConfig() {
		const subject = record(record(detail?.audit).subject);
		if (!subject.name) {
			setError("请先选择已确认门店的任务，使用该门店资料预览题目。");
			return;
		}
		try {
			await action("preview-config", { config: JSON.parse(configText), subject }, null);
		} catch {
			setError("配置必须是有效 JSON。");
		}
	}
	async function publishRevision() {
		try {
			const suggestions: unknown = JSON.parse(suggestionsText);
			if (!Array.isArray(suggestions)) {
				setError("建议必须是有效 JSON 数组。");
				return;
			}
			await action("publish", suggestions.length ? { suggestions } : {});
		} catch {
			setError("建议必须是有效 JSON 数组。");
		}
	}
	const audits = rows(list.audits);
	const tasks = rows(detail?.tasks);
	const audit = record(detail?.audit);
	return (
		<main className="mx-auto w-full max-w-7xl space-y-6 p-6">
			<header>
				<h1 className="text-2xl font-bold">餐厅品牌 AI 可见性体检管理</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					仅限平台内部管理员。客户邮箱验证不能授予后台权限。原始证据、付费补测、版本发布与删除均受服务端限制。
				</p>
			</header>
			<AuditError message={error} />
			{message && (
				<p role="status" className="whitespace-pre-wrap rounded border bg-muted p-3 text-sm">
					{message}
				</p>
			)}
			<label className="block text-sm font-medium">
				操作原因（所有写操作必填）
				<input
					className={`${auditInputClass} mt-2`}
					value={reason}
					onChange={(event) => setReason(event.target.value)}
					maxLength={2000}
					placeholder="例如：核对原文后修正推荐判断"
				/>
			</label>
			<section className="rounded-lg border p-5">
				<h2 className="font-semibold">预算与受理控制</h2>
				<p className="my-2 text-sm">
					全项目真实测试累计上限为 US$20，后台不能提高此上限。历史支出未核对时禁止真实调用。
				</p>
				<pre className="my-3 max-h-60 overflow-auto rounded bg-muted p-3 text-xs">{pretty(list.budget)}</pre>
				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						className={auditButtonClass}
						disabled={busy}
						onClick={() => void action("set-enabled", { enabled: false }, null)}
					>
						暂停公开受理
					</button>
					<button
						type="button"
						className={auditButtonClass}
						disabled={busy}
						onClick={() => void action("set-enabled", { enabled: true }, null)}
					>
						启用公开受理
					</button>
				</div>
				<form
					key={pretty(list.limits)}
					className="mt-5 flex flex-wrap items-end gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						const data = new FormData(event.currentTarget);
						void action(
							"set-limits",
							{ perIpDaily: Number(data.get("perIpDaily")), totalDaily: Number(data.get("totalDaily")) },
							null,
						);
					}}
				>
					<label className="text-sm">
						每 IP 每日上限（1–3）
						<input
							name="perIpDaily"
							type="number"
							min="1"
							max="3"
							required
							defaultValue={Number(record(list.limits).perIpDaily ?? 3)}
							className={`${auditInputClass} mt-1`}
						/>
					</label>
					<label className="text-sm">
						全站每日受理上限（1–100）
						<input
							name="totalDaily"
							type="number"
							min="1"
							max="100"
							required
							defaultValue={Number(record(list.limits).totalDaily ?? 25)}
							className={`${auditInputClass} mt-1`}
						/>
					</label>
					<button type="submit" className={auditButtonClass} disabled={busy}>
						保存受理额度
					</button>
				</form>
				<form
					className="mt-5 flex flex-wrap items-end gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						const data = new FormData(event.currentTarget);
						void action("reconcile-budget", { historicalUsd: Number(data.get("historicalUsd")), notes: reason }, null);
					}}
				>
					<label className="text-sm">
						已核实历史支出（美元）
						<input
							name="historicalUsd"
							type="number"
							min="0"
							max="20"
							step="0.000001"
							required
							className={`${auditInputClass} mt-1`}
						/>
					</label>
					<button type="submit" disabled={busy} className={auditButtonClass}>
						核对项目账本
					</button>
				</form>
			</section>
			<section className="rounded-lg border p-5">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<h2 className="font-semibold">检测任务</h2>
					<div className="flex flex-wrap gap-3">
						<input
							className={auditInputClass}
							style={{ width: "15rem" }}
							placeholder="搜索餐厅或邮箱"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
						<select
							className={auditInputClass}
							style={{ width: "12rem" }}
							value={filter}
							onChange={(event) => setFilter(event.target.value)}
						>
							<option value="">全部状态</option>
							{[
								"awaiting_verification",
								"preparing_subject",
								"awaiting_confirmation",
								"queued",
								"running",
								"completed",
								"partial",
								"failed",
							].map((status) => (
								<option key={status}>{status}</option>
							))}
						</select>
					</div>
				</div>
				<div className="mt-4 overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b">
								<th className="p-2">门店／官网</th>
								<th className="p-2">邮箱</th>
								<th className="p-2">检测状态</th>
								<th className="p-2">报告版本</th>
								<th className="p-2">操作</th>
							</tr>
						</thead>
						<tbody>
							{audits.map((item) => (
								<tr key={String(item.id)} className="border-b">
									<td className="p-2">{title(item)}</td>
									<td className="p-2">{String(item.email ?? "—")}</td>
									<td className="p-2">{String(item.status ?? "—")}</td>
									<td className="p-2">{String(item.reportVersion ?? item.currentReportVersion ?? "—")}</td>
									<td className="p-2">
										<button
											type="button"
											className="underline"
											onClick={() => void loadDetail(String(item.id)).catch((cause) => setError(String(cause)))}
										>
											查看详情
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!audits.length && <p className="py-6 text-sm text-muted-foreground">暂无匹配任务。</p>}
				</div>
			</section>
			{detail && (
				<section className="space-y-5 rounded-lg border p-5">
					<header className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 className="text-xl font-semibold">{title(audit)}</h2>
							<p className="text-xs text-muted-foreground">{selectedId}</p>
						</div>
						<button type="button" className="underline" onClick={() => setDetail(null)}>
							关闭详情
						</button>
					</header>
					<div className="grid gap-4 md:grid-cols-3">
						{[
							["体检与报告状态", audit],
							["通知与邮件", detail.notifications],
							["报告版本", detail.reports],
						].map(([label, value]) => (
							<details key={String(label)} open className="rounded border p-3">
								<summary className="cursor-pointer text-sm font-medium">{String(label)}</summary>
								<pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{pretty(value)}</pre>
							</details>
						))}
					</div>
					<h3 className="font-semibold">样本、官网及原始证据</h3>
					<p className="text-sm text-muted-foreground">
						uncertain 表示付费调用结果无法核实，禁止自动补发。明确失败的样本补测会再次预留费用。
					</p>
					<div className="space-y-3">
						{tasks.map((task) => (
							<details key={String(task.id ?? taskKey(task))} className="rounded border p-3">
								<summary className="cursor-pointer text-sm">
									{taskKey(task)} · {String(task.status)} · {String(task.kind ?? task.type ?? "")}
								</summary>
								<pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{pretty(task)}</pre>
								<div className="mt-3 flex flex-wrap gap-3">
									{task.kind === "sample" && task.status === "succeeded" && (
										<button
											type="button"
											className="text-sm underline"
											onClick={() => {
												setReviewTask(reviewId(task));
												setReviewText(
													pretty(
														record(tasks.find((item) => taskKey(item) === `judgment:${reviewId(task)}`)?.result)
															.judgment ?? {
															mention: "unknown",
															recommendation: "unknown",
															branch: "unknown",
															rank: null,
															quote: "",
															note: "",
															competitors: [],
														},
													),
												);
											}}
										>
											复核判定
										</button>
									)}
									{task.kind === "sample" && task.status === "failed" && (
										<button
											type="button"
											className="text-sm underline"
											disabled={busy}
											onClick={() => void action("retry", { kind: "sample", taskId: task.id })}
										>
											补测此失败样本
										</button>
									)}
								</div>
							</details>
						))}
					</div>
					<details className="rounded border p-3">
						<summary className="cursor-pointer text-sm">官网检查与证据</summary>
						<pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
							{pretty(detail.website ?? detail.websiteResult)}
						</pre>
					</details>
					<form onSubmit={submitReview} className="space-y-3 rounded border p-4">
						<h3 className="font-semibold">复核判定</h3>
						<p className="text-sm text-muted-foreground">
							选择上方样本后编辑。肯定的提及、推荐或分店匹配必须有回答原文证据，服务端会验证证据。
						</p>
						<label className="block text-sm">
							样本／任务 ID
							<input
								className={`${auditInputClass} mt-1`}
								value={reviewTask}
								onChange={(event) => setReviewTask(event.target.value)}
								required
							/>
						</label>
						<label className="block text-sm">
							判定 JSON
							<textarea
								className={`${auditInputClass} mt-1 min-h-48 font-mono text-xs`}
								value={reviewText}
								onChange={(event) => setReviewText(event.target.value)}
								required
							/>
						</label>
						<button type="submit" className={auditButtonClass} disabled={busy}>
							保存复核记录
						</button>
					</form>
					<div className="space-y-3 rounded border p-4">
						<h3 className="font-semibold">发布修订报告</h3>
						<p className="text-sm text-muted-foreground">
							建议使用英文。发布会生成新的不可变报告版本，保留旧版本和原始检测条件。改变门店或检测配置请整店复测。
						</p>
						<label className="block text-sm">
							建议数组 JSON（留空数组则使用检测建议）
							<textarea
								className={`${auditInputClass} mt-1 min-h-32 font-mono text-xs`}
								value={suggestionsText}
								onChange={(event) => setSuggestionsText(event.target.value)}
							/>
						</label>
						<button type="button" className={auditButtonClass} disabled={busy} onClick={() => void publishRevision()}>
							发布新报告版本
						</button>
					</div>
					<div className="flex flex-wrap gap-3">
						{[
							["重试 PDF", "retry", { kind: "pdf" }],
							["重试报告就绪邮件", "retry", { kind: "mail" }],
							["整店复测（新体检）", "retest", {}],
							["重发报告访问邮件", "resend", {}],
							["撤销客户访问", "revoke", {}],
						].map(([label, name, payload]) => (
							<button
								type="button"
								key={String(name) + String(label)}
								className={auditButtonClass}
								disabled={busy}
								onClick={() => void action(String(name), record(payload))}
							>
								{String(label)}
							</button>
						))}
					</div>
					<form
						className="rounded border border-red-300 p-4"
						onSubmit={(event) => {
							event.preventDefault();
							void action("delete");
						}}
					>
						<label className="flex items-start gap-3 text-sm">
							<input type="checkbox" required />
							<span>确认处理该客户删除请求。删除报告及原始内容，并保留最少的费用与必要操作记录。</span>
						</label>
						<button type="submit" disabled={busy} className={`${auditButtonClass} mt-3`}>
							删除客户内容
						</button>
					</form>
					<details className="rounded border p-3">
						<summary className="cursor-pointer font-medium">管理员操作日志</summary>
						<pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
							{pretty(detail.logs ?? detail.operations)}
						</pre>
					</details>
				</section>
			)}
			<section className="space-y-3 rounded-lg border p-5">
				<h2 className="font-semibold">题库、模型与受理配置版本</h2>
				<p className="text-sm text-muted-foreground">
					配置发布仅影响新体检，不改写已冻结计划。保留10题（8道发现、2道核验）、两个已批准的模型、搜索和输出上限。模型密钥不在此输入。
				</p>
				<button
					type="button"
					className="text-sm underline"
					onClick={() => setConfigText(pretty(list.config ?? detail?.config))}
				>
					载入当前配置
				</button>
				<label className="block text-sm">
					配置 JSON
					<textarea
						className={`${auditInputClass} mt-1 min-h-80 font-mono text-xs`}
						value={configText}
						onChange={(event) => setConfigText(event.target.value)}
						placeholder="从当前配置载入后编辑题库版本、英文模板、模型及执行限额"
					/>
				</label>
				<button
					type="button"
					className={`${auditButtonClass} mr-3`}
					disabled={busy || !configText || !selectedId}
					onClick={() => void previewConfig()}
				>
					用已选门店预览 10 道题目
				</button>
				<button
					type="button"
					className={auditButtonClass}
					disabled={busy || !configText}
					onClick={() => void publishConfig()}
				>
					校验并发布配置版本
				</button>
			</section>
		</main>
	);
}
