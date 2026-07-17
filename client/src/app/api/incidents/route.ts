import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, Timestamp } from "firebase/firestore";
import { uploadFile, STORAGE_BUCKET } from "@/utils/file-upload";
import { requireAdmin } from "@/lib/require-admin";
import type { Incident, IncidentAttachment } from "@/types/incidents";

const COLLECTION = "incidents";
const PDF_TYPES = ["application/pdf"];
const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50MB

function str(raw: FormDataEntryValue | null): string | undefined {
  const s = raw == null ? "" : String(raw).trim();
  return s ? s : undefined;
}

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function parseJson(raw: FormDataEntryValue | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * Generate the next incident code, `INC-YYYY-NNN`, sequential within the year.
 * Scans existing codes for the current year and increments the highest. Low
 * write volume + an admin-only endpoint make a naive scan safe here (no
 * distributed counter needed).
 */
async function nextIncidentCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INC-${year}-`;
  const snap = await getDocs(collection(db, COLLECTION));
  let max = 0;
  snap.docs.forEach((d) => {
    const code = (d.data() as { incidentCode?: string }).incidentCode;
    if (code && code.startsWith(prefix)) {
      const n = parseInt(code.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  });
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/**
 * GET /api/incidents - list all incidents (read: any authenticated user via
 * the client SDK; this route is a convenience for server reads).
 */
export async function GET() {
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    const incidents = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Incident[];
    return NextResponse.json({
      success: true,
      incidents,
      count: incidents.length,
    });
  } catch (error) {
    console.error("Error getting incidents:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch incidents",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/incidents - create an incident (admin only). Accepts multipart
 * form data with an OPTIONAL `file` (PDF report).
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request.headers.get("authorization"));
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error },
      { status: gate.status },
    );
  }

  try {
    const form = await request.formData();

    const title = str(form.get("title"));
    if (!title) {
      return NextResponse.json(
        { success: false, error: "Title is required" },
        { status: 400 },
      );
    }

    // Optional PDF attachment
    let attachment: IncidentAttachment | null = null;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      const up = await uploadFile(file, {
        bucket: STORAGE_BUCKET,
        folder: "incidents",
        maxSize: MAX_PDF_SIZE,
        allowedTypes: PDF_TYPES,
        generateUniqueName: true,
      });
      if (!up.success || !up.data) {
        return NextResponse.json(
          { success: false, error: up.error || "Failed to upload PDF" },
          { status: 500 },
        );
      }
      attachment = {
        fileName: up.data.path.split("/").pop() || file.name,
        originalName: file.name,
        fileDownloadURL: up.data.publicUrl,
        storagePath: up.data.path,
        contentType: file.type,
        size: file.size,
      };
    }

    const now = Timestamp.now();
    // Incident code is system-generated (immutable) — any client value is ignored.
    const incidentCode = await nextIncidentCode();
    const payload: Record<string, any> = {
      title,
      category: str(form.get("category")) ?? "other",
      severity: str(form.get("severity")) ?? "medium",
      status: str(form.get("status")) ?? "open",
      summary: str(form.get("summary")) ?? "",
      actionsNeeded: str(form.get("actionsNeeded")),
      incidentCode,
      owner: str(form.get("owner")),
      relatedRef: str(form.get("relatedRef")),
      relatedBooking: parseJson(form.get("relatedBooking")),
      dateOccurred: str(form.get("dateOccurred")),
      dateReported: str(form.get("dateReported")),
      tags: parseTags(form.get("tags")),
      attachment,
      metadata: { createdAt: now, updatedAt: now, createdBy: gate.uid },
    };
    // Firestore rejects `undefined` — drop optional fields that weren't set.
    Object.keys(payload).forEach(
      (k) => payload[k] === undefined && delete payload[k],
    );

    const ref = await addDoc(collection(db, COLLECTION), payload);
    console.log(`✅ Created incident ${ref.id}`);
    return NextResponse.json({ success: true, id: ref.id });
  } catch (error) {
    console.error("Error creating incident:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create incident",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
