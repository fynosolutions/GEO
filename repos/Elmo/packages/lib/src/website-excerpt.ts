import { getSafeWebsiteExcerpt } from "./audits/website";

/** Public website context uses the same DNS-pinned, bounded fetcher as audits. */
export async function getWebsiteExcerpt(url: string): Promise<string> {
	if (!url) return "";
	try {
		return await getSafeWebsiteExcerpt(/^https?:\/\//i.test(url) ? url : `https://${url}`);
	} catch {
		return "";
	}
}
