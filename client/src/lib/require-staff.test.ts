import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const verifyRequestUserId = vi.fn();
vi.mock("@/lib/firebase-admin-auth", () => ({
  verifyRequestUserId: (h: string | null) => verifyRequestUserId(h),
}));

const userDoc = vi.fn();
vi.mock("@/lib/firebase-admin-db", () => ({
  adminDb: () => ({
    collection: () => ({ doc: () => ({ get: async () => ({ data: userDoc }) }) }),
  }),
}));

import { requireStaff } from "@/lib/require-staff";
import { requireAdmin } from "@/lib/require-admin";

beforeEach(() => {
  verifyRequestUserId.mockReset();
  userDoc.mockReset();
});

describe("requireStaff", () => {
  it("rejects a request with no valid token (401)", async () => {
    verifyRequestUserId.mockResolvedValue(null);
    expect(await requireStaff(null)).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
  });

  it("rejects a signed-in user with no staff record (403)", async () => {
    verifyRequestUserId.mockResolvedValue("uid-1");
    userDoc.mockReturnValue(undefined);
    expect(await requireStaff("Bearer t")).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects staff who are not approved (403)", async () => {
    verifyRequestUserId.mockResolvedValue("uid-1");
    userDoc.mockReturnValue({ role: "admin", isApproved: false });
    expect(await requireStaff("Bearer t")).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects an unknown role (403)", async () => {
    verifyRequestUserId.mockResolvedValue("uid-1");
    userDoc.mockReturnValue({ role: "customer", isApproved: true });
    expect(await requireStaff("Bearer t")).toMatchObject({ ok: false, status: 403 });
  });

  it("accepts approved admins and agents", async () => {
    verifyRequestUserId.mockResolvedValue("uid-1");
    userDoc.mockReturnValue({ role: "agent", isApproved: true });
    expect(await requireStaff("Bearer t")).toEqual({ ok: true, uid: "uid-1", role: "agent" });
  });
});

describe("requireAdmin", () => {
  it("passes a 401 through unchanged", async () => {
    verifyRequestUserId.mockResolvedValue(null);
    expect(await requireAdmin(null)).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects an approved agent (403)", async () => {
    verifyRequestUserId.mockResolvedValue("uid-1");
    userDoc.mockReturnValue({ role: "agent", isApproved: true });
    expect(await requireAdmin("Bearer t")).toEqual({
      ok: false,
      status: 403,
      error: "Admin access required",
    });
  });

  it("rejects an unapproved admin (403)", async () => {
    verifyRequestUserId.mockResolvedValue("uid-1");
    userDoc.mockReturnValue({ role: "admin", isApproved: false });
    expect(await requireAdmin("Bearer t")).toMatchObject({ ok: false, status: 403 });
  });

  it("accepts an approved admin", async () => {
    verifyRequestUserId.mockResolvedValue("uid-1");
    userDoc.mockReturnValue({ role: "admin", isApproved: true });
    expect(await requireAdmin("Bearer t")).toEqual({ ok: true, uid: "uid-1" });
  });
});
