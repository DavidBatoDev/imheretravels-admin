import { auth } from "@/lib/firebase";
import type { Policy, PolicyFormData } from "@/types/policies";

const API_BASE = "/api/policies";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in to manage policies");
  }
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

// ============================================================================
// CREATE
// ============================================================================

export async function createPolicy(data: PolicyFormData): Promise<string> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Failed to create policy");
  }
  return result.id as string;
}

// ============================================================================
// READ
// ============================================================================

export async function getPolicyById(id: string): Promise<Policy | null> {
  const response = await fetch(`${API_BASE}/${id}`);
  if (response.status === 404) return null;
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to fetch policy");
  }
  return data.policy as Policy;
}

// ============================================================================
// UPDATE
// ============================================================================

export async function updatePolicy(
  id: string,
  updates: Partial<PolicyFormData>,
): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(updates),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Failed to update policy");
  }
}

// ============================================================================
// DELETE
// ============================================================================

export async function deletePolicy(id: string): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders },
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Failed to delete policy");
  }
}
