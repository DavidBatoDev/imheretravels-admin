/** DEV: pull the sent reminder from Gmail and inspect its pay button. */
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local") });

async function main() {
  const messageId = process.argv[2];
  const { google } = await import("googleapis");

  const oAuth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  );
  oAuth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = res.data.payload?.headers || [];
  const h = (n: string) =>
    headers.find((x) => x.name?.toLowerCase() === n.toLowerCase())?.value || "";
  console.log("Subject:", h("Subject"));
  console.log("To     :", h("To"));
  console.log("From   :", h("From"));

  function collect(part: any, acc: string[]): string[] {
    if (part.body?.data && part.mimeType === "text/html") {
      acc.push(Buffer.from(part.body.data, "base64").toString("utf8"));
    }
    (part.parts || []).forEach((p: any) => collect(p, acc));
    return acc;
  }
  const htmls = collect(res.data.payload, []);
  const html = htmls.join("\n");
  console.log("\nhtml length:", html.length);

  const stripeLinks = html.match(/https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+/g) || [];
  const statusLinks =
    html.match(/https?:\/\/[^"'\s]*\/booking-status\/[A-Za-z0-9_-]+/g) || [];

  console.log("\n=== LINK AUDIT ===");
  console.log("  buy.stripe.com links :", stripeLinks.length, stripeLinks);
  console.log("  booking-status links :", statusLinks.length);
  [...new Set(statusLinks)].forEach((l) => console.log("     ", l));
  console.log(
    "  double slash in path :",
    statusLinks.some((l) => l.replace(/^https?:\/\//, "").includes("//")),
  );

  const i = html.indexOf("Pay securely online");
  if (i > -1) {
    console.log("\n=== PAY BUTTON CONTEXT ===");
    console.log(html.slice(Math.max(0, i - 500), i + 60).replace(/\s+/g, " "));
  } else {
    console.log("\n(no 'Pay securely online' text found)");
  }
}

main().then(() => process.exit(0));
