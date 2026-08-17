import { describe, expect, it } from "vitest";

import { formatTourDuration } from "./tour-duration";

describe("formatTourDuration", () => {
  it("adds the unit to numeric Firestore values", () => {
    expect(formatTourDuration(7)).toBe("7 days");
    expect(formatTourDuration(1)).toBe("1 day");
  });

  it("adds the unit to numeric strings", () => {
    expect(formatTourDuration("7")).toBe("7 days");
  });

  it("preserves existing display copy", () => {
    expect(formatTourDuration("11 days")).toBe("11 days");
  });

  it("returns an empty string for missing values", () => {
    expect(formatTourDuration(null)).toBe("");
    expect(formatTourDuration(undefined)).toBe("");
  });
});
