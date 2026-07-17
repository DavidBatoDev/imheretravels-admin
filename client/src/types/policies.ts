import { Timestamp } from "firebase/firestore";

// ============================================================================
// POLICY TYPES
// ============================================================================
//
// Backs the `policies` Firestore collection — living, in-app reference content
// for the team (processes like KYC, do's & don'ts, data-handling rules, etc.).
// Authored as markdown directly in the admin app.

export type PolicyStatus = "draft" | "published" | "archived";
export type PolicyCategory =
  | "process"
  | "kyc"
  | "dos-and-donts"
  | "data-handling"
  | "security"
  | "support"
  | "other";

export interface PolicyMetadata {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // users.id
}

export interface Policy {
  id: string;
  title: string;
  category: PolicyCategory;
  status: PolicyStatus;
  summary?: string; // short one-liner for the list
  body: string; // HTML (authored via the WYSIWYG editor)
  version?: string;
  effectiveDate?: string; // ISO date (yyyy-mm-dd)
  owner?: string;
  tags?: string[];
  metadata: PolicyMetadata;
}

// ============================================================================
// FORM TYPES
// ============================================================================

export interface PolicyFormData {
  title: string;
  category: PolicyCategory;
  status: PolicyStatus;
  summary?: string;
  body: string;
  version?: string;
  effectiveDate?: string;
  owner?: string;
  tags?: string[];
}

// ============================================================================
// FILTER + ENUM HELPERS
// ============================================================================

export interface PolicyFilters {
  status?: PolicyStatus;
  category?: PolicyCategory;
  search?: string;
}

export const POLICY_STATUSES: PolicyStatus[] = [
  "draft",
  "published",
  "archived",
];

export const POLICY_CATEGORIES: PolicyCategory[] = [
  "process",
  "kyc",
  "dos-and-donts",
  "data-handling",
  "security",
  "support",
  "other",
];

export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const POLICY_CATEGORY_LABELS: Record<PolicyCategory, string> = {
  process: "Process",
  kyc: "KYC",
  "dos-and-donts": "Do's & Don'ts",
  "data-handling": "Data Handling",
  security: "Security",
  support: "Support",
  other: "Other",
};
