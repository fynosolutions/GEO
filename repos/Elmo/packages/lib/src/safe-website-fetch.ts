import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { type ClientRequest, request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const IPV4_DENIED = [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
] as const;

export type PublicWebsiteOptions = {
	headers?: Record<string, string>;
	timeoutMs?: number;
	maxBytes?: number;
	allowedContentTypes?: string[];
	maxRedirects?: number;
};

type WebsiteRequest = (
	options: RequestOptions & { servername?: string; autoSelectFamily?: boolean },
	callback: (response: IncomingMessage) => void,
) => ClientRequest;

type FetchDependencies = {
	lookup?: (hostname: string) => Promise<LookupAddress[]>;
	request?: WebsiteRequest;
};

function ipv4Number(address: string): number {
	return address.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

function isPublicIpv4(address: string): boolean {
	const value = ipv4Number(address);
	return !IPV4_DENIED.some(([base, prefix]) => {
		const size = 2 ** (32 - prefix);
		return Math.floor(value / size) === Math.floor(ipv4Number(base) / size);
	});
}

function isPublicIpv6(address: string): boolean {
	const [first, second = "0"] = address.toLowerCase().split(":");
	const head = Number.parseInt(first ?? "0", 16);
	const next = Number.parseInt(second || "0", 16);
	// Restrict to global unicast; transition mechanisms and special-use ranges stay blocked.
	if (!Number.isFinite(head) || head < 0x2000 || head > 0x3fff) return false;
	if (head === 0x2001 && (next <= 0x1ff || next === 0xdb8)) return false;
	if (head === 0x2002 || (head === 0x3fff && next <= 0xfff)) return false;
	return true;
}

function isPublicAddress(address: string): boolean {
	const family = isIP(address);
	if (family === 4) return isPublicIpv4(address);
	return family === 6 && isPublicIpv6(address);
}

function parseUrl(value: string): URL {
	const url = new URL(value);
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
		throw new Error("Only public HTTP or HTTPS websites are supported");
	}
	if (url.port && !["80", "443"].includes(url.port)) throw new Error("Website port is not allowed");
	const hostname = url.hostname
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/, "")
		.toLowerCase();
	if (!hostname || /(^|\.)(localhost|local|internal|lan|home)$/.test(hostname)) {
		throw new Error("Website hostname is not public");
	}
	url.hash = "";
	return url;
}

function hostnameOf(url: URL): string {
	return url.hostname.replace(/^\[|\]$/g, "");
}

async function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	signal.throwIfAborted();
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
	});
}

async function resolveDestination(
	value: string,
	resolver: NonNullable<FetchDependencies["lookup"]>,
	signal: AbortSignal,
) {
	const url = parseUrl(value);
	const hostname = hostnameOf(url);
	const family = isIP(hostname);
	const addresses = family ? [{ address: hostname, family }] : await withAbort(resolver(hostname), signal);
	if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
		throw new Error("Website resolves to a non-public address");
	}
	signal.throwIfAborted();
	return { url, address: (addresses.find((entry) => entry.family === 4) ?? addresses[0]) as LookupAddress };
}

function requestHeaders(extra: Record<string, string> = {}): Record<string, string> {
	const headers: Record<string, string> = {
		"user-agent": "Mozilla/5.0 (compatible; ElmoWebsiteContext/1.0)",
		accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
	};
	for (const [name, value] of Object.entries(extra)) {
		if (!/^(host|connection|proxy-authorization|accept-encoding|transfer-encoding|content-length)$/i.test(name)) {
			headers[name.toLowerCase()] = value;
		}
	}
	headers["accept-encoding"] = "identity";
	return headers;
}

function pinnedLookup(address: LookupAddress): LookupFunction {
	return (_hostname, options, callback) => {
		if (options.all) callback(null, [address]);
		else callback(null, address.address, address.family);
	};
}

function openResponse(
	url: URL,
	address: LookupAddress,
	headers: Record<string, string>,
	signal: AbortSignal,
	request?: WebsiteRequest,
): Promise<IncomingMessage> {
	return new Promise((resolve, reject) => {
		const transport: WebsiteRequest = request ?? (url.protocol === "https:" ? httpsRequest : httpRequest);
		const hostname = hostnameOf(url);
		const outgoing = transport(
			{
				protocol: url.protocol,
				hostname,
				port: url.port || undefined,
				path: `${url.pathname}${url.search}`,
				method: "GET",
				headers,
				lookup: pinnedLookup(address),
				agent: false,
				autoSelectFamily: false,
				servername: isIP(hostname) ? undefined : hostname,
				maxHeaderSize: 16_384,
				signal,
			},
			resolve,
		);
		outgoing.on("error", reject);
		outgoing.end();
	});
}

function validateResponse(response: IncomingMessage, maxBytes: number, contentTypes: string[]) {
	if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
		throw new Error("Website did not return a successful response");
	}
	const contentType = response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
	if (!contentType || !contentTypes.includes(contentType)) throw new Error("Website content type is not supported");
	const encoding = response.headers["content-encoding"]?.trim().toLowerCase();
	if (encoding && encoding !== "identity") throw new Error("Encoded website responses are not supported");
	const length = response.headers["content-length"];
	if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
		throw new Error("Website response exceeds the size limit");
	}
}

async function readBody(response: IncomingMessage, maxBytes: number, signal: AbortSignal): Promise<string> {
	const chunks: Buffer[] = [];
	let bytes = 0;
	for await (const chunk of response) {
		signal.throwIfAborted();
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		bytes += buffer.length;
		if (bytes > maxBytes) throw new Error("Website response exceeds the size limit");
		chunks.push(buffer);
	}
	if (!response.complete) throw new Error("Website response was interrupted");
	return Buffer.concat(chunks).toString("utf8");
}

function boundedOption(value: number | undefined, fallback: number, allowZero = false, ceiling = fallback): number {
	const result = value ?? fallback;
	if (!Number.isInteger(result) || result < (allowZero ? 0 : 1)) throw new Error("Invalid website fetch limit");
	return Math.min(result, ceiling);
}

function redirectDestination(response: IncomingMessage, url: URL, hop: number, maxRedirects: number): URL | undefined {
	if (!REDIRECTS.has(response.statusCode ?? 0)) return undefined;
	if (!response.headers.location || hop === maxRedirects) throw new Error("Website redirect limit exceeded");
	return new URL(response.headers.location, url);
}

export function createPublicWebsiteFetcher(dependencies: FetchDependencies = {}) {
	const resolver = dependencies.lookup ?? ((hostname: string) => lookup(hostname, { all: true, verbatim: true }));
	async function validatePublicWebsiteUrl(value: string): Promise<URL> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(new Error("Website request timed out")), TIMEOUT_MS);
		try {
			return (await resolveDestination(value, resolver, controller.signal)).url;
		} finally {
			clearTimeout(timer);
		}
	}
	async function fetchPublicWebsite(value: string, options: PublicWebsiteOptions = {}) {
		const timeoutMs = boundedOption(options.timeoutMs, TIMEOUT_MS, false, 30_000);
		const maxBytes = boundedOption(options.maxBytes, MAX_BYTES);
		const maxRedirects = boundedOption(options.maxRedirects, 5, true);
		const contentTypes = options.allowedContentTypes ?? ["text/html", "application/xhtml+xml"];
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(new Error("Website request timed out")), timeoutMs);
		let current = value;
		let headers = requestHeaders(options.headers);
		try {
			for (let hop = 0; hop <= maxRedirects; hop++) {
				const { url, address } = await resolveDestination(current, resolver, controller.signal);
				const response = await openResponse(url, address, headers, controller.signal, dependencies.request);
				try {
					const next = redirectDestination(response, url, hop, maxRedirects);
					if (next) {
						if (next.origin !== url.origin) headers = requestHeaders();
						current = next.href;
						continue;
					}
					validateResponse(response, maxBytes, contentTypes);
					const body = await readBody(response, maxBytes, controller.signal);
					return { url: url.href, status: response.statusCode as number, body };
				} finally {
					response.destroy();
				}
			}
			throw new Error("Website redirect limit exceeded");
		} finally {
			clearTimeout(timer);
		}
	}
	return { validatePublicWebsiteUrl, fetchPublicWebsite };
}

export const { validatePublicWebsiteUrl, fetchPublicWebsite } = createPublicWebsiteFetcher();
