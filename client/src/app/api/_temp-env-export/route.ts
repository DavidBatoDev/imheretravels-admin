import { NextRequest, NextResponse } from "next/server";

// TEMPORARY route for migrating Sensitive env vars to a new Vercel account.
// Delete this file (and the EXPORT_SECRET env var) once the migration is done.

const KEYS = [
  "EMAIL_PROVIDER",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_PROJECT_ID",
  "GMAIL_APP_PASSWORD",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "GMAIL_SERVICE_ACCOUNT_EMAIL",
  "GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY",
  "GMAIL_USER",
  "NEXT_PUBLIC_ENV",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_WEBSITE_URL",
  "PEOPLE_ACCESS_TOKEN",
  "PEOPLE_CLIENT_ID",
  "PEOPLE_CLIENT_SECRET",
  "PEOPLE_REFRESH_TOKEN",
  "REVALIDATE_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

export async function GET(req: NextRequest) {
  const provided = req.headers.get("x-export-secret") ?? "";
  const expected = process.env.EXPORT_SECRET ?? "";

  if (!expected || provided !== expected) {
    return new NextResponse("Not found", { status: 404 });
  }

  const values = Object.fromEntries(KEYS.map((key) => [key, process.env[key] ?? null]));
  return NextResponse.json(values);
}
