import { auth } from "@/lib/firebase";
import {
  Destination,
  DestinationFormData,
  DestinationStatus,
} from "@/types/destinations";

const API_BASE = "/api/destinations";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be signed in to manage destinations");
  }

  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

// ============================================================================
// CREATE
// ============================================================================

export async function createDestination(
  data: DestinationFormData,
): Promise<string> {
  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to create destination");
    }

    console.log(`✅ Created destination with ID: ${result.destinationId}`);
    return result.destinationId;
  } catch (error) {
    console.error("Error creating destination:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to create destination",
    );
  }
}

// ============================================================================
// READ
// ============================================================================

export async function getAllDestinations(): Promise<Destination[]> {
  try {
    const response = await fetch(`${API_BASE}?limit=1000`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch destinations");
    }

    return data.destinations;
  } catch (error) {
    console.error("Error getting destinations:", error);
    throw new Error("Failed to fetch destinations");
  }
}

export async function getDestinationById(
  id: string,
): Promise<Destination | null> {
  try {
    const response = await fetch(`${API_BASE}/${id}`);

    if (response.status === 404) {
      return null;
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch destination");
    }

    return data.destination;
  } catch (error) {
    console.error("Error getting destination:", error);
    throw new Error("Failed to fetch destination");
  }
}

// ============================================================================
// UPDATE
// ============================================================================

export async function updateDestination(
  id: string,
  updates: Partial<DestinationFormData>,
): Promise<void> {
  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to update destination");
    }

    console.log(`✅ Updated destination ${id}`);
  } catch (error) {
    console.error("Error updating destination:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to update destination",
    );
  }
}

export async function updateDestinationStatus(
  id: string,
  status: DestinationStatus,
): Promise<void> {
  await updateDestination(id, { status });
}

// Soft delete — mark as archived instead of deleting.
export async function archiveDestination(id: string): Promise<void> {
  await updateDestination(id, { status: "archived" });
}

// ============================================================================
// DELETE
// ============================================================================

export async function deleteDestination(id: string): Promise<void> {
  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to delete destination");
    }

    console.log(`✅ Deleted destination ${id}`);
  } catch (error) {
    console.error("Error deleting destination:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to delete destination",
    );
  }
}
