import {
	type PlatformBinding,
	type PlatformCode,
	type PlatformProvider,
	type PlatformReply,
	type PlatformResult,
	platformFieldLabels,
	platformMessages,
} from "@workspace/lib/restaurants/geo/platform-contracts";
import { Button } from "@workspace/ui/components/button";
import { useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import googleMapsAttribution from "@/assets/google-maps-attribution.png?inline";
import { platformBindFn, platformBindingsFn, platformQueryFn } from "@/server/restaurant-platforms";
import { TextField } from "./fact-editor";

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
	);
export function platformResultHtml(result: PlatformResult) {
	const fields = Object.entries(result.fields)
		.map(
			([key, field]) =>
				`<article><strong>${escapeHtml(platformFieldLabels[key] ?? key)}</strong><p>${escapeHtml(field.value ?? "未提供")}</p></article>`,
		)
		.join("");
	const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
		.map((label, index) => {
			const day = result.hours[String(index + 1)];
			return `<li>${label}：${escapeHtml(!day ? "未提供" : day.state === "24h" ? "24 小时营业" : day.intervals.map((p) => `${p.open}–${p.close}${p.closesNextDay ? "（次日）" : ""}`).join("、"))}</li>`;
		})
		.join("");
	return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{font:14px/1.6 system-ui,sans-serif;color:#17353a;padding:12px;overflow-wrap:anywhere}article{padding:8px 12px;border:1px solid #ddd;border-radius:8px;margin:8px 0}p{margin:4px 0}a{color:#076b67}ul{padding-left:20px}</style></head><body><p>${result.provider === "google_maps" ? `<img src="${escapeHtml(googleMapsAttribution)}" alt="Google Maps" height="18" style="height:18px;width:auto;margin:10px 10px 5px 0;vertical-align:middle">` : "<strong>Yelp</strong>"} · API 实时数据</p><p>门店 ID：${escapeHtml(result.businessId)}</p><p>查询时间：${escapeHtml(result.queriedAt)}</p>${fields}<article><strong>常规营业时间</strong><ul>${days}</ul><p>未提供不代表当天休息；特殊日期与此刻是否开门尚未核实。</p></article><p><a href="${escapeHtml(result.sourceUrl)}" target="_blank" rel="noopener noreferrer">打开平台门店页</a></p>${result.attributions.map((a) => `<p>数据来源：${a.url ? `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.name)}</a>` : escape(a.name)}</p>`).join("")}</body></html>`;
}
function PlatformPreview({ result }: { result: PlatformResult }) {
	const [url, setUrl] = useState<string>();
	useEffect(() => {
		// Keep provider content out of DOM attributes recorded by page analytics.
		const preview = URL.createObjectURL(new Blob([platformResultHtml(result)], { type: "text/html;charset=utf-8" }));
		setUrl(preview);
		return () => URL.revokeObjectURL(preview);
	}, [result]);
	return (
		<iframe
			title="平台店铺实时信息"
			sandbox="allow-popups allow-popups-to-escape-sandbox"
			referrerPolicy="no-referrer"
			src={url}
			className="w-full h-[680px] rounded-lg border"
		/>
	);
}
export function PlatformPanel({
	scope,
	provider,
	canConfirm,
}: {
	scope: { organizationId: string; storeId: string };
	provider: PlatformProvider;
	canConfirm: boolean;
}) {
	const { organizationId, storeId } = scope;
	const [identifier, setIdentifier] = useState("");
	const [reply, setReply] = useState<PlatformReply>();
	const [binding, setBinding] = useState<PlatformBinding>();
	const [availability, setAvailability] = useState<PlatformCode>();
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const [confirmed, setConfirmed] = useState(false);
	const active = useRef(true);
	const running = useRef(false);
	function showMessage(value: string) {
		if (active.current) setMessage(value);
	}
	useEffect(() => {
		active.current = true;
		void platformBindingsFn({ data: { organizationId, storeId } })
			.then((data) => {
				if (!active.current) return;
				const current = data.bindings.find((b) => b.provider === provider);
				setBinding(current);
				setIdentifier(current?.businessId ?? "");
				setAvailability(data.code === "ok" ? data.availability[provider] : data.code);
			})
			.catch(() => {
				if (active.current) setAvailability("unavailable");
			});
		return () => {
			active.current = false;
		};
	}, [organizationId, storeId, provider]);
	async function query() {
		if (running.current) return;
		running.current = true;
		setBusy(true);
		setReply(undefined);
		setConfirmed(false);
		setMessage("");
		try {
			const data = await platformQueryFn({ data: { ...scope, provider, identifier, requestId: uuid() } });
			if (active.current) {
				setReply(data);
				setMessage(platformMessages[data.code]);
			}
		} catch {
			if (active.current) setMessage("查询失败，请检查登录状态和服务连接；未自动重试");
		} finally {
			running.current = false;
			if (active.current) setBusy(false);
		}
	}
	async function bind() {
		if (!reply?.receipt || !reply.result || !confirmed || running.current) return;
		running.current = true;
		setBusy(true);
		try {
			const data = await platformBindFn({ data: { ...scope, receipt: reply.receipt, confirmed: true } });
			if (!active.current) return;
			setMessage(data.code === "ok" ? "平台门店已绑定；仅保存平台 ID" : platformMessages[data.code]);
			if (data.code !== "ok") return;
			setBinding({ provider, businessId: reply.result.businessId, confirmedAt: new Date().toISOString() });
		} catch {
			showMessage("绑定失败，请重新查询预览后确认");
		} finally {
			running.current = false;
			if (active.current) setBusy(false);
		}
	}
	return (
		<div className="space-y-3 ph-no-capture" data-private="true" data-clarity-mask="true">
			<p className="text-sm">实时查询仅在当前页面展示；平台资料不保存为历史快照，不进入诊断、导出或周检测。</p>
			{availability && availability !== "ok" && <p role="status">{platformMessages[availability]}</p>}
			{binding && <p className="text-sm">已绑定：{binding.businessId}</p>}
			{canConfirm && (
				<fieldset disabled={busy} className="space-y-3">
					<TextField
						label={provider === "google_maps" ? "Google Place ID" : "Yelp Business ID、alias 或完整门店链接"}
						value={identifier}
						onChange={(value) => {
							setIdentifier(value);
							setReply(undefined);
							setConfirmed(false);
						}}
					/>
					<Button disabled={busy || !identifier.trim() || availability !== "ok"} onClick={() => void query()}>
						{busy ? "处理中…" : "查询平台信息"}
					</Button>
				</fieldset>
			)}
			<p aria-live="polite">{message}</p>
			{reply?.result && (
				<>
					<PlatformPreview result={reply.result} />
					{canConfirm && (
						<>
							<label className="flex items-center gap-2 text-sm">
								<input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
								我已核对店名、地址，确认这是当前分店
							</label>
							<Button disabled={busy || !confirmed} onClick={() => void bind()}>
								确认绑定此分店
							</Button>
						</>
					)}
				</>
			)}
		</div>
	);
}
