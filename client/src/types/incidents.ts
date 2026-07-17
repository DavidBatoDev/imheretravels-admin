import { Timestamp } from "firebase/firestore";

// ============================================================================
// INCIDENT TYPES
// ============================================================================
//
// Backs the `incidents` Firestore collection — a patch-notes-style archive of
// issues encountered across the app / website / team. Each entry is a summary
// (markdown) + metadata, with an OPTIONAL attached PDF report (full RCA). See
// the Incidents section in the admin app.

export type IncidentStatus = "open" | "monitoring" | "resolved" | "closed";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentCategory =
  | "app"
  | "website"
  | "team"
  | "payments"
  | "security"
  | "data"
  | "other";

/** An uploaded PDF report attached to an incident (optional). */
export interface IncidentAttachment {
  fileName: string; // stored (unique) name in Storage
  originalName: string; // the file's original name at upload
  fileDownloadURL: string; // Firebase Storage download URL
  storagePath: string; // path within the bucket (for delete/replace)
  contentType: string; // e.g. "application/pdf"
  size: number; // bytes
}

export interface IncidentMetadata {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // users.id
}

/** A booking linked to an incident (denormalized snapshot for display). */
export interface RelatedBooking {
  bookingDocId: string; // bookings collection doc id
  bookingId: string; // human booking id, e.g. "SB-IHF-20270319-FM012"
  fullName?: string;
  emailAddress?: string;
  tourPackageName?: string;
  tourDate?: string; // ISO date (yyyy-mm-dd)
}

export interface Incident {
  id: string;
  title: string;
  incidentCode?: string; // human reference, e.g. "SB-IHF-20270319-FM012"
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  summary: string; // HTML (authored via the WYSIWYG editor)
  actionsNeeded?: string; // HTML — what the team/dev needs to do
  owner?: string; // who owns follow-up
  relatedRef?: string; // related booking id (kept in sync with relatedBooking)
  relatedBooking?: RelatedBooking | null; // linked booking snapshot
  dateOccurred?: string; // ISO date (yyyy-mm-dd)
  dateReported?: string; // ISO date (yyyy-mm-dd)
  tags?: string[];
  attachment?: IncidentAttachment | null; // optional PDF report
  metadata: IncidentMetadata;
}

// ============================================================================
// FORM TYPES (what the form submits — server manages metadata + attachment)
// ============================================================================

export interface IncidentFormData {
  title: string;
  incidentCode?: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  summary: string;
  actionsNeeded?: string;
  owner?: string;
  relatedRef?: string;
  relatedBooking?: RelatedBooking | null;
  dateOccurred?: string;
  dateReported?: string;
  tags?: string[];
}

// ============================================================================
// FILTER + ENUM HELPERS
// ============================================================================

export interface IncidentFilters {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  category?: IncidentCategory;
  search?: string;
}

export const INCIDENT_STATUSES: IncidentStatus[] = [
  "open",
  "monitoring",
  "resolved",
  "closed",
];

export const INCIDENT_SEVERITIES: IncidentSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export const INCIDENT_CATEGORIES: IncidentCategory[] = [
  "app",
  "website",
  "team",
  "payments",
  "security",
  "data",
  "other",
];

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Open",
  monitoring: "Monitoring",
  resolved: "Resolved",
  closed: "Closed",
};

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const INCIDENT_CATEGORY_LABELS: Record<IncidentCategory, string> = {
  app: "App",
  website: "Website",
  team: "Team",
  payments: "Payments",
  security: "Security",
  data: "Data",
  other: "Other",
};
