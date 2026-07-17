import { auth } from "@/lib/firebase";
import type { Incident, IncidentFormData } from "@/types/incidents";

const API_BASE = "/api/incidents";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in to manage incidents");
  }
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/**
 * Builds the multipart body shared by create + update. `file` is the optional
 * PDF; `removeAttachment` (update only) clears an existing PDF.
 */
function toFormData(
  data: IncidentFormData,
  file?: File | null,
  removeAttachment?: boolean,
): FormData {
  const form = new FormData();
  form.set("title", data.title ?? "");
  form.set("category", data.category ?? "other");
  form.set("severity", data.severity ?? "medium");
  form.set("status", data.status ?? "open");
  form.set("summary", data.summary ?? "");
  form.set("actionsNeeded", data.actionsNeeded ?? "");
  form.set("incidentCode", data.incidentCode ?? "");
  form.set("owner", data.owner ?? "");
  form.set("relatedRef", data.relatedRef ?? "");
  form.set("relatedBooking", JSON.stringify(data.relatedBooking ?? null));
  form.set("dateOccurred", data.dateOccurred ?? "");
  form.set("dateReported", data.dateReported ?? "");
  form.set("tags", JSON.stringify(data.tags ?? []));
  if (file) form.set("file", file);
  if (removeAttachment) form.set("removeAttachment", "true");
  return form;
}

// ============================================================================
// CREATE
// ============================================================================

export async function createIncident(
  data: IncidentFormData,
  file?: File | null,
): Promise<string> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: { ...authHeaders },
    body: toFormData(data, file),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Failed to create incident");
  }
  return result.id as string;
}

// ============================================================================
// READ
// ============================================================================

export async function getIncidentById(id: string): Promise<Incident | null> {
  const response = await fetch(`${API_BASE}/${id}`);
  if (response.status === 404) return null;
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to fetch incident");
  }
  return data.incident as Incident;
}

// ============================================================================
// UPDATE
// ============================================================================

export async function updateIncident(
  id: string,
  data: IncidentFormData,
  file?: File | null,
  removeAttachment?: boolean,
): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders },
    body: toFormData(data, file, removeAttachment),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Failed to update incident");
  }
}

// ============================================================================
// DELETE
// ============================================================================

export async function deleteIncident(id: string): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Failed to delete incident");
  }
}
