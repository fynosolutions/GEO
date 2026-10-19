import {
  type MerchantService,
  type Profile,
  type RecordType,
  type Value,
} from "../src/modules/merchant/public";
import { unwrap, known, hours, merchantInput } from "./helpers";
/** Explicitly fictitious material. Never called on application startup. */
export async function seedSamples(service: MerchantService) {
  const brand = unwrap(
    await service.createBrand({
      name: "Sample Juniper",
      description:
        "Fictional brand for development and integration testing only",
      publication_state: "public",
    }),
  );
  let p = unwrap(
    await service.createMerchant({
      ...merchantInput,
      display_name: "Sample Juniper - Downtown Austin",
      brand_id: brand.brand_id,
    }),
  );
  const a = () => ({
    merchant_id: p.merchant_id,
    expected_profile_version: p.profile_version,
  });
  const group = async (
    group_key: keyof Profile["groups"],
    fields: Record<string, unknown>,
  ) => {
    p = unwrap(
      await service.saveGroup({ ...a(), group_key, fields: fields as never }),
    );
  };
  const rec = async (
    record_type: RecordType,
    values: Record<string, Value>,
  ) => {
    p = unwrap(await service.saveRecord({ ...a(), record_type, values }));
    return p.records[record_type].at(-1)!.record_id;
  };
  await group("identity", {
    branch_name: known("Downtown Austin"),
    description: known(
      "Fictional restaurant for development acceptance testing only",
    ),
    opening_date: known("2020-06"),
  });
  await rec("alias", {
    name: "Sample Juniper",
    language: "en-US",
    name_type: "Short name",
  });
  await rec("former_name", {
    name: "Former sample name",
    valid_to: "2020-05-31",
  });
  const contact = await rec("contact", {
    type: "phone",
    value: "+1-512-555-0100",
    purpose: "Inquiries and reservations",
    primary: true,
  });
  await group("location", {
    country: known("US"),
    state: known("TX"),
    postal_code: known("78701"),
    city: known("Austin"),
    county: known("Travis County"),
    longitude: known(-97.7431),
    latitude: known(30.2672),
    coordinate_system: known("WGS84"),
    entrance: known("East entrance of the sample building"),
  });
  await group("operations", {
    status: known("open"),
    weekly_hours: known(hours()),
  });
  await rec("date_exception", {
    start_date: "2026-11-26",
    end_date: "2026-11-26",
    mode: "closed",
    reason: "Fictional holiday hours",
  });
  const menu = await rec("menu", {
    name: "Sample dinner menu",
    type: "Dine-in",
    language: "en-US",
  });
  await rec("menu", { name: "Sample lunch menu", type: "Lunch" });
  const category = await rec("menu_category", {
    name: "Entrees",
    menu_id: menu,
    sort: 1,
  });
  const dish = await rec("dish", {
    name: "Sample grilled trout",
    menu_ids: [menu],
    category,
    description: "Fictional menu item",
    supply: "available",
  });
  await rec("dish", {
    name: "Sample iced tea",
    menu_ids: [menu],
    supply: "available",
  });
  const spec = await rec("dish_spec", {
    dish_id: dish,
    name: "Regular",
    quantity: 12,
    unit: "oz",
    people: 2,
  });
  await rec("dish_spec", {
    dish_id: dish,
    name: "Large",
    quantity: 20,
    unit: "oz",
    people: 4,
  });
  const pack = await rec("package", {
    name: "Sample prix fixe for two",
    dish_ids: [dish],
    contents: "One grilled trout with sides described by staff",
    people: 2,
    supply: "available",
  });
  await group("commercial", {
    average_spend: known("100.00"),
    average_spend_max: known("150.00"),
    currency: known("USD"),
    spend_basis: known(
      "Per-person estimate, excluding drinks, sales tax and gratuity",
    ),
    payment_methods: known(["Cash"]),
    receipt_available: known(true),
    sales_tax_included: known(false),
    sales_tax_note: known(
      "Sample only: applicable local sales tax is added to the check; no tax rate is assumed.",
    ),
    gratuity_policy: known(
      "Sample only: optional tips are not included in listed menu prices.",
    ),
    service_charge_policy: known(
      "Sample only: private room fees are quoted separately before booking.",
    ),
  });
  await group("space", {
    seats: known(60),
    parking: known(false),
    wifi: known(true),
    accessible_entry: known(false),
    child_seat: known(true),
    area_sq_ft: known(2400),
  });
  const room = await rec("room", {
    name: "Sample Oak Room",
    capacity: 10,
    recommended: 8,
    facilities: ["Separate climate control"],
    privacy: "Enclosed private dining room",
  });
  await rec("table", {
    name: "Four-top",
    seats: 4,
    count: 10,
    joinable: false,
  });
  await rec("price", {
    object_type: "dish_spec",
    object_id: spec,
    amount: "28.00",
    currency: "USD",
    unit: "item",
  });
  await rec("price", {
    object_type: "package",
    object_id: pack,
    amount: "65.00",
    currency: "USD",
    unit: "prix fixe menu",
  });
  const fee = await rec("fee", {
    name: "Sample private room fee",
    amount: "100.00",
    currency: "USD",
    unit: "room / event",
    rule: "Charged when booking the sample Oak Room",
  });
  await rec("minimum", {
    object_type: "room",
    object_id: room,
    amount: "800.00",
    currency: "USD",
    unit: "room / event",
    conditions: "Private room fee excluded",
  });
  await rec("deposit", {
    name: "Reservation deposit",
    ratio: 20,
    rule: "Applied to the bill; cancellation terms are recorded separately",
  });
  await rec("promotion", {
    name: "Sample weekday offer",
    method: "Prix fixe offer",
    conditions: "Cannot be combined with other offers",
    valid_from: "2026-10-01",
    valid_to: "2026-10-31",
  });
  await group("service", {
    dine_in: known(true),
    takeaway_supported: known(true),
    delivery_supported: known(false),
    reservation: known(true),
    reservation_contact: known(contact),
    cancellation: known("Sample: cancel at least one day in advance"),
    children_supported: known(true),
    pets_supported: known(false),
  });
  await rec("service_rule", {
    name: "Private dining reservation",
    type: "Reservation",
    description: "Contact at least one day in advance",
    contact_id: contact,
    fee_ids: [fee],
  });
  await group("credentials", {
    legal_name: known("Fictional Juniper Dining LLC"),
    legal_relation: known("Restaurant operator"),
  });
  p = unwrap(
    await service.uploadMerchantAsset({
      ...a(),
      name: "fictional-menu.txt",
      mime: "text/plain",
      category: "Menus",
      bytes: Buffer.from(
        "Fictional menu for development testing only. Sample grilled trout: USD 28.00 per item.",
      ),
      publication_state: "public",
    }),
  );
  const asset = p.records.asset[0].record_id;
  await rec("credential", {
    name: "Sample food establishment permit",
    number: "SAMPLE-NOT-REAL",
    issuer: "Fictional county health department",
    kind: "license",
    valid_from: "2026-01-01",
    valid_to: "2026-12-31",
    asset_ids: [asset],
  });
  await rec("award", {
    name: "Fictional dining award",
    year: "2025",
    level: "Sample",
    subject: "Restaurant",
    issuer: "Fictional county health department",
    url: "https://example.com/award",
  });
  await rec("media", {
    name: "Fictional press feature",
    type: "Press",
    subject: "Restaurant",
    publisher: "Sample publication",
    date: "2026-10-01",
    url: "https://example.com/article",
    asset_ids: [asset],
  });
  await group("content", {
    media_note: known("All assets are fictional test materials"),
  });
  await rec("copy", {
    name: "Sample restaurant overview",
    type: "Overview",
    body: "Manually written fictional description",
    language: "en-US",
    based_on_version: p.profile_version,
  });
  const evidence = await rec("evidence", {
    name: "Sample phone confirmation",
    note: "Fictional verification notes for integration testing only",
    asset_ids: [asset],
  });
  const channel = await rec("channel", {
    platform: "Sample Google Business Profile",
    name: "Fictional listing page",
    type: "Map listing",
    url: "https://example.com/restaurant",
    link_status: "unchecked",
  });
  await group("channels", {
    channel_note: known(
      "Manually captured; links are not automatically fetched",
    ),
  });
  await rec("snapshot", {
    channel_id: channel,
    collected_at: "2026-10-18T09:00:00-05:00",
    url: "https://example.com/restaurant",
    raw_name: "Sample Juniper - Downtown Austin",
    raw_address: "Original sample former address",
    rating: 4.5,
    rating_scale: 5,
    review_count: 30,
  });
  await rec("snapshot", {
    channel_id: channel,
    collected_at: "2026-10-19T09:00:00-05:00",
    url: "https://example.com/restaurant",
    raw_address: "100 Example St (fictional)",
    rating: 4.6,
    rating_scale: 5,
    review_count: 32,
  });
  await group("relationship", {
    cooperation_status: known("serving"),
    goals: known("Fictional service goals"),
    internal_note: known("INTERNAL_SAMPLE_DO_NOT_EXPORT"),
  });
  await rec("person", {
    name: "Sample Taylor Morgan",
    relation: "General manager",
    contact: "NOT-A-REAL-CONTACT",
  });
  await rec("agreement", {
    name: "Sample service agreement",
    scope: "Profile organization",
    requirements: "For testing only",
    valid_from: "2026-10-01",
  });
  await rec("communication", {
    time: "2026-10-19T09:00:00-05:00",
    subject: "Fictional onboarding conversation",
    summary: "Agreed to complete the profile manually",
  });
  await rec("scene", {
    name: "Group dining for ten",
    judgment: "applicable",
    basis_keys: ["space.seats", "operations.weekly_hours"],
    basis_note: "Based on sample capacity and hours; reservations required",
    confirmed_at: "2026-10-19T09:00:00-05:00",
    conditions: "Advance reservation required",
  });
  p = unwrap(
    await service.verifyFacts({
      ...a(),
      targets: [
        "identity.display_name",
        "location.address",
        "operations.status",
        "operations.weekly_hours",
        "offering.primary_cuisines",
        "contact:" + contact,
      ],
      state: "verified",
      source_note: "Fictional phone verification, not a real restaurant fact",
      verified_at: "2026-10-19T09:00:00-05:00",
      evidence_ids: [evidence],
    }),
  );
  p = unwrap(
    await service.setPublication({
      ...a(),
      targets: [
        "identity.display_name",
        "identity.description",
        "location.address",
        "operations.status",
        "operations.weekly_hours",
        "offering.primary_cuisines",
        "commercial.average_spend",
        "commercial.currency",
        "contact:" + contact,
        "asset:" + asset,
        "menu:" + menu,
        "dish:" + dish,
        "dish_spec:" + spec,
        "room:" + room,
      ],
      publication_state: "public",
    }),
  );
  const second = unwrap(
    await service.createMerchant({
      ...merchantInput,
      display_name: "Sample Juniper - North Austin",
      address: "200 Example Ave (fictional)",
      brand_id: brand.brand_id,
    }),
  );
  unwrap(
    await service.setCollectionState({
      merchant_id: second.merchant_id,
      expected_profile_version: 1,
      record_type: "room",
      state: {
        value_state: "not_applicable",
        not_applicable_reason: "Sample restaurant has no private dining rooms",
      },
    }),
  );
  const third = unwrap(
    await service.createMerchant({
      ...merchantInput,
      display_name: "Sample Independent Bistro",
      address: "300 Example Ln (fictional)",
    }),
  );
  unwrap(
    await service.archiveMerchant({
      merchant_id: third.merchant_id,
      expected_profile_version: 1,
      archived: true,
    }),
  );
  return {
    primary: p,
    second: second.merchant_id,
    third: third.merchant_id,
    brand: brand.brand_id,
  };
}
