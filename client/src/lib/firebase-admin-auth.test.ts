import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";

const verifyIdToken = vi.fn();
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => {
    // Real getAuth() throws when the default app is missing.
    if (!getApps().some((a) => a.name === "[DEFAULT]")) {
      throw new Error("The default Firebase app does not exist.");
    }
    return { verifyIdToken };
  },
}));

import { verifyRequestUserId } from "@/lib/firebase-admin-auth";

afterEach(async () => {
  await Promise.all(getApps().map((a) => deleteApp(a)));
  verifyIdToken.mockReset();
});

describe("verifyRequestUserId", () => {
  it("still verifies tokens after a named app (firebase-admin-db) was created first", async () => {
    initializeApp({ projectId: "demo-test" }, "server-db");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-test");
    verifyIdToken.mockResolvedValue({ uid: "staff-1" });

    expect(await verifyRequestUserId("Bearer token")).toBe("staff-1");
    expect(getApps().map((a) => a.name)).toContain("[DEFAULT]");
  });

  it("returns null without a Bearer token", async () => {
    expect(await verifyRequestUserId(null)).toBeNull();
    expect(await verifyRequestUserId("Basic abc")).toBeNull();
  });
});
