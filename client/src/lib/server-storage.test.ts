import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase", () => ({ storage: {} }));

// Fake firebase-admin bucket that records what the helper asks for.
const saved: { path: string; bytes: number; options: any }[] = [];
const deleted: string[] = [];
let failDelete = false;
vi.mock("@/lib/firebase-admin-db", () => ({
  adminBucket: () => ({
    name: "demo.firebasestorage.app",
    file: (path: string) => ({
      save: async (buf: Buffer, options: unknown) => {
        saved.push({ path, bytes: buf.length, options });
      },
      delete: async () => {
        if (failDelete) throw new Error("No such object");
        deleted.push(path);
      },
    }),
  }),
}));

const { uploadFile, deleteFile, downloadUrl, STORAGE_BUCKET } = await import("./server-storage");

const pdf = (name: string, size = 4) =>
  new File([new Uint8Array(size)], name, { type: "application/pdf" });

beforeEach(() => {
  saved.length = 0;
  deleted.length = 0;
  failDelete = false;
});

describe("server-storage", () => {
  it("uploads under the folder and returns a token download URL", async () => {
    const res = await uploadFile(pdf("Pack 1.pdf"), { bucket: STORAGE_BUCKET, folder: "pre-departure-packs" });

    expect(res.success).toBe(true);
    expect(res.data?.path).toBe("pre-departure-packs/Pack 1.pdf");
    expect(saved).toHaveLength(1);
    expect(saved[0].bytes).toBe(4);
    expect(saved[0].options.metadata.contentType).toBe("application/pdf");

    const token = saved[0].options.metadata.metadata.firebaseStorageDownloadTokens;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.data?.publicUrl).toBe(
      `https://firebasestorage.googleapis.com/v0/b/demo.firebasestorage.app/o/pre-departure-packs%2FPack%201.pdf?alt=media&token=${token}`,
    );
  });

  it("generates a unique name when asked", async () => {
    const res = await uploadFile(pdf("a.pdf"), { bucket: STORAGE_BUCKET, folder: "incidents", generateUniqueName: true });
    expect(res.data?.path).toMatch(/^incidents\/a_\d+_[a-z0-9]+\.pdf$/);
  });

  it("rejects files that fail validation without touching the bucket", async () => {
    const tooBig = await uploadFile(pdf("big.pdf", 11), { bucket: STORAGE_BUCKET, maxSize: 10 });
    const wrongType = await uploadFile(pdf("x.pdf"), { bucket: STORAGE_BUCKET, allowedTypes: ["image/png"] });
    expect(tooBig.success).toBe(false);
    expect(wrongType.success).toBe(false);
    expect(saved).toHaveLength(0);
  });

  it("deletes by path and reports failures instead of throwing", async () => {
    expect(await deleteFile("incidents/a.pdf", STORAGE_BUCKET)).toEqual({ success: true });
    expect(deleted).toEqual(["incidents/a.pdf"]);

    failDelete = true;
    expect(await deleteFile("incidents/gone.pdf")).toEqual({ success: false, error: "No such object" });
  });

  it("encodes nested paths in download URLs", () => {
    expect(downloadUrl("b", "images/a b/c.png", "t")).toBe(
      "https://firebasestorage.googleapis.com/v0/b/b/o/images%2Fa%20b%2Fc.png?alt=media&token=t",
    );
  });
});
