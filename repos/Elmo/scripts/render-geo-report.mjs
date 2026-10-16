import { createRequire } from "node:module";
import { existsSync } from "node:fs";
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("playwright");
let html = "";
for await (const chunk of process.stdin) {
	html += chunk.toString("utf8");
	if (html.length > 20_000_000) throw new Error("Report input too large");
}
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" && existsSync(edge) ? { executablePath: edge } : {}) });
try {
	const page = await browser.newPage({ javaScriptEnabled: false, serviceWorkers: "block" });
	await page.route("**/*", route => route.abort());
	await page.setContent(html, { waitUntil: "domcontentloaded" });
	await page.evaluate(() => document.fonts.ready);
	const pdf = await page.pdf({ format: "A4", margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" }, printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;color:#666">GEO / <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
	process.stdout.write(pdf.toString("base64"));
} finally { await browser.close(); }
