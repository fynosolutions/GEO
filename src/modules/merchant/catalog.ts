import { US_STATES } from "./us-market";
export const GROUPS = {
  identity: "Identity & brand",
  location: "Location & directions",
  operations: "Hours & operating status",
  offering: "Menus, food & beverages",
  commercial: "Pricing, taxes & payments",
  space: "Seating & amenities",
  service: "Service & guest policies",
  credentials: "Licenses & recognition",
  content: "Content & media assets",
  channels: "Listings & channel snapshots",
  relationship: "Internal client records",
} as const;
export type GroupKey = keyof typeof GROUPS;
export type InputKind =
  | "text"
  | "textarea"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "url"
  | "tags"
  | "select"
  | "hours";
export interface FieldDefinition {
  key: string;
  label: string;
  kind: InputKind;
  required?: boolean;
  options?: string[];
  ref?: string;
  unit?: string;
  hint?: string;
  /** Historical units / regional fields are readable but hidden from new-entry forms. */
  legacy?: boolean;
}
const f = <
  K extends string,
  T extends InputKind = "text",
  E extends Partial<FieldDefinition> = {},
>(
  key: K,
  label: string,
  kind: T = "text" as T,
  extra: E = {} as E,
): FieldDefinition & { key: K; kind: T } & E =>
  ({ key, label, kind, ...extra }) as FieldDefinition & { key: K; kind: T } & E;
export const FACT_FIELDS = {
  identity: [
    f("display_name", "Restaurant name", "text", { required: true }),
    f("branch_name", "Location name"),
    f("description", "Restaurant description", "textarea"),
    f("opening_date", "Opening date (YYYY / YYYY-MM / YYYY-MM-DD)"),
  ],
  location: [
    f("country", "Country code", "text", { hint: "US for United States" }),
    f("state", "State / territory", "select", { options: US_STATES }),
    f("postal_code", "ZIP Code", "text", {
      hint: "5 digits or ZIP+4, for example 78701 or 78701-1234",
    }),
    f("county", "County / parish / borough"),
    f("province", "Legacy province / region", "text", { legacy: true }),
    f("city", "City"),
    f("district", "Legacy district", "text", { legacy: true }),
    f("region", "Market / region", "text", {
      required: true,
      hint: "City and state, for example Austin, TX",
    }),
    f("address", "Street address", "text", { required: true }),
    f("building", "Building name"),
    f("floor", "Floor"),
    f("unit", "Suite / unit"),
    f("districts", "Neighborhoods / districts", "tags"),
    f("longitude", "Longitude", "number"),
    f("latitude", "Latitude", "number"),
    f("coordinate_system", "Coordinate system", "select", {
      options: ["unknown", "WGS84", "GCJ02", "BD09"],
    }),
    f("coordinate_source", "Coordinate source"),
    f("entrance", "Entrance directions", "textarea"),
    f("transit", "Landmarks, transit & walking directions", "textarea"),
    f("parking_route", "Driving & parking directions", "textarea"),
  ],
  operations: [
    f("status", "Operating status", "select", {
      options: [
        "preparing",
        "open",
        "temporarily_closed",
        "permanently_closed",
      ],
    }),
    f("timezone", "Time zone", "text", {
      required: true,
      hint: "IANA time zone; select the restaurant's actual location. Daylight saving time follows this zone.",
    }),
    f("status_from", "Status effective date", "date"),
    f("expected_reopen", "Expected reopening date", "date"),
    f("status_note", "Status notes", "textarea"),
    f("weekly_hours", "Weekly hours", "hours"),
  ],
  offering: [
    f("primary_cuisines", "Primary cuisines", "tags", { required: true }),
    f("secondary_cuisines", "Additional cuisines", "tags"),
  ],
  commercial: [
    f("average_spend", "Spend per person: amount / minimum", "number", {
      unit: "person",
    }),
    f("average_spend_max", "Spend per person: maximum", "number", {
      unit: "person",
    }),
    f("currency", "Currency", "text", {
      hint: "USD for U.S. restaurant prices; amounts are decimal strings.",
    }),
    f("spend_basis", "Spend estimate basis & inclusions", "textarea"),
    f("sales_tax_included", "Menu prices include sales tax", "boolean"),
    f("sales_tax_note", "Sales tax policy", "textarea", {
      hint: "Record the restaurant's stated tax treatment. Do not assume a nationwide rate.",
    }),
    f("gratuity_policy", "Tipping & automatic gratuity", "textarea"),
    f("service_charge_policy", "Service charges & surcharges", "textarea", {
      hint: "Describe mandatory fees separately from optional tips, including when they apply.",
    }),
    f("receipt_available", "Itemized receipts available", "boolean"),
    f("receipt_note", "Receipt details"),
    f("payment_methods", "Payment methods", "tags"),
    f("invoice", "Legacy invoice availability", "boolean", { legacy: true }),
    f("invoice_note", "Legacy invoice notes", "text", { legacy: true }),
  ],
  space: [
    f("terrace", "Patio / terrace", "boolean"),
    f("view", "Views"),
    f("toilet", "Restroom", "boolean"),
    f("charging", "Device charging", "boolean"),
    f("air_conditioning", "Air conditioning", "boolean"),
    f("accessible_entry", "Step-free / accessible entrance", "boolean"),
    f("accessible_toilet", "Accessible restroom", "boolean"),
    f("elevator", "Elevator", "boolean"),
    f("child_seat", "High chairs", "boolean"),
    f("baby_care", "Baby-changing facilities", "boolean"),
    f("facility_conditions", "Amenity locations & conditions", "textarea"),
    f("parking_type", "Parking type"),
    f("parking_partner", "Partner parking facility"),
    f("seats", "Total seats", "integer"),
    f("area_sq_ft", "Floor area", "number", { unit: "sq ft" }),
    f("area", "Legacy floor area", "number", { unit: "sq m", legacy: true }),
    f("areas", "Floors & dining areas", "textarea"),
    f("style", "Decor / style", "tags"),
    f("noise", "Noise level & atmosphere"),
    f("smoking", "Smoking policy"),
    f("outdoor", "Outdoor seating", "boolean"),
    f("parking", "Parking available", "boolean"),
    f("parking_capacity", "Parking spaces", "integer"),
    f("wifi", "Wi-Fi available", "boolean"),
    f("accessible", "Accessibility features", "boolean"),
    f("children", "Family amenities", "textarea"),
    f("facilities", "Other amenities", "tags"),
  ],
  service: [
    f("dine_in", "Dine-in available", "boolean"),
    f("takeaway_supported", "Takeout / pickup available", "boolean"),
    f("delivery_supported", "Delivery available", "boolean"),
    f("delivery_range", "Delivery service area"),
    f("delivery_distance_miles", "Delivery radius", "number", { unit: "mi" }),
    f("delivery_distance", "Legacy delivery radius", "number", {
      unit: "km",
      legacy: true,
    }),
    f("curbside_pickup", "Curbside pickup available", "boolean"),
    f("catering", "Catering available", "boolean"),
    f("drive_through", "Drive-through available", "boolean"),
    f("alcohol_service", "Alcohol service", "textarea", {
      hint: "Beer, wine, full bar or no alcohol; record any stated restrictions.",
    }),
    f("service_animal_policy", "Service animal policy", "textarea", {
      hint: "Keep separate from the pet policy; record confirmed details without assuming legal compliance.",
    }),
    f("delivery_conditions", "Delivery hours & minimum order", "textarea"),
    f("reservation_required", "Reservations required", "boolean"),
    f("reservation_lead", "Reservation lead time", "integer", {
      unit: "minutes",
    }),
    f("reservation_hold", "Reservation grace period", "integer", {
      unit: "minutes",
    }),
    f("reservation_channel", "Reservation listing", "text", { ref: "channel" }),
    f("queue_rules", "Waitlist & walk-in policy", "textarea"),
    f("queue_observed_at", "Wait-time observation timestamp", "datetime"),
    f("min_guests", "Minimum party size", "integer"),
    f("max_guests", "Maximum party size", "integer"),
    f("dining_limit", "Dining time limit", "integer", { unit: "minutes" }),
    f("events", "Buyouts, catering & private events", "textarea"),
    f("children_supported", "Children welcome", "boolean"),
    f("pets_supported", "Pets allowed", "boolean"),
    f("bring_items", "BYOB, corkage & outside cake policy", "textarea"),
    f(
      "dietary_service",
      "Dietary requests & allergy communication",
      "textarea",
    ),
    f("dining_modes", "Dining options", "tags"),
    f("delivery", "Delivery notes", "textarea"),
    f("pickup", "Pickup instructions", "textarea"),
    f("reservation", "Reservations accepted", "boolean"),
    f("reservation_contact", "Reservation contact", "text", { ref: "contact" }),
    f("reservation_rules", "Reservation policy", "textarea"),
    f(
      "cancellation",
      "Cancellation, no-show & late-arrival policy",
      "textarea",
    ),
    f("group_rules", "Large-party policy", "textarea"),
    f("children_rules", "Children policy", "textarea"),
    f("pet_rules", "Pet policy", "textarea"),
    f("language", "Service languages", "tags"),
    f("restrictions", "Guest restrictions", "textarea"),
  ],
  credentials: [
    f("legal_relation", "Operator relationship to restaurant"),
    f("legal_identifier", "Business identifier (internal by default)"),
    f("legal_name", "Legal business name"),
    f("business_scope", "Business activities"),
    f("health_inspection_url", "Public health inspection URL", "url"),
    f("health_inspection_note", "Health inspection details", "textarea"),
    f("chef_intro", "Chef & team biography", "textarea"),
  ],
  content: [f("media_note", "Media organization notes", "textarea")],
  channels: [f("channel_note", "Listing maintenance notes", "textarea")],
  relationship: [
    f("cooperation_status", "Client engagement status", "select", {
      options: [
        "unknown",
        "pending",
        "communicating",
        "serving",
        "paused",
        "ended",
      ],
    }),
    f("goals", "Client goals & requirements", "textarea"),
    f("internal_note", "Internal notes & open questions", "textarea"),
  ],
} satisfies Record<GroupKey, FieldDefinition[]>;
export interface RecordDefinition {
  group: GroupKey | "scene_tags";
  label: string;
  fields: FieldDefinition[];
  immutable?: boolean;
}
const named = [f("name", "Name", "text", { required: true })];
const validity = [
  f("valid_from", "Valid from", "date"),
  f("valid_to", "Valid through", "date"),
];
const obj = [
  f("object_type", "Related object type", "select", {
    required: true,
    options: ["dish_spec", "package", "room", "service_rule"],
  }),
  f("object_id", "Related object", "text", {
    required: true,
    ref: "$object_type",
  }),
];
export const RECORD_TYPES = {
  alias: {
    group: "identity",
    label: "Alternate & original-language names",
    fields: [...named, f("language", "Language"), f("name_type", "Name type")],
  },
  former_name: {
    group: "identity",
    label: "Former names",
    fields: [...named, ...validity],
  },
  contact: {
    group: "identity",
    label: "Public contacts",
    fields: [
      f("type", "Type", "text", {
        required: true,
        hint: "phone, email, sms or website",
      }),
      f("value", "Phone, email or account", "text", {
        required: true,
        hint: "U.S. phone: +1 (512) 555-0100; record extensions separately.",
      }),
      f("country_prefix", "Calling code"),
      f("extension", "Extension"),
      f("purpose", "Purpose"),
      f("primary", "Primary contact", "boolean"),
    ],
  },
  date_exception: {
    group: "operations",
    label: "Holiday & special hours",
    fields: [
      f("start_date", "Start date", "date", { required: true }),
      f("end_date", "End date", "date", { required: true }),
      f("mode", "Schedule", "select", {
        required: true,
        options: ["closed", "all_day", "periods"],
      }),
      f("periods", "Replacement hours", "text", {
        hint: "09:00-14:00,17:00-02:00+1",
      }),
      f("reason", "Reason"),
    ],
  },
  menu: {
    group: "offering",
    label: "Menus",
    fields: [
      ...named,
      f("type", "Type"),
      f("language", "Language"),
      f("period", "Meal period"),
      ...validity,
      f("asset_ids", "Menu assets", "tags", { ref: "asset" }),
    ],
  },
  menu_category: {
    group: "offering",
    label: "Menu sections",
    fields: [
      ...named,
      f("menu_id", "Menu", "text", { ref: "menu" }),
      f("sort", "Sort order", "integer"),
    ],
  },
  dish: {
    group: "offering",
    label: "Food & beverages",
    fields: [
      ...named,
      f("aliases", "Alternate / original-language names", "tags"),
      f("category", "Category", "text", { ref: "menu_category" }),
      f("menu_ids", "Menus", "tags", { ref: "menu" }),
      f("description", "Description", "textarea"),
      f("ingredients", "Ingredients", "tags"),
      f("method", "Preparation method"),
      f("taste", "Flavor & heat level"),
      f("signature", "Signature item", "boolean"),
      f("story", "Story / provenance", "textarea"),
      f("diet", "Dietary information", "textarea"),
      f("allergens", "Known allergens & cross-contact notes", "textarea", {
        hint: "Milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soy and sesame. Record cross-contact separately; unknown does not mean allergen-free.",
      }),
      f("supply", "Availability", "select", {
        options: ["available", "seasonal", "paused", "discontinued"],
      }),
      f("period", "Available meal periods"),
      ...validity,
    ],
  },
  dish_spec: {
    group: "offering",
    label: "Item sizes / variants",
    fields: [
      f("dish_id", "Menu item", "text", { required: true, ref: "dish" }),
      ...named,
      f("quantity", "Portion quantity", "number"),
      f("unit", "Portion unit"),
      f("people", "Recommended guests", "integer"),
    ],
  },
  package: {
    group: "offering",
    label: "Combos & prix fixe menus",
    fields: [
      ...named,
      f("dish_ids", "Menu item", "tags", { ref: "dish" }),
      f("contents", "Items, portions & substitutions", "textarea", {
        required: true,
      }),
      f("people", "Guests served", "integer"),
      f("supply", "Availability", "select", {
        options: ["available", "seasonal", "paused", "discontinued"],
      }),
      ...validity,
    ],
  },
  price: {
    group: "commercial",
    label: "Menu prices",
    fields: [
      ...obj,
      f("amount", "Amount / minimum", "number", { required: true }),
      f("amount_max", "Maximum", "number"),
      f("currency", "Currency", "text", { required: true }),
      f("unit", "Pricing unit", "text", { required: true }),
      f("conditions", "Meal period, party size & conditions"),
      ...validity,
    ],
  },
  fee: {
    group: "commercial",
    label: "Surcharges & fees",
    fields: [
      ...named,
      f("amount", "Amount", "number"),
      f("currency", "Currency"),
      f("unit", "Pricing unit"),
      f("rule", "Calculation & charging rules", "textarea", { required: true }),
      ...validity,
    ],
  },
  minimum: {
    group: "commercial",
    label: "Minimum spend",
    fields: [
      ...obj,
      f("amount", "Amount", "number", { required: true }),
      f("currency", "Currency", "text", { required: true }),
      f("unit", "Pricing unit", "text", { required: true }),
      f("conditions", "Inclusions, meal period & credit rules", "textarea"),
      ...validity,
    ],
  },
  deposit: {
    group: "commercial",
    label: "Deposits & prepayments",
    fields: [
      ...named,
      f("amount", "Amount", "number"),
      f("ratio", "Percentage (0–100)", "number"),
      f("currency", "Currency"),
      f("unit", "Unit"),
      f("rule", "Credit, refund & cancellation terms", "textarea", {
        required: true,
      }),
    ],
  },
  promotion: {
    group: "commercial",
    label: "Promotions & happy hour",
    fields: [
      ...named,
      f("method", "Offer type", "text", { required: true }),
      f("conditions", "Eligibility, minimums & combination rules", "textarea"),
      ...validity,
    ],
  },
  table: {
    group: "space",
    label: "Table configurations",
    fields: [
      ...named,
      f("seats", "Seats per table", "integer", { required: true }),
      f("count", "Number of tables", "integer"),
      f("joinable", "Tables can be joined", "boolean"),
      f("join_limit", "Maximum combined party size", "integer"),
    ],
  },
  room: {
    group: "space",
    label: "Private dining rooms",
    fields: [
      ...named,
      f("count", "Count", "integer"),
      f("recommended", "Recommended guests", "integer"),
      f("capacity", "Maximum capacity", "integer", { required: true }),
      f("facilities", "Amenities", "tags"),
      f("privacy", "Privacy / enclosure"),
    ],
  },
  service_rule: {
    group: "service",
    label: "Service policies",
    fields: [
      ...named,
      f("type", "Service type"),
      f("description", "Policy details", "textarea", { required: true }),
      f("contact_id", "Public contact", "text", { ref: "contact" }),
      f("fee_ids", "Related fees", "tags", { ref: "fee" }),
      ...validity,
    ],
  },
  credential: {
    group: "credentials",
    label: "Permits & certifications",
    fields: [
      ...named,
      f("number", "Identifier"),
      f("issuer", "Issuing authority"),
      f("kind", "Credential type", "select", {
        options: ["license", "certification"],
      }),
      f("scope", "Scope / applicable locations"),
      ...validity,
      f("asset_ids", "Supporting assets", "tags", { ref: "asset" }),
    ],
  },
  award: {
    group: "credentials",
    label: "Awards & recognition",
    fields: [
      ...named,
      f("issuer", "Awarding organization / list"),
      f("date", "Date", "date"),
      f("scope", "Scope"),
      f("year", "Award year"),
      f("level", "Level / distinction"),
      f("subject", "Recipient (brand, location, chef or item)"),
      f("url", "Source URL", "url"),
      f("asset_ids", "Supporting assets", "tags", { ref: "asset" }),
    ],
  },
  media: {
    group: "credentials",
    label: "Press & chef credentials",
    fields: [
      ...named,
      f("type", "Type"),
      f("subject", "Subject / chef name"),
      f("role", "Chef role"),
      f("experience", "Experience & supporting details", "textarea"),
      f("appointment_from", "Appointment start date", "date"),
      f("appointment_to", "Appointment end date", "date"),
      f("asset_ids", "Press / credential assets", "tags", { ref: "asset" }),
      f("publisher", "Publisher"),
      f("date", "Date", "date"),
      f("url", "Source URL", "url"),
      f("description", "Summary", "textarea"),
    ],
  },
  asset: {
    group: "content",
    label: "Media assets",
    fields: [
      ...named,
      f("category", "Category / purpose", "text", { required: true }),
      f("language", "Language"),
      f("made_at", "Capture / creation date", "date"),
      f("description", "Notes", "textarea"),
      f("sort", "Sort order", "integer"),
      f("cover", "Cover image", "boolean"),
      f("authorization", "Usage rights / permission"),
      f("allowed_channels", "Allowed channels", "tags"),
      f("object_type", "Related object type"),
      f("object_ids", "Related object", "tags", { ref: "$object_type" }),
      f("usage", "Usage status", "select", {
        options: ["active", "historical", "disabled"],
      }),
      ...validity,
    ],
  },
  copy: {
    group: "content",
    label: "Publication copy",
    fields: [
      ...named,
      f("type", "Copy type", "text", { required: true }),
      f("body", "Body", "textarea", { required: true }),
      f("language", "Language"),
      f("channels", "Allowed channels", "tags"),
      f("based_on_version", "Based on profile version", "integer", {
        required: true,
      }),
      ...validity,
    ],
  },
  evidence: {
    group: "content",
    label: "Verification evidence",
    fields: [
      ...named,
      f("note", "Verification notes", "textarea", { required: true }),
      f("url", "Source URL", "url"),
      f("asset_ids", "Attached assets", "tags", { ref: "asset" }),
    ],
  },
  channel: {
    group: "channels",
    label: "Listings",
    fields: [
      f("platform", "Platform", "text", {
        required: true,
        hint: "Examples: Google Business Profile, Apple Maps, Yelp, Tripadvisor, OpenTable, Resy, DoorDash, Uber Eats, Grubhub or the official website.",
      }),
      f("type", "Listing type"),
      ...named,
      f("url", "Page URL", "url", { required: true }),
      f("platform_id", "Platform location / account ID"),
      f("maintainable", "Editable by operator", "boolean"),
      f("claimed", "Claimed", "boolean"),
      f("maintenance", "Management instructions"),
      f("link_status", "Link status", "select", {
        options: [
          "unchecked",
          "accessible",
          "redirected",
          "broken",
          "restricted",
        ],
      }),
      f("checked_at", "Checked at", "datetime"),
    ],
  },
  snapshot: {
    group: "channels",
    label: "Channel snapshots",
    immutable: true,
    fields: [
      f("channel_id", "Listing", "text", {
        required: true,
        ref: "channel",
      }),
      f("collected_at", "Collected at", "datetime", { required: true }),
      f("url", "Captured URL", "url", { required: true }),
      f("raw_name", "Original name"),
      f("raw_address", "Original address"),
      f("raw_phone", "Original phone"),
      f("raw_hours", "Original hours"),
      f("raw_cuisines", "Original cuisines"),
      f("raw_price", "Original pricing"),
      f("raw_facilities", "Original amenities / services", "textarea"),
      f("raw_other", "Other original content", "textarea"),
      f("absent_fields", "Fields confirmed absent from page", "tags"),
      f("rating", "Rating", "number"),
      f("rating_scale", "Rating scale maximum", "number"),
      f("review_count", "Review count", "integer"),
      f("platform_tags", "Platform tags / lists", "tags"),
      f("corrects_id", "Snapshot being corrected", "text", { ref: "snapshot" }),
    ],
  },
  person: {
    group: "relationship",
    label: "Client contacts",
    fields: [
      ...named,
      f("relation", "Restaurant relationship"),
      f("contact", "Contact details", "text", { required: true }),
      f("primary", "Primary client contact", "boolean"),
    ],
  },
  agreement: {
    group: "relationship",
    label: "Service agreements",
    fields: [
      ...named,
      f("scope", "Service scope", "textarea", { required: true }),
      f("requirements", "Deliverable requirements", "textarea"),
      ...validity,
      f("asset_ids", "Agreement assets", "tags", { ref: "asset" }),
    ],
  },
  communication: {
    group: "relationship",
    label: "Communication log",
    fields: [
      f("time", "Communication timestamp", "datetime", { required: true }),
      f("subject", "Subject", "text", { required: true }),
      f("summary", "Summary", "textarea", { required: true }),
      f("asset_ids", "Related assets", "tags", { ref: "asset" }),
    ],
  },
  scene: {
    group: "scene_tags",
    label: "Dining occasions",
    fields: [
      ...named,
      f("judgment", "Assessment", "select", {
        required: true,
        options: ["applicable", "not_applicable", "pending"],
      }),
      f("conditions", "Conditions", "textarea"),
      f("basis_keys", "Supporting fact keys", "tags", { required: true }),
      f("basis_note", "Supporting explanation", "textarea", { required: true }),
      f("confirmed_at", "Confirmed at", "datetime"),
    ],
  },
} satisfies Record<string, RecordDefinition>;
export type RecordType = keyof typeof RECORD_TYPES;
export const COLLECTION_FIELDS = {
  "identity.aliases": "alias",
  "identity.former_names": "former_name",
  "identity.public_contacts": "contact",
  "operations.date_exceptions": "date_exception",
  "space.private_rooms": "room",
} as const;
export const VIRTUAL_FACT_LABELS: Record<string, string> = {
  "identity.aliases": "Alternate names",
  "identity.former_names": "Former names",
  "identity.public_contacts": "Public contacts",
  "operations.date_exceptions": "Holiday & special hours",
  "space.private_rooms": "Private dining details",
  "location.coordinates": "Geographic coordinates",
};
export const RECORD_NAMES = Object.keys(RECORD_TYPES) as RecordType[];
export const recordDefinition = (type: RecordType): RecordDefinition =>
  RECORD_TYPES[type];
export const LABELS: Record<string, string> = {
  room: "Private dining rooms",
  dish_spec: "Item sizes / variants",
  package: "Combos & prix fixe menus",
  service_rule: "Service policy",
  license: "Business permit",
  certification: "Certification",
  known: "Known",
  unknown: "Unknown",
  not_applicable: "Not applicable",
  unverified: "Unverified",
  verified: "Verified",
  disputed: "Disputed",
  pending: "Pending review",
  public: "Public",
  internal: "Internal only",
  preparing: "Opening soon",
  open: "Open",
  temporarily_closed: "Temporarily closed",
  permanently_closed: "Permanently closed",
  closed: "Closed",
  all_day: "Open 24 hours",
  periods: "Set hours",
  available: "Available",
  seasonal: "Seasonal",
  paused: "Paused",
  discontinued: "Discontinued",
  active: "Active",
  historical: "Historical versions",
  disabled: "Disabled",
  applicable: "Applicable",
  not_applicable_scene: "Not applicable",
  communicating: "In discussion",
  serving: "Active client",
  ended: "Ended",
  unchecked: "Not checked",
  accessible: "Accessible",
  redirected: "Redirected",
  broken: "Broken",
  restricted: "Restricted",
};
