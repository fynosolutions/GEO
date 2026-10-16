import { createHash } from "node:crypto";
import { defaultAuditConfig, validateAuditConfig } from "./config";
import {
	type AuditConfig,
	type AuditQuestionTemplate,
	type FrozenAuditPlan,
	type RestaurantSubject,
	restaurantSubjectSchema,
} from "./contracts";

export function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	return `{${Object.entries(value as Record<string, unknown>)
		.filter(([, item]) => item !== undefined)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
		.join(",")}}`;
}

export function auditHash(value: unknown): string {
	return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function freezeAuditValue<T>(value: T): T {
	if (value && typeof value === "object") {
		for (const child of Object.values(value)) freezeAuditValue(child);
		Object.freeze(value);
	}
	return value;
}

function normalized(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function fillQuestion(question: AuditQuestionTemplate, subject: RestaurantSubject) {
	const values: Record<string, string> = {
		city: subject.city,
		state: subject.state,
		cuisine: subject.cuisine ?? "local",
		name: subject.name,
	};
	const text = question.template.replace(/\{(city|state|cuisine|name)\}/g, (_, key: string) => values[key] ?? "");
	if (question.type === "discovery") {
		const identities = [subject.name, ...subject.aliases, new URL(subject.website).hostname];
		if (identities.some((identity) => ` ${normalized(text)} `.includes(` ${normalized(identity)} `))) {
			throw new Error(
				"Discovery questions must not contain the restaurant name, alias, or website; choose neutral location and cuisine fields",
			);
		}
	}
	return { id: question.id, type: question.type, language: "en" as const, text };
}

export function buildAuditPlan(
	input: RestaurantSubject,
	configInput: AuditConfig = defaultAuditConfig,
	createdAt = new Date().toISOString(),
): FrozenAuditPlan {
	const subject = restaurantSubjectSchema.parse(input);
	const config = validateAuditConfig(configInput);
	if (!Number.isFinite(Date.parse(createdAt))) throw new Error("A valid plan timestamp is required");
	const questions = config.questionTemplates.map((question) => fillQuestion(question, subject));
	const payload = {
		schemaVersion: "restaurant-audit.plan.v1" as const,
		subject,
		questions,
		targets: config.targets,
		samples: questions.flatMap((question) =>
			config.targets.map((target) => ({
				sampleId: `${question.id}:${target.id}`,
				questionId: question.id,
				targetId: target.id,
			})),
		),
		configVersion: config.version,
		questionBankVersion: config.questionBankVersion,
		judgmentVersion: config.judgmentVersion,
		language: "en" as const,
		repetitions: 1 as const,
		createdAt,
	};
	return freezeAuditValue({ ...payload, hash: auditHash(payload) });
}
