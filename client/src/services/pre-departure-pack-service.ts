import {
  PreDeparturePack,
  TourPackageAssignment,
  PreDeparturePackFormData,
  PreDepartureConfig,
} from "@/types/pre-departure-pack";
import { staffFetch } from "@/lib/staff-fetch";

const API_BASE = "/api/pre-departure-packs";

// ============================================================================
// PRE-DEPARTURE PACK CRUD OPERATIONS (HTTP API CLIENT)
// ============================================================================

/**
 * Get all pre-departure packs
 */
export async function getAllPreDeparturePacks(): Promise<PreDeparturePack[]> {
  try {
    const response = await fetch(API_BASE);
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to fetch pre-departure packs");
    }

    return result.packs;
  } catch (error) {
    console.error("Error fetching pre-departure packs:", error);
    throw new Error("Failed to fetch pre-departure packs");
  }
}

/**
 * Get a single pre-departure pack by ID
 */
export async function getPreDeparturePackById(
  id: string
): Promise<PreDeparturePack | null> {
  try {
    const response = await fetch(`${API_BASE}/${id}`);

    if (response.status === 404) {
      return null;
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to fetch pre-departure pack");
    }

    return result.pack;
  } catch (error) {
    console.error("Error fetching pre-departure pack:", error);
    throw new Error("Failed to fetch pre-departure pack");
  }
}

/**
 * Find pre-departure pack by tour package name
 */
export async function findPackByTourPackageName(
  tourPackageName: string
): Promise<PreDeparturePack | null> {
  try {
    const response = await fetch(
      `${API_BASE}/by-tour/${encodeURIComponent(tourPackageName)}`
    );

    if (response.status === 404) {
      return null;
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to find pre-departure pack");
    }

    return result.pack;
  } catch (error) {
    console.error("Error finding pack by tour package:", error);
    throw new Error("Failed to find pre-departure pack");
  }
}

/**
 * Check if tour packages are already assigned to another pack
 * Returns array of tour package names that are already assigned
 */
export async function checkTourPackageAvailability(
  tourPackages: TourPackageAssignment[],
  excludePackId?: string
): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE}/check-availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourPackages, excludePackId }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.error || "Failed to check tour package availability"
      );
    }

    return result.assignedPackages;
  } catch (error) {
    console.error("Error checking tour package availability:", error);
    throw new Error("Failed to check tour package availability");
  }
}

/**
 * Create a new pre-departure pack
 */
export async function createPreDeparturePack(
  formData: PreDeparturePackFormData
): Promise<string> {
  try {
    // Check if tour packages are already assigned
    const assignedPackages = await checkTourPackageAvailability(
      formData.tourPackages
    );

    if (assignedPackages.length > 0) {
      throw new Error(
        `Tour packages already assigned: ${assignedPackages.join(", ")}`
      );
    }

    // Create FormData for file upload
    const uploadFormData = new FormData();
    uploadFormData.append("file", formData.file);
    uploadFormData.append("tourPackages", JSON.stringify(formData.tourPackages));
    if (formData.metadata) {
      uploadFormData.append("metadata", JSON.stringify(formData.metadata));
    }

    const response = await staffFetch(API_BASE, {
      method: "POST",
      body: uploadFormData,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to create pre-departure pack");
    }

    console.log("Pre-departure pack created:", result.id);
    return result.id;
  } catch (error) {
    console.error("Error creating pre-departure pack:", error);
    throw error;
  }
}

/**
 * Update tour package assignments for a pack
 */
export async function updatePackTourPackages(
  packId: string,
  tourPackages: TourPackageAssignment[]
): Promise<void> {
  try {
    // Check if tour packages are already assigned to other packs
    const assignedPackages = await checkTourPackageAvailability(
      tourPackages,
      packId
    );

    if (assignedPackages.length > 0) {
      throw new Error(
        `Tour packages already assigned: ${assignedPackages.join(", ")}`
      );
    }

    const response = await staffFetch(`${API_BASE}/${packId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tourPackages }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to update pack tour packages");
    }

    console.log("Tour packages updated for pack:", packId);
  } catch (error) {
    console.error("Error updating pack tour packages:", error);
    throw error;
  }
}

/**
 * Replace the file for a pre-departure pack
 */
export async function replacePackFile(
  packId: string,
  newFile: File
): Promise<void> {
  try {
    // Create FormData for file upload
    const formData = new FormData();
    formData.append("file", newFile);

    const response = await staffFetch(`${API_BASE}/${packId}/replace-file`, {
      method: "PATCH",
      body: formData,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to replace pack file");
    }

    console.log("File replaced for pack:", packId);
  } catch (error) {
    console.error("Error replacing pack file:", error);
    throw error;
  }
}

/**
 * Delete a pre-departure pack
 */
export async function deletePreDeparturePack(packId: string): Promise<void> {
  try {
    const response = await staffFetch(`${API_BASE}/${packId}`, {
      method: "DELETE",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to delete pre-departure pack");
    }

    console.log("Pre-departure pack deleted:", packId);
  } catch (error) {
    console.error("Error deleting pre-departure pack:", error);
    throw error;
  }
}

// ============================================================================
// CONFIGURATION OPERATIONS (HTTP API CLIENT)
// ============================================================================

/**
 * Get pre-departure configuration
 */
export async function getPreDepartureConfig(): Promise<PreDepartureConfig> {
  try {
    const response = await fetch(`${API_BASE}/config`);
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to fetch configuration");
    }

    return result.config;
  } catch (error) {
    console.error("Error fetching pre-departure config:", error);
    throw new Error("Failed to fetch configuration");
  }
}

/**
 * Update pre-departure configuration
 */
export async function updatePreDepartureConfig(
  automaticSends: boolean
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ automaticSends }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to update configuration");
    }

    console.log("Pre-departure config updated");
  } catch (error) {
    console.error("Error updating pre-departure config:", error);
    throw error;
  }
}
