/**
 * Turn a free-text reviewer location (e.g. "Cagayan, Philippines", "London,
 * United Kingdom", "USA") into a flag emoji, so review cards can show the
 * traveler's nationality. Best-effort: we read the country (the last
 * comma-separated segment, or the whole string) and look it up in a name→ISO
 * table. Returns null when we can't confidently resolve a country.
 *
 * TourRadar reviews carry their own `countryEmoji` from the source, so prefer
 * that when present and fall back to this deriver for user/admin reviews.
 */

// Common country / alias → ISO 3166-1 alpha-2. Extend as needed.
const NAME_TO_ISO: Record<string, string> = {
  "afghanistan": "AF",
  "argentina": "AR",
  "australia": "AU",
  "austria": "AT",
  "bangladesh": "BD",
  "belgium": "BE",
  "bhutan": "BT",
  "bolivia": "BO",
  "brazil": "BR",
  "brunei": "BN",
  "cambodia": "KH",
  "canada": "CA",
  "chile": "CL",
  "china": "CN",
  "colombia": "CO",
  "costa rica": "CR",
  "croatia": "HR",
  "czech republic": "CZ",
  "czechia": "CZ",
  "denmark": "DK",
  "ecuador": "EC",
  "egypt": "EG",
  "england": "GB",
  "estonia": "EE",
  "finland": "FI",
  "france": "FR",
  "germany": "DE",
  "greece": "GR",
  "hong kong": "HK",
  "hungary": "HU",
  "iceland": "IS",
  "india": "IN",
  "indonesia": "ID",
  "iran": "IR",
  "ireland": "IE",
  "israel": "IL",
  "italy": "IT",
  "japan": "JP",
  "jordan": "JO",
  "kenya": "KE",
  "korea": "KR",
  "south korea": "KR",
  "kuwait": "KW",
  "laos": "LA",
  "latvia": "LV",
  "lithuania": "LT",
  "luxembourg": "LU",
  "malaysia": "MY",
  "maldives": "MV",
  "malta": "MT",
  "mexico": "MX",
  "morocco": "MA",
  "myanmar": "MM",
  "nepal": "NP",
  "netherlands": "NL",
  "holland": "NL",
  "new zealand": "NZ",
  "nigeria": "NG",
  "norway": "NO",
  "pakistan": "PK",
  "peru": "PE",
  "philippines": "PH",
  "poland": "PL",
  "portugal": "PT",
  "qatar": "QA",
  "romania": "RO",
  "russia": "RU",
  "saudi arabia": "SA",
  "scotland": "GB",
  "singapore": "SG",
  "slovakia": "SK",
  "slovenia": "SI",
  "south africa": "ZA",
  "spain": "ES",
  "sri lanka": "LK",
  "sweden": "SE",
  "switzerland": "CH",
  "taiwan": "TW",
  "tanzania": "TZ",
  "thailand": "TH",
  "turkey": "TR",
  "türkiye": "TR",
  "uae": "AE",
  "united arab emirates": "AE",
  "uk": "GB",
  "u.k.": "GB",
  "united kingdom": "GB",
  "great britain": "GB",
  "britain": "GB",
  "usa": "US",
  "u.s.a.": "US",
  "u.s.": "US",
  "us": "US",
  "united states": "US",
  "united states of america": "US",
  "america": "US",
  "ukraine": "UA",
  "uruguay": "UY",
  "vietnam": "VN",
  "wales": "GB",
};

/**
 * Best-effort ISO 3166-1 alpha-2 code for a free-text location, or null.
 * Returns e.g. "PH" for "Cagayan, Philippines" — feed it to <ReactCountryFlag>
 * for a real SVG flag (emoji flags don't render on Windows).
 */
export function isoForLocation(location?: string): string | null {
  if (!location) return null;
  const parts = location.split(",");
  // Try the last segment first (usually the country), then the whole string.
  const candidates = [parts[parts.length - 1], location];
  for (const raw of candidates) {
    const key = raw.trim().toLowerCase().replace(/\.$/, "");
    const iso = NAME_TO_ISO[key];
    if (iso) return iso;
  }
  return null;
}

/** Convert a regional-indicator flag emoji (🇵🇭, e.g. TourRadar's) back to "PH". */
export function isoFromFlagEmoji(emoji?: string): string | null {
  if (!emoji) return null;
  const cps = [...emoji]
    .map((c) => c.codePointAt(0) ?? 0)
    .filter((cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff);
  if (cps.length < 2) return null;
  return cps
    .slice(0, 2)
    .map((cp) => String.fromCharCode(cp - 0x1f1e6 + 65))
    .join("");
}
