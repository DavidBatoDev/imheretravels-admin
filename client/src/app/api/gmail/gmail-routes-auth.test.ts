import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Every Gmail route must reject a caller who isn't approved staff BEFORE it
// touches Gmail. The Gmail clients are mocked to fail loudly if reached.
vi.mock("server-only", () => ({}));

const requireStaff = vi.fn();
vi.mock("@/lib/require-staff", () => ({
  requireStaff: (h: string | null) => requireStaff(h),
}));

const gmailReached = vi.fn();
vi.mock("@/lib/gmail/gmail-api-service", () => ({
  default: class {
    constructor() {
      gmailReached();
    }
  },
}));
vi.mock("googleapis", () => ({
  google: new Proxy({}, { get: () => { gmailReached(); throw new Error("Gmail reached"); } }),
}));

import * as attachments from "./attachments/[messageId]/[attachmentId]/route";
import * as draftsList from "./drafts/list/route";
import * as drafts from "./drafts/route";
import * as emails from "./emails/route";
import * as emailById from "./emails/[id]/route";
import * as forward from "./forward/route";
import * as labels from "./labels/route";
import * as reply from "./reply/route";
import * as send from "./send/route";
import * as star from "./star/route";
import * as threads from "./threads/route";
import * as threadById from "./threads/[threadId]/route";

const modules: Record<string, Record<string, unknown>> = {
  "attachments/[messageId]/[attachmentId]": attachments,
  "drafts/list": draftsList,
  drafts,
  emails,
  "emails/[id]": emailById,
  forward,
  labels,
  reply,
  send,
  star,
  threads,
  "threads/[threadId]": threadById,
};

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;
const handlers = Object.entries(modules).flatMap(([name, mod]) =>
  METHODS.filter((m) => typeof mod[m] === "function").map(
    (m) => [`${m} ${name}`, mod[m] as (...args: unknown[]) => Promise<Response>] as const,
  ),
);

const context = {
  params: Promise.resolve({ id: "x", messageId: "x", attachmentId: "x", threadId: "x" }),
};

beforeEach(() => {
  requireStaff.mockReset();
  gmailReached.mockReset();
});

describe("Gmail API routes require approved staff", () => {
  it("covers every handler (15)", () => {
    expect(handlers).toHaveLength(15);
  });

  it.each(handlers)("%s → 401 without a token, Gmail untouched", async (_name, handler) => {
    requireStaff.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const res = await handler(new NextRequest("http://localhost/api/gmail/x?draftId=1"), context);
    expect(res.status).toBe(401);
    expect(gmailReached).not.toHaveBeenCalled();
  });

  it.each(handlers)("%s → 403 for non-staff, Gmail untouched", async (_name, handler) => {
    requireStaff.mockResolvedValue({ ok: false, status: 403, error: "Approved staff access required" });
    const res = await handler(
      new NextRequest("http://localhost/api/gmail/x?draftId=1", {
        headers: { authorization: "Bearer not-staff" },
      }),
      context,
    );
    expect(res.status).toBe(403);
    expect(requireStaff).toHaveBeenCalledWith("Bearer not-staff");
    expect(gmailReached).not.toHaveBeenCalled();
  });
});
