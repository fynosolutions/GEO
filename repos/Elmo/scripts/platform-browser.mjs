import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repo, "apps/web/package.json"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")).href);
const { default: tailwind } = await import(pathToFileURL(require.resolve("@tailwindcss/vite")).href);
const { chromium } = require("playwright");
const root = path.join(repo, ".restaurant-test/platforms/browser");
await mkdir(root, { recursive: true });
const component = `/@fs/${path.join(repo, "apps/web/src/components/restaurants/platform-panel.tsx").replaceAll("\\", "/")}`;
await writeFile(path.join(root, "index.html"), '<html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/harness.tsx"></script></body></html>');
await writeFile(path.join(root, "harness.tsx"), `
import ${JSON.stringify(`/@fs/${path.join(repo, "apps/web/src/styles.css").replaceAll("\\", "/")}`)};
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PlatformPanel } from ${JSON.stringify(component)};
function Harness() {
 const [storeId, setStoreId] = useState("00000000-0000-4000-8000-000000000001");
 const provider = new URLSearchParams(location.search).get("provider") === "yelp" ? "yelp" : "google_maps";
 return <main style={{maxWidth:640,margin:"24px auto",fontFamily:"sans-serif"}}><h1>平台查询 · 合成验收数据</h1>
 <button onClick={() => setStoreId("00000000-0000-4000-8000-000000000002")}>切换测试门店</button>
 <PlatformPanel key={storeId} scope={{organizationId:"fixture-org",storeId}} provider={provider} canConfirm={!location.search.includes("reader")} /></main>;
}
createRoot(document.getElementById("root")).render(<Harness/>);
`);
const mockId = "\0platform-preview-mock";
const server = await createServer({
	configFile: false,
	root,
	plugins: [react(), tailwind(), {
		name: "synthetic-platform-api",
		enforce: "pre",
		resolveId(source) { if (/\/server\/restaurant-platforms(?:\.ts)?$/.test(source.replaceAll("\\", "/"))) return mockId; },
		load(id) {
			if (id !== mockId) return;
			return `
window.fixtureCalls = { query: 0, bind: 0 };
export async function platformBindingsFn() {
 const ready = location.search.includes("ready");
 return { code:"ok", bindings:[], availability:{google_maps:ready?"ok":"not_enabled",yelp:ready?"ok":"not_enabled"} };
}
export async function platformQueryFn({data}) {
 window.fixtureCalls.query++;
 await new Promise(resolve => setTimeout(resolve,400));
 return {code:"ok",receipt:"synthetic-receipt",result:{provider:data.provider,businessId:"canonical-synthetic-id",queriedAt:"2026-10-15T12:00:00Z",sourceUrl:data.provider==="yelp"?"https://www.yelp.com/biz/synthetic":"https://maps.google.com",fields:{name:{state:"observed",value:"SYNTHETIC RESTAURANT"},address:{state:"observed",value:"1 Example St, New York"},website:{state:"not_provided"}},hours:{1:{state:"open",intervals:[{open:"18:00",close:"02:00",closesNextDay:true}]}},attributions:[{name:data.provider==="yelp"?"Yelp":"Google Maps"}]}};
}
export async function platformBindFn({data}) { window.fixtureCalls.bind++; window.fixtureBinding=data; return {code:"ok"}; }
`;
		},
	}],
	resolve: { alias: [
		{ find: "@/", replacement: `${path.join(repo, "apps/web/src").replaceAll("\\", "/")}/` },
		...(["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"].map(name => ({ find: new RegExp(`^${name}$`), replacement: require.resolve(name) }))),
	] },
	optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"] },
	server: { host: "127.0.0.1", port: 0, fs: { allow: [repo] } },
});
let browser;
try {
	await server.listen();
	const address = server.httpServer.address();
	const base = `http://127.0.0.1:${address.port}`;
	browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" } : {}) });
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", error => errors.push(error.message));
	await page.route("**/*", route => route.request().url().startsWith(base) ? route.continue() : route.abort());
	await page.goto(base);
	await page.getByText("平台用途尚未启用，请先确认接口授权").waitFor();
	assert.equal(await page.getByRole("button", { name: "查询平台信息" }).isDisabled(), true);
	await page.goto(`${base}/?ready`);
	await page.getByLabel("Google Place ID").fill("synthetic-place-id");
	await page.getByRole("button", { name: "查询平台信息" }).dblclick();
	await page.frameLocator("iframe").getByText("SYNTHETIC RESTAURANT").waitFor();
	assert.equal(await page.evaluate(() => window.fixtureCalls.query), 1);
	assert.equal(await page.evaluate(() => document.body.textContent.includes("SYNTHETIC RESTAURANT")), false);
	assert.equal(await page.locator("iframe").getAttribute("sandbox"), "allow-popups allow-popups-to-escape-sandbox");
	assert.equal(await page.getByRole("button", { name: "确认绑定此分店" }).isDisabled(), true);
	await page.getByRole("checkbox").check();
	await page.getByRole("button", { name: "确认绑定此分店" }).click();
	await page.getByText("平台门店已绑定；仅保存平台 ID").waitFor();
	assert.equal(await page.evaluate(() => window.fixtureBinding.receipt), "synthetic-receipt");
	await page.screenshot({ path: path.join(root, "google-preview.png"), fullPage: true });
	await page.getByRole("button", { name: "切换测试门店" }).click();
	assert.equal(await page.locator("iframe").count(), 0);
	await page.goto(`${base}/?ready&provider=yelp`);
	await page.getByLabel("Yelp Business ID、alias 或完整门店链接").fill("https://www.yelp.com/biz/synthetic");
	await page.getByRole("button", { name: "查询平台信息" }).click();
	await page.frameLocator("iframe").getByText("SYNTHETIC RESTAURANT").waitFor();
	await page.screenshot({ path: path.join(root, "yelp-preview.png"), fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
	await page.screenshot({ path: path.join(root, "mobile-preview.png"), fullPage: true });
	await page.goto(`${base}/?reader`);
	assert.equal(await page.getByRole("button", { name: "查询平台信息" }).count(), 0);
	assert.deepEqual(errors, []);
	console.log("Browser fixture passed: disabled setup, duplicate click, isolated preview, confirmed binding, store switch, Yelp, mobile and reader permissions. No external API calls.");
} finally {
	await browser?.close();
	await server.close();
}
