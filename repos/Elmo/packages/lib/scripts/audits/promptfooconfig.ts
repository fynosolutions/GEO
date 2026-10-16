import { type JudgmentEvaluationRow, promptfooJudgmentTests } from "../../src/audits/evaluation";

export function buildRecordedJudgmentConfig(rows: JudgmentEvaluationRow[]) {
	const recorded = new Map(rows.map((row) => [row.fixture.id, row.actual]));
	if (recorded.size !== rows.length) throw new Error("Replay fixture IDs must be unique");
	return {
		description: "Offline replay of budget-accounted restaurant judgments; no new model calls",
		prompts: [({ vars }: { vars: Record<string, unknown> }) => String(vars.fixture)],
		providers: [
			{
				id: () => "recorded-restaurant-judge",
				handlesOwnRetries: true,
				async callApi(prompt: string) {
					const fixture = JSON.parse(prompt) as { id: string };
					const actual = recorded.get(fixture.id);
					return actual
						? { output: JSON.stringify(actual), cost: 0 }
						: { error: "No budget-accounted judgment was recorded for this fixture" };
				},
			},
		],
		tests: promptfooJudgmentTests(rows.map((row) => row.fixture)),
		writeLatestResults: false,
		sharing: false,
	};
}
