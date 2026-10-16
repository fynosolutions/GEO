import { spawn } from "node:child_process";
import path from "node:path";
import { geoRoot } from "../restaurants/geo/runtime";
import type { AuditReportSnapshot } from "./contracts";
import { renderAuditReportHtml } from "./report";

export type AuditEmailContent = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character,
	);
}

export function buildAuditEmail(input: {
	kind: "verification" | "report_ready" | "recovery";
	link: string;
	restaurantName?: string;
}): AuditEmailContent {
	const parsed = new URL(input.link);
	if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
		throw new Error("Invalid audit email link");
	const subject =
		input.kind === "verification"
			? "Verify your restaurant visibility report request"
			: input.kind === "recovery"
				? "Restore access to your restaurant visibility report"
				: "Your restaurant AI visibility report is ready";
	const description =
		input.kind === "verification"
			? "Confirm your email address to prepare your free restaurant AI visibility report. This verifies your email, not ownership of the restaurant website. The link expires in 30 minutes."
			: input.kind === "recovery"
				? "Confirm your email address to restore access to your restaurant report. The link expires in 30 minutes."
				: `Your report${input.restaurantName ? ` for ${input.restaurantName}` : ""} is ready. It includes website technical readiness, sampled API answers, supporting evidence and priority actions. Open the report to see completed checks and any missing data.`;
	const cta = input.kind === "report_ready" ? "Open your report" : "Confirm email and continue";
	return {
		subject,
		text: `${subject}\n\n${description}\n\n${cta}: ${input.link}\n\nIf you did not request this report, you can ignore this email.`,
		html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(description)}</p><p><a href="${escapeHtml(input.link)}">${cta}</a></p><p>If you did not request this report, you can ignore this email.</p></div>`,
	};
}

export async function renderAuditPdf(report: AuditReportSnapshot): Promise<Buffer> {
	const root = geoRoot();
	return new Promise<Buffer>((resolve, reject) => {
		const child = spawn(process.execPath, [path.join(root, "scripts/render-geo-report.mjs")], {
			cwd: root,
			shell: false,
			windowsHide: true,
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				PATH: process.env.PATH,
				SystemRoot: process.env.SystemRoot,
				TEMP: process.env.TEMP,
				TMP: process.env.TMP,
				HOME: process.env.HOME,
				PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
			} as unknown as NodeJS.ProcessEnv,
		});
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error("Report PDF generation timed out"));
		}, 90000);
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
			if (stdout.length > 40_000_000) {
				child.kill();
				reject(new Error("Report PDF exceeded its size limit"));
			}
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = (stderr + chunk.toString("utf8")).slice(-1000);
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code !== 0) {
				reject(new Error(`Report PDF generation failed: ${stderr || "renderer exited"}`));
				return;
			}
			const bytes = Buffer.from(stdout.trim(), "base64");
			if (bytes.subarray(0, 5).toString() !== "%PDF-") {
				reject(new Error("Renderer did not produce a PDF"));
				return;
			}
			resolve(bytes);
		});
		child.stdin.on("error", () => {});
		child.stdin.end(renderAuditReportHtml(report));
	});
}
