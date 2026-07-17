/**
 * Read-only: list all charge attempts + card details for a PaymentIntent.
 * Loads STRIPE_SECRET_KEY from .env.local (never printed). Prints only
 * non-sensitive fields (Stripe never returns full PAN — last4 only).
 * Usage: node scripts/stripe-attempts.js pi_XXXX
 */
require("dotenv").config({ path: ".env.local" });

// Prefer a dedicated live/restricted key so the existing test key stays intact.
const sk =
  process.env.STRIPE_LIVE_KEY ||
  process.env.STRIPE_SECRET_KEY_LIVE ||
  process.env.STRIPE_SECRET_KEY;
const pi = process.argv[2];
if (!sk) { console.error("No Stripe key found (STRIPE_LIVE_KEY / STRIPE_SECRET_KEY) in .env.local"); process.exit(1); }
if (!pi) { console.error("Usage: node scripts/stripe-attempts.js <payment_intent_id>"); process.exit(1); }

const mode = /_live_/.test(sk) ? "LIVE" : /_test_/.test(sk) ? "TEST" : "UNKNOWN";
const auth = "Basic " + Buffer.from(sk + ":").toString("base64");
const iso = (u) => (u ? new Date(u * 1000).toISOString() : "");

async function api(pathAndQuery) {
  const res = await fetch("https://api.stripe.com/v1/" + pathAndQuery, {
    headers: { Authorization: auth },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${json.error ? json.error.message : JSON.stringify(json)}`);
  return json;
}

(async () => {
  console.log(`Stripe key mode: ${mode}`);
  console.log(`PaymentIntent : ${pi}\n`);

  let intent;
  try {
    intent = await api(`payment_intents/${pi}`);
  } catch (e) {
    console.error("PaymentIntent retrieve FAILED: " + e.message);
    console.error(
      mode === "TEST"
        ? "\n>> The local key is TEST mode. If this is a live payment, a LIVE key is required (dashboard or prod env)."
        : ""
    );
    process.exit(2);
  }

  console.log("=== PaymentIntent summary ===");
  console.log(`status=${intent.status}  amount=${(intent.amount / 100).toFixed(2)} ${String(intent.currency).toUpperCase()}  livemode=${intent.livemode}`);
  console.log(`created=${iso(intent.created)}  customer=${intent.customer || "-"}  latest_charge=${intent.latest_charge || "-"}`);

  // All charges on this intent (each confirm attempt => a charge, incl. failures)
  const charges = await api(`charges?payment_intent=${pi}&limit=100`);
  const list = (charges.data || []).sort((a, b) => a.created - b.created);
  console.log(`\n=== Charge attempts (${list.length}) ===`);
  list.forEach((c, i) => {
    const card = (c.payment_method_details && c.payment_method_details.card) || {};
    const bd = c.billing_details || {};
    const oc = c.outcome || {};
    console.log(`\n[Attempt ${i + 1}] ${c.id}`);
    console.log(`  created        : ${iso(c.created)}`);
    console.log(`  status         : ${c.status}${c.paid ? " (paid)" : ""}${c.refunded ? " REFUNDED" : ""}`);
    console.log(`  amount         : ${(c.amount / 100).toFixed(2)} ${String(c.currency).toUpperCase()}`);
    if (c.failure_code || c.failure_message)
      console.log(`  failure        : ${c.failure_code || ""} — ${c.failure_message || ""}`);
    if (oc.seller_message || oc.network_status || oc.risk_level)
      console.log(`  outcome        : ${oc.seller_message || ""} | network=${oc.network_status || ""} | risk=${oc.risk_level || ""}${oc.risk_score != null ? "(" + oc.risk_score + ")" : ""}`);
    console.log(`  card           : ${card.brand || "?"} ****${card.last4 || "????"}  exp ${card.exp_month || "?"}/${card.exp_year || "?"}  ${card.funding || ""} ${card.country || ""}`);
    if (card.fingerprint) console.log(`  card fingerprint: ${card.fingerprint}`);
    if (card.wallet && card.wallet.type) console.log(`  wallet         : ${card.wallet.type}`);
    console.log(`  billing name   : ${bd.name || "-"}`);
    console.log(`  billing email  : ${bd.email || "-"}`);
    console.log(`  billing country: ${(bd.address && bd.address.country) || "-"}`);
  });

  // Distinct cards used. Prefer fingerprint; fall back to brand+last4+exp
  // (restricted keys may omit `fingerprint`).
  const cardKey = (c) => {
    const k = (c.payment_method_details && c.payment_method_details.card) || {};
    return k.fingerprint || `${k.brand}-${k.last4}-${k.exp_month}/${k.exp_year}`;
  };
  const distinct = [...new Set(list.map(cardKey))];
  console.log(`\n=== Distinct cards used: ${distinct.length} ===`);
  distinct.forEach((d) => console.log("  " + d));

  // Disputes / chargebacks on this intent (needs Payment Disputes: Read).
  try {
    const disputes = await api(`disputes?payment_intent=${pi}&limit=100`);
    const d = disputes.data || [];
    console.log(`\n=== Disputes / chargebacks: ${d.length} ===`);
    d.forEach((x) => {
      console.log(`  ${x.id}  status=${x.status}  reason=${x.reason}  amount=${(x.amount / 100).toFixed(2)} ${String(x.currency).toUpperCase()}  created=${iso(x.created)}`);
      if (x.evidence_details) console.log(`    due_by=${iso(x.evidence_details.due_by)}  submitted=${x.evidence_details.submission_count}`);
    });
  } catch (e) {
    console.log(`\n=== Disputes: skipped (${e.message}) ===`);
  }
})().catch((e) => { console.error("ERROR: " + e.message); process.exit(1); });
