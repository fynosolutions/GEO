import path from "node:path";
import { openDatabase } from "../src/infrastructure/database/connection";
import { createRepository } from "../src/infrastructure/database/repository";
import { createAssetStore } from "../src/infrastructure/storage/assets";
import { createMerchantService } from "../src/modules/merchant/public";
import { seedSamples } from "./sample-data";
const root = path.resolve(".local/demo-us"),
  connection = openDatabase(root),
  repository = createRepository(connection);
try {
  if (repository.list().length)
    throw new Error(
      "Demo directory already contains data. Existing files have been preserved.",
    );
  const service = createMerchantService({
    repository,
    assets: createAssetStore(root),
  });
  const samples = await seedSamples(service);
  console.log(
    JSON.stringify(
      {
        message:
          "Three fictional restaurants saved to the separate demo directory",
        data_directory: root,
        primary_merchant_id: samples.primary.merchant_id,
      },
      null,
      2,
    ),
  );
} finally {
  connection.native.close();
}
