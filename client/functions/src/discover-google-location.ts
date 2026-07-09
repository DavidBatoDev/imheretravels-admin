/**
 * Discover your Google Business Profile ACCOUNT and LOCATION ids so you can fill
 * GBP_ACCOUNT_ID / GBP_LOCATION_ID for the reviews sync
 * (see scheduled-sync-google-reviews.ts + GOOGLE_REVIEWS_SETUP.md).
 *
 * Run:  npm run discover:gbp     (from admin/client/functions)
 *
 * Needs GBP_CLIENT_ID / GBP_CLIENT_SECRET / GBP_REFRESH_TOKEN in functions/.env
 * (business.manage scope). It only calls Google — it writes nothing.
 *
 * Uses the v1 Business Profile APIs (which ARE listed in the Cloud API Library and
 * can be enabled without the reviews allowlisting), so you can grab your ids before
 * the legacy My Business API v4 (reviews) access request is approved:
 *   Accounts:  GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts
 *   Locations: GET https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations?readMask=name,title
 * Enable "My Business Account Management API" + "My Business Business Information API".
 * The account/location ids returned here are the SAME ids the v4 reviews endpoint uses.
 */
import * as dotenv from "dotenv";
import { resolve } from "node:path";
// Load functions/.env.local first (git-ignored, what the Firebase shell also uses),
// then functions/.env as a fallback. First value wins (no override).
dotenv.config({ path: resolve(__dirname, "../.env.local") });
dotenv.config({ path: resolve(__dirname, "../.env") });

import { google } from "googleapis";

const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const V4 = "https://mybusiness.googleapis.com/v4"; // for the sample reviews URL only

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GBP_CLIENT_ID;
  const clientSecret = process.env.GBP_CLIENT_SECRET;
  const refreshToken = process.env.GBP_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing GBP_CLIENT_ID / GBP_CLIENT_SECRET / GBP_REFRESH_TOKEN in functions/.env",
    );
  }
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "urn:ietf:wg:oauth:2.0:oob",
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  const { token } = await oauth2.getAccessToken();
  if (!token) throw new Error("Could not mint an access token — is the refresh token valid?");
  return token;
}

/** GET helper that surfaces the 403 (API not enabled / no access) case clearly. */
async function apiGet(url: string, token: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const hint =
      res.status === 403
        ? "\n  → 403: enable the API for this project (My Business Account Management API / " +
          "My Business Business Information API) and confirm this Google account has access."
        : res.status === 429
          ? "\n  → 429: the project's Business Profile API quota is 0/exhausted — request " +
            "quota via the Business Profile API access form (project number 283391684985). " +
            "See GOOGLE_REVIEWS_SETUP.md."
          : "";
    throw new Error(`GET ${url}\n  ${res.status} ${res.statusText} ${body.slice(0, 500)}${hint}`);
  }
  return res.json();
}

/** Trailing id segment of a resource name, e.g. "accounts/123" → "123". */
const idOf = (name = "") => name.split("/").pop() ?? "";

async function main() {
  const token = await getAccessToken();

  console.log("Fetching Google Business Profile accounts…\n");
  const accounts: any[] = (await apiGet(`${ACCOUNTS_API}/accounts`, token)).accounts ?? [];
  if (accounts.length === 0) {
    console.log("No accounts returned for this token.");
    return;
  }

  let firstPair: { accountId: string; locationId: string } | null = null;

  for (const acct of accounts) {
    const accountId = idOf(acct.name); // acct.name = "accounts/{id}"
    console.log(`ACCOUNT  ${acct.accountName ?? "(unnamed)"}  ·  accountId=${accountId}`);

    let locations: any[] = [];
    try {
      const url = `${INFO_API}/accounts/${accountId}/locations?readMask=name,title&pageSize=100`;
      locations = (await apiGet(url, token)).locations ?? [];
    } catch (e) {
      console.log(`  ! could not list locations: ${(e as Error).message}\n`);
      continue;
    }
    if (locations.length === 0) {
      console.log("  (no locations)\n");
      continue;
    }
    for (const loc of locations) {
      const locationId = idOf(loc.name); // loc.name = "locations/{id}"
      const label = loc.title ?? loc.name;
      console.log(`  LOCATION  ${label}  ·  locationId=${locationId}`);
      console.log(`    reviews: ${V4}/accounts/${accountId}/locations/${locationId}/reviews`);
      if (!firstPair) firstPair = { accountId, locationId };
    }
    console.log("");
  }

  if (firstPair) {
    console.log("Paste into functions/.env (adjust if you have multiple locations):\n");
    console.log(`GBP_ACCOUNT_ID=${firstPair.accountId}`);
    console.log(`GBP_LOCATION_ID=${firstPair.locationId}`);
  }
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((e) => {
    console.error("\n" + (e instanceof Error ? e.message : e));
    process.exitCode = 1;
  });
