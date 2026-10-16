import { writeFile } from "node:fs/promises";
import { createSyntheticJudgmentFixtures } from "../../src/audits/evaluation";

const destination = process.argv[2];
if (!destination) throw new Error("Provide a local destination for the proposed evaluation fixtures");
await writeFile(
	destination,
	`${JSON.stringify({ schemaVersion: "restaurant-audit.proposed-fixtures.v1", annotationsPending: true, fixtures: createSyntheticJudgmentFixtures() }, null, 2)}\n`,
	{ flag: "wx", mode: 0o600 },
);
process.stdout.write(
	"Wrote 64 proposed synthetic fixtures. Human review and budget-accounted judge results are still required.\n",
);
