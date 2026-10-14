import { describe, expect, it, vi } from "vitest";
import { priceReservation, toDateString, travellerCount } from "./reservation-pricing";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server-firestore", () => ({ db: {}, doc: vi.fn(), getDoc: vi.fn() }));
const { readDraftInput, draftDocFields, isEditableDraft } = await import("./public-reservations-server");

const ts = (iso: string) => ({ seconds: Date.parse(iso) / 1000, nanoseconds: 0, toDate: () => new Date(iso) });

const tour = {
  name: "Brazil Explorer",
  pricing: { deposit: 300, original: 2500 },
  travelDates: [
    { startDate: ts("2027-03-10T00:00:00Z"), isAvailable: true },
    { startDate: ts("2027-05-01T00:00:00Z"), hasCustomDeposit: true, customDeposit: 150, customOriginal: 1999 },
    { startDate: ts("2027-07-01T00:00:00Z"), isAvailable: false },
    { startDate: ts("2027-09-01T00:00:00Z"), hasCustomDeposit: false, customDeposit: 10 },
  ],
};

describe("priceReservation", () => {
  it("charges the package fee per traveller", () => {
    expect(priceReservation(tour, "2027-03-10", "Single Booking", 1)).toMatchObject({ ok: true, amount: 300 });
    expect(priceReservation(tour, "2027-03-10", "Duo Booking", 7)).toMatchObject({ ok: true, amount: 600, travellers: 2 });
    expect(priceReservation(tour, "2027-03-10", "Group Booking", 5)).toMatchObject({ ok: true, amount: 1500 });
  });

  it("uses a date's custom fee and price only when the date says so", () => {
    expect(priceReservation(tour, "2027-05-01", "Single Booking", 1)).toEqual({
      ok: true,
      amount: 150,
      perPersonFee: 150,
      travellers: 1,
      originalPrice: 1999,
      packageName: "Brazil Explorer",
    });
    expect(priceReservation(tour, "2027-09-01", "Single Booking", 1)).toMatchObject({ amount: 300 });
  });

  it("falls back to £250 when the package has no fee", () => {
    const noFee = { ...tour, pricing: {} };
    expect(priceReservation(noFee, "2027-03-10", "Single Booking", 1)).toMatchObject({ amount: 250 });
  });

  it("rejects unknown tours, unavailable or unknown dates, bad types and group sizes", () => {
    expect(priceReservation(undefined, "2027-03-10", "Single Booking", 1).ok).toBe(false);
    expect(priceReservation(tour, "2027-07-01", "Single Booking", 1).ok).toBe(false);
    expect(priceReservation(tour, "2027-12-25", "Single Booking", 1).ok).toBe(false);
    expect(priceReservation(tour, "2027-03-10", "VIP Booking", 1).ok).toBe(false);
    expect(priceReservation(tour, "2027-03-10", "Group Booking", 2).ok).toBe(false);
    expect(priceReservation(tour, "2027-03-10", "Group Booking", 21).ok).toBe(false);
    expect(priceReservation(tour, "2027-03-10", "Group Booking", 3.5).ok).toBe(false);
  });

  it("reads travel dates in every stored shape", () => {
    expect(toDateString({ seconds: Date.parse("2027-03-10T00:00:00Z") / 1000 })).toBe("2027-03-10");
    expect(toDateString("2027-03-10")).toBe("2027-03-10");
    expect(toDateString("not a date")).toBeNull();
    expect(travellerCount("Single Booking", 9)).toBe(1);
  });
});

describe("reservation drafts", () => {
  const body = {
    customer: { email: " ana@x.com ", firstName: "Ana", lastName: "Cruz", birthdate: "1990-01-01", nationality: "PH", whatsAppNumber: "+639171234567" },
    booking: {
      type: "Duo Booking",
      groupSize: 2,
      guestDetails: [
        { email: "b@x.com", firstName: "Ben", lastName: "Lim", birthdate: "1991-02-02", nationality: "PH", whatsAppNumber: "" },
        { email: "extra@x.com", firstName: "Extra" },
      ],
      id: "B-FORGED",
      documentId: "forged",
    },
    tour: { packageId: "brazil", packageName: "Forged name", date: "2027-05-01" },
    payment: { amount: 1, status: "reserve_paid", originalPrice: 1 },
  };

  it("keeps only what a customer may set", () => {
    const parsed = readDraftInput(body);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.input.customer.email).toBe("ana@x.com");
    expect(parsed.input.booking.guestDetails).toHaveLength(1);
    expect(parsed.input.tour).toEqual({ packageId: "brazil", date: "2027-05-01" });

    const price = priceReservation(tour, "2027-05-01", "Duo Booking", 2);
    if (!price.ok) throw new Error("price");
    const fields = draftDocFields(parsed.input, price);
    expect(fields.payment).toEqual({
      amount: 300,
      currency: "GBP",
      status: "reserve_pending",
      type: "reservationFee",
      originalPrice: 1999,
    });
    expect(fields.booking).toMatchObject({ id: "PENDING", documentId: "", groupSize: 2 });
    expect(fields.tour.packageName).toBe("Brazil Explorer");
  });

  it("rejects drafts without an email or a tour date", () => {
    expect(readDraftInput({ ...body, customer: { email: "nope" } }).ok).toBe(false);
    expect(readDraftInput({ ...body, tour: { packageId: "brazil", date: "soon" } }).ok).toBe(false);
    expect(readDraftInput(null).ok).toBe(false);
  });

  it("only lets unpaid drafts without a booking change", () => {
    expect(isEditableDraft({ payment: { status: "reserve_pending", type: "reservationFee" } })).toBe(true);
    expect(isEditableDraft({ payment: { status: "reserve_paid" } })).toBe(false);
    expect(isEditableDraft({ payment: { status: "terms_selected" } })).toBe(false);
    expect(isEditableDraft({ payment: { status: "reserve_pending" }, booking: { documentId: "bk1" } })).toBe(false);
    expect(isEditableDraft({ payment: { status: "pending", type: "installment" } })).toBe(false);
  });
});
