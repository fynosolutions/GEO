import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { fetchPublicWebsite, validatePublicWebsiteUrl } from "./safe-website-fetch";

const MAX_EXCERPT_LINES = 200;
const MAX_EXCERPT_CHARACTERS = 20_000;
const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function boundExcerpt(value: string) {
	return value.trim().split("\n").slice(0, MAX_EXCERPT_LINES).join("\n").slice(0, MAX_EXCERPT_CHARACTERS);
}

async function readerExcerpt(website: URL) {
	const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "text/plain, text/markdown" };
	if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
	const result = await fetchPublicWebsite(`https://r.jina.ai/${website.href}`, {
		headers,
		timeoutMs: 30_000,
		allowedContentTypes: ["text/plain", "text/markdown"],
		// Reader credentials must never follow a redirect to another destination.
		maxRedirects: 0,
	});
	return result.status >= 200 && result.status < 300 ? boundExcerpt(result.body) : "";
}

async function htmlExcerpt(website: URL) {
	const result = await fetchPublicWebsite(website.href, {
		headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
		timeoutMs: 15_000,
	});
	if (result.status < 200 || result.status >= 300 || !result.body.trim()) return "";
	const { document } = parseHTML(result.body);
	const article = new Readability(document).parse()?.textContent?.trim();
	if (article) return boundExcerpt(article);
	const { document: fallback } = parseHTML(result.body);
	for (const node of fallback.querySelectorAll("script,style,noscript,template")) node.remove();
	return boundExcerpt(fallback.body?.textContent ?? "");
}

/** Legacy onboarding also runs in Node-only images and self-contained web bundles. */
export async function getWebsiteExcerpt(url: string): Promise<string> {
	if (!url.trim()) return "";
	let website: URL;
	try {
		const value = url.trim();
		website = await validatePublicWebsiteUrl(value.includes("://") ? value : `https://${value}`);
	} catch {
		return "";
	}
	for (const collect of [readerExcerpt, htmlExcerpt]) {
		try {
			const excerpt = await collect(website);
			if (excerpt) return excerpt;
		} catch {
			// Each optional source can fail without preventing brand initialization.
		}
	}
	return "";
}
