import type { MerchantService } from "../src/modules/merchant/public";
/** Integration example: imports no merchant internals, tables or file paths. */
export async function readForDetection(
  service: MerchantService,
  merchantId: string,
) {
  const profile = await service.getMerchantProfile({
    merchant_id: merchantId,
    projection: "geo_context",
  });
  if (!profile.ok) return profile;
  const fixed = {
    merchant_id: merchantId,
    profile_version: profile.data.profile_version,
  };
  const facts = await service.getMerchantFacts({
    ...fixed,
    verified_only: true,
    as_of_date: profile.data.as_of_date,
  });
  if (!facts.ok) return facts;
  const names = await service.getMerchantNames(fixed);
  if (!names.ok) return names;
  const channels = await service.listChannelSnapshots({
    ...fixed,
    page: 1,
    page_size: 100,
  });
  if (!channels.ok) return channels;
  const publishable = await service.getMerchantProfile({
    ...fixed,
    projection: "publishable",
    as_of_date: profile.data.as_of_date,
  });
  if (!publishable.ok) return publishable;
  return {
    ok: true as const,
    contract_version: "f1.v2" as const,
    data: {
      merchant_id: merchantId,
      profile_version: fixed.profile_version,
      as_of_date: profile.data.as_of_date,
      timezone: profile.data.timezone,
      facts: facts.data,
      names: names.data,
      channels: channels.data,
      publishable: publishable.data,
    },
  };
}
