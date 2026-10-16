import { type AuditConfig, auditConfigSchema } from "./contracts";

export { auditConfigSchema } from "./contracts";

export const defaultAuditConfig: AuditConfig = {
	version: "restaurant-audit.v1",
	questionBankVersion: "restaurant-en.v1",
	judgmentVersion: "restaurant-judgment.v1",
	targets: [
		{
			id: "openai",
			provider: "openai",
			model: "gpt-5.4-mini-2026-03-17",
			webSearch: true,
			maxOutputTokens: 4096,
			timeoutMs: 90000,
			concurrency: 2,
			maxToolCalls: 1,
		},
		{
			id: "gemini",
			provider: "openrouter",
			model: "google/gemini-2.5-flash",
			webSearch: true,
			maxOutputTokens: 4096,
			timeoutMs: 90000,
			concurrency: 2,
			searchEngine: "exa",
			maxResults: 3,
		},
	],
	questionTemplates: [
		{
			id: "area",
			type: "discovery",
			template:
				"Which restaurants would you recommend in {city}, {state}? Give a short reason for each recommendation.",
		},
		{
			id: "cuisine",
			type: "discovery",
			template:
				"Which {cuisine} restaurants would you recommend in {city}, {state}? Give a short reason for each recommendation.",
		},
		{ id: "lunch", type: "discovery", template: "Where would you recommend going for lunch in {city}, {state}?" },
		{
			id: "dinner",
			type: "discovery",
			template: "Which restaurants would you recommend for dinner in {city}, {state}?",
		},
		{
			id: "family",
			type: "discovery",
			template: "Which restaurants would you recommend for a family meal in {city}, {state}?",
		},
		{
			id: "friends",
			type: "discovery",
			template: "Which restaurants would you recommend for a meal with friends in {city}, {state}?",
		},
		{ id: "date", type: "discovery", template: "Which restaurants would you recommend for a date in {city}, {state}?" },
		{
			id: "budget",
			type: "discovery",
			template: "Which restaurants would you recommend for a budget-friendly meal in {city}, {state}?",
		},
		{
			id: "identity",
			type: "brand_verification",
			template:
				"What are the street address and phone number of {name} in {city}, {state}? If you cannot verify a detail, say so.",
		},
		{
			id: "actions",
			type: "brand_verification",
			template:
				"Where can I find the official menu and reservation options for {name} in {city}, {state}? If an option cannot be verified, say so.",
		},
	],
};

export function validateAuditConfig(value: unknown): AuditConfig {
	return auditConfigSchema.parse(value);
}
