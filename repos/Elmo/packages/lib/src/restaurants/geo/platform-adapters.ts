import { z } from "zod";
import type {
	PlatformCode,
	PlatformField,
	PlatformProvider,
	PlatformReply,
	PlatformResult,
} from "./platform-contracts";

export const GOOGLE_FIELDS =
	"id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,regularOpeningHours,businessStatus,googleMapsUri,attributions";
const identifier = z.string().regex(/^[\p{L}\p{N}_-]{1,250}$/u);
export function normalizePlatformId(provider: PlatformProvider, input: string): string | null {
	let value = input.trim();
	if (provider === "yelp" && value.startsWith("https://")) {
		try {
			const url = new URL(value);
			if (!["yelp.com", "www.yelp.com"].includes(url.hostname) || url.username || url.password || url.port) return null;
			const match = /^\/biz\/([^/]+)\/?$/.exec(url.pathname);
			if (!match) return null;
			value = decodeURIComponent(match[1]);
		} catch {
			return null;
		}
	}
	if (provider === "google_maps" && !/^[A-Za-z0-9_-]{1,250}$/.test(value)) return null;
	return identifier.safeParse(value).success ? value : null;
}
export function usdMicros(value: string | undefined): number | null {
	if (!value || !/^(0|[1-9]\d{0,4})(\.\d{1,6})?$/.test(value)) return null;
	const [whole, fraction = ""] = value.split(".");
	return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
}
export function platformConfig(provider: PlatformProvider, env: Record<string, string | undefined> = process.env) {
	const google = provider === "google_maps";
	const key = env[google ? "GEO_GOOGLE_PLACES_API_KEY" : "GEO_YELP_API_KEY"];
	const enabled = google
		? env.GEO_GOOGLE_PLACES_ENABLED === "true"
		: ["evaluation", "display_authorized"].includes(env.GEO_YELP_PURPOSE ?? "");
	const maxMicros = usdMicros(env[google ? "GEO_GOOGLE_MAX_REQUEST_USD" : "GEO_YELP_MAX_REQUEST_USD"]);
	const priorMicros = usdMicros(env.GEO_PLATFORM_PRIOR_SPEND_USD);
	const code: PlatformCode = !enabled
		? "not_enabled"
		: !key
			? "not_configured"
			: maxMicros === null || maxMicros <= 0 || priorMicros === null
				? "pricing_required"
				: "ok";
	return { key, maxMicros, priorMicros, code };
}
const field = (value?: string): PlatformField => (value ? { state: "observed", value } : { state: "not_provided" });
const safeUrl = (value?: string) => {
	try {
		const url = new URL(value ?? "");
		return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
	} catch {
		return undefined;
	}
};
const googleTime = z.object({
	day: z.number().int().min(0).max(6),
	hour: z.number().int().min(0).max(23).default(0),
	minute: z.number().int().min(0).max(59).default(0),
});
const googleSchema = z.object({
	id: z.string().min(1).max(250),
	displayName: z.object({ text: z.string().max(1000) }).optional(),
	formattedAddress: z.string().max(3000).optional(),
	nationalPhoneNumber: z.string().max(100).optional(),
	internationalPhoneNumber: z.string().max(100).optional(),
	websiteUri: z.string().max(2000).optional(),
	googleMapsUri: z.string().max(2000).optional(),
	businessStatus: z.string().max(100).optional(),
	regularOpeningHours: z
		.object({
			periods: z
				.array(z.object({ open: googleTime, close: googleTime.optional() }))
				.max(100)
				.optional(),
		})
		.optional(),
	attributions: z
		.array(z.object({ provider: z.string().max(500).optional(), providerUri: z.string().max(2000).optional() }))
		.max(30)
		.optional(),
});
const yelpSchema = z.object({
	id: z.string().min(1).max(250),
	name: z.string().max(1000).optional(),
	phone: z.string().max(100).optional(),
	display_phone: z.string().max(100).optional(),
	url: z.string().max(2000).optional(),
	location: z.object({ display_address: z.array(z.string().max(1000)).max(10).optional() }).optional(),
	is_closed: z.boolean().optional(),
	hours: z
		.array(
			z.object({
				hours_type: z.string().optional(),
				open: z
					.array(
						z.object({
							day: z.number().int().min(0).max(6),
							start: z.string().regex(/^([01]\d|2[0-3])[0-5]\d$/),
							end: z.string().regex(/^([01]\d|2[0-3])[0-5]\d$/),
							is_overnight: z.boolean().optional(),
						}),
					)
					.max(100),
			}),
		)
		.max(10)
		.optional(),
});
const clock = (hour: number, minute: number) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
type GoogleRow = z.infer<typeof googleSchema>;
type YelpRow = z.infer<typeof yelpSchema>;
function googleHours(periods: NonNullable<GoogleRow["regularOpeningHours"]>["periods"] = []): PlatformResult["hours"] {
	const hours: PlatformResult["hours"] = {};
	const only = periods.length === 1 ? periods[0] : undefined;
	if (only && !only.close && only.open.day === 0 && only.open.hour === 0 && only.open.minute === 0) {
		for (let day = 1; day <= 7; day++) hours[day] = { state: "24h", intervals: [] };
		return hours;
	}
	for (const period of periods) {
		const interval = googleInterval(period);
		if (!interval) continue;
		const day = ((period.open.day + 6) % 7) + 1;
		hours[day] ??= { state: "open", intervals: [] };
		hours[day].intervals.push(interval);
	}
	return hours;
}
function googleInterval(period: NonNullable<NonNullable<GoogleRow["regularOpeningHours"]>["periods"]>[number]) {
	if (!period.close) return null;
	const distance = (period.close.day - period.open.day + 7) % 7;
	const duration =
		distance * 1440 + period.close.hour * 60 + period.close.minute - period.open.hour * 60 - period.open.minute;
	if (distance > 1 || duration <= 0) return null;
	return {
		open: clock(period.open.hour, period.open.minute),
		close: clock(period.close.hour, period.close.minute),
		closesNextDay: distance === 1,
	};
}
function mapGoogle(row: GoogleRow, now: Date): PlatformResult {
	const statuses: Record<string, string> = {
		OPERATIONAL: "营业中（不代表此刻开门）",
		CLOSED_TEMPORARILY: "暂时停业",
		CLOSED_PERMANENTLY: "永久停业",
		FUTURE_OPENING: "尚未开业",
	};
	return {
		provider: "google_maps",
		businessId: row.id,
		queriedAt: now.toISOString(),
		sourceUrl:
			safeUrl(row.googleMapsUri) ??
			`https://www.google.com/maps/search/?api=1&query=store&query_place_id=${encodeURIComponent(row.id)}`,
		fields: {
			name: field(row.displayName?.text),
			address: field(row.formattedAddress),
			phone: field(row.internationalPhoneNumber ?? row.nationalPhoneNumber),
			website: field(safeUrl(row.websiteUri)),
			businessStatus: field(statuses[row.businessStatus ?? ""]),
		},
		hours: googleHours(row.regularOpeningHours?.periods),
		attributions: [
			{ name: "Google Maps", url: "https://maps.google.com" },
			...(row.attributions ?? [])
				.filter((a) => a.provider)
				.map((a) => ({ name: a.provider as string, url: safeUrl(a.providerUri) })),
		],
	};
}
function yelpHours(groups: YelpRow["hours"] = []): PlatformResult["hours"] {
	const hours: PlatformResult["hours"] = {};
	const periods = groups.filter((group) => group.hours_type === "REGULAR").flatMap((group) => group.open);
	for (const period of periods) {
		const day = period.day + 1;
		if (period.start === period.end) {
			if (period.start === "0000" && period.is_overnight === true) hours[day] = { state: "24h", intervals: [] };
			continue;
		}
		hours[day] ??= { state: "open", intervals: [] };
		hours[day].intervals.push({
			open: `${period.start.slice(0, 2)}:${period.start.slice(2)}`,
			close: `${period.end.slice(0, 2)}:${period.end.slice(2)}`,
			closesNextDay: period.is_overnight === true || period.end < period.start,
		});
	}
	return hours;
}
function yelpStatus(closed?: boolean) {
	if (closed === true) return "平台标记关闭（是否永久待核实）";
	if (closed === false) return "平台未标记关闭（不代表此刻开门）";
	return undefined;
}
function mapYelp(row: YelpRow, now: Date): PlatformResult {
	const returnedUrl = safeUrl(row.url);
	const sourceUrl =
		returnedUrl && ["yelp.com", "www.yelp.com"].includes(new URL(returnedUrl).hostname)
			? returnedUrl
			: `https://www.yelp.com/biz/${encodeURIComponent(row.id)}`;
	return {
		provider: "yelp",
		businessId: row.id,
		queriedAt: now.toISOString(),
		sourceUrl,
		fields: {
			name: field(row.name),
			address: field(row.location?.display_address?.join(", ")),
			phone: field(row.phone || row.display_phone),
			website: field(),
			businessStatus: field(yelpStatus(row.is_closed)),
		},
		hours: yelpHours(row.hours),
		attributions: [{ name: "Yelp", url: "https://www.yelp.com" }],
	};
}
export function mapPlatformResponse(provider: PlatformProvider, data: unknown, now = new Date()): PlatformResult {
	return provider === "google_maps" ? mapGoogle(googleSchema.parse(data), now) : mapYelp(yelpSchema.parse(data), now);
}
function httpCode(status: number): PlatformCode {
	if (status === 401 || status === 403) return "unauthorized";
	if (status === 404) return "not_found";
	if (status === 429) return "rate_limited";
	return "unavailable";
}
async function boundedJson(response: Response) {
	const reader = response.body?.getReader();
	if (!reader) throw new Error("Empty response");
	let size = 0;
	const chunks: Uint8Array[] = [];
	while (true) {
		const part = await reader.read();
		if (part.done) break;
		size += part.value.length;
		if (size > 250000) {
			await reader.cancel();
			throw new Error("Oversized response");
		}
		chunks.push(part.value);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function platformResponse(provider: PlatformProvider, id: string, response: Response): Promise<PlatformReply> {
	if (!response.ok) {
		await response.body?.cancel();
		return { code: httpCode(response.status) };
	}
	try {
		const result = mapPlatformResponse(provider, await boundedJson(response));
		if (!normalizePlatformId(provider, result.businessId)) return { code: "invalid_response" };
		if (provider === "google_maps" && result.businessId !== id) return { code: "invalid_response" };
		return { code: "ok", result };
	} catch {
		return { code: "invalid_response" };
	}
}
export async function fetchPlatform(
	provider: PlatformProvider,
	id: string,
	key: string,
	fetcher: typeof fetch = fetch,
): Promise<PlatformReply> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 12000);
	try {
		const google = provider === "google_maps";
		const response = await fetcher(
			google
				? `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=en`
				: `https://api.yelp.com/v3/businesses/${encodeURIComponent(id)}?locale=en_US`,
			{
				headers: google
					? { "X-Goog-Api-Key": key, "X-Goog-FieldMask": GOOGLE_FIELDS }
					: { Authorization: `Bearer ${key}`, Accept: "application/json" },
				redirect: "error",
				cache: "no-store",
				signal: controller.signal,
			},
		);
		const reply = await platformResponse(provider, id, response);
		return controller.signal.aborted ? { code: "timeout" } : reply;
	} catch {
		return { code: controller.signal.aborted ? "timeout" : "unavailable" };
	} finally {
		clearTimeout(timer);
	}
}
