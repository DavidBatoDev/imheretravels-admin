import { describe, expect, it } from "vitest";

import {
  isValidEmail,
  normalizeBookingEmailFields,
  normalizeBookingFieldValue,
  normalizeEmail,
} from "./email-normalize";

describe("normalizeEmail", () => {
  it("trims the leading space that blocked Ciara Murphy's payment", () => {
    expect(normalizeEmail(" ciara.murphy.henze@gmail.com")).toBe(
      "ciara.murphy.henze@gmail.com",
    );
  });

  it("trims trailing whitespace, tabs, newlines and non-breaking spaces", () => {
    expect(normalizeEmail("a@b.com \t\n")).toBe("a@b.com");
    expect(normalizeEmail(" a@b.com ")).toBe("a@b.com");
  });

  it("removes zero-width characters anywhere in the address", () => {
    expect(normalizeEmail("​a@b.com")).toBe("a@b.com");
    expect(normalizeEmail("a@b‌.com﻿")).toBe("a@b.com");
  });

  it("leaves case and already-clean addresses untouched", () => {
    expect(normalizeEmail("Jane.Doe@Example.com")).toBe("Jane.Doe@Example.com");
  });

  it("returns non-strings unchanged", () => {
    expect(normalizeEmail(undefined)).toBeUndefined();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(42)).toBe(42);
  });
});

describe("isValidEmail", () => {
  it("accepts normal addresses", () => {
    expect(isValidEmail("ciara.murphy.henze@gmail.com")).toBe(true);
    expect(isValidEmail("first+tag@sub.example.co.uk")).toBe(true);
  });

  it("rejects padded, partial or non-string values", () => {
    expect(isValidEmail(" ciara.murphy.henze@gmail.com")).toBe(false);
    expect(isValidEmail("ciara.murphy.henze@gmail")).toBe(false);
    expect(isValidEmail("no-at-sign.com")).toBe(false);
    expect(isValidEmail("two words@gmail.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });
});

describe("normalizeBookingFieldValue", () => {
  it("normalises the email fields only", () => {
    expect(normalizeBookingFieldValue("emailAddress", " a@b.com ")).toBe(
      "a@b.com",
    );
    expect(normalizeBookingFieldValue("email", " a@b.com")).toBe("a@b.com");
    expect(normalizeBookingFieldValue("firstName", " Ciara ")).toBe(" Ciara ");
    expect(normalizeBookingFieldValue("reservationEmail", " x ")).toBe(" x ");
  });
});

describe("normalizeBookingEmailFields", () => {
  it("returns a trimmed copy without mutating the input", () => {
    const input = { emailAddress: " a@b.com", firstName: " Ciara" };
    const output = normalizeBookingEmailFields(input);
    expect(output).toEqual({ emailAddress: "a@b.com", firstName: " Ciara" });
    expect(input.emailAddress).toBe(" a@b.com");
  });

  it("handles both field names and returns the same object when clean", () => {
    expect(
      normalizeBookingEmailFields({ email: "a@b.com ", emailAddress: " c@d.com" }),
    ).toEqual({ email: "a@b.com", emailAddress: "c@d.com" });

    const clean = { emailAddress: "a@b.com", p1Amount: 524.5 };
    expect(normalizeBookingEmailFields(clean)).toBe(clean);
  });

  it("does not add email fields that were not in the payload", () => {
    expect(normalizeBookingEmailFields({ p1Amount: 1 })).toEqual({
      p1Amount: 1,
    });
  });
});
