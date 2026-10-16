import { z } from "zod";
import { storeInput } from "../facts";

export const platformProvider = z.enum(["google_maps", "yelp"]);
export type PlatformProvider = z.infer<typeof platformProvider>;
export const platformQueryInput = storeInput.extend({
	provider: platformProvider,
	identifier: z.string().trim().min(1).max(500),
	requestId: z.uuid(),
});
export const platformBindInput = storeInput.extend({
	receipt: z.string().min(1).max(3000),
	confirmed: z.literal(true),
});
export type PlatformCode =
	| "ok"
	| "not_configured"
	| "not_enabled"
	| "pricing_required"
	| "budget_exceeded"
	| "unauthorized"
	| "not_found"
	| "rate_limited"
	| "timeout"
	| "unavailable"
	| "invalid_identifier"
	| "invalid_response"
	| "duplicate_request"
	| "database_required";
export const platformMessages: Record<PlatformCode, string> = {
	ok: "查询成功；请核对是否为同一分店",
	not_configured: "尚未配置平台 API 凭据",
	not_enabled: "平台用途尚未启用，请先确认接口授权",
	pricing_required: "尚未配置单次费用上限或已有外部服务支出",
	budget_exceeded: "项目外部服务预算不足，已停止请求",
	unauthorized: "无操作权限或平台凭据／接口权限无效",
	not_found: "接口未返回该门店；不代表门店不存在",
	rate_limited: "请求过于频繁或平台额度已用尽，请稍后手动重试",
	timeout: "平台请求超时，费用预留仍保留，请先核对账单",
	unavailable: "平台请求失败；未自动重试，请稍后手动查询",
	invalid_identifier: "平台门店 ID 或 Yelp 门店链接格式不正确",
	invalid_response: "平台返回的数据无法可靠解析",
	duplicate_request: "本次请求已处理或仍在执行，请勿重复提交",
	database_required: "平台查询记录暂不可用，请先完成 GEO 扩展表安装及数据库检查",
};
export type PlatformField = { state: "observed" | "not_provided"; value?: string };
export type PlatformResult = {
	provider: PlatformProvider;
	businessId: string;
	queriedAt: string;
	sourceUrl: string;
	fields: Record<string, PlatformField>;
	hours: Record<
		string,
		{ state: "open" | "24h"; intervals: { open: string; close: string; closesNextDay: boolean }[] }
	>;
	attributions: { name: string; url?: string }[];
};
export type PlatformReply = { code: PlatformCode; result?: PlatformResult; receipt?: string };
export type PlatformBinding = { provider: PlatformProvider; businessId: string; confirmedAt: string };
export const platformFieldLabels: Record<string, string> = {
	name: "店名",
	address: "地址",
	phone: "电话",
	website: "餐厅官网",
	businessStatus: "营业状态",
};
export function isPlatformChannel(channel: string): channel is PlatformProvider {
	return channel === "google_maps" || channel === "yelp";
}
export function assertHtmlSource(channel: string, inputUrl: string) {
	const url = new URL(inputUrl);
	const host = url.hostname.toLowerCase();
	const yelp = host === "yelp.com" || host.endsWith(".yelp.com");
	const maps =
		host === "maps.app.goo.gl" ||
		host === "maps.google.com" ||
		(["google.com", "www.google.com"].includes(host) && url.pathname.startsWith("/maps"));
	if (isPlatformChannel(channel) || yelp || maps)
		throw new Error("Google／Yelp 请使用独立实时查询，不保存 HTML 快照或启用周检测");
}
