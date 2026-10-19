/** U.S. market conventions. Values remain English; source evidence is preserved verbatim. */
export const MARKET = {
  country: "US",
  language: "en-US",
  currency: "USD",
  coordinate_system: "WGS84",
} as const;
export const US_STATES = (
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN " +
  "MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA " +
  "WV WI WY AS GU MP PR VI"
).split(" ");
export const US_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Adak",
  "Pacific/Honolulu",
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Indiana/Knox",
  "America/Indiana/Marengo",
  "America/Indiana/Petersburg",
  "America/Indiana/Tell_City",
  "America/Indiana/Vevay",
  "America/Indiana/Vincennes",
  "America/Indiana/Winamac",
  "America/Kentucky/Louisville",
  "America/Kentucky/Monticello",
  "America/Menominee",
  "America/North_Dakota/Beulah",
  "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem",
  "America/Juneau",
  "America/Metlakatla",
  "America/Nome",
  "America/Sitka",
  "America/Yakutat",
  "America/Puerto_Rico",
  "America/St_Thomas",
  "Pacific/Guam",
  "Pacific/Saipan",
  "Pacific/Pago_Pago",
] as const;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Character check only, not language detection or machine translation. Accented Latin names are allowed. */
export function hasNonLatinLetters(value: unknown): boolean {
  if (typeof value === "string")
    return [...value].some(
      (c) => /\p{L}/u.test(c) && !/\p{Script=Latin}/u.test(c),
    );
  if (Array.isArray(value)) return value.some(hasNonLatinLetters);
  if (value && typeof value === "object")
    return Object.values(value).some(hasNonLatinLetters);
  return false;
}
export function isOriginalSourceField(type: string, key: string) {
  return (
    ((type === "alias" || type === "former_name") && key === "name") ||
    (type === "dish" && key === "aliases") ||
    (type === "snapshot" && (key.startsWith("raw_") || key === "platform_tags"))
  );
}
